/**
 * 3.7.4 — defeitos do teste à mão da 3.7.3 (09/11): D1 reserva × fatos e contextos por sessão, D2 pendência de N
 * elementos verificada em parte, D3 ordem das normas na linha compacta, O1 sujeito da cláusula por finalidade.
 */
import { describe, expect, it } from "vitest";
import { getRuleById } from "../../src/data/knowledge.js";
import { reserveCandidates, reserveContentChars, selectReserve, type ReserveCandidate } from "../../src/tools/clauseReserve.js";
import { clauseWindow, WINDOW_GAP } from "../../src/tools/procedureScope.js";
import { procedureOf } from "../../src/tools/componentChecklist.js";
import { assembleScan } from "../../src/responses/scan.js";
import { textSize } from "../../src/responses/contract.js";
import { ScanSession, sessionPendingBlock, sessionPendingCodes, slotOf } from "../../src/scan/session.js";
import { pendingLine } from "../../src/scan/notJudged.js";

const TABLE_ROW = "govbr-3.7.0-component-table-54d5095fb447";
const SWITCH = "govbr-3.7.0-accessibility-switch-364149c5aea4";
const real = () => reserveCandidates(["radio", "checkbox", "select", "table"]);
const byId = (id: string) => real().find((c) => c.rule.id === id)!;

describe("D1 — a reserva respeita a quota e o contexto se recorta sem cortar a cláusula", () => {
  it("janela literal: títulos da cadeia, cabeçalho da tabela e a linha da cláusula, com faixas do snapshot", () => {
    const c = byId(TABLE_ROW);
    expect(c.context!.text.length).toBeGreaterThan(5000);
    const w = clauseWindow(c.rule, c.context!, 600)!;
    expect(w.kind).toBe("literal-window");
    expect(w.complete).toBe(false);
    expect(w.text).toContain(c.rule.originalText);
    expect(w.text).toContain("| ID");
    expect(w.parts.join("").length).toBeLessThanOrEqual(600);
    // cada trecho é literal do escopo, e as faixas são crescentes e disjuntas
    for (const p of w.parts) expect(c.context!.text).toContain(p.trim());
    expect(w.text.split(WINDOW_GAP).length).toBe(w.parts.length);
    for (let i = 1; i < w.source.ranges.length; i++) expect(w.source.ranges[i].start).toBeGreaterThan(w.source.ranges[i - 1].end);
    expect(w.source.snapshotSha256).toBe(c.context!.source.snapshotSha256);
    // sem espaço para o mínimo (títulos + cláusula), não há janela
    expect(clauseWindow(c.rule, c.context!, 50)).toBeNull();
  });

  it("conteúdo ≤ quota em todo teto (a 1ª cláusula é piso), cláusulas inteiras e prefixo estável", () => {
    const candidates = real();
    for (const budget of [8000, 12000, 20000]) {
      const block = selectReserve(candidates, budget).block;
      expect(block.clauses.length).toBeGreaterThan(0);
      if (block.clauses.length > 1) expect(block.contentChars).toBeLessThanOrEqual(block.targetChars);
      expect(block.clauses.map((c) => c.citeAs)).toEqual(candidates.slice(0, block.clauses.length).map((c) => c.rule.id));
      for (const clause of block.clauses) {
        const rule = getRuleById(clause.citeAs as string)!;
        expect(clause).toMatchObject({ text: rule.originalText, force: rule.force, conditions: rule.conditions, exceptions: rule.exceptions });
        const ctx = (block.contexts as Record<string, Record<string, unknown>>)[clause.context as string];
        if (typeof ctx.text === "string") expect(ctx.text).toContain(rule.originalText);
        else expect(ctx).toMatchObject({ status: expect.stringMatching(/deferred|delivered/), next: { tool: "get_ds_rules", arguments: { id: clause.citeAs } } });
      }
    }
  });

  it("maxBlockChars limita o bloco serializado; sem nenhuma cláusula que caiba, clauses vazio", () => {
    const candidates = real();
    const capped = selectReserve(candidates, 20000, { maxBlockChars: 1500 }).block;
    expect(textSize(capped)).toBeLessThanOrEqual(1500);
    expect(capped.status).toBe("limited-by-facts");
    expect(selectReserve(candidates, 20000, { maxBlockChars: 200 }).block.clauses).toHaveLength(0);
    const floor = selectReserve(candidates, 20000, { minimal: true }).block;
    expect(floor.clauses).toHaveLength(1);
    expect(Object.values(floor.contexts as Record<string, Record<string, unknown>>)[0]).toMatchObject({ status: "deferred" });
  });

  it("contexto já entregue na sessão volta só como referência (id + deliveredIn + next), sem contar na quota", () => {
    const candidates = real();
    const first = selectReserve(candidates, 20000).block;
    const s = new ScanSession();
    for (const [key, ctx] of Object.entries(first.contexts as Record<string, { text?: string; kind: string; source?: { ranges?: Array<{ start: number; end: number }> } }>)) {
      if (typeof ctx.text === "string") s.markContextDelivered(key, "S-page-001", ctx.kind === "literal-window" ? ctx.source!.ranges! : "full");
    }
    const again = selectReserve(candidates, 20000, { delivered: (k, r) => s.contextDelivered(k, r) }).block;
    // contexto inteiro entregue → só referência (uma janela entregue não impede o escopo inteiro depois: o resto não saiu)
    const shown = first.clauses.filter((c) => { const x = (first.contexts as Record<string, { text?: unknown; kind?: string }>)[c.context as string]; return typeof x.text === "string" && x.kind === "literal-scope"; });
    expect(shown.length).toBeGreaterThan(0);
    for (const clause of shown) {
      const ctx = (again.contexts as Record<string, Record<string, unknown>>)[clause.context as string];
      expect(ctx).toMatchObject({ status: "delivered", deliveredIn: "S-page-001" });
      expect(ctx).not.toHaveProperty("text");
    }
    // a quota liberada serve cláusulas novas, na mesma ordem
    expect(again.clauses.length).toBeGreaterThan(first.clauses.length);
    expect(again.clauses.slice(0, first.clauses.length).map((c) => c.citeAs)).toEqual(first.clauses.map((c) => c.citeAs));
    // janela entregue cobre só as suas faixas
    const s2 = new ScanSession();
    s2.markContextDelivered("k", "S-1", [{ start: 10, end: 50 }]);
    expect(s2.contextDelivered("k", [{ start: 20, end: 40 }])).toBe("S-1");
    expect(s2.contextDelivered("k", [{ start: 20, end: 60 }])).toBeUndefined();
    expect(s2.contextDelivered("k")).toBeUndefined();
  });
});

