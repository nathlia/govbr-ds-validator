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
import { getRuleById } from "../../src/data/knowledge.js";
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
      const data = await scan(client, "/plain", 100000);
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
      expect(data).not.toHaveProperty("clauseReserve");
      expect(events).toHaveLength(1);
      expect(events[0].knowledgeLockAttempts).toBe(0);
    } finally { await client.close(); resetKnowledgeLock(); }
  });
});

describe("A5 — reserva no MCP e recuperação do lote", () => {
  it("serve cláusula forte literal, procedimento e contexto sem registrar pendingId", async () => {
    const client = await connect("evaluation");
    try {
      const data = await scan(client, "/component", 8000);
      const reserve = data.clauseReserve;
      expect(reserve.targetChars).toBe(1600);
      // 3.7.4 (D1): a quota é teto do conteúdo (a 1ª cláusula inteira é piso); fatos primeiro.
      if (reserve.clauses.length > 1) expect(reserve.contentChars).toBeLessThanOrEqual(reserve.targetChars);
      expect(reserve.literalChars + reserve.contextChars + reserve.procedureChars).toBe(reserve.contentChars);
      expect(reserve.clauses.length).toBeGreaterThan(0);
      for (const clause of reserve.clauses) {
        const rule = getRuleById(clause.citeAs)!;
        expect(clause).toMatchObject({ text: rule.originalText, force: rule.force, conditions: rule.conditions, exceptions: rule.exceptions });
        expect(clause.procedure).toMatchObject({ select: expect.any(String), measure: expect.any(String), expect: expect.any(String) });
        const ctx = reserve.contexts[clause.context];
        if (typeof ctx.text === "string") expect(ctx.text).toContain(rule.originalText);
        else expect(ctx).toMatchObject({ status: expect.stringMatching(/^(deferred|delivered)$/), next: { tool: "get_ds_rules", arguments: { id: clause.citeAs } } });
        expect(clause).not.toHaveProperty("pendingId");
      }
      const details = await client.callTool({ name: "get_finding_details", arguments: { scanId: data.scanId, maxChars: 100000 } });
      expect(details.isError).toBeFalsy();
      const full = JSON.parse((details.content as Array<{ text: string }>)[0].text);
      expect(full.scanId).toBe(data.scanId);
      expect(full.families.length).toBe(full.totalFamilies);
      expect(full.totalFamilies).toBeGreaterThan(0);
    } finally { await client.close(); }
  });

  it("3.7.4 (D1): contexto entregue num scan volta no seguinte da mesma sessão só como referência", async () => {
    const client = await connect("evaluation");
    try {
      const first = (await scan(client, "/component", 20000)).clauseReserve;
      const shown = Object.entries(first.contexts as Record<string, { text?: string; kind: string }>).filter(([, c]) => typeof c.text === "string" && c.kind === "literal-scope");
      expect(shown.length).toBeGreaterThan(0);
      const data = await scan(client, "/component", 20000);
      // 3.7.5 (R2): as cláusulas que saíram inteiras não se repetem (só a referência); um contexto já entregue que volte
      // com uma cláusula nova vem só pela referência.
      const firstIds = (first.clauses as Array<{ citeAs: string }>).map((c) => c.citeAs);
      expect(data.clauseReserve.alreadyDelivered).toEqual({ count: firstIds.length, in: [expect.stringMatching(/^S-/)] });
      expect((data.clauseReserve.clauses as Array<{ citeAs: string }>).some((c) => firstIds.includes(c.citeAs))).toBe(false);
      for (const [key] of shown) {
        const ctx = data.clauseReserve.contexts?.[key];
        if (!ctx) continue;
        expect(ctx).toMatchObject({ status: "delivered", deliveredIn: expect.stringMatching(/^S-/), next: { tool: "get_ds_rules" } });
        expect(ctx).not.toHaveProperty("text");
      }
      expect(data.clauses).toMatchObject({ complete: expect.any(Boolean) });
      // outra sessão MCP recebe o texto de novo
      const other = await connect("evaluation");
      try {
        const fresh = (await scan(other, "/component", 20000)).clauseReserve;
        expect(fresh.contexts[shown[0][0]].text).toBe(shown[0][1].text);
      } finally { await other.close(); }
    } finally { await client.close(); }
  });

  it("recusa sob teto; retry demonstrado cabe com quota recalculada e fatos antigos recuperáveis", async () => {
    const client = await connect("evaluation");
    try {
      const data = await scan(client, "/component", 1000, true);
      expect(data.kind).toBe("error");
      expect(data).not.toHaveProperty("clauseReserve");
      expect(data.retry.maxChars).toBeGreaterThan(1000);
      const retried = await scan(client, "/component", data.retry.maxChars);
      expect(retried.clauseReserve.targetChars).toBe(Math.ceil(data.retry.maxChars * .2));
      expect(retried.scanId).not.toBe(data.scanId);
      const result = await client.callTool({ name: "get_finding_details", arguments: { scanId: data.scanId, maxChars: 100000 } });
      expect(result.isError).toBeFalsy();
      expect(JSON.parse((result.content as Array<{ text: string }>)[0].text).scanId).toBe(data.scanId);
    } finally { await client.close(); }
  });
});
