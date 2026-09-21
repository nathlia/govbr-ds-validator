/**
 * Fatos de página inteira (2.7.0): o que o verificador de estrutura de página e o predicado do
 * portão precisam saber sobre o documento, não sobre um elemento.
 *
 * `inspectPageComputedStyles` responde por elemento e não tem como dizer "não existe rodapé": a
 * ausência de um elemento não é evidência de elemento nenhum. Aqui a unidade é o documento, lido
 * uma vez no mesmo navegador e no mesmo estado que o resto da varredura.
 */
import type { Page } from "playwright";

/** Regiões do Template Base e do Padrão Mínimo, pela classe raiz do componente que as ocupa. */
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
  /** Quantos elementos com a classe raiz de cada região existem no documento (shadow roots não contam). */
  regions: Record<PageRegion, number>;
  /** Quantos `<main>` ou `[role=main]`. */
  mainLandmarks: number;
  /** Total de `<a href>` no documento, na ordem do DOM. */
  linkCount: number;
  /**
   * O primeiro `<a href>` na ordem do DOM — o que o e-MAG 1.5 manda ser o salto para o conteúdo.
   * `skipsToContent`: o href é uma âncora interna (`#id`) cujo alvo existe no documento.
   */
  firstLink: { href: string; text: string; targetId: string | null; targetExists: boolean; skipsToContent: boolean } | null;
}

export async function inspectPageStructure(page: Page, url: string): Promise<PageFacts> {
  const facts = await page.evaluate((selectors: Record<string, string>) => {
    const regions: Record<string, number> = {};
    for (const [region, selector] of Object.entries(selectors)) regions[region] = document.querySelectorAll(selector).length;
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const first = links[0];
    let firstLink: PageFacts["firstLink"] = null;
    if (first) {
      const href = first.getAttribute("href") ?? "";
      const targetId = href.startsWith("#") && href.length > 1 ? decodeURIComponent(href.slice(1)) : null;
      const targetExists = targetId !== null &&
        (document.getElementById(targetId) !== null || document.querySelector(`a[name="${CSS.escape(targetId)}"]`) !== null);
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
      mainLandmarks: document.querySelectorAll("main, [role='main']").length,
      linkCount: links.length,
      firstLink,
    };
  }, PAGE_REGION_SELECTORS as Record<string, string>);
  return { url, ...facts, regions: facts.regions as Record<PageRegion, number> };
}
