import { describe, expect, it } from "vitest";
import { filterRules } from "../../src/data/knowledge.js";
import { isTitleRecord } from "../../src/responses/retrieval.js";
import { MEASURABILITY, measurabilityOf } from "../../src/tools/componentChecklist.js";
import { pageChecklist, pageChecklistRules } from "../../src/tools/pageChecklist.js";
import { oracleFullyMeasures, oracleMeasuresFor } from "../../src/tools/oracleCoverage.js";

type Item = { citeAs: string; force: string; measure: { automatic: boolean; oracle?: Array<{ coverage?: string; limitation?: string }> } };
function allPages() {
  const items: Item[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const result = pageChecklist(cursor);
    expect("isError" in result).toBe(false);
    const reply = JSON.parse(result.content[0].text);
    expect(JSON.stringify(reply).length).toBeLessThanOrEqual(8000);
    expect(reply.kind).toBe("page-checklist");
    expect(reply.note).toContain("não registra pendingId");
    const batch = reply.items as Item[];
    expect(batch.length).toBeGreaterThan(0);
    items.push(...batch);
    const next = (reply.page as { cursor: string | null }).cursor;
    expect(next).not.toBe(cursor);
    cursor = next ?? undefined;
    expect(++pages).toBeLessThan(200);
  } while (cursor);
  return { items, pages };
}

describe("A2 — checklist global, sem decidir aplicabilidade", () => {
  it("percorre todas as obrigações globais uma vez, incluindo e-MAG, dentro de 8k", () => {
    const expected = filterRules().filter((r) => r.component === null &&
      ["required", "prohibited"].includes(r.force) && !isTitleRecord(r));
    const { items, pages } = allPages();
    expect(pages).toBeGreaterThan(1);
    expect(new Set(items.map((i) => i.citeAs)).size).toBe(items.length);
    expect(items.map((i) => i.citeAs).sort()).toEqual(expected.map((r) => r.id).sort());
    expect(expected.some((r) => r.standard === "eMAG")).toBe(true);
    expect(items.every((i) => ["required", "prohibited"].includes(i.force))).toBe(true);
  });

  it("ordena por mensurabilidade e põe a cobertura não integral primeiro em cada posto", () => {
    const rules = pageChecklistRules();
    const keys = rules.map((r) => MEASURABILITY.indexOf(measurabilityOf(r)) * 2 + Number(oracleFullyMeasures(r.id)));
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    expect(pageChecklistRules().map((r) => r.id)).toEqual(rules.map((r) => r.id));
  });

  it("conserva cobertura parcial e sua limitação, sem dispensar o restante", () => {
    const partial = pageChecklistRules().filter((r) => oracleMeasuresFor(r.id).some((m) => m.coverage === "partial"));
    expect(partial.length).toBeGreaterThan(0);
    const { items } = allPages();
    for (const r of partial) {
      const item = items.find((i) => i.citeAs === r.id)!;
      expect(item.measure.automatic).toBe(false);
      expect(item.measure.oracle?.some((m) => m.coverage === "partial" && Boolean(m.limitation))).toBe(true);
    }
  });

  it("recusa cursor malformado ou de outro escopo com próximo passo exato", () => {
    for (const cursor of ["garbage", "c1.1.0000000000", "c1.-1.abc", "x".repeat(100)]) {
      const reply = pageChecklist(cursor);
      expect(reply).toHaveProperty("isError", true);
      const payload = JSON.parse((reply.content as Array<{ text: string }>)[0].text);
      expect(payload.errorCode).toBe("stale-cursor");
      expect(payload.next[0]).toMatchObject({ tool: "get_page_rules", arguments: { view: "checklist" } });
    }
  });

  it("recusa continuação após mudança de conteúdo com os mesmos ids e versão", () => {
    const first = JSON.parse(pageChecklist().content[0].text);
    const rule = pageChecklistRules()[0];
    const original = rule.originalText;
    try {
      rule.originalText = `${original} Conteúdo alterado para testar a identidade da continuação.`;
      const result = pageChecklist(first.page.cursor);
      expect(result).toHaveProperty("isError", true);
      expect(JSON.parse(result.content[0].text).errorCode).toBe("stale-cursor");
    } finally {
      rule.originalText = original;
    }
  });

  it("item indivisível grande gera recusa limitada com leitura por id e continuação", () => {
    const rule = pageChecklistRules()[0];
    const original = rule.source.url;
    try {
      rule.source.url = `https://example.test/${"a".repeat(9000)}`;
      const result = pageChecklist();
      expect(result).toHaveProperty("isError", true);
      expect(result.content[0].text.length).toBeLessThanOrEqual(8000);
      const error = JSON.parse(result.content[0].text);
      expect(error.errorCode).toBe("item-too-large");
      expect(error.next[0]).toMatchObject({ tool: "get_ds_rules", arguments: { id: rule.id } });
      const continuation = pageChecklist(error.next[1].arguments.cursor);
      expect(continuation).not.toHaveProperty("isError", true);
      expect(JSON.parse(continuation.content[0].text).items.some((i: Item) => i.citeAs === rule.id)).toBe(false);
    } finally {
      rule.source.url = original;
    }
  });
});
