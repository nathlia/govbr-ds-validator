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
  /** A8: texto renderizado para a passagem adicional de fonte; não muda o indicador legado. */
  renderedText?: boolean;
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
  elements = await page.evaluate(({ sels, shadowStep, computedProps, focusProps, cssNames, interactiveTags, probeKey, descendants, descendantLimit, dsHosts, dsFacts, renderedText }) => {
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

      /*
       * Localizadores (3.7.11; auditoria V-1 e 2ª revisão MED 3/5). Forma base = a de sempre: #id, data-testid (único,
       * aspas escapadas) ou até 5 passos estruturais (tag, com :nth-of-type quando há irmãos da mesma tag), ancorados no
       * pai com id. Ela fica sempre que já resolve só o elemento. Só quando não resolve, sobe além dos 5 passos até ficar
       * única, parando numa âncora única (id/test id), no <body> ou no topo da raiz de sombra (`body >` / `:host >`).
       * Custo: as posições entre irmãos são calculadas uma vez por pai; a unicidade de um caminho sem âncora é contada
       * por grupos (mesma tag, mesmos passos) numa passada — nada de uma consulta ao documento por elemento.
       */
      let rootsCache: (Document | ShadowRoot)[] | null = null;
      function allRoots(): (Document | ShadowRoot)[] {
        if (rootsCache) return rootsCache;
        const out: (Document | ShadowRoot)[] = [document];
        const visit = (root: Document | ShadowRoot) => {
          for (const e of Array.from(root.querySelectorAll("*"))) {
            if (e.shadowRoot) {
              out.push(e.shadowRoot);
              visit(e.shadowRoot);
            }
          }
        };
        visit(document);
        rootsCache = out;
        return out;
      }
      let rootSeq = 0;
      const rootNo = new Map<Node, number>();
      const noOf = (r: Node) => {
        if (!rootNo.has(r)) rootNo.set(r, ++rootSeq);
        return rootNo.get(r)!;
      };
      /** Raízes onde o resolvedor procura um segmento: a do próprio nó; no documento, com `pierce`, todas (seletor de um segmento só). */
      function scopeOf(node: Element, pierce: boolean): { key: string; roots: (Document | ShadowRoot)[] } {
        const root = node.getRootNode() as Document | ShadowRoot;
        if (root instanceof ShadowRoot) return { key: `r${noOf(root)}`, roots: [root] };
        return pierce ? { key: "all", roots: allRoots() } : { key: "doc", roots: [document] };
      }
      const counts = new Map<string, number>();
      /** Quantos elementos um seletor simples (id, atributo) casa no escopo; em cache. */
      function countIn(scope: { key: string; roots: (Document | ShadowRoot)[] }, sel: string): number {
        const k = `${scope.key}\u0001${sel}`;
        const hit = counts.get(k);
        if (hit !== undefined) return hit;
        let n = 0;
        try {
          for (const r of scope.roots) n += r.querySelectorAll(sel).length;
        } catch {
          n = Infinity;
        }
        counts.set(k, n);
        return n;
      }
      const partCache = new Map<Element, string>();
      /** O passo de um nó: a tag, com :nth-of-type quando há irmãos da mesma tag (calculado para todos os filhos do pai de uma vez). */
      function partOf(node: Element): string {
        const hit = partCache.get(node);
        if (hit !== undefined) return hit;
        const parent = node.parentElement;
        const root = node.getRootNode();
        const pool = parent ? parent.children : root instanceof ShadowRoot ? root.children : null;
        if (!pool) {
          const t = node.tagName.toLowerCase();
          partCache.set(node, t);
          return t;
        }
        const byTag = new Map<string, Element[]>();
        for (const c of Array.from(pool)) {
          const list = byTag.get(c.tagName);
          if (list) list.push(c);
          else byTag.set(c.tagName, [c]);
        }
        for (const list of byTag.values()) {
          list.forEach((c, i) => partCache.set(c, list.length > 1 ? `${c.tagName.toLowerCase()}:nth-of-type(${i + 1})` : c.tagName.toLowerCase()));
        }
        return partCache.get(node)!;
      }
      const testIdSel = (n: Element) => {
        const v = n.getAttribute("data-testid");
        // valor entre aspas: escapa só a barra invertida e as aspas (o resto do valor sai como está)
        return v ? `[data-testid="${v.replace(/["\\]/g, (m) => `\\${m}`)}"]` : null;
      };
      /** Âncora do passo acima: id (como sempre) ou test id único. */
      function anchorOf(parent: Element): string | null {
        if (parent.id) return `#${CSS.escape(parent.id)}`;
        const t = testIdSel(parent);
        return t && countIn(scopeOf(parent, false), t) === 1 ? t : null;
      }
      /** A cadeia de passos de um nó para cima, dentro da raiz dele (sem o <body>), até `depth` passos; em cache. */
      const chainCache = new Map<Element, { parts: string[]; nodes: Element[]; ended: boolean }>();
      function chainOf(el: Element, depth: number): { parts: string[]; nodes: Element[]; ended: boolean } {
        let c = chainCache.get(el);
        if (!c) {
          c = { parts: [], nodes: [], ended: false };
          chainCache.set(el, c);
        }
        while (!c.ended && c.parts.length < depth) {
          const node: Element = c.nodes.length ? (c.nodes[c.nodes.length - 1].parentElement as Element) : el;
          if (!node || node === document.body || node === document.documentElement) {
            c.ended = true;
            break;
          }
          c.parts.push(partOf(node));
          c.nodes.push(node);
          if (!node.parentElement) c.ended = true;
        }
        return c;
      }
      const tagOfPart = (p: string) => p.split(":")[0];
      /** Um passo do seletor casa com o passo de outro nó: mesma tag; com :nth-of-type, a mesma posição (filho único = 1). */
      const stepMatches = (want: string, got: string | undefined) => {
        if (got === undefined) return false;
        if (!want.includes(":nth-of-type(")) return tagOfPart(got) === want;
        return got === want || (want.endsWith(":nth-of-type(1)") && got === tagOfPart(want));
      };
      const groupCache = new Map<string, Element[]>();
      /** Os elementos que podem casar com um caminho sem âncora que termina em `el`: a mesma tag, no escopo do resolvedor. */
      function sameTag(el: Element, scope: { key: string; roots: (Document | ShadowRoot)[] }): Element[] {
        const k = `${scope.key}\u0001${el.tagName}`;
        let g = groupCache.get(k);
        if (!g) {
          g = [];
          const tag = el.tagName.toLowerCase();
          for (const r of scope.roots) {
            for (const x of Array.from(r.querySelectorAll(CSS.escape(tag)))) if (x.tagName === el.tagName) g.push(x);
          }
          groupCache.set(k, g);
        }
        return g;
      }
      /** Os elementos do grupo que casam com os passos (de baixo para cima) `steps`. */
      function matching(group: Element[], steps: string[]): Element[] {
        return group.filter((x) => {
          const c = chainOf(x, steps.length);
          if (c.parts.length < steps.length) return false;
          for (let i = 0; i < steps.length; i += 1) if (!stepMatches(steps[i], c.parts[i])) return false;
          return true;
        });
      }

      /** O segmento de um nó na própria raiz: a forma base quando já é única; senão estendida até ficar única. */
      function segmentOf(el: Element, pierce: boolean): string {
        const scope = scopeOf(el, pierce);
        if (el.id && countIn(scope, `#${CSS.escape(el.id)}`) === 1) return `#${CSS.escape(el.id)}`;
        const own = testIdSel(el);
        if (own && countIn(scope, own) === 1) return own;
        // forma base (até 5 passos, ancorada no pai com id/test id)
        const c = chainOf(el, 5);
        const steps: string[] = [];
        for (let i = 0; i < c.parts.length; i += 1) {
          steps.push(c.parts[i]);
          const parent = c.nodes[i].parentElement;
          const anchor = parent ? anchorOf(parent) : null;
          if (anchor) {
            // por construção: âncora única → cada passo abaixo dela escolhe um só filho
            const base = [anchor, ...[...steps].reverse()].join(" > ");
            if (countIn(scope, anchor) === 1 || countIn(scope, base) === 1) return base;
            break;
          }
        }
        if (!steps.length) return "";
        // 3.7.10: o elemento com id repetido ficava `#id`; agora, como não identifica, segue o caminho
        const group = sameTag(el, scope);
        let candidates = matching(group, steps);
        if (candidates.length <= 1) return [...steps].reverse().join(" > ");
        // ambíguo: sobe (posição exata em cada passo novo) até ficar único ou chegar a uma âncora única / ao topo
        for (let depth = steps.length; ; depth += 1) {
          const cc = chainOf(el, depth + 1);
          if (cc.parts.length <= depth) {
            const top = cc.nodes[cc.nodes.length - 1] ?? el;
            const prefix = top.parentElement ? "body" : top.getRootNode() instanceof ShadowRoot ? ":host" : "";
            return [prefix, ...[...steps].reverse()].filter(Boolean).join(" > ");
          }
          const node = cc.nodes[depth];
          const anchor = anchorOf(node);
          if (anchor) {
            const anchored = [anchor, ...[...steps].reverse()].join(" > ");
            if (countIn(scope, anchor) === 1 || countIn(scope, anchored) === 1) return anchored;
          }
          steps.push(cc.parts[depth]);
          candidates = candidates.filter((x) => stepMatches(cc.parts[depth], chainOf(x, depth + 1).parts[depth]));
          if (candidates.length <= 1) return [...steps].reverse().join(" > ");
        }
      }

      /** Full locator: one segment per shadow tree crossed, joined by ` >>> `. */
      function locatorFor(el: Element): string {
        const segments: string[] = [];
        let node: Element = el;
        for (let depth = 0; depth < 6; depth += 1) {
          segments.unshift(segmentOf(node, node === el));
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

      // os localizadores de todos antes de qualquer foco/blur (que pode mudar o DOM)
      const locatorOf = new Map(matched.map((el) => [el, locatorFor(el)] as const));

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
            // 3.5.0 (revisão, LOW): elemento referido só com aria-label também dá nome.
            .map((id) => { const ref = root.getElementById(id); return ref ? ref.getAttribute("aria-label")?.trim() || ref.textContent?.trim() || "" : ""; })
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

        // 3.5.0 (C03, auditoria de mensurabilidade): ícones dentro de controle cujo nome vem do conteúdo, com texto
        // fora deles, que não estão escondidos da tecnologia assistiva (aria-hidden="true", role none/presentation)
        // nem nomeados (aria-label/aria-labelledby/title no ícone, que o tornaria informativo).
        let exposedIcons = 0;
        const controlRole = ["link", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "option", "switch", "treeitem"].includes((el.getAttribute("role") ?? "").toLowerCase());
        if ((interactive || controlRole) && text && !el.getAttribute("aria-label")?.trim() && !el.getAttribute("aria-labelledby")?.trim()) {
          for (const icon of Array.from(el.querySelectorAll("i, svg, span[class*='fa-'], span[class*='icon']"))) {
            if ((icon.textContent ?? "").trim()) continue;
            if (icon.closest("svg") !== icon && icon.closest("svg")) continue;
            // Invólucro (ex.: <span class="icon"><i …></i></span>): quem é medido é o ícone de dentro.
            if (icon.tagName.toLowerCase() !== "svg" && icon.querySelector("i, svg")) continue;
            // <i>/<span> só desenha (e entra no nome) pelo conteúdo gerado: sem ::before/::after, não há ícone exposto.
            if (icon.tagName.toLowerCase() !== "svg") {
              const drawn = ["::before", "::after"].some((p) => { const c = getComputedStyle(icon, p).content; return !!c && c !== "none" && c !== "normal" && c !== '""'; });
              if (!drawn) continue;
            }
            if (["aria-label", "aria-labelledby", "title"].some((a) => icon.getAttribute(a)?.trim())) continue;
            let hidden = false;
            for (let n: Element | null = icon; n && n !== el; n = n.parentElement) {
              const role = (n.getAttribute("role") ?? "").toLowerCase();
              if (n.getAttribute("aria-hidden") === "true" || role === "none" || role === "presentation") { hidden = true; break; }
            }
            if (!hidden && icon.getClientRects().length > 0) exposedIcons += 1;
          }
        }

        // 3.7.0 (C01): botão do DS só com ícone na tela — sem texto VISÍVEL (o texto sr-only/recortado não conta) e com
        // ao menos um ícone renderizado. E os componentes do DS que o contêm, do mais próximo ao mais externo.
        let iconOnlyVisual: boolean | undefined;
        let hostComponents: string[] | undefined;
        // 3.7.0 (revisão, lacuna B): o host do web component do DS (`<br-button>`, @govbr-ds/webcomponents) é da página — o
        // autor escolhe `icon`, `label`/texto no slot e `circle`; o `button.br-button` no shadow root é do DS.
        const wcHost = dsFacts && el.tagName.toLowerCase() === "br-button";
        let wcCircle = false;
        if (dsFacts && (el.classList.contains("br-button") || wcHost)) {
          // O texto tem caixa própria (Range): vale também dentro de `display: contents`, que não tem caixa (revisão 3.7.0).
          const textBox = (t: Node) => {
            const range = document.createRange();
            range.selectNodeContents(t);
            return Array.from(range.getClientRects()).some((r) => r.width > 1 && r.height > 1);
          };
          const shownText = (t: Node): boolean => {
            if (!(t.textContent ?? "").trim() || !textBox(t)) return false;
            for (let n: Element | null = t.parentElement; n; n = n === el ? null : n.parentElement) {
              if (n.namespaceURI === "http://www.w3.org/2000/svg") return false;
              const cs = getComputedStyle(n);
              if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse" || parseFloat(cs.opacity) === 0) return false;
              if (/^rect\(\s*(0|1)px[ ,]+(0|1)px[ ,]+(0|1)px[ ,]+(0|1)px\s*\)$/.test(cs.clip)) return false;
              if (/inset\(\s*(50|100)%/.test(cs.clipPath)) return false;
              if (cs.display === "contents") continue;
              // recorte por caixa de 1px com overflow escondido (variante do sr-only sem clip)
              const r = n.getBoundingClientRect();
              if ((r.width <= 1 || r.height <= 1) && cs.overflow !== "visible") return false;
            }
            return true;
          };
          const ICON = "i, svg, img, span[class*='fa-']";
          const textIn = (root: Node) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let t = walker.nextNode(); t; t = walker.nextNode()) {
              if (t.parentElement && ["style", "script"].includes(t.parentElement.tagName.toLowerCase())) continue;
              if (shownText(t)) return true;
            }
            return false;
          };
          // ícone: i, svg, img e o span de fonte de ícone (`<span class="fas fa-…">`), com caixa
          const iconsIn = (root: Element | ShadowRoot) => Array.from(root.querySelectorAll(ICON)).filter((n) => (n.tagName.toLowerCase() === "svg" || !n.closest("svg")) && n.getClientRects().length > 0);
          if (wcHost) {
            // API do host: rótulo pelo atributo `label` ou pelo texto no slot (luz); ícone pelo atributo `icon` ou por ícone
            // no slot ou no render; circular pelo atributo `circle` (ou a classe circle no botão que o componente desenha).
            const shadow = el.shadowRoot;
            const inner = shadow?.querySelector("button.br-button, a.br-button") ?? null;
            const label = (el.getAttribute("label") ?? "").trim() !== "";
            const visible = label || textIn(el) || (shadow ? textIn(shadow) : false);
            const icon = (el.getAttribute("icon") ?? "").trim() !== "" || iconsIn(el).length > 0 || (shadow ? iconsIn(shadow).length > 0 : false);
            wcCircle = (el.hasAttribute("circle") && el.getAttribute("circle") !== "false") || Boolean(inner?.classList.contains("circle"));
            iconOnlyVisual = !visible && icon;
          } else {
            iconOnlyVisual = !textIn(el) && iconsIn(el).length > 0;
          }
          const hosts: string[] = [];
          for (let n: Element | null = el.parentElement ?? ((el.getRootNode() as ShadowRoot).host ?? null), depth = 0; n && depth < 60; depth += 1) {
            for (const c of Array.from(n.classList)) if (/^br-[a-z]+$/.test(c) && c !== "br-button" && !hosts.includes(c)) hosts.push(c);
            // o host de web component do DS (`<br-input>`) conta como o componente pela tag
            const tag = n.tagName.toLowerCase();
            if (tag !== "br-button" && dsHosts.includes(tag) && !hosts.includes(tag)) hosts.push(tag);
            const parent: Element | null = n.parentElement;
            if (parent) { n = parent; continue; }
            const r = n.getRootNode();
            n = r instanceof ShadowRoot ? r.host : null;
          }
          if (hosts.length) hostComponents = hosts.slice(0, 8);
        }

        // 3.7.3 A8: atributo de estado ARIA × estado nativo vivo. Só os atributos presentes saem; o estado nativo só sai
        // quando há algum desses atributos e o elemento tem o par nativo (propriedades vivas, não a marcação).
        const ariaChecked = el.getAttribute("aria-checked");
        const ariaSelected = el.getAttribute("aria-selected");
        const ariaExpanded = el.getAttribute("aria-expanded");
        let nativeState: Record<string, boolean> | undefined;
        if ([ariaChecked, ariaSelected, ariaExpanded, el.getAttribute("aria-disabled"), el.getAttribute("aria-required")].some((v) => v !== null)) {
          const tag = el.tagName.toLowerCase();
          const type = (el.getAttribute("type") ?? "").trim().toLowerCase();
          const ns: Record<string, boolean> = {};
          if (tag === "input" && (type === "checkbox" || type === "radio")) {
            ns.checked = (el as HTMLInputElement).checked;
            if (type === "checkbox") ns.indeterminate = (el as HTMLInputElement).indeterminate;
          }
          if (tag === "option") {
            ns.selected = (el as HTMLOptionElement).selected;
            // A opção de um select fechado não tem caixa, mas é exposta com a lista: vale a caixa do select.
            const list = el.closest("select");
            if (list && list.getClientRects().length > 0 && getComputedStyle(list).visibility === "visible" && !(el as HTMLOptionElement).hidden && computed.display !== "none") ns.inRenderedSelect = true;
          }
          if (tag === "details") ns.open = (el as HTMLDetailsElement).open;
          const parent = el.parentElement;
          if (tag === "summary" && parent?.tagName.toLowerCase() === "details" && parent.querySelector(":scope > summary") === el) ns.open = (parent as HTMLDetailsElement).open;
          if (["button", "input", "select", "textarea", "fieldset", "optgroup", "option"].includes(tag)) ns.disabled = el.matches(":disabled");
          if ((tag === "input" && !["hidden", "range", "color", "submit", "reset", "button", "image"].includes(type)) || tag === "select" || tag === "textarea") {
            ns.required = (el as HTMLInputElement).required;
          }
          if (Object.keys(ns).length) {
            if (dsFacts) {
              // Switch do DS: ancestral com a classe br-switch ou host <br-switch>, atravessando shadow roots.
              for (let n: Element | null = el, depth = 0; n && depth < 60; depth += 1) {
                if (n.classList.contains("br-switch") || n.tagName.toLowerCase() === "br-switch") { ns.dsSwitch = true; break; }
                const up: Element | null = n.parentElement;
                if (up) { n = up; continue; }
                const r = n.getRootNode();
                n = r instanceof ShadowRoot ? r.host : null;
              }
            }
            nativeState = ns;
          }
        }

        return {
          nameProbeIndex,
          locator: locatorOf.get(el)!,
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
            ...(ariaChecked !== null ? { ariaChecked } : {}),
            ...(ariaSelected !== null ? { ariaSelected } : {}),
            ...(ariaExpanded !== null ? { ariaExpanded } : {}),
          },
          ...(nativeState ? { nativeState } : {}),
          content: {
            // 3.7.11 (auditoria V-10): espaços normalizados ANTES do corte — texto de várias linhas indentado
            // era cortado no meio e a comparação com o title falhava.
            textContent: text.replace(/\s+/g, " ").slice(0, 100),
            hasVisibleText: text.length > 0,
            ...(renderedText ? { hasRenderedText: el instanceof HTMLElement && el.innerText.trim().length > 0 } : {}),
            hasIconOnly,
            labelledbyText,
            descendantAlt: descendantAlt || null,
            labelText,
            ...(exposedIcons > 0 ? { exposedIcons } : {}),
            ...(iconOnlyVisual !== undefined ? { iconOnlyVisual } : {}),
            // 3.7.0: a folha do DS também desenha o circular pelo atributo (.br-button[circle]).
            ...(iconOnlyVisual !== undefined && (el.hasAttribute("circle") && el.getAttribute("circle") !== "false" || wcCircle) ? { circleAttribute: true as const } : {}),
          },
          ...(hostComponents ? { hostComponents } : {}),
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
                  if (dsHosts.includes(host)) {
                    // 3.5.0 (D-155): o host recebeu da página um nome (label/aria-label/aria-labelledby)? Só
                    // para campos de formulário: com o host nomeado, o rótulo interno é do componente.
                    const field = ["input", "select", "textarea"].includes(el.tagName.toLowerCase());
                    const named = field && ["label", "aria-label", "aria-labelledby"].some((a) => (root as ShadowRoot).host.getAttribute(a)?.trim());
                    return { origin: "ds-web-component", originHost: host, ...(field ? { originHostNamed: Boolean(named) } : {}) };
                  }
                  root = root.host.getRootNode();
                }
                return {};
              })()),
          // 3.5.0 (D-155): fora da árvore de acessibilidade por aria-hidden="true" ou inert num ancestral
          // (atravessando hosts de shadow root). Só aparece quando é verdade.
          ...((() => {
            let node: Element | null = el;
            for (let depth = 0; node && depth < 60; depth += 1) {
              if (node.getAttribute("aria-hidden") === "true" || node.hasAttribute("inert")) return true;
              const parent: Element | null = node.parentElement;
              if (parent) { node = parent; continue; }
              const r = node.getRootNode();
              node = r instanceof ShadowRoot ? r.host : null;
            }
            return false;
          })()
            ? { axHidden: true }
            : {}),
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
      dsFacts: !isKnowledgeLocked(),
      descendants: options.descendants === true,
      renderedText: options.renderedText === true,
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
