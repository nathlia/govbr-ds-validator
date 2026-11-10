/**
 * 3.7.5 — mecanismo da campanha dev-374-b-01 (10/11): (1) o estado das cláusulas sai separado do `complete` dos fatos,
 * com UM next para a leitura em lote das não entregues; R1 o bloco mínimo adiado nunca sai sem caminho; R2 cláusula já
 * entregue inteira na sessão não se repete (referência) e o prefixo avança; item 6 pendência de leitura das cláusulas de
 * uso/juízo (usage-unread).
 */
import { describe, expect, it } from "vitest";
import { clausesSummary, reserveCandidates, selectReserve, splitDelivered, type ReserveCandidate } from "../../src/tools/clauseReserve.js";
import { componentChecklist } from "../../src/tools/componentChecklist.js";
import { pageChecklistRules } from "../../src/tools/pageChecklist.js";
import { assembleScan } from "../../src/responses/scan.js";
import { textSize } from "../../src/responses/contract.js";
import { ScanSession, sessionPendingBlock } from "../../src/scan/session.js";
import { pendingLine, pendingLineMinimal, pendingLineNorm, usageLedgerObservation, usageUnreadItem } from "../../src/scan/notJudged.js";
import { usageClauseIds, usageReadCalls } from "../../src/tools/usageClauses.js";
import { getRuleById } from "../../src/data/knowledge.js";

const real = () => reserveCandidates(["radio", "checkbox", "select", "table"]);
const head = { contract: "oraculo-resposta/1.0.0", kind: "scan", scanId: "S-test", absenceNote: "Zero achados não é conformidade." };
/** Página de famílias que respeita o orçamento (como o batchView), com truncated/complete dos fatos. */
const pager = (n: number, size: number) => (budget: number) => {
  const fit = Math.max(0, Math.min(n, Math.floor((budget - 300) / (size + 40))));
  return { families: Array.from({ length: fit }, (_, i) => ({ familyId: `F${i + 1}`, example: "x".repeat(size) })),
    totalFamilies: n, totalFindings: n, count: fit, truncated: fit < n, complete: fit >= n,
    ...(fit < n ? { nextCursor: fit, next: { tool: "get_finding_details", arguments: { scanId: "S-test", cursor: fit } } } : {}) };
};
const scan = (page: (b: number) => Record<string, unknown>, budget: number, candidates: ReserveCandidate[] = real(), session?: ScanSession) =>
  assembleScan(head, null, "S-test", budget, page, { firstScanPage: true, clauseCandidates: candidates,
    ...(session ? { contextDelivered: (k: string, r?: Array<{ start: number; end: number }>) => session.contextDelivered(k, r),
      clauseDelivered: (id: string) => session.clauseDelivered(id) } : {}) });
/** O que o servidor faz depois de cada scan (server.ts: markDeliveredContexts). */
const record = (session: ScanSession, r: Record<string, unknown>, scanId: string) => {
  const res = r.clauseReserve as { clauses?: Array<{ citeAs: string; text?: string }>; contexts?: Record<string, { text?: string; kind: string; source?: { ranges?: Array<{ start: number; end: number }> } }> } | undefined;
  for (const [key, ctx] of Object.entries(res?.contexts ?? {})) {
    if (typeof ctx.text === "string") session.markContextDelivered(key, scanId, ctx.kind === "literal-window" ? ctx.source!.ranges! : "full");
  }
  for (const c of res?.clauses ?? []) if (typeof c.text === "string") session.markClauseDelivered(c.citeAs, scanId);
};
type Summary = { complete: boolean; deferred?: number; contextsByReference?: number; next?: { tool: string; arguments: Record<string, unknown> }; note?: string };

