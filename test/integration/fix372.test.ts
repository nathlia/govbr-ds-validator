/**
 * 3.7.2 (lista única de 04/11, seção A; rastreios dev-371-a/dev-371-b). Fixtures sintéticas e neutras (uma padaria de
 * bairro): nenhum markup, texto, seletor ou id das telas A/B, do fluxo ou dos controles.
 *   A1. C01 aponta o botão só com ícone embutido em outro componente do DS (Input, Select) como candidato a investigar —
 *       pendência `icon-only-embedded` com a nota do exemplo oficial — nunca achado; o verify_finding não o contradiz.
 *   A2. O alsoIn que liga a família a OUTRA rota nunca sai pelo orçamento (forma curta com a rota); o get_finding_details
 *       avisa quando os ids pedidos são de rotas diferentes.
 *   A3. O componente novo no estado (não estava no estado anterior da sessão) vem primeiro no investigate, nas formas
 *       compactas e no next; a forma de itens nunca mostra cláusula de menos componentes que a compacta.
 *   A4. get_ds_rules com `component` traz uma linha com as outras cláusulas mensuráveis do componente e o checklist.
 *   A5. Famílias de regras só best-practice do axe trazem as cláusulas obrigatórias do e-MAG do mesmo assunto como
 *       referências secundárias (só ids da base).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
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
import * as checklist from "../../src/tools/componentChecklist.js";
import { BUTTON_LABEL_REQUIRED, ICON_ONLY_BUTTON_CONDITION, embeddedHostOf, embeddedIconButtonExamples, iconOnlyNonCircleButton } from "../../src/checkers/iconOnlyButton.js";
import { bestPracticeReferences } from "../../src/checkers/axe.js";
import { EXTRAS_ALSO_IN_KEPT, assembleScan, familyAlsoInOut, familyAlsoInShort, familyNotesOut, investigateFor } from "../../src/responses/scan.js";
import { CROSS_ROUTE, ScanSession, shortRoute } from "../../src/scan/session.js";
import { buildFamilyPage } from "../../src/responses/families.js";
import { resetFindingIds, type Finding } from "../../src/schema/finding.js";
import { makeElement } from "../helpers/fixtures.js";

const SVG = `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16"></rect></svg>`;
const ICON = (name: string) => `<i class="fas fa-${name}" aria-hidden="true" style="display:inline-block;width:16px;height:16px"></i>`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head>
<body><a href="#conteudo">Ir para o conteúdo</a><header class="br-header"><span class="header-title">Padaria</span></header>
<main id="conteudo">${body}</main><footer class="br-footer">fim</footer></body></html>`;
}

const CONTRAST = `<span style="color:#ffffff;background:#999999;padding:2px">Fornada</span>`;

const PAGES: Record<string, string> = {
  "/padaria/busca": page(
    "Busca — Padaria",
    `<h1>Pães</h1>
     <div class="br-input"><label for="q">Buscar pão</label><input id="q" type="search"><button id="lupa" class="br-button" type="button" aria-label="Buscar">${ICON("search")}</button></div>
     <div class="br-select"><div class="br-input"><label for="s">Forno</label><input id="s" type="text"><button id="gatilho" class="br-button" type="button" aria-label="Exibir lista" tabindex="-1">${ICON("angle-down")}</button></div></div>
     <button id="imprimir" class="br-button" type="button" aria-label="Imprimir">${SVG}</button>`,
  ),
  "/padaria/simples": page("Simples — Padaria", `<h1>Bolos</h1><button id="enviar" class="br-button primary" type="button">Enviar</button>`),
  // A2: a mesma evidência de contraste em duas rotas, em elementos diferentes
  "/padaria/pedidos/11": page("Pedido 11 — Padaria", `<h1>Pedido 11</h1><p id="p11">${CONTRAST}</p>`),
  "/padaria/agenda": page("Agenda — Padaria", `<h1>Agenda</h1><div><ul><li id="a1">${CONTRAST}</li></ul></div>`),
  // A3: a mensagem só aparece depois da ação
  "/padaria/encomenda": page(
    "Encomenda — Padaria",
    `<h1>Encomenda</h1>
     <div class="br-input"><label for="nome">Nome</label><input id="nome" type="text"></div>
     <div class="br-checkbox"><input id="c1" type="checkbox"><label for="c1">Embrulhar</label></div>
     <div class="br-radio"><input id="r1" type="radio" name="r"><label for="r1">Retirar</label></div>
     <button id="mandar" class="br-button primary" type="button" onclick="document.getElementById('aviso').innerHTML='<div class=&quot;br-message danger&quot; role=&quot;alert&quot;><div class=&quot;icon&quot;><i class=&quot;fas fa-times-circle&quot; aria-hidden=&quot;true&quot;></i></div><div class=&quot;content&quot;>Preencha o nome.</div></div>'">Mandar</button>
     <div id="aviso"></div>`,
  ),
  // A5: cabeçalho de tabela vazio (best-practice do axe)
  "/padaria/tabela": page(
    "Tabela — Padaria",
    `<h1>Preços</h1><table><caption>Preços</caption><thead><tr><th scope="col">Pão</th><th scope="col"></th></tr></thead><tbody><tr><td>Francês</td><td><a href="#x">ver</a></td></tr></tbody></table>`,
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
  const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "govbr-372-")) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fix372", version: "1" });
  await srv.connect(b);
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    return { text, isError: Boolean(r.isError), data: JSON.parse(text) as Record<string, any> };
  };
  return { client, call };
}

async function allFindings(call: Awaited<ReturnType<typeof connect>>["call"], scanId: string): Promise<Array<Record<string, any>>> {
  const out: Array<Record<string, any>> = [];
  let cursor: number | undefined = 0;
  while (cursor !== undefined) {
    const r = await call("get_finding_details", { scanId, view: "findings", detail: "full", cursor, maxChars: 60_000 });
    out.push(...((r.data.findings ?? []) as Array<Record<string, any>>));
    cursor = r.data.nextCursor as number | undefined;
  }
  return out;
}

// ── A1 ─────────────────────────────────────────────────────────────────────────────────────────

describe("3.7.2 A1 — C01 aponta o botão embutido em Input/Select como candidato, nunca achado", () => {
  beforeEach(() => resetFindingIds());

  it("o exemplo oficial que coincide sai dos exemplos (mecânico): Select pelo gatilho, Input pela lupa", () => {
    const names = new Set(Object.values(getComponentSpecs().components).flatMap((s) => s.examples.map((e) => (e as { name?: string }).name)));
    for (const e of embeddedIconButtonExamples()) expect(names.has(e.example), e.example).toBe(true);
    const icon = (o: Parameters<typeof makeElement>[0]) =>
      makeElement({ ...o, content: { textContent: "", hasVisibleText: false, hasIconOnly: true, iconOnlyVisual: true } });
    const trigger = icon({ hostComponents: ["br-input", "br-select"], outerHTML: `<button class="br-button" aria-label="Exibir lista"><i class="fas fa-angle-down"></i></button>` });
    expect(iconOnlyNonCircleButton(trigger)).toBe(false);
    const t = embeddedHostOf(trigger)!;
    expect(t.host).toBe("br-input");
    expect(t.examples).toContain("select-simples");
    const lupa = embeddedHostOf(icon({ hostComponents: ["br-input"], outerHTML: `<button class="br-button" aria-label="Buscar"><i class="fas fa-search"></i></button>` }))!;
    expect(lupa.examples).toContain("input-highlight");
    expect(lupa.examples.every((x) => x.startsWith("input-"))).toBe(true);
    expect(embeddedHostOf(icon({ hostComponents: ["br-card"] }))).toBeNull();
  });

  it("na página: pendência icon-only-embedded com a nota do exemplo oficial; o C01 só no botão fora de hospedeiro", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/padaria/busca`, checks: ["structure"], maxChars: 60_000 });
      const findings = await allFindings(call, scan.data.scanId);
      expect(findings.filter((f) => f.rule.id === BUTTON_LABEL_REQUIRED).map((f) => f.element.locator)).toEqual(["#imprimir"]);
      const items = scan.data.checksRun.pageLevel.notMeasured as Array<Record<string, any>>;
      const cand = items.find((i) => i.code === "icon-only-embedded")!;
      expect(cand).toBeDefined();
      expect(cand.count).toBe(2);
      expect(cand.examples).toEqual(["#lupa", "#gatilho"]);
      expect(cand.observed).toMatch(/a marcação coincide com o exemplo oficial do DS \(.*(input-|select-)/);
      expect(cand.todo).toMatch(/^a investigar/);
      expect(cand.rule).toMatchObject({ id: BUTTON_LABEL_REQUIRED, force: "required" });
      expect(cand.pendingId).toMatch(/^P-\d+$/);
      // nada disso é achado: nenhum finding nos dois botões
      expect(findings.some((f) => ["#lupa", "#gatilho"].includes(f.element.locator))).toBe(false);
      // o verify_finding não contradiz (o fato existe) e não confirma (o oráculo não decide): sem predicado decisivo
      const claim = {
        live: true,
        finding: {
          id: "agente-lupa",
          rule: { id: BUTTON_LABEL_REQUIRED, source: "govbr-ds-kb", description: "rótulo" },
          element: { locator: "#lupa", page: `${base}/padaria/busca` },
          evidence: { observed: "só ícone", expected: "rótulo ou circle", data: { expectedCondition: ICON_ONLY_BUTTON_CONDITION } },
          severity: "moderate", nature: "syntactic", mode: "display", pathway: "heuristic",
        },
      };
      const v = await call("verify_finding", claim);
      expect(v.data.verdict).not.toBe("rejected");
      expect(v.data.verdict).not.toBe("confirmed");
      expect(v.text).toMatch(/exemplo oficial/);
      const ok = await call("scan_page", { url: `${base}/padaria/simples`, checks: ["structure"], maxChars: 60_000 });
      expect(JSON.stringify(ok.data)).not.toMatch(/icon-only-embedded/);
    } finally {
      await client.close();
    }
  });

  it("knowledge-free: nada do candidato (o scan do perfil é só o axe)", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      const scan = await call("scan_page", { url: `${base}/padaria/busca`, maxChars: 60_000 });
      expect(scan.text).not.toMatch(/icon-only-embedded|7ef75d42ac65/);
    } finally {
      await client.close();
    }
  });
});

// ── A2 ─────────────────────────────────────────────────────────────────────────────────────────

describe("3.7.2 A2 — alsoIn de outra rota sobrevive ao orçamento; aviso de rotas no get_finding_details", () => {
  const fam = (alsoIn: Array<Record<string | symbol, unknown>>) => ({ families: [{ familyId: "FAM-a", alsoIn, alsoInMore: 1 }], alsoInNote: "nota longa" });
  const here = "/padaria/agenda";
  // a marca vem da sessão (rota inteira); aqui, à mão
  const other = { route: "/padaria/pedidos/11", scanId: "S-page-001", familyId: "FAM-b", [CROSS_ROUTE]: true };
  const same = { route: here, scanId: "S-page-002", familyId: "FAM-c", [CROSS_ROUTE]: false };
  const plain = (a: Record<string, unknown>) => JSON.parse(JSON.stringify(a));

  it("forma curta: a de outra rota guarda a rota; fora: só a da mesma rota sai; a nota curta fica com a de outra rota", () => {
    const short = familyAlsoInShort(fam([other, same])) as any;
    expect(plain(short.families[0])).toEqual({ familyId: "FAM-a", alsoIn: [plain(other), { scanId: same.scanId, familyId: same.familyId }] });
    const out = familyAlsoInOut(short) as any;
    expect(plain(out.families[0].alsoIn)).toEqual([plain(other)]);
    expect(plain(familyAlsoInOut(familyAlsoInShort(fam([same]))))).toEqual({ families: [{ familyId: "FAM-a" }], alsoInNote: "nota longa" });
    expect((familyNotesOut(fam([other])) as any).alsoInNote).toBe("alsoIn: outro fato, cartão próprio");
    expect((familyNotesOut(fam([same])) as any).alsoInNote).toBeUndefined();
    // a marca não sai no JSON
    expect(JSON.stringify(short)).not.toMatch(/crossRoute|CROSS/);
  });

  it("revisão MÉDIA 4: outra rota pela rota inteira — duas rotas que colidem em shortRoute continuam outras", () => {
    const prefix = "/servicos/orgao-fisca/acompanha/vistorias/detalhe/registro";
    const uuid = (head: string) => `${head}-0000-4000-8000-00000000beef`;
    for (const [r1, r2] of [[`${prefix}/3025`, `${prefix}/3038`], [`/pedidos/${uuid("11111111")}`, `/pedidos/${uuid("22222222")}`]]) {
      expect(shortRoute(`http://x${r1}`)).toBe(shortRoute(`http://x${r2}`));
      const s = new ScanSession();
      s.recordFamilies("S-page-001", `http://x${r1}`, "fp1", [{ signature: "sig", familyId: "FAM-1", locators: ["main > p.a"] }]);
      const got = s.alsoIn("sig", "S-page-002", `http://x${r2}`, "fp2", ["main > p.b"]);
      expect(got.items.length).toBe(1);
      expect(got.items[0][CROSS_ROUTE]).toBe(true);
      const kept = familyAlsoInOut(familyAlsoInShort(fam(got.items as never))) as any;
      expect(plain(kept.families[0].alsoIn)).toEqual([{ route: shortRoute(`http://x${r1}`), scanId: "S-page-001", familyId: "FAM-1" }]);
      // a mesma rota noutro estado: marca false, sai no aperto
      const sameRoute = s.alsoIn("sig", "S-page-003", `http://x${r1}`, "fp3", ["main > p.c"]);
      expect(sameRoute.items[0][CROSS_ROUTE]).toBe(false);
    }
  });

  it("em todo teto, a família na 1ª página mantém o alsoIn de outra rota (com a rota)", () => {
    const findings = Array.from({ length: 14 }, (_, i) => ({
      id: `F-${String(i + 1).padStart(3, "0")}`,
      rule: { source: "axe-core", id: i % 2 ? "color-contrast" : "label", description: "x" },
      element: { locator: `main > ul > li:nth-of-type(${i + 1}) > span.item-${i}`, page: `http://x${here}` },
      evidence: { observed: `obs ${i}`, expected: "esperado" },
      severity: "serious", nature: "syntactic", mode: "display", pathway: "deterministic",
    })) as unknown as Finding[];
    const pager = (b: number) =>
      buildFamilyPage(findings, { maxChars: b, stateFingerprint: "x", alsoInFor: () => ({ items: [other, same] as never, more: 0 }) }) as unknown as Record<string, unknown>;
    let exercised = 0;
    let kept = 0;
    for (const maxChars of [2_500, 3_000, 4_000, 5_000, 6_000, 8_000]) {
      for (let pad = 0; pad <= 3_000; pad += 300) {
        const head = { contract: "c", kind: "scan", scanId: "S-page-003", url: `http://x${here}`, state: { observed: { url: `http://x${here}` } }, filler: "w".repeat(pad) };
        const r = assembleScan(head, null, "S-page-003", maxChars, pager, { firstScanPage: true });
        expect(JSON.stringify(r).length).toBeLessThanOrEqual(maxChars);
        for (const f of (r.families ?? []) as Array<Record<string, any>>) {
          expect(f.alsoIn, `teto ${maxChars} pad ${pad}`).toEqual(expect.arrayContaining([expect.objectContaining({ route: other.route, scanId: other.scanId, familyId: other.familyId })]));
        }
        const labels = Array.isArray(r.compacted) ? (r.compacted as string[]) : [];
        if (labels.some((l) => l === "extras:alsoIn" || l === "extras" || l === EXTRAS_ALSO_IN_KEPT)) exercised += 1;
        // revisão BAIXA 7: "extras" (todos fora) nunca com o alsoIn de outra rota na página; com ele, extras:alsoIn-kept
        const withAlsoIn = ((r.families ?? []) as Array<Record<string, unknown>>).some((f) => f.alsoIn);
        if (withAlsoIn) expect(labels.includes("extras"), `teto ${maxChars} pad ${pad}`).toBe(false);
        if (labels.includes(EXTRAS_ALSO_IN_KEPT)) kept += 1;
      }
    }
    expect(exercised).toBeGreaterThan(0);
    void kept;
  });

  it("get_finding_details por ids de duas rotas: routesWarning com as duas e o número de cartões; ids de uma rota: nada", async () => {
    const { client, call } = await connect();
    try {
      const s1 = await call("scan_page", { url: `${base}/padaria/pedidos/11`, checks: ["axe"], maxChars: 60_000 });
      const s2 = await call("scan_page", { url: `${base}/padaria/agenda`, checks: ["axe"], maxChars: 60_000 });
      const f1 = (await allFindings(call, s1.data.scanId)).find((f) => f.rule.id === "color-contrast")!;
      const f2 = (await allFindings(call, s2.data.scanId)).find((f) => f.rule.id === "color-contrast")!;
      expect(f1 && f2).toBeTruthy();
      // a família da 2ª rota liga à 1ª pelo alsoIn, com a rota
      const fam2 = (s2.data.families as Array<Record<string, any>>).find((f) => f.rule.id === "color-contrast")!;
      expect(fam2.alsoIn).toEqual(expect.arrayContaining([expect.objectContaining({ scanId: s1.data.scanId, route: "/padaria/pedidos/11" })]));
      const mixed = await call("get_finding_details", { ids: [f1.id, f2.id] });
      expect(mixed.data.routesWarning.routes.map((r: { route: string }) => r.route).sort()).toEqual(["/padaria/agenda", "/padaria/pedidos/11"]);
      expect(mixed.data.routesWarning.note).toMatch(/2 cartões, um por rota/);
      const one = await call("get_finding_details", { ids: [f1.id] });
      expect(one.data.routesWarning).toBeUndefined();
    } finally {
      await client.close();
    }
  });
});

// ── A3 ─────────────────────────────────────────────────────────────────────────────────────────

describe("3.7.2 A3 — componente novo no estado primeiro; a forma de itens não mostra menos que a compacta", () => {
  const strong = (c: string) => checklist.unmeasuredStrongCount(c);
  const clauses = (c: string) => checklist.investigateClauses(c);
  const components = ["radio", "checkbox", "select", "table", "tag", "breadcrumb", "button", "list", "message"];

  it("investigateFor: o novo vai à frente nos itens, no next e na forma compacta; sem novo, a ordem de sempre", () => {
    const plain = investigateFor(components, "S-page-002", () => ({}), strong, clauses)! as any;
    expect(plain.items[0].component).not.toBe("message");
    expect(plain.newInState).toBeUndefined();
    const inv = investigateFor(components, "S-page-002", () => ({}), strong, clauses, new Set(["message"]))! as any;
    expect(inv.items[0]).toMatchObject({ component: "message", newInState: true });
    expect(inv.newInState).toEqual(["message"]);
    expect(inv.next.arguments.component).toBe("message");
    // o resto na ordem de sempre
    expect(inv.items.slice(1).map((i: { component: string }) => i.component)).toEqual(plain.items.slice(0, 4).map((i: { component: string }) => i.component));
  });

  it("forma de itens: os componentes de more levam a forma compacta; nunca menos componentes com cláusula que a compacta", () => {
    const findings = [{
      id: "F-001", rule: { source: "axe-core", id: "label", description: "x" },
      element: { locator: "main > input", page: "http://x/f" }, evidence: { observed: "o", expected: "e" },
      severity: "serious", nature: "syntactic", mode: "display", pathway: "deterministic",
    }] as unknown as Finding[];
    const pager = (b: number) => buildFamilyPage(findings, { maxChars: b, stateFingerprint: "x" }) as unknown as Record<string, unknown>;
    const inv = investigateFor(components, "S-page-002", () => ({}), strong, clauses, new Set(["message"]))!;
    let maxCompact = 0;
    let itemsShown = -1;
    const firsts = new Set<string>();
    for (let pad = 0; pad <= 7_000; pad += 50) {
      const r = assembleScan({ contract: "c", kind: "scan", scanId: "S-page-002", filler: "w".repeat(pad), investigate: inv }, null, "S-page-002", 8_000, pager, { firstScanPage: true });
      const i = r.investigate as Record<string, any>;
      if (i.items) {
        const shown = new Set([...i.items.filter((x: any) => x.clauses?.length).map((x: any) => x.component), ...Object.keys(i.more?.clauses ?? {})]);
        itemsShown = Math.max(itemsShown, shown.size);
        expect(i.items[0].component).toBe("message");
      } else if (i.clauses) {
        maxCompact = Math.max(maxCompact, Object.keys(i.clauses).length);
        firsts.add(Object.keys(i.clauses)[0]);
        expect(i.newInState).toEqual(["message"]);
      } else if (i.investigateNote) {
        expect(i.investigateNote).toMatch(/não couberam: message/);
      }
      if (i.next?.hint) expect(i.next.hint).toMatch(/^cláusulas de message/);
      expect(i.next.arguments.component).toBe("message");
    }
    expect(itemsShown).toBeGreaterThanOrEqual(maxCompact);
    expect(maxCompact).toBeGreaterThan(0);
    expect([...firsts]).toEqual(["message"]);
  });

  it("na sessão: a mensagem que aparece depois da ação é o 1º do investigate do novo estado", async () => {
    const { client, call } = await connect();
    try {
      const s1 = await call("scan_page", { url: `${base}/padaria/encomenda`, maxChars: 60_000 });
      const before = s1.data.investigate;
      const names1 = before.items ? before.items.map((i: { component: string }) => i.component) : before.components;
      expect(names1.some((n: string) => n.startsWith("message"))).toBe(false);
      const s2 = await call("scan_page", { url: `${base}/padaria/encomenda`, actions: [{ action: "click", selector: "#mandar" }], compareToScanId: s1.data.scanId, maxChars: 60_000 });
      const inv = s2.data.investigate;
      expect(inv.newInState).toEqual(["message"]);
      expect(inv.items[0].component).toBe("message");
      expect(inv.next.arguments.component).toBe("message");
    } finally {
      await client.close();
    }
  });
});

// ── A4 ─────────────────────────────────────────────────────────────────────────────────────────

describe("3.7.2 A4 — get_ds_rules com component aponta as outras cláusulas mensuráveis e o checklist", () => {
  it("uma linha com ids da base que a resposta não mostrou + a chamada do checklist; sem component, nada", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("get_ds_rules", { query: "foco no botão fechar ao exibir a mensagem", component: "message" });
      expect(r.text.length).toBeLessThanOrEqual(8_000);
      const line = r.data.componentClauses as string;
      expect(line).toMatch(/^message: \d+ outra\(s\) cláusula\(s\) mensurável\(is\)/);
      expect(line).toMatch(/get_component_spec\{component:"message", view:"checklist"\}$/);
      expect(line.length).toBeLessThanOrEqual(checklist.COMPONENT_CLAUSES_LINE_MAX);
      const ids = line.match(/govbr-3\.7\.0-[a-z]+-[a-z]+-[0-9a-f]{12}/g) ?? [];
      expect(ids.length).toBeGreaterThan(0);
      const shown = new Set((r.data.results as Array<{ citeAs: string }>).map((c) => c.citeAs));
      for (const id of ids) {
        expect(getRuleById(id), id).toBeDefined();
        expect(shown.has(id)).toBe(false);
      }
      const free = await call("get_ds_rules", { query: "foco no botão fechar ao exibir a mensagem" });
      expect(free.data.componentClauses).toBeUndefined();
    } finally {
      await client.close();
    }
  });
});

// ── A5 ─────────────────────────────────────────────────────────────────────────────────────────

describe("3.7.2 A5 — best-practice do axe traz a norma obrigatória do e-MAG como referência secundária", () => {
  const bp = (id: string, help = "e") => ({ rule: { id, source: "axe-core", description: "x" }, evidence: { observed: "o", expected: help, data: { bestPractice: true } } }) as unknown as Finding;

  it("cláusulas fortes da recomendação filtradas por tópico (até 2 acima do piso); sem casamento, só emag-N.N", () => {
    const cases = [
      ["empty-table-header", "3.10", "Table header text should not be empty"],
      ["page-has-heading-one", "1.3", "Page should contain a level-one heading"],
      ["tabindex", "1.4", "Elements should not have tabindex greater than zero"],
      ["skip-link", "1.5", "The skip-link target should exist and be focusable"],
    ] as const;
    let withClause = 0;
    for (const [rule, rec, help] of cases) {
      const refs = bestPracticeReferences(bp(rule, help))!;
      expect(refs.at(-1)).toEqual({ id: `emag-${rec}` });
      const kb = refs.filter((r) => r.id.startsWith("govbr-"));
      if (rule === "empty-table-header") expect(kb).toEqual([]);
      expect(kb.length).toBeLessThanOrEqual(2);
      if (kb.length) withClause += 1;
      for (const r of kb) {
        const unit = getRuleById(r.id)!;
        expect(unit, r.id).toBeDefined();
        expect(unit.force).toBe(r.force);
        expect(["required", "prohibited"]).toContain(unit.force);
        expect(unit.emagReferences).toContain(rec);
      }
    }
    expect(withClause).toBeGreaterThan(0);
    // sem texto que case: só a recomendação
    expect(bestPracticeReferences(bp("page-has-heading-one", "zzz qqq"))).toEqual([{ id: "emag-1.3" }]);
    expect(bestPracticeReferences({ ...bp("color-contrast"), evidence: { observed: "o", expected: "e", data: {} } } as unknown as Finding)).toBeUndefined();
    expect(bestPracticeReferences(bp("regra-sem-par"))).toBeUndefined();
  });

  it("no aperto da 1ª página as referências saem (marcadas) antes de custar família", () => {
    const findings = Array.from({ length: 20 }, (_, i) => ({
      id: `F-${String(i + 1).padStart(3, "0")}`,
      rule: { source: "axe-core", id: i % 2 ? "empty-table-header" : "page-has-heading-one", description: "x" },
      element: { locator: `main > table:nth-of-type(${i + 1}) > thead > tr > th.c-${i}`, page: "http://x/p" },
      evidence: { observed: `obs ${i}`, expected: "esperado", data: { bestPractice: true } },
      severity: "minor", nature: "syntactic", mode: "display", pathway: "deterministic",
    })) as unknown as Finding[];
    const pager = (refs: boolean) => (b: number) =>
      buildFamilyPage(findings, { maxChars: b, stateFingerprint: "x", ...(refs ? { referencesOf: bestPracticeReferences } : {}) }) as unknown as Record<string, unknown>;
    const n = (r: Record<string, unknown>) => (Array.isArray(r.families) ? r.families.length : 0);
    let dropped = 0;
    let kept = 0;
    for (let pad = 0; pad <= 5_000; pad += 125) {
      const head = { contract: "c", kind: "scan", scanId: "S-page-001", filler: "z".repeat(pad) };
      const plain = assembleScan(head, null, "S-page-001", 8_000, pager(false), { firstScanPage: true });
      const withRefs = assembleScan(head, null, "S-page-001", 8_000, pager(true), { firstScanPage: true });
      expect(n(withRefs), `pad ${pad}`).toBeGreaterThanOrEqual(n(plain));
      expect(JSON.stringify(withRefs).length).toBeLessThanOrEqual(8_000);
      const fams = (withRefs.families ?? []) as Array<Record<string, any>>;
      if (fams.some((f) => f.rule.references)) kept += 1;
      if (fams.some((f) => !f.rule.references)) {
        dropped += 1;
        const labels = Array.isArray(withRefs.compacted) ? (withRefs.compacted as string[]) : [];
        expect(labels.includes("extras:normas") || labels.includes("extras") || n(withRefs) >= n(plain), `pad ${pad}`).toBe(true);
      }
    }
    expect(kept).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(0);
  });

  it("no scan: a família empty-table-header traz rule.references; knowledge-free não", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/padaria/tabela`, checks: ["axe"], maxChars: 60_000 });
      const fam = (scan.data.families as Array<Record<string, any>>).find((f) => f.rule.id === "empty-table-header")!;
      expect(fam).toBeDefined();
      expect(fam.rule.references).toEqual([{ id: "emag-3.10" }]);
    } finally {
      await client.close();
    }
    const kf = await connect("knowledge-free");
    try {
      const scan = await kf.call("scan_page", { url: `${base}/padaria/tabela`, maxChars: 60_000 });
      expect(scan.text).not.toMatch(/"references"/);
    } finally {
      await kf.client.close();
    }
  });
});

// ── revisão independente (HIGH 1, MÉDIA 2/3) ────────────────────────────────────────────────────────

describe("3.7.2 revisão — pendência de elementos, estado anterior com inventário e da mesma rota", () => {
  beforeEach(() => resetFindingIds());

  it("HIGH 1: o verify do C01 noutro botão não fecha o candidato embutido; o verify num dos elementos dele fecha", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/padaria/busca`;
      const scan = await call("scan_page", { url, checks: ["structure"], maxChars: 60_000 });
      const cand = (scan.data.checksRun.pageLevel.notMeasured as Array<Record<string, any>>).find((i) => i.code === "icon-only-embedded")!;
      expect(JSON.stringify(scan.data)).not.toMatch(/boundLocators|elementBound/);
      const c01 = (await allFindings(call, scan.data.scanId)).find((f) => f.rule.id === BUTTON_LABEL_REQUIRED && f.element.locator === "#imprimir")!;
      const v1 = await call("verify_finding", { live: true, finding: { ...c01, pathway: "heuristic" } });
      expect(v1.data.verdict).toBe("confirmed");
      expect(JSON.stringify(v1.data.pendingResolved ?? [])).not.toContain(cand.pendingId);
      const again = await call("scan_page", { url, checks: ["structure"], maxChars: 60_000 });
      const still = (again.data.checksRun.pageLevel.notMeasured as Array<Record<string, any>>).find((i) => i.code === "icon-only-embedded")!;
      expect(still.pendingId).toBe(cand.pendingId);
      expect(still.resolved).toBeUndefined();
      const onLupa = {
        id: "agente-lupa",
        rule: { id: BUTTON_LABEL_REQUIRED, source: "govbr-ds-kb", description: "rótulo" },
        element: { locator: "#lupa", page: url },
        evidence: { observed: "só ícone", expected: "rótulo ou circle", data: { expectedCondition: ICON_ONLY_BUTTON_CONDITION } },
        severity: "moderate", nature: "syntactic", mode: "display", pathway: "heuristic",
      };
      const v2 = await call("verify_finding", { live: true, finding: onLupa });
      expect(JSON.stringify(v2.data.pendingResolved ?? [])).toContain(cand.pendingId);
    } finally {
      await client.close();
    }
  });

  it("MÉDIA 2: scan só do axe e depois o completo do mesmo estado — nada é 'novo' (o axe não inventaria componentes)", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/padaria/encomenda`;
      await call("scan_page", { url, checks: ["axe"], maxChars: 60_000 });
      const full = await call("scan_page", { url, maxChars: 60_000 });
      expect(full.data.investigate.newInState).toBeUndefined();
      // compareToScanId apontando para um scan sem inventário: também nada novo
      const axeOnly = await call("scan_page", { url, checks: ["axe"], actions: [{ action: "click", selector: "#mandar" }], maxChars: 60_000 });
      const after = await call("scan_page", { url, actions: [{ action: "click", selector: "#mandar" }], compareToScanId: axeOnly.data.scanId, maxChars: 60_000 });
      expect(after.data.investigate.newInState).toBeUndefined();
    } finally {
      await client.close();
    }
  });

  it("MÉDIA 3: sem compareToScanId, o anterior é do mesmo modelo de rota — outra página não faz componentes 'novos'", async () => {
    const { client, call } = await connect();
    try {
      await call("scan_page", { url: `${base}/padaria/simples`, maxChars: 60_000 });
      const other = await call("scan_page", { url: `${base}/padaria/encomenda`, maxChars: 60_000 });
      expect(other.data.investigate.newInState).toBeUndefined();
      // na mesma rota, depois da ação, a mensagem é nova (sem compareToScanId)
      const after = await call("scan_page", { url: `${base}/padaria/encomenda`, actions: [{ action: "click", selector: "#mandar" }], maxChars: 60_000 });
      expect(after.data.investigate.newInState).toEqual(["message"]);
    } finally {
      await client.close();
    }
  });
});
