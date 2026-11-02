/**
 * 3.7.0 (D-155/D-159; decisão da autora de 2026-11-01). Fixtures sintéticas e neutras (uma loja de ferragens de bairro):
 * nenhum markup, texto, seletor ou id das telas A/B, do fluxo ou dos controles.
 *   1. C01 — `br-button` só com ícone fora da variante circular: acusa só onde a letra do Button + a exceção perdida dizem
 *      (o circular, o com rótulo visível, o que não é br-button, o oculto/decorativo e o botão que é parte do Input/Tag do
 *      DS ficam de fora); o texto do achado traz a exceção; o rule.id resolve; o verify_finding o decide.
 *   2. O scan EMPURRA no investigate as cláusulas mensuráveis que nenhum check julga, por mensurabilidade, com o
 *      procedimento; no aperto da 1ª página elas descem em degraus marcados e nunca tiram família nem somem.
 *   3. A lista de verificação vem ordenada por mensurabilidade, cada cláusula com procedimento; a do rótulo do Button traz
 *      a exceção como procedimento DO ORÁCULO (proveniência dita), não como letra da base.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { resetKnowledgeLock } from "../../src/data/lock.js";
import { getComponentSpecs } from "../../src/data/load.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { oracleMeasuresFor } from "../../src/tools/oracleCoverage.js";
import * as checklist from "../../src/tools/componentChecklist.js";
import {
  BUTTON_LABEL_REQUIRED,
  ICON_ONLY_BUTTON_CONDITION,
  checkIconOnlyButtons,
  embeddedIconButtonHosts,
  iconOnlyNonCircleButton,
} from "../../src/checkers/iconOnlyButton.js";
import { resetFindingIds, type Finding } from "../../src/schema/finding.js";
import { makeElement } from "../helpers/fixtures.js";

const SVG = `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16"></rect></svg>`;
const SR_ONLY = ".sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}";

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>${SR_ONLY}</style></head>
<body><a href="#conteudo">Ir para o conteúdo</a><header class="br-header"><span class="header-title">Ferragens</span></header>
<main id="conteudo">${body}</main><footer class="br-footer">fim</footer></body></html>`;
}

const PAGES: Record<string, string> = {
  "/ferragens/acoes": page(
    "Ações — Ferragens",
    `<h1>Pedido 12</h1>
     <button id="imprimir" class="br-button" type="button" aria-label="Imprimir">${SVG}</button>
     <button id="excluir" class="br-button secondary" type="button">${SVG}<span class="sr-only">Excluir</span></button>
     <a id="ajuda" class="br-button" href="/ferragens/ajuda" aria-label="Ajuda"><img alt="" width="16" height="16" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'/%3E"></a>
     <button id="fechar" class="br-button circle" type="button" aria-label="Fechar">${SVG}</button>
     <button id="salvar" class="br-button primary" type="button">${SVG} Salvar</button>
     <button id="menu" type="button" aria-label="Menu">${SVG}</button>
     <button id="escondido" class="br-button" type="button" aria-label="Copiar" hidden>${SVG}</button>
     <button id="enfeite" class="br-button" type="button" aria-hidden="true" tabindex="-1">${SVG}</button>
     <div class="br-input"><label for="busca">Buscar peça</label><input id="busca" type="text"><button id="lupa" class="br-button" type="button" aria-label="Buscar">${SVG}</button></div>
     <div class="br-card"><div class="card-content">Parafuso</div><button id="favoritar" class="br-button" type="button" aria-label="Favoritar">${SVG}</button></div>
     <button id="contents" class="br-button" type="button">${SVG}<span style="display:contents">Salvar</span></button>
     <button id="semnome" class="br-button" type="button">${SVG}</button>
     <button id="imgalt" class="br-button" type="button"><img alt="Imprimir" width="16" height="16" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'/%3E"></button>
     <button id="faspan" class="br-button" type="button" aria-label="Copiar"><span class="fas fa-copy" style="display:inline-block;width:16px;height:16px"></span></button>
     <div class="br-input"><div class="br-list"><button id="lista" class="br-button" type="button" aria-label="Abrir lista">${SVG}</button></div></div>`,
  ),
  // 3.7.0 (revisão da reexecução, lacuna B): hosts <br-button> de um web component com a API do @govbr-ds/webcomponents
  // (icon, label, circle, texto no slot), desenhado aqui por um elemento próprio — o pacote não está no repositório.
  "/ferragens/componentes": page(
    "Componentes — Ferragens",
    `<h1>Pedido 14</h1>
     <br-button id="wc-icone" icon="print" title="Imprimir"></br-button>
     <br-button id="wc-circulo" icon="print" circle title="Imprimir"></br-button>
     <br-button id="wc-slot" icon="print">Imprimir</br-button>
     <br-button id="wc-label" icon="print" label="Imprimir"></br-button>
     <div class="br-input"><label for="peca">Peça</label><input id="peca" type="text"><br-button id="wc-input" icon="search" title="Buscar"></br-button></div>
     <script>
       customElements.define("br-button", class extends HTMLElement {
         connectedCallback() {
           const root = this.attachShadow({ mode: "open" });
           const label = this.getAttribute("label");
           const circle = this.hasAttribute("circle");
           const icon = this.getAttribute("icon");
           root.innerHTML = '<button class="br-button' + (circle ? " circle" : "") + '" type="button" title="' + (this.getAttribute("title") || "") + '">' +
             (icon ? '<i class="fas fa-' + icon + '" style="display:inline-block;width:16px;height:16px"></i>' : "") + (label ? "<span>" + label + "</span>" : "") + "<slot></slot></button>";
         }
       });
     </script>`,
  ),
  // 3.7.0 (lacuna A): 12 componentes do DS numa página, poucos achados — o investigate tem de levar cláusula no teto padrão.
  "/ferragens/painel": page(
    "Painel — Ferragens",
    `<h1>Painel</h1>
     <nav class="br-breadcrumb" aria-label="Trilha"><ol class="crumb-list"><li class="crumb"><a href="/">Início</a></li></ol></nav>
     <div class="br-message info" role="status"><div class="content">Estoque atualizado.</div></div>
     <div class="br-card"><div class="card-content">Parafusos</div></div>
     <div class="br-input"><label for="q">Buscar</label><input id="q" type="text"></div>
     <div class="br-checkbox"><input id="c1" type="checkbox"><label for="c1">Avisar</label></div>
     <div class="br-radio"><input id="r1" type="radio" name="r"><label for="r1">Retirar</label></div>
     <div class="br-select"><div class="br-input"><label for="s1">Loja</label><input id="s1" type="text"></div></div>
     <div class="br-tab"><nav class="tab-nav"><ul><li class="tab-item"><button type="button">Itens</button></li></ul></nav></div>
     <div class="br-list" role="list"><div class="br-item" role="listitem">Porca</div></div>
     <span class="br-tag">Novo</span>
     <div class="br-table"><table><caption>Peças</caption><thead><tr><th scope="col">Peça</th></tr></thead><tbody><tr><td>Arruela</td></tr></tbody></table></div>
     <button class="br-button primary" type="button">Salvar</button>`,
  ),
  "/ferragens/conforme": page(
    "Conforme — Ferragens",
    `<h1>Pedido 13</h1>
     <button id="fechar2" class="br-button circle small" type="button" aria-label="Fechar">${SVG}</button>
     <button id="enviar" class="br-button primary" type="button">Enviar</button>
     <a id="voltar" class="br-button secondary" href="/ferragens/acoes">${SVG} Voltar</a>`,
  ),
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
afterEach(() => resetKnowledgeLock());

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "govbr-370-")) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fix370", version: "1" });
  await srv.connect(b);
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    return { text, isError: Boolean(r.isError), data: JSON.parse(text) as Record<string, any> };
  };
  return { client, call };
}

/** Todos os achados de um scan (a 1ª página pode não trazer todos os membros): pelo ledger, com scanId. */
async function allFindings(call: Awaited<ReturnType<typeof connect>>["call"], scanId: string): Promise<Array<Record<string, any>>> {
  const out: Array<Record<string, any>> = [];
  let cursor: number | undefined = 0;
  while (cursor !== undefined) {
    const r = await call("get_finding_details", { scanId, view: "findings", detail: "full", cursor, maxChars: 60_000 });
    out.push(...((r.data.findings ?? []) as Array<Record<string, any>>));
    cursor = r.data.nextCursor as number | undefined;
  }
  return out;
}

