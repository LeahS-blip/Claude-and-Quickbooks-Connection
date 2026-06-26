// One-time OAuth2 authorization for QuickBooks Online.
// Run `npm run auth`, open the printed URL, approve, and tokens.json is written.

import express from "express";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { saveTokens } from "./src/qbClient.js";

dotenv.config();

const CLIENT_ID = process.env.QB_CLIENT_ID;
const CLIENT_SECRET = process.env.QB_CLIENT_SECRET;
const REDIRECT_URI = process.env.QB_REDIRECT_URI || "http://localhost:3000/callback";
const SCOPE = "com.intuit.quickbooks.accounting";

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set QB_CLIENT_ID and QB_CLIENT_SECRET in .env first (see .env.example).");
  process.exit(1);
}

const port = Number(new URL(REDIRECT_URI).port || 3000);
const state = crypto.randomBytes(16).toString("hex");
const app = express();

app.get("/", (_req, res) => {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.get("/callback", async (req, res) => {
  try {
    if (req.query.state !== state) throw new Error("State mismatch — restart the flow.");
    const code = req.query.code;
    const realmId = req.query.realmId;
    if (!code || !realmId) throw new Error("Missing code or realmId in callback.");

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

    const data = await tokenRes.json();
    saveTokens({
      realmId: String(realmId),
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in - 60) * 1000,
    });

    console.log(`\n✅ Authorized company realmId=${realmId}. tokens.json written. You can close this tab.`);
    res.send("<h2>QuickBooks connected ✅</h2><p>tokens.json written. You can close this tab and stop the script (Ctrl+C).</p>");
  } catch (err) {
    console.error("Auth error:", err.message);
    res.status(500).send(`<h2>Auth failed</h2><pre>${err.message}</pre>`);
  }
});

app.listen(port, () => {
  console.log(`\nQuickBooks auth helper running.`);
  console.log(`Open this URL in your browser to authorize:\n\n  http://localhost:${port}/\n`);
});
