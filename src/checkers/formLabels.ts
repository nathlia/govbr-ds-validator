/**
 * 3.5.0 (D-155, item 4a): rótulo de campo de formulário — o placeholder no lugar do rótulo.
 *
 * O que é medido, e só isto: um campo (`input` de texto, `textarea`) exibido e exposto à árvore de
 * acessibilidade tem `placeholder` não vazio e NENHUMA fonte de rótulo associada — nem `<label for>` /
 * `<label>` ancestral com texto, nem `aria-labelledby` que resolva para texto, nem `aria-label` não vazio.
 * O axe (`label`) aceita o placeholder como nome acessível e por isso não marca esse campo; o agente lia o
 * silêncio do scan como cobertura (B-03, `mecanismo-oraculo-tela-b-ensaio-b-03-2026-10-30.md`).
 *
 * Norma (D-27), lida na base servida:
 *   - e-MAG 6.2, cláusula obrigatória: "As etiquetas de texto (elemento LABEL) devem estar associadas aos
 *     seus campos (elementos INPUT, SELECT e TEXTAREA …)" — `govbr-3.7.0-accessibility-global-25887e6e360f`;
 *   - DS, padrão Formulário, proibição: "não utilize placeholders no lugar de rótulos" —
 *     `govbr-3.7.0-pattern-global-aabbc9b63402`.
 * Fica fora de `CHECK_GROUNDING` como o foco visível: o achado cita `emag-6.2` diretamente.
 *
 * Conservador de propósito:
 *   - nome vindo só do `title` (sem placeholder) NÃO é achado — a WCAG aceita `title` como técnica (H65);
 *     vira pendência no `notJudged` do scan;
 *   - campo sem nome nenhum é do axe (`label`), não daqui;
 *   - campo oculto, fora da árvore de acessibilidade, desabilitado ou de tipo que não recebe texto não conta;
 *   - dentro de web component do DS: o rótulo vem do que a página passa ao host; com o host nomeado
 *     (label/aria-label/aria-labelledby), um rótulo interno que falte é do componente → observação;
 *   - campo injetado por terceiro que o DS embute (flatpickr) → observação.
 */
import type { ElementEvidence } from "../evidence/types.js";
import type { Finding, Observation } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import { findEmagRule } from "../data/load.js";
import type { CheckGrounding } from "./grounding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";

export const PLACEHOLDER_LABEL_CONDITION = EXPECTED_CONDITIONS.placeholderOnlyLabel;

export const PLACEHOLDER_LABEL_GROUNDING: CheckGrounding = {
  implements: ["govbr-3.7.0-accessibility-global-25887e6e360f", "govbr-3.7.0-pattern-global-aabbc9b63402", "emag-6.2"],
  basis:
    "e-MAG 6.2, frase literal (required): 'As etiquetas de texto (elemento LABEL) devem estar associadas aos seus " +
    "campos'; DS, padrão Formulário (prohibited): 'não utilize placeholders no lugar de rótulos'. A verificação lê só " +
    "isto: campo exibido com placeholder e sem label associado, aria-labelledby com texto ou aria-label.",
};

/** Campos de formulário que o scan lê para rótulo (o tipo decide se o placeholder se aplica). */
export const FORM_FIELD_SELECTOR = "input, textarea, select";

/** Tipos de `input` que não recebem texto digitado: o placeholder não se aplica a eles. */
const NON_TEXT_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "checkbox", "radio", "file", "color", "range"]);

/** 3.6.5 (item 3b): os campos a que a verificação do placeholder se aplica (os que recebem texto digitado), como seletor. */
export const PLACEHOLDER_SUBJECT_SELECTOR = [`input${[...NON_TEXT_TYPES].map((t) => `:not([type='${t}'])`).join("")}`, "textarea"].join(", ");

export type LabelSource =
  | { kind: "labelled"; via: "label" | "aria-labelledby" | "aria-label" }
  | { kind: "placeholder-only"; placeholder: string; title: string | null }
  | { kind: "title-only"; title: string }
  | { kind: "unnamed" }
  | { kind: "not-applicable"; why: string };

const text = (value: string | null | undefined) => (value ?? "").trim();

