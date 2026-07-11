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
  computed: ComputedStyleEvidence;
  focused: FocusStyleEvidence;
  outerHTML: string;
}

export interface PageEvidence {
  url: string;
  selector: string;
  count: number;
  elements: ElementEvidence[];
}
