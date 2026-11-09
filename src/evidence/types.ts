/**
 * Evidence shapes produced by the browser inspection layer (C5 phase 1) and
 * consumed by the deterministic checkers (B1) and the agent (semantic
 * judgment). Kept playwright-free so checkers can be unit-tested with plain
 * fixtures.
 */

export interface ComputedStyleEvidence {
  backgroundColor: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  borderRadius: string;
  borderColor: string;
  border: string;
  padding: string;
  margin: string;
  outline: string;
  cursor: string;
  opacity: string;
}

export interface FocusStyleEvidence {
  outline: string;
  outlineColor: string;
  outlineWidth: string;
  outlineStyle: string;
  outlineOffset: string;
  boxShadow: string;
}

export interface ElementEvidence {
  /** Stable CSS locator (#id, [data-testid=...], or structural path). */
  locator: string;
  tagName: string;
  id: string | null;
  classes: string[];
  attributes: {
    type: string | null;
    role: string | null;
    ariaLabel: string | null;
    ariaRequired: string | null;
    ariaDisabled: string | null;
    ariaDescribedby: string | null;
    ariaHidden: string | null;
    disabled: boolean;
    required: boolean;
    htmlFor: string | null;
    placeholder: string | null;
    alt: string | null;
    tabindex: string | null;
    /** Ausente em evidência colhida antes da 2.6.0. */
    href?: string | null;
    /** Ausentes em evidência colhida antes da 2.8.0. */
    title?: string | null;
    ariaLabelledby?: string | null;
    /**
     * 3.7.3 A8: atributos de estado ARIA com estado nativo equivalente, só quando o atributo existe (valor cru).
     * aria-pressed não tem par nativo e não é colhido.
     */
    ariaChecked?: string;
    ariaSelected?: string;
    ariaExpanded?: string;
  };
  /**
   * 3.7.3 A8: o estado nativo que corresponde a um atributo de estado ARIA, lido das propriedades vivas do elemento
   * (não dos atributos de marcação). Só em elemento que tem algum atributo aria-checked/selected/expanded/disabled/
   * required e que tem o par nativo: checked/indeterminate (input checkbox/radio), selected (option), open (details e o
   * summary dele), disabled (:disabled em controle de formulário), required (campo onde required se aplica).
   */
  nativeState?: {
    checked?: boolean;
    indeterminate?: boolean;
    selected?: boolean;
    open?: boolean;
    disabled?: boolean;
    required?: boolean;
    /** Em option: o select que a contém está renderizado (a opção de lista fechada não tem caixa própria). */
    inRenderedSelect?: boolean;
    /** Fora do perfil knowledge-free: o elemento está num Switch do DS (ancestral .br-switch ou host <br-switch>). */
    dsSwitch?: true;
  };
  content: {
    textContent: string;
    hasVisibleText: boolean;
    /** Opt-in A8: innerText, exclui descendentes ocultos; sem reclassificar hasVisibleText legado. */
    hasRenderedText?: boolean;
    hasIconOnly: boolean;
    /**
     * Texto que `aria-labelledby` resolve: os ids procurados na MESMA árvore do elemento (documento
     * ou shadow root), concatenados e aparados. `null` sem o atributo; `""` quando nenhum id existe
     * ou todos apontam para elementos vazios. Ausente antes da 2.8.0.
     */
    labelledbyText?: string | null;
    /** `alt` não vazio das `<img>` descendentes, concatenado (nome pelo conteúdo). Ausente antes da 2.8.0. */
    descendantAlt?: string | null;
    /** Texto do `<label for>` (mesma árvore) ou do `<label>` ancestral. Ausente antes da 2.8.0. */
    labelText?: string | null;
    /**
     * 3.5.0 (C03): em controle (button, a, role=button) com nome pelo conteúdo e texto próprio, quantos ícones
     * (i, svg, span .fa-/icon) sem texto estão expostos à tecnologia assistiva (sem aria-hidden="true" nem role
     * none/presentation até o controle, sem nome próprio). Só aparece quando > 0.
     */
    exposedIcons?: number;
    /**
     * 3.7.0 (C01): só em elemento com a classe `br-button` (e fora do perfil knowledge-free) — o conteúdo renderizado
     * é só ícone (`i`, `svg`, `img` com caixa) e nenhum texto visível: texto em elemento sem caixa, de 1px, recortado
     * (clip / clip-path, o padrão `sr-only`), com opacidade 0 ou dentro de `svg` não conta como visível.
     */
    iconOnlyVisual?: boolean;
    /** 3.7.0 (C01): o `br-button` tem o atributo `circle` (a folha do DS desenha o circular também por `.br-button[circle]`). */
    circleAttribute?: true;
  };
  /**
   * 3.7.0 (C01): só em elemento com a classe `br-button` — as classes raiz `br-*` dos componentes do DS que o contêm,
   * do mais próximo ao mais externo (atravessando hosts de shadow root; até 8), ou ausente. Diz se o botão é parte de
   * outro componente.
   */
  hostComponents?: string[];
  /**
   * Nome acessível do elemento (2.8.0), colhido só para elemento interativo apenas com ícone — o
   * único caso em que um verificador decide sobre ele.
   *   source "chromium"   nome que o próprio Chromium calcula (árvore de acessibilidade via CDP),
   *                       o mesmo que um leitor de tela recebe
   *   source "atributos"  aproximação pela ordem do cálculo de nome (aria-labelledby > aria-label >
   *                       conteúdo/alt > title), usada quando o navegador não oferece CDP
   */
  accessibleName?: { name: string; source: "chromium" | "atributos" };
  inlineStyle: string | null;
  /**
   * Declarações CSS de autoria DA PÁGINA que alcançam diretamente o elemento, por propriedade
   * computada inspecionada. A lista preserva a ordem das folhas de estilo e termina com o estilo
   * inline, quando houver. Um mapa presente sem a propriedade significa que o valor observado
   * veio de herança, resolução de layout ou estilo do agente de usuário — não da página.
   */
  authored?: Partial<Record<keyof ComputedStyleEvidence, string[]>>;
  /**
   * Declarações que alcançam o elemento e coincidem — seletor, propriedade e valor — com a folha
   * oficial do gov.br DS (`data/ds-stylesheet.json`). Ficam fora de `authored`: um valor que o
   * próprio DS publica não é escolha da página, e os verificadores de token não o cobram dela.
   */
  dsShipped?: Partial<Record<keyof ComputedStyleEvidence, string[]>>;
  /** Only properties requested by the caller are present. */
  computed: Partial<ComputedStyleEvidence>;
  /** Empty when no focus-state property was requested. */
  focused: Partial<FocusStyleEvidence>;
  outerHTML: string;
  /**
   * True when the element lives inside an open shadow root — its `locator` then crosses one or
   * more boundaries with ` >>> `. Worth surfacing: a defect inside a web component belongs to the
   * component's author, not to the page that used it, and the two are different findings.
   */
  inShadowDom: boolean;
  /** 3.4.0 (B5): cor, largura e estilo de cada lado da borda — só quando borderColor foi pedido. */
  borderSides?: Array<{ side: "top" | "right" | "bottom" | "left"; color: string; width: string; style: string }>;
  /** 3.4.0: o elemento tem caixa na página e não está com visibility hidden. Ausente antes da 3.4.0. */
  rendered?: boolean;
  /**
   * 3.4.0 (B10): origem conhecida do elemento quando não é marcação da página — `flatpickr` = injetado
   * pela biblioteca de calendário que o datetimepicker do @govbr-ds/core usa.
   */
  origin?: "flatpickr" | "ds-web-component";
  /** 3.4.4 (C3): com origin "ds-web-component", a tag do host (ex.: br-breadcrumb). */
  originHost?: string;
  /**
   * 3.5.0 (D-155): só em campo de formulário (input/select/textarea) com origin "ds-web-component" — o host
   * recebeu da página `label`, `aria-label` ou `aria-labelledby` não vazio. Com o host nomeado, um rótulo
   * interno que falte é defeito do componente, não da página.
   */
  originHostNamed?: boolean;
  /** 3.5.0 (D-155): o elemento ou um ancestral (atravessando shadow roots) tem aria-hidden="true" ou inert. */
  axHidden?: boolean;
  /** 3.4.0 (B9): medição de foco visível, preenchida só pelo portão para o predicado focus-indicator. */
  focusIndicator?: { focused: boolean; changed: string[]; complete?: boolean; discounted?: string[] };
}

export interface PageEvidence {
  url: string;
  /** Combined selector retained for backward-compatible consumers. */
  selector: string;
  selectors: string[];
  properties: string[];
  count: number;
  elements: ElementEvidence[];
}
