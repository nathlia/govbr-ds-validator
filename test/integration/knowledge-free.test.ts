/**
 * Perfil knowledge-free (2.14.0, NAT-61): o terceiro braço tem as ferramentas de medição do perfil
 * evaluation sem nada do pacote DS + e-MAG que o oráculo serve e aplica. WCAG 2.2 e axe-core ficam.
 *
 * Fixtures sintéticas e neutras (nenhum markup, texto ou seletor das telas A/B nem dos controles).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { selectPredicateKnowledgeFree } from "../../src/verify/predicates.js";
import { CONTEXT_CONDITIONS } from "../../src/verify/contextual.js";
import { PageScanCache, scanPage, type PageScanResult } from "../../src/scan/pageScan.js";
import { EXPECTED_CONDITIONS as C } from "../../src/schema/structuredClaims.js";
import type { Finding } from "../../src/schema/finding.js";
import type { PageAction } from "../../src/scan/actions.js";
import {
  KnowledgeLockedError,
  knowledgeLockAttempts,
  resetKnowledgeLock,
  runKnowledgeLocked,
} from "../../src/data/lock.js";
import * as load from "../../src/data/load.js";
import * as knowledge from "../../src/data/knowledge.js";
import * as dsStates from "../../src/data/dsComponentStates.js";
import type { ToolTelemetryEvent } from "../../src/telemetry.js";

/**
 * sha256 do `tools/list` do perfil, fixado (plano §5.3). O runner confere o mesmo valor na ponte.
 * Mudou de propósito? Atualize aqui E declare a mudança: é diferença de tratamento do braço.
 */
const KNOWLEDGE_FREE_TOOLS_SHA256 = "c51bf1a3fc1bfc2d333c589656d48106418c8bf0b4865868d569893997bb48bd";
// 3.7.3 A6: get_finding_details aceita observations (pendências do axe do próprio lote).
// 3.4.0–3.7.2: f358152ab77b8b6930687c1b12206f3821170600d52c0fda0a3dde8d0774bf44.
// 3.3.0: 8bdb5e35ed3346a91b227b45034d64c849f1d21baeb6d5affc995a4ea02c7dee. 3.4.0 (B7) muda de propósito: a ação
// `navigate` (pushState + popstate, caminho da mesma origem) no esquema de actions do scan_page e do verify_finding.
// Nada do pacote DS/e-MAG.
// 2.14.0–2.17.1: 72abd54968cbe3173fce5dd3b4bba7aff563b37ca11b8a9ec0f25a91a104d39c. 3.0.0 (NAT-99) muda de
// propósito: scan_page (descrição: checksRun, resposta de ~8.000; maxChars = orçamento da resposta inteira,
// texto deste perfil, sem investigate) e get_finding_details (view 'diff', maxChars da resposta inteira).
// Nada do pacote DS/e-MAG.
/**
 * `tools/list` do perfil evaluation. 2.13.0–2.16.1: 3d70162f5fed0ec8614d9dcbc18a69a00b4819ad56df1ed1c5bf95213eed0b3b
 * (gate da NAT-86). 2.17.0 (NAT-97) muda de propósito o get_ds_rules: descrição de query, novos
 * parâmetros match e vocabulary. Campanhas novas precisam fixar este valor.
 */
