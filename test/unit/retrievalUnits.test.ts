/**
 * 3.0.0 (NAT-99, revisão): unidade distinta do contrato. Só se fundem num cartão o título com o corpo
 * da mesma seção e as linhas da mesma tabela; cláusulas de prosa da mesma seção ficam separadas.
 * Registros sintéticos (nenhum texto das telas).
 */
import { describe, it, expect } from "vitest";
import { groupUnits, type Hit } from "../../src/responses/retrieval.js";
import type { KnowledgeRule } from "../../src/data/knowledge.js";

function rule(id: string, originalText: string, section = "Seção X", sectionPath = "Página > Seção X", force = "required"): KnowledgeRule {
  return {
    id, originalText, force, title: originalText, component: null,
    source: { url: "https://example.test", retrievedAt: "x", contentHash: "x", corpusFile: "c.md", section, sectionPath },
  } as unknown as KnowledgeRule;
}
const hit = (r: KnowledgeRule): Hit => ({ rule: r, matched: [], relation: "global", field: null });

describe("unidade distinta (contrato §5.2, estreitada)", () => {
  it("duas cláusulas de prosa da mesma seção → dois cartões", () => {
    const units = groupUnits([hit(rule("a", "O foco deve voltar ao gatilho.")), hit(rule("b", "Use rótulos visíveis."))]);
    expect(units.map((u) => u.hits.map((h) => h.rule.id))).toEqual([["a"], ["b"]]);
  });

  it("título + corpo da mesma seção → um cartão, na posição do primeiro, com o corpo como principal", () => {
    const title = rule("t", "Seção X", "Seção X", "Página > Seção X", "prohibited");
    const body = rule("c", "Não use só cor para distinguir elementos.", "Seção X", "Página > Seção X", "prohibited");
    const units = groupUnits([hit(title), hit(rule("o", "Outra seção.", "Seção Y", "Página > Seção Y")), hit(body)]);
    expect(units.map((u) => u.hits.map((h) => h.rule.id))).toEqual([["t", "c"], ["o"]]);
  });

  it("duas linhas da mesma tabela → um cartão; título sem corpo fica sozinho", () => {
    const units = groupUnits([
      hit(rule("r1", "| class | string | data-a | A |")),
      hit(rule("r2", "| class | string | data-b | B |")),
      hit(rule("t2", "Seção Z", "Seção Z", "Página > Seção Z")),
    ]);
    expect(units.map((u) => u.hits.map((h) => h.rule.id))).toEqual([["r1", "r2"], ["t2"]]);
  });
});
