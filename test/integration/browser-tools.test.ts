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
import { PageScanCache, scanPage } from "../../src/scan/pageScan.js";

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
    <a id="link-as-button" class="br-button primary" href="#" role="button">Sou um link</a>
    <button id="btn-icon-only" class="br-button circle primary" type="button"><svg width="16" height="16"><rect width="16" height="16" fill="currentColor"/></svg></button>
    <button id="state-toggle" type="button" aria-expanded="false">Alternar estado</button>
  </main>
  <script>
    // A interação transforma o botão num br-button só-ícone SEM nome acessível: um defeito real
    // (e-MAG 2.2) que só existe depois do clique. Antes do D-27 este teste se apoiava na regra de
    // classe não canônica, que deixou de ser achado por não ter norma — e um teste de detecção
    // dependente de estado não pode se apoiar justamente na verificação sem fundamento.
    document.querySelector('#state-toggle').addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', 'true');
      event.currentTarget.className = 'br-button circle primary unexpected-state-class';
      event.currentTarget.innerHTML = '<svg width="16" height="16"><rect width="16" height="16"/></svg>';
    });
  </script>
</body>
</html>`;

let httpServer: Server;
let baseUrl: string;
let client: Client;
let documentRequests = 0;

function textOf(result: { content?: unknown }): string {
  const content = result.content as { type: string; text: string }[];
  return content.map((c) => c.text).join("\n");
}

beforeAll(async () => {
  httpServer = createHttpServer((req, res) => {
    if (req.headers["sec-fetch-dest"] === "document") documentRequests += 1;
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
      arguments: { url: baseUrl, selectors: [".br-button", "button.br-button"], limit: 1, view: "findings" },
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
      arguments: { scanId: compact.scanId, detail: "full", limit: 200, view: "findings" },
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
      arguments: { url: baseUrl, component: "button", detail: "full", view: "findings" },
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
    const res = await client.callTool({ name: "run_axe_scan", arguments: { url: baseUrl, detail: "full", view: "findings" } });
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

describe("scan_page baseline viewport (2.5.2)", () => {
  it("scans in the requested window, which changes the state fingerprint", async () => {
    const request = { url: baseUrl, selectors: [".br-button"], checks: ["structure" as const], components: ["button"] };
    const cache = new PageScanCache(4);
    const wide = await scanPage({ ...request, viewport: { width: 1280, height: 900 } }, cache);
    const narrow = await scanPage({ ...request, viewport: { width: 320, height: 720 } }, cache);
    expect(narrow.cacheHit).toBe(false);
    expect(narrow.stateFingerprint).not.toBe(wide.stateFingerprint);
    const again = await scanPage({ ...request, viewport: { width: 320, height: 720 } }, cache);
    expect(again.cacheHit).toBe(true);
  });

  it("is not part of the agent-facing scan_page schema", async () => {
    const { tools } = await client.listTools();
    const scan = tools.find((tool) => tool.name === "scan_page");
    expect(Object.keys((scan?.inputSchema as { properties?: object }).properties ?? {})).not.toContain("viewport");
  });
});

describe("scan_page aggregate fast path", () => {
  it("runs selected checks on one state and reuses only an exact fingerprint+scope match", async () => {
    const args = {
      view: "findings",
      url: baseUrl,
      selectors: [".br-button"],
      checks: ["tokens", "structure", "axe"],
      tokenChecks: ["color", "font", "radius"],
      components: ["button"],
      limit: 200,
    };
    const requestsBefore = documentRequests;
    const first = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: args })));
    expect(documentRequests - requestsBefore).toBe(1);
    expect(first.cacheHit).toBe(false);
    expect(first.cacheMissReason).toBe("no-exact-fingerprint-and-scope-match");
    expect(first.stateFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    // 3.4.0 (B8): com seletores, os descendentes das 7 raízes .br-button também são inspecionados.
    expect(first.coverage).toEqual(expect.objectContaining({
      checks: ["axe", "structure", "tokens"],
      selectorScope: "matched-and-descendants",
      componentsRequested: ["button"],
    }));
    expect(first.coverage.elementsInspected).toBeGreaterThan(7);
    expect(first.coverage.axe.engine.name).toBe("axe-core");
    const ruleIds = first.findings.map((finding: { rule: { id: string } }) => finding.rule.id);
    expect(ruleIds).toContain("ds-token-color");
    expect(ruleIds).toContain("ds-structure-button-tag");
    expect(ruleIds).toContain("button-name");

    const second = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: args })));
    expect(second.cacheHit).toBe(true);
    expect(second.cacheMissReason).toBeUndefined();
    expect(second.stateFingerprint).toBe(first.stateFingerprint);
    expect(second.findings.map((finding: { id: string }) => finding.id)).toEqual(
      first.findings.map((finding: { id: string }) => finding.id)
    );

    const ledger = JSON.parse(textOf(await client.callTool({
      name: "get_finding_details",
      arguments: { scanId: second.scanId, limit: 1 },
    })));
    expect(ledger.ledger).toEqual(expect.objectContaining({
      stateFingerprint: first.stateFingerprint,
      cacheHit: true,
    }));

    const changedScope = JSON.parse(textOf(await client.callTool({
      name: "scan_page",
      arguments: { ...args, tokenChecks: ["color"] },
    })));
    expect(changedScope.cacheHit).toBe(false);
    expect(changedScope.cacheMissReason).toBe("no-exact-fingerprint-and-scope-match");
    expect(changedScope.stateFingerprint).toBe(first.stateFingerprint);
  });

  it("reproduces interactions before fingerprinting instead of assuming browser state is shared", async () => {
    const baseArgs = {
      view: "findings",
      url: baseUrl,
      selectors: ["#state-toggle"],
      checks: ["structure"],
      components: ["button"],
    };
    const idle = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: baseArgs })));
    const expanded = JSON.parse(textOf(await client.callTool({
      name: "scan_page",
      arguments: {
        ...baseArgs,
        actions: [{ action: "click", selector: "#state-toggle" }],
        compareToScanId: idle.scanId,
      },
    })));
    expect(expanded.cacheHit).toBe(false);
    expect(expanded.stateFingerprint).not.toBe(idle.stateFingerprint);
    expect(expanded.coverage.actionsApplied).toEqual([
      { action: "click", selector: "#state-toggle" },
    ]);
    expect(expanded.stateDiff).toEqual(expect.objectContaining({
      previousScanId: idle.scanId,
      stateChanged: true,
      // 3.4.0 (B8): o ícone que a interação põe dentro do botão é descendente do escopo e conta.
      elementsInspectedDelta: expect.any(Number),
    }));
    // Revisão da 3.0.0: contagens + poucos ids no cabeçalho; o diff completo por view:"diff".
    expect(expanded.stateDiff.findings).toMatchObject({ added: 1, removed: 0, removedIds: [] });
    expect(expanded.stateDiff.findings.addedIds).toHaveLength(1);
    const diff = JSON.parse(textOf(await client.callTool({ name: "get_finding_details", arguments: { scanId: expanded.scanId, view: "diff" } })));
    expect(diff.changes).toEqual([{ change: "added", id: expanded.stateDiff.findings.addedIds[0] }]);

    // O achado que nasce da interação é fundamentado: cita a norma que aplica (D-27).
    const nascido = expanded.findings.find((f: { rule: { id: string } }) => f.rule.id === "emag-2.2");
    expect(nascido).toBeDefined();
    // A classe não canônica que a interação também introduz sai por fora da pontuação.
    // 3.0.0 (S-03): observações em bloco limitado, contagem por tipo + continuação.
    expect(expanded.observations.byKind["structure-unknown-classes"]).toBeGreaterThan(0);
    expect(expanded.findings.every((f: { rule: { id: string } }) => !/variant/.test(f.rule.id))).toBe(true);

    const repeated = JSON.parse(textOf(await client.callTool({
      name: "scan_page",
      arguments: {
        ...baseArgs,
        actions: [{ action: "click", selector: "#state-toggle" }],
        compareToScanId: idle.scanId,
      },
    })));
    expect(repeated.cacheHit).toBe(true);
    expect(repeated.stateFingerprint).toBe(expanded.stateFingerprint);
  });
});
