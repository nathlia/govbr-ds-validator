/** Derived context only: never changes membership, ranking, force or applicability. */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getKnowledgeBase, type KnowledgeBase, type KnowledgeRule } from "./knowledge.js";
import { guardKnowledge } from "./lock.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../data/knowledge/versions");
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const plain = (text: string) => text.replace(/[*_`]/g, "").trim();
export const CONTEXT_COMPLETENESS = "conditions/exceptions são metadados extraídos, não exaustivos; [] não significa ausência de condição. Leia o parágrafo literal e as cláusulas adjacentes; null indica contexto indisponível ou ambíguo.";

/** Resolve repeated headings/text only with a unique matching ancestor path. Fail closed. */
export function locateLiteralParagraph(text: string, rule: KnowledgeRule) {
  const headings = [...text.matchAll(/^(#{1,6})[ \t]+(.+)$/gm)];
  const stack: string[] = [];
  const expected = typeof rule.source.sectionPath === "string" ? rule.source.sectionPath.split(" > ").map(plain).join(" > ") : "";
  const candidates: Array<{ start: number; end: number; position: number; path: string }> = [];
  for (const [index, heading] of headings.entries()) {
    stack.length = heading[1].length - 1;
    stack[heading[1].length - 1] = plain(heading[2]);
    if (plain(heading[2]) !== plain(String(rule.source.section ?? ""))) continue;
    const end = headings.slice(index + 1).find((h) => h[1].length <= heading[1].length)?.index ?? text.length;
    const position = text.indexOf(rule.originalText, heading.index);
    if (position < heading.index || position + rule.originalText.length > end) continue;
    // More than one occurrence within this heading remains ambiguous too.
    const again = text.indexOf(rule.originalText, position + 1);
    if (again >= 0 && again < end) continue;
    candidates.push({ start: heading.index, end, position, path: stack.filter(Boolean).join(" > ") });
  }
  const exact = candidates.filter((c) => c.path === expected);
  const choices = expected ? exact : candidates;
  if (choices.length !== 1) return null;
  const chosen = choices[0];
  const before = text.lastIndexOf("\n\n", chosen.position);
  const after = text.indexOf("\n\n", chosen.position + rule.originalText.length);
  return { start: Math.max(chosen.start, before < 0 ? chosen.start : before + 2),
    end: Math.min(chosen.end, after < 0 ? chosen.end : after) };
}

/** Coordinates below belong to the LF-normalized snapshot, NOT upstream source.charRange. */
function literalSection(rule: KnowledgeRule) {
  const version = getKnowledgeBase().meta.knowledgeVersion;
  const file = rule.source.corpusFile;
  if (typeof file !== "string") return null;
  const base = resolve(ROOT, version, "corpus");
  const path = resolve(base, file);
  if (!path.startsWith(base + sep) || !existsSync(path)) return null;
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const location = locateLiteralParagraph(text, rule);
  if (!location) return null;
  const { start } = location;
  const excerpt = text.slice(start, location.end).trimEnd();
  const end = start + excerpt.length;
  return {
    kind: "literal-source-context" as const,
    note: "Parágrafo literal coerente da fonte; não é uma nova obrigação. Outras cláusulas da seção constam em adjacentClauses, com modalidades independentes.",
    text: excerpt,
    source: { ...rule.source, knowledgeVersion: version, snapshotFile: `corpus/${file}`,
      snapshotSha256: digest(text), snapshotCharRange: [start, end], coordinates: "UTF-16; LF-normalized snapshot; end exclusive" },
  };
}

const clause = (rule: KnowledgeRule) => ({
  id: rule.id, title: rule.title, originalText: rule.originalText, force: rule.force,
  conditions: rule.conditions, exceptions: rule.exceptions,
  source: { url: rule.source.url, corpusFile: rule.source.corpusFile, charRange: rule.source.charRange, contentHash: rule.source.contentHash },
  applicability: "unknown" as const,
});

/** Same-section citations share the unit's source instead of repeating a URL/hash per clause. */
const adjacentClause = (rule: KnowledgeRule) => ({
  id: rule.id, originalText: rule.originalText, force: rule.force,
  ...(rule.conditions.length ? { conditions: rule.conditions } : {}),
  ...(rule.exceptions.length ? { exceptions: rule.exceptions } : {}),
  source: { ref: "unitSource", charRange: rule.source.charRange }, applicability: "unknown" as const,
});

export function legacyResolution(rule: KnowledgeRule) {
  guardKnowledge("legacyResolution");
  if (!rule.legacy) return undefined;
  const base = getKnowledgeBase();
  const successors = rule.legacy.supersededBy.flatMap((id) => {
    const successor = base.byId.get(id);
    return successor ? [{ ...clause(successor), relationship: successor.originalText === rule.originalText ? "exact" : "partial",
      basis: "existing-legacy-map", caveat: "Exact significa igualdade literal; partial indica textos diferentes no mapeamento existente, sem adjudicação de equivalência semântica." }] : [];
  });
  return { status: successors.length ? "mapped" : "no-audited-successor", successors,
    unresolvedIds: rule.legacy.supersededBy.filter((id) => !base.byId.has(id)),
    reason: rule.legacy.reason, note: "Id histórico: não integra a enumeração normativa da versão servida." };
}

/**
 * 2.16.1: the KB is frozen per process (a version switch builds a new KnowledgeBase object), so
 * derived units are memoized per KB object and rule id. Only the KB's own rule objects are cached;
 * any other object (tests, synthetic rules) is computed uncached. Cached values are deep-frozen so a
 * caller cannot alter what the next caller receives.
 */
const unitMemo = new WeakMap<KnowledgeBase, Map<string, ReturnType<typeof computeNormativeUnit>>>();
const emagMemo = new WeakMap<KnowledgeBase, Map<string, ReturnType<typeof computeEmagUnits>>>();

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function memoFor<V>(memo: WeakMap<KnowledgeBase, Map<string, V>>, base: KnowledgeBase) {
  let map = memo.get(base);
  if (!map) memo.set(base, (map = new Map()));
  return map;
}

export function normativeUnit(rule: KnowledgeRule) {
  guardKnowledge("normativeUnit");
  const base = getKnowledgeBase();
  if (base.byId.get(rule.id) !== rule) return computeNormativeUnit(rule);
  const map = memoFor(unitMemo, base);
  if (!map.has(rule.id)) map.set(rule.id, deepFreeze(computeNormativeUnit(rule)));
  return map.get(rule.id);
}

/** Uncached computation (exported for the memo-equivalence test). */
export function computeNormativeUnit(rule: KnowledgeRule) {
  guardKnowledge("normativeUnit");
  const base = getKnowledgeBase();
  if (rule.force === "example" || rule.legacy || typeof rule.source.corpusFile !== "string") return undefined;
  const file = rule.source.corpusFile;
  const siblings = typeof file === "string" ? base.rules.filter((candidate) =>
    candidate.id !== rule.id && candidate.force !== "example" && !candidate.legacy &&
    candidate.source.corpusFile === file && candidate.source.sectionPath === rule.source.sectionPath) : [];
  return {
    version: "1.0.0", knowledgeVersion: base.meta.knowledgeVersion,
    title: typeof rule.source.section === "string" ? rule.source.section : rule.title,
    unitSource: rule.source,
    mainClause: clause(rule),
    adjacentClauses: siblings.map(adjacentClause),
    sourceContext: literalSection(rule.originalText === rule.source.section
      ? siblings.find((candidate) => candidate.force === "required") ?? rule : rule),
    contextCompleteness: CONTEXT_COMPLETENESS,
    note: "A regra principal conserva sua força. Cláusulas adjacentes oferecem contexto e técnicas/alternativas, não prova de aplicabilidade; exemplos não são normas.",
  };
}

/** Explicit continuation, not silent truncation: exact-id retrieval retains every clause. */
export function boundedNormativeUnit(rule: KnowledgeRule, maxChars: number) {
  const unit = normativeUnit(rule);
  if (!unit || JSON.stringify(unit, null, 2).length <= maxChars) return unit;
  return { status: "context-deferred", applicability: "unknown",
    contextCompleteness: "Metadados extraídos não exaustivos. Leia contexto, condições e alternativas completos antes de julgar.",
    deferred: { adjacentClauses: unit.adjacentClauses.length, sourceParagraph: unit.sourceContext !== null,
      conditions: rule.conditions.length, exceptions: rule.exceptions.length },
    next: { tool: "get_ds_rules", arguments: { id: rule.id } } };
}

/**
 * 2.16.1 list projection: listings never inline units (measured 2.16.0: query "tabela" 241k chars).
 * Each rule carries only a pointer with honest counts; the exact-id call returns the full unit.
 * The completeness/applicability caveat travels once per response (LIST_CONTEXT_NOTE).
 */
export const LIST_CONTEXT_NOTE = "normativeContext em listagens é só referência (context-deferred): aplicabilidade desconhecida; a unidade completa (cláusulas adjacentes com forças próprias, parágrafo literal, condições e alternativas) vem pela chamada em next, por id exato. Leia-a antes de julgar.";

export function normativeUnitRef(rule: KnowledgeRule) {
  const unit = normativeUnit(rule);
  if (!unit) return undefined;
  return { status: "context-deferred" as const, adjacentClauses: unit.adjacentClauses.length,
    sourceParagraph: unit.sourceContext !== null, next: { tool: "get_ds_rules" as const, arguments: { id: rule.id } } };
}

/** Same pointer for an eMAG recommendation in a section listing; exact id returns the full clauses. */
export function emagUnitsRef(id: string) {
  const units = emagUnits(id);
  return { status: "context-deferred" as const, clauses: units.clauses.length,
    sourceParagraph: units.sourceContext !== null, next: { tool: "get_emag_rules" as const, arguments: { id } } };
}

/** Shared recommendation projection; never use the hand-maintained summary as a new norm. */
export function emagUnits(id: string) {
  guardKnowledge("emagUnits");
  const map = memoFor(emagMemo, getKnowledgeBase());
  if (!map.has(id)) map.set(id, deepFreeze(computeEmagUnits(id)));
  return map.get(id)!;
}

/** Uncached computation (exported for the memo-equivalence test). */
export function computeEmagUnits(id: string) {
  guardKnowledge("emagUnits");
  const rules = getKnowledgeBase().rules.filter((rule) => rule.standard === "eMAG" && rule.emagReferences.includes(id) && rule.force !== "example");
  return { knowledgeVersion: getKnowledgeBase().meta.knowledgeVersion, clauses: rules.map(clause),
    contextCompleteness: CONTEXT_COMPLETENESS,
    sourceContext: rules.length ? literalSection(rules.find((rule) => rule.force === "required") ?? rules[0]) : null,
    note: "A recomendação reúne cláusulas com forças próprias; seu título não torna todo o corpo obrigatório. Aplicabilidade permanece desconhecida." };
}
