/**
 * 3.6.1 (D-155, NAT-104) — a emenda da base literal é uma entrada declarada: aplicá-la ao rules.jsonl sem ela
 * reproduz o rules.jsonl servido byte a byte, e o rótulo da versão servida diz que há emenda.
 * 3.7.3 (D-167) — a emenda-2 é GERADA (scripts/kb-spec-units.mjs): a declaração fixa regras, gerador e o sha256 das
 * unidades; aplicá-la reproduz as unidades a partir do corpus e as confere contra o texto literal.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error módulo .mjs do script de montagem da base (sem tipos)
import { amendmentUnits, applyAmendment, applyAmendments, checkAmendment, readAmendment, readAmendments, versionPaths } from "../../scripts/lib/kb-amendments.mjs";
import { getKnowledgeBase } from "../../src/data/knowledge.js";

const LITERAL = "3.7.0-literal-2026-10-15";
const ROOT = join(import.meta.dirname, "../..");
const RULES = join(ROOT, `data/knowledge/versions/${LITERAL}/normalized/rules.jsonl`);
type Unit = { id: string; force: string; source: { captureType: string } };
const lines = (text: string) => text.split("\n").filter((l) => l.trim());

describe("3.6.1 — emenda declarada da base literal", () => {
  it("rules.jsonl sem as unidades das emendas + as emendas em ordem = rules.jsonl servido, byte a byte", () => {
    const amendments = readAmendments(LITERAL);
    expect(amendments.map((a: { label: string }) => a.label)).toEqual(["emenda-1", "emenda-2"]);
    const first = readAmendment(LITERAL);
    expect(first.units).toHaveLength(3);
    expect(() => checkAmendment(first)).not.toThrow();
    const served = readFileSync(RULES, "utf8");
    const added = new Set(first.units.map((u: Unit) => u.id));
    const base = lines(served).filter((l) => !added.has(JSON.parse(l).id) && JSON.parse(l).source.captureType !== "literal-corpus-specification").join("\n") + "\n";
    // a emenda-1 sozinha reproduz o rules.jsonl da 3.6.1–3.7.2 (as linhas dela continuam byte a byte as mesmas)
    const afterFirst = applyAmendment(base, first);
    expect(served.startsWith(afterFirst)).toBe(true);
    expect(applyAmendments(base, amendments)).toBe(served);
    expect(() => applyAmendment(served, first)).toThrow(/já está/);
  });

  it("o build da base aplica a emenda (entrada declarada) antes de escrever rules.jsonl", () => {
    const script = readFileSync(join(ROOT, "scripts/build-kb-literal.mjs"), "utf8");
    expect(script).toMatch(/applyAmendment\(literal\.map\(\(r\) => JSON\.stringify\(r\)\)\.join\("\\n"\) \+ "\\n", amendment\)/);
  });

  it("a versão servida leva o rótulo da última emenda e declara as duas em meta; a pasta continua a mesma", () => {
    const meta = getKnowledgeBase().meta;
    expect(meta.knowledgeVersion).toBe(`${LITERAL}+emenda-2`);
    expect(meta.knowledgeDir).toBe(LITERAL);
    expect(meta.amendments).toHaveLength(2);
    expect(meta.amendments[0]).toEqual(expect.objectContaining({ label: "emenda-1", validator: "3.6.1", added: readAmendment(LITERAL).units.map((u: Unit) => u.id) }));
    expect(meta.amendments[1]).toEqual(expect.objectContaining({ label: "emenda-2", validator: "3.7.3" }));
    expect(meta.amendments[1].added).toHaveLength(meta.specificationRules);
  });
});

describe("3.7.3 — emenda-2 gerada (unidades de especificação, D-167)", () => {
  it("o gerador reproduz as unidades declaradas (sha256), todas literais do corpus e com força própria", () => {
    const second = readAmendments(LITERAL)[1];
    expect(second.units).toBeUndefined(); // nenhuma unidade escrita à mão na declaração
    expect(second.generator.script).toBe("scripts/kb-spec-units.mjs");
    expect(second.rules.map((r: { id: string }) => r.id)).toEqual(["T1", "S1", "S2", "X1", "ID"]);
    const served = readFileSync(RULES, "utf8");
    const base = lines(served).filter((l) => JSON.parse(l).source.captureType !== "literal-corpus-specification").join("\n") + "\n";
    const units: Unit[] = amendmentUnits(second, base, versionPaths(LITERAL));
    expect(units).toHaveLength(second.counts.units);
    expect(units.every((u) => u.force === "especificacao" && u.source.captureType === "literal-corpus-specification")).toBe(true);
    expect(() => checkAmendment(second, ROOT, units)).not.toThrow();
    // um texto adulterado não passa
    const forged = [{ ...units[0], originalText: units[0].originalText + " " }];
    expect(() => checkAmendment(second, ROOT, forged)).toThrow(/não é literal/);
  });

  it("node scripts/kb-spec-units.mjs --check: os arquivos em disco são o que o gerador escreve", () => {
    const out = execFileSync(process.execPath, [join(ROOT, "scripts/kb-spec-units.mjs"), "--check"], { encoding: "utf8" });
    expect(JSON.parse(out).changed).toEqual([]);
  }, 60_000);
});
