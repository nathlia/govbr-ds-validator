/**
 * 3.6.1 (D-155, NAT-104): emendas declaradas a uma versão publicada da base literal.
 *
 * Uma versão publicada não é regerada à mão: o que se acrescenta a ela é uma ENTRADA declarada
 * (`scripts/kb-amendments/<versão>.json`) que `build-kb-literal.mjs` aplica depois do rules.jsonl da normalização,
 * e que este módulo confere — texto literal do arquivo arquivado em data/ que a unidade aponta (archivedFile +
 * archivedPath + charRange), id derivado como os demais (sha256(locator + originalText), 12 hex), sem colisão.
 * Aplicar a emenda ao rules.jsonl sem ela reproduz o rules.jsonl servido byte a byte (test/unit/kbAmendments.test.ts).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const AMENDMENTS_DIR = join(ROOT, "scripts", "kb-amendments");

/** A emenda declarada de uma versão (ou null). */
export function readAmendment(version) {
  const file = join(AMENDMENTS_DIR, `${version}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

/** Confere cada unidade da emenda contra o texto arquivado; falha alto. */
export function checkAmendment(amendment, root = ROOT) {
  for (const unit of amendment.units) {
    const src = unit.source;
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
export function applyAmendment(rulesJsonl, amendment, root = ROOT) {
  if (!amendment) return rulesJsonl;
  checkAmendment(amendment, root);
  const ids = new Set(rulesJsonl.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l).id));
  for (const unit of amendment.units) if (ids.has(unit.id)) throw new Error(`${unit.id}: já está no rules.jsonl`);
  return rulesJsonl + amendment.units.map((u) => JSON.stringify(u)).join("\n") + "\n";
}
