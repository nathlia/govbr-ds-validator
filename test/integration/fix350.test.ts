/**
 * 3.5.0 (D-155 + revisão Fable 2026-10-30) — o agente com o oráculo não pode tomar silêncio por cobertura.
 *
 * Fixtures sintéticas e neutras (biblioteca, agenda): nenhum markup, texto, seletor ou id das telas A/B, do
 * fluxo ou dos controles. Cada fixture reproduz o MECANISMO: campo só com placeholder (e os casos que NÃO são
 * defeito), web component do DS com e sem nome no host, título e tabela que nenhum check julga, regra
 * recomendada citada como violada, tabindex positivo antes do salto, botão sem nome visto por axe e estrutura.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { PageScanCache, scanPage, type PageScanResult } from "../../src/scan/pageScan.js";
import { RESPONSE_BUDGET } from "../../src/responses/contract.js";
import { resetKnowledgeLock } from "../../src/data/lock.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { findEmagRule } from "../../src/data/load.js";
import { CHECK_GROUNDING } from "../../src/checkers/grounding.js";
import { FOCUS_INDICATOR_GROUNDING } from "../../src/checkers/focusIndicator.js";
import { PLACEHOLDER_LABEL_CONDITION, PLACEHOLDER_LABEL_GROUNDING, labelSourceOf } from "../../src/checkers/formLabels.js";
import { pageConstraints } from "../../src/checkers/pageStructure.js";
import { EXPECTED_CONDITIONS } from "../../src/schema/structuredClaims.js";
import { checklistRules } from "../../src/tools/componentChecklist.js";

function page(body: string, title = "Acervo da biblioteca", script = ""): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head>
<body><a href="#conteudo">Ir para o conteúdo</a><header class="br-header"><span class="header-title">Biblioteca</span></header><main id="conteudo"><h1>Acervo</h1>${body}</main><footer class="br-footer">fim</footer><script>${script}</script></body></html>`;
}

// <br-input> é tag de componente do DS (catálogo): o rótulo interno vem do que a página passa ao host.
const BR_INPUT = `customElements.define('br-input', class extends HTMLElement { connectedCallback() { const r = this.attachShadow({ mode: 'open' });
  const label = this.getAttribute('label'); r.innerHTML = (label ? '<label for="i">' + label + '</label>' : '') + '<input id="i" placeholder="' + (this.getAttribute('placeholder') || '') + '">'; } });`;
const BR_INPUT_NO_FORWARD = `customElements.define('br-input', class extends HTMLElement { connectedCallback() { const r = this.attachShadow({ mode: 'open' });
  r.innerHTML = '<input id="i" placeholder="' + (this.getAttribute('placeholder') || '') + '">'; } });`;

const PAGES: Record<string, string> = {
  "/campos": page(`
    <input id="so-placeholder" placeholder="Buscar título">
    <textarea id="area-placeholder" placeholder="Observações"></textarea>
    <label for="com-label">Autor</label><input id="com-label" placeholder="Nome do autor">
    <label>Editora <input id="label-envolve" placeholder="Nome da editora"></label>
    <input id="com-aria" aria-label="Ano" placeholder="AAAA">
    <span id="r-isbn">ISBN</span><input id="com-labelledby" aria-labelledby="r-isbn" placeholder="000-0">
    <input id="labelledby-quebrado" aria-labelledby="nao-existe" placeholder="Código">
    <input id="so-title" title="Edição">
    <input id="oculto" placeholder="Oculto" style="display:none">
    <div aria-hidden="true"><input id="ancestral-oculto" placeholder="Fora da árvore"></div>
    <input id="desabilitado" placeholder="Desabilitado" disabled>
    <input id="caixa" type="checkbox" placeholder="x">
    <select id="lista"><option>a</option></select>`),
  "/host-sem-nome": page(`<br-input placeholder="Pesquisar acervo"></br-input>`, "Acervo", BR_INPUT),
  "/host-com-label": page(`<br-input label="Título" placeholder="Pesquisar acervo"></br-input>`, "Acervo", BR_INPUT),
  "/host-nomeado-sem-repasse": page(`<br-input label="Título" placeholder="Pesquisar acervo"></br-input>`, "Acervo", BR_INPUT_NO_FORWARD),
  "/calendario": page(`<label for="d">Data</label><input id="d"><div class="flatpickr-calendar"><input class="numInput" placeholder="ano"></div>`),
  "/tabelas": page(`<table id="sem-titulo"><tr><th>Livro</th></tr><tr><td>a</td></tr></table>
    <table id="com-caption"><caption>Empréstimos</caption><tr><th>Livro</th></tr><tr><td>b</td></tr></table>
    <table id="layout" role="presentation"><tr><td>c</td></tr></table>`, "Biblioteca"),
  "/tabindex": page(`<p>Texto.</p><button type="button" tabindex="2">Ajuda</button>`),
  // C03: ícone (glifo por ::before) ao lado do texto; os casos que NÃO são defeito vêm juntos.
  "/icones": page(`<style>.ico::before { content: "*"; }</style>
    <button type="button" id="exposto"><i class="ico"></i> Salvar</button>
    <button type="button" id="escondido"><i class="ico" aria-hidden="true"></i> Salvar</button>
    <a href="#x" id="invólucro"><span class="icon"><i class="ico" aria-hidden="true"></i></span><span>Início</span></a>
    <button type="button" id="nomeado" aria-label="Salvar rascunho"><i class="ico"></i> Salvar</button>
    <button type="button" id="sem-glifo"><i class="nada"></i> Abrir</button>
    <button type="button" class="br-button circle" id="circular"><i class="ico" aria-hidden="true"></i></button>
    <button type="button" class="br-button circle" id="circular-nomeado" aria-label="Fechar"><i class="ico" aria-hidden="true"></i></button>
    <a href="#y" id="titulo-repete" title="Regulamento">Regulamento</a>
    <a href="#z" id="titulo-acrescenta" title="Abre o PDF de 2 MB">Regulamento</a>`),
  "/revisao": page(`<span id="rotulo-aria" aria-label="Autor"></span><input id="por-aria" aria-labelledby="rotulo-aria" placeholder="Nome">
    <input id="ph-e-title" placeholder="Ano" title="Ano de publicação">
    <style>.ico::before { content: "*"; }</style>
    <div role="link" tabindex="0" id="papel-link"><i class="ico"></i> Catálogo</div>
    <button type="button" id="com-icone"><i class="ico" id="o-icone"></i> Buscar</button>`),
  "/botao-sem-nome": page(`<button class="br-button circle" type="button" id="apagar"><i class="icone-lixo"></i></button>`),
};

let http: Server;
let base = "";
beforeAll(async () => {
  http = createHttpServer((req, res) => {
    const body = PAGES[(req.url ?? "/").split("?")[0]];
    if (!body) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  resetKnowledgeLock();
  await closeBrowser();
  await new Promise((r) => http.close(() => r(undefined)));
});

async function scan(path: string, extra: Record<string, unknown> = {}): Promise<PageScanResult> {
  const out = await scanPage({ url: `${base}${path}`, ...extra }, new PageScanCache(4));
  if (out.status !== "scanned") throw new Error(`não varreu ${path}`);
  return out;
}

async function connect(profile: "full" | "evaluation" | "knowledge-free" = "evaluation") {
  const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "govbr-350-")) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fix350", version: "1" });
  await srv.connect(b);
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    return { text, isError: Boolean(r.isError), data: JSON.parse(text) as Record<string, any> };
  };
  return { client, call };
}

const claim = (path: string, locator: string, rule: { id: string; source: string }, data: Record<string, unknown> = { expectedCondition: PLACEHOLDER_LABEL_CONDITION }) => ({
  id: "F-950",
  rule: { ...rule, description: "rótulo" },
  element: { locator, page: `${base}${path}` },
  evidence: { observed: "campo só com placeholder", expected: "rótulo associado", data },
  severity: "serious" as const, nature: "syntactic" as const, mode: "display" as const, pathway: "heuristic" as const,
});

describe("3.5.0 4a — placeholder no lugar do rótulo (e-MAG 6.2 / DS Formulário)", () => {
  it("acusa só o campo exibido cujo único 'rótulo' é o placeholder; label, aria-label e aria-labelledby resolvido limpam", async () => {
    const r = await scan("/campos", { checks: ["structure"] });
    const flagged = r.findings.filter((f) => f.rule.id === "emag-6.2").map((f) => f.element.locator).sort();
    expect(flagged).toEqual(["#area-placeholder", "#labelledby-quebrado", "#so-placeholder"]);
    const f = r.findings.find((x) => x.element.locator === "#so-placeholder")!;
    expect(f.rule).toMatchObject({ source: "emag", wcag: "3.3.2", implements: PLACEHOLDER_LABEL_GROUNDING.implements });
    expect(f.evidence.data?.expectedCondition).toBe(PLACEHOLDER_LABEL_CONDITION);
    expect(f.evidence.observed).toMatch(/placeholder "Buscar título"/);
    // title sozinho não é achado (WCAG H65): vira pendência
    const pending = r.notJudged?.find((i) => i.code === "field-name-source");
    expect(pending?.examples).toEqual(["#so-title"]);
    expect(pending?.norms).toContain("emag-6.2");
  });

  it("dentro de web component do DS: host sem nome é da página (achado); host nomeado que o componente não repassa é do componente (observação)", async () => {
    const semNome = await scan("/host-sem-nome", { checks: ["structure"] });
    expect(semNome.findings.filter((f) => f.rule.id === "emag-6.2").map((f) => f.element.locator)).toEqual(["#conteudo > br-input >>> #i"]);
    expect(semNome.findings.find((f) => f.rule.id === "emag-6.2")!.evidence.observed).toMatch(/host <br-input> não recebeu label/);
    const comLabel = await scan("/host-com-label", { checks: ["structure"] });
    expect(comLabel.findings.filter((f) => f.rule.id === "emag-6.2")).toEqual([]);
    const semRepasse = await scan("/host-nomeado-sem-repasse", { checks: ["structure"] });
    expect(semRepasse.findings.filter((f) => f.rule.id === "emag-6.2")).toEqual([]);
    const obs = semRepasse.observations.find((o) => (o.data?.rule as { id: string } | undefined)?.id === "emag-6.2");
    expect(obs?.data?.reason).toBe("ds-web-component");
  });

  it("campo de terceiro embutido pelo DS (flatpickr) vira observação, não achado; com components restrito o detector não roda e vira pendência", async () => {
    const r = await scan("/calendario", { checks: ["structure"] });
    expect(r.findings.filter((f) => f.rule.id === "emag-6.2")).toEqual([]);
    expect(r.observations.some((o) => o.data?.reason === "ds-third-party" && (o.data?.rule as { id: string }).id === "emag-6.2")).toBe(true);
    const restrito = await scan("/campos", { checks: ["structure"], components: ["button"] });
    expect(restrito.findings.filter((f) => f.rule.id === "emag-6.2")).toEqual([]);
    expect(restrito.notJudged?.some((i) => i.code === "field-name-source" && i.count === 3)).toBe(true);
  });

  it("labelSourceOf: tipos sem texto, oculto, desabilitado e select não se aplicam", () => {
    const el = (over: Record<string, unknown>) => ({
      locator: "#x", tagName: "input", id: "x", classes: [], inlineStyle: null, computed: {}, focused: {}, outerHTML: "", inShadowDom: false,
      attributes: { type: null, role: null, ariaLabel: null, ariaRequired: null, ariaDisabled: null, ariaDescribedby: null, ariaHidden: null, disabled: false, required: false, htmlFor: null, placeholder: "p", alt: null, tabindex: null, title: null },
      content: { textContent: "", hasVisibleText: false, hasIconOnly: false, labelText: null, labelledbyText: null },
      rendered: true,
      ...over,
    }) as never;
    expect(labelSourceOf(el({})).kind).toBe("placeholder-only");
    expect(labelSourceOf(el({ attributes: { ...(el({}) as any).attributes, type: "submit" } })).kind).toBe("not-applicable");
    expect(labelSourceOf(el({ rendered: false })).kind).toBe("not-applicable");
    expect(labelSourceOf(el({ axHidden: true })).kind).toBe("not-applicable");
    expect(labelSourceOf(el({ tagName: "select" })).kind).toBe("unnamed");
    expect(labelSourceOf(el({ content: { textContent: "", hasVisibleText: false, hasIconOnly: false, labelText: "  ", labelledbyText: "" } })).kind).toBe("placeholder-only");
  });

  it("verify_finding recalcula: confirma o campo só com placeholder, desmente o rotulado, e só decide para as normas do rótulo", async () => {
    const { verifyFinding } = await import("../../src/verify/gate.js");
    const ok = await verifyFinding({ finding: claim("/campos", "#so-placeholder", { id: "emag-6.2", source: "emag" }), live: true });
    expect(ok.verdict).toBe("confirmed");
    expect(ok.predicate).toBe("placeholder-label");
    const kb = await verifyFinding({ finding: claim("/campos", "#so-placeholder", { id: "govbr-3.7.0-pattern-global-aabbc9b63402", source: "govbr-ds-kb" }), live: true });
    expect(kb.verdict).toBe("confirmed");
    const labelled = await verifyFinding({ finding: claim("/campos", "#com-label", { id: "emag-6.2", source: "emag" }), live: true });
    expect(labelled.verdict).toBe("rejected");
    expect(labelled.checks.violation).toBe("contradicted");
    const title = await verifyFinding({ finding: claim("/campos", "#so-title", { id: "emag-6.2", source: "emag" }), live: true });
    expect(title.verdict).toBe("unverifiable");
    expect(title.checks.violation).toBe("undetermined");
    const other = await verifyFinding({ finding: claim("/campos", "#so-placeholder", { id: "emag-4.4", source: "emag" }), live: true });
    expect(other.predicate ?? null).not.toBe("placeholder-label");
  });
});

describe("3.5.0 item 1 / P8 — checksRun.pageLevel: o medido e o que nenhum check julgou", () => {
  it("título, tabela sem título, idioma e regiões viram pendências com a cláusula obrigatória; tabela com caption e de layout não", async () => {
    const r = await scan("/tabelas");
    const codes = (r.notJudged ?? []).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["document-title-adequacy", "table-name", "lang-adequacy", "landmark-adequacy"]));
    const title = r.notJudged!.find((i) => i.code === "document-title-adequacy")!;
    expect(title.observed).toMatch(/"Biblioteca" — igual ao nome do sítio no cabeçalho; não contém o texto do h1/);
    expect(title.norms).toContain("govbr-3.7.0-accessibility-global-9a6edd7d551e");
    expect(getRuleById("govbr-3.7.0-accessibility-global-9a6edd7d551e")?.force).toBe("required");
    const table = r.notJudged!.find((i) => i.code === "table-name")!;
    expect(table.count).toBe(1);
    expect(table.examples).toEqual(["#sem-titulo"]);
    expect(getRuleById(table.norms![0])?.force).toBe("required");
    for (const item of r.notJudged!) expect(item.todo).not.toMatch(/viola|conforme/);
  });

  it("com seletores, título/idioma/regiões não entram (não são do escopo)", async () => {
    const r = await scan("/tabelas", { selectors: ["#sem-titulo"] });
    const codes = (r.notJudged ?? []).map((i) => i.code);
    expect(codes).toEqual(["table-name"]);
  });

  it("no scan_page: pageLevel em checksRun, cabe no teto e, no aperto, fica só como códigos (último recurso); knowledge-free não tem", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("scan_page", { url: `${base}/tabelas`, maxChars: 100_000 });
      expect(r.text.length).toBeLessThanOrEqual(100_000);
      expect(r.data.checksRun.pageLevel.measured).toEqual(expect.arrayContaining(["header/footer", "skip-link", "placeholder-label"]));
      expect(r.data.checksRun.pageLevel.notMeasured.map((i: { code: string }) => i.code)).toContain("table-name");
      const small = await call("scan_page", { url: `${base}/tabelas`, maxChars: 1_500 });
      // A5/3.7.4 (D1): no teto extremo, fatos primeiro — com todos os fatos na página a reserva sai adiada (declarada);
      // sem eles inteiros e sem o piso, a recusa da A5 com lote preservado para leitura exata.
      expect(small.text.length).toBeLessThanOrEqual(1_500);
      if (small.isError) expect(small.data).toMatchObject({ kind: "error", errorCode: "item-too-large", scanId: expect.any(String) });
      else {
        expect(small.data.families.length).toBe(small.data.totalFamilies);
        // 3.7.5 (R2/L3): com as cláusulas já entregues no scan anterior desta sessão, o status é delivered-earlier.
        expect(["deferred-by-facts", "delivered-earlier"]).toContain(small.data.clauseReserve?.status ?? (small.data.clauses?.complete === false ? "deferred-by-facts" : undefined));
        if (small.data.clauseReserve?.status === "delivered-earlier") expect(small.data.clauses).toEqual({ complete: true });
        expect(small.data.checksRun.pageLevel.next ?? small.data.checksRun.pageLevel.full).toBeDefined();
      }
      // revisão (MED): o cabeçalho do ledger leva só códigos + contagem; os itens inteiros paginam como observações.
      const details = await call("get_finding_details", { scanId: r.data.scanId });
      expect(details.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      expect(details.data.ledger.notJudged.codes).toContain("table-name");
      const full = r.data.checksRun.pageLevel.full;
      expect(full).toMatchObject({ tool: "get_finding_details", arguments: { scanId: r.data.scanId, view: "observations" } });
      const obs = await call(full.tool, full.arguments);
      expect(obs.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      const nj = obs.data.observations.filter((o: { kind: string }) => o.kind === "not-judged");
      expect(nj.map((o: { data: { code: string } }) => o.data.code)).toContain("table-name");
      expect(nj.find((o: { data: { code: string } }) => o.data.code === "table-name").data.norms[0]).toMatch(/^govbr-/);
    } finally {
      await client.close();
    }
    const kf = await connect("knowledge-free");
    try {
      const r = await kf.call("scan_page", { url: `${base}/tabelas` });
      expect(r.data.checksRun.pageLevel).toBeUndefined();
      expect(r.text).not.toContain("notJudged");
    } finally {
      await kf.client.close();
    }
  });
});

describe("3.5.0 item 2 — get_component_spec view:checklist", () => {
  it("lista obrigações/proibições do componente com como medir, pagina por cursor sem repetir, e aponta o que o oráculo mede", async () => {
    const { client, call } = await connect();
    try {
      const ids = new Set<string>();
      let r = await call("get_component_spec", { component: "cookiebar", view: "checklist" });
      expect(r.data.kind).toBe("component-checklist");
      const total = r.data.total;
      expect(total).toBe(checklistRules("cookiebar").length);
      for (let i = 0; i < 20; i++) {
        expect(r.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
        for (const item of r.data.items) {
          expect(["required", "prohibited"]).toContain(item.force);
          expect(ids.has(item.citeAs)).toBe(false);
          ids.add(item.citeAs);
          expect(typeof item.measure.automatic).toBe("boolean");
          if (!item.measure.automatic) expect(item.measure.how.length).toBeGreaterThan(10);
        }
        if (r.data.nextCursor === undefined) break;
        r = await call(r.data.next.tool, r.data.next.arguments);
      }
      expect(ids.size).toBe(total);
      const skip = await call("get_component_spec", { component: "skiplink", view: "checklist" });
      const auto = skip.data.items.filter((i: { measure: { automatic: boolean } }) => i.measure.automatic).map((i: { citeAs: string }) => i.citeAs);
      expect(auto).toContain("govbr-3.7.0-accessibility-skiplink-b0641993618f");
      const input = await call("get_component_spec", { component: "input", view: "checklist" });
      expect(input.data.related.items.map((i: { citeAs: string }) => i.citeAs)).toEqual(expect.arrayContaining(["govbr-3.7.0-pattern-global-aabbc9b63402"]));
      const bad = await call("get_component_spec", { component: "input", view: "checklist", include_examples: true });
      expect(bad.isError).toBe(true);
      expect(bad.data.errorCode).toBe("invalid-combination");
      const badCursor = await call("get_component_spec", { component: "input", cursor: 3 });
      expect(badCursor.data.errorCode).toBe("invalid-combination");
      const spec = await call("get_component_spec", { component: "input" });
      expect(spec.data.rules.checklist).toEqual({ tool: "get_component_spec", arguments: { component: "input", view: "checklist" } });
    } finally {
      await client.close();
    }
  });
});

describe("3.5.0 item 3 / P11 — verify_finding avisa quando a regra citada não obriga", () => {
  const body = (id: string) => ({
    finding: {
      id: "F-951",
      rule: { id, source: "govbr-ds-kb", description: "x" },
      element: { locator: "main", page: `${base}/campos` },
      evidence: { observed: "x", expected: "y" },
      severity: "serious", nature: "semantic", mode: "display", pathway: "heuristic",
    },
  });
  it("recomendação → citationForce com a obrigação da mesma recomendação e-MAG; termo aria-* → registro WCAG; obrigação → sem aviso", async () => {
    const { client, call } = await connect();
    try {
      const rec = await call("verify_finding", body("govbr-3.7.0-accessibility-global-1c77d9289315"));
      expect(rec.data.citationForce.force).toBe("recommended");
      expect(rec.data.citationForce.warning).toMatch(/não obriga nem proíbe/);
      expect(rec.data.citationForce.requiredNorms.map((n: { id: string }) => n.id)).toContain("govbr-3.7.0-accessibility-global-25887e6e360f");
      const aria = await call("verify_finding", body("govbr-3.7.0-accessibility-tab-86e80cffa071"));
      expect(aria.data.citationForce.requiredNorms.map((n: { id: string }) => n.id)).toEqual(expect.arrayContaining(["4.1.2", "1.3.1"]));
      const req = await call("verify_finding", body("govbr-3.7.0-accessibility-global-25887e6e360f"));
      expect(req.data.citationForce).toBeUndefined();
    } finally {
      await client.close();
    }
  });
});

describe("3.5.0 P2 — tabindex positivo antes do salto é ds-page-focus-order, e o verify não aceita ds-page-skip-link para ele", () => {
  it("o scan cita a cláusula de 'primeiro a receber o foco'; verify confirma focus-order e deixa skip-link sem decisão (rule-not-applicable)", async () => {
    const r = await scan("/tabindex", { checks: ["page"] });
    expect(r.findings.map((f) => f.rule.checker)).toEqual(["ds-page-focus-order"]);
    const f = r.findings[0];
    const { verifyFinding } = await import("../../src/verify/gate.js");
    const ok = await verifyFinding({ finding: f, live: true });
    expect(ok.verdict).toBe("confirmed");
    const wrong = await verifyFinding({
      finding: { ...f, rule: { id: "ds-page-skip-link", source: "govbr-ds-page", description: "x" }, evidence: { ...f.evidence, data: { region: "skip-link", firstLinkHref: "#conteudo", expectedCondition: EXPECTED_CONDITIONS.skipLink } } },
      live: true,
    });
    expect(wrong.verdict).toBe("unverifiable");
    expect(wrong.issue).toBe("rule-not-applicable");
    expect(wrong.detail).toContain("ds-page-focus-order");
  });
});

describe("3.5.0 P5 — botão só com ícone: e-MAG 1.1 / WCAG 4.1.2, um achado só quando o axe já reprova o mesmo elemento", () => {
  it("sem axe, a estrutura acusa com emag-1.1; com axe, fica só o button-name", async () => {
    const semAxe = await scan("/botao-sem-nome", { checks: ["structure"] });
    const est = semAxe.findings.find((f) => f.element.locator === "#apagar" && f.evidence.data?.hasIconOnly);
    // 3.6.1 (revisão): cita a WCAG 4.1.2; a cláusula do Button (só ícone) fica como contexto.
    expect(est?.rule).toMatchObject({ id: "wcag:4.1.2", source: "wcag", wcag: "4.1.2", implements: ["wcag-4.1.2", "govbr-3.7.0-accessibility-button-6b76377297eb"] });
    const comAxe = await scan("/botao-sem-nome", { checks: ["structure", "axe"] });
    const onButton = comAxe.findings.filter((f) => f.element.locator === "#apagar" && (f.rule.id === "wcag:4.1.2" || f.rule.id === "button-name"));
    expect(onButton.map((f) => f.rule.id)).toEqual(["button-name"]);
  });
});

describe("3.5.0 C03 — ícone decorativo exposto e title que repete o link (auditoria de mensurabilidade)", () => {
  it("acusa só o ícone com glifo, sem aria-hidden, ao lado do texto de um controle nomeado pelo conteúdo; e o title igual ao texto do link", async () => {
    const r = await scan("/icones", { checks: ["structure"] });
    const icon = r.findings.filter((f) => f.rule.id === "govbr-3.7.0-foundation-global-e0e913d352f3").map((f) => f.element.locator);
    expect(icon).toEqual(["#exposto"]);
    const title = r.findings.filter((f) => f.rule.id === "govbr-3.7.0-accessibility-global-3f41d7ddc85a").map((f) => f.element.locator);
    expect(title).toEqual(["#titulo-repete"]);
    const { verifyFinding } = await import("../../src/verify/gate.js");
    const f = r.findings.find((x) => x.element.locator === "#exposto")!;
    expect((await verifyFinding({ finding: f, live: true })).verdict).toBe("confirmed");
    const ok = await verifyFinding({ finding: { ...f, element: { ...f.element, locator: "#escondido" } }, live: true });
    expect(ok.verdict).toBe("rejected");
  });

  it("KB (auditoria §5): o 'rótulo obrigatório' do Button perdeu a exceção do circular — nenhum check novo dispara em botão circular só com ícone", async () => {
    const r = await scan("/icones", { checks: ["structure", "page"] });
    const onCircular = r.findings.filter((f) => /#circular/.test(f.element.locator));
    // o circular SEM nome continua só com o achado de nome acessível (e-MAG 1.1 / 4.1.2); o nomeado, com nada
    expect(onCircular.map((f) => `${f.rule.id}@${f.element.locator}`)).toEqual(["wcag:4.1.2@#circular"]);
    const all = JSON.stringify([CHECK_GROUNDING, FOCUS_INDICATOR_GROUNDING, PLACEHOLDER_LABEL_GROUNDING, pageConstraints().map((c) => c.implements)]);
    expect(all).not.toContain("component-button-7ef75d42ac65");
    const { DECORATIVE_ICON_GROUNDING, LINK_TITLE_GROUNDING } = await import("../../src/checkers/decorativeIcons.js");
    expect(JSON.stringify([DECORATIVE_ICON_GROUNDING, LINK_TITLE_GROUNDING])).not.toContain("7ef75d42ac65");
  });
});

describe("3.5.0 — revisão independente (HIGH/MED/LOW)", () => {
  it("HIGH 1: placeholder × rótulo não é decidido por WCAG 4.1.2/1.3.1 (o placeholder é fonte de nome válida)", async () => {
    const { verifyFinding } = await import("../../src/verify/gate.js");
    for (const id of ["4.1.2", "1.3.1"]) {
      const v = await verifyFinding({ finding: claim("/campos", "#so-placeholder", { id, source: "wcag" }), live: true });
      expect(v.verdict, id).toBe("unverifiable");
      expect(v.detail, id).toMatch(/4\.1\.2\/1\.3\.1 aceitam o placeholder/);
    }
    const ok = await verifyFinding({ finding: claim("/campos", "#so-placeholder", { id: "3.3.2", source: "wcag" }), live: true });
    expect(ok.verdict).toBe("confirmed");
  });

  it("HIGH 2: a cláusula do Button que perdeu a exceção do circular vem com a condição na checklist, na spec e no get_ds_rules", async () => {
    const { client, call } = await connect();
    try {
      let checklist = await call("get_component_spec", { component: "button", view: "checklist" });
      const items: Array<{ citeAs: string; condition?: { legacyId: string; text: string } }> = [];
      for (let i = 0; i < 10; i++) {
        items.push(...checklist.data.items);
        if (checklist.data.nextCursor === undefined) break;
        checklist = await call(checklist.data.next.tool, checklist.data.next.arguments);
      }
      const rotulo = items.find((i) => i.citeAs === "govbr-3.7.0-component-button-7ef75d42ac65");
      expect(rotulo?.condition).toMatchObject({ legacyId: "govbr-3.7.0-component-button-4d7b5f978df1" });
      expect(rotulo?.condition?.text).toMatch(/circular/);
      const byId = await call("get_ds_rules", { id: "govbr-3.7.0-component-button-7ef75d42ac65" });
      expect(JSON.stringify(byId.data.condition)).toMatch(/circular/);
      const listing = await call("get_ds_rules", { component: "button", force: "required", detail: "brief", limit: 50 });
      expect(JSON.stringify(listing.data)).toMatch(/4d7b5f978df1/);
      // as outras cláusulas não ganham condição
      expect(items.filter((i) => i.condition).map((i) => i.citeAs)).toEqual(["govbr-3.7.0-component-button-7ef75d42ac65"]);
    } finally {
      await client.close();
    }
  });

  it("MED: title que repete o link não é decidido pela WCAG 2.4.4; ícone: localizador no ícone fica sem decisão, papel link conta", async () => {
    const { verifyFinding } = await import("../../src/verify/gate.js");
    const r = await scan("/icones", { checks: ["structure"] });
    const t = r.findings.find((f) => f.element.locator === "#titulo-repete")!;
    expect(t.rule.wcag).toBeUndefined();
    const w = await verifyFinding({ finding: { ...t, rule: { id: "2.4.4", source: "wcag", description: "x" } }, live: true });
    expect(w.verdict).toBe("unverifiable");
    const rev = await scan("/revisao", { checks: ["structure"] });
    const icons = rev.findings.filter((f) => f.rule.id === "govbr-3.7.0-foundation-global-e0e913d352f3").map((f) => f.element.locator).sort();
    expect(icons).toEqual(["#com-icone", "#papel-link"]);
    const f = rev.findings.find((x) => x.element.locator === "#com-icone")!;
    const onIcon = await verifyFinding({ finding: { ...f, element: { ...f.element, locator: "#o-icone" } }, live: true });
    expect(onIcon.verdict).toBe("unverifiable");
    expect(onIcon.detail).toMatch(/aponte element\.locator para o botão/);
  });

  it("LOW: aria-labelledby para elemento só com aria-label nomeia; placeholder + title é pendência, não achado; measured com components só o que rodou", async () => {
    const r = await scan("/revisao", { checks: ["structure"] });
    const flagged = r.findings.filter((f) => f.rule.id === "emag-6.2").map((f) => f.element.locator);
    expect(flagged).toEqual([]);
    expect(r.notJudged?.find((i) => i.code === "field-name-source")?.examples).toEqual(["#ph-e-title"]);
    const { pageLevelMeasured } = await import("../../src/scan/notJudged.js");
    expect(pageLevelMeasured(["structure"], true)).toEqual(["component-structure"]);
    expect(pageLevelMeasured(["structure"], false)).toContain("placeholder-label");
  });
});

describe("3.5.0 P2 — o texto de cada cláusula que um check implementa descreve a condição medida", () => {
  // Uma linha por cláusula da base citada em `implements`. Cláusula nova sem linha = teste falha.
  const TABLE: Record<string, RegExp> = {
    "govbr-3.7.0-foundation-global-21b1a2733f7b": /cores pré-definidas/,
    "govbr-3.7.0-development-global-137c50bea6ca": /tokens/,
    "govbr-3.7.0-development-global-406774b1cb87": /Rawline/,
    "govbr-3.7.0-component-global-e30aab6e9a68": /anatomia/i,
    // 3.6.0: tag raiz semântica trocada (e-MAG 1.2) e ordem de tabulação (e-MAG 1.4), as citações novas.
    "govbr-3.7.0-accessibility-global-7c91abad32ce": /Cada elemento HTML deve ser utilizado\s+para o fim que ele foi criado/,
    "govbr-3.7.0-accessibility-global-fb9dfcacbb34": /sequência lógica de leitura para percorrer links/,
    "govbr-3.7.0-template-global-19f93475dc5e": /template base/i,
    // 3.6.1: as áreas obrigatórias do Template Base (unidades literais acrescentadas).
    "govbr-3.7.0-template-global-c21ff1c7eefc": /área essencial e obrigatória no template base.*componente header/,
    "govbr-3.7.0-template-global-79cf9ea963ee": /área essencial do template base onde é utilizado o componente Footer/,
    "govbr-3.7.0-accessibility-global-538e57855252": /primeiro link da página/,
    "govbr-3.7.0-accessibility-skiplink-b0641993618f": /primeiro elemento a receber o foco/,
    "govbr-3.7.0-component-skiplink-02c2e513d936": /primeira coisa que um usuário de teclado/,
    "govbr-3.7.0-accessibility-global-bc492500708d": /recebe o foco.*claramente marcada/,
    "govbr-3.7.0-accessibility-global-25887e6e360f": /etiquetas.*devem estar associadas aos seus campos/s,
    "govbr-3.7.0-pattern-global-aabbc9b63402": /placeholders\*? no lugar de rótulos/,
    "govbr-3.7.0-foundation-global-e0e913d352f3": /decorativos.*aria-hidden/,
    "govbr-3.7.0-accessibility-global-3f41d7ddc85a": /repita o conteúdo do link no atributo title/,
    // 3.6.1 (item 2): título do documento (ds-page-title).
    "govbr-3.7.0-accessibility-global-9a6edd7d551e": /título da página deve ser descritivo e informativo/,
    // 3.6.1 (revisão): contexto do nome acessível de botão só com ícone.
    "govbr-3.7.0-accessibility-button-6b76377297eb": /botões com apenas ícones.*title.*aria-label/,
  };
  const EMAG: Record<string, RegExp> = { "3.3": /título/i, "3.5": /links/i, "1.1": /padrões web/i, "1.4": /tabulação/i, "1.5": /âncoras/i, "4.4": /foco/i, "6.2": /etiquetas/i };
  it("cada id govbr- e emag- dos checks do scan está na tabela e casa com o texto servido", async () => {
    const checks: Array<[string, string[]]> = [
      ...Object.entries(CHECK_GROUNDING).map(([k, g]) => [k, g.implements] as [string, string[]]),
      ["focus-indicator", FOCUS_INDICATOR_GROUNDING.implements],
      ["placeholder-label", PLACEHOLDER_LABEL_GROUNDING.implements],
      ["decorative-icon", (await import("../../src/checkers/decorativeIcons.js")).DECORATIVE_ICON_GROUNDING.implements],
      ["link-title", (await import("../../src/checkers/decorativeIcons.js")).LINK_TITLE_GROUNDING.implements],
      ...pageConstraints().map((c) => [c.id, c.implements] as [string, string[]]),
    ];
    for (const [check, ids] of checks) {
      for (const id of ids) {
        if (id.startsWith("wcag-")) continue; // registro WCAG (conferido em grounding.test)
        if (id.startsWith("emag-")) {
          const n = id.slice(5);
          expect(EMAG[n], `${check}: ${id} sem linha na tabela`).toBeDefined();
          expect(findEmagRule(n)?.title, `${check}: ${id}`).toMatch(EMAG[n]);
          continue;
        }
        expect(TABLE[id], `${check}: ${id} sem linha na tabela`).toBeDefined();
        const rule = getRuleById(id);
        expect(rule, id).toBeDefined();
        expect(rule!.legacy, `${check}: ${id} é id legado`).toBeUndefined();
        expect(rule!.originalText, `${check}: ${id}`).toMatch(TABLE[id]);
      }
    }
  });
});

describe("3.5.0 P1/P7/P9 — instructions do initialize", () => {
  it("evaluation: pendências, pergunte antes de descartar, força da norma e o critério de parada pela checklist", async () => {
    const { client } = await connect();
    try {
      const text = client.getInstructions() ?? "";
      expect(text).toContain("checksRun.pageLevel.notMeasured");
      expect(text).toContain("pergunte uma vez ao get_ds_rules");
      expect(text).toContain("view checklist");
      expect(text).toMatch(/medida, violada ou não se aplica/);
    } finally {
      await client.close();
    }
  });
});
