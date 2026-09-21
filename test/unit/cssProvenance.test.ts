import { describe, it, expect } from "vitest";
import { isDsShipped, partitionDeclarations, splitSelectorList, type DsStylesheetIndex, type RawDeclaration } from "../../src/evidence/cssProvenance.js";
import { getDsStylesheet } from "../../src/data/load.js";

const declaration = (over: Partial<RawDeclaration>): RawDeclaration =>
  ({ property: "borderRadius", cssName: "border-radius", value: "6px", selectorText: ".br-textarea textarea", ...over });

describe("splitSelectorList", () => {
  it("splits only on top-level commas", () => {
    expect(splitSelectorList(".a, .b:is(.c, .d) > e, [data-x=\"1,2\"]")).toEqual([".a", ".b:is(.c, .d) > e", "[data-x=\"1,2\"]"]);
  });
});

describe("DS stylesheet provenance (against the real index, D-51)", () => {
  const index = getDsStylesheet();

  it("recognises the three values the token checkers used to charge to the page", () => {
    expect(isDsShipped(index, declaration({}))).toBe(true);
    expect(isDsShipped(index, declaration({ property: "margin", cssName: "margin-top", value: "-2px", selectorText: ".br-select .br-list" }))).toBe(true);
    expect(isDsShipped(index, declaration({ property: "padding", cssName: "padding-right", value: "29px", selectorText: ".br-select .br-input input" }))).toBe(true);
  });

  it("keeps a page's own value on an official selector as the page's", () => {
    expect(isDsShipped(index, declaration({ value: "7px" }))).toBe(false);
  });

  it("keeps a page rule that rides on an official selector as the page's", () => {
    expect(isDsShipped(index, declaration({ selectorText: ".minha-caixa textarea, .br-textarea textarea" }))).toBe(false);
  });

  it("never treats inline style as DS-shipped", () => {
    expect(isDsShipped(index, declaration({ selectorText: null }))).toBe(false);
  });

  it("partitions in stylesheet order", () => {
    const parts = partitionDeclarations([
      declaration({}),
      declaration({ value: "7px", selectorText: ".pagina textarea" }),
      declaration({ value: "9px", selectorText: null }),
    ], index);
    expect(parts.dsShipped.borderRadius).toEqual(["6px"]);
    expect(parts.authored.borderRadius).toEqual(["7px", "9px"]);
  });

  it("accepts a merged rule only when every selector is official", () => {
    const tiny: DsStylesheetIndex = { meta: index.meta, declarations: { ".a": { margin: ["0px"] }, ".b": { margin: ["0px"] } } };
    const merged = { property: "margin", cssName: "margin", value: "0px" } as const;
    expect(isDsShipped(tiny, { ...merged, selectorText: ".a, .b" })).toBe(true);
    expect(isDsShipped(tiny, { ...merged, selectorText: ".a, .c" })).toBe(false);
  });
});
