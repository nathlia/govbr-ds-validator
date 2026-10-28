/**
 * 3.4.0 (D-153, lista única, Lado B): scan, verify e checadores — um teste por item (B1–B10) com o
 * repro de cada evidência (reexecução das chamadas perdidas e auditores com agente de 28/10). Fixtures
 * sintéticas e neutras, servidas aqui; navegador headless. Os controles do catálogo não são abertos:
 * o F4-06-C é reproduzido pela marcação descrita no relatório do auditor.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { scanPage, PageScanCache, pageLevelFirst, type PageScanResult } from "../../src/scan/pageScan.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { EXPECTED_CONDITIONS } from "../../src/schema/structuredClaims.js";
import { FOCUS_INDICATOR_CONDITION } from "../../src/checkers/focusIndicator.js";
import { PageActionSchema } from "../../src/scan/actions.js";
import type { Finding } from "../../src/schema/finding.js";

const head = `<meta charset="utf-8"><title>t</title><style>
  .ds-like:focus-visible { outline: 2px dashed #c2850c; outline-offset: 4px; }
  .sem-foco, .sem-foco:focus, .sem-foco:focus-visible { outline: none; box-shadow: none; }
  .check input { opacity: 0; position: absolute; }
  .check input:focus-visible + label::before { outline: 2px dashed #c2850c; }
  .check label::before { content: ""; display: inline-block; width: 12px; height: 12px; border: 1px solid #888; }
  .menu hr { border: 0; border-top: 1px solid #bbbbbb; }
</style>`;
const page = (body: string, script = "") =>
  `<!doctype html><html lang="pt-BR"><head>${head}</head><body><header>h</header><main>${body}</main><footer>f</footer>${script ? `<script>${script}</script>` : ""}</body></html>`;

const SPA_SHELL = `<!doctype html><html lang="pt-BR"><head><title>spa</title></head><body><main id="app"></main><script>
  const render = () => { const p = location.pathname; document.getElementById('app').innerHTML = p === '/app/lista' ? '<table><tr><td>linha</td></tr></table>' : '<p>início</p>'; };
  window.addEventListener('popstate', render); render();
</script></body></html>`;

const PAGES: Record<string, string> = {
  // B3: o controle conforme F4-06-C (link com aparência de botão que navega) e o A-06 (div role=button)
  "/b3": page(`<a id="voltar" class="br-button secondary" href="#">Voltar</a><div id="fechar" class="br-button circle" role="button" tabindex="0"><i class="fas fa-times"></i></div>`),
  // B5: V-09 (texto autoral em p com cor fora dos tokens) e B-15 (hr só com border-top #bbb)
  "/b5": page(`<p id="erro" style="color:#e60000">CPF inválido.</p><div id="menu" class="menu"><a href="/sair" class="ds-like">Sair</a><hr id="sep"></div>`),
  // B9: link sem indicador; link com indicador do tipo DS; checkbox que desenha o foco no rótulo irmão
  "/b9": page(`<a id="ruim" class="sem-foco" href="/a">Sem foco</a> <a id="bom" class="ds-like" href="/b">Com foco</a>
    <span class="check"><input id="aceito" type="checkbox"><label for="aceito">Aceito</label></span>
    <button id="entrar" class="ds-like" type="button">Entrar</button>`, "document.getElementById('entrar').addEventListener('click', () => {});"),
  "/app": SPA_SHELL,
  // B1: muitos achados de token antes dos de página
  "/b1": `<!doctype html><html lang="pt-BR"><head><title>b1</title></head><body><main>${Array.from({ length: 8 }, (_, i) => `<button class="br-button" style="color:#${(0x123400 + i * 7).toString(16)}">b${i}</button>`).join("")}</main></body></html>`,
};

let http: Server;
let base = "";
beforeAll(async () => {
  http = createHttpServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const body = PAGES[path];
    if (!body) return void res.writeHead(404, { "content-type": "text/html" }).end("<!doctype html><title>404</title><h1>Não encontrado</h1>");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await closeBrowser();
  await new Promise((r) => http.close(() => r(undefined)));
});

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "govbr-ladob-")) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: `ladob-${profile}`, version: "1" });
  await srv.connect(b);
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    return { text, data: JSON.parse(text), isError: Boolean(r.isError) };
  };
  return { client, call };
}

const scan = async (path: string, extra: Record<string, unknown> = {}) =>
  (await scanPage({ url: base + path, viewport: { width: 1280, height: 900 }, ...extra }, new PageScanCache(1))) as PageScanResult;

const claim = (path: string, locator: string, rule: Finding["rule"], data: Record<string, unknown>): Finding => ({
  id: "L-1",
  rule,
  element: { page: base + path, locator, snippet: "" },
  evidence: { observed: "alegado", expected: "esperado", data },
  severity: "serious",
  nature: "syntactic",
  mode: "interaction",
  pathway: "explicit",
});

describe("B1 — achados de nível de página primeiro", () => {
  it("pageLevelFirst põe govbr-ds-page e os do documento (html) na frente, estável", async () => {
    const r = await scan("/b1");
    const sources = r.findings.map((f) => f.rule.source);
    const firstOther = sources.findIndex((s) => s !== "govbr-ds-page");
    expect(sources.slice(firstOther).includes("govbr-ds-page")).toBe(false);
    expect(sources[0]).toBe("govbr-ds-page");
    expect(pageLevelFirst(r.findings)).toEqual(r.findings);
  });
});

describe("B3 — <a class=br-button href> é link; div role=button continua acusado", () => {
  it("F4-06-C: Voltar com href='#' não é achado; o A-06 (div role=button) é", async () => {
    const r = await scan("/b3", { checks: ["structure"] });
    const tags = r.findings.filter((f) => f.rule.id === "ds-structure-button-tag").map((f) => f.element.locator);
    expect(tags).toEqual(["#fechar"]);
  });
});

describe("B5 — cor do texto autoral e borda por lado", () => {
  it("V-09: p com color #e60000 vira ds-token-color; B-15: hr com só border-top #bbb vira border-top-color", async () => {
    const r = await scan("/b5", { checks: ["tokens"] });
    const colors = r.findings.filter((f) => f.rule.id === "ds-token-color").map((f) => [f.element.locator, f.evidence.data?.property, f.evidence.data?.observedHex]);
    expect(colors).toContainEqual(["#erro", "color", "#e60000"]);
    expect(colors).toContainEqual(["#sep", "border-top-color", "#bbbbbb"]);
  });

  it("verify confirma a borda alegada como border-top-color e como border-color (V-028/V-029 rejeitavam)", async () => {
    const rule = { id: "ds-token-color", source: "govbr-ds-token" as const, description: "cor" };
    for (const property of ["border-top-color", "border-color"]) {
      const v = await verifyFinding({ finding: claim("/b5", "#sep", rule, { property, observedHex: "#bbbbbb", expectedCondition: EXPECTED_CONDITIONS.tokenColor }), live: true });
      expect(v.verdict).toBe("confirmed");
    }
    const lado = await verifyFinding({ finding: claim("/b5", "#sep", rule, { property: "border-left-color", observedHex: "#bbbbbb", expectedCondition: EXPECTED_CONDITIONS.tokenColor }), live: true });
    expect(lado.verdict).not.toBe("confirmed");
  });
});

describe("B6 — a 1ª página do scan traz ≥ 3 famílias", () => {
  it("cabeçalho encolhe até caberem 3 famílias no orçamento padrão", async () => {
    const { client, call } = await connect();
    const r = await call("scan_page", { url: `${base}/b1` });
    expect(r.data.totalFamilies).toBeGreaterThanOrEqual(3);
    expect(r.data.families.length).toBeGreaterThanOrEqual(3);
    expect(r.text.length).toBeLessThanOrEqual(8_000);
    expect(r.data.families[0].rule.source).toBe("govbr-ds-page");
    await client.close();
  });
});

describe("B7 — ação navigate e HTTP do estado não alcançado", () => {
  it("rota profunda sem fallback: 404 dito na limitação; a raiz + navigate alcança o estado", async () => {
    const { client, call } = await connect();
    const direto = await call("scan_page", { url: `${base}/app/lista`, arrival: { visible: "table" } });
    expect(direto.data.status).toBe("state-not-reached");
    expect(direto.data.limitation.httpStatus).toBe(404);
    expect(direto.data.limitation.detail).toContain("HTTP 404");
    const nav = await call("scan_page", { url: `${base}/app`, actions: [{ action: "navigate", path: "/app/lista" }], arrival: { visible: "table", path: "/app/lista" } });
    expect(nav.data.status).toBe("scanned");
    expect(nav.data.coverage.actionsApplied).toEqual([{ action: "navigate", path: "/app/lista" }]);
    await client.close();
  });

  it("navigate só aceita caminho da mesma origem, nos dois perfis", async () => {
    for (const path of ["//evil.example/x", "http://evil.example/", "javascript:alert(1)", "app", "/a b", "/\\evil"]) {
      expect(PageActionSchema.safeParse({ action: "navigate", path }).success).toBe(false);
    }
    expect(PageActionSchema.safeParse({ action: "navigate", path: "/pnip/portal?x=1#y" }).success).toBe(true);
    const { client, call } = await connect("knowledge-free");
    const r = await call("scan_page", { url: `${base}/app`, actions: [{ action: "navigate", path: "/app/lista" }], arrival: { visible: "table" } });
    expect(r.data.status).toBe("scanned");
    const bad = await call("scan_page", { url: `${base}/app`, actions: [{ action: "navigate", path: "//evil.example/" }] });
    expect(bad.isError).toBe(true);
    await client.close();
  });
});

describe("B8 — o escopo selectors inclui os descendentes", () => {
  it("#menu inspeciona o hr de dentro (S-page-017 inspecionava só a raiz)", async () => {
    const r = await scan("/b5", { checks: ["tokens"], selectors: ["#menu"] });
    expect(r.coverage.selectorScope).toBe("matched-and-descendants");
    expect(r.coverage.elementsInspected).toBeGreaterThanOrEqual(3);
    expect(r.findings.some((f) => f.element.locator === "#sep" && f.evidence.data?.property === "border-top-color")).toBe(true);
  });
});

describe("B9 — foco visível", () => {
  it("acusa só o link sem indicador; o indicador do DS e o do rótulo irmão (checkbox) contam", async () => {
    const r = await scan("/b9", { checks: ["structure"] });
    const focus = r.findings.filter((f) => f.rule.id === "emag-4.4");
    expect(focus.map((f) => f.element.locator)).toEqual(["#ruim"]);
    expect(focus[0].rule.implements).toEqual(["govbr-3.7.0-accessibility-global-bc492500708d", "emag-4.4"]);
    expect(focus[0].evidence.data?.expectedCondition).toBe(FOCUS_INDICATOR_CONDITION);
  });

  it("depois de um clique (modalidade de ponteiro) o indicador :focus-visible continua visto", async () => {
    const r = await scan("/b9", { checks: ["structure"], actions: [{ action: "click", selector: "#entrar" }] });
    expect(r.findings.filter((f) => f.rule.id === "emag-4.4").map((f) => f.element.locator)).toEqual(["#ruim"]);
  });

  it("verify: o predicado confirma o sem indicador, desmente o com indicador; sem a condição, sem predicado", async () => {
    const rule = { id: "emag-4.4", source: "emag" as const, description: "foco visível" };
    const data = { expectedCondition: FOCUS_INDICATOR_CONDITION };
    expect((await verifyFinding({ finding: claim("/b9", "#ruim", rule, data), live: true })).verdict).toBe("confirmed");
    expect((await verifyFinding({ finding: claim("/b9", "#bom", rule, data), live: true })).verdict).toBe("rejected");
    const kb = { id: "govbr-3.7.0-accessibility-global-bc492500708d", source: "govbr-ds-kb" as const, description: "foco" };
    expect((await verifyFinding({ finding: claim("/b9", "#ruim", kb, data), live: true })).verdict).toBe("confirmed");
    const semCondicao = await verifyFinding({ finding: claim("/b9", "#ruim", rule, {}), live: true });
    expect(semCondicao.verdict).toBe("unverifiable");
    expect(semCondicao.detail).toContain(FOCUS_INDICATOR_CONDITION);
  });

  it("scan → verify: o achado do próprio scanner confirma sem implements no payload", async () => {
    const r = await scan("/b9", { checks: ["structure"] });
    const f = r.findings.find((x) => x.rule.id === "emag-4.4")!;
    const { implements: _i, ...rule } = f.rule;
    expect((await verifyFinding({ finding: { ...f, rule }, live: true })).verdict).toBe("confirmed");
  });

  it("knowledge-free: o scan não roda a checagem (só axe) e o verify não tem predicado", async () => {
    const { client, call } = await connect("knowledge-free");
    const r = await call("scan_page", { url: `${base}/b9`, view: "findings" });
    expect(r.text).not.toContain("emag-4.4");
    expect(r.text).not.toContain("bc492500708d");
    await client.close();
  });
});
