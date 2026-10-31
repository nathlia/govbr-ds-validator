/**
 * 3.6.1 (D-155): o que um achado põe em `rule.id` é o que o agente copia para o cartão — tem de ser uma forma que o
 * resolvedor da 1ª passada cega resolve COMO VEIO. Até aqui o achado de nome acessível citava `4.1.2` (sem prefixo)
 * e o resolvedor devolvia "não localizada".
 *
 * ESPELHO (não fonte) da gramática de `govbr-eval/scripts/reanalise-nat74/e14-fila.ts` → `normasDaCampanha` →
 * `resolver`, com `normalizarRegra` de `govbr-eval/scripts/reanalise-nat74/politica.ts`. Ler lá; mudou lá → mude aqui.
 *   normalizarRegra(r) = r.trim().replace(/\s*\(.*\)$/, "").replace(/^ds-(?!:)/, "ds:"); depois `emag-N.N` → `emag:N.N`
 *   1. /^wcag:(\d+\.\d+\.\d+)$/                      → registro WCAG 2.2 (data/wcag-2.2.json)
 *   2. /^emag:(\d+\.\d+)$/                           → data/emag.json
 *   3. `axe:<id>` ou `<id>` sem ':' que seja regra do axe-core instalado
 *   4. `[ds:]govbr-…` presente na base ativa (rules.jsonl, carried-over.jsonl, legacy-ids.json)
 *   5. `ds:<check>` via checker-aliases.json do govbr-eval (forma até a 3.5.0; a 3.6.0 não emite mais)
 *   senão: "não localizada".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { resetFindingIds, type Finding } from "../../src/schema/finding.js";
import { checkTokenCompliance, ALL_TOKEN_CHECKS } from "../../src/checkers/tokenCompliance.js";
import { checkComponentStructure } from "../../src/checkers/structure.js";
import { checkPageStructure, titleDuplicateFinding } from "../../src/checkers/pageStructure.js";
import { checkFocusIndicators } from "../../src/checkers/focusIndicator.js";
import { checkPlaceholderLabels } from "../../src/checkers/formLabels.js";
import { checkDecorativeIcons } from "../../src/checkers/decorativeIcons.js";
import { ANATOMY_PARTS } from "../../src/verify/contextual.js";
import { getComponentSpecs, getTokenRegistry, findEmagRule } from "../../src/data/load.js";
import { getKnowledgeBase, getRuleById } from "../../src/data/knowledge.js";
import { wcagMembership } from "../../src/verify/registries.js";
import { makeElement } from "../helpers/fixtures.js";
import type { PageFacts } from "../../src/evidence/pageFacts.js";

const require = createRequire(import.meta.url);
const AXE_RULES = new Set((require("axe-core") as { getRules: () => Array<{ ruleId: string }> }).getRules().map((r) => r.ruleId));

/** Espelho da gramática do resolvedor cego (ver o cabeçalho). Devolve a classe resolvida ou null. */
export const BLIND_RESOLVER = {
  normalize: (r: string) => r.trim().replace(/\s*\(.*\)$/, "").replace(/^ds-(?!:)/, "ds:").replace(/^emag-(\d+\.\d+)$/, "emag:$1"),
  wcag: /^wcag:(\d+\.\d+\.\d+)$/,
  emag: /^emag:(\d+\.\d+)$/,
};

function blindResolves(raw: string): string | null {
  const n = BLIND_RESOLVER.normalize(raw);
  let m = BLIND_RESOLVER.wcag.exec(n);
  if (m) return wcagMembership(m[1]).status === "member" ? "wcag" : null;
  m = BLIND_RESOLVER.emag.exec(n);
  if (m) return findEmagRule(m[1]) ? "emag" : null;
  const axeId = n.replace(/^axe:/, "");
  if (AXE_RULES.has(axeId) && (n.startsWith("axe:") || !/:/.test(n))) return "axe";
  const kbId = n.replace(/^ds:(?=govbr-)/, "");
  if (getRuleById(kbId)) return "kb";
  return null;
}

const page = { url: "http://localhost/pagina" };
const facts = (o: Partial<PageFacts> = {}): PageFacts => ({
  url: page.url, lang: "pt-br", title: "Página", regions: { header: 1, footer: 1, breadcrumb: 0, cookiebar: 0, menu: 0 }, mainLandmarks: 1, linkCount: 3,
  firstLink: { href: "#main", text: "Ir para o conteúdo", targetId: "main", targetExists: true, skipsToContent: true }, ...o,
});

