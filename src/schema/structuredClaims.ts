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
  // 2.13.0 (NAT-85) — verificação contextual delimitada. Cada condição nomeia o estado ESPERADO;
  // a alegação de violação diz que ele não se cumpre. Só as regras listadas em
  // verify/contextual.ts (CONTEXT_CONDITIONS) selecionam estes predicados.
  /** P1: erro detectado → o item em erro é identificado (WCAG 3.3.1 / e-MAG 6.6). */
  errorItemIdentified: "input-error-item-identified",
  /** P1: erro detectado → o erro é descrito em texto (WCAG 3.3.1 / e-MAG 6.6). */
  errorDescribedInText: "input-error-described-in-text",
  /** P1: mensagem de status determinável por papel/propriedade sem receber foco (WCAG 4.1.3). */
  statusMessage: "status-message-programmatically-determined",
  /** P2: parte obrigatória da anatomia presente na raiz do componente. */
  anatomyPart: "required-anatomy-part-present",
  /** P2: o último item do breadcrumb (página atual) não é link. */
  currentCrumbNotLink: "current-page-crumb-not-link",
  /** P3: ao fechar a modal, o foco volta ao último elemento focado. */
  focusRestored: "focus-returns-to-invoker-on-close",
  /** P3: foco inicial da modal no controle que a regra exige. */
  initialFocus: "initial-focus-on-required-control",
  /** P3: com a modal aberta, o Tab percorre só os elementos dela. */
  focusContained: "tab-stays-within-modal",
  /** P3: ao exibir (Message) ou abrir (Menu), o foco vai para o botão fechar, quando houver. */
  focusOnClose: "focus-on-close-button-when-shown",
} as const;
