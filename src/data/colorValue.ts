/**
 * 3.3.0 (NAT-109, N-03): normalização do argumento `hex` do get_design_tokens. O índice reverso do
 * registro é por `#rrggbb` minúsculo; a cor pode chegar como o agente a mediu: `#fff`, `FFF`, `#ffffffff`,
 * `rgb(19, 81, 180)` (o formato de getComputedStyle), `rgba(…, 1)`. Qualquer outra coisa não é cor.
 *
 * Alfa: `#rrggbbaa`/`#rgba`/`rgba()` só resolvem com alfa 1 (opaco) — o registro guarda cores opacas;
 * com alfa < 1 a cor vista depende do fundo, e a resposta diz isso em vez de inventar o valor.
 */
export type ColorParse =
  | { ok: true; hex: string }
  | { ok: false; reason: "not-a-color" | "translucent"; alpha?: number };

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([^)]*)\)$/i;

const byte = (n: number) => n.toString(16).padStart(2, "0");

function channel(raw: string): number | null {
  const t = raw.trim();
  if (/^\d+(\.\d+)?%$/.test(t)) {
    const p = Number(t.slice(0, -1));
    return p <= 100 ? Math.round((p / 100) * 255) : null;
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n <= 255 ? Math.round(n) : null;
}

function alphaOf(raw: string): number | null {
  const t = raw.trim();
  if (/^\d+(\.\d+)?%$/.test(t)) {
    const p = Number(t.slice(0, -1));
    return p <= 100 ? p / 100 : null;
  }
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return n <= 1 ? n : null;
}

export function parseColor(value: string): ColorParse {
  const v = value.trim();
  const hex = HEX.exec(v);
  if (hex) {
    let h = hex[1].toLowerCase();
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    if (h.length === 8) {
      const a = parseInt(h.slice(6), 16) / 255;
      if (a < 1) return { ok: false, reason: "translucent", alpha: Math.round(a * 1000) / 1000 };
      h = h.slice(0, 6);
    }
    return { ok: true, hex: `#${h}` };
  }
  const rgb = RGB.exec(v);
  if (rgb) {
    // rgb(19, 81, 180) · rgb(19 81 180) · rgb(19 81 180 / 1) · rgba(19, 81, 180, 1)
    const body = rgb[1].trim();
    const [colorPart, slashAlpha] = body.split("/");
    const parts = colorPart.includes(",") ? colorPart.split(",") : colorPart.trim().split(/\s+/);
    const alphaRaw = slashAlpha ?? (parts.length === 4 ? parts.pop() : undefined);
    if (parts.length !== 3) return { ok: false, reason: "not-a-color" };
    const rgbValues = parts.map(channel);
    if (rgbValues.some((c) => c === null)) return { ok: false, reason: "not-a-color" };
    if (alphaRaw !== undefined) {
      const a = alphaOf(alphaRaw);
      if (a === null) return { ok: false, reason: "not-a-color" };
      if (a < 1) return { ok: false, reason: "translucent", alpha: a };
    }
    return { ok: true, hex: `#${(rgbValues as number[]).map(byte).join("")}` };
  }
  return { ok: false, reason: "not-a-color" };
}

/** A query do get_design_tokens é um valor de cor (e não um fragmento de nome)? `#…` ou `rgb(`/`rgba(`. */
export function looksLikeColor(value: string): boolean {
  const v = value.trim();
  return /^#[0-9a-z]*$/i.test(v) || /^rgba?\(/i.test(v);
}
