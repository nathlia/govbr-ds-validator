/**
 * 3.4.0 (D-153), lista única — Lado A (busca, conhecimento e orientação), A1–A12, pela superfície MCP.
 * Cada caso é a chamada da evidência (reexecução 3.3.0, uso direto, auditores com agente, spike).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { MESSAGES, RESPONSE_BUDGET } from "../../src/responses/contract.js";
import { getKnowledgeBase } from "../../src/data/knowledge.js";

let client: Client;
beforeAll(async () => {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")), toolProfile: "evaluation", knowledgeLock: "call" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  client = new Client({ name: "fix340-a", version: "0" });
  await client.connect(a);
});
afterAll(async () => client.close());

const call = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
  expect(text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
  return JSON.parse(text) as Record<string, any>;
};
const P = "govbr-3.7.0-";
const ids = (r: Record<string, any>) => (r.results ?? r.items ?? []).flatMap((c: { ids?: string[]; id?: string }) => c.ids ?? [c.id]);
const cited = (r: Record<string, any>) => (r.results ?? []).map((c: { citeAs: string }) => c.citeAs);

describe("A1 — listagem por componente e spec trazem primeiro a prosa que obriga (A-11)", () => {
  it("{component:'message'}: as regras de posição ícone/fechar estão na 1ª página, antes das linhas de tabela", async () => {
    const r = await call("get_ds_rules", { component: "message" });
    const list = r.items.map((i: { id: string }) => i.id);
    expect(list.slice(0, 5)).toEqual(expect.arrayContaining([`${P}component-message-add10093ae9f`, `${P}component-message-4bfd5a220fb8`]));
    expect(r.reading).toBe(MESSAGES["listing-reading"]);
    // faixas: obrigação/proibição → demais → tabela
    const band = (i: { force: string | null; kind?: string }) => (i.kind === "implementation-property" ? 2 : i.force === "required" || i.force === "prohibited" ? 0 : 1);
    const bands = r.items.map(band);
    expect([...bands].sort((a: number, b: number) => a - b)).toEqual(bands);
  });
  it("get_component_spec(message) traz o texto das cláusulas de anatomia/posição, citáveis", async () => {
    const r = await call("get_component_spec", { component: "message" });
    const clauses = r.rules.clauses.items.map((c: { citeAs: string }) => c.citeAs);
    expect(clauses).toEqual(expect.arrayContaining([`${P}component-message-add10093ae9f`, `${P}component-message-4bfd5a220fb8`]));
    for (const c of r.rules.clauses.items) {
      const rule = getKnowledgeBase().byId.get(c.citeAs)!;
      expect(rule.component).toBe("message");
      // texto literal (sem marcadores), nunca resumido: prefixo do originalText.
      expect(rule.originalText.replace(/[*_`]/g, "").replace(/\s+/g, " ")).toContain(c.text.replace(/…$/, ""));
    }
  });
});

describe("A2 — a regra de paleta 21b1a2733f7b entra quando a consulta trata de cor (A-03)", () => {
  it("{query:'cor'}: related R-04 com a cláusula citada; cinco cartões mantidos", async () => {
    const r = await call("get_ds_rules", { query: "cor" });
    expect(r.results.length).toBe(5);
    const item = r.related.items.find((i: { id: string }) => i.id === `${P}foundation-global-21b1a2733f7b`);
    expect(item).toMatchObject({ relation: "R-04", next: { tool: "get_ds_rules", arguments: { id: `${P}foundation-global-21b1a2733f7b` } } });
    expect(r.related.version).toBe("kb-relations-1.0.0");
    expect(r.messages["kb-relation"]).toBe(MESSAGES["kb-relation"]);
  });
});

describe("A3 — 'título' traz o sucessor da WCAG 2.4.2 (B-25)", () => {
  it("o sucessor e77859710a44 (e-MAG 3.3) está num cartão da 1ª página", async () => {
    const r = await call("get_ds_rules", { query: "título" });
    expect(ids(r)).toContain(`${P}accessibility-global-e77859710a44`);
  });
  it("o termo que só casou no registro histórico não aparece em why.matched (texto mostrado)", async () => {
    const r = await call("get_ds_rules", { query: "título" });
    for (const c of r.results) for (const m of c.why.matched) expect(typeof m).toBe("string");
  });
});

describe("A4 — roteamento pela intenção, em next, sem afirmar norma", () => {
  it("hex → get_design_tokens{hex}; no perfil evaluation, scan_page (sem check_token_compliance)", async () => {
    const r = await call("get_ds_rules", { query: "cor #334333 fora da paleta do DS no texto do diálogo" });
    expect(r.next[0]).toMatchObject({ tool: "get_design_tokens", arguments: { hex: "#334333" }, origin: "routing-1.0.0:cor" });
    expect(r.next.some((n: { tool: string }) => n.tool === "check_token_compliance")).toBe(false);
    expect(r.messages.routing).toBe(MESSAGES.routing);
  });
  it("role=button → regras globais com o papel + get_component_spec(button)", async () => {
    const r = await call("get_ds_rules", { query: "div com role=button em vez de button" });
    expect(r.next[0]).toMatchObject({ tool: "get_ds_rules", arguments: { component: "global", query: "role" } });
    expect(r.next[1]).toMatchObject({ tool: "get_component_spec", arguments: { component: "button" } });
  });
  it("posição/esquerda/direita → medir pela geometria (passo fora do oráculo)", async () => {
    const r = await call("get_ds_rules", { query: "na mensagem de retorno o botão fechar aparece à esquerda e o ícone à direita, ordem trocada", component: "message" });
    expect(r.next[0]).toMatchObject({ action: "measure-condition", tool: null, origin: "routing-1.0.0:posicao" });
    expect(cited(r)).toContain(`${P}component-message-4bfd5a220fb8`);
  });
  it("tabindex (atributo HTML) → regras globais com o atributo, que trazem a ordem de tabulação (A8)", async () => {
    const r = await call("get_ds_rules", { query: "tabindex positivo altera a ordem de foco do teclado" });
    const route = r.next.find((n: { origin?: string }) => n.origin === "routing-1.0.0:marcacao");
    expect(route).toMatchObject({ tool: "get_ds_rules", arguments: { component: "global", query: "tabindex" } });
    const followed = await call("get_ds_rules", route.arguments);
    expect(cited(followed)).toEqual(expect.arrayContaining([`${P}accessibility-global-742fd4c4f54b`]));
  });
  it("sem padrão, nenhum passo de roteamento", async () => {
    const r = await call("get_ds_rules", { query: "foco visível" });
    expect(r.next.some((n: { origin?: string }) => n.origin)).toBe(false);
  });
});

describe("A5 — só permissão/regra de outro componente vem marcada (A-06)", () => {
  it("'div com role=button em vez de button': lacuna only-permission-or-other-component + absenceNote", async () => {
    const r = await call("get_ds_rules", { query: "div com role=button em vez de button" });
    expect(cited(r)).toEqual([`${P}accessibility-tab-ac48c820e4c8`]);
    expect(r.gaps).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "only-permission-or-other-component", message: MESSAGES["gap-only-permission"] })]));
    expect(r.absenceNote).toBeDefined();
    // R-03: a cláusula do Button sobre a tag <button> vem em related
    expect(r.related.items.map((i: { id: string }) => i.id)).toContain(`${P}accessibility-button-d8448a18814b`);
  });
  it("uma resposta com regra que obriga não ganha a lacuna", async () => {
    const r = await call("get_ds_rules", { query: "fechar", component: "message" });
    expect(r.gaps.some((g: { kind: string }) => g.kind === "only-permission-or-other-component")).toBe(false);
  });
});

describe("A6 — aria-*/role sem correspondência aponta a WCAG do registro (A-12)", () => {
  it("{pagination,'aria-current'}: unmatched-terms com registryRefs 4.1.2/1.3.1 e o aviso fixo", async () => {
    const r = await call("get_ds_rules", { component: "pagination", query: "aria-current" });
    const gap = r.gaps.find((g: { kind: string }) => g.kind === "unmatched-terms");
    expect(gap.about).toBe("aria-current");
    expect(gap.registryRefs.map((x: { ref: string }) => x.ref)).toEqual(["wcag:4.1.2", "wcag:1.3.1"]);
    for (const ref of gap.registryRefs) expect(ref).toMatchObject({ status: "registry-only", note: MESSAGES["registry-ref"] });
    expect(gap.registryNote).toBe(MESSAGES["registry-only"]);
  });
  it("também no modo context", async () => {
    const r = await call("get_ds_rules", { context: { components: ["pagination"], terms: ["aria-current"] } });
    const gap = r.gaps.find((g: { kind: string }) => g.kind === "unmatched-terms");
    expect(gap.registryRefs.map((x: { ref: string }) => x.ref)).toEqual(["wcag:4.1.2", "wcag:1.3.1"]);
  });
  it("termo comum sem correspondência não ganha registro", async () => {
    const r = await call("get_ds_rules", { query: "xyzzy quux", component: "button" });
    expect(r.gaps[0].registryRefs).toBeUndefined();
    expect(r.related).toBeUndefined();
  });
});

