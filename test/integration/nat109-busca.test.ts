/**
 * NAT-109 (3.3.0): defeitos de busca/contrato do reteste adversarial da 3.2.0, pela superfície MCP.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { resetDenseCache, setDenseLoaderForTests } from "../../src/data/embeddings.js";
import { RESPONSE_BUDGET } from "../../src/responses/contract.js";

let client: Client;
beforeAll(async () => {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")), toolProfile: "evaluation", knowledgeLock: "call" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  client = new Client({ name: "nat109", version: "0" });
  await client.connect(a);
});
afterAll(async () => {
  await client.close();
});
afterEach(() => {
  setDenseLoaderForTests(undefined);
  resetDenseCache();
});

const raw = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
  return { text, isError: Boolean(r.isError), data: JSON.parse(text) as Record<string, any> };
};

describe("N-01: o orçamento vale também para o eco da entrada", () => {
  const BIG = "x".repeat(100_000);
  it.each([
    ["get_ds_rules", { id: BIG }],
    ["get_ds_rules", { component: BIG }],
    ["get_ds_rules", { query: BIG }],
    ["get_ds_rules", { ids: [BIG] }],
    ["get_ds_rules", { ["k".repeat(50_000)]: 1 }],
    ["get_ds_rules", Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`chave${i}`, 1]))],
    ["get_finding_details", { ids: Array.from({ length: 50 }, (_, i) => `F-${"x".repeat(3000)}${i}`) }],
    ["get_finding_details", { scanId: "s".repeat(100_000) }],
    ["get_component_spec", { component: BIG }],
  ])("%s com entrada gigante: resposta ≤ 8.000 e erro do contrato", async (tool, args) => {
    const r = await raw(tool, args as Record<string, unknown>);
    expect(r.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
    if (tool !== "get_finding_details" || "scanId" in (args as object)) expect(r.isError).toBe(true);
  });
});

describe("N-11: chave 'constructor'", () => {
  it("vira unknown-parameter do contrato, não -32603", async () => {
    const r = await raw("get_ds_rules", JSON.parse('{"constructor":1,"query":"foco"}'));
    expect(r.isError).toBe(true);
    expect(r.data).toMatchObject({ kind: "error", errorCode: "unknown-parameter", field: "constructor" });
  });
});

describe("N-03/N-13/N-20/B-02: get_design_tokens por cor", () => {
  it("#fff = #ffffff; rgb() = hex; lixo = invalid-argument; hex+query = invalid-combination", async () => {
    const long = await raw("get_design_tokens", { hex: "#ffffff" });
    const short = await raw("get_design_tokens", { hex: "#fff" });
    expect(short.data.count).toBe(long.data.count);
    expect(short.data.count).toBeGreaterThan(0);
    const rgb = await raw("get_design_tokens", { hex: "rgb(19, 81, 180)" });
    expect(rgb.data).toMatchObject({ hex: "#1351b4" });
    expect(rgb.data.count).toBeGreaterThan(0);
    const bad = await raw("get_design_tokens", { hex: "zzz" });
    expect(bad).toMatchObject({ isError: true, data: { errorCode: "invalid-argument", field: "hex" } });
    expect((await raw("get_design_tokens", { hex: "#1351b4", query: "color" })).data.errorCode).toBe("invalid-combination");
    const asQuery = await raw("get_design_tokens", { query: "#1351b4" });
    expect(asQuery.data.count).toBe(rgb.data.count);
    const miss = await raw("get_design_tokens", { query: "nao-existe-token" });
    expect(miss.data.next[0].arguments).toHaveProperty("hex");
  });
});

describe("N-13: get_page_rules", () => {
  it("cursor sem category é erro", async () => {
    expect((await raw("get_page_rules", { cursor: "x" })).data.errorCode).toBe("invalid-combination");
  });
});

describe("N-02: listagem nunca passa do teto", () => {
  it("as 12 primeiras páginas de limit 50 / full ficam ≤ 8.000", async () => {
    let cursor: string | null = null;
    for (let i = 0; i < 12; i++) {
      const r = await raw("get_ds_rules", { limit: 50, detail: "full", ...(cursor ? { cursor } : {}) });
      expect(r.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      cursor = r.data.page.cursor;
      if (!cursor) break;
    }
  });
});

describe("N-05/N-17/B-10: context", () => {
  it("termo sem candidata (ou identificador ausente da base) vem em unmatchedTerms", async () => {
    const r = await raw("get_ds_rules", { context: { components: ["modal"], terms: ["xyzzy"] } });
    expect(r.data.unmatchedTerms).toEqual(["xyzzy"]);
    expect(r.data.gaps).toContainEqual(expect.objectContaining({ kind: "unmatched-terms", about: "xyzzy" }));
    const aria = await raw("get_ds_rules", { context: { components: ["pagination"], terms: ["aria-current"] } });
    expect(aria.data.query.unmatchedTerms).toContain("aria-current");
  });
  it("why.matched só lista termo presente no texto ou via expansão declarada; casamento só na paráfrase vai à parte", async () => {
    const r = await raw("get_ds_rules", { context: { components: ["pagination"], terms: ["ATUAL"] } });
    for (const c of r.data.results) {
      for (const m of c.why.matched.filter((x: string) => !x.startsWith("componente:"))) {
        const [term, via] = m.split("→");
        const shown = `${c.requirement.heading} ${c.requirement.text}`.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
        expect(shown.includes(term.slice(0, 5)) || (via !== undefined && shown.includes(via.slice(0, 5))), m).toBe(true);
      }
    }
  });
});

describe("N-07/N-16: ambiguidade", () => {
  it("pergunta longa não consome a página: ≥ 3 cartões; grupos com next (extends baseCall)", async () => {
    const LONGQ = "O componente de paginação não indica a página atual com aria-current e os links não estão em lista, o que prejudica usuários de leitor de tela que navegam pelo teclado. ".repeat(3).slice(0, 500);
    const r = await raw("get_ds_rules", { query: LONGQ });
    if (r.data.page.matched >= 5) expect(r.data.results.length).toBeGreaterThanOrEqual(3);
    if (r.data.ambiguity) {
      expect(r.data.ambiguity.baseCall.arguments.query).toBe(LONGQ);
      for (const g of r.data.ambiguity.groups) expect(g.next).toMatchObject({ tool: "get_ds_rules", extends: "ambiguity.baseCall" });
    }
  });
});

describe("B-15/N-19: ids históricos", () => {
  const DROPPED = "govbr-3.7.0-accessibility-global-e038367bd7d6";
  it("id: absenceNote, citeAs null e ponteiro para a regra corrente", async () => {
    const r = await raw("get_ds_rules", { id: DROPPED });
    expect(r.data).toMatchObject({ kind: "historical", citeAs: null, current: { basis: "closest-text-lexical" } });
    expect(r.data.absenceNote).toBeDefined();
  });
  it("ids: cartão histórico não é candidata citável", async () => {
    const card = (await raw("get_ds_rules", { ids: [DROPPED] })).data.results[0];
    expect(card).toMatchObject({ status: "historical", citeAs: null, kind: "historical" });
    expect(card.current.id).toMatch(/^govbr-/);
  });
});

describe("B-09/N-15: template de validação do e-MAG", () => {
  it("4.4 cita a cláusula corrente que obriga, não o id histórico nem o título; o resumo do projeto é marcado", async () => {
    const r = await raw("get_emag_rules", { id: "4.4" });
    const t = r.data.validationTemplate;
    expect(t.citation).toMatchObject({ kind: "current", basis: "emag-unit-obligation", from: { kind: "historical" } });
    const clause = r.data.normativeContext.clauses.find((c: { id: string }) => c.id === t.ruleId);
    expect(clause.force).toBe("required");
    expect(clause.originalText).not.toMatch(/^Recomendação \d/);
    expect(r.data).toMatchObject({ descriptionKind: "project-paraphrase" });
  });
});

describe("N-18: dense sem modelo", () => {
  it("retrieval:'dense' indisponível é erro dense-unavailable; hybrid cai para a léxica com engine léxico", async () => {
    resetDenseCache();
    setDenseLoaderForTests(async () => ({ status: "unavailable", reason: "simulado", model: "nope" }));
    const d = await raw("get_ds_rules", { query: "foco modal", retrieval: "dense" });
    expect(d).toMatchObject({ isError: true, data: { errorCode: "dense-unavailable", field: "retrieval" } });
    const h = await raw("get_ds_rules", { query: "foco modal", retrieval: "hybrid" });
    expect(h.isError).toBe(false);
    expect(h.data.kb.ranking).toMatchObject({ engine: "govbr-lexical/1.2.0", dense: "unavailable" });
  });
});
