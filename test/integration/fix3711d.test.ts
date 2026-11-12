/**
 * 3.7.11 (auditorias da cadeia, 12/11: tela B e telas A/A2), genérico — nenhuma tela:
 *   1 (conserto A; B-22, A-05): pendência com fato já medido e cláusula obrigatória diz "medido, só decidir"; o verify sem
 *      predicado que a fecha diz que nada foi decidido e devolve o que citar ao registrar.
 *   2 (conserto E; B-15): a O-NN de conteúdo oculto aponta os achados que o scan do estado aberto mediu nos elementos dela.
 *   3 (conserto C; B-24): dialogOpen:true que falha com contêiner de modal visível sem papel de diálogo relata o fato
 *      (observação, sem violação) e a receita com arrival.visible — nos dois perfis (knowledge-free sem id da base).
 *   4 (conserto 1; A-10, U-12): no campo de arquivo, a mensagem de erro (role=alert…) não é lida como apoio; a restrição
 *      medida (accept) vai ao lado do apoio exibido, num mapa que sobrevive à compactação das pendências.
 *   5 (conserto 2; A-10): cláusula que começa por demonstrativo chega com a frase anterior da mesma seção e o id dela.
 *   6 (conserto 3; U-01): o aviso de força da unidade de especificação diz que o fato pode ser relatado com rule: null.
 *   7 (auditoria B § 2): as cláusulas de uso deixam de ser pendência (L-NN); uma linha informativa diz como pedi-las.
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
import { getRuleById } from "../../src/data/knowledge.js";
import { MEASURED_TODO, MEASURED_WHY, pageLevelBlock, pageLevelShort, uploadInformClauses, uploadPathsPending, type PendingItem } from "../../src/scan/notJudged.js";
import { citationForceWarning } from "../../src/responses/verify.js";
import { usageClauseIds } from "../../src/tools/usageClauses.js";
import type { Finding } from "../../src/schema/finding.js";

const TOGGLE = `<script>document.addEventListener("click",function(e){var b=e.target.closest("[aria-controls]");if(!b)return;
var t=document.getElementById(b.getAttribute("aria-controls"));if(!t)return;t.hidden=!t.hidden;b.setAttribute("aria-expanded",String(!t.hidden));});</script>`;
const MODAL = (attrs: string) => `<button type="button" id="abre" onclick="document.getElementById('m').hidden=false">Trocar</button>
<div id="m" hidden><div class="br-modal medium"${attrs}><div class="br-modal-header">Trocar item</div><div class="br-modal-body"><input id="busca" aria-label="Buscar"></div></div></div>`;
const PAGES: Record<string, string> = {
  "/tabela": `<table><tr><th>Nome</th><th>Valor</th></tr><tr><td>A</td><td>1</td></tr></table>`,
  "/oculto": `<style>.cor{color:#123457}</style><button type="button" id="abre" aria-controls="menu1" aria-expanded="false">Abrir</button>
    <div id="menu1" hidden><p class="cor">Item com cor fora do registro</p></div>${TOGGLE}`,
  "/modal": MODAL(""),
  "/modal-ok": MODAL(' role="dialog" aria-modal="true" aria-label="Trocar item"'),
  "/upload-erro": `<div class="campo"><div class="br-upload"><label class="upload-label" for="arq"><span>Envio</span></label>
    <input class="upload-input" id="arq" type="file" accept=".pdf" aria-describedby="apoio retorno"></div>
    <p id="apoio" style="display:none">Um arquivo PDF de até 5 MB.</p><span id="retorno" class="feedback danger" role="alert">O arquivo deve estar em PDF.</span></div>`,
  "/upload-ok": `<div class="campo"><div class="br-upload"><label class="upload-label" for="arq"><span>Envio</span></label>
    <input class="upload-input" id="arq" type="file" accept=".pdf" aria-describedby="apoio"></div>
    <p id="apoio">Um arquivo PDF de até 5 MB.</p></div>`,
  "/componentes": '<button class="br-button" type="button">Comprar</button><span class="br-tag"><span>Novo</span></span>',
};
let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Página ${req.url}</title></head><body><main><h1>Página ${req.url}</h1>${PAGES[req.url ?? ""] ?? ""}</main></body></html>`,
  ));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix3711d-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix3711d", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    const text = (r.content as Array<{ text: string }>)[0].text;
    return { data: JSON.parse(text), text, isError: r.isError === true };
  };
  return { client, call };
}
type Item = PendingItem & { pendingId: string };
const itemsOf = (d: { checksRun?: { pageLevel?: { notMeasured?: Array<Item | string> } } }) =>
  (d.checksRun?.pageLevel?.notMeasured ?? []).filter((i): i is Item => typeof i === "object");
const mk = (rule: Finding["rule"], locator: string, page: string): Finding => ({
  id: "F-agente", rule, element: { locator, page }, evidence: { observed: "medido", expected: "norma" },
  severity: "serious", nature: "syntactic", mode: "display", pathway: "deterministic",
} as Finding);

describe("3.7.11 item 1 — fato já medido: medido, só decidir", () => {
  it("table-name traz a medida feita e a decisão como tarefa; uma pendência sem fato medido (título) não muda", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("scan_page", { url: `${base}/tabela`, maxChars: 100000 });
      const table = itemsOf(r.data).find((i) => i.code === "table-name")!;
      expect(table).toMatchObject({ observed: "medido: sem caption/aria-label/aria-labelledby/title", todo: MEASURED_TODO });
      expect(table.measure).toMatch(/^nada a medir: o fato já foi medido/);
      expect(table.rule?.force).toBe("required");
      // controle: a adequação do título é julgamento, não fato medido
      const title = itemsOf(r.data).find((i) => i.code === "document-title-adequacy")!;
      expect(title.todo).toBe("se descreve o conteúdo principal (axe só exige não vazio)");
      // ledger: o porquê diz que a medida está feita
      const led = await call("get_finding_details", { scanId: r.data.scanId, view: "observations", maxChars: 100000 });
      const obs = (led.data.observations as Array<{ whyNotAFinding: string; data?: { code?: string } }>).filter((o) => o.data?.code);
      expect(obs.find((o) => o.data!.code === "table-name")!.whyNotAFinding).toBe(MEASURED_WHY);
      expect(obs.find((o) => o.data!.code === "document-title-adequacy")!.whyNotAFinding).not.toBe(MEASURED_WHY);
      // a forma curta guarda o "medido" e o começo da tarefa
      const short = pageLevelShort(r.data.checksRun.pageLevel).notMeasured.find((l: string) => l.includes(":table-name:"))!;
      expect(short).toContain("medido: sem caption");
      expect(short).toContain("· medido, só decidir:");
    } finally { await client.close(); }
  }, 120_000);

  it("verify sem predicado não fecha a pendência de fato medido: diz que nada foi decidido e o que citar", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("scan_page", { url: `${base}/tabela`, maxChars: 100000 });
      const table = itemsOf(r.data).find((i) => i.code === "table-name")!;
      const v = await call("verify_finding", { live: true, scanId: r.data.scanId, finding: mk({ id: table.rule!.id, source: "govbr-ds-kb", description: "caption" } as Finding["rule"], table.examples![0], `${base}/tabela`) });
      expect(v.data.verification.verdict).toBe("unverifiable");
      // teste à mão (B-22/A-05): a pendência de fato medido não fecha por verify que não decide — fica só em pendingUndecided
      expect(v.data.pendingResolved).toBeUndefined();
      expect(v.data.pendingUndecided).toEqual([{ id: table.pendingId, code: "table-name", cite: table.rule!.id, norms: expect.arrayContaining(["emag-3.9"]), observed: table.observed }]);
      expect(v.data.pendingUndecidedNote).toMatch(/^Nada foi decidido/);
      // controle: o pendingResolved violada segue devolvendo recordAsFinding com a mesma cláusula
      const c = await connect();
      try {
        const s = await c.call("scan_page", { url: `${base}/tabela`, maxChars: 100000 });
        const id = itemsOf(s.data).find((i) => i.code === "table-name")!.pendingId;
        const d = await c.call("scan_page", { url: `${base}/tabela`, maxChars: 100000, pendingResolved: [{ id, status: "violada" }] });
        expect(d.data.pendingResolution.recordAsFinding[0]).toMatchObject({ id, cite: table.rule!.id });
      } finally { await c.client.close(); }
    } finally { await client.close(); }
  }, 120_000);
});

describe("3.7.11 item 2 — O-NN ligada ao que o scan do estado aberto mediu", () => {
  it("o scan aberto aponta os achados nos elementos da O-NN; o scan que a abriu não aponta nada", async () => {
    const { client, call } = await connect();
    try {
      const closed = await call("scan_page", { url: `${base}/oculto`, maxChars: 100000 });
      const o = itemsOf(closed.data).find((i) => i.code === "observed-required" && /oculto em #menu1/.test(i.observed ?? ""))!;
      expect(o.pendingId).toMatch(/^O-/);
      expect(closed.data.observedMeasured).toBeUndefined();
      const open = await call("scan_page", { url: `${base}/oculto`, maxChars: 100000, actions: [{ action: "click", selector: "#abre" }], arrival: { visible: "#menu1" } });
      expect(open.data.status).toBe("scanned");
      const linked: string[] = open.data.observedMeasured?.[o.pendingId];
      expect(linked?.length).toBeGreaterThan(0);
      expect(linked[0]).toMatch(/^F-\d+ #menu1/);
      expect(open.data.observedMeasuredNote).toMatch(/verify_finding/);
      // o próximo scan (outra rota) mostra a ligação na O-NN aberta
      const other = await call("scan_page", { url: `${base}/tabela`, maxChars: 100000 });
      const sp = (other.data.sessionPending.items as Array<{ code: string; measuredIn?: Record<string, string> }>).find((i) => i.code === "observed-required");
      expect(sp?.measuredIn?.[o.pendingId]).toMatch(new RegExp(`^${open.data.scanId}: F-`));
    } finally { await client.close(); }
  }, 120_000);
});

describe("3.7.11 item 3 — dialogOpen que falha relata a semântica do diálogo", () => {
  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`${profile}: contêiner de modal visível sem papel de diálogo vira observação e receita com arrival.visible`, async () => {
      const { client, call } = await connect(profile);
      try {
        const r = await call("scan_page", { url: `${base}/modal`, actions: [{ action: "click", selector: "#abre" }], arrival: { dialogOpen: true } });
        expect(r.data.status).toBe("state-not-reached");
        expect(r.data.observation).toMatchObject({ kind: "dialog-semantics", whyNotAFinding: expect.stringMatching(/^Medido, não afirmado/) });
        expect(r.data.observation.observed).toContain("div.br-modal");
        expect(r.data.next[0].arguments).toMatchObject({ actions: [{ action: "click", selector: "#abre" }], arrival: { visible: expect.stringContaining("br-modal") } });
        expect(r.data.next[0].what).not.toContain("corrija");
        if (profile === "knowledge-free") {
          expect(r.data.observation.norms).toEqual(["wcag-4.1.2", "wcag-1.3.1"]);
          expect(r.text).not.toContain("govbr-");
        } else expect(r.data.observation.rule.force).toBe("required");
        // a receita sugerida alcança o estado
        const v = await call("scan_page", r.data.next[0].arguments);
        expect(v.data.status).toBe("scanned");
      } finally { await client.close(); }
    }, 120_000);
  }

  it("controles: modal com role=dialog alcança; dialogOpen sem modal nenhum segue com o texto de sempre", async () => {
    const { client, call } = await connect();
    try {
      const ok = await call("scan_page", { url: `${base}/modal-ok`, actions: [{ action: "click", selector: "#abre" }], arrival: { dialogOpen: true }, maxChars: 100000 });
      expect(ok.data.status).toBe("scanned");
      const none = await call("scan_page", { url: `${base}/tabela`, arrival: { dialogOpen: true } });
      expect(none.data.status).toBe("state-not-reached");
      expect(none.data.observation).toBeUndefined();
      expect(none.data.next[0].what).toMatch(/^corrija actions\/arrival/);
    } finally { await client.close(); }
  }, 120_000);
});

describe("3.7.11 item 4 — pendência de upload completa", () => {
  it("unidade: accept × apoio primeiro; o erro exibido é fato próprio; o mapa uploads sobrevive à forma curta", () => {
    const item = uploadPathsPending([{ locator: "#arq", accept: ".pdf", support: "#oculto-neste-estado", error: "O arquivo deve estar em PDF." }])!;
    expect(item.observed).toBe('accept=".pdf" × apoio oculto neste estado (meça onde o campo aparece); erro exibido "O arquivo deve estar em PDF."');
    const block = pageLevelBlock(["structure"], [{ ...item, pendingId: "P-01" }]);
    expect(block.uploads).toEqual({ "P-01": item.uploadFacts });
    expect(pageLevelShort(block as never).uploads).toEqual(block.uploads);
    // controle: sem erro, nada de "erro exibido"
    expect(uploadPathsPending([{ locator: "#arq", accept: null, support: "Um arquivo PDF." }])!.observed).toBe('sem accept × apoio "Um arquivo PDF."');
  });

  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`${profile}: no estado de erro a mensagem (role=alert) não é lida como apoio`, async () => {
      const { client, call } = await connect(profile);
      try {
        const err = await call("scan_page", { url: `${base}/upload-erro`, maxChars: 100000 });
        const up = itemsOf(err.data).find((i) => i.code === "upload-paths")!;
        expect(up.observed).toContain('accept=".pdf" × apoio oculto neste estado');
        expect(up.observed).toContain('erro exibido "O arquivo deve estar em PDF."');
        expect(err.data.checksRun.pageLevel.uploads[up.pendingId]).toContain("erro exibido");
        // controle: sem erro, o apoio visível é o apoio
        const ok = await call("scan_page", { url: `${base}/upload-ok`, maxChars: 100000 });
        const upOk = itemsOf(ok.data).find((i) => i.code === "upload-paths")!;
        expect(upOk.observed).toBe('accept=".pdf" × apoio "Um arquivo PDF de até 5 MB."');
        // no teto padrão o essencial continua na resposta
        const tight = await call("scan_page", { url: `${base}/upload-erro`, maxChars: 3000 });
        if (!tight.isError) expect(JSON.stringify(tight.data.checksRun.pageLevel)).toContain("erro exibido");
      } finally { await client.close(); }
    }, 120_000);
  }
});

describe("3.7.11 item 5 — cláusula com demonstrativo chega com o antecedente e o id dele", () => {
  it("inform e get_ds_rules{ids} levam a frase anterior da mesma seção com o id; cláusula sem demonstrativo no começo não", async () => {
    const drag = uploadInformClauses().find((c) => c.text.startsWith("Esta funcionalidade"))!;
    expect(drag.before).toBeDefined();
    const before = getRuleById(drag.before!.id)!;
    expect(before.source.section).toBe(getRuleById(drag.id)!.source.section);
    expect(drag.before!.text).toMatch(/arrastar/);
    const { client, call } = await connect();
    try {
      const other = uploadInformClauses().find((c) => !/^(Est|Ess|Isso|Isto|Nest|Ness|Dest|Dess|Tal|Aten)/i.test(c.text))!;
      for (const detail of [undefined, "index", "full"] as const) {
        const r = await call("get_ds_rules", { ids: [drag.id, other.id], ...(detail ? { detail } : {}) });
        const results = r.data.results as Array<{ id?: string; citeAs?: string; ruleId?: string; antecedent?: { id: string; text: string } }>;
        const idOf = (x: (typeof results)[number]) => x.citeAs ?? x.id ?? x.ruleId;
        expect(results.find((x) => idOf(x) === drag.id)!.antecedent).toEqual({ id: drag.before!.id, text: drag.before!.text });
        expect(results.find((x) => idOf(x) === other.id)!.antecedent).toBeUndefined();
      }
      const scan = await call("scan_page", { url: `${base}/upload-ok`, maxChars: 100000 });
      const inform = itemsOf(scan.data).find((i) => i.code === "upload-paths")!.inform!;
      expect(inform.find((l) => l.startsWith(drag.id))).toContain(`(antes, ${drag.before!.id}: "`);
    } finally { await client.close(); }
  }, 120_000);
});

describe("3.7.11 item 6 — força da unidade de especificação alinhada à instrução 11", () => {
  it("verify e leitura por id dizem a força e que o fato pode ir como achado com rule: null; recomendação segue igual", async () => {
    const spec = "govbr-3.7.0-component-tab-b717690fd662";
    expect(getRuleById(spec)!.force).toBe("especificacao");
    const w = citationForceWarning(mk({ id: spec, source: "govbr-ds-kb", description: "x" } as Finding["rule"], "#aba", "http://x/"))!;
    expect(w.warning).toContain("rule: null");
    expect(w.warning).not.toMatch(/não como violação|recomendação não atendida/);
    expect(w.next).toContain("rule: null");
    const { client, call } = await connect();
    try {
      const r = await call("get_ds_rules", { id: spec });
      expect(r.data.forceNote).toBe(w.warning);
      // controle: unidade normativa não leva a nota
      expect((await call("get_ds_rules", { id: "govbr-3.7.0-accessibility-global-5817ddd685a6" })).data.forceNote).toBeUndefined();
    } finally { await client.close(); }
  }, 60_000);
});

describe("3.7.11 item 7 — cláusulas de uso fora da lista de pendências", () => {
  it("nenhuma L-NN; uma linha informativa com a chamada; as chamadas no ledger sem pendingId; nada volta no scan seguinte", async () => {
    const { client, call } = await connect();
    try {
      const a = await call("scan_page", { url: `${base}/componentes`, maxChars: 100000 });
      expect(a.text).not.toContain("usage-unread");
      expect(a.text).not.toMatch(/"L-\d\d/);
      const line: string = a.data.checksRun.pageLevel.usageClauses;
      expect(line).toMatch(/^não é pendência: /);
      expect(line).toContain("button");
      const m = /get_finding_details\{scanId:"([^"]+)",view:"observations",cursor:(\d+)\}/.exec(line)!;
      expect(m[1]).toBe(a.data.scanId);
      const led = await call("get_finding_details", { scanId: m[1], view: "observations", cursor: Number(m[2]), maxChars: 100000 });
      const reads = (led.data.observations as Array<{ data: { code: string; component: string; pendingId?: string; calls: Array<{ arguments: { ids: string[] } }> } }>).filter((o) => o.data?.code === "usage-clauses");
      expect(reads.find((r) => r.data.component === "button")!.data.calls.flatMap((c) => c.arguments.ids)).toEqual(usageClauseIds("button"));
      expect(reads.every((r) => r.data.pendingId === undefined)).toBe(true);
      const again = await call("scan_page", { url: `${base}/tabela`, maxChars: 100000 });
      expect(JSON.stringify(again.data.sessionPending ?? {})).not.toMatch(/usage|L-\d/);
      // controle: as demais pendências continuam com id
      expect(itemsOf(again.data).every((i) => /^[PO]-\d+/.test(i.pendingId))).toBe(true);
      // knowledge-free: nada disso (é conteúdo da base)
      const kf = await connect("knowledge-free");
      try {
        const k = await kf.call("scan_page", { url: `${base}/componentes`, maxChars: 100000 });
        expect(k.text).not.toContain("usageClauses");
      } finally { await kf.client.close(); }
    } finally { await client.close(); }
  }, 120_000);
});
