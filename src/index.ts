#!/usr/bin/env node
/**
 * stdio entry point. Register with an MCP client, e.g.:
 *   claude mcp add govbr-ds-validator -- node <path>/dist/index.js
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, DenseRequiredError, InvalidRetrievalModeError, startupChecks, UnknownToolProfileError } from "./server.js";
import { closeBrowser } from "./evidence/browser.js";

let server: ReturnType<typeof createServer>;
try {
  server = createServer();
} catch (err) {
  // 2.17.1 (NAT-106): perfil desconhecido falha na subida — uma linha no stderr (stdout é só JSON-RPC).
  if (err instanceof UnknownToolProfileError || err instanceof InvalidRetrievalModeError) {
    console.error(`[govbr-ds-validator] ${err.message}`);
    process.exit(2);
  }
  throw err;
}
try {
  await startupChecks();
} catch (err) {
  // 3.2.0 (NAT-107): GOVBR_RETRIEVAL_REQUIRE_DENSE=1 sem modelo/vetores conferidos → não sobe.
  if (err instanceof DenseRequiredError) {
    console.error(`[govbr-ds-validator] ${err.message}`);
    process.exit(2);
  }
  throw err;
}
const transport = new StdioServerTransport();

async function shutdown(): Promise<void> {
  await closeBrowser().catch(() => {});
  process.exit(0);
}

// 3.3.0 (S-22): uma rejeição solta do Playwright (ex.: diálogo numa sessão já fechada) não derruba o
// servidor; vai para o stderr (o stdout é só JSON-RPC) e as chamadas seguintes continuam atendidas.
process.on("unhandledRejection", (reason) => {
  console.error(`[govbr-ds-validator] rejeição não tratada (ignorada): ${reason instanceof Error ? reason.message.split("\n")[0] : String(reason)}`);
});
process.on("uncaughtException", (error) => {
  console.error(`[govbr-ds-validator] exceção não tratada (ignorada): ${error.message.split("\n")[0]}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("close", shutdown);

await server.connect(transport);
console.error("[govbr-ds-validator] MCP server ready (stdio)");