describe("D1 — fatos primeiro no montador", () => {
  const head = { contract: "oraculo-resposta/1.0.0", kind: "scan", scanId: "S-test", absenceNote: "Zero achados não é conformidade." };
  const families = (n: number, size: number) => Array.from({ length: n }, (_, i) => ({ familyId: `F${i + 1}`, example: "x".repeat(size) }));
  /** Página de famílias que respeita o orçamento recebido (como o batchView). */
  const pager = (n: number, size: number) => (budget: number) => {
    const all = families(n, size);
    const fit = Math.max(0, Math.min(n, Math.floor((budget - 300) / (size + 40))));
    return { families: all.slice(0, fit), totalFamilies: n, totalFindings: n, count: fit,
      ...(fit < n ? { nextCursor: fit, next: { tool: "get_finding_details", arguments: { scanId: "S-test", cursor: fit } } } : {}) };
  };
  const scan = (page: (b: number) => Record<string, unknown>, budget: number, candidates: ReserveCandidate[] = real()) =>
    assembleScan(head, null, "S-test", budget, page, { firstScanPage: true, clauseCandidates: candidates });

  it("fatos que cabem no teto nunca saem da 1ª página por causa da reserva", () => {
    for (const budget of [4000, 8000, 12000, 20000]) {
      const page = pager(5, 500);
      const withoutReserve = assembleScan(head, null, "S-test", budget, page, { firstScanPage: true });
      const r = scan(page, budget);
      expect(textSize(r)).toBeLessThanOrEqual(budget);
      expect((r.families as unknown[]).length).toBe((withoutReserve.families as unknown[]).length);
    }
  });

  it("com folga, a reserva vai até a quota; página cheia de fatos → reserva adiada e declarada", () => {
    const roomy = scan(pager(2, 300), 20000);
    const block = roomy.clauseReserve as { clauses: unknown[]; contentChars: number; targetChars: number };
    expect((roomy.families as unknown[]).length).toBe(2);
    expect(block.clauses.length).toBeGreaterThan(1);
    expect(block.contentChars).toBeLessThanOrEqual(block.targetChars);
    // fatos que ocupam o teto inteiro: nenhuma cláusula tira família
    const full = scan(pager(7, 1000), 8000);
    const without = assembleScan(head, null, "S-test", 8000, pager(7, 1000), { firstScanPage: true });
    expect((full.families as unknown[]).length).toBe((without.families as unknown[]).length);
    expect((full.clauseReserve as { status: string }).status).toMatch(/deferred-by-facts|limited-by-facts|quota-reached|fulfilled/);
  });

  it("fatos que não cabem inteiros: o piso (uma cláusula inteira) pode custar família, nunca a última; 1k sem piso recusa", () => {
    const r = scan(pager(40, 400), 8000);
    expect(r.kind).not.toBe("error");
    expect((r.families as unknown[]).length).toBeGreaterThan(0);
    expect((r.clauseReserve as { clauses: unknown[] }).clauses.length).toBeGreaterThan(0);
    const tight = scan(pager(40, 400), 1000);
    expect(tight).toMatchObject({ kind: "error", errorCode: "item-too-large" });
    expect(textSize(tight)).toBeLessThanOrEqual(1000);
  });

  it("revisão MED 1: o retry sugerido entrega ao menos uma cláusula inteira (não só fatos com a reserva adiada)", () => {
    for (const [n, size, budget] of [[7, 400, 2000], [40, 400, 1000], [3, 300, 1000]] as const) {
      const r = scan(pager(n, size), budget);
      if (r.kind !== "error" || !r.retry) continue;
      const retried = scan(pager(n, size), (r.retry as { maxChars: number }).maxChars);
      expect(retried.kind).not.toBe("error");
      expect((retried.clauseReserve as { clauses: unknown[] }).clauses.length).toBeGreaterThan(0);
    }
  });

  it("revisão MED 2: com acréscimos que só saem na escada, fatos que cabem não pegam o atalho do piso", () => {
    // página cujas famílias só cabem com a escada (o pager cru no teto não lista todas)
    const page = (budget: number) => { const p = pager(6, 500)(budget * 0.8); return p; };
    const without = assembleScan(head, null, "S-test", 8000, page, { firstScanPage: true });
    const r = scan(page, 8000);
    expect((r.families as unknown[]).length).toBe((without.families as unknown[]).length);
  });
});

