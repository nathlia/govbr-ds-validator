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

  it("skips transparent colors entirely", () => {
    const el = makeElement({ computed: { backgroundColor: "rgba(0, 0, 0, 0)" } as never });
    expect(checkTokenCompliance(page, [el], registry, ["color"])).toEqual([]);
  });
});
