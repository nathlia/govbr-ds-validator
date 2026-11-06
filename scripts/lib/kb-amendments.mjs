/**
 * 3.6.1 (D-155, NAT-104): emendas declaradas a uma versão publicada da base literal.
 *
 * Uma versão publicada não é regerada à mão: o que se acrescenta a ela é uma ENTRADA declarada
 * (`scripts/kb-amendments/<versão>.json`) que `build-kb-literal.mjs` aplica depois do rules.jsonl da normalização,
 * e que este módulo confere — texto literal do arquivo arquivado em data/ que a unidade aponta (archivedFile +
 * archivedPath + charRange), id derivado como os demais (sha256(locator + originalText), 12 hex), sem colisão.
 * Aplicar a emenda ao rules.jsonl sem ela reproduz o rules.jsonl servido byte a byte (test/unit/kbAmendments.test.ts).
 *
 * 3.7.3 (D-167): várias emendas por versão, em ordem — `<versão>.json` é a emenda-1 (inalterada) e
 * `<versão>+emenda-<n>.json` as seguintes. Uma emenda pode ser GERADA: em vez de `units`, ela declara o gerador
 * (`generator.script`, a extração mecânica de scripts/lib/kb-spec-extract.mjs), as regras de extração e o sha256 das
 * unidades que ele produz; as unidades são reproduzidas a cada aplicação e conferidas contra esse sha256 e contra o
 * texto literal do corpus (captureType `literal-corpus-specification`).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTURE_TYPE, SPEC_FORCE, extractSpecUnits, unitsSha256 } from "./kb-spec-extract.mjs";
import { limpar } from "./kb-segment.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const AMENDMENTS_DIR = join(ROOT, "scripts", "kb-amendments");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** A emenda-1 declarada de uma versão (ou null) — forma da 3.6.1. */
export function readAmendment(version) {
  const file = join(AMENDMENTS_DIR, `${version}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

/** Todas as emendas declaradas de uma versão, em ordem (emenda-1 = `<versão>.json`, depois `+emenda-<n>`). */
export function readAmendments(version) {
  const out = [];
  const first = readAmendment(version);
  if (first) out.push(first);
  if (!existsSync(AMENDMENTS_DIR)) return out;
  const prefix = `${version}+emenda-`;
  const more = readdirSync(AMENDMENTS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((f) => ({ f, n: Number(f.slice(prefix.length, -5)) }))
    .filter((x) => Number.isInteger(x.n))
    .sort((a, b) => a.n - b.n);
  for (const { f, n } of more) {
    const amendment = JSON.parse(readFileSync(join(AMENDMENTS_DIR, f), "utf8"));
    if (amendment.label !== `emenda-${n}`) throw new Error(`${f}: label '${amendment.label}' ≠ emenda-${n}`);
    out.push(amendment);
  }
  for (let i = 0; i < out.length; i++) if ((out[i].label ?? `emenda-${i + 1}`) !== `emenda-${i + 1}`) throw new Error(`emendas fora de ordem em ${version}`);
  return out;
}

/** Pastas de onde uma emenda gerada lê o corpus e a cobertura (padrão: a versão publicada em data/). */
export function versionPaths(version, root = ROOT) {
  const dir = join(root, "data/knowledge/versions", version);
  return { corpusDir: join(dir, "corpus"), coveragePath: join(dir, "reports/normalizacao/cobertura.json") };
}

/** Unidades de uma emenda: as declaradas, ou as reproduzidas pelo gerador sobre `rulesJsonl` (a base anterior a ela). */
export function amendmentUnits(amendment, rulesJsonl, paths) {
  if (Array.isArray(amendment.units)) return amendment.units;
  if (amendment.generator?.script !== "scripts/kb-spec-units.mjs") throw new Error(`${amendment.label}: emenda sem units nem gerador conhecido`);
  const rules = rulesJsonl.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const coverage = JSON.parse(readFileSync(paths.coveragePath, "utf8"));
  const { units } = extractSpecUnits({ corpusDir: paths.corpusDir, rules, coverage });
  const got = unitsSha256(units);
  if (got !== amendment.unitsSha256) throw new Error(`${amendment.label}: o gerador produziu unidades com sha256 ${got}, a emenda declara ${amendment.unitsSha256}`);
  return units;
}

/** Confere cada unidade da emenda contra o texto arquivado; falha alto. */
export function checkAmendment(amendment, root = ROOT, units = amendment.units, paths) {
  for (const unit of units) {
    const src = unit.source;
    if (src.captureType === CAPTURE_TYPE) {
      // 3.7.3: unidade de especificação — literal do corpus da versão, força própria, id do esquema da normalização.
      const file = join(paths?.corpusDir ?? join(root, "data/knowledge/versions", amendment.version, "corpus"), src.corpusFile);
      const buf = readFileSync(file);
      const text = buf.toString("utf8");
      const [a, b] = src.charRange;
      if (text.slice(a, b) !== unit.originalText) throw new Error(`${unit.id}: originalText não é literal de ${src.corpusFile} em ${a}..${b}`);
      if (sha256(buf) !== src.contentHash) throw new Error(`${unit.id}: contentHash não confere`);
      if (unit.force !== SPEC_FORCE) throw new Error(`${unit.id}: força '${unit.force}' numa unidade de especificação`);
      if (unit.normalizedRule !== limpar(unit.originalText)) throw new Error(`${unit.id}: normalizedRule não é o trecho sem marcação`);
      const h = createHash("sha256").update(src.locator + unit.originalText, "utf8").digest("hex").slice(0, 12);
      if (!new RegExp(`^govbr-3\\.7\\.0-${unit.category}-${unit.component}-${h}(?:-\\d+)?$`).test(unit.id)) throw new Error(`${unit.id}: id não é o derivado (${h})`);
      continue;
    }
    if (src.captureType !== "literal-archived-page-rules") throw new Error(`${unit.id}: captureType inesperado`);
    const doc = JSON.parse(readFileSync(join(root, src.archivedFile), "utf8"));
    const text = src.archivedPath.split(".").reduce((o, k) => o[k], doc);
    const [a, b] = src.charRange;
    if (text.slice(a, b) !== unit.originalText) throw new Error(`${unit.id}: originalText não é literal de ${src.archivedFile} (${src.archivedPath}) em ${a}..${b}`);
    if (unit.normalizedRule !== unit.originalText) throw new Error(`${unit.id}: normalizedRule difere do texto literal`);
    if (createHash("sha256").update(text).digest("hex") !== src.contentHash) throw new Error(`${unit.id}: contentHash não confere`);
    const h = createHash("sha256").update(src.locator + unit.originalText, "utf8").digest("hex").slice(0, 12);
    if (unit.id !== `govbr-3.7.0-${unit.category}-${unit.component ?? "global"}-${h}`) throw new Error(`${unit.id}: id não é o derivado (${h})`);
  }
}

/** rules.jsonl (texto) + emenda → rules.jsonl emendado (uma linha JSON.stringify por unidade, no fim). */
export function applyAmendment(rulesJsonl, amendment, root = ROOT, paths) {
  if (!amendment) return rulesJsonl;
  const units = amendmentUnits(amendment, rulesJsonl, paths ?? versionPaths(amendment.version, root));
  checkAmendment(amendment, root, units, paths);
  const ids = new Set(rulesJsonl.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l).id));
  for (const unit of units) if (ids.has(unit.id)) throw new Error(`${unit.id}: já está no rules.jsonl`);
  return rulesJsonl + units.map((u) => JSON.stringify(u)).join("\n") + "\n";
}

/** As emendas, em ordem: cada uma sobre o resultado da anterior. */
export function applyAmendments(rulesJsonl, amendments, root = ROOT, paths) {
  return amendments.reduce((text, amendment) => applyAmendment(text, amendment, root, paths), rulesJsonl);
}

/** Ids acrescentados por uma emenda, dado o rules.jsonl anterior a ela. */
export function amendmentIds(amendment, rulesJsonl, paths) {
  return amendmentUnits(amendment, rulesJsonl, paths ?? versionPaths(amendment.version)).map((u) => u.id);
}
