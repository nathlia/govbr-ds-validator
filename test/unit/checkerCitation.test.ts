/**
 * 3.6.0 (D-155, trios da tela A): todo achado de check cita em `rule.id` uma unidade normativa que a base
 * resolve — id KB (não legado, que obriga ou proíbe), recomendação e-MAG ou critério WCAG 2.2 — e nunca o id do
 * check, que vai em `rule.checker`. Até a 3.5.0 `ds-page-focus-order` saía como citação e o juiz cego via
 * "texto não localizado".
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Finding } from "../../src/schema/finding.js";
import { resetFindingIds } from "../../src/schema/finding.js";
import { checkTokenCompliance, ALL_TOKEN_CHECKS } from "../../src/checkers/tokenCompliance.js";
import { checkComponentStructure } from "../../src/checkers/structure.js";
import { checkPageStructure, pageConstraints } from "../../src/checkers/pageStructure.js";
import { checkFocusIndicators } from "../../src/checkers/focusIndicator.js";
import { checkPlaceholderLabels } from "../../src/checkers/formLabels.js";
import { checkDecorativeIcons } from "../../src/checkers/decorativeIcons.js";
import { CHECK_GROUNDING, checkerFamily } from "../../src/checkers/grounding.js";
import { constraintsForComponent, getComponentSpecs, getTokenRegistry } from "../../src/data/load.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { checkerOf, emagMembership, groundingForCheckId, wcagMembership } from "../../src/verify/registries.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { renderMarkdown, buildReport, validateFindings } from "../../src/report/report.js";
import type { PageFacts } from "../../src/evidence/pageFacts.js";
import { makeElement } from "../helpers/fixtures.js";

const page = { url: "http://localhost/pagina" };

/** Resolve a citação como o juiz e o portão a resolvem; devolve o motivo da falha ou null. */
function resolutionFailure(rule: Finding["rule"]): string | null {
  if (/^ds[-:]/.test(rule.id)) return `id de check como citação: ${rule.id}`;
  switch (rule.source) {
    case "govbr-ds-kb": {
      const kb = getRuleById(rule.id);
      if (!kb) return `KB não tem ${rule.id}`;
      if (kb.legacy) return `${rule.id} é id legado`;
      if (kb.force !== "required" && kb.force !== "prohibited") return `${rule.id} tem força ${kb.force}`;
      break;
    }
    case "emag":
      if (emagMembership(rule.id).status !== "member") return `e-MAG não tem ${rule.id}`;
      break;
    case "wcag":
      if (wcagMembership(rule.id).status !== "member") return `WCAG 2.2 não tem ${rule.id}`;
      break;
    case "axe-core":
      return null;
    default:
      return `fonte ${rule.source} não é unidade normativa`;
  }
  if (rule.wcag) {
    for (const ref of rule.wcag.split(/[,;]/).map((r) => r.trim()).filter(Boolean)) {
      if (wcagMembership(ref).status !== "member") return `wcag cruzada inválida: ${ref}`;
    }
  }
  if (rule.checker !== undefined) {
    const family = checkerFamily(rule.checker);
    if (!family) return `checker ${rule.checker} não é check publicado`;
    const grounded = groundingForCheckId(family, rule.checker);
    if (!grounded?.includes(rule.id)) return `${rule.id} não está na norma de ${rule.checker} (${grounded?.join(", ")})`;
  }
  return null;
}

function facts(overrides: Partial<PageFacts> = {}): PageFacts {
  return {
    url: page.url,
    lang: "pt-br",
    title: "Página",
    regions: { header: 1, footer: 1, breadcrumb: 0, cookiebar: 0, menu: 0 },
    mainLandmarks: 1,
    linkCount: 3,
    firstLink: { href: "#main", text: "Ir para o conteúdo", targetId: "main", targetExists: true, skipsToContent: true },
    ...overrides,
  };
}

