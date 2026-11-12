import { describe, expect, it } from "vitest";
import { ANTECEDENT_REVIEWED_OUT, antecedentOf } from "../../src/data/antecedent.js";
import { getKnowledgeBase } from "../../src/data/knowledge.js";

describe("3.7.11 — antecedentes tirados na revisão à mão", () => {
  it("as quatro cláusulas revisadas ficam sem antecedente; a do arrastar arquivos continua com o dela", () => {
    const rules = getKnowledgeBase().rules;
    for (const suffix of ANTECEDENT_REVIEWED_OUT) {
      const rule = rules.find((r) => r.id.endsWith(suffix));
      expect(rule, suffix).toBeDefined();
      expect(antecedentOf(rule!, false), suffix).toBeUndefined();
      expect(antecedentOf(rule!, true), suffix).toBeUndefined();
    }
    const withOne = rules.filter((r) => antecedentOf(r, false));
    expect(withOne.length).toBeGreaterThan(100);
    expect(withOne.some((r) => antecedentOf(r, false)!.id.endsWith("upload-f0d98f9e5880"))).toBe(true);
  });
});
