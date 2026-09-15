/**
 * The verification gate against a live page (v02, slice 4): what may become `confirmed`, what may
 * not, and how the report binds to the verification the server holds. The fixture carries its
 * defects by construction — every expected verdict is known in advance.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Portão</title>
<style>
  .br-button { border: 0; border-radius: 100em; padding: 0 24px; height: 40px; font-family: Rawline, sans-serif; font-size: 16.8px; color: #ffffff; }
  #cor-arbitraria { background-color: #ff5733; }
  #cor-token { background-color: #1351b4; }
  .par { background-color: #ff5733; }
  .par.conforme { background-color: #1351b4; }
  #link-botao { background-color: #1351b4; display: inline-block; line-height: 40px; }
  #aviso { background-color: #ff5733; color: #ffffff; }
</style>
</head>
<body>
  <main>
    <button id="cor-arbitraria" class="br-button primary" type="button">Arbitrária</button>
    <button id="cor-token" class="br-button primary" type="button">Token</button>
    <button class="br-button primary par" type="button">Par 1</button>
    <button class="br-button primary par conforme" type="button">Par 2</button>
    <a id="link-botao" class="br-button primary" href="#">Link</a>
    <button id="abrir" type="button">Abrir</button>
    <div id="destino"></div>
  </main>
  <script>
    document.getElementById("abrir").addEventListener("click", () => {
      const aviso = document.createElement("p");
      aviso.id = "aviso";
      aviso.textContent = "Aviso";
      document.getElementById("destino").appendChild(aviso);
    });
  </script>
</body>
</html>`;

let httpServer: Server;
let page: string;
let client: Client;

function textOf(result: { content?: unknown }): string {
  return (result.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
}

type Claim = Record<string, unknown>;

function claim(overrides: { rule?: Claim; element?: Claim; evidence?: Claim; [key: string]: unknown } = {}): Claim {
  const { rule, element, evidence, ...rest } = overrides;
  return {
    id: "F-700",
    rule: { id: "ds-token-color", source: "govbr-ds-token", description: "Cores devem usar tokens do DS", ...rule },
    element: { locator: "#cor-arbitraria", page, ...element },
    evidence: {
      observed: "background-color #ff5733",
      expected: "token do DS",
      data: { property: "background-color", observedHex: "#ff5733" },
      ...evidence,
    },
    severity: "moderate",
    nature: "syntactic",
    mode: "display",
    pathway: "heuristic",
    ...rest,
  };
}

async function verify(finding: Claim, extra: Claim = {}) {
  return JSON.parse(
    textOf(await client.callTool({ name: "verify_finding", arguments: { finding, live: true, ...extra } }))
  );
}

beforeAll(async () => {
  httpServer = createHttpServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(FIXTURE_HTML);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  page = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/`;
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-gate-reports-")) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "gate-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await closeBrowser();
  await new Promise((resolve) => httpServer.close(resolve));
});

describe("verify_finding — what can be confirmed", () => {
  it("confirms a supported claim only after recomputing the violation on the live element", async () => {
    const res = await verify(claim());
    expect(res.verification.verdict).toBe("confirmed");
    expect(res.verification.checks).toEqual({ ruleExists: "pass", applicability: "pass", evidenceConsistent: "pass", violation: "verified" });
    expect(res.verification.predicate).toBe("token-color");
    expect(res.verification.binding.elements).toBe(1);
    expect(res.verification.binding.stateFingerprint).toMatch(/^sha256:/);
    expect(res.verificationId).toMatch(/^V-\d{3}$/);
  });

  it("confirms a published structural constraint on the element that breaks it", async () => {
    const res = await verify(
      claim({
        rule: { id: "ds-structure-button-tag", source: "govbr-ds-structure", description: "br-button em <button>" },
        element: { locator: "#link-botao" },
        evidence: { observed: "br-button aplicado a <a>", expected: "<button>", data: {} },
      })
    );
    expect(res.verification.verdict).toBe("confirmed");
    expect(res.verification.predicate).toBe("structure-tag");
  });
});

describe("verify_finding — what is rejected", () => {
  it("rejects when one of the asserted elements does not violate: the claim covers all of them", async () => {
    const res = await verify(claim({ element: { locator: ".par" } }), {});
    expect(res.verification.verdict).toBe("rejected");
    // The conforming sibling does not carry the claimed value, so the claim fails on it before any
    // predicate runs; a claim about a set of elements is judged on each one.
    expect(res.verification.checks.evidenceConsistent).toBe("fail");
    expect(res.verification.binding.elements).toBe(2);
    expect(res.verification.detail).toContain("1 de 2");
  });

  it("rejects a mismatched property: the colour is real, on another property", async () => {
    const res = await verify(claim({ evidence: { data: { property: "color", observedHex: "#ff5733" } } }));
    expect(res.verification.verdict).toBe("rejected");
    expect(res.verification.checks.evidenceConsistent).toBe("pass");
    expect(res.verification.checks.violation).toBe("contradicted");
  });

  it("rejects a real criterion with a wrong observation", async () => {
    const res = await verify(
      claim({
        rule: { id: "wcag-1.4.3", source: "wcag", description: "Contraste mínimo" },
        element: { locator: "#cor-token" },
        evidence: { observed: "fundo #00ff00", expected: "contraste 4.5:1", data: { observedHex: "#00ff00" } },
      })
    );
    expect(res.verification.verdict).toBe("rejected");
    expect(res.verification.checks.ruleExists).toBe("pass");
    expect(res.verification.checks.evidenceConsistent).toBe("fail");
  });

  it("rejects absent evidence: the locator resolves to nothing", async () => {
    const res = await verify(claim({ element: { locator: "#nao-existe" } }));
    expect(res.verification.verdict).toBe("rejected");
    expect(res.verification.checks.evidenceConsistent).toBe("fail");
    expect(res.verification.binding.elements).toBe(0);
  });

  it("rejects the wrong state and confirms the claimed one", async () => {
    const stateful = claim({ element: { locator: "#aviso" } });
    const withoutState = await verify(stateful);
    expect(withoutState.verification.verdict).toBe("rejected");
    expect(withoutState.verification.detail).toContain("actions");

    const actions = [{ action: "click", selector: "#abrir" }, { action: "wait", selector: "#aviso" }];
    const inState = await verify(stateful, { actions });
    expect(inState.verification.verdict).toBe("confirmed");

    const otherState = await verify(stateful, { actions, stateFingerprint: "sha256:outro-estado" });
    expect(otherState.verification.verdict).toBe("rejected");
    expect(otherState.verification.verifiedBy).toBe("state-fingerprint");
  });
});

describe("verify_finding — no predicate, no confirmation", () => {
  it("keeps a real criterion with consistent evidence unverifiable", async () => {
    const res = await verify(
      claim({
        rule: { id: "wcag-1.4.3", source: "wcag", description: "Contraste mínimo" },
        element: { locator: "#cor-token" },
        evidence: { observed: "fundo #1351b4", expected: "contraste 4.5:1", data: { observedHex: "#1351b4" } },
      })
    );
    expect(res.verification.verdict).toBe("unverifiable");
    expect(res.verification.checks).toMatchObject({ evidenceConsistent: "pass", violation: "no-predicate" });
  });

  it("keeps a heuristic claim on a real e-MAG rule unverifiable even though the element is found", async () => {
    const res = await verify(
      claim({
        rule: { id: "emag-3.5", source: "emag", description: "Descrever links" },
        element: { locator: "#link-botao" },
        evidence: { observed: "texto do link é 'Link'", expected: "texto descritivo", data: {} },
        nature: "semantic",
      })
    );
    expect(res.verification.verdict).toBe("unverifiable");
    expect(res.verification.binding.elements).toBe(1);
    expect(res.verification.detail).toContain("localizar não confirma");
  });
});

describe("save_report — the server-held verification decides", () => {
  it("accepts the verified payload, keeps the unverifiable one for review and refuses altered or invented ones", async () => {
    const verified = claim({ id: "F-801" });
    const confirmed = await verify(verified);
    expect(confirmed.verification.verdict).toBe("confirmed");

    const review = claim({
      id: "F-802",
      rule: { id: "emag-3.5", source: "emag", description: "Descrever links" },
      element: { locator: "#link-botao" },
      evidence: { observed: "texto do link é 'Link'", expected: "texto descritivo", data: {} },
    });
    expect((await verify(review)).verification.verdict).toBe("unverifiable");

    const altered = { ...verified, evidence: { ...(verified.evidence as Claim), observed: "alterado depois" }, verification: confirmed.verification };
    const invented = { ...claim({ id: "F-803", element: { locator: "#cor-token" } }), verification: { verdict: "confirmed", verifiedBy: "eu mesmo" } };
    const submittedWithBogusVerdict = { ...verified, verification: { verdict: "rejected", verifiedBy: "ignorado" } };

    const res = JSON.parse(
      textOf(
        await client.callTool({
          name: "save_report",
          arguments: { url: page, findings: [submittedWithBogusVerdict, review, altered, invented] },
        })
      )
    );
    expect(res.accepted).toBe(1);
    expect(res.reviewItems).toBe(1);
    expect(res.rejected.map((r: { index: number }) => r.index)).toEqual([2, 3]);
    expect(res.rejected[0].errors[0]).toContain("alterado");

    const report = JSON.parse(readFileSync(res.jsonPath, "utf8"));
    expect(report.findings[0].verification.verifiedBy).toBe("predicate:token-color");
    expect(report.reviewItems[0].verification.verdict).toBe("unverifiable");
    expect(report.summary.total).toBe(1);
  });
});
