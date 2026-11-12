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

// 3.7.11 (auditoria da cadeia B, § 2, opção 1): as cláusulas de uso deixaram de ser pendência (L-NN); H1 (fechar só com ids
// entregues) e M3/M4 (entrada agregada, espaço L-NN) não se aplicam mais. Ficam: H2 (as observações de leitura cabem no teto) e
// a numeração P-NN contígua, agora sem nenhuma entrada de leitura no sessionPending.
const usageLine = (data: { checksRun?: { pageLevel?: { usageClauses?: string } } }) => data.checksRun?.pageLevel?.usageClauses;

describe("revisão H2 — uma observação de leitura por componente, sempre dentro do teto (3.7.11: informativa)", () => {
  it("26 componentes: todas as observações de leitura recuperáveis com maxChars 8000, 2000 e 1500", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/all`, maxChars: 100000 });
      expect(usageOf(s.data)).toBeUndefined();
      const line = usageLine(s.data)!;
      const cursor0 = Number(/cursor:(\d+)/.exec(line)![1]);
      const inv: string[] = [...s.data.investigate.items.map((i: { component: string }) => i.component), ...(s.data.investigate.more?.components ?? [])];
      const expected = inv.filter((c) => usageClauseIds(c).length > 0);
      expect(expected.length).toBeGreaterThanOrEqual(20);
      for (const maxChars of [8000, 2000, 1500]) {
        let cursor: number | undefined = cursor0;
        const seen: string[] = [];
        for (let k = 0; k < 80 && cursor !== undefined; k++) {
          const o = await call("get_finding_details", { scanId: s.data.scanId, view: "observations", cursor, maxChars });
          expect(o.isError, o.text.slice(0, 200)).toBe(false);
          expect(o.text.length).toBeLessThanOrEqual(maxChars);
          for (const x of o.data.observations as Array<{ data?: { code?: string; component?: string } }>) if (x.data?.code === "usage-clauses") seen.push(x.data.component!);
          cursor = o.data.nextCursor ?? undefined;
        }
        expect(seen.sort(), String(maxChars)).toEqual([...expected].sort());
      }
    } finally { await client.close(); }
  }, 180_000);
});

describe("revisão M3/M4 (3.7.11) — nenhuma entrada de leitura no sessionPending; P-NN contíguos", () => {
  it("sessionPending sem leitura; count soma só as pendências; P-NN contíguos entre os scans", async () => {
    const { client, call } = await connect();
    try {
      const x = await call("scan_page", { url: `${base}/x`, maxChars: 100000 });
      const y = await call("scan_page", { url: `${base}/y`, maxChars: 100000 });
      expect(JSON.stringify(y.data.sessionPending ?? {})).not.toMatch(/usage|L-\d/);
      const regular = ((y.data.sessionPending?.items ?? []) as Array<{ code: string; ids: string[] }>);
      if (y.data.sessionPending) expect(y.data.sessionPending.count).toBe(regular.reduce((n, i) => n + i.ids.length + ((i as { more?: number }).more ?? 0), 0) + (y.data.sessionPending.lowSignal ?? 0));
      const pids = [x, y].flatMap((r) => (r.data.checksRun.pageLevel.notMeasured as Item[]).map((i) => i.pendingId!).filter((id) => id.startsWith("P-")));
      const nums = [...new Set(pids)].map((id) => Number(id.slice(2))).sort((a, b) => a - b);
      expect(nums).toEqual(nums.map((_, i) => i + 1));
      expect(usageLine(x.data)).toMatch(/^não é pendência: /);
    } finally { await client.close(); }
  }, 120_000);
});
