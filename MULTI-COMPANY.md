# Connect Claude to Multiple QuickBooks Companies

This guide gets you from zero to having Claude connected to **all your QuickBooks
clients at once**, with the ability to switch between them instantly — no
re-running scripts and no restarting Claude to change companies.

---

## 1. What you need

- **Node.js 18 or newer** — https://nodejs.org (the "LTS" download is fine).
- **Claude Desktop** — installed and signed in.
- **Intuit Developer access** to the QuickBooks app (Client ID / Secret). Leah
  can share the **Production** Client ID and Secret and the registered HTTPS
  redirect URL — the same one app connects all clients, so you do **not** need
  separate credentials per company.

## 2. Download the project

Clone this repository (or download it as a ZIP from GitHub -> **Code** ->
**Download ZIP** and unzip it):

```bash
git clone https://github.com/LeahS-blip/Claude-and-Quickbooks-Connection.git
cd Claude-and-Quickbooks-Connection
```

You do **not** need to download `tokens.json` — you'll generate your own when you
authorize. (It's intentionally not in the repo; it holds private tokens.)

## 3. Install and configure

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Open `.env` and fill in the **Production** values:

```
QB_CLIENT_ID=<Production Client ID>
QB_CLIENT_SECRET=<Production Client Secret>
QB_ENVIRONMENT=production
QB_REDIRECT_URI=<the registered HTTPS redirect URL>
```

The redirect URL must match, character for character, one registered under the
**Production** section of the Intuit app's Keys & credentials. See
`README-PRODUCTION-FIX.md` if the consent screen shows sandbox companies or the
link points at localhost — that document explains why and how to fix it.

## 4. Authorize each client (one time each)

Run this once per QuickBooks company you want to connect:

```bash
node auth-production.js
```

1. Open the printed Intuit URL, sign in, and on the consent screen **pick the
   client company you want to add**.
2. Approve. Your browser lands on the redirect URL (the page may show 404 —
   that's fine). Copy the **full address bar URL** and paste it back into the
   terminal when prompted. Do it promptly; the code expires in a few minutes.
3. You'll see `Authorized company "<Name>" realmId=... (production).`

**Each run adds a company** to `tokens.json` — it does not overwrite the previous
one. Run it 5 times for 5 clients; they all stack together. The most recently
authorized company becomes the active one.

## 5. Register the server in Claude Desktop

In **Claude Desktop**: Settings -> Developer -> Edit Config
(`claude_desktop_config.json`), add (adjust the path to where you cloned it):

```json
{
  "mcpServers": {
    "quickbooks": {
      "command": "node",
      "args": ["C:\\path\\to\\Claude-and-Quickbooks-Connection\\src\\index.js"]
    }
  }
}
```

Then fully **quit and reopen** Claude Desktop.

## 6. Use it — switching clients with no restart

Just ask Claude in plain language:

- **"List my QuickBooks companies"** -> shows every connected client, its realmId,
  environment, and which one is active. (tool: `list_companies`)
- **"Switch to Beta Bakery"** -> makes that client active; every tool after that
  acts on it until you switch again. (tool: `set_active_company`)
- **"Get the P&L for Acme for Q1"** -> you can also target one client for a single
  action without switching, by naming the company — every tool accepts an
  optional `company` (a realmId or company name).

That's it. Authorize each client once, then switch freely.

---

## If you already had the old single-company version

Nothing to redo. The first time the updated server reads your existing
`tokens.json`, it upgrades the file automatically and keeps the company you were
already connected to. Just add your other clients with step 4 and restart Claude
once.

## Troubleshooting

- **Consent screen shows sandbox companies** -> the Client ID in `.env` is the
  Development one, not Production. See `README-PRODUCTION-FIX.md`.
- **"No authorized companies found"** -> run `node auth-production.js` at least once.
- **A client stopped working after months unused** -> its refresh token expired
  (~100 days idle). Run `node auth-production.js` and re-select that company.
- **Redirect URI mismatch** -> `QB_REDIRECT_URI` in `.env` must exactly equal a
  redirect URI registered in the Intuit app's Production section.
