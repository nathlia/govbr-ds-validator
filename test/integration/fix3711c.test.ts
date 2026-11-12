/**
 * 3.7.11 (leitura dev-3710-b-01, § 3(d) e § 7 itens 3 e 6), genérico — nenhuma tela:
 *   A (B-18): <button> nativo da página com atributo que o elemento não tem (href) ou conteúdo que não é de fraseado
 *      (p, div, títulos, listas…) vira observação de estrutura (perfil com a base: referência HTML + e-MAG 1.1 como norma
 *      relacionada, força recommended — nunca achado) e pendência `button-html` nos dois perfis (knowledge-free: só o fato e
 *      a referência HTML). Fora: button em shadow DOM de web component, dentro de elemento customizado registrado, `a`,
 *      button conforme, botão circular só com ícone. O verify_finding mede o fato com a condição native-button-valid-html.
 *   B (B-09/B-10): a pendência icon-only-embedded traz a frase literal da exceção que segue a cláusula do rótulo na base
 *      (com o id), a distinção nome acessível × rótulo visível e a nota do exemplo oficial; não afirma violação.
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
import { scanPage, PageScanCache, type PageScanResult } from "../../src/scan/pageScan.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { embeddedIconButtonPending, pageLevelBlock, type PendingItem } from "../../src/scan/notJudged.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { BUTTON_LABEL_EXCEPTION, BUTTON_LABEL_REQUIRED } from "../../src/checkers/iconOnlyButton.js";
import { EMAG_WEB_STANDARDS, NATIVE_BUTTON_CONDITION } from "../../src/checkers/buttonMarkup.js";
import type { Finding } from "../../src/schema/finding.js";

// O cabeçalho é um host com hífen NÃO registrado (como um componente Angular): marcação da página.
// x-wc: web component registrado com shadow root (o button de dentro é do componente);
// x-light: elemento customizado registrado que desenha o próprio button no DOM claro (do componente, fora do escopo).
const PAGE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Botões</title></head><body>
<app-header><div class="menu"><button type="button" id="sair" href="javascript:void(0)" class="br-item"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><p>Sair</p></button></div>
<div class="menu-fechado" hidden><button type="button" id="oculto" href="#"><p>Oculto</p></button></div></app-header>
<main><h1>Botões</h1>
<button type="button" id="ok"><span>Salvar</span> <strong>agora</strong></button>
<button type="button" id="bloco"><div>Enviar</div></button>
<button type="button" id="lista"><ul><li>Um</li></ul></button>
<button type="button" class="br-button circle" id="lupa" aria-label="Buscar"><i class="fas fa-search" aria-hidden="true"></i></button>
<button type="button" id="icone"><svg width="10" height="10"><foreignObject width="10" height="10"><div>x</div></foreignObject></svg> Ir</button>
<a href="/destino" id="link"><div>Destino</div></a>
<x-wc id="wc"></x-wc>
<x-light id="light"></x-light>
</main>
<script>
customElements.define("x-wc", class extends HTMLElement { connectedCallback() { if (!this.shadowRoot) this.attachShadow({ mode: "open" }).innerHTML = '<button type="button" href="#"><p>Interno</p></button>'; } });
customElements.define("x-light", class extends HTMLElement { connectedCallback() { if (!this.firstChild) this.innerHTML = '<button type="button" id="interno-luz" href="#"><p>Luz</p></button>'; } });
</script></body></html>`;

let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((_req, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix3711c-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix3711c", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    const text = (r.content as Array<{ text: string }>)[0].text;
    return { data: JSON.parse(text), text, isError: r.isError === true };
  };
  return { client, call };
}
const buttonItem = (d: { checksRun: { pageLevel: { notMeasured: Array<PendingItem | string> } } }) =>
  d.checksRun.pageLevel.notMeasured.find((i) => typeof i !== "string" && i.code === "button-html") as (PendingItem & { pendingId: string }) | undefined;

describe("3.7.11 A — marcação do <button> nativo que o HTML não admite (B-18)", () => {
  it("a unidade do e-MAG 1.1 da base é o título da recomendação, força recommended (por isso observação, não achado)", () => {
    const r = getRuleById(EMAG_WEB_STANDARDS)!;
    expect(r.force).toBe("recommended");
    expect(r.originalText).toBe("Recomendação 1.1 – Respeitar os Padrões Web");
  });

  it("scan: observação de estrutura em #sair (href + <p>), #bloco (<div>) e #lista (<ul><li>); controles fora (o oculto também)", async () => {
    const r = (await scanPage({ url: base, checks: ["structure"] }, new PageScanCache(1))) as PageScanResult;
    const obs = r.observations.filter((o) => o.kind === "structure-native-button-html");
    expect(obs.map((o) => o.element.locator).sort()).toEqual(["#bloco", "#lista", "#sair"]);
    const sair = obs.find((o) => o.element.locator === "#sair")!;
    expect(sair.data).toMatchObject({ element: "button", invalidAttributes: ["href"], nonPhrasing: ["p"], expectedCondition: NATIVE_BUTTON_CONDITION,
      relatedRule: { id: EMAG_WEB_STANDARDS, force: "recommended", text: "Recomendação 1.1 – Respeitar os Padrões Web" } });
    expect(String((sair.data as { reference: string }).reference)).toMatch(/html\.spec\.whatwg\.org.*#the-button-element/);
    expect((obs.find((o) => o.element.locator === "#lista")!.data as { nonPhrasing: string[] }).nonPhrasing).toEqual(["ul", "li"]);
    // nunca achado: a base não tem cláusula obrigatória sobre isto
    expect(r.findings.some((f) => f.rule.id === EMAG_WEB_STANDARDS)).toBe(false);
    // controles: button conforme, botão circular só com ícone, svg/foreignObject, <a>, web component (shadow) e elemento
    // customizado registrado que desenha o próprio button
    const all = JSON.stringify(obs);
    // o botão oculto neste estado fica para o scan do estado em que aparece
    for (const loc of ["#ok", "#lupa", "#icone", "#link", "interno-luz", ">>>", "#oculto"]) expect(all).not.toContain(loc);
    // não vira O-NN (força recommended)
    expect((r.notJudged ?? []).some((i) => i.code === "observed-required")).toBe(false);
  });

  it("evaluation: pendência button-html com o fato, a norma relacionada e a condição do verify", async () => {
    const { client, call } = await connect("evaluation");
    try {
      const scan = await call("scan_page", { url: base, maxChars: 60000 });
      const item = buttonItem(scan.data)!;
      expect(item).toBeDefined();
      expect(item.count).toBe(3);
      expect(item.examples).toEqual(["#sair", "#bloco"]);
      expect(item.observed).toBe("href; <p> | <div>");
      expect(item.norms).toEqual([EMAG_WEB_STANDARDS]);
      expect(item.rule).toBeUndefined();
      expect(item.todo).toContain(`expectedCondition ${NATIVE_BUTTON_CONDITION}`);
      expect(item.measure).toContain("recommended: não obriga");
      expect(`${item.todo} ${item.observed} ${item.measure}`).not.toMatch(/\bviola(da|ção)?\b/);
      // fecha pelo verify_finding em cada elemento, citando a norma relacionada com a condição
      let last: Record<string, unknown> = {};
      for (const locator of ["#sair", "#bloco", "#lista"]) {
        const v = await call("verify_finding", { live: true, scanId: scan.data.scanId, finding: {
          id: "F-agent", rule: { id: EMAG_WEB_STANDARDS, source: "govbr-ds-kb", description: "e-MAG 1.1" }, element: { locator, page: base },
          evidence: { observed: "marcação", expected: "HTML admitido", data: { expectedCondition: NATIVE_BUTTON_CONDITION } },
          severity: "moderate", nature: "syntactic", mode: "display", pathway: "heuristic" } });
        expect(v.isError).toBe(false);
        expect(v.data.verdict).toBe("confirmed");
        expect(v.data.citationForce).toMatchObject({ citedId: EMAG_WEB_STANDARDS, force: "recommended" });
        last = v.data;
      }
      expect(last.pendingResolved).toContain(item.pendingId);
    } finally { await client.close(); }
  });

  it("knowledge-free: a mesma pendência, só o fato e a referência HTML (nenhum id nem texto da base)", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      const scan = await call("scan_page", { url: base, maxChars: 60000 });
      const item = buttonItem(scan.data)!;
      expect(item).toBeDefined();
      expect(item.count).toBe(3);
      expect(item.norms).toBeUndefined();
      expect(item.measure).toMatch(/html\.spec\.whatwg\.org/);
      expect(JSON.stringify(scan.data.checksRun)).not.toMatch(/govbr-|e-MAG|f12b1bae5784|Padrões Web/);
      expect(scan.data.observations?.byKind?.["structure-native-button-html"]).toBeUndefined();
    } finally { await client.close(); }
  });

  const claim = (locator: string, rule: Finding["rule"] = { id: EMAG_WEB_STANDARDS, source: "govbr-ds-kb", description: "e-MAG 1.1" }): Finding => ({
    id: "F-agent",
    rule,
    element: { locator, page: base },
    evidence: { observed: "button com href e <p>", expected: "só atributos e conteúdo que o HTML admite", data: { expectedCondition: NATIVE_BUTTON_CONDITION } },
    severity: "moderate", nature: "syntactic", mode: "display", pathway: "heuristic",
  } as Finding);

  it("verify_finding: mede o fato — confirma #sair, #bloco e o oculto (a marcação existe); rejeita #ok; fora do escopo não decide; outra norma sem predicado", async () => {
    expect((await verifyFinding({ finding: claim("#sair"), live: true })).verdict).toBe("confirmed");
    expect((await verifyFinding({ finding: claim("#oculto"), live: true })).verdict).toBe("confirmed");
    expect((await verifyFinding({ finding: claim("#bloco"), live: true })).verdict).toBe("confirmed");
    expect((await verifyFinding({ finding: claim("#ok"), live: true })).verdict).toBe("rejected");
    const shadow = await verifyFinding({ finding: claim("#wc >>> button"), live: true });
    expect(shadow.verdict).toBe("unverifiable");
    expect(shadow.checks.violation).toBe("undetermined");
    expect((await verifyFinding({ finding: claim("#interno-luz"), live: true })).checks.violation).toBe("undetermined");
    const emag = await verifyFinding({ finding: claim("#sair", { id: "emag-1.1", source: "emag", description: "e-MAG 1.1" }), live: true });
    expect(emag.predicate).toBe("native-button-html");
    const other = await verifyFinding({ finding: claim("#sair", { id: "wcag:4.1.2", source: "wcag", description: "WCAG 4.1.2" }), live: true });
    expect(other.checks.violation).toBe("no-predicate");
  });
});

describe("3.7.11 B — icon-only-embedded leva a frase da exceção (B-09/B-10)", () => {
  const candidate = [{ locator: "#b", host: "br-input", examples: ["input-buttons"] }];

  it("a frase que segue a cláusula do rótulo na base é a da exceção circular (mesma seção, contígua)", () => {
    const rule = getRuleById(BUTTON_LABEL_REQUIRED)!;
    const exc = getRuleById(BUTTON_LABEL_EXCEPTION)!;
    expect(exc.originalText).toBe("A exceção ocorre na versão tipo circular uma vez que não existe rótulo.");
    expect((exc.source as { section?: string }).section).toBe((rule.source as { section?: string }).section);
    expect(((exc.source as { charRange: number[] }).charRange)[0]).toBe(((rule.source as { charRange: number[] }).charRange)[1] + 1);
  });

  it("a pendência traz, juntos, a frase literal da exceção (id), aria-label × rótulo visível e a nota do exemplo oficial", () => {
    const p = embeddedIconButtonPending(candidate)!;
    expect(p.exception).toEqual({ id: BUTTON_LABEL_EXCEPTION, force: "especificacao", text: "A exceção ocorre na versão tipo circular uma vez que não existe rótulo." });
    expect(p.rule).toMatchObject({ id: BUTTON_LABEL_REQUIRED, text: "O rótulo é um elemento obrigatório." });
    expect(p.measure).toContain("aria-label e title dão nome acessível; não são o rótulo visível de que a cláusula fala");
    expect(p.measure).toContain(BUTTON_LABEL_EXCEPTION);
    expect(p.observed).toMatch(/exemplo tem força example, não é norma/);
    // não afirma violação
    expect(`${p.todo} ${p.observed} ${p.measure} ${p.exception!.text}`).not.toMatch(/\bviola(da|ção)?\b/);
  });

  it("na resposta: o texto da exceção só na 1ª vez do código na sessão (como o da cláusula); depois só id e força", () => {
    const item = { ...embeddedIconButtonPending(candidate)!, pendingId: "P-06" };
    const first = pageLevelBlock(["structure"], [item]).notMeasured[0] as PendingItem;
    expect(first.exception).toMatchObject({ id: BUTTON_LABEL_EXCEPTION, text: expect.stringContaining("circular") });
    const later = pageLevelBlock(["structure"], [item], false, () => false).notMeasured[0] as PendingItem;
    expect(later.exception).toEqual({ id: BUTTON_LABEL_EXCEPTION, force: "especificacao" });
    expect(later.rule).toEqual({ id: BUTTON_LABEL_REQUIRED, force: "required" });
  });
});
