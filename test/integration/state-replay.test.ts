/**
 * Replay comprovado de estados (2.10.0, NAT-82).
 *
 * Página sintética e neutra — nenhum nome, seletor ou estado vem de tela do corpus. Ela tem um
 * diálogo fechado no carregamento, dois botões com a mesma classe, um controle que expande, um campo
 * que mostra erro, um componente com shadow root ABERTO cujo conteúdo o servidor pode trocar sem
 * tocar no HTML do documento, e um componente com shadow root FECHADO e um botão dentro.
 *
 * O que se prova: o estado só conta como alcançado depois de medido; seletor com dois alvos é erro
 * tipado (nunca o primeiro); erro de receita é limitação, não "sem defeito"; carga idêntica reusa o
 * cache e mudança real (inclusive só dentro de um shadow root) não; URL/janela/fingerprint diferentes
 * deixam a alegação sem verificação (limitação, nunca rejeição); o fingerprint é tirado depois de a
 * página assentar, então um diálogo cujo `.show` chega por setTimeout é o mesmo estado no scan e na
 * reprodução; o mesmo pedido dá o mesmo resultado a qualquer cliente.
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
import { PageScanCache, scanPage, type PageScanResult, type PageScanUnreached } from "../../src/scan/pageScan.js";
import { ScanStateMisuseError, verifyFinding } from "../../src/verify/gate.js";
import { STATE_IDENTITY_POLICY, FROZEN_DESKTOP_VIEWPORT } from "../../src/scan/state.js";
import { EXPECTED_CONDITIONS } from "../../src/schema/structuredClaims.js";
import type { Finding } from "../../src/schema/finding.js";

let documentVersion = 1;
let shadowVersion = 1;

function fixture(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Estados</title>
<style>
  .br-button { border: 0; border-radius: 100em; padding: 0 24px; height: 40px; font-family: Rawline, sans-serif; font-size: 16.8px; color: #ffffff; background-color: #1351b4; }
  #acao-dialogo, #acao-lento { background-color: #ff5733; }
  #dialogo-lento { opacity: 0; transition: opacity 200ms linear; }
  #dialogo-lento.show { opacity: 1; }
  [hidden] { display: none; }
</style>
</head>
<body>
  <main>
    <p id="versao">versão ${documentVersion}</p>
    <button id="primeiro" class="br-button primary" type="button">Primeiro</button>
    <button id="abrir" class="br-button primary" type="button">Abrir diálogo</button>
    <button class="br-button primary duplicado" type="button">Igual A</button>
    <button class="br-button primary duplicado" type="button">Igual B</button>
    <button id="expandir" class="br-button primary" type="button" aria-expanded="false" aria-controls="painel">Mais</button>
    <div id="painel" hidden>Conteúdo</div>
    <label for="campo">Campo</label>
    <input id="campo" name="campo" type="text">
    <button id="enviar" class="br-button primary" type="button">Enviar</button>
    <p id="erro" role="alert"></p>
    <caixa-aberta id="aberta"></caixa-aberta>
    <caixa-fechada id="fechada"></caixa-fechada>
    <div id="dialogo" role="dialog" aria-modal="true" aria-labelledby="titulo-dialogo" hidden>
      <h2 id="titulo-dialogo">Diálogo</h2>
      <button id="acao-dialogo" class="br-button primary" type="button">Confirmar</button>
    </div>
    <button id="abrir-lento" class="br-button primary" type="button">Abrir diálogo lento</button>
    <div id="dialogo-lento" role="dialog" aria-labelledby="titulo-lento" hidden>
      <h2 id="titulo-lento">Diálogo lento</h2>
      <button id="acao-lento" class="br-button primary" type="button">Continuar</button>
    </div>
  </main>
  <script>
    customElements.define("caixa-aberta", class extends HTMLElement {
      connectedCallback() {
        this.attachShadow({ mode: "open" }).innerHTML = '<span class="interno">sombra ${shadowVersion}</span><button type="button">Interno</button>';
      }
    });
    customElements.define("caixa-fechada", class extends HTMLElement {
      connectedCallback() {
        this.attachShadow({ mode: "closed" }).innerHTML = '<button type="button" style="width:120px;height:40px">Fechado</button>';
      }
    });
    // Valores que um framework sorteia a cada carga (state-identity-1 os renomeia de forma consistente).
    const lista = document.createElement("ul");
    // Como o br-select do @govbr-ds/core 3.x: lista .br-list com role=listbox e id sorteado.
    lista.className = "br-list";
    lista.setAttribute("role", "listbox");
    lista.id = "list-" + Math.floor(Math.random() * 10000);
    document.getElementById("campo").setAttribute("aria-controls", lista.id);
    document.querySelector("main").appendChild(lista);
    document.getElementById("versao").setAttribute("_ngcontent-" + "abcdefghij".split("").sort(() => Math.random() - 0.5).slice(0, 3).join("") + "-c4", "");
    document.getElementById("abrir").addEventListener("click", () => {
      document.getElementById("dialogo").hidden = false;
      document.getElementById("acao-dialogo").focus();
    });
    // Como o modal do DS: o diálogo aparece já, a classe .show chega depois (setTimeout) e dispara
    // uma transição de opacidade. Sem esperar o assentamento, o fingerprint pegaria um ponto qualquer.
    document.getElementById("abrir-lento").addEventListener("click", () => {
      const dialogo = document.getElementById("dialogo-lento");
      dialogo.hidden = false;
      setTimeout(() => dialogo.classList.add("show"), 150);
    });
    document.getElementById("expandir").addEventListener("click", (event) => {
      const open = event.currentTarget.getAttribute("aria-expanded") !== "true";
      event.currentTarget.setAttribute("aria-expanded", String(open));
      document.getElementById("painel").hidden = !open;
    });
    document.getElementById("enviar").addEventListener("click", () => {
      const campo = document.getElementById("campo");
      if (campo.value.length < 5) {
        campo.setAttribute("aria-invalid", "true");
        document.getElementById("erro").textContent = "Informe ao menos 5 caracteres.";
      }
    });
  </script>
</body>
</html>`;
}

let httpServer: Server;
let page: string;
let client: Client;

function textOf(result: { content?: unknown }): string {
  return (result.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
}

async function connect(name: string, toolProfile?: "full" | "evaluation"): Promise<Client> {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-state-")), ...(toolProfile ? { toolProfile } : {}) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name, version: "1.0.0" });
  await server.connect(serverTransport);
  await c.connect(clientTransport);
  return c;
}

async function call(c: Client, name: string, args: Record<string, unknown>) {
  const result = await c.callTool({ name, arguments: args });
  return { isError: Boolean(result.isError), data: JSON.parse(textOf(result)) };
}

const STRUCTURE = { checks: ["structure" as const], components: ["button"] };

function colorClaim(locator: string, pageUrl = page): Finding {
  return {
    id: "F-900",
    rule: { id: "ds-token-color", source: "govbr-ds-token", description: "Cores devem usar tokens do DS" },
    element: { locator, page: pageUrl },
    evidence: {
      observed: "background-color #ff5733",
      expected: "token do DS",
      data: { property: "background-color", observedHex: "#ff5733", expectedCondition: EXPECTED_CONDITIONS.tokenColor },
    },
    severity: "moderate",
    nature: "syntactic",
    mode: "display",
    pathway: "heuristic",
  } as Finding;
}

beforeAll(async () => {
  httpServer = createHttpServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fixture());
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  page = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/`;
  client = await connect("state-test", "evaluation");
});

afterAll(async () => {
  await client.close();
  await closeBrowser();
  await new Promise((resolve) => httpServer.close(resolve));
});

describe("arrival: a state counts only after it is measured", () => {
  it("a dialog closed at load is not reached without the recipe that opens it", async () => {
    const cache = new PageScanCache(8);
    const without = (await scanPage({ url: page, ...STRUCTURE, arrival: { dialogOpen: true } }, cache)) as PageScanUnreached;
    expect(without.status).toBe("state-not-reached");
    expect(without.stateFingerprint).toBeNull();
    expect(without.limitation.kind).toBe("arrival-not-met");
    expect(without).not.toHaveProperty("findings");
    expect(without).not.toHaveProperty("coverage");
    expect(without.state.arrival.conditions).toEqual([
      { condition: "dialogOpen", expected: true, observed: false, satisfied: false },
    ]);
    expect(without.state.observed.dialogs).toEqual([]);

    const opened = (await scanPage(
      { url: page, ...STRUCTURE, actions: [{ action: "click", selector: "#abrir" }], arrival: { dialogOpen: true, focused: "#acao-dialogo" } },
      cache
    )) as PageScanResult;
    expect(opened.status).toBe("scanned");
    expect(opened.state.reached).toBe(true);
    expect(opened.state.arrival.status).toBe("reached");
    expect(opened.state.observed.dialogs).toEqual([{ locator: "#dialogo", role: "dialog", modal: true }]);
    expect(opened.state.observed.focus).toEqual({ locator: "#acao-dialogo", tag: "button", inShadow: false, interior: "observed" });
    expect(opened.state.replay).toEqual({ status: "applied", steps: [{ index: 0, action: "click", selector: "#abrir", matched: 1 }] });
    expect(opened.state.policy).toBe(STATE_IDENTITY_POLICY);
    expect(opened.state.recipe).toEqual({
      url: page,
      viewport: FROZEN_DESKTOP_VIEWPORT,
      viewportSource: "frozen-desktop",
      actions: [{ action: "click", selector: "#abrir" }],
      arrival: { dialogOpen: true, focused: "#acao-dialogo" },
    });
    expect(opened.state.observed.viewport).toEqual({ ...FROZEN_DESKTOP_VIEWPORT, devicePixelRatio: 1 });
  });

  it("measures fill, error, expansion and keyboard focus, and keeps the fill value in the recipe", async () => {
    const cache = new PageScanCache(8);
    const error = (await scanPage(
      {
        url: page,
        ...STRUCTURE,
        actions: [
          { action: "fill", selector: "#campo", value: "abc" },
          { action: "click", selector: "#enviar" },
          { action: "wait", selector: "#erro" },
        ],
        arrival: { errorVisible: true, visible: "#erro" },
      },
      cache
    )) as PageScanResult;
    expect(error.status).toBe("scanned");
    expect(error.state.replay.steps[0]).toEqual({ index: 0, action: "fill", selector: "#campo", value: "abc", matched: 1 });
    expect(error.state.observed.errors).toEqual([
      { locator: "#erro", kind: "role-alert", text: "Informe ao menos 5 caracteres." },
      { locator: "#campo", kind: "aria-invalid", text: "" },
    ]);

    const expanded = (await scanPage(
      { url: page, ...STRUCTURE, actions: [{ action: "click", selector: "#expandir" }], arrival: { expanded: "#expandir", visible: "#painel" } },
      cache
    )) as PageScanResult;
    expect(expanded.state.reached).toBe(true);
    expect(expanded.state.observed.expanded).toEqual(["#expandir"]);

    const tabbed = (await scanPage(
      { url: page, ...STRUCTURE, actions: [{ action: "press", key: "Tab" }], arrival: { focused: "#primeiro" } },
      cache
    )) as PageScanResult;
    expect(tabbed.state.reached).toBe(true);
    expect(tabbed.state.observed.focus?.locator).toBe("#primeiro");

    const wrongFocus = (await scanPage(
      { url: page, ...STRUCTURE, actions: [{ action: "press", key: "Tab" }], arrival: { focused: "#abrir" } },
      cache
    )) as PageScanUnreached;
    expect(wrongFocus.status).toBe("state-not-reached");
    expect(wrongFocus.state.arrival.conditions[0]).toEqual(expect.objectContaining({ condition: "focused", satisfied: false }));
  });

  it("an arrival condition naming two elements is not satisfied: it must name exactly one", async () => {
    const result = (await scanPage({ url: page, ...STRUCTURE, arrival: { focused: ".duplicado" } }, new PageScanCache(2))) as PageScanUnreached;
    expect(result.status).toBe("state-not-reached");
    expect(result.state.arrival.conditions[0]).toEqual(expect.objectContaining({ observed: 2, satisfied: false }));
  });

  it("each scan starts from a clean load: the previous recipe leaves nothing behind", async () => {
    const cache = new PageScanCache(8);
    const idle = (await scanPage({ url: page, ...STRUCTURE }, cache)) as PageScanResult;
    await scanPage({ url: page, ...STRUCTURE, actions: [{ action: "click", selector: "#abrir" }] }, cache);
    const again = (await scanPage({ url: page, ...STRUCTURE }, new PageScanCache(1))) as PageScanResult;
    expect(again.stateFingerprint).toBe(idle.stateFingerprint);
    expect(again.state.observed.dialogs).toEqual([]);
  });
});

describe("replay: singular targets must resolve to exactly one element", () => {
  it("a selector with two targets is a typed error, never the first one", async () => {
    const result = (await scanPage({ url: page, ...STRUCTURE, actions: [{ action: "click", selector: ".duplicado" }] }, new PageScanCache(2))) as PageScanUnreached;
    expect(result.status).toBe("state-not-reached");
    expect(result.limitation.kind).toBe("action-error");
    expect(result.state.replay).toEqual({
      status: "failed",
      steps: [],
      failure: expect.objectContaining({ index: 0, action: "click", selector: ".duplicado", reason: "ambiguous", matched: 2 }),
    });
  });

  it("reports not-found and invalid-selector with the failing step, after the steps that worked", async () => {
    const missing = (await scanPage(
      { url: page, ...STRUCTURE, actions: [{ action: "click", selector: "#expandir" }, { action: "fill", selector: "#nao-existe", value: "x" }] },
      new PageScanCache(2)
    )) as PageScanUnreached;
    expect(missing.state.replay.status).toBe("failed");
    expect(missing.state.replay.steps).toHaveLength(1);
    expect(missing.state.replay).toEqual(expect.objectContaining({ failure: expect.objectContaining({ index: 1, reason: "not-found", matched: 0 }) }));

    const invalid = (await scanPage({ url: page, ...STRUCTURE, actions: [{ action: "click", selector: "button[[" }] }, new PageScanCache(2))) as PageScanUnreached;
    expect(invalid.state.replay).toEqual(expect.objectContaining({ failure: expect.objectContaining({ index: 0, reason: "invalid-selector" }) }));
  }, 20_000);

  it("through MCP, an unreached state is a result with a limitation — no scanId, no findings, not a tool error", async () => {
    const { isError, data } = await call(client, "scan_page", { url: page, ...STRUCTURE, actions: [{ action: "click", selector: ".duplicado" }] });
    expect(isError).toBe(false);
    expect(data.status).toBe("state-not-reached");
    expect(data.scanId).toBeNull();
    expect(data).not.toHaveProperty("findings");
    expect(data).not.toHaveProperty("summary");
    expect(data.limitation.kind).toBe("action-error");
    expect(data.state.replay.failure.reason).toBe("ambiguous");
  });

  it("does not let the agent choose a window: arrival is strict and the scan schema has no viewport", async () => {
    const { tools } = await client.listTools();
    for (const name of ["scan_page", "verify_finding"]) {
      const schema = tools.find((tool) => tool.name === name)?.inputSchema as { properties: Record<string, { additionalProperties?: boolean }> };
      expect(Object.keys(schema.properties)).not.toContain("viewport");
      expect(schema.properties.arrival.additionalProperties).toBe(false);
    }
    const sneaky = await client.callTool({ name: "scan_page", arguments: { url: page, arrival: { viewport: { width: 375, height: 812 } } } });
    expect(sneaky.isError).toBe(true);
  });
});

describe("state identity (state-identity-1): exact, shadow roots included", () => {
  it("an identical load reuses the cache — framework-drawn ids included; a real change does not, even one only inside an open shadow root", async () => {
    const args = { url: page, ...STRUCTURE };
    const first = (await call(client, "scan_page", args)).data;
    const second = (await call(client, "scan_page", args)).data;
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.stateFingerprint).toBe(first.stateFingerprint);

    shadowVersion += 1;
    try {
      const shadowChanged = (await call(client, "scan_page", args)).data;
      expect(shadowChanged.cacheHit).toBe(false);
      expect(shadowChanged.stateFingerprint).not.toBe(first.stateFingerprint);
    } finally {
      shadowVersion -= 1;
    }

    documentVersion += 1;
    try {
      const documentChanged = (await call(client, "scan_page", args)).data;
      expect(documentChanged.cacheHit).toBe(false);
      expect(documentChanged.stateFingerprint).not.toBe(first.stateFingerprint);
    } finally {
      documentVersion -= 1;
    }
    expect((await call(client, "scan_page", args)).data.cacheHit).toBe(true);
  });

  it("lists a closed shadow root as unobservable and focus inside it as unknown, never as focus on the host", async () => {
    const result = (await scanPage({ url: page, ...STRUCTURE, actions: [{ action: "click", selector: "#fechada" }] }, new PageScanCache(2))) as PageScanResult;
    expect(result.state.observed.unobservableRoots).toEqual(["#fechada"]);
    expect(result.state.observed.focus).toEqual({ locator: "#fechada", tag: "caixa-fechada", inShadow: false, interior: "unknown" });
  });

  it("follows focus into an open shadow root with a crossing locator", async () => {
    const result = (await scanPage(
      { url: page, ...STRUCTURE, actions: [{ action: "click", selector: "#aberta >>> button" }], arrival: { focused: "#aberta >>> button" } },
      new PageScanCache(2)
    )) as PageScanResult;
    expect(result.state.reached).toBe(true);
    expect(result.state.observed.focus).toEqual({ locator: "#aberta >>> button", tag: "button", inShadow: true, interior: "observed" });
  });
});

describe("settle: the fingerprint is taken from the settled state, in scan and in replay alike", () => {
  it("a dialog whose .show arrives by setTimeout (plus a transition) gives one stable fingerprint", async () => {
    const args = {
      url: page,
      ...STRUCTURE,
      actions: [{ action: "click", selector: "#abrir-lento" }],
      // Satisfied only if the fingerprint waited for the delayed class: arrival is measured after the settle.
      arrival: { visible: "#dialogo-lento.show", dialogOpen: true },
    };
    const first = (await call(client, "scan_page", args)).data;
    expect(first.status).toBe("scanned");
    expect(first.state.settle).toEqual({ settled: true });
    expect(first.state.arrival.status).toBe("reached");

    const fingerprints = new Set<string>([first.stateFingerprint]);
    for (let i = 0; i < 3; i += 1) {
      const again = (await scanPage(args, new PageScanCache(1))) as PageScanResult;
      expect(again.state.settle.settled).toBe(true);
      fingerprints.add(again.stateFingerprint);
    }
    expect(fingerprints.size).toBe(1);

    const res = (await call(client, "verify_finding", { finding: colorClaim("#acao-lento"), live: true, scanId: first.scanId })).data;
    expect(res.verification.verdict).toBe("confirmed");
    expect(res.verification.binding.stateFingerprint).toBe(first.stateFingerprint);
    expect(res.verification.binding.state).toEqual(expect.objectContaining({ mismatches: [], settled: true }));
  }, 30_000);
});

describe("verify_finding against a recorded state", () => {
  it("replays the scan's recipe by scanId and confirms in that state", async () => {
    const scan = (await call(client, "scan_page", { url: page, ...STRUCTURE, actions: [{ action: "click", selector: "#abrir" }], arrival: { dialogOpen: true } })).data;
    expect(scan.state.reached).toBe(true);
    const res = (await call(client, "verify_finding", { finding: colorClaim("#acao-dialogo"), live: true, scanId: scan.scanId })).data;
    expect(res.verification.verdict).toBe("confirmed");
    expect(res.verification.binding.stateFingerprint).toBe(scan.stateFingerprint);
    expect(res.verification.binding.state).toEqual(expect.objectContaining({ scanId: scan.scanId, reached: true, mismatches: [] }));
  });

  it("a state the recipe no longer reproduces is a limitation: unverifiable, never rejected", async () => {
    const scan = (await call(client, "scan_page", { url: page, ...STRUCTURE, actions: [{ action: "click", selector: "#abrir" }] })).data;
    documentVersion += 1;
    try {
      const res = (await call(client, "verify_finding", { finding: colorClaim("#acao-dialogo"), live: true, scanId: scan.scanId })).data;
      expect(res.verification.verdict).toBe("unverifiable");
      expect(res.verification.verifiedBy).toBe("state-fingerprint");
      expect(res.verification.checks.evidenceConsistent).not.toBe("fail");
      expect(res.verification.checks.violation).toBe("not-checked");
      expect(res.verification.binding.state.mismatches).toEqual(["fingerprint"]);
      expect(res.verification.binding.state.limitation.kind).toBe("state-not-reproduced");
      expect(res.verification.detail).toMatch(/^.*Limitação: .*não indica ausência de defeito/);
    } finally {
      documentVersion -= 1;
    }
  });

  it("matches the finding's page to the scan by origin + path + query: trailing slash and fragment do not count", async () => {
    const scan = (await call(client, "scan_page", { url: `${page}tela/`, ...STRUCTURE, actions: [{ action: "click", selector: "#abrir" }] })).data;
    expect(scan.state.reached).toBe(true);
    for (const variant of [`${page}tela`, `${page}tela/#secao`, `${page}tela#secao`]) {
      const res = (await call(client, "verify_finding", { finding: colorClaim("#acao-dialogo", variant), live: true, scanId: scan.scanId })).data;
      expect(res.verification?.verdict, variant).toBe("confirmed");
      expect(res.verification.binding.state.mismatches, variant).toEqual([]);
    }
  });

  it("a finding on another page than the cited scan is caller misuse: a typed refusal, not a verdict", async () => {
    const scan = (await call(client, "scan_page", { url: page, ...STRUCTURE })).data;
    for (const other of [`${page}?outra=1`, `${page}outra`]) {
      const refused = await call(client, "verify_finding", { finding: colorClaim("#acao-dialogo", other), live: true, scanId: scan.scanId });
      expect(refused.data.error, other).toMatch(/cite o scan da página do achado/);
      expect(refused.data, other).not.toHaveProperty("verification");
    }
    await expect(
      verifyFinding({
        finding: colorClaim("#acao-dialogo", `${page}outra`),
        live: true,
        scanState: { scanId: scan.scanId, recipe: scan.state.recipe, url: scan.state.observed.url, viewport: FROZEN_DESKTOP_VIEWPORT, fingerprint: scan.stateFingerprint },
      })
    ).rejects.toBeInstanceOf(ScanStateMisuseError);
  });

  it("a window other than the recorded one is a limitation too: unverifiable", async () => {
    const scan = (await call(client, "scan_page", { url: page, ...STRUCTURE })).data;

    const recorded = scan.state;
    const res = await verifyFinding({
      finding: colorClaim("#acao-dialogo"),
      live: true,
      scanState: {
        scanId: scan.scanId,
        recipe: recorded.recipe,
        url: recorded.observed.url,
        viewport: { width: 1024, height: 768 },
        fingerprint: scan.stateFingerprint,
      },
    });
    expect(res.verdict).toBe("unverifiable");
    expect(res.binding?.state as { mismatches: string[]; limitation: { kind: string } }).toEqual(
      expect.objectContaining({ mismatches: ["viewport"], limitation: expect.objectContaining({ kind: "state-not-reproduced" }) })
    );
  });

  it("an action error or an unmet arrival is a limitation: unverifiable, never rejected as if there were no defect", async () => {
    const ambiguous = (await call(client, "verify_finding", { finding: colorClaim("#acao-dialogo"), live: true, actions: [{ action: "click", selector: ".duplicado" }] })).data;
    expect(ambiguous.verification.verdict).toBe("unverifiable");
    expect(ambiguous.verification.verifiedBy).toBe("state-replay");
    expect(ambiguous.verification.checks.violation).toBe("not-checked");
    expect(ambiguous.verification.binding.state.failure).toEqual(expect.objectContaining({ reason: "ambiguous", matched: 2 }));
    expect(ambiguous.verification.binding.state.limitation.kind).toBe("action-error");

    const notOpened = (await call(client, "verify_finding", { finding: colorClaim("#acao-dialogo"), live: true, arrival: { dialogOpen: true } })).data;
    expect(notOpened.verification.verdict).toBe("unverifiable");
    expect(notOpened.verification.binding.state.limitation.kind).toBe("arrival-not-met");
  });

  it("refuses a scanId mixed with its own recipe fields, and an unknown scanId", async () => {
    const scan = (await call(client, "scan_page", { url: page, ...STRUCTURE })).data;
    const mixed = await call(client, "verify_finding", { finding: colorClaim("#acao-dialogo"), live: true, scanId: scan.scanId, actions: [] });
    expect(mixed.data.error).toMatch(/scanId já carrega/);
    const unknown = await call(client, "verify_finding", { finding: colorClaim("#acao-dialogo"), live: true, scanId: "S-page-999" });
    expect(unknown.data.error).toMatch(/não existe/);
  });
});

describe("caller independence", () => {
  it("returns the same state attestation and fingerprint to any client and across profiles (evaluation vs full)", async () => {
    // Two fresh servers with DIFFERENT tool profiles, so neither shares the other's cache.
    const evaluation = await connect("cliente-avaliacao", "evaluation");
    const other = await connect("outro-cliente", "full");
    try {
      const args = { url: page, ...STRUCTURE, actions: [{ action: "click", selector: "#expandir" }], arrival: { expanded: "#expandir" } };
      const a = (await call(evaluation, "scan_page", args)).data;
      const b = (await call(other, "scan_page", args)).data;
      expect(a.cacheHit).toBe(false);
      expect(b.cacheHit).toBe(false);
      expect(b.stateFingerprint).toBe(a.stateFingerprint);
      expect(b.state).toEqual(a.state);
      const shape = (fs: Array<{ rule: { id: string }; element: { locator: string } }>) => fs.map((f) => `${f.rule.id}@${f.element.locator}`);
      expect(shape(b.findings)).toEqual(shape(a.findings));
    } finally {
      await evaluation.close();
      await other.close();
    }
  });
});
