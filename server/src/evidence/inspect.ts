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

export async function inspectComputedStyles(url: string, selector?: string): Promise<PageEvidence> {
  const target = selector ?? DEFAULT_SELECTOR;

  const elements = await withPage(url, (page) =>
    page.evaluate((sel: string) => {
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
        const snapshot = {
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

        // Capture focus-state styles by briefly focusing the element
        htmlEl.focus({ preventScroll: true });
        const fc = window.getComputedStyle(el);
        const focused = {
          outline: fc.outline,
          outlineColor: fc.outlineColor,
          outlineWidth: fc.outlineWidth,
          outlineStyle: fc.outlineStyle,
          outlineOffset: fc.outlineOffset,
          boxShadow: fc.boxShadow,
        };
        htmlEl.blur();

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
    }, target)
  );

  return { url, selector: target, count: elements.length, elements: elements as ElementEvidence[] };
}
