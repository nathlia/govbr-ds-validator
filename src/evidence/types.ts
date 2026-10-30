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
  };
  content: {
    textContent: string;
    hasVisibleText: boolean;
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
  };
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
