// Cross-checks the entity config against the required CRUD/Search matrix and
// prints the full list of tools the server will expose. Run: npm run check
// No network or credentials needed.

import { ENTITIES, REPORTS } from "../src/config.js";

// Required ops straight from the requirements table (c=create r=get u=update d=delete s=search)
const REQUIRED = {
  Customer: "cruds", Invoice: "cruds", Estimate: "cruds", Bill: "cruds",
  Vendor: "cruds", Employee: "cruds", Account: "crus", Item: "cruds",
  JournalEntry: "cruds", BillPayment: "cruds", Purchase: "cruds", Payment: "cruds",
  SalesReceipt: "cruds", CreditMemo: "cruds", RefundReceipt: "cruds",
  PurchaseOrder: "cruds", VendorCredit: "cruds", Deposit: "cruds", Transfer: "cruds",
  TimeActivity: "cruds", Class: "crus", Department: "crus", Term: "crus",
  PaymentMethod: "crus", TaxCode: "rs", TaxRate: "rs", TaxAgency: "rs",
  CompanyInfo: "ru", Attachable: "cruds",
};

const sort = (s) => s.split("").sort().join("");
let problems = 0;
const tools = [];

for (const e of ENTITIES) {
  const want = REQUIRED[e.entity];
  if (!want) {
    console.error(`❌ ${e.entity} is not in the requirements table.`);
    problems++;
  } else if (sort(want) !== sort(e.ops)) {
    console.error(`❌ ${e.entity}: ops "${e.ops}" != required "${want}"`);
    problems++;
  }
  if (e.ops.includes("c")) tools.push(`create_${e.singular}`);
  if (e.ops.includes("r")) tools.push(`get_${e.singular}`);
  if (e.ops.includes("u")) tools.push(`update_${e.singular}`);
  if (e.ops.includes("d")) tools.push(`delete_${e.singular}`);
  if (e.ops.includes("s")) tools.push(`search_${e.plural}`);
}

// every required entity present?
for (const name of Object.keys(REQUIRED)) {
  if (!ENTITIES.find((e) => e.entity === name)) {
    console.error(`❌ Missing entity from config: ${name}`);
    problems++;
  }
}

tools.push("get_report");

console.log(tools.join("\n"));
console.log(`\nEntities: ${ENTITIES.length}`);
console.log(`Tools:    ${tools.length} (incl. get_report)`);
console.log(`Reports:  ${REPORTS.length} report types available via get_report`);

if (problems) {
  console.error(`\n❌ ${problems} mismatch(es) vs. requirements table.`);
  process.exit(1);
}
console.log("\n✅ Config matches the requirements matrix exactly.");
