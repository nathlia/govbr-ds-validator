#!/usr/bin/env node
/**
 * stdio entry point. Register with an MCP client, e.g.:
 *   claude mcp add govbr-ds-validator -- node <path>/dist/index.js
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, startupChecks, UnknownToolProfileError } from "./server.js";
import { closeBrowser } from "./evidence/browser.js";

let server: ReturnType<typeof createServer>;
try {
  server = createServer();
} catch (err) {
  // 2.17.1 (NAT-106): perfil desconhecido falha na subida — uma linha no stderr (stdout é só JSON-RPC).
  if (err instanceof UnknownToolProfileError) {
    console.error(`[govbr-ds-validator] ${err.message}`);
    process.exit(2);
  }
  throw err;
}
await startupChecks();
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
