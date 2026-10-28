/**
 * 3.0.0 (NAT-99): get_ds_rules no contrato `oraculo-resposta/1.0.0`. O ranking é o do 2.17.0
 * (retrieval.ts, sem mudança de pesos, piso ou ordem); aqui se decidem formato, orçamento,
 * continuação, ambiguidade, lacunas, orientação e erros. `match:"literal"` não passa por aqui: segue
 * o caminho da 2.16.1/2.17.1 byte a byte (server.ts).
 */
import {
  filterRules,
  getEvidence,
  getKnowledgeBase,
  getRuleById,
  type KnowledgeRule,
  type RuleFilter,
} from "../data/knowledge.js";
import {
  exampleDefectWarnings,
  normalizeContext,
  resolveComponentName,
  sourcePageNotes,
  retrieveContextCandidates,
  suggestComponentNames,
  type ContextCandidate,
} from "../data/applicability.js";
import { rankRules, tokenize, vocabularyEnabledByDefault, vocabularyLabel, RANKING_VERSION, type ScoredRule } from "../data/retrieval.js";
import { conceptFor, guidanceLabel } from "../data/guidance.js";
import { getComponentSpecs } from "../data/load.js";
import type { PageRegion } from "../evidence/pageFacts.js";
import { ABSENCE_NOTE } from "../responses/absence.js";
import {
  CONTRACT,
  MESSAGES,
  cursorKey,
  decodeCursor,
  fail,
  ok,
  staleCursorError,
  step,
  type MessageCode,
} from "../responses/contract.js";
import {
  IDS_MAX_DEFAULT,
  IDS_MAX_INDEX,
  LISTING_DEFAULT_LIMIT,
  LISTING_MAX_LIMIT,
  RETRIEVAL_DEFAULT_LIMIT,
  RETRIEVAL_MAX_LIMIT,
  idResponse,
  indexItem,
  listingResponse,
  lookupCard,
  lookupResponse,
  retrievalResponse,
  ruleKind,
  type Hit,
  type KbMeta,
} from "../responses/retrieval.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QUERY_MAX_CHARS = 500;

export interface DsRulesArgs {
  context?: { components?: string[]; regions?: PageRegion[]; terms?: string[] };
  id?: string;
  ids?: string[];
  component?: string;
  category?: string;
  force?: RuleFilter["force"];
  validationStrategy?: string;
  automatable?: boolean;
  automationConfidence?: "high" | "medium" | "low";
  severitySuggestion?: string;
  standard?: string;
  query?: string;
  match?: "relevance" | "literal";
  vocabulary?: boolean;
  include_evidence?: boolean;
  detail?: "summary" | "brief" | "full" | "index";
  limit?: number;
  offset?: number;
  cursor?: string;
  clauseCursor?: number;
}

export interface DsRulesProjections {
  brief: (rule: KnowledgeRule) => unknown;
  full: (rule: KnowledgeRule) => unknown;
}

let wcagNames: Map<string, string> | undefined;
function wcagRegistry(): Map<string, string> {
  if (!wcagNames) {
    const file = join(dirname(fileURLToPath(import.meta.url)), "../../data/wcag-2.2.json");
    const data = JSON.parse(readFileSync(file, "utf8")) as { criteria: Array<{ num: string; handle: string; versions: string[] }> };
    wcagNames = new Map(data.criteria.filter((c) => c.versions.includes("2.2")).map((c) => [c.num, c.handle]));
  }
  return wcagNames;
}

function knownComponents(): string[] {
  const names = new Set<string>(Object.keys(getComponentSpecs().components));
  for (const r of getKnowledgeBase().rules) if (r.component) names.add(r.component);
  return [...names].sort();
}

