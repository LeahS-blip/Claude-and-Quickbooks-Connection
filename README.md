# QuickBooks Online MCP Server

A custom [Model Context Protocol](https://modelcontextprotocol.io) server that connects Claude to QuickBooks Online. It exposes full **Create / Get / Update / Delete / Search** tools for all 29 entity types in the requirements matrix, plus financial reports — talking directly to the Intuit Accounting API.

> Standalone project. Lives in its own folder, independent of the `qbo-integration` app in the parent directory.

## 🔗 Connecting multiple companies (clients)

This server holds **every authorized QuickBooks company at once**. Authorize each
client one time, then switch between them instantly — no re-running the auth
script and no restarting Claude to change companies. Two tools manage this:

- `list_companies` — see every connected client and which one is active.
- `set_active_company` — switch the active client (by realmId or name).

Every tool also accepts an optional `company` to target one client for a single
call. **New here? Follow [MULTI-COMPANY.md](MULTI-COMPANY.md) for the full
step-by-step setup.**

## What you get

129 tools in total: CRUD + search per entity (exactly matching the matrix below), plus one `get_report` tool covering P&L, Balance Sheet, Cash Flow, Trial Balance, General Ledger, AR/AP aging, customer/vendor balances, and more.

| Entity | Create | Get | Update | Delete | Search |
|---|:--:|:--:|:--:|:--:|:--:|
| Customer, Invoice, Estimate, Bill, Vendor, Employee | ✅ | ✅ | ✅ | ✅ | ✅ |
| Item, Journal Entry, Bill Payment, Purchase, Payment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sales Receipt, Credit Memo, Refund Receipt, Purchase Order | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vendor Credit, Deposit, Transfer, Time Activity, Attachable | ✅ | ✅ | ✅ | ✅ | ✅ |
| Account, Class, Department, Term, Payment Method | ✅ | ✅ | ✅ | — | ✅ |
| Tax Code, Tax Rate, Tax Agency | — | ✅ | — | — | ✅ |
| Company Info | — | ✅ | ✅ | — | — |

Tool names follow a predictable pattern: `create_customer`, `get_invoice`, `update_bill`, `delete_estimate`, `search_vendors`, `get_company_info`, `get_report`, etc.

## Prerequisites

- **Node.js 18 or newer** (uses the built-in `fetch`).
- An **Intuit Developer account** and an app — free at https://developer.intuit.com.
- A QuickBooks company to connect (a free **sandbox** company is created automatically with your developer account; use that for testing before pointing at a real company).

## Setup

### 1. Create your Intuit app

1. Go to https://developer.intuit.com → **My Apps** → **Create an app** → select the **Accounting** scope.
2. Open **Keys & credentials**. Copy the **Client ID** and **Client Secret** (there's a separate pair for Development/sandbox and Production).
3. Under **Redirect URIs**, add exactly:
   ```
   http://localhost:3000/callback
   ```

### 2. Configure credentials

From this `quickbooks-mcp-server` folder:

```bash
npm install
cp .env.example .env        # on Windows: copy .env.example .env
```

Open `.env` and fill in `QB_CLIENT_ID` and `QB_CLIENT_SECRET`. Leave `QB_ENVIRONMENT=sandbox` while testing; switch to `production` (and production keys) when you're ready for the real company.

### 3. Authorize (one time)

```bash
npm run auth
```

Open the printed `http://localhost:3000/` URL, sign in, and approve. This writes a `tokens.json` file holding the access token, refresh token, and your company's `realmId`. The server refreshes the access token automatically from then on, so you only do this once (re-run it if you switch companies or the refresh token expires after ~100 days of inactivity).

### 4. Add to Claude as a custom connector

In **Claude Desktop**, open Settings → Developer → Edit Config (`claude_desktop_config.json`) and add:

```json
{
  "mcpServers": {
    "quickbooks": {
      "command": "node",
      "args": ["C:\\Users\\leahs\\OneDrive\\Documents\\Connecting Claude and Quickbooks\\quickbooks-mcp-server\\src\\index.js"]
    }
  }
}
```

Restart Claude. The QuickBooks tools will appear. (The server reads `.env` and `tokens.json` from this folder automatically.)

## Usage notes

- **Creating / updating** uses native QuickBooks field names. Example create_customer `data`: `{"DisplayName": "Acme Co", "PrimaryEmailAddr": {"Address": "ap@acme.com"}}`.
- **Updates are full replacements** by default. To change only a few fields, include `"sparse": true` in `data` along with the `Id`. The server fetches the current `SyncToken` for you if you omit it.
- **Deletes** need only the `id`; the `SyncToken` is fetched automatically.
- **Search** uses QuickBooks query syntax in the `where` field, e.g. `search_invoices` with `where: "TotalAmt > 500 AND Balance > 0"`, or `search_customers` with `where: "DisplayName LIKE '%Acme%'"`. Use `limit`/`offset` to page (QBO caps results at 1000 per call). You can also pass a full `query` string.
- **Reports**: `get_report` with `report_name` (e.g. `ProfitAndLoss`) and `params` like `{"start_date":"2026-01-01","end_date":"2026-03-31","accounting_method":"Accrual"}`.

## Going live: switching from sandbox to production

The server is built to run against either environment — going live is mostly configuration, not code changes. The differences:

**1. Flip the environment flag.** In `.env`, set:

```
QB_ENVIRONMENT=production
```

This automatically routes requests to the live API (`quickbooks.api.intuit.com`) instead of the sandbox host. No code edits needed.

**2. Use your Production keys.** Intuit issues a *separate* Client ID / Secret for production. On the Keys & credentials page, copy the keys from the **Production** section (not Development) into `.env`. Production keys are gated: Intuit only releases them after you complete the app profile (app name, EULA URL, privacy policy URL, host domain, requested scopes) and pass its review. Complete that on developer.intuit.com before you expect production keys to appear.

**3. Mind the redirect URI rule.** For production, Intuit generally requires redirect URIs to be **HTTPS** — the plain `http://localhost:3000/callback` used for sandbox may be rejected. Either register an HTTPS redirect URI and set `QB_REDIRECT_URI` to match, or run the one-time authorization through a temporary secure tunnel. Confirm the current requirement in your app's settings.

**4. Re-authorize.** Tokens are environment-specific, so the sandbox `tokens.json` will not work against a real company. Re-run `npm run auth` once with the production keys, sign into the **real** QuickBooks company, and a fresh `tokens.json` (with the real `realmId`) is written.

**⚠️ Every action is now real.** In production, `create_*`, `update_*`, and `delete_*` change actual books — a wrong call can modify or delete real financial records. Before going live, consider running in read-only mode (get/search/reports only) or requiring explicit confirmation before any write. Always test changes in sandbox first.

## Verify the config

```bash
npm run check
```

Lists every tool and confirms the entity matrix matches the requirements table. No credentials needed.

## Files

- `src/index.js` — MCP server; registers all tools (incl. `list_companies` / `set_active_company`).
- `src/config.js` — the entity matrix and report list (edit here to add/remove entities).
- `src/qbClient.js` — OAuth token refresh + REST helpers + the multi-company token store.
- `auth-production.js` — authorize a company (sandbox or production); additive, adds each client to `tokens.json`.
- `auth.js` — localhost/sandbox-only authorization flow (use `auth-production.js` for production).
- `scripts/sanity.js` — offline config check.
- `MULTI-COMPANY.md` — step-by-step guide to connecting multiple clients at once.
- `README-PRODUCTION-FIX.md` — fixes the "still shows sandbox company" production auth issue.

## Troubleshooting

- **"No tokens found"** — run `npm run auth`.
- **401 / token errors** — your refresh token may have expired or you switched environments; re-run `npm run auth`.
- **"Redirect URI mismatch"** — the URI in your Intuit app must exactly equal `QB_REDIRECT_URI`.
- **Empty search results in sandbox** — sandbox companies start nearly empty; create a record first or point at a real company.

## Security

`.env` and `tokens.json` contain secrets and are git-ignored. Keep them out of shared/version-controlled locations. These tools can modify and delete real accounting data when pointed at a production company — test in sandbox first.
