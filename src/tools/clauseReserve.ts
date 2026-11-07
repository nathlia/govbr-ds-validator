/** A5: catálogo ordenado para a reserva; nunca decide aplicabilidade ou registra pendências. */
import { createHash } from "node:crypto";
import type { KnowledgeRule } from "../data/knowledge.js";
import { byMeasurability, checklistRules, procedureOf, type Procedure } from "./componentChecklist.js";
import { pageChecklistRules } from "./pageChecklist.js";
import { oracleFullyMeasures } from "./oracleCoverage.js";
import { procedureScope } from "./procedureScope.js";

export const CLAUSE_RESERVE_VERSION = "clause-reserve/1.0.0";
type Scope = NonNullable<ReturnType<typeof procedureScope>>;
export type ReserveCandidate = { rule: KnowledgeRule; procedure: Procedure; context: Scope | null };

export function reserveCandidates(components: string[]): ReserveCandidate[] {
  const candidates = (rules: KnowledgeRule[]) => byMeasurability(rules
    .filter(rule => !oracleFullyMeasures(rule.id))
    .map(rule => ({ rule, procedure: procedureOf(rule) }))
    .filter((x): x is { rule: KnowledgeRule; procedure: Procedure } => x.procedure !== null));
  const queues = [...new Set(components)].map(component => candidates(checklistRules(component)));
  // Rodízio preserva a ordem por componente/estado do investigate e a mensurabilidade dentro de cada fila.
  const ordered: Array<{ rule: KnowledgeRule; procedure: Procedure }> = [];
  for (let i = 0; queues.some(q => i < q.length); i++) for (const q of queues) if (q[i]) ordered.push(q[i]);
  if (!ordered.length) ordered.push(...candidates(pageChecklistRules()));
  const seen = new Set<string>();
  return ordered.filter(x => !seen.has(x.rule.id) && Boolean(seen.add(x.rule.id)))
    .map(x => ({ ...x, context: x.procedure.context ?? procedureScope(x.rule, 100_000) }));
}

/** Leitura literal contextual: união de parágrafos, sem repetir trechos já presentes. */
export function reserveContentChars(texts: string[]) {
  const normalized = [...new Set(texts.flatMap(s => s.split(/\n\s*\n/))
    .map(s => s.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean))];
  return normalized.filter(s => !normalized.some(other => other !== s && other.includes(s)))
    .reduce((n, s) => n + JSON.stringify(s).length - 2, 0);
}

/** Conta contexto literal obrigatório; ids, when/provenance, fonte e metadados não preenchem quota. */
export function selectReserve(candidates: ReserveCandidate[], maxChars: number) {
  const targetChars = Math.ceil(maxChars * .2);
  const clauses: Array<Record<string, unknown>> = [];
  const contexts: Record<string, Scope> = {};
  const content: string[] = [];
  const literals: string[] = [];
  const scoped: string[] = [];
  let contentChars = 0;
  let unavailable: string | undefined;
  for (const { rule, procedure, context } of candidates) {
    if (!context) { unavailable = rule.id; break; }
    const { context: _context, ...measure } = procedure;
    const key = createHash("sha256").update(JSON.stringify(context)).digest("hex").slice(0, 16);
    contexts[key] = context;
    clauses.push({ citeAs: rule.id, force: rule.force, text: rule.originalText,
      conditions: rule.conditions, exceptions: rule.exceptions, procedure: measure, context: key, source: rule.source });
    literals.push(rule.originalText);
    scoped.push(rule.originalText, context.text);
    content.push(rule.originalText, context.text, measure.select, measure.measure, measure.expect);
    contentChars = reserveContentChars(content);
    if (contentChars >= targetChars) break;
  }
  const literalChars = reserveContentChars(literals);
  const scopedChars = reserveContentChars(scoped);
  return { unavailable, block: { version: CLAUSE_RESERVE_VERSION, targetChars, contentChars, literalChars,
    contextChars: scopedChars - literalChars, procedureChars: contentChars - scopedChars,
    status: !candidates.length ? "no-candidates" : contentChars >= targetChars ? "fulfilled" : "exhausted",
    note: "Quota de leitura contextual deduplicada, não de obrigações novas. Candidatas, não veredito nem pendingId. Confira condições e aplicabilidade; contexto conserva sua própria modalidade.",
    clauses, ...(clauses.length ? { contexts } : {}) } };
}
