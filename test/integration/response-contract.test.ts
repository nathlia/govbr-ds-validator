/**
 * 3.0.0 (NAT-99): contrato de resposta `oraculo-resposta/1.0.0` pelo protocolo MCP.
 *
 * Um teste por exemplo do contrato (planejamento/atual/contrato-resposta-exemplos/01–07): confere
 * a ESTRUTURA (campos, vocabulário, ordem de leitura) e as MENSAGENS FIXAS, não os valores voláteis
 * (ids, contagens, textos da base). Os exemplos não são copiados para cá: as formas esperadas estão
 * escritas abaixo. Depois, o orçamento (≤ 8.000 caracteres em toda resposta inicial listada), a
 * continuação sem laço, e ausência/ambiguidade/erro sempre com próximo passo.
 *
 * Fixtures sintéticas e neutras (nenhum markup, texto ou seletor das telas A/B nem dos controles).
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
import { ABSENCE_NOTE } from "../../src/responses/absence.js";
import { CONTRACT, MESSAGES, ACTION_LABELS, factNotEvaluated, RESPONSE_BUDGET } from "../../src/responses/contract.js";
import { getKnowledgeBase } from "../../src/data/knowledge.js";

const BUTTONS = Array.from({ length: 60 }, (_, i) => `<button class="br-button fora-do-ds-${i}" type="button">Opção ${i}</button>`).join("\n");
const PAGES: Record<string, string> = {
  "/oficina": `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Agenda da oficina comunitária</title></head>
<body><main><h1>Agenda da oficina</h1>
  <div class="br-button" role="button">Inscrever</div>
  <button class="br-button" id="abrir" type="button">Detalhes</button>
  <div class="br-modal" id="janela" role="dialog" aria-modal="true" aria-labelledby="t" hidden><div class="br-modal-header" id="t">Detalhes</div>
    <div class="br-input"><label for="n">Nome</label><input id="n"></div></div>
</main><script>document.getElementById('abrir').addEventListener('click', () => { document.getElementById('janela').hidden = false; });</script></body></html>`,
  // S-03 em miniatura: muitas observações (classes fora do DS) não podem estourar a resposta.
  "/muitas-classes": `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Catálogo de sementes</title></head>
<body><main><h1>Catálogo</h1>${BUTTONS}</main></body></html>`,
};

let http: Server;
let base = "";
let client: Client;

function textOf(result: { content?: unknown }): string {
  return (result.content as Array<{ text: string }>).map((c) => c.text).join("");
}
async function raw(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  return { text: textOf(r), isError: Boolean(r.isError) };
}
async function call(name: string, args: Record<string, unknown>) {
  return JSON.parse((await raw(name, args)).text);
}

beforeAll(async () => {
  http = createHttpServer((req, res) => {
    const body = PAGES[new URL(req.url ?? "/", "http://x").pathname];
    if (!body) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-contract-")), toolProfile: "evaluation" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "contract", version: "1" });
  await server.connect(b);
  await client.connect(a);
});

afterAll(async () => {
  await client.close();
  await closeBrowser();
  await new Promise((r) => http.close(() => r(undefined)));
});

const CARD_KEYS = ["rank", "ids", "citeAs", "status", "force", "modality", "requirement", "why", "toVerify", "evidence", "applicability", "source", "more"];
const NEXT_KEYS = ["action", "label", "what", "tool"];

function expectNext(steps: Array<Record<string, unknown>>) {
  expect(steps.length).toBeGreaterThan(0);
  expect(steps.length).toBeLessThanOrEqual(3);
  for (const s of steps) {
    expect(Object.keys(s)).toEqual(expect.arrayContaining(NEXT_KEYS));
    expect(s.label).toBe(ACTION_LABELS[s.action as keyof typeof ACTION_LABELS]);
    // arguments nunca leva marcador a preencher
    expect(JSON.stringify(s.arguments ?? {})).not.toMatch(/<[^>]+>|\.\.\./);
  }
}

function expectCard(card: Record<string, any>) {
  expect(Object.keys(card)).toEqual(expect.arrayContaining(CARD_KEYS));
  expect(card.status).toBe("investigate");
  expect(card.applicability).toBe("unknown");
  expect(card.ids[0]).toBe(card.citeAs);
  expect(Object.keys(card.requirement)).toEqual(expect.arrayContaining(["heading", "text", "complete"]));
  expect(card.requirement.text.length).toBeLessThanOrEqual(600);
  expect(card.toVerify.length).toBeGreaterThan(0);
  expect(card.toVerify.length).toBeLessThanOrEqual(3);
  expect(card.evidence.length).toBeLessThanOrEqual(2);
  for (const e of card.evidence) expect(["observed", "initial", "after-interaction"]).toContain(e.state);
  expect(card.more.next).toEqual({ tool: "get_ds_rules", arguments: { id: card.citeAs } });
  expect(Object.keys(card.source)).toEqual(["standard", "version", "url"]);
}

describe("contrato — exemplos 01–07 (estrutura e mensagens fixas)", () => {
  it("01 lacuna parcial: cartões + investigação curada + lacuna sem id, registryRefs rotulados, absenceNote", async () => {
    // O conceito do ex. 01 está com auditoria pendente (guidance-1.0.0): servido só com GOVBR_RETRIEVAL_GUIDANCE=pending.
    const previous = process.env.GOVBR_RETRIEVAL_GUIDANCE;
    process.env.GOVBR_RETRIEVAL_GUIDANCE = "pending";
    try {
      const { text } = await raw("get_ds_rules", { query: "página selecionada só muda de cor", component: "pagination" });
      expect(text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      const r = JSON.parse(text);
      // 3.1.0: `messages` só aparece quando um cartão usa um código; a busca 1.1.0 devolve aqui um único
      // cartão (a cláusula de cores de estado da paginação), que não usa nenhum.
      expect(Object.keys(r).filter((k) => k !== "messages")).toEqual(["contract", "kind", "status", "reading", "kb", "query", "results", "investigation", "gaps", "page", "next", "absenceNote"]);
      expect(r).toMatchObject({ contract: CONTRACT, kind: "retrieval", status: "partial-match", reading: MESSAGES.reading, absenceNote: ABSENCE_NOTE });
      expect(Object.keys(r.kb)).toEqual(["dsVersion", "knowledgeVersion", "ranking", "vocabulary", "guidance"]);
      expect(Object.keys(r.query)).toEqual(expect.arrayContaining(["terms", "expansions", "componentHint", "globalsAllowed"]));
      for (const code of Object.keys(r.messages ?? {})) expect(r.messages[code]).toBe(MESSAGES[code as keyof typeof MESSAGES]);
      r.results.forEach(expectCard);
      expect(r.investigation.concept).toBe("guidance-1.0.0#estado-atual-de-item");
      expect(r.investigation.toVerify.length).toBeLessThanOrEqual(3);
      expect(r.investigation.implementation).toMatchObject({ code: "implementation", message: MESSAGES.implementation, next: { tool: "get_component_spec", arguments: { component: "pagination" } } });
      const gap = r.gaps.find((g: { kind: string }) => g.kind === "no-clause-in-kb");
      expect(gap).toMatchObject({ message: MESSAGES["gap-no-clause"], registryNote: MESSAGES["registry-only"] });
      expect(gap.registryRefs.map((x: { ref: string }) => x.ref)).toEqual(["wcag:4.1.2", "wcag:1.3.1"]);
      for (const ref of gap.registryRefs) expect(ref).toMatchObject({ status: "registry-only", note: MESSAGES["registry-ref"] });
      // Nenhum id em gaps fora da base ou do registro WCAG.
      for (const rel of gap.related ?? []) expect(getKnowledgeBase().byId.has(rel.id)).toBe(true);
      expect(Object.keys(r.page)).toEqual(["returned", "matched", "cursor", "stop", "note"]);
      expect(["relevance-floor", "budget", "limit"]).toContain(r.page.stop);
      expectNext(r.next);
      expect(r.next.map((n: { action: string }) => n.action)).toEqual(expect.arrayContaining(["measure-condition", "reproduce-state"]));
      // Desligável (§15.6c): sem orientação, nada de investigation nem lacuna curada.
      const off = await call("get_ds_rules", { query: "página selecionada só muda de cor", component: "pagination", vocabulary: false });
      expect(off.investigation).toBeUndefined();
      expect(off.gaps.some((g: { kind: string }) => g.kind === "no-clause-in-kb")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.GOVBR_RETRIEVAL_GUIDANCE;
      else process.env.GOVBR_RETRIEVAL_GUIDANCE = previous;
    }
    // Padrão: conceito com auditoria pendente não é servido.
    const plain = await call("get_ds_rules", { query: "página selecionada só muda de cor", component: "pagination" });
    expect(plain.investigation).toBeUndefined();
    expect(plain.kb.guidance).toBe("off");
  });

  it("02 ausência: no-match, lacuna mecânica, 3 próximos passos, absenceNote", async () => {
    const r = await call("get_ds_rules", { query: "xyzzy quux", component: "button" });
    expect(Object.keys(r)).toEqual(["contract", "kind", "status", "reading", "kb", "query", "results", "gaps", "page", "next", "absenceNote"]);
    expect(r).toMatchObject({ status: "no-match", results: [], absenceNote: ABSENCE_NOTE });
    expect(r.gaps).toEqual([{ kind: "unmatched-terms", about: "quux xyzzy", message: MESSAGES["gap-unmatched"] }]);
    expect(r.page).toEqual({ returned: 0, matched: 0, cursor: null, stop: "no-match", note: MESSAGES["no-match-floor"] });
    expectNext(r.next);
    expect(r.next.map((n: { action: string }) => n.action)).toEqual(["request-detail", "request-detail", "keep-uncertain"]);
    expect(r.next[1]).toMatchObject({ tool: "get_component_spec", arguments: { component: "button" } });
  });

  it("03 ambígua: sinal + grupos com a chamada exata; os cartões são as mesmas unidades e a mesma ordem do ranking", async () => {
    const r = await call("get_ds_rules", { query: "fechar" });
    expect(r).toMatchObject({ status: "ambiguous", ambiguity: { message: MESSAGES.ambiguous } });
    const groups = r.ambiguity.groups;
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const g of groups.filter((x: { group: string }) => x.group !== "outros")) {
      expect(g.next).toEqual({ tool: "get_ds_rules", arguments: { query: "fechar", component: g.group } });
    }
    const outros = groups.find((x: { group: string }) => x.group === "outros");
    // 3.3.0 (N-16): o grupo "outros" também traz a chamada exata (o 1º membro).
    if (outros) {
      expect(Object.keys(outros)).toEqual(["group", "matched", "members", "next"]);
      expect(outros.next).toEqual({ tool: "get_ds_rules", arguments: { query: "fechar", component: outros.members[0] } });
    }
    // Revisão NAT-99: ambiguidade não troca o conjunto de resultados.
    expect(r.results.length).toBe(5);
    r.results.forEach(expectCard);
    const plain = await call("get_ds_rules", { query: "fechar", component: "global" });
    expect(plain.status).not.toBe("ambiguous");
    const ranked = await call("get_ds_rules", { query: "fechar", vocabulary: true, limit: 5 });
    expect(ranked.results.map((c: { citeAs: string }) => c.citeAs)).toEqual(r.results.map((c: { citeAs: string }) => c.citeAs));
    expect(r.page.cursor).toMatch(/^c1\./);
    const page2 = await call("get_ds_rules", { query: "fechar", cursor: r.page.cursor });
    expect(page2.ambiguity).toBeUndefined();
    expect(page2.results[0].rank).toBe(6);
    expectNext(r.next);
    expect(r.next[0].what).toContain("ambiguity.groups");
    // Regra fixa (§15.4): nenhum grupo tem a maioria.
    const total = groups.reduce((n: number, g: { matched: number }) => n + g.matched, 0);
    expect(Math.max(...groups.map((g: { matched: number }) => g.matched)) * 2).toBeLessThanOrEqual(total);
    // A chamada do grupo resolve a ambiguidade.
    const chosen = await call("get_ds_rules", groups[0].next.arguments);
    expect(chosen.status).not.toBe("ambiguous");
  });

  it("orçamento: uma busca normal não cai abaixo de 5 cartões só por campos acessórios", async () => {
    for (const query of ["tabela", "estado", "foco", "rótulo do campo", "mensagem de erro"]) {
      const r = await call("get_ds_rules", { query, limit: 5 });
      if (r.page.matched >= 5) expect(r.results.length, query).toBe(5);
    }
  });

  it("04 listagem grande: projeção index, cursor e continuação sem repetição até o fim", async () => {
    const r = await call("get_ds_rules", { component: "pagination" });
    expect(r).toMatchObject({ contract: CONTRACT, kind: "listing", status: "listed", reading: MESSAGES["listing-reading"], filter: { component: "pagination" } });
    expect(Object.keys(r.facets)).toEqual(["force"]);
    for (const item of r.items) expect(Object.keys(item)).toEqual(["n", "id", "force", "title", "titleComplete", "category"]);
    expect(r.items.length).toBe(20);
    expect(r.page).toMatchObject({ returned: 20, offset: 0, total: r.total, stop: "limit", note: MESSAGES.continuation });
    expect(r.next[0]).toMatchObject({ action: "request-detail", tool: "get_ds_rules", arguments: { component: "pagination", cursor: r.page.cursor } });
    const ids = r.items.map((i: { id: string }) => i.id);
    let page = r;
    for (let guard = 0; page.page.cursor && guard < 10; guard++) {
      page = await call("get_ds_rules", page.next[0].arguments);
      expect(page.items[0].n).toBe(ids.length + 1);
      ids.push(...page.items.map((i: { id: string }) => i.id));
    }
    expect(page.page).toMatchObject({ cursor: null, stop: "end" });
    expect(ids).toHaveLength(r.total);
    expect(new Set(ids).size).toBe(r.total);
  });

  it("05 verify rejeita a citação inventada: sobre a citação, fato não avaliado, corrigir citação / manter incerta", async () => {
    const r = await call("verify_finding", {
      finding: {
        id: "C-INVENTADA",
        rule: { source: "govbr-ds-kb", id: "govbr-3.7.0-accessibility-pagination-nao-existe", description: "x" },
        element: { page: `${base}/oficina`, locator: "#abrir" },
        severity: "serious", nature: "semantic", mode: "display", pathway: "heuristic",
        evidence: { observed: "observado", expected: "esperado" },
      },
    });
    expect(Object.keys(r)).toEqual(["contract", "kind", "findingId", "verificationId", "verdict", "about", "observation", "reasons", "actions", "verification"]);
    expect(r).toMatchObject({ kind: "verification", verdict: "rejected", about: "citation" });
    expect(r.observation).toEqual({ status: "not-evaluated", message: factNotEvaluated("citação") });
    expect(r.reasons[0]).toMatchObject({ object: "citation", code: "citation-unknown-id" });
    expect(r.actions.map((a: { action: string }) => a.action)).toEqual(["correct-citation", "keep-uncertain"]);
    expectNext(r.actions);
    expect(r.verification.verdict).toBe("rejected");
    // correct-citation nunca sugere id parecido.
    expect(JSON.stringify(r.actions)).not.toMatch(/govbr-3\.7\.0-/);
  });

  it("06 verify do achado do próprio scan, sem implements: confirmed, norma resolvida pelo servidor", async () => {
    const scan = await call("scan_page", { url: `${base}/oficina`, checks: ["structure"], view: "findings", detail: "full", maxChars: 100_000 });
    const own = scan.findings.find((f: { rule: { id: string } }) => f.rule.id === "ds-structure-button-tag");
    expect(own).toBeDefined();
    const { implements: _drop, ...rule } = own.rule;
    const r = await call("verify_finding", { finding: { ...own, rule }, live: true, scanId: scan.scanId });
    expect(r).toMatchObject({ verdict: "confirmed", about: "fact", observation: { status: "verified", message: MESSAGES["fact-verified"] }, reasons: [], actions: [] });
    expect(r.normResolution).toMatchObject({ source: "server-check-id", checkId: "ds-structure-button-tag", payloadImplements: "absent", message: MESSAGES["norm-resolved"] });
    expect(r.normResolution.implements.length).toBeGreaterThan(0);
    expect(r.verification.checks.violation).toBe("verified");
  });

  it("07 scan com checks parciais num estado: checksRun sempre, investigate na ordem do DOM, cabe no orçamento", async () => {
    const recipe = { url: `${base}/oficina`, checks: ["axe", "structure"], actions: [{ action: "click", selector: "#abrir" }], arrival: { dialogOpen: true } };
    const { text } = await raw("scan_page", recipe);
    expect(text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
    const r = JSON.parse(text);
    expect(r).toMatchObject({ contract: CONTRACT, kind: "scan", status: "scanned", absenceNote: ABSENCE_NOTE });
    expect(Object.keys(r.checksRun)).toEqual(["executed", "omitted", "limits", "coverageNote", "completeOmitted"]);
    expect(r.checksRun.executed.map((e: { check: string }) => e.check)).toEqual(["axe", "structure"]);
    expect(r.checksRun.executed[0].engine).toMatch(/^axe-core /);
    expect(r.checksRun.omitted.map((o: { check: string }) => o.check)).toEqual(["tokens", "page"]);
    expect(r.checksRun.coverageNote).toBe(MESSAGES["scan-coverage"]);
    expect(r.checksRun.limits.map((l: { code: string }) => l.code)).toEqual(expect.arrayContaining(["no-state-semantics", "single-state"]));
    expect(r.checksRun.completeOmitted).toEqual({ tool: "scan_page", arguments: { url: recipe.url, actions: recipe.actions, arrival: recipe.arrival, checks: ["tokens", "page"] } });
    expect(r.investigate.doNotRepeat).toBe(MESSAGES["scan-no-repeat"]);
    expect(r.investigate.items.length).toBeLessThanOrEqual(5);
    // 3.3.0 (N-05): famílias antes de investigate — os componentes que cedem espaço vão para investigate.more, na ordem.
    const listedComponents = [...r.investigate.items.map((i: { component: string }) => i.component), ...(r.investigate.more?.components ?? [])];
    expect(listedComponents.slice(0, 5)).toEqual(r.coverage.componentsFound.slice(0, 5));
    for (const item of r.investigate.items) {
      expect(Object.keys(item)).toEqual(["component", "stateRef", "unmeasured", "next"]);
      expect(item.stateRef).toBe(r.scanId);
    }
    // A chamada que completa roda e não repete os checks executados.
    const completed = await call(r.checksRun.completeOmitted.tool, r.checksRun.completeOmitted.arguments);
    expect(completed.checksRun.executed.map((e: { check: string }) => e.check)).toEqual(["tokens", "page"]);
  });
});

describe("contrato — orçamento, continuação, ausência, erro", () => {
  it("toda resposta inicial listada cabe em 8.000 caracteres", async () => {
    const ids = getKnowledgeBase().rules.filter((r) => r.component === "pagination").slice(0, 10).map((r) => r.id);
    const cases: Array<[string, Record<string, unknown>]> = [
      ["get_ds_rules", { query: "tabela" }],
      ["get_ds_rules", { query: "tabela", limit: 10 }],
      ["get_ds_rules", { query: "estado" }],
      ["get_ds_rules", { component: "pagination" }],
      ["get_ds_rules", { component: "pagination", limit: 200, detail: "full" }],
      ["get_ds_rules", { limit: 200, detail: "full" }], // B-04: era 246 KB
      ["get_ds_rules", { context: { components: ["pagination"] } }],
      ["get_ds_rules", { context: { components: ["table", "checkbox"], terms: ["rótulo", "cabeçalho"] }, limit: 10 }],
      ["get_ds_rules", { ids, detail: "full" }],
      ["get_ds_rules", { id: "govbr-3.7.0-development-pagination-ea455e768955" }],
      ["get_emag_rules", { id: "4.4" }],
      ["get_emag_rules", { section: 3 }],
      ["get_component_spec", { component: "pagination" }],
      ["get_component_spec", { component: "pagination", include_examples: true }],
      ["scan_page", { url: `${base}/oficina` }],
      ["scan_page", { url: `${base}/muitas-classes` }], // S-03: observações limitadas
    ];
    for (const [name, args] of cases) {
      const { text, isError } = await raw(name, args);
      expect(isError, `${name} ${JSON.stringify(args)}`).toBe(false);
      expect(text.length, `${name} ${JSON.stringify(args)}`).toBeLessThanOrEqual(RESPONSE_BUDGET);
      expect(JSON.parse(text).contract).toBe(CONTRACT);
    }
  });

  it("S-03: as observações do scan saem em contagem + itens compactos + continuação exata até o fim", async () => {
    const scan = await call("scan_page", { url: `${base}/muitas-classes` });
    const obs = scan.observations;
    expect(obs.total).toBeGreaterThan(obs.returned);
    expect(Object.values(obs.byKind as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(obs.total);
    expect(obs.next).toEqual({ tool: "get_finding_details", arguments: { scanId: scan.scanId, view: "observations", cursor: obs.returned } });
    let seen = obs.returned;
    let args = obs.next.arguments;
    for (let guard = 0; args && guard < 100; guard++) {
      const { text } = await raw("get_finding_details", args);
      expect(text.length).toBeLessThanOrEqual(RESPONSE_BUDGET + 500);
      const page = JSON.parse(text);
      expect(page.cursor).toBe(seen);
      seen += page.count;
      args = page.next?.arguments;
    }
    expect(seen).toBe(obs.total);
  });

  it("S-09: zero achados nunca vêm sem a nota de ausência", async () => {
    const r = await call("scan_page", { url: `${base}/oficina`, checks: ["page"], selectors: ["#n"] });
    expect(r.absenceNote).toBe(ABSENCE_NOTE);
  });

  it("o id por unidade grande continua cláusula a cláusula, cada uma inteira, sem repetição", async () => {
    // A maior unidade da base (medida: a única no teto).
    const r = await call("get_ds_rules", { id: "govbr-3.7.0-pattern-global-52053b9380b0" });
    const seen = r.normativeContext.adjacentClauses.map((c: { id: string }) => c.id);
    let next = r.next[0]?.arguments;
    for (let guard = 0; next && guard < 50; guard++) {
      const { text } = await raw("get_ds_rules", next);
      expect(text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      const page = JSON.parse(text);
      expect(page.kind).toBe("clauses");
      seen.push(...page.adjacentClauses.map((c: { id: string }) => c.id));
      next = page.next[0]?.arguments;
    }
    expect(seen).toHaveLength(r.normativeContext.totalAdjacent);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
