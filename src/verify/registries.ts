/**
 * Registros versionados que o portão consulta (v02, fatia 4).
 *
 * Formato nunca prova existência. Antes daqui, o ramo WCAG aceitava qualquer X.Y.Z e o de tokens
 * qualquer id começado por `ds-token-`: `wcag-9.9.9` passava. Cada família de identificador tem agora
 * um registro com versão declarada, e a resposta do portão diz contra qual versão conferiu.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { constraintsForComponent, findEmagRule, getComponentSpecs, getEmag, type EmagRule } from "../data/load.js";
import { getKnowledgeBase, getRuleById, type KnowledgeRule } from "../data/knowledge.js";
import { CHECK_GROUNDING, type CheckKind } from "../checkers/grounding.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../data");

export interface WcagCriterion {
  num: string;
  id: string;
  handle: string;
  level: "A" | "AA" | "AAA" | null;
  versions: string[];
}

export interface WcagRegistry {
  meta: {
    standard: string;
    source: string;
    retrievedAt: string;
    sourceSha256: string;
    totalListed: number;
    inWcag22: number;
    obsoleteInWcag22: string[];
    note: string;
  };
  criteria: WcagCriterion[];
}

let wcag: WcagRegistry | undefined;

export function getWcagRegistry(): WcagRegistry {
  return (wcag ??= JSON.parse(readFileSync(join(DATA_DIR, "wcag-2.2.json"), "utf8")) as WcagRegistry);
}

export type MembershipStatus = "member" | "obsolete" | "unknown" | "malformed";

export interface Membership<T> {
  status: MembershipStatus;
  normalizedId: string;
  entry?: T;
  detail: string;
}

export function wcagMembership(raw: string): Membership<WcagCriterion> {
  const normalizedId = raw.trim().replace(/^wcag[-:\s]*/i, "");
  if (!/^\d\.\d{1,2}\.\d{1,2}$/.test(normalizedId)) {
    return { status: "malformed", normalizedId, detail: `'${raw}' não é um critério de sucesso WCAG no formato X.Y.Z.` };
  }
  const registry = getWcagRegistry();
  const entry = registry.criteria.find((criterion) => criterion.num === normalizedId);
  if (!entry) {
    return {
      status: "unknown",
      normalizedId,
      detail: `Critério WCAG ${normalizedId} não existe na WCAG 2.2 (${registry.meta.inWcag22} critérios).`,
    };
  }
  if (!entry.versions.includes("2.2")) {
    return { status: "obsolete", normalizedId, entry, detail: `Critério WCAG ${normalizedId} (${entry.handle}) foi removido na WCAG 2.2.` };
  }
  return { status: "member", normalizedId, entry, detail: `WCAG 2.2 ${normalizedId} ${entry.handle}.` };
}

function emagCount(): number {
  return Object.values(getEmag().sections).reduce((total, section) => total + section.rules.length, 0);
}

export function emagMembership(raw: string): Membership<EmagRule & { section: string }> {
  const normalizedId = raw.trim().replace(/^emag[-:\s]*/i, "");
  if (!/^\d\.\d{1,2}$/.test(normalizedId)) {
    return { status: "malformed", normalizedId, detail: `'${raw}' não é uma recomendação e-MAG no formato n.n.` };
  }
  const entry = findEmagRule(normalizedId);
  if (!entry) {
    return {
      status: "unknown",
      normalizedId,
      detail: `Recomendação e-MAG ${normalizedId} não existe no e-MAG 3.1 (${emagCount()} recomendações).`,
    };
  }
  return { status: "member", normalizedId, entry, detail: `e-MAG 3.1 ${normalizedId} ${entry.title}.` };
}

export function kbMembership(id: string): Membership<KnowledgeRule> {
  const entry = getRuleById(id);
  if (!entry) {
    return {
      status: "unknown",
      normalizedId: id,
      detail: `Regra '${id}' não existe no knowledge base ${getKnowledgeBase().meta.dsVersion}. Use get_ds_rules para obter ids válidos.`,
    };
  }
  return { status: "member", normalizedId: id, entry, detail: `KB ${entry.dsVersion} ${id}.` };
}

const TOKEN_KINDS = (Object.keys(CHECK_GROUNDING) as CheckKind[]).filter((kind) => kind.startsWith("token-"));

/** Ids dos verificadores de token. `implements` vazio: a verificação não sustenta achado (D-27/D-32). */
export function tokenRuleMembership(id: string): Membership<{ kind: CheckKind; implements: string[] }> {
  const kind = TOKEN_KINDS.find((candidate) => `ds-${candidate}` === id);
  if (!kind) {
    return {
      status: "unknown",
      normalizedId: id,
      detail: `Id de verificação de token desconhecido: '${id}'. Ids publicados: ${TOKEN_KINDS.map((k) => `ds-${k}`).join(", ")}.`,
    };
  }
  return { status: "member", normalizedId: id, entry: { kind, implements: CHECK_GROUNDING[kind].implements }, detail: `Verificação ${id}.` };
}

/** Restrições estruturais citáveis — as mesmas que `get_component_spec` publica (D-29). */
export function structureRuleMembership(id: string): Membership<{ component: string }> {
  for (const spec of Object.values(getComponentSpecs().components)) {
    if (constraintsForComponent(spec).some((constraint) => constraint.id === id)) {
      return { status: "member", normalizedId: id, entry: { component: spec.name }, detail: `Restrição ${id} de ${spec.rootClass}.` };
    }
  }
  return {
    status: "unknown",
    normalizedId: id,
    detail: `'${id}' não é uma restrição publicada. Ids citáveis vêm de get_component_spec (ex.: ds-structure-button-tag).`,
  };
}

/** Versões contra as quais o portão conferiu, devolvidas em toda verificação. */
export function registryVersions(): Record<string, string> {
  const wcagMeta = getWcagRegistry().meta;
  const kb = getKnowledgeBase().meta;
  const specs = getComponentSpecs().meta;
  return {
    wcag: `${wcagMeta.standard} · ${wcagMeta.inWcag22} critérios · ${wcagMeta.source} (${wcagMeta.retrievedAt})`,
    emag: `e-MAG 3.1 · ${emagCount()} recomendações`,
    kb: `gov.br DS KB ${kb.dsVersion} · ${kb.totalRules} registros (${kb.extractionTimestamp})`,
    components: `@govbr-ds/core ${specs.version} · ${specs.totalComponents} componentes`,
  };
}
