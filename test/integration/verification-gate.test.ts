import { MESSAGES } from "../../src/responses/contract.js";
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
import { EXPECTED_CONDITIONS } from "../../src/schema/structuredClaims.js";
import { ABSENCE_NOTE } from "../../src/responses/absence.js";

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Portão</title>
<style>
  .br-button { border: 0; border-radius: 100em; padding: 0 24px; height: 40px; font-family: Rawline, sans-serif; font-size: 16.8px; color: #ffffff; }
  #cor-arbitraria { background-color: #ff5733; }
  #cor-token { background-color: #1351b4; }
  #raio-13 { border-radius: 13px; }
  #fonte-arial { font-family: Arial, sans-serif; }
  #padding-13 { padding: 13px; }
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
    <button id="raio-13" class="br-button primary" type="button">Raio</button>
    <button id="fonte-arial" class="br-button primary" type="button">Fonte</button>
    <button id="padding-13" class="br-button primary" type="button">Espaçamento</button>
    <button class="br-button primary par" type="button">Par 1</button>
    <button class="br-button primary par conforme" type="button">Par 2</button>
    <a id="link-botao" class="br-button primary" href="#" role="button">Link</a>
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
      data: { property: "background-color", observedHex: "#ff5733", expectedCondition: EXPECTED_CONDITIONS.tokenColor },
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

function supportedStructuredClaims() {
  return [
    {
      name: "radius",
      correct: claim({
        rule: { id: "ds-token-radius", source: "govbr-ds-token", description: "Raio na escala do DS" },
        element: { locator: "#raio-13" },
        evidence: { observed: "border-radius 13px", expected: "escala do DS", data: { property: "border-radius", observed: "13px", expectedCondition: EXPECTED_CONDITIONS.tokenRadius } },
      }),
      falseClaim: { property: "border-radius", observed: "99px", expectedCondition: EXPECTED_CONDITIONS.tokenRadius },
    },
    {
      name: "font family",
      correct: claim({
        rule: { id: "ds-token-font-family", source: "govbr-ds-token", description: "Fonte da família do DS" },
        element: { locator: "#fonte-arial" },
        evidence: { observed: "font-family Arial", expected: "Rawline/Raleway", data: { property: "font-family", observed: "Arial, sans-serif", expectedCondition: EXPECTED_CONDITIONS.tokenFontFamily } },
      }),
      falseClaim: { property: "font-family", observed: "Comic Sans MS", expectedCondition: EXPECTED_CONDITIONS.tokenFontFamily },
    },
    {
      name: "spacing",
      correct: claim({
        rule: { id: "ds-token-spacing", source: "govbr-ds-token", description: "Espaçamento na escala do DS" },
        element: { locator: "#padding-13" },
        evidence: { observed: "padding 13px", expected: "escala do DS", data: { property: "padding", observed: "13px", expectedCondition: EXPECTED_CONDITIONS.tokenSpacing } },
      }),
      falseClaim: { property: "padding", observed: "17px", expectedCondition: EXPECTED_CONDITIONS.tokenSpacing },
    },
    {
      name: "structure tag",
      correct: claim({
        rule: { id: "ds-structure-button-tag", source: "govbr-ds-structure", description: "br-button em <button>" },
        element: { locator: "#link-botao" },
        evidence: { observed: "br-button aplicado a <a>", expected: "<button>", data: { component: "button", observedTag: "a", expectedCondition: EXPECTED_CONDITIONS.structureTag } },
      }),
      falseClaim: { component: "button", observedTag: "div", expectedCondition: EXPECTED_CONDITIONS.structureTag },
    },
  ];
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
        evidence: { observed: "br-button aplicado a <a>", expected: "<button>", data: { component: "button", observedTag: "a", expectedCondition: EXPECTED_CONDITIONS.structureTag } },
      })
    );
    expect(res.verification.verdict).toBe("confirmed");
    expect(res.verification.predicate).toBe("structure-tag");
  });

  it("confirms radius, font, spacing and structure only when structured observations match live values", async () => {
    for (const entry of supportedStructuredClaims()) {
      const res = await verify(entry.correct);
      expect(res.verification.verdict, entry.name).toBe("confirmed");
      expect(res.verification.checks.evidenceConsistent, entry.name).toBe("pass");
      expect(res.verification.checks.violation, entry.name).toBe("verified");
    }
  });
});