/** Uma fixture que faz cada check do scan emitir achado. */
function everyCheckerFinding(): Array<{ check: string; findings: Finding[] }> {
  const specs = Object.values(getComponentSpecs().components).filter((spec) => spec.tags.length > 0);
  const offToken = makeElement({
    computed: { backgroundColor: "rgb(1, 2, 3)", fontFamily: "Arial, sans-serif", borderRadius: "3px", padding: "3px 5px" },
  });
  return [
    { check: "tokens", findings: checkTokenCompliance(page, [offToken], getTokenRegistry(), [...ALL_TOKEN_CHECKS]) },
    ...specs.map((spec) => ({
      check: `structure-tag:${spec.name}`,
      findings: checkComponentStructure(page, [makeElement({ tagName: "section", classes: [spec.rootClass], outerHTML: `<section class="${spec.rootClass}"></section>` })], spec),
    })),
    {
      check: "structure-tag:button-as-div-role",
      findings: checkComponentStructure(
        page,
        [makeElement({ tagName: "div", classes: ["br-button"], attributes: { role: "button", tabindex: "0" }, outerHTML: '<div class="br-button" role="button" tabindex="0">Enviar</div>' })],
        getComponentSpecs().components.button,
      ),
    },
    {
      check: "structure-accessible-name",
      findings: checkComponentStructure(page, [makeElement({ content: { textContent: "", hasVisibleText: false, hasIconOnly: true } })], getComponentSpecs().components.button),
    },
    {
      check: "page-regions+skip-link",
      findings: checkPageStructure(page, facts({ regions: { header: 0, footer: 0, breadcrumb: 0, cookiebar: 0, menu: 0 }, firstLink: { href: "/inicio", text: "Início", targetId: null, targetExists: false, skipsToContent: false } })),
    },
    {
      check: "page-focus-order",
      findings: checkPageStructure(page, facts({ positiveTabindexFirst: { tag: "a", tabindex: 3, text: "Ajuda", id: "ajuda", isFirstLink: false } })),
    },
    { check: "focus-indicator", findings: checkFocusIndicators(page, [{ locator: "#x", focused: true, complete: true, changed: [], snippet: "<a id=x>" }]) },
    {
      check: "placeholder-label",
      findings: checkPlaceholderLabels(page, [makeElement({ tagName: "input", classes: [], attributes: { type: "text", placeholder: "Buscar" }, content: { textContent: "", hasVisibleText: false, hasIconOnly: false } })]).findings,
    },
    {
      check: "decorative-icon+link-title",
      findings: checkDecorativeIcons(page, [
        makeElement({ content: { textContent: "Enviar", hasVisibleText: true, hasIconOnly: false, exposedIcons: 1 } }),
        makeElement({ locator: "#l", tagName: "a", classes: [], attributes: { title: "Ajuda", href: "/ajuda" } as never, content: { textContent: "Ajuda", hasVisibleText: true, hasIconOnly: false } }),
      ]).findings,
    },
  ];
}

