// QuickBooks Online REST client with automatic OAuth2 token refresh.
// Talks directly to the Intuit Accounting API so every entity is handled uniformly.
//
// MULTI-COMPANY: tokens.json holds every authorized company keyed by realmId,
// plus which one is "active". You can switch the active company at runtime with
// the set_active_company tool (no server restart), or target any company for a
// single call via the optional `company` parameter on any tool. Each company
// remembers its own environment (sandbox/production), so sandbox and production
// companies can coexist in the same store.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// Load .env from the project root regardless of the process working directory.
// (Claude Desktop launches the server with a different cwd, so a bare
// dotenv.config() would miss the file.)
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

const API_BASE = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

const env = {
  clientId: process.env.QB_CLIENT_ID,
  clientSecret: process.env.QB_CLIENT_SECRET,
  // Default environment for newly authorized companies / legacy stores that
  // don't record a per-company environment.
  environment: (process.env.QB_ENVIRONMENT || "sandbox").toLowerCase(),
  minorVersion: process.env.QB_MINOR_VERSION || "75",
  tokensPath: (() => {
    const p = process.env.QB_TOKENS_PATH || "./tokens.json";
    return path.isAbsolute(p) ? p : path.resolve(PROJECT_ROOT, p);
  })(),
};

function assertConfig() {
  if (!env.clientId || !env.clientSecret) {
    throw new Error(
      "QB_CLIENT_ID and QB_CLIENT_SECRET must be set (see .env.example)."
    );
  }
}

function assertEnvironment(environment) {
  if (!API_BASE[environment]) {
    throw new Error(
      `Unknown environment '${environment}' — must be 'sandbox' or 'production'.`
    );
  }
}

// ---- multi-company token store --------------------------------------------
//
// On-disk shape (version 2):
// {
//   "version": 2,
//   "activeRealmId": "9341457318989897",
//   "companies": {
//     "9341457318989897": {
//       "realmId": "9341457318989897",
//       "companyName": "Acme Inc",
//       "environment": "production",
//       "access_token": "...",
//       "refresh_token": "...",
//       "expires_at": 1784051255241
//     }
//   }
// }
//
// A legacy single-company file { realmId, access_token, refresh_token, expires_at }
// is migrated to the above on first load.

function emptyStore() {
  return { version: 2, activeRealmId: null, companies: {} };
}

// Normalize whatever is on disk (legacy or v2) into a v2 store object.
function normalizeStore(raw) {
  if (!raw || typeof raw !== "object") return emptyStore();

  // Legacy single-company format: has a top-level realmId + access_token.
  if (raw.access_token && raw.realmId && !raw.companies) {
    const realmId = String(raw.realmId);
    return {
      version: 2,
      activeRealmId: realmId,
      companies: {
        [realmId]: {
          realmId,
          companyName: raw.companyName || null,
          environment: raw.environment || env.environment,
          access_token: raw.access_token,
          refresh_token: raw.refresh_token,
          expires_at: raw.expires_at,
        },
      },
    };
  }

  // Already v2 (or close enough).
  const store = emptyStore();
  store.companies = raw.companies && typeof raw.companies === "object" ? raw.companies : {};
  const realmIds = Object.keys(store.companies);
  store.activeRealmId =
    raw.activeRealmId && store.companies[raw.activeRealmId]
      ? raw.activeRealmId
      : realmIds[0] || null;
  return store;
}

function readStore() {
  if (!fs.existsSync(env.tokensPath)) return emptyStore();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(env.tokensPath, "utf8"));
  } catch {
    return emptyStore();
  }
  return normalizeStore(raw);
}

function writeStore(store) {
  fs.writeFileSync(env.tokensPath, JSON.stringify(store, null, 2));
}

// In-memory cache of the store; individual company records are refreshed in place.
let store = null;
function getStore() {
  if (!store) store = readStore();
  return store;
}

// ---- public: company management -------------------------------------------

// Add or update a company's tokens. Called by the auth scripts after a
// successful authorization. Additive — never drops other companies. The freshly
// authorized company becomes the active one.
export function saveTokens(tokens) {
  const realmId = String(tokens.realmId);
  const s = getStore();
  const existing = s.companies[realmId] || {};
  s.companies[realmId] = {
    realmId,
    companyName: tokens.companyName ?? existing.companyName ?? null,
    environment: tokens.environment ?? existing.environment ?? env.environment,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
  };
  s.activeRealmId = realmId;
  writeStore(s);
  return s.companies[realmId];
}

// List every authorized company (without exposing token material).
export function listCompanies() {
  const s = getStore();
  return Object.values(s.companies).map((c) => ({
    realmId: c.realmId,
    companyName: c.companyName || null,
    environment: c.environment || env.environment,
    active: c.realmId === s.activeRealmId,
    accessTokenExpiresAt: c.expires_at || null,
  }));
}

export function getActiveRealmId() {
  return getStore().activeRealmId;
}

// Resolve a user-supplied company identifier (realmId or company-name substring)
// to a realmId. Returns undefined when identifier is empty (meaning "use active").
export function resolveRealmId(identifier) {
  if (identifier == null || identifier === "") return undefined;
  const s = getStore();
  const needle = String(identifier).trim();

  // Exact realmId match.
  if (s.companies[needle]) return needle;

  // Case-insensitive company-name match (exact, then substring).
  const lower = needle.toLowerCase();
  const byName = Object.values(s.companies).filter(
    (c) => (c.companyName || "").toLowerCase() === lower
  );
  const matches = byName.length
    ? byName
    : Object.values(s.companies).filter((c) =>
        (c.companyName || "").toLowerCase().includes(lower)
      );

  if (matches.length === 1) return matches[0].realmId;
  if (matches.length === 0) {
    throw new Error(
      `No authorized company matches "${needle}". Use list_companies to see options.`
    );
  }
  throw new Error(
    `"${needle}" matches multiple companies (${matches
      .map((c) => `${c.companyName} [${c.realmId}]`)
      .join(", ")}). Use the realmId to disambiguate.`
  );
}

