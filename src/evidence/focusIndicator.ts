/**
 * 3.4.0 (B9, A-04/V-05): o indicador de foco é visível? Mede, no estado atual da página, a diferença
 * de estilo entre o elemento com foco e sem foco.
 *
 * O foco é dado por script (`element.focus()`) depois de uma tecla Shift (modalidade de teclado), e no Chromium casa `:focus` e `:focus-visible`
 * (medido na 3.4.0: sem interação de ponteiro anterior e depois dela). O indicador pode estar no próprio
 * elemento, nos pseudo-elementos dele, no rótulo irmão (o checkbox/radio do DS desenha o foco em
 * `input:focus-visible + label::before`), no `<label>` associado, no pai (`:focus-within`) ou num descendente
 * (3.4.1). Contorno, sombra, borda, fundo, cor, sublinhado, opacidade, transformação, sombra de texto e filtro
 * são comparados. Qualquer
 * diferença em qualquer um desses conta como indicador — a medição é generosa de propósito: só a
 * AUSÊNCIA de qualquer mudança vira achado.
 *
 * 3.4.4 (C6): duas mudanças deixaram de contar. (a) Campo em estado de erro cuja borda vermelha volta a um
 * cinza neutro ao focar (sem ganhar espessura): perde o estado de erro, não marca o foco — e a medição fica
 * incompleta (nunca vira achado), porque a cor de repouso sem o erro não é conhecida. (b) Mudança no próprio elemento (e nos pseudo-elementos e descendentes dele) quando ele é
 * invisível — opacidade efetiva 0, sem área ou visibility hidden: o `outline` de um input com opacity:0
 * não se vê. O rótulo, o irmão e o pai continuam valendo (o checkbox do DS marca o foco em
 * `label::before`). O que foi descartado sai em `discounted`.
 *
 * Limites declarados: não julga contraste nem tamanho do indicador (WCAG 2.4.11/2.4.13), só a
 * existência de mudança; um indicador desenhado por script em outro elemento, ou só por transição
 * animada, não é visto; um elemento que ao receber foco move o foco para outro não é medido.
 */
import type { Page } from "playwright";
import { SHADOW_STEP } from "./inspect.js";

export interface FocusIndicatorFact {
  locator: string;
  /** O foco chegou ao elemento (document.activeElement, atravessando shadow roots). */
  focused: boolean;
  /** Propriedades que mudaram com o foco, prefixadas pelo alvo (`self`, `self::before`, `label`, `parent`, `desc[n]`, …). */
  changed: string[];
  /**
   * 3.4.1: a comparação cobriu tudo o que poderia desenhar o indicador (o elemento, pseudo-elementos,
   * pai, irmão, rótulo e TODOS os descendentes, até FOCUS_DESCENDANT_LIMIT). `false` = uma mudança não
   * pôde ser descartada (subárvore grande demais, shadow root fechado): nunca vira achado.
   */
  complete: boolean;
  /** 3.4.4 (C6): mudanças medidas que não contam como indicador, com o motivo. */
  discounted?: string[];
}

/** 3.4.1: teto de descendentes comparados por elemento; acima disso a medição não é completa. */
export const FOCUS_DESCENDANT_LIMIT = 60;

/** Elementos focáveis pelo Tab cuja indicação de foco o scan mede. */
export const FOCUSABLE_SELECTOR =
  "a[href], button, input:not([type='hidden']), select, textarea, summary, [tabindex]:not([tabindex^='-'])";

export const FOCUS_COMPARED_PROPERTIES = [
  "outline-style", "outline-width", "outline-color", "outline-offset", "box-shadow",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "background-color", "color", "text-decoration-line", "text-decoration-color", "opacity",
  // 3.4.1 (revisão): indicador por transformação, sombra de texto ou filtro (`:focus-visible{transform:scale(1.05)}`).
  "transform", "scale", "translate", "rotate", "text-shadow", "filter", "background-image", "visibility",
] as const;

