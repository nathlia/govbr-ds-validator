import { describe, it, expect, beforeEach } from "vitest";
import { checkComponentStructure } from "../../src/checkers/structure.js";
import { getComponentSpecs } from "../../src/data/load.js";
import { resetFindingIds } from "../../src/schema/finding.js";
import { makeElement } from "../helpers/fixtures.js";

const page = { url: "http://localhost:3000/test" };
const buttonSpec = getComponentSpecs().components.button;

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

  it("accepts an icon-only button WITH aria-label", () => {
    const el = makeElement({
      classes: ["br-button", "circle", "primary"],
      attributes: { ariaLabel: "Abrir menu" } as never,
      content: { textContent: "", hasVisibleText: false, hasIconOnly: true },
    });
    expect(checkComponentStructure(page, [el], buttonSpec).filter((f) => f.rule.id === "emag-2.2")).toEqual([]);
  });

  it("flags unknown variant classes as minor review signals", () => {
    const el = makeElement({ classes: ["br-button", "primary", "botao-customizado"] });
    const findings = checkComponentStructure(page, [el], buttonSpec);
    const variant = findings.find((f) => f.rule.id === "ds-structure-button-variant");
    expect(variant?.severity).toBe("minor");
    expect(variant?.evidence.data?.unknownClasses).toEqual(["botao-customizado"]);
  });

  it("ignores elements that do not carry the root class", () => {
    const el = makeElement({ classes: ["outra-coisa"] });
    expect(checkComponentStructure(page, [el], buttonSpec)).toEqual([]);
  });
});
