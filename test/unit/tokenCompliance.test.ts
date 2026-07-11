import { describe, it, expect, beforeEach } from "vitest";
import { checkTokenCompliance } from "../../src/checkers/tokenCompliance.js";
import { getTokenRegistry } from "../../src/data/load.js";
import { resetFindingIds } from "../../src/schema/finding.js";
import { makeElement } from "../helpers/fixtures.js";

const page = { url: "http://localhost:3000/test" };
const registry = getTokenRegistry();

beforeEach(resetFindingIds);

describe("checkTokenCompliance (against the real @govbr-ds/core registry)", () => {
  it("accepts a fully DS-compliant element", () => {
    const findings = checkTokenCompliance(page, [makeElement()], registry);
    expect(findings).toEqual([]);
  });

  it("flags a non-token background color with nearest-token hint", () => {
    const el = makeElement({ computed: { backgroundColor: "rgb(18, 82, 179)" } as never });
    const findings = checkTokenCompliance(page, [el], registry, ["color"]);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.rule.id).toBe("ds-token-color");
    expect(f.nature).toBe("syntactic");
    expect(f.pathway).toBe("deterministic");
    expect(f.evidence.data?.observedHex).toBe("#1252b3");
    // Nearest token must be the real primary
    expect(f.evidence.data?.nearestHex).toBe("#1351b4");
  });

  it("flags a non-DS font family", () => {
    const el = makeElement({ computed: { fontFamily: "Arial, sans-serif" } as never });
    const findings = checkTokenCompliance(page, [el], registry, ["font"]);
    expect(findings.some((f) => f.rule.id === "ds-token-font-family")).toBe(true);
  });

  it("tolerates browser rounding of scale font sizes", () => {
    // --font-size-scale-down-01 = 11.662px; browser may report 11.6625px
    const el = makeElement({ computed: { fontSize: "11.6625px" } as never });
    const findings = checkTokenCompliance(page, [el], registry, ["font"]);
    expect(findings.filter((f) => f.rule.id === "ds-token-font-size")).toEqual([]);
  });

  it("flags an off-scale font size", () => {
    const el = makeElement({ computed: { fontSize: "13px" } as never });
    const findings = checkTokenCompliance(page, [el], registry, ["font"]);
    expect(findings.some((f) => f.rule.id === "ds-token-font-size")).toBe(true);
  });

  it("flags an off-scale border radius but accepts the DS scale", () => {
    const bad = makeElement({ computed: { borderRadius: "7px" } as never });
    const good = makeElement({ computed: { borderRadius: "4px" } as never });
    expect(checkTokenCompliance(page, [bad], registry, ["radius"])).toHaveLength(1);
    expect(checkTokenCompliance(page, [good], registry, ["radius"])).toEqual([]);
  });

  // Regression: the pill tokens are em-based (--button-radius: 100em,
  // --surface-rounder-pill: 999em) and reach the computed style as px scaled
  // by the element's font-size. The checker used to flag every conformant
  // pill button (e.g. 1680px) as off-scale.
  describe("pill radius (em tokens computed as px)", () => {
    it("accepts the default pill baseline (1680px = 100em × 16.8px)", () => {
      expect(checkTokenCompliance(page, [makeElement()], registry, ["radius"])).toEqual([]);
    });

    it("accepts the pill at other font sizes (1400px = 100em × 14px)", () => {
      const el = makeElement({ computed: { borderRadius: "1400px", fontSize: "14px" } as never });
      expect(checkTokenCompliance(page, [el], registry, ["radius"])).toEqual([]);
    });

    it("accepts the surface pill token (16783.2px = 999em × 16.8px)", () => {
      const el = makeElement({ computed: { borderRadius: "16783.2px" } as never });
      expect(checkTokenCompliance(page, [el], registry, ["radius"])).toEqual([]);
    });

    it("accepts the circle variant (50%)", () => {
      const el = makeElement({ computed: { borderRadius: "50%" } as never });
      expect(checkTokenCompliance(page, [el], registry, ["radius"])).toEqual([]);
    });

    it("still flags a large radius that matches no px token nor a pill", () => {
      const el = makeElement({ computed: { borderRadius: "30px" } as never });
      const findings = checkTokenCompliance(page, [el], registry, ["radius"]);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule.id).toBe("ds-token-radius");
      expect(findings[0].evidence.data?.pillEmFactors).toContain(100);
    });
  });

  it("skips transparent colors entirely", () => {
    const el = makeElement({ computed: { backgroundColor: "rgba(0, 0, 0, 0)" } as never });
    expect(checkTokenCompliance(page, [el], registry, ["color"])).toEqual([]);
  });
});
