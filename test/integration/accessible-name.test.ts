/**
 * Nome acessível num Chromium de verdade (2.8.0, NAT-33).
 *
 * Até a 2.7.0 o verificador de estrutura acusava e-MAG 2.2 / WCAG 4.1.2 em todo botão apenas com
 * ícone sem `aria-label`, inclusive nos que o Chromium expõe com nome por `title` ou
 * `aria-labelledby` — e na tela B isso eram os `br-button` web components, cujo `<button>` interno
 * recebe o `title` do host. Cada caso abaixo compara a decisão do verificador com o nome que o
 * próprio navegador calcula (`ariaSnapshot`), para que os dois não possam divergir em silêncio.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Page } from "playwright";
import { getBrowser, closeBrowser } from "../../src/evidence/browser.js";
import { inspectPageComputedStyles } from "../../src/evidence/inspect.js";
import { checkComponentStructure } from "../../src/checkers/structure.js";
import { getComponentSpecs } from "../../src/data/load.js";

const URL = "http://fixture.local/";
const ICON = '<i class="fas fa-eye" aria-hidden="true"></i>';
const buttonSpec = getComponentSpecs().components.button;

/**
 * Espelho do `br-button` de @govbr-ds/webcomponents: o host recebe `title`; o componente desenha
 * um `<button class="br-button">` no shadow root aberto. `data-repassa` decide se o `title` é
 * repassado ao botão interno (o que o componente real faz) ou fica só no host.
 */
const WEB_COMPONENT = `
<script>
  class XBrButton extends HTMLElement {
    connectedCallback() {
      const root = this.attachShadow({ mode: "open" });
      const title = this.hasAttribute("data-repassa") ? \` title="\${this.getAttribute("title")}"\` : "";
      root.innerHTML = \`<button class="br-button circle" type="button" aria-label=""\${title}><i class="fas fa-trash" aria-hidden="true"></i></button>\`;
    }
  }
  customElements.define("x-br-button", XBrButton);
</script>`;

let page: Page;

beforeAll(async () => {
  page = await (await getBrowser()).newPage();
});

afterAll(async () => {
  await page?.close();
  await closeBrowser();
});

async function decide(body: string, button = "button.br-button") {
  await page.setContent(`<!DOCTYPE html><html lang="pt-BR"><body>${body}</body></html>`);
  const evidence = await inspectPageComputedStyles(page, URL, ".br-button", []);
  const element = evidence.elements.find((e) => e.classes.includes("br-button"));
  if (!element) throw new Error("fixture sem .br-button");
  const findings = checkComponentStructure({ url: URL }, [element], buttonSpec).filter((f) => f.rule.id === "wcag:4.1.2");
  const snapshot = await page.locator(button).ariaSnapshot();
  return { element, findings, snapshot };
}

describe("emag-1.1 (era 2.2) decide pelo nome acessível calculado pelo Chromium", () => {
  it("sem nome nenhum: acusa", async () => {
    const r = await decide(`<button class="br-button circle">${ICON}</button>`);
    expect(r.snapshot).toBe("- button");
    expect(r.element.accessibleName).toEqual({ name: "", source: "chromium" });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].rule.wcag).toBe("4.1.2");
    expect(r.findings[0].evidence.observed).toMatch(/sem nome acessível/);
    expect(r.findings[0].evidence.expected).not.toMatch(/exemplos oficiais/);
  });

  it("nome pelo conteúdo (img com alt dentro do botão): não acusa", async () => {
    const r = await decide(`<button class="br-button circle"><img alt="Buscar" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></button>`);
    expect(r.element.content.hasIconOnly).toBe(true);
    expect(r.element.accessibleName).toEqual({ name: "Buscar", source: "chromium" });
    expect(r.findings).toEqual([]);
  });

  it("texto visível ao lado do ícone não é 'apenas ícone': não acusa", async () => {
    const r = await decide(`<button class="br-button">${ICON} Visualizar</button>`);
    expect(r.element.content.hasIconOnly).toBe(false);
    expect(r.findings).toEqual([]);
  });

  it("aria-label: não acusa", async () => {
    const r = await decide(`<button class="br-button circle" aria-label="Visualizar registro">${ICON}</button>`);
    expect(r.snapshot).toBe('- button "Visualizar registro"');
    expect(r.findings).toEqual([]);
  });

  it("aria-label vazio ou só com espaços: acusa", async () => {
    for (const value of ["", "   "]) {
      const r = await decide(`<button class="br-button circle" aria-label="${value}">${ICON}</button>`);
      expect(r.snapshot).toBe("- button");
      expect(r.findings).toHaveLength(1);
    }
  });

  it("aria-labelledby com referência válida: não acusa", async () => {
    const r = await decide(`<span id="rotulo">Visualizar registro</span><button class="br-button circle" aria-labelledby="rotulo">${ICON}</button>`);
    expect(r.snapshot).toBe('- button "Visualizar registro"');
    expect(r.element.content.labelledbyText).toBe("Visualizar registro");
    expect(r.findings).toEqual([]);
  });

  it("aria-labelledby com id inexistente: acusa", async () => {
    const r = await decide(`<button class="br-button circle" aria-labelledby="nao-existe">${ICON}</button>`);
    expect(r.snapshot).toBe("- button");
    expect(r.element.content.labelledbyText).toBe("");
    expect(r.findings).toHaveLength(1);
  });

  it("aria-labelledby apontando para elemento vazio: acusa", async () => {
    const r = await decide(`<span id="vazio"></span><button class="br-button circle" aria-labelledby="vazio">${ICON}</button>`);
    expect(r.snapshot).toBe("- button");
    expect(r.findings).toHaveLength(1);
  });

  it("só title: não acusa", async () => {
    const r = await decide(`<button class="br-button circle" title="Visualizar registro">${ICON}</button>`);
    expect(r.snapshot).toBe('- button "Visualizar registro"');
    expect(r.element.accessibleName).toEqual({ name: "Visualizar registro", source: "chromium" });
    expect(r.findings).toEqual([]);
  });

  it("precedência: aria-labelledby > aria-label > title", async () => {
    const todos = await decide(
      `<span id="r">Pelo labelledby</span><button class="br-button circle" aria-labelledby="r" aria-label="Pelo aria-label" title="Pelo title">${ICON}</button>`
    );
    expect(todos.element.accessibleName?.name).toBe("Pelo labelledby");
    const semLabelledby = await decide(`<button class="br-button circle" aria-label="Pelo aria-label" title="Pelo title">${ICON}</button>`);
    expect(semLabelledby.element.accessibleName?.name).toBe("Pelo aria-label");
    const quebrado = await decide(`<button class="br-button circle" aria-labelledby="nao-existe" aria-label="  " title="Pelo title">${ICON}</button>`);
    expect(quebrado.element.accessibleName?.name).toBe("Pelo title");
    for (const r of [todos, semLabelledby, quebrado]) expect(r.findings).toEqual([]);
  });
});

