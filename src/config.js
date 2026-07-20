// Entity matrix. `ops` mirrors the CRUD + Search requirements exactly.
//   c = create, r = read/get, u = update, d = delete, s = search
// `entity`  -> QuickBooks entity name (used in query: SELECT * FROM <entity>)
// `path`    -> REST path segment (entity name, lowercased)
// `singular`/`plural` -> used to build tool names (create_<singular>, search_<plural>)

export const ENTITIES = [
  { entity: "Customer",      path: "customer",      singular: "customer",       plural: "customers",        ops: "cruds" },
  { entity: "Invoice",       path: "invoice",       singular: "invoice",        plural: "invoices",         ops: "cruds" },
  { entity: "Estimate",      path: "estimate",      singular: "estimate",       plural: "estimates",        ops: "cruds" },
  { entity: "Bill",          path: "bill",          singular: "bill",           plural: "bills",            ops: "cruds" },
  { entity: "Vendor",        path: "vendor",        singular: "vendor",         plural: "vendors",          ops: "cruds" },
  { entity: "Employee",      path: "employee",      singular: "employee",       plural: "employees",        ops: "cruds" },
  { entity: "Account",       path: "account",       singular: "account",        plural: "accounts",         ops: "crus"  },
  { entity: "Item",          path: "item",          singular: "item",           plural: "items",            ops: "cruds" },
  { entity: "JournalEntry",  path: "journalentry",  singular: "journal_entry",  plural: "journal_entries",  ops: "cruds" },
  { entity: "BillPayment",   path: "billpayment",   singular: "bill_payment",   plural: "bill_payments",    ops: "cruds" },
  { entity: "Purchase",      path: "purchase",      singular: "purchase",       plural: "purchases",        ops: "cruds" },
  { entity: "Payment",       path: "payment",       singular: "payment",        plural: "payments",         ops: "cruds" },
  { entity: "SalesReceipt",  path: "salesreceipt",  singular: "sales_receipt",  plural: "sales_receipts",   ops: "cruds" },
  { entity: "CreditMemo",    path: "creditmemo",    singular: "credit_memo",    plural: "credit_memos",     ops: "cruds" },
  { entity: "RefundReceipt", path: "refundreceipt", singular: "refund_receipt", plural: "refund_receipts",  ops: "cruds" },
  { entity: "PurchaseOrder", path: "purchaseorder", singular: "purchase_order", plural: "purchase_orders",  ops: "cruds" },
  { entity: "VendorCredit",  path: "vendorcredit",  singular: "vendor_credit",  plural: "vendor_credits",   ops: "cruds" },
  { entity: "Deposit",       path: "deposit",       singular: "deposit",        plural: "deposits",         ops: "cruds" },
  { entity: "Transfer",      path: "transfer",      singular: "transfer",       plural: "transfers",        ops: "cruds" },
  { entity: "TimeActivity",  path: "timeactivity",  singular: "time_activity",  plural: "time_activities",  ops: "cruds" },
  { entity: "Class",         path: "class",         singular: "class",          plural: "classes",          ops: "crus"  },
  { entity: "Department",    path: "department",    singular: "department",     plural: "departments",      ops: "crus"  },
  { entity: "Term",          path: "term",          singular: "term",           plural: "terms",            ops: "crus"  },
  { entity: "PaymentMethod", path: "paymentmethod", singular: "payment_method", plural: "payment_methods",  ops: "crus"  },
  { entity: "TaxCode",       path: "taxcode",       singular: "tax_code",       plural: "tax_codes",        ops: "rs"    },
  { entity: "TaxRate",       path: "taxrate",       singular: "tax_rate",       plural: "tax_rates",        ops: "rs"    },
  { entity: "TaxAgency",     path: "taxagency",     singular: "tax_agency",     plural: "tax_agencies",     ops: "rs"    },
  { entity: "CompanyInfo",   path: "companyinfo",   singular: "company_info",   plural: "company_info",     ops: "ru"    },
  { entity: "Attachable",    path: "attachable",    singular: "attachable",     plural: "attachables",      ops: "cruds" },
];

// Report endpoints exposed via the generic get_report tool. Names map to QBO report API.
export const REPORTS = [
  "ProfitAndLoss",
  "ProfitAndLossDetail",
  "BalanceSheet",
  "CashFlow",
  "TrialBalance",
  "GeneralLedger",
  "AgedReceivables",
  "AgedReceivableDetail",
  "AgedPayables",
  "AgedPayableDetail",
  "CustomerBalance",
  "CustomerBalanceDetail",
  "CustomerIncome",
  "VendorBalance",
  "VendorBalanceDetail",
  "VendorExpenses",
  "InventoryValuationSummary",
  "TransactionList",
];
