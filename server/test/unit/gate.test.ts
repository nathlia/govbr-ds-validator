import { describe, it, expect } from "vitest";
import { verifyFinding } from "../../src/verify/gate.js";
import type { Finding } from "../../src/schema/finding.js";

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

describe("verifyFinding — rule grounding (layer 1)", () => {
  it("confirms a finding citing a real e-MAG rule", async () => {
    const v = await verifyFinding({ finding: candidate() });
    expect(v.verdict).toBe("confirmed");
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
});

describe("verifyFinding — token claim consistency (layer 2)", () => {
  it("rejects a claim that a real DS token value is arbitrary", async () => {
    const v = await verifyFinding({
      finding: candidate({
        rule: { id: "ds-token-color", source: "govbr-ds-token" },
        evidence: {
          observed: "cor fora do DS",
          expected: "token do DS",
          data: { observedHex: "#1351b4" }, // IS the primary token value
        },
      } as never),
    });
    expect(v.verdict).toBe("rejected");
    expect(v.detail).toContain("--");
  });

  it("rejects citation of a token that does not exist", async () => {
    const v = await verifyFinding({
      finding: candidate({
        rule: { id: "ds-token-color", source: "govbr-ds-token" },
        evidence: {
          observed: "x",
          expected: "y",
          data: { expectedToken: "--color-super-azul" },
        },
      } as never),
    });
    expect(v.verdict).toBe("rejected");
    expect(v.detail).toContain("--color-super-azul");
  });

  it("confirms a consistent token claim", async () => {
    const v = await verifyFinding({
      finding: candidate({
        rule: { id: "ds-token-color", source: "govbr-ds-token" },
        evidence: {
          observed: "background #ff00ff",
          expected: "token do DS",
          data: { observedHex: "#ff00ff", expectedToken: "--color-primary-default" },
        },
      } as never),
    });
    expect(v.verdict).toBe("confirmed");
  });
});