// Switch the active company. Accepts a realmId or a company-name substring.
export function setActiveCompany(identifier) {
  const s = getStore();
  const realmId = resolveRealmId(identifier);
  if (!realmId) throw new Error("Provide a realmId or company name to activate.");
  s.activeRealmId = realmId;
  writeStore(s);
  const c = s.companies[realmId];
  return {
    realmId: c.realmId,
    companyName: c.companyName || null,
    environment: c.environment || env.environment,
    active: true,
  };
}

// ---- token refresh --------------------------------------------------------

function basicAuthHeader() {
  const creds = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString(
    "base64"
  );
  return `Basic ${creds}`;
}

// Exchange a refresh token for a fresh access token (and possibly rotated refresh token).
async function refreshCompany(company) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: company.refresh_token,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Token refresh failed for realmId=${company.realmId} (${res.status}): ${text}. Re-run \`node auth-production.js\` to re-authorize this company.`
    );
  }

  const data = await res.json();
  const s = getStore();
  const updated = {
    ...company,
    access_token: data.access_token,
    refresh_token: data.refresh_token || company.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s early
  };
  s.companies[company.realmId] = updated;
  writeStore(s);
  return updated;
}

// Return a company record with a valid (unexpired) access token.
// realmId defaults to the active company.
async function getValidCompany(realmId) {
  assertConfig();
  const s = getStore();

  const targetRealmId = realmId || s.activeRealmId;
  if (!targetRealmId) {
    throw new Error(
      `No authorized companies found in ${env.tokensPath}. Run \`node auth-production.js\` (or \`npm run auth\`) to authorize a company first.`
    );
  }

  let company = s.companies[targetRealmId];
  if (!company) {
    throw new Error(
      `No tokens for realmId=${targetRealmId}. Authorize it, or use list_companies to see authorized companies.`
    );
  }

  assertEnvironment(company.environment || env.environment);

  if (!company.expires_at || Date.now() >= company.expires_at) {
    company = await refreshCompany(company);
  }
  return company;
}

// ---- low-level request ----------------------------------------------------

async function qbFetch(method, urlPath, { query, body, realmId } = {}) {
  const company = await getValidCompany(realmId);
  const base = API_BASE[company.environment || env.environment];
  const params = new URLSearchParams({ minorversion: env.minorVersion });
  if (query) for (const [k, v] of Object.entries(query)) params.set(k, v);

  const url = `${base}/v3/company/${company.realmId}/${urlPath}?${params}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${company.access_token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const fault = json?.Fault?.Error?.[0];
    const msg = fault
      ? `${fault.Message}${fault.Detail ? " — " + fault.Detail : ""}`
      : text || res.statusText;
    throw new Error(`QuickBooks API error (${res.status}): ${msg}`);
  }
  return json;
}

// ---- generic entity operations -------------------------------------------
// Every operation accepts an optional trailing realmId to target a specific
// company; omit it to use the active company.

export async function createEntity(entity, path, data, realmId) {
  const json = await qbFetch("POST", path, { body: data, realmId });
  return json[entity] ?? json;
}

export async function getEntity(entity, path, id, realmId) {
  const json = await qbFetch("GET", `${path}/${encodeURIComponent(id)}`, { realmId });
  return json[entity] ?? json;
}

export async function updateEntity(entity, path, data, realmId) {
  // QBO full update needs Id + SyncToken. Auto-fetch SyncToken if the caller omitted it.
  if (data?.Id && data.SyncToken == null) {
    const current = await getEntity(entity, path, data.Id, realmId);
    data = { ...data, SyncToken: current.SyncToken };
  }
  const json = await qbFetch("POST", path, { body: data, realmId });
  return json[entity] ?? json;
}

export async function deleteEntity(entity, path, id, syncToken, realmId) {
  if (syncToken == null) {
    const current = await getEntity(entity, path, id, realmId);
    syncToken = current.SyncToken;
  }
  const json = await qbFetch("POST", path, {
    query: { operation: "delete" },
    body: { Id: String(id), SyncToken: String(syncToken) },
    realmId,
  });
  return json[entity] ?? json;
}

export async function queryEntity(entity, { where, orderBy, limit, offset, rawQuery, realmId } = {}) {
  let q = rawQuery;
  if (!q) {
    q = `SELECT * FROM ${entity}`;
    if (where) q += ` WHERE ${where}`;
    if (orderBy) q += ` ORDER BY ${orderBy}`;
    if (offset) q += ` STARTPOSITION ${offset}`;
    if (limit) q += ` MAXRESULTS ${limit}`;
  }
  const json = await qbFetch("GET", "query", { query: { query: q }, realmId });
  const qr = json.QueryResponse || {};
  return { items: qr[entity] || [], totalCount: qr.totalCount, query: q };
}

export async function getCompanyInfo(realmId) {
  const company = await getValidCompany(realmId);
  return getEntity("CompanyInfo", "companyinfo", company.realmId, company.realmId);
}

export async function getReport(name, params = {}, realmId) {
  const json = await qbFetch("GET", `reports/${name}`, { query: params, realmId });
  return json;
}

export const config = env;