describe("verify_finding — what is rejected", () => {
  it("a broad locator (one element violates, its sibling does not) is ambiguous: unverifiable + fix-locator, never confirmed (3.3.0, S-04)", async () => {
    const res = await verify(claim({ element: { locator: ".par" } }), {});
    expect(res.verification.verdict).toBe("unverifiable");
    expect(res.verification.issue).toBe("locator-ambiguous");
    expect(res.reasons[0].code).toBe("locator-ambiguous");
    expect(res.actions[0].action).toBe("fix-locator");
    expect(res.observation.status).toBe("not-evaluated");
    expect(res.verification.binding.elements).toBe(2);
    expect(res.verification.detail).toContain("falta em 1");
  });

  it("rejects a mismatched property: the colour is real, on another property", async () => {
    const res = await verify(claim({ evidence: { data: { property: "color", observedHex: "#ff5733", expectedCondition: EXPECTED_CONDITIONS.tokenColor } } }));
    expect(res.verification.verdict).toBe("rejected");
    expect(res.verification.checks.evidenceConsistent).toBe("fail");
  });

  it("rejects false structured radius, font, spacing and tag values even when a real violation exists", async () => {
    for (const entry of supportedStructuredClaims()) {
      const correctEvidence = entry.correct.evidence as Claim;
      const res = await verify({
        ...entry.correct,
        evidence: { ...correctEvidence, data: entry.falseClaim },
      });
      expect(res.verification.verdict, entry.name).toBe("rejected");
      expect(res.verification.checks.evidenceConsistent, entry.name).toBe("fail");
      expect(res.verification.detail, entry.name).toMatch(/viv[oa]/);
    }
  });

  it("an unsupported expected condition never confirms: unverifiable + fix-evidence-data (3.3.0, S-04)", async () => {
    for (const entry of supportedStructuredClaims()) {
      const correctEvidence = entry.correct.evidence as Claim;
      const correctData = correctEvidence.data as Claim;
      const res = await verify({
        ...entry.correct,
        evidence: { ...correctEvidence, data: { ...correctData, expectedCondition: "outra-condicao" } },
      });
      expect(res.verification.verdict, entry.name).toBe("unverifiable");
      expect(res.verification.issue, entry.name).toBe("evidence-inconsistent");
      expect(res.actions[0].action, entry.name).toBe("fix-evidence-data");
    }
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

  it("a locator that resolves to nothing is a state limitation, not counter-evidence: unverifiable (3.3.0, S-04)", async () => {
    const res = await verify(claim({ element: { locator: "#nao-existe" } }));
    expect(res.verification.verdict).toBe("unverifiable");
    expect(res.verification.issue).toBe("locator-no-elements");
    expect(res.actions[0].action).toBe("reproduce-state");
    expect(res.verification.binding.elements).toBe(0);
  });

  it("absent evidence in the wrong state is unverifiable (not rejected), the claimed state confirms, an unreproduced claimed state stays unverifiable", async () => {
    const stateful = claim({ element: { locator: "#aviso" } });
    const withoutState = await verify(stateful);
    expect(withoutState.verification.verdict).toBe("unverifiable");
    expect(withoutState.verification.detail).toContain("actions");

    const actions = [{ action: "click", selector: "#abrir" }, { action: "wait", selector: "#aviso" }];
    const inState = await verify(stateful, { actions });
    expect(inState.verification.verdict).toBe("confirmed");

    // 2.10.0: a claimed state that the replay does not reproduce is a limitation, not evidence against the finding.
    const otherState = await verify(stateful, { actions, stateFingerprint: "sha256:outro-estado" });
    expect(otherState.verification.verdict).toBe("unverifiable");
    expect(otherState.verification.verifiedBy).toBe("state-fingerprint");
    expect(otherState.verification.binding.state.limitation.kind).toBe("state-not-reproduced");
  });
});

describe("verify_finding — no predicate, no confirmation", () => {
  it("keeps supported claims without their structured observation unverifiable", async () => {
    for (const entry of supportedStructuredClaims()) {
      const correctEvidence = entry.correct.evidence as Claim;
      const res = await verify({ ...entry.correct, evidence: { ...correctEvidence, data: {} } });
      expect(res.verification.verdict, entry.name).toBe("unverifiable");
      expect(res.verification.predicate, entry.name).toBeNull();
      expect(res.verification.checks.violation, entry.name).toBe("no-predicate");
      expect(res.verification.checks.evidenceConsistent, entry.name).toBe("unknown");
    }
  });

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

describe("verify_finding — page constraints (2.7.0)", () => {
  // The fixture has no .br-header, no .br-footer, and its first link is href="#": all three page claims are true.
  it("confirms a missing Template Base region by recomputing it on the document, not on an element", async () => {
    const res = await verify(
      claim({
        rule: { id: "ds-page-footer", source: "govbr-ds-page", description: "Área de Rodapé obrigatória" },
        element: { locator: "html" },
        evidence: { observed: "nenhum .br-footer", expected: "Footer", data: { region: "footer", observedCount: 0, expectedCondition: EXPECTED_CONDITIONS.pageRegion } },
      })
    );
    expect(res.verification.verdict).toBe("confirmed");
    expect(res.verification.predicate).toBe("page-region");
    expect(res.verification.checks).toEqual({ ruleExists: "pass", applicability: "pass", evidenceConsistent: "pass", violation: "verified" });
  });

  it("confirms that the first link is not the skip to content (e-MAG 1.5)", async () => {
    const res = await verify(
      claim({
        rule: { id: "ds-page-skip-link", source: "govbr-ds-page", description: "Salto para o conteúdo" },
        element: { locator: "html" },
        evidence: { observed: 'primeiro link href="#"', expected: "âncora interna com alvo", data: { region: "skip-link", firstLinkHref: "#", expectedCondition: EXPECTED_CONDITIONS.skipLink } },
      })
    );
    expect(res.verification.verdict).toBe("confirmed");
    expect(res.verification.predicate).toBe("page-skip-link");
  });

  it("rejects a page claim whose structured count contradicts the document", async () => {
    const res = await verify(
      claim({
        rule: { id: "ds-page-header", source: "govbr-ds-page", description: "Área de Cabeçalho obrigatória" },
        element: { locator: "html" },
        evidence: { observed: "um .br-header fora do lugar", expected: "Header", data: { region: "header", observedCount: 1, expectedCondition: EXPECTED_CONDITIONS.pageRegion } },
      })
    );
    expect(res.verification.verdict).toBe("rejected");
    expect(res.verification.checks.evidenceConsistent).toBe("fail");
  });

  it("keeps a page claim without structured data unverifiable, and page prose without id unverifiable too", async () => {
    const semDados = await verify(
      claim({
        rule: { id: "ds-page-header", source: "govbr-ds-page", description: "Área de Cabeçalho obrigatória" },
        element: { locator: "html" },
        evidence: { observed: "não há cabeçalho", expected: "Header", data: {} },
      })
    );
    expect(semDados.verification.verdict).toBe("unverifiable");
    expect(semDados.verification.checks.ruleExists).toBe("pass");
    expect(semDados.verification.checks.violation).toBe("no-predicate");

    const prosa = await verify(
      claim({
        rule: { id: "page_structure-breadcrumb-primeiro", source: "govbr-ds-page", description: "Breadcrumb deve ser o primeiro conteúdo" },
        element: { locator: "main" },
        evidence: { observed: "sem breadcrumb", expected: "breadcrumb primeiro", data: {} },
      })
    );
    expect(prosa.verification.verdict).toBe("unverifiable");
    expect(prosa.verification.checks.ruleExists).toBe("unknown");
    expect(prosa.verification.detail).toContain("ds-page-header");
  });

  it("scan_page runs the page check by default and reports the three constraints on this fixture", async () => {
    const text = textOf(await client.callTool({ name: "scan_page", arguments: { url: page, checks: ["page"] } }));
    const res = JSON.parse(text);
    expect(res.coverage.checks).toEqual(["page"]);
    for (const id of ["ds-page-header", "ds-page-footer", "ds-page-skip-link"]) expect(text, id).toContain(id);
    const byDefault = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: { url: page } })));
    expect(byDefault.coverage.checks).toContain("page");
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

describe("verify_finding — D-27 decided on the server (2.15.0)", () => {
  /** O achado como o agente o reescreve a partir do scan: sem `implements` (tela A, ensaio 03). */
  function withoutImplements(finding: Record<string, any>): Record<string, any> {
    const { implements: _dropped, ...rule } = finding.rule;
    return { ...finding, rule };
  }

  it("scan → verify round trip: the scanner's own findings confirm without implements in the payload", async () => {
    const scan = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: { url: page, view: "findings", detail: "full", limit: 100, maxChars: 100_000 } })));
    // 3.6.0: os achados de estrutura e página citam a norma (rule.id KB) e nomeiam o check em rule.checker.
    const own = (scan.findings as Array<Record<string, any>>).filter((f) => /^ds-(structure|page)-/.test(f.rule.checker ?? ""));
    const ids = own.map((f) => f.rule.checker);
    expect(ids).toEqual(expect.arrayContaining(["ds-structure-button-tag", "ds-page-header", "ds-page-footer", "ds-page-skip-link"]));
    for (const finding of own) {
      expect(finding.rule.source, finding.rule.checker).toBe("govbr-ds-kb");
      expect(finding.rule.id, finding.rule.checker).toMatch(/^govbr-3.7.0-/);
      expect(finding.rule.implements?.length, finding.rule.id).toBeGreaterThan(0);
      const res = await verify(withoutImplements(finding), { live: true, scanId: scan.scanId });
      expect(res.verification.verdict, finding.rule.id).toBe("confirmed");
      expect(res.verification.detail, finding.rule.id).toContain("Norma resolvida pelo servidor");
      expect(res.absenceNote, finding.rule.id).toBeUndefined();
    }
  });

  it("controls without implements never confirm: invented id, forged payload, corrected fact, unreached state", async () => {
    const scan = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: { url: page, view: "findings", detail: "full", limit: 100, maxChars: 100_000 } })));
    const tag = withoutImplements((scan.findings as Array<Record<string, any>>).find((f) => f.rule.checker === "ds-structure-button-tag")!);
    const footer = withoutImplements((scan.findings as Array<Record<string, any>>).find((f) => f.rule.checker === "ds-page-footer")!);

    // Id de regra inventado na mesma forma: não existe → rejected.
    const invented = await verify({ ...tag, rule: { ...tag.rule, id: "ds-structure-botaozao-tag" } }, { live: true, scanId: scan.scanId });
    expect(invented.verification.verdict).toBe("rejected");
    expect(invented.verification.checks.ruleExists).toBe("fail");
    const inventedPage = await verify({ ...footer, rule: { ...footer.rule, id: "ds-page-banner" } }, { live: true, scanId: scan.scanId });
    expect(inventedPage.verification.verdict).not.toBe("confirmed");

    // Payload forjado: dado estruturado que o documento contradiz → rejected.
    const forgedTag = await verify({ ...tag, evidence: { ...tag.evidence, data: { ...tag.evidence.data, observedTag: "div" } } }, { live: true, scanId: scan.scanId });
    expect(forgedTag.verification.verdict).toBe("rejected");
    const forgedFooter = await verify({ ...footer, evidence: { ...footer.evidence, data: { ...footer.evidence.data, observedCount: 3 } } }, { live: true, scanId: scan.scanId });
    expect(forgedFooter.verification.verdict).toBe("rejected");

    // Fato corrigido: a mesma alegação sobre um elemento conforme (br-button em <button>) → contradicted.
    const corrected = await verify({ ...tag, element: { ...tag.element, locator: "#cor-token" } }, { live: true });
    expect(corrected.verification.verdict).toBe("rejected");
    expect(corrected.verification.checks.violation === "contradicted" || corrected.verification.checks.evidenceConsistent === "fail").toBe(true);

    // Estado não alcançado: a receita não reproduz → nunca confirmed (limitação, unverifiable).
    const unreached = await verify(tag, { live: true, actions: [{ action: "click", selector: "#nao-existe" }] });
    expect(unreached.verification.verdict).toBe("unverifiable");
    expect(unreached.verification.binding.state.reached).toBe(false);
    // Fingerprint de outro estado: idem.
    const otherState = await verify(tag, { live: true, stateFingerprint: "sha256:outro-estado" });
    expect(otherState.verification.verdict).toBe("unverifiable");
  });

  it("the summary and evidence projections the agent reads carry the cited norm (implements only when it adds to rule.id)", async () => {
    for (const detail of ["summary", "evidence"]) {
      const scan = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: { url: page, checks: ["structure", "page"], view: "findings", detail, maxChars: 100_000 } })));
      const tag = (scan.findings as Array<Record<string, any>>).find((f) => f.rule.checker === "ds-structure-button-tag");
      // 3.6.0: <button> trocado cita o e-MAG 1.2; implements = [rule.id] não se repete na projeção.
      expect(tag?.rule.id, detail).toBe("govbr-3.7.0-accessibility-global-7c91abad32ce");
      expect(tag?.rule.implements, detail).toBeUndefined();
    }
    const families = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: { url: page, checks: ["page"] } })));
    const footer = (families.families as Array<Record<string, any>>).find((f) => f.rule.checker === "ds-page-footer");
    // 3.6.1: cita a área de rodapé obrigatória (unidade literal); o excerto herdado vem em implements como contexto.
    expect(footer?.rule.id).toBe("govbr-3.7.0-template-global-79cf9ea963ee");
    expect(footer?.rule.implements).toEqual(["govbr-3.7.0-template-global-79cf9ea963ee", "govbr-3.7.0-template-global-19f93475dc5e"]);
    // 3.4.4 (C1): a norma do exemplo é a da família — não se repete no exemplo.
    expect(footer?.example.rule).toBeUndefined();
  });

  it("a payload implements that differs is ignored, not trusted: the server's grounding decides", async () => {
    const res = await verify(
      claim({
        rule: { id: "ds-structure-button-tag", source: "govbr-ds-structure", description: "br-button em <button>", implements: ["govbr-inexistente"] },
        element: { locator: "#link-botao" },
        evidence: { observed: "br-button aplicado a <a>", expected: "<button>", data: { component: "button", observedTag: "a", expectedCondition: EXPECTED_CONDITIONS.structureTag } },
        pathway: "deterministic",
      }),
      { live: true }
    );
    expect(res.verification.verdict).toBe("confirmed");
    expect(res.verification.detail).toContain("foi ignorado");
  });

  it("a published check without a norm (ds-token-font-size) is unverifiable with next, never rejected nor confirmed", async () => {
    const res = await verify(
      claim({
        rule: { id: "ds-token-font-size", source: "govbr-ds-token", description: "Escala tipográfica" },
        element: { locator: "#cor-arbitraria" },
        evidence: { observed: "font-size 16.8px", expected: "escala", data: { property: "font-size", observed: "16.8px" } },
        pathway: "deterministic",
      }),
      { live: true }
    );
    expect(res.verification.verdict).toBe("unverifiable");
    expect(res.verification.checks.applicability).toBe("unknown");
    // 3.4.4 (C7): a escala tipográfica tem norma na base, que o oráculo não decide por máquina — o próximo passo a nomeia.
    expect(res.verification.next).toContain("govbr-3.7.0-foundation-global-21fb08664799");
    expect(res.verification.detail).toContain("Há norma na base sobre o assunto");
    expect(res.absenceNote).toBe(ABSENCE_NOTE);
  });
});

