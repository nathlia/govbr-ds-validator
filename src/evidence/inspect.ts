/**
 * C5 phase 1 — evidence gathering. Returns computed CSS + focus-state styles
 * + accessibility attributes for elements on a page. This is the one piece of
 * evidence @playwright/mcp does not expose (it gives the accessibility tree,
 * not computed styles).
 */
import type { PageEvidence, ElementEvidence } from "./types.js";
import { withPage } from "./browser.js";

export const DEFAULT_SELECTOR =
  "button, a, input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [class*='br-']";

export const COMPUTED_STYLE_PROPERTIES = [
  "backgroundColor", "color", "fontFamily", "fontSize", "fontWeight", "lineHeight",
  "borderRadius", "borderColor", "border", "padding", "margin", "outline", "cursor", "opacity",
] as const;

export const FOCUS_STYLE_PROPERTIES = [
  "outline", "outlineColor", "outlineWidth", "outlineStyle", "outlineOffset", "boxShadow",
] as const;

export const STYLE_PROPERTIES = [...COMPUTED_STYLE_PROPERTIES, ...FOCUS_STYLE_PROPERTIES] as const;
export type StyleProperty = (typeof STYLE_PROPERTIES)[number];

function normalizeSelectors(selector?: string | string[]): string[] {
  const values = selector === undefined ? [DEFAULT_SELECTOR] : Array.isArray(selector) ? selector : [selector];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function inspectComputedStyles(
  url: string,
  selector?: string | string[],
  properties: StyleProperty[] = [...STYLE_PROPERTIES]
): Promise<PageEvidence> {
  const selectors = normalizeSelectors(selector);
  const target = selectors.join(", ");
  const requested = [...new Set(properties)];
  const computedProperties = requested.filter((p) =>
    (COMPUTED_STYLE_PROPERTIES as readonly string[]).includes(p)
  );
  const focusProperties = requested.filter((p) =>
    (FOCUS_STYLE_PROPERTIES as readonly string[]).includes(p)
  );

  const elements = await withPage(url, (page) =>
    page.evaluate(({ sel, computedProps, focusProps }) => {
      // Build a stable, unique CSS locator for an element
      function locatorFor(el: Element): string {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const testId = el.getAttribute("data-testid");
        if (testId) return `[data-testid="${testId}"]`;
        const parts: string[] = [];
        let node: Element | null = el;
        while (node && node !== document.body && parts.length < 5) {
          const parent: Element | null = node.parentElement;
          if (!parent) break;
          const tag = node.tagName.toLowerCase();
          const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
          const idx = siblings.indexOf(node) + 1;
          parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
          if (parent.id) {
            parts.unshift(`#${CSS.escape(parent.id)}`);
            break;
          }
          const parentTestId = parent.getAttribute("data-testid");
          if (parentTestId) {
            parts.unshift(`[data-testid="${parentTestId}"]`);
            break;
          }
          node = parent;
        }
        return parts.join(" > ");
      }

      return Array.from(document.querySelectorAll(sel)).map((el) => {
        const htmlEl = el as HTMLElement;
        const computed = window.getComputedStyle(el);
        const allComputed = {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          lineHeight: computed.lineHeight,
          borderRadius: computed.borderRadius,
          borderColor: computed.borderColor,
          border: computed.border,
          padding: computed.padding,
          margin: computed.margin,
          outline: computed.outline,
          cursor: computed.cursor,
          opacity: computed.opacity,
        };

        const snapshot = Object.fromEntries(
          computedProps.map((property) => [property, allComputed[property as keyof typeof allComputed]])
        );

        let focused: Record<string, string> = {};
        if (focusProps.length > 0) {
          // Capture focus-state styles only when requested.
          htmlEl.focus({ preventScroll: true });
          const fc = window.getComputedStyle(el);
          const allFocused = {
            outline: fc.outline,
            outlineColor: fc.outlineColor,
            outlineWidth: fc.outlineWidth,
            outlineStyle: fc.outlineStyle,
            outlineOffset: fc.outlineOffset,
            boxShadow: fc.boxShadow,
          };
          focused = Object.fromEntries(
            focusProps.map((property) => [property, allFocused[property as keyof typeof allFocused]])
          );
          htmlEl.blur();
        }

        const text = el.textContent?.trim() ?? "";
        return {
          locator: locatorFor(el),
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: Array.from(el.classList),
          attributes: {
            type: el.getAttribute("type"),
            role: el.getAttribute("role"),
            ariaLabel: el.getAttribute("aria-label"),
            ariaRequired: el.getAttribute("aria-required"),
            ariaDisabled: el.getAttribute("aria-disabled"),
            ariaDescribedby: el.getAttribute("aria-describedby"),
            ariaHidden: el.getAttribute("aria-hidden"),
            disabled: el.hasAttribute("disabled"),
            required: el.hasAttribute("required"),
            htmlFor: el.getAttribute("for"),
            placeholder: el.getAttribute("placeholder"),
            alt: el.getAttribute("alt"),
            tabindex: el.getAttribute("tabindex"),
          },
          content: {
            textContent: text.slice(0, 100),
            hasVisibleText: text.length > 0,
            hasIconOnly: !text && el.querySelector("i, svg, img") !== null,
          },
          inlineStyle: el.getAttribute("style"),
          computed: snapshot,
          focused,
          outerHTML: el.outerHTML.slice(0, 500),
        };
      });
    }, { sel: target, computedProps: computedProperties, focusProps: focusProperties })
  );

  return {
    url,
    selector: target,
    selectors,
    properties: requested,
    count: elements.length,
    elements: elements as ElementEvidence[],
  };
}
