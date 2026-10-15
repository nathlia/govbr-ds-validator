/**
 * Famílias de achados (2.11.0, NAT-84): projeção de apresentação que agrupa instâncias idênticas
 * sem perder nenhum membro, sem herdar veredito e sem mudar contagens.
 */
import { describe, expect, it } from "vitest";
import type { Finding, Verification } from "../../src/schema/finding.js";
import {
  buildFamilyMemberPage,
  buildFamilyPage,
  evidenceSignature,
  familyIdOf,
  groupFamilies,
} from "../../src/responses/families.js";
import { buildFindingPage, deduplicateFindings, diffFindings } from "../../src/responses/findings.js";
import { summarize } from "../../src/report/report.js";

const PAGE = "http://example.test/agenda";

/** Um dia do calendário com raio fora da escala — a mesma alegação repetida 40 vezes. */
function calendarDay(day: number, observed = "6px"): Finding {
  return {
    id: `F-${String(day).padStart(3, "0")}`,
    rule: {
      id: "ds-token-radius",
      source: "govbr-ds-token",
      description: "Raio na escala do DS",
      implements: ["govbr-3.7.0-radius"],
    },
    element: { locator: `.calendario > button:nth-of-type(${day})`, snippet: `<button>${day}</button>`, page: PAGE },
    evidence: {
      observed: `border-radius: ${observed} fora da escala do DS`,
      expected: "0, 4, 8 ou 16px, ou pílula",
      data: { property: "border-radius", observed, expectedCondition: "govbr-ds-radius-scale" },
    },
    severity: "minor",
    nature: "syntactic",
    mode: "display",
    pathway: "deterministic",
  };
}

/** Linha de tabela com botão só-ícone sem nome (e-MAG 2.2). */
function tableRowButton(row: number): Finding {
  return {
    id: `F-${String(100 + row)}`,
    rule: { id: "emag-2.2", source: "emag", description: "Objetos programáveis acessíveis", wcag: "4.1.2", implements: ["emag-2.2"] },
    element: { locator: `tr:nth-of-type(${row}) > td:nth-of-type(9) br-button >>> button`, page: PAGE },
    evidence: {
      observed: "Elemento interativo apenas com ícone, sem nome acessível (br-button)",
      expected: "Nome acessível não vazio",
      data: { component: "button", hasIconOnly: true, accessibleName: "" },
    },
    severity: "serious",
    nature: "syntactic",
    mode: "interaction",
    pathway: "deterministic",
  };
}

function contrastCell(row: number, ratio: string, bg: string): Finding {
  return {
    id: `F-${String(200 + row)}`,
    rule: { id: "color-contrast", source: "axe-core", description: "Contraste mínimo", wcag: "1.4.3" },
    element: { locator: `tr:nth-child(${row}) > td:nth-child(8) > div`, page: PAGE },
    evidence: {
      observed: `Element has insufficient color contrast of ${ratio} (foreground color: #ffffff, background color: ${bg})`,
      expected: "Elements must meet minimum color contrast ratio thresholds",
      data: { emagId: "4.1" },
    },
    severity: "serious",
    nature: "syntactic",
    mode: "display",
    pathway: "deterministic",
  };
}

const forty = () => Array.from({ length: 40 }, (_, i) => calendarDay(i + 1));

function walkAllMembers(findings: Finding[], familyId: string, limit: number, options = {}) {
  const ids: string[] = [];
  let cursor: number | undefined = 0;
  let pages = 0;
  while (cursor !== undefined) {
    const page = buildFamilyMemberPage(findings, familyId, { cursor, limit, ...options })!;
    ids.push(...(page.members as { id: string }[]).map((m) => m.id));
    cursor = page.nextCursor;
    pages += 1;
    if (pages > 100) throw new Error("cursor não termina");
  }
  return { ids, pages };
}