/** De onde vem o rótulo do campo, pela evidência colhida (DOM; o mesmo cálculo no scan e no portão). */
export function labelSourceOf(el: ElementEvidence): LabelSource {
  const tag = el.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea" && tag !== "select") return { kind: "not-applicable", why: "não é campo de formulário" };
  const type = text(el.attributes.type).toLowerCase();
  if (tag === "input" && NON_TEXT_TYPES.has(type)) return { kind: "not-applicable", why: `input type="${type}" não recebe texto` };
  if (el.rendered === false) return { kind: "not-applicable", why: "não exibido neste estado" };
  if (el.axHidden || el.attributes.ariaHidden === "true") return { kind: "not-applicable", why: "fora da árvore de acessibilidade (aria-hidden/inert)" };
  if (el.attributes.disabled) return { kind: "not-applicable", why: "desabilitado" };
  if (text(el.content.labelText)) return { kind: "labelled", via: "label" };
  if (text(el.content.labelledbyText)) return { kind: "labelled", via: "aria-labelledby" };
  if (text(el.attributes.ariaLabel)) return { kind: "labelled", via: "aria-label" };
  const placeholder = text(el.attributes.placeholder);
  const title = text(el.attributes.title);
  // 3.5.0 (revisão, LOW): com title o placeholder não é a ÚNICA fonte do nome — vira pendência, como title sozinho.
  if (title) return { kind: "title-only", title };
  if (placeholder && tag !== "select") return { kind: "placeholder-only", placeholder, title: null };
  return { kind: "unnamed" };
}

/** O rótulo interno de um campo dentro de componente do DS depende do host: nomeado pela página → do componente. */
function insideNamedDsHost(el: ElementEvidence): boolean {
  return el.origin === "ds-web-component" && el.originHostNamed === true;
}

function finding(page: { url: string }, el: ElementEvidence, source: Extract<LabelSource, { kind: "placeholder-only" }>): Finding {
  const emag = findEmagRule("6.2");
  return {
    id: nextFindingId(),
    rule: {
      id: "emag-6.2",
      source: "emag",
      description: emag ? `${emag.title}.` : "Associar etiquetas aos seus campos.",
      wcag: "3.3.2",
      implements: [...PLACEHOLDER_LABEL_GROUNDING.implements],
    },
    element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: page.url },
    evidence: {
      observed:
        `Campo com placeholder "${source.placeholder.slice(0, 80)}" e nenhum rótulo associado (sem <label> com texto, ` +
        `aria-labelledby com texto ou aria-label)${source.title ? `; title="${source.title.slice(0, 60)}"` : ""}` +
        `${el.origin === "ds-web-component" && el.originHost ? `; o host <${el.originHost}> não recebeu label/aria-label da página` : ""}: o placeholder faz o papel do rótulo`,
      expected: "Um rótulo associado ao campo (<label for>/<label> ancestral, aria-labelledby ou aria-label); o placeholder não substitui o rótulo",
      data: {
        expectedCondition: PLACEHOLDER_LABEL_CONDITION,
        placeholder: source.placeholder.slice(0, 120),
        ...(source.title ? { title: source.title.slice(0, 120) } : {}),
        labelSources: { label: null, ariaLabelledby: el.attributes.ariaLabelledby ?? null, ariaLabel: null },
        ...(el.originHost ? { host: el.originHost } : {}),
      },
    },
    severity: "serious",
    nature: "syntactic",
    mode: "display",
    pathway: "deterministic",
  };
}

/**
 * Achados (campos da página, ou de componente do DS cujo host a página deixou sem nome) e observações
 * (campo de componente com host nomeado; campo de terceiro embutido).
 */
export function checkPlaceholderLabels(page: { url: string }, elements: ElementEvidence[]): { findings: Finding[]; observations: Observation[] } {
  const findings: Finding[] = [];
  const observations: Observation[] = [];
  for (const el of elements) {
    const source = labelSourceOf(el);
    if (source.kind !== "placeholder-only") continue;
    const f = finding(page, el, source);
    if (el.origin === "flatpickr" || insideNamedDsHost(el)) {
      observations.push({
        kind: "outside-page-authorship",
        element: f.element,
        note: `emag-6.2: campo com placeholder e sem rótulo interno${el.originHost ? ` (dentro de <${el.originHost}>, que recebeu nome da página)` : ""}`,
        whyNotAFinding:
          el.origin === "flatpickr"
            ? "O campo é injetado por biblioteca de terceiros que o próprio DS embute (flatpickr): não é marcação da página."
            : "O host do web component do DS recebeu label/aria-label da página; repassar o rótulo ao campo interno é do componente.",
        data: { reason: el.origin === "flatpickr" ? "ds-third-party" : "ds-web-component", rule: { source: "emag", id: "emag-6.2" }, observed: f.evidence.observed, ...(el.originHost ? { host: el.originHost } : {}) },
      });
      continue;
    }
    findings.push(f);
  }
  return { findings, observations };
}