/** Cada produtor de achado do scan, com uma fixture que o faz emitir. */
function producers(): Array<[string, Finding[]]> {
  const specs = Object.values(getComponentSpecs().components).filter((s) => s.tags.length > 0);
  const off = makeElement({ computed: { backgroundColor: "rgb(1, 2, 3)", color: "rgb(4, 5, 6)", borderColor: "rgb(7, 8, 9)", fontFamily: "Arial, sans-serif", borderRadius: "3px", padding: "3px 5px", margin: "3px 7px" } });
  return [
    ["tokens", checkTokenCompliance(page, [off], getTokenRegistry(), [...ALL_TOKEN_CHECKS])],
    ...specs.map((s) => [`structure-tag:${s.name}`, checkComponentStructure(page, [makeElement({ tagName: "section", classes: [s.rootClass], outerHTML: `<section class="${s.rootClass}"></section>` })], s)] as [string, Finding[]]),
    ["structure-accessible-name", checkComponentStructure(page, [makeElement({ content: { textContent: "", hasVisibleText: false, hasIconOnly: true } })], getComponentSpecs().components.button)],
    ["page-regions+skip-link+title", checkPageStructure(page, facts({ title: "", regions: { header: 0, footer: 0, breadcrumb: 0, cookiebar: 0, menu: 0 }, firstLink: { href: "/x", text: "x", targetId: null, targetExists: false, skipsToContent: false } }))],
    ["page-focus-order", checkPageStructure(page, facts({ positiveTabindexFirst: { tag: "a", tabindex: 3, text: "Ajuda", id: "ajuda", isFirstLink: false } }))],
    ["page-title-duplicate", [titleDuplicateFinding({ url: page.url, route: "/b", heading: "B" }, "T", [{ route: "/a", scanId: "S-1", heading: "A" }])]],
    ["focus-indicator", checkFocusIndicators(page, [{ locator: "#x", focused: true, complete: true, changed: [], snippet: "<a id=x>" }])],
    ["placeholder-label", checkPlaceholderLabels(page, [makeElement({ tagName: "input", classes: [], attributes: { type: "text", placeholder: "Buscar" }, content: { textContent: "", hasVisibleText: false, hasIconOnly: false } })]).findings],
    ["decorative-icon+link-title", checkDecorativeIcons(page, [
      makeElement({ content: { textContent: "Enviar", hasVisibleText: true, hasIconOnly: false, exposedIcons: 1 } }),
      makeElement({ locator: "#l", tagName: "a", classes: [], attributes: { title: "Ajuda", href: "/ajuda" } as never, content: { textContent: "Ajuda", hasVisibleText: true, hasIconOnly: false } }),
    ]).findings],
  ];
}

describe("3.6.1 — todo rule.id emitido resolve COMO VEIO no resolvedor da passada cega", () => {
  beforeEach(() => resetFindingIds());

  it("checks e detectores do scan (fixtures): rule.id na gramática do resolvedor e resolvido", () => {
    const failures: string[] = [];
    const forms = new Map<string, string>();
    for (const [name, findings] of producers()) {
      expect(findings.length, `${name}: a fixture não emitiu achado`).toBeGreaterThan(0);
      for (const f of findings) {
        const kind = blindResolves(f.rule.id);
        if (!kind) failures.push(`${name}: '${f.rule.id}' (${f.rule.source}) não resolve`);
        else forms.set(`${kind}:${f.rule.source}`, f.rule.id);
      }
    }
    expect(failures).toEqual([]);
    // as formas emitidas: id KB nu, `emag-N.N`, `wcag:N.N.N`
    expect([...forms.keys()].sort()).toEqual(["emag:emag", "kb:govbr-ds-kb", "wcag:wcag"]);
    expect(forms.get("wcag:wcag")).toBe("wcag:4.1.2");
  });

  it("anatomia: as normas que o check cita são ids KB que resolvem", () => {
    const ids = new Set(ANATOMY_PARTS.flatMap((p) => p.rules));
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(blindResolves(id), id).toBe("kb");
  });

  it("axe repassado: rule.id é o id da regra, sem prefixo — resolve para toda regra do axe-core instalado", () => {
    for (const id of AXE_RULES) expect(blindResolves(id), id).toBe("axe");
    expect(getKnowledgeBase().meta.totalRules).toBeGreaterThan(0);
  });

  it("as formas que o resolvedor não aceita são as que não podem sair (a guarda funciona)", () => {
    expect(blindResolves("4.1.2")).toBeNull();
    expect(blindResolves("wcag 4.1.2")).toBeNull();
    expect(blindResolves("ds-page-focus-order")).toBeNull();
  });
});
