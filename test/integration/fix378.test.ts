/**
 * 3.7.8, genérico — nenhuma tela, unidade ou spec de referência:
 *   item 4 (leitura dev-374-a2 §5): ordem do investigate — visíveis no estado antes dos ocultos; parte de um hospedeiro
 *     (como no exemplo oficial dele) depois do hospedeiro, fora dos itens;
 *   item 5 + N3: pendência `upload-paths` (erro, arrasto, texto de apoio × cláusulas do Upload que mandam informar);
 *   H1–H3 (teste à mão da 3.7.7): pendingId no ledger (P-NN, O-NN e a observação de origem), pendência de leitura de outra
 *     rota marcada, a condição do verify sobrevive na compactação;
 *   N1: desvio medido em conteúdo oculto vira O-NN com a receita do gatilho (ou "gatilho desconhecido");
 *   N2: o texto da pendência icon-only-embedded separa fato (exemplo oficial, força example) de norma (a cláusula citada).
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
import { knowledgeLockAttempts, resetKnowledgeLock } from "../../src/data/lock.js";
import { scanPage, PageScanCache } from "../../src/scan/pageScan.js";
import { componentPartsOf } from "../../src/data/load.js";
import { investigateFor } from "../../src/responses/scan.js";
import {
  embeddedIconButtonPending,
  observedRequiredItems,
  observedTodo,
  pageLevelMinimal,
  pageLevelNorm,
  pageLevelShort,
  pendingLine,
  pendingLineMinimal,
  pendingLineNorm,
  uploadInformClauses,
  uploadPathsPending,
  UPLOAD_PATHS_TODO,
  STATE_PENDING_MAX,
  type PendingItem,
} from "../../src/scan/notJudged.js";
import type { Observation } from "../../src/schema/finding.js";

const PAGES: Record<string, string> = {
  "/upload": `<div class="br-upload"><label class="upload-label" for="f1"><span>Envio de arquivo</span></label>
    <input class="upload-input" id="f1" type="file" accept=".pdf" aria-describedby="ap"><div class="upload-list"></div></div>
    <p id="ap">Texto de apoio do campo.</p>`,
  "/upload-oculto": `<div id="painel" hidden><div class="br-upload"><label class="upload-label" for="f2"><span>Envio</span></label>
    <input class="upload-input" id="f2" type="file"><div class="upload-list"></div></div><p>Apoio escondido.</p></div>`,
  "/oculto": `<style>.cor{color:#123457}</style>
    <button type="button" id="abre" aria-controls="menu1" aria-expanded="false">Abrir</button>
    <div id="menu1" hidden><p class="cor">Item com cor fora do registro</p></div>
    <button type="button" aria-controls="menu2" aria-expanded="false">Abrir dois</button>
    <div id="menu2" hidden><p class="cor">Outro item com cor fora do registro</p></div>
    <div id="sem-gatilho" style="display:none"><p class="cor">Outro conteúdo oculto</p></div>
    <span class="br-tag">Etiqueta</span>`,
};

// N5: um cabeçalho fora do main (casca) com menu; cinco menus de linha do mesmo padrão; aba; details; diálogo; popup sem
// alvo. O script mostra/esconde o alvo do controle clicado (aria-controls / data-target) e atualiza o ARIA.
const TOGGLE = `<script>document.addEventListener("click",function(e){var b=e.target.closest("[aria-controls],[data-target]");if(!b)return;
var id=(b.getAttribute("aria-controls")||b.getAttribute("data-target")||"").replace("#","");var t=document.getElementById(id);if(!t)return;
t.hidden=!t.hidden;if(b.hasAttribute("aria-expanded"))b.setAttribute("aria-expanded",String(!t.hidden));
if(b.getAttribute("role")==="tab")b.setAttribute("aria-selected","true");});</script>`;
const ZERO = `<script>document.getElementById("menu-btn").setAttribute("aria-controls","menu-zero");document.getElementById("menu-btn").addEventListener("click",function(e){e.stopPropagation();var z=document.getElementById("menu-zero");z.classList.toggle("active");this.setAttribute("aria-expanded",String(z.classList.contains("active")));});</script>`;
const ROWS = Array.from({ length: 5 }, (_, i) => `<tr><td>Linha ${i}</td><td><button type="button" class="acoes" aria-expanded="false" aria-controls="menu-linha-${i}">Ações</button><ul id="menu-linha-${i}" hidden><li>Editar</li></ul></td></tr>`).join("");
const STATES_BODY = `<header><button type="button" id="conta" aria-expanded="false" aria-controls="menu-conta">Conta</button><div id="menu-conta" hidden><a href="/sair">Sair</a></div><button type="button" id="ajuda" aria-expanded="false" aria-controls="menu-ajuda">Ajuda</button><div id="menu-ajuda" hidden><a href="/faq">FAQ</a></div></header>
  <main><h1>Estados</h1><table><tbody>${ROWS}</tbody></table>
  <div role="tablist"><button type="button" role="tab" id="aba-a" aria-selected="true" aria-controls="painel-a">A</button><button type="button" role="tab" id="aba-b" aria-selected="false" aria-controls="painel-b">B</button></div>
  <div id="painel-a">Painel A</div><div id="painel-b" hidden>Painel B <button type="button" id="sub-b" aria-expanded="false" aria-controls="sub-conteudo">Sub</button><div id="sub-conteudo" hidden>Sub conteúdo</div></div>
  <details><summary>Mais detalhes</summary><p>Detalhe</p></details>
  <button type="button" id="abre-dialogo" data-target="#dlg">Abrir diálogo</button><div id="dlg" role="dialog" aria-label="Diálogo" hidden><p>Conteúdo</p></div>
  <button type="button" id="popup" aria-haspopup="menu">Opções</button>
  <style>#menu-zero{height:0} #menu-zero .painel{display:none;position:fixed;top:120px;left:0;width:300px;height:200px;background:#fff} #menu-zero.active .painel{display:block}</style>
  <button type="button" id="menu-btn" aria-expanded="false" data-zero="1">Menu</button><div id="menu-zero"><div class="painel"><a href="/x">Item</a></div></div></main>${TOGGLE}${ZERO}`;

let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end(req.url === "/estados"
    ? `<!doctype html><html lang="pt-BR"><head><title>Estados</title></head><body>${STATES_BODY}</body></html>`
    : `<!doctype html><html lang="pt-BR"><head><title>Página ${req.url}</title></head><body><main><h1>Página ${req.url}</h1>${PAGES[req.url ?? ""] ?? ""}</main></body></html>`,
  ));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix378-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix378", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>)[0].text;
    return { data: JSON.parse(text), text, isError: Boolean(r.isError) };
  };
  return { client, call };
}

/** Todas as observações do ledger de um scan, pelo cursor. */
async function ledger(call: Awaited<ReturnType<typeof connect>>["call"], scanId: string, from = 0) {
  const out: Array<{ n: number; kind: string; note: string; element: { page: string }; data?: Record<string, unknown> }> = [];
  let cursor: number | null | undefined = from;
  for (let k = 0; k < 20 && cursor !== null && cursor !== undefined; k++) {
    const page = await call("get_finding_details", { scanId, view: "observations", cursor });
    expect(page.text.length).toBeLessThanOrEqual(8000);
    out.push(...page.data.observations);
    cursor = page.data.nextCursor;
  }
  return out;
}

