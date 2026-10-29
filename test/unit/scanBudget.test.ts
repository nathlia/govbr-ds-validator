/**
 * 3.1.0: the scan_page budget counts the whole response, head included. A head made large by a
 * recipe (actions + arrival), a stateDiff and investigate must shrink the parts that have a
 * continuation instead of overflowing 8,000 characters (roteiro sem modelo: 8,126 / 8,565 in 3.0.0).
 */
import { describe, it, expect } from "vitest";
import { assembleScan, enforceCeiling, SCAN_DEFAULT_MAX_CHARS } from "../../src/responses/scan.js";
import { textSize } from "../../src/responses/contract.js";
import type { Observation } from "../../src/schema/finding.js";

const why = "NÃO HÁ NORMA que sustente a afirmação binária; continua sendo informação útil para quem revisa. ".repeat(4);
const observations = Array.from({ length: 13 }, (_, i) => ({
  kind: `kind-${i % 3}`,
  note: "classe desconhecida no componente",
  whyNotAFinding: why,
  element: { locator: `#root > main > div:nth-of-type(${i})` },
})) as unknown as Observation[];

const head = (extra: number) => ({
  contract: "oraculo-resposta/1.0.0",
  kind: "scan",
  scanId: "S-page-002",
  state: { recipe: { actions: [{ action: "click", selector: ".acao-continuar" }], arrival: { visible: ".mensagem-erro-cpf" } }, pad: "x".repeat(extra) },
  stateDiff: { previousScanId: "S-page-001", findings: { added: 2, removed: 1, unchanged: 9, addedIds: ["F-1", "F-2"], removedIds: ["F-3"] } },
  investigate: {
    note: "Até 5 componentes encontrados neste estado.",
    items: ["button", "input", "list", "item", "tag"].map((component) => ({ component, unmeasured: { semantic: 20 }, next: { tool: "get_component_spec", arguments: { component } } })),
    more: { remaining: 1, components: ["divider"] },
  },
  absenceNote: "Zero achados não é conformidade.",
});
// One family that always enters (the continuation must move), ~1,600 characters.
const page = () => ({ families: [{ familyId: "FAM-1", example: "y".repeat(1500) }], nextCursor: 1 });

describe("scan_page budget: the head counts (3.1.0)", () => {
  it("a large head shrinks observations/investigate/stateDiff, says what moved, and stays within 8,000", () => {
    for (const extra of [4_800, 5_200, 5_500]) {
      const r = assembleScan(head(extra), observations, "S-page-002", SCAN_DEFAULT_MAX_CHARS, page, { firstScanPage: true });
      expect(textSize(r)).toBeLessThanOrEqual(SCAN_DEFAULT_MAX_CHARS);
      expect(Array.isArray(r.compacted)).toBe(true);
      const obs = r.observations as { total: number; next?: { arguments: { view: string } } };
      expect(obs.total).toBe(13);
      expect(obs.next?.arguments.view).toBe("observations");
      const inv = r.investigate as { items: unknown[]; more: { remaining: number; components: string[] } };
      expect(inv.items.length + inv.more.remaining).toBe(6); // nothing dropped: moved to more
      // The first family enters while it fits; past that the page starts at the continuation (cursor 0).
      const fams = r.families as unknown[];
      if (fams.length === 0) expect(r).toMatchObject({ nextCursor: 0, next: { tool: "get_finding_details", arguments: { scanId: "S-page-002", cursor: 0 } } });
      else expect(fams.length).toBe(1);
    }
  });

  it("a response that already fits is not compacted", () => {
    const r = assembleScan(head(0), observations, "S-page-002", SCAN_DEFAULT_MAX_CHARS, page);
    expect(textSize(r)).toBeLessThanOrEqual(SCAN_DEFAULT_MAX_CHARS);
    expect(r.compacted).toBeUndefined();
  });

  it("compacted never lists a part that had no items", () => {
    const h = { ...head(5_200), stateDiff: { previousScanId: "S-page-001", findings: { added: 0, removed: 0, unchanged: 9, addedIds: [], removedIds: [] } } };
    const r = assembleScan(h, [], "S-page-002", SCAN_DEFAULT_MAX_CHARS, page, { firstScanPage: true });
    for (const part of (r.compacted as string[] | undefined) ?? []) {
      expect(part).not.toMatch(/^observations|^stateDiff/);
    }
  });

  it("continuations (get_finding_details, isolated checks, cursor pages) never empty the page nor repeat the cursor", () => {
    // ids mode of get_finding_details: no scanId, cursor 5, one finding bigger than maxChars.
    const idsHead = { contract: "x", kind: "finding-details", requested: 10, missing: [] };
    const idsPage = () => ({ cursor: 5, count: 1, findings: [{ id: "F-6", evidence: "e".repeat(1500) }], nextCursor: 6 });
    const a = assembleScan(idsHead, null, "", 1_000, idsPage);
    expect((a.findings as unknown[]).length).toBe(1);
    expect(a.nextCursor).toBe(6);
    expect(a.exceedsMaxChars).toMatchObject({ maxChars: 1_000 });
    expect(JSON.stringify(a)).not.toMatch(/"scanId":""/);
    // scan continuation (cursor > 0) with a huge head: still ≥ 1 family, cursor advances.
    const big = { contract: "x", kind: "scan", state: { recipe: "r".repeat(9_000) } };
    const b = assembleScan(big, null, "S-1", SCAN_DEFAULT_MAX_CHARS, () => ({ cursor: 3, families: [{ a: 1 }], nextCursor: 4 }));
    expect((b.families as unknown[]).length).toBe(1);
    expect(b.nextCursor).toBe(4);
    // 3.3.0 (N-03): o estado gigante encolhe para o essencial (o inteiro fica no ledger) e a resposta cabe.
    expect(JSON.stringify(b).length).toBeLessThanOrEqual(SCAN_DEFAULT_MAX_CHARS);
    expect(b.squeezed).toContain("state → essencial (inteiro no ledger)");
  });
});

