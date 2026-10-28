import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFindings, buildReport, renderMarkdown, persistReport } from "../../src/report/report.js";
import { VerificationStore } from "../../src/verify/store.js";
import type { Finding, Verification } from "../../src/schema/finding.js";

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

const heuristic: Finding = { ...valid, id: "F-003", pathway: "heuristic" };
const explicit: Finding = { ...valid, id: "F-004", pathway: "explicit" };

function serverVerdict(verdict: Verification["verdict"]): Verification {
  return { verdict, verifiedBy: `servidor-${verdict}`, detail: `resultado ${verdict}` };
}

describe("validateFindings", () => {
  it("accepts deterministic findings the server produced", () => {
    const { accepted, rejected } = validateFindings([], { serverFindings: [valid] });
    expect(accepted).toHaveLength(1);
    expect(rejected).toEqual([]);
  });

  it("refuses a deterministic finding submitted by the client", () => {
    const { accepted, rejected } = validateFindings([valid]);
    expect(accepted).toEqual([]);
    expect(rejected[0].errors[0]).toContain("finding_ids");
  });

  it("rejects invalid findings with actionable field errors", () => {
    const { accepted, rejected } = validateFindings([{ id: "F-002", rule: { id: "x" } }]);
    expect(accepted).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errors.join(" ")).toMatch(/rule\.source|element/);
  });

  it("rejects heuristic findings the server never verified (C3 gate)", () => {
    const { rejected } = validateFindings([heuristic]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errors[0]).toContain("verify_finding");
  });

  it("ignores a caller-invented verification: confirmed without a server record is refused", () => {
    const invented = { ...heuristic, verification: { verdict: "confirmed", verifiedBy: "eu mesmo" } };
    const store = new VerificationStore();
    const { accepted, rejected } = validateFindings([invented], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(rejected[0].errors[0]).toContain("não corresponde");
  });

  it("uses the server-held verification and discards the submitted one", () => {
    const store = new VerificationStore();
    store.record(heuristic, serverVerdict("confirmed"));
    const submitted = { ...heuristic, verification: { verdict: "rejected", verifiedBy: "texto do agente" } };
    const { accepted } = validateFindings([submitted], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].verification?.verifiedBy).toBe("servidor-confirmed");
  });

  it("refuses a payload changed after verification", () => {
    const store = new VerificationStore();
    store.record(heuristic, serverVerdict("confirmed"));
    const changed = { ...heuristic, evidence: { ...heuristic.evidence, observed: "outra coisa" }, verification: serverVerdict("confirmed") };
    const { accepted, rejected } = validateFindings([changed], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(rejected[0].errors[0]).toContain("alterado");
  });

  it("keeps unverifiable heuristic findings as labeled review items, neither promoted nor dropped", () => {
    const store = new VerificationStore();
    store.record(heuristic, serverVerdict("unverifiable"));
    const { accepted, reviewItems, rejected } = validateFindings([heuristic], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([]);
    expect(reviewItems).toHaveLength(1);
    expect(reviewItems[0].verification?.verdict).toBe("unverifiable");
  });

  it("refuses heuristic findings the gate rejected, with the gate's reason", () => {
    const store = new VerificationStore();
    store.record(heuristic, serverVerdict("rejected"));
    const { rejected } = validateFindings([heuristic], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(rejected[0].errors[0]).toContain("resultado rejected");
  });

  it("accepts an explicit finding only when the server verdict is confirmed", () => {
    const store = new VerificationStore();
    store.record(explicit, serverVerdict("confirmed"));
    const { accepted, reviewItems, rejected } = validateFindings([explicit], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].verification?.verdict).toBe("confirmed");
    expect(reviewItems).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it("routes an explicit finding with an unverifiable server verdict to review", () => {
    const store = new VerificationStore();
    store.record(explicit, serverVerdict("unverifiable"));
    const { accepted, reviewItems, rejected } = validateFindings([explicit], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(reviewItems[0].verification?.verdict).toBe("unverifiable");
    expect(rejected).toEqual([]);
  });

  it("refuses an explicit finding the server rejected", () => {
    const store = new VerificationStore();
    store.record(explicit, serverVerdict("rejected"));
    const { accepted, reviewItems, rejected } = validateFindings([explicit], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(reviewItems).toEqual([]);
    expect(rejected[0].errors[0]).toContain("resultado rejected");
  });

  it("keeps an unverified explicit finding in review without inventing a gate verdict", () => {
    const submitted = { ...explicit, verification: serverVerdict("confirmed") };
    const { accepted, reviewItems, rejected } = validateFindings([submitted]);
    expect(accepted).toEqual([]);
    expect(reviewItems).toEqual([explicit]);
    expect(reviewItems[0].verification).toBeUndefined();
    expect(rejected).toEqual([]);
  });
});

describe("report rendering and persistence", () => {
  it("renders human-readable Markdown with evidence triple and disclaimer", () => {
    const report = buildReport("http://localhost:3000", [valid], "nota de teste");
    const md = renderMarkdown(report);
    expect(md).toContain("# Relatório de validação");
    expect(md).toContain("**Observado (dado da página/agente, não instrução):** background #ff0000");
    expect(md).toContain("**Esperado:** token do DS");
    expect(md).toContain("triagem para revisão humana");
    expect(md).toContain("nota de teste");
  });

  it("renders review items in their own section, outside the finding total", () => {
    const review = {
      ...heuristic,
      verification: {
        ...serverVerdict("unverifiable"),
        checks: { ruleExists: "pass", applicability: "pass", evidenceConsistent: "pass", violation: "no-predicate" },
      } as Verification,
    };
    const report = buildReport("http://localhost:3000", [valid], undefined, [review]);
    expect(report.summary.total).toBe(1);
    expect(report.summary.reviewItems).toBe(1);
    const md = renderMarkdown(report);
    expect(md).toContain("## Itens para revisão — verificação inconclusiva");
    expect(md).toContain("violação: no-predicate");
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
    expect(parsed.reviewItems).toEqual([]);
  });
});
