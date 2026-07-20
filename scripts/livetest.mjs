// Live connection test against the authorized QuickBooks company.
import { getCompanyInfo, queryEntity } from "../src/qbClient.js";

const info = await getCompanyInfo();
console.log("Company:", info.CompanyName);
console.log("Legal name:", info.LegalName || "(none)");
console.log("Country:", info.Country);
const addr = info.CompanyAddr || {};
console.log("Address:", [addr.Line1, addr.City, addr.CountrySubDivisionCode].filter(Boolean).join(", "));

const { items, totalCount } = await queryEntity("Customer", { limit: 3 });
console.log(`\nCustomers (showing up to 3, total ~${totalCount ?? items.length}):`);
for (const c of items) console.log(" -", c.DisplayName, c.PrimaryEmailAddr?.Address ? `<${c.PrimaryEmailAddr.Address}>` : "");

console.log("\n✅ Live read succeeded — the server is connected to QuickBooks.");