describe("3.6.0 — a citação de cada achado de check é uma unidade que a base resolve", () => {
  beforeEach(() => resetFindingIds());

  it("nenhum achado emitido tem rule.id que falha a resolução; o id do check vai em rule.checker", () => {
    const failures: string[] = [];
    let total = 0;
    for (const { check, findings } of everyCheckerFinding()) {
      expect(findings.length, `${check}: a fixture não fez o check emitir achado`).toBeGreaterThan(0);
      for (const f of findings) {
        total += 1;
        const why = resolutionFailure(f.rule);
        if (why) failures.push(`${check}: ${why}`);
        // O check identificado pelo portão é o que o achado nomeia.
        if (f.rule.checker) expect(checkerOf(f).ref?.checker, check).toBe(f.rule.checker);
      }
    }
    expect(failures).toEqual([]);
    expect(total).toBeGreaterThan(40);
  });

  it("checks de token, estrutura e página nomeiam o check; os demais citam a norma diretamente", () => {
    const all = everyCheckerFinding().flatMap((c) => c.findings);
    const checkers = new Set(all.map((f) => f.rule.checker).filter(Boolean));
    for (const id of ["ds-token-color", "ds-token-font-family", "ds-token-radius", "ds-token-spacing", "ds-structure-button-tag", "ds-page-header", "ds-page-footer", "ds-page-skip-link", "ds-page-focus-order"]) {
      expect(checkers.has(id), id).toBe(true);
    }
  });

  it("mapeamento: foco → Skip Link 'primeiro a receber o foco' (WCAG 2.4.3); <button> trocado → e-MAG 1.2 (WCAG 1.3.1); raiz genérica → anatomia", () => {
    const focus = checkPageStructure(page, facts({ positiveTabindexFirst: { tag: "a", tabindex: 3, text: "Ajuda", id: "ajuda", isFirstLink: false } }));
    expect(focus.map((f) => [f.rule.id, f.rule.source, f.rule.wcag, f.rule.checker])).toEqual([
      ["govbr-3.7.0-accessibility-skiplink-b0641993618f", "govbr-ds-kb", "2.4.3", "ds-page-focus-order"],
    ]);
    const div = checkComponentStructure(page, [makeElement({ tagName: "div", classes: ["br-button"], attributes: { role: "button" } })], getComponentSpecs().components.button);
    expect(div.map((f) => [f.rule.id, f.rule.wcag, f.rule.checker])).toEqual([["govbr-3.7.0-accessibility-global-7c91abad32ce", "1.3.1", "ds-structure-button-tag"]]);
    const card = checkComponentStructure(page, [makeElement({ tagName: "section", classes: ["br-card"] })], getComponentSpecs().components.card);
    expect(card.map((f) => [f.rule.id, f.rule.wcag, f.rule.checker])).toEqual([["govbr-3.7.0-component-global-e30aab6e9a68", undefined, "ds-structure-card-tag"]]);
  });

  it("as restrições publicadas (get_component_spec, get_page_rules) trazem citeAs que resolve", () => {
    for (const spec of Object.values(getComponentSpecs().components)) {
      for (const c of constraintsForComponent(spec)) {
        expect(resolutionFailure({ id: c.citeAs, source: "govbr-ds-kb", description: "", checker: c.id }), c.id).toBeNull();
      }
    }
    for (const c of pageConstraints()) {
      expect(c.citeAs, c.id).toBe(c.implements[0]);
      expect(resolutionFailure({ id: c.citeAs!, source: c.citeAs!.startsWith("emag-") ? "emag" : "govbr-ds-kb", description: "", checker: c.id }), c.id).toBeNull();
    }
    // Toda norma que um check de CHECK_GROUNDING declara existe e não é legado.
    for (const [kind, g] of Object.entries(CHECK_GROUNDING)) {
      for (const id of g.implements) {
        if (id.startsWith("emag-")) expect(emagMembership(id).status, `${kind}: ${id}`).toBe("member");
        else expect(getRuleById(id)?.legacy, `${kind}: ${id}`).toBeUndefined();
      }
    }
  });
});

