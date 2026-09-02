/**
 * Shadow DOM traversal.
 *
 * Why this suite exists: the gov.br web components (`@govbr-ds/webcomponents`) render everything
 * inside an OPEN shadow root, and a real portal built on them exposed the gap — axe reported the
 * violations inside a component while the DS checkers reported nothing, because
 * `document.querySelectorAll` stops at every shadow boundary. The fixture below places the SAME
 * violation twice, once in the light DOM and once inside a shadow root, so a regression shows up
 * as "found one of the two" instead of a silent zero.
 *
 * The locator is the other half of the contract: a finding is only actionable if the path it
 * carries finds its way back to the element. Hence the round-trip assertion.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { axeLocator } from "../../src/checkers/axe.js";

/**
 * Fixture — the same defect on both sides of a shadow boundary:
 *   light DOM   #campo-luz     .br-input with border-radius 6px (off the DS scale)
 *   shadow DOM  x-campo        the identical .br-input, inside an open shadow root
 * plus an icon-only button with no accessible name inside the shadow root, which axe must find
 * and report with a locator that crosses the boundary.
 */
const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Shadow fixture</title>
<style>
  .br-input { border: 1px solid #1351b4; border-radius: 6px; font-family: Rawline, sans-serif; font-size: 16.8px; }
  .br-button { background-color: #1351b4; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; border-radius: 100em; }
</style>
</head>
<body>
  <main>
    <h1>Fixture de shadow DOM</h1>
    <div id="campo-luz"><input class="br-input" type="text" aria-label="Campo no light DOM"></div>
    <x-campo id="campo-sombra"></x-campo>
  </main>
  <script>
    class XCampo extends HTMLElement {
      connectedCallback() {
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = \`
          <style>
            .br-input { border: 1px solid #1351b4; border-radius: 6px; font-family: Rawline, sans-serif; font-size: 16.8px; }
            .br-button { background-color: #1351b4; color: #ffffff; border-radius: 100em; width: 40px; height: 40px; }
          </style>
          <div class="envolucro">
            <input class="br-input" type="text" aria-label="Campo no shadow DOM">
            <button class="br-button circle" type="button"><svg width="16" height="16"><rect width="16" height="16"/></svg></button>
          </div>\`;
      }
    }
    customElements.define("x-campo", XCampo);
  </script>
</body>
</html>`;

let httpServer: Server;
let baseUrl: string;
let client: Client;

function jsonOf(result: { content?: unknown }): any {
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content.map((c) => c.text).join("\n"));
}

beforeAll(async () => {
  httpServer = createHttpServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(FIXTURE_HTML);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;

  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "shadow-harness", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
}, 60_000);

afterAll(async () => {
  await closeBrowser();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("inspect_computed_styles across shadow boundaries", () => {
  it("finds the element inside the open shadow root and names it with a crossing locator", async () => {
    const evidence = jsonOf(
      await client.callTool({
        name: "inspect_computed_styles",
        arguments: { url: baseUrl, selector: ".br-input", properties: ["borderRadius"] },
      }),
    );

    expect(evidence.count).toBe(2);
    const dentro = evidence.elements.filter((e: any) => e.inShadowDom);
    const fora = evidence.elements.filter((e: any) => !e.inShadowDom);
    expect(fora).toHaveLength(1);
    expect(dentro).toHaveLength(1);
    expect(dentro[0].locator).toContain(">>>");
    expect(dentro[0].locator.split(">>>")[0].trim()).toContain("campo-sombra");
    // Same defect on both sides — the point of the fixture.
    expect(dentro[0].computed.borderRadius).toBe(fora[0].computed.borderRadius);
  }, 60_000);

  it("resolves its own crossing locator back to exactly one element", async () => {
    const primeira = jsonOf(
      await client.callTool({
        name: "inspect_computed_styles",
        arguments: { url: baseUrl, selector: ".br-input", properties: ["borderRadius"] },
      }),
    );
    const alvo = primeira.elements.find((e: any) => e.inShadowDom);

    const round = jsonOf(
      await client.callTool({
        name: "inspect_computed_styles",
        arguments: { url: baseUrl, selector: alvo.locator, properties: ["borderRadius"] },
      }),
    );

    expect(round.count).toBe(1);
    expect(round.elements[0].locator).toBe(alvo.locator);
    expect(round.elements[0].inShadowDom).toBe(true);
  }, 60_000);
});

describe("deterministic checkers inside shadow roots", () => {
  it("check_token_compliance charges the off-scale radius on both sides of the boundary", async () => {
    const result = jsonOf(
      await client.callTool({
        name: "check_token_compliance",
        arguments: { url: baseUrl, selector: ".br-input", checks: ["radius"], detail: "evidence" },
      }),
    );

    const raio = result.findings.filter((f: any) => /radius|raio/i.test(JSON.stringify(f)));
    expect(raio.length).toBe(2);
    expect(raio.some((f: any) => f.element.locator.includes(">>>"))).toBe(true);
  }, 60_000);

  it("run_axe_scan reports the unnamed button inside the shadow root with a crossing locator", async () => {
    const result = jsonOf(
      await client.callTool({ name: "run_axe_scan", arguments: { url: baseUrl, detail: "evidence" } }),
    );

    const semNome = result.findings.find((f: any) => f.rule.id === "button-name");
    expect(semNome).toBeDefined();
    expect(semNome.element.locator).toContain(">>>");
    // The bug this replaces: a comma- or space-joined path that silently matches the wrong node.
    expect(semNome.element.locator).not.toMatch(/,/);
  }, 60_000);
});

describe("axeLocator", () => {
  it("keeps a light-DOM target unchanged", () => {
    expect(axeLocator(["#btn"])).toBe("#btn");
  });

  it("joins a shadow hop with the crossing separator instead of flattening it", () => {
    expect(axeLocator([["x-campo", "button"]])).toBe("x-campo >>> button");
    expect(axeLocator([["x-campo", "button"], "#dentro"])).toBe("x-campo >>> button >>> #dentro");
  });
});