describe("silence is not conformance (2.15.0)", () => {
  it("empty or silent answers carry the fixed absence note", async () => {
    const call = async (name: string, args: Record<string, unknown>) => JSON.parse(textOf(await client.callTool({ name, arguments: args })));
    expect((await call("get_ds_rules", { component: "pagination", query: "aria-current" })).absenceNote).toBe(ABSENCE_NOTE);
    expect((await call("get_ds_rules", { id: "govbr-nao-existe" })).absenceNote).toBe(ABSENCE_NOTE);
    expect((await call("get_ds_rules", { ids: ["govbr-nao-existe"] })).absenceNote).toBe(ABSENCE_NOTE);
    expect((await call("get_emag_rules", { id: "9.9" })).absenceNote).toBe(ABSENCE_NOTE);
    expect((await call("get_component_spec", { component: "pagination" })).absenceNote).toBe(ABSENCE_NOTE);
    expect((await call("get_component_spec", { component: "nao-existe" })).absenceNote).toBe(ABSENCE_NOTE);
    // Resposta com resultado não leva a nota.
    expect((await call("get_ds_rules", { component: "button" })).absenceNote).toBeUndefined();
    expect((await call("get_emag_rules", { id: "1.5" })).absenceNote).toBeUndefined();
  });

  it("without live, no verdict is contradicted: a counter-fact has to be measured", async () => {
    const res = await verify(
      claim({
        rule: { id: "ds-structure-button-tag", source: "govbr-ds-structure", description: "br-button em <button>" },
        element: { locator: "#cor-token" },
        evidence: { observed: "br-button aplicado a <a>", expected: "<button>", data: { component: "button", observedTag: "a", expectedCondition: EXPECTED_CONDITIONS.structureTag } },
      }),
      { live: false }
    );
    expect(res.verification.checks.violation).not.toBe("contradicted");
    expect(res.verification.verdict).toBe("unverifiable");
    expect(res.absenceNote).toBe(ABSENCE_NOTE);
  });
});

