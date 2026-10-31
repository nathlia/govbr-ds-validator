import { describe, it, expect, beforeEach } from "vitest";
import { checkTokenCompliance, collectTokenObservations } from "../../src/checkers/tokenCompliance.js";
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
    expect(f.rule.checker).toBe("ds-token-color");
    expect(f.nature).toBe("syntactic");
    expect(f.pathway).toBe("deterministic");
    expect(f.evidence.data?.observedHex).toBe("#1252b3");
    // Nearest token must be the real primary
    expect(f.evidence.data?.nearestHex).toBe("#1351b4");
  });

  it("flags a non-DS font family", () => {
    const el = makeElement({ computed: { fontFamily: "Arial, sans-serif" } as never });
    const findings = checkTokenCompliance(page, [el], registry, ["font"]);
    expect(findings.some((f) => f.rule.checker === "ds-token-font-family")).toBe(true);
  });

  it("tolerates browser rounding of scale font sizes", () => {
    // --font-size-scale-down-01 = 11.662px; browser may report 11.6625px
    const el = makeElement({ computed: { fontSize: "11.6625px" } as never });
    expect(collectTokenObservations(page, [el], registry)).toEqual([]);
  });

  // D-32: a escala tipográfica não sustenta afirmação binária — a única regra da KB sobre tamanho
  // de fonte é informativa, e o veredito passava a depender de onde se corta a tolerância. O desvio
  // continua sendo reportado; deixa de ser cobrado.
  it("reports an off-scale font size as an observation, never as a finding", () => {
    const el = makeElement({ computed: { fontSize: "13px" } as never });

    const findings = checkTokenCompliance(page, [el], registry, ["font"]);
    expect(findings.some((f) => f.rule.checker === "ds-token-font-size")).toBe(false);

    const observations = collectTokenObservations(page, [el], registry);
    expect(observations).toHaveLength(1);
    expect(observations[0].kind).toBe("token-font-size-off-scale");
    expect(observations[0].note).toContain("13px");
    // 3.4.4 (C7): há norma na base (escala Minor Third, required) — dita, não afirmada por máquina.
    expect(observations[0].whyNotAFinding).toContain("HÁ NORMA na base: govbr-3.7.0-foundation-global-21fb08664799");
    expect(observations[0].whyNotAFinding).not.toContain("NÃO HÁ NORMA");
    expect(observations[0].data?.relatedRule).toEqual({ id: "govbr-3.7.0-foundation-global-21fb08664799", force: "required" });
    expect(observations[0].data?.nearestStepPx).toBe(14);
    expect(observations[0].note).toContain("govbr-3.7.0-foundation-global-21fb08664799");
    // Observação não tem severidade: se tivesse, entraria na pontuação pela porta dos fundos.
    expect(observations[0]).not.toHaveProperty("severity");
  });

  it("keeps every emitted token finding grounded in a named rule (D-27)", () => {
    const el = makeElement({ computed: { color: "rgb(1, 2, 3)", fontSize: "13px", padding: "13px" } as never });
    const findings = checkTokenCompliance(page, [el], registry);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.rule.implements?.length ?? 0).toBeGreaterThan(0);
  });

  it("does not attribute a browser default color to the page", () => {
    const el = makeElement({
      authored: {},
      computed: { color: "rgb(128, 128, 128)" } as never,
    });
    expect(checkTokenCompliance(page, [el], registry, ["color"])).toEqual([]);
  });

  it("does not treat margin:auto resolved by flex layout as authored pixels", () => {
    const el = makeElement({
      authored: { margin: ["0 0 0 auto"] },
      computed: { margin: "0px 0px 0px 143.641px" } as never,
    });
    expect(checkTokenCompliance(page, [el], registry, ["spacing"])).toEqual([]);
  });

  it("still flags an off-scale value explicitly authored by the page", () => {
    const el = makeElement({
      authored: { padding: ["13px"] },
      computed: { padding: "13px" } as never,
    });
    const findings = checkTokenCompliance(page, [el], registry, ["spacing"]);
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.data?.authoredDeclarations).toEqual(["13px"]);
  });

  it("ignores an authored off-scale value that lost the cascade (D-51)", () => {
    // flatpickr declara margin -1px no select de mês e outra regra o sobrescreve com 0.
    const el = makeElement({
      authored: { margin: ["-1px 0px 0px", "0px"] },
      computed: { margin: "0px" } as never,
    });
    expect(checkTokenCompliance(page, [el], registry, ["spacing"])).toEqual([]);
  });

  it("still flags an authored off-scale part that survives in a multi-part computed value", () => {
    // O filtro de cascata compara parte a parte: `padding: 0 13px` computado como "0px 13px" continua fora da escala.
    const el = makeElement({
      authored: { padding: ["0 13px"] },
      computed: { padding: "0px 13px" } as never,
    });
    const findings = checkTokenCompliance(page, [el], registry, ["spacing"]);
    expect(findings.map((f) => f.rule.checker)).toEqual(["ds-token-spacing"]);
  });

  it("does not charge the page for a value only the DS stylesheet declares (D-51)", () => {
    const el = makeElement({
      tagName: "textarea",
      authored: {},
      dsShipped: { borderRadius: ["6px"], padding: ["var(--textarea-padding)"] },
      computed: { borderRadius: "6px", padding: "0px 29px 0px 40px" } as never,
    });
    expect(checkTokenCompliance(page, [el], registry, ["radius", "spacing"])).toEqual([]);
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
      expect(findings[0].rule.checker).toBe("ds-token-radius");
      expect(findings[0].evidence.data?.pillEmFactors).toContain(100);
    });
  });

  it("skips transparent colors entirely", () => {
    const el = makeElement({ computed: { backgroundColor: "rgba(0, 0, 0, 0)" } as never });
    expect(checkTokenCompliance(page, [el], registry, ["color"])).toEqual([]);
  });
});

