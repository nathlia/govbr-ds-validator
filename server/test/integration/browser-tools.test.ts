/**
 * End-to-end tests for the browser-backed tools, against a local fixture page
 * with violations injected by construction (the E1 corpus pattern in
 * miniature): every expected detection is known in advance.
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

/**
 * Fixture: a page with known violations —
 *   V1  #btn-arbitrary-color  background #ff5733 (not a DS token)     → check_token_compliance
 *   V2  #btn-wrong-font       font-family Comic Sans                  → check_token_compliance
 *   V3  .br-button as <a>     (#link-as-button)                       → check_component_structure
 *   V4  icon-only button without aria-label (#btn-icon-only)          → check_component_structure + axe (button-name)
 *   V5  <html> without lang                                           → run_axe_scan (html-has-lang → e-MAG 3.1)
 * Compliant twin: #btn-compliant uses the real DS primary + Rawline.
 */
const FIXTURE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Fixture</title>
<style>
  .br-button { border: 0; border-radius: 100em; padding: 0 24px; height: 40px; cursor: pointer; }
  #btn-compliant { background-color: #1351b4; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; }
  #btn-arbitrary-color { background-color: #ff5733; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; }
  #btn-wrong-font { background-color: #1351b4; color: #ffffff; font-family: "Comic Sans MS", cursive; font-size: 16.8px; }
  #link-as-button { background-color: #1351b4; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; text-decoration: none; display: inline-block; line-height: 40px; }
  #btn-icon-only { background-color: #1351b4; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; width: 40px; padding: 0; }
</style>
</head>
<body>
  <main>
    <h1 style="font-family: Rawline, sans-serif;">Página de teste</h1>
    <button id="btn-compliant" class="br-button primary" type="button">Conforme</button>
    <button id="btn-arbitrary-color" class="br-button primary" type="button">Cor arbitrária</button>
    <button id="btn-wrong-font" class="br-button primary" type="button">Fonte errada</button>
    <a id="link-as-button" class="br-button primary" href="#">Sou um link</a>
    <button id="btn-icon-only" class="br-button circle primary" type="button"><svg width="16" height="16"><rect width="16" height="16" fill="currentColor"/></svg></button>
  </main>
</body>
</html>`;

let httpServer: Server;
let baseUrl: string;
let client: Client;

function textOf(result: { content?: unknown }): string {
  const content = result.content as { type: string; text: string }[];
  return content.map((c) => c.text).join("\n");
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
  client = new Client({ name: "e2e-harness", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await closeBrowser();
  await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
});

describe("inspect_computed_styles", () => {
  it("returns computed styles, focus state and stable locators", async () => {
    const res = await client.callTool({ name: "inspect_computed_styles", arguments: { url: baseUrl } });
    const data = JSON.parse(textOf(res));
    expect(data.count).toBeGreaterThanOrEqual(5);
    const compliant = data.elements.find((e: { id: string }) => e.id === "btn-compliant");
    expect(compliant.locator).toBe("#btn-compliant");
    expect(compliant.computed.backgroundColor).toBe("rgb(19, 81, 180)");
    expect(compliant.classes).toContain("br-button");
    expect(compliant.focused).toHaveProperty("outlineColor");
  });
});

describe("check_token_compliance (V1, V2)", () => {
  it("flags exactly the injected token violations, not the compliant twin", async () => {
    const res = await client.callTool({
      name: "check_token_compliance",
      arguments: { url: baseUrl, selector: ".br-button", checks: ["color", "font"] },
    });
    const data = JSON.parse(textOf(res));

    const byLocator = (loc: string) => data.findings.filter((f: { element: { locator: string } }) => f.element.locator === loc);
    expect(byLocator("#btn-compliant")).toEqual([]);

    const colorFindings = byLocator("#btn-arbitrary-color");
    expect(colorFindings.some((f: { rule: { id: string } }) => f.rule.id === "ds-token-color")).toBe(true);
    const colorFinding = colorFindings.find((f: { rule: { id: string } }) => f.rule.id === "ds-token-color");
    expect(colorFinding.evidence.data.observedHex).toBe("#ff5733");
    expect(colorFinding.evidence.data.nearestToken).toBeTruthy();

    expect(
      byLocator("#btn-wrong-font").some((f: { rule: { id: string } }) => f.rule.id === "ds-token-font-family")
    ).toBe(true);
  });
});

describe("check_component_structure (V3, V4)", () => {
  it("flags the <a class=br-button> and the unlabeled icon-only button", async () => {
    const res = await client.callTool({
      name: "check_component_structure",
      arguments: { url: baseUrl, component: "button" },
    });
    const data = JSON.parse(textOf(res));
    expect(data.componentsFound).toContain("button");

    const ruleIds = data.findings.map((f: { rule: { id: string }; element: { locator: string } }) => `${f.rule.id}@${f.element.locator}`);
    expect(ruleIds).toContain("ds-structure-button-tag@#link-as-button");
    expect(ruleIds).toContain("emag-2.2@#btn-icon-only");
    // The compliant twin produces nothing
    expect(data.findings.filter((f: { element: { locator: string } }) => f.element.locator === "#btn-compliant")).toEqual([]);
  });
});

describe("run_axe_scan (V4, V5)", () => {
  it("detects button-name and html-has-lang with e-MAG cross-references", async () => {
    const res = await client.callTool({ name: "run_axe_scan", arguments: { url: baseUrl } });
    const data = JSON.parse(textOf(res));
    expect(data.engine.name).toBe("axe-core");

    const ids = data.findings.map((f: { rule: { id: string } }) => f.rule.id);
    expect(ids).toContain("html-has-lang");
    expect(ids).toContain("button-name");

    const langFinding = data.findings.find((f: { rule: { id: string } }) => f.rule.id === "html-has-lang");
    expect(langFinding.evidence.data.emagId).toBe("3.1");
    expect(langFinding.rule.description).toContain("e-MAG 3.1");
    expect(langFinding.pathway).toBe("deterministic");
  });
});