describe("enforceCeiling: honesty texts are the last resort (3.4.2, D-154)", () => {
  const limitText = "Nenhum check deste scan mede estado atual/selecionado, ordem de foco ou posição visual; zero achados não diz nada sobre eles.";
  const envelope = (statePad: number, limitsPad = 0) => ({
    contract: "oraculo-resposta/1.0.0",
    kind: "scan",
    scanId: "S-page-001",
    state: { reached: true, settle: { settled: true, log: "s".repeat(statePad) }, replay: { status: "ok" }, recipe: { viewport: "1280x900", viewportSource: "harness" }, observed: { url: "http://x/a.html", path: "/a.html", viewport: "1280x900", extra: "o".repeat(200) } },
    coverage: { checks: ["page"], elementsInspected: 40, componentsFound: Array.from({ length: 30 }, (_, i) => `componente-${i}`), actionsApplied: [] },
    checksRun: { executed: ["page"], limits: [{ code: "no-state-order-position", text: limitText + "l".repeat(limitsPad) }], coverageNote: "Mediu apenas os checks em executed." },
  });
  const limitsOf = (r: Record<string, unknown>) => (r.checksRun as { limits: unknown[] }).limits;

  it("just over the ceiling: state/coverage shrink, limits keep their text", () => {
    const base = envelope(2_000);
    const max = textSize(base) - 50;
    const r = enforceCeiling(base, max, "S-page-001");
    expect(textSize(r)).toBeLessThanOrEqual(max);
    expect(r.squeezed).toEqual(["state → essencial (inteiro no ledger)"]);
    expect(limitsOf(r)).toEqual([{ code: "no-state-order-position", text: expect.stringContaining(limitText) }]);
    expect((r.checksRun as { coverageNote?: string }).coverageNote).toBeDefined();
    // 3.4.3: a atestação da janela (janela da receita + fonte) sobrevive ao estado encolhido
    expect((r.state as { recipe: Record<string, unknown> }).recipe).toEqual({ viewport: "1280x900", viewportSource: "harness" });
    expect(r.exceedsMaxChars).toBeUndefined();
  });

  it("limits become codes only when nothing else suffices, and squeezed follows the new order", () => {
    const base = { ...envelope(2_000, 3_000), investigate: { items: ["x".repeat(300)] }, familyHint: "h".repeat(200) };
    const r = enforceCeiling(base, 1_500, "S-page-001");
    expect(r.squeezed).toEqual([
      "state → essencial (inteiro no ledger)",
      "coverage → contagens",
      "investigate → removido",
      "familyHint/chaves → removidos",
      "checksRun → códigos",
    ]);
    expect(limitsOf(r)).toEqual(["no-state-order-position"]);
    expect((r.state as { full: unknown }).full).toEqual({ tool: "get_finding_details", arguments: { scanId: "S-page-001" } });
    expect((r.coverage as { componentsFound: number }).componentsFound).toBe(30);
  });
});
