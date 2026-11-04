/**
 * 3.6.6 (D-155) — revisão independente do delta da 3.6.5. Fixtures sintéticas e neutras (uma biblioteca de bairro):
 * nenhum markup, texto, seletor ou id das telas A/B, do fluxo ou dos controles. Cada teste reproduz o MECANISMO e falha
 * na 3.6.5:
 *   1. (ALTA) condição contextual com ações: needed:false só quando o predicado DECIDIU no estado da receita; receita que
 *      não leva ao fato (só abre a modal, nenhum Tab dentro dela, passo quebrado) → needed:"unknown" com o que faltou;
 *   2. (MÉDIA) os acréscimos da família saem em degraus (notas → alsoIn → passos → força), cada um marcado em `compacted`,
 *      passos e força família a família — nunca tudo ou nada;
 *   3. (MÉDIA) get_finding_details(ids) projeta o passo com as ações da receita do lote (concorda com a família);
 *   4. (MÉDIA) nenhuma pendência registrada sem id à vista: só a cláusula com pendingId mostrado vira pendência; a lista
 *      nunca desce abaixo da nota curta;
 *   5. (BAIXA) o alsoIn curto guarda o par scanId + familyId.
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
import { RESPONSE_BUDGET } from "../../src/responses/contract.js";
import * as checklist from "../../src/tools/componentChecklist.js";
import type { Finding } from "../../src/schema/finding.js";
import { CROSS_ROUTE } from "../../src/scan/session.js";

function page(title: string, body: string, script = ""): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head>
<body><a href="#conteudo">Ir para o conteúdo</a><header class="br-header"><span class="header-title">Biblioteca</span></header>
<main id="conteudo">${body}</main><footer class="br-footer">fim</footer><script>${script}</script></body></html>`;
}

const PAGES: Record<string, string> = {
  // Um diálogo que o botão abre (e foca o fechar); o fechar esconde e manda o foco para o body (não volta ao invocador).
  "/biblioteca/emprestimo": page(
    "Empréstimo — Biblioteca",
    `<h1>Empréstimo</h1><button id="renovar" type="button">Renovar</button>
     <div id="dialogo" class="br-modal" role="dialog" aria-modal="true" aria-label="Renovação" hidden><div class="br-modal-body">Renovado por 7 dias.</div>
     <button id="ok" type="button" class="br-button primary">Ok</button></div>`,
    `document.getElementById('renovar').onclick=function(){document.getElementById('dialogo').hidden=false;document.getElementById('ok').focus();};
     document.getElementById('ok').onclick=function(){document.getElementById('dialogo').hidden=true;document.body.focus();};`,
  ),
  // Um campo com tabindex positivo (1º foco fora de ordem) e um botão que mostra um parágrafo.
  "/biblioteca/acervo": page(
    "Acervo — Biblioteca",
    `<h1>Acervo</h1><input id="titulo" tabindex="2" aria-label="Título"><button id="sinopse" type="button">Sinopse</button><p id="texto" hidden>Um romance.</p>`,
    `document.getElementById('sinopse').onclick=function(){document.getElementById('texto').hidden=false;};`,
  ),
  // Vários componentes do DS numa página (o scan os encontra pela classe br-*).
  "/biblioteca/painel": page(
    "Painel — Biblioteca",
    `<h1>Painel</h1>
     <div class="br-message info" role="status"><div class="content">Devolução amanhã.</div></div>
     <div class="br-modal" role="dialog" aria-modal="true" aria-label="Aviso" hidden><div class="br-modal-body">x</div></div>
     <nav class="br-step" aria-label="Etapas"><div class="step-progress"><button class="step-progress-btn" type="button">1</button></div></nav>
     <div class="br-carousel" aria-label="Destaques"><div class="carousel-page">Livro</div></div>
     <div class="br-checkbox"><input id="aviso" type="checkbox"><label for="aviso">Avisar</label></div>
     <div class="br-radio"><input id="retirar" type="radio" name="entrega"><label for="retirar">Retirar</label></div>
     <div class="br-tab"><nav class="tab-nav"><ul><li class="tab-item"><button type="button">Livros</button></li></ul></nav></div>
     <div class="br-table"><table><caption>Livros</caption><thead><tr><th scope="col">Título</th></tr></thead><tbody><tr><td>A</td></tr></tbody></table></div>`,
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

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "govbr-366-")) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fix366", version: "1" });
  await srv.connect(b);
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    return { text, isError: Boolean(r.isError), data: JSON.parse(text) as Record<string, any> };
  };
  return { client, call };
}

// ── 1. condição contextual: needed:false só com decisão no estado da receita ─────────────────────

describe("3.6.6 item 1 — condição contextual com ações: 'sem passo' só quando o predicado decidiu", () => {
  const RESTORE = "govbr-3.7.0-accessibility-modal-f36c91d7073c";
  const CONTAIN = "govbr-3.7.0-accessibility-modal-744f67e17bec";
  const claim = (id: string, rule: string, condition: string) => ({
    id,
    rule: { id: rule, source: "govbr-ds-kb", description: "foco do diálogo" },
    element: { locator: "#dialogo", page: `${base}/biblioteca/emprestimo` },
    evidence: { observed: "o foco não fica onde deveria", expected: "foco conforme a norma", data: { expectedCondition: condition } },
    severity: "serious",
    nature: "semantic",
    mode: "interaction",
    pathway: "heuristic",
  });

  it("receita que só abre o diálogo, nenhum Tab dentro dele, ou passo quebrado: needed:'unknown' com o que faltou observar", async () => {
    const { client, call } = await connect();
    try {
      const open = [{ action: "click", selector: "#renovar" }];
      const openOnly = await call("verify_finding", { finding: claim("ag-1", RESTORE, "focus-returns-to-invoker-on-close"), live: true, actions: open });
      expect(openOnly.data.verdict).toBe("unverifiable");
      expect(openOnly.data.interaction.needed).toBe("unknown");
      expect(openOnly.data.interaction.missing).toMatch(/fechamento/);
      expect(openOnly.data.interaction.stateSteps).toEqual(open);
      const noTab = await call("verify_finding", { finding: claim("ag-2", CONTAIN, "tab-stays-within-modal"), live: true, actions: open });
      expect(noTab.data.verdict).toBe("unverifiable");
      expect(noTab.data.interaction.needed).toBe("unknown");
      expect(noTab.data.interaction.missing).toMatch(/Tab/);
      const broken = await call("verify_finding", { finding: claim("ag-3", RESTORE, "focus-returns-to-invoker-on-close"), live: true, actions: [{ action: "click", selector: "#nao-existe" }] });
      expect(broken.data.interaction.needed).toBe("unknown");
      expect(broken.data.interaction.missing).toMatch(/não foi reproduzido/);
      // guarda: a receita que abre E fecha leva ao fato — o predicado decide, e a receita basta
      const full = await call("verify_finding", { finding: claim("ag-4", RESTORE, "focus-returns-to-invoker-on-close"), live: true, actions: [...open, { action: "click", selector: "#ok" }] });
      expect(full.data.verdict).toBe("confirmed");
      expect(full.data.interaction).toMatchObject({ needed: false });
    } finally {
      await client.close();
    }
  });

  it("revisão da 3.6.6 (MÉDIA 1): a receita alcança o estado e o predicado não decide por outro motivo (sujeito errado) → sem pedido de passo", async () => {
    const { client, call } = await connect();
    try {
      const recipe = [{ action: "click", selector: "#renovar" }, { action: "click", selector: "#ok" }];
      // o localizador é o invocador, não o diálogo: o predicado vê o estado e diz que o sujeito não é a janela modal
      const wrongSubject = { ...claim("ag-5", RESTORE, "focus-returns-to-invoker-on-close"), element: { locator: "#renovar", page: `${base}/biblioteca/emprestimo` } };
      const v = await call("verify_finding", { finding: wrongSubject, live: true, actions: recipe });
      expect(v.data.verdict).toBe("unverifiable");
      expect(v.data.verification.binding.state.reached).toBe(true);
      expect(v.data.interaction.needed).toBe(false);
      expect(v.data.interaction.text).toMatch(/alcança o estado/);
      expect(v.data.interaction.missing).toMatch(/não é uma janela modal/);
      expect(v.data.interaction.stateSteps).toBeUndefined();
      expect(v.data.interaction.note).toBeUndefined();
      // guarda: falta da receita (o fechamento não foi observado) continua pedindo o passo
      const gap = await call("verify_finding", { finding: claim("ag-6", RESTORE, "focus-returns-to-invoker-on-close"), live: true, actions: [recipe[0]] });
      expect(gap.data.interaction).toMatchObject({ needed: "unknown", stateSteps: [recipe[0]] });
      expect(gap.data.interaction.note).toMatch(/state\.steps/);
    } finally {
      await client.close();
    }
  });
});

// ── 3. get_finding_details(ids) concorda com a família ───────────────────────────────────────────

describe("3.6.6 item 3 — get_finding_details(ids) projeta o passo com a receita do lote do achado", () => {
  it("ordem de foco num scan com ações: nem família nem detalhe dizem 'Tab a partir do carregamento'; sem ações, os dois dizem", async () => {
    const { client, call } = await connect();
    try {
      const withActions = await call("scan_page", { url: `${base}/biblioteca/acervo`, actions: [{ action: "click", selector: "#sinopse" }] });
      const fam = (withActions.data.families as Array<Record<string, any>>).find((f) => f.rule.checker === "ds-page-focus-order");
      expect(fam, "família de ordem de foco").toBeDefined();
      expect(fam!.interaction).toBeUndefined();
      for (const detail of ["summary", "evidence"]) {
        const det = await call("get_finding_details", { ids: [fam!.memberIds[0]], detail });
        expect(det.data.findings[0].interaction, `detail ${detail}`).toBeUndefined();
      }
      const plain = await call("scan_page", { url: `${base}/biblioteca/acervo` });
      const famPlain = (plain.data.families as Array<Record<string, any>>).find((f) => f.rule.checker === "ds-page-focus-order");
      expect(famPlain!.interaction).toMatchObject({ needed: true, steps: [{ action: "press", key: "Tab" }] });
      const detPlain = await call("get_finding_details", { ids: [famPlain!.memberIds[0]] });
      expect(detPlain.data.findings[0].interaction).toMatchObject({ needed: famPlain!.interaction.needed, steps: famPlain!.interaction.steps });
    } finally {
      await client.close();
    }
  });
});

// ── 2 e 5. degraus dos acréscimos na 1ª página do scan ────────────────────────────────────────────

describe("3.6.6 itens 2 e 5 — os acréscimos saem em degraus marcados; o alsoIn curto guarda scanId + familyId", () => {
  it("em todo teto: família nenhuma a menos que sem acréscimos; o que sai está em compacted; força fica onde os passos já saíram", async () => {
    const { assembleScan } = await import("../../src/responses/scan.js");
    const { buildFamilyPage } = await import("../../src/responses/families.js");
    const { unitForceOf } = await import("../../src/responses/normForce.js");
    const { FOCUS_INTERACTION } = await import("../../src/checkers/interaction.js");
    const findings = Array.from({ length: 24 }, (_, i) => ({
      id: `F-${String(i + 1).padStart(3, "0")}`,
      rule: { source: "govbr-ds-kb", id: "govbr-3.7.0-foundation-global-21b1a2733f7b", checker: "ds-token-color", description: "cor" },
      element: { locator: `main > article:nth-of-type(${i + 1}) > span.selo-${i}`, page: "http://x/b" },
      evidence: { observed: `color: #${(0x224466 + i).toString(16)} fora da paleta`, expected: "token", data: { property: "color", observed: `#${(0x224466 + i).toString(16)}`, ...(i % 2 === 0 ? { interaction: FOCUS_INTERACTION } : {}) } },
      severity: "moderate",
      nature: "syntactic",
      mode: i % 2 === 0 ? "interaction" : "display",
      pathway: "deterministic",
    })) as unknown as Finding[];
    // a mesma evidência noutra rota em uma família de cada três (pelo familyId: estável entre as montagens da página)
    // 3.7.2 (revisão BAIXA 8): e, numa família de cada três (outro resto), a mesma evidência noutro ESTADO da mesma rota —
    // marca CROSS_ROUTE da sessão (false); esse item sai no aperto, o de outra rota (true) não.
    const alsoInFor = (_s: string, familyId: string) => {
      const k = familyId.charCodeAt(familyId.length - 1) % 3;
      return k === 0
        ? { items: [{ route: "/outra/rota/com/um/caminho/longo", scanId: "S-page-001", familyId: "FAM-00aa11bb22cc", [CROSS_ROUTE]: true }], more: 0 }
        : k === 1
          ? { items: [{ route: "/b", scanId: "S-page-003", familyId: "FAM-33dd44ee55ff", [CROSS_ROUTE]: false }], more: 0 }
          : { items: [], more: 0 };
    };
    // 3.7.2 (A2): o alsoIn de OUTRA rota nunca sai pelo orçamento (fica com a família, na forma curta com a rota) — a base
    // da comparação passa a ter o alsoIn; força e passo de interação continuam sem custar família.
    const page = (extras: boolean | "alsoIn") => (b: number) =>
      buildFamilyPage(findings, { maxChars: b, stateFingerprint: "x", ...(extras === "alsoIn" ? { alsoInFor } : extras ? { forceOf: unitForceOf, interaction: true, alsoInFor } : {}) }) as unknown as Record<string, unknown>;
    const full = (page(true)(1_000_000).families as Array<Record<string, any>>);
    let graduated = 0;
    let shortAlsoIn = 0;
    let cut = 0;
    let unlabeled = 0;
    let sameRouteDropped = 0;
    let keptLabel = 0;
    for (let pad = 0; pad <= 5_000; pad += 61) {
      const head = { contract: "c", kind: "scan", scanId: "S-page-002", url: "http://x/b", state: { observed: { url: "http://x/b" } }, filler: "y".repeat(pad), sessionPending: { count: 0, items: [] } };
      const plain = assembleScan(head, null, "S-page-002", 8_000, page("alsoIn"), { firstScanPage: true });
      const none = assembleScan(head, null, "S-page-002", 8_000, page(false), { firstScanPage: true });
      const r = assembleScan(head, null, "S-page-002", 8_000, page(true), { firstScanPage: true });
      const fams = (Array.isArray(r.families) ? r.families : []) as Array<Record<string, any>>;
      const n = (x: Record<string, unknown>) => (Array.isArray(x.families) ? x.families.length : 0);
      expect(n(r), `pad ${pad}`).toBeGreaterThanOrEqual(n(plain));
      // revisão BAIXA 8: o alsoIn de outra rota custa no máximo uma família frente à página sem acréscimo nenhum
      expect(n(r), `pad ${pad}: custo do alsoIn de outra rota`).toBeGreaterThanOrEqual(n(none) - 1);
      expect(JSON.stringify(r).length).toBeLessThanOrEqual(8_000);
      const labels = (Array.isArray(r.compacted) ? r.compacted : []) as string[];
      // Sem rótulo só no último recurso: nada de acréscimo na página e o rótulo "extras" era a diferença de uma família
      // (então a página tem as mesmas famílias da sem acréscimos).
      // 3.7.2 (A2): o alsoIn de outra rota fica (não é acréscimo que sai); "nada de acréscimo" = sem força e sem passo.
      const bare = !fams.some((f) => f.rule.force || f.interaction) && n(r) >= n(plain);
      if (bare && !labels.some((l) => l.startsWith("extras"))) unlabeled += 1;
      const marked = (part: string) => labels.includes(part) || labels.includes("extras") || bare;
      // o que saiu da família está marcado em compacted
      fams.forEach((f, i) => {
        const was = full[i];
        if (was.rule.force && !f.rule.force) expect(marked("extras:força"), `pad ${pad}: força fora sem rótulo`).toBe(true);
        if (was.interaction && !f.interaction) expect(marked("extras:passos"), `pad ${pad}: passo fora sem rótulo`).toBe(true);
        if (was.alsoIn && !f.alsoIn) {
          expect(marked("extras:alsoIn"), `pad ${pad}: alsoIn fora sem rótulo`).toBe(true);
          // só o da mesma rota sai
          expect(was.alsoIn[0].familyId, `pad ${pad}`).toBe("FAM-33dd44ee55ff");
          sameRouteDropped += 1;
        }
        // item 5: em qualquer forma, o alsoIn guarda scanId e familyId; 3.7.2: o de outra rota sempre fica, e com a rota
        if (was.alsoIn?.[0]?.familyId === "FAM-00aa11bb22cc") expect(f.alsoIn, `pad ${pad}`).toBeDefined();
        for (const a of (f.alsoIn ?? []) as Array<Record<string, unknown>>) {
          if (a.familyId === "FAM-00aa11bb22cc") {
            expect(a).toMatchObject({ scanId: "S-page-001", familyId: "FAM-00aa11bb22cc", route: "/outra/rota/com/um/caminho/longo" });
            // a forma curta (quando o degrau rodou): só rota, scanId e familyId — sem alsoInMore
            if (labels.includes("extras:alsoIn") || labels.includes("extras:alsoIn-kept")) expect(Object.keys(a).sort()).toEqual(["familyId", "route", "scanId"]);
            shortAlsoIn += 1;
          } else {
            expect(a).toMatchObject({ scanId: "S-page-003", familyId: "FAM-33dd44ee55ff" });
            if (labels.includes("extras:alsoIn")) expect(Object.keys(a).sort()).toEqual(["familyId", "scanId"]);
          }
        }
        if (labels.includes("extras:alsoIn") || labels.includes("extras:alsoIn-kept")) expect(f).not.toHaveProperty("alsoInMore");
      });
      // revisão BAIXA 7: "extras" (todos fora) nunca com alsoIn na página
      if (fams.some((f) => f.alsoIn)) expect(labels.includes("extras"), `pad ${pad}`).toBe(false);
      if (labels.includes("extras:alsoIn-kept")) keptLabel += 1;
      if (fams.length && n(r) < full.length) cut += 1;
      // degrau: algum passo já saiu e a força ainda está em alguma família (a 3.6.5 tirava os dois juntos)
      if (fams.some((f, i) => full[i].interaction && !f.interaction) && fams.some((f) => f.rule.force)) graduated += 1;
    }
    expect(cut, "tetos que cortam famílias").toBeGreaterThan(5);
    expect(graduated, "páginas em que passos saíram e a força ficou").toBeGreaterThan(0);
    expect(shortAlsoIn, "páginas com o alsoIn (de outra rota, com a rota)").toBeGreaterThan(0);
    expect(sameRouteDropped, "o alsoIn da mesma rota saiu em algum teto").toBeGreaterThan(0);
    expect(keptLabel, "rótulo extras:alsoIn-kept em algum teto").toBeGreaterThan(0);
    // o último recurso sem rótulo é exceção (o rótulo marca a saída nos demais tetos)
    expect(unlabeled, "tetos em que o rótulo saiu").toBeLessThan(cut / 4);
  });
});

// ── 4. pendência só com id à vista; a lista nunca abaixo da nota curta ─────────────────────────────

describe("3.6.6 item 4 — nenhuma pendência registrada sem id à vista", () => {
  it("lista de verificação: toda página com pendências tem a nota de pendência (nunca abaixo da nota curta), nos 36 componentes", () => {
    const obligations = { note: "n", items: Array.from({ length: 4 }, (_, i) => ({ subject: "<input> <button>", citeAs: `govbr-3.7.0-accessibility-global-${String(i).padStart(12, "0")}`, force: "required" })) };
    for (const component of Object.keys(getComponentSpecs().components)) {
      const ids = Object.fromEntries(checklist.checklistPendingClauses(component).map((c, i) => [c.id, `P-${String(10 + i).padStart(2, "0")}`]));
      if (!Object.keys(ids).length) continue;
      let cursor: number | undefined = 0;
      while (cursor !== undefined) {
        const r = checklist.componentChecklist(component, cursor, undefined, { pendingIds: ids, elementObligations: obligations });
        expect(r.pendingNote, `${component}@${cursor}`).toBeTruthy();
        expect(JSON.stringify(r).length).toBeLessThanOrEqual(RESPONSE_BUDGET);
        const items = r.items as Array<{ citeAs: string; pendingId?: string }>;
        if (items.some((i) => ids[i.citeAs] && !i.pendingId)) expect(String(r.pendingNote), `${component}@${cursor}`).toMatch(/sem pendingId/);
        cursor = r.nextCursor as number | undefined;
      }
    }
  });

  it("servidor: as pendências de checklist registradas são exatamente as que a lista mostrou com pendingId", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/biblioteca/painel`, checks: ["structure"] });
      const found = scan.data.coverage.componentsFound as string[];
      const components = found.filter((c) => checklist.checklistPendingClauses(c).length > 0);
      expect(components.length).toBeGreaterThan(3);
      const shown: Record<string, Set<string>> = {};
      let candidatesServed = 0;
      for (const component of components) {
        shown[component] = new Set();
        const candidates = new Set(checklist.checklistPendingClauses(component).map((c) => c.id));
        let cursor: number | undefined = 0;
        while (cursor !== undefined) {
          const r = await call("get_component_spec", { component, view: "checklist", ...(cursor ? { cursor } : {}) });
          const items = r.data.items as Array<{ citeAs: string; pendingId?: string }>;
          expect(r.data.pendingNote, `${component}@${cursor}`).toBeTruthy();
          for (const i of items) {
            if (candidates.has(i.citeAs)) candidatesServed += 1;
            if (i.pendingId) shown[component].add(i.pendingId);
          }
          cursor = r.data.nextCursor as number | undefined;
        }
      }
      expect(candidatesServed).toBeGreaterThan(0);
      const after = await call("scan_page", { url: `${base}/biblioteca/painel`, checks: ["axe"], maxChars: 60_000 });
      const block = after.data.sessionPending.checklist as { count: number; components: Array<{ component: string; count: number; ids: string[] }> };
      const totalShown = Object.values(shown).reduce((n, s) => n + s.size, 0);
      expect(block.count).toBe(totalShown);
      for (const c of block.components) {
        expect(c.count, c.component).toBe(shown[c.component].size);
        for (const id of c.ids) expect(shown[c.component].has(id), `${id} (${c.component}) foi mostrado`).toBe(true);
      }
      // um id mostrado fecha por pendingResolved
      const [component] = Object.keys(shown).filter((c) => shown[c].size);
      const id = [...shown[component]][0];
      const resolved = await call("scan_page", { url: `${base}/biblioteca/painel`, checks: ["axe"], pendingResolved: [{ id, status: "não se aplica", reason: "o componente não tem a parte" }] });
      expect(resolved.data.pendingResolution.resolved).toContain(id);
    } finally {
      await client.close();
    }
  });

  it("revisão da 3.6.6 (BAIXA 2): a cláusula servida sem pendingId fica contada em sessionPending.checklist (unregistered), sem custar família", async () => {
    const { client, call } = await connect();
    try {
      await call("scan_page", { url: `${base}/biblioteca/painel`, checks: ["structure"] });
      const unshown: Record<string, Set<string>> = {};
      // 3.7.0: a lista ordenada por mensurabilidade e o procedimento curto põem todos os ids de checkbox, tab e radio à vista;
      // a de table (já na página) ainda serve cláusula sem id — é ela que mantém o caso coberto.
      for (const component of ["checkbox", "tab", "radio", "table"]) {
        const candidates = new Set(checklist.checklistPendingClauses(component).map((c) => c.id));
        let cursor: number | undefined = 0;
        while (cursor !== undefined) {
          const r = await call("get_component_spec", { component, view: "checklist", ...(cursor ? { cursor } : {}) });
          for (const i of r.data.items as Array<{ citeAs: string; pendingId?: string }>) {
            if (candidates.has(i.citeAs) && !i.pendingId) (unshown[component] ??= new Set()).add(i.citeAs);
          }
          cursor = r.data.nextCursor as number | undefined;
        }
      }
      const total = Object.values(unshown).reduce((n, s) => n + s.size, 0);
      expect(total, "cláusulas servidas sem pendingId (checkbox, tab, radio, table)").toBeGreaterThan(0);
      const after = await call("scan_page", { url: `${base}/biblioteca/painel`, checks: ["axe"], maxChars: 60_000 });
      const block = after.data.sessionPending.checklist as { note: string; components: Array<{ component: string; unregistered?: number }> };
      for (const [component, set] of Object.entries(unshown)) {
        expect(block.components.find((c) => c.component === component)?.unregistered, component).toBe(set.size);
      }
      expect(block.note).toMatch(/unregistered/);
      // forma de contagem (1ª página no teto padrão): o contador fica ao lado, por componente
      const { sessionPendingChecklistCount } = await import("../../src/scan/session.js");
      const counted = sessionPendingChecklistCount(after.data.sessionPending) as Record<string, any>;
      expect(Object.values(counted.checklistUnregistered as Record<string, number>).reduce((n, x) => n + x, 0)).toBe(total);
    } finally {
      await client.close();
    }
    // não custa família: na 1ª página do scan ele desce com o sub-bloco e sai na escada dos extras
    const { assembleScan } = await import("../../src/responses/scan.js");
    const { buildFamilyPage } = await import("../../src/responses/families.js");
    const findings = Array.from({ length: 20 }, (_, i) => ({
      id: `F-${String(i + 1).padStart(3, "0")}`,
      rule: { source: "axe-core", id: "color-contrast", description: "contraste" },
      element: { locator: `main > ul > li:nth-of-type(${i + 1}) > span.etiqueta-${i}`, page: "http://x/c" },
      evidence: { observed: `contraste ${(2 + i / 10).toFixed(2)}:1`, expected: "4.5:1" },
      severity: "serious", nature: "syntactic", mode: "display", pathway: "deterministic",
    })) as unknown as Finding[];
    const page = (b: number) => buildFamilyPage(findings, { maxChars: b, stateFingerprint: "x" }) as unknown as Record<string, unknown>;
    const sp = { count: 2, items: [], checklist: { note: "n", count: 2, components: [{ component: "checkbox", count: 2, ids: ["P-01", "P-02"], unregistered: 6 }, { component: "tab", count: 0, ids: [], unregistered: 6 }] } };
    let cut = 0;
    for (let pad = 0; pad <= 5_000; pad += 97) {
      const head = { contract: "c", kind: "scan", scanId: "S-page-003", filler: "z".repeat(pad) };
      const without = assembleScan({ ...head, sessionPending: { count: 0, items: [] } }, null, "S-page-003", 8_000, page, { firstScanPage: true });
      const withIt = assembleScan({ ...head, sessionPending: sp }, null, "S-page-003", 8_000, page, { firstScanPage: true });
      const n = (x: Record<string, unknown>) => (Array.isArray(x.families) ? x.families.length : 0);
      expect(n(withIt), `pad ${pad}`).toBeGreaterThanOrEqual(n(without));
      if (n(without) < 20) cut += 1;
    }
    expect(cut).toBeGreaterThan(5);
  });
});
