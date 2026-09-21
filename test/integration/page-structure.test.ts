/**
 * Estrutura de página num navegador de verdade (2.7.0): as regiões do Template Base contam tanto
 * pela classe raiz do core quanto pelo web component do `@govbr-ds/webcomponents`, que renderiza
 * dentro de shadow root — a forma da tela B do corpus. O primeiro link também é lido na ordem
 * composta.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { withPage, closeBrowser } from "../../src/evidence/browser.js";
import { inspectPageStructure } from "../../src/evidence/pageFacts.js";
import { checkPageStructure } from "../../src/checkers/pageStructure.js";
import { scanPage, PageScanCache } from "../../src/scan/pageScan.js";

const WEBCOMPONENTS = `<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8"><title>web components</title>
<script>
  class BrHeader extends HTMLElement { connectedCallback() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = '<header class="br-header"><a href="#conteudo">Ir para o conteúdo</a><a href="/sair">Sair</a></header>';
  } }
  class BrFooter extends HTMLElement { connectedCallback() {
    this.attachShadow({ mode: "open" }).innerHTML = '<footer class="br-footer"><a href="/mapa">Mapa</a></footer>';
  } }
  customElements.define("br-header", BrHeader);
  customElements.define("br-footer", BrFooter);
</script></head>
<body><br-header></br-header><main id="conteudo"><h1>Privacidade</h1></main><br-footer></br-footer></body></html>`;

const CORE_CLASSES = `<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8"><title>core</title></head>
<body><header class="br-header"><a href="/inicio">Início</a></header><main id="conteudo"></main><footer class="br-footer"></footer></body></html>`;

const HEADER_ONLY_NO_LINKS = `<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8"><title>só cabeçalho</title>
<script>customElements.define("br-header", class extends HTMLElement { connectedCallback() { this.attachShadow({ mode: "open" }).innerHTML = '<header class="br-header"><button>Menu</button></header>'; } });</script>
</head><body><br-header></br-header><main><p>texto</p></main></body></html>`;

const PAGES: Record<string, string> = { "/wc": WEBCOMPONENTS, "/core": CORE_CLASSES, "/so-cabecalho": HEADER_ONLY_NO_LINKS };

let server: Server;
let origin = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const html = PAGES[req.url ?? ""];
    res.writeHead(html ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(html ?? "");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await closeBrowser();
  await new Promise((done) => server.close(done));
});

describe("page facts across shadow roots", () => {
  it("counts a web-component header and footer once each and reads the first link inside the shadow root", async () => {
    const url = `${origin}/wc`;
    const facts = await withPage(url, (page) => inspectPageStructure(page, url));
    expect(facts.regions.header).toBe(1);
    expect(facts.regions.footer).toBe(1);
    expect(facts.linkCount).toBe(3);
    expect(facts.firstLink).toMatchObject({ href: "#conteudo", targetExists: true, skipsToContent: true });
    expect(checkPageStructure({ url }, facts)).toEqual([]);
  });

  it("still reads the core's root classes in the light DOM, and charges a first link that does not skip", async () => {
    const url = `${origin}/core`;
    const facts = await withPage(url, (page) => inspectPageStructure(page, url));
    expect(facts.regions).toMatchObject({ header: 1, footer: 1 });
    expect(checkPageStructure({ url }, facts).map((f) => f.rule.id)).toEqual(["ds-page-skip-link"]);
  });

  it("does not accuse a web-component header of being absent, and does not charge a page without links for the skip link", async () => {
    const url = `${origin}/so-cabecalho`;
    const result = await scanPage({ url, checks: ["page"] }, new PageScanCache(1));
    expect(result.findings.map((f) => f.rule.id)).toEqual(["ds-page-footer"]);
    expect(result.findings[0].evidence.data).toMatchObject({ region: "footer", observedCount: 0 });
  });
});
