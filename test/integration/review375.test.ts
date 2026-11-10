/**
 * 3.7.5 — revisão independente de dev-3.7.5 (844b43c..31604b1): H1 a pendência de leitura só fecha com ids ENTREGUES
 * (não ecoados), H2 uma observação de leitura por pendência (≤ teto), M3 uma entrada agregada no sessionPending, M4 espaço
 * de ids próprio (L-NN). Sondas de origem: .tmp-eval/rev375/p4–p6, p8, p10.
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
import { usageClauseIds } from "../../src/tools/usageClauses.js";

const MANY = ["breadcrumb", "card", "switch", "menu", "radio", "table", "checkbox", "modal", "divider", "tooltip", "wizard", "button", "carousel",
  "cookiebar", "message", "tag", "accordion", "skiplink", "upload", "footer", "input", "notification", "step", "datetimepicker", "item", "magicbutton"];
const markup = (comps: string[]) => comps.map((c) => (c === "button" ? '<button class="br-button" type="button">Ok</button>' : `<div class="br-${c}"><span>${c}</span></div>`)).join("\n");
const PAGES: Record<string, string> = {
  "/x": markup(["radio", "input", "item", "breadcrumb"]),
  "/y": markup(["button"]),
  "/all": markup(MANY),
};
let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end(
    `<!doctype html><html lang="pt-BR"><head><title>Rev ${req.url}</title></head><body><main><h1>Rev ${req.url}</h1>${PAGES[req.url ?? ""] ?? ""}</main></body></html>`,
  ));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect() {
  const server = createServer({ toolProfile: "evaluation", knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "rev-375-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "rev-375", version: "1" }); await client.connect(a);
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
const openComponents = async (call: Awaited<ReturnType<typeof connect>>["call"], path: string) =>
  usageOf((await call("scan_page", { url: `${base}${path}`, maxChars: 100000 })).data)?.examples ?? [];

describe("revisão H1 — fecha só com ids entregues em itens de cláusula", () => {
  it("lote paginado: os ids ecoados no next não contam; query que ecoa ids não conta; a especificação (anatomia/listas) não conta", async () => {
    const { client, call } = await connect();
    try {
      expect(await openComponents(call, "/x")).toEqual(expect.arrayContaining(["radio", "input", "item", "breadcrumb"]));
      // lote em cartões que não cabe numa resposta: volta só uma parte, e o next ecoa todos os ids
      const ids = [...usageClauseIds("radio"), ...usageClauseIds("input"), ...usageClauseIds("item")];
      const batch = await call("get_ds_rules", { ids });
      const returned = (batch.data.results as Array<{ citeAs?: string; id?: string }>).map((r) => r.citeAs ?? r.id);
      expect(returned.length).toBeLessThan(ids.length);
      expect(batch.data.page.cursor).toBeTruthy();
      const notReturned = ids.filter((id) => !returned.includes(id));
      expect(notReturned.every((id) => batch.text.includes(id))).toBe(true);
      // query com os ids (ecoados em ambiguity/next), nenhum resultado com eles
      const breadcrumb = usageClauseIds("breadcrumb");
      await call("get_ds_rules", { query: breadcrumb.join(" ") });
      // a especificação do componente cita ids em listas de referência (anatomia, regras agrupadas)
      const spec = await call("get_component_spec", { component: "breadcrumb" });
      expect(breadcrumb.some((id) => spec.text.includes(id))).toBe(true);
      const open = await openComponents(call, "/x");
      const stillOpen = (c: string) => open.includes(c);
      // o que não foi entregue segue aberto
      for (const c of ["input", "item"]) if (usageClauseIds(c).some((id) => notReturned.includes(id))) expect(stillOpen(c), c).toBe(true);
      expect(stillOpen("breadcrumb")).toBe(true);
      // o componente cujos ids vieram todos nos resultados fechou
      if (usageClauseIds("radio").every((id) => returned.includes(id))) expect(stillOpen("radio")).toBe(false);
    } finally { await client.close(); }
  }, 120_000);
});

describe("revisão H2 — uma observação de leitura por pendência, sempre dentro do teto", () => {
  it("26 componentes: todas as observações de leitura recuperáveis com maxChars 8000, 2000 e 1500", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/all`, maxChars: 100000 });
      const item = usageOf(s.data)!;
      expect(item.count).toBeGreaterThanOrEqual(20);
      const cursor0 = Number(/cursor:(\d+)/.exec(item.todo!)![1]);
      for (const maxChars of [8000, 2000, 1500]) {
        let cursor: number | undefined = cursor0;
        const seen: string[] = [];
        for (let k = 0; k < 80 && cursor !== undefined; k++) {
          const o = await call("get_finding_details", { scanId: s.data.scanId, view: "observations", cursor, maxChars });
          expect(o.isError, o.text.slice(0, 200)).toBe(false);
          expect(o.text.length).toBeLessThanOrEqual(maxChars);
          for (const x of o.data.observations as Array<{ data?: { code?: string; pendingId?: string } }>) if (x.data?.code === "usage-unread") seen.push(x.data.pendingId!);
          cursor = o.data.nextCursor ?? undefined;
        }
        expect(seen.length, String(maxChars)).toBe(item.count);
      }
    } finally { await client.close(); }
  }, 180_000);
});

describe("revisão M3/M4 — uma entrada no sessionPending; ids L-NN não deslocam os P-NN", () => {
  it("sessionPending agrega as de leitura de outras rotas numa entrada; count conta uma; P-NN contíguos", async () => {
    const { client, call } = await connect();
    try {
      const x = await call("scan_page", { url: `${base}/x`, maxChars: 100000 });
      const y = await call("scan_page", { url: `${base}/y`, maxChars: 100000 });
      const usage = (y.data.sessionPending.items as Array<{ code: string; ids: string[]; components: string[]; next?: unknown }>).filter((i) => i.code === "usage-unread");
      expect(usage).toHaveLength(1);
      expect(usage[0].ids).toHaveLength(1);
      expect(usage[0].ids[0]).toMatch(/^L-\d+(?:(?:\.\.|,)L-\d+)*$/);
      expect(usage[0].components).toEqual(expect.arrayContaining(["radio", "input", "item", "breadcrumb"]));
      expect(usage[0].next).toMatchObject({ tool: "get_finding_details", arguments: { scanId: y.data.scanId, view: "observations" } });
      const regular = (y.data.sessionPending.items as Array<{ code: string; ids: string[] }>).filter((i) => i.code !== "usage-unread");
      expect(y.data.sessionPending.count).toBe(regular.reduce((n, i) => n + i.ids.length + ((i as { more?: number }).more ?? 0), 0) + (y.data.sessionPending.lowSignal ?? 0) + 1);
      // os ids de pendência P-NN seguem a numeração de sempre: contíguos entre os scans
      const pids = [x, y].flatMap((r) => (r.data.checksRun.pageLevel.notMeasured as Item[]).map((i) => i.pendingId!).filter((id) => id.startsWith("P-")));
      const nums = [...new Set(pids)].map((id) => Number(id.slice(2))).sort((a, b) => a - b);
      expect(nums).toEqual(nums.map((_, i) => i + 1));
      expect((x.data.checksRun.pageLevel.notMeasured as Item[]).find((i) => i.code === "usage-unread")!.pendingId).toMatch(/^L-01/);
    } finally { await client.close(); }
  }, 120_000);
});
