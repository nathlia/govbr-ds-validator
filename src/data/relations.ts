/**
 * 3.4.0 (D-153, A12/NAT-104): camada versionada de LIGAÇÕES entre regras já servidas
 * (data/knowledge/relations/kb-relations-<v>.json). Não reescreve texto da base: cada ligação cita as
 * cláusulas que a sustentam com um trecho literal, conferido na carga (sem cláusula ou sem trecho, o
 * servidor não sobe). Uma ligação é "leia também", nunca aplicabilidade nem norma nova.
 *
 * - `relatedComponents`: somado ao campo do registro só na cópia lida (`relatedComponentsOf`), para o
 *   modo context (relação documentada) e para os blocos `related`.
 * - `topics`: termos da consulta que trazem a ligação no bloco `related` da busca.
 * - `registryRoutes`: termo sem correspondência na base → números do registro WCAG 2.2 (texto não servido).
 * Desligável: GOVBR_KB_RELATIONS=off. Vale só para a versão da base em que foi escrita.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getKnowledgeBase, getRuleById, type KnowledgeRule } from "./knowledge.js";
import { foldText } from "./retrieval.js";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "../../data/knowledge/relations/kb-relations-1.1.0.json");

/** 3.4.1 (revisão): nota fixa de uma ligação do projeto, que a cláusula citada não declara. */
export const INFERRED_RELATION_NOTE = "ligação inferida pelo projeto; a cláusula não declara a ligação";

export interface RelationBasis {
  id: string;
  quote: string;
}
export interface RelationLink {
  id: string;
  rule: string;
  relatedComponents?: string[];
  topics?: string[];
  markupOnly?: boolean;
  /** 1.1.0: `documented` — a cláusula citada nomeia o alvo; `inferred` — ligação do projeto. */
  kind: "documented" | "inferred";
  why: string;
  basis: RelationBasis[];
  evidence?: string;
}
export interface RegistryRoute {
  id: string;
  pattern: string;
  refs: string[];
  why: string;
  evidence?: string;
}
export interface KbRelations {
  version: string;
  knowledgeVersion: string;
  note: string;
  links: RelationLink[];
  registryRoutes: RegistryRoute[];
}

let cache: KbRelations | undefined;
let validatedFor: string | undefined;
let derived: Map<string, string[]> | undefined;

const plain = (text: string) => text.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

export function relationsEnabled(): boolean {
  return (process.env.GOVBR_KB_RELATIONS ?? "").trim().toLowerCase() !== "off";
}

function raw(): KbRelations {
  cache ??= JSON.parse(readFileSync(FILE, "utf8")) as KbRelations;
  return cache;
}

/** Na carga: cada regra e cada cláusula de `basis` existem (correntes) e cada trecho está no texto literal. */
export function validateRelations(relations: KbRelations): void {
  const problems: string[] = [];
  const current = (id: string) => {
    const rule = getRuleById(id);
    return rule && !rule.legacy ? rule : undefined;
  };
  for (const link of relations.links) {
    if (!current(link.rule)) problems.push(`${link.id}: regra inexistente ${link.rule}`);
    if (!link.basis.length) problems.push(`${link.id}: sem cláusula de apoio`);
    if (link.kind !== "documented" && link.kind !== "inferred") problems.push(`${link.id}: kind deve ser documented ou inferred`);
    if (!link.relatedComponents?.length && !link.topics?.length) problems.push(`${link.id}: sem relatedComponents nem topics`);
    for (const b of link.basis) {
      const rule = current(b.id);
      if (!rule) problems.push(`${link.id}: cláusula de apoio inexistente ${b.id}`);
      else if (!plain(rule.originalText).includes(plain(b.quote))) problems.push(`${link.id}: trecho "${b.quote}" não está em ${b.id}`);
    }
  }
  for (const route of relations.registryRoutes) {
    try {
      new RegExp(route.pattern);
    } catch {
      problems.push(`${route.id}: padrão inválido`);
    }
  }
  if (problems.length) throw new Error(`${relations.version} inválida: ${problems.join("; ")}`);
}

