/**
 * 3.4.0 (D-153), Lado A: peças sem MCP — camada kb-relations, distância de edição, roteamento, listagem.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { getKnowledgeBase } from "../../src/data/knowledge.js";
import { getRelations, registryRefsFor, relatedComponentsOf, relatedFor, resetRelationsCache, validateRelations, type KbRelations } from "../../src/data/relations.js";
import { analyzeQuery, editDistance, isMarkupQuestion, rankRules, getVocabulary } from "../../src/data/retrieval.js";
import { routeSteps } from "../../src/responses/routing.js";
import { listingBand, listingOrder } from "../../src/responses/retrieval.js";

const FILE = new URL("../../data/knowledge/relations/kb-relations-1.1.0.json", import.meta.url);
const P = "govbr-3.7.0-";

afterEach(() => {
  delete process.env.GOVBR_KB_RELATIONS;
  resetRelationsCache();
});

describe("kb-relations-1.1.0 (A12): cada ligação com cláusula literal da base", () => {
  it("valida na carga: regra e cláusulas existem e cada trecho está no texto", () => {
    const relations = getRelations()!;
    expect(relations.version).toBe("kb-relations-1.1.0");
    expect(relations.knowledgeVersion).toBe(getKnowledgeBase().meta.knowledgeVersion);
    for (const link of relations.links) expect(link.basis.length).toBeGreaterThan(0);
  });
  it("trecho que não está na cláusula derruba a carga (nada inventado)", () => {
    const bad = JSON.parse(readFileSync(FILE, "utf8")) as KbRelations;
    bad.links[0].basis[0].quote = "texto que a base não tem";
    expect(() => validateRelations(bad)).toThrow(/não está em/);
    const noBasis = JSON.parse(readFileSync(FILE, "utf8")) as KbRelations;
    noBasis.links[0].basis = [];
    expect(() => validateRelations(noBasis)).toThrow(/sem cláusula de apoio/);
  });
  it("relatedComponents derivado só na cópia lida; desligável", () => {
    const rule = getKnowledgeBase().byId.get(`${P}accessibility-global-5817ddd685a6`)!;
    expect(rule.relatedComponents).toEqual([]);
    expect(relatedComponentsOf(rule)).toEqual(["pagination"]);
    process.env.GOVBR_KB_RELATIONS = "off";
    expect(relatedComponentsOf(rule)).toEqual([]);
    expect(relatedFor({ components: ["pagination"] })).toEqual([]);
  });
  it("topic markupOnly só com marcação; registryRoutes só para aria-*/role", () => {
    expect(relatedFor({ terms: ["button"], markup: false }).map((i) => i.relation)).not.toContain("R-03");
    expect(relatedFor({ terms: ["button"], markup: true }).map((i) => i.relation)).toContain("R-03");
    expect(registryRefsFor(["aria-current"]).map((r) => r.num)).toEqual(["4.1.2", "1.3.1"]);
    expect(registryRefsFor(["role"]).map((r) => r.num)).toEqual(["4.1.2", "1.3.1"]);
    expect(registryRefsFor(["muda"])).toEqual([]);
  });
});

