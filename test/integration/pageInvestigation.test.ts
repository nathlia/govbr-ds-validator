import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as httpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { resetKnowledgeLock } from "../../src/data/lock.js";
import { pageInvestigateClauses } from "../../src/tools/pageChecklist.js";
import type { ToolTelemetryEvent } from "../../src/telemetry.js";

let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end(
    `<!doctype html><html lang="pt-BR"><head><title>Catálogo</title></head><body><main><h1>Catálogo</h1><p>Produtos disponíveis.</p>${req.url === "/component" ? '<button class="br-button" type="button">Comprar</button>' : ""}</main></body></html>`,
  ));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free", events: ToolTelemetryEvent[] = []) {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "global-inline-")), telemetry: { onEvent: (e) => events.push(e) } });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "global-inline", version: "1" }); await client.connect(a); return client;
}
async function scan(client: Client, path: string, maxChars: number, allowBudgetError = false) {
  const result = await client.callTool({ name: "scan_page", arguments: { url: base + path, maxChars } });
  const text = (result.content as Array<{ text: string }>)[0].text;
  expect(text.length, text).toBeLessThanOrEqual(maxChars);
  const data = JSON.parse(text);
  if (allowBudgetError && result.isError) {
    expect(data).toMatchObject({ kind: "error", errorCode: "item-too-large", field: "maxChars", scanId: expect.any(String) });
    expect(data.error).toMatch(/nova observação/);
  } else expect(result.isError).toBeFalsy();
  return data;
}

describe("A2 — globais no primeiro scan MCP", () => {
  it("entrega cláusulas globais mesmo sem componentes DS, com próximo passo válido", async () => {
    const client = await connect("evaluation");
    try {
      const data = await scan(client, "/plain", 20000);
      expect(data.investigate.page.stateRef).toBe(data.scanId);
      expect(data.investigate.page.clauses.map((c: { citeAs: string }) => c.citeAs)).toEqual(pageInvestigateClauses().clauses.map((c) => c.citeAs));
      expect(data.investigate.page.note).toMatch(/não são veredito nem pendingId/);
      const next = data.investigate.page.next;
      const reply = await client.callTool({ name: next.tool, arguments: next.arguments });
      expect(reply.isError).toBeFalsy();
      expect(JSON.parse((reply.content as Array<{ text: string }>)[0].text).kind).toBe("page-checklist");
    } finally { await client.close(); }
  });

  it("todo teto preserva a continuação global, com ou sem componente", async () => {
    const client = await connect("evaluation");
    try {
      for (const path of ["/plain", "/component"]) for (const max of [1000, 2000, 8000]) {
        const data = await scan(client, path, max, true);
        if (data.kind === "error") {
          expect(data.next).toContainEqual(expect.objectContaining({ tool: "get_page_rules", arguments: { view: "checklist" } }));
          const details = data.next.find((n: { tool: string }) => n.tool === "get_finding_details");
          const reply = await client.callTool({ name: details.tool, arguments: details.arguments });
          expect(reply.isError).toBeFalsy();
          expect(JSON.parse((reply.content as Array<{ text: string }>)[0].text).scanId).toBe(data.scanId);
          continue;
        }
        if (typeof data.investigate.page.next === "string") expect(data.investigate.page.next).toBe("get_page_rules(view:checklist)");
        else {
          expect(data.investigate.page.next).toEqual({ tool: "get_page_rules", arguments: { view: "checklist" } });
          if (!data.investigate.page.clauses) expect(data.investigate.page.deferred).toBe(true);
        }
      }
    } finally { await client.close(); }
  });

  it("knowledge-free nunca recebe investigate nem tenta carregar normas", async () => {
    resetKnowledgeLock();
    const events: ToolTelemetryEvent[] = [];
    const client = await connect("knowledge-free", events);
    try {
      const data = await scan(client, "/plain", 8000);
      expect(data).not.toHaveProperty("investigate");
      expect(events).toHaveLength(1);
      expect(events[0].knowledgeLockAttempts).toBe(0);
    } finally { await client.close(); resetKnowledgeLock(); }
  });
});