// Elemento que o Chromium ignora na árvore de acessibilidade não tem nome calculado — "sem nome"
// seria artefato da leitura. Para ele vale a aproximação por atributos (só para ele): com
// aria-label, nada; sem nome nenhum, acusa como a 2.7.0 acusava.
describe("elemento ignorado pelo Chromium cai na aproximação por atributos", () => {
  const casos = {
    "display:none": (attrs: string) => `<button class="br-button circle" style="display:none" ${attrs}>${ICON}</button>`,
    "visibility:hidden": (attrs: string) => `<button class="br-button circle" style="visibility:hidden" ${attrs}>${ICON}</button>`,
    "ancestral aria-hidden": (attrs: string) => `<div aria-hidden="true"><button class="br-button circle" ${attrs}>${ICON}</button></div>`,
  };
  for (const [nome, html] of Object.entries(casos)) {
    it(`${nome} com aria-label: não acusa`, async () => {
      const r = await decide(html('aria-label="Fechar"'), "body");
      expect(r.element.accessibleName).toEqual({ name: "Fechar", source: "atributos" });
      expect(r.findings).toEqual([]);
    });
    it(`${nome} sem nome nenhum: acusa`, async () => {
      const r = await decide(html(""), "body");
      expect(r.element.accessibleName).toEqual({ name: "", source: "atributos" });
      expect(r.findings).toHaveLength(1);
      expect(r.findings[0].evidence.data?.accessibleNameSource).toBe("atributos");
    });
  }

  it("a queda é por elemento: o vizinho visível continua com o nome do Chromium", async () => {
    await page.setContent(
      `<button class="br-button circle" style="display:none" aria-label="Fechar">${ICON}</button><button class="br-button circle" title="Abrir">${ICON}</button>`
    );
    const evidence = await inspectPageComputedStyles(page, URL, ".br-button", []);
    expect(evidence.elements.map((e) => e.accessibleName)).toEqual([
      { name: "Fechar", source: "atributos" },
      { name: "Abrir", source: "chromium" },
    ]);
  });
});

describe("web component espelhando br-button (shadow root aberto)", () => {
  it("title repassado ao <button> interno, aria-label vazio: o Chromium dá nome e não há achado", async () => {
    const r = await decide(`<x-br-button title="Excluir vistoria" data-repassa></x-br-button>${WEB_COMPONENT}`, "x-br-button button");
    expect(r.element.locator).toContain(">>>");
    expect(r.element.inShadowDom).toBe(true);
    expect(r.snapshot).toBe('- button "Excluir vistoria"');
    expect(r.element.accessibleName).toEqual({ name: "Excluir vistoria", source: "chromium" });
    expect(r.findings).toEqual([]);
  });

  it("title só no host: o <button> interno fica sem nome no Chromium e o achado continua", async () => {
    const r = await decide(`<x-br-button title="Excluir vistoria"></x-br-button>${WEB_COMPONENT}`, "x-br-button button");
    expect(r.snapshot).toBe("- button");
    expect(r.element.accessibleName).toEqual({ name: "", source: "chromium" });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].element.locator).toContain(">>>");
  });
});

describe("a passagem não deixa rastro na página", () => {
  it("remove a lista temporária do window", async () => {
    await decide(`<button class="br-button circle">${ICON}</button>`);
    expect(await page.evaluate(() => "__govbrAccessibleNameProbe" in window)).toBe(false);
  });
});
