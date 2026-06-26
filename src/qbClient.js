// QuickBooks Online REST client with automatic OAuth2 token refresh.
// Talks directly to the Intuit Accounting API so every entity is handled uniformly.

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
  if (!API_BASE[env.environment]) {
    throw new Error(`QB_ENVIRONMENT must be 'sandbox' or 'production'.`);
  }
}

// ---- token persistence ----------------------------------------------------

function loadTokens() {
  if (!fs.existsSync(env.tokensPath)) {
    throw new Error(
      `No tokens found at ${env.tokensPath}. Run \`npm run auth\` once to authorize.`
    );
  }
  return JSON.parse(fs.readFileSync(env.tokensPath, "utf8"));
}

export function saveTokens(tokens) {
  fs.writeFileSync(env.tokensPath, JSON.stringify(tokens, null, 2));
}

function basicAuthHeader() {
  const creds = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString(
    "base64"
  );
  return `Basic ${creds}`;
}

// Exchange a refresh token for a fresh access token (and possibly rotated refresh token).
async function refreshTokens(tokens) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
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
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const updated = {
    ...tokens,
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s early
  };
  saveTokens(updated);
  return updated;
}

let cache = null;

async function getValidTokens() {
  assertConfig();
  if (!cache) cache = loadTokens();
  if (!cache.expires_at || Date.now() >= cache.expires_at) {
    cache = await refreshTokens(cache);
  }
  return cache;
}

// ---- low-level request ----------------------------------------------------

async function qbFetch(method, urlPath, { query, body } = {}) {
  const tokens = await getValidTokens();
  const base = API_BASE[env.environment];
  const params = new URLSearchParams({ minorversion: env.minorVersion });
  if (query) for (const [k, v] of Object.entries(query)) params.set(k, v);

  const url = `${base}/v3/company/${tokens.realmId}/${urlPath}?${params}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
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

export async function createEntity(entity, path, data) {
  const json = await qbFetch("POST", path, { body: data });
  return json[entity] ?? json;
}

export async function getEntity(entity, path, id) {
  const json = await qbFetch("GET", `${path}/${encodeURIComponent(id)}`);
  return json[entity] ?? json;
}

export async function updateEntity(entity, path, data) {
  // QBO full update needs Id + SyncToken. Auto-fetch SyncToken if the caller omitted it.
  if (data?.Id && data.SyncToken == null) {
    const current = await getEntity(entity, path, data.Id);
    data = { ...data, SyncToken: current.SyncToken };
  }
  const json = await qbFetch("POST", path, { body: data });
  return json[entity] ?? json;
}

export async function deleteEntity(entity, path, id, syncToken) {
  if (syncToken == null) {
    const current = await getEntity(entity, path, id);
    syncToken = current.SyncToken;
  }
  const json = await qbFetch("POST", path, {
    query: { operation: "delete" },
    body: { Id: String(id), SyncToken: String(syncToken) },
  });
  return json[entity] ?? json;
}

export async function queryEntity(entity, { where, orderBy, limit, offset, rawQuery } = {}) {
  let q = rawQuery;
  if (!q) {
    q = `SELECT * FROM ${entity}`;
    if (where) q += ` WHERE ${where}`;
    if (orderBy) q += ` ORDER BY ${orderBy}`;
    if (offset) q += ` STARTPOSITION ${offset}`;
    if (limit) q += ` MAXRESULTS ${limit}`;
  }
  const json = await qbFetch("GET", "query", { query: { query: q } });
  const qr = json.QueryResponse || {};
  return { items: qr[entity] || [], totalCount: qr.totalCount, query: q };
}

export async function getCompanyInfo() {
  const tokens = await getValidTokens();
  return getEntity("CompanyInfo", "companyinfo", tokens.realmId);
}

export async function getReport(name, params = {}) {
  const json = await qbFetch("GET", `reports/${name}`, { query: params });
  return json;
}

export const config = env;