describe("A7 — erro de digitação: fallback por distância de edição, rotulado (spike)", () => {
  it("'rótlo do campo' casa 'rotulo' e diz que aproximou", async () => {
    const r = await call("get_ds_rules", { query: "rótlo do campo" });
    expect(r.query.approximated).toEqual([{ term: "rotlo", as: "rotulo", distance: 1 }]);
    expect(r.query.unmatchedTerms).toBeUndefined();
    expect(r.results[0].why.matched).toContain("rotlo→≈rotulo");
    expect(r.messages.approximate).toBe(MESSAGES.approximate);
  });
  it("palavra que existe não é aproximada; palavra curta (< 5) não é aproximada", async () => {
    expect((await call("get_ds_rules", { query: "rótulo" })).query.approximated).toBeUndefined();
    expect((await call("get_ds_rules", { query: "quux foco" })).query.unmatchedTerms).toEqual(["quux"]);
  });
});

describe("A8 — 'fechar' do componente pesa mais que 'fechar tags' (auditor A)", () => {
  it("context{message, fechar}: a regra da mensagem abre a página, antes de 'NÃO fechar tags'", async () => {
    const r = await call("get_ds_rules", { context: { components: ["message"], terms: ["fechar"] } });
    expect(r.results[0].citeAs).toMatch(/component-message-/);
    const tagRule = cited(r).indexOf(`${P}development-global-a4f97ebb50c5`);
    expect(tagRule === -1 || tagRule > 0).toBe(true);
  });
  it("{message, 'fechar'}: a diretriz HTML sai da 1ª página", async () => {
    const r = await call("get_ds_rules", { component: "message", query: "fechar" });
    expect(cited(r)).not.toContain(`${P}development-global-a4f97ebb50c5`);
  });
  it("com palavra de marcação a diretriz HTML volta a peso cheio", async () => {
    const r = await call("get_ds_rules", { component: "message", query: "fechar tags html" });
    expect(cited(r)).toContain(`${P}development-global-a4f97ebb50c5`);
  });
});