describe("1 — clauses: estado das cláusulas separado do complete dos fatos", () => {
  it("com cláusulas não entregues: complete:false, deferred = candidatas fora da resposta, UM next ao checklist do componente com mais pendentes", () => {
    const candidates = real();
    for (const budget of [8000, 20000]) {
      const block = selectReserve(candidates, budget).block;
      const s = clausesSummary(block, candidates) as Summary;
      const deferred = candidates.length - block.clauses.length;
      expect(deferred).toBeGreaterThan(0);
      expect(s).toMatchObject({ complete: false, deferred, next: { tool: "get_component_spec", arguments: { view: "checklist" } } });
      expect(s.note).toMatch(/complete dos fatos/);
      // o componente do next é o de mais candidatas não entregues
      const pending = candidates.slice(block.clauses.length);
      const counts = new Map<string, number>();
      for (const c of pending) counts.set(c.component!, (counts.get(c.component!) ?? 0) + 1);
      const component = s.next!.arguments.component as string;
      expect(counts.get(component)).toBe(Math.max(...counts.values()));
      // e a lista de verificação devolve o texto de cada uma delas (citeAs + texto + como medir)
      const list = componentChecklist(component, 0, 1_000_000) as { items: Array<{ citeAs: string; text: string; measure: unknown }> };
      const ids = new Set(list.items.map((i) => i.citeAs));
      for (const c of pending.filter((p) => p.component === component)) expect(ids.has(c.rule.id)).toBe(true);
      expect(list.items.every((i) => typeof i.text === "string" && i.text.length > 0 && i.measure)).toBe(true);
    }
  });

  it("candidatas globais da página → get_page_rules view:checklist; só contexto adiado → a releitura dele; tudo entregue → complete:true; sem candidatas → nada", () => {
    const global = reserveCandidates([]);
    expect(global.every((c) => c.component === null)).toBe(true);
    expect(pageChecklistRules().length).toBeGreaterThan(0);
    const g = clausesSummary(selectReserve(global, 8000).block, global) as Summary;
    expect(g).toMatchObject({ complete: false, next: { tool: "get_page_rules", arguments: { view: "checklist" } } });
    // uma candidata só, contexto grande demais: a cláusula veio, o contexto não
    const big = real().find((c) => (c.context?.text.length ?? 0) > 5000)!;
    const one = selectReserve([big], 8000, { minimal: true }).block;
    expect(one.clauses).toHaveLength(1);
    const s = clausesSummary(one, [big]) as Summary;
    expect(s).toMatchObject({ complete: false, deferred: 0, contextsByReference: 1, next: { tool: "get_ds_rules", arguments: { id: big.rule.id } } });
    const small = real().find((c) => (c.context?.text.length ?? 0) < 600)!;
    expect(clausesSummary(selectReserve([small], 20000).block, [small])).toEqual({ complete: true });
    expect(clausesSummary(selectReserve([], 8000).block, [])).toBeUndefined();
  });

  it("no montador: `clauses` logo depois do complete dos fatos, que não muda; mesmas famílias; teto respeitado", () => {
    for (const [n, size, budget] of [[2, 300, 20000], [5, 500, 8000], [5, 500, 20000], [7, 1000, 8000], [40, 400, 8000]] as const) {
      const without = assembleScan(head, null, "S-test", budget, pager(n, size), { firstScanPage: true });
      const r = scan(pager(n, size), budget);
      expect(r.kind).not.toBe("error");
      expect(textSize(r)).toBeLessThanOrEqual(budget);
      expect(r.complete).toBe(without.complete);
      expect(r.truncated).toBe(without.truncated);
      if (r.complete) expect((r.families as unknown[]).length).toBe((without.families as unknown[]).length);
      const keys = Object.keys(r);
      expect(keys[keys.indexOf("clauses") - 1]).toBe("complete");
      const s = r.clauses as Summary;
      const block = r.clauseReserve as { clauses?: unknown[]; status: string };
      expect(s.complete).toBe(false);
      expect(s.deferred).toBe(real().length - (block.clauses?.length ?? 0));
      expect(s.next?.tool).toMatch(/get_component_spec|get_ds_rules/);
      if (typeof r.responseCharsEstimate === "number") expect(r.responseCharsEstimate).toBe(textSize(r));
    }
  });
});

