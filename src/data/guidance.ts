/**
 * 3.0.0 (NAT-99): orientação curada do contrato de resposta (§5.3, §15.6). Separada do vocabulário
 * de expansões (vocab-1.0.0) de propósito: as expansões mudam o que a busca LÊ; a orientação só
 * acrescenta texto de investigação ao lado dos resultados e nunca muda ranking, piso ou força.
 *
 * Limites (§15.6): cada frase aponta para uma cláusula da base ou para componentProvenance (`basis`);
 * kbCoverage é lacuna auditada por pessoa; desligável (GOVBR_RETRIEVAL_GUIDANCE=off ou
 * get_ds_rules{vocabulary:false}); por padrão só conceitos com `audit.status:"audited"` são servidos.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { foldText } from "./retrieval.js";
import { getKnowledgeBase, getRuleById } from "./knowledge.js";
import { componentProvenance } from "./componentProvenance.js";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "../../data/retrieval/guidance-1.0.0.json");

export interface GuidancePhrase {
  text: string;
  basis: string;
}

export interface GuidanceConcept {
  id: string;
  /** Componentes em que o conceito vale; ausente = qualquer (só para conceitos genéricos). */
  components?: string[];
  triggers: string[];
  toVerify: GuidancePhrase[];
  next?: Array<{ action: "measure-condition" | "reproduce-state" | "request-detail" | "keep-uncertain"; what: string }>;
  kbCoverage?: {
    status: "covered" | "partial" | "none";
    about: string;
    registryRefs: Array<{ ref: string; name: string }>;
    related: Array<{ id: string; why: string }>;
  };
  cardNotes?: Record<string, GuidancePhrase>;
  provenance: Record<string, unknown>;
  audit: { status: "audited" | "pending"; batch: string | null; reviewedBy: string | null };
}

export interface Guidance {
  version: string;
  /** Versão da base para a qual as frases e ids foram escritos; noutra versão, nada é servido. */
  knowledgeVersion: string;
  note: string;
  concepts: GuidanceConcept[];
}

let cache: Guidance | undefined;
const validated = new Set<string>();

/** A orientação vale só para a versão da base em que foi escrita (ids e frases). */
function appliesToActiveKb(g: Guidance): boolean {
  return getKnowledgeBase().meta.knowledgeVersion === g.knowledgeVersion;
}

export function getGuidance(): Guidance {
  cache ??= JSON.parse(readFileSync(FILE, "utf8")) as Guidance;
  if (appliesToActiveKb(cache) && !validated.has(cache.knowledgeVersion)) {
    validateGuidance(cache);
    validated.add(cache.knowledgeVersion);
  }
  return cache;
}

/**
 * §15.6(b), conferido na carga: toda frase de toVerify/cardNotes aponta para uma cláusula da base
 * (id existente) ou para `componentProvenance:<componente>` com fonte de implementação; os ids de
 * kbCoverage.related e de cardNotes existem. Qualquer falha lança (o servidor não sobe com orientação
 * sem base).
 */
export function validateGuidance(guidance: Guidance): void {
  const problems: string[] = [];
  const basisOk = (basis: string) => {
    const m = /^componentProvenance:([a-z]+)$/.exec(basis);
    if (m) return (componentProvenance(m[1]) as { runtimeSource?: { kind: string } }).runtimeSource?.kind === "implementation-source-code";
    return Boolean(getRuleById(basis));
  };
  for (const c of guidance.concepts) {
    for (const p of c.toVerify) if (!p.basis || !basisOk(p.basis)) problems.push(`${c.id}: toVerify sem basis válido ("${p.text.slice(0, 40)}…")`);
    for (const [id, p] of Object.entries(c.cardNotes ?? {})) {
      if (!getRuleById(id)) problems.push(`${c.id}: cardNotes para id inexistente ${id}`);
      if (!p.basis || !basisOk(p.basis)) problems.push(`${c.id}: cardNote ${id} sem basis válido`);
    }
    for (const r of c.kbCoverage?.related ?? []) if (!getRuleById(r.id)) problems.push(`${c.id}: related inexistente ${r.id}`);
  }
  if (problems.length) throw new Error(`guidance ${guidance.version} inválida: ${problems.join("; ")}`);
}

/** `off` desliga; `pending` serve também os conceitos ainda não auditados; padrão: só auditados. */
export function guidanceMode(): "off" | "audited" | "pending" {
  const value = (process.env.GOVBR_RETRIEVAL_GUIDANCE ?? "").trim().toLowerCase();
  return value === "off" ? "off" : value === "pending" ? "pending" : "audited";
}

/** Conceitos servidos neste processo (vazio se desligado). */
export function servedConcepts(vocabulary: boolean): GuidanceConcept[] {
  const mode = guidanceMode();
  if (!vocabulary || mode === "off") return [];
  const g = getGuidance();
  if (!appliesToActiveKb(g)) return [];
  return g.concepts.filter((c) => c.audit.status === "audited" || mode === "pending");
}

/** Rótulo de versão para `kb.guidance`: a versão, ou "off" quando nenhum conceito é servido. */
export function guidanceLabel(vocabulary: boolean): string {
  return servedConcepts(vocabulary).length ? getGuidance().version : "off";
}

/**
 * O primeiro conceito servido cujo gatilho é um dos termos da consulta (já normalizados) e cujo escopo
 * inclui um dos componentes informados (pista ou context.components). Conceito com escopo não dispara
 * sem componente.
 */
export function conceptFor(terms: string[], vocabulary: boolean, components: string[] = []): GuidanceConcept | null {
  const folded = new Set(terms.map(foldText));
  for (const concept of servedConcepts(vocabulary)) {
    if (concept.components && !concept.components.some((c) => components.includes(c))) continue;
    if (concept.triggers.some((t) => folded.has(foldText(t)))) return concept;
  }
  return null;
}

/** Testes: relê o arquivo. */
export function resetGuidanceCache(): void {
  cache = undefined;
  validated.clear();
}
