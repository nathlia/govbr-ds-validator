/**
 * build-data.ts — regenerates the oracle's data assets from the installed
 * @govbr-ds/core package (A3/A4: knowledge stays in sync with the DS version,
 * no manual maintenance).
 *
 * Outputs:
 *   data/tokens.json          token registry + hex→token reverse index (A4)
 *   data/component-specs.json canonical component structure specs (A3)
 *   data/ds-stylesheet.json   what the official stylesheet itself declares (D-51) — lets the token
 *                             checkers tell a page's choice from a value the DS ships
 *
 * Static assets (data/emag.json, data/ds-page-rules.json) are maintained by
 * hand / separate scrapers and are NOT touched here.
 *
 * Usage: npm run build:data   (re-run after upgrading @govbr-ds/core)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { INDEXED_CSS_NAMES, splitSelectorList, type DsStylesheetIndex } from "../src/evidence/cssProvenance.js";

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
  /**
   * Element tags observed carrying the root class in the official examples of ANY component.
   * Reading only the component's own examples made the checker refuse markup the DS itself
   * publishes — `<a class="br-button circle">` is how the breadcrumb, footer and menu examples write
   * a link that looks like a button (D-51).
   */
  tags: string[];
  /** Which components' examples show each tag — provenance for `tags`. */
  tagSources: Record<string, string[]>;
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

  /** Every official example of every component: a root class is also used outside its own folder. */
  const readExamples = (name: string): string => {
    const dir = join(componentsDir, name);
    const parts: string[] = [];
    if (existsSync(join(dir, "examples.html"))) parts.push(readFileSync(join(dir, "examples.html"), "utf8"));
    if (existsSync(join(dir, "examples"))) {
      for (const f of readdirSync(join(dir, "examples")).filter((f) => f.endsWith(".html"))) {
        parts.push(readFileSync(join(dir, "examples", f), "utf8"));
      }
    }
    return parts.join("\n");
  };
  const allExamples = new Map(names.map((name) => [name, readExamples(name)]));

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

    const tagSources: Record<string, string[]> = {};
    for (const [component, html] of allExamples) {
      for (const tag of new Set(extractRootElements(html, rootClass).map((r) => r.tag))) {
        (tagSources[tag] ??= []).push(component);
      }
    }
    const tags = Object.keys(tagSources).sort();
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

    specs[name] = { name, rootClass, tags, tagSources, variantClasses, ariaAttributes, tokensUsed, examples };
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

// ── Folha oficial do DS ──────────────────────────────────────────────────────

/**
 * Lê a folha oficial pelo CSSOM do mesmo navegador que mede as páginas, para que seletor e valor
 * saiam serializados exatamente como `inspect.ts` os verá numa página (D-51). Regras dentro de
 * @media/@supports entram sem avaliar a condição: o índice responde "o DS publica isto?", não
 * "isto se aplica agora?".
 */
async function buildDsStylesheet(): Promise<void> {
  const files = ["core.css", "core.min.css"].filter((f) => existsSync(join(DS_DIST, f)));
  const browser = await chromium.launch();
  const declarations: DsStylesheetIndex["declarations"] = {};
  let total = 0;
  try {
    for (const file of files) {
      const page = await browser.newPage();
      await page.setContent("<!doctype html><html><head></head><body></body></html>");
      await page.addStyleTag({ content: readFileSync(join(DS_DIST, file), "utf8") });
      const rows = await page.evaluate((cssNames) => {
        // Pilha em vez de função recursiva: o tsx (esbuild, keepNames) embrulha toda função nomeada
        // em `__name`, que não existe dentro do navegador.
        const out: [string, string, string][] = [];
        const stack: CSSRuleList[] = Array.from(document.styleSheets).map((sheet) => sheet.cssRules);
        while (stack.length > 0) {
          for (const rule of Array.from(stack.pop()!)) {
            if (rule instanceof CSSStyleRule) {
              for (const cssName of cssNames) {
                const value = rule.style.getPropertyValue(cssName).trim();
                if (value) out.push([rule.selectorText, cssName, value + (rule.style.getPropertyPriority(cssName) ? " !important" : "")]);
              }
              continue;
            }
            const nested = (rule as CSSGroupingRule).cssRules;
            if (nested) stack.push(nested);
          }
        }
        return out;
      }, INDEXED_CSS_NAMES);
      await page.close();
      for (const [selectorText, cssName, value] of rows) {
        for (const selector of splitSelectorList(selectorText)) {
          const values = ((declarations[selector] ??= {})[cssName] ??= []);
          if (!values.includes(value)) { values.push(value); total += 1; }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const sorted = Object.fromEntries(Object.keys(declarations).sort().map((k) => [k, declarations[k]]));
  const output: DsStylesheetIndex = {
    meta: {
      source: "@govbr-ds/core",
      version: (JSON.parse(readFileSync(join(ROOT, "node_modules/@govbr-ds/core/package.json"), "utf8")) as { version: string }).version,
      generatedAt: new Date().toISOString(),
      files,
      selectors: Object.keys(sorted).length,
      declarations: total,
    },
    declarations: sorted,
  };
  writeFileSync(join(DATA_DIR, "ds-stylesheet.json"), JSON.stringify(output));
  console.log(`ds-stylesheet.json: ${output.meta.selectors} selectors, ${total} declarations`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

mkdirSync(DATA_DIR, { recursive: true });
buildTokens();
buildComponentSpecs();
await buildDsStylesheet();
console.log("done");
