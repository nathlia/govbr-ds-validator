import { describe, it, expect } from "vitest";
import { verifyFinding, verdictOf } from "../../src/verify/gate.js";
import { findingSha256 } from "../../src/verify/store.js";
import type { Finding } from "../../src/schema/finding.js";
import { EXPECTED_CONDITIONS } from "../../src/schema/structuredClaims.js";

function candidate(overrides: Partial<Finding> & { rule?: Partial<Finding["rule"]> } = {}): Finding {
  const { rule: ruleOverride, ...rest } = overrides;
  return {
    id: "F-100",
    rule: {
      id: "emag-3.5",
      source: "emag",
      description: "Descrever links clara e sucintamente",
      ...(ruleOverride ?? {}),
    } as Finding["rule"],
    element: { locator: "#link", page: "http://localhost:3000" },
    evidence: { observed: "link 'clique aqui'", expected: "texto de link descritivo" },
    severity: "moderate",
    nature: "semantic",
    mode: "display",
    pathway: "heuristic",
    ...rest,
  } as Finding;
}

describe("verifyFinding — rule existence against versioned registries", () => {
  it("rejects a nonexistent WCAG criterion: wcag-9.9.9 has the right shape and is not a member", async () => {
    const v = await verifyFinding({ finding: candidate({ rule: { id: "wcag-9.9.9", source: "wcag" } }) });
    expect(v.verdict).toBe("rejected");
    expect(v.checks?.ruleExists).toBe("fail");
    expect(v.detail).toContain("9.9.9");
  });

  it("rejects a criterion that WCAG 2.2 removed (4.1.1)", async () => {
    const v = await verifyFinding({ finding: candidate({ rule: { id: "wcag-4.1.1", source: "wcag" } }) });
    expect(v.verdict).toBe("rejected");
    expect(v.detail).toContain("removido");
  });

  it("rejects a malformed WCAG id instead of calling it unverifiable", async () => {
    const v = await verifyFinding({ finding: candidate({ rule: { id: "wcag-contraste", source: "wcag" } }) });
    expect(v.verdict).toBe("rejected");
  });

  it("rejects a nonexistent WCAG cross-reference on an otherwise real rule", async () => {
    const v = await verifyFinding({ finding: candidate({ rule: { wcag: "9.9.9" } }) });
    expect(v.verdict).toBe("rejected");
    expect(v.detail).toContain("Referência WCAG inválida");
  });

  it("rejects a hallucinated e-MAG rule id", async () => {
    const v = await verifyFinding({ finding: candidate({ rule: { id: "emag-9.9" } }) });
    expect(v.verdict).toBe("rejected");
    expect(v.detail).toContain("9.9");
  });

  it("rejects an unknown component in a structure rule", async () => {
    const v = await verifyFinding({
      finding: candidate({ rule: { id: "ds-structure-botaozao-tag", source: "govbr-ds-structure" } }),
    });
    expect(v.verdict).toBe("rejected");
  });

  it("rejects a token check id the oracle never published", async () => {
    const v = await verifyFinding({ finding: candidate({ rule: { id: "ds-token-shadow", source: "govbr-ds-token" } }) });
    expect(v.verdict).toBe("rejected");
    expect(v.checks?.ruleExists).toBe("fail");
  });

  it("rejects a token check that has no norm (font-size, D-32) as not applicable", async () => {
    const v = await verifyFinding({ finding: candidate({ rule: { id: "ds-token-font-size", source: "govbr-ds-token" } }) });
    expect(v.verdict).toBe("rejected");
    expect(v.checks?.ruleExists).toBe("pass");
    expect(v.checks?.applicability).toBe("fail");
  });
});

