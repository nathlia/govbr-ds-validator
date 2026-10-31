/**
 * 3.6.2 (D-155) — regressão de chamadas REAIS do braço com (reexecução sem modelo de 128 chamadas, 3.6.0 × 3.6.1:
 * thesis-workspace/planejamento/atual/reexecucao-3.6.1-2026-10-31). As fixtures são as entradas exatas do
 * assembleScan (cabeçalho, observações, achados, teto) capturadas do build 3.6.1 em três scans posteriores ao 1º:
 *   a-p03-21  tela A, diálogo aberto com compareToScanId (3.6.1 cortava a ordem de foco e a família da cor);
 *   b-p02-11  tela B, menu do avatar aberto, checks:["axe"], maxChars 6000 (revisited empurrava aria-required-children);
 *   b-p02-13  tela B, checks:["axe"], maxChars 3000 (3.6.1 devolvia 3.191 caracteres).
 * A 1ª página tem de trazer ao menos as famílias que a 3.6.0 trazia, e nunca passar do teto pedido.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assembleScan } from "../../src/responses/scan.js";
import { buildFamilyPage } from "../../src/responses/families.js";
import { textSize } from "../../src/responses/contract.js";

const DIR = join(import.meta.dirname, "../fixtures/replay-3.6.1");
const key = (f: { rule: { checker?: string; id: string }; property?: string; example?: { element?: { locator?: string } } }) =>
  `${f.rule.checker ?? f.rule.id}|${f.property ?? ""}|${f.example?.element?.locator ?? ""}`;

function replay(name: string, maxChars?: number) {
  const d = JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8"));
  if (maxChars) d.maxChars = maxChars;
  const r = assembleScan(d.head, d.observations, d.scanId, d.maxChars, (budget) =>
    buildFamilyPage(d.findings, { ...d.args, maxChars: budget, stateFingerprint: d.stateFingerprint, verificationFor: () => undefined }), { firstScanPage: d.first });
  return { d, r };
}

describe("3.6.2 — 1ª página de scans posteriores: famílias antes do cabeçalho, teto garantido", () => {
  for (const name of ["a-p03-21", "b-p02-11", "b-p02-13"]) {
    it(`${name}: famílias da 1ª página ⊇ as da 3.6.0 e tamanho ≤ maxChars`, () => {
      const { d, r } = replay(name);
      expect(textSize(r)).toBeLessThanOrEqual(d.maxChars);
      expect(r.exceedsMaxChars).toBeUndefined();
      const got = new Set(((r.families as never[]) ?? []).map(key));
      for (const k of d.page1Families360 as string[]) expect(got.has(k), `${name}: perdeu ${k}`).toBe(true);
    });
  }

  it("revisão: os textos de checksRun.limits (D-154) e os ids das pendências de outras rotas ficam na 1ª página", () => {
    for (const name of ["a-p03-21", "b-p02-11"]) {
      const { r } = replay(name);
      const limits = (r.checksRun as { limits: Array<{ code: string; text?: string } | string> }).limits;
      expect(limits.every((l) => typeof l === "object" && typeof l.text === "string"), name).toBe(true);
    }
    for (const max of [6_000, 8_000]) {
      const { r } = replay("b-p02-11", max);
      const sp = r.sessionPending as { ids?: string[]; items?: Array<{ ids: string[] }> };
      expect((sp.ids ?? sp.items?.flatMap((i) => i.ids) ?? []).length, `maxChars ${max}`).toBeGreaterThan(0);
    }
  });

  it("revisão: no mínimo do esquema (maxChars 1000) a resposta cabe ou diz que não cabe; nada some", () => {
    for (const name of ["a-p03-21", "b-p02-11", "b-p02-13"]) {
      const { r } = replay(name, 1_000);
      if (textSize(r) > 1_000) expect(r.exceedsMaxChars, name).toMatchObject({ maxChars: 1_000 });
      if (name === "b-p02-11") {
        expect(r.sessionPending, name).toBeDefined();
        expect(r.revisited, name).toBeDefined();
      }
      expect(r.next ?? r.nextCursor, name).toBeDefined();
    }
  });

  it("o cabeçalho só encolhe enquanto falta família; a janela da receita (atestação do runner) fica", () => {
    const { r } = replay("a-p03-21");
    const st = r.state as { recipe?: { viewport?: unknown; viewportSource?: unknown } };
    expect(st.recipe).toEqual(expect.objectContaining({ viewportSource: expect.any(String) }));
    expect(r.compacted).toEqual(expect.arrayContaining(["coverage", "state"]));
  });
});