describe("D2 — pendência presa a N elementos só fecha quando todos foram decididos", () => {
  const item = {
    code: "aria-state-unverified", subject: "estado ARIA", count: 2, examples: ["#aviso-email", "#aviso-sms"], elementSet: "set-sw",
    elementBound: true as const, boundLocators: ["#aviso-email", "#aviso-sms"], norms: [SWITCH, "wcag-4.1.2"],
    rule: { id: SWITCH, force: "required", text: "Switch" }, todo: "alterne", measure: "checked × aria-checked",
  };
  const finding = (locator: string) => ({ id: "F", rule: { id: SWITCH, source: "govbr-ds-kb" }, element: { page: "http://h/a2", locator }, evidence: { data: {} } }) as never;

  it("verify de um elemento → parcial (mesmo id, o que falta); do outro → resolvida", () => {
    const s = new ScanSession();
    const [e] = s.registerPending("S-page-001", "http://h/a2", [item], (i) => (i.boundLocators ?? []).slice());
    const one = s.resolveByVerifyDetailed(finding("#aviso-email"), "V-1", "confirmed");
    expect(one.resolved).toEqual([]);
    expect(one.partial).toEqual([{ id: e.id, decided: ["#aviso-email"], remaining: ["#aviso-sms"] }]);
    expect(e.status).toBe("open");
    // visível no sessionPending de outra rota (inteiro e na forma de ids)
    const block = sessionPendingBlock(s.open(), new Set(), () => true, true, "http://h/a")!;
    expect(block.items[0]).toMatchObject({ ids: [e.id], remaining: { [e.id]: ["#aviso-sms"] } });
    expect(sessionPendingCodes(block)).toMatchObject({ remaining: { [e.id]: ["#aviso-sms"] } });
    // repetir o mesmo elemento não fecha
    expect(s.resolveByVerifyDetailed(finding("#aviso-email"), "V-2", "confirmed").resolved).toEqual([]);
    const two = s.resolveByVerifyDetailed(finding("#aviso-sms"), "V-3", "confirmed");
    expect(two.resolved).toEqual([e.id]);
    expect(two.partial).toEqual([]);
    expect(slotOf(e, "http://h/a2")?.status).toBe("resolved");
  });

  it("pendingResolved declara o item inteiro e diz o que o verify decidiu", () => {
    const s = new ScanSession();
    const [e] = s.registerPending("S-page-001", "http://h/a2", [item], (i) => (i.boundLocators ?? []).slice());
    s.resolveByVerifyDetailed(finding("#aviso-email"), "V-1", "confirmed");
    const r = s.resolveExplicit([{ id: e.id, status: "violada" }], "http://h/a2");
    expect(r.resolved).toEqual([e.id]);
    expect(r.partialVerify).toEqual([{ id: e.id, verified: ["#aviso-email"], verifiedCount: 1, declared: ["#aviso-sms"], declaredCount: 1 }]);
  });

  it("pendência sem elementBound: qualquer verify na rota com a norma fecha (como antes)", () => {
    const s = new ScanSession();
    const plain = { ...item, elementBound: undefined, boundLocators: undefined };
    const [e] = s.registerPending("S-page-001", "http://h/a2", [plain], (i) => (i.examples ?? []).slice());
    expect(s.resolveByVerify(finding("#outro"), "V-1", "confirmed")).toEqual([e.id]);
  });
});