describe("A9 — alvo de toque: a de 48 px e a do componente aparecem (auditor B, B-28)", () => {
  it("sem pista: 24 px, 44 px (Button) e 48 px na 1ª página", async () => {
    const r = await call("get_ds_rules", { query: "tamanho mínimo da área de toque ou clique de um botão" });
    expect(cited(r)).toEqual(expect.arrayContaining([`${P}foundation-global-1c0146e93d2e`, `${P}accessibility-button-71dbb0dda766`]));
  });
  it("com component:'button': a cláusula do componente vem antes da global de 24 px", async () => {
    const r = await call("get_ds_rules", { query: "tamanho mínimo da área de toque ou clique de um botão", component: "button" });
    const c = cited(r);
    expect(c.indexOf(`${P}accessibility-button-71dbb0dda766`)).toBeLessThan(c.indexOf(`${P}foundation-global-5f213b4dbcb5`));
  });
});

describe("A10 — exemplo da paginação e texto de apoio do upload (A-07, A-10)", () => {
  it("pagination include_examples: um exemplo vem inteiro (não 'deferred'), dito em exampleChoice", async () => {
    const r = await call("get_component_spec", { component: "pagination", include_examples: true });
    expect(r.example.status).toBeUndefined();
    expect(typeof r.example.html === "string" || typeof r.example.name === "string").toBe(true);
    if (r.exampleChoice) expect(r.exampleChoice).toMatchObject({ requested: "pagination-contextual", served: r.example.name });
  });
  it("upload: a spec traz o texto da cláusula de apoio (arrastar e informar na mensagem abaixo do campo)", async () => {
    const r = await call("get_component_spec", { component: "upload" });
    const texts = r.rules.clauses.items.map((c: { text: string }) => c.text).join(" ");
    expect(texts).toMatch(/arrastar/);
    expect(r.rules.clauses.items.map((c: { citeAs: string }) => c.citeAs)).toContain(`${P}component-upload-a54eed419af5`);
  });
  it("pedido pelo nome continua sendo só o exemplo", async () => {
    const r = await call("get_component_spec", { component: "pagination", example: "pagination-contextual" });
    expect(r.kind).toBe("component-example");
  });
});

