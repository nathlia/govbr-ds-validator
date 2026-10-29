/**
 * C5 phase 1 — evidence gathering. Returns computed CSS + focus-state styles
 * + accessibility attributes for elements on a page. This is the one piece of
 * evidence @playwright/mcp does not expose (it gives the accessibility tree,
 * not computed styles).
 *
 * Shadow DOM. `document.querySelectorAll` stops at every shadow boundary, and the gov.br web
 * components (`@govbr-ds/webcomponents`) render their entire content inside an OPEN shadow root.
 * A real portal built on them showed the consequence: axe, which traverses open shadow trees,
 * reported the violations inside a component, and these checkers reported nothing — they were
 * looking at empty host elements. So the traversal here descends into every open shadow root,
 * and locators cross the boundary with ` >>> `:
 *
 *     br-input >>> input.br-input      → the <input> inside the component's shadow tree
 *
 * The separator is part of the contract, not decoration: a locator has to find its way back to
 * the element it names — `verify_finding` re-inspects live by locator, and the scoring anchors
 * resolve the agent's selector and the ground truth's to the same node. A path flattened into a
 * plain CSS selector would resolve to the host, or to nothing, and the mistake would be silent.
 * Closed shadow roots stay invisible to everyone, including axe; nothing here can change that.
 */
import type { PageEvidence, ElementEvidence } from "./types.js";
import { withPage } from "./browser.js";
import { AUTHORED_CSS_NAMES, partitionDeclarations, type RawDeclaration } from "./cssProvenance.js";
import { getComponentSpecs, getDsStylesheet } from "../data/load.js";
import { isKnowledgeLocked } from "../data/lock.js";
import type { DsStylesheetIndex } from "./cssProvenance.js";
import { INTERACTIVE_TAGS, NAME_PROBE_KEY, approximateAccessibleName, chromiumAccessibleNames, removeProbe } from "./accessibleName.js";
import type { Page } from "playwright";

export const DEFAULT_SELECTOR =
  "button, a, input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [class*='br-']";

/** Separator between shadow trees in a locator: `host >>> element-inside-the-shadow-root`. */
export const SHADOW_STEP = ">>>";

/** Índice vazio usado sob a trava de conhecimento (2.14.0): nenhuma declaração é atribuída ao DS. */
const EMPTY_DS_STYLESHEET: DsStylesheetIndex = {
  meta: { source: "none", version: "none", generatedAt: "", files: [], selectors: 0, declarations: 0 },
  declarations: {},
};

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
  return withPage(url, (page) => inspectPageComputedStyles(page, url, selector, properties));
}

/** 3.4.0 (B8): teto de elementos quando o escopo inclui os descendentes dos seletores. */
export const DESCENDANT_SCOPE_LIMIT = 2_000;

export interface InspectOptions {
  /**
   * 3.4.0 (B8): inspecionar também os descendentes de cada elemento casado (DOM claro e shadow roots
   * abertos), até DESCENDANT_SCOPE_LIMIT. `scan_page{selectors}` usa: o escopo é a região, não só a raiz.
   */
  descendants?: boolean;
}

