import { describe, expect, it } from "vitest";
import { getRuleById, type KnowledgeRule } from "../../src/data/knowledge.js";
import { literalProcedure } from "../../src/tools/literalProcedures.js";
import { procedureOf, procedureLine, procedureShort, investigateClauses } from "../../src/tools/componentChecklist.js";

const rule = (text: string, extra: Partial<KnowledgeRule> = {}): KnowledgeRule => ({
  ...getRuleById("govbr-3.7.0-development-datetimepicker-07bff31211f5")!,
  id: "test-literal", originalText: text, force: "required", validationStrategy: "dom", conditions: [], ...extra,
});
const derive = (text: string, extra: Partial<KnowledgeRule> = {}) => literalProcedure(rule(text, extra), ".br-field");

describe("A4 — só expectativas expressas pela cláusula", () => {
  it("atributos literais, múltiplas exigências e igualdade preservam objetos e condições", () => {
    const p = derive('Quando houver ícone decorativo, não utilize atributo `title`.', { force: "prohibited", conditions: ["Somente no ícone ao lado do rótulo"] })!;
    expect(p.expect).toBe("title: ausente");
    expect(p.when).toContain("ícone decorativo");
    expect(p.when).toContain("Somente no ícone");
    const multiple = derive('O campo deve conter os atributos `aria-hidden="true"` e `tabindex="-1"`.')!;
    expect(multiple.expect).toBe("aria-hidden: true; tabindex: -1");
    expect(derive('Não utilize o atributo `aria-hidden="false"`.', { force: "prohibited" })?.expect).toBe("aria-hidden: diferente de false ou ausente");
    const equal = derive('Nos filhos deve-se incluir o atributo `data-child`, com o mesmo valor do atributo `data-parent` no pai.')!;
    expect(equal.expect).toContain("data-child = data-parent");
    expect(equal.when).toContain("no pai");
    const prose = derive('Devem ser utilizados ambos os atributos name e id nas âncoras.')!;
    expect(prose.expect).toBe("name: presente; id: presente");
  });

  it("não converte menção, mudança de valor ou proibição de repetir conteúdo em ausência", () => {
    for (const text of ['O atributo `data-input` descreve a integração.', 'Jamais repita o texto no atributo `title`.', 'Não altere o valor de `aria-hidden`.']) {
      expect(derive(text, { force: "prohibited" }), text).toBeNull();
    }
    expect(derive('Não utilize atributo `title`.', { force: "required" })).toBeNull();
    expect(derive('O campo deve conter `aria-label="nome descritivo"`.')).toBeNull();
    expect(derive('Deve incluir o atributo `data-input`.', { force: "recommended" })).toBeNull();
    expect(derive('Deve incluir o atributo `data-input`.', { force: "especificacao" })).toBeNull();
    expect(derive('Deve incluir o atributo `data-input`.', { validationStrategy: "source-code" })).toBeNull();
  });

  it("token declara a propriedade, sem supor seu valor numérico", () => {
    const p = derive('O rótulo deverá usar o estilo (–font-size-scale-base).')!;
    expect(p.measure).toContain("font-size");
    expect(p.expect).toBe("valor resolvido de --font-size-scale-base");
    expect(p.when).toContain("–font-size-scale-base");
    expect(p.provenance).toContain("normaliza só o prefixo CSS");
    expect(derive('O texto deve evitar --font-size-scale-base.')).toBeNull();
    expect(derive('O texto pode usar --font-size-scale-base.')).toBeNull();
    expect(derive('A cor deve ser --blue-10.')).toBeNull();
  });

  it("dimensão preserva mínimo/máximo, múltiplos conjuntos e parâmetros do grid", () => {
    expect(derive('A largura deve ter mínimo de 24px.')?.expect).toBe("≥ 24px");
    expect(derive('A altura deve ter máximo de 38px.')?.expect).toBe("≤ 38px");
    expect(derive('A largura precisa ter valor múltiplo 4px e 8px;')?.expect).toContain("4px e 8px");
    expect(derive('O conteúdo deve ter 6 colunas respeitando a margem de 12px nas laterais e medianiz de 20px.')?.expect).toContain("6 colunas; laterais 12px; medianiz 20px");
    expect(derive('A largura deve ser de 20px ou 30px.')).toBeNull();
    expect(derive('A largura deve ser proporcional ao conteúdo.')).toBeNull();
  });

  it("ordem de filhos requer pai/filho inequívocos e não se confunde com foco", () => {
    const p = derive('Caso haja um elemento FIGCAPTION este deve ser o primeiro ou o último filho do elemento FIGURE e só um FIGCAPTION representará a legenda.')!;
    expect(p.measure).toContain("filhos diretos de FIGURE");
    expect(p.expect).toContain("primeiro ou o último");
    expect(p.expect).toContain("só um");
    expect(p.when).toContain("Caso haja");
    expect(derive('No HTML o FIGCAPTION deve ser o primeiro filho do elemento FIGURE.')).toBeNull();
    expect(derive('O primeiro campo deve receber o foco.')).toBeNull();
    expect(derive('A ordem lógica dos filhos deve ser compreensível.')).toBeNull();
  });

  it("deriva casos reais da base nas quatro classes, sem expor especificação como norma", () => {
    for (const id of [
      "govbr-3.7.0-development-datetimepicker-07bff31211f5",
      "govbr-3.7.0-component-pagination-7337f527bbbc",
      "govbr-3.7.0-component-signin-ba7b11bddab7",
      "govbr-3.7.0-foundation-global-4b6c47547911",
    ]) {
      const source = getRuleById(id)!;
      const p = procedureOf(source)!;
      expect(p, id).not.toBeNull();
      expect(p.when, id).toContain(source.originalText.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim());
      expect(procedureLine(p), id).toContain("espera:");
    }
    const children = procedureOf(getRuleById("govbr-3.7.0-development-checkbox-b82b029f0076")!)!;
    expect(children.expect).toBe("data-child = data-parent; não basta presença");
    expect(children.when).not.toContain("data-parentdo");
  });

  it("escopo herdado é literal/versionado; projeção curta difere em vez de perder condição", () => {
    const image = procedureOf(getRuleById("govbr-3.7.0-component-signin-ba7b11bddab7")!)!;
    expect(image.context?.text).toMatch(/assinatura institucional/i);
    expect(image.context?.text).toMatch(/[áa]rea da imagem/i);
    expect(image.context?.source.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(image.context)).toBe(true);
    expect(Object.isFrozen(image.context?.source.ranges)).toBe(true);
    const grid = procedureOf(getRuleById("govbr-3.7.0-foundation-global-4b6c47547911")!)!;
    expect(grid.context?.text).toMatch(/breakpoint/);
    expect(grid.context?.text).toMatch(/559/);
    for (const component of ["button", "carousel", "pagination", "signin"]) {
      const clauses = investigateClauses(component, Infinity).clauses;
      for (const clause of clauses) {
        const proc = procedureOf(getRuleById(clause.citeAs)!, component)!;
        if (!proc.context) continue;
        expect(clause.how).toMatch(/diferidos.*checklist/);
        expect(clause.short).toBe(procedureShort(proc));
        expect(clause.short).toMatch(/checklist deste componente/);
        expect(clause.short).not.toMatch(/title: ausente|data-mobile-nav: presente|valor resolvido de…/);
      }
    }
  });
});
