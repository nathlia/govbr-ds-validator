/**
 * Contexto normativo pelo protocolo MCP (2.9.0, NAT-83).
 *
 * A fixture é de um domínio sem relação com as telas do corpus — renovação de empréstimo numa
 * biblioteca municipal —, com componentes br-* escolhidos pela variedade (campo, botão, tag de
 * contagem, modal de confirmação, cabeçalho). Nada aqui conhece defeitos esperados: o teste olha só
 * para quais regras da base o oráculo aponta, por quê e com que rótulos.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, type ServerOptions } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { getKnowledgeBase, useKnowledgeVersion } from "../../src/data/knowledge.js";
import { resetApplicabilityCache } from "../../src/data/applicability.js";
import { ABSENCE_NOTE } from "../../src/responses/absence.js";

const LIBRARY_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Renovação de empréstimo — Biblioteca Municipal</title></head>
<body>
  <a class="br-skiplink" href="#conteudo">Ir para o conteúdo</a>
  <header class="br-header"><div class="header-title">Biblioteca Municipal</div></header>
  <main id="conteudo">
    <h1>Renovar empréstimo</h1>
    <form>
      <div class="br-input">
        <label for="cartao">Número do cartão do leitor</label>
        <input id="cartao" type="text">
      </div>
      <span class="br-tag count">1250</span>
      <button class="br-button primary" type="button" id="renovar">Renovar</button>
    </form>
    <div class="br-modal" role="dialog" aria-labelledby="modal-titulo" hidden>
      <div class="br-modal-header" id="modal-titulo">Confirmar renovação</div>
      <div class="br-modal-footer"><button class="br-button secondary" type="button">Cancelar</button></div>
    </div>
  </main>
  <footer class="br-footer">Prefeitura</footer>
</body>
</html>`;

let httpServer: Server;
let baseUrl: string;

function textOf(result: { content?: unknown }): string {
  return (result.content as { text: string }[]).map((c) => c.text).join("\n");
}

async function connect(profile: ServerOptions["toolProfile"], clientName: string) {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")), toolProfile: profile });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: clientName, version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

// A5: estes casos verificam fatos/estado; teto explícito preserva a projeção completa.
async function call(client: Client, name: string, args: Record<string, unknown>) {
  return JSON.parse(textOf(await client.callTool({ name, arguments: name === "scan_page" && args.maxChars === undefined ? { ...args, maxChars: 100_000 } : args })));
}

let evaluation: Client;

beforeAll(async () => {
  // 2.12.0: o contrato do contexto normativo e o snapshot da 2.8.0 são conferidos sobre a versão
  // 3.7.0, cujos dados (relatedComponents, condições da tag, títulos citados por conflicts.json)
  // os casos usam. A versão literal, servida por padrão, tem seus testes em server.test.ts e
  // knowledgeLiteral.test.ts.
  useKnowledgeVersion("3.7.0");
  resetApplicabilityCache();
  httpServer = createHttpServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(LIBRARY_HTML);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;
  evaluation = await connect("evaluation", "arm-x");
});

afterAll(async () => {
  useKnowledgeVersion(undefined);
  resetApplicabilityCache();
  await evaluation.close();
  await closeBrowser();
  await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
});

describe("get_ds_rules context — contract", () => {
  it("empty query still returns the facet index; an empty context is an error, not the index", async () => {
    const index = await call(evaluation, "get_ds_rules", {});
    expect(index.facets).toBeDefined();
    expect(index.items).toBeUndefined();
    const empty = await call(evaluation, "get_ds_rules", { context: {} });
    expect(empty.error).toMatch(/context vazio/);
    expect(empty.errorCode).toBe("empty-context");
  });

  it("rejects ambiguous combinations instead of guessing", async () => {
    expect((await call(evaluation, "get_ds_rules", { context: { components: ["button"] }, component: "input" })).error).toBeDefined();
    expect((await call(evaluation, "get_ds_rules", { context: { components: ["button"] }, ids: ["x"] })).error).toBeDefined();
  });

  it("cards carry unit ids, citeAs, literal text, what to verify, evidence, unknown applicability and source (3.0.0)", async () => {
    const collected: any[] = [];
    let page = await call(evaluation, "get_ds_rules", { context: { components: ["tag"] }, limit: 10 });
    expect(page.kind).toBe("retrieval");
    expect(page.reading).toMatch(/não veredito/);
    const first = page.results[0];
    expect(Object.keys(first)).toEqual(
      expect.arrayContaining(["rank", "ids", "citeAs", "status", "force", "modality", "requirement", "why", "toVerify", "evidence", "applicability", "source", "more"]),
    );
    expect(first).not.toHaveProperty("normalizedRule");
    for (let i = 0; i < 30; i++) {
      collected.push(...page.results);
      if (!page.page.cursor) break;
      page = await call(evaluation, "get_ds_rules", { context: { components: ["tag"] }, limit: 10, cursor: page.page.cursor });
    }
    const conditional = collected.find((c) => c.toVerify.some((t: { origin: string }) => t.origin === "extracted-condition"));
    expect(conditional).toBeDefined();
    expect(conditional.applicability).toBe("unknown");
    expect(conditional.source).toEqual(expect.objectContaining({ url: expect.stringMatching(/^https:/), version: "3.7.0" }));
    expect(conditional.requirement.text.length).toBeGreaterThan(0);
    // detail não muda os cartões de busca; o registro inteiro vem por id.
    const full = await call(evaluation, "get_ds_rules", { context: { components: ["tag"] }, detail: "full" });
    expect(full.results[0]).not.toHaveProperty("rationale");
    const record = await call(evaluation, full.results[0].more.next.tool, full.results[0].more.next.arguments);
    expect(record.rule).toHaveProperty("rationale");
    expect(record.rule).toHaveProperty("wcagReferences");
  });

  it("documented name variants resolve; undocumented ones are reported, never guessed", async () => {
    const data = await call(evaluation, "get_ds_rules", { context: { components: ["Br-Button", "Cookie Bar", "carrosel"] } });
    expect(data.query.components).toEqual(["button", "cookiebar"]);
    expect(data.query.unresolved).toEqual(["carrosel"]);
    // 3.3.0 (B-11): não resolvido traz sugestões; só nomes não resolvidos = erro de nome (a glosa PT que
    // resolve é testada na base literal, knowledgeLiteral.test.ts).
    expect(data.query.unresolvedDidYouMean).toEqual({ carrosel: ["carousel"] });
    const onlyUnknown = await call(evaluation, "get_ds_rules", { context: { components: ["carrosel"] } });
    expect(onlyUnknown).toMatchObject({ errorCode: "unknown-component", field: "context.components", didYouMean: ["carousel"] });
    // 2.17.0 (B-05): fora do context, component usa o mesmo resolvedor; match:"literal" mantém o id
    // exato da 2.8.0; nome desconhecido é erro de entrada com sugestões, não "0 regras".
    const byComponent = await call(evaluation, "get_ds_rules", { component: "Button" });
    const exact = await call(evaluation, "get_ds_rules", { component: "button" });
    expect(byComponent.items.length).toBeGreaterThan(0);
    expect(byComponent.items.map((r: { id: string }) => r.id)).toEqual(exact.items.map((r: { id: string }) => r.id));
    expect((await call(evaluation, "get_ds_rules", { component: "Button", match: "literal" })).count).toBe(0);
    const unknown = await call(evaluation, "get_ds_rules", { component: "carrosel", query: "foco" });
    expect(unknown).toMatchObject({ errorCode: "unknown-component", field: "component", didYouMean: ["carousel"] });
    expect(unknown.available).toContain("carousel");
    expect(unknown.absenceNote).toBeUndefined();
  });

  it("labels conflicts and example defects; examples never appear as candidates", async () => {
    const data = await call(evaluation, "get_ds_rules", { context: { components: ["modal", "card", "wizard"] } });
    expect(data.results.every((c: { force: string }) => c.force !== "example")).toBe(true);
    expect(data.warnings.exampleDefects.map((w: { component: string }) => w.component)).toEqual(["card", "wizard"]);
    // Conflito só da página-fonte não se liga a regra: vai para warnings.sourcePageNotes.
    expect(data.results.some((c: { conflicts?: unknown[] }) => c.conflicts?.length)).toBe(false);
    expect(data.warnings.sourcePageNotes).toContainEqual(
      expect.objectContaining({ type: "documentation-typo-suspected", url: "https://www.gov.br/ds/components/modal" }),
    );
    const cdn = await call(evaluation, "get_ds_rules", { context: { terms: ["cdn"] }, limit: 10 });
    const titled = cdn.results.find((c: { conflicts?: unknown[] }) => c.conflicts?.length);
    expect(titled.conflicts).toEqual([expect.objectContaining({ link: "ruleTitle" })]);
  });

  it("cursor walks every distinct unit once, in order, each page within the 8,000 budget, without loops", async () => {
    const context = {
      components: ["header", "footer", "breadcrumb", "menu", "button", "input", "select", "checkbox", "radio", "modal", "tooltip", "table", "tag", "pagination", "card"],
      terms: ["teclado", "erro"],
    };
    const ids: string[] = [];
    const ranks: number[] = [];
    let cursor: string | null | undefined;
    let matched = 0;
    let pages = 0;
    do {
      const raw = textOf(await evaluation.callTool({ name: "get_ds_rules", arguments: { context, limit: 10, ...(cursor ? { cursor } : {}) } }));
      expect(raw.length).toBeLessThanOrEqual(8_000);
      const page = JSON.parse(raw);
      if (pages === 0) matched = page.page.matched;
      else {
        expect(page.kb).toBeUndefined();
        expect(page.messages).toBeUndefined();
      }
      expect(page.results.length).toBeGreaterThan(0);
      expect(page.results.length).toBeLessThanOrEqual(10);
      expect(["limit", "budget", "relevance-floor"]).toContain(page.page.stop);
      ids.push(...page.results.map((c: { citeAs: string }) => c.citeAs));
      ranks.push(...page.results.map((c: { rank: number }) => c.rank));
      expect(page.page.cursor).not.toBe(cursor);
      cursor = page.page.cursor;
      pages += 1;
      expect(pages).toBeLessThan(400);
    } while (cursor);
    expect(pages).toBeGreaterThan(1);
    expect(ids).toHaveLength(matched);
    expect(new Set(ids).size).toBe(matched);
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
    // Mesma entrada, mesma ordem.
    const again = await call(evaluation, "get_ds_rules", { context, limit: 10 });
    expect(again.results.map((c: { citeAs: string }) => c.citeAs)).toEqual(ids.slice(0, again.results.length));
  });

  it("returns byte-identical text to different clients and profiles carrying norms", async () => {
    const args = { context: { components: ["input", "button"], terms: ["erro"] } };
    const other = await connect("normative", "arm-y-model-z");
    const full = await connect("full", "outro-cliente");
    try {
      const a = textOf(await evaluation.callTool({ name: "get_ds_rules", arguments: args }));
      const b = textOf(await other.callTool({ name: "get_ds_rules", arguments: args }));
      const c = textOf(await full.callTool({ name: "get_ds_rules", arguments: args }));
      expect(b).toBe(a);
      expect(c).toBe(a);
    } finally {
      await other.close();
      await full.close();
    }
  });

  it("get_component_spec groups the component's rules by strategy without inventing others", async () => {
    const spec = await call(evaluation, "get_component_spec", { component: "tag" });
    expect(spec.rules.retrieval).toBe("automatic");
    const listing = await call(evaluation, "get_ds_rules", { component: "tag" });
    expect(spec.rules.total).toBe(listing.total);
    // 3.1.0: rules.next is a context call — cards with citeAs at the 2nd call; walking its cursor
    // covers exactly the component's rules of that strategy.
    for (const n of spec.rules.next) {
      expect(n.arguments.context).toEqual({ components: ["tag"] });
      let page = await call(evaluation, n.tool, n.arguments);
      const ids = new Set<string>();
      for (let i = 0; i < 20; i++) {
        for (const card of page.results) {
          expect(typeof card.citeAs).toBe("string");
          for (const id of card.ids) ids.add(id);
        }
        if (!page.page.cursor) break;
        page = await call(evaluation, n.tool, { ...n.arguments, cursor: page.page.cursor });
      }
      const own = [...ids].filter((id) => getKnowledgeBase().byId.get(id)?.component === "tag");
      expect(own.length).toBe(spec.rules.byStrategy[n.arguments.validationStrategy]);
    }
    // get_component_spec mantém o nome exato da 2.8.0.
    const byVariant = await call(evaluation, "get_component_spec", { component: "br-tag" });
    expect(byVariant.error).toMatch(/não encontrado/);
    expect(byVariant.didYouMean).toEqual(["tag"]);
  });
});

describe("scan_page investigate on a neutral-domain fixture (3.0.0; normativeContext da 2.9.0)", () => {
  // A5 exige escopo literal versionado; o snapshot não literal acima continua isolado nos testes legados.
  beforeAll(() => { useKnowledgeVersion(undefined); resetApplicabilityCache(); });
  afterAll(() => { useKnowledgeVersion("3.7.0"); resetApplicabilityCache(); });
  it("lists ALL found components, by required clauses no check measures (ties in DOM order), each with the checklist step (3.5.0, revisão Fable P1)", async () => {
    const scan = await call(evaluation, "scan_page", { url: baseUrl, checks: ["structure"], limit: 5 });
    expect(scan.kind, JSON.stringify(scan)).not.toBe("error");
    expect(scan.normativeContext).toBeUndefined();
    const inv = scan.investigate;
    expect(inv.retrieval).toBe("automatic");
    expect(inv.doNotRepeat).toMatch(/Não repita este scan/);
    expect(inv.note).toMatch(/candidatas a medir antes de encerrar; não são defeitos/);
    const found: string[] = scan.coverage.componentsFound;
    expect(found).toEqual(expect.arrayContaining(["button", "input", "modal", "tag", "header"]));
    // Todos os encontrados, nenhum a mais nem a menos: itens + more.
    const listed = [...inv.items.map((i: { component: string }) => i.component), ...(inv.more?.components ?? [])];
    expect([...listed].sort()).toEqual([...found].sort());
    // Ordem: obrigações sem medida decrescentes; empate na ordem do DOM. 3.7.8 (item 4): os visíveis no estado antes dos
    // ocultos, e a parte de um hospedeiro (partOf) fora dessa conta — vem depois do hospedeiro.
    const { unmeasuredStrongCount } = await import("../../src/tools/componentChecklist.js");
    const { scanPage, PageScanCache } = await import("../../src/scan/pageScan.js");
    const direct = await scanPage({ url: baseUrl, checks: ["structure"] }, new PageScanCache(1));
    if (direct.status !== "scanned") throw new Error("estado não alcançado");
    const layout = direct.componentLayout ?? {};
    const partOf = (inv.partOf ?? {}) as Record<string, string>;
    for (const [part, host] of Object.entries(partOf)) {
      expect(layout[part]?.partOf).toBe(host);
      expect(listed.indexOf(part)).toBeGreaterThan(listed.indexOf(host));
    }
    const standalone = listed.filter((c) => !partOf[c]);
    const key = (c: string) => [layout[c]?.visible === false ? 0 : 1, unmeasuredStrongCount(c).unmeasured] as const;
    for (let i = 1; i < standalone.length; i++) {
      const [va, ca] = key(standalone[i - 1]);
      const [vb, cb] = key(standalone[i]);
      expect(va).toBeGreaterThanOrEqual(vb);
      if (va === vb) expect(ca).toBeGreaterThanOrEqual(cb);
      if (va === vb && ca === cb) expect(found.indexOf(standalone[i - 1])).toBeLessThan(found.indexOf(standalone[i]));
    }
    for (const item of inv.items) {
      expect(item.stateRef).toBe(scan.scanId);
      expect(item.requiredUnmeasured).toBe(unmeasuredStrongCount(item.component).unmeasured);
      expect(item.next).toEqual({ tool: "get_component_spec", arguments: { component: item.component, view: "checklist" } });
    }
    expect(inv.next).toEqual(inv.items[0].next);
    const followUp = await call(evaluation, inv.items[1].next.tool, inv.items[1].next.arguments);
    expect(followUp.kind).toBe("component-checklist");
    expect(followUp.component).toBe(inv.items[1].component);
  });

  it("emits investigate only on the first page, not on cursor continuations", async () => {
    const first = await call(evaluation, "scan_page", { url: baseUrl, checks: ["structure", "axe"], limit: 1 });
    expect(first.investigate).toBeDefined();
    const next = await call(evaluation, "scan_page", { url: baseUrl, checks: ["structure", "axe"], limit: 1, cursor: first.nextCursor ?? 1 });
    expect(next.investigate).toBeUndefined();
    // cursor 0 é a primeira página.
    const zero = await call(evaluation, "scan_page", { url: baseUrl, checks: ["structure", "axe"], limit: 1, cursor: 0 });
    expect(zero.investigate).toEqual({ ...first.investigate,
      page: { ...first.investigate.page, stateRef: zero.scanId },
      items: first.investigate.items.map((i: { stateRef: string }) => ({ ...i, stateRef: zero.scanId })) });
  });
  it("profiles without norms get no normative projection", async () => {
    const deterministic = await connect("deterministic", "sem-normas");
    try {
      const scan = await call(deterministic, "scan_page", { url: baseUrl, checks: ["structure"], limit: 5 });
      expect(scan.normativeContext).toBeUndefined();
      expect(scan.investigate).toBeUndefined();
      expect(scan.checksRun).toBeDefined();
      expect(scan.coverage.componentsFound.length).toBeGreaterThan(0);
    } finally {
      await deterministic.close();
    }
  });
});

describe("legacy get_ds_rules call shapes are byte-identical to 2.8.0", () => {
  // Snapshot gerado pela 2.8.0 (HEAD 564fc8e) via MCP, perfil evaluation: sha256 do texto da resposta.
  // Exclui só o caso corrigido de propósito ({limit, offset} sem filtro), coberto em server.test.ts.
  it("ids, id, component (incl. 'Button'/'br-button'), category, query ('foco', 'erro', 'formulario', '  '), full, evidence", async () => {
    const { createHash } = await import("node:crypto");
    const { readFileSync } = await import("node:fs");
    const snapshot = JSON.parse(readFileSync(new URL("../fixtures/legacy-get-ds-rules-2.8.0.json", import.meta.url), "utf8"));
    const shapes = snapshot.shapes.filter((s: { tool?: string }) => !s.tool);
    expect(shapes.length).toBeGreaterThanOrEqual(15);
    for (const shape of shapes) {
      // 2.17.0 (NAT-97): query e component mudaram de semântica de propósito (relevância, resolvedor de
      // nomes); a semântica antiga continua disponível, byte a byte, com match:"literal".
      // 3.0.0 (NAT-99): o contrato oraculo-resposta muda todas as formas; a superfície antiga continua,
      // byte a byte, com match:"literal".
      const legacyArgs = { ...shape.args, match: "literal" };
      const raw = textOf(await evaluation.callTool({ name: "get_ds_rules", arguments: legacyArgs }));
      // 2.12.0 acrescenta só meta.knowledgeVersion; sem ele, o texto tem de ser o da 2.8.0 byte a byte.
      const parsed = JSON.parse(raw);
      if (parsed.meta) {
        expect(parsed.meta.knowledgeVersion).toBe("3.7.0");
        delete parsed.meta.knowledgeVersion;
      }
      // 2.15.0 acrescenta só a nota fixa de ausência (ids faltantes, 0 resultados), sempre com o mesmo texto.
      const hadNote = "absenceNote" in parsed;
      if (hadNote) {
        expect(parsed.absenceNote).toBe(ABSENCE_NOTE);
        delete parsed.absenceNote;
      }
      const text = parsed.meta || hadNote ? JSON.stringify(parsed, null, 2) : raw;
      expect(createHash("sha256").update(text).digest("hex"), JSON.stringify(shape.args)).toBe(shape.sha256);
    }
    for (const shape of snapshot.shapes.filter((s: { tool?: string }) => s.tool === "get_component_spec")) {
      const data = await call(evaluation, "get_component_spec", shape.args);
      expect(data.error ?? null, JSON.stringify(shape.args)).toBe(shape.error);
    }
  });
});