const EVALUATION_TOOLS_SHA256_3_0_0 = "8c7b9cca98da99218fa9fd03e29cfafeeffbf5260483596bf9ffd0465cf4bbf1";
// 3.7.3 A3: get_emag_rules aceita clauseCursor. Hash desta fatia, antes da emenda-2.
// Árvore integrada com emenda-2: 590c6f701d6717b8270e7378393895e86ae1a024cb506a1b08339f9a21077471.
// 3.6.0: cbfffb0deee45e1df35d2c1d44738f2a2065abd3385d467adbb252f79dc022f0. 3.6.1 (D-155) muda de propósito: scan_page
// ganha a entrada opcional pendingResolved (o agente fecha pendências da sessão) e a descrição de get_page_rules lista
// ds-page-title. O perfil knowledge-free não muda (f358152a…).
// 3.5.0: 61177aa7f89b77801e4d8236a376361ffe4c57d574e3e67bf23678174b397f38. 3.6.0 (D-155) muda de propósito: o esquema de
// Finding (verify_finding/save_report) ganha rule.checker (o check que mediu; a citação é rule.id) e as descrições de
// rule.id e evidence.data dizem isso; get_page_rules diz que cada restrição traz citeAs. O perfil knowledge-free não muda.
// 3.4.0–3.4.4: adc4266162781cb6239ee4e84ae852889ceeb209556bf7270c267b015884c6b2. 3.5.0 (D-155) muda de propósito:
// get_component_spec ganha view ('spec' | 'checklist') e cursor; verify_finding (descrição de evidence.data) lista as
// condições form-field-label-not-placeholder-only, skip-link-first-to-receive-focus, decorative-icon-aria-hidden e link-title-not-repeating-text; get_page_rules cita
// ds-page-focus-order. O perfil knowledge-free não muda.
// 3.3.0: c4066eab839eb59d092e68b55c3b75337e7a117d9014aa7b054314ad46b7e297. 3.4.0 (B7): ação `navigate` em scan_page/verify_finding.
// 3.2.0: f15292681d18f1f516373e741e3e03911b32acc207ba6813cde046a1d33ebf60. 3.3.0 (NAT-109) muda de propósito o
// get_ds_rules (sem o parâmetro retrieval, D-152; descrições mais curtas; maxLength em id/ids/component/query) e o get_design_tokens (hex aceita
// #rgb/rgb()). O perfil knowledge-free não muda; as instructions do initialize são novas (só procedimento).
// 3.0.0–3.1.0: 9b32f185cd7d2c436fb7c3c59800b5a87e6b7c3c59db00715c1f3532044d20bc. 3.2.0 (NAT-107) muda de propósito
// o get_ds_rules: novo parâmetro opcional retrieval (lexical padrão | hybrid | dense, D-149). O perfil knowledge-free não muda.
// 2.17.0–2.17.1: e212c68e95268bf768e0b5cfacb2774f8483e7c4ef263170d6a198ff14c0e7ab. 3.0.0 (NAT-99): get_ds_rules
// (descrição, cursor, clauseCursor, detail 'index', limit/offset), get_component_spec (example), scan_page
// (descrição, maxChars), get_finding_details (view 'observations'/'diff', maxChars), get_emag_rules (section
// inteiro, id com teto), get_design_tokens (query com teto, hex, cursor), get_page_rules (cursor).

/** Termos do pacote DS + e-MAG que nenhuma descrição/esquema do perfil pode trazer. */
const FORBIDDEN_IN_SURFACE = [
  "e-MAG",
  "eMAG",
  "Template Base",
  "Rawline",
  "knowledge base",
  "govbr-3.7.0",
  "ds-token",
  "ds-structure",
  "ds-page",
  "get_ds_rules",
  "get_component_spec",
  "get_page_rules",
  "get_emag_rules",
  "get_design_tokens",
  "tokenChecks",
  "normativeContext",
  "componentsFound",
  "modal focus",
  "breadcrumb",
  "anatomy",
];

const STYLE = `<style>
  .campo input { border: 1px solid rgb(136, 136, 136); }
  .campo.erro input { border-color: rgb(200, 0, 0); }
  .baixo { color: #aaa; background: #fff; }
</style>`;

