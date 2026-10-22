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
import { useKnowledgeVersion } from "../../src/data/knowledge.js";
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

async function call(client: Client, name: string, args: Record<string, unknown>) {
  return JSON.parse(textOf(await client.callTool({ name, arguments: args })));
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
    expect(index.rules).toBeUndefined();
    const empty = await call(evaluation, "get_ds_rules", { context: {} });
    expect(empty.error).toMatch(/context vazio/);
  });

  it("rejects ambiguous combinations instead of guessing", async () => {
    expect((await call(evaluation, "get_ds_rules", { context: { components: ["button"] }, component: "input" })).error).toBeDefined();
    expect((await call(evaluation, "get_ds_rules", { context: { components: ["button"] }, ids: ["x"] })).error).toBeDefined();
  });

  it("summary carries id, reason, applicability and evidence steps; brief/full add rule text, source and version", async () => {
    const summary = await call(evaluation, "get_ds_rules", { context: { components: ["tag"] } });
    expect(summary.retrieval).toBe("direct");
    expect(summary.detail).toBe("summary");
    expect(summary.note).toMatch(/não defeitos/);
    const first = summary.candidates[0];
    expect(Object.keys(first)).toEqual(
      expect.arrayContaining(["ruleId", "title", "force", "obligation", "reasons", "applicability", "expectedEvidence", "neededState"]),
    );
    expect(first).not.toHaveProperty("normalizedRule");

    const brief = await call(evaluation, "get_ds_rules", { context: { components: ["tag"] }, detail: "brief" });
    const conditional = brief.candidates.find((c: { conditions?: string[] }) => c.conditions?.length);
    expect(conditional).toBeDefined();
    expect(conditional.applicability).toMatchObject({ status: "unknown", unevaluated: ["conditions"] });
    expect(conditional.source).toEqual(expect.objectContaining({ url: expect.stringMatching(/^https:/), version: "3.7.0" }));
    expect(conditional.normalizedRule.length).toBeGreaterThan(0);

    const full = await call(evaluation, "get_ds_rules", { context: { components: ["tag"] }, detail: "full" });
    expect(full.candidates[0]).toHaveProperty("rationale");
    expect(full.candidates[0]).toHaveProperty("wcagReferences");
  });

  it("documented name variants resolve; undocumented ones are reported, never guessed", async () => {
    const data = await call(evaluation, "get_ds_rules", { context: { components: ["Br-Button", "Cookie Bar", "carrossel"] } });
    expect(data.context.components).toEqual(["button", "cookiebar"]);
    expect(data.context.unresolved).toEqual(["carrossel"]);
    // Fora do context, component segue id exato (semântica 2.8.0).
    const byComponent = await call(evaluation, "get_ds_rules", { component: "Button" });
    expect(byComponent.count).toBe(0);
  });

  it("labels conflicts and example defects; examples never appear as candidates", async () => {
    const data = await call(evaluation, "get_ds_rules", { context: { components: ["modal", "card", "wizard"] } });
    expect(data.candidates.every((c: { force: string }) => c.force !== "example")).toBe(true);
    expect(data.exampleWarnings.items.map((w: { component: string }) => w.component)).toEqual(["card", "wizard"]);
    // Conflito só da página-fonte não se liga a regra: vai para sourcePageNotes.
    expect(data.candidates.some((c: { conflicts?: unknown[] }) => c.conflicts?.length)).toBe(false);
    expect(data.sourcePageNotes.items).toContainEqual(
      expect.objectContaining({ type: "documentation-typo-suspected", url: "https://www.gov.br/ds/components/modal" }),
    );
    const cdn = await call(evaluation, "get_ds_rules", { context: { terms: ["cdn"] } });
    const titled = cdn.candidates.find((c: { title: string }) => c.title === "Evitar CDN legado");
    expect(titled.conflicts).toEqual([expect.objectContaining({ link: "ruleTitle" })]);
  });

  it("explicit pagination walks every candidate once, in order, within the budget", async () => {
    const context = {
      components: ["header", "footer", "breadcrumb", "menu", "button", "input", "select", "checkbox", "radio", "modal", "tooltip", "table", "tag", "pagination", "card"],
      terms: ["teclado", "erro"],
    };
    const all = await call(evaluation, "get_ds_rules", { context, limit: 200, detail: "summary" });
    const total = all.total;
    expect(total).toBeGreaterThan(20);

    const ids: string[] = [];
    let offset: number | undefined = 0;
    let pages = 0;
    while (offset !== undefined) {
      const raw = textOf(await evaluation.callTool({ name: "get_ds_rules", arguments: { context, detail: "brief", limit: 15, offset } }));
      const page = JSON.parse(raw);
      expect(page.count).toBeGreaterThan(0);
      expect(page.count).toBeLessThanOrEqual(15);
      expect(raw.length).toBeLessThanOrEqual(12_000);
      if (page.offset > 0) expect(page.pageConstraints).toBeUndefined();
      ids.push(...page.candidates.map((c: { ruleId: string }) => c.ruleId));
      offset = page.more?.nextOffset;
      pages += 1;
    }
    expect(pages).toBeGreaterThan(1);
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);

    // Paginação por orçamento: a página para antes do limit, sinaliza e continua do ponto exato.
    const full = await call(evaluation, "get_ds_rules", { context, detail: "full", limit: 200 });
    expect(full.truncated).toBe(true);
    expect(full.more.reason).toMatch(/orçamento/);
    expect(full.candidates.map((c: { ruleId: string }) => c.ruleId)).toEqual(ids.slice(0, full.count));
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

  it("get_component_spec points to the component's rules without inventing others", async () => {
    const spec = await call(evaluation, "get_component_spec", { component: "tag" });
    expect(spec.rules.retrieval).toBe("automatic");
    expect(spec.rules.next).toEqual({ tool: "get_ds_rules", arguments: { context: { components: ["tag"] } } });
    const direct = await call(evaluation, "get_ds_rules", { context: { components: ["tag"] }, limit: 200 });
    expect(spec.rules.ids).toEqual(direct.candidates.map((c: { ruleId: string }) => c.ruleId));
    // get_component_spec mantém o nome exato da 2.8.0.
    const byVariant = await call(evaluation, "get_component_spec", { component: "br-tag" });
    expect(byVariant.error).toMatch(/não encontrado/);
  });
});

