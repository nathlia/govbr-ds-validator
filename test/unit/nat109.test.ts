/**
 * NAT-109 (3.3.0): defeitos de busca/contrato do reteste adversarial da 3.2.0 (achados-3.2.0.md), unidade.
 */
import { describe, it, expect } from "vitest";
import { cleanText, promoteHinted, rankRules, tokenize } from "../../src/data/retrieval.js";
import { parseColor, looksLikeColor } from "../../src/data/colorValue.js";
import { DENSE_MIN_CLAUSE_TERMS, denseClauseAdmissible, kbAnchor } from "../../src/data/hybrid.js";
import { clip, clipDeep, fail, unknownFieldsMessage, RESPONSE_BUDGET } from "../../src/responses/contract.js";
import { getKnowledgeBase, getRuleById, type KnowledgeRule } from "../../src/data/knowledge.js";
import { currentPointer, emagTemplateCitation, isTitleRecord } from "../../src/responses/retrieval.js";

const keys = (text: string) => tokenize(text).map((t) => t.key).join(" ");

describe("N-04: plural dobrado nos dois sentidos (mesma função no índice e na consulta)", () => {
  const pairs: Array<[string, string]> = [
    ["campo", "campos"], // -s
    ["cor", "cores"], ["mês", "meses"], ["país", "países"], // -es
    ["botão", "botões"], ["ação", "ações"], // -ões
    ["capitão", "capitães"], ["alemão", "alemães"], // -ães
    ["imagem", "imagens"], ["item", "itens"], ["bem", "bens"], // -ns
    ["papel", "papéis"], ["fácil", "fáceis"], ["sinal", "sinais"], ["nível", "níveis"], ["azul", "azuis"], // -is
    ["rótulo", "rótulos"], ["cabeçalho", "cabeçalhos"], ["token", "tokens"],
  ];
  it.each(pairs)("%s ↔ %s: mesma chave exata", (singular, plural) => {
    expect(keys(plural)).toBe(keys(singular));
  });

  it("campos casa as cláusulas só com 'campo' e vice-versa (mesmo conjunto)", () => {
    const sg = new Set(rankRules({ text: "campo" }).results.map((s) => s.rule.id));
    const pl = new Set(rankRules({ text: "campos" }).results.map((s) => s.rule.id));
    expect([...pl].sort()).toEqual([...sg].sort());
    expect(sg.size).toBeGreaterThan(50);
  });

  it("botões e botão: mesmo top-10", () => {
    const a = rankRules({ text: "botões" }).results.slice(0, 10).map((s) => s.rule.id);
    const b = rankRules({ text: "botão" }).results.slice(0, 10).map((s) => s.rule.id);
    expect(a).toEqual(b);
  });
});

describe("N-14: NFKC e caracteres de formato", () => {
  it("espaço de largura zero e largura total não partem nem apagam a palavra", () => {
    expect(cleanText("bo​tão")).toBe("botão");
    expect(keys("bo​tão")).toBe(keys("botão"));
    expect(keys("ｆｏｃｏ ｖｉｓíｖｅｌ")).toBe(keys("foco visível"));
    expect(rankRules({ text: "bo​tão" }).results.length).toBe(rankRules({ text: "botão" }).results.length);
  });
});

describe("N-03: valor de cor do hex", () => {
  it.each([
    ["#fff", "#ffffff"], ["FFF", "#ffffff"], ["#1351B4", "#1351b4"], ["1351b4", "#1351b4"], ["#1351b4ff", "#1351b4"],
    ["rgb(19,81,180)", "#1351b4"], ["rgb(19, 81, 180)", "#1351b4"], ["rgba(19, 81, 180, 1)", "#1351b4"], ["rgb(19 81 180 / 100%)", "#1351b4"],
  ])("%s → %s", (given, hex) => expect(parseColor(given)).toEqual({ ok: true, hex }));
  it.each(["zzz", "", "#", "__proto__", "rgb(300,0,0)", "rgb(1,2)", "#12345"])("'%s' não é cor", (given) => expect(parseColor(given)).toMatchObject({ ok: false, reason: "not-a-color" }));
  it("alfa < 1 é translúcida (a cor vista depende do fundo)", () => {
    expect(parseColor("rgba(19, 81, 180, 0.5)")).toEqual({ ok: false, reason: "translucent", alpha: 0.5 });
    expect(parseColor("#1351b480")).toMatchObject({ ok: false, reason: "translucent" });
  });
  it("query com cara de cor", () => {
    expect(looksLikeColor("#1351b4")).toBe(true);
    expect(looksLikeColor("rgb(1,2,3)")).toBe(true);
    expect(looksLikeColor("color-primary")).toBe(false);
  });
});