describe("govbr-lexical/1.3.0", () => {
  it("A7: distância de edição com transposição e teto", () => {
    expect(editDistance("rotlo", "rotulo", 1)).toBe(1);
    expect(editDistance("ortulo", "rotulo", 1)).toBe(1);
    expect(editDistance("abc", "xyzab", 1)).toBe(2);
  });
  it("A7: só palavra sem nenhuma correspondência e com >= 5 letras é aproximada", () => {
    expect(analyzeQuery("rótlo").approximations).toEqual([{ term: "rotlo", as: "rotulo", distance: 1 }]);
    expect(analyzeQuery("rótulo").approximations).toEqual([]);
    expect(analyzeQuery("quux").approximations).toEqual([]);
    expect(analyzeQuery("quux").unmatchedTerms).toEqual(["quux"]);
  });
  it("A3: o sucessor herda o título do registro histórico no índice (campo legacy)", () => {
    const r = rankRules({ text: "título" });
    const s = r.results.find((x) => x.rule.id === `${P}accessibility-global-e77859710a44`)!;
    expect(s.matched[0].fields).toContain("legacy");
  });
  it("A8: pergunta de marcação", () => {
    expect(isMarkupQuestion("fechar tags")).toBe(true);
    expect(isMarkupQuestion("role=button")).toBe(true);
    expect(isMarkupQuestion("aria-current na paginação")).toBe(true);
    expect(isMarkupQuestion("botão fechar da mensagem")).toBe(false);
  });
  it("A9: vocab-1.2.0 tem só flexão de gênero nova, origem reportada à parte; tabindex continua rejeitado", () => {
    const v = getVocabulary() as unknown as { version: string; groups: Array<{ id: string; origem?: string }>; rejeitados: Array<{ de: string[] }> };
    expect(v.version).toBe("vocab-1.2.0");
    const added = v.groups.filter((g) => g.origem === "auditoria-com-agente-2026-10-28").map((g) => g.id);
    expect(added).toEqual(["genero-minimo", "genero-maximo"]);
    expect(v.rejeitados.some((r) => r.de.join() === "tabindex")).toBe(true);
  });
});

describe("routing-1.0.1 (A4)", () => {
  it("tabela fixa: cor, marcação, posição; nunca mais de 2 passos; respeita o perfil", () => {
    expect(routeSteps("texto em #334333", null).map((s) => s.tool)).toEqual(["get_design_tokens", "check_token_compliance"]);
    expect(routeSteps("texto em rgb(51, 67, 51)", null)[0].arguments).toEqual({ hex: "rgb(51, 67, 51)" });
    expect(routeSteps("texto em #334333", null, (t) => t !== "check_token_compliance").map((s) => s.tool)).toEqual(["get_design_tokens", "scan_page"]);
    expect(routeSteps("<div role=\"button\">", null).map((s) => s.tool)).toEqual(["get_ds_rules", "get_component_spec"]);
    expect(routeSteps("o ícone está à direita", null)[0]).toMatchObject({ tool: null, action: "measure-condition" });
    expect(routeSteps("foco visível no botão", "button")).toEqual([]);
    for (const s of routeSteps("#fff aria-label à esquerda", "button")) expect(String(s.origin)).toMatch(/^routing-1.0.1:/);
  });
});

describe("routing-1.0.1 (revisão 3.4.0)", () => {
  it("#add/#menu são id, não cor; hex com algarismo, de 6/8 dígitos ou com palavra de cor é cor", () => {
    expect(routeSteps("o botão #add não abre", null).some((s) => s.tool === "get_design_tokens")).toBe(false);
    expect(routeSteps("link href=\"#c0ffee\"", null).some((s) => s.tool === "get_design_tokens")).toBe(false);
    expect(routeSteps("texto #3a3 no rodapé", null)[0]?.arguments).toEqual({ hex: "#3a3" });
    expect(routeSteps("cor de fundo #fff", null)[0]?.arguments).toEqual({ hex: "#fff" });
    expect(routeSteps("borda #c0ffee80", null)[0]?.arguments).toEqual({ hex: "#c0ffee80" });
  });
  it("\"antes de\" não roteia para geometria; <a> vira link/âncora na busca global", () => {
    expect(routeSteps("o erro aparece antes de enviar", null)).toEqual([]);
    const q = routeSteps("<a> com aparência de botão", null).find((s) => s.tool === "get_ds_rules");
    expect(q?.arguments).toEqual({ component: "global", query: "link âncora" });
  });
});

describe("listagem em faixas (A1)", () => {
  it("obrigação/proibição → outra prosa → tabela, ordem da base em cada faixa", () => {
    const rules = getKnowledgeBase().rules.filter((r) => r.component === "message" && r.force !== "example");
    const ordered = listingOrder(rules);
    const bands = ordered.map(listingBand);
    expect([...bands].sort((a, b) => a - b)).toEqual(bands);
    const kbIndex = (id: string) => rules.findIndex((r) => r.id === id);
    for (let i = 1; i < ordered.length; i++) {
      if (bands[i] === bands[i - 1]) expect(kbIndex(ordered[i].id)).toBeGreaterThan(kbIndex(ordered[i - 1].id));
    }
  });
});
