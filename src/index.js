#!/usr/bin/env node
// QuickBooks Online MCP server.
// Registers create / get / update / delete / search tools for every entity in the
// requirements matrix, plus a generic financial-report tool. Communicates over stdio.
//
// MULTI-COMPANY: multiple QuickBooks companies can be authorized at once. Use
// list_companies to see them and set_active_company to switch which one tools
// act on (no server restart needed). Any tool also accepts an optional `company`
// (realmId or company-name) to target one company for a single call without
// changing the active one.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { ENTITIES, REPORTS } from "./config.js";
import {
  createEntity,
  getEntity,
  updateEntity,
  deleteEntity,
  queryEntity,
  getCompanyInfo,
  getReport,
  listCompanies,
  setActiveCompany,
  resolveRealmId,
} from "./qbClient.js";

const server = new McpServer({
  name: "quickbooks-mcp-server",
  version: "1.1.0",
});

const ok = (obj) => ({
  content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
});
const fail = (err) => ({
  content: [{ type: "text", text: `Error: ${err.message || String(err)}` }],
  isError: true,
});
const guard = (fn) => async (args) => {
  try {
    return ok(await fn(args));
  } catch (err) {
    return fail(err);
  }
};

// Optional per-call company selector, added to every entity/report tool.
const companyField = {
  company: z
    .string()
    .optional()
    .describe(
      "Optional: target a specific company by realmId or company name for this call only. Defaults to the active company (see list_companies / set_active_company)."
    ),
};

let toolCount = 0;
function register(name, description, shape, handler) {
  server.registerTool(name, { description, inputSchema: shape }, handler);
  toolCount++;
}

// ---- company management ---------------------------------------------------

register(
  "list_companies",
  "List every authorized QuickBooks company (realmId, name, environment, and which is currently active). Use this to see what you can switch between.",
  {},
  guard(() => listCompanies())
);

register(
  "set_active_company",
  "Switch which QuickBooks company all subsequent tools act on, without restarting the server. Pass a realmId or a company name.",
  {
    company: z
      .string()
      .describe("The company to make active — a realmId or a company name (substring match)."),
  },
  guard(({ company }) => setActiveCompany(company))
);

// ---- per-entity CRUD + search tools --------------------------------------

for (const e of ENTITIES) {
  const label = e.entity;

  if (e.ops.includes("c")) {
    register(
      `create_${e.singular}`,
      `Create a ${label} in QuickBooks. Pass the full entity object as \`data\` (QBO field names, e.g. for Customer: {"DisplayName":"Acme"}).`,
      {
        data: z.record(z.any()).describe(`${label} fields to create.`),
        ...companyField,
      },
      guard(({ data, company }) => createEntity(label, e.path, data, resolveRealmId(company)))
    );
  }

  if (e.ops.includes("r")) {
    if (label === "CompanyInfo") {
      register(
        `get_${e.singular}`,
        `Get the connected company's CompanyInfo.`,
        { ...companyField },
        guard(({ company }) => getCompanyInfo(resolveRealmId(company)))
      );
    } else {
      register(
        `get_${e.singular}`,
        `Get a single ${label} by its QuickBooks Id.`,
        {
          id: z.string().describe(`The ${label} Id.`),
          ...companyField,
        },
        guard(({ id, company }) => getEntity(label, e.path, id, resolveRealmId(company)))
      );
    }
  }

  if (e.ops.includes("u")) {
    register(
      `update_${e.singular}`,
      `Update a ${label}. \`data\` must include the Id. SyncToken is fetched automatically if omitted. NOTE: QuickBooks updates are full replacements unless you include "sparse": true.`,
      {
        data: z.record(z.any()).describe(`${label} fields including Id.`),
        ...companyField,
      },
      guard(({ data, company }) => updateEntity(label, e.path, data, resolveRealmId(company)))
    );
  }

  if (e.ops.includes("d")) {
    register(
      `delete_${e.singular}`,
      `Delete a ${label} by Id. SyncToken is fetched automatically if omitted.`,
      {
        id: z.string().describe(`The ${label} Id.`),
        sync_token: z.string().optional().describe("Optional SyncToken."),
        ...companyField,
      },
      guard(({ id, sync_token, company }) =>
        deleteEntity(label, e.path, id, sync_token, resolveRealmId(company))
      )
    );
  }

  if (e.ops.includes("s")) {
    register(
      `search_${e.plural}`,
      `Search ${label} records. Provide a \`where\` clause (QBO query syntax, e.g. "DisplayName LIKE '%Acme%'") or a full \`query\`. Supports pagination.`,
      {
        where: z.string().optional().describe("WHERE clause (without 'WHERE')."),
        order_by: z.string().optional().describe("ORDER BY clause."),
        limit: z.number().int().positive().max(1000).optional().describe("Max results (default 100, QBO cap 1000)."),
        offset: z.number().int().positive().optional().describe("1-based start position for pagination."),
        query: z.string().optional().describe("Full raw query, overrides the other fields."),
        ...companyField,
      },
      guard(({ where, order_by, limit, offset, query, company }) =>
        queryEntity(label, {
          where,
          orderBy: order_by,
          limit: limit ?? 100,
          offset,
          rawQuery: query,
          realmId: resolveRealmId(company),
        })
      )
    );
  }
}

// ---- reports --------------------------------------------------------------

register(
  "get_report",
  `Run a QuickBooks financial report. \`report_name\` is one of: ${REPORTS.join(", ")}. \`params\` are report query parameters such as {"start_date":"2026-01-01","end_date":"2026-03-31","accounting_method":"Accrual"}.`,
  {
    report_name: z.string().describe("Report name, e.g. ProfitAndLoss."),
    params: z.record(z.string()).optional().describe("Report query parameters."),
    ...companyField,
  },
  guard(({ report_name, params, company }) =>
    getReport(report_name, params || {}, resolveRealmId(company))
  )
);

// ---- start ----------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is reserved for the MCP protocol.
  console.error(
    `QuickBooks MCP server running. Registered ${toolCount} tools across ${ENTITIES.length} entities + reports + company management.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
