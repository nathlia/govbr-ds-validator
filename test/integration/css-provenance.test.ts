/**
 * Proveniência das declarações num navegador de verdade (D-51): o valor que a folha oficial do DS
 * declara não é cobrado da página, o valor que a página escreve continua sendo, e uma declaração
 * que perdeu a cascata não vira achado.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { inspectComputedStyles } from "../../src/evidence/inspect.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { checkTokenCompliance } from "../../src/checkers/tokenCompliance.js";
import { getTokenRegistry } from "../../src/data/load.js";

// As três primeiras regras são cópias literais de declarações do core.css 3.7.0; as demais são "da página".
const HTML = `<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8"><title>proveniência</title><style>
.br-textarea textarea{border-radius:6px}
.br-select .br-list{margin-top:-2px}
.br-select .br-input input{padding-right:29px}
.pagina-raio{border-radius:7px}
.pagina-padding{padding:13px}
.perdeu{margin:-1px 0 0 0}
.meses .perdeu{margin:0}
</style></head><body>
<div class="br-textarea"><textarea id="oficial"></textarea></div>
<div class="br-select"><div class="br-input"><input id="campo-select"></div><div class="br-list" id="lista"></div></div>
<textarea id="da-pagina" class="pagina-raio"></textarea>
<button id="apertado" class="pagina-padding">ok</button>
<div class="meses"><select id="mes" class="perdeu"><option>jan</option></select></div>
</body></html>`;

let server: Server;
let url = "";

beforeAll(async () => {
  server = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(HTML); });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
});

afterAll(async () => {
  await closeBrowser();
  await new Promise((done) => server.close(done));
});

describe("CSS provenance in a live browser (D-51)", () => {
  it("separates DS-shipped declarations from the page's and scores only the page's", async () => {
    const evidence = await inspectComputedStyles(url, "#oficial, #campo-select, #lista, #da-pagina, #apertado, #mes");
    const by = Object.fromEntries(evidence.elements.map((el) => [el.id, el]));

    expect(by.oficial.dsShipped?.borderRadius).toEqual(["6px"]);
    expect(by.oficial.authored?.borderRadius).toBeUndefined();
    expect(by["lista"].dsShipped?.margin).toEqual(["-2px"]);
    expect(by["campo-select"].dsShipped?.padding).toEqual(["29px"]);
    expect(by["da-pagina"].authored?.borderRadius).toEqual(["7px"]);

    const findings = checkTokenCompliance({ url }, evidence.elements, getTokenRegistry(), ["radius", "spacing"]);
    expect(findings.map((f) => `${f.element.locator} ${f.rule.checker}`).sort()).toEqual([
      "#apertado ds-token-spacing",
      "#da-pagina ds-token-radius",
    ]);
  });
});