describe("scan_page normativeContext on a neutral-domain fixture", () => {
  it("marks automatic retrieval in profiles with norms and the follow-up gives correct guidance", async () => {
    const scan = await call(evaluation, "scan_page", { url: baseUrl, checks: ["structure"], limit: 5 });
    const ctx = scan.normativeContext;
    expect(ctx.retrieval).toBe("automatic");
    expect(ctx.basis).toBe("coverage.componentsFound");
    expect(ctx.components).toEqual([...scan.coverage.componentsFound].sort());
    expect(ctx.components).toEqual(expect.arrayContaining(["button", "input", "modal", "tag", "header"]));
    // 2.12.0: tamanho de cada componente antes de pedir.
    expect(Object.values(ctx.byComponent as Record<string, number>).reduce((x, y) => x + y, 0)).toBe(ctx.candidates);

    const followUp = await call(evaluation, ctx.next.tool === "get_ds_rules" ? "get_ds_rules" : "", { ...ctx.next.arguments, limit: 200 });
    expect(followUp.total).toBe(ctx.candidates);
    const observed = new Set<string>(ctx.components);
    // Nenhuma regra de componente ausente da página (ex.: carousel, wizard, upload).
    expect(followUp.candidates.every((c: { reasons: Array<{ component?: string }> }) =>
      c.reasons.some((r) => r.component && observed.has(r.component)))).toBe(true);
    // A tag de contagem tem regra condicional relacionada a tooltip, que a página não tem: fica rotulada.
    const tagRule = followUp.candidates.find((c: { reasons: Array<{ component?: string }>; applicability: { unevaluated?: string[] } }) =>
      c.reasons.some((r) => r.component === "tag") && c.applicability.unevaluated?.includes("conditions"));
    expect(tagRule.applicability.status).toBe("unknown");
    expect(tagRule.applicability.unknowns.join(" ")).toMatch(/tooltip/);
    // O skip link encontrado traz a regra global do Template Base pela relação documentada.
    const viaRelation = followUp.candidates.find((c: { reasons: Array<{ kind: string; component?: string }> }) =>
      c.reasons.some((r) => r.kind === "related-component-observed" && r.component === "skiplink"));
    expect(viaRelation).toBeDefined();
  });

  it("emits normativeContext only on the first page, not on cursor continuations", async () => {
    const first = await call(evaluation, "scan_page", { url: baseUrl, checks: ["structure", "axe"], limit: 1 });
    expect(first.normativeContext).toBeDefined();
    const next = await call(evaluation, "scan_page", { url: baseUrl, checks: ["structure", "axe"], limit: 1, cursor: first.nextCursor ?? 1 });
    expect(next.normativeContext).toBeUndefined();
    // cursor 0 é a primeira página.
    const zero = await call(evaluation, "scan_page", { url: baseUrl, checks: ["structure", "axe"], limit: 1, cursor: 0 });
    expect(zero.normativeContext).toEqual(first.normativeContext);
  });

  it("profiles without norms get no normative projection", async () => {
    const deterministic = await connect("deterministic", "sem-normas");
    try {
      const scan = await call(deterministic, "scan_page", { url: baseUrl, checks: ["structure"], limit: 5 });
      expect(scan.normativeContext).toBeUndefined();
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
      const raw = textOf(await evaluation.callTool({ name: "get_ds_rules", arguments: shape.args }));
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
