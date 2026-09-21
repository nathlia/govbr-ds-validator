/**
 * Discriminadores fechados para a condição esperada que cada predicado sabe recalcular.
 * O texto livre de evidence.expected continua sendo uma explicação humana; o gate não tenta
 * interpretá-lo. A confirmação liga estes valores estruturados ao predicado determinístico.
 */
export const EXPECTED_CONDITIONS = {
  tokenColor: "registered-govbr-ds-color-token",
  tokenFontFamily: "rawline-or-raleway",
  tokenRadius: "govbr-ds-radius-scale",
  tokenSpacing: "govbr-ds-spacing-scale",
  structureTag: "canonical-component-tag",
  /** 2.7.0: regiões obrigatórias do Template Base e o salto para o conteúdo (e-MAG 1.5). */
  pageRegion: "template-base-region-present",
  skipLink: "first-link-skips-to-content",
} as const;

