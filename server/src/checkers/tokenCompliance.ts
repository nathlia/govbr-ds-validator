/**
 * B1 — deterministic token compliance checker ("syntactic half" of the
 * hybrid architecture). Exact-value comparison of computed styles against the
 * token registry's reverse index; no LLM involvement (oyelayo2026: LLM F1
 * 0.48 on layout/value matching — deterministic code wins there).
 *
 * Pure function over ElementEvidence fixtures → unit-testable without a
 * browser.
 */
import type { Finding } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import type { TokenRegistry } from "../data/load.js";
import type { ElementEvidence } from "../evidence/types.js";
import { normalizeColor, nearestToken, parsePx } from "./color.js";

export type TokenCheck = "color" | "font" | "radius" | "spacing";

export const ALL_TOKEN_CHECKS: TokenCheck[] = ["color", "font", "radius", "spacing"];

const COLOR_PROPS: { prop: keyof ElementEvidence["computed"]; label: string }[] = [
  { prop: "backgroundColor", label: "background-color" },
  { prop: "color", label: "color" },
  { prop: "borderColor", label: "border-color" },
];

/** DS font families (Rawline for text, Raleway as fallback/headings). */
const DS_FONT = /rawline|raleway/i;

function tokenListLabel(tokens: string[]): string {
  return tokens.slice(0, 3).join(", ") + (tokens.length > 3 ? ", …" : "");
}

export function checkTokenCompliance(
  page: { url: string },
  elements: ElementEvidence[],
  registry: TokenRegistry,
  checks: TokenCheck[] = ALL_TOKEN_CHECKS
): Finding[] {
  const findings: Finding[] = [];
  const { hexLookup, all } = registry;

  // Allowed discrete values derived from the registry itself.
  // Compared numerically with tolerance — browsers round computed px values.
  const fontSizePxScale = Object.entries(all)
    .filter(([name]) => name.startsWith("--font-size-scale"))
    .map(([, v]) => parsePx(v))
    .filter((v): v is number => v !== null);
  const inFontScale = (value: string): boolean => {
    const px = parsePx(value);
    if (px === null) return true; // non-px (%, em) — not comparable here
    return fontSizePxScale.some((s) => Math.abs(s - px) < 0.5);
  };
  const radii = new Set(
    Object.entries(all)
      .filter(([name]) => name.includes("rounder"))
      .map(([, v]) => v)
  );
  radii.add("0px");
  radii.add("50%"); // circle variant
  const spacingBase = parsePx(registry.semantic["spacing-base"]?.value ?? "8px") ?? 8;

  for (const el of elements) {
    const base = {
      element: {
        locator: el.locator,
        snippet: el.outerHTML.slice(0, 300),
        page: page.url,
      },
    };

    if (checks.includes("color")) {
      for (const { prop, label } of COLOR_PROPS) {
        const raw = el.computed[prop];
        if (!raw) continue;
        const hex = normalizeColor(raw);
        if (!hex) continue; // transparent / unparseable — nothing to compare
        if (hexLookup[hex]) continue; // exact token value — compliant
        const nearest = nearestToken(hex, hexLookup);
        findings.push({
          id: nextFindingId(),
          rule: {
            id: "ds-token-color",
            source: "govbr-ds-token",
            description:
              "Cores devem usar valores do registro de tokens do gov.br DS (Padrão Digital de Governo); valores arbitrários quebram a identidade visual e o theming.",
          },
          ...base,
          evidence: {
            observed: `${label}: ${raw} (${hex}) não corresponde a nenhum token do DS`,
            expected: nearest
              ? `Valor de token do DS; mais próximo: ${nearest.token} (${nearest.hex}, distância RGB ${nearest.distance})`
              : "Valor presente no registro de tokens do DS",
            data: {
              property: label,
              observedHex: hex,
              nearestToken: nearest?.token ?? null,
              nearestHex: nearest?.hex ?? null,
              rgbDistance: nearest?.distance ?? null,
            },
          },
          severity: "moderate",
          nature: "syntactic",
          mode: "display",
          pathway: "deterministic",
        });
      }
    }

    if (checks.includes("font")) {
      const family = el.computed.fontFamily;
      if (family && !DS_FONT.test(family)) {
        findings.push({
          id: nextFindingId(),
          rule: {
            id: "ds-token-font-family",
            source: "govbr-ds-token",
            description: "A tipografia do gov.br DS usa Rawline (com Raleway como alternativa).",
          },
          ...base,
          evidence: {
            observed: `font-family: ${family}`,
            expected: `Família contendo Rawline/Raleway (token ${registry.semantic["font-family"]?.token}: ${registry.semantic["font-family"]?.value})`,
            data: { property: "font-family", observed: family },
          },
          severity: "moderate",
          nature: "syntactic",
          mode: "display",
          pathway: "deterministic",
        });
      }

      const size = el.computed.fontSize;
      if (size && !inFontScale(size)) {
        findings.push({
          id: nextFindingId(),
          rule: {
            id: "ds-token-font-size",
            source: "govbr-ds-token",
            description: "Tamanhos de fonte devem seguir a escala tipográfica do DS (--font-size-scale-*).",
          },
          ...base,
          evidence: {
            observed: `font-size: ${size} fora da escala do DS`,
            expected: `Um dos valores da escala: ${tokenListLabel(fontSizePxScale.map((v) => `${v}px`))}`,
            data: { property: "font-size", observed: size, allowedScale: fontSizePxScale.map((v) => `${v}px`) },
          },
          severity: "minor",
          nature: "syntactic",
          mode: "display",
          pathway: "deterministic",
        });
      }
    }

    if (checks.includes("radius")) {
      const radius = el.computed.borderRadius;
      // Only single-value radii are comparable against the discrete scale
      if (radius && !radius.includes(" ") && !radii.has(radius)) {
        const px = parsePx(radius);
        if (px !== null && px > 0) {
          findings.push({
            id: nextFindingId(),
            rule: {
              id: "ds-token-radius",
              source: "govbr-ds-token",
              description: "Cantos arredondados devem usar os tokens de superfície (--surface-rounder-sm/md/lg).",
            },
            ...base,
            evidence: {
              observed: `border-radius: ${radius} fora da escala do DS`,
              expected: `Um de: ${[...radii].join(", ")}`,
              data: { property: "border-radius", observed: radius, allowedScale: [...radii] },
            },
            severity: "minor",
            nature: "syntactic",
            mode: "display",
            pathway: "deterministic",
          });
        }
      }
    }

    if (checks.includes("spacing")) {
      for (const prop of ["padding", "margin"] as const) {
        const value = el.computed[prop];
        if (!value) continue;
        const parts = value.split(/\s+/);
        const offScale = parts.filter((p) => {
          const px = parsePx(p);
          return px !== null && px !== 0 && Math.abs(px % (spacingBase / 2)) > 0.01;
        });
        if (offScale.length > 0) {
          findings.push({
            id: nextFindingId(),
            rule: {
              id: "ds-token-spacing",
              source: "govbr-ds-token",
              description: `Espaçamentos devem seguir a escala do DS (múltiplos de ${spacingBase / 2}px, base ${spacingBase}px).`,
            },
            ...base,
            evidence: {
              observed: `${prop}: ${value} (fora da escala: ${offScale.join(", ")})`,
              expected: `Múltiplos de ${spacingBase / 2}px`,
              data: { property: prop, observed: value, offScale, spacingBase },
            },
            severity: "minor",
            nature: "syntactic",
            mode: "display",
            pathway: "deterministic",
          });
        }
      }
    }
  }

  return findings;
}