// ── 1. C01 ───────────────────────────────────────────────────────────────────────────────────────

describe("3.7.0 item 1 — C01: br-button só com ícone fora da variante circular", () => {
  beforeEach(() => resetFindingIds());

  it("evidência pura: só o br-button só com ícone, exibido, exposto, sem circle e fora de componente hospedeiro", () => {
    const icon = (o: Parameters<typeof makeElement>[0] = {}) =>
      makeElement({ ...o, content: { textContent: "", hasVisibleText: false, hasIconOnly: true, iconOnlyVisual: true, ...(o.content ?? {}) } });
    expect(iconOnlyNonCircleButton(icon())).toBe(true);
    expect(iconOnlyNonCircleButton(icon({ classes: ["br-button", "circle"] }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ classes: ["br-button", "is-circle"] }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ content: { textContent: "Salvar", hasVisibleText: true, hasIconOnly: false, iconOnlyVisual: false } }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ classes: ["botao"] }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ tagName: "span" }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ rendered: false }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ axHidden: true }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ attributes: { role: "presentation" } as never }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ hostComponents: ["br-input"] }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ hostComponents: ["br-list", "br-input"] }))).toBe(false);
    expect(iconOnlyNonCircleButton(icon({ hostComponents: ["br-card"] }))).toBe(true);
    expect(iconOnlyNonCircleButton(icon({ content: { textContent: "", hasVisibleText: false, hasIconOnly: true, iconOnlyVisual: true, circleAttribute: true } }))).toBe(false);
    // sem a evidência nova (colhida antes da 3.7.0 ou no perfil knowledge-free): nada se afirma
    expect(iconOnlyNonCircleButton(makeElement({ content: { textContent: "", hasVisibleText: false, hasIconOnly: true } }))).toBe(false);
  });

  it("os hospedeiros saem dos exemplos oficiais: Input e Tag trazem o br-button só com ícone sem circle; Card não", () => {
    const hosts = embeddedIconButtonHosts();
    expect(hosts.has("br-input")).toBe(true);
    expect(hosts.has("br-tag")).toBe(true);
    expect(hosts.has("br-card")).toBe(false);
    expect(hosts.has("br-button")).toBe(false);
    // conferência independente: cada hospedeiro tem, num exemplo oficial, um br-button sem circle e sem texto
    for (const host of hosts) {
      const name = host.slice(3);
      const htmls = Object.values(getComponentSpecs().components).flatMap((s) => s.examples.map((e) => e.html)).filter((h) => h.includes(`class="${host}`) || h.includes(`${host} `));
      expect(htmls.some((h) => /<button class="br-button"[^>]*>\s*<i [^>]*><\/i>\s*<\/button>/.test(h)), name).toBe(true);
    }
  });

  it("na página: acusa exatamente aria-label, sr-only, <a> com <img>, dentro de Card, <img alt> sozinho e <span class=fa-…>; nada na página conforme", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/ferragens/acoes`, checks: ["structure"], maxChars: 60_000 });
      const findings = await allFindings(call, scan.data.scanId);
      const c01 = findings.filter((f) => f.rule.id === BUTTON_LABEL_REQUIRED);
      expect(c01.map((f) => f.element.locator).sort()).toEqual(["#ajuda", "#excluir", "#faspan", "#favoritar", "#imgalt", "#imprimir"]);
      // revisão 3.7.0: texto em display:contents é visível; br-list dentro de br-input é parte do Input (hospedeiro da cadeia)
      expect(c01.some((f) => ["#contents", "#lista"].includes(f.element.locator))).toBe(false);
      // deduplicação: o botão só com ícone SEM nome fica com o achado de nome (WCAG 4.1.2), sem o C01 no mesmo elemento
      expect(findings.filter((f) => f.element.locator === "#semnome").map((f) => f.rule.id)).toEqual(["wcag:4.1.2"]);
      for (const f of c01) {
        expect(f.rule.source).toBe("govbr-ds-kb");
        expect(getRuleById(f.rule.id)?.force).toBe("required");
        // a exceção vem no texto: a letra perdida, o legado e o conserto
        expect(f.rule.description).toMatch(/A exceção ocorre na versão tipo circular/);
        expect(f.rule.description).toMatch(/button-4d7b5f978df1/);
        expect(f.rule.description).toMatch(/classe circle não é acusado/);
        expect(f.rule.description).toMatch(/br-input, br-tag/);
        expect(f.rule.description).not.toMatch(/única forma|que o DS admite/);
        expect(f.evidence.expected).not.toMatch(/única forma|que o DS admite/);
        expect(f.evidence.expected).toMatch(/circle/);
        expect(f.evidence.data.expectedCondition).toBe(ICON_ONLY_BUTTON_CONDITION);
      }
      // não duplica o nome acessível: os quatro têm nome (aria-label/sr-only), nenhum achado 4.1.2 neles
      const names = findings.filter((f) => f.rule.id === "wcag:4.1.2" || ["button-name", "link-name"].includes(f.rule.id));
      expect(names.filter((f) => c01.some((c) => c.element.locator === f.element.locator))).toEqual([]);
      expect(scan.data.checksRun.pageLevel.measured).toEqual(expect.arrayContaining(["icon-only-button"]));
      const ok = await call("scan_page", { url: `${base}/ferragens/conforme`, checks: ["structure"], maxChars: 60_000 });
      expect((await allFindings(call, ok.data.scanId)).filter((f) => f.rule.id === BUTTON_LABEL_REQUIRED)).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("verify_finding: o achado do scan é confirmado; a mesma alegação no circular é rejeitada; citar a WCAG não decide", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/ferragens/acoes`, checks: ["structure"], maxChars: 60_000 });
      const f = (await allFindings(call, scan.data.scanId)).find((x) => x.rule.id === BUTTON_LABEL_REQUIRED && x.element.locator === "#imprimir")!;
      const claim = (locator: string, rule = { id: BUTTON_LABEL_REQUIRED, source: "govbr-ds-kb", description: "rótulo" }) => ({
        live: true,
        finding: {
          id: "agente-c01",
          rule,
          element: { locator, page: `${base}/ferragens/acoes` },
          evidence: { observed: "só ícone", expected: "rótulo ou circle", data: { expectedCondition: ICON_ONLY_BUTTON_CONDITION } },
          severity: "moderate", nature: "syntactic", mode: "display", pathway: "heuristic",
        },
      });
      const confirmed = await call("verify_finding", { live: true, finding: { ...f, pathway: "heuristic" } });
      expect(confirmed.data.verdict).toBe("confirmed");
      const circle = await call("verify_finding", claim("#fechar"));
      expect(circle.data.verdict).toBe("rejected");
      const text = await call("verify_finding", claim("#salvar"));
      expect(text.data.verdict).toBe("rejected");
      const nameless = await call("verify_finding", claim("#semnome"));
      expect(nameless.data.verdict).toBe("confirmed");
      const contents = await call("verify_finding", claim("#contents"));
      expect(contents.data.verdict).toBe("rejected");
      const wcag = await call("verify_finding", claim("#imprimir", { id: "wcag:4.1.2", source: "wcag", description: "nome" }));
      expect(wcag.data.verdict).toBe("unverifiable");
    } finally {
      await client.close();
    }
  });

  it("knowledge-free: o scan do perfil não traz o C01 (só o axe; a evidência nova não é colhida sem conhecimento)", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      const scan = await call("scan_page", { url: `${base}/ferragens/acoes`, maxChars: 60_000 });
      expect(JSON.stringify(scan.data)).not.toMatch(/7ef75d42ac65|iconOnlyVisual|hostComponents/);
    } finally {
      await client.close();
    }
  });

  it("interno de web component do DS vira observação, não achado", () => {
    const inside = makeElement({
      locator: "br-tag >>> button",
      inShadowDom: true,
      origin: "ds-web-component",
      originHost: "br-tag",
      attributes: { ariaLabel: "Fechar" } as never,
      content: { textContent: "", hasVisibleText: false, hasIconOnly: true, iconOnlyVisual: true },
    });
    const r = checkIconOnlyButtons({ url: "http://x/p" }, [inside]);
    expect(r.findings).toEqual([]);
    expect(r.observations.length).toBe(1);
  });
});