describe("3.6.0 — verify_finding com a citação nova", () => {
  beforeEach(() => resetFindingIds());
  const tokenFinding = () => checkTokenCompliance(page, [makeElement({ computed: { backgroundColor: "rgb(1, 2, 3)" } })], getTokenRegistry(), ["color"])[0];

  it("achado do scan como veio: norma conferida na base, predicado do check escolhido", async () => {
    const f = tokenFinding();
    expect(f.rule).toMatchObject({ id: "govbr-3.7.0-foundation-global-21b1a2733f7b", source: "govbr-ds-kb", checker: "ds-token-color" });
    const v = await verifyFinding({ finding: f });
    expect(v.checks?.ruleExists).toBe("pass");
    expect(v.predicate).toBe("token-color");
    expect(v.verdict).toBe("unverifiable"); // live=false
  });

  it("sem rule.checker (o agente copiou só a norma): a condição estruturada identifica o check", async () => {
    const { checker: _c, ...rule } = tokenFinding().rule;
    const v = await verifyFinding({ finding: { ...tokenFinding(), rule } });
    expect(v.predicate).toBe("token-color");
  });

  it("checker com norma que ele não implementa: ignorado, sem predicado do check", async () => {
    const f = tokenFinding();
    const v = await verifyFinding({ finding: { ...f, rule: { ...f.rule, id: "govbr-3.7.0-accessibility-global-fb9dfcacbb34" } } });
    expect(v.predicate).toBeNull();
    expect(v.detail).toMatch(/rule\.checker 'ds-token-color' ignorado/);
  });

  it("a forma antiga (id do check em rule.id) continua aceita e diz o que citar", async () => {
    const f = tokenFinding();
    const v = await verifyFinding({ finding: { ...f, rule: { id: "ds-token-color", source: "govbr-ds-token", description: f.rule.description } } });
    expect(v.predicate).toBe("token-color");
    expect(v.detail).toContain("cite rule.id 'govbr-3.7.0-foundation-global-21b1a2733f7b'");
  });

  it("id de implements que não é a citação do check (contexto) não escolhe o predicado, com nota", async () => {
    const [f] = checkPageStructure(page, facts({ positiveTabindexFirst: { tag: "a", tabindex: 3, text: "Ajuda", id: "ajuda", isFirstLink: false } }));
    const context = { ...f, rule: { ...f.rule, id: "govbr-3.7.0-accessibility-global-fb9dfcacbb34" } };
    const v = await verifyFinding({ finding: context });
    expect(v.predicate).toBeNull();
    expect(v.verdict).toBe("unverifiable");
    expect(v.detail).toMatch(/contexto, não como o que o check mede/);
    // sem rule.checker (inferido pela condição): o mesmo
    const { checker: _c, ...rule } = context.rule;
    const inferred = await verifyFinding({ finding: { ...context, rule } });
    expect(inferred.predicate).toBeNull();
    expect(inferred.detail).toMatch(/contexto/);
    // id que saiu de implements ("logo após a tag body": posição no DOM não é medida)
    const dom = await verifyFinding({ finding: { ...f, rule: { ...f.rule, id: "govbr-3.7.0-component-skiplink-02c2e513d936" } } });
    expect(dom.predicate).toBeNull();
  });

  it("save_report: achado na forma antiga entra com a norma em rule.id e o check em rule.checker, registrado em normalized", () => {
    const [f] = checkPageStructure(page, facts({ positiveTabindexFirst: { tag: "a", tabindex: 3, text: "Ajuda", id: "ajuda", isFirstLink: false } }));
    const legacy = { ...f, pathway: "heuristic" as const, rule: { id: "ds-page-focus-order", source: "govbr-ds-page" as const, description: f.rule.description } };
    const result = validateFindings([legacy], { verificationFor: () => ({ verdict: "confirmed", verifiedBy: "predicate:page-focus-order" }) });
    expect(result.rejected).toEqual([]);
    expect(result.accepted[0].rule).toMatchObject({ id: "govbr-3.7.0-accessibility-skiplink-b0641993618f", source: "govbr-ds-kb", checker: "ds-page-focus-order" });
    expect(result.normalized).toContainEqual({ index: 0, field: "rule.id", from: { id: "ds-page-focus-order", source: "govbr-ds-page" }, to: { id: "govbr-3.7.0-accessibility-skiplink-b0641993618f", source: "govbr-ds-kb", checker: "ds-page-focus-order" } });
    const md = renderMarkdown(buildReport(page.url, result.accepted));
    expect(md).toContain("govbr-3.7.0-accessibility-skiplink-b0641993618f (verificação ds-page-focus-order)");
    expect(md).not.toMatch(/] ds-page-focus-order/);
  });

  it("WCAG 2.4.3 com a condição do salto como 1º foco escolhe o predicado da ordem de foco", async () => {
    const [f] = checkPageStructure(page, facts({ positiveTabindexFirst: { tag: "a", tabindex: 3, text: "Ajuda", id: "ajuda", isFirstLink: false } }));
    const { checker: _c, implements: _i, wcag: _w, ...rest } = f.rule;
    const v = await verifyFinding({ finding: { ...f, rule: { ...rest, id: "2.4.3", source: "wcag" } } });
    expect(v.predicate).toBe("page-focus-order");
  });
});
