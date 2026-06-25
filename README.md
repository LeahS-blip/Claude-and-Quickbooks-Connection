# Claude-and-Quickbooks-Connection

QuickBooks Online MCP Server

A custom Model Context Protocol server that connects Claude to QuickBooks Online. It exposes full Create / Get / Update / Delete / Search tools for all 29 entity types in the requirements matrix, plus financial reports — talking directly to the Intuit Accounting API.

What you get

129 tools in total: CRUD + search per entity, plus one get_report tool covering P&L, Balance Sheet, Cash Flow, Trial Balance, General Ledger, AR/AP aging, customer/vendor balances, and more.

Tool names follow a predictable pattern: create_customer, get_invoice, update_bill, delete_estimate, search_vendors, get_company_info, get_report, etc.

Prerequisites


Node.js 18 or newer (uses the built-in fetch).
An Intuit Developer account and an app — free at https://developer.intuit.com.
A QuickBooks company to connect (a free sandbox company is created automatically with your developer account; use that for testing before pointing at a real company).


Setup

1. Create your Intuit app


Go to https://developer.intuit.com → My Apps → Create an app → select the Accounting scope.
Open Keys & credentials. Copy the Client ID and Client Secret (there's a separate pair for Development/sandbox and Production).
Under Redirect URIs, add exactly:


   http://localhost:3000/callback

2. Configure credentials

From this folder:

bashnpm install
cp .env.example .env        # on Windows: copy .env.example .env

Open .env and fill in QB_CLIENT_ID and QB_CLIENT_SECRET. Leave QB_ENVIRONMENT=sandbox while testing; switch to production (and production keys) when you're ready for the real company.

3. Authorize (one time)

bashnpm run auth

Open the printed http://localhost:3000/ URL, sign in, and approve. This writes a tokens.json file holding the access token, refresh token, and your company's realmId. The server refreshes the access token automatically from then on, so you only do this once (re-run it if you switch companies or the refresh token expires after ~100 days of inactivity).

4. Add to Claude as a custom connector

In Claude Desktop, open Settings → Developer → Edit Config (claude_desktop_config.json) and add:

json{
  "mcpServers": {
    "quickbooks": {
      "command": "node",
      "args": ["C:\\Users\\leahs\\OneDrive\\Documents\\Connecting Claude and Quickbooks\\src\\index.js"]
    }
  }
}

Restart Claude. The QuickBooks tools will appear. (The server reads .env and tokens.json from this folder automatically.)

Usage notes


Creating / updating uses native QuickBooks field names. Example create_customer data: {"DisplayName": "Acme Co", "PrimaryEmailAddr": {"Address": "ap@acme.com"}}.
Updates are full replacements by default. To change only a few fields, include "sparse": true in data along with the Id. The server fetches the current SyncToken for you if you omit it.
Deletes need only the id; the SyncToken is fetched automatically.
Search uses QuickBooks query syntax in the where field, e.g. search_invoices with where: "TotalAmt > 500 AND Balance > 0", or search_customers with where: "DisplayName LIKE '%Acme%'". Use limit/offset to page (QBO caps results at 1000 per call). You can also pass a full query string.
Reports: get_report with report_name (e.g. ProfitAndLoss) and params like {"start_date":"2026-01-01","end_date":"2026-03-31","accounting_method":"Accrual"}.


Verify the config

bashnpm run check

Lists every tool and confirms the entity matrix matches the requirements table. No credentials needed.

Files


src/index.js — MCP server; registers all tools.
src/config.js — the entity matrix and report list (edit here to add/remove entities).
src/qbClient.js — OAuth token refresh + REST helpers.
auth.js — one-time authorization flow.
scripts/sanity.js — offline config check.


Troubleshooting


"No tokens found" — run npm run auth.
401 / token errors — your refresh token may have expired or you switched environments; re-run npm run auth.
"Redirect URI mismatch" — the URI in your Intuit app must exactly equal QB_REDIRECT_URI.
Empty search results in sandbox — sandbox companies start nearly empty; create a record first or point at a real company.


Security

.env and tokens.json contain secrets and are git-ignored. Keep them out of shared/version-controlled locations. These tools can modify and delete real accounting data when pointed at a production company — test in sandbox first.
