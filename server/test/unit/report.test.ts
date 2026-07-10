import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFindings, buildReport, renderMarkdown, persistReport } from "../../src/report/report.js";
import type { Finding } from "../../src/schema/finding.js";

const valid: Finding = {
  id: "F-001",
  rule: { id: "ds-token-color", source: "govbr-ds-token", description: "Cores devem usar tokens do DS." },
  element: { locator: "#btn", snippet: "<button>x</button>", page: "http://localhost:3000" },
  evidence: { observed: "background #ff0000", expected: "token do DS", data: { observedHex: "#ff0000" } },
  severity: "moderate",
  nature: "syntactic",
  mode: "display",
  pathway: "deterministic",
};

describe("validateFindings", () => {
  it("accepts a schema-valid deterministic finding", () => {
    const { accepted, rejected } = validateFindings([valid]);
    expect(accepted).toHaveLength(1);
    expect(rejected).toEqual([]);
  });

  it("rejects invalid findings with actionable field errors", () => {
    const { accepted, rejected } = validateFindings([{ id: "F-002", rule: { id: "x" } }]);
    expect(accepted).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errors.join(" ")).toMatch(/rule\.source|element/);
  });

  it("rejects heuristic findings without confirmed verification (C3 gate)", () => {
    const heuristic = { ...valid, id: "F-003", pathway: "heuristic" };
    const { rejected } = validateFindings([heuristic]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errors[0]).toContain("verify_finding");
  });

  it("accepts heuristic findings WITH confirmed verification", () => {
    const heuristic = {
      ...valid,
      id: "F-004",
      pathway: "heuristic",
      verification: { verdict: "confirmed", verifiedBy: "token-registry" },
    };
    const { accepted } = validateFindings([heuristic]);
    expect(accepted).toHaveLength(1);
  });
});

describe("report rendering and persistence", () => {
  it("renders human-readable Markdown with evidence triple and disclaimer", () => {
    const report = buildReport("http://localhost:3000", [valid], "nota de teste");
    const md = renderMarkdown(report);
    expect(md).toContain("# Relatório de validação");
    expect(md).toContain("**Observado:** background #ff0000");
    expect(md).toContain("**Esperado:** token do DS");
    expect(md).toContain("triagem para revisão humana");
    expect(md).toContain("nota de teste");
  });

  it("persists machine JSON + human Markdown side by side", () => {
    const dir = mkdtempSync(join(tmpdir(), "govbr-report-"));
    const report = buildReport("http://localhost:3000/page", [valid]);
    const { jsonPath, markdownPath } = persistReport(report, dir);
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(markdownPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(parsed.summary.total).toBe(1);
    expect(parsed.findings[0].id).toBe("F-001");
  });
});
