/**
 * 3.7.3-pre (D-167, emenda-2 da base literal): unidades de especificação.
 *   - nunca obrigação: força e modalidade próprias em todo caminho (id, ids, listagem, busca, spec do componente);
 *   - fora de toda listagem, faceta, contagem e checklist de obrigações por padrão; listáveis por force:"especificacao";
 *   - a busca as traz num bloco `specification` à parte, que não tira nem reordena norma nenhuma da página;
 *   - exemplos da documentação (tipografia da Tab, borda do Upload ao arrastar, ícone centralizado do Button)
 *     são citáveis pelos ids da emenda, com a linha da tabela em parte → propriedade → token.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { filterRules, getKnowledgeBase, getRuleById } from "../../src/data/knowledge.js";
import { rankRules } from "../../src/data/retrieval.js";
import { citationForceWarning } from "../../src/responses/verify.js";
import { checklistRules } from "../../src/tools/componentChecklist.js";
import type { Finding } from "../../src/schema/finding.js";

const TAB_TYPOGRAPHY_LABEL = "govbr-3.7.0-component-tab-b717690fd662";
const UPLOAD_BORDER_SENTENCE = "govbr-3.7.0-component-upload-0c932ca8e991";
const UPLOAD_BORDER_SUCCESS_ROW = "govbr-3.7.0-component-upload-878fc6975a2a";
const BUTTON_ICON_CENTERED = "govbr-3.7.0-component-button-ee4f724044b5";
const SPEC_TABLES = join(import.meta.dirname, "../../data/knowledge/versions/3.7.0-literal-2026-10-15/normalized/spec-tables.json");

let client: Client;
beforeAll(async () => {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")), toolProfile: "evaluation", knowledgeLock: "call" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  client = new Client({ name: "fix373", version: "0" });
  await client.connect(a);
});
afterAll(async () => client.close());

async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
  return { text, data: JSON.parse(text), isError: Boolean(r.isError) };
}

describe("3.7.3 — unidades de especificação na base (D-167)", () => {
  it("os exemplos de Tab, Upload e Button existem, literais, com proveniência e força própria", () => {
    for (const [id, file, line] of [
      [TAB_TYPOGRAPHY_LABEL, "componentes/tab__designer.md", 223],
      [UPLOAD_BORDER_SENTENCE, "componentes/upload__designer.md", 63],
      [UPLOAD_BORDER_SUCCESS_ROW, "componentes/upload__designer.md", 172],
      [BUTTON_ICON_CENTERED, "componentes/button__designer.md", 197],
    ] as const) {
      const rule = getRuleById(id)!;
      expect(rule, id).toBeDefined();
      expect(rule.force).toBe("especificacao");
      expect(rule.source).toMatchObject({ corpusFile: file, line, captureType: "literal-corpus-specification" });
    }
    expect(getRuleById(UPLOAD_BORDER_SENTENCE)!.originalText).toContain("a cor da borda do componente muda para verde");
    expect(getRuleById(BUTTON_ICON_CENTERED)!.originalText).toContain("o ícone permanecem sempre centralizados");
    expect(getRuleById(TAB_TYPOGRAPHY_LABEL)!.specification).toMatchObject({
      kind: "table-row",
      part: "Rótulo da Tab",
      entries: [
        { column: "Size", property: "Size", tokens: ["--font-size-scale-up-02"] },
        { column: "Weight", property: "Weight", tokens: ["--font-weight-medium"] },
      ],
    });
  });

  it("spec-tables.json guarda a tabela inteira por linha (parte → propriedade → token), com o id de cada linha", () => {
    const { tables } = JSON.parse(readFileSync(SPEC_TABLES, "utf8")) as { tables: Array<{ component: string; facet: string; rows: Array<{ unitId: string; part: string; entries: Array<{ property: string; tokens: string[] }> }> }> };
    const typography = tables.find((t) => t.component === "tab" && t.facet === "Tipografia")!;
    expect(typography.rows.map((r) => r.part)).toEqual(["Rótulo da Tab", "Rótulo Contador", "Rótulo Contador Ativo"]);
    expect(typography.rows[0]).toMatchObject({ unitId: TAB_TYPOGRAPHY_LABEL });
    const color = tables.find((t) => t.component === "upload" && t.facet === "Cor")!;
    expect(color.rows.find((r) => r.unitId === UPLOAD_BORDER_SUCCESS_ROW)!.entries[0]).toMatchObject({ property: "background-color", tokens: ["--green-cool-vivid-50"] });
  });

  it("fora das contagens, listagens e checklists de obrigação por padrão", () => {
    const kb = getKnowledgeBase();
    expect(kb.meta.normativeRules).toBe(3007);
    expect(filterRules({}).some((r) => r.force === "especificacao")).toBe(false);
    expect(filterRules({ component: "tab" }).some((r) => r.force === "especificacao")).toBe(false);
    expect(filterRules({ component: "tab", force: "especificacao" }).length).toBeGreaterThan(0);
    // o pool padrão do motor é o das normas
    expect(rankRules({ text: "tipografia do rótulo da aba" }).results.some((s) => s.rule.force === "especificacao")).toBe(false);
    expect(checklistRules("tab").some((r) => r.force === "especificacao")).toBe(false);
  });

  it("citada como norma violada, o verify avisa que a especificação não obriga nem proíbe", () => {
    const w = citationForceWarning({ rule: { source: "govbr-ds-kb", id: TAB_TYPOGRAPHY_LABEL } } as unknown as Finding);
    expect(w).toMatchObject({ citedId: TAB_TYPOGRAPHY_LABEL, force: "especificacao" });
    expect(w!.modality).toMatch(/especificação/);
  });
});

describe("3.7.3 — get_ds_rules e get_component_spec", () => {
  it("por id: kind specification, força e modalidade próprias", async () => {
    const r = await call("get_ds_rules", { id: BUTTON_ICON_CENTERED });
    expect(r.isError).toBe(false);
    expect(r.text).toContain('"especificacao"');
    expect(r.text).not.toMatch(/"force":"(required|recommended)","modality"/);
  });

  it("listagem só com force:'especificacao', cada item com a modalidade de especificação", async () => {
    const r = await call("get_ds_rules", { component: "tab", force: "especificacao", limit: 50 });
    expect(r.data.total).toBe(filterRules({ component: "tab", force: "especificacao" }).length);
    for (const item of r.data.items) expect(item).toMatchObject({ kind: "specification", force: "especificacao", modality: "especificação (candidata a investigar)" });
    const normal = await call("get_ds_rules", { component: "tab", limit: 50 });
    expect(normal.text).not.toContain("especificacao");
  });

  it("busca: consultas de tipografia, borda e alinhamento trazem a especificação separada das normas", async () => {
    const probes: Array<[Record<string, unknown>, string]> = [
      [{ query: "tipografia do rótulo da aba", component: "tab" }, TAB_TYPOGRAPHY_LABEL],
      [{ query: "borda do upload ao arrastar" }, UPLOAD_BORDER_SENTENCE],
      [{ query: "ícone do botão centralizado", component: "button" }, BUTTON_ICON_CENTERED],
      [{ query: "ícone do botão centralizado" }, BUTTON_ICON_CENTERED],
    ];
    for (const [args, id] of probes) {
      const r = await call("get_ds_rules", args);
      expect(r.text.length, JSON.stringify(args)).toBeLessThanOrEqual(8000);
      expect(r.data.results.every((c: { force: string | null }) => c.force !== "especificacao"), JSON.stringify(args)).toBe(true);
      expect(r.data.specification?.modality).toBe("especificação (candidata a investigar)");
      expect(r.data.specification.results[0].citeAs, JSON.stringify(args)).toBe(id);
      expect(r.data.specification.results[0].force).toBe("especificacao");
    }
  });

  it("um bloco related que não cabe não deixa mensagem órfã nem ultrapassa o teto", async () => {
    const r = await call("get_ds_rules", { query: "--color-primary-default", component: "cookiebar", force: "especificacao" });
    expect(r.isError).toBe(false);
    expect(r.text.length).toBeLessThanOrEqual(8000);
    if (!r.data.related) expect(r.data.messages?.["kb-relation"]).toBeUndefined();
    expect(r.data.results.length).toBeGreaterThan(0);
  });

  it("o bloco não muda a página das normas: mesmos cartões com e sem as especificações (force explícito tira o bloco)", async () => {
    for (const args of [{ query: "borda do upload ao arrastar" }, { query: "ícone do botão centralizado", component: "button" }]) {
      const withBlock = await call("get_ds_rules", args);
      const strictForces = ["required", "prohibited", "recommended", "discouraged", "permitted", "informative", "unclear"];
      const normsOnly = (withBlock.data.results as Array<{ citeAs: string }>).map((c) => c.citeAs);
      // a mesma busca restrita às normas, uma força por vez, não perde nenhum cartão da página
      const union = new Set<string>();
      for (const force of strictForces) for (const c of (await call("get_ds_rules", { ...args, force, limit: 10 })).data.results ?? []) union.add(c.citeAs);
      for (const id of normsOnly) expect(union.has(id)).toBe(true);
      const explicit = await call("get_ds_rules", { ...args, force: "especificacao" });
      expect(explicit.data.specification).toBeUndefined();
      expect(explicit.data.results.every((c: { kind: string }) => c.kind === "specification")).toBe(true);
    }
  });

  it("get_component_spec: resumo das especificações fora de rules.total e do checklist", async () => {
    const r = await call("get_component_spec", { component: "tab" });
    expect(r.data.rules.total).toBe(filterRules({ component: "tab" }).length);
    expect(r.data.rules.specification).toMatchObject({
      modality: "especificação (candidata a investigar)",
      units: filterRules({ component: "tab", force: "especificacao" }).length,
      next: { tool: "get_ds_rules", arguments: { component: "tab", force: "especificacao" } },
    });
    expect(r.data.rules.specification.facets).toEqual(expect.arrayContaining([{ facet: "Tipografia", tables: 1, rows: 3 }]));
    const check = await call("get_component_spec", { component: "tab", view: "checklist" });
    expect(check.text).not.toContain("especificacao");
  });
});
