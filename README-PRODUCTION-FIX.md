# Fixing the Production (Real QuickBooks Company) Connection

If you switched from sandbox to production but the authorization link still showed
`localhost` and the consent screen still showed your **sandbox** company, this guide
is for you.

## Why it happened

**1. Your edited `.env` was never being read.**
The auth script loads `.env` from the folder you run the command in, and this bundle
contains *two* copies of the project — the outer folder and this `quickbooks-mcp-server`
folder inside it. If you edit one copy's `.env` but run the command from the other,
you silently get the old (sandbox) values.

How you can tell: which companies appear on Intuit's consent screen is determined
**only by the Client ID** sent in the request. Development Client ID → sandbox
companies; Production Client ID → real companies. `QB_ENVIRONMENT=production` does
NOT affect the consent screen — it only changes which API server is used afterward.
So "still sandbox" = the old Development Client ID was still being used = your `.env`
changes weren't loaded.

**2. The original `npm run auth` only works with a localhost redirect.**
It catches the OAuth callback on `localhost:3000`. Intuit does not allow plain
`http://localhost` redirect URIs on Production keys (production requires HTTPS), so
with a real redirect URL the browser gets sent to your website — where nothing is
listening — and the flow can never finish.

The included `auth-production.js` script fixes both: it always reads the `.env`
sitting next to it, prints exactly which config it loaded, and supports a
"paste the callback URL back" mode for production redirects.

## The fix, step by step

Everything below happens **inside this `quickbooks-mcp-server` folder**. Ignore any
duplicate files (`auth.js`, `src/`, `.env`) in the outer folder.

### 1. Set up production credentials in `.env`

Edit the file named exactly `.env` (not `.env.example`) in this folder:

```
QB_CLIENT_ID=<Production Client ID>
QB_CLIENT_SECRET=<Production Client Secret>
QB_ENVIRONMENT=production
QB_REDIRECT_URI=<your registered HTTPS redirect URL>
```

Notes:
- On https://developer.intuit.com → My Apps → your app → **Keys & credentials**,
  Development and Production are **separate key pairs**. Copy from the
  **Production** section.
- `QB_REDIRECT_URI` must match, character for character, a redirect URI listed
  under the **Production** section's Redirect URIs. It must be HTTPS. It can be
  any page on a site you control — the page doesn't need to do anything (a 404
  is fine); it just receives the code in the URL.

### 2. Delete the old `tokens.json`

It still holds the **sandbox** authorization. The server keeps using it until a
successful re-authorization replaces it.

```
del tokens.json        (Windows)
rm tokens.json         (Mac/Linux)
```

### 3. Re-authorize with the new script

From this folder:

```
node auth-production.js
```

The script first prints the configuration it actually loaded (`.env` path,
environment, Client ID prefix, redirect URI). **Check this block** — if it says
`sandbox` or shows the old values, fix `.env` before continuing.

Then:

1. Open the printed Intuit URL in your browser.
2. Sign in and approve. The consent screen should now list your **real** company.
   If you still see sandbox companies, the Client ID in `.env` is still the
   Development one — stop and fix step 1.
3. After approving, your browser lands on your redirect URL. The page may show a
   404 — that's expected. Copy the **full address** from the browser's address bar
   (it contains `code=...&realmId=...`).
4. Paste it into the terminal when prompted. Do this within a few minutes — the
   code expires quickly.
5. You should see `✅ Authorized company realmId=... (production). tokens.json written.`

### 4. Verify

```
npm run check
```

This should return your real company's info, not the sandbox company.

### 5. Restart Claude Desktop

Fully quit and reopen Claude Desktop so the MCP server restarts with the new
tokens. The QuickBooks tools will now operate on the real company.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Printed config still shows sandbox values | You edited the wrong file. Edit `.env` in THIS folder (not `.env.example`, not the outer folder's copy). |
| Consent screen shows sandbox companies | Client ID is still the Development one. Use the Production pair. |
| `Token exchange failed (400)` with `invalid_grant` | The code expired or was already used. Re-run the script and paste the URL promptly. |
| `Token exchange failed (400)` mentioning redirect_uri | `QB_REDIRECT_URI` in `.env` doesn't exactly match a Production redirect URI in the Intuit portal. |
| Intuit error page before consent screen | Same redirect URI mismatch — fix it in the portal or `.env` so they're identical. |
| Server still returns sandbox data after auth | Old `tokens.json` wasn't replaced, or Claude Desktop wasn't restarted. Check `tokens.json`'s realmId and restart Claude. |
| `No tokens found` / 401 errors later | Refresh token expired (~100 days of inactivity). Just re-run `node auth-production.js`. |
