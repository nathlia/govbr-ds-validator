import { describe, expect, it } from "vitest";
import { getRuleById } from "../../src/data/knowledge.js";
import { reserveCandidates, reserveContentChars, selectReserve, type ReserveCandidate } from "../../src/tools/clauseReserve.js";
import { assembleScan } from "../../src/responses/scan.js";
import { textSize } from "../../src/responses/contract.js";

const seed = () => reserveCandidates(["button"])[0];
const candidate = (id: string, text: string, context = text): ReserveCandidate => {
  const base = seed();
  return { rule: { ...base.rule, id, originalText: text },
    procedure: { select: "controle", measure: "dimensão", expect: "44px" },
    context: { ...base.context!, text: context } };
};
const head = { contract: "oraculo-resposta/1.0.0", kind: "scan", scanId: "S-test", absenceNote: "Zero achados não é conformidade." };
const page = (budget: number) => ({ families: budget > 1200 ? [{ familyId: "F1", example: "x".repeat(900) }] : [],
  totalFamilies: 1, totalFindings: 1, count: budget > 1200 ? 1 : 0,
  ...(budget > 1200 ? {} : { nextCursor: 0, next: { tool: "get_finding_details", arguments: { scanId: "S-test", cursor: 0 } } }) });
const scan = (candidates: ReserveCandidate[], budget: number) => assembleScan(head, null, "S-test", budget, page,
  { firstScanPage: true, clauseCandidates: candidates });

describe("A5 reserva íntegra de leitura contextual", () => {
  it("deduplica parágrafos, marcação, caixa e cláusula contida; metadados não contam", () => {
    expect(reserveContentChars(["**Sujeito**\n\nTexto obrigatório", "sujeito", "texto obrigatório", "Texto"])).toBe(
      reserveContentChars(["Sujeito", "Texto obrigatório"]));
    const c = candidate("C1", "Texto obrigatório", "Sujeito\n\nTexto obrigatório");
    const a = selectReserve([c], 8000).block;
    const b = selectReserve([{ ...c, rule: { ...c.rule, id: "x".repeat(800), source: { ...c.rule.source, url: "y".repeat(800) } },
      procedure: { ...c.procedure, when: "z".repeat(800), provenance: "z".repeat(800) } }], 8000).block;
    expect(a.contentChars).toBe(b.contentChars);
    expect(a.literalChars + a.contextChars + a.procedureChars).toBe(a.contentChars);
  });

  it("mantém prefixo, unidade grande e contexto completo; nunca troca por outra mais barata", () => {
    const first = candidate("C1", "obrigação", "escopo ".repeat(2000));
    const second = candidate("C2", "outra norma");
    const selected = selectReserve([first, second], 1000).block;
    expect(selected.clauses.map(c => c.citeAs)).toEqual(["C1"]);
    expect(Object.values(selected.contexts!)[0].text).toBe(first.context!.text);
    const r = scan([first, second], 1000);
    expect(r).toMatchObject({ kind: "error", errorCode: "item-too-large", scanId: "S-test" });
    expect(r.clauseReserve).toBeUndefined();
    expect(textSize(r)).toBeLessThanOrEqual(1000);
    if (r.retry) expect(scan([first, second], (r.retry as { maxChars: number }).maxChars).kind).not.toBe("error");
  });

  it("preserva fonte indisponível na posição e declara causa distinta", () => {
    const c = candidate("C1", "texto");
    const r = scan([{ ...c, context: null }, candidate("C2", "barata")], 8000);
    expect(r).toMatchObject({ kind: "error", reason: "literal-scope-unavailable" });
    expect(r.retry).toBeUndefined();
  });

  it("fixa bloco fora dos compactadores, total serializado e quota recalculada em cada teto", () => {
    const candidates = [candidate("C1", "Obrigação literal", "Introdução e condição\n\nObrigação literal\n\n" + "contexto ".repeat(240))];
    for (const budget of [1000, 2000, 8000, 20000]) {
      const r = scan(candidates, budget);
      expect(textSize(r)).toBeLessThanOrEqual(budget);
      if (r.kind === "error") continue;
      const block = r.clauseReserve as ReturnType<typeof selectReserve>["block"];
      expect(block.targetChars).toBe(Math.ceil(budget * .2));
      expect(block.clauses).toHaveLength(1);
      expect(block.status === "fulfilled" ? block.contentChars >= block.targetChars : block.status === "exhausted").toBe(true);
      expect(block.clauses[0]).toMatchObject({ text: candidates[0].rule.originalText, force: candidates[0].rule.force });
      if (r.responseCharsEstimate !== undefined) expect(r.responseCharsEstimate).toBe(textSize(r));
    }
  });

  it("esgotamento/ausência explícitos; opção não atua em continuação nem no montador legado", () => {
    expect(selectReserve([], 8000).block.status).toBe("no-candidates");
    expect(selectReserve([candidate("C1", "curta")], 8000).block.status).toBe("exhausted");
    expect((scan([], 8000).clauseReserve as { status: string }).status).toBe("no-candidates");
    expect(assembleScan(head, null, "S-test", 8000, page).clauseReserve).toBeUndefined();
    expect(assembleScan(head, null, "S-test", 8000, page, { clauseCandidates: [seed()] }).clauseReserve).toBeUndefined();
  });

  it("catálogo roda componentes na ordem do estado, só fortes mensuráveis e sem ids duplicados", () => {
    const list = reserveCandidates(["message", "button", "message"]);
    expect(list[0].rule.component).toBe("message");
    expect(list[1].rule.component).toBe("button");
    expect(new Set(list.map(c => c.rule.id)).size).toBe(list.length);
    for (const c of list) {
      expect(["required", "prohibited"]).toContain(c.rule.force);
      expect(c.rule.originalText).toBe(getRuleById(c.rule.id)!.originalText);
      expect(c.context).not.toBeNull();
    }
    expect(reserveCandidates([]).every(c => c.rule.component === null)).toBe(true);
  });
});
