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
  /** 3.5.0 (revisão Fable P2): o salto é o primeiro elemento a receber o foco (nenhum tabindex>0 antes). */
  skipLinkFirstFocus: "skip-link-first-to-receive-focus",
  /** 3.6.1 (D-155, item 2): o documento tem título não vazio e distinto do de outras rotas da sessão (e-MAG 3.3 / WCAG 2.4.2). */
  documentTitle: "document-title-present-and-distinct",
  /** 3.5.0 (D-155): campo de formulário cujo único "rótulo" é o placeholder (e-MAG 6.2; DS Formulário). */
  placeholderOnlyLabel: "form-field-label-not-placeholder-only",
  /** 3.5.0 (C03): ícone decorativo ao lado do rótulo escondido da tecnologia assistiva (aria-hidden). */
  decorativeIconHidden: "decorative-icon-aria-hidden",
  /** 3.7.0 (C01): botão do DS só com ícone tem a classe circle (a única forma só com ícone que o DS admite); senão, rótulo visível. */
  iconOnlyButtonCircle: "icon-only-br-button-is-circle",
  /** 3.5.0 (C03): o title do link não repete o texto do link (e-MAG 3.5). */
  linkTitleNotRepeated: "link-title-not-repeating-text",
  /**
   * 3.7.3 A8: o atributo de estado ARIA (aria-checked/selected/expanded/disabled/required) diz o mesmo que o estado
   * nativo do elemento (checked/indeterminate, selected, open, :disabled, required) no estado reproduzido.
   */
  ariaStateMatchesNative: "aria-state-matches-native",
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