/** Ligações servidas (vazio se desligado ou se a base ativa não é a da camada). */
export function getRelations(): KbRelations | null {
  if (!relationsEnabled()) return null;
  const relations = raw();
  const kv = getKnowledgeBase().meta.knowledgeVersion;
  if (kv !== relations.knowledgeVersion) return null;
  if (validatedFor !== kv) {
    validateRelations(relations);
    validatedFor = kv;
    derived = undefined;
  }
  return relations;
}

/** Rótulo de versão para respostas: a versão, ou "off". */
export function relationsLabel(): string {
  return getRelations()?.version ?? "off";
}

/** `relatedComponents` do registro + os derivados da camada (ordem: registro, depois camada, sem repetição). */
export function relatedComponentsOf(rule: KnowledgeRule): string[] {
  const relations = getRelations();
  if (!relations) return rule.relatedComponents;
  if (!derived) {
    derived = new Map();
    for (const link of relations.links) for (const c of link.relatedComponents ?? []) derived.set(link.rule, [...(derived.get(link.rule) ?? []), c]);
  }
  const extra = derived.get(rule.id);
  return extra ? [...new Set([...rule.relatedComponents, ...extra])] : rule.relatedComponents;
}

/** True quando o componente só está em relatedComponents pela camada (não pelo registro). */
export function isDerivedRelation(rule: KnowledgeRule, component: string): boolean {
  return !rule.relatedComponents.includes(component) && relatedComponentsOf(rule).includes(component);
}

export interface RelatedItem {
  id: string;
  title: string;
  force: string;
  relation: string;
  kind: "documented" | "inferred";
  /** Só em ligação `inferred`: INFERRED_RELATION_NOTE. */
  note?: string;
  why: string;
  basis: RelationBasis[];
  next: { tool: "get_ds_rules"; arguments: { id: string } };
}

function item(link: RelationLink): RelatedItem {
  const rule = getRuleById(link.rule)!;
  return {
    id: rule.id,
    title: rule.title.length > 110 ? `${rule.title.slice(0, 109)}…` : rule.title,
    force: rule.force,
    relation: link.id,
    kind: link.kind,
    ...(link.kind === "inferred" ? { note: INFERRED_RELATION_NOTE } : {}),
    why: link.why,
    basis: link.basis,
    next: { tool: "get_ds_rules", arguments: { id: rule.id } },
  };
}

/**
 * Ligações para uma consulta: as de um componente em escopo e as de um tópico presente nos termos
 * (dobrados). `markupOnly` exige `markup`. Exclui ids já devolvidos; no máximo `max`, ordem do arquivo.
 */
export function relatedFor(
  opts: { components?: string[]; terms?: string[]; markup?: boolean; exclude?: Set<string>; max?: number },
): RelatedItem[] {
  const relations = getRelations();
  if (!relations) return [];
  const components = new Set(opts.components ?? []);
  const terms = new Set((opts.terms ?? []).map(foldText));
  const out: RelatedItem[] = [];
  const seen = new Set(opts.exclude ?? []);
  for (const link of relations.links) {
    if (seen.has(link.rule)) continue;
    const byComponent = (link.relatedComponents ?? []).some((c) => components.has(c));
    const byTopic = (link.topics ?? []).some((t) => terms.has(foldText(t))) && (!link.markupOnly || opts.markup === true);
    if (!byComponent && !byTopic) continue;
    seen.add(link.rule);
    out.push(item(link));
    if (out.length >= (opts.max ?? 3)) break;
  }
  return out;
}

/** Referências do registro WCAG para termos sem correspondência (`registryRoutes`), sem repetição. */
export function registryRefsFor(unmatched: string[]): Array<{ num: string; route: string }> {
  const relations = getRelations();
  if (!relations) return [];
  const out: Array<{ num: string; route: string }> = [];
  for (const route of relations.registryRoutes) {
    const re = new RegExp(route.pattern);
    if (!unmatched.some((t) => re.test(foldText(t)))) continue;
    for (const num of route.refs) if (!out.some((o) => o.num === num)) out.push({ num, route: route.id });
  }
  return out;
}

/** Testes: relê o arquivo. */
export function resetRelationsCache(): void {
  cache = undefined;
  validatedFor = undefined;
  derived = undefined;
}