export function unknownComponentFailure(component: string, tool = "get_ds_rules", args: Record<string, unknown> = {}) {
  const didYouMean = suggestComponentNames(component);
  return fail({
    error: `Componente '${component}' não existe na base (use o id, a classe br-<id> ou o nome da página oficial).`,
    errorCode: "unknown-component",
    field: "component",
    ...(didYouMean.length ? { didYouMean } : {}),
    available: knownComponents(),
    next: didYouMean.length
      ? [step("request-detail", "repita com o componente sugerido", tool, { ...args, component: didYouMean[0] })]
      : [step("request-detail", "escolha um nome em available e repita", null)],
  });
}

function queryFailure(query: string) {
  const text = query.trim();
  if (text.length > QUERY_MAX_CHARS) {
    return fail({
      error: `query tem ${text.length} caracteres; o máximo é ${QUERY_MAX_CHARS}.`,
      errorCode: "query-too-long",
      field: "query",
      maxChars: QUERY_MAX_CHARS,
      next: [step("request-detail", "Reduza a pergunta ao que foi observado: elemento, atributo, papel, estado (algumas palavras).")],
    });
  }
  if (!tokenize(text).length) {
    return fail({
      error: "query sem termos de conteúdo: só palavras vazias ou pontuação.",
      errorCode: "no-content-terms",
      field: "query",
      next: [
        step("request-detail", "Use palavras do que foi observado (ex.: foco, rótulo, aria-label, contraste)."),
        step("request-detail", "Ou liste por filtro, sem query (component, category, force)."),
      ],
    });
  }
  return null;
}

const combination = (error: string, field: string, next: ReturnType<typeof step>[]) =>
  fail({ error, errorCode: "invalid-combination", field, next });

function strictFilter(args: DsRulesArgs): Omit<RuleFilter, "query" | "component"> {
  const out: Omit<RuleFilter, "query" | "component"> = {};
  if (args.category !== undefined) out.category = args.category;
  if (args.force !== undefined) out.force = args.force;
  if (args.validationStrategy !== undefined) out.validationStrategy = args.validationStrategy;
  if (args.automatable !== undefined) out.automatable = args.automatable;
  if (args.automationConfidence !== undefined) out.automationConfidence = args.automationConfidence;
  if (args.severitySuggestion !== undefined) out.severitySuggestion = args.severitySuggestion;
  if (args.standard !== undefined) out.standard = args.standard;
  return out;
}

/** Argumentos da chamada inicial (sem cursor/offset/limit/clauseCursor), base do `next` e do cursor. */
function initialArgs(args: DsRulesArgs): Record<string, unknown> {
  const { cursor: _c, offset: _o, limit: _l, clauseCursor: _cc, ...rest } = args;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
}

function kbMeta(vocabulary: boolean): KbMeta {
  const kb = getKnowledgeBase();
  return {
    dsVersion: kb.meta.dsVersion,
    knowledgeVersion: kb.meta.knowledgeVersion,
    ranking: RANKING_VERSION,
    vocabulary: vocabulary ? vocabularyLabel() : "off",
    guidance: guidanceLabel(vocabulary),
  };
}

/** Posição de início: cursor (vence), offset legado (aceito até a 4.0.0, com aviso) ou 0. */
function startPosition(args: DsRulesArgs, key: string): { position: number; deprecation?: string } | null {
  if (args.cursor !== undefined) {
    const position = decodeCursor(args.cursor, key);
    if (position === null) return null;
    return { position, ...(args.offset !== undefined ? { deprecation: MESSAGES["offset-deprecated"] } : {}) };
  }
  if (args.offset !== undefined) return { position: args.offset, deprecation: MESSAGES["offset-deprecated"] };
  return { position: 0 };
}

function limitOf(requested: number | undefined, fallback: number, ceiling: number) {
  const applied = Math.min(requested ?? fallback, ceiling);
  return { applied, ...(requested !== undefined && requested > ceiling ? { clamped: { requested, applied, ceiling } } : {}) };
}

