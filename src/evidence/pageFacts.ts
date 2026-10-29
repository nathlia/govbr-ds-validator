/**
 * Fatos de página inteira (2.7.0): o que o verificador de estrutura de página e o predicado do
 * portão precisam saber sobre o documento, não sobre um elemento.
 *
 * `inspectPageComputedStyles` responde por elemento e não tem como dizer "não existe rodapé": a
 * ausência de um elemento não é evidência de elemento nenhum. Aqui a unidade é o documento, lido
 * uma vez no mesmo navegador e no mesmo estado que o resto da varredura.
 *
 * Uma região do Template Base pode chegar de duas formas: a classe raiz do `@govbr-ds/core`
 * (`<header class="br-header">`) ou o web component do `@govbr-ds/webcomponents` (`<br-header>`),
 * que renderiza a mesma anatomia dentro de um shadow root. A tela B do corpus (Angular + web
 * components) tem a segunda forma e nenhuma ocorrência da primeira no DOM claro; contar só a classe
 * acusaria uma página com cabeçalho de não ter cabeçalho. Por isso a leitura percorre o DOM claro e
 * todo shadow root aberto, como `inspect.ts` já faz, e aceita tag ou classe. Um host contado não tem
 * o seu interior contado de novo para a mesma região.
 */
import type { Page } from "playwright";

/** Regiões do Template Base e do Padrão Mínimo: classe raiz do core e tag do web component. */
export const PAGE_REGION_SELECTORS = {
  header: ".br-header",
  footer: ".br-footer",
  breadcrumb: ".br-breadcrumb",
  cookiebar: ".br-cookiebar",
  menu: ".br-menu",
} as const;

export type PageRegion = keyof typeof PAGE_REGION_SELECTORS;

export interface PageFacts {
  url: string;
  lang: string | null;
  title: string;
  /** Elementos que ocupam cada região: classe raiz ou web component, no DOM claro ou em shadow roots abertos. */
  regions: Record<PageRegion, number>;
  /** Quantos `<main>` ou `[role=main]`. */
  mainLandmarks: number;
  /** Total de `<a href>` no documento, na ordem composta (shadow roots abertos incluídos). */
  linkCount: number;
  /**
   * O primeiro `<a href>` na ordem composta — o que o e-MAG 1.5 manda ser o salto para o conteúdo.
   * `skipsToContent`: o href é uma âncora interna (`#id`) cujo alvo existe no documento.
   */
  firstLink: { href: string; text: string; targetId: string | null; targetExists: boolean; skipsToContent: boolean } | null;
  /**
   * 3.4.4 (C12): o primeiro a receber foco pelo Tab quando há `tabindex` positivo — ele vem antes de
   * qualquer elemento com tabindex 0/nativo, então antes do salto. `null` sem tabindex positivo exibido.
   * `isFirstLink`: é o próprio primeiro link.
   */
  positiveTabindexFirst?: { tag: string; tabindex: number; text: string; id: string | null; isFirstLink: boolean } | null;
}

export async function inspectPageStructure(page: Page, url: string): Promise<PageFacts> {
  const facts = await page.evaluate((selectors: Record<string, string>) => {
    const regionNames = Object.keys(selectors);
    const regions: Record<string, number> = Object.fromEntries(regionNames.map((r) => [r, 0]));
    const links: HTMLAnchorElement[] = [];
    const ids = new Set<string>();
    let mainLandmarks = 0;

    const occupies = (el: Element, region: string): boolean =>
      el.classList.contains(`br-${region}`) || el.tagName.toLowerCase() === `br-${region}`;

    // Ordem composta: o shadow root de um host vem antes dos filhos claros do host.
    const walk = (root: Element | ShadowRoot, counted: Set<string>) => {
      for (const el of Array.from(root.children)) {
        if (el.id) ids.add(el.id);
        if (el.tagName.toLowerCase() === "main" || el.getAttribute("role") === "main") mainLandmarks += 1;
        if (el.tagName.toLowerCase() === "a" && el.hasAttribute("href")) links.push(el as HTMLAnchorElement);
        const nowCounted = new Set(counted);
        for (const region of regionNames) {
          if (!counted.has(region) && occupies(el, region)) {
            regions[region] += 1;
            nowCounted.add(region);
          }
        }
        if (el.shadowRoot) walk(el.shadowRoot, nowCounted);
        walk(el, nowCounted);
      }
    };
    walk(document.documentElement, new Set());

    // 3.4.4 (C12): tabindex positivo exibido e habilitado — o menor valor, depois a ordem do documento.
    let positiveTabindexFirst: PageFacts["positiveTabindexFirst"] = null;
    {
      let best: { el: Element; tabindex: number } | null = null;
      const scan = (root: Document | ShadowRoot) => {
        for (const el of Array.from(root.querySelectorAll("[tabindex]"))) {
          const t = parseInt(el.getAttribute("tabindex") ?? "", 10);
          if (!(t > 0)) continue;
          const cs = getComputedStyle(el);
          if (el.getClientRects().length === 0 || cs.visibility === "hidden" || (el as HTMLButtonElement).disabled) continue;
          if (!best || t < best.tabindex) best = { el, tabindex: t };
        }
        for (const host of Array.from(root.querySelectorAll("*"))) if (host.shadowRoot) scan(host.shadowRoot);
      };
      scan(document);
      const chosen = best as { el: Element; tabindex: number } | null;
      if (chosen) {
        positiveTabindexFirst = {
          tag: chosen.el.tagName.toLowerCase(),
          tabindex: chosen.tabindex,
          text: ((chosen.el as HTMLElement).innerText ?? chosen.el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
          id: chosen.el.id || null,
          isFirstLink: chosen.el === links[0],
        };
      }
    }
    const first = links[0];
    let firstLink: PageFacts["firstLink"] = null;
    if (first) {
      const href = first.getAttribute("href") ?? "";
      const targetId = href.startsWith("#") && href.length > 1 ? decodeURIComponent(href.slice(1)) : null;
      const targetExists = targetId !== null &&
        (ids.has(targetId) || document.querySelector(`a[name="${CSS.escape(targetId)}"]`) !== null);
      firstLink = {
        href,
        text: (first.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
        targetId,
        targetExists,
        skipsToContent: targetExists,
      };
    }
    return {
      lang: document.documentElement.getAttribute("lang"),
      title: document.title,
      regions,
      mainLandmarks,
      linkCount: links.length,
      firstLink,
      positiveTabindexFirst,
    };
  }, PAGE_REGION_SELECTORS as Record<string, string>);
  return { url, ...facts, regions: facts.regions as Record<PageRegion, number> };
}
