/**
 * D-27 — as declarações de fundamentação têm de continuar apontando para regras que existem.
 *
 * Este teste é o guarda contra a deriva silenciosa: a base de conhecimento é regenerada quando o
 * `@govbr-ds/core` sobe de versão, e os ids são determinísticos mas não eternos. Sem isto, uma
 * declaração passaria a apontar para regra inexistente e o oráculo voltaria a afirmar norma que
 * ninguém escreveu — só que agora com aparência de fundamentada, que é pior.
 */
import { describe, it, expect } from "vitest";
import { CHECK_GROUNDING, type CheckKind } from "../../src/checkers/grounding.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { findEmagRule } from "../../src/data/load.js";

const kinds = Object.keys(CHECK_GROUNDING) as CheckKind[];

describe("fundamentação das verificações determinísticas", () => {
  it.each(kinds)("%s declara ids que existem no oráculo", (kind) => {
    for (const id of CHECK_GROUNDING[kind].implements) {
      const existe = id.startsWith("emag-") ? !!findEmagRule(id.replace(/^emag-/, "")) : !!getRuleById(id);
      expect(existe, `${kind} declara implementar '${id}', que não existe no oráculo`).toBe(true);
    }
  });

  it.each(kinds)("%s explica por que aqueles ids", (kind) => {
    expect(CHECK_GROUNDING[kind].basis.length).toBeGreaterThan(40);
  });

  it("só cita regra normativa — exemplo canônico não é norma (D-10)", () => {
    for (const kind of kinds) {
      for (const id of CHECK_GROUNDING[kind].implements) {
        if (id.startsWith("emag-")) continue;
        expect(getRuleById(id)?.force).not.toBe("example");
      }
    }
  });

  it("a verificação de classes não canônicas segue sem norma — e por isso sem achado", () => {
    // Se algum dia aparecer uma regra do DS sobre classes extras, esta expectativa falha e a
    // decisão do D-27 é reaberta com evidência. É o único jeito honesto de mudá-la de volta.
    expect(CHECK_GROUNDING["structure-unknown-classes"].implements).toEqual([]);
  });
});