describe("verifyFinding — no verified violation, no confirmation", () => {
  it("keeps a real e-MAG rule with plausible evidence unverifiable", async () => {
    const v = await verifyFinding({ finding: candidate() });
    expect(v.verdict).toBe("unverifiable");
    expect(v.checks).toMatchObject({ ruleExists: "pass", applicability: "pass", violation: "no-predicate" });
    expect(v.predicate).toBeNull();
  });

  it("keeps a real WCAG criterion unverifiable: a broad criterion selects no predicate", async () => {
    const v = await verifyFinding({ finding: candidate({ rule: { id: "wcag-1.4.3", source: "wcag" } }) });
    expect(v.verdict).toBe("unverifiable");
    expect(v.checks?.violation).toBe("no-predicate");
  });

  it("keeps a supported token claim unverifiable without live, and names the predicate", async () => {
    const v = await verifyFinding({
      finding: candidate({
        rule: { id: "ds-token-color", source: "govbr-ds-token" },
        evidence: {
          observed: "background #ff00ff",
          expected: "token do DS",
          data: {
            property: "background-color",
            observedHex: "#ff00ff",
            expectedCondition: EXPECTED_CONDITIONS.tokenColor,
            expectedToken: "--color-primary-default",
          },
        },
      } as never),
    });
    expect(v.verdict).toBe("unverifiable");
    expect(v.checks?.evidenceConsistent).toBe("pass");
    expect(v.checks?.violation).toBe("not-checked");
    expect(v.predicate).toBe("token-color");
    expect(v.detail).toContain("live=true");
  });

  it("keeps a token claim without the data its predicate needs unverifiable", async () => {
    const v = await verifyFinding({ finding: candidate({ rule: { id: "ds-token-color", source: "govbr-ds-token" } }) });
    expect(v.verdict).toBe("unverifiable");
    expect(v.checks?.violation).toBe("no-predicate");
    expect(v.detail).toContain("evidence.data.property");
  });

  it("reports the registry versions it checked against", async () => {
    const v = await verifyFinding({ finding: candidate() });
    expect(v.registries?.wcag).toContain("WCAG 2.2");
    expect(v.registries?.emag).toContain("e-MAG 3.1");
  });
});

describe("verifyFinding — registry claim consistency", () => {
  it("rejects a claim that a real DS token value is arbitrary", async () => {
    const v = await verifyFinding({
      finding: candidate({
        rule: { id: "ds-token-color", source: "govbr-ds-token" },
        evidence: { observed: "cor fora do DS", expected: "token do DS", data: { observedHex: "#1351b4" } },
      } as never),
    });
    expect(v.verdict).toBe("rejected");
    expect(v.checks?.evidenceConsistent).toBe("fail");
    expect(v.detail).toContain("--");
  });

  it("rejects citation of a token that does not exist", async () => {
    const v = await verifyFinding({
      finding: candidate({
        rule: { id: "ds-token-color", source: "govbr-ds-token" },
        evidence: { observed: "x", expected: "y", data: { expectedToken: "--color-super-azul" } },
      } as never),
    });
    expect(v.verdict).toBe("rejected");
    expect(v.detail).toContain("--color-super-azul");
  });
});

describe("verdict and binding", () => {
  it("confirms only a verified violation; any failed check rejects", () => {
    const base = { ruleExists: "pass", applicability: "pass", evidenceConsistent: "pass" } as const;
    expect(verdictOf({ ...base, violation: "verified" })).toBe("confirmed");
    expect(verdictOf({ ...base, violation: "no-predicate" })).toBe("unverifiable");
    expect(verdictOf({ ...base, violation: "not-checked" })).toBe("unverifiable");
    expect(verdictOf({ ...base, violation: "error" })).toBe("unverifiable");
    expect(verdictOf({ ...base, violation: "contradicted" })).toBe("rejected");
    expect(verdictOf({ ...base, evidenceConsistent: "fail", violation: "verified" })).toBe("rejected");
    expect(verdictOf({ ...base, ruleExists: "unknown", violation: "verified" })).toBe("unverifiable");
  });

  it("binds the verification to the exact payload, ignoring the verification field itself", async () => {
    const finding = candidate();
    const v = await verifyFinding({ finding });
    expect(v.binding?.findingSha256).toBe(findingSha256({ ...finding, verification: v }));
    expect(findingSha256({ ...finding, evidence: { ...finding.evidence, observed: "outra" } })).not.toBe(v.binding?.findingSha256);
  });
});