describe("R1 — a forma adiada da reserva sempre leva o caminho", () => {
  it("todo deferred-by-facts (até o mínimo) vem com clauses.next; nenhum next solto no bloco", () => {
    let hits = 0;
    for (const n of [3, 5, 7, 9, 12]) for (const size of [300, 600, 1000]) for (const budget of [4000, 8000]) {
      const r = scan(pager(n, size), budget);
      if (r.kind === "error") continue;
      expect(textSize(r)).toBeLessThanOrEqual(budget);
      const block = r.clauseReserve as Record<string, unknown> | undefined;
      if (block?.status !== "deferred-by-facts") continue;
      hits++;
      expect(block).not.toHaveProperty("next");
      expect(r.clauses).toMatchObject({ complete: false, deferred: real().length, next: { tool: "get_component_spec", arguments: { view: "checklist" } } });
    }
    expect(hits).toBeGreaterThan(0);
  });
});

describe("R2 — cláusula já entregue na sessão não se repete; o prefixo avança", () => {
  it("splitDelivered: as entregues saem da fila, na ordem, com os scans de origem", () => {
    const candidates = real();
    const s = new ScanSession();
    s.markClauseDelivered(candidates[0].rule.id, "S-page-001");
    s.markClauseDelivered(candidates[2].rule.id, "S-page-002");
    s.markClauseDelivered(candidates[0].rule.id, "S-page-009"); // a 1ª entrega fica
    const { fresh, earlier } = splitDelivered(candidates, (id) => s.clauseDelivered(id));
    expect(fresh.map((c) => c.rule.id)).toEqual(candidates.filter((_, i) => i !== 0 && i !== 2).map((c) => c.rule.id));
    expect(earlier).toEqual({ count: 2, in: ["S-page-001", "S-page-002"] });
    expect(splitDelivered(candidates, () => undefined)).toEqual({ fresh: candidates });
  });

  it("2º scan da sessão: nenhuma cláusula repetida, alreadyDelivered, e as seguintes na mesma ordem", () => {
    const s = new ScanSession();
    const first = scan(pager(2, 300), 20000, real(), s);
    record(s, first, "S-page-001");
    const shown = (first.clauseReserve as { clauses: Array<{ citeAs: string }> }).clauses.map((c) => c.citeAs);
    expect(shown.length).toBeGreaterThan(0);
    const second = scan(pager(2, 300), 20000, real(), s);
    const block = second.clauseReserve as { clauses: Array<{ citeAs: string }>; alreadyDelivered: unknown };
    const ids = block.clauses.map((c) => c.citeAs);
    expect(ids.some((id) => shown.includes(id))).toBe(false);
    expect(block.alreadyDelivered).toEqual({ count: shown.length, in: ["S-page-001"] });
    const rest = real().filter((c) => !shown.includes(c.rule.id)).map((c) => c.rule.id);
    expect(ids).toEqual(rest.slice(0, ids.length));
    expect(second.clauses).toMatchObject({ complete: false, deferred: rest.length - ids.length });
  });

  it("fatos que não cabem inteiros, com cláusulas já entregues: o piso vai por referência e não custa família", () => {
    const s = new ScanSession();
    const first = scan(pager(40, 400), 8000, real(), s);
    record(s, first, "S-page-001");
    const firstBlock = first.clauseReserve as { clauses: unknown[]; status: string };
    expect(firstBlock.clauses.length).toBeGreaterThan(0);
    const before = scan(pager(40, 400), 8000); // sem sessão = o piso da 3.7.4 (repetiria a mesma cláusula)
    const again = scan(pager(40, 400), 8000, real(), s);
    expect(again.kind).not.toBe("error");
    expect(textSize(again)).toBeLessThanOrEqual(8000);
    expect(again.clauseReserve).toMatchObject({ status: "floor-by-reference", alreadyDelivered: { count: firstBlock.clauses.length, in: ["S-page-001"] } });
    expect((again.families as unknown[]).length).toBeGreaterThanOrEqual((before.families as unknown[]).length);
    expect(again.clauses).toMatchObject({ complete: false, next: { tool: "get_component_spec" } });
  });

  it("todas as candidatas já entregues: reserva só por referência, clauses.complete:true", () => {
    const s = new ScanSession();
    for (const c of real()) s.markClauseDelivered(c.rule.id, "S-page-001");
    const r = scan(pager(2, 300), 20000, real(), s);
    expect(r.clauseReserve).toMatchObject({ status: "delivered-earlier", clauses: [], alreadyDelivered: { count: real().length } });
    expect(r.clauses).toEqual({ complete: true });
  });
});

