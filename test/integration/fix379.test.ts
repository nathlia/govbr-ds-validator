/**
 * 3.7.9 (teste à mão da 3.7.8), genérico — nenhuma tela:
 *   D1: na forma de ids (teto apertado) o estado recolhido e o campo de arquivo guardam código e 1º seletor, com a frase da
 *       receita no next; o mesmo em sessionPending.ids; no ledger, estados recolhidos e campos de arquivo vêm primeiro;
 *   D2: estado já visto aberto na rota (o inicial inclusive) não vira pendência nova — nasce fechado;
 *   D3: o scan parcial (checks a menos que o do scan que abriu a pendência) não fecha: diz o que falta.
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
import { pageLevelIdsStep } from "../../src/responses/scan.js";
import { idLabelOf, pageLevelCodes, pageLevelMinimal, pageLevelNorm, pageLevelShort, STATE_IDS_NOTE, type PendingItem } from "../../src/scan/notJudged.js";
import { sessionPendingCodes } from "../../src/scan/session.js";

const TOGGLE = `<script>document.addEventListener("click",function(e){var b=e.target.closest("[aria-controls]");if(!b)return;
if(b.getAttribute("role")==="tab"){document.querySelectorAll("[role=tab]").forEach(function(t){t.setAttribute("aria-selected","false");document.getElementById(t.getAttribute("aria-controls")).hidden=true;});
b.setAttribute("aria-selected","true");document.getElementById(b.getAttribute("aria-controls")).hidden=false;return;}
var t=document.getElementById(b.getAttribute("aria-controls"));t.hidden=!t.hidden;b.setAttribute("aria-expanded",String(!t.hidden));});</script>`;
const BODY = `<header><button type="button" id="conta" aria-expanded="false" aria-controls="menu-conta">Conta</button><div id="menu-conta" hidden><a href="/sair">Sair</a></div></header>
<main><h1>Abas</h1><div role="tablist"><button type="button" role="tab" id="aba-a" aria-selected="true" aria-controls="painel-a">A</button>
<button type="button" role="tab" id="aba-b" aria-selected="false" aria-controls="painel-b">B</button></div>
<div id="painel-a"><p>Painel A</p></div><div id="painel-b" hidden><p>Painel B</p></div></main>${TOGGLE}`;

// D4: o mesmo menu e as mesmas abas, com um diálogo modal aberto por cima (com véu fixo) e um acordeão dentro dele.
const MODAL_BODY = `${BODY}
<div style="position:fixed;inset:0;background:rgba(0,0,0,.5)"></div>
<div role="dialog" aria-modal="true" aria-label="Diálogo" style="position:fixed;top:100px;left:100px;width:400px;height:300px;background:#fff">
<button type="button" id="dlg-mais" aria-expanded="false" aria-controls="dlg-conteudo">Mais</button><div id="dlg-conteudo" hidden><p>Mais conteúdo</p></div></div>`;
// D4: sem diálogo, um controle coberto no centro por outro elemento (não descendente nem ancestral).
const COVERED_BODY = `<main><h1>Coberto</h1>
<button type="button" id="livre" aria-expanded="false" aria-controls="c-livre">Livre</button><div id="c-livre" hidden><p>x</p></div>
<button type="button" id="coberto" aria-expanded="false" aria-controls="c-coberto" style="position:absolute;top:300px;left:20px;width:120px;height:40px">Coberto</button><div id="c-coberto" hidden><p>y</p></div>
<div style="position:absolute;top:290px;left:0;width:300px;height:80px;background:#eee"></div></main>${TOGGLE}`;

let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end(
    `<!doctype html><html lang="pt-BR"><head><title>Abas</title></head><body>${req.url === "/modal" ? MODAL_BODY : req.url === "/coberto" ? COVERED_BODY : BODY}</body></html>`,
  ));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix379-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix379", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>)[0].text;
    return { data: JSON.parse(text), text };
  };
  return { client, call };
}
const states = (d: { checksRun: { pageLevel: { notMeasured: Array<PendingItem | string> } } }) =>
  d.checksRun.pageLevel.notMeasured.filter((i) => typeof i !== "string" && i.code === "state-unscanned") as Array<PendingItem & { recipe: { arguments: Record<string, unknown> } }>;

describe("3.7.9 D1 — o estado recolhido não some na forma de ids", () => {
  it("ids com código e 1º seletor curto; seletor longo fica só com o código; frase da receita", () => {
    expect(idLabelOf("P-18:state-unscanned:1@#gatilho")).toBe("P-18:state-unscanned@#gatilho");
    expect(idLabelOf("P-06:upload-paths:1⇒wcag-3.3.1@#campo")).toBe("P-06:upload-paths@#campo");
    expect(idLabelOf("P-07:state-unscanned:1@#main > form > div:nth-of-type(3) > div > button")).toBe("P-07:state-unscanned");
    expect(idLabelOf("P-01:document-title-adequacy⇒wcag-2.4.2")).toBe("P-01");
    const items: PendingItem[] = [
      { code: "state-unscanned", subject: "s", count: 1, examples: ["#gatilho"], observed: "aria-expanded=false; arrival visible #m, #m * (casca)", todo: "escaneie o estado aberto: recipe (click no @ + arrival); feche assim", measure: "m", pendingId: "P-18" },
      { code: "document-title-adequacy", subject: "t", observed: "x", todo: "se descreve o conteúdo", measure: "m", pendingId: "P-01" },
    ];
    const norm = pageLevelNorm(pageLevelMinimal(pageLevelShort({ notMeasured: items }))!)!;
    const codes = pageLevelCodes({ ...norm, full: { tool: "get_finding_details", arguments: { scanId: "S-1", view: "observations", cursor: 0 } } });
    expect(codes.notMeasured[0]).toBe("P-18:state-unscanned@#gatilho");
    const out = pageLevelIdsStep({ checksRun: { pageLevel: codes } })!;
    const pl = (out.checksRun as { pageLevel: { ids?: string[]; idsNote?: string } }).pageLevel;
    expect(pl.ids?.[0]).toBe("P-18:state-unscanned@#gatilho");
    expect(pl.idsNote).toBe(STATE_IDS_NOTE);
  });

  it("sessionPending.ids leva o seletor depois do código", () => {
    const codes = sessionPendingCodes({ items: [{ code: "state-unscanned", ids: ["P-07@#gatilho"] }, { code: "table-name", ids: ["P-02"] }], count: 2 });
    expect(codes.ids).toEqual(["P-07:state-unscanned@#gatilho", "P-02:table-name"]);
  });

  it("no ledger (a página do next), os estados recolhidos vêm antes das pendências de adequação", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: base, maxChars: 60000 });
      const cursor = scan.data.checksRun.pageLevel.full.arguments.cursor;
      const page = await call("get_finding_details", { scanId: scan.data.scanId, view: "observations", cursor });
      expect(page.data.observations[0].data.code).toBe("state-unscanned");
    } finally { await client.close(); }
  });
});

describe("3.7.9 D2 — estado já escaneado na rota não vira pendência nova", () => {
  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`a aba inicial (aberta no 1º scan) nasce fechada no estado da outra aba (${profile})`, async () => {
      const { client, call } = await connect(profile);
      try {
        await call("scan_page", { url: base, maxChars: 60000 });
        const other = await call("scan_page", { url: base, actions: [{ action: "click", selector: "#aba-b" }], arrival: { visible: "#painel-b" }, maxChars: 60000 });
        const back = states(other.data).find((i) => (i.recipe.arguments.actions as Array<{ selector?: string }>).some((a) => a.selector === "#aba-a"));
        expect(back).toBeDefined();
        expect(back!.resolved).toBe("state-scanned");
      } finally { await client.close(); }
    });
  }
});

describe("3.7.9 D3 — scan parcial não fecha a pendência de estado", () => {
  it("checks a menos que o scan que abriu: statesIncomplete com o que falta; a receita inteira fecha", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: base, maxChars: 60000 });
      const conta = states(scan.data).find((i) => (i.recipe.arguments.actions as Array<{ selector?: string }>).some((a) => a.selector === "#conta"))!;
      const partial = await call("scan_page", { ...conta.recipe.arguments, checks: ["page"] });
      expect(partial.data.statesScanned).toBeUndefined();
      expect(partial.data.statesIncomplete).toEqual([{ id: conta.pendingId, missing: ["tokens", "structure", "axe"] }]);
      const full = await call("scan_page", { ...conta.recipe.arguments });
      expect(full.data.statesScanned).toContain(conta.pendingId);
    } finally { await client.close(); }
  });
});

describe("3.7.9 D4 — atrás de um diálogo modal ou coberto, o controle não vira estado a escanear", () => {
  const selectorsOf = (items: Array<{ recipe: { arguments: Record<string, unknown> } }>) =>
    items.map((i) => (i.recipe.arguments.actions as Array<{ selector?: string }>).at(-1)?.selector);
  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`com o modal aberto, só os controles dentro dele; a receita chega (${profile})`, async () => {
      const { client, call } = await connect(profile);
      try {
        const scan = await call("scan_page", { url: `${base}/modal`, maxChars: 60000 });
        const items = states(scan.data);
        expect(selectorsOf(items)).toEqual(["#dlg-mais"]);
        const run = await call("scan_page", { ...items[0].recipe.arguments });
        expect(run.data.status).toBe("scanned");
        expect(run.data.statesScanned).toContain(items[0].pendingId);
      } finally { await client.close(); }
    });
  }

  it("controle coberto no centro por outro elemento não ganha receita; o livre sim", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/coberto`, maxChars: 60000 });
      expect(selectorsOf(states(scan.data))).toEqual(["#livre"]);
    } finally { await client.close(); }
  });
});
