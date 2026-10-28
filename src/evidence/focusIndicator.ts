/**
 * 3.4.0 (B9, A-04/V-05): o indicador de foco é visível? Mede, no estado atual da página, a diferença
 * de estilo entre o elemento com foco e sem foco.
 *
 * O foco é dado por script (`element.focus()`) depois de uma tecla Shift (modalidade de teclado), e no Chromium casa `:focus` e `:focus-visible`
 * (medido na 3.4.0: sem interação de ponteiro anterior e depois dela). O indicador pode estar no próprio
 * elemento, nos pseudo-elementos dele, no rótulo irmão (o checkbox/radio do DS desenha o foco em
 * `input:focus-visible + label::before`), no `<label>` associado ou no pai (`:focus-within`). Qualquer
 * diferença em qualquer um desses conta como indicador — a medição é generosa de propósito: só a
 * AUSÊNCIA de qualquer mudança vira achado.
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
  /** Propriedades que mudaram com o foco, prefixadas pelo alvo (`self`, `self::before`, `label`, `parent`, …). */
  changed: string[];
}

/** Elementos focáveis pelo Tab cuja indicação de foco o scan mede. */
export const FOCUSABLE_SELECTOR =
  "a[href], button, input:not([type='hidden']), select, textarea, summary, [tabindex]:not([tabindex^='-'])";

export const FOCUS_COMPARED_PROPERTIES = [
  "outline-style", "outline-width", "outline-color", "outline-offset", "box-shadow",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "background-color", "color", "text-decoration-line", "text-decoration-color", "opacity",
] as const;

/** Mede os elementos dos localizadores (formato do inspect: saltos de shadow root com ` >>> `). */
export async function measureFocusIndicators(page: Page, locators: string[]): Promise<FocusIndicatorFact[]> {
  if (locators.length === 0) return [];
  // Depois de um clique, o Chromium deixa de casar `:focus-visible` no foco por script (modalidade de
  // ponteiro) e todo indicador do DS sumiria. Uma tecla Shift restabelece a modalidade de teclado —
  // a mesma de quem navega com Tab —, sem efeito de edição (Ctrl/Alt não servem: o Chromium os ignora).
  await page.keyboard.press("Shift").catch(() => undefined);
  return page.evaluate(
    ({ locators, step, props }) => {
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
      const snapshot = (el: Element) => targets(el).map(([name, node, pseudo]) => [name, read(node, pseudo)] as const);
      const original = deepActive() as HTMLElement | null;
      const out = locators.map((locator) => {
        const found = resolve(locator);
        if (found.length !== 1) return { locator, focused: false, changed: [] as string[] };
        const el = found[0] as HTMLElement;
        // Já focado (o clique da receita, por exemplo): o estado "sem foco" é lido depois de tirar o foco.
        if (deepActive() === el) el.blur();
        const before = snapshot(el);
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
        const after = focused ? snapshot(el) : before;
        el.blur();
        const changed: string[] = [];
        before.forEach(([name, styles], i) => {
          const next = after[i][1];
          if (!styles || !next) return;
          for (const p of props) if (styles[p] !== next[p]) changed.push(`${name}:${p}`);
        });
        return { locator, focused, changed };
      });
      if (original && typeof original.focus === "function") original.focus({ preventScroll: true });
      return out;
    },
    { locators, step: SHADOW_STEP, props: [...FOCUS_COMPARED_PROPERTIES] as string[] },
  );
}
