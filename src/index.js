#!/usr/bin/env node
// QuickBooks Online MCP server.
// Registers create / get / update / delete / search tools for every entity in the
// requirements matrix, plus a generic financial-report tool. Communicates over stdio.

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
} from "./qbClient.js";

const server = new McpServer({
  name: "quickbooks-mcp-server",
  version: "1.0.0",
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

let toolCount = 0;
function register(name, description, shape, handler) {
  server.registerTool(name, { description, inputSchema: shape }, handler);
  toolCount++;
}

// ---- per-entity CRUD + search tools --------------------------------------

for (const e of ENTITIES) {
  const label = e.entity;

  if (e.ops.includes("c")) {
    register(
      `create_${e.singular}`,
      `Create a ${label} in QuickBooks. Pass the full entity object as \`data\` (QBO field names, e.g. for Customer: {"DisplayName":"Acme"}).`,
      { data: z.record(z.any()).describe(`${label} fields to create.`) },
      guard(({ data }) => createEntity(label, e.path, data))
    );
  }

  if (e.ops.includes("r")) {
    if (label === "CompanyInfo") {
      register(
        `get_${e.singular}`,
        `Get the connected company's CompanyInfo.`,
        {},
        guard(() => getCompanyInfo())
      );
    } else {
      register(
        `get_${e.singular}`,
        `Get a single ${label} by its QuickBooks Id.`,
        { id: z.string().describe(`The ${label} Id.`) },
        guard(({ id }) => getEntity(label, e.path, id))
      );
    }
  }

  if (e.ops.includes("u")) {
    register(
      `update_${e.singular}`,
      `Update a ${label}. \`data\` must include the Id. SyncToken is fetched automatically if omitted. NOTE: QuickBooks updates are full replacements unless you include "sparse": true.`,
      { data: z.record(z.any()).describe(`${label} fields including Id.`) },
      guard(({ data }) => updateEntity(label, e.path, data))
    );
  }

  if (e.ops.includes("d")) {
    register(
      `delete_${e.singular}`,
      `Delete a ${label} by Id. SyncToken is fetched automatically if omitted.`,
      {
        id: z.string().describe(`The ${label} Id.`),
        sync_token: z.string().optional().describe("Optional SyncToken."),
      },
      guard(({ id, sync_token }) => deleteEntity(label, e.path, id, sync_token))
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
      },
      guard(({ where, order_by, limit, offset, query }) =>
        queryEntity(label, {
          where,
          orderBy: order_by,
          limit: limit ?? 100,
          offset,
          rawQuery: query,
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
  },
  guard(({ report_name, params }) => getReport(report_name, params || {}))
);

// ---- start ----------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is reserved for the MCP protocol.
  console.error(
    `QuickBooks MCP server running. Registered ${toolCount} tools across ${ENTITIES.length} entities + reports.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
