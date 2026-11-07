import { describe, expect, it } from "vitest";
import { assembleScan, enforceCeiling, investigateFor } from "../../src/responses/scan.js";
import { pageInvestigateClauses, pageChecklistRules } from "../../src/tools/pageChecklist.js";
import { oracleFullyMeasures } from "../../src/tools/oracleCoverage.js";
import { procedureOf } from "../../src/tools/componentChecklist.js";

const globals = () => pageInvestigateClauses(100);
function investigation(components: string[]) {
  return investigateFor(components, "S-global", () => ({}), () => ({ strong: 2, unmeasured: 2 }),
    () => ({ total: 2, clauses: [{ citeAs: "component-rule", text: "Parte da caixa no componente.", how: "medir a posição da parte", short: "posição da parte" }] }),
    new Set(), globals());
}
const makeHead = (components: string[]) => ({
  contract: "oraculo-resposta/1.0.0", kind: "scan", scanId: "S-global",
  state: { recipe: { viewport: { width: 1280, height: 900 } }, observed: { text: "x".repeat(5000) } },
  checksRun: { limits: [{ code: "single-state", text: "estado único ".repeat(500) }] },
  investigate: investigation(components),
});
const page = () => ({ families: [{ familyId: "F-family", example: "y".repeat(1500) }], nextCursor: 1 });

describe("A2 — cláusulas globais no investigate", () => {
  it("seleciona só cláusulas globais com procedimento derivável e sem medida integral", () => {
    const expected = pageChecklistRules().filter((r) => !oracleFullyMeasures(r.id) && procedureOf(r) !== null);
    expect(globals().clauses.map((c) => c.citeAs)).toEqual(expected.map((r) => r.id));
    expect(globals().total).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("existe mesmo sem componentes DS e aponta para o checklist global", () => {
    expect(investigation([])).toMatchObject({
      page: { stateRef: "S-global", next: { tool: "get_page_rules", arguments: { view: "checklist" } } },
      next: { tool: "get_page_rules", arguments: { view: "checklist" } },
    });
    expect(investigateFor([], "S-empty", () => ({}))).toBeUndefined();
  });

  it("compactação nunca apaga o sujeito ou condição das cláusulas globais que entrega", () => {
    const source = new Map(globals().clauses.map((c) => [c.citeAs, c]));
    expect(globals().clauses.some((c) => /empty.?state/i.test(c.text))).toBe(true);
    for (const maxChars of [1000, 1500, 2000, 4000, 8000, 20000]) {
      const response = assembleScan(makeHead(["button", "input", "message", "modal", "list", "item"]), [], "S-global", maxChars, page, { firstScanPage: true });
      expect(JSON.stringify(response).length).toBeLessThanOrEqual(maxChars);
      if (response.kind === "error") {
        expect(response.next).toContainEqual(expect.objectContaining({ tool: "get_page_rules", arguments: { view: "checklist" } }));
        continue;
      }
      const global = (response.investigate as any).page;
      if (typeof global.next === "string") expect(global.next).toBe("get_page_rules(view:checklist)");
      else expect(global.next).toEqual({ tool: "get_page_rules", arguments: { view: "checklist" } });
      for (const clause of global.clauses ?? []) {
        const original = source.get(clause.citeAs)!;
        expect(clause.text).toBe(original.text);
        expect(clause.how).toBe(original.how);
        expect(clause.when).toBe(original.when);
      }
      if (!global.clauses && typeof global.next !== "string") expect(global.deferred).toBe(true);
    }
  });

  it("ponteiro global sobrevive também ao teto genérico e à redução extrema", () => {
    for (const maxChars of [1000, 1500, 2000, 8000]) {
      const response = enforceCeiling({ ...makeHead(["button"]), ...page() }, maxChars, "S-global");
      expect(JSON.stringify(response.investigate)).toContain("get_page_rules");
    }
  });

  it("sessão carregada não perde pendências silenciosamente nem estoura 1k", () => {
    const head = {
      ...makeHead(["button"]),
      sessionPending: { count: 50, ids: Array.from({ length: 50 }, (_, i) => `P-${i + 1}:document-title-adequacy`), checklist: { button: { ids: Array.from({ length: 30 }, (_, i) => `P-${i + 60}`) } } },
      stateDiff: { previousScanId: "S-old", stateChanged: true },
      observations: { total: 10, note: "x".repeat(2000) },
      units: { routes: 2, states: 2, rule: "um achado por rota/estado" },
    };
    const response = assembleScan(head, [], "S-global", 1000, page, { firstScanPage: true });
    expect(JSON.stringify(response).length).toBeLessThanOrEqual(1000);
    expect(response).toMatchObject({ kind: "error", errorCode: "item-too-large", scanId: "S-global" });
    expect(response.error).toMatch(/pendências da sessão não foram entregues/);
    expect(response.next).toContainEqual(expect.objectContaining({ tool: "get_finding_details", arguments: { scanId: "S-global", maxChars: 8000 } }));
    expect(response.next).toContainEqual(expect.objectContaining({ tool: "get_page_rules", arguments: { view: "checklist" } }));
    expect(response.next).toContainEqual(expect.objectContaining({ tool: "get_component_spec", arguments: { component: "button", view: "checklist" } }));
  });
});
