/**
 * 3.7.5 (item 6): pendência de LEITURA das cláusulas de uso/juízo (`usage-unread`) — uma por componente do DS encontrado,
 * agregada numa linha, fechada só quando a leitura passa pelo servidor; pendingResolved não a fecha; nada é julgado.
 */
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
import { filterRules, getRuleById } from "../../src/data/knowledge.js";
import { usageClauseIds, usageListingCall, USAGE_FORCES, USAGE_SUBCATEGORY } from "../../src/tools/usageClauses.js";

const PAGES: Record<string, string> = {
  "/a": '<button class="br-button" type="button">Comprar</button><span class="br-tag"><span>Novo</span></span>',
  "/b": '<button class="br-button" type="button">Voltar</button>',
};
let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end(
    `<!doctype html><html lang="pt-BR"><head><title>Loja ${req.url}</title></head><body><main><h1>Loja ${req.url}</h1>${PAGES[req.url ?? ""] ?? ""}</main></body></html>`,
  ));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "usage-375-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "usage-375", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>)[0].text;
    return { data: JSON.parse(text), text, isError: Boolean(r.isError) };
  };
  return { client, call };
}
type Item = { code: string; pendingId?: string; count?: number; examples?: string[]; todo?: string };
const usageOf = (data: { checksRun?: { pageLevel?: { notMeasured?: Array<Item | string> } } }) =>
  (data.checksRun?.pageLevel?.notMeasured ?? []).find((i): i is Item => typeof i === "object" && i.code === "usage-unread");
/** Lê a listagem que a pendência indica, pelo cursor, até `pages` páginas (todas por padrão). */
async function readUsage(call: Awaited<ReturnType<typeof connect>>["call"], component: string, pages = 99) {
  const first = usageListingCall(component);
  let args: Record<string, unknown> = first.arguments;
  const ids = new Set<string>();
  for (let i = 0; i < pages; i++) {
    const r = await call(first.tool, args);
    expect(r.isError).toBe(false);
    for (const it of r.data.items ?? []) ids.add(it.id);
    if (!r.data.page?.cursor) break;
    args = { ...first.arguments, cursor: r.data.page.cursor };
  }
  return ids;
}

describe("3.7.5 item 6 — usage-unread", () => {
  it("a listagem indicada devolve todas as cláusulas de uso de todo componente que as tem (o conjunto que fecha a pendência)", async () => {
    const { client, call } = await connect();
    try {
      const components = [...new Set(filterRules({ category: "component" }).filter((r) => USAGE_SUBCATEGORY.test(r.subcategory ?? "") && USAGE_FORCES.has(r.force)).map((r) => r.component as string))];
      expect(components.length).toBeGreaterThan(20);
      // só as que obrigam, proíbem ou desaconselham (pre.2)
      for (const c of components) for (const id of usageClauseIds(c)) expect(USAGE_FORCES.has(filterRules({ component: c, category: "component" }).find((r) => r.id === id)!.force)).toBe(true);
      for (const component of components) {
        const read = await readUsage(call, component);
        const missing = usageClauseIds(component).filter((id) => !read.has(id));
        expect(missing, component).toEqual([]);
      }
    } finally { await client.close(); }
  }, 120_000);

  // 3.7.11 (auditoria da cadeia B, § 2, opção 1): as cláusulas de uso deixaram de ser pendência (L-NN). Os testes abaixo
  // passam a conferir o contrato novo: uma linha informativa por scan, as chamadas no ledger, nada na sessão.
  it("3.7.11: linha informativa com os componentes desta página e as chamadas no ledger; nada vira pendência nem volta noutra rota", async () => {
    const { client, call } = await connect();
    try {
      const a = await call("scan_page", { url: `${base}/a`, maxChars: 100000 });
      const inv: string[] = [...a.data.investigate.items.map((i: { component: string }) => i.component), ...(a.data.investigate.more?.components ?? [])];
      expect(inv).toEqual(expect.arrayContaining(["button", "tag"]));
      const expected = inv.filter((c) => usageClauseIds(c).length > 0);
      expect(usageOf(a.data)).toBeUndefined();
      const line: string = a.data.checksRun.pageLevel.usageClauses;
      for (const c of expected) expect(line).toContain(c);
      const m = /get_finding_details\{scanId:"([^"]+)",view:"observations",cursor:(\d+)\}/.exec(line)!;
      expect(m[1]).toBe(a.data.scanId);
      const obs = await call("get_finding_details", { scanId: m[1], view: "observations", cursor: Number(m[2]) });
      const reads = (obs.data.observations as Array<{ data: { code: string; pendingId?: string; component: string; calls: Array<{ tool: string; arguments: { ids: string[] } }> } }>)
        .filter((o) => o.data?.code === "usage-clauses").map((o) => o.data);
      expect(reads.length).toBe(expected.length);
      for (const c of expected) {
        const r = reads.find((x) => x.component === c)!;
        expect(r.pendingId).toBeUndefined();
        expect(r.calls.every((x) => x.tool === "get_ds_rules" && x.arguments.ids.length <= 20 && (x.arguments as { detail?: string }).detail === "index")).toBe(true);
        expect(r.calls.flatMap((x) => x.arguments.ids)).toEqual(usageClauseIds(c));
      }
      // outra rota: só os componentes dela; nada da /a no sessionPending
      const b = await call("scan_page", { url: `${base}/b`, maxChars: 100000 });
      expect(b.data.checksRun.pageLevel.usageClauses).toContain("button");
      expect(b.data.checksRun.pageLevel.usageClauses).not.toContain("tag");
      expect(JSON.stringify(b.data.sessionPending ?? {})).not.toMatch(/usage|L-\d/);
    } finally { await client.close(); }
  }, 120_000);

  it("3.7.11: não há L-NN — pendingResolved com L-01 é id desconhecido; ler as cláusulas não muda a linha (informativa)", async () => {
    const { client, call } = await connect();
    try {
      await call("scan_page", { url: `${base}/b`, maxChars: 100000 });
      const declared = await call("scan_page", { url: `${base}/b`, maxChars: 100000, pendingResolved: [{ id: "L-01", status: "conforme", reason: "li" }] });
      expect(declared.data.pendingResolution).toMatchObject({ unknown: ["L-01"] });
      expect((await call("get_ds_rules", { ids: usageClauseIds("button") })).isError).toBe(false);
      const after = await call("scan_page", { url: `${base}/b`, maxChars: 100000 });
      expect(after.data.checksRun.pageLevel.usageClauses).toContain("button");
    } finally { await client.close(); }
  }, 120_000);

  it("teto: 8.000 caracteres respeitados; knowledge-free não tem a linha", async () => {
    const { client, call } = await connect();
    try {
      for (const max of [2000, 4000, 8000]) {
        const r = await call("scan_page", { url: `${base}/a`, maxChars: max });
        expect(r.text.length).toBeLessThanOrEqual(max);
        expect(r.text).not.toContain("usage-unread");
      }
    } finally { await client.close(); }
    resetKnowledgeLock();
    const free = await connect("knowledge-free");
    try {
      const r = await free.call("scan_page", { url: `${base}/a`, maxChars: 100000 });
      expect(r.text).not.toContain("usage-unread");
      expect(r.text).not.toContain("usageClauses");
    } finally { await free.client.close(); resetKnowledgeLock(); }
  }, 120_000);
});