describe("N-06: pista de componente promove, nunca rebaixa", () => {
  it("promoteHinted: 1ª própria até a 2ª posição, 2ª até a 4ª; ordem interna mantida", () => {
    const own = (x: string) => x.startsWith("o");
    expect(promoteHinted(["g1", "g2", "g3", "g4", "o1", "g5", "o2"], own)).toEqual(["g1", "o1", "g2", "o2", "g3", "g4", "g5"]);
    expect(promoteHinted(["o1", "g1", "o2"], own)).toEqual(["o1", "g1", "o2"]);
    expect(promoteHinted(["g1", "g2"], own)).toEqual(["g1", "g2"]);
  });
  it.each([["foco", "pagination"], ["foco", "menu"], ["erro", "input"]])("query '%s' + component '%s': regras do componente na 1ª página", (text, component) => {
    const top = rankRules({ text, component }).results.slice(0, 5);
    expect(top.filter((s) => s.rule.component === component).length).toBeGreaterThanOrEqual(1);
    expect(top.some((s) => s.rule.component === null) || top.every((s) => s.rule.component === component)).toBe(true);
  });
});

describe("N-08/N-09: admissão só-vetorial", () => {
  const rule = (text: string) => ({ id: `t-${text}`, originalText: text, normalizedRule: "", title: "" }) as unknown as KnowledgeRule;
  const q = (text: string) => new Set(tokenize(text).flatMap((t) => [t.key, t.stem]));
  it(`cláusula com < ${DENSE_MIN_CLAUSE_TERMS} termos de conteúdo nunca entra só pelo vetor`, () => {
    expect(denseClauseAdmissible(rule("Seu uso é opcional."), q("uso opcional"), 0.99, 0.87)).toBe(false);
  });
  it("sem termo em comum, só com cosseno ≥ limiar estrito; com termo em comum, o limiar normal basta", () => {
    const r = rule("O texto deve ter contraste suficiente com o fundo da página.");
    expect(denseClauseAdmissible(r, q("cinza claro difícil de ler"), 0.86, 0.87)).toBe(false);
    expect(denseClauseAdmissible(r, q("cinza claro difícil de ler"), 0.871, 0.87)).toBe(true);
    expect(denseClauseAdmissible(r, q("texto cinza"), 0.86, 0.87)).toBe(true);
    expect(denseClauseAdmissible(r, q("cinza claro"), 0.99, undefined)).toBe(false);
  });
  it("âncora por maioria estrita", () => {
    expect(kbAnchor("futebol botão").anchored).toBe(false);
    expect(kbAnchor("foco botão").anchored).toBe(true);
  });
});

describe("N-01: eco da entrada com teto", () => {
  it("clip e clipDeep", () => {
    expect(clip("x".repeat(500))).toMatch(/^x{120}…\(truncado, 500 caracteres\)$/);
    expect(clipDeep({ a: ["y".repeat(5000)], b: Array.from({ length: 50 }, (_, i) => i) }, 100, 10)).toMatchObject({ b: expect.arrayContaining(["…(+40 itens omitidos)"]) });
  });
  it("fail() nunca passa do orçamento, mesmo com eco enorme", () => {
    const big = fail({ error: `x${"z".repeat(100_000)}`, errorCode: "unknown-id", field: "id", missing: Array.from({ length: 2000 }, () => "q".repeat(3000)), next: [] });
    expect(big.content[0].text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
  });
  it("mensagem de campo desconhecido: até 5 chaves, cada uma cortada", () => {
    const msg = unknownFieldsMessage("get_ds_rules", ["k".repeat(50_000), ...Array.from({ length: 2000 }, (_, i) => `c${i}`)], ["query"]);
    expect(msg.length).toBeLessThan(800);
    expect(msg).toContain("e mais 1996");
  });
});

describe("B-15/N-19/N-15/B-09: ids históricos apontam a regra corrente", () => {
  it("dropped sem sucessora → regra corrente de texto mais próximo, dita como ponteiro de leitura", () => {
    const dropped = getRuleById("govbr-3.7.0-accessibility-global-e038367bd7d6")!;
    expect(dropped.legacy?.class).toBe("dropped");
    const p = currentPointer(dropped);
    expect(p).toMatchObject({ basis: "closest-text-lexical", next: { tool: "get_ds_rules" } });
    expect(getRuleById(p.id!)!.legacy).toBeUndefined();
  });
  it("e-MAG: todo template aponta uma cláusula corrente que não é registro-título", () => {
    const kb = getKnowledgeBase();
    const recs = [...new Set(kb.rules.flatMap((r) => (r.standard === "eMAG" ? r.emagReferences : [])))];
    let checked = 0;
    for (const rec of recs) {
      const c = emagTemplateCitation(rec, `nao-existe-${rec}`, getRuleById);
      if (!c.id) continue;
      const rule = getRuleById(c.id)!;
      expect(rule.legacy, rec).toBeUndefined();
      expect(isTitleRecord(rule), rec).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(30);
  });
});