// ── 2. investigate empurra as cláusulas ─────────────────────────────────────────────────────────

describe("3.7.0 item 2 — investigate carrega as cláusulas mensuráveis sem check, por mensurabilidade", () => {
  it("cada item traz citeAs resolvido, letra curta e procedimento; nenhuma é medida por check; ordem DOM/CSS primeiro", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/ferragens/acoes`, checks: ["structure"], maxChars: 60_000 });
      const inv = scan.data.investigate;
      expect(inv.note).toMatch(/candidatas a medir antes de encerrar; não são defeitos/);
      expect(inv.clausesNote).toMatch(/nenhum check julgou/);
      const withClauses = (inv.items as Array<Record<string, any>>).filter((i) => i.clauses);
      expect(withClauses.length).toBeGreaterThan(0);
      for (const item of withClauses) {
        const ranks = (item.clauses as Array<Record<string, string>>).map((c) => {
          const rule = getRuleById(c.citeAs)!;
          expect(rule, c.citeAs).toBeDefined();
          expect(["required", "prohibited"]).toContain(rule.force);
          expect(oracleMeasuresFor(c.citeAs), `${c.citeAs} já é medida por check`).toEqual([]);
          expect(c.text.length).toBeGreaterThan(0);
          expect(c.how).toMatch(/ → .* → espera: /);
          // revisão 3.7.0 (ALTA): só com procedimento lido do texto — nunca o genérico "o elemento/atributo citado → presente"
          expect(checklist.procedureOf(rule, item.component), c.citeAs).not.toBeNull();
          expect(c.how).not.toMatch(/elemento\/atributo citado/);
          return checklist.MEASURABILITY.indexOf(checklist.measurabilityOf(rule));
        });
        for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
        // as mais mensuráveis do componente: nenhuma de posto melhor ficou de fora
        const { total, clauses } = checklist.investigateClauses(item.component);
        expect(item.clauses.map((c: { citeAs: string }) => c.citeAs)).toEqual(clauses.map((c) => c.citeAs));
        expect(item.clausesMore ?? 0).toBe(total - clauses.length);
      }
      // a cláusula do rótulo do Button agora é do check: não volta como pendência a medir
      const button = (inv.items as Array<Record<string, any>>).find((i) => i.component === "button");
      expect(JSON.stringify(button ?? {})).not.toMatch(/7ef75d42ac65|9d77803305c0/);
    } finally {
      await client.close();
    }
  });

  it("no aperto da 1ª página: cláusulas descem em degraus marcados, o investigate nunca some e nunca custa família", async () => {
    const { assembleScan, investigateFor } = await import("../../src/responses/scan.js");
    const { buildFamilyPage } = await import("../../src/responses/families.js");
    const findings = Array.from({ length: 22 }, (_, i) => ({
      id: `F-${String(i + 1).padStart(3, "0")}`,
      rule: { source: "axe-core", id: "color-contrast", description: "contraste" },
      element: { locator: `main > ol > li:nth-of-type(${i + 1}) > span.preco-${i}`, page: "http://x/f" },
      evidence: { observed: `contraste ${(2 + i / 10).toFixed(2)}:1`, expected: "4.5:1" },
      severity: "serious", nature: "syntactic", mode: "display", pathway: "deterministic",
    })) as unknown as Finding[];
    const page = (b: number) => buildFamilyPage(findings, { maxChars: b, stateFingerprint: "x" }) as unknown as Record<string, unknown>;
    const components = ["button", "input", "table", "tab", "menu", "card"];
    const strong = (c: string) => checklist.unmeasuredStrongCount(c);
    const plainInv = investigateFor(components, "S-page-001", () => ({}), strong);
    const pushed = investigateFor(components, "S-page-001", () => ({}), strong, (c) => checklist.investigateClauses(c));
    expect(JSON.stringify(pushed).length).toBeGreaterThan(JSON.stringify(plainInv).length);
    const n = (x: Record<string, unknown>) => (Array.isArray(x.families) ? x.families.length : 0);
    let shortened = 0;
    let named = 0;
    let full = 0;
    for (const maxChars of [3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 10_000, 12_000, 16_000]) {
      for (let pad = 0; pad <= 3_000; pad += 250) {
        const head = { contract: "c", kind: "scan", scanId: "S-page-001", filler: "w".repeat(pad), coverage: { checks: ["structure"], componentsFound: components } };
        const without = assembleScan({ ...head, investigate: plainInv }, null, "S-page-001", maxChars, page, { firstScanPage: true });
        const withIt = assembleScan({ ...head, investigate: pushed }, null, "S-page-001", maxChars, page, { firstScanPage: true });
        expect(n(withIt), `teto ${maxChars} pad ${pad}`).toBeGreaterThanOrEqual(n(without));
        expect(JSON.stringify(withIt).length).toBeLessThanOrEqual(maxChars);
        const inv = withIt.investigate as Record<string, any> | undefined;
        expect(inv, `teto ${maxChars} pad ${pad}: investigate sumiu`).toBeDefined();
        expect(inv!.next).toMatchObject({ tool: "get_component_spec", arguments: { view: "checklist" } });
        const labels = (Array.isArray(withIt.compacted) ? withIt.compacted : []) as string[];
        if (inv!.components) {
          named += 1;
          expect(labels.includes("investigate") || typeof withIt.compacted === "number" || typeof withIt.compacted === "string").toBe(true);
        } else if (inv!.items) {
          const clauses = (inv!.items as Array<Record<string, any>>).flatMap((i) => i.clauses ?? []);
          if (clauses.some((c) => c.text === undefined)) {
            shortened += 1;
            expect(labels).toContain("investigate.clauses");
          } else if (clauses.length) full += 1;
        }
      }
    }
    // a escada foi exercida: inteiras, encurtadas e só nomes aparecem em algum teto
    expect(full).toBeGreaterThan(0);
    expect(shortened).toBeGreaterThan(0);
    expect(named).toBeGreaterThan(0);
  });
});

// ── 3. lista de verificação por mensurabilidade ─────────────────────────────────────────────────

describe("3.7.0 item 3 — get_component_spec checklist ordenado por mensurabilidade, com procedimento", () => {
  it("em todo componente: postos não decrescentes de página em página; toda cláusula sem medida automática tem procedimento", () => {
    for (const component of Object.keys(getComponentSpecs().components)) {
      let cursor: number | undefined = 0;
      let last = -1;
      let seen = 0;
      while (cursor !== undefined) {
        const r = checklist.componentChecklist(component, cursor) as Record<string, any>;
        for (const item of r.items as Array<Record<string, any>>) {
          const rank = checklist.MEASURABILITY.indexOf(checklist.measurabilityOf(getRuleById(item.citeAs)!));
          expect(rank, `${component} ${item.citeAs}`).toBeGreaterThanOrEqual(last);
          last = rank;
          seen += 1;
          if (!item.measure.automatic) {
            const proc = checklist.procedureOf(getRuleById(item.citeAs)!, component);
            // com procedimento derivável do texto: how = o procedimento; sem ele: julgamento, sem valor esperado inventado
            if (proc) expect(item.measure.how, `${component} ${item.citeAs}`).toMatch(/ → .* → espera: /);
            else expect(item.measure.how, `${component} ${item.citeAs}`).not.toMatch(/espera:/);
          }
        }
        cursor = r.nextCursor as number | undefined;
      }
      expect(seen).toBe(checklist.checklistRules(component).length);
    }
  });

  it("Button: a cláusula do rótulo traz a exceção como procedimento do oráculo, com a proveniência; a letra da base não muda", () => {
    const r = checklist.componentChecklist("button", 0) as Record<string, any>;
    let items = r.items as Array<Record<string, any>>;
    let cursor = r.nextCursor as number | undefined;
    while (cursor !== undefined) {
      const next = checklist.componentChecklist("button", cursor) as Record<string, any>;
      items = [...items, ...(next.items as Array<Record<string, any>>)];
      cursor = next.nextCursor as number | undefined;
    }
    const label = items.find((i) => i.citeAs === BUTTON_LABEL_REQUIRED)!;
    expect(label.text).toBe("O rótulo é um elemento obrigatório.");
    expect(label.condition).toMatchObject({ code: "lost-exception", legacyId: "govbr-3.7.0-component-button-4d7b5f978df1" });
    expect(label.measure.automatic).toBe(true);
    expect(label.measure.oracle).toEqual(expect.arrayContaining([{ tool: "verify_finding", expectedCondition: ICON_ONLY_BUTTON_CONDITION }]));
    expect(label.measure.procedure.expect).toMatch(/só ícone ⇒ classe circle.*senão, rótulo visível/);
    expect(label.measure.procedure.provenance).toMatch(/procedimento do oráculo, não letra da cláusula/);
    expect(label.measure.procedure.provenance).toMatch(/govbr-3\.7\.0-component-button-4d7b5f978df1/);
    // revisão 3.7.0 (ALTA): cláusulas sem procedimento derivável ficam sem expectativa (as da revisão)
    for (const [id, comp] of [["govbr-3.7.0-development-button-323bef5db0fd", "button"], ["govbr-3.7.0-component-input-acbd0e607b75", "input"]] as const) {
      expect(checklist.procedureOf(getRuleById(id)!, comp), id).toBeNull();
      expect(checklist.measurabilityOf(getRuleById(id)!), id).toBe("judgement");
    }
    // condicional e posição que não é lugar ("acima de duas linhas") não viram procedimento
    expect(checklist.procedureOf(getRuleById("govbr-3.7.0-component-modal-9ef8851a5224")!, "modal")).toBeNull();
    expect(checklist.procedureOf(getRuleById("govbr-3.7.0-development-signin-154c8d8f439c")!, "signin")).toBeNull();
    // a dimensão em px vira o valor esperado; a de toque diz a condição
    const touch = checklist.procedureOf(getRuleById("govbr-3.7.0-foundation-global-1c0146e93d2e")!);
    expect(touch.expect).toBe("≥ 48×48px");
    expect(touch.when).toMatch(/toque\/móvel/);
    expect(checklist.procedureOf(getRuleById("govbr-3.7.0-foundation-global-5f213b4dbcb5")!).expect).toBe("≥ 24×24px");
  });
});


// ── 5. revisão da reexecução (02/11): lacuna A (cláusulas no teto padrão) e lacuna B (host <br-button>) ──────────

describe("3.7.0 revisão — lacuna A: no teto padrão o investigate leva cláusula na forma compacta", () => {
  it("8.000 caracteres, 12 componentes: cada componente com cláusula a leva como `id · procedimento`, sem família a menos", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/ferragens/painel` });
      expect(scan.text.length).toBeLessThanOrEqual(8_000);
      const inv = scan.data.investigate;
      expect(inv).toBeDefined();
      const found = (inv.components ?? [...inv.items.map((i: { component: string }) => i.component), ...(inv.more?.components ?? [])]) as string[];
      expect(found.length).toBeGreaterThanOrEqual(10);
      // a cláusula chega: na forma de itens (teto folgado) ou na compacta (nomes + clauses por componente)
      const lines: string[] = inv.clauses ? Object.values(inv.clauses as Record<string, string[]>).flat() : (inv.items ?? []).flatMap((i: { clauses?: Array<{ citeAs: string }> }) => (i.clauses ?? []).map((c) => c.citeAs));
      expect(lines.length, JSON.stringify(scan.data.compacted)).toBeGreaterThan(0);
      for (const line of lines) {
        const id = line.split(" · ")[0];
        expect(getRuleById(id), id).toBeDefined();
        if (inv.clauses) expect(line.length).toBeLessThanOrEqual(120);
      }
      // nenhuma família fica de fora por causa delas: todas as famílias desta página cabem no teto padrão
      expect(scan.data.families.length).toBe(scan.data.totalFamilies);
    } finally {
      await client.close();
    }
  });

  it("a escada: itens → id + how → nomes + 2 cláusulas → nomes + 1 cláusula → nomes; cada forma menor que a anterior", async () => {
    const { assembleScan, investigateFor } = await import("../../src/responses/scan.js");
    const { buildFamilyPage } = await import("../../src/responses/families.js");
    const findings = Array.from({ length: 3 }, (_, i) => ({
      id: `F-${String(i + 1).padStart(3, "0")}`,
      rule: { source: "axe-core", id: "color-contrast", description: "contraste" },
      element: { locator: `main > ol > li:nth-of-type(${i + 1}) > span.preco-${i}`, page: "http://x/f" },
      evidence: { observed: `contraste ${(2 + i / 10).toFixed(2)}:1`, expected: "4.5:1" },
      severity: "serious", nature: "syntactic", mode: "display", pathway: "deterministic",
    })) as unknown as Finding[];
    const page = (b: number) => buildFamilyPage(findings, { maxChars: b, stateFingerprint: "x" }) as unknown as Record<string, unknown>;
    const components = ["radio", "checkbox", "select", "table", "tag", "tab", "input", "button", "card", "list"];
    const inv = investigateFor(components, "S-page-001", () => ({}), (c) => checklist.unmeasuredStrongCount(c), (c) => checklist.investigateClauses(c));
    const forms = new Set<string>();
    for (let pad = 0; pad <= 6_000; pad += 25) {
      const head = { contract: "c", kind: "scan", scanId: "S-page-001", filler: "w".repeat(pad), investigate: inv };
      const r = assembleScan(head, null, "S-page-001", 8_000, page, { firstScanPage: true });
      const i = r.investigate as Record<string, any>;
      expect(JSON.stringify(r).length).toBeLessThanOrEqual(8_000);
      const form = i.items ? (i.items.some((x: any) => x.clauses?.some((c: any) => c.text)) ? "itens" : "id+how") : i.clauses ? `compacta-${Math.max(...Object.values(i.clauses as Record<string, string[]>).map((l) => l.length))}` : i.investigateNote ? "aviso" : "nomes";
      if (i.investigateNote) {
        // decisão de 02/11: a linha diz os componentes e a chamada, cabe em 160 e o next fica
        expect(i.investigateNote.length).toBeLessThanOrEqual(160);
        expect(i.investigateNote).toMatch(/get_component_spec{component, view:"checklist"}/);
      }
      forms.add(form);
      if (i.clauses) {
        expect(Object.keys(i.clauses).every((c) => i.components.some((n: string) => n.split(":")[0] === c))).toBe(true);
        expect(i.next).toMatchObject({ tool: "get_component_spec" });
      }
    }
    expect([...forms]).toEqual(expect.arrayContaining(["compacta-2", "compacta-1", "aviso", "nomes"]));
  });
});