function withLimitNote<T extends Record<string, unknown>>(response: T, clamped?: { requested: number; applied: number; ceiling: number }): T {
  if (!clamped) return response;
  const page = response.page as Record<string, unknown> | undefined;
  return { ...response, page: { ...(page ?? {}), limit: clamped } };
}

const matchedOf = (s: ScoredRule) => s.matched.map((m) => (m.via ? `${m.term}→${m.via}` : m.term));

function mainField(s: ScoredRule): string | null {
  const counts = new Map<string, number>();
  for (const m of s.matched) for (const f of m.fields) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function contextHit(c: ContextCandidate): Hit {
  const matched: string[] = [];
  let relation: Hit["relation"] = c.rule.component === null ? "global" : "component";
  let field: string | null = null;
  for (const r of c.reasons) {
    if (r.kind === "component-observed") matched.push(`componente:${r.component}`);
    else if (r.kind === "region-observed") matched.push(`região:${r.region}`);
    else if (r.kind === "related-component-observed") {
      matched.push(`relacionado:${r.component}`);
      if (c.rule.component === null) relation = "related";
    } else {
      matched.push(r.term);
      field ??= r.fields[0] ?? null;
    }
  }
  return { rule: c.rule, matched, relation, field, ...(c.conflicts.length ? { conflicts: c.conflicts } : {}) };
}

function evidenceBlock(pool: KnowledgeRule[], text: string | null, hint: string | null, vocabulary: boolean, take: number) {
  const kb = getKnowledgeBase();
  const ordered = text ? rankRules({ text, component: hint, pool, vocabulary }, kb).results.map((s) => s.rule) : pool;
  return {
    note: "Fragmentos canônicos do @govbr-ds/core — evidência de implementação, NÃO normas. Não sobrepõem regras required/prohibited. Leia o fragmento por id.",
    total: ordered.length,
    count: Math.min(ordered.length, take),
    items: ordered.slice(0, take).map((r) => ({ id: r.id, component: r.component, title: r.title.slice(0, 110) })),
  };
}

/** Defeitos conhecidos dos exemplos e conflitos de página-fonte: compactos, só na 1ª página. */
function contextWarnings(components: string[], candidates: ContextCandidate[]) {
  const examples = exampleDefectWarnings(components);
  const pages = sourcePageNotes(candidates);
  if (!examples.length && !pages.length) return {};
  return {
    warnings: {
      ...(examples.length
        ? { exampleDefects: examples, exampleNote: "Exemplos canônicos oficiais destes componentes têm defeitos conhecidos — não os trate como norma (get_component_spec, govbr://knowledge/conflicts)." }
        : {}),
      ...(pages.length
        ? { sourcePageNotes: pages, sourcePageNote: "Conflitos documentados sobre a página-fonte de alguma candidata, sem regra nomeada (govbr://knowledge/conflicts)." }
        : {}),
    },
  };
}

export function getDsRules(args: DsRulesArgs, projections: DsRulesProjections) {
  const kb = getKnowledgeBase();
  const vocabulary = args.vocabulary ?? vocabularyEnabledByDefault();
  const hasFilter = ["component", "category", "force", "validationStrategy", "automatable", "automationConfidence", "severitySuggestion", "standard", "query"].some(
    (k) => (args as Record<string, unknown>)[k] !== undefined,
  );

  // ── combinações inválidas (B-22: nada vence em silêncio) ──
  if (args.id && args.ids) return combination("Informe id ou ids, não ambos.", "ids", [step("request-detail", "um id por chamada, ou o lote em ids", "get_ds_rules", { ids: [args.id, ...args.ids] })]);
  if (args.context && (args.id || args.ids)) {
    return combination("context não se combina com id/ids: peça os ids depois, em lote.", "context", [step("request-detail", "busca pelo contexto, sem ids", "get_ds_rules", { context: args.context })]);
  }
  if (args.context && args.component !== undefined) {
    return combination("context não se combina com component: informe os componentes em context.components.", "component", [
      step("request-detail", "o componente dentro de context.components", "get_ds_rules", {
        context: { ...args.context, components: [...(args.context.components ?? []), args.component] },
      }),
    ]);
  }
  if (args.id && (hasFilter || args.include_evidence || args.cursor || args.limit !== undefined || args.offset !== undefined)) {
    return combination("id é consulta exata: não se combina com filtros, query, include_evidence, limit, offset ou cursor.", "id", [
      step("request-detail", "a unidade pelo id, sozinho", "get_ds_rules", { id: args.id }),
    ]);
  }
  if (args.clauseCursor !== undefined && !args.id) {
    return combination("clauseCursor só vale com id (continuação de uma unidade).", "clauseCursor", [step("request-detail", "repita com o id da unidade", null)]);
  }

  // ── id exato ──
  if (args.id) {
    const rule = getRuleById(args.id);
    if (!rule) {
      return fail({
        error: `Regra '${args.id}' não encontrada no knowledge base.`,
        errorCode: "unknown-id",
        field: "id",
        absenceNote: ABSENCE_NOTE,
        next: [
          step("correct-citation", "cite só ids devolvidos por uma ferramenta; para achar a regra, busque pelo que você mediu (get_ds_rules com query). Não ajuste o id até ele existir."),
          step("keep-uncertain", "sem regra encontrada, mantenha o fato com a referência que você justifica, ou rule: null"),
        ],
      });
    }
    return ok(idResponse(rule, args.clauseCursor));
  }

  // ── lote por ids ──
  if (args.ids) {
    const requested = [...new Set(args.ids)];
    const detail = args.detail === "index" ? "index" : args.detail === "full" ? "full" : "brief";
    const max = detail === "index" ? IDS_MAX_INDEX : IDS_MAX_DEFAULT;
    if (requested.length > max) {
      return fail({
        error: `${requested.length} ids distintos; o teto é ${IDS_MAX_DEFAULT} por chamada (${IDS_MAX_INDEX} com detail:'index').`,
        errorCode: "too-many-ids",
        field: "ids",
        next: [
          step("request-detail", `os primeiros ${max} ids; repita com o restante`, "get_ds_rules", { ids: requested.slice(0, max), ...(detail !== "brief" ? { detail } : {}) }),
          ...(detail !== "index" ? [step("request-detail", "o lote inteiro em projeção index (só títulos)", "get_ds_rules", { ids: requested.slice(0, IDS_MAX_INDEX), detail: "index" })] : []),
        ],
      });
    }
    const found = requested.map((id) => getRuleById(id)).filter((r): r is KnowledgeRule => Boolean(r));
    const foundIds = new Set(found.map((r) => r.id));
    const key = cursorKey({ tool: "get_ds_rules", mode: "ids", ids: requested, detail, kv: kb.meta.knowledgeVersion });
    const start = startPosition(args, key);
    if (!start) return staleCursorError("get_ds_rules", initialArgs(args));
    const project =
      detail === "index"
        ? (rule: KnowledgeRule, n: number) => ({ ...indexItem(rule, n), kind: ruleKind(rule) })
        : detail === "full"
          ? (rule: KnowledgeRule) => ({ kind: ruleKind(rule), ...(projections.full(rule) as Record<string, unknown>) })
          : (rule: KnowledgeRule, n: number, used: Set<MessageCode>) => lookupCard(rule, n, used);
    return ok({
      ...lookupResponse({
        requested,
        found,
        missing: requested.filter((id) => !foundIds.has(id)),
        position: start.position,
        args: initialArgs(args),
        cursorKey: key,
        detail,
        project,
      }),
      ...(start.deprecation ? { deprecation: start.deprecation } : {}),
    });
  }

  // ── componente: resolvedor de nomes; `global` = só regras sem componente (§5) ──
  let component: string | null = null;
  let globalOnly = false;
  if (args.component !== undefined) {
    if (args.component.trim().toLowerCase() === "global") globalOnly = true;
    else {
      const resolved = resolveComponentName(args.component);
      if (!resolved) return unknownComponentFailure(args.component, "get_ds_rules", initialArgs(args));
      component = resolved;
    }
  }
  const strict = strictFilter(args);
  // query vazia ou só espaços é erro de entrada (não vira listagem do catálogo inteiro).
  if (args.query !== undefined && !args.query.trim()) {
    const empty = queryFailure(args.query);
    if (empty) return empty;
  }
  const query = args.query?.trim() ? args.query : undefined;
  if (query) {
    const problem = queryFailure(query);
    if (problem) return problem;
  }

  // ── context ──
  if (args.context) {
    const hasContext = Boolean(args.context.components?.length || args.context.regions?.length || args.context.terms?.length);
    if (!hasContext) {
      return fail({
        error: "context vazio: informe components, regions ou terms.",
        errorCode: "empty-context",
        field: "context",
        next: [step("request-detail", "os componentes encontrados pelo scan (coverage.componentsFound)", null)],
      });
    }
    const normalized = normalizeContext(args.context);
    const pool = filterRules(strict);
    const candidates = retrieveContextCandidates(pool, normalized, { ...(query ? { query } : {}), vocabulary });
    const meta = kbMeta(vocabulary);
    const key = cursorKey({ tool: "get_ds_rules", mode: "context", args: initialArgs(args), kb: meta });
    const start = startPosition(args, key);
    if (!start) return staleCursorError("get_ds_rules", initialArgs(args));
    const { applied, clamped } = limitOf(args.limit, RETRIEVAL_DEFAULT_LIMIT, RETRIEVAL_MAX_LIMIT);
    const terms = [...normalized.terms, ...(query ? tokenize(query).map((t) => t.key) : [])];
    const concept = conceptFor(terms, vocabulary, normalized.components);
    const hint = normalized.components.length === 1 ? normalized.components[0] : null;
    const response = retrievalResponse(
      {
        mode: "context",
        hits: candidates.map(contextHit),
        position: start.position,
        limit: applied,
        args: initialArgs(args),
        cursorKey: key,
        kb: meta,
        query: {
          components: normalized.components,
          regions: normalized.regions,
          terms: normalized.terms,
          ...(normalized.unresolved.length ? { unresolved: normalized.unresolved } : {}),
          ...(query ? { text: query } : {}),
          globalsAllowed: true,
        },
        unmatchedTerms: [],
        concept,
        componentHint: hint,
        ambiguityAllowed: false,
        deprecation: start.deprecation,
        ...(args.include_evidence
          ? { evidence: evidenceBlock(normalized.components.flatMap((c) => getEvidence(c)), query ?? null, null, vocabulary, Math.min(applied, 3)) }
          : {}),
        ...contextWarnings(normalized.components, candidates),
      },
      wcagRegistry(),
      (id) => Boolean(getRuleById(id)),
    );
    return ok(withLimitNote(response, clamped));
  }

  // ── query: motor de relevância ──
  if (query) {
    const pool = globalOnly ? filterRules(strict).filter((r) => r.component === null) : filterRules(strict);
    const ranked = rankRules({ text: query, component, pool, vocabulary }, kb);
    const meta = kbMeta(vocabulary);
    const key = cursorKey({ tool: "get_ds_rules", mode: "query", args: initialArgs(args), kb: meta });
    const start = startPosition(args, key);
    if (!start) return staleCursorError("get_ds_rules", initialArgs(args));
    const { applied, clamped } = limitOf(args.limit, RETRIEVAL_DEFAULT_LIMIT, RETRIEVAL_MAX_LIMIT);
    const concept = conceptFor(ranked.analysis.terms, vocabulary, component ? [component] : []);
    const hits: Hit[] = ranked.results.map((s) => ({
      rule: s.rule,
      matched: matchedOf(s),
      relation: s.ownComponent ? "component" : s.rule.component === null ? "global" : "related",
      field: mainField(s),
    }));
    const response = retrievalResponse(
      {
        mode: "query",
        hits,
        position: start.position,
        limit: applied,
        args: initialArgs(args),
        cursorKey: key,
        kb: meta,
        query: {
          terms: ranked.analysis.terms,
          expansions: ranked.analysis.expansions,
          componentHint: component,
          globalsAllowed: true,
          ...(globalOnly ? { componentFilter: "global" } : {}),
          ...(ranked.analysis.unmatchedTerms.length ? { unmatchedTerms: ranked.analysis.unmatchedTerms } : {}),
        },
        unmatchedTerms: ranked.analysis.unmatchedTerms,
        concept,
        componentHint: component,
        ambiguityAllowed: component === null && !globalOnly,
        deprecation: start.deprecation,
        ...(args.include_evidence
          ? { evidence: evidenceBlock(getEvidence(component ?? undefined), query, component, vocabulary, Math.min(applied, 3)) }
          : {}),
      },
      wcagRegistry(),
      (id) => Boolean(getRuleById(id)),
    );
    return ok(withLimitNote(response, clamped));
  }

  // ── sem filtro nenhum: índice de facetas ──
  const filter: RuleFilter = { ...strict, ...(component ? { component } : {}) };
  const noFilter = !hasFilter && args.limit === undefined && args.offset === undefined && args.cursor === undefined;
  const base = globalOnly ? filterRules(strict).filter((r) => r.component === null) : filterRules(filter);
  if (noFilter) {
    const count = (pick: (r: KnowledgeRule) => string) => {
      const out: Record<string, number> = {};
      for (const r of base) out[pick(r)] = (out[pick(r)] ?? 0) + 1;
      return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
    };
    return ok({
      contract: CONTRACT,
      kind: "index",
      kb: { dsVersion: kb.meta.dsVersion, knowledgeVersion: kb.meta.knowledgeVersion, totalNormative: kb.meta.normativeRules },
      note:
        "Índice, não listagem: chamar sem filtro devolveria a base normativa inteira. Estreite por component, category, force, validationStrategy ou query — ou peça uma regra por id. Para paginar a base inteira mesmo assim, passe limit.",
      total: base.length,
      facets: {
        force: count((r) => r.force),
        category: count((r) => r.category),
        validationStrategy: count((r) => r.validationStrategy),
        component: count((r) => r.component ?? "(global)"),
      },
      next: [step("request-detail", "busque pelo que você mediu", null), step("request-detail", "liste um componente", null)],
    });
  }

  // ── listagem de catálogo ──
  const detail = args.detail === "brief" || args.detail === "full" ? args.detail : "index";
  const key = cursorKey({ tool: "get_ds_rules", mode: "listing", args: initialArgs(args), kv: kb.meta.knowledgeVersion });
  const start = startPosition(args, key);
  if (!start) return staleCursorError("get_ds_rules", initialArgs(args));
  const { applied, clamped } = limitOf(args.limit, LISTING_DEFAULT_LIMIT, LISTING_MAX_LIMIT);
  const project =
    detail === "index" ? indexItem : detail === "full" ? (r: KnowledgeRule) => projections.full(r) : (r: KnowledgeRule) => projections.brief(r);
  const response = listingResponse({
    rules: base,
    position: start.position,
    limit: applied,
    args: initialArgs(args),
    filter: { ...strict, ...(component ? { component } : {}), ...(globalOnly ? { component: "global" } : {}) },
    cursorKey: key,
    kb: { dsVersion: kb.meta.dsVersion, knowledgeVersion: kb.meta.knowledgeVersion },
    project,
    detail,
    deprecation: start.deprecation,
    ...(args.include_evidence ? { evidence: evidenceBlock(getEvidence(component ?? undefined), null, null, vocabulary, 10) } : {}),
  });
  return ok(withLimitNote(response, clamped));
}