/** Collect evidence from an already-loaded page so aggregate scans share one exact DOM state. */
export async function inspectPageComputedStyles(
  page: Page,
  url: string,
  selector?: string | string[],
  properties: StyleProperty[] = [...STYLE_PROPERTIES],
  options: InspectOptions = {}
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

  // A lista temporária de nomes fica no window entre a passagem e a leitura via CDP; qualquer
  // falha nesse intervalo não pode deixá-la na página.
  let elements;
  let chromiumNames: (string | null)[] | null;
  try {
  // 3.4.4 (revisão, L5): só host com tag de componente do DS (br-<componente do catálogo>) conta como DS.
  const dsHosts = isKnowledgeLocked() ? [] : Object.keys(getComponentSpecs().components).map((name) => `br-${name}`);
  elements = await page.evaluate(({ sels, shadowStep, computedProps, focusProps, cssNames, interactiveTags, probeKey, descendants, descendantLimit, dsHosts }) => {
      /**
       * Every element matching `selector`, in this root and in every open shadow root below it.
       * A selector that already names a shadow path (`host >>> inner`) is walked hop by hop:
       * each hop resolves inside the previous hop's shadow root, never across it.
       */
      function deepQueryAll(selector: string): Element[] {
        if (selector.includes(shadowStep)) {
          const hops = selector.split(shadowStep).map((s) => s.trim()).filter(Boolean);
          let roots: (Document | ShadowRoot)[] = [document];
          let found: Element[] = [];
          hops.forEach((hop, i) => {
            found = roots.flatMap((root) => Array.from(root.querySelectorAll(hop)));
            if (i < hops.length - 1) {
              roots = found
                .map((el) => el.shadowRoot)
                .filter((r): r is ShadowRoot => r !== null);
            }
          });
          return found;
        }
        const out: Element[] = [];
        const visit = (root: Document | ShadowRoot) => {
          out.push(...Array.from(root.querySelectorAll(selector)));
          for (const el of Array.from(root.querySelectorAll("*"))) {
            if (el.shadowRoot) visit(el.shadowRoot);
          }
        };
        visit(document);
        return out;
      }

      // Build a stable, unique CSS locator for an element, within its own root.
      function locatorWithinRoot(el: Element): string {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const testId = el.getAttribute("data-testid");
        if (testId) return `[data-testid="${testId}"]`;
        const parts: string[] = [];
        let node: Element | null = el;
        while (node && node !== document.body && parts.length < 5) {
          const parent: Element | null = node.parentElement;
          if (!parent) {
            // Top of a shadow tree: there is no parent element, but the node still needs a
            // segment — without one the locator ends at the host and points at nothing.
            const root = node.getRootNode();
            const tag = node.tagName.toLowerCase();
            const siblings =
              root instanceof ShadowRoot
                ? Array.from(root.children).filter((c) => c.tagName === node!.tagName)
                : [];
            const idx = siblings.indexOf(node) + 1;
            parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
            break;
          }
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

      /** Full locator: one segment per shadow tree crossed, joined by ` >>> `. */
      function locatorFor(el: Element): string {
        const segments: string[] = [];
        let node: Element = el;
        for (let depth = 0; depth < 6; depth += 1) {
          segments.unshift(locatorWithinRoot(node));
          const root = node.getRootNode();
          if (root instanceof ShadowRoot) node = root.host;
          else break;
        }
        return segments.join(` ${shadowStep} `);
      }

      const matched: Element[] = [];
      const seen = new Set<Element>();
      for (const selector of sels) {
        for (const el of deepQueryAll(selector)) {
          if (!seen.has(el)) {
            seen.add(el);
            matched.push(el);
          }
        }
      }
      if (descendants) {
        const roots = [...matched];
        const add = (el: Element) => {
          if (matched.length >= descendantLimit || seen.has(el)) return;
          seen.add(el);
          matched.push(el);
        };
        const walk = (root: Element | ShadowRoot) => {
          for (const child of Array.from(root.querySelectorAll("*"))) {
            add(child);
            if (child.shadowRoot) walk(child.shadowRoot);
          }
        };
        for (const root of roots) {
          if (root.shadowRoot) walk(root.shadowRoot);
          walk(root);
        }
      }

      // 2.8.0: elementos interativos apenas com ícone ficam numa lista temporária no window, para
      // que o nome acessível seja lido do próprio Chromium depois desta passagem (ver accessibleName.ts).
      const nameProbe: Element[] = [];
      (window as unknown as Record<string, unknown>)[probeKey] = nameProbe;

      return matched.map((el) => {
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
        // 3.4.0 (B5, B-15): a cor de borda por lado. Com lados diferentes, `border-color` computado vem
        // com quatro valores e o verificador não o lia — o `hr` com só `border-top` passava calado.
        const borderSides = computedProps.includes("borderColor")
          ? (["top", "right", "bottom", "left"] as const).map((side) => ({
              side,
              color: computed.getPropertyValue(`border-${side}-color`),
              width: computed.getPropertyValue(`border-${side}-width`),
              style: computed.getPropertyValue(`border-${side}-style`),
            }))
          : undefined;
        // 3.4.4 (revisão, M2): display:contents não gera caixa, mas os filhos dele são desenhados — não é oculto.
        const hasBox = (node: Element, depth = 0): boolean =>
          node.getClientRects().length > 0 ||
          (depth < 6 && getComputedStyle(node).display === "contents" && Array.from(node.children).some((child) => hasBox(child, depth + 1)));
        const rendered = hasBox(el) && computed.visibility !== "hidden" && computed.visibility !== "collapse";

        // getComputedStyle mistura origens que o verificador não pode confundir: CSS da página,
        // CSS do próprio DS, valores resolvidos pelo layout (por exemplo margin:auto) e defaults do
        // browser. Aqui saem as declarações que casam diretamente com o elemento, cada uma com o
        // seletor da regra; quem separa página de DS é `partitionDeclarations`, fora do navegador.
        const authoredRaw: { property: string; cssName: string; value: string; selectorText: string | null }[] = [];
        const collect = (style: CSSStyleDeclaration, selectorText: string | null) => {
          for (const property of computedProps) {
            for (const cssName of cssNames[property] ?? []) {
              const value = style.getPropertyValue(cssName).trim();
              if (value) authoredRaw.push({ property, cssName, value: value + (style.getPropertyPriority(cssName) ? " !important" : ""), selectorText });
            }
          }
        };
        const visitRules = (rules: CSSRuleList) => {
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule) {
              try {
                if (el.matches(rule.selectorText)) collect(rule.style, rule.selectorText);
              } catch { /* seletor não suportado pelo browser desta medição */ }
              continue;
            }
            if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
            if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
            const nested = (rule as CSSGroupingRule).cssRules;
            if (nested) visitRules(nested);
          }
        };
        for (const sheet of Array.from(document.styleSheets)) {
          try { if (sheet.cssRules) visitRules(sheet.cssRules); }
          catch { /* folha cross-origin: não é autoria inspecionável da página */ }
        }
        collect(htmlEl.style, null);

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
        const hasIconOnly = !text && el.querySelector("i, svg, img") !== null;
        const interactive = interactiveTags.includes(el.tagName.toLowerCase()) || el.getAttribute("role") === "button";
        const nameProbeIndex = interactive && hasIconOnly ? nameProbe.push(el) - 1 : null;

        // aria-labelledby resolve ids na árvore do próprio elemento (documento ou shadow root).
        const labelledby = el.getAttribute("aria-labelledby");
        let labelledbyText: string | null = null;
        if (labelledby !== null) {
          const root = el.getRootNode() as Document | ShadowRoot;
          labelledbyText = labelledby
            .split(/\s+/)
            .filter(Boolean)
            .map((id) => root.getElementById(id)?.textContent?.trim() ?? "")
            .filter(Boolean)
            .join(" ");
        }

        const descendantAlt = Array.from(el.querySelectorAll("img[alt]"))
          .map((img) => img.getAttribute("alt")?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
        let labelText: string | null = null;
        if (el.id) {
          const root = el.getRootNode() as Document | ShadowRoot;
          const forLabel = Array.from(root.querySelectorAll("label[for]")).find((l) => l.getAttribute("for") === el.id);
          labelText = forLabel?.textContent?.trim() || null;
        }
        if (!labelText) labelText = el.closest("label")?.textContent?.trim() || null;

        return {
          nameProbeIndex,
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
            href: el.getAttribute("href"),
            title: el.getAttribute("title"),
            ariaLabelledby: labelledby,
          },
          content: {
            textContent: text.slice(0, 100),
            hasVisibleText: text.length > 0,
            hasIconOnly,
            labelledbyText,
            descendantAlt: descendantAlt || null,
            labelText,
          },
          inlineStyle: el.getAttribute("style"),
          authoredRaw,
          computed: snapshot,
          focused,
          outerHTML: el.outerHTML.slice(0, 500),
          inShadowDom: el.getRootNode() instanceof ShadowRoot,
          ...(borderSides ? { borderSides } : {}),
          rendered,
          // 3.4.0 (B10): elemento injetado pelo flatpickr, a biblioteca que o datetimepicker do core usa.
          // 3.4.4 (C3): elemento dentro do shadow root de um web component do DS (host <br-*>): é código
          // do componente, não marcação da página que o usou.
          ...(el.closest(".flatpickr-calendar")
            ? { origin: "flatpickr" }
            : (() => {
                let root = el.getRootNode();
                while (root instanceof ShadowRoot) {
                  const host = root.host.tagName.toLowerCase();
                  if (dsHosts.includes(host)) return { origin: "ds-web-component", originHost: host };
                  root = root.host.getRootNode();
                }
                return {};
              })()),
        };
      });
    }, {
      sels: selectors,
      shadowStep: SHADOW_STEP,
      computedProps: computedProperties,
      focusProps: focusProperties,
      cssNames: AUTHORED_CSS_NAMES as Record<string, string[]>,
      interactiveTags: [...INTERACTIVE_TAGS] as string[],
      probeKey: NAME_PROBE_KEY,
      dsHosts,
      descendants: options.descendants === true,
      descendantLimit: DESCENDANT_SCOPE_LIMIT,
    });

  const probed = elements.filter((element) => element.nameProbeIndex !== null).length;
  chromiumNames = await chromiumAccessibleNames(page, probed);
  } catch (error) {
    await removeProbe(page);
    throw error;
  }

  // 2.14.0 (NAT-61): sem conhecimento, a folha do DS não é lida — toda declaração conta como da
  // página. Nenhuma resposta do perfil knowledge-free expõe a partição (só os predicados de token a usam).
  const dsStylesheet = isKnowledgeLocked() ? EMPTY_DS_STYLESHEET : getDsStylesheet();
  const withProvenance = elements.map(({ authoredRaw, nameProbeIndex, ...element }) => {
    const evidence = {
      ...element,
      ...partitionDeclarations(authoredRaw as RawDeclaration[], dsStylesheet),
    } as ElementEvidence;
    if (nameProbeIndex !== null) {
      const fromChromium = chromiumNames?.[nameProbeIndex];
      evidence.accessibleName =
        typeof fromChromium === "string"
          ? { name: fromChromium, source: "chromium" }
          : { name: approximateAccessibleName(evidence), source: "atributos" };
    }
    return evidence;
  });

  return {
    url,
    selector: target,
    selectors,
    properties: requested,
    count: withProvenance.length,
    elements: withProvenance as ElementEvidence[],
  };
}