describe("3.7.8 item 4 — ordem do investigate", () => {
  const strong = (counts: Record<string, number>) => (c: string) => ({ strong: counts[c] ?? 0, unmeasured: counts[c] ?? 0 });
  const counts = { radio: 44, checkbox: 44, tooltip: 33, select: 29, table: 28, tab: 24, button: 10, upload: 5, card: 3 };
  const dom = ["tab", "button", "card", "select", "radio", "checkbox", "tooltip", "table", "upload"];

  it("sem layout: a ordem de sempre (obrigações sem medida; empate pelo DOM)", () => {
    const inv = investigateFor(dom, "S-1", () => ({}), strong(counts))!;
    expect(inv.items.map((i) => i.component)).toEqual(["radio", "checkbox", "tooltip", "select", "table"]);
    expect("partOf" in inv).toBe(false);
  });

  it("com layout: visíveis primeiro; a parte (radio na lista do select) sai dos itens e vem depois do hospedeiro", () => {
    const layout = {
      tab: { visible: true }, button: { visible: true }, card: { visible: true }, table: { visible: true },
      select: { visible: false }, radio: { visible: false, partOf: "select" }, checkbox: { visible: false },
      tooltip: { visible: false }, upload: { visible: false },
    };
    const inv = investigateFor(dom, "S-1", () => ({}), strong(counts), undefined, new Set(), undefined, layout)!;
    const items = inv.items.map((i) => i.component);
    expect(items).toEqual(["table", "tab", "button", "card", "checkbox"]);
    const all = [...items, ...(inv.more?.components ?? [])];
    expect(all.sort()).toEqual([...dom].sort());
    const more = inv.more!.components;
    expect(more.indexOf("radio")).toBe(more.indexOf("select") + 1);
    expect((inv as { partOf?: Record<string, string> }).partOf).toEqual({ radio: "select" });
    expect(inv.next).toEqual({ tool: "get_component_spec", arguments: { component: "table", view: "checklist" } });
  });

  it("parte de uma parte e parte de hospedeiro ausente: todos listados, nenhum some", () => {
    const layout = { select: { visible: true }, list: { visible: false, partOf: "select" }, item: { visible: false, partOf: "list" }, radio: { visible: false, partOf: "ausente" } };
    const comps = ["select", "list", "item", "radio", "tab", "button", "card", "table", "upload"];
    const inv = investigateFor(comps, "S-1", () => ({}), strong(counts), undefined, new Set(), undefined, layout)!;
    const all = [...inv.items.map((i) => i.component), ...(inv.more?.components ?? [])];
    expect([...all].sort()).toEqual([...comps].sort());
    expect(all.indexOf("item")).toBeGreaterThan(all.indexOf("list"));
  });

  it("componente novo no estado continua primeiro, mesmo sendo parte ou oculto", () => {
    const layout = { select: { visible: true }, radio: { visible: false, partOf: "select" }, tab: { visible: true } };
    const inv = investigateFor(["tab", "select", "radio"], "S-1", () => ({}), strong(counts), undefined, new Set(["radio"]), undefined, layout)!;
    expect(inv.items[0].component).toBe("radio");
  });

  it("partes vêm dos exemplos oficiais da base (o radio e o checkbox no select), nunca de nome fixo", () => {
    const parts = componentPartsOf();
    expect(parts.select).toEqual(expect.arrayContaining(["radio", "checkbox", "list", "item"]));
    for (const [host, list] of Object.entries(parts)) expect(list).not.toContain(host);
  });

  it("no scan real: o componente oculto vai para depois dos visíveis", async () => {
    const r = await scanPage({ url: `${base}/upload-oculto`, checks: ["structure"] }, new PageScanCache(1));
    if (r.status !== "scanned") throw new Error("estado não alcançado");
    expect(r.componentLayout?.upload).toEqual({ visible: false });
  });
});

