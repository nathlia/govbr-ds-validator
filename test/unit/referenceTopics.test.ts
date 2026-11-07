import { describe, expect, it } from "vitest";
import { getRuleById, type KnowledgeRule } from "../../src/data/knowledge.js";
import { referenceTopic } from "../../src/checkers/referenceTopics.js";
import { bestPracticeReferences } from "../../src/checkers/axe.js";
import type { Finding } from "../../src/schema/finding.js";

const base = () => getRuleById("govbr-3.7.0-accessibility-global-00290bc67eb5")!;
const rule = (text: string, force: KnowledgeRule["force"] = "required"): KnowledgeRule => ({ ...base(), id: "topic-test", originalText: text, force });
const finding = (id: string, help: string) => ({ rule: { id, source: "axe-core" }, evidence: { expected: help, data: { bestPractice: true } } }) as unknown as Finding;

describe("A7 — referência secundária precisa do assunto literal", () => {
  it("cabeçalho vazio não recupera THEAD/TBODY/TFOOT, nem por help que os cite", () => {
    for (const help of ["Table header text should not be empty", "Table header THEAD TBODY TFOOT"]) {
      expect(referenceTopic("empty-table-header", help, [base()])?.candidates).toEqual([]);
      expect(bestPracticeReferences(finding("empty-table-header", help))).toEqual([{ id: "emag-3.10" }]);
    }
    const literal = rule("As células de cabeçalho da tabela devem conter texto descritivo.");
    expect(referenceTopic("empty-table-header", "Table header text", [literal])?.candidates).toEqual([literal]);
  });

  it("região genérica não cita rodapé específico; tabindex não cita fragmento de fluxo", () => {
    const footer = getRuleById("govbr-3.7.0-accessibility-global-b524f2350f1a")!;
    const flow = getRuleById("govbr-3.7.0-accessibility-global-bd6ce6757c97")!;
    expect(referenceTopic("region", "All content by landmarks", [footer])?.candidates).toEqual([]);
    expect(referenceTopic("tabindex", "Elements tabindex greater than zero", [flow])?.candidates).toEqual([]);
    expect(bestPracticeReferences(finding("region", "All page content should be contained by landmarks"))).not.toContainEqual({ id: footer.id, force: footer.force });
  });

  it("H1, hierarquia, rótulo, alvo e tabindex conservam tópicos distintos", () => {
    const sources = [
      ["page-has-heading-one", "Page level-one heading", "govbr-3.7.0-accessibility-global-88d6a1a5da75"],
      ["heading-order", "Heading levels", "govbr-3.7.0-accessibility-global-e436bded3d73"],
      ["label-title-only", "Visible label", "govbr-3.7.0-accessibility-global-25887e6e360f"],
      ["skip-link", "The skip-link target", "govbr-3.7.0-accessibility-global-87639c7875d6"],
      ["tabindex", "tabindex greater than zero", "govbr-3.7.0-accessibility-global-742fd4c4f54b"],
    ];
    for (const [id, help, source] of sources) {
      const r = getRuleById(source)!;
      expect(referenceTopic(id, help, [r])?.candidates, id).toEqual([r]);
      expect(bestPracticeReferences(finding(id, help)), id).toContainEqual({ id: r.id, force: r.force });
    }
    expect(bestPracticeReferences(finding("empty-heading", "Headings should not be empty"))).toEqual([{ id: "emag-1.3" }]);
    expect(bestPracticeReferences(finding("landmark-one-main", "One main landmark"))).toEqual([{ id: "emag-1.8" }]);
  });

  it("força e ausência são preservadas, sem inventar referência por help desconhecido", () => {
    const text = "As células de cabeçalho da tabela devem conter texto descritivo.";
    expect(referenceTopic("empty-table-header", "Table header", [rule(text, "recommended"), rule(text, "especificacao"), rule(text, "example")])?.candidates).toEqual([]);
    expect(referenceTopic("unknown-rule", "Table header", [rule(text)])).toBeNull();
    expect(referenceTopic("__proto__", "Table header", [rule(text)])).toBeNull();
    expect(referenceTopic("constructor", "Table header", [rule(text)])).toBeNull();
    expect(referenceTopic("empty-table-header", "zzz qqq", [rule(text)])).toBeNull();
    expect(bestPracticeReferences(finding("page-has-heading-one", "zzz qqq"))).toEqual([{ id: "emag-1.3" }]);
  });
});
