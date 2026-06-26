// End-to-end load test: launch the MCP server as a subprocess, do the protocol
// handshake, and list every tool it registers. No QuickBooks credentials needed
// (tools/list does not invoke handlers). Run: node scripts/selftest.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["src/index.js"],
});

const client = new Client({ name: "selftest", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();

const has = (n) => names.includes(n);
const checks = {
  "create_customer": has("create_customer"),
  "delete_invoice": has("delete_invoice"),
  "search_journal_entries": has("search_journal_entries"),
  "update_company_info": has("update_company_info"),
  "get_company_info": has("get_company_info"),
  "search_tax_agencies": has("search_tax_agencies"),
  "get_report": has("get_report"),
  // these must NOT exist (dashes in the matrix)
  "no delete_account": !has("delete_account"),
  "no delete_class": !has("delete_class"),
  "no create_tax_code": !has("create_tax_code"),
  "no delete_company_info": !has("delete_company_info"),
  "no search_company_info": !has("search_company_info"),
};

console.log(`Server reported ${tools.length} tools.\n`);
let failed = 0;
for (const [label, pass] of Object.entries(checks)) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failed++;
}

console.log(`\nExpected 129 tools: ${tools.length === 129 ? "✅" : "❌ got " + tools.length}`);
if (tools.length !== 129) failed++;

await client.close();
process.exit(failed ? 1 : 0);
