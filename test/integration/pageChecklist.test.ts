import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { pageChecklistRules } from "../../src/tools/pageChecklist.js";
import type { ToolTelemetryEvent } from "../../src/telemetry.js";

let client: Client;
const events: ToolTelemetryEvent[] = [];
beforeAll(async () => {
  const server = createServer({ toolProfile: "evaluation", reportsDir: mkdtempSync(join(tmpdir(), "page-checklist-")), telemetry: { onEvent: (e) => events.push(e) } });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  client = new Client({ name: "page-checklist-test", version: "1" });
  await client.connect(a);
});
afterAll(async () => client.close());

async function call(args: Record<string, unknown>) {
  const before = events.length;
  const result = await client.callTool({ name: "get_page_rules", arguments: args });
  const text = (result.content as Array<{ text: string }>)[0].text;
  expect(events.length - before).toBe(1);
  expect(text.length).toBeLessThanOrEqual(8000);
  return { error: Boolean(result.isError), data: JSON.parse(text) };
}

describe("get_page_rules — checklist global MCP", () => {
  it("percorre todas as cláusulas pelo próximo passo publicado sem perder ou duplicar", async () => {
    let args: Record<string, unknown> | undefined = { view: "checklist" };
    const ids: string[] = [];
    let pages = 0;
    while (args) {
      const { error, data } = await call(args);
      expect(error).toBe(false);
      expect(data.kind).toBe("page-checklist");
      expect(data.note).toMatch(/não registra pendingId/);
      expect(data.count).toBeGreaterThan(0);
      ids.push(...data.items.map((i: { citeAs: string }) => i.citeAs));
      args = data.next?.arguments;
      expect(++pages).toBeLessThan(100);
    }
    expect(ids).toEqual(pageChecklistRules().map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mantém índice e categoria, mas recusa cursor de checklist em outra consulta", async () => {
    expect((await call({})).data.kind).toBe("page-rules-index");
    expect((await call({ category: "grid" })).data.kind).toBe("page-rules");
    const { data } = await call({ view: "checklist" });
    expect((await call({ category: "grid", cursor: data.page.cursor })).data.errorCode).toBe("stale-cursor");
  });

  it("recusa combinações, tipo/enum, campos desconhecidos e cursores inválidos com próximo passo", async () => {
    for (const [args, code] of [
      [{ view: "checklist", category: "grid" }, "invalid-combination"],
      [{ cursor: "c1.0.0000000000" }, "invalid-combination"],
      [{ view: "checklist", cursor: "invalid" }, "stale-cursor"],
      [{ view: "unknown" }, "invalid-argument"],
      [{ view: "checklist", cursor: 1 }, "invalid-argument"],
      [{ view: "checklist", unknown: true }, "unknown-parameter"],
    ] as const) {
      const { error, data } = await call(args);
      expect(error, JSON.stringify(args)).toBe(true);
      expect(data.errorCode, JSON.stringify(args)).toBe(code);
      expect(data.next.length).toBeGreaterThan(0);
    }
  });

  it("knowledge-free não publica nem carrega o checklist ao recusar a chamada", async () => {
    const lockedEvents: ToolTelemetryEvent[] = [];
    const server = createServer({ toolProfile: "knowledge-free", knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "page-checklist-kf-")), telemetry: { onEvent: (e) => lockedEvents.push(e) } });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    const locked = new Client({ name: "page-checklist-kf", version: "1" });
    await locked.connect(a);
    try {
      expect((await locked.listTools()).tools.some((t) => t.name === "get_page_rules")).toBe(false);
      const result = await locked.callTool({ name: "get_page_rules", arguments: { view: "checklist" } });
      expect(result.isError).toBe(true);
      expect(lockedEvents).toHaveLength(1);
      expect(lockedEvents[0].knowledgeLockAttempts).toBe(0);
    } finally { await locked.close(); }
  });
});
