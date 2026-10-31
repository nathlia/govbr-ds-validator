import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emagUnits, computeEmagUnits, legacyResolution, normativeUnit, computeNormativeUnit, locateLiteralParagraph } from "../../src/data/normativeUnits.js";
import type { KnowledgeRule } from "../../src/data/knowledge.js";
import { getKnowledgeBase, getEvidence, useKnowledgeVersion } from "../../src/data/knowledge.js";
import { runKnowledgeLocked, resetKnowledgeLock } from "../../src/data/lock.js";

afterEach(() => { useKnowledgeVersion(undefined); resetKnowledgeLock(); });
describe("NAT-96 derived source context", () => {
  it.each(["1.7", "3.9", "4.4"])("retains title, independent literal clauses and cited source for eMAG %s", (id) => {
    const context = emagUnits(id);
    expect(context.clauses.length).toBeGreaterThan(1);
    expect(context.clauses[0].force).toBe("recommended");
    expect(context.clauses.some((c) => c.force === "required")).toBe(true);
    expect(context.clauses.every((c) => c.applicability === "unknown" && c.source.url)).toBe(true);
    const section = context.sourceContext!;
    const snapshot = readFileSync(join(import.meta.dirname, "../../data/knowledge/versions", context.knowledgeVersion.replace(/\+emenda-\d+$/, ""), section.source.snapshotFile), "utf8").replace(/\r\n/g, "\n");
    const [start, end] = section.source.snapshotCharRange;
    expect(snapshot.slice(start, end)).toBe(section.text);
    expect(section.source.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    if (id === "3.9") expect(section.text).toContain("Em casos de tabelas extensas");
    if (id === "1.7") expect(context.clauses.map((c) => c.force)).toContain("permitted");
  });

  it("repeated headings require an unambiguous matching ancestor path", () => {
    const text = "# A\n\n## Uso\n\nDeve separar.\n\n# B\n\n## Uso\n\nDeve separar.\n";
    const rule = { originalText: "Deve separar.", source: { section: "Uso", sectionPath: "B > Uso" } } as KnowledgeRule;
    const location = locateLiteralParagraph(text, rule)!;
    expect(location.start).toBe(text.lastIndexOf("Deve separar."));
    expect(locateLiteralParagraph(text, { ...rule, source: { ...rule.source, sectionPath: "Uso" } })).toBeNull();
    const wrongPath = "# A\n\n## Uso\n\nDeve separar.\n\n# B\n\n## Uso\n\nTexto diferente.\n";
    expect(locateLiteralParagraph(wrongPath, rule)).toBeNull();
  });

  it("force selection of the main rule preserves recommended/permitted context alternatives", () => {
    const rule = getKnowledgeBase().rules.find((r) => r.emagReferences.includes("1.7") && r.force === "required")!;
    const unit = normativeUnit(rule)!;
    expect(unit.mainClause.force).toBe("required");
    expect(unit.adjacentClauses.some((c) => c.force === "recommended")).toBe(true);
    expect(unit.adjacentClauses.some((c) => c.force === "permitted")).toBe(true);
  });

  it("upload exception, pagination and other component fragments retain adjacent literal source", () => {
    const rules = getKnowledgeBase().rules;
    const upload = rules.find((r) => r.component === "upload" && r.originalText.includes("placeholder") && r.source.section === "Tom e voz")!;
    expect(normativeUnit(upload)!.sourceContext!.text).toContain("Se houver algum motivo especial");
    for (const component of ["pagination", "button", "input"]) {
      const rule = rules.find((r) => r.component === component && r.source.corpusFile)!;
      expect(normativeUnit(rule)!.sourceContext).not.toBeNull();
    }
    expect(normativeUnit(getEvidence()[0])).toBeUndefined();
  });

  it("legacy maps expose only existing exact/partial successors or explicit absence", () => {
    const base = getKnowledgeBase();
    const resolutions = [...base.legacyById.values()].map((rule) => {
      expect(normativeUnit(rule)).toBeUndefined();
      const resolution = legacyResolution(rule)!;
      for (const successor of resolution.successors) {
        expect(rule.legacy!.supersededBy).toContain(successor.id);
        expect(successor.relationship).toBe(successor.originalText === rule.originalText ? "exact" : "partial");
      }
      return resolution;
    });
    expect(resolutions.some((r) => r.status === "no-audited-successor")).toBe(true);
    expect(resolutions.some((r) => r.successors.some((s) => s.relationship === "exact"))).toBe(true);
    expect(resolutions.some((r) => r.successors.some((s) => s.relationship === "partial"))).toBe(true);
  });

  it("memo returns output identical to the uncached computation, reused per rule id", () => {
    const base = getKnowledgeBase();
    const sample = base.rules.filter((r) => r.source.corpusFile && r.force !== "example").slice(0, 200);
    for (const rule of sample) {
      const cached = normativeUnit(rule);
      expect(cached).toEqual(computeNormativeUnit(rule));
      expect(normativeUnit(rule)).toBe(cached);
    }
    const all = base.rules.filter((r) => r.force !== "example" && !r.legacy && r.source.corpusFile);
    const siblings = (r: KnowledgeRule) => all.filter((c) => c.id !== r.id && c.source.corpusFile === r.source.corpusFile && c.source.sectionPath === r.source.sectionPath).length;
    const rich = sample.find((r) => siblings(r) > 0)!;
    expect(normativeUnit(rich)!.adjacentClauses).toHaveLength(siblings(rich));
    expect(Object.isFrozen(normativeUnit(rich)!.adjacentClauses)).toBe(true);
    for (const id of ["1.7", "3.9", "4.4"]) {
      expect(emagUnits(id)).toEqual(computeEmagUnits(id));
      expect(emagUnits(id)).toBe(emagUnits(id));
    }
    // A switch of KB version builds a new KnowledgeBase, so the memo cannot leak across versions.
    useKnowledgeVersion("3.7.0");
    expect(emagUnits("3.9").sourceContext).toBeNull();
    useKnowledgeVersion(undefined);
    expect(emagUnits("3.9").sourceContext).not.toBeNull();
  });

  it("historical KB stays historical; knowledge lock prevents derived context exposure", () => {
    useKnowledgeVersion("3.7.0");
    expect(emagUnits("3.9").knowledgeVersion).toBe("3.7.0");
    expect(emagUnits("3.9").sourceContext).toBeNull();
    expect(() => runKnowledgeLocked(() => emagUnits("3.9"))).toThrow(/knowledge-free/);
  });
});
