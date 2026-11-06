/** A6: a continuação das pendências do axe funciona sem carregar conhecimento. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { knowledgeLockAttempts, resetKnowledgeLock } from "../../src/data/lock.js";
import type { ToolTelemetryEvent } from "../../src/telemetry.js";

let http: Server;
let url: string;
beforeAll(async () => {
  http = createHttpServer((req, res) => {
    const text = req.url === "/limpa" ? "<p>Atendimento aberto</p>" :
      '<p id="aviso" style="background-image:linear-gradient(#777,#888);color:#999">Atendimento aberto</p>';
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
      `<!doctype html><html lang="pt-BR"><head><title>Biblioteca</title></head><body><main><h1>Biblioteca</h1>${text}</main></body></html>`,
    );
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterEach(resetKnowledgeLock);
afterAll(async () => {
  await closeBrowser();
  await new Promise<void>((resolve, reject) => http.close((e) => e ? reject(e) : resolve()));
});

async function connect() {
  const events: ToolTelemetryEvent[] = [];
  const server = createServer({
    toolProfile: "knowledge-free", // trava de processo, como no runner real
    reportsDir: mkdtempSync(join(tmpdir(), "govbr-373-a6-")),
    telemetry: { onEvent: (event) => events.push(event) },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: "fix373-a6", version: "1" });
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ text: string }>).map((c) => c.text).join("");
    return { isError: Boolean(result.isError), text, data: JSON.parse(text) };
  };
  return { client, events, call };
}

describe("3.7.3 A6 — observations no perfil knowledge-free", () => {
  it("recupera a pendência do axe do mesmo lote, com medidas e pendingId, sem varrer de novo nem carregar a base", async () => {
    const { client, call, events } = await connect();
    try {
      const scan = await call("scan_page", { url });
      const observations = await call("get_finding_details", { scanId: scan.data.scanId, view: "observations" });
      expect(observations.isError).toBe(false);
      expect(observations.data.total).toBe(1);
      const item = observations.data.observations[0];
      expect(item.kind).toBe("not-judged");
      expect(item.data.code).toBe("contrast-incomplete");
      expect(item.data.pendingId).toMatch(/^P-\d+$/);
      expect(item.data.norms).toEqual(["wcag-1.4.3"]);
      expect(item.data.measured[0].locator).toContain("aviso");
      expect(item.data.measured[0].reason).toBeTruthy();
      expect(item.data).not.toHaveProperty("rule");
      expect(observations.text).not.toMatch(/govbr-3\.7\.0|emag-|e-MAG|boundLocators|elementSet/);
      expect(observations.text.length).toBeLessThanOrEqual(8000);
      expect(events.map((e) => e.tool)).toEqual(["scan_page", "get_finding_details"]);
      expect(events.every((e) => e.knowledgeLockAttempts === 0)).toBe(true);
      expect(knowledgeLockAttempts().attempts).toBe(0);
      const families = await call("get_finding_details", { scanId: scan.data.scanId });
      expect(families.data.totalFindings).toBeTypeOf("number");
      expect(families.data.totalFindings).toBe(scan.data.summary.total);
    } finally { await client.close(); }
  });

  it("a continuação de um scan compacto aceita exatamente os argumentos sugeridos", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url, maxChars: 2000 });
      expect(scan.text.length).toBeLessThanOrEqual(2000);
      const next = scan.data.checksRun?.pageLevel?.next;
      expect(next).toMatchObject({ tool: "get_finding_details", arguments: { scanId: scan.data.scanId, view: "observations" } });
      const detail = await call(next.tool, next.arguments);
      expect(detail.isError).toBe(false);
      expect(detail.data.observations[0].data.code).toBe("contrast-incomplete");
    } finally { await client.close(); }
  });

  it("um lote sem pendências devolve página vazia e cursor final; outro lote não herda a pendência", async () => {
    const { client, call } = await connect();
    try {
      await call("scan_page", { url });
      const clean = await call("scan_page", { url: `${url}/limpa` });
      const empty = await call("get_finding_details", { scanId: clean.data.scanId, view: "observations" });
      expect(empty.isError).toBe(false);
      expect(empty.data).toMatchObject({ total: 0, count: 0, observations: [] });
      expect(empty.data.nextCursor).toBeUndefined();
    } finally { await client.close(); }
  });

  it("em 1000 caracteres recusa o item que não cabe e fornece continuação que recupera toda a evidência", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url });
      const small = await call("get_finding_details", { scanId: scan.data.scanId, view: "observations", maxChars: 1000 });
      expect(small.text.length).toBeLessThanOrEqual(1000);
      expect(small.isError).toBe(true);
      expect(small.data.field).toBe("maxChars");
      const next = small.data.next[0];
      expect(next.arguments.maxChars).toBeGreaterThan(1000);
      const full = await call(next.tool, next.arguments);
      expect(full.isError).toBe(false);
      expect(full.text.length).toBeLessThanOrEqual(next.arguments.maxChars);
      expect(full.data.observations[0].data.measured[0].reason).toBeTruthy();
      expect(knowledgeLockAttempts().attempts).toBe(0);
    } finally { await client.close(); }
  });

  it("recusa lote alheio, combinação ids + view e enum inválido sem tentar carregar conhecimento", async () => {
    const { client, call } = await connect();
    try {
      for (const args of [
        { scanId: "S-alheio", view: "observations" },
        { ids: ["F-001"], view: "observations" },
      ]) {
        const response = await call("get_finding_details", args);
        expect(response.isError).toBe(true);
        expect(response.data.next).toBeDefined();
      }
      const malformed = await client.callTool({ name: "get_finding_details", arguments: { scanId: "S-alheio", view: "normas" } });
      expect(malformed.isError).toBe(true);
      expect(knowledgeLockAttempts().attempts).toBe(0);
    } finally { await client.close(); }
  });
});