describe("D3 — a linha compacta mostra a cláusula do componente primeiro", () => {
  const line = (norms: string[], rule?: string) => pendingLine({ pendingId: "P-06", code: "c", subject: "s", count: 2, norms,
    ...(rule ? { rule: { id: rule, force: "required", text: "t" } } : {}), examples: ["#a"], todo: "faça" } as never);
  it("DS de componente primeiro, depois WCAG (ou e-MAG); sem ela, WCAG e e-MAG como antes", () => {
    expect(line([SWITCH, "wcag-4.1.2"], SWITCH)).toMatch(/^P-06:c:2⇒govbr-3\.7\.0-accessibility-switch-364149c5aea4,wcag-4\.1\.2 @/);
    expect(line(["govbr-3.7.0-component-button-7ef75d42ac65"], "govbr-3.7.0-component-button-7ef75d42ac65")).toContain("⇒govbr-3.7.0-component-button-7ef75d42ac65 @");
    // cláusula e-MAG da base (global) não passa à frente: aparece pelo identificador e-MAG
    expect(line(["govbr-3.7.0-accessibility-global-9068b253efd7", "emag-4.1", "wcag-1.4.3"], "govbr-3.7.0-accessibility-global-9068b253efd7")).toContain("⇒wcag-1.4.3,emag-4.1 @");
    expect(line(["wcag-4.1.2"])).toContain("⇒wcag-4.1.2 @");
  });
});

describe("O1 — cláusula por finalidade restringe o sujeito, sem mudar força nem mensurabilidade", () => {
  it("o checkbox pai", () => {
    const rule = getRuleById("govbr-3.7.0-development-checkbox-9ac846bae733")!;
    const p = procedureOf(rule)!;
    expect(p.select).toContain('só onde um checkbox é "pai"');
    expect(p.expect).toBe("data-parent: presente");
    expect(rule.force).toBe("required");
  });
  it("contagem de conteúdo inalterada pelos metadados", () => {
    expect(reserveContentChars(["a\n\nb", "b"])).toBe(reserveContentChars(["a", "b"]));
  });
});
