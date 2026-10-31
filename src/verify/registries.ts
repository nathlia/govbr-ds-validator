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
import { constraintsForComponent, expectedRootTags, findEmagRule, getComponentSpecs, getEmag, type EmagRule } from "../data/load.js";
import { getKnowledgeBase, getRuleById, type KnowledgeRule } from "../data/knowledge.js";
import { CHECK_GROUNDING, STRUCTURE_SEMANTICS, checkerFamily, structureTagGrounding, type CheckerFamily, type CheckKind } from "../checkers/grounding.js";
import type { Finding } from "../schema/finding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import { pageConstraints, type PageConstraint } from "../checkers/pageStructure.js";

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
  if (entry.legacy) {
    const novos = entry.legacy.supersededBy.length ? ` Substituída por ${entry.legacy.supersededBy.join(", ")}.` : "";
    return {
      status: "member",
      normalizedId: id,
      entry,
      detail: `KB ${entry.dsVersion} ${id} — id legado da versão ${entry.legacy.fromVersion} (${entry.legacy.class}), fora das listagens da versão servida.${novos}`,
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

/** Restrições de página citáveis — as mesmas que `get_page_rules` publica (2.7.0). */
export function pageConstraintMembership(id: string): Membership<PageConstraint> {
  const entry = pageConstraints().find((constraint) => constraint.id === id);
  if (entry) return { status: "member", normalizedId: id, entry, detail: `Restrição de página ${id} (${entry.region}).` };
  return {
    status: "unknown",
    normalizedId: id,
    detail: `'${id}' não é uma restrição de página publicada. Ids citáveis vêm de get_page_rules: ${pageConstraints().map((c) => c.id).join(", ")}.`,
  };
}

/**
 * 2.15.0 (D-27 no servidor): a norma que uma verificação do próprio oráculo implementa, resolvida
 * pelo id do check — nunca pelo `implements` do payload. Na tela A (ensaio 03, 2.14.3) o agente
 * reescreveu achados do scan_page sem `implements`, campo que as projeções não mostravam, e o portão
 * rejeitou fatos medidos por um erro de esquema.
 *
 * `null`: o id não é verificação publicada desta fonte (a existência já falha na conferência de
 * membro). `[]`: a verificação existe e não nomeia norma (D-27/D-32) — não sustenta achado.
 */
/** 3.4.4 (C7): norma da base sobre o assunto de um check sem norma decidível (só token-font-size hoje). */
export function relatedRuleForCheckId(source: string, id: string) {
  if (source === "govbr-ds-token" && id === "ds-token-font-size") return CHECK_GROUNDING["token-font-size"].relatedRule;
  return undefined;
}

export function groundingForCheckId(source: string, id: string): string[] | null {
  switch (source) {
    case "govbr-ds-token":
      return tokenRuleMembership(id).entry?.implements ?? null;
    case "govbr-ds-structure": {
      // 3.6.0: a norma da tag raiz é por componente (e-MAG 1.2 para raiz semântica, anatomia para genérica).
      const spec = Object.values(getComponentSpecs().components).find((candidate) => `ds-structure-${candidate.name}-tag` === id);
      return spec && structureRuleMembership(id).status === "member" ? structureTagGrounding(expectedRootTags(spec)) : null;
    }
    case "govbr-ds-page":
      return pageConstraintMembership(id).entry?.implements ?? null;
    default:
      return null;
  }
}

/**
 * 2.13.0 (NAT-85): versão do registro de condições contextuais (verify/contextual.ts) — quais
 * regras selecionam quais predicados de associação, anatomia e foco. Recortado do catálogo P0
 * `catalogo-controles-1.0.0`.
 */
// 2.14.1 (NAT-61, revisão Codex): contextual-1.1.0 — P1 3.3.1 só decide "erro detectado" por sinal
// programático estabelecido pela última ação (S1–S4, verify/contextual.ts); aparência não basta.
// 2.14.2 (NAT-61, revisão Codex 8963921e): contextual-1.2.0 — S5, estado de erro declarado pelo
// componente DS (só br-input → danger, tabela Estados do Input; só no perfil evaluation). O registro do
// knowledge-free não muda: ele não interpreta o mapeamento.
// 2.14.3 (NAT-61, revisão Codex 4d66c40e): contextual-1.3.0 / knowledge-free contextual-1.2.0 — P1
// item-identified exige o vínculo ESTA mensagem ↔ ESTE campo (IDREF exato do campo ou contêiner só do
// campo, estável); seletor de várias mensagens, mensagem global/de outro campo = undetermined.
// 3.4.0 (D-153, B2/B4/B9): contextual-1.4.0 / knowledge-free contextual-1.3.0 — inaplicabilidade (modal sem
// invocador, sem fechar, de outro tipo) e sujeito que não é diálogo ficam `undetermined` com código, nunca
// `contradicted`; mensagem que só cita o campo em texto não desmente 3.3.1 (fica sem decisão). Fora das
// condições contextuais, o predicado de foco visível (emag-4.4 / WCAG 2.4.7, `focus-indicator-visible`).
// 3.4.4 (C2/C6/C13): contextual-1.5.0 / knowledge-free contextual-1.4.0 — invalid=true sem IDREF do campo para a
// mensagem não desmente "erro não associado" (fica sem decisão); a anatomia do Message aceita também a cláusula
// em prosa 829632; o foco visível descarta perda de contraste da borda e mudança em elemento invisível.
export const CONTEXT_CONDITIONS_VERSION = "contextual-1.5.0 · 9 condições (P1 associação, P2 anatomia, P3 foco) + foco visível · catalogo-controles-1.0.0";

/** Versões contra as quais o portão conferiu, devolvidas em toda verificação. */
export function registryVersions(): Record<string, string> {
  const wcagMeta = getWcagRegistry().meta;
  const kb = getKnowledgeBase().meta;
  const specs = getComponentSpecs().meta;
  return {
    wcag: `${wcagMeta.standard} · ${wcagMeta.inWcag22} critérios · ${wcagMeta.source} (${wcagMeta.retrievedAt})`,
    emag: `e-MAG 3.1 · ${emagCount()} recomendações`,
    kb: `gov.br DS KB ${kb.dsVersion} [${kb.knowledgeVersion}] · ${kb.totalRules} registros (${kb.extractionTimestamp})`,
    components: `@govbr-ds/core ${specs.version} · ${specs.totalComponents} componentes`,
    contextual: CONTEXT_CONDITIONS_VERSION,
  };
}

/** 2.14.0 (NAT-61): o registro de condições do perfil knowledge-free — só P1 pela fonte WCAG. */
export const CONTEXT_CONDITIONS_VERSION_KNOWLEDGE_FREE = "contextual-1.4.0 · 3 condições P1 (WCAG 3.3.1, 4.1.3)";

/** Versões do perfil knowledge-free: só registros públicos (WCAG 2.2) e o registro de condições P1. */
export function registryVersionsKnowledgeFree(): Record<string, string> {
  const wcagMeta = getWcagRegistry().meta;
  return {
    wcag: `${wcagMeta.standard} · ${wcagMeta.inWcag22} critérios · ${wcagMeta.source} (${wcagMeta.retrievedAt})`,
    contextual: CONTEXT_CONDITIONS_VERSION_KNOWLEDGE_FREE,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 3.6.0 (D-155): o check por trás de um achado que cita a norma
// ════════════════════════════════════════════════════════════════════════════

/** Como o check foi identificado: campo `rule.checker`; id do check em `rule.id` (forma até a 3.5.0); ou pela condição estruturada. */
export interface CheckerRef {
  checker: string;
  family: CheckerFamily;
  how: "field" | "legacy-id" | "inferred";
}

const CHECKER_FAMILIES: readonly CheckerFamily[] = ["govbr-ds-token", "govbr-ds-structure", "govbr-ds-page"];

/** Critério WCAG que a base liga à norma citada pelo check (só onde o achado o declara). */
function checkerWcag(family: CheckerFamily, checker: string): string | undefined {
  if (checker === "ds-page-focus-order") return "2.4.3";
  if (family === "govbr-ds-structure") {
    const spec = Object.values(getComponentSpecs().components).find((candidate) => `ds-structure-${candidate.name}-tag` === checker);
    const grounded = spec ? structureTagGrounding(expectedRootTags(spec)) : [];
    return grounded.includes(STRUCTURE_SEMANTICS) ? "1.3.1" : undefined;
  }
  return undefined;
}

/**
 * A norma citada (`rule.source` + `rule.id`) é a que o check decide? 3.6.0 (revisão independente): só a citação
 * do check (citeAs = 1º id de `implements`) e o critério WCAG que ele declara selecionam o predicado. Os demais ids
 * de `implements` são contexto ("context"): o check não mede o que eles dizem, então não confirmam.
 */
function citesCheckerNorm(finding: Finding, family: CheckerFamily, checker: string): "cite" | "context" | "other" {
  const grounded = groundingForCheckId(family, checker);
  if (!grounded || grounded.length === 0) return "other";
  const { source, id } = finding.rule;
  let cited: string | null = null;
  if (source === "govbr-ds-kb") cited = id;
  else if (source === "emag") {
    const membership = emagMembership(id);
    cited = membership.status === "member" ? `emag-${membership.normalizedId}` : null;
  } else if (source === "wcag") {
    const membership = wcagMembership(id);
    return membership.status === "member" && checkerWcag(family, checker) === membership.normalizedId ? "cite" : "other";
  }
  if (cited === null) return "other";
  if (cited === grounded[0]) return "cite";
  return grounded.includes(cited) ? "context" : "other";
}

function contextNote(checker: string, finding: Finding, family: CheckerFamily): string {
  const grounded = groundingForCheckId(family, checker) ?? [];
  const wcag = checkerWcag(family, checker);
  return `A verificação '${checker}' decide só a cláusula que mede (${grounded[0]}${wcag ? ` ou WCAG ${wcag}` : ""}); ` +
    `${finding.rule.source} '${finding.rule.id}' está em implements como contexto, não como o que o check mede: sem predicado do check. Cite ${grounded[0]}.`;
}

/** O check que a condição estruturada nomeia (o agente copiou a norma e deixou `checker` de fora). */
function checkerFromCondition(data: Record<string, unknown>): string | null {
  switch (data.expectedCondition) {
    case EXPECTED_CONDITIONS.tokenColor:
      return "ds-token-color";
    case EXPECTED_CONDITIONS.tokenFontFamily:
      return "ds-token-font-family";
    case EXPECTED_CONDITIONS.tokenRadius:
      return "ds-token-radius";
    case EXPECTED_CONDITIONS.tokenSpacing:
      return "ds-token-spacing";
    case EXPECTED_CONDITIONS.structureTag:
      return typeof data.component === "string" && /^[a-z0-9-]+$/.test(data.component) ? `ds-structure-${data.component}-tag` : null;
    case EXPECTED_CONDITIONS.pageRegion:
      return data.region === "header" || data.region === "footer" ? `ds-page-${data.region}` : null;
    case EXPECTED_CONDITIONS.skipLink:
      return "ds-page-skip-link";
    case EXPECTED_CONDITIONS.skipLinkFirstFocus:
      return "ds-page-focus-order";
    default:
      return null;
  }
}

/**
 * 3.6.0: a verificação do oráculo por trás de um achado. Os achados dos checks citam a norma em `rule.id` e
 * nomeiam o check em `rule.checker`; o check só escolhe o predicado e a norma que o servidor resolve — e só
 * quando a norma citada é uma das que ele implementa (um check não decide outra norma). A forma até a 3.5.0
 * (id do check em `rule.id`, `source` govbr-ds-token|structure|page) continua aceita. Sem `checker`, a condição
 * estruturada exata (com component/region) identifica o check, sob a mesma exigência de norma.
 */
export function checkerOf(finding: Finding): { ref: CheckerRef | null; note?: string } {
  const { source, id, checker } = finding.rule;
  const legacy = CHECKER_FAMILIES.find((family) => family === source);
  if (legacy) return { ref: { checker: id, family: legacy, how: "legacy-id" } };
  if (checker !== undefined) {
    const family = checkerFamily(checker);
    const grounded = family ? groundingForCheckId(family, checker) : null;
    if (!family || grounded === null) {
      return { ref: null, note: `rule.checker '${checker}' não é verificação publicada do oráculo: ignorado (a citação é rule.id).` };
    }
    const match = citesCheckerNorm(finding, family, checker);
    if (match === "context") return { ref: null, note: contextNote(checker, finding, family) };
    if (match !== "cite") {
      return {
        ref: null,
        note: `rule.checker '${checker}' ignorado: a norma citada (${source} '${id}') não é a que essa verificação implementa (${grounded.join(", ") || "nenhuma"}); o predicado do check não decide outra norma.`,
      };
    }
    return { ref: { checker, family, how: "field" } };
  }
  const inferred = checkerFromCondition((finding.evidence.data ?? {}) as Record<string, unknown>);
  const family = inferred ? checkerFamily(inferred) : null;
  if (inferred && family && groundingForCheckId(family, inferred) !== null) {
    const match = citesCheckerNorm(finding, family, inferred);
    if (match === "cite") return { ref: { checker: inferred, family, how: "inferred" } };
    if (match === "context") return { ref: null, note: contextNote(inferred, finding, family) };
  }
  return { ref: null };
}

/** O achado na forma do check (id do check em `rule.id`, família em `rule.source`) — só para escolher e rodar o predicado. */
export function asCheckerForm(finding: Finding, ref: CheckerRef): Finding {
  if (ref.how === "legacy-id") return finding;
  return { ...finding, rule: { ...finding.rule, id: ref.checker, source: ref.family } };
}
