/**
 * 3.6.5 (D-155, rastreio dev-364: thesis-workspace/planejamento/atual/mecanismo-oraculo-dev-364-2026-11-02.md) — as seis
 * causas do oráculo nas perdas do braço com, e a revisão independente da 3.6.5.
 *
 * Fixtures sintéticas e neutras (uma oficina mecânica): nenhum markup, texto, seletor ou id das telas A/B, do fluxo ou
 * dos controles. Cada teste reproduz o MECANISMO, não o caso, e falha na 3.6.4:
 *   1. achado de interação traz o passo que leva ao estado (scan, get_finding_details e verify_finding) — também quando
 *      o agente reescreveu a evidência; sem como saber, "unknown", nunca "nenhum passo";
 *   2. a família traz a força da norma citada, como vem da base (e nada quando a base não tem; nada no knowledge-free);
 *   3. o exemplo canônico é conferido pelas pendências/checks do oráculo; a spec traz as obrigações globais da tag;
 *   4. a mesma assinatura de evidência noutra rota, com outros elementos, marca alsoIn (o mesmo elemento noutra rota ou
 *      noutro estado da rota, não);
 *   5. a cláusula mensurável SERVIDA no checklist vira pendência da sessão (só nas rotas em que o componente foi achado;
 *      resolvida por pendingResolved/verify); posição/ordem visual ganham a geometria além da medida da estratégia;
 *   6. checksRun declara a revisita de tokens que gerou achado.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { resetKnowledgeLock } from "../../src/data/lock.js";
import { getComponentSpecs } from "../../src/data/load.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { RESPONSE_BUDGET } from "../../src/responses/contract.js";
import { checkPageStructure } from "../../src/checkers/pageStructure.js";
import { FOCUS_INDICATOR_CONDITION } from "../../src/checkers/focusIndicator.js";
import * as notJudged from "../../src/scan/notJudged.js";
import * as session from "../../src/scan/session.js";
import * as checklist from "../../src/tools/componentChecklist.js";
import type { PageFacts } from "../../src/evidence/pageFacts.js";
import type { Finding } from "../../src/schema/finding.js";

// Uma faixa de baixo contraste no cabeçalho de TODAS as páginas (layout compartilhado: o mesmo elemento em toda rota).
function page(title: string, body: string, script = "", style = ""): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>${style}</style></head>
<body><a href="#conteudo">Ir para o conteúdo</a><header class="br-header"><span class="header-title">Oficina</span>
<span class="faixa" style="color:#ffffff;background:#aaaaaa;font-size:13px">Oficina central</span></header>
<main id="conteudo">${body}</main><footer class="br-footer">fim</footer><script>${script}</script></body></html>`;
}

// A mesma etiqueta (mesmas cores e fonte) em duas rotas, em elementos diferentes.
const etiqueta = (cls: string) => `<span class="${cls}" style="color:#ffffff;background:#999999;font-size:14px">Pendente</span>`;

const PAGES: Record<string, string> = {
  // Campo cujo foco não muda nada que se veja; separador com cor fora da paleta (token).
  "/oficina/foco": page(
    "Foco — Oficina",
    `<h1>Ordem de serviço</h1><label for="placa">Placa</label><input id="placa" class="sem-foco" type="text">
     <hr id="linha" style="border:0;border-top:1px solid #bbbbbb">`,
    "",
    ".sem-foco, .sem-foco:focus, .sem-foco:focus-visible { outline: none; box-shadow: none; }",
  ),
  "/oficina/agenda": page("Agenda — Oficina", `<h1>Agenda</h1><p>Revisão ${etiqueta("etiqueta")}</p>`),
  "/oficina/pedido/7": page(
    "Pedido 7 — Oficina",
    `<h1>Pedido 7</h1><p>Troca de óleo ${etiqueta("situacao")}</p><button type="button" id="mais">Detalhes</button><p id="extra" hidden>Filtro incluso.</p>`,
    `document.getElementById('mais').addEventListener('click', function () { document.getElementById('extra').hidden = false; });`,
  ),
  // Uma mensagem do DS (componente encontrado pelo scan).
  "/oficina/aviso": page(
    "Aviso — Oficina",
    `<h1>Aviso</h1><div class="br-message info" role="alert"><div class="icon"><i class="fas fa-info-circle" aria-hidden="true"></i></div>
     <div class="content"><span class="message-title">Atenção.</span><span class="message-body">Oficina fechada no feriado.</span></div>
     <div class="close"><button class="br-button circle small" type="button" aria-label="Fechar">x</button></div></div>`,
  ),
  // Uma tabela do DS (componente cuja lista de verificação tem mais de uma página).
  "/oficina/tabela": page(
    "Peças — Oficina",
    `<h1>Peças</h1><div class="br-table"><table><caption>Peças em estoque</caption><thead><tr><th scope="col">Peça</th></tr></thead><tbody><tr><td>Filtro</td></tr></tbody></table></div>`,
  ),
  // Menu oculto com um separador de cor fora da paleta; o botão o abre.
  "/oficina/menu": page(
    "Menu — Oficina",
    `<h1>Menu</h1><button type="button" id="abrir" aria-expanded="false" aria-controls="painel">Conta</button>
     <div id="painel" hidden><a href="#perfil">Perfil</a><hr id="risco" style="border:0;border-top:1px solid #bbbbbb"><a href="#sair">Sair</a></div>`,
    `document.getElementById('abrir').addEventListener('click', function () { var p = document.getElementById('painel'); p.hidden = !p.hidden; this.setAttribute('aria-expanded', String(!p.hidden)); });`,
  ),
};

let http: Server;
let base = "";
beforeAll(async () => {
  http = createHttpServer((req, res) => {
    const body = PAGES[(req.url ?? "/").split("?")[0]];
    if (!body) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  resetKnowledgeLock();
  await closeBrowser();
  await new Promise((r) => http.close(() => r(undefined)));
});
afterEach(() => resetKnowledgeLock());

async function connect(profile: "evaluation" | "knowledge-free" | "normative" = "evaluation") {
  const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "govbr-365-")) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fix365", version: "1" });
  await srv.connect(b);
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    return { text, isError: Boolean(r.isError), data: JSON.parse(text) as Record<string, any> };
  };
  return { client, call };
}

type Fam = Record<string, any>;
const families = (data: Record<string, any>): Fam[] => (data.families ?? []) as Fam[];
const contrastOf = (data: Record<string, any>, locatorPart: string) =>
  families(data).find((f) => f.rule.id === "color-contrast" && String(f.example?.element?.locator ?? "").includes(locatorPart));

// ── 1. passo de interação ─────────────────────────────────────────────────────────────────────

describe("3.6.5 item 1 — o achado de interação traz o passo que leva ao estado", () => {
  it("foco visível: a família, o achado e o verify_finding dizem 'foque o elemento' com a ação da receita", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/oficina/foco`, checks: ["structure"] });
      const focus = families(scan.data).find((f) => f.rule.id === "emag-4.4");
      expect(focus, "família de foco visível").toBeDefined();
      expect(focus!.mode).toBe("interaction");
      expect(focus!.interaction.needed).toBe(true);
      expect(focus!.interaction.steps).toEqual([{ action: "press", selector: "#placa", key: "Shift" }]);
      expect(scan.data.interactionNote).toMatch(/state\.steps/);
      // get_finding_details por id: o mesmo passo, na projeção do achado
      const id = focus!.memberIds[0];
      const details = await call("get_finding_details", { ids: [id] });
      expect(details.data.findings[0].interaction.steps[0]).toMatchObject({ action: "press", selector: "#placa" });
      expect(details.data.findings[0].interaction.text).toMatch(/foque #placa/);
      // verify_finding: o passo vem depois das ações da receita, na forma de state.steps
      const full = (await call("get_finding_details", { ids: [id], detail: "full" })).data.findings[0] as Finding;
      const verify = await call("verify_finding", { finding: full, live: true, scanId: scan.data.scanId });
      expect(verify.isError).toBe(false);
      expect(verify.data.interaction.needed).toBe(true);
      expect(verify.data.interaction.stateSteps).toEqual([{ action: "press", selector: "#placa", key: "Shift" }]);
      expect(verify.data.interaction.note).toMatch(/state\.steps/);
      // revisão (ALTA 1): o agente reescreveu a evidência sem `interaction` — a condição do predicado ainda dá o passo
      const authored = JSON.parse(JSON.stringify(full)) as Finding;
      authored.id = "agente-1";
      delete (authored.evidence.data as Record<string, unknown>).interaction;
      const rewritten = await call("verify_finding", { finding: authored, live: true, scanId: scan.data.scanId });
      expect(rewritten.data.interaction.needed).toBe(true);
      expect(rewritten.data.interaction.stateSteps).toEqual([{ action: "press", selector: "#placa", key: "Shift" }]);
      // o passo devolvido reproduz o estado: o scan com ele alcança o campo focado
      const replay = await call("scan_page", { url: `${base}/oficina/foco`, checks: ["axe"], actions: verify.data.interaction.stateSteps, arrival: { focused: "#placa" } });
      expect(replay.data.status).toBe("scanned");
    } finally {
      await client.close();
    }
  });

  it("todo achado mode:interaction projeta o passo: ordem de foco = Tab só sem ações; marcação = nenhum; sem como saber = unknown", async () => {
    const { interactionOf } = await import("../../src/checkers/interaction.js");
    const facts: PageFacts = {
      url: "http://x/",
      lang: "pt-BR",
      title: "x",
      regions: { header: 1, footer: 1, breadcrumb: 0, cookiebar: 0, menu: 0 },
      mainLandmarks: 1,
      linkCount: 2,
      firstLink: { href: "#c", text: "Ir", targetId: "c", targetExists: true, skipsToContent: true },
      positiveTabindexFirst: { tag: "input", tabindex: 3, text: "", id: "busca", isFirstLink: false },
    };
    const order = checkPageStructure({ url: facts.url }, facts).find((f) => f.mode === "interaction")!;
    expect(order).toBeDefined();
    expect(interactionOf(order, [])).toMatchObject({ needed: true, steps: [{ action: "press", key: "Tab" }] });
    // revisão (BAIXA 5): depois de ações, o Tab a partir do carregamento não reproduz — fato da marcação (tabindex)
    expect(interactionOf(order, [{ action: "click", selector: "#x" }])).toMatchObject({ needed: false, steps: [] });
    // sem gravação, a condição estruturada deduz o passo (foco visível → focar o elemento)
    const noRecord = { ...order, element: { ...order.element, locator: "#campo" }, evidence: { ...order.evidence, data: { expectedCondition: FOCUS_INDICATOR_CONDITION } } } as Finding;
    expect(interactionOf(noRecord)).toMatchObject({ needed: true, steps: [{ action: "press", selector: "#campo", key: "Shift" }] });
    // check que decide pela marcação: nenhum passo
    const axe = { ...order, rule: { source: "axe-core", id: "scrollable-region-focusable", description: "x" }, evidence: { observed: "x", expected: "y" } } as Finding;
    expect(interactionOf(axe)).toMatchObject({ needed: false, steps: [] });
    // revisão (ALTA 1): sem gravação nem dedução, "unknown" — nunca needed:false
    const unknown = { ...order, rule: { source: "wcag", id: "2.1.1", description: "x" }, evidence: { observed: "x", expected: "y" } } as Finding;
    expect(interactionOf(unknown)).toMatchObject({ needed: "unknown", steps: [] });
    expect(interactionOf({ ...order, mode: "display" } as Finding)).toBeUndefined();
  });
});

// ── 2. força da norma na família ─────────────────────────────────────────────────────────────

describe("3.6.5 item 2 — a família traz a força da norma, da base", () => {
  it("cor fora de token: force 'required' (o mesmo registro que get_ds_rules serve); id que a base não tem fica sem força", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/oficina/foco` });
      const token = families(scan.data).find((f) => f.rule.checker === "ds-token-color");
      expect(token, "família de cor fora de token").toBeDefined();
      const units = [token!.rule.id, ...(token!.rule.implements ?? [])].map((id: string) => getRuleById(id)?.force).filter(Boolean);
      expect(new Set(units).size).toBe(1);
      expect(token!.rule.force).toBe(units[0]);
      expect(token!.rule.force).toBe("required");
      for (const f of families(scan.data)) {
        const known = [f.rule.id, ...(f.rule.implements ?? [])].some((id: string) => getRuleById(id));
        if (!known) expect(f.rule.force, `${f.rule.id} sem unidade na base`).toBeUndefined();
      }
    } finally {
      await client.close();
    }
  });

  it("revisão (BAIXA 8): o knowledge-free não ganha nada — nem alsoIn entre rotas, nem o passo de interação no verify", async () => {
    // Casos que PEGARIAM o vazamento: a mesma etiqueta em duas rotas (o alsoIn não depende da base) e um achado de foco
    // visível submetido ao verify (o passo sai da condição, sem a base).
    const kf = await connect("knowledge-free");
    try {
      await kf.call("scan_page", { url: `${base}/oficina/agenda` });
      const second = await kf.call("scan_page", { url: `${base}/oficina/pedido/7` });
      expect(contrastOf(second.data, "situacao"), "contraste da etiqueta no knowledge-free").toBeDefined();
      for (const f of families(second.data)) {
        expect(f.alsoIn).toBeUndefined();
        expect(f.rule.force).toBeUndefined();
        expect(f.interaction).toBeUndefined();
      }
      expect(second.data.alsoInNote).toBeUndefined();
      const verify = await kf.call("verify_finding", {
        finding: {
          id: "agente-1",
          rule: { id: "2.4.7", source: "wcag", description: "foco visível" },
          element: { locator: "#placa", page: `${base}/oficina/foco` },
          evidence: { observed: "sem marca de foco", expected: "marca de foco", data: { expectedCondition: FOCUS_INDICATOR_CONDITION } },
          severity: "serious",
          nature: "syntactic",
          mode: "interaction",
          pathway: "heuristic",
        },
      });
      expect(verify.isError).toBe(false);
      expect(verify.data.interaction).toBeUndefined();
    } finally {
      await kf.client.close();
    }
  });
});

// ── 3. exemplo canônico e obrigações globais da tag ──────────────────────────────────────────

describe("3.6.5 item 3 — o exemplo canônico não contradiz as pendências do oráculo", () => {
  const tableExamples = (getComponentSpecs().components.table?.examples ?? []) as Array<{ name: string; html: string }>;
  const uncaptioned = tableExamples.find((e) => /<table[\s>]/i.test(e.html) && !/<caption[\s>]/i.test(e.html));
  const captioned = tableExamples.find((e) => /<caption[\s>]/i.test(e.html));
  // A cláusula que a própria pendência table-name do scan cita (e-MAG 3.9, obrigatória).
  const captionRule = { id: "govbr-3.7.0-accessibility-global-29bd6bf04fc5", force: "required" };
  it("a cláusula da pendência é a mesma que o notJudged cita", () => {
    expect(notJudged.elementPendingRule?.("table-name")).toMatchObject(captionRule);
  });

  it("(a) o exemplo servido sem caption volta com o alerta table-name (cláusula obrigatória), pelo nome e implícito; com caption, não", async () => {
    expect(uncaptioned, "algum exemplo de tabela sem caption no pacote").toBeDefined();
    expect(captioned, "algum exemplo de tabela com caption no pacote").toBeDefined();
    const { client, call } = await connect();
    try {
      const named = await call("get_component_spec", { component: "table", example: uncaptioned!.name });
      const w = (named.data.warnings as Array<Record<string, any>>).find((x) => x.type === "oracle-pending" && x.code === "table-name");
      expect(w, "alerta table-name").toBeDefined();
      expect(w!.rule).toMatchObject({ id: captionRule.id, force: "required" });
      expect(named.data.warningsNote).toMatch(/NÃO cumpre/);
      // implícito: o exemplo servido é conferido pelo que ELE tem (sem condição no teste)
      const spec = await call("get_component_spec", { component: "table", include_examples: true });
      expect(spec.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      const served = spec.data.example as { name: string; html: string };
      expect(typeof served.html).toBe("string");
      const expected = /<table[\s>]/i.test(served.html) && !/<caption[\s>]/i.test(served.html) ? 1 : 0;
      const servedWarnings = (spec.data.warnings as Array<Record<string, any>>).filter((x) => x.type === "oracle-pending" && x.code === "table-name");
      expect(servedWarnings.length).toBe(expected);
      expect(expected).toBe(1);
      // o exemplo com caption não ganha o alerta
      const ok = await call("get_component_spec", { component: "table", example: captioned!.name });
      expect((ok.data.warnings as Array<Record<string, any>>).some((x) => x.code === "table-name")).toBe(false);
    } finally {
      await client.close();
    }
  });

  it("(b) a spec e a lista de verificação trazem a obrigação global que o oráculo cobra de <table> (CAPTION)", async () => {
    const { client, call } = await connect();
    try {
      const spec = await call("get_component_spec", { component: "table" });
      const ob = spec.data.elementObligations as { items: Array<Record<string, any>> };
      expect(ob, "elementObligations").toBeDefined();
      const caption = ob.items.find((i) => i.citeAs === captionRule.id);
      expect(caption).toMatchObject({ subject: expect.stringContaining("<table>"), force: "required" });
      // forma curta (reexecução da 3.6.5): sujeito, id e força; o texto pelo id em get_ds_rules
      expect(Object.keys(caption!).sort()).toEqual(["citeAs", "force", "subject"]);
      // na lista de verificação: na 1ª página se couber sem tirar item; senão, depois dos itens (última página)
      let page = await call("get_component_spec", { component: "table", view: "checklist" });
      const pages = [page];
      while (page.data.nextCursor !== undefined) {
        page = await call("get_component_spec", { component: "table", view: "checklist", cursor: page.data.nextCursor });
        pages.push(page);
      }
      const shown = pages.filter((p) => p.data.elementObligations);
      expect(shown.length, "obrigações em uma página da lista").toBe(1);
      const ob2 = shown[0].data.elementObligations;
      expect(JSON.stringify(ob2.items ?? ob2)).toMatch(ob2.items ? new RegExp(captionRule.id) : /get_component_spec/);
      // um componente sem <table> na marcação não ganha a obrigação de tabela
      const button = await call("get_component_spec", { component: "button" });
      expect(JSON.stringify(button.data.elementObligations ?? {})).not.toContain(captionRule.id);
    } finally {
      await client.close();
    }
  });
});

// ── 4. mesma assinatura noutra rota ──────────────────────────────────────────────────────────

describe("3.6.5 item 4 — a mesma evidência em outra rota marca alsoIn", () => {
  it("a etiqueta na 2ª rota (outro elemento) aponta a da 1ª; a faixa do cabeçalho (mesmo elemento) e o mesmo elemento noutro estado, não", async () => {
    const { client, call } = await connect();
    try {
      const first = await call("scan_page", { url: `${base}/oficina/agenda`, checks: ["axe"] });
      const c1 = contrastOf(first.data, "etiqueta");
      expect(c1).toBeDefined();
      expect(c1!.alsoIn).toBeUndefined();
      const second = await call("scan_page", { url: `${base}/oficina/pedido/7`, checks: ["axe"] });
      const c2 = contrastOf(second.data, "situacao");
      expect(c2, "contraste da etiqueta na 2ª rota").toBeDefined();
      expect(c2!.evidenceSignature).toBe(c1!.evidenceSignature);
      expect(c2!.alsoIn).toEqual([{ route: "/oficina/agenda", scanId: first.data.scanId, familyId: c1!.familyId }]);
      expect(second.data.alsoInNote).toMatch(/cartão próprio/);
      // revisão (MÉDIA 2): a faixa do cabeçalho é o MESMO elemento nas duas rotas (layout compartilhado) — sem alsoIn
      const header2 = contrastOf(second.data, "faixa");
      expect(header2, "contraste da faixa do cabeçalho").toBeDefined();
      expect(contrastOf(first.data, "faixa")!.evidenceSignature).toBe(header2!.evidenceSignature);
      expect(header2!.alsoIn).toBeUndefined();
      // outro estado da mesma rota, o mesmo elemento: o mesmo fato — só a outra rota continua em alsoIn
      const third = await call("scan_page", { url: `${base}/oficina/pedido/7`, checks: ["axe"], actions: [{ action: "click", selector: "#mais" }] });
      expect(third.data.stateFingerprint).not.toBe(second.data.stateFingerprint);
      const c3 = contrastOf(third.data, "situacao");
      expect((c3!.alsoIn as Array<{ route: string }>).map((x) => x.route)).toEqual(["/oficina/agenda"]);
      // e o scan anterior, relido, vê a rota nova
      const again = await call("get_finding_details", { scanId: first.data.scanId });
      const back = contrastOf(again.data, "etiqueta");
      expect((back!.alsoIn as Array<{ route: string }>)[0].route).toBe("/oficina/pedido/7");
    } finally {
      await client.close();
    }
  });
});

// ── 5. cláusulas do checklist viram pendências da sessão ─────────────────────────────────────

describe("3.6.5 item 5 — a cláusula mensurável servida no checklist vira pendência da sessão", () => {
  it("pendingId nos itens servidos sem medida do oráculo; volta em sessionPending; pendingResolved e verify_finding a fecham", async () => {
    const { client, call } = await connect();
    try {
      const before = await call("get_component_spec", { component: "message", view: "checklist" });
      expect(before.data.pendingNote).toMatch(/Nenhum scan_page desta sessão encontrou message/);
      expect((before.data.items as Array<Record<string, any>>).some((i) => i.pendingId)).toBe(false);
      const scan = await call("scan_page", { url: `${base}/oficina/aviso` });
      expect(scan.data.coverage.componentsFound).toContain("message");
      // revisão (MÉDIA 3): um componente que nenhum scan encontrou não registra nada na rota do último scan
      const notFound = await call("get_component_spec", { component: "select", view: "checklist" });
      expect(notFound.data.pendingNote).toMatch(/Nenhum scan(_page desta sessão)? encontrou select/);
      expect((notFound.data.items as Array<Record<string, any>>).some((i) => i.pendingId)).toBe(false);
      const list = await call("get_component_spec", { component: "message", view: "checklist" });
      const items = list.data.items as Array<Record<string, any>>;
      const pending = items.filter((i) => i.pendingId);
      expect(pending.length).toBeGreaterThan(1);
      for (const i of pending) {
        expect(["required", "prohibited"]).toContain(i.force);
        expect(i.measure.automatic).toBe(false);
        expect(i.measure.strategy).not.toBe("source-code");
      }
      for (const i of items.filter((x) => x.measure.automatic)) expect(i.pendingId).toBeUndefined();
      expect(list.data.pendingNote).toMatch(/pendingResolved/);
      // posição visual: a geometria vem ALÉM da medida da estratégia (revisão MÉDIA 4)
      const positional = items.filter((i) => !i.measure.automatic && i.measure.strategy !== "keyboard-interaction" && checklist.positionHint(String(getRuleById(i.citeAs)?.originalText ?? "")));
      expect(positional.length).toBeGreaterThan(0);
      for (const i of positional) {
        expect(i.measure.geometry).toMatch(/getBoundingClientRect/);
        expect(i.measure.how).toBeTruthy();
        expect(i.pendingId).toBeDefined();
      }
      // o próximo scan devolve as cláusulas no sub-bloco checklist, por componente (sem a cláusula da 1ª como se fosse de todas)
      const next = await call("scan_page", { url: `${base}/oficina/aviso`, checks: ["axe"] });
      const block = next.data.sessionPending.checklist as { count: number; components: Array<Record<string, any>> };
      expect(block.count).toBe(pending.length);
      const message = block.components.find((c) => c.component === "message");
      expect(message).toMatchObject({ count: pending.length });
      expect(JSON.stringify(next.data.sessionPending)).not.toMatch(/"rule"/);
      expect(next.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      // pendingResolved fecha uma; verify_finding citando a cláusula fecha outra
      const [a, b] = pending;
      const resolved = await call("scan_page", { url: `${base}/oficina/aviso`, checks: ["axe"], pendingResolved: [{ id: a.pendingId, status: "conforme", reason: "medido na página" }] });
      expect(resolved.data.pendingResolution.resolved).toContain(a.pendingId);
      const verify = await call("verify_finding", {
        finding: {
          id: "agente-1",
          rule: { id: b.citeAs, source: "govbr-ds-kb", description: "cláusula do checklist" },
          element: { locator: ".br-message", page: `${base}/oficina/aviso` },
          evidence: { observed: "medido", expected: "a cláusula" },
          severity: "moderate",
          nature: "semantic",
          mode: "display",
          pathway: "heuristic",
        },
      });
      expect(verify.data.pendingResolved).toContain(b.pendingId);
    } finally {
      await client.close();
    }
  });

  it("revisão (item 5): só a página servida registra; a página seguinte registra quando o cursor é pedido", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/oficina/tabela` });
      expect(scan.data.coverage.componentsFound).toContain("table");
      const candidates = new Set(checklist.checklistPendingClauses("table").map((c) => c.id));
      const p1 = await call("get_component_spec", { component: "table", view: "checklist" });
      expect(p1.data.nextCursor, "a lista de table tem mais de uma página").toBeDefined();
      const served1 = (p1.data.items as Array<Record<string, any>>).filter((i) => candidates.has(i.citeAs));
      // os ids aparecem nos itens enquanto couberem (os itens da página não caem por causa deles); registradas, sempre
      expect(served1.length).toBeGreaterThan(0);
      for (const i of p1.data.items as Array<Record<string, any>>) if (i.pendingId) expect(candidates.has(i.citeAs)).toBe(true);
      // 3.6.6 (revisão: o teste passava com zero pendingId): a pendência registrada é a que a página mostrou com id
      const shown1 = served1.filter((i) => i.pendingId);
      expect(shown1.length, "pendingId à vista na 1ª página").toBeGreaterThan(0);
      const after1 = await call("scan_page", { url: `${base}/oficina/tabela`, checks: ["axe"] });
      expect(after1.data.sessionPending.checklist.count).toBe(served1.length);
      expect(after1.data.sessionPending.checklist.count).toBe(shown1.length);
      const p2 = await call("get_component_spec", { component: "table", view: "checklist", cursor: p1.data.nextCursor });
      const served2 = (p2.data.items as Array<Record<string, any>>).filter((i) => candidates.has(i.citeAs));
      expect(served2.length).toBeGreaterThan(0);
      const shown2 = served2.filter((i) => i.pendingId);
      expect(shown2.length, "pendingId à vista na 2ª página").toBeGreaterThan(0);
      const after2 = await call("scan_page", { url: `${base}/oficina/tabela`, checks: ["axe"] });
      expect(after2.data.sessionPending.checklist.count).toBe(served1.length + served2.length);
      expect(after2.data.sessionPending.checklist.count).toBe(shown1.length + shown2.length);
    } finally {
      await client.close();
    }
  });

  it("revisão (item 5): o sub-bloco de checklist desce à contagem pela escada do teto; o perfil sem scan_page diz que não registra", async () => {
    const block = { count: 12, items: [], checklist: { note: "n", count: 9, components: [{ component: "table", count: 5, ids: ["P-02", "P-03", "P-04"], more: 2 }, { component: "input", count: 4, ids: ["P-07"] }] } };
    const ids = session.sessionPendingCodes(block as never) as Record<string, any>;
    expect(ids.checklist).toEqual({ byComponent: { table: 5, input: 4 }, ids: ["P-02:table", "P-03:table", "P-04:table", "P-07:input"] });
    expect(session.sessionPendingChecklistCount(ids as never)).toMatchObject({ checklist: 9 });
    expect(session.sessionPendingChecklistCount(block as never)).toMatchObject({ checklist: 9 });
    const normative = await connect("normative");
    try {
      const list = await normative.call("get_component_spec", { component: "message", view: "checklist" });
      expect(list.data.pendingNote).toMatch(/não mede a página/);
      expect(list.data.pendingNote).not.toMatch(/scan_page/);
    } finally {
      await normative.client.close();
    }
  });
});

// ── 6. checksRun declara a revisita ──────────────────────────────────────────────────────────

describe("3.6.5 item 6 — checksRun declara a revisita de tokens que gerou achado", () => {
  it("menu aberto com checks:['axe']: executed traz 'tokens (revisita)' com o achado, e o omitido diz a exceção", async () => {
    const { client, call } = await connect();
    try {
      await call("scan_page", { url: `${base}/oficina/menu` });
      const open = await call("scan_page", {
        url: `${base}/oficina/menu`,
        actions: [{ action: "click", selector: "#abrir" }],
        arrival: { expanded: "#abrir" },
        checks: ["axe"],
      });
      const executed = open.data.checksRun.executed as Array<Record<string, any>>;
      const revisit = executed.find((e) => e.check === "tokens (revisita)");
      expect(revisit, "tokens (revisita) em executed").toBeDefined();
      expect(revisit!.tokenChecks).toContain("color");
      expect((revisit!.findings as string[]).length).toBeGreaterThan(0);
      const omitted = (open.data.checksRun.omitted as Array<Record<string, any>>).find((o) => o.check === "tokens");
      expect(omitted!.why).toMatch(/revisita/);
    } finally {
      await client.close();
    }
  });
});

// ── reexecução das chamadas reais (3.6.5): os acréscimos não tiram família nem item da 1ª página ──────────────

describe("3.6.5 reexecução — os acréscimos da 3.6.5 nunca tiram família da 1ª página nem item do checklist", () => {
  it("1ª página do scan: com força, passo de interação e alsoIn, o número de famílias é o mesmo de sem eles, em qualquer teto", async () => {
    const { assembleScan } = await import("../../src/responses/scan.js");
    const { buildFamilyPage } = await import("../../src/responses/families.js");
    const { unitForceOf } = await import("../../src/responses/normForce.js");
    const { FOCUS_INTERACTION } = await import("../../src/checkers/interaction.js");
    const findings = Array.from({ length: 30 }, (_, i) => ({
      id: `F-${String(i + 1).padStart(3, "0")}`,
      rule: { source: "govbr-ds-kb", id: "govbr-3.7.0-foundation-global-21b1a2733f7b", checker: "ds-token-color", description: "cor", implements: ["govbr-3.7.0-foundation-global-21b1a2733f7b", "govbr-3.7.0-development-global-137c50bea6ca"] },
      element: { locator: `main > section:nth-of-type(${i + 1}) > p.nota-${i}`, page: "http://x/a" },
      evidence: { observed: `color: #${(0x123456 + i).toString(16)} fora da paleta`, expected: "token", data: { property: "color", observed: `#${(0x123456 + i).toString(16)}`, ...(i % 3 === 0 ? { interaction: FOCUS_INTERACTION } : {}) } },
      severity: "moderate",
      nature: "syntactic",
      mode: i % 3 === 0 ? "interaction" : "display",
      pathway: "deterministic",
    })) as unknown as Finding[];
    const alsoInFor = () => ({ items: [{ route: "/uma/rota/bem/longa/de/outro/registro", scanId: "S-page-001", familyId: "FAM-0123456789ab" }], more: 1 });
    const page = (extras: boolean) => (b: number) =>
      buildFamilyPage(findings, { maxChars: b, stateFingerprint: "x", ...(extras ? { forceOf: unitForceOf, interaction: true, alsoInFor } : {}) }) as unknown as Record<string, unknown>;
    let compared = 0;
    let withForce = 0;
    let withSteps = 0;
    for (let pad = 0; pad <= 4_000; pad += 173) {
      const head = { contract: "c", kind: "scan", scanId: "S-page-002", filler: "x".repeat(pad), sessionPending: { count: 3, items: [], checklist: { note: "n", count: 3, components: [{ component: "message", count: 3, ids: ["P-01", "P-02", "P-03"] }] } } };
      const base = assembleScan({ ...head, sessionPending: { count: 0, items: [] } }, null, "S-page-002", 8_000, page(false), { firstScanPage: true });
      const withExtras = assembleScan(head, null, "S-page-002", 8_000, page(true), { firstScanPage: true });
      const n = (r: Record<string, unknown>) => (Array.isArray(r.families) ? r.families.length : 0);
      expect(n(withExtras), `pad ${pad}`).toBeGreaterThanOrEqual(n(base));
      expect(JSON.stringify(withExtras).length).toBeLessThanOrEqual(8_000);
      if (n(base) < 30) compared += 1;
      // 3.6.6 (revisão: só contagens — passaria se os extras sumissem sempre): os acréscimos estão na página quando cabem,
      // e o que saiu está marcado em compacted (ou a página não tem acréscimo nenhum e o rótulo era a diferença de uma família)
      const fams = (Array.isArray(withExtras.families) ? withExtras.families : []) as Array<Record<string, any>>;
      if (fams.some((f) => f.rule.force)) withForce += 1;
      if (fams.some((f) => f.interaction)) withSteps += 1;
      const labels = (Array.isArray(withExtras.compacted) ? withExtras.compacted : []) as string[];
      const bare = !fams.some((f) => f.rule.force || f.interaction || f.alsoIn) && n(withExtras) === n(base);
      if (fams.length && fams.some((f) => !f.rule.force)) expect(labels.some((l) => l.startsWith("extras")) || bare, `pad ${pad}: força fora sem rótulo`).toBe(true);
    }
    expect(compared, "casos em que o teto corta famílias").toBeGreaterThan(5);
    expect(withForce, "tetos com a força na página").toBeGreaterThan(compared / 2);
    expect(withSteps, "tetos com o passo na página").toBeGreaterThan(0);
  });

  it("checklist: os itens da 1ª página (e das seguintes) são os mesmos com e sem pendingId, geometria e obrigações, nos 36 componentes", () => {
    const obligations = { note: "n", items: Array.from({ length: 4 }, (_, i) => ({ subject: "<input> <button>", citeAs: `govbr-3.7.0-accessibility-global-${String(i).padStart(12, "0")}`, force: "required" })) };
    let withCandidates = 0;
    let withIds = 0;
    let withObligations = 0;
    const components = Object.keys(getComponentSpecs().components);
    for (const component of components) {
      const ids = Object.fromEntries(checklist.checklistPendingClauses(component).map((c, i) => [c.id, `P-${100 + i}`]));
      let cursor: number | undefined = 0;
      while (cursor !== undefined) {
        const plain = checklist.componentChecklist(component, cursor);
        const full = checklist.componentChecklist(component, cursor, undefined, { pendingIds: ids, elementObligations: obligations });
        expect((full.items as Array<{ citeAs: string }>).map((i) => i.citeAs), `${component}@${cursor}`).toEqual((plain.items as Array<{ citeAs: string }>).map((i) => i.citeAs));
        expect(JSON.stringify(full).length, `${component}@${cursor}`).toBeLessThanOrEqual(RESPONSE_BUDGET);
        // 3.6.6 (revisão: só comparava os itens — passaria se os acréscimos sumissem sempre): com pendências, a nota de
        // pendência está em toda página (nunca abaixo da nota curta) e há pendingId à vista quando a página tem candidata
        if (Object.keys(ids).length) expect(full.pendingNote, `${component}@${cursor}`).toBeTruthy();
        const its = full.items as Array<{ citeAs: string; pendingId?: string }>;
        if (its.some((i) => ids[i.citeAs])) {
          withCandidates += 1;
          if (its.some((i) => i.pendingId)) withIds += 1;
        }
        if (cursor === 0 && full.elementObligations) withObligations += 1;
        cursor = plain.nextCursor as number | undefined;
      }
    }
    expect(withIds, "páginas com pendingId à vista").toBe(withCandidates);
    expect(withObligations, "1ªs páginas com as obrigações dos elementos").toBeGreaterThanOrEqual(components.length / 2);
  });

  it("verify_finding: achado de display não ganha bloco interaction; 'unknown' só sem confirmação; confirmado no estado da receita → needed:false", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/oficina/foco` });
      const token = families(scan.data).find((f) => f.rule.checker === "ds-token-color")!;
      const full = (await call("get_finding_details", { ids: [token.memberIds[0]], detail: "full" })).data.findings[0] as Finding;
      expect(full.mode).toBe("display");
      const display = await call("verify_finding", { finding: full, live: true, scanId: scan.data.scanId });
      expect(display.data.verdict).toBe("confirmed");
      expect(display.data.interaction).toBeUndefined();
      // o agente marca o mesmo fato como de interação: o predicado o confirma no estado da receita → a receita basta
      const asInteraction = { ...JSON.parse(JSON.stringify(full)), id: "agente-2", mode: "interaction" };
      const confirmed = await call("verify_finding", { finding: asInteraction, live: true, scanId: scan.data.scanId });
      expect(confirmed.data.verdict).toBe("confirmed");
      expect(confirmed.data.interaction).toMatchObject({ needed: false, text: expect.stringMatching(/confirmou/) });
      // sem confirmação (sem live), o oráculo não sabe o passo: "unknown"
      const unconfirmed = await call("verify_finding", { finding: { ...asInteraction, id: "agente-3" }, scanId: scan.data.scanId });
      expect(unconfirmed.data.verdict).not.toBe("confirmed");
      expect(unconfirmed.data.interaction.needed).toBe("unknown");
    } finally {
      await client.close();
    }
  });
});
