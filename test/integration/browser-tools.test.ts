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
 *   V6  #btn-bad-radius       border-radius 6px (off the DS scale)    → check_token_compliance
 * Compliant twins (must produce ZERO findings across ALL checks):
 *   #btn-compliant  real DS primary + Rawline + the pill radius (100em,
 *                   computed by the browser as px × font-size — regression
 *                   guard for the em→px pill false positive)
 *   #btn-danger     status variant defined only in button.css, not in the
 *                   official example HTML — regression guard for the variant
 *                   extraction gap
 */
const FIXTURE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Fixture</title>
<style>
  .br-button { border: 0; border-radius: 100em; padding: 0 24px; height: 40px; cursor: pointer; }
  #btn-compliant { background-color: #1351b4; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; }
  #btn-danger { background-color: #e52207; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; }
  #btn-arbitrary-color { background-color: #ff5733; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; }
  #btn-wrong-font { background-color: #1351b4; color: #ffffff; font-family: "Comic Sans MS", cursive; font-size: 16.8px; }
  #btn-bad-radius { background-color: #ffffff; color: #1351b4; border: 1px solid #1351b4; border-radius: 6px; font-family: Rawline, sans-serif; font-size: 16.8px; }
  #link-as-button { background-color: #1351b4; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; text-decoration: none; display: inline-block; line-height: 40px; }
  #btn-icon-only { background-color: #1351b4; color: #ffffff; font-family: Rawline, sans-serif; font-size: 16.8px; width: 40px; padding: 0; }
</style>
</head>
<body>
  <main>
    <h1 style="font-family: Rawline, sans-serif;">Página de teste</h1>
    <button id="btn-compliant" class="br-button primary" type="button">Conforme</button>
    <button id="btn-danger" class="br-button danger" type="button">Excluir conta</button>
    <button id="btn-arbitrary-color" class="br-button primary" type="button">Cor arbitrária</button>
    <button id="btn-wrong-font" class="br-button primary" type="button">Fonte errada</button>
    <button id="btn-bad-radius" class="br-button secondary" type="button">Raio errado</button>
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

  it("batches selectors and returns only requested style properties", async () => {
    const res = await client.callTool({
      name: "inspect_computed_styles",
      arguments: {
        url: baseUrl,
        selectors: ["#btn-compliant", "#btn-danger"],
        properties: ["backgroundColor"],
      },
    });
    const data = JSON.parse(textOf(res));
    expect(data.count).toBe(2);
    expect(data.selectors).toEqual(["#btn-compliant", "#btn-danger"]);
    expect(data.properties).toEqual(["backgroundColor"]);
    expect(Object.keys(data.elements[0].computed)).toEqual(["backgroundColor"]);
    expect(data.elements[0].focused).toEqual({});
  });
});

