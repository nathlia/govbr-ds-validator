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
import { filterRules } from "../../src/data/knowledge.js";
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

  it("abre uma pendência por componente do investigate, agregada numa linha; os ids no ledger; deduplica entre scans e rotas", async () => {
    const { client, call } = await connect();
    try {
      const a = await call("scan_page", { url: `${base}/a`, maxChars: 100000 });
      const inv: string[] = [...a.data.investigate.items.map((i: { component: string }) => i.component), ...(a.data.investigate.more?.components ?? [])];
      expect(inv).toEqual(expect.arrayContaining(["button", "tag"]));
      const expected = inv.filter((c) => usageClauseIds(c).length > 0);
      const item = usageOf(a.data)!;
      expect(item).toMatchObject({ code: "usage-unread", count: expected.length });
      expect([...item.examples!].sort()).toEqual([...expected].sort());
      expect(item.pendingId).toMatch(/^P-\d+(?:(?:\.\.|,)P-\d+)*$/);
      // a linha diz onde estão os ids: a observação de leitura do ledger
      const m = /get_finding_details\{scanId:"([^"]+)",view:"observations",cursor:(\d+)\}/.exec(item.todo!)!;
      expect(item.todo).toMatch(/^get_ds_rules\{ids\} por componente/);
      expect(m[1]).toBe(a.data.scanId);
      const obs = await call("get_finding_details", { scanId: m[1], view: "observations", cursor: Number(m[2]) });
      const reads = obs.data.observations[0].data.reads as Array<{ pendingId: string; component: string; calls: Array<{ tool: string; arguments: { ids: string[] } }> }>;
      expect(obs.data.observations[0].data.code).toBe("usage-unread");
      for (const c of expected) {
        const r = reads.find((x) => x.component === c)!;
        expect(r.calls.every((x) => x.tool === "get_ds_rules" && x.arguments.ids.length <= 20)).toBe(true);
        expect(r.calls.flatMap((x) => x.arguments.ids)).toEqual(usageClauseIds(c));
      }
      // é a última pendência da página (os ids das de sempre não mudam por causa dela)
      const nm = a.data.checksRun.pageLevel.notMeasured as Item[];
      expect(nm[nm.length - 1].code).toBe("usage-unread");
      // mesmo estado de novo, e outra rota com o mesmo componente: mesmo id, nenhuma pendência nova
      const again = await call("scan_page", { url: `${base}/a`, maxChars: 100000 });
      expect(usageOf(again.data)!.pendingId).toBe(item.pendingId);
      const b = await call("scan_page", { url: `${base}/b`, maxChars: 100000 });
      const ib = usageOf(b.data)!;
      expect(ib.examples).toEqual(["button"]);
      expect(ib.pendingId).toBe(reads.find((x) => x.component === "button")!.pendingId);
      // tag (de /a) segue aberta noutra rota: aparece no sessionPending de /b, com o componente e onde ler
      const sp = (b.data.sessionPending?.items ?? []).find((i: { code: string }) => i.code === "usage-unread");
      expect(sp).toMatchObject({ components: expect.arrayContaining(["tag"]), next: { tool: "get_finding_details", arguments: { scanId: b.data.scanId, view: "observations" } } });
      expect(sp.components).not.toContain("button");
    } finally { await client.close(); }
  }, 120_000);

  it("pendingResolved não fecha; ids lidos em parte não fecham; todos fecham (só aquele componente); a listagem também fecha", async () => {
    const { client, call } = await connect();
    try {
      await call("scan_page", { url: `${base}/b`, maxChars: 100000 });
      const first = await call("scan_page", { url: `${base}/b`, maxChars: 100000 });
      const id = usageOf(first.data)!.pendingId!;
      // declaração sem leitura: continua aberta, com o motivo
      const declared = await call("scan_page", { url: `${base}/b`, maxChars: 100000, pendingResolved: [{ id, status: "conforme", reason: "li" }] });
      expect(declared.data.pendingResolution).toMatchObject({ usageUnread: [`${id}:button`], usageUnreadNote: expect.stringContaining("não fecha por declaração") });
      expect(declared.data.pendingResolution.resolved ?? []).not.toContain(id);
      expect(usageOf(declared.data)!.pendingId).toBe(id);
      // leitura por ids, faltando uma: ainda aberta
      const ids = usageClauseIds("button");
      expect(ids.length).toBeGreaterThan(1);
      expect((await call("get_ds_rules", { ids: ids.slice(0, -1) })).isError).toBe(false);
      expect(usageOf((await call("scan_page", { url: `${base}/b`, maxChars: 100000 })).data)).toBeDefined();
      // a que faltava: fecha; o scan seguinte não traz mais a linha (só o button estava aberto)
      expect((await call("get_ds_rules", { ids: ids.slice(-1) })).isError).toBe(false);
      const after = await call("scan_page", { url: `${base}/b`, maxChars: 100000 });
      expect(usageOf(after.data)).toBeUndefined();
      // e a rota /a (button já lido) abre só a do tag
      const a = await call("scan_page", { url: `${base}/a`, maxChars: 100000 });
      expect(usageOf(a.data)!.examples).not.toContain("button");
      expect(usageOf(a.data)!.examples).toContain("tag");
      // a listagem do componente pelo cursor também fecha
      await readUsage(call, "tag");
      expect(usageOf((await call("scan_page", { url: `${base}/a`, maxChars: 100000 })).data)?.examples ?? []).not.toContain("tag");
    } finally { await client.close(); }
  }, 120_000);

  it("teto: 8.000 caracteres respeitados e a pendência de leitura não some no piso de ids; knowledge-free não a tem", async () => {
    const { client, call } = await connect();
    try {
      for (const max of [2000, 4000, 8000]) {
        const r = await call("scan_page", { url: `${base}/a`, maxChars: max });
        expect(r.text.length).toBeLessThanOrEqual(max);
        if (r.isError) continue;
        const pl = r.data.checksRun.pageLevel;
        const shown = JSON.stringify(pl);
        expect(shown.includes("usage-unread") || (pl.ids ?? []).some((x: string) => /\.\.|,/.test(x) || /^P-\d+$/.test(x))).toBe(true);
      }
    } finally { await client.close(); }
    resetKnowledgeLock();
    const free = await connect("knowledge-free");
    try {
      const r = await free.call("scan_page", { url: `${base}/a`, maxChars: 100000 });
      expect(r.text).not.toContain("usage-unread");
    } finally { await free.client.close(); resetKnowledgeLock(); }
  }, 120_000);
});
