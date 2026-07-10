import type { ElementEvidence } from "../../src/evidence/types.js";

/** DS-compliant baseline element (gov.br primary button). */
export function makeElement(overrides: Partial<ElementEvidence> = {}): ElementEvidence {
  const base: ElementEvidence = {
    locator: "#test-el",
    tagName: "button",
    id: "test-el",
    classes: ["br-button", "primary"],
    attributes: {
      type: "button",
      role: null,
      ariaLabel: null,
      ariaRequired: null,
      ariaDisabled: null,
      ariaDescribedby: null,
      ariaHidden: null,
      disabled: false,
      required: false,
      htmlFor: null,
      placeholder: null,
      alt: null,
      tabindex: null,
    },
    content: { textContent: "Enviar", hasVisibleText: true, hasIconOnly: false },
    inlineStyle: null,
    computed: {
      backgroundColor: "rgb(19, 81, 180)", // #1351b4 = --color-primary-default
      color: "rgb(255, 255, 255)",
      fontFamily: "Rawline, Raleway, sans-serif",
      fontSize: "16.8px",
      fontWeight: "600",
      lineHeight: "normal",
      // Browsers report the pill radius (--button-radius: 100em) as computed
      // px relative to font-size — never as "100em". 100em × 16.8px = 1680px.
      borderRadius: "1680px",
      borderColor: "rgba(0, 0, 0, 0)",
      border: "0px none",
      padding: "0px 24px",
      margin: "0px",
      outline: "none",
      cursor: "pointer",
      opacity: "1",
    },
    focused: {
      outline: "none",
      outlineColor: "rgb(194, 133, 12)",
      outlineWidth: "4px",
      outlineStyle: "solid",
      outlineOffset: "4px",
      boxShadow: "none",
    },
    outerHTML: '<button class="br-button primary" type="button">Enviar</button>',
  };
  return {
    ...base,
    ...overrides,
    attributes: { ...base.attributes, ...(overrides.attributes ?? {}) },
    content: { ...base.content, ...(overrides.content ?? {}) },
    computed: { ...base.computed, ...(overrides.computed ?? {}) },
    focused: { ...base.focused, ...(overrides.focused ?? {}) },
  };
}
