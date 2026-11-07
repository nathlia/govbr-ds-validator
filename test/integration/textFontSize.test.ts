import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import type { ToolTelemetryEvent } from "../../src/telemetry.js";
import { scanPage, PageScanCache, type PageScanRequest } from "../../src/scan/pageScan.js";
import { closeBrowser } from "../../src/evidence/browser.js";

const html = `<!doctype html><html lang="pt-BR"><head><title>Agenda cultural</title><style>
.bad { font-size:13px } .good {font-size:14px} #title{font-family:"Comic Sans MS"}
</style></head><body><main>
<section id="region"><h1 id="title" class="bad">Agenda cultural</h1>
<p id="paragraph" class="bad" style="color:#010203">Apresentações de novembro.</p>
<span id="already" class="br-tag bad">Em cartaz</span>
<p id="correct" class="good">Entrada livre.</p>
<div style="font-size:13px"><span id="inherited">Consulte horários.</span></div>
<h2 id="hidden" class="bad" hidden>Programação futura</h2>
<h2 id="only-hidden-text" class="bad" style="height:30px"><span hidden>Texto oculto</span></h2>
<h2 id="only-invisible-text" class="bad" style="height:30px"><span style="visibility:hidden">Texto invisível</span></h2>
<h2 id="empty" class="bad"></h2><hr id="separator" class="bad"></section>
<x-note id="ordinary"></x-note><br-card id="official"></br-card>
<script>
customElements.define('x-note',class extends HTMLElement{connectedCallback(){this.attachShadow({mode:'open'}).innerHTML='<h3 id="shadow-text" style="font-size:13px">Informações locais</h3>'}});
customElements.define('br-card',class extends HTMLElement{connectedCallback(){this.attachShadow({mode:'open'}).innerHTML='<h3 id="internal" style="font-size:13px">Componente</h3>'}});
</script></main></body></html>`;
let server: Server, url: string;
beforeAll(async () => {
  server = createHttpServer((_req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>(done => server.close(() => done())); });
const scan = (extra: Partial<PageScanRequest> = {}) => scanPage({ url, checks: ["tokens"], tokenChecks: ["font"], ...extra }, new PageScanCache(1));
const fontLocators = (result: Awaited<ReturnType<typeof scan>>) => result.observations
  .filter(o => o.kind === "token-font-size-off-scale").map(o => o.element.locator).sort();

describe("A8 — tamanho de fonte no texto autoral", () => {
  it("títulos/texto/DOM aberto autoral geram só observação; herdado, oculto, vazio e interno do DS não", async () => {
    const result = await scan();
    const locators = fontLocators(result);
    expect(locators).toEqual(expect.arrayContaining(["#title", "#paragraph", "#already", "#ordinary >>> #shadow-text"]));
    for (const id of ["correct", "inherited", "hidden", "only-hidden-text", "only-invisible-text", "empty", "separator", "internal"]) expect(locators.some(l => l.includes(`#${id}`))).toBe(false);
    expect(new Set(locators).size).toBe(locators.length);
    expect(result.findings.some(f => ["ds-token-font-size", "ds-token-font-family", "ds-token-color"].includes(f.rule.checker ?? ""))).toBe(false);
    for (const o of result.observations.filter(o => o.kind === "token-font-size-off-scale")) {
      expect(o.data).toMatchObject({ property: "font-size", observed: "13px", authoredDeclarations: expect.any(Array) });
      expect(o.whyNotAFinding).toBeTruthy();
    }
  });

  it("color-only não acrescenta fonte; combinação preserva cor e não duplica observações", async () => {
    const font = await scan();
    const color = await scan({ tokenChecks: ["color"] });
    const both = await scan({ tokenChecks: ["color", "font"] });
    expect(fontLocators(color)).toEqual([]);
    expect(fontLocators(both)).toEqual(fontLocators(font));
    expect(both.findings.filter(f => f.rule.checker === "ds-token-color").map(f => f.element.locator)).toEqual(
      color.findings.filter(f => f.rule.checker === "ds-token-color").map(f => f.element.locator));
  });

  it("seletor explícito mantém escopo; medir tamanho não suprime revisita da família da fonte", async () => {
    const scoped = await scan({ selectors: ["#region"] });
    expect(fontLocators(scoped)).toContain("#title");
    expect(fontLocators(scoped).some(l => l.includes("#ordinary"))).toBe(false);
    for (const tokenChecks of [["font"], ["color", "font"]] as const) {
      const result = await scan({ tokenChecks: [...tokenChecks], revisit: [{ locator: "#title", checker: "ds-token-font-family", fromScan: "S-previous", n: 1 }] });
      expect(result.revisited).toContainEqual(expect.objectContaining({ locator: "#title", checker: "ds-token-font-family", now: "measured" }));
      expect(result.findings).toContainEqual(expect.objectContaining({ rule: expect.objectContaining({ checker: "ds-token-font-family" }), element: expect.objectContaining({ locator: "#title" }) }));
    }
  });

  it("MCP recupera observação pelo mesmo lote; knowledge-free não mede fonte e conserva lock zero", async () => {
    for (const profile of ["evaluation", "knowledge-free"] as const) {
      const events: ToolTelemetryEvent[] = [];
      const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "text-font-")), telemetry: { onEvent: event => events.push(event) } });
      const [a, b] = InMemoryTransport.createLinkedPair(); await srv.connect(b);
      const client = new Client({ name: "text-font", version: "1" }); await client.connect(a);
      const call = async (name: string, args: Record<string, unknown>) => {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).toBeFalsy();
        return JSON.parse((result.content as Array<{ text: string }>)[0].text);
      };
      try {
        const scan = await call("scan_page", { url, maxChars: 100000, ...(profile === "evaluation" ? { checks: ["tokens"], tokenChecks: ["font"] } : {}) });
        const all: Array<Record<string, any>> = [];
        let cursor: number | undefined = 0;
        for (let guard = 0; cursor !== undefined && guard < 20; guard++) {
          const page = await call("get_finding_details", { scanId: scan.scanId, view: "observations", cursor });
          expect(page.scanId).toBe(scan.scanId);
          all.push(...page.observations); cursor = page.nextCursor;
        }
        expect(cursor).toBeUndefined();
        const fonts = all.filter(o => o.kind === "token-font-size-off-scale");
        if (profile === "evaluation") expect(fonts).toContainEqual(expect.objectContaining({ element: expect.objectContaining({ locator: "#title" }), data: expect.objectContaining({ observed: "13px" }) }));
        else {
          expect(fonts).toEqual([]);
          expect(scan).not.toHaveProperty("clauseReserve");
          expect(events.length).toBeGreaterThanOrEqual(2);
          expect(events.every(e => e.knowledgeLockAttempts === 0)).toBe(true);
        }
      } finally { await client.close(); }
    }
  });
});
