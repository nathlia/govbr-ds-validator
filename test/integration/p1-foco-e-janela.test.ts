/**
 * 2.14.0 — dois consertos pedidos pelo portão sem modelo da NAT-86 (plano §7.3 e §7.5a).
 *
 * 1. P1 (`input-error-item-identified` / `-described-in-text`): a mudança de aparência do campo só é
 *    sinal de erro comparada no MESMO estado de foco. Regressão sintética e neutra do mecanismo do
 *    controle F1-10-N (a página aceita o valor, mostra mensagem de sucesso, e o campo só muda porque o
 *    clique no botão tirou o foco dele) — o controle real roda no portão (govbr-eval/portao-nat86).
 * 2. Janela do oráculo declarada pelo harness em GOVBR_VALIDATOR_VIEWPORT, fora do esquema MCP.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { closeBrowser } from "../../src/evidence/browser.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { runKnowledgeLocked, resetKnowledgeLock } from "../../src/data/lock.js";
import { PageScanCache, scanPage, type PageScanResult } from "../../src/scan/pageScan.js";
import { oracleViewport } from "../../src/scan/state.js";
import { EXPECTED_CONDITIONS as C } from "../../src/schema/structuredClaims.js";
import type { Finding } from "../../src/schema/finding.js";
import type { PageAction } from "../../src/scan/actions.js";

const STYLE = `<style>
  .grupo input { border: 1px solid rgb(136, 136, 136); }
  .grupo input:focus { border-color: rgb(0, 0, 200); box-shadow: 0 0 0 3px rgb(150, 150, 255); outline: none; }
  .grupo.erro input { border-color: rgb(200, 0, 0); }
</style>`;
const page = (script: string) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Inscrição – Oficina</title>${STYLE}</head>
<body><main><h1>Inscrição</h1><form id="f" novalidate><div class="grupo" id="g"><label for="codigo">Código da turma</label><input id="codigo"></div>
<button id="enviar" type="submit">Inscrever</button></form><p id="retorno"></p></main><script>
const f = document.getElementById('f'); const c = document.getElementById('codigo'); const g = document.getElementById('g'); const r = document.getElementById('retorno');
f.addEventListener('submit', (e) => { e.preventDefault(); ${script} });</script></body></html>`;

const PAGES: Record<string, string> = {
  // Aceita qualquer valor e mostra sucesso: não há erro nenhum (o caso do F1-10-N).
  "/sucesso": page("r.textContent = 'Inscrição registrada. Você tem 2 vagas.';"),
  // Erro de verdade: marca o grupo e mostra a mensagem, sem associação programática.
  "/erro": page("g.classList.add('erro'); const m = document.createElement('span'); m.id = 'codigo-msg'; m.textContent = 'Valor inválido.'; g.appendChild(m);"),
  // Erro só por cor (descrito em texto: não).
  "/so-cor": page("g.classList.add('erro');"),
  // Erro que devolve o foco ao campo: a comparação é com o campo focado antes do envio.
  "/erro-foco-volta": page("g.classList.add('erro'); const m = document.createElement('span'); m.id = 'codigo-msg'; m.textContent = 'Valor inválido.'; g.appendChild(m); c.focus();"),
};

let server: Server;
let base = "";
beforeAll(async () => {
  server = createHttpServer((req, res) => {
    const body = PAGES[new URL(req.url ?? "/", "http://x").pathname];
    if (!body) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await closeBrowser();
  await new Promise((r) => server.close(() => r(undefined)));
});
afterEach(() => {
  resetKnowledgeLock();
  delete process.env.GOVBR_VALIDATOR_VIEWPORT;
});

const SUBMIT: PageAction[] = [{ action: "fill", selector: "#codigo", value: "12" }, { action: "click", selector: "#enviar" }];
function claim(path: string, source: "wcag" | "emag", id: string, data: Record<string, unknown>): Finding {
  return {
    id: "F-910",
    rule: { id, source, description: "alegação de teste" },
    element: { locator: "#codigo", page: `${base}${path}` },
    evidence: { observed: "observado", expected: "esperado", data },
    severity: "serious",
    nature: "semantic",
    mode: "interaction",
    pathway: "heuristic",
  };
}
const both = async (finding: Finding) => ({
  evaluation: await verifyFinding({ finding, live: true, actions: SUBMIT }),
  knowledgeFree:
    finding.rule.source === "wcag"
      ? await runKnowledgeLocked(() => verifyFinding({ finding, live: true, actions: SUBMIT, knowledgeFree: true }))
      : null,
});

describe("P1: aparência do campo comparada no mesmo estado de foco (NAT-86 §7.3)", () => {
  it("mensagem de sucesso + campo que só perdeu o foco: nunca confirmed (wcag 3.3.1 e emag 6.6, nos dois perfis)", async () => {
    const data = { expectedCondition: C.errorItemIdentified, errorMessage: "#retorno" };
    for (const [source, id] of [["wcag", "3.3.1"], ["emag", "6.6"]] as const) {
      const r = await both(claim("/sucesso", source, id, data));
      expect(r.evaluation.verdict, `${source} evaluation`).not.toBe("confirmed");
      expect(r.evaluation.checks?.violation).toBe("undetermined");
      expect(r.evaluation.detail).toContain("mesmo estado de foco");
      if (r.knowledgeFree) expect(r.knowledgeFree.verdict, `${source} knowledge-free`).not.toBe("confirmed");
    }
    const described = await both(claim("/sucesso", "wcag", "3.3.1", { expectedCondition: C.errorDescribedInText }));
    expect(described.evaluation.verdict).not.toBe("confirmed");
    expect(described.knowledgeFree!.verdict).not.toBe("confirmed");
  });

  it("os positivos continuam: erro de verdade confirma nos dois perfis, inclusive com o foco devolvido ao campo", async () => {
    for (const path of ["/erro", "/erro-foco-volta"]) {
      const r = await both(claim(path, "wcag", "3.3.1", { expectedCondition: C.errorItemIdentified, errorMessage: "#codigo-msg" }));
      expect(r.evaluation.verdict, `${path} evaluation`).toBe("confirmed");
      expect(r.knowledgeFree!.verdict, `${path} knowledge-free`).toBe("confirmed");
    }
    const soCor = await both(claim("/so-cor", "wcag", "3.3.1", { expectedCondition: C.errorDescribedInText }));
    expect(soCor.evaluation.verdict).toBe("confirmed");
    expect(soCor.knowledgeFree!.verdict).toBe("confirmed");
  });
});

describe("janela do oráculo declarada pelo harness (NAT-86 §7.5a)", () => {
  it("ausente: 1280×720 frozen-desktop, como até a 2.13.0; malformada: erro", () => {
    expect(oracleViewport({})).toEqual({ viewport: { width: 1280, height: 720 }, source: "frozen-desktop" });
    expect(oracleViewport({ GOVBR_VALIDATOR_VIEWPORT: "1280x900" })).toEqual({ viewport: { width: 1280, height: 900 }, source: "harness" });
    expect(() => oracleViewport({ GOVBR_VALIDATOR_VIEWPORT: "grande" })).toThrow(/GOVBR_VALIDATOR_VIEWPORT/);
  });

  it("scan_page e verify_finding usam a janela do harness e a gravam na atestação de estado", async () => {
    process.env.GOVBR_VALIDATOR_VIEWPORT = "1280x900";
    const scan = (await scanPage({ url: `${base}/erro`, checks: ["page"] }, new PageScanCache(1))) as PageScanResult;
    expect(scan.state.recipe.viewport).toEqual({ width: 1280, height: 900 });
    expect(scan.state.recipe.viewportSource).toBe("harness");
    expect(scan.state.observed.viewport).toMatchObject({ width: 1280, height: 900 });
    const v = await verifyFinding({ finding: claim("/erro", "wcag", "1.1.1", {}), live: true });
    expect((v.binding?.state as { observed: { viewport: { height: number } } }).observed.viewport.height).toBe(900);
    // A janela do CLI (linha de base) continua valendo sobre a do harness.
    const cli = (await scanPage({ url: `${base}/erro`, checks: ["page"], viewport: { width: 1024, height: 768 } }, new PageScanCache(1))) as PageScanResult;
    expect(cli.state.recipe.viewportSource).toBe("cli");
  });
});