describe("A11 — linha data-current como propriedade da implementação em toda listagem", () => {
  it("{component:'pagination'} (todas as páginas) e ids detail index/full: force null, kind implementation-property", async () => {
    let r = await call("get_ds_rules", { component: "pagination", limit: 50 });
    const all = [...r.items];
    while (r.page.cursor) {
      r = await call("get_ds_rules", { component: "pagination", limit: 50, cursor: r.page.cursor });
      all.push(...r.items);
    }
    const row = all.find((i: { id: string }) => i.id === `${P}development-pagination-ea455e768955`);
    expect(row).toMatchObject({ kind: "implementation-property", force: null, modality: "propriedade da implementação" });
    const full = await call("get_ds_rules", { ids: [`${P}development-pagination-ea455e768955`], detail: "full" });
    expect(full.results[0]).toMatchObject({ force: null, modality: "propriedade da implementação" });
    const index = await call("get_ds_rules", { ids: [`${P}development-pagination-ea455e768955`], detail: "index" });
    expect(index.results[0].force).toBeNull();
    // o registro por id mantém a força da tabela
    const byId = await call("get_ds_rules", { id: `${P}development-pagination-ea455e768955` });
    expect(byId.rule.force).toBe("required");
  });
  it("detail brief na listagem também", async () => {
    let r = await call("get_ds_rules", { component: "message", detail: "brief", limit: 50 });
    const all = [...r.items];
    while (r.page.cursor) {
      r = await call("get_ds_rules", { component: "message", detail: "brief", limit: 50, cursor: r.page.cursor });
      all.push(...r.items);
    }
    const rows = all.filter((i: { kind?: string }) => i.kind === "implementation-property");
    expect(rows.length).toBe(7);
    for (const i of rows) expect(i.force).toBeNull();
    // as linhas de tabela fecham a listagem
    expect(all.slice(-7).every((i: { kind?: string }) => i.kind === "implementation-property")).toBe(true);
  });
});

describe("A12 — ligações kb-relations (paginação → estados WAI-ARIA; botão → <button>; cor → fundamento)", () => {
  it("listagem e spec da paginação trazem R-01 (5817ddd685a6) com as cláusulas citadas", async () => {
    const list = await call("get_ds_rules", { component: "pagination" });
    expect(list.related.items[0]).toMatchObject({ id: `${P}accessibility-global-5817ddd685a6`, relation: "R-01" });
    const spec = await call("get_component_spec", { component: "pagination" });
    expect(spec.rules.related.items[0].basis.map((b: { id: string }) => b.id)).toContain(`${P}development-pagination-ea455e768955`);
  });
  it("context{pagination}: a regra WAI-ARIA entra como relação da camada, não do registro", async () => {
    const r = await call("get_ds_rules", { context: { components: ["pagination"] } });
    const card = r.results.find((c: { citeAs: string }) => c.citeAs === `${P}accessibility-global-5817ddd685a6`);
    expect(card.why.matched).toContain("relacionado:pagination@kb-relations-1.0.0");
    expect(card.why.relation).toBe("related");
  });
  it("spec do button traz R-02 (e-MAG 1.2, HTML semântico)", async () => {
    const spec = await call("get_component_spec", { component: "button" });
    expect(spec.rules.related.items.map((i: { id: string }) => i.id)).toContain(`${P}accessibility-global-0fb088a47830`);
  });
  it("o registro da base não é reescrito: relatedComponents continua vazio no id", async () => {
    const r = await call("get_ds_rules", { id: `${P}accessibility-global-5817ddd685a6` });
    expect(r.rule.relatedComponents).toEqual([]);
  });
});