describe("scan_page.checksRun (3.0.0; checksOmitted da 2.15.0)", () => {
  it("lists, in this state, the checks that did not run and what was left unmeasured — always, with fixed limits and the exact completing call", async () => {
    const narrowed = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: { url: page, checks: ["axe", "structure"] } })));
    expect(narrowed.checksRun.executed.map((i: { check: string }) => i.check)).toEqual(["axe", "structure"]);
    expect(narrowed.checksRun.omitted.map((i: { check: string }) => i.check)).toEqual(["tokens", "page"]);
    expect(narrowed.checksRun.omitted[0].why).toContain("tokens");
    expect(narrowed.checksRun.completeOmitted).toEqual({ tool: "scan_page", arguments: { url: page, checks: ["tokens", "page"] } });
    expect(narrowed.checksRun.coverageNote).toBe(MESSAGES["scan-coverage"]);
    expect(narrowed.checksRun.limits.map((l: { code: string }) => l.code)).toEqual(expect.arrayContaining(["no-state-semantics", "single-state"]));
    const sub = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: { url: page, checks: ["tokens"], tokenChecks: ["font"], components: ["button"] } })));
    expect(sub.checksRun.omitted.map((i: { check: string }) => i.check)).toEqual(["structure", "axe", "page", "tokens.color", "tokens.radius", "tokens.spacing"]);
    const full = JSON.parse(textOf(await client.callTool({ name: "scan_page", arguments: { url: page } })));
    expect(full.checksRun.omitted).toEqual([]);
    expect(full.checksRun.completeOmitted).toBeNull();
    expect(full.checksRun.limits.length).toBeGreaterThan(0);
    expect(full.absenceNote).toBe(ABSENCE_NOTE);
  });
});