describe("3.4.0 (B5, B-15): cor de borda por lado", () => {
  const hr = (sides: Array<[string, string, string]>, borderColor = "rgb(187, 187, 187) rgb(51, 51, 51) rgb(51, 51, 51) rgb(51, 51, 51)") =>
    makeElement({
      locator: "#sep",
      tagName: "hr",
      classes: [],
      computed: { borderColor } as never,
      borderSides: sides.map(([side, color, width]) => ({ side: side as "top", color, width, style: width === "0px" ? "none" : "solid" })),
    });

  it("lados diferentes: uma leitura por cor de lado pintado; lado sem largura não conta", () => {
    const el = hr([["top", "rgb(187, 187, 187)", "1px"], ["right", "rgb(51, 51, 51)", "0px"], ["bottom", "rgb(51, 51, 51)", "0px"], ["left", "rgb(51, 51, 51)", "0px"]]);
    const findings = checkTokenCompliance(page, [el], registry, ["color"]);
    expect(findings.map((f) => [f.evidence.data?.property, f.evidence.data?.observedHex, f.evidence.data?.sides])).toEqual([["border-top-color", "#bbbbbb", ["top"]]]);
  });

  it("borda uniforme continua saindo como border-color", () => {
    const el = hr([["top", "rgb(187, 187, 187)", "1px"], ["right", "rgb(187, 187, 187)", "1px"], ["bottom", "rgb(187, 187, 187)", "1px"], ["left", "rgb(187, 187, 187)", "1px"]], "rgb(187, 187, 187)");
    expect(checkTokenCompliance(page, [el], registry, ["color"]).map((f) => f.evidence.data?.property)).toEqual(["border-color"]);
  });
});

describe("3.4.1 (revisão): borda sem lado pintado", () => {
  it("cor uniforme herdada sem nenhum lado pintado não é achado", () => {
    const el = makeElement({
      locator: "#s1",
      tagName: "span",
      classes: [],
      computed: { borderColor: "rgb(18, 52, 86)" } as never,
      borderSides: (["top", "right", "bottom", "left"] as const).map((side) => ({ side, color: "rgb(18, 52, 86)", width: "0px", style: "none" })),
    });
    expect(checkTokenCompliance(page, [el], registry, ["color"]).filter((f) => String(f.evidence.data?.property).startsWith("border"))).toEqual([]);
  });
});