function page(body: string, script = ""): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Reserva de salas – Clube</title>${STYLE}</head>
<body><main><h1>Reserva de salas</h1>${body}</main><script>${script}</script></body></html>`;
}

const FORM = `<form id="f" novalidate>
  <div class="campo" id="caixa"><label for="codigo">Número da sala</label><input id="codigo" type="text"></div>
  <button id="enviar" type="submit">Reservar</button></form><div id="resumo"></div>`;
// 2.14.1: erro detectado exige sinal programático (aqui S3: aria-invalid no contêiner só do campo);
// a classe 'erro' sozinha (mudança de aparência) deixou de ser evidência de detecção.
const VALIDA = (onError: string) => `
  const f = document.getElementById('f'); const c = document.getElementById('codigo'); const caixa = document.getElementById('caixa');
  f.addEventListener('submit', (e) => { e.preventDefault(); const old = document.getElementById('codigo-msg'); if (old) old.remove();
    if (!/^\\d{3}$/.test(c.value)) { caixa.classList.add('erro'); caixa.setAttribute('aria-invalid','true'); ${onError} } });`;
const MSG = `const m = document.createElement('span'); m.id = 'codigo-msg'; m.textContent = 'Valor inválido.'; caixa.appendChild(m);`;

const PAGES: Record<string, string> = {
  "/p1-defeito": page(FORM, VALIDA(MSG)),
  "/p1-conforme": page(FORM, VALIDA(MSG + " c.setAttribute('aria-invalid','true'); c.setAttribute('aria-describedby','codigo-msg');")),
  "/p1-so-cor": page(FORM, VALIDA("")),
  "/p1-sem-validacao": page(FORM, "document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); document.getElementById('resumo').textContent = 'Sala reservada.'; });"),
  "/p1-status": page(FORM, VALIDA("document.getElementById('resumo').textContent = '1 campo precisa de correção.';")),
  "/axe": page(`<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="10" height="10"><input type="text"><p class="baixo">Texto claro</p>
    <div class="br-button" role="button">Ação</div>`),
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

afterEach(() => resetKnowledgeLock());

async function connect(profile: "knowledge-free" | "evaluation", events?: ToolTelemetryEvent[]) {
  const srv = createServer({
    toolProfile: profile,
    knowledgeLock: "call",
    reportsDir: mkdtempSync(join(tmpdir(), "govbr-kf-")),
    ...(events ? { telemetry: { onEvent: (e: ToolTelemetryEvent) => events.push(e) } } : {}),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "kf-test", version: "1.0.0" });
  await srv.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
  const text = res.content.map((c) => c.text).join("");
  let data: any = null;
  try {
    data = JSON.parse(text || "null");
  } catch {
    data = null;
  }
  return { text, isError: Boolean(res.isError), data };
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function claim(path: string, locator: string, rule: { id: string; source: Finding["rule"]["source"]; wcag?: string }, data?: Record<string, unknown>): Finding {
  return {
    id: "F-900",
    rule: { ...rule, description: "alegação de teste" },
    element: { locator, page: `${base}${path}` },
    evidence: { observed: "observado", expected: "esperado", ...(data ? { data } : {}) },
    severity: "serious",
    nature: "semantic",
    mode: "interaction",
    pathway: "heuristic",
  };
}

const SUBMIT: PageAction[] = [{ action: "fill", selector: "#codigo", value: "12" }, { action: "click", selector: "#enviar" }];
const WCAG331 = { id: "3.3.1", source: "wcag" as const };

describe("superfície do perfil knowledge-free", () => {
  it("expõe exatamente scan_page, get_finding_details e verify_finding, com hash fixado; sem recursos nem prompt", async () => {
    const client = await connect("knowledge-free");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["scan_page", "get_finding_details", "verify_finding"]);
    expect(sha(JSON.stringify(tools))).toBe(KNOWLEDGE_FREE_TOOLS_SHA256);
    await expect(client.listResources()).rejects.toThrow();
    await expect(client.listPrompts()).rejects.toThrow();
    const missing = await call(client, "get_ds_rules", {});
    expect(missing.isError).toBe(true);
    await client.close();
  });

  it("nenhuma descrição ou esquema cita o pacote DS/e-MAG; o enum RuleSource fica (decisão 8)", async () => {
    const client = await connect("knowledge-free");
    const raw = JSON.stringify((await client.listTools()).tools);
    // Os valores do enum RuleSource ficam (decisão 8): categorias, não norma. Fora deles, nada.
    const ENUM = '["govbr-ds-kb","govbr-ds-token","govbr-ds-structure","govbr-ds-page","emag","wcag","axe-core"]';
    expect(raw).toContain(ENUM);
    const surface = raw.split(ENUM).join("[]");
    for (const term of FORBIDDEN_IN_SURFACE) expect(surface, term).not.toContain(term);
    const scan = (await client.listTools()).tools.find((t) => t.name === "scan_page")!;
    expect(Object.keys(scan.inputSchema.properties ?? {})).not.toEqual(expect.arrayContaining(["checks"]));
    for (const p of ["checks", "tokenChecks", "components"]) expect(scan.inputSchema.properties).not.toHaveProperty(p);
    await client.close();
  });

  it("3.3.0 (B-18): instructions do initialize = só procedimento; no knowledge-free, sem termo do pacote nem ferramenta de conhecimento", async () => {
    const kf = await connect("knowledge-free");
    const text = kf.getInstructions() ?? "";
    expect(text).toMatch(/^Procedimento: /);
    for (const term of FORBIDDEN_IN_SURFACE) expect(text, term).not.toContain(term);
    for (const tool of ["get_ds_rules", "get_component_spec", "get_design_tokens", "get_emag_rules", "get_page_rules"]) expect(text).not.toContain(tool);
    await kf.close();
    const ev = await connect("evaluation");
    expect(ev.getInstructions()).toContain("get_ds_rules");
    // 3.5.0 (D-155; revisão Fable P1/P7/P8/P9): pendências do scan, "pergunte antes de descartar", força da
    // norma citada e critério de parada pela checklist — o teto do texto passa de 1.200 para 1.600.
    expect(ev.getInstructions()!.length).toBeLessThan(1600);
    expect(ev.getInstructions()).toContain("view checklist");
    await ev.close();
  });

  it("o perfil evaluation tem o tools/list declarado da 3.0.0", async () => {
    const client = await connect("evaluation");
    expect(sha(JSON.stringify((await client.listTools()).tools))).toBe(EVALUATION_TOOLS_SHA256_3_0_0);
    await client.close();
  });
});

describe("trava de carregamento", () => {
  const loaders: Array<[string, () => unknown]> = [
    ["getTokenRegistry", () => load.getTokenRegistry()],
    ["getEmag", () => load.getEmag()],
    ["getPageRules", () => load.getPageRules()],
    ["getDsStylesheet", () => load.getDsStylesheet()],
    ["getComponentSpecs", () => load.getComponentSpecs()],
    ["findEmagRule", () => load.findEmagRule("6.6")],
    ["getKnowledgeBase", () => knowledge.getKnowledgeBase()],
    ["filterRules", () => knowledge.filterRules({})],
    ["getEvidence", () => knowledge.getEvidence()],
    ["getRuleById", () => knowledge.getRuleById("x")],
    ["getKnowledgeConflicts", () => knowledge.getKnowledgeConflicts()],
    ["getComponentDefects", () => knowledge.getComponentDefects("button")],
    ["getEmagValidationTemplate", () => knowledge.getEmagValidationTemplate("6.6")],
    // 2.14.2 (S5): o mapeamento br-input → danger é conhecimento do DS, sob a mesma trava
    ["getDsInputErrorState", () => dsStates.getDsInputErrorState()],
  ];

  it("cada carregador de conhecimento lança sob a trava e conta a tentativa", () => {
    for (const [name, fn] of loaders) {
      expect(() => runKnowledgeLocked(fn), name).toThrow(KnowledgeLockedError);
      expect(fn, `${name} fora da trava`).not.toThrow();
    }
    expect(knowledgeLockAttempts()).toEqual({ attempts: loaders.length, loaders: loaders.map(([n]) => n) });
  });

  it("createServer knowledge-free trava o processo por padrão; o registro WCAG continua liberado", async () => {
    createServer({ toolProfile: "knowledge-free", reportsDir: mkdtempSync(join(tmpdir(), "govbr-kf-")) });
    expect(() => load.getEmag()).toThrow(KnowledgeLockedError);
    const { wcagMembership } = await import("../../src/verify/registries.js");
    expect(wcagMembership("3.3.1").status).toBe("member");
  });

  it("a telemetria do perfil carrega o contador; a do evaluation não muda", async () => {
    const kfEvents: ToolTelemetryEvent[] = [];
    const kf = await connect("knowledge-free", kfEvents);
    await call(kf, "scan_page", { url: `${base}/axe` });
    expect(kfEvents.at(-1)).toMatchObject({ tool: "scan_page", status: "ok", knowledgeLockAttempts: 0 });
    await kf.close();
    const evEvents: ToolTelemetryEvent[] = [];
    const ev = await connect("evaluation", evEvents);
    await call(ev, "verify_finding", { finding: claim("/axe", "img", { id: "1.1.1", source: "wcag" }) });
    expect(evEvents.at(-1)).not.toHaveProperty("knowledgeLockAttempts");
    await ev.close();
  });
});

describe("scan_page só axe", () => {
  it("axe do knowledge-free = axe do evaluation sem os campos e-MAG; sem cobertura de componentes nem contexto normativo", async () => {
    const kf = await connect("knowledge-free");
    const ev = await connect("evaluation");
    const url = `${base}/axe`;
    const a = (await call(kf, "scan_page", { url, view: "findings", detail: "full" })).data;
    const b = (await call(ev, "scan_page", { url, checks: ["axe"], view: "findings", detail: "full" })).data;
    expect(a.coverage).not.toHaveProperty("componentsFound");
    expect(a.coverage).not.toHaveProperty("componentsRequested");
    expect(a.coverage).not.toHaveProperty("evidenceSelectors");
    expect(a).not.toHaveProperty("normativeContext");
    expect(a).not.toHaveProperty("observations");
    expect(a.coverage.checks).toEqual(["axe"]);
    expect(a.findings.length).toBeGreaterThan(0);
    const strip = (f: Finding) => {
      const { emagId, ...data } = (f.evidence.data ?? {}) as Record<string, unknown>;
      return {
        rule: { ...f.rule, description: f.rule.description.replace(/ \(e-MAG [^)]*\)$/, "") },
        element: f.element,
        evidence: { ...f.evidence, data },
        severity: f.severity,
      };
    };
    expect(a.findings.map(strip)).toEqual(b.findings.map(strip));
    expect(JSON.stringify(a.findings)).not.toMatch(/e-MAG|emagId/);
    expect(JSON.stringify(b.findings)).toMatch(/e-MAG/);
    expect(a.stateFingerprint).toBe(b.stateFingerprint);
    await kf.close();
    await ev.close();
  });

  it("scanPage knowledge-free não chama carregador nenhum sob a trava de processo", async () => {
    createServer({ toolProfile: "knowledge-free", reportsDir: mkdtempSync(join(tmpdir(), "govbr-kf-")) });
    const result = (await scanPage({ url: `${base}/axe` }, new PageScanCache(1), { knowledgeFree: true })) as PageScanResult;
    expect(result.status).toBe("scanned");
    expect(knowledgeLockAttempts().attempts).toBe(0);
  });
});

describe("verify_finding knowledge-free", () => {
  const kfVerify = (finding: Finding, actions: PageAction[] = [], extra: Record<string, unknown> = {}) =>
    runKnowledgeLocked(() => verifyFinding({ finding, live: true, actions, knowledgeFree: true, ...extra }));
  const noEmag = (v: { detail?: string; registries?: Record<string, string> }) => {
    expect(v.detail ?? "").not.toMatch(/e-MAG|emag|govbr-3\.7\.0/i);
    expect(Object.keys(v.registries ?? {})).toEqual(["wcag", "contextual"]);
  };

  it("P1 confirma no knowledge-free como no evaluation, com rótulos sem e-MAG", async () => {
    const data = { expectedCondition: C.errorItemIdentified, errorMessage: "#codigo-msg" };
    const ev = await verifyFinding({ finding: claim("/p1-defeito", "#codigo", WCAG331, data), live: true, actions: SUBMIT });
    const kf = await kfVerify(claim("/p1-defeito", "#codigo", WCAG331, data), SUBMIT);
    expect(ev.verdict).toBe("confirmed");
    expect(kf.verdict).toBe("confirmed");
    expect(kf.predicate).toBe(ev.predicate);
    expect(ev.detail).toContain("e-MAG 6.6");
    noEmag(kf);
    const status = await kfVerify(claim("/p1-status", "#resumo", { id: "4.1.3", source: "wcag" }, { expectedCondition: C.statusMessage }), SUBMIT);
    expect(status.verdict).toBe("confirmed");
    noEmag(status);
    expect(knowledgeLockAttempts().attempts).toBe(0);
  });

  it("P1 nos caminhos de contradição, indeterminado e erro: mesmos vereditos, sem e-MAG", async () => {
    const described = { expectedCondition: C.errorDescribedInText };
    const contradicted = await kfVerify(claim("/p1-conforme", "#codigo", WCAG331, { expectedCondition: C.errorItemIdentified, errorMessage: "#codigo-msg" }), SUBMIT);
    expect(contradicted.verdict).toBe("rejected");
    noEmag(contradicted);
    const confirmed = await kfVerify(claim("/p1-so-cor", "#codigo", WCAG331, described), SUBMIT);
    expect(confirmed.verdict).toBe("confirmed");
    noEmag(confirmed);
    const undetermined = await kfVerify(claim("/p1-sem-validacao", "#codigo", WCAG331, described), SUBMIT);
    expect(undetermined.checks?.violation).toBe("undetermined");
    noEmag(undetermined);
    const error = await kfVerify(claim("/nao-existe", "#codigo", WCAG331, described), SUBMIT);
    expect(error.verdict).toBe("unverifiable");
    noEmag(error);
    const missing = await kfVerify(claim("/p1-defeito", "#codigo", WCAG331, { expectedCondition: C.errorItemIdentified }), SUBMIT);
    expect(missing.verdict).toBe("unverifiable");
    noEmag(missing);
    expect(knowledgeLockAttempts().attempts).toBe(0);
  });

  it("P2 e P3 nunca são selecionados; a fonte e-MAG/DS de P1 também não", () => {
    for (const condition of CONTEXT_CONDITIONS) {
      for (const rule of condition.rules) {
        const selection = runKnowledgeLocked(() =>
          selectPredicateKnowledgeFree(claim("/x", "#a", rule, { expectedCondition: condition.condition, errorMessage: "#m", component: "message", part: "mensagem" }))
        );
        if (condition.family === "P1" && rule.source === "wcag") expect(selection.predicate?.id, condition.condition).toBe(`context-${condition.check}`);
        else expect(selection.predicate, `${condition.condition} ${rule.source} ${rule.id}`).toBeNull();
        // Só o id citado pelo chamador pode aparecer (eco); nenhum outro id da base nem o e-MAG.
        expect((selection.reason ?? "").split(rule.id).join("<citado>")).not.toMatch(/govbr-3\.7\.0|e-MAG|emag 6/);
      }
    }
    // Condição P2/P3 citada com uma regra WCAG: sem predicado, sem listar as regras do DS.
    for (const condition of CONTEXT_CONDITIONS.filter((c) => c.family !== "P1")) {
      const s = runKnowledgeLocked(() => selectPredicateKnowledgeFree(claim("/x", "#a", WCAG331, { expectedCondition: condition.condition })));
      expect(s.predicate).toBeNull();
      expect(s.reason ?? "").not.toMatch(/govbr-3\.7\.0/);
    }
    expect(knowledgeLockAttempts().attempts).toBe(0);
  });

  it("alegação DS/e-MAG: ruleExists unknown com nota fixa, nunca rejeitada pela ausência do registro (Codex #2)", async () => {
    const sources: Array<{ id: string; source: Finding["rule"]["source"] }> = [
      { id: "govbr-3.7.0-accessibility-global-271582e4fbe8", source: "govbr-ds-kb" },
      { id: "govbr-3.7.0-nao-existe-000000000000", source: "govbr-ds-kb" },
      { id: "6.6", source: "emag" },
      { id: "ds-token-color", source: "govbr-ds-token" },
      { id: "ds-structure-button-tag", source: "govbr-ds-structure" },
      { id: "ds-page-footer", source: "govbr-ds-page" },
    ];
    for (const rule of sources) {
      const v = await runKnowledgeLocked(() => verifyFinding({ finding: claim("/axe", "img", rule), knowledgeFree: true }));
      expect(v.verdict, rule.id).toBe("unverifiable");
      expect(v.checks?.ruleExists).toBe("unknown");
      expect(v.verifiedBy).toBe("rule-source-not-checked");
      expect(v.detail).toContain("Fonte não conferida neste perfil.");
      expect((v.detail ?? "").split(rule.id).join("<citado>")).not.toMatch(/existe|get_ds_rules|KB |govbr-3\.7\.0/);
    }
    // Uma referência WCAG cruzada inválida continua rejeitando (registro público).
    const cross = await runKnowledgeLocked(() => verifyFinding({ finding: claim("/axe", "img", { id: "6.6", source: "emag", wcag: "9.9.9" }), knowledgeFree: true }));
    expect(cross.verdict).toBe("rejected");
    expect(knowledgeLockAttempts().attempts).toBe(0);
  });

  it("achado correto por inspeção própria: nos três braços nada impede submetê-lo sem 'confirmed' (Codex #2)", async () => {
    // Mesmo achado (WCAG 1.1.1, imagem sem alternativa) visto por inspeção, sem predicado. O portão
    // não é crédito: no braço sem não há portão; no com e no ferramentas ele fica `unverifiable`
    // (nunca `rejected`), e a submissão (skill/registro do agente) não exige `confirmed`.
    const finding = claim("/axe", "img", { id: "1.1.1", source: "wcag" });
    const com = await verifyFinding({ finding, live: true });
    const ferr = await runKnowledgeLocked(() => verifyFinding({ finding, live: true, knowledgeFree: true }));
    expect(com.verdict).toBe("unverifiable");
    expect(ferr.verdict).toBe("unverifiable");
    expect(ferr.checks?.ruleExists).toBe("pass");
    // Referência justificada fora dos registros (texto livre) e achado com id do DS também não rejeitam.
    const kb = claim("/axe", "img", { id: "govbr-3.7.0-accessibility-global-271582e4fbe8", source: "govbr-ds-kb" });
    expect((await runKnowledgeLocked(() => verifyFinding({ finding: kb, live: true, knowledgeFree: true }))).verdict).toBe("unverifiable");
    // 3.3.0 (S-05): o achado do axe é reconferido rodando só aquela regra do axe no alvo — a imagem sem
    // alt reprova de novo, e o achado confirma (sem nada da base de conhecimento).
    const axeFinding = claim("/axe", "img", { id: "image-alt", source: "axe-core" });
    const axeVerdict = await runKnowledgeLocked(() => verifyFinding({ finding: axeFinding, live: true, knowledgeFree: true }));
    expect(axeVerdict.verdict).toBe("confirmed");
    expect(axeVerdict.verifiedBy).toBe("axe-recheck:image-alt");
    expect(knowledgeLockAttempts().attempts).toBe(0);
  });

  it("no servidor: verify_finding com scanId reaplica a receita, e a resposta não traz registro do DS", async () => {
    const client = await connect("knowledge-free");
    const scan = (await call(client, "scan_page", { url: `${base}/p1-defeito`, actions: SUBMIT })).data;
    const data = { expectedCondition: C.errorItemIdentified, errorMessage: "#codigo-msg" };
    const v = (await call(client, "verify_finding", { finding: claim("/p1-defeito", "#codigo", WCAG331, data), live: true, scanId: scan.scanId })).data;
    expect(v.verification.verdict).toBe("confirmed");
    expect(v.verification.binding.state.scanId).toBe(scan.scanId);
    expect(JSON.stringify(v)).not.toMatch(/e-MAG|govbr-3\.7\.0|@govbr-ds\/core|KB /);
    await client.close();
  });
});
