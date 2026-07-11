/**
 * Color/value normalization for the deterministic token checker (B1).
 * Computed styles come back as rgb()/rgba() strings; the token registry's
 * reverse index is keyed by lowercase #rrggbb hex.
 */

const NAMED: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  gray: "#808080",
  grey: "#808080",
};

/**
 * Normalize a CSS color value to lowercase #rrggbb hex.
 * Returns null for fully transparent or unparseable values (nothing to check).
 */
export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v || v === "transparent" || v === "none" || v === "currentcolor" || v === "inherit") return null;

  if (v.startsWith("#")) {
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
    if (v.length === 9) {
      // #rrggbbaa — fully transparent means nothing rendered
      if (v.slice(7) === "00") return null;
      return v.slice(0, 7);
    }
    return v.length === 7 ? v : null;
  }

  const rgbMatch = v.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/);
  if (rgbMatch) {
    const alpha = rgbMatch[4];
    if (alpha !== undefined) {
      const a = alpha.endsWith("%") ? parseFloat(alpha) / 100 : parseFloat(alpha);
      if (a === 0) return null;
    }
    const toHex = (n: string) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, "0");
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }

  return NAMED[v] ?? null;
}

export interface NearestToken {
  token: string;
  hex: string;
  distance: number;
}

function rgbOf(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/**
 * Nearest DS token by Euclidean RGB distance — used as the remediation hint
 * in the finding's feedback signal ("did you mean --blue-warm-vivid-70?").
 */
export function nearestToken(hex: string, hexLookup: Record<string, string[]>): NearestToken | null {
  const [r, g, b] = rgbOf(hex);
  let best: NearestToken | null = null;
  for (const [candidate, tokenNames] of Object.entries(hexLookup)) {
    const [cr, cg, cb] = rgbOf(candidate);
    const distance = Math.sqrt((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2);
    if (!best || distance < best.distance) {
      best = { token: tokenNames[0], hex: candidate, distance: Math.round(distance * 100) / 100 };
    }
  }
  return best;
}

/** Parse a CSS px length ("14px") to a number, or null. */
export function parsePx(value: string): number | null {
  const m = value.trim().match(/^(-?[\d.]+)px$/);
  return m ? parseFloat(m[1]) : null;
}
