/**
 * 3.4.0 (B9, A-04, V-05): verificação de foco visível — elemento focável pelo Tab cujo estilo não muda
 * em nada ao receber foco (evidence/focusIndicator.ts mede). Faz parte do check `structure` do scan.
 *
 * Norma (D-27): fica FORA de `CHECK_GROUNDING` como as verificações contextuais — o achado cita o id
 * normativo diretamente (`emag-4.4`, como `structure-accessible-name` cita `emag-2.2`), então não há
 * ponte de vocabulário a gerar e o gerador de aliases do eval não muda.
 */
import type { Finding } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import { findEmagRule } from "../data/load.js";
import type { FocusIndicatorFact } from "../evidence/focusIndicator.js";
import { FOCUS_COMPARED_PROPERTIES } from "../evidence/focusIndicator.js";
import type { CheckGrounding } from "./grounding.js";

export const FOCUS_INDICATOR_CONDITION = "focus-indicator-visible";

export const FOCUS_INDICATOR_GROUNDING: CheckGrounding = {
  implements: ["govbr-3.7.0-accessibility-global-bc492500708d", "emag-4.4"],
  basis:
    "e-MAG 4.4, frase literal (required): 'A área que recebe o foco pelo teclado deve ser claramente marcada'. A " +
    "verificação lê só a existência de marca: nenhuma propriedade de contorno, sombra, borda, fundo, cor ou " +
    "sublinhado do elemento, dos pseudo-elementos, do rótulo ou do pai muda com o foco. Contraste e tamanho do " +
    "indicador (WCAG 2.4.11/2.4.13) não são julgados.",
};

export function checkFocusIndicators(
  page: { url: string },
  facts: Array<FocusIndicatorFact & { snippet: string }>,
): Finding[] {
  const emag = findEmagRule("4.4");
  return facts
    // 3.4.1: só a ausência COMPROVADA de mudança vira achado — medição incompleta não acusa.
    .filter((fact) => fact.focused && fact.complete && fact.changed.length === 0)
    .map((fact) => ({
      id: nextFindingId(),
      rule: {
        id: "emag-4.4",
        source: "emag" as const,
        description: emag ? `${emag.title}.` : "Possibilitar que o elemento com foco seja visualmente evidente.",
        wcag: "2.4.7",
        implements: [...FOCUS_INDICATOR_GROUNDING.implements],
      },
      element: { locator: fact.locator, snippet: fact.snippet, page: page.url },
      evidence: {
        observed: "Ao receber foco, nenhuma propriedade visual do elemento, dos pseudo-elementos, do rótulo ou do pai mudou: sem indicador de foco visível",
        expected: "Alguma marca visível de foco (contorno, sombra, borda, fundo, cor ou sublinhado)",
        data: {
          expectedCondition: FOCUS_INDICATOR_CONDITION,
          comparedProperties: [...FOCUS_COMPARED_PROPERTIES],
          changedOnFocus: [],
        },
      },
      severity: "serious" as const,
      nature: "syntactic" as const,
      mode: "interaction" as const,
      pathway: "deterministic" as const,
    }));
}
