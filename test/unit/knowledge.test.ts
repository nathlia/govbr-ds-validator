import { describe, it, expect, vi } from "vitest";
import {
  getKnowledgeBase,
  filterRules,
  getEvidence,
  getRuleById,
  getKnowledgeConflicts,
  getComponentDefects,
  getEmagValidationTemplate,
  checkVersionAlignment,
  warnOnVersionMismatch,
} from "../../src/data/knowledge.js";

describe("knowledge base loader (D-11)", () => {
  // 2.12.0: a versão servida por padrão é a literal (2.971 regras do corpus + 67 registros herdados).
  it("loads all 3038 records of the served version with zero schema errors", () => {
    const kb = getKnowledgeBase();
    expect(kb.meta.schemaErrors).toEqual([]);
    expect(kb.meta.totalRules).toBe(3038);
    expect(kb.meta.dsVersion).toBe("3.7.0");
    expect(kb.meta.knowledgeVersion).toBe("3.7.0-literal-2026-10-15");
  });

  it("partitions rules into 3004 normative + 34 evidence records", () => {
    const kb = getKnowledgeBase();
    expect(kb.meta.normativeRules).toBe(3004);
    expect(kb.meta.evidenceRules).toBe(34);
    expect(kb.meta.normativeRules + kb.meta.evidenceRules).toBe(kb.meta.totalRules);
  });

  it("indexes rules by deterministic id", () => {
    const kb = getKnowledgeBase();
    const first = kb.rules[0];
    expect(getRuleById(first.id)).toBe(first);
    expect(first.id).toMatch(/^govbr-3\.7\.0-/);
    expect(getRuleById("no-such-rule")).toBeUndefined();
  });
});

describe("filterRules — the get_ds_rules backend", () => {
  it("force=required returns the 1102 required rules", () => {
    const rules = filterRules({ force: "required" });
    expect(rules).toHaveLength(1102);
    expect(rules.every((r) => r.force === "required")).toBe(true);
  });

  it("force=prohibited returns the 155 prohibited rules", () => {
    expect(filterRules({ force: "prohibited" })).toHaveLength(155);
  });

  it("component=button returns only button rules", () => {
    const rules = filterRules({ component: "button" });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.component === "button")).toBe(true);
  });

  it("filters combine (automatable + high confidence — the D-12 corpus candidate set)", () => {
    const candidates = [...filterRules({ force: "required", automatable: true, automationConfidence: "high" }), ...filterRules({ force: "prohibited", automatable: true, automationConfidence: "high" })];
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((r) => r.automatable && r.automationConfidence === "high")).toBe(true);
  });

  it("validationStrategy filter matches the D-12 mechanism counts (normative only)", () => {
    const kbDom = filterRules({ validationStrategy: "dom" });
    expect(kbDom.every((r) => r.validationStrategy === "dom")).toBe(true);
    const keyboard = filterRules({ validationStrategy: "keyboard-interaction" });
    expect(keyboard.length).toBeGreaterThan(0);
  });

  it("standard filter distinguishes eMAG from DS rules", () => {
    const emag = filterRules({ standard: "eMAG" });
    expect(emag.length).toBeGreaterThan(0);
    expect(emag.every((r) => r.standard === "eMAG")).toBe(true);
  });

  it("free-text query searches title/normalizedRule/originalText", () => {
    const hits = filterRules({ query: "aria-label" });
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("D-10 precedence: evidence never mixes into normative listings", () => {
  it("no filter combination without force returns an example record", () => {
    for (const filter of [
      {},
      { component: "accordion" },
      { category: "component" },
      { automatable: true },
      { query: "button" },
    ]) {
      const rules = filterRules(filter);
      expect(rules.some((r) => r.force === "example")).toBe(false);
    }
  });

  it("force=required never returns an example record", () => {
    expect(filterRules({ force: "required" }).some((r) => r.force === "example")).toBe(false);
  });

  it("evidence is served through its own channel", () => {
    const evidence = getEvidence();
    expect(evidence).toHaveLength(34);
    expect(evidence.every((r) => r.force === "example")).toBe(true);
  });
});

describe("defect awareness (D-10 bucket 3)", () => {
  it("exposes the 6 official-package accessibility anomalies", () => {
    const { packageAudit } = getKnowledgeConflicts();
    expect(packageAudit.accessibilityFindings).toHaveLength(6);
  });

  it("card carries 4 missing-alt defects; wizard carries 2 broken aria-labelledby", () => {
    const card = getComponentDefects("card");
    expect(card).toHaveLength(4);
    expect(card.every((f) => f.type === "image-missing-alt")).toBe(true);

    const wizard = getComponentDefects("wizard");
    expect(wizard).toHaveLength(2);

    expect(getComponentDefects("button")).toEqual([]);
  });
});

describe("e-MAG validation templates (Phase 2.6)", () => {
  it("resolves a template for every one of the 45 recommendations served by the oracle", () => {
    for (const id of ["1.1", "2.1", "3.12", "4.4", "5.5", "6.7", "6.8"]) {
      const t = getEmagValidationTemplate(id);
      expect(t, `template for ${id}`).toBeDefined();
      expect(t!.recommendation).toBe(id);
      expect(t!.checks.length).toBeGreaterThan(0);
    }
  });

  it("returns undefined for unknown recommendations", () => {
    expect(getEmagValidationTemplate("9.9")).toBeUndefined();
  });
});

describe("version guard (Phase 2.5)", () => {
  it("aligns when the installed version matches the KB dsVersion", () => {
    const log = vi.fn();
    const alignment = warnOnVersionMismatch("3.7.0", log);
    expect(alignment.aligned).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs a warning on a mismatched version string", () => {
    const log = vi.fn();
    const alignment = warnOnVersionMismatch("9.9.9", log);
    expect(alignment.aligned).toBe(false);
    expect(alignment.kbVersion).toBe("3.7.0");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toContain("9.9.9");
    expect(log.mock.calls[0][0]).toContain("3.7.0");
  });

  it("detects the actually installed @govbr-ds/core", () => {
    const alignment = checkVersionAlignment();
    expect(alignment.installedVersion).not.toBeNull();
  });
});
