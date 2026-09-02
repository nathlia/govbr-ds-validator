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
  };
  content: {
    textContent: string;
    hasVisibleText: boolean;
    hasIconOnly: boolean;
  };
  inlineStyle: string | null;
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
