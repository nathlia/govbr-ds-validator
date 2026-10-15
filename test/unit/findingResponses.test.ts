import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/schema/finding.js";
import { FindingStore, buildFindingPage, deduplicateFindings, diffFindings } from "../../src/responses/findings.js";

function finding(id: string): Finding {
  return {
    id,
    rule: { id: "ds-token-color", source: "govbr-ds-token", description: "Use a registered color token" },
    element: { locator: `#${id}`, snippet: `<button id="${id}">Example</button>`, page: "http://example.test" },
    evidence: {
      observed: `Unregistered color ${"x".repeat(300)}`,
      expected: "A registered token",
      data: { observedHex: "#ff5733" },
    },
    severity: "moderate",
    nature: "syntactic",
    mode: "display",
    pathway: "deterministic",
  };
}

describe("bounded finding responses", () => {
  const findings = [finding("F-001"), finding("F-002"), finding("F-003")];

  it("uses compact summaries by default and paginates with a cursor", () => {
    const first = buildFindingPage(findings, { limit: 2 });
    expect(first.detail).toBe("summary");
    expect(first.count).toBe(2);
    expect(first.truncated).toBe(true);
    expect(first.nextCursor).toBe(2);
    expect(first.findings[0]).not.toHaveProperty("evidence");
    expect(first.findings[0]).not.toHaveProperty("confidence");

    const second = buildFindingPage(findings, { cursor: first.nextCursor });
    expect(second.count).toBe(1);
    expect(second.truncated).toBe(false);
  });

  it("returns evidence without bulky machine data and full on explicit request", () => {
    const evidence = buildFindingPage(findings, { detail: "evidence" });
    expect(evidence.findings[0]).toHaveProperty("evidence.expected");
    expect(evidence.findings[0]).not.toHaveProperty("evidence.data");
    expect(evidence.findings[0]).not.toHaveProperty("element.snippet");

    const full = buildFindingPage(findings, { detail: "full" });
    expect(full.findings[0]).toHaveProperty("evidence.data.observedHex", "#ff5733");
    expect(full.findings[0]).toHaveProperty("element.snippet");
    expect(JSON.stringify(evidence).length).toBeLessThan(JSON.stringify(full).length);
    expect(JSON.stringify(buildFindingPage(findings)).length).toBeLessThan(JSON.stringify(evidence).length);
  });

  it("honors the character budget while always allowing progress", () => {
    const page = buildFindingPage(findings, { maxChars: 500 });
    expect(page.count).toBe(1);
    expect(page.truncated).toBe(true);
    expect(page.nextCursor).toBe(1);

    const tiny = buildFindingPage(findings, { detail: "full", maxChars: 10 });
    expect(tiny.count).toBe(1);
    expect(tiny.budgetExceeded).toBe(true);
  });

  it("stores and retrieves full findings by id without leaking between stores", () => {
    const store = new FindingStore();
    const scanId = store.putBatch("test", findings.slice(0, 2));
    expect(store.get(["F-002", "F-999"])).toEqual({ found: [findings[1]], missing: ["F-999"] });
    expect(store.getBatch(scanId)).toEqual(findings.slice(0, 2));
    expect(new FindingStore().get(["F-001"]).missing).toEqual(["F-001"]);
  });

  it("deduplicates exact rule/element/property findings but preserves distinct properties", () => {
    const original = finding("F-001");
    const duplicate = {
      ...finding("F-999"),
      element: { ...original.element },
      evidence: { ...original.evidence },
    };
    const otherProperty: Finding = {
      ...finding("F-003"),
      element: { ...original.element },
      evidence: { ...original.evidence, data: { property: "border-color" } },
    };
    original.evidence.data = { property: "background-color" };
    duplicate.evidence.data = { property: "background-color" };

    const result = deduplicateFindings([original, duplicate, otherProperty]);
    expect(result.findings).toHaveLength(2);
    expect(result.merged).toBe(1);
    expect(result.key).toContain("rule.id");
  });

  it("diffs finding batches by stable identity rather than process-local ids", () => {
    const before = [finding("F-001")];
    const sameWithNewId = { ...finding("F-999"), element: { ...before[0].element } };
    const added = finding("F-002");
    expect(diffFindings(before, [sameWithNewId, added])).toEqual({
      added: ["F-002"],
      removed: [],
      unchanged: 1,
      evidenceChanged: [],
    });
  });
});