describe("item 6 — usage-unread na sessão e na linha compacta", () => {
  const ids = (component: string) => usageClauseIds(component);

  it("uma pendência por componente na sessão (rotas e scans deduplicados); a rota nova de uma já lida entra resolvida", () => {
    const s = new ScanSession();
    const a = s.registerUsage("button", "http://h/a", "S-page-001", ids("button"));
    expect(s.registerUsage("button", "http://h/a", "S-page-002", ids("button")).id).toBe(a.id);
    expect(s.registerUsage("button", "http://h/b", "S-page-003", ids("button")).id).toBe(a.id);
    expect(a.slots.map((x) => x.route)).toEqual(["http://h/a", "http://h/b"]);
    expect(s.registerUsage("tag", "http://h/a", "S-page-001", ids("tag")).id).not.toBe(a.id);
    s.noteRead(ids("button"));
    expect(a.status).toBe("resolved");
    const c = s.registerUsage("button", "http://h/c", "S-page-004", ids("button"));
    expect(c.status).toBe("resolved");
    expect(c.slots.every((x) => x.status === "resolved" && x.resolution?.by === "usage-read")).toBe(true);
  });

  it("fecha só com o conjunto inteiro lido; pendingResolved nunca fecha; verify_finding não a alcança (sem normas)", () => {
    const s = new ScanSession();
    const all = ids("checkbox");
    expect(all.length).toBeGreaterThan(3);
    const e = s.registerUsage("checkbox", "http://h/a", "S-page-001", all);
    expect(s.noteRead(all.slice(0, -1))).toEqual([]);
    expect(e.status).toBe("open");
    const r = s.resolveExplicit([{ id: e.id, status: "conforme", reason: "li" }, { id: e.id, status: "violada" }], "http://h/a");
    expect(r.resolved).toEqual([]);
    expect(r.usageUnread).toEqual([`${e.id}:checkbox`, `${e.id}:checkbox`]);
    expect(r).not.toHaveProperty("recordAsFinding");
    expect(e.status).toBe("open");
    expect(e.norms).toEqual([]);
    expect(s.noteRead(all.slice(-1))).toEqual([e.id]);
    expect(e.status).toBe("resolved");
    expect(s.resolveExplicit([{ id: e.id, status: "conforme", reason: "x" }]).usageUnread).toBeUndefined();
  });

  it("linha agregada: ids em faixa (ou lista), componentes na ordem, onde ler os ids; formas menores guardam o rótulo", () => {
    const L = { scanId: "S-page-001", cursor: 12 };
    const item = usageUnreadItem([{ id: "P-09", component: "accordion" }, { id: "P-10", component: "avatar" }, { id: "P-11", component: "table" }], L)!;
    const line = pendingLine(item);
    expect(line).toBe('P-09..P-11:usage-unread:3 @accordion,avatar,table · get_ds_rules{ids,detail:"index"} por componente; ids: get_finding_details{scanId:"S-page-001",view:"observations",cursor:12}');
    expect(usageUnreadItem([{ id: "P-12", component: "b" }, { id: "P-09", component: "a" }], L)).toMatchObject({ pendingId: "P-09,P-12", examples: ["a", "b"] });
    // sessão longa: ids misturados viram faixas na ordem, e os componentes acompanham
    const mixed = usageUnreadItem([32, 7, 33, 8, 10, 11, 18, 19, 12, 13, 34, 35, 9].map((n) => ({ id: `P-${String(n).padStart(2, "0")}`, component: `c${n}` })), L)!;
    expect(mixed.pendingId).toBe("P-07..P-13,P-18,P-19,P-32..P-35");
    expect(mixed.examples).toEqual([7, 8, 9, 10, 11, 12, 13, 18, 19, 32, 33, 34, 35].map((n) => `c${n}`));
    expect(usageUnreadItem([], L)).toBeUndefined();
    expect(pendingLineMinimal(line)).toMatch(/^P-09\.\.P-11:usage-unread:3 @accordion,avatar,table · get_ds_rules\{ids,detail:"index"\} por componente/);
    expect(pendingLineNorm(line)).toBe("P-09..P-11:usage-unread:3");
    // a lista de componentes é cortada num teto (muitos componentes)
    const many = usageUnreadItem(Array.from({ length: 30 }, (_, i) => ({ id: `P-${10 + i}`, component: `componente${i}` })), L)!;
    expect(pendingLine(many).length).toBeLessThanOrEqual(320);
  });

  it("sessionPending: a de outra rota aparece com os componentes e a leitura; a desta página não se repete", () => {
    const s = new ScanSession();
    const t = s.registerUsage("tag", "http://h/a", "S-page-001", ids("tag"));
    const b = s.registerUsage("button", "http://h/a", "S-page-001", ids("button"));
    s.registerUsage("button", "http://h/b", "S-page-002", ids("button"));
    const next = { tool: "get_finding_details", arguments: { scanId: "S-page-002", view: "observations", cursor: 7 } };
    const block = sessionPendingBlock(s.open(), new Set([b.id]), () => false, true, "http://h/b", {}, next)!;
    const item = block.items.find((i) => i.code === "usage-unread") as unknown as { ids: string[]; components: string[]; next: unknown };
    expect(item.ids).toEqual([t.id]);
    expect(item.components).toEqual(["tag"]);
    expect(item.next).toEqual(next);
  });
});

