/**
 * parse-tokens.js
 *
 * Parses @govbr-ds/core CSS token files and generates structured JSON
 * for the govbr-ds MCP server.
 *
 * Usage: node scripts/parse-tokens.js
 * Output: mcp-server/data/tokens.json
 *
 * Re-run whenever you upgrade @govbr-ds/core.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Parse a CSS file into a flat token map ────────────────────────────────────
function parseCssTokens(cssPath) {
  const css = readFileSync(cssPath, "utf8");
  const tokens = {};
  const regex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const name = `--${match[1].trim()}`;
    const value = match[2].trim();
    // Skip RGB companion variables (--color-xxx-rgb: r, g, b) — only keep hex/named values
    if (!name.endsWith("-rgb")) {
      tokens[name] = value;
    }
  }
  return tokens;
}

// ── Resolve CSS var() references ──────────────────────────────────────────────
function resolveValue(value, allTokens, depth = 0) {
  if (depth > 5) return value; // prevent infinite loops
  const varMatch = value.match(/^var\(--([\w-]+)\)$/);
  if (!varMatch) return value;
  const ref = `--${varMatch[1]}`;
  const resolved = allTokens[ref];
  return resolved ? resolveValue(resolved, allTokens, depth + 1) : value;
}

// ── Build reverse lookup: hex → [token names] ────────────────────────────────
function buildHexLookup(tokens, allTokens) {
  const lookup = {};
  for (const [name, value] of Object.entries(tokens)) {
    const resolved = resolveValue(value, allTokens);
    if (resolved.startsWith("#")) {
      if (!lookup[resolved.toLowerCase()]) lookup[resolved.toLowerCase()] = [];
      lookup[resolved.toLowerCase()].push(name);
    }
  }
  return lookup;
}

// ── Categorize tokens by prefix ───────────────────────────────────────────────
function categorize(tokens) {
  const categories = {
    color: {},
    spacing: {},
    font: {},
    surface: {},
    other: {},
  };

  for (const [name, value] of Object.entries(tokens)) {
    if (name.includes("color") || name.match(/--blue|--red|--green|--yellow|--gray|--purple|--orange|--brown|--cyan|--magenta|--teal|--indigo|--gold|--mint/)) {
      categories.color[name] = value;
    } else if (name.includes("spacing") || name.includes("scale")) {
      categories.spacing[name] = value;
    } else if (name.includes("font") || name.includes("line-height")) {
      categories.font[name] = value;
    } else if (name.includes("surface") || name.includes("shadow") || name.includes("border") || name.includes("radius") || name.includes("rounder")) {
      categories.surface[name] = value;
    } else {
      categories.other[name] = value;
    }
  }

  return categories;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const coreTokensPath = join(ROOT, "app/node_modules/@govbr-ds/core/dist/core-tokens.css");
const corePath       = join(ROOT, "app/node_modules/@govbr-ds/core/dist/core.css");
const outputPath     = join(ROOT, "mcp-server/data/tokens.json");

console.log("Parsing core-tokens.css...");
const rawTokens = parseCssTokens(coreTokensPath);

console.log("Parsing core.css for semantic tokens...");
let semanticTokens = {};
try {
  semanticTokens = parseCssTokens(corePath);
} catch {
  console.warn("core.css not found — skipping semantic tokens");
}

const allTokens = { ...rawTokens, ...semanticTokens };
console.log(`Found ${Object.keys(allTokens).length} tokens`);

const hexLookup = buildHexLookup(allTokens, allTokens);
const categorized = categorize(allTokens);

// Key semantic tokens for DS compliance validation
const semanticHighlights = {
  "primary-color":    { token: "--color-primary-default",    value: resolveValue(semanticTokens["--color-primary-default"] ?? "var(--blue-warm-vivid-70)", allTokens) },
  "primary-darken":   { token: "--color-primary-darken-01",  value: resolveValue(semanticTokens["--color-primary-darken-01"] ?? "var(--blue-warm-vivid-80)", allTokens) },
  "primary-lighten":  { token: "--color-primary-lighten-01", value: resolveValue(semanticTokens["--color-primary-lighten-01"] ?? "var(--blue-warm-vivid-40)", allTokens) },
  "success":          { token: "--color-success",            value: resolveValue(semanticTokens["--color-success"] ?? "var(--green-cool-vivid-50)", allTokens) },
  "danger":           { token: "--color-danger",             value: resolveValue(semanticTokens["--color-danger"] ?? "var(--red-vivid-50)", allTokens) },
  "warning":          { token: "--color-warning",            value: resolveValue(semanticTokens["--color-warning"] ?? "var(--yellow-vivid-20)", allTokens) },
  "font-base":        { token: "--font-size-scale-base",     value: resolveValue(semanticTokens["--font-size-scale-base"] ?? rawTokens["--font-size-scale-base"] ?? "14px", allTokens) },
  "font-family":      { token: "--font-family-base",         value: resolveValue(semanticTokens["--font-family-base"] ?? "Rawline, Raleway, sans-serif", allTokens) },
  "spacing-base":     { token: "--spacing-scale-base",       value: resolveValue(semanticTokens["--spacing-scale-base"] ?? rawTokens["--spacing-scale-base"] ?? "8px", allTokens) },
  "focus-color":      { token: "--focus-color",              value: resolveValue(semanticTokens["--focus-color"] ?? rawTokens["--focus-color"] ?? "#c2850c", allTokens) },
  "rounder-sm":       { token: "--surface-rounder-sm",       value: resolveValue(semanticTokens["--surface-rounder-sm"] ?? rawTokens["--surface-rounder-sm"] ?? "4px", allTokens) },
  "rounder-md":       { token: "--surface-rounder-md",       value: resolveValue(semanticTokens["--surface-rounder-md"] ?? rawTokens["--surface-rounder-md"] ?? "8px", allTokens) },
  "rounder-lg":       { token: "--surface-rounder-lg",       value: resolveValue(semanticTokens["--surface-rounder-lg"] ?? rawTokens["--surface-rounder-lg"] ?? "16px", allTokens) },
};

const output = {
  meta: {
    source: "@govbr-ds/core",
    version: JSON.parse(readFileSync(join(ROOT, "app/node_modules/@govbr-ds/core/package.json"), "utf8")).version,
    generatedAt: new Date().toISOString(),
    totalTokens: Object.keys(allTokens).length,
  },
  semantic: semanticHighlights,
  hexLookup,
  categorized,
  all: allTokens,
};

writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`✓ Written to ${outputPath}`);
console.log(`  ${Object.keys(allTokens).length} tokens, ${Object.keys(hexLookup).length} hex values indexed`);
