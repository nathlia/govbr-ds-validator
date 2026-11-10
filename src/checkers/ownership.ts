/**
 * 3.4.4 (C3, C4, C5): o que é da página e o que não é.
 *
 * Os checks de tokens e estrutura julgam marcação e CSS AUTORAIS da página. Três grupos de elementos
 * chegavam a eles e viravam achado sem ser:
 *   - `ds-web-component`: internos do shadow root de um web component do DS (host <br-*>) — o `<div>`
 *     que o próprio <br-breadcrumb> renderiza, o padding do `<a>` dele. Código do componente;
 *   - `ds-third-party`: o que o DS embute de terceiros (o calendário flatpickr do datetimepicker);
 *   - `not-rendered`: elemento sem caixa (display:none, ancestral hidden) ou com visibility hidden — um
 *     diálogo fechado, um menu recolhido. Estilo que não aparece não é estilo da tela (só tokens).
 * Os achados que esses elementos gerariam continuam visíveis, como observação fora da pontuação
 * (kind `outside-page-authorship`), com o motivo, a norma e o valor — nunca somem em silêncio.
 */
import type { ElementEvidence } from "../evidence/types.js";
import type { Finding, Observation } from "../schema/finding.js";

export type Ownership = "page" | "ds-web-component" | "ds-third-party" | "not-rendered";

export function ownershipOf(el: ElementEvidence): Ownership {
  if (el.origin === "ds-web-component") return "ds-web-component";
  if (el.origin === "flatpickr") return "ds-third-party";
  if (el.rendered === false) return "not-rendered";
  return "page";
}

/**
 * Separa os elementos para um check. `styleCheck` = tokens (estilo de elemento não renderizado não conta);
 * estrutura julga a marcação mesmo oculta, mas nunca a de dentro de componente do DS ou de terceiros.
 */
export function partitionByOwnership(elements: ElementEvidence[], styleCheck: boolean) {
  const page: ElementEvidence[] = [];
  const outside: ElementEvidence[] = [];
  for (const el of elements) {
    const own = ownershipOf(el);
    if (own === "page" || (own === "not-rendered" && !styleCheck)) page.push(el);
    else outside.push(el);
  }
  return { page, outside };
}

const WHY: Record<Exclude<Ownership, "page">, string> = {
  "ds-web-component":
    "O elemento está dentro do shadow root de um web component do próprio DS: a marcação e o CSS são do componente, não da página que o usou. Não é defeito de autoria desta tela.",
  "ds-third-party":
    "O elemento é injetado por biblioteca de terceiros que o próprio DS embute (o calendário flatpickr do datetimepicker do core): não é marcação da página.",
  "not-rendered":
    "O elemento não está renderizado neste estado (sem caixa: display:none ou ancestral oculto; ou visibility:hidden). Estilo que não aparece na tela não é medido como achado; meça no estado em que ele aparece.",
};

/**
 * Nome acessível de controle dentro de web component do DS: o nome vem do que a PÁGINA passa ao host
 * (aria-label, rótulo, texto) — um <br-button> só com ícone e sem rótulo é defeito de quem o usou. Esse
 * achado fica como achado de página; tag e estilo internos do componente, não.
 */
function pageSuppliedInside(f: Finding, el: ElementEvidence | undefined): boolean {
  return el?.origin === "ds-web-component" && f.evidence.data?.hasIconOnly === true;
}

/**
 * Achados de elementos fora da autoria da página: os que a página ainda determina (nome acessível de
 * controle dentro de web component do DS) ficam em `findings`; o resto vira observação com o motivo.
 */
export function splitOutside(findings: Finding[], elements: ElementEvidence[]): { findings: Finding[]; observations: Observation[] } {
  const byLocator = new Map(elements.map((el) => [el.locator, el]));
  const kept = findings.filter((f) => pageSuppliedInside(f, byLocator.get(f.element.locator)));
  const demoted = findings.filter((f) => !pageSuppliedInside(f, byLocator.get(f.element.locator)));
  return { findings: kept, observations: demoteToObservations(demoted, elements) };
}

/** Achados de elementos fora da autoria da página → observações com o motivo (fora da pontuação). */
export function demoteToObservations(findings: Finding[], elements: ElementEvidence[]): Observation[] {
  const byLocator = new Map(elements.map((el) => [el.locator, el]));
  return findings.map((f) => {
    const el = byLocator.get(f.element.locator);
    const own = el ? ownershipOf(el) : "not-rendered";
    const reason = own === "page" ? "not-rendered" : own;
    return {
      kind: "outside-page-authorship",
      element: f.element,
      note: `${f.rule.id}: ${f.evidence.observed}${el?.originHost ? ` (dentro de <${el.originHost}>)` : ""}`,
      whyNotAFinding: WHY[reason],
      data: {
        reason,
        ...(el?.originHost ? { host: el.originHost } : {}),
        rule: { source: f.rule.source, id: f.rule.id, ...(f.rule.checker ? { checker: f.rule.checker } : {}) },
        observed: f.evidence.observed,
        ...(f.evidence.expected ? { expected: f.evidence.expected } : {}),
        // 3.4.4 (revisão, M2): estilo autoral da página num estado oculto (menu fechado, diálogo fechado) não
        // some — fica fora da pontuação NESTE estado e diz como medi-lo no estado em que aparece.
        ...(reason === "not-rendered"
          ? {
              hiddenInState: true,
              // 3.7.8 (N1): a condição do verify do desvio, para decidi-lo no estado em que aparece.
              ...(typeof f.evidence.data?.expectedCondition === "string" ? { expectedCondition: f.evidence.data.expectedCondition } : {}),
              next: { tool: "scan_page", hint: "meça no estado em que aparece (scan_page com a ação que o abre)" },
            }
          : {}),
      },
    };
  });
}