describe("item 6 (pre.2) — conjunto e chamadas de leitura", () => {
  it("só cláusulas de uso que obrigam, proíbem ou desaconselham; chamadas get_ds_rules{ids, detail:index} de até 20", () => {
    for (const c of ["radio", "checkbox", "table", "breadcrumb", "button", "menu"]) {
      const ids = usageClauseIds(c);
      for (const id of ids) expect(["required", "prohibited", "discouraged"]).toContain(getRuleById(id)!.force);
      const calls = usageReadCalls(ids);
      expect(calls.flatMap((x) => x.arguments.ids)).toEqual(ids);
      expect(calls.every((x) => x.tool === "get_ds_rules" && x.arguments.ids.length <= 20 && x.arguments.detail === "index")).toBe(true);
    }
    // componente sem nenhuma dessas: sem pendência
    expect(usageClauseIds("list")).toEqual([]);
    expect(usageReadCalls(Array.from({ length: 45 }, (_, i) => `x${i}`)).map((x) => x.arguments.ids.length)).toEqual([20, 20, 5]);
  });

  it("observação de leitura no ledger: pendingId, componente e chamadas de cada pendência aberta", () => {
    const o = usageLedgerObservation([{ id: "P-06", component: "radio", calls: usageReadCalls(usageClauseIds("radio")) }], "http://h/a");
    expect(o).toMatchObject({ kind: "not-judged", element: { locator: "html" }, data: { code: "usage-unread", reads: [{ pendingId: "P-06", component: "radio" }] } });
  });
});
