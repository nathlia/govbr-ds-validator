/**
 * 3.6.1 (D-155, NAT-104) — a emenda da base literal é uma entrada declarada: aplicá-la ao rules.jsonl sem ela
 * reproduz o rules.jsonl servido byte a byte, e o rótulo da versão servida diz que há emenda.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error módulo .mjs do script de montagem da base (sem tipos)
import { applyAmendment, checkAmendment, readAmendment } from "../../scripts/lib/kb-amendments.mjs";
import { getKnowledgeBase } from "../../src/data/knowledge.js";

const LITERAL = "3.7.0-literal-2026-10-15";
const RULES = join(import.meta.dirname, `../../data/knowledge/versions/${LITERAL}/normalized/rules.jsonl`);

describe("3.6.1 — emenda declarada da base literal", () => {
  it("rules.jsonl sem as unidades da emenda + a emenda = rules.jsonl servido, byte a byte", () => {
    const amendment = readAmendment(LITERAL);
    expect(amendment.units).toHaveLength(3);
    expect(() => checkAmendment(amendment)).not.toThrow();
    const served = readFileSync(RULES, "utf8");
    const added = new Set(amendment.units.map((u: { id: string }) => u.id));
    const base = served.split("\n").filter((l) => l.trim() && !added.has(JSON.parse(l).id)).join("\n") + "\n";
    expect(applyAmendment(base, amendment)).toBe(served);
    expect(() => applyAmendment(served, amendment)).toThrow(/já está/);
  });

  it("o build da base aplica a emenda (entrada declarada) antes de escrever rules.jsonl", () => {
    const script = readFileSync(join(import.meta.dirname, "../../scripts/build-kb-literal.mjs"), "utf8");
    expect(script).toMatch(/applyAmendment\(literal\.map\(\(r\) => JSON\.stringify\(r\)\)\.join\("\\n"\) \+ "\\n", amendment\)/);
  });

  it("a versão servida leva o rótulo da emenda e a declara em meta; a pasta continua a mesma", () => {
    const meta = getKnowledgeBase().meta;
    expect(meta.knowledgeVersion).toBe(`${LITERAL}+emenda-1`);
    expect(meta.knowledgeDir).toBe(LITERAL);
    expect(meta.amendments).toEqual([expect.objectContaining({ label: "emenda-1", validator: "3.6.1", added: readAmendment(LITERAL).units.map((u: { id: string }) => u.id) })]);
  });
});
