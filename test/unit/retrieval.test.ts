/**
 * NAT-97 (2.17.0): one relevance engine for get_ds_rules query/context. Cases use only the served
 * literal KB and generic phrasing — no answer keys, screens or benchmark labels.
 */
import { describe, it, expect, afterEach } from "vitest";
import { filterRules, getEvidence, getKnowledgeBase } from "../../src/data/knowledge.js";
import { normalizeContext, retrieveContextCandidates } from "../../src/data/applicability.js";
import {
  RELEVANCE_FLOOR,
  RANKING_VERSION,
  foldText,
  getVocabulary,
  isTableRow,
  rankRules,
  tokenize,
} from "../../src/data/retrieval.js";

const ids = (text: string, component: string | null = null, vocabulary?: boolean) =>
  rankRules({ text, component, vocabulary }).results.map((s) => s.rule.id);

afterEach(() => {
  delete process.env.GOVBR_RETRIEVAL_VOCAB;
});

describe("normalization", () => {
  it("folds case, accents and markdown, and drops markdown link targets", () => {
    expect(foldText("Botão *Fechar* `Esc`")).toBe("botao fechar esc");
    expect(foldText("[Select](/ds/components/select?tab=designer) opcional")).toBe("[select] opcional");
  });

  it("keeps hyphenated identifiers whole (and indexes their parts), attribute names and normative numbers", () => {
    const toks = tokenize("aria-current, <label for=x id=y>, alt, tabindex, e-MAG 3.9, WCAG 1.3.1, contraste 4,5:1");
    const keys = toks.map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["aria-current", "aria", "current", "label", "for", "id", "alt", "tabindex", "e-mag", "3.9", "1.3.1", "4.5"]));
    expect(toks.find((t) => t.key === "aria-current")!.kind).toBe("identifier");
    expect(toks.find((t) => t.key === "current")!.partOf).toBe("aria-current");
    expect(toks.find((t) => t.key === "3.9")!.kind).toBe("number");
  });

  it("is accent- and case-insensitive end to end", () => {
    expect(ids("BOTAO so com icone")).toEqual(ids("botão só com ícone"));
    expect(ids("navegação  por   teclado")).toEqual(ids("navegacao por teclado"));
  });
});

describe("ranking", () => {
  it("combines terms instead of requiring the whole phrase", () => {
    // 2.16.1: "foco modal" was a substring query with 0 results.
    expect(filterRules({ query: "foco modal" })).toHaveLength(0);
    const top = rankRules({ text: "foco modal" }).results.slice(0, 3);
    expect(top.length).toBe(3);
    for (const s of top) expect(s.matched.map((m) => m.term).sort()).toEqual(["foco", "modal"]);
  });

  it("word order does not change the set of matched rules", () => {
    expect(new Set(ids("modal foco"))).toEqual(new Set(ids("foco modal")));
  });

  it("a component hint keeps relevant global rules eligible and excludes other components", () => {
    const results = rankRules({ text: "caption tabela", component: "table" }).results;
    expect(results.some((s) => s.rule.component === null)).toBe(true);
    expect(results[0].rule.component).toBeNull(); // the e-MAG CAPTION clause is global
    expect(results.every((s) => s.rule.component === null || s.rule.component === "table")).toBe(true);
  });

  it("an exact normative number reaches its section's clauses", () => {
    const top = rankRules({ text: "3.9" }).results.slice(0, 3);
    expect(top.length).toBeGreaterThan(0);
    for (const s of top) expect(s.rule.emagReferences).toContain("3.9");
  });

  it("force only breaks ties: a lower-force rule with a better match stays above", () => {
    const res = rankRules({ text: "foco teclado navegação" }).results;
    for (let i = 1; i < res.length; i++) expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
  });

  it("API/anatomy table rows are recognised and ranked below prose of equal match (B-06)", () => {
    expect(isTableRow("| class | string | **data-current** | Página ativa |")).toBe(true);
    expect(isTableRow("O foco deve retornar ao último elemento focado.")).toBe(false);
    const candidates = retrieveContextCandidates(filterRules({}), normalizeContext({ components: ["pagination"] }));
    const own = candidates.filter((c) => c.rule.component === "pagination");
    expect(isTableRow(own[0].rule.originalText)).toBe(false);
    const firstRow = own.findIndex((c) => isTableRow(c.rule.originalText));
    expect(own.slice(firstRow).every((c) => isTableRow(c.rule.originalText))).toBe(true);
  });

  it("is deterministic for the same input, KB and ranking version", () => {
    const a = rankRules({ text: "rótulo do campo de formulário", component: "input" });
    const b = rankRules({ text: "rótulo do campo de formulário", component: "input" });
    expect(a.results.map((s) => [s.rule.id, s.score])).toEqual(b.results.map((s) => [s.rule.id, s.score]));
    expect(RANKING_VERSION).toMatch(/^govbr-lexical\/\d+\.\d+\.\d+$/);
  });
});

