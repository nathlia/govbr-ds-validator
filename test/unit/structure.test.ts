import { describe, it, expect, beforeEach } from "vitest";
import { checkComponentStructure, collectStructureObservations } from "../../src/checkers/structure.js";
import { getComponentSpecs } from "../../src/data/load.js";
import { resetFindingIds } from "../../src/schema/finding.js";
import { makeElement } from "../helpers/fixtures.js";
import { approximateAccessibleName } from "../../src/evidence/accessibleName.js";

const page = { url: "http://localhost:3000/test" };
const buttonSpec = getComponentSpecs().components.button;
const dividerSpec = getComponentSpecs().components.divider;

beforeEach(resetFindingIds);

describe("checkComponentStructure (against the real button spec)", () => {
  it("accepts a canonical primary button", () => {
    expect(checkComponentStructure(page, [makeElement()], buttonSpec)).toEqual([]);
  });

  it("flags br-button applied to a non-canonical tag", () => {
    const el = makeElement({ tagName: "a", outerHTML: '<a class="br-button primary">Enviar</a>' });
    const findings = checkComponentStructure(page, [el], buttonSpec);
    const tagFinding = findings.find((f) => f.rule.id === "ds-structure-button-tag");
    expect(tagFinding).toBeDefined();
    expect(tagFinding?.severity).toBe("serious");
    expect(tagFinding?.evidence.observed).toContain("<a>");
  });

  it("accepts br-button on a link that navigates — the DS's own breadcrumb, footer and menu do it (D-51)", () => {
    const el = makeElement({
      tagName: "a",
      classes: ["br-button", "circle"],
      attributes: { ...makeElement().attributes, href: "/solicitacao" },
      outerHTML: '<a class="br-button circle" href="/solicitacao"></a>',
    });
    expect(checkComponentStructure(page, [el], buttonSpec).filter((f) => f.rule.id === "ds-structure-button-tag")).toEqual([]);
  });

  it("still flags an anchor doing a button's job (href='#' or javascript:)", () => {
    for (const href of ["#", "javascript: void(0)", ""]) {
      const el = makeElement({ tagName: "a", attributes: { ...makeElement().attributes, href }, outerHTML: `<a class="br-button primary" href="${href}">Excluir</a>` });
      const finding = checkComponentStructure(page, [el], buttonSpec).find((f) => f.rule.id === "ds-structure-button-tag");
      expect(finding?.evidence.expected).toBe("Elemento <button>");
    }
  });

  it("flags br-button on a <div role=button>", () => {
    const el = makeElement({ tagName: "div", attributes: { ...makeElement().attributes, role: "button" }, outerHTML: '<div class="br-button circle" role="button"></div>' });
    expect(checkComponentStructure(page, [el], buttonSpec).some((f) => f.rule.id === "ds-structure-button-tag")).toBe(true);
  });

  it("keeps semantic <hr class=br-divider> as an observation, not a finding (D-28)", () => {
    const el = makeElement({
      tagName: "hr",
      classes: ["br-divider"],
      outerHTML: '<hr class="br-divider">',
    });
    expect(checkComponentStructure(page, [el], dividerSpec)).toEqual([]);
    const observations = collectStructureObservations(page, [el], dividerSpec);
    expect(observations.some(observation => observation.kind === "structure-semantic-native-tag")).toBe(true);
  });

  it("flags an icon-only button without aria-label (e-MAG 2.2)", () => {
    const el = makeElement({
      classes: ["br-button", "circle", "primary"],
      content: { textContent: "", hasVisibleText: false, hasIconOnly: true },
      outerHTML: '<button class="br-button circle primary"><i class="fas fa-city"></i></button>',
    });
    const findings = checkComponentStructure(page, [el], buttonSpec);
    const a11y = findings.find((f) => f.rule.id === "emag-2.2");
    expect(a11y).toBeDefined();
    expect(a11y?.rule.wcag).toBe("4.1.2");
    expect(a11y?.rule.description.length).toBeGreaterThan(10);
  });

  // 2.8.0 (NAT-33): a decisão é sobre ter nome acessível, não sobre ter aria-label. Sem o nome do
  // Chromium (evidência sem CDP ou anterior à 2.8.0), vale a aproximação pela ordem do cálculo de nome.
  describe("nome acessível (aproximação por atributos)", () => {
    const iconOnly = (attributes: Record<string, string | null>, content: Record<string, unknown> = {}) =>
      makeElement({
        classes: ["br-button", "circle"],
        attributes: { ...makeElement().attributes, ...attributes },
        content: { textContent: "", hasVisibleText: false, hasIconOnly: true, ...content },
      });
    const fires = (el: ReturnType<typeof makeElement>) =>
      checkComponentStructure(page, [el], buttonSpec).filter((f) => f.rule.id === "emag-2.2").length;

    it("aria-label vazio ou só com espaços não é nome", () => {
      expect(fires(iconOnly({ ariaLabel: "" }))).toBe(1);
      expect(fires(iconOnly({ ariaLabel: "   " }))).toBe(1);
    });

    it("title sozinho é nome", () => {
      expect(fires(iconOnly({ title: "Visualizar registro" }))).toBe(0);
      expect(fires(iconOnly({ title: "  " }))).toBe(1);
    });

    it("aria-labelledby vale quando a referência resolve texto; quebrada ou vazia, não", () => {
      expect(fires(iconOnly({ ariaLabelledby: "r" }, { labelledbyText: "Visualizar registro" }))).toBe(0);
      expect(fires(iconOnly({ ariaLabelledby: "nao-existe" }, { labelledbyText: "" }))).toBe(1);
    });

    it("alt e conteúdo de texto são nome", () => {
      expect(fires(iconOnly({ alt: "Buscar" }))).toBe(0);
    });

    it("alt de <img> dentro do botão é nome pelo conteúdo; <label> associado também", () => {
      expect(fires(iconOnly({}, { descendantAlt: "Buscar" }))).toBe(0);
      expect(fires(iconOnly({}, { descendantAlt: null }))).toBe(1);
      expect(fires(iconOnly({}, { labelText: "Pesquisar" }))).toBe(0);
    });

    it("precedência: labelledby > aria-label > alt/conteúdo > title", () => {
      expect(approximateAccessibleName(iconOnly({ ariaLabelledby: "r", ariaLabel: "B", title: "C" }, { labelledbyText: "A" }))).toBe("A");
      expect(approximateAccessibleName(iconOnly({ ariaLabelledby: "x", ariaLabel: "B", title: "C" }, { labelledbyText: "" }))).toBe("B");
      expect(approximateAccessibleName(iconOnly({ ariaLabel: " ", title: "C" }))).toBe("C");
    });

    it("o nome calculado pelo Chromium, quando colhido, prevalece sobre a aproximação", () => {
      // aria-label presente mas o navegador não expõe nome (ex.: elemento ignorado): acusa.
      expect(fires({ ...iconOnly({ ariaLabel: "X" }), accessibleName: { name: "", source: "chromium" } })).toBe(1);
      // nenhum atributo conhecido mas o navegador expõe nome (ex.: img com alt dentro): não acusa.
      expect(fires({ ...iconOnly({}), accessibleName: { name: "Buscar", source: "chromium" } })).toBe(0);
    });

    it("com nome presente não emite nada — nem a convenção de aria-label dos exemplos do DS", () => {
      const findings = checkComponentStructure(page, [iconOnly({ title: "Excluir" })], buttonSpec);
      expect(findings).toEqual([]);
      expect(collectStructureObservations(page, [iconOnly({ title: "Excluir" })], buttonSpec)).toEqual([]);
    });
  });

  it("accepts an icon-only button WITH aria-label", () => {
    const el = makeElement({
      classes: ["br-button", "circle", "primary"],
      attributes: { ariaLabel: "Abrir menu" } as never,
      content: { textContent: "", hasVisibleText: false, hasIconOnly: true },
    });
    expect(checkComponentStructure(page, [el], buttonSpec).filter((f) => f.rule.id === "emag-2.2")).toEqual([]);
  });

  // Regression: status/emphasis variants (danger, success, info, warning)
  // exist only in button.css selectors, never in the official example HTML —
  // the spec extraction used to miss them and flag conformant buttons.
  it("accepts CSS-defined status variants absent from the example HTML", () => {
    for (const variant of ["danger", "success", "info", "warning"]) {
      const el = makeElement({
        classes: ["br-button", variant],
        outerHTML: `<button class="br-button ${variant}" type="button">Enviar</button>`,
      });
      expect(
        checkComponentStructure(page, [el], buttonSpec).filter((f) => f.rule.id === "ds-structure-button-variant")
      ).toEqual([]);
    }
  });

  // D-27: classe fora do vocabulário canônico não é violação — nenhuma regra do gov.br DS a
  // proíbe, e o próprio DS distribui utilitárias. Continua sendo informação para quem revisa,
  // e é isso que a observação carrega. Se voltar a sair como achado, entra na precisão de novo.
  it("reporta classe não canônica como observação, nunca como achado", () => {
    const el = makeElement({ classes: ["br-button", "primary", "botao-customizado"] });

    const findings = checkComponentStructure(page, [el], buttonSpec);
    expect(findings.find((f) => /variant/.test(f.rule.id))).toBeUndefined();

    const observations = collectStructureObservations(page, [el], buttonSpec);
    expect(observations).toHaveLength(1);
    expect(observations[0].kind).toBe("structure-unknown-classes");
    expect(observations[0].data?.unknownClasses).toEqual(["botao-customizado"]);
    expect(observations[0].whyNotAFinding).toMatch(/NÃO HÁ NORMA/);
  });

  it("não observa nada quando as classes são canônicas ou utilitárias", () => {
    const el = makeElement({ classes: ["br-button", "primary", "mt-3", "text-center"] });
    expect(collectStructureObservations(page, [el], buttonSpec)).toEqual([]);
  });

  // Todo achado determinístico tem de nomear a norma que aplica (D-27).
  it("declara em implements a regra normativa de cada achado", () => {
    const semNome = makeElement({
      classes: ["br-button", "circle"],
      content: { textContent: "", hasVisibleText: false, hasIconOnly: true },
    });
    const comoLink = makeElement({ tagName: "a", classes: ["br-button", "primary"] });

    for (const el of [semNome, comoLink]) {
      for (const f of checkComponentStructure(page, [el], buttonSpec)) {
        expect(f.rule.implements ?? []).not.toHaveLength(0);
      }
    }
  });

  it("ignores elements that do not carry the root class", () => {
    const el = makeElement({ classes: ["outra-coisa"] });
    expect(checkComponentStructure(page, [el], buttonSpec)).toEqual([]);
  });
});