describe("check_token_compliance (V1, V2, V6)", () => {
  it("flags exactly the injected token violations, nothing on the compliant twins (ALL checks)", async () => {
    // Deliberately no `checks` filter: the compliant twins must survive every
    // check, including radius — the em-based pill (100em → computed px) used
    // to be a systematic false positive here.
    const res = await client.callTool({
      name: "check_token_compliance",
      arguments: { url: baseUrl, selectors: [".br-button", "button.br-button"], limit: 1 },
    });
    const compact = JSON.parse(textOf(res));
    expect(compact.detail).toBe("summary");
    expect(compact.truncated).toBe(true);
    expect(compact.nextCursor).toBe(1);
    expect(compact.scanId).toMatch(/^S-tokens-/);
    expect(compact.elementsInspected).toBe(7);
    expect(compact.deduplication).toEqual(expect.objectContaining({ merged: 0 }));
    expect(compact.findings[0]).not.toHaveProperty("evidence.data");

    const detailRes = await client.callTool({
      name: "get_finding_details",
      arguments: { scanId: compact.scanId, detail: "full", limit: 200 },
    });
    const data = JSON.parse(textOf(detailRes));
    expect(data.missing).toEqual([]);
    expect(data.detail).toBe("full");
    expect(data.count).toBe(data.total);

    const byLocator = (loc: string) => data.findings.filter((f: { element: { locator: string } }) => f.element.locator === loc);
    expect(byLocator("#btn-compliant")).toEqual([]);
    expect(byLocator("#btn-danger")).toEqual([]);

    const colorFindings = byLocator("#btn-arbitrary-color");
    expect(colorFindings.some((f: { rule: { id: string } }) => f.rule.id === "ds-token-color")).toBe(true);
    const colorFinding = colorFindings.find((f: { rule: { id: string } }) => f.rule.id === "ds-token-color");
    expect(colorFinding.evidence.data.observedHex).toBe("#ff5733");
    expect(colorFinding.evidence.data.nearestToken).toBeTruthy();

    expect(
      byLocator("#btn-wrong-font").some((f: { rule: { id: string } }) => f.rule.id === "ds-token-font-family")
    ).toBe(true);

    // V6: the off-scale radius is flagged — and it is the ONLY finding there
    const radiusFindings = byLocator("#btn-bad-radius");
    expect(radiusFindings.map((f: { rule: { id: string } }) => f.rule.id)).toEqual(["ds-token-radius"]);
    expect(radiusFindings[0].evidence.data.observed).toBe("6px");

    // No pill false positives anywhere: every ds-token-radius finding on this
    // page must be the injected 6px one
    const allRadius = data.findings.filter((f: { rule: { id: string } }) => f.rule.id === "ds-token-radius");
    expect(allRadius.map((f: { element: { locator: string } }) => f.element.locator)).toEqual(["#btn-bad-radius"]);
  });
});

describe("check_component_structure (V3, V4)", () => {
  it("flags the <a class=br-button> and the unlabeled icon-only button", async () => {
    const res = await client.callTool({
      name: "check_component_structure",
      arguments: { url: baseUrl, component: "button", detail: "full" },
    });
    const data = JSON.parse(textOf(res));
    expect(data.componentsFound).toContain("button");

    const ruleIds = data.findings.map((f: { rule: { id: string }; element: { locator: string } }) => `${f.rule.id}@${f.element.locator}`);
    expect(ruleIds).toContain("ds-structure-button-tag@#link-as-button");
    expect(ruleIds).toContain("emag-2.2@#btn-icon-only");
    // The compliant twins produce nothing — including the danger status
    // variant, which only exists in button.css (not in the example HTML)
    expect(data.findings.filter((f: { element: { locator: string } }) => f.element.locator === "#btn-compliant")).toEqual([]);
    expect(data.findings.filter((f: { element: { locator: string } }) => f.element.locator === "#btn-danger")).toEqual([]);
  });
});

describe("run_axe_scan (V4, V5)", () => {
  it("detects button-name and html-has-lang with e-MAG cross-references", async () => {
    const res = await client.callTool({ name: "run_axe_scan", arguments: { url: baseUrl, detail: "full" } });
    const data = JSON.parse(textOf(res));
    expect(data.engine.name).toBe("axe-core");

    const ids = data.findings.map((f: { rule: { id: string } }) => f.rule.id);
    expect(ids).toContain("html-has-lang");
    expect(ids).toContain("button-name");

    const langFinding = data.findings.find((f: { rule: { id: string } }) => f.rule.id === "html-has-lang");
    expect(langFinding.evidence.data.emagId).toBe("3.1");
    expect(langFinding.rule.description).toContain("e-MAG 3.1");
    expect(langFinding.pathway).toBe("deterministic");

    const saved = JSON.parse(
      textOf(
        await client.callTool({
          name: "save_report",
          arguments: { url: baseUrl, finding_ids: data.findings.map((f: { id: string }) => f.id) },
        })
      )
    );
    expect(saved.accepted).toBe(data.findings.length);
    expect(saved.rejected).toEqual([]);
  });
});