describe("3.7.8 item 5 + N3 — pendência upload-paths", () => {
  it("um campo de arquivo: erro e arrasto como pendência de elementos, com accept, apoio e as cláusulas de informar", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/upload`, maxChars: 20000 });
      const items = (scan.data.checksRun.pageLevel.notMeasured as Array<PendingItem | string>).filter((i) => typeof i !== "string" && i.code === "upload-paths") as PendingItem[];
      expect(items).toHaveLength(1);
      const u = items[0];
      expect(u.todo).toBe(UPLOAD_PATHS_TODO);
      expect(u.todo.length).toBeLessThanOrEqual(72);
      expect(u.observed).toContain('accept=".pdf"');
      expect(u.observed).toContain('"Texto de apoio do campo."');
      expect(u.measure).toMatch(/drop/);
      expect(u.measure).toMatch(/pendingResolved/);
      // N3: as cláusulas que mandam informar vêm da base (componente upload, obrigatórias, fora de uso/anatomia)
      const inform = uploadInformClauses();
      expect(inform.length).toBeGreaterThan(0);
      expect((u as { inform?: string[] }).inform?.map((l) => l.split(" · ")[0])).toEqual(inform.map((c) => c.id));
      for (const c of inform) expect(u.norms).toContain(c.id);
      // fecha por pendingResolved com reason (o caminho que o measure nomeia)
      const closed = await call("scan_page", { url: `${base}/upload`, pendingResolved: [{ id: u.pendingId, status: "conforme", reason: "enviei .exe: mensagem de erro; drop: aceito" }] });
      expect(closed.data.pendingResolution.resolved).toContain(u.pendingId);
    } finally { await client.close(); }
  });

  it("apoio oculto no estado é dito como oculto, não como ausente; sem campo de arquivo, sem pendência", () => {
    expect(uploadPathsPending([])).toBeNull();
    const hidden = uploadPathsPending([{ locator: "#f", accept: null, support: "#oculto-neste-estado" }])!;
    expect(hidden.observed).toContain("oculto neste estado");
    expect(hidden.observed).toContain("sem accept");
    const none = uploadPathsPending([{ locator: "#f", accept: null, support: null }])!;
    expect(none.observed).toContain("nenhum texto de apoio");
  });

  it("knowledge-free (paridade): a parte de procedimento e o apoio da página, sem id/texto da base nem pendingResolved", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      const scan = await call("scan_page", { url: `${base}/upload`, maxChars: 20000 });
      const u = (scan.data.checksRun.pageLevel.notMeasured as Array<PendingItem | string>).find((i) => typeof i !== "string" && i.code === "upload-paths") as PendingItem & { inform?: unknown };
      expect(u).toBeDefined();
      expect(u.todo).toBe(UPLOAD_PATHS_TODO);
      expect(u.observed).toContain('"Texto de apoio do campo."');
      expect(u.measure).toMatch(/drop/);
      expect(u.measure).not.toMatch(/pendingResolved/);
      expect(u.norms).toEqual(["wcag-3.3.1", "wcag-3.3.2"]);
      expect(u.inform).toBeUndefined();
      expect("rule" in u).toBe(false);
      expect(scan.text).not.toContain("govbr-");
      const ledger = await call("get_finding_details", { scanId: scan.data.scanId, view: "observations" });
      expect(ledger.text).not.toContain("govbr-");
      expect(knowledgeLockAttempts().attempts).toBe(0);
    } finally { await client.close(); }
  });
});

describe("3.7.8 N1 — desvio em conteúdo oculto vira O-NN com o gatilho", () => {
  it("o contêiner com controle declarado ganha a receita; o sem controle, 'gatilho desconhecido'", async () => {
    const r = await scanPage({ url: `${base}/oculto` }, new PageScanCache(1));
    if (r.status !== "scanned") throw new Error("estado não alcançado");
    const hidden = r.observations.filter((o) => (o.data as { hiddenInState?: unknown }).hiddenInState === true);
    expect(hidden.length).toBeGreaterThanOrEqual(2);
    const reveal = Object.fromEntries(hidden.map((o) => [o.element.locator, (o.data as { reveal?: unknown }).reveal]));
    // N5: o gatilho reconhecido como estado recolhido dá a mesma receita (com a chegada dele)
    // revisão MED 3: a receita vai estruturada (ações do scan + o clique + a chegada), nunca JSON montado em texto
    const url = `${base}/oculto`;
    expect(Object.values(reveal)).toEqual(expect.arrayContaining([
      { container: "#menu1", trigger: "#abre", recipe: { tool: "scan_page", arguments: { url, actions: [{ action: "click", selector: "#abre" }], arrival: { visible: "#menu1, #menu1 *" } } } },
      { container: "#menu2", trigger: 'button[aria-controls="menu2"]', recipe: { tool: "scan_page", arguments: { url, actions: [{ action: "click", selector: 'button[aria-controls="menu2"]' }], arrival: { visible: "#menu2, #menu2 *" } } } },
      { container: "#sem-gatilho", trigger: null },
    ]));
    const items = observedRequiredItems(r.observations).filter((i) => i.subject.startsWith("oculto|"));
    expect(items.map((i) => i.subject).sort()).toEqual(["oculto|#menu1", "oculto|#menu2", "oculto|#sem-gatilho"]);
    const withTrigger = items.find((i) => i.subject === "oculto|#menu1")!;
    expect(withTrigger.todo).toContain("click #abre");
    expect((withTrigger as { recipe?: unknown }).recipe).toEqual({ tool: "scan_page", arguments: { url, actions: [{ action: "click", selector: "#abre" }], arrival: { visible: "#menu1, #menu1 *" } } });
    const quoted = items.find((i) => i.subject === "oculto|#menu2") as { recipe?: unknown };
    expect(JSON.parse(JSON.stringify(quoted.recipe))).toEqual(quoted.recipe);
    expect(withTrigger.condition).toBeTruthy();
    expect(withTrigger.elementBound).toBe(true);
    expect(withTrigger.idSpace).toBe("O");
    expect(withTrigger.rule?.force).toMatch(/required|prohibited/);
    const unknown = items.find((i) => i.subject === "oculto|#sem-gatilho")!;
    expect(unknown.todo).toMatch(/gatilho desconhecido/);
  });

  it("na sessão: a O-NN do oculto não fecha por pendingResolved e fecha pela leitura da norma por id depois da entrega", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/oculto`, maxChars: 20000 });
      const o = (scan.data.checksRun.pageLevel.notMeasured as Array<PendingItem | string>).find((i) => typeof i !== "string" && i.code === "observed-required" && i.observed?.includes("#menu1")) as PendingItem;
      expect(o.pendingId).toMatch(/^O-\d+$/);
      const declared = await call("scan_page", { url: `${base}/oculto`, pendingResolved: [{ id: o.pendingId, status: "conforme", reason: "x" }] });
      expect(declared.data.pendingResolution.readOrVerify).toContain(o.pendingId);
      const ids = [o.rule!.id, ...(o.norms ?? [])].filter((id, i, all) => id.startsWith("govbr-") && all.indexOf(id) === i);
      await call("get_ds_rules", { ids, detail: "index" });
      const after = await call("scan_page", { url: `${base}/oculto`, maxChars: 20000 });
      const still = (after.data.checksRun.pageLevel.notMeasured as Array<PendingItem | string>).find((i) => typeof i !== "string" && i.pendingId === o.pendingId) as PendingItem | undefined;
      expect(still?.resolved).toBeDefined();
    } finally { await client.close(); }
  });
});