describe("declared relevance floor", () => {
  it("unknown words give an honest empty result, not noise", () => {
    const r = rankRules({ text: "xyzzy quux" });
    expect(r.results).toEqual([]);
    expect(r.analysis.unmatchedTerms).toEqual(["quux", "xyzzy"]);
    expect(rankRules({ text: "qual a melhor biblioteca de gráficos para o painel" }).results).toEqual([]);
  });

  it("every returned rule satisfies the declared floor", () => {
    for (const q of ["contraste borda", "o menu lateral não fecha com escape", "campo obrigatório sem indicação visual"]) {
      const r = rankRules({ text: q });
      expect(r.results.length).toBeGreaterThan(0);
      const top = r.results[0].score;
      for (const s of r.results) {
        expect(s.coverage).toBeGreaterThanOrEqual(RELEVANCE_FLOOR.minCoverage);
        expect(s.score >= RELEVANCE_FLOOR.minScore || s.coverage >= 1).toBe(true);
        expect(s.score).toBeGreaterThanOrEqual(RELEVANCE_FLOOR.relativeToTop * top);
      }
      expect(r.belowFloor).toBeGreaterThan(0);
    }
  });

  it("on a question of 4+ known terms, one shared word is not enough", () => {
    const r = rankRules({ text: "campo obrigatório sem indicação visual" });
    for (const s of r.results) expect(s.matched.length).toBeGreaterThanOrEqual(RELEVANCE_FLOOR.minMatchedTerms);
  });

  it("never fabricates: every result is a served KB record, unchanged", () => {
    const kb = getKnowledgeBase();
    for (const s of rankRules({ text: "rótulo associado ao campo" }).results) expect(kb.byId.get(s.rule.id)).toBe(s.rule);
  });
});

describe("regressions: queries that returned nothing in 2.16.1 (diagnóstico tela A, NAT-103 B-03)", () => {
  it.each([
    ["aria-current", "pagination"],
    ["current", "pagination"],
    ["atual", "pagination"],
    ["contraste borda", null],
    ["estado ARIA", null],
    ["elemento nativo", null],
    ["indicação visual foco", null],
    ["botao", null],
    ["keyboard", null],
    ["role=button", null],
  ])("%s [%s] returns ranked rules", (text, component) => {
    expect(rankRules({ text, component }).results.length).toBeGreaterThan(0);
  });

  it("an identifier missing from the base is reported as unmatched and searched by its parts", () => {
    const r = rankRules({ text: "aria-current", component: "pagination" });
    expect(r.analysis.unmatchedTerms).toContain("aria-current");
    expect(r.results.some((s) => s.rule.component === null)).toBe(true); // the global WAI-ARIA clause
  });

  it("'current' with the vocabulary also reaches the 'página atual' clause, not only the data-current table row", () => {
    const on = rankRules({ text: "current", component: "pagination" }).results;
    expect(on.some((s) => !isTableRow(s.rule.originalText) && /atual/i.test(s.rule.originalText))).toBe(true);
    const off = rankRules({ text: "current", component: "pagination", vocabulary: false }).results;
    expect(off.every((s) => /current/i.test(s.rule.originalText))).toBe(true);
  });
});

describe("vocabulary (versioned, switchable)", () => {
  it("every group has provenance and only synonym/naming entries", () => {
    const v = getVocabulary();
    expect(v.version).toBe("vocab-1.0.0");
    for (const g of v.groups) {
      expect(g.provenance.length).toBeGreaterThan(10);
      expect(Object.keys(g).sort().every((k) => ["from", "id", "origem", "provenance", "terms", "to"].includes(k))).toBe(true);
    }
  });

  it("is reported when used and can be switched off (argument or GOVBR_RETRIEVAL_VOCAB=off)", () => {
    const on = rankRules({ text: "label" });
    expect(on.vocabulary).toBe("vocab-1.0.0");
    expect(on.analysis.expansions[0]).toMatchObject({ term: "label", as: expect.arrayContaining(["rotulo"]) });
    const off = rankRules({ text: "label", vocabulary: false });
    expect(off.vocabulary).toBe("off");
    expect(off.analysis.expansions).toEqual([]);
    process.env.GOVBR_RETRIEVAL_VOCAB = "off";
    expect(rankRules({ text: "label" }).vocabulary).toBe("off");
  });

  it("negative: expansions do not turn an out-of-scope question into matches", () => {
    for (const vocabulary of [true, false]) {
      expect(rankRules({ text: "qual a melhor biblioteca de gráficos para o painel", vocabulary }).results).toEqual([]);
      expect(rankRules({ text: "xyzzy quux", vocabulary }).results).toEqual([]);
    }
  });

  it("negative: a translated state word only retrieves; matches through it are labelled", () => {
    const r = rankRules({ text: "atual", component: "pagination" });
    const via = r.results.flatMap((s) => s.matched.filter((m) => m.via));
    for (const m of via) expect(m).toMatchObject({ term: "atual", via: "current" });
  });
});