/** Mede os elementos dos localizadores (formato do inspect: saltos de shadow root com ` >>> `). */
export async function measureFocusIndicators(page: Page, locators: string[]): Promise<FocusIndicatorFact[]> {
  if (locators.length === 0) return [];
  // Depois de um clique, o Chromium deixa de casar `:focus-visible` no foco por script (modalidade de
  // ponteiro) e todo indicador do DS sumiria. Uma tecla Shift restabelece a modalidade de teclado —
  // a mesma de quem navega com Tab —, sem efeito de edição (Ctrl/Alt não servem: o Chromium os ignora).
  await page.keyboard.press("Shift").catch(() => undefined);
  return page.evaluate(
    ({ locators, step, props, descendantLimit }) => {
      const resolve = (locator: string): Element[] => {
        const hops = locator.split(` ${step} `).map((s) => s.trim()).filter(Boolean);
        let roots: Array<Document | ShadowRoot> = [document];
        let found: Element[] = [];
        hops.forEach((hop, i) => {
          found = roots.flatMap((root) => {
            try { return Array.from(root.querySelectorAll(hop)); } catch { return []; }
          });
          if (i < hops.length - 1) roots = found.map((el) => el.shadowRoot).filter((r): r is ShadowRoot => r !== null);
        });
        return found;
      };
      const deepActive = (): Element | null => {
        let a: Element | null = document.activeElement;
        while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
        return a;
      };
      const read = (el: Element | null, pseudo: string | null) => {
        if (!el) return null;
        const cs = getComputedStyle(el, pseudo);
        const raw = Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
        // Só o que se vê: contorno sem estilo ou largura zero, lado de borda sem largura ou estilo, e cor
        // de sublinhado sem sublinhado não contam (um `outline-offset` que muda sob `outline: none` não
        // é indicador).
        const invisible = (style: string, width: string) => style === "none" || style === "hidden" || parseFloat(width) === 0;
        const out: Record<string, string> = { ...raw };
        if (invisible(raw["outline-style"], raw["outline-width"])) {
          for (const p of ["outline-style", "outline-width", "outline-color", "outline-offset"]) out[p] = "none";
        }
        for (const side of ["top", "right", "bottom", "left"]) {
          if (invisible(cs.getPropertyValue(`border-${side}-style`), raw[`border-${side}-width`])) {
            out[`border-${side}-color`] = "none";
            out[`border-${side}-width`] = "0";
          }
        }
        if (raw["text-decoration-line"] === "none") out["text-decoration-color"] = "none";
        return out;
      };
      const targets = (el: Element): Array<[string, Element | null, string | null]> => {
        const sibling = el.nextElementSibling;
        const label = (el as HTMLInputElement).labels?.[0] ?? null;
        return [
          ["self", el, null],
          ["self::before", el, "::before"],
          ["self::after", el, "::after"],
          ["parent", el.parentElement, null],
          ["sibling", sibling, null],
          ["sibling::before", sibling, "::before"],
          ["sibling::after", sibling, "::after"],
          ["label", label, null],
          ["label::before", label, "::before"],
          ["label::after", label, "::after"],
        ];
      };
      // 3.4.1 (revisão): o indicador pode estar num descendente (`button:focus-visible .dentro{outline}`, que o
      // próprio DS usa em `.step-progress-btn:focus-visible .step-alert`). Descendentes no DOM claro e em shadow
      // roots abertos, com os pseudo-elementos; acima do teto, a medição fica incompleta.
      const descendants = (el: Element): { nodes: Element[]; complete: boolean } => {
        const nodes: Element[] = [];
        let complete = true;
        const walk = (root: Element | ShadowRoot) => {
          for (const child of Array.from(root.querySelectorAll("*"))) {
            if (nodes.length >= descendantLimit) { complete = false; return; }
            nodes.push(child);
            if (child.shadowRoot) walk(child.shadowRoot);
          }
        };
        if (el.shadowRoot) walk(el.shadowRoot);
        walk(el);
        return { nodes, complete };
      };
      const allTargets = (el: Element, desc: Element[]): Array<[string, Element | null, string | null]> => [
        ...targets(el),
        ...desc.flatMap((node, i): Array<[string, Element | null, string | null]> => [
          [`desc[${i}]`, node, null],
          [`desc[${i}]::before`, node, "::before"],
          [`desc[${i}]::after`, node, "::after"],
        ]),
      ];
      const snapshot = (list: Array<[string, Element | null, string | null]>) => list.map(([name, node, pseudo]) => [name, read(node, pseudo)] as const);
      const original = deepActive() as HTMLElement | null;
      const out = locators.map((locator) => {
        const found = resolve(locator);
        if (found.length !== 1) return { locator, focused: false, changed: [] as string[], complete: false };
        const el = found[0] as HTMLElement;
        // Já focado (o clique da receita, por exemplo): o estado "sem foco" é lido depois de tirar o foco.
        if (deepActive() === el) el.blur();
        const desc = descendants(el);
        const list = allTargets(el, desc.nodes);
        const before = snapshot(list);
        el.focus({ preventScroll: true });
        const focused = deepActive() === el;
        // Transições CSS começam no valor antigo: termina-as antes de ler, senão um indicador animado
        // pareceria ausente.
        for (const [name, node, pseudo] of targets(el)) {
          if (pseudo || !node) continue;
          for (const animation of node.getAnimations?.({ subtree: name !== "parent" }) ?? []) {
            try { animation.finish(); } catch { /* animação infinita: fica como está */ }
          }
        }
        const after = focused ? snapshot(list) : before;
        el.blur();
        // 3.4.4 (C6b): o elemento é invisível? Então nada desenhado nele, nos pseudo-elementos ou nos
        // descendentes se vê.
        const invisibleSelf = (() => {
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.visibility === "collapse") return true;
          const r = el.getBoundingClientRect();
          if (r.width * r.height === 0) return true;
          let node: Element | null = el;
          let opacity = 1;
          while (node) {
            opacity *= parseFloat(getComputedStyle(node).opacity || "1");
            const parent: Element | null = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null);
            node = parent;
          }
          return opacity === 0;
        })();
        // 3.4.4 (C6a, revisão): perda de contraste NÃO é critério (escuro → azul da marca e preto → amarelo
        // são indicadores). Só uma mudança é posta em dúvida: o campo está em estado de erro (aria-invalid no
        // próprio campo ou num contêiner próximo, ou classe de erro/perigo nele ou num ancestral próximo), a
        // borda em repouso é vermelha e, com foco, volta a um cinza neutro — o mesmo que perder o estado de
        // erro. Essa mudança não conta como indicador, mas também não vira achado: a medição fica incompleta
        // (undetermined), porque o oráculo não sabe a cor de repouso do campo sem o erro.
        const rgb = (value: string): [number, number, number] | null => {
          const m = value.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
          if (parts.length > 3 && parts[3] === 0) return null;
          return [parts[0], parts[1], parts[2]];
        };
        const ERROR_CLASS = /^(danger|invalid|is-invalid|error|erro|has-error|has-danger)$/;
        const inError = (() => {
          let n: Element | null = el;
          for (let depth = 0; n && depth < 4; depth++) {
            if (n.getAttribute("aria-invalid") === "true") return true;
            if (Array.from(n.classList).some((c) => ERROR_CLASS.test(c))) return true;
            n = n.parentElement;
          }
          return false;
        })();
        const reddish = (c: [number, number, number] | null) => !!c && c[0] >= 150 && c[0] > c[1] * 1.8 && c[0] > c[2] * 1.8;
        const neutral = (c: [number, number, number] | null) => !!c && Math.max(...c) - Math.min(...c) <= 16;
        let lostErrorOnly = false;
        const changed: string[] = [];
        const discounted: string[] = [];
        before.forEach(([name, styles], i) => {
          const next = after[i][1];
          if (!styles || !next) return;
          const ownDrawing = name === "self" || name.startsWith("self::") || name.startsWith("desc[");
          for (const p of props) {
            if (styles[p] === next[p]) continue;
            if (invisibleSelf && ownDrawing) { discounted.push(`${name}:${p} (elemento invisível)`); continue; }
            const side = p.match(/^border-(top|right|bottom|left)-color$/)?.[1];
            if (side && name === "self" && inError && styles[p] !== "none" && next[p] !== "none") {
              const widthKey = `border-${side}-width`;
              const thicker = parseFloat(next[widthKey]) > parseFloat(styles[widthKey]);
              if (!thicker && reddish(rgb(styles[p])) && neutral(rgb(next[p]))) {
                discounted.push(`${name}:${p} (${styles[p]} → ${next[p]}: o campo em erro perde a cor de erro no foco)`);
                lostErrorOnly = true;
                continue;
              }
            }
            changed.push(`${name}:${p}`);
          }
        });
        // A perda do estado de erro não indica foco, mas também não prova ausência de indicador: incompleta.
        const complete = desc.complete && !(lostErrorOnly && changed.length === 0);
        return { locator, focused, changed, complete, ...(discounted.length ? { discounted } : {}) };
      });
      if (original && typeof original.focus === "function") original.focus({ preventScroll: true });
      return out;
    },
    { locators, step: SHADOW_STEP, props: [...FOCUS_COMPARED_PROPERTIES] as string[], descendantLimit: FOCUS_DESCENDANT_LIMIT },
  );
}