describe("3.7.5-pre.3 — get_ds_rules{ids, detail:\"index\"}: a frase da cláusula, a força e o componente", () => {
  const LONG = "govbr-3.7.0-accessibility-global-0e9cecc8b4d7";
  it("forma, força, frase inteira (ou cortada com marca acima de 300); cartões sem detail iguais; as chamadas da linha informativa rodam", async () => {
    const { client, call } = await connect();
    try {
      const ids = usageClauseIds("radio");
      const index = await call("get_ds_rules", { ids, detail: "index" });
      expect(index.isError).toBe(false);
      expect(index.data).toMatchObject({ kind: "lookup", status: "found", detail: "index", requested: ids.length, missing: [] });
      expect(index.data.results.map((r: { id: string }) => r.id)).toEqual(ids);
      for (const r of index.data.results as Array<Record<string, unknown>>) {
        const rule = getRuleById(r.id as string)!;
        expect(r).toMatchObject({ force: rule.force, component: "radio", text: rule.normalizedRule.trim() });
        expect(r).not.toHaveProperty("textComplete");
        expect(r).not.toHaveProperty("title");
      }
      expect(index.text.length).toBeLessThan(3000);
      // frase longa: cortada em palavra, com "…" e textComplete:false
      const long = (await call("get_ds_rules", { ids: [LONG], detail: "index" })).data.results[0];
      expect(getRuleById(LONG)!.normalizedRule.length).toBeGreaterThan(300);
      expect(long.text.length).toBeLessThanOrEqual(300);
      expect(long.text.endsWith("…")).toBe(true);
      expect(long.textComplete).toBe(false);
      expect(getRuleById(LONG)!.normalizedRule.startsWith(long.text.slice(0, -1).trimEnd())).toBe(true);
      // sem detail: os cartões de sempre
      const cards = await call("get_ds_rules", { ids });
      expect(cards.data.detail).toBe("brief");
      expect(cards.data.results[0]).not.toHaveProperty("text");
      expect(cards.text.length).toBeGreaterThan(index.text.length * 2);
    } finally { await client.close(); }
    // 3.7.11: as chamadas da observação de leitura (linha informativa) rodam em detail:"index"
    const s = await connect();
    try {
      const first = await s.call("scan_page", { url: `${base}/b`, maxChars: 100000 });
      const m = /cursor:(\d+)/.exec(first.data.checksRun.pageLevel.usageClauses)!;
      const obs = await s.call("get_finding_details", { scanId: first.data.scanId, view: "observations", cursor: Number(m[1]) });
      expect(obs.data.observations[0].data.component).toBe("button");
      for (const x of obs.data.observations[0].data.calls) {
        expect(x.arguments.detail).toBe("index");
        expect((await s.call(x.tool, x.arguments)).isError).toBe(false);
      }
    } finally { await s.client.close(); }
  }, 120_000);
});