describe("review fixes (2.17.0)", () => {
  it("each context term is scored alone: adding observations never drops a term's candidates", () => {
    const termIds = (terms: string[]) =>
      retrieveContextCandidates(filterRules({}), normalizeContext({ components: ["input"], terms }))
        .filter((c) => c.reasons.some((r) => r.kind === "term" && r.term === "foco"))
        .map((c) => c.rule.id);
    const alone = termIds(["foco"]);
    expect(alone.length).toBeGreaterThan(10);
    expect(termIds(["foco", "erro", "rotulo", "obrigatorio"])).toEqual(expect.arrayContaining(alone));
  });

  it("scores do not depend on word order", () => {
    const scores = (t: string) => rankRules({ text: t }).results.map((s) => [s.rule.id, s.score]);
    expect(scores("label aria-label")).toEqual(scores("aria-label label"));
    expect(scores("botão fechar modal foco")).toEqual(scores("foco modal fechar botão"));
    expect(scores("tabela sem caption título")).toEqual(scores("título caption sem tabela"));
  });

  it("document frequencies come from the ranked pool: evidence-only words reach evidence", () => {
    const evidence = getEvidence();
    expect(rankRules({ text: "canonica" }).results).toEqual([]);
    expect(rankRules({ text: "canonica", pool: evidence }).results.length).toBeGreaterThan(0);
  });

  it("a comma-separated list of normative numbers stays a list; a decimal comma stays a decimal", () => {
    expect(tokenize("1.3.1,1.4.1").map((t) => t.key)).toEqual(["1.3.1", "1.4.1"]);
    expect(tokenize("4,5:1").map((t) => t.key)).toEqual(["4.5"]);
  });
});

describe("context adapter", () => {
  it("context terms rank through the same engine and keep their reasons", () => {
    const ctx = normalizeContext({ components: ["input"], terms: ["rótulo"] });
    const candidates = retrieveContextCandidates(filterRules({}), ctx);
    const globals = candidates.filter((c) => c.rule.component === null);
    expect(globals.length).toBeGreaterThan(0);
    for (const g of globals) {
      expect(g.relevance).toBeGreaterThan(0);
      expect(g.reasons.some((r) => r.kind === "term" && r.term === "rotulo")).toBe(true);
    }
    const scored = new Set(rankRules({ text: "rótulo", pool: filterRules({}).filter((r) => r.component === null || r.component === "input"), relativeFloor: false }).results.map((s) => s.rule.id));
    for (const c of candidates.filter((x) => x.relevance > 0)) expect(scored.has(c.rule.id)).toBe(true);
  });

  it("a query passed with context feeds the same engine", () => {
    const ctx = normalizeContext({ components: ["modal"] });
    const withQuery = retrieveContextCandidates(filterRules({}), ctx, { query: "foco ao fechar" });
    const own = withQuery.filter((c) => c.rule.component === "modal");
    expect(own[0].relevance).toBeGreaterThan(0);
    expect(own[0].rule.originalText.toLowerCase()).toContain("foco");
  });
});

describe("self-retrieval sweep (NAT-103 B-03), deterministic sample", () => {
  it("a rule is found in the top 5 by its title, its title without accents, and 4 title words", () => {
    const rules = getKnowledgeBase().rules.filter((r) => r.force !== "example");
    const strip = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const STOP = new Set("a o as os de da do das dos e é em um uma para por com que se no na nos nas ao à ser deve devem não the of and to".split(" "));
    const words4 = (t: string) => t.replace(/…$/, "").split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, "")).filter((w) => w && !STOP.has(w.toLowerCase())).slice(0, 4).join(" ");
    const sample = rules.filter((_, i) => i % 25 === 0);
    const rate = (q: (r: (typeof rules)[number]) => string, hint = false) =>
      sample.filter((r) => ids(q(r), hint ? r.component : null).slice(0, 5).includes(r.id)).length / sample.length;
    // 2.16.1 (NAT-103, full sweep): 99.0% / 15.5% / 9.7%; 2.17.0 full sweep: 98.4% / 98.4% / 96.7% (own component, 4 words no accents: 4.8% → 99.0%).
    expect(rate((r) => r.title)).toBeGreaterThanOrEqual(0.95);
    expect(rate((r) => strip(r.title))).toBeGreaterThanOrEqual(0.95);
    expect(rate((r) => words4(r.title))).toBeGreaterThanOrEqual(0.9);
    expect(rate((r) => strip(words4(r.title)), true)).toBeGreaterThanOrEqual(0.9);
  });
});