describe("3.7.8 H1/H2 — pendingId no ledger; leitura de outra rota marcada", () => {
  it("na ordem de duas rotas: a página do next tem as P-NN e O-NN com pendingId; a observação de origem da O-NN também", async () => {
    const { client, call } = await connect();
    try {
      const first = await call("scan_page", { url: `${base}/oculto` });
      expect(first.isError).toBe(false);
      const second = await call("scan_page", { url: `${base}/upload` });
      const pl = second.data.checksRun.pageLevel;
      const next = pl.next ?? pl.full;
      expect(next.tool).toBe("get_finding_details");
      const all = await ledger(call, second.data.scanId);
      const tail = all.filter((o) => o.n > next.arguments.cursor);
      const pending = tail.filter((o) => o.kind === "not-judged" && (o.data as { code?: string }).code !== "usage-unread");
      expect(pending.length).toBeGreaterThan(0);
      for (const o of pending) expect(String(o.data?.pendingId)).toMatch(/^[PO]-\d+$/);
      // H2: leitura aberta só na outra rota → marcada com a rota e o scan de origem, depois das desta rota
      const usage = tail.filter((o) => (o.data as { code?: string }).code === "usage-unread");
      const direct = await scanPage({ url: `${base}/upload` }, new PageScanCache(1));
      if (direct.status !== "scanned") throw new Error("estado não alcançado");
      const here = new Set<string>(direct.coverage.componentsFound ?? []);
      expect(usage.some((o) => !here.has(String(o.data?.component)))).toBe(true);
      const others = usage.filter((o) => !here.has(String(o.data?.component)));
      for (const o of others) {
        expect(o.data?.otherRoute).toBe("/oculto");
        expect(o.data?.fromScan).toBe(first.data.scanId);
        expect(o.element.page).not.toContain("/upload");
      }
      const firstOther = usage.findIndex((o) => o.data?.otherRoute);
      if (firstOther >= 0) expect(usage.slice(firstOther).every((o) => o.data?.otherRoute)).toBe(true);
      // H1 (O-NN): a do 1º scan está no ledger dele, com a observação de origem marcada
      const firstLedger = await ledger(call, first.data.scanId);
      const oItems = firstLedger.filter((o) => (o.data as { code?: string }).code === "observed-required");
      expect(oItems.length).toBeGreaterThan(0);
      for (const oi of oItems) {
        const pid = String(oi.data?.pendingId);
        expect(pid).toMatch(/^O-\d+$/);
        expect(firstLedger.some((o) => o.kind !== "not-judged" && o.data?.pendingId === pid)).toBe(true);
      }
    } finally { await client.close(); }
  });
});

