/**
 * Contexto normativo (2.9.0, NAT-83): recuperação de regras candidatas a partir do que foi
 * observado. Os casos usam só a base publicada (component, relatedComponents, conditions,
 * exceptions, expectedEvidence) — nenhum id de gabarito, nenhuma tela do corpus.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { filterRules, getKnowledgeBase, normalizeText, useKnowledgeVersion } from "../../src/data/knowledge.js";
import {
  resetApplicabilityCache,
  forceTier,
  containsTerm,
  normalizeContext,
  obligationOf,
  pageCategoryPointers,
  resolveComponentName,
  retrieveContextCandidates,
  sourcePageNotes,
} from "../../src/data/applicability.js";

// 2.12.0: estes casos exercitam o MECANISMO sobre dados conhecidos da versão 3.7.0 (relatedComponents,
// expectedEvidence, títulos citados por conflicts.json), que a versão literal não publica. Ficam
// presos à 3.7.0; a versão servida por padrão é coberta em knowledgeLiteral.test.ts.
beforeAll(() => {
  useKnowledgeVersion("3.7.0");
  resetApplicabilityCache();
});
afterAll(() => {
  useKnowledgeVersion(undefined);
  resetApplicabilityCache();
});

const retrieve = (context: Parameters<typeof normalizeContext>[0]) =>
  retrieveContextCandidates(filterRules({}), normalizeContext(context));

describe("documented name variants", () => {
  it("resolves id, root class, web-component tag and official page name, ignoring case/accents/separators", () => {
    expect(resolveComponentName("button")).toBe("button");
    expect(resolveComponentName("Button")).toBe("button");
    expect(resolveComponentName("br-button")).toBe("button");
    expect(resolveComponentName("<br-modal>")).toBe("modal");
    expect(resolveComponentName("Cookie Bar")).toBe("cookiebar");
    expect(resolveComponentName("skip-link")).toBe("skiplink");
    expect(resolveComponentName("date time picker")).toBe("datetimepicker");
  });

  it("never guesses an undocumented name — it is reported as unresolved", () => {
    expect(resolveComponentName("botão")).toBeUndefined();
    const ctx = normalizeContext({ components: ["button", "widget-qualquer"] });
    expect(ctx.components).toEqual(["button"]);
    expect(ctx.unresolved).toEqual(["widget-qualquer"]);
  });

  it("normalizes context text without case or accents; legacy query keeps its 2.8.0 semantics", () => {
    expect(normalizeText("Formulário  de ERRO")).toBe("formulario de erro");
    // A busca ampliada é só de context.terms: query continua sensível a acento como na 2.8.0.
    expect(filterRules({ query: "formulario" })).toHaveLength(0);
    expect(filterRules({ query: "Formulário" }).length).toBeGreaterThan(0);
    expect(retrieve({ terms: ["formulario"] }).length).toBeGreaterThan(0);
    // E component continua id exato fora do context.
    expect(filterRules({ component: "Button" })).toHaveLength(0);
  });

  it("terms match at word start, not inside another word", () => {
    expect(containsTerm("identificar erros de entrada", "erro")).toBe(true);
    expect(containsTerm("nao interrompe o fluxo", "erro")).toBe(false);
  });
});

describe("retrieveContextCandidates", () => {
  it("returns the observed component's own rules, never examples nor rules of unobserved components", () => {
    const candidates = retrieve({ components: ["tag"] });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.rule.force !== "example")).toBe(true);
    expect(candidates.every((c) => c.rule.component === "tag" || c.rule.component === null)).toBe(true);
    const own = filterRules({ component: "tag" }).map((r) => r.id);
    expect(candidates.map((c) => c.rule.id)).toEqual(expect.arrayContaining(own));
  });

  it("a documented relation surfaces a global rule with its reason (relatedComponents)", () => {
    const related = getKnowledgeBase().rules.filter(
      (r) => r.component === null && r.force !== "example" && r.relatedComponents.length > 0,
    );
    expect(related.length).toBeGreaterThan(0);
    const rule = related[0];
    const target = rule.relatedComponents[0];
    const candidate = retrieve({ components: [target] }).find((c) => c.rule.id === rule.id);
    expect(candidate).toBeDefined();
    expect(candidate!.reasons).toContainEqual({ kind: "related-component-observed", component: target, via: "relatedComponents" });
    expect(candidate!.applicability.status).toBe("unknown");
    expect(candidate!.applicability.unknowns.join(" ")).toMatch(/Regra global/);
  });

  it("a component rule related to an unobserved component keeps the gap explicit", () => {
    const rule = getKnowledgeBase().rules.find(
      (r) => r.component !== null && r.force !== "example" && r.relatedComponents.length > 0,
    )!;
    const candidate = retrieve({ components: [rule.component!] }).find((c) => c.rule.id === rule.id)!;
    expect(candidate.applicability.unknowns.some((u) => u.includes(rule.relatedComponents[0]))).toBe(true);
    // Com o componente relacionado também observado, a relação vira motivo.
    const both = retrieve({ components: [rule.component!, rule.relatedComponents[0]] }).find((c) => c.rule.id === rule.id)!;
    expect(both.reasons.some((r) => r.kind === "related-component-observed")).toBe(true);
  });

  it("a rule whose owner was not observed is not invented by a relation alone", () => {
    const rule = getKnowledgeBase().rules.find(
      (r) => r.component !== null && r.force !== "example" && r.relatedComponents.length > 0,
    )!;
    const onlyRelated = rule.relatedComponents.find((c) => c !== rule.component)!;
    expect(retrieve({ components: [onlyRelated] }).some((c) => c.rule.id === rule.id)).toBe(false);
  });

  it("conditions and exceptions stay unevaluated: status never becomes applicable or verified", () => {
    const conditional = getKnowledgeBase().rules.find((r) => r.component && r.conditions.length && r.force !== "example")!;
    const c = retrieve({ components: [conditional.component!] }).find((x) => x.rule.id === conditional.id)!;
    expect(c.applicability.status).toBe("unknown");
    expect(c.applicability.unevaluated).toContain("conditions");

    const withException = getKnowledgeBase().rules.find((r) => r.component && r.exceptions.length && r.force !== "example")!;
    const e = retrieve({ components: [withException.component!] }).find((x) => x.rule.id === withException.id)!;
    expect(e.applicability.unevaluated).toContain("exceptions");

    const statuses = new Set(retrieve({ components: ["button", "input", "modal", "tag", "cookiebar"] }).map((x) => x.applicability.status));
    expect([...statuses].every((s) => s === "in-scope" || s === "unknown")).toBe(true);
  });

  it("a declared exception keeps applicability unknown even for the observed component's own rule", () => {
    const rule = getKnowledgeBase().rules.find((r) => r.component && r.exceptions.length && !r.conditions.length && r.force !== "example")!;
    const c = retrieve({ components: [rule.component!] }).find((x) => x.rule.id === rule.id)!;
    expect(c.applicability.status).toBe("unknown");
    expect(c.applicability.unevaluated).toEqual(["exceptions"]);
  });

  it("conflicts attach only by exact rule title; a shared source page is a page note, not a rule link", () => {
    const skip = retrieve({ components: ["skiplink"] }).find((c) => c.rule.title === "Skip Link no Template Base")!;
    expect(skip).toBeDefined();
    expect(skip.conflicts).toEqual([]); // mesma página do conflito de CDN legado, outra regra
    const modal = retrieve({ components: ["modal"] });
    expect(modal.find((c) => c.rule.title === "Rotulagem da Modal")!.conflicts).toEqual([]);
    expect(modal.every((c) => c.conflicts.length === 0)).toBe(true);
    expect(sourcePageNotes(modal)).toContainEqual(
      expect.objectContaining({ type: "documentation-typo-suspected", url: "https://www.gov.br/ds/components/modal" }),
    );
    expect(sourcePageNotes(retrieve({ components: ["skiplink"] }))).toContainEqual(
      expect.objectContaining({ type: "template-versus-current-installation-guidance", url: "https://www.gov.br/ds/templates/base?tab=codigos" }),
    );
    const cdn = retrieve({ terms: ["cdn"] }).find((c) => c.rule.title === "Evitar CDN legado")!;
    expect(cdn.conflicts).toEqual([
      { type: "template-versus-current-installation-guidance", status: "unresolved-current-documentation-conflict", link: "ruleTitle" },
    ]);
  });

  it("recommendations are labelled advisory, not mandatory", () => {
    expect(obligationOf("required")).toBe("mandatory");
    expect(obligationOf("prohibited")).toBe("mandatory");
    expect(obligationOf("recommended")).toBe("advisory");
    expect(obligationOf("permitted")).toBe("permissive");
    for (const c of retrieve({ components: ["button", "modal", "table"] })) {
      if (c.rule.force === "recommended") expect(c.obligation).toBe("advisory");
    }
  });

  it("terms search documented fields and only reach global rules or rules of observed components", () => {
    const candidates = retrieve({ terms: ["teclado"] });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.rule.component === null)).toBe(true);
    for (const c of candidates) {
      const reason = c.reasons.find((r) => r.kind === "term");
      expect(reason && reason.kind === "term" && reason.fields.length).toBeTruthy();
    }
    const evidenceHit = retrieve({ terms: ["foco"] }).some((c) =>
      c.reasons.some((r) => r.kind === "term" && r.fields.includes("expectedEvidence")),
    );
    expect(evidenceHit).toBe(true);
  });

  it("regions map to their Template Base component and are labelled as regions", () => {
    const candidates = retrieve({ regions: ["header"] });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.reasons[0].kind === "region-observed")).toBe(true);
  });

  it("ordering depends only on the normalized context, not on input order or spelling", () => {
    const a = retrieve({ components: ["modal", "button", "input"], terms: ["Erro"] }).map((c) => c.rule.id);
    const b = retrieve({ components: ["br-input", "Button", "<br-modal>", "button"], terms: ["erro", "ERRO"] }).map((c) => c.rule.id);
    expect(a).toEqual(b);
    // 2.12.0: grupos alternados (global primeiro, depois componentes A→Z); dentro do grupo, obrigação
    // antes de orientação e motivo mais forte antes de termo.
    const mixed = retrieve({ components: ["input"], terms: ["erro"] });
    const groupsSeen = mixed.slice(0, 2).map((c) => c.rule.component ?? "(global)");
    expect(groupsSeen).toEqual(["(global)", "input"]);
    for (const g of ["(global)", "input"]) {
      const tiers = mixed.filter((c) => (c.rule.component ?? "(global)") === g).map((c) => forceTier(c.rule.force));
      expect(tiers).toEqual([...tiers].sort((x, y) => x - y));
    }
  });

  it("page rule categories are pointers matched by terms, with the sections that contain them", () => {
    const pointers = pageCategoryPointers(["formulario"]);
    expect(pointers.map((p) => p.category)).toContain("form_patterns");
    expect(pointers.every((p) => p.sections.length > 0)).toBe(true);
    expect(pageCategoryPointers([])).toEqual([]);
  });
});
