/**
 * build-data.ts — regenerates the oracle's data assets from the installed
 * @govbr-ds/core package (A3/A4: knowledge stays in sync with the DS version,
 * no manual maintenance).
 *
 * Outputs:
 *   data/tokens.json          token registry + hex→token reverse index (A4)
 *   data/component-specs.json canonical component structure specs (A3)
 *
 * Static assets (data/emag.json, data/ds-page-rules.json) are maintained by
 * hand / separate scrapers and are NOT touched here.
 *
 * Usage: npm run build:data   (re-run after upgrading @govbr-ds/core)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DS_DIST = join(ROOT, "node_modules/@govbr-ds/core/dist");
const DATA_DIR = join(ROOT, "data");

// ── Tokens ───────────────────────────────────────────────────────────────────

function parseCssTokens(cssPath: string): Record<string, string> {
  const css = readFileSync(cssPath, "utf8");
  const tokens: Record<string, string> = {};
  const regex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    const name = `--${match[1].trim()}`;
    const value = match[2].trim();
    // Skip RGB companion variables (--color-xxx-rgb: r, g, b)
    if (!name.endsWith("-rgb")) tokens[name] = value;
  }
  return tokens;
}

function resolveValue(value: string, all: Record<string, string>, depth = 0): string {
  if (depth > 5) return value;
  const varMatch = value.match(/^var\(--([\w-]+)\)$/);
  if (!varMatch) return value;
  const resolved = all[`--${varMatch[1]}`];
  return resolved ? resolveValue(resolved, all, depth + 1) : value;
}

/** Canonicalize to 6-digit lowercase hex so lookups match normalized computed styles. */
function canonicalHex(value: string): string | null {
  const v = value.toLowerCase();
  if (!v.startsWith("#")) return null;
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  if (v.length === 7) return v;
  return null;
}

function buildHexLookup(all: Record<string, string>): Record<string, string[]> {
  const lookup: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(all)) {
    const resolved = canonicalHex(resolveValue(value, all));
    if (resolved) {
      (lookup[resolved] ??= []).push(name);
    }
  }
  return lookup;
}

function categorize(all: Record<string, string>): Record<string, Record<string, string>> {
  const categories: Record<string, Record<string, string>> = {
    color: {},
    spacing: {},
    font: {},
    surface: {},
    other: {},
  };
  for (const [name, value] of Object.entries(all)) {
    if (
      name.includes("color") ||
      /--blue|--red|--green|--yellow|--gray|--purple|--orange|--brown|--cyan|--magenta|--teal|--indigo|--gold|--mint/.test(name)
    ) {
      categories.color[name] = value;
    } else if (name.includes("spacing") || name.includes("scale")) {
      categories.spacing[name] = value;
    } else if (name.includes("font") || name.includes("line-height")) {
      categories.font[name] = value;
    } else if (/surface|shadow|border|radius|rounder/.test(name)) {
      categories.surface[name] = value;
    } else {
      categories.other[name] = value;
    }
  }
  return categories;
}

function buildTokens(): void {
  const rawTokens = parseCssTokens(join(DS_DIST, "core-tokens.css"));
  let semanticTokens: Record<string, string> = {};
  try {
    semanticTokens = parseCssTokens(join(DS_DIST, "core.css"));
  } catch {
    console.warn("core.css not found — skipping semantic tokens");
  }
  const all = { ...rawTokens, ...semanticTokens };

  const pick = (label: string, tokenName: string, fallback: string) => ({
    token: tokenName,
    value: resolveValue(all[tokenName] ?? fallback, all),
  });

  const semantic = {
    "primary-color": pick("primary", "--color-primary-default", "var(--blue-warm-vivid-70)"),
    "primary-darken": pick("darken", "--color-primary-darken-01", "var(--blue-warm-vivid-80)"),
    "primary-lighten": pick("lighten", "--color-primary-lighten-01", "var(--blue-warm-vivid-40)"),
    success: pick("success", "--color-success", "var(--green-cool-vivid-50)"),
    danger: pick("danger", "--color-danger", "var(--red-vivid-50)"),
    warning: pick("warning", "--color-warning", "var(--yellow-vivid-20)"),
    "font-base": pick("font-base", "--font-size-scale-base", "14px"),
    "font-family": pick("font-family", "--font-family-base", "Rawline, Raleway, sans-serif"),
    "spacing-base": pick("spacing-base", "--spacing-scale-base", "8px"),
    "focus-color": pick("focus", "--focus-color", "#c2850c"),
    "rounder-sm": pick("rounder-sm", "--surface-rounder-sm", "4px"),
    "rounder-md": pick("rounder-md", "--surface-rounder-md", "8px"),
    "rounder-lg": pick("rounder-lg", "--surface-rounder-lg", "16px"),
  };

  const output = {
    meta: {
      source: "@govbr-ds/core",
      version: (JSON.parse(readFileSync(join(ROOT, "node_modules/@govbr-ds/core/package.json"), "utf8")) as { version: string }).version,
      generatedAt: new Date().toISOString(),
      totalTokens: Object.keys(all).length,
    },
    semantic,
    hexLookup: buildHexLookup(all),
    categorized: categorize(all),
    all,
  };

  writeFileSync(join(DATA_DIR, "tokens.json"), JSON.stringify(output, null, 2));
  console.log(`tokens.json: ${Object.keys(all).length} tokens, ${Object.keys(output.hexLookup).length} hex values indexed`);
}