describe("3.7.8 N5 — estados recolhidos não escaneados viram pendência com receita pronta", () => {
  type StateItem = PendingItem & { recipe: { tool: string; arguments: Record<string, unknown> } };
  const stateItems = (d: { checksRun: { pageLevel: { notMeasured: Array<PendingItem | string> } } }) =>
    d.checksRun.pageLevel.notMeasured.filter((i) => typeof i !== "string" && i.code === "state-unscanned") as StateItem[];
  async function ledgerStates(call: Awaited<ReturnType<typeof connect>>["call"], scanId: string) {
    return (await ledger(call, scanId)).filter((o) => o.data?.code === "state-unscanned").map((o) => o.data as unknown as StateItem);
  }

  it("todo padrão tem id e receita (no ledger); a linha mostra 4 abertas + o resto com ids; cada receita roda, chega e fecha", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/estados`;
      const scan = await call("scan_page", { url, maxChars: 60000 });
      const shown = stateItems(scan.data);
      expect(shown).toHaveLength(STATE_PENDING_MAX + 1);
      const aggregate = shown[shown.length - 1];
      expect(aggregate.pendingId).toMatch(/^P-\d+(?:(?:\.\.|,)P-\d+)*$/);
      expect(aggregate.observed).toMatch(/mais \d+ estado\(s\) recolhido\(s\), \d+ aberto\(s\)/);
      // casca primeiro; dois menus DIFERENTES do cabeçalho são dois estados (nunca uma pendência só)
      expect(shown[0].recipe.arguments).toEqual({ url, actions: [{ action: "click", selector: "#conta" }], arrival: { visible: "#menu-conta, #menu-conta *" } });
      expect(shown[1].recipe.arguments.actions).toEqual([{ action: "click", selector: "#ajuda" }]);
      const all = await ledgerStates(call, scan.data.scanId);
      expect(all.length).toBeGreaterThan(STATE_PENDING_MAX);
      for (const s of all) expect(s.pendingId).toMatch(/^P-\d+$/);
      // o padrão repetido (5 menus de linha): um item ×5, dito no texto
      const rows = all.find((i) => i.count === 5)!;
      expect(rows.measure).toMatch(/×5 do mesmo padrão: o scan de uma instância aberta fecha o padrão/);
      for (const s of all) {
        const run = await call("scan_page", { ...s.recipe.arguments });
        expect(run.data.status, `${s.pendingId} ${JSON.stringify(run.data.limitation ?? null)}`).toBe("scanned");
        expect(run.text.length).toBeLessThanOrEqual(8000);
        expect(run.data.statesScanned, s.pendingId).toContain(s.pendingId);
      }
      const after = await ledgerStates(call, (await call("scan_page", { url, maxChars: 60000 })).data.scanId);
      for (const s of after.filter((x) => all.some((y) => y.pendingId === x.pendingId))) expect(s.resolved, s.pendingId).toBe("state-scanned");
    } finally { await client.close(); }
  });

  it("estado profundo: a receita é a do scan que viu o controle + o clique (aba aberta → controle dentro dela)", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/estados`;
      const tab = await call("scan_page", { url, actions: [{ action: "click", selector: "#aba-b" }], arrival: { visible: "#painel-b" }, maxChars: 60000 });
      const all = await ledgerStates(call, tab.data.scanId);
      const sub = all.find((s) => (s.recipe.arguments.actions as Array<{ selector?: string }>).some((a) => a.selector === "#sub-b"))!;
      expect(sub.recipe.arguments.actions).toEqual([{ action: "click", selector: "#aba-b" }, { action: "click", selector: "#sub-b" }]);
      const run = await call("scan_page", { ...sub.recipe.arguments });
      expect(run.data.status).toBe("scanned");
      expect(run.data.statesScanned).toContain(sub.pendingId);
    } finally { await client.close(); }
  });

  it("menu de altura 0 com painel fixo: detector e chegada usam a mesma noção de aparecer", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/estados`;
      const all = await ledgerStates(call, (await call("scan_page", { url, maxChars: 60000 })).data.scanId);
      const zero = all.find((s) => (s.recipe.arguments.actions as Array<{ selector?: string }>).some((a) => a.selector === "#menu-btn"))!;
      expect(zero.recipe.arguments.arrival).toEqual({ visible: "#menu-zero, #menu-zero *" });
      const run = await call("scan_page", { ...zero.recipe.arguments });
      expect(run.data.status, JSON.stringify(run.data.limitation ?? null)).toBe("scanned");
      expect(run.data.statesScanned).toContain(zero.pendingId);
    } finally { await client.close(); }
  });

  it("fechar exige o estado aberto no scan: clicar duas vezes não fecha; 'violada' não fecha; 'não se aplica' com reason fecha", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/estados`;
      const first = stateItems((await call("scan_page", { url, maxChars: 60000 })).data)[0];
      const twice = await call("scan_page", { url, actions: [{ action: "click", selector: "#conta" }, { action: "click", selector: "#conta" }] });
      expect(twice.data.statesScanned).toBeUndefined();
      const violada = await call("scan_page", { url, pendingResolved: [{ id: first.pendingId, status: "violada" }] });
      expect(violada.data.pendingResolution.stateScanOnly).toContain(first.pendingId);
      expect(violada.data.pendingResolution.recordAsFinding).toBeUndefined();
      const noReason = await call("scan_page", { url, pendingResolved: [{ id: first.pendingId, status: "não se aplica" }] });
      expect(noReason.data.pendingResolution.needsReason).toContain(first.pendingId);
      const withReason = await call("scan_page", { url, pendingResolved: [{ id: first.pendingId, status: "não se aplica", reason: "menu só com links de navegação já medidos" }] });
      expect(withReason.data.pendingResolution.resolved).toContain(first.pendingId);
    } finally { await client.close(); }
  });

  it("padrão repetido: abrir uma instância fecha o padrão e as outras não viram pendências novas", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/estados`;
      const all = await ledgerStates(call, (await call("scan_page", { url, maxChars: 60000 })).data.scanId);
      const rows = all.find((i) => i.count === 5)!;
      const run = await call("scan_page", { ...rows.recipe.arguments });
      expect(run.data.statesScanned).toContain(rows.pendingId);
      const after = await ledgerStates(call, run.data.scanId);
      const rowsAfter = after.filter((s) => (s.examples ?? []).some((e) => e.includes("menu-linha")));
      expect(rowsAfter.map((s) => s.pendingId)).toEqual([rows.pendingId]);
      expect(rowsAfter[0].resolved).toBe("state-scanned");
    } finally { await client.close(); }
  });

  it("knowledge-free (paridade): a mesma pendência, receita e fechamento pelo scan do estado; nada da base", async () => {
    const full = await connect();
    const kf = await connect("knowledge-free");
    try {
      const url = `${base}/estados`;
      const a = stateItems((await full.call("scan_page", { url, maxChars: 60000 })).data);
      const scan = await kf.call("scan_page", { url, maxChars: 60000 });
      const b = stateItems(scan.data);
      expect(b.map((i) => [i.count, i.observed, i.recipe])).toEqual(a.map((i) => [i.count, i.observed, i.recipe]));
      expect(scan.text).not.toContain("govbr-");
      for (const i of b) expect(i.subject ?? "").not.toMatch(/br-|\./);
      const run = await kf.call("scan_page", { ...b[0].recipe.arguments });
      expect(run.data.status).toBe("scanned");
      expect(run.data.statesScanned).toContain(b[0].pendingId);
      expect(knowledgeLockAttempts().attempts).toBe(0);
    } finally { await full.client.close(); await kf.client.close(); }
  });
});

describe("3.7.8 H3 — a condição exata do verify sobrevive à compactação", () => {
  const item: PendingItem = {
    code: "observed-required", subject: "k|r", count: 1, examples: ["#t"], observed: "token-font-size-off-scale: font-size 16px",
    todo: observedTodo("font-size-on-ds-scale"), norms: ["govbr-x"], measure: "m", pendingId: "O-01",
  };
  it("curta, mínima e norma levam `expectedCondition <condição>`", () => {
    const short = pendingLine(item);
    expect(short).toContain("expectedCondition font-size-on-ds-scale");
    const minimal = pendingLineMinimal(short);
    expect(minimal).toContain("expectedCondition font-size-on-ds-scale");
    expect(pendingLineNorm(minimal)).toContain("expectedCondition font-size-on-ds-scale");
    const block = pageLevelShort({ notMeasured: [item] });
    expect(JSON.stringify(pageLevelNorm(pageLevelMinimal(block)!))).toContain("font-size-on-ds-scale");
  });
  it("revisão MED 6: o mapa conditions (id da O-NN → condição) sobrevive até a forma de ids e a de códigos", async () => {
    const { pageLevelBlock, pageLevelCodes } = await import("../../src/scan/notJudged.js");
    const { enforceCeiling } = await import("../../src/responses/scan.js");
    const block = pageLevelBlock(["tokens"], [{ ...item, condition: "font-size-on-ds-scale" }]);
    expect(block.conditions).toEqual({ "O-01": "font-size-on-ds-scale" });
    expect(pageLevelShort(block).conditions).toEqual({ "O-01": "font-size-on-ds-scale" });
    expect(pageLevelCodes(pageLevelShort(block)).conditions).toEqual({ "O-01": "font-size-on-ds-scale" });
    const filler = "x".repeat(3000);
    const squeezed = enforceCeiling({ kind: "scan", checksRun: { pageLevel: { ...block, full: { tool: "get_finding_details", arguments: { scanId: "S-1", view: "observations", cursor: 0 } } } }, absenceNote: filler }, 3400, "S-1");
    const pl = (squeezed.checksRun as { pageLevel: { ids?: string[]; conditions?: Record<string, string>; notMeasured?: unknown } }).pageLevel;
    expect(pl.conditions).toEqual({ "O-01": "font-size-on-ds-scale" });
  });

  it("condição longa não é cortada no meio na forma curta", () => {
    const long = { ...item, todo: observedTodo("part-value-matches-spec-token") };
    const short = pendingLine(long);
    expect(short).toContain("expectedCondition part-value-matches-spec-token");
  });
  it("pendência sem condição: mínima e norma como antes", () => {
    const plain: PendingItem = { ...item, todo: "decida o contraste: o axe não concluiu", code: "contrast-incomplete", pendingId: "P-01" };
    expect(pendingLineMinimal(pendingLine(plain))).not.toContain("expectedCondition");
    expect(pendingLineNorm(pendingLine(plain))).toBe(pendingLine(plain).split(" @")[0].split(" · ")[0]);
  });
});

describe("3.7.8 N2 — icon-only-embedded separa fato de norma", () => {
  it("sem 'C01 não acusa' como motivo; exemplo com força example, não norma; decide pela cláusula citada", () => {
    const p = embeddedIconButtonPending([{ locator: "#b", host: "br-input", examples: ["input-buttons"] }])!;
    expect(p.todo).not.toMatch(/não acusa/);
    expect(p.observed).toMatch(/exemplo tem força example, não é norma/);
    expect(p.todo).toMatch(/decida pela cláusula citada/);
    expect(p.todo.length).toBeLessThanOrEqual(72);
    expect(p.measure).toMatch(/não o exemplo/);
    expect(`${p.todo} ${p.observed} ${p.measure}`).not.toMatch(/\bviola(da)?\b/);
  });
});

it("sem observação, sem O-NN", () => {
  const o: Observation[] = [];
  expect(observedRequiredItems(o)).toEqual([]);
});