describe("finding families", () => {
  it("40 identical instances → 1 family with 40 members and 40 retrievable ids", () => {
    const findings = forty();
    const page = buildFamilyPage(findings);
    expect(page.totalFamilies).toBe(1);
    expect(page.totalFindings).toBe(40);
    const family = page.families[0] as {
      familyId: string; count: number; memberIds: string[]; membersNotReturned: number; nextMemberCursor?: number;
      example: { id: string }; property: string;
    };
    expect(family.count).toBe(40);
    expect(family.property).toBe("border-radius");
    expect(family.example.id).toBe("F-001");
    // summary: até memberLimit ids, com cursor para o resto
    expect(family.memberIds).toHaveLength(25);
    expect(family.membersNotReturned).toBe(15);
    expect(family.nextMemberCursor).toBe(25);
    expect(page.complete).toBe(false);
    expect(page.partial).toMatchObject({ reasons: ["member-limit"], membersNotReturned: 15, familiesNotReturned: 0 });

    const { ids, pages } = walkAllMembers(findings, family.familyId, 7);
    expect(ids).toEqual(findings.map((f) => f.id));
    expect(new Set(ids).size).toBe(40);
    expect(pages).toBe(6);

    const all = buildFamilyPage(findings, { memberLimit: 40 });
    expect((all.families[0] as { memberIds: string[] }).memberIds).toHaveLength(40);
    expect(all.complete).toBe(true);
    expect(all.partial).toBeUndefined();
  });

  it("members keep id, locator, value, evidence signature and their own status", () => {
    const findings = forty();
    const familyId = familyIdOf(findings[0]);
    const page = buildFamilyMemberPage(findings, familyId, { limit: 2, detail: "evidence" })!;
    expect(page.members[1]).toEqual({
      id: "F-002",
      locator: ".calendario > button:nth-of-type(2)",
      value: "border-radius: 6px",
      evidenceSignature: evidenceSignature(findings[1]),
      identity: expect.stringMatching(/^id-[a-f0-9]{12}$/),
      status: { acceptedByAgent: null, ruleApplicable: "not-checked", confirmedByGate: null, gateVerdict: null },
      evidence: { observed: findings[1].evidence.observed, expected: findings[1].evidence.expected },
    });
    const full = buildFamilyMemberPage(findings, familyId, { limit: 1, detail: "full" })!;
    expect((full.members[0] as { finding: Finding }).finding).toEqual(findings[0]);
  });

  it("one contradictory instance does not inherit the others' verdict", () => {
    const findings = forty();
    const verdictFor = (finding: Finding): Verification => ({
      verdict: finding.id === "F-017" ? "rejected" : "confirmed",
      verifiedBy: "test",
      checks: {
        ruleExists: "pass",
        applicability: "pass",
        evidenceConsistent: finding.id === "F-017" ? "fail" : "pass",
        violation: finding.id === "F-017" ? "contradicted" : "verified",
      },
    });
    const page = buildFamilyPage(findings, { verificationFor: verdictFor });
    const family = page.families[0] as Record<string, unknown>;
    expect(family.gate).toEqual({ confirmed: 39, rejected: 1, unverifiable: 0, notVerified: 0 });
    expect(family).not.toHaveProperty("verdict");

    const members = buildFamilyMemberPage(findings, family.familyId as string, { limit: 200, verificationFor: verdictFor })!;
    const byId = new Map((members.members as { id: string; status: Record<string, unknown> }[]).map((m) => [m.id, m.status]));
    expect(byId.get("F-017")).toEqual({ acceptedByAgent: null, ruleApplicable: "pass", confirmedByGate: false, gateVerdict: "rejected" });
    expect(byId.get("F-016")).toEqual({ acceptedByAgent: null, ruleApplicable: "pass", confirmedByGate: true, gateVerdict: "confirmed" });
    expect([...byId.values()].filter((s) => s.confirmedByGate === true)).toHaveLength(39);
  });

  it("an instance with a different value is its own family and stays recoverable", () => {
    const findings = [...forty(), calendarDay(41, "3px")];
    const page = buildFamilyPage(findings, { memberLimit: 100 });
    expect(page.totalFamilies).toBe(2);
    const [big, odd] = page.families as { count: number; memberIds: string[]; value: string }[];
    expect(big.count).toBe(40);
    expect(odd).toMatchObject({ count: 1, memberIds: ["F-041"], value: "border-radius: 3px" });
  });

  it("an identity that reappears with modified evidence keeps a separate signature/version", () => {
    const before = calendarDay(5);
    const changed: Finding = {
      ...calendarDay(5),
      id: "F-905",
      evidence: { ...before.evidence, observed: "border-radius: 6px fora da escala (reaberto)", data: { ...before.evidence.data, authored: ".dia" } },
    };
    // mesma identidade (regra, página, localizador, propriedade), outra evidência
    const findings = [...forty(), changed];
    const page = buildFamilyPage(findings, { memberLimit: 100 });
    expect(page.totalFamilies).toBe(2);
    expect(page.identityVersions).toHaveLength(1);
    const versions = page.identityVersions![0].versions;
    expect(versions.map((v) => v.memberIds)).toEqual([["F-005"], ["F-905"]]);
    expect(versions[0].evidenceSignature).not.toBe(versions[1].evidenceSignature);
    expect(versions[0].familyId).not.toBe(versions[1].familyId);

    // a diferença entre lotes também avisa a evidência alterada
    expect(diffFindings([before], [changed])).toEqual({
      added: [], removed: [], unchanged: 1, evidenceChanged: [{ previousId: "F-005", currentId: "F-905" }],
    });
  });

  it("never merges different states, norms, modes or severities", () => {
    const base = calendarDay(1);
    expect(familyIdOf(base, "sha256:a")).not.toBe(familyIdOf(base, "sha256:b"));
    expect(familyIdOf(base)).not.toBe(familyIdOf({ ...base, mode: "interaction" }));
    expect(familyIdOf(base)).not.toBe(familyIdOf({ ...base, severity: "serious" }));
    expect(familyIdOf(base)).not.toBe(familyIdOf({ ...base, rule: { ...base.rule, implements: ["govbr-outra"] } }));
    expect(familyIdOf(base)).not.toBe(familyIdOf({ ...base, rule: { ...base.rule, id: "ds-token-spacing" } }));
    expect(familyIdOf(base)).not.toBe(familyIdOf({ ...base, element: { ...base.element, page: "http://example.test/outra" } }));
    // localizador, snippet, id e trace não entram na chave
    expect(familyIdOf(base)).toBe(familyIdOf({ ...calendarDay(2), id: "F-999", trace: "x" }));
  });

  it("table regression: identical row buttons group, different contrast values do not", () => {
    const findings = [
      ...Array.from({ length: 10 }, (_, i) => tableRowButton(i + 1)),
      ...Array.from({ length: 6 }, (_, i) => contrastCell(i + 1, "3.14", "#4f97d1")),
      ...Array.from({ length: 4 }, (_, i) => contrastCell(i + 7, "2.90", "#5992ed")),
    ];
    const page = buildFamilyPage(findings);
    expect((page.families as { count: number }[]).map((f) => f.count)).toEqual([10, 6, 4]);
    expect(page.complete).toBe(true);
  });

  it("truncation, budget and time limits give a partial result with reason and members not returned", () => {
    const findings = [
      ...forty(),
      ...Array.from({ length: 10 }, (_, i) => tableRowButton(i + 1)),
      contrastCell(1, "3.14", "#4f97d1"),
    ];
    const limited = buildFamilyPage(findings, { limit: 1, memberLimit: 40 });
    expect(limited.count).toBe(1);
    expect(limited.truncated).toBe(true);
    expect(limited.partial).toEqual({ reasons: ["limit"], familiesNotReturned: 2, membersNotReturned: 11, nextCursor: 1 });
    const next = buildFamilyPage(findings, { cursor: limited.nextCursor, memberLimit: 40 });
    expect(next.count).toBe(2);
    expect(next.complete).toBe(true);
    expect(next.truncated).toBe(false);

    const budget = buildFamilyPage(findings, { maxChars: 1_000, memberLimit: 40 });
    expect(budget.count).toBe(1);
    expect(budget.partial?.reasons).toEqual(["char-budget"]);
    expect(budget.partial?.membersNotReturned).toBe(11);

    let clock = 0;
    const timed = buildFamilyPage(findings, { memberLimit: 40, deadline: 0, now: () => clock++ });
    expect(timed.count).toBe(1);
    expect(timed.partial?.reasons).toEqual(["time-limit"]);
    expect(timed.partial?.membersNotReturned).toBe(11);

    const familyId = familyIdOf(findings[0]);
    const memberBudget = buildFamilyMemberPage(findings, familyId, { maxChars: 1_000 })!;
    expect(memberBudget.complete).toBe(false);
    expect(memberBudget.partial?.reasons).toEqual(["char-budget"]);
    expect(memberBudget.partial?.membersNotReturned).toBe(40 - memberBudget.count);
    expect(walkAllMembers(findings, familyId, 200, { maxChars: 1_000 }).ids).toHaveLength(40);
  });

  it("is presentation only: input, summary, dedup and the findings page are unchanged", () => {
    const findings = [...forty(), ...Array.from({ length: 10 }, (_, i) => tableRowButton(i + 1))];
    const frozen = JSON.stringify(findings);
    const summary = summarize(findings);
    const dedup = deduplicateFindings(findings);
    const page = buildFindingPage(findings, { limit: 200 });

    const families = buildFamilyPage(findings, { memberLimit: 500 });
    groupFamilies(findings);

    expect(JSON.stringify(findings)).toBe(frozen);
    expect(summarize(findings)).toEqual(summary);
    expect(deduplicateFindings(findings).outputCount).toBe(dedup.outputCount);
    expect(buildFindingPage(findings, { limit: 200 })).toEqual(page);
    const listed = (families.families as { memberIds: string[]; count: number }[]);
    expect(listed.reduce((sum, f) => sum + f.count, 0)).toBe(findings.length);
    expect(listed.flatMap((f) => f.memberIds).sort()).toEqual(findings.map((f) => f.id).sort());
  });

  it("the findings page no longer claims certainty and reports why it is partial", () => {
    const page = buildFindingPage(forty(), { limit: 10 });
    expect(page.findings[0]).not.toHaveProperty("confidence");
    expect(page.partial).toEqual({ reasons: ["limit"], notReturned: 30 });
  });
});
