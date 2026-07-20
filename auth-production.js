// One-time OAuth2 authorization for QuickBooks Online — sandbox OR production.
// Run from the quickbooks-mcp-server folder:  node auth-production.js
//
// Two modes, picked automatically from QB_REDIRECT_URI:
//  - localhost redirect  -> starts a local server, browser round-trips automatically
//    (same as the original auth.js; use with Development keys / sandbox).
//  - anything else (production HTTPS redirect) -> prints the Intuit URL; after you
//    approve, copy the full URL from the browser's address bar and paste it back
//    into this terminal. The page you land on may 404 — that's fine, the code is
//    in the URL.
//
// MULTI-COMPANY: this is additive. Authorizing a new company ADDS it to
// tokens.json alongside any companies already authorized (and makes the new one
// active). Re-authorizing an existing company just refreshes its tokens. So you
// can run this once per client and switch between them later with the
// set_active_company tool — no need to re-run or restart to change companies.

import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { saveTokens } from "./src/qbClient.js";

// Always load the .env sitting NEXT TO THIS FILE, regardless of where the
// command was run from. (A bare dotenv.config() reads from the current working
// directory, which can silently pick up the wrong/old .env.)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env");
dotenv.config({ path: ENV_PATH, override: true });

const CLIENT_ID = process.env.QB_CLIENT_ID;
const CLIENT_SECRET = process.env.QB_CLIENT_SECRET;
const ENVIRONMENT = (process.env.QB_ENVIRONMENT || "sandbox").toLowerCase();
const REDIRECT_URI = process.env.QB_REDIRECT_URI || "http://localhost:3000/callback";
const SCOPE = "com.intuit.quickbooks.accounting";

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API_BASE = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`Set QB_CLIENT_ID and QB_CLIENT_SECRET in ${ENV_PATH} first (see .env.example).`);
  process.exit(1);
}

// ---- show exactly what config is in effect, so mismatches are obvious ------
console.log("\n--- QuickBooks auth: effective configuration ---");
console.log(`  .env file:     ${ENV_PATH}`);
console.log(`  Environment:   ${ENVIRONMENT}`);
console.log(`  Client ID:     ${CLIENT_ID.slice(0, 10)}...  <- must be the ${ENVIRONMENT === "production" ? "PRODUCTION" : "Development"} Client ID from Intuit Keys & credentials`);
console.log(`  Redirect URI:  ${REDIRECT_URI}`);
console.log("------------------------------------------------\n");

const redirectIsLocal = ["localhost", "127.0.0.1"].includes(new URL(REDIRECT_URI).hostname);

if (ENVIRONMENT === "production" && redirectIsLocal) {
  console.warn(
    "⚠ QB_ENVIRONMENT=production but the redirect URI is localhost.\n" +
    "  Intuit only allows plain http://localhost redirects on DEVELOPMENT keys.\n" +
    "  For production, register an HTTPS redirect URI under the Production section\n" +
    "  of Keys & credentials and put that same URL in QB_REDIRECT_URI.\n"
  );
}

const state = crypto.randomBytes(16).toString("hex");

function buildAuthUrl() {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCode(code) {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!tokenRes.ok) throw new Error(`Token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  return tokenRes.json();
}

// Best-effort fetch of the company's display name so the store can label it.
// Never fatal — if it fails we just store without a name.
async function fetchCompanyName(realmId, accessToken) {
  try {
    const base = API_BASE[ENVIRONMENT] || API_BASE.sandbox;
    const url = `${base}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=75`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.CompanyInfo?.CompanyName || null;
  } catch {
    return null;
  }
}

async function persist(realmId, data) {
  const companyName = await fetchCompanyName(realmId, data.access_token);
  saveTokens({
    realmId: String(realmId),
    companyName,
    environment: ENVIRONMENT,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
  const label = companyName ? `"${companyName}" ` : "";
  console.log(`\n✅ Authorized company ${label}realmId=${realmId} (${ENVIRONMENT}).`);
  console.log("   Added to tokens.json and set as the active company.");
  console.log("   Other previously authorized companies are unchanged.");
}

// ---- Mode A: localhost redirect — automatic browser round-trip -------------
function runLocalFlow() {
  const port = Number(new URL(REDIRECT_URI).port || 3000);
  const app = express();

  app.get("/", (_req, res) => res.redirect(buildAuthUrl()));

  app.get("/callback", async (req, res) => {
    try {
      if (req.query.state !== state) throw new Error("State mismatch — restart the flow.");
      const { code, realmId } = req.query;
      if (!code || !realmId) throw new Error("Missing code or realmId in callback.");
      const data = await exchangeCode(code);
      await persist(realmId, data);
      res.send("<h2>QuickBooks connected ✅</h2><p>tokens.json updated. You can close this tab and stop the script (Ctrl+C).</p>");
    } catch (err) {
      console.error("Auth error:", err.message);
      res.status(500).send(`<h2>Auth failed</h2><pre>${err.message}</pre>`);
    }
  });

  app.listen(port, () => {
    console.log(`Open this URL in your browser to authorize:\n\n  http://localhost:${port}/\n`);
  });
}

// ---- Mode B: production/remote redirect — paste the callback URL back ------
async function runPasteFlow() {
  console.log("Open this URL in your browser and approve access:\n");
  console.log(`  ${buildAuthUrl()}\n`);
  console.log("IMPORTANT: pick the REAL company on the consent screen. Production keys");
  console.log("only list real companies — if you see sandbox companies, the Client ID in");
  console.log(".env is still the Development one.\n");
  console.log("After approving, the browser lands on your redirect URL (the page itself");
  console.log("may 404 — that's fine). Copy the FULL address from the address bar and");
  console.log("paste it below. Do this promptly; the code expires after a few minutes.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question("Paste the full callback URL here: ", resolve));
  rl.close();

  const cb = new URL(answer.trim());
  const code = cb.searchParams.get("code");
  const realmId = cb.searchParams.get("realmId");
  const gotState = cb.searchParams.get("state");
  if (gotState !== state) throw new Error("State mismatch — restart the flow and use the freshly printed URL.");
  if (!code || !realmId) throw new Error("URL is missing code or realmId — make sure you copied the complete address.");

  const data = await exchangeCode(code);
  await persist(realmId, data);
  process.exit(0);
}

if (redirectIsLocal) {
  runLocalFlow();
} else {
  runPasteFlow().catch((err) => {
    console.error("Auth error:", err.message);
    process.exit(1);
  });
}
