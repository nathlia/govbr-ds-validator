#!/usr/bin/env node
/**
 * stdio entry point. Register with an MCP client, e.g.:
 *   claude mcp add govbr-ds-validator -- node <path>/dist/index.js
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { closeBrowser } from "./evidence/browser.js";

const server = createServer();
const transport = new StdioServerTransport();

async function shutdown(): Promise<void> {
  await closeBrowser().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("close", shutdown);

await server.connect(transport);
console.error("[govbr-ds-validator] MCP server ready (stdio)");