// ── Component specs ──────────────────────────────────────────────────────────

interface ElementUsage {
  tag: string;
  classes: string[];
  attributes: Record<string, string>;
}

interface ComponentSpec {
  name: string;
  rootClass: string;
  /** Element tags observed carrying the root class in official examples. */
  tags: string[];
  /** Classes co-occurring with the root class (variants/emphases/densities). */
  variantClasses: string[];
  /** aria-* attributes observed anywhere in the official examples. */
  ariaAttributes: string[];
  /** Design tokens consumed by the component's own CSS (var(--x) references). */
  tokensUsed: string[];
  /** Named canonical example fragments (from dist/components/<name>/examples/). */
  examples: { name: string; html: string }[];
}

/** Extract elements whose class list contains `rootClass` from an HTML string. */
function extractRootElements(html: string, rootClass: string): ElementUsage[] {
  const usages: ElementUsage[] = [];
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(html)) !== null) {
    const [, tag, rawAttrs] = m;
    const attrs: Record<string, string> = {};
    const attrRegex = /([\w-]+)(?:="([^"]*)")?/g;
    let a: RegExpExecArray | null;
    while ((a = attrRegex.exec(rawAttrs)) !== null) {
      attrs[a[1]] = a[2] ?? "";
    }
    const classes = (attrs["class"] ?? "").split(/\s+/).filter(Boolean);
    if (classes.includes(rootClass)) {
      const { class: _cls, ...rest } = attrs;
      usages.push({ tag: tag.toLowerCase(), classes, attributes: rest });
    }
  }
  return usages;
}

function buildComponentSpecs(): void {
  const componentsDir = join(DS_DIST, "components");
  const names = readdirSync(componentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const specs: Record<string, ComponentSpec> = {};

  for (const name of names) {
    const dir = join(componentsDir, name);
    const rootClass = `br-${name}`;

    let examplesHtml = "";
    const examplesPath = join(dir, "examples.html");
    if (existsSync(examplesPath)) examplesHtml = readFileSync(examplesPath, "utf8");

    const fragmentDir = join(dir, "examples");
    const examples: { name: string; html: string }[] = [];
    if (existsSync(fragmentDir)) {
      for (const f of readdirSync(fragmentDir).filter((f) => f.endsWith(".html"))) {
        const html = readFileSync(join(fragmentDir, f), "utf8").trim();
        examples.push({ name: f.replace(/\.html$/, ""), html: html.slice(0, 4000) });
      }
    }

    const corpus = examplesHtml + "\n" + examples.map((e) => e.html).join("\n");
    const roots = extractRootElements(corpus, rootClass);

    const cssPath = join(dir, `${name}.css`);
    const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";

    const tags = [...new Set(roots.map((r) => r.tag))].sort();
    // Drop spacing/background utility classes — they are demo scaffolding, not component variants
    const utilityClass = /^(?:[mp][trblxy]?-(?:n?\d+|auto)|bg-[\w-]+|text-[\w-]+|d-[\w-]+|col(?:-[\w-]+)?|row|h\d)$/;
    // Variants also live in the component's own stylesheet: status/emphasis
    // classes like .br-button.danger never appear in the example HTML.
    const cssVariantSelector = new RegExp(`\\.${rootClass}((?:\\.[a-zA-Z][\\w-]*)+)`, "g");
    const cssVariants = [...css.matchAll(cssVariantSelector)].flatMap((m) => m[1].split(".").filter(Boolean));
    const variantClasses = [
      ...new Set([
        ...roots.flatMap((r) => r.classes).filter((c) => c !== rootClass && !utilityClass.test(c)),
        ...cssVariants,
      ]),
    ].sort();
    const ariaAttributes = [...new Set([...corpus.matchAll(/\b(aria-[\w-]+)=/g)].map((m) => m[1]))].sort();

    const tokensUsed = [...new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))].sort();

    specs[name] = { name, rootClass, tags, variantClasses, ariaAttributes, tokensUsed, examples };
  }

  const output = {
    meta: {
      source: "@govbr-ds/core",
      version: (JSON.parse(readFileSync(join(ROOT, "node_modules/@govbr-ds/core/package.json"), "utf8")) as { version: string }).version,
      generatedAt: new Date().toISOString(),
      totalComponents: names.length,
    },
    components: specs,
  };

  writeFileSync(join(DATA_DIR, "component-specs.json"), JSON.stringify(output, null, 2));
  console.log(`component-specs.json: ${names.length} components`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

mkdirSync(DATA_DIR, { recursive: true });
buildTokens();
buildComponentSpecs();
console.log("done");
