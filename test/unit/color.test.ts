import { describe, it, expect } from "vitest";
import { normalizeColor, nearestToken, parsePx } from "../../src/checkers/color.js";

describe("normalizeColor", () => {
  it("passes through 6-digit hex, lowercased", () => {
    expect(normalizeColor("#1351B4")).toBe("#1351b4");
  });

  it("expands 3-digit hex", () => {
    expect(normalizeColor("#fff")).toBe("#ffffff");
  });

  it("converts rgb() to hex", () => {
    expect(normalizeColor("rgb(19, 81, 180)")).toBe("#1351b4");
  });

  it("converts rgba() with alpha > 0 to opaque hex", () => {
    expect(normalizeColor("rgba(19, 81, 180, 0.5)")).toBe("#1351b4");
  });

  it("returns null for fully transparent values (nothing rendered)", () => {
    expect(normalizeColor("rgba(0, 0, 0, 0)")).toBeNull();
    expect(normalizeColor("transparent")).toBeNull();
    expect(normalizeColor("#12345600")).toBeNull();
  });

  it("resolves common named colors", () => {
    expect(normalizeColor("white")).toBe("#ffffff");
  });

  it("returns null for unparseable values", () => {
    expect(normalizeColor("linear-gradient(red, blue)")).toBeNull();
  });
});

describe("nearestToken", () => {
  const lookup = { "#1351b4": ["--color-primary-default"], "#ffffff": ["--pure-0"] };

  it("returns the exact token at distance 0", () => {
    const n = nearestToken("#1351b4", lookup);
    expect(n).toMatchObject({ token: "--color-primary-default", distance: 0 });
  });

  it("returns the closest token for a near-miss", () => {
    const n = nearestToken("#1350b0", lookup);
    expect(n?.token).toBe("--color-primary-default");
    expect(n!.distance).toBeGreaterThan(0);
    expect(n!.distance).toBeLessThan(10);
  });
});

describe("parsePx", () => {
  it("parses px lengths", () => {
    expect(parsePx("14px")).toBe(14);
    expect(parsePx("16.8px")).toBe(16.8);
  });
  it("returns null for non-px", () => {
    expect(parsePx("1.2em")).toBeNull();
    expect(parsePx("50%")).toBeNull();
  });
});