describe("3.7.0 revisão — lacuna B: o host <br-button> do web component é julgado pela API dele", () => {
  it("só ícone e sem circle no host acusa (no localizador do host); circle, texto no slot, label e o botão do Input não", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/ferragens/componentes`, checks: ["structure"], maxChars: 60_000 });
      const findings = await allFindings(call, scan.data.scanId);
      const c01 = findings.filter((f) => f.rule.id === BUTTON_LABEL_REQUIRED);
      expect(c01.map((f) => f.element.locator)).toEqual(["#wc-icone"]);
      expect(c01[0].evidence.data.webComponent).toBe("br-button");
      expect(c01[0].evidence.observed).toMatch(/ícone print/);
      // o botão desenhado no shadow root é do DS: nem achado, nem observação C01
      expect(findings.some((f) => /br-button >>> /.test(f.element.locator) && f.rule.id === BUTTON_LABEL_REQUIRED)).toBe(false);
      const v = await call("verify_finding", { live: true, finding: { ...c01[0], pathway: "heuristic" } });
      expect(v.data.verdict).toBe("confirmed");
      const circle = await call("verify_finding", { live: true, finding: { ...c01[0], element: { ...c01[0].element, locator: "#wc-circulo" }, pathway: "heuristic" } });
      expect(circle.data.verdict).toBe("rejected");
    } finally {
      await client.close();
    }
  });
});
