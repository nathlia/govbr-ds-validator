/**
 * govbr-ds-validator MCP server — the validation oracle (TCC 2 artifact).
 *
 * Design (traceable to tcc2-requirements.md):
 *   A1  rules as queryable tools/resources, never static prompt text
 *   A2  e-MAG 3.1 alongside WCAG-derived checks
 *   A3  canonical component specs from @govbr-ds/core examples
 *   A4  token registry with hex→token reverse index
 *   A5  responses shaped as structured feedback signals
 *   A6  validation procedure as an MCP prompt primitive
 *   B1  deterministic token/structure checkers (no LLM)
 *   B2  axe-core embedded as deterministic accessibility pass
 *   C3  verify_finding anti-hallucination gate
 *   C5  evidence tools separated from judgment
 *   D2–D4  finding schema, dual-format report, persisted traces
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FindingSchema, FindingSchemaKnowledgeFree, type Finding } from "./schema/finding.js";
import { knowledgeLockAttempts, lockKnowledgeForProcess, runKnowledgeLocked } from "./data/lock.js";
import { normativeUnit, boundedNormativeUnit, normativeUnitRef, legacyResolution, emagUnits, emagUnitsRef, LIST_CONTEXT_NOTE } from "./data/normativeUnits.js";
import { componentProvenance } from "./data/componentProvenance.js";
import {
  getTokenRegistry,
  getEmag,
  getPageRules,
  getComponentSpecs,
  constraintsForComponent,
  findEmagRule,
} from "./data/load.js";
import {
  getKnowledgeBase,
  filterRules,
  getEvidence,
  getRuleById,
  getKnowledgeConflicts,
  getComponentDefects,
  getEmagValidationTemplate,
  warnOnVersionMismatch,
  NORMATIVE_FORCES,
  type KnowledgeRule,
  type RuleFilter,
  type RuleForce,
} from "./data/knowledge.js";
import {
  normalizeContext,
  retrieveContextCandidates,
  exampleDefectWarnings,
  pageCategoryPointers,
  sourcePageNotes,
  summarizeGroups,
  GLOBAL_GROUP,
  PAGE_REGIONS,
  resolveComponentName,
  suggestComponentNames,
  type ContextCandidate,
} from "./data/applicability.js";
import { rankRules, rankingMeta, vocabularyEnabledByDefault, vocabularyLabel, tokenize } from "./data/retrieval.js";
import type { PageRegion } from "./evidence/pageFacts.js";
import { readFileSync } from "node:fs";
import { checkTokenCompliance, collectTokenObservations, ALL_TOKEN_CHECKS } from "./checkers/tokenCompliance.js";

/**
 * A versão que o servidor anuncia no handshake MCP.
 *
 * Lida do package.json de propósito: estava escrita à mão aqui e já tinha divergido — o servidor
 * dizia 2.0.0 enquanto o pacote ia em 2.1.0. Não é detalhe cosmético: o scorer agrupa execuções por
 * versão do validator (D-26), então dois oráculos com semântica diferente anunciando o mesmo número
 * fariam a incomparabilidade virar lembrança em vez de mecanismo.
 */
const VERSAO: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
import { checkComponentStructure, collectStructureObservations } from "./checkers/structure.js";
import { runAxeScan } from "./checkers/axe.js";
import { pageConstraints } from "./checkers/pageStructure.js";
import {
  inspectComputedStyles,
  STYLE_PROPERTIES,
  type StyleProperty,
} from "./evidence/inspect.js";
import { verifyFinding } from "./verify/gate.js";
import { VerificationStore } from "./verify/store.js";
import { ArrivalSchema, PageActionsSchema } from "./scan/actions.js";
import type { StateAttestation } from "./scan/pageScan.js";
import { sameScanPage } from "./scan/state.js";
import { validateFindings, buildReport, persistReport, summarize } from "./report/report.js";
import { buildValidatePagePrompt } from "./prompts/validatePage.js";
import { ToolTelemetry, instrumentTool, type ToolTelemetryOptions } from "./telemetry.js";
import {
  FindingDetailSchema,
  FindingPageInputShape,
  FindingStore,
  buildFindingPage,
  deduplicateFindings,
  diffFindings,
  type FindingDetail,
} from "./responses/findings.js";
import { FamilyViewInputShape, buildFamilyMemberPage, buildFamilyPage, familyIndex } from "./responses/families.js";
import { PageScanCache, scanPage } from "./scan/pageScan.js";
import { ABSENCE_NOTE, ABSENCE_NOTE_KNOWLEDGE_FREE } from "./responses/absence.js";
import {
  CONTRACT,
  MESSAGES,
  RESPONSE_BUDGET,
  budgetPage,
  clip,
  cursorKey,
  decodeCursor,
  encodeCursor,
  fail,
  ok,
  staleCursorError,
  step,
  strictInput,
  installContractInputValidation,
  textSize,
  type ContractError,
} from "./responses/contract.js";
import { getDsRules, unknownComponentFailure } from "./tools/getDsRules.js";
import { emagTemplateCitation } from "./responses/retrieval.js";

/** 3.3.0 (B-09): o resumo do e-MAG do projeto não é texto da norma (nada da base é reescrito). */
const EMAG_PARAPHRASE_NOTE =
  "description, wcag e meta.note são resumo do projeto (em inglês), não texto do e-MAG: não cite como norma. O texto literal está em normativeContext.clauses (por id) e sourceContext.";
import { looksLikeColor, parseColor } from "./data/colorValue.js";
import { serverInstructions } from "./prompts/instructions.js";
import { DenseRequiredError, defaultRetrievalMode, denseRequiredByEnv } from "./data/hybrid.js";
import { denseState } from "./data/embeddings.js";
export { DenseRequiredError, InvalidRetrievalModeError } from "./data/hybrid.js";

/**
 * 3.2.0: verificações assíncronas de subida (hoje: GOVBR_RETRIEVAL_REQUIRE_DENSE). O index.ts espera
 * por elas antes de conectar o transporte; falha → exit 2 com uma linha no stderr.
 */
let startupCheck: Promise<void> = Promise.resolve();
export function startupChecks(): Promise<void> {
  return startupCheck;
}
import { getGuidance } from "./data/guidance.js";
import { assembleScan, checksRunFor, diffPage, diffSummary, investigateFor, observationPage, SCAN_DEFAULT_MAX_CHARS } from "./responses/scan.js";
import { verificationEnvelope } from "./responses/verify.js";
import type { Observation } from "./schema/finding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORTS_DIR = join(__dirname, "../../reports");

/** Perfis de ferramentas válidos (`toolProfile` / `GOVBR_VALIDATOR_TOOL_PROFILE`). */
export const TOOL_PROFILES = ["full", "evaluation", "normative", "deterministic", "evidence", "knowledge-free"] as const;
export type ToolProfile = (typeof TOOL_PROFILES)[number];

/**
 * 2.17.1 (NAT-106): perfil desconhecido é erro, não volta para `full` em silêncio (um `knowledge_free`
 * digitado errado daria ao braço sem conhecimento a base inteira).
 */
export class UnknownToolProfileError extends Error {
  readonly code = "unknown-tool-profile";
  constructor(readonly profile: string) {
    super(`unknown tool profile "${profile}" (GOVBR_VALIDATOR_TOOL_PROFILE); valid: ${TOOL_PROFILES.join(", ")}`);
    this.name = "UnknownToolProfileError";
  }
}

/** Perfil efetivo: vazio/ausente = `full` (padrão de sempre); qualquer outro nome fora da lista lança. */
export function resolveToolProfile(requested: string | undefined | null): ToolProfile {
  if (requested === undefined || requested === null || requested === "") return "full";
  if ((TOOL_PROFILES as readonly string[]).includes(requested)) return requested as ToolProfile;
  throw new UnknownToolProfileError(requested);
}

export interface ServerOptions {
  reportsDir?: string;
  telemetry?: ToolTelemetryOptions;
  /** Full authoring surface, or the smaller surface used by controlled evaluations. */
  toolProfile?: ToolProfile;
  /**
   * 2.14.0 (NAT-61): alcance da trava de conhecimento do perfil knowledge-free. `process` (padrão)
   * trava o processo inteiro; `call` trava só a execução de cada ferramenta do perfil — para testes e
   * para o inventário, que sobem um servidor `evaluation` e um `knowledge-free` no mesmo processo.
   */
  knowledgeLock?: "process" | "call";
}

/** Serialização da 2.x (indentada): só no caminho `match:"literal"` do get_ds_rules, byte a byte. */
function json(data: unknown) {
  const isError = Boolean(data && typeof data === "object" && "error" in (data as Record<string, unknown>));
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], ...(isError ? { isError: true } : {}) };
}

const StylePropertySchema = z.enum(STYLE_PROPERTIES);

/** Erro de sessão (scanId/familyId/ids desconhecidos): os ids só valem na sessão MCP que os gerou. */
function sessionFailure(error: string, errorCode: ContractError["errorCode"], field: string, extra: Record<string, unknown> = {}) {
  return fail({
    error,
    errorCode,
    field,
    ...extra,
    next: [
      step(
        "reproduce-state",
        "ids de scan e de finding só valem na sessão MCP em que foram gerados: rode scan_page nesta sessão e use os ids que ele devolver",
        "scan_page",
      ),
    ],
  });
}

function selectorBatch(selector?: string, selectors?: string[]): string | string[] | undefined {
  const batch = [...(selector ? [selector] : []), ...(selectors ?? [])];
  return batch.length > 0 ? batch : undefined;
}

function tokenProperties(checks: typeof ALL_TOKEN_CHECKS): StyleProperty[] {
  const properties = new Set<StyleProperty>();
  if (checks.includes("color")) {
    properties.add("backgroundColor");
    properties.add("color");
    properties.add("borderColor");
  }
  if (checks.includes("font")) {
    properties.add("fontFamily");
    properties.add("fontSize");
  }
  if (checks.includes("radius")) {
    properties.add("borderRadius");
    properties.add("fontSize");
  }
  if (checks.includes("spacing")) {
    properties.add("padding");
    properties.add("margin");
  }
  return [...properties];
}

/**
 * Projeção mínima para varredura (D-26).
 *
 * Medido: as 152 regras normativas na projeção completa custam ~35 mil tokens; nesta, ~14 mil; e
 * uma página de 40, ~3,4 mil. O agente que está decidindo QUAIS regras importam precisa do id
 * (para citar), do texto normalizado (para julgar), da força e de como se verifica. O resto —
 * proveniência, referências cruzadas, evidência esperada — é o que ele consulta depois de já ter
 * escolhido a regra, e aí vem por `id` ou por `detail: "full"`.
 */
function inferenceCaveats(r: KnowledgeRule): string[] {
  const caveats: string[] = [];
  if (r.originalTextMode === "verbatim-truncated-excerpt" || /truncad/i.test(r.notes ?? "")) {
    caveats.push(
      "Fonte textual truncada: não derive obrigatoriedade de regiões, subcomponentes ou comportamentos que a regra não declara explicitamente.",
    );
  }
  return caveats;
}

function briefRule(r: KnowledgeRule) {
  return {
    id: r.id,
    title: r.title,
    normalizedRule: r.normalizedRule,
    force: r.force,
    component: r.component ?? null,
    validationStrategy: r.validationStrategy,
    caveats: inferenceCaveats(r),
    normativeContext: normativeUnitRef(r),
    legacyResolution: legacyResolution(r),
    ...(r.legacy ? { legacy: r.legacy } : {}),
  };
}

/** Contagens por dimensão — o índice barato que substitui a listagem sem filtro (~320 tokens). */
function ruleFacets(rules: KnowledgeRule[]) {
  const count = (pick: (r: KnowledgeRule) => string) => {
    const out: Record<string, number> = {};
    for (const r of rules) {
      const k = pick(r);
      out[k] = (out[k] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
  };
  return {
    force: count(r => r.force),
    category: count(r => r.category),
    validationStrategy: count(r => r.validationStrategy),
    component: count(r => r.component ?? "(global)"),
  };
}

/** Compact projection of a KB rule for get_ds_rules list responses. */
function projectRule(r: KnowledgeRule) {
  return {
    id: r.id,
    title: r.title,
    normalizedRule: r.normalizedRule,
    force: r.force,
    category: r.category,
    subcategory: r.subcategory ?? null,
    component: r.component,
    validationStrategy: r.validationStrategy,
    automatable: r.automatable,
    automationConfidence: r.automationConfidence ?? null,
    severitySuggestion: r.severitySuggestion ?? null,
    expectedEvidence: r.expectedEvidence,
    rationale: r.rationale,
    conditions: r.conditions,
    exceptions: r.exceptions,
    wcagReferences: r.wcagReferences,
    emagReferences: r.emagReferences,
    standard: r.standard ?? null,
    sourceUrl: r.source.url,
    notes: r.notes ?? null,
    caveats: inferenceCaveats(r),
    normativeContext: normativeUnitRef(r),
    legacyResolution: legacyResolution(r),
    ...(r.legacy ? { legacy: r.legacy } : {}),
  };
}

/** Teto declarado por unidade em get_ds_rules(ids, detail='full'); acima dele, context-deferred (2.16.1). */
const IDS_FULL_UNIT_MAX_CHARS = 2500;

/** Orçamento aproximado da resposta inteira com context — o mesmo dos scanners (README). */
const CONTEXT_MAX_CHARS = 12_000;
const CONTEXT_DEFAULT_LIMIT = 20;

const CONTEXT_NOTE =
  "Candidatas a investigar, não defeitos. Pertinência não é verificação: o oráculo não avalia " +
  "condições nem exceções textuais (ficam em applicability.unknowns); obligation separa requisito de " +
  "recomendação. Colete a evidência pedida (expectedEvidence, neededState) antes de julgar; sem " +
  "predicado, um achado citando a regra fica em revisão.";

/**
 * Resumo de candidata (padrão com context): o que decide se vale investigar e como — id, motivo,
 * força/obrigação, aplicabilidade e passos de evidência. Texto da regra, condições, exceções, fonte e
 * versão vêm em detail='brief'/'full' ou por get_ds_rules(ids).
 */
function summarizeCandidate(candidate: ContextCandidate) {
  const r = candidate.rule;
  const { unevaluated, unknowns } = candidate.applicability;
  return {
    ruleId: r.id,
    title: r.title,
    force: r.force,
    normativeContext: boundedNormativeUnit(r, 800),
    obligation: candidate.obligation,
    ...(candidate.relevance ? { relevance: candidate.relevance } : {}),
    reasons: candidate.reasons,
    applicability: {
      status: candidate.applicability.status,
      ...(unevaluated.length ? { unevaluated } : {}),
      ...(unknowns.length ? { unknowns } : {}),
    },
    expectedEvidence: r.expectedEvidence,
    neededState: candidate.neededState,
    ...(candidate.conflicts.length ? { conflicts: candidate.conflicts } : {}),
  };
}

/** Projeção de uma candidata: a projeção brief/full existente + o contrato de contexto (2.9.0). */
type CandidateDetail = "summary" | "brief" | "full";

function projectCandidate(candidate: ContextCandidate, detail: CandidateDetail) {
  if (detail === "summary") return summarizeCandidate(candidate);
  const { id, caveats, ...projection } = detail === "full" ? projectRule(candidate.rule) : briefRule(candidate.rule);
  const r = candidate.rule;
  const { unevaluated, unknowns } = candidate.applicability;
  return {
    ruleId: id,
    ...projection,
    normativeContext: boundedNormativeUnit(r, 2500),
    obligation: candidate.obligation,
    ...(candidate.relevance ? { relevance: candidate.relevance } : {}),
    source: { ...(r.standard ? { standard: r.standard } : {}), url: r.source.url, version: r.standardVersion ?? r.dsVersion },
    reasons: candidate.reasons,
    applicability: {
      status: candidate.applicability.status,
      ...(unevaluated.length ? { unevaluated } : {}),
      ...(unknowns.length ? { unknowns } : {}),
    },
    // Na projeção breve, só o que existe: condição/exceção ausente = nenhuma declarada na base.
    ...(detail === "full"
      ? {}
      : {
          ...(r.conditions.length ? { conditions: r.conditions } : {}),
          ...(r.exceptions.length ? { exceptions: r.exceptions } : {}),
          expectedEvidence: r.expectedEvidence,
        }),
    neededState: candidate.neededState,
    ...(caveats.length ? { caveats } : {}),
    ...(candidate.conflicts.length ? { conflicts: candidate.conflicts } : {}),
  };
}

/** Página de candidatas: limite explícito + orçamento de caracteres, continuação por nextOffset. */
function contextPage(
  candidates: ContextCandidate[],
  { detail, limit, offset }: { detail: CandidateDetail; limit?: number; offset?: number },
  budget: number,
) {
  const take = limit ?? CONTEXT_DEFAULT_LIMIT;
  const skip = offset ?? 0;
  const items: ReturnType<typeof projectCandidate>[] = [];
  let chars = 0;
  let budgetHit = false;
  for (const candidate of candidates.slice(skip, skip + take)) {
    let item = projectCandidate(candidate, detail);
    // Tamanho como sai na resposta: aninhado em `candidates`, cada linha ganha 4 espaços + vírgula.
    let text = JSON.stringify(item, null, 2);
    let size = text.length + 4 * text.split("\n").length + 2;
    if (items.length === 0 && size > budget) {
      // Even a rule's own literal text may be large. Preserve its identity/order and make the
      // required exact-id continuation explicit instead of bypassing the response budget.
      item = { ruleId: candidate.rule.id, force: candidate.rule.force,
        applicability: { status: "unknown" },
        contextStatus: "context-deferred", note: "Unidade excede o orçamento desta projeção. Leia o id completo, incluindo condições e alternativas, antes de julgar.",
        next: { tool: "get_ds_rules", arguments: { id: candidate.rule.id } } } as unknown as ReturnType<typeof projectCandidate>;
      text = JSON.stringify(item, null, 2);
      size = text.length + 4 * text.split("\n").length + 2;
    }
    if (items.length > 0 && chars + size > budget) {
      budgetHit = true;
      break;
    }
    items.push(item);
    chars += size;
  }
  const nextOffset = skip + items.length;
  return {
    offset: skip,
    count: items.length,
    candidates: items,
    truncated: budgetHit,
    ...(nextOffset < candidates.length
      ? {
          more: {
            remaining: candidates.length - nextOffset,
            nextOffset,
            reason: budgetHit ? `orçamento de ~${CONTEXT_MAX_CHARS} caracteres` : `limit=${take}`,
            note: "Peça a próxima página com o mesmo context/filtros e offset=nextOffset.",
          },
        }
      : {}),
  };
}

type ContextInput = { components?: string[]; regions?: PageRegion[]; terms?: string[] };

/** Candidatas para um contexto, sobre a base já estreitada pelos filtros publicados. */
interface SearchOptions {
  /** "literal" keeps the 2.16.1 substring semantics of `query`; default "relevance" (2.17.0). */
  match?: "relevance" | "literal";
  vocabulary?: boolean;
}

const RELEVANCE_DEFAULT_LIMIT = 10;

/** Teto declarado de uma query de relevância (texto livre). */
const QUERY_MAX_CHARS = 500;

function queryProblem(query: string) {
  const text = query.trim();
  if (text.length > QUERY_MAX_CHARS) {
    return {
      error: `query tem ${text.length} caracteres; o máximo é ${QUERY_MAX_CHARS}.`,
      errorCode: "query-too-long",
      field: "query",
      maxChars: QUERY_MAX_CHARS,
      next: [{ tool: null, note: "Reduza a pergunta ao que foi observado: elemento, atributo, papel, estado (algumas palavras)." }],
    };
  }
  if (!tokenize(text).length) {
    return {
      error: "query sem termos de conteúdo: só palavras vazias ou pontuação.",
      errorCode: "no-content-terms",
      field: "query",
      next: [
        { tool: null, note: "Use palavras do que foi observado (ex.: foco, rótulo, aria-label, contraste)." },
        { tool: "get_ds_rules", note: "Ou liste por filtro, sem query (component, category, force)." },
      ],
    };
  }
  return null;
}

/** Componentes que a base conhece (regras) ou que têm especificação. */
function knownComponents(): string[] {
  const names = new Set<string>(Object.keys(getComponentSpecs().components));
  for (const r of getKnowledgeBase().rules) if (r.component) names.add(r.component);
  return [...names].sort();
}

/** B-05: nome de componente que não resolve é erro de entrada, com sugestões — não "0 regras". */
function unknownComponentError(component: string) {
  const didYouMean = suggestComponentNames(component);
  return {
    error: `Componente '${component}' não existe na base (use o id, a classe br-<id> ou o nome da página oficial).`,
    errorCode: "unknown-component",
    field: "component",
    ...(didYouMean.length ? { didYouMean } : {}),
    available: knownComponents(),
    next: didYouMean.length
      ? [{ tool: "get_ds_rules", note: "Repita com component igual a uma das sugestões em didYouMean." }]
      : [{ tool: "list_components", arguments: {} }],
  };
}

const RELEVANCE_NOTE =
  "Ordenado por relevância lexical à pergunta (motor e pesos em meta.ranking): é motivo para ler a " +
  "regra, não aplicabilidade nem conformidade. Só entram regras acima do piso declarado; abaixo dele " +
  "nada é completado com ruído. Confira condições, exceções e o texto completo antes de citar.";

/**
 * `get_ds_rules{query}` (2.17.0): o motor único de relevância sobre a base estreitada pelos filtros
 * estritos (force/category/validationStrategy/standard/...). `component` é pista: as regras dele
 * ganham peso, as globais continuam elegíveis, as de outros componentes saem. Mesmo formato de
 * listagem da 2.16.1 (`rules`, `total`, `more`), mais `retrieval` e `relevance` por regra.
 */
function relevanceResponse(
  filter: RuleFilter,
  paging: { detail?: "summary" | "brief" | "full"; limit?: number; offset?: number; include_evidence?: boolean },
  vocabulary: boolean | undefined,
) {
  const kb = getKnowledgeBase();
  const { query, component, ...strict } = filter;
  // component already resolved by the caller (resolveComponentName); null = no hint.
  const hint = component ?? null;
  const known = hint !== null;
  const ranked = rankRules({ text: query ?? "", component: hint, pool: filterRules(strict), vocabulary }, kb);
  const take = paging.limit ?? RELEVANCE_DEFAULT_LIMIT;
  const skip = paging.offset ?? 0;
  const page = ranked.results.slice(skip, skip + take);
  const project = paging.detail === "full" ? projectRule : briefRule;
  const end = skip + page.length;
  const stop = ranked.results.length === 0 ? "no-match" : end < ranked.results.length ? "limit" : "relevance-floor";
  const response: Record<string, unknown> = {
    meta: {
      dsVersion: kb.meta.dsVersion,
      knowledgeVersion: kb.meta.knowledgeVersion,
      totalNormative: kb.meta.normativeRules,
      ranking: rankingMeta(ranked.vocabulary),
    },
    retrieval: {
      mode: "relevance",
      note: RELEVANCE_NOTE,
      terms: ranked.analysis.terms,
      expansions: ranked.analysis.expansions,
      componentHint: known ? hint : null,
      globalsAllowed: true,
      ...(ranked.analysis.unmatchedTerms.length ? { unmatchedTerms: ranked.analysis.unmatchedTerms } : {}),
      belowFloor: ranked.belowFloor,
      stop,
    },
    total: ranked.results.length,
    offset: skip,
    count: page.length,
    detail: paging.detail === "full" ? "full" : "brief",
    rules: page.map((s) => ({
      ...project(s.rule),
      relevance: { score: Math.round(s.score * 1000) / 1000, matched: s.matched.map((m) => (m.via ? `${m.term}→${m.via}` : m.term)) },
    })),
  };
  if (page.some((s) => normativeUnit(s.rule))) response.normativeContextNote = LIST_CONTEXT_NOTE;
  // Part of the question absent from the base (e.g. `aria-current`): the fixed note, even with results.
  if (ranked.analysis.unmatchedTerms.length) response.absenceNote = ABSENCE_NOTE;
  if (ranked.results.length === 0) {
    response.absenceNote = ABSENCE_NOTE;
    response.next = [
      { tool: null, note: "Reformule pela propriedade medida (atributo, papel, estado, elemento) ou por menos termos." },
      ...(known ? [{ tool: "get_component_spec", arguments: { component: hint } }] : []),
      { tool: null, note: "Sem regra encontrada, mantenha o achado como incerto com a referência que você justifica; ausência na base não é conformidade." },
    ];
  }
  if (end < ranked.results.length) {
    response.more = {
      remaining: ranked.results.length - end,
      nextOffset: end,
      note: "Peça a próxima página com a mesma query/filtros e offset=nextOffset.",
    };
  }
  if (paging.detail !== "full") {
    response.detailNote =
      "Projeção mínima. Para evidência esperada, condições, exceções, referências cruzadas e " +
      "proveniência, peça a regra por id ou repita com detail='full'.";
  }
  if (paging.include_evidence) {
    // B-07: evidence goes through the same engine, component hint and limit as the rules.
    const evidence = rankRules({ text: query ?? "", component: hint, pool: getEvidence(hint ?? undefined), vocabulary }, kb).results;
    response.evidence = {
      note: "Fragmentos canônicos do @govbr-ds/core — evidência de implementação, NÃO normas. Não sobrepõem regras required/prohibited. Ordenados pela mesma relevância, até limit.",
      total: evidence.length,
      count: Math.min(evidence.length, take),
      items: evidence.slice(0, take).map((s) => project(s.rule)),
    };
  }
  return response;
}

/**
 * Candidatas para um contexto, sobre a base já estreitada pelos filtros publicados. 2.17.0: `query`
 * entra no motor de relevância junto com context.terms; com match:"literal", continua o filtro por
 * substring da 2.16.1 sobre a base.
 */
function contextCandidates(context: ContextInput, filter: RuleFilter, search: SearchOptions = {}) {
  const normalized = normalizeContext(context);
  if (search.match === "literal" || !filter.query?.trim()) {
    return { normalized, candidates: retrieveContextCandidates(filterRules(filter), normalized, { vocabulary: search.vocabulary, match: search.match }) };
  }
  const { query, ...strict } = filter;
  return { normalized, candidates: retrieveContextCandidates(filterRules(strict), normalized, { query, vocabulary: search.vocabulary }) };
}

function contextResponse(
  context: ContextInput,
  filter: RuleFilter,
  paging: { detail: CandidateDetail; limit?: number; offset?: number },
  search: SearchOptions = {},
) {
  const kb = getKnowledgeBase();
  const { normalized, candidates } = contextCandidates(context, filter, search);
  const vocabulary = search.vocabulary ?? vocabularyEnabledByDefault();
  const firstPage = (paging.offset ?? 0) === 0;
  const warnings = exampleDefectWarnings(normalized.components);
  const pointers = pageCategoryPointers(normalized.terms);
  const pageNotes = sourcePageNotes(candidates);
  const head = {
    meta: {
      dsVersion: kb.meta.dsVersion,
      knowledgeVersion: kb.meta.knowledgeVersion,
      totalNormative: kb.meta.normativeRules,
      // match:"literal" = the 2.16.1 context path, byte for byte (no ranking block).
      ...(search.match === "literal" ? {} : { ranking: { engine: rankingMeta("off").engine, vocabulary: vocabulary ? vocabularyLabel() : "off", match: "relevance" } }),
    },
    retrieval: "direct" as const,
    note: CONTEXT_NOTE,
    context: normalized,
    total: candidates.length,
    detail: paging.detail,
  };
  // 2.12.0: na primeira página, quantas candidatas cada grupo tem e a chamada que pagina um grupo só
  // (as candidatas se alternam entre grupos; quem quer um componente inteiro pede só ele).
  const filterArgs = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined));
  const groups = firstPage
    ? {
        groups: {
          note:
            "Candidatas por grupo (componente observado ou global). A lista alterna os grupos, obrigações " +
            "primeiro; para paginar um grupo só, use a chamada em next.",
          items: summarizeGroups(candidates).map((g) => ({
            ...g,
            next:
              g.group !== GLOBAL_GROUP
                ? { tool: "get_ds_rules", arguments: { ...filterArgs, context: { components: [g.group] } } }
                : normalized.terms.length
                  ? { tool: "get_ds_rules", arguments: { ...filterArgs, context: { terms: normalized.terms } } }
                  : null,
          })),
        },
      }
    : {};
  // Contexto fixo, só na primeira página para não repetir a cada continuação.
  const tail = firstPage
    ? {
        pageConstraints: {
          note:
            "Restrições citáveis de página (get_page_rules): valem para página completa baseada no " +
            "Template Base, independentemente dos componentes observados; se a página avaliada é " +
            "completa ou um fragmento não é informado ao oráculo.",
          ids: pageConstraints().map((c) => c.id),
        },
        ...(pointers.length
          ? {
              pageRuleCategories: {
                note: "Categorias de get_page_rules cujo texto contém os termos — prosa de orientação, sem id normativo por frase.",
                items: pointers,
              },
            }
          : {}),
        ...(pageNotes.length
          ? {
              sourcePageNotes: {
                note: "Conflitos documentados sobre a página-fonte de alguma candidata, sem regra nomeada — não associados a nenhuma regra (govbr://knowledge/conflicts).",
                items: pageNotes,
              },
            }
          : {}),
        ...(warnings.length
          ? {
              exampleWarnings: {
                note: "Exemplos canônicos oficiais destes componentes têm defeitos conhecidos — não os trate como norma (get_component_spec, govbr://knowledge/conflicts).",
                items: warnings,
              },
            }
          : {}),
        notRetrieved:
          "Regras de componentes não observados não são devolvidas. Regras globais só entram por " +
          "relação documentada (relatedComponents) ou por termo em context.terms; a base não publica " +
          "outra ligação componente → regra global.",
      }
    : {};
  // O orçamento vale para a resposta inteira: as candidatas ficam com o que sobra do fixo (~400 de folga
  // para os campos de paginação), e sempre ao menos uma para a continuação andar.
  const fixed = JSON.stringify({ ...head, ...groups, ...tail }, null, 2).length + 400;
  const page = contextPage(candidates, paging, Math.max(CONTEXT_MAX_CHARS - fixed, 0));
  return { ...head, ...groups, ...page, ...tail };
}

export function createServer(options: ServerOptions = {}): McpServer {
  const reportsDir = options.reportsDir ?? process.env.GOVBR_VALIDATOR_REPORTS_DIR ?? DEFAULT_REPORTS_DIR;
  const toolProfile = resolveToolProfile(options.toolProfile ?? process.env.GOVBR_VALIDATOR_TOOL_PROFILE);
  const hasNorms = toolProfile === "full" || toolProfile === "evaluation" || toolProfile === "normative";
  const hasDeterministic = toolProfile === "full" || toolProfile === "evaluation" || toolProfile === "deterministic";
  const hasEvidence = toolProfile === "full" || toolProfile === "evidence";
  const hasCombinedGate = toolProfile === "full" || toolProfile === "evaluation";
  /**
   * 2.14.0 (NAT-61): terceiro braço. As ferramentas de medição do perfil evaluation sem nada da base
   * de conhecimento: scan_page só com axe, get_finding_details como está e verify_finding com
   * reprodução de estado, registro WCAG e predicados P1. Sem recursos nem prompt. Os carregadores de
   * conhecimento ficam travados (data/lock.ts) e as tentativas vão para a telemetria.
   */
  const knowledgeFree = toolProfile === "knowledge-free";
  if (knowledgeFree && options.knowledgeLock !== "call") lockKnowledgeForProcess();
  const telemetry = new ToolTelemetry(
    knowledgeFree
      ? { ...options.telemetry, knowledgeLockAttempts: () => knowledgeLockAttempts().attempts }
      : options.telemetry
  );
  /** Ferramenta instrumentada; no perfil knowledge-free, executada sob a trava de conhecimento. */
  const tool = <TArgs, TResult>(name: string, handler: (args: TArgs) => Promise<TResult>) =>
    instrumentTool(telemetry, name, knowledgeFree ? (args: TArgs) => runKnowledgeLocked(() => handler(args)) : handler);
  const findingStore = new FindingStore();
  const verificationStore = new VerificationStore();
  const pageScanCache = new PageScanCache();
  /** 3.0.0 (S-03): observações por scanId, fora da resposta inicial e pagináveis (get_finding_details view=observations). */
  const observationStore = new Map<string, Observation[]>();
  /** Revisão da 3.0.0: diff completo de findings por scanId (o cabeçalho leva só contagens). */
  const diffStore = new Map<string, { previousScanId: string; diff: ReturnType<typeof diffFindings> }>();
  const recordDiff = (scanId: string, previousScanId: string, previous: Finding[], current: Finding[]) => {
    const diff = diffFindings(previous, current);
    diffStore.set(scanId, { previousScanId, diff });
    return diff;
  };
  const verificationFor = (finding: Finding) => verificationStore.lookup(finding)?.verification;

  /**
   * 2.11.0 (NAT-84): visão de um lote — a página de findings de sempre ou a página de famílias.
   * Só apresentação: `summary`, `deduplication` e o lote guardado não mudam. Nada depende do perfil.
   */
  function batchView(
    findings: Finding[],
    stateFingerprint: string | null,
    args: {
      view?: "findings" | "families";
      detail?: FindingDetail;
      cursor?: number;
      limit?: number;
      maxChars?: number;
      memberLimit?: number;
    },
  ) {
    const { view, detail, cursor, limit, maxChars, memberLimit } = args;
    // Padrão: famílias (decisão do coordenador na revisão do NAT-84). A lista plana segue em view="findings".
    if ((view ?? "families") === "families") {
      return buildFamilyPage(findings, { cursor, limit, maxChars, memberLimit, stateFingerprint, verificationFor });
    }
    const page = buildFindingPage(findings, { detail, cursor, limit, maxChars });
    if (cursor) return page;
    const index = familyIndex(findings, stateFingerprint);
    return {
      ...page,
      familyIndex: index,
      responseCharsEstimate: page.responseCharsEstimate + JSON.stringify(index).length,
    };
  }

  const server = new McpServer({
    name: "govbr-ds-validator",
    version: VERSAO,
    // 2.17.1 (NAT-106): perfil efetivo legível pelo runner no initialize (serverInfo), sem tocar o tools/list.
    description: `toolProfile=${toolProfile}`,
  }, {
    // 3.3.0 (B-18): procedimento de uso das ferramentas deste perfil, sem conhecimento do DS.
    instructions: serverInstructions(new Set([
      ...(hasNorms ? ["get_ds_rules"] : []),
      ...(hasEvidence ? ["inspect_computed_styles"] : []),
      ...(hasDeterministic || knowledgeFree ? ["scan_page", "get_finding_details"] : []),
      ...(hasCombinedGate || knowledgeFree ? ["verify_finding"] : []),
    ])),
  });
  installContractInputValidation(server);

  // Phase 2.5 guard: the KB and the installed @govbr-ds/core must describe
  // the same DS release (logs to stderr — stdout is the MCP transport). Sem base no knowledge-free.
  if (!knowledgeFree) warnOnVersionMismatch();
  // 3.0.0 (revisão): orientação curada sem basis válido não sobe (§15.6b, falha cedo).
  if (hasNorms) getGuidance();
  // 3.2.0 (NAT-107, D-149): padrão léxico — o modelo nem carrega. Com GOVBR_RETRIEVAL_MODE=hybrid|dense,
  // vetores + modelo carregam em segundo plano (a 1ª query espera; ausentes → léxica com
  // ranking.dense:"unavailable"). Modo inválido falha na subida.
  const startupMode = hasNorms ? defaultRetrievalMode() : "lexical";
  if (startupMode !== "lexical") void denseState();
  // GOVBR_RETRIEVAL_REQUIRE_DENSE=1 (runner): só vale com hybrid/dense como padrão; sem modelo + vetores
  // conferidos, não sobe. O knowledge-free ignora (não tem busca nem base).
  startupCheck =
    startupMode !== "lexical" && denseRequiredByEnv()
      ? denseState().then((s) => {
          if (s.status !== "ready") throw new DenseRequiredError(`${s.model}: ${s.reason}`);
        })
      : Promise.resolve();

  // ══════════════════════════════════════════════════════════════════════════
  // Oracle knowledge tools (A1–A4)
  // ══════════════════════════════════════════════════════════════════════════

  if (hasNorms) server.registerTool(
    "get_ds_rules",
    {
      title: "Regras atômicas do gov.br DS (knowledge base)",
      description:
        "Regras do gov.br DS e e-MAG por query, context, filtro ou id. query/context: até 5 candidatas a investigar (aplicabilidade desconhecida; não é defeito nem conformidade), com texto da cláusula, o que medir (toVerify), evidência, lacunas (gaps) e piso de relevância. component é pista (globais continuam; 'global' = só globais). Sem query: catálogo em ordem da base. Continue pelo cursor devolvido ou pelo id.",
      inputSchema: strictInput("get_ds_rules", {
        context: z
          .object({
            components: z
              .array(z.string().min(1).max(60))
              .max(36)
              .optional()
              .describe("Componentes observados (id, br-<id> ou nome da página oficial), ex.: coverage.componentsFound"),
            regions: z
              .array(z.enum(PAGE_REGIONS as [PageRegion, ...PageRegion[]]))
              .max(PAGE_REGIONS.length)
              .optional()
              .describe("Regiões do Template Base observadas"),
            terms: z
              .array(z.string().min(3).max(60))
              .max(10)
              .optional()
              .describe("Termos do estado observado"),
          })
          .strict()
          .optional()
          .describe("Contexto observado → candidatas. Combina com force/category/validationStrategy/standard/query; não com component/id/ids"),
        id: z.string().max(200).optional().describe("Id exato (govbr-3.7.0-…): o registro completo"),
        ids: z
          .array(z.string().max(200))
          .min(1)
          .max(20)
          .optional()
          .describe("Ids exatos em lote (cartões)"),
        component: z.string().max(60).optional().describe("Componente: id, br-<id> ou nome da página oficial ('button', 'br-modal', 'Paginação'); desconhecido = erro com sugestões"),
        category: z
          .enum(["accessibility", "component", "development", "foundation", "page", "pattern", "template"])
          .optional(),
        force: z
          .enum(["required", "prohibited", "recommended", "discouraged", "permitted", "informative", "unclear"])
          .optional()
          .describe("Força normativa (exemplos: include_evidence)"),
        validationStrategy: z
          .enum([
            "dom",
            "semantic",
            "computed-style",
            "keyboard-interaction",
            "source-code",
            "manual",
            "visual",
            "accessibility-tree",
            "responsive-viewport",
          ])
          .optional()
          .describe("Mecanismo de verificação exigido pela regra"),
        automatable: z.boolean().optional(),
        automationConfidence: z.enum(["high", "medium", "low"]).optional(),
        severitySuggestion: z
          .enum(["critical", "serious", "moderate", "minor", "informational"])
          .optional(),
        standard: z.enum(["gov.br Design System", "eMAG"]).optional(),
        query: z
          .string()
          .max(2000)
          .optional()
          .describe("Observação em texto livre (até 500 caracteres), busca por relevância"),
        match: z
          .enum(["relevance", "literal"])
          .optional()
          .describe("'literal': query como substring exata e component como filtro exato (2.16.1)"),
        vocabulary: z
          .boolean()
          .optional()
          .describe("Expansões de vocabulário versionadas (padrão ligado)"),
        retrieval: z
          .enum(["hybrid", "lexical", "dense"])
          .optional()
          .describe("Motor da query: 'lexical' (padrão), 'hybrid' (léxica + vetorial local: um pouco mais de acertos, menos precisão) ou 'dense' (só vetorial, medição)"),
        include_evidence: z
          .boolean()
          .optional()
          .describe("Anexar fragmentos canônicos (force=example) em 'evidence'"),
        detail: z
          .enum(["summary", "brief", "full", "index"])
          .optional()
          .describe("Listagem: 'index' (padrão) | 'brief' | 'full'. ids: cartões (padrão) | 'index' | 'full'. Sem efeito em query/context"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Por página: query/context 5 (teto 10); listagem 20 (teto 50). Resposta ≤ 8.000 caracteres; o resto pelo cursor"),
        offset: z.number().int().min(0).optional().describe("Obsoleto (aceito até a 4.0.0, com aviso): use cursor"),
        cursor: z.string().max(40).optional().describe("page.cursor devolvido; repita os mesmos parâmetros"),
        clauseCursor: z.number().int().min(0).optional().describe("Com id: nextClauseCursor devolvido"),
      }),
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_ds_rules", async (args) => {
      // 3.0.0: o contrato oraculo-resposta/1.0.0. match:"literal" = a superfície da 2.17.1, byte a byte.
      if (args.match !== "literal") return getDsRules(args, { brief: briefRule, full: projectRule });
      if (args.cursor !== undefined || args.clauseCursor !== undefined || args.detail === "index" || args.retrieval !== undefined) {
        return fail({
          error: "match:'literal' é o caminho da 2.x: não aceita cursor, clauseCursor, detail:'index' nem retrieval. Pagine com offset.",
          errorCode: "invalid-combination",
          field: "match",
          next: [step("request-detail", "repita sem match:'literal' para o contrato 3.0.0", null)],
        });
      }
      const { id, ids, context, include_evidence, limit, offset, match, vocabulary, cursor: _cursor, clauseCursor: _clause, retrieval: _retrieval, detail: rawDetail, ...rawFilter } = args;
      const detail = rawDetail as "summary" | "brief" | "full" | undefined;
      const kb = getKnowledgeBase();
      const search: SearchOptions = { match, vocabulary };
      if (id && ids) return json({ error: "Informe id ou ids, não ambos." });
      if (context && (id || ids)) return json({ error: "context não se combina com id/ids: peça os ids depois, em lote." });
      if (context && rawFilter.component !== undefined) {
        return json({ error: "context não se combina com component: informe os componentes em context.components." });
      }
      // Filtros legados exatamente como na 2.8.0 com match:"literal"; sem ele, variantes nominais em component (2.17.0).
      const filter: RuleFilter = { ...rawFilter };
      // 2.17.0: a relevance query is bounded and must carry content words (actionable errors).
      if (match !== "literal" && filter.query?.trim()) {
        const problem = queryProblem(filter.query);
        if (problem) return json(problem);
      }
      if (context) {
        const hasContext = Boolean(context.components?.length || context.regions?.length || context.terms?.length);
        if (!hasContext) return json({ error: "context vazio: informe components, regions ou terms." });
        const answer = contextResponse(context, filter, { detail: detail ?? "summary", limit, offset }, search);
        return json(answer.total === 0 ? { ...answer, absenceNote: ABSENCE_NOTE } : answer);
      }
      if (id) {
        const rule = getRuleById(id);
        if (!rule) return json({ error: `Regra '${id}' não encontrada no knowledge base.`, absenceNote: ABSENCE_NOTE });
        return json({
          kind: rule.legacy ? "historical" : NORMATIVE_FORCES.includes(rule.force as RuleForce) ? "normative" : "evidence",
          rule,
          normativeContext: normativeUnit(rule),
          legacyResolution: legacyResolution(rule),
        });
      }
      if (ids) {
        const found = ids.map((ruleId) => getRuleById(ruleId)).filter((rule): rule is KnowledgeRule => Boolean(rule));
        const foundIds = new Set(found.map((rule) => rule.id));
        const project = detail === "full" ? projectRule : briefRule;
        return json({
          requested: ids.length,
          count: found.length,
          detail: detail === "full" ? "full" : "brief",
          missing: ids.filter((ruleId) => !foundIds.has(ruleId)),
          rules: found.map((rule) => ({
            kind: rule.legacy ? "historical" : NORMATIVE_FORCES.includes(rule.force as RuleForce) ? "normative" : "evidence",
            ...project(rule),
            ...(detail === "full" ? { normativeContext: boundedNormativeUnit(rule, IDS_FULL_UNIT_MAX_CHARS) } : {}),
          })),
          ...(found.some((rule) => normativeUnit(rule)) ? { normativeContextNote: LIST_CONTEXT_NOTE } : {}),
          ...(found.length < ids.length ? { absenceNote: ABSENCE_NOTE } : {}),
        });
      }

      // 2.17.0 (B-05): `component` goes through the same name resolver as context.components
      // (id, br-<id>, official page name); an unknown name is an input error with suggestions, not
      // "0 rules". match:"literal" keeps the 2.16.1 exact-id filter.
      if (match !== "literal" && filter.component !== undefined) {
        const resolved = resolveComponentName(filter.component);
        if (!resolved) return json(unknownComponentError(filter.component));
        filter.component = resolved;
      }

      // 2.17.0 (NAT-97): query = relevance (one engine with context). match:"literal" keeps the
      // 2.16.1 substring path below byte for byte. A whitespace-only query has no terms: listing.
      if (match !== "literal" && filter.query?.trim()) {
        return json(relevanceResponse(filter, { detail, limit, offset, include_evidence }, vocabulary));
      }

      // 2.9.0: limit/offset explícitos são pedido de listagem. Até a 2.8.0 eles eram retirados do
      // filtro antes deste teste e a chamada só com paginação caía no índice, contrariando a nota.
      const semFiltro =
        Object.values(filter).every(v => v === undefined) && limit === undefined && offset === undefined;
      const rules = filterRules(filter);

      // Sem nenhum filtro, devolver a KB inteira custava ~35 mil tokens por chamada. Devolve-se o
      // índice de facetas (~320) e as dimensões pelas quais estreitar. Mesmo desenho que
      // get_page_rules e get_design_tokens já usavam — o get_ds_rules é que destoava (D-26).
      if (semFiltro) {
        return json({
          meta: { dsVersion: kb.meta.dsVersion, knowledgeVersion: kb.meta.knowledgeVersion, totalNormative: kb.meta.normativeRules },
          note:
            "Índice, não listagem: chamar sem filtro devolveria a base normativa inteira. Estreite por " +
            "component, category, force, validationStrategy ou query — ou peça uma regra por id. " +
            "Para paginar a base inteira mesmo assim, passe limit/offset explicitamente.",
          total: rules.length,
          facets: ruleFacets(rules),
        });
      }

      const take = limit ?? 40;
      const skip = offset ?? 0;
      const page = rules.slice(skip, skip + take);
      const project = detail === "full" ? projectRule : briefRule;

      const response: Record<string, unknown> = {
        meta: { dsVersion: kb.meta.dsVersion, knowledgeVersion: kb.meta.knowledgeVersion, totalNormative: kb.meta.normativeRules },
        total: rules.length,
        offset: skip,
        count: page.length,
        detail: detail === "full" ? "full" : "brief",
        rules: page.map(project),
      };
      if (page.some((rule) => normativeUnit(rule))) response.normativeContextNote = LIST_CONTEXT_NOTE;
      if (rules.length === 0) response.absenceNote = ABSENCE_NOTE;
      if (skip + page.length < rules.length) {
        response.more = {
          remaining: rules.length - (skip + page.length),
          nextOffset: skip + page.length,
          note: "Peça a próxima página com o mesmo filtro e offset=nextOffset.",
        };
      }
      if (detail !== "full") {
        response.detailNote =
          "Projeção mínima. Para evidência esperada, condições, exceções, referências cruzadas e " +
          "proveniência, peça a regra por id ou repita com detail='full'.";
      }
      if (include_evidence) {
        const evidence = getEvidence(filter.component);
        response.evidence = {
          note: "Fragmentos canônicos do @govbr-ds/core — evidência de implementação, NÃO normas. Não sobrepõem regras required/prohibited.",
          count: evidence.length,
          items: evidence.map(project),
        };
      }
      return json(response);
    })
  );

  if (hasNorms) server.registerTool(
    "get_design_tokens",
    {
      title: "Design tokens do gov.br DS",
      description:
        "Consulta tokens do gov.br DS por nome. Sem filtro, retorna apenas destaques semânticos e o índice reverso de cores.",
      inputSchema: strictInput("get_design_tokens", {
        query: z.string().max(200).optional().describe("Fragmento de nome para filtrar (omitir para destaques semânticos + índice hex)"),
        hex: z.string().max(20).optional().describe("Cor medida (#rgb, #rrggbb, rgb()/rgba(…,1)): os tokens com esse valor"),
        cursor: z.string().max(40).optional().describe("Continuação devolvida em page.cursor (mesmos parâmetros)"),
      }),
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_design_tokens", async ({ query, hex, cursor }) => {
      const registry = getTokenRegistry();
      const args = { ...(query !== undefined ? { query } : {}), ...(hex !== undefined ? { hex } : {}) };
      // 3.3.0 (N-03, N-13, N-20, B-02): hex normalizado (#fff, rgb(), rgba(…,1)); o que não é cor é erro.
      if (hex !== undefined || (query !== undefined && looksLikeColor(query))) {
        if (hex !== undefined && query !== undefined) {
          return fail({ error: "Informe hex ou query, não ambos.", errorCode: "invalid-combination", field: "query", next: [step("request-detail", "o valor da cor, sozinho", "get_design_tokens", { hex })] });
        }
        if (hex !== undefined && cursor !== undefined) {
          return fail({ error: "hex não tem continuação: a resposta é uma só.", errorCode: "invalid-combination", field: "cursor", next: [step("request-detail", "o valor da cor, sem cursor", "get_design_tokens", { hex })] });
        }
        const given = (hex ?? query)!;
        const parsed = parseColor(given);
        if (!parsed.ok) {
          return fail({
            error: parsed.reason === "translucent"
              ? `'${clip(given, 40)}' tem alfa ${parsed.alpha} (< 1): a cor vista depende do fundo; o registro guarda cores opacas.`
              : `'${clip(given, 40)}' não é uma cor: use #rgb, #rrggbb, rrggbb, rgb(r, g, b) ou rgba(r, g, b, 1).`,
            errorCode: "invalid-argument",
            field: hex !== undefined ? "hex" : "query",
            next: [step("request-detail", "a cor medida (ex.: o valor de getComputedStyle)", "get_design_tokens", { hex: "#1351b4" })],
          });
        }
        const tokens = registry.hexLookup[parsed.hex] ?? [];
        return ok({
          contract: CONTRACT,
          kind: "tokens",
          hex: parsed.hex,
          ...(parsed.hex !== given.trim().toLowerCase() ? { given: clip(given, 40) } : {}),
          ...(hex === undefined ? { queryNote: "query é um valor de cor: resolvido como hex (use hex)." } : {}),
          count: tokens.length,
          tokens,
          ...(tokens.length ? {} : { absenceNote: ABSENCE_NOTE, note: "Nenhum token do registro tem este valor; isto descreve o registro, não a página." }),
        });
      }
      // Revisão da 3.0.0 (M3): índice reverso e lista filtrada no orçamento, com cursor.
      const keyOf = cursorKey({ tool: "get_design_tokens", args, version: registry.meta });
      const start = cursor !== undefined ? decodeCursor(cursor, keyOf) : 0;
      if (start === null) return staleCursorError("get_design_tokens", args);
      const entries: Array<[string, unknown]> = query
        ? Object.entries(registry.all).filter(([k]) => k.toLowerCase().includes(query.toLowerCase()))
        : Object.entries(registry.hexLookup);
      const first = start === 0;
      if (query && entries.length === 0) {
        return ok({
          contract: CONTRACT,
          kind: "tokens",
          query,
          count: 0,
          tokens: {},
          absenceNote: ABSENCE_NOTE,
          next: [step("request-detail", "para saber se um valor é token, use hex com a cor medida", "get_design_tokens", { hex: "#1351b4" })],
        });
      }
      return ok(
        budgetPage(entries, start, (page, next) => ({
          contract: CONTRACT,
          kind: "tokens",
          ...(query ? { query, count: entries.length, tokens: Object.fromEntries(page) } : {}),
          ...(!query && first ? { meta: registry.meta, semantic: registry.semantic } : {}),
          ...(!query ? { hexLookup: Object.fromEntries(page), hexTotal: entries.length } : {}),
          page: {
            returned: page.length,
            offset: Math.min(start, entries.length),
            total: entries.length,
            cursor: next !== null ? encodeCursor(next, keyOf) : null,
            note: next !== null ? MESSAGES.continuation : MESSAGES["page-end"],
          },
          ...(next !== null ? { next: [step("request-detail", "próxima página", "get_design_tokens", { ...args, cursor: encodeCursor(next, keyOf) })] } : {}),
        })),
      );
    })
  );

  if (hasNorms) server.registerTool(
    "get_emag_rules",
    {
      title: "Regras e-MAG 3.1",
      description:
        "Consulta recomendações do e-MAG por seção ou id. Sem filtro, retorna somente o índice de seções.",
      inputSchema: strictInput("get_emag_rules", {
        section: z.number().int().min(1).max(6).optional().describe("Seção 1–6"),
        id: z.string().max(20).optional().describe("Id de regra específica, ex.: '4.1'"),
      }),
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_emag_rules", async ({ section, id }) => {
      const emag = getEmag();
      if (section !== undefined && id) {
        return fail({
          error: "Informe section ou id, não ambos.",
          errorCode: "invalid-combination",
          field: "id",
          next: [step("request-detail", "a recomendação pelo id", "get_emag_rules", { id })],
        });
      }
      if (id) {
        const rule = findEmagRule(id);
        if (!rule) {
          const sectionGuess = /^([1-6])\./.exec(id)?.[1];
          return fail({
            error: `Regra '${id}' não encontrada. Use section para listar ids válidos.`,
            errorCode: "unknown-id",
            field: "id",
            absenceNote: ABSENCE_NOTE,
            next: [
              sectionGuess
                ? step("request-detail", "os ids válidos da seção", "get_emag_rules", { section: Number(sectionGuess) })
                : step("request-detail", "o índice de seções", "get_emag_rules", {}),
            ],
          });
        }
        // KB enrichment (Phase 2.6): how to verify this recommendation.
        const template = getEmagValidationTemplate(id);
        // 3.3.0 (B-09, N-15): o template aponta para a cláusula corrente que obriga (não o id histórico nem o título).
        const templateCitation = template ? emagTemplateCitation(id, template.ruleId, getRuleById) : undefined;
        const units = emagUnits(id);
        const literalDescription = id === "3.9" && units.sourceContext;
        const description = literalDescription ? units.sourceContext!.text : rule.description;
        const response: Record<string, unknown> = {
          contract: CONTRACT,
          kind: "emag-recommendation",
          ...rule,
          description,
          ...(literalDescription ? {} : { descriptionKind: "project-paraphrase", paraphraseNote: EMAG_PARAPHRASE_NOTE }),
          normativeContext: units,
          ...(template && templateCitation
            ? { validationTemplate: { ...template, ruleId: templateCitation.id, ...(templateCitation.id !== template.ruleId ? { historicalRuleId: template.ruleId } : {}), citation: templateCitation } }
            : {}),
        };
        // Teto do contrato (§7.7): cláusulas que não cabem vão por id, inteiras, no get_ds_rules.
        if (textSize(response) > RESPONSE_BUDGET) {
          const clauses = [...units.clauses];
          const kept: typeof clauses = [];
          for (const clause of clauses) {
            const trial = { ...response, normativeContext: { ...units, clauses: [...kept, clause] } };
            if (kept.length && textSize(trial) > RESPONSE_BUDGET - 400) break;
            kept.push(clause);
          }
          const deferred = clauses.slice(kept.length).map((c) => c.id);
          response.normativeContext = {
            ...units,
            clauses: kept,
            ...(deferred.length
              ? { clausesDeferred: { count: deferred.length, note: MESSAGES["text-deferred"], next: { tool: "get_ds_rules", arguments: { ids: deferred.slice(0, 10) } } } }
              : {}),
          };
        }
        return ok(response);
      }
      if (section) {
        const found = Object.hasOwn(emag.sections, String(section)) ? emag.sections[String(section)] : undefined;
        if (!found) {
          return fail({
            error: `Seção ${section} não encontrada.`,
            errorCode: "unknown-section",
            field: "section",
            absenceNote: ABSENCE_NOTE,
            next: [step("request-detail", "o índice de seções", "get_emag_rules", {})],
          });
        }
        return ok({
          contract: CONTRACT,
          kind: "emag-section",
          meta: emag.meta,
          paraphraseNote: EMAG_PARAPHRASE_NOTE,
          section: {
            ...found,
            rules: found.rules.map((rule) => {
              // 2.16.1: a listagem leva só a referência; a descrição contextual da 3.9 continua aqui.
              const units = emagUnits(rule.id);
              const ref = emagUnitsRef(rule.id);
              return {
                ...rule,
                ...(rule.id === "3.9" && units.sourceContext ? { description: units.sourceContext.text } : {}),
                more: { clauses: ref.clauses, sourceParagraph: ref.sourceParagraph, next: ref.next },
              };
            }),
          },
          note: "Listagem só com referência: a recomendação completa (cláusulas com forças próprias, parágrafo literal) vem por id, em more.next. Aplicabilidade desconhecida.",
        });
      }
      return ok({
        contract: CONTRACT,
        kind: "emag-index",
        meta: emag.meta,
        sections: Object.entries(emag.sections).map(([id, value]) => ({
          id,
          title: value.title,
          ruleCount: value.rules.length,
        })),
        note: "Índice compacto. Use section para listar regras ou id para buscar uma recomendação específica.",
      });
    })
  );

  if (hasNorms) server.registerTool(
    "get_page_rules",
    {
      title: "Diretrizes de página do gov.br DS",
      description:
        "Consulta diretrizes de página por categoria. Sem categoria, retorna o índice e as restrições citáveis de página (ds-page-header, ds-page-footer, ds-page-skip-link: regiões obrigatórias do Template Base e salto para o conteúdo), verificáveis pelo scan_page e pelo verify_finding.",
      inputSchema: strictInput("get_page_rules", {
        category: z
          .enum([
            "page_structure",
            "form_patterns",
            "navigation_patterns",
            "help_communication",
            "empty_states",
            "states",
            "grid",
            "writing_principles",
            "microcopy",
            "html_best_practices",
            "html_accessibility",
            "wai_aria",
            "minimum_standard",
          ])
          .optional(),
        cursor: z.string().max(40).optional().describe("Com category: continuação devolvida em page.cursor"),
      }),
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_page_rules", async ({ category, cursor }) => {
      const pageRules = getPageRules();
      // 3.3.0 (N-13): cursor sem category não continua nada — erro, não índice em silêncio.
      if (!category && cursor !== undefined) {
        return fail({ error: "cursor só vale com category (continuação das seções de uma categoria).", errorCode: "invalid-combination", field: "cursor", next: [step("request-detail", "o índice de categorias", "get_page_rules", {})] });
      }
      // 2.7.0: as restrições citáveis de página acompanham o índice e as categorias que as sustentam,
      // como as restrições estruturais acompanham get_component_spec (D-29).
      const constraints = pageConstraints();
      if (!category) {
        return ok({
          contract: CONTRACT,
          kind: "page-rules-index",
          meta: pageRules.meta,
          constraints,
          available: Object.entries(pageRules.categories).map(([key, { label, url }]) => ({ key, label, url })),
        });
      }
      const found = Object.hasOwn(pageRules.categories, category) ? pageRules.categories[category] : undefined;
      if (!found) {
        return fail({
          error: `Categoria '${category}' não encontrada.`,
          errorCode: "unknown-category",
          field: "category",
          next: [step("request-detail", "o índice de categorias", "get_page_rules", {})],
        });
      }
      // Revisão da 3.0.0 (M3): as seções da categoria no orçamento, com cursor.
      const keyOf = cursorKey({ tool: "get_page_rules", category, version: pageRules.meta });
      const start = cursor !== undefined ? decodeCursor(cursor, keyOf) : 0;
      if (start === null) return staleCursorError("get_page_rules", { category });
      const { sections: rawSections, ...rest } = found as unknown as { sections?: Record<string, unknown> } & Record<string, unknown>;
      // Cada seção é prosa markdown longa (até ~8.000): vira partes por parágrafo (≤ 3.000), inteiras.
      const sectionEntries: Array<{ section: string; part: number; text: string }> = [];
      for (const [section, value] of Object.entries(rawSections ?? {})) {
        const paragraphs = String(value).split(/\n\n+/);
        let part = "";
        let n = 0;
        for (const paragraph of paragraphs) {
          if (part && part.length + paragraph.length + 2 > 3_000) {
            sectionEntries.push({ section, part: n++, text: part });
            part = "";
          }
          part = part ? `${part}\n\n${paragraph}` : paragraph;
        }
        if (part) sectionEntries.push({ section, part: n, text: part });
      }
      const withConstraints = category === "page_structure" || category === "minimum_standard";
      return ok(
        budgetPage(sectionEntries, start, (page, next) => ({
          contract: CONTRACT,
          kind: "page-rules",
          ...rest,
          ...(withConstraints && start === 0 ? { constraints } : {}),
          parts: page,
          page: {
            returned: page.length,
            offset: Math.min(start, sectionEntries.length),
            total: sectionEntries.length,
            cursor: next !== null ? encodeCursor(next, keyOf) : null,
            note: next !== null ? MESSAGES.continuation : MESSAGES["page-end"],
          },
          ...(next !== null ? { next: [step("request-detail", "próximas seções", "get_page_rules", { category, cursor: encodeCursor(next, keyOf) })] } : {}),
        })),
      );
    })
  );

  if (toolProfile === "full") server.registerTool(
    "list_components",
    {
      title: "Componentes do gov.br DS",
      description: "Lista os componentes disponíveis no @govbr-ds/core instalado, com classe raiz e tags canônicas.",
      inputSchema: strictInput("list_components", {}),
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "list_components", async () => {
      const { meta, components } = getComponentSpecs();
      return ok({
        contract: CONTRACT,
        kind: "components",
        meta,
        components: Object.values(components).map(({ name, rootClass, tags, variantClasses }) => ({
          name,
          rootClass,
          tags,
          variantClasses,
        })),
      });
    })
  );

  if (hasNorms) server.registerTool(
    "get_component_spec",
    {
      title: "Especificação canônica de componente",
      description:
        "Consulta estrutura, variantes, atributos e tokens de um componente, as regras da base agrupadas por estratégia de verificação (com até 3 próximos passos) e o comportamento da implementação. Um exemplo HTML por chamada, opcional, que pode conter alertas conhecidos.",
      inputSchema: strictInput("get_component_spec", {
        component: z.string().max(60).describe("Nome do componente, ex.: 'button', 'input', 'select'"),
        include_examples: z
          .boolean()
          .optional()
          .describe("Incluir UM fragmento HTML canônico (o primeiro, ou o nomeado em example); os demais nomes vêm em availableExamples"),
        example: z.string().max(120).optional().describe("Nome de um exemplo em availableExamples: devolve só ele"),
      }),
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_component_spec", async ({ component, include_examples, example }) => {
      const specs = getComponentSpecs();
      const spec = Object.hasOwn(specs.components, component) ? specs.components[component] : undefined;
      if (!spec) {
        const resolved = resolveComponentName(component);
        const didYouMean = resolved && Object.hasOwn(specs.components, resolved) ? [resolved] : suggestComponentNames(component);
        return fail({
          error: `Componente '${component}' não encontrado.`,
          errorCode: "unknown-component",
          field: "component",
          ...(didYouMean.length ? { didYouMean } : {}),
          available: Object.keys(specs.components),
          absenceNote: ABSENCE_NOTE,
          next: didYouMean.length
            ? [step("request-detail", "repita com o id do componente", "get_component_spec", { component: didYouMean[0] })]
            : [step("request-detail", "escolha um nome em available e repita", null)],
        });
      }
      // Defect awareness (D-10/Phase 2.4): the canonical examples of some
      // components are themselves non-conformant — warn at spec-serving time.
      const defects = getComponentDefects(spec.name);
      // 3.0.0 (§9): as regras do componente por estratégia de verificação, com até 3 passos exatos
      // nas estratégias que exigem estado ou interação (ordem fixa, sem mapa por componente).
      const own = filterRules({ component: spec.name });
      const byStrategy: Record<string, number> = {};
      for (const r of own) byStrategy[r.validationStrategy] = (byStrategy[r.validationStrategy] ?? 0) + 1;
      const ruleNext = (["keyboard-interaction", "accessibility-tree", "semantic"] as const)
        .filter((s) => byStrategy[s])
        .map((validationStrategy) =>
          // 3.1.0: o modo context devolve cartões com citeAs (a listagem por component não traz), então
          // componente → cláusula citável leva 2 chamadas: get_component_spec → este passo.
          step("request-detail", `regras ${validationStrategy} do componente`, "get_ds_rules", { context: { components: [spec.name] }, validationStrategy, limit: 5 }),
        );
      const provenance = componentProvenance(spec.name) as {
        staticExample: { note: string };
        runtimeSource?: { kind: string; note?: string };
      };
      const runtimeNote = provenance.runtimeSource?.kind === "implementation-source-code" ? provenance.runtimeSource.note : undefined;
      const { examples, ...structure } = spec;
      const wanted = example ?? (include_examples ? examples[0]?.name : undefined);
      const chosen = wanted !== undefined ? examples.find((e) => e.name === wanted) : undefined;
      if (example !== undefined && !chosen) {
        return fail({
          error: `Exemplo '${example}' não existe em ${spec.name}.`,
          errorCode: "unknown-example",
          field: "example",
          availableExamples: examples.map((e) => e.name),
          next: examples.length
            ? [step("request-detail", "o primeiro exemplo disponível", "get_component_spec", { component: spec.name, example: examples[0].name })]
            : [step("request-detail", "este componente não tem exemplos", null)],
        });
      }
      // 3.0.0 (§7.8): um exemplo por chamada. Pedido por nome, a resposta é só o exemplo (cabe no teto).
      if (example !== undefined && chosen) {
        return ok({
          contract: CONTRACT,
          kind: "component-example",
          component: spec.name,
          example: chosen,
          warnings: defects.map((d) => ({
            type: d.type, severity: d.severity, file: d.file, element: d.element,
            note: "Defeito de acessibilidade no exemplo canônico oficial — não trate este fragmento como norma (veja govbr://knowledge/conflicts).",
          })),
          note: "Exemplo canônico do @govbr-ds/core: evidência de implementação, não norma.",
          availableExamples: examples.map((e) => e.name),
          absenceNote: ABSENCE_NOTE,
        });
      }
      const response: Record<string, unknown> = {
        contract: CONTRACT,
        kind: "component-spec",
        ...structure,
        implementationEvidence: componentProvenance(spec.name),
        constraints: constraintsForComponent(spec),
        rules: {
          retrieval: "automatic",
          total: own.length,
          byStrategy,
          note: "Regras do componente, candidatas e não defeitos.",
          next: ruleNext.slice(0, 3),
        },
        ...(runtimeNote ? { runtime: { text: runtimeNote, code: "implementation", message: MESSAGES.implementation, state: "after-interaction" } } : {}),
        gaps: [{ kind: "state-not-covered", about: "atributos escritos em tempo de execução", message: provenance.staticExample.note }],
        warnings: defects.map((d) => ({
          type: d.type,
          severity: d.severity,
          file: d.file,
          element: d.element,
          evidence: d.evidence,
          note: "Defeito de acessibilidade no exemplo canônico oficial — não trate este fragmento como norma (veja govbr://knowledge/conflicts).",
        })),
        ...(chosen ? { example: chosen } : {}),
        availableExamples: examples.map((e) => e.name),
        ...(chosen
          ? {}
          : examples.length
            ? { exampleNext: { tool: "get_component_spec", arguments: { component: spec.name, example: examples[0].name } } }
            : {}),
        // 2.15.0: a especificação é extraída dos exemplos estáticos; atributo, regra ou estado que ela
        // não lista (ex.: ARIA escrito em tempo de execução) não é prova de conformidade.
        absenceNote: ABSENCE_NOTE,
      };
      if (chosen && textSize(response) > RESPONSE_BUDGET) {
        response.example = {
          name: chosen.name,
          status: "deferred",
          note: "O exemplo não coube junto com a especificação; peça-o sozinho pelo nome.",
          next: { tool: "get_component_spec", arguments: { component: spec.name, example: chosen.name } },
        };
      }
      return ok(response);
    })
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Evidence tool (C5 phase 1)
  // ══════════════════════════════════════════════════════════════════════════

  if (hasEvidence) server.registerTool(
    "inspect_computed_styles",
    {
      title: "Inspecionar estilos computados",
      description:
        "Coleta estilos computados, foco e evidência estrutural sem julgar. Agrupe alvos em selectors e peça somente as properties necessárias; omiti-las mantém a resposta completa legada.",
      inputSchema: strictInput("inspect_computed_styles", {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS único (compatibilidade)"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Seletores CSS avaliados no mesmo carregamento"),
        properties: z
          .array(StylePropertySchema)
          .max(STYLE_PROPERTIES.length)
          .optional()
          .describe("Somente propriedades necessárias; omitir mantém o contrato completo legado"),
        cursor: z.number().int().min(0).optional().describe("Continuação devolvida em nextCursor (repete a coleta na mesma página e devolve os elementos seguintes)"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(telemetry, "inspect_computed_styles", async ({ url, selector, selectors, properties, cursor }) => {
      // Revisão da 3.0.0 (M3): elementos no orçamento de 8.000, em ordem do DOM, com continuação.
      const { elements, ...evidence } = await inspectComputedStyles(url, selectorBatch(selector, selectors), properties);
      const args = { url, ...(selector ? { selector } : {}), ...(selectors ? { selectors } : {}), ...(properties ? { properties } : {}) };
      return ok(
        budgetPage(elements, cursor ?? 0, (page, next) => ({
          contract: CONTRACT,
          kind: "evidence",
          ...evidence,
          cursor: Math.min(cursor ?? 0, elements.length),
          returned: page.length,
          elements: page,
          ...(next !== null
            ? {
                nextCursor: next,
                next: step("request-detail", "próximos elementos (a coleta é repetida na mesma página)", "inspect_computed_styles", { ...args, cursor: next }),
              }
            : {}),
        })),
      );
    })
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Deterministic checkers (B1/B2) — findings come out in the D2 schema
  // ══════════════════════════════════════════════════════════════════════════

  /** 3.0.0: o orçamento do scan_page vale para a resposta inteira (padrão 8.000, §10). */
  const ScanMaxChars = z
    .number()
    .int()
    .min(1_000)
    .max(100_000)
    .optional()
    .describe(
      knowledgeFree
        ? "Orçamento da resposta inteira em caracteres (padrão 8000): cabeçalho e checksRun entram na conta; as famílias ficam com o resto, com cursor"
        : "Orçamento da resposta inteira em caracteres (padrão 8000): cabeçalho, checksRun, investigate e observações entram na conta; as famílias ficam com o resto, com cursor",
    );

  /** Estado não alcançado: nada foi varrido; o próximo passo é reproduzir o estado. */
  function unreachedResponse(url: string, result: { status: string; limitation: unknown; state: unknown }) {
    return ok({
      contract: CONTRACT,
      kind: "scan",
      url,
      status: result.status,
      scanId: null,
      stateFingerprint: null,
      limitation: result.limitation,
      state: result.state,
      next: [step("reproduce-state", "corrija actions/arrival (limitation.detail diz o que falhou) e repita o scan", "scan_page")],
      absenceNote: knowledgeFree ? ABSENCE_NOTE_KNOWLEDGE_FREE : ABSENCE_NOTE,
    });
  }

  /** Regras do componente nas estratégias que nenhum check do scan mede (investigate.unmeasured). */
  const unmeasuredFor = (component: string) => {
    const out: Record<string, number> = {};
    for (const r of filterRules({ component })) {
      if (r.validationStrategy === "keyboard-interaction" || r.validationStrategy === "semantic") {
        out[r.validationStrategy] = (out[r.validationStrategy] ?? 0) + 1;
      }
    }
    return out;
  };

  /**
   * Revisão da 3.0.0 (H1/M3): os checkers isolados (perfil full) seguem o mesmo orçamento da resposta
   * inteira do scan_page: observações em bloco limitado com continuação, famílias com o resto,
   * absenceNote sempre.
   */
  function isolatedScan(
    fields: Record<string, unknown>,
    observations: Observation[],
    scanId: string,
    findings: Finding[],
    args: { view?: "findings" | "families"; detail?: FindingDetail; cursor?: number; limit?: number; maxChars?: number; memberLimit?: number },
  ) {
    const head = { contract: CONTRACT, kind: "scan", ...fields, absenceNote: ABSENCE_NOTE };
    return assembleScan(head, !args.cursor && observations.length ? observations : null, scanId, args.maxChars ?? SCAN_DEFAULT_MAX_CHARS, (budget) =>
      batchView(findings, null, { ...args, maxChars: budget }),
    );
  }

  if (hasDeterministic) server.registerTool(
    "scan_page",
    {
      title: "Varredura determinística agregada",
      description:
        "Carrega a página uma vez e executa tokens, estrutura, página (regiões obrigatórias do Template Base e salto para o conteúdo) e/ou axe no mesmo estado. Retorna fingerprint, cobertura, o que rodou e o que não rodou (checksRun), cache exato e findings compactos registrados no ledger da sessão, numa resposta de até ~8.000 caracteres. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: strictInput("scan_page", {
        url: z.string().describe("URL da página"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Escopos CSS combinados na mesma carga"),
        checks: z
          .array(z.enum(["tokens", "structure", "axe", "page"]))
          .min(1)
          .max(4)
          .optional()
          .describe("Checks agregados (padrão: todos)"),
        tokenChecks: z
          .array(z.enum(["color", "font", "radius", "spacing"]))
          .min(1)
          .max(4)
          .optional()
          .describe("Subchecks de tokens quando tokens estiver habilitado"),
        components: z.array(z.string()).min(1).max(36).optional().describe("Componentes estruturais a validar"),
        actions: PageActionsSchema
          .optional()
          .describe("Ações reproduzidas nesta mesma página antes do fingerprint e da varredura. click/fill/press com seletor exigem exatamente um elemento: zero ou mais de um interrompem a receita e o estado fica não alcançado"),
        arrival: ArrivalSchema
          .optional()
          .describe("Condições que mostram que o estado pedido foi alcançado (caminho, diálogo aberto, erro visível, controle expandido, foco, elemento visível); não satisfeitas, nada é varrido"),
        compareToScanId: z
          .string()
          .optional()
          .describe("Scan anterior da sessão; devolve diff de fingerprint e findings após a nova varredura"),
        ...FindingPageInputShape,
        maxChars: ScanMaxChars,
        ...FamilyViewInputShape,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "scan_page",
      async ({ url, selectors, checks, tokenChecks, components, actions, arrival, compareToScanId, detail, cursor, limit, maxChars, view, memberLimit }) => {
        const previousFindings = compareToScanId ? findingStore.getBatch(compareToScanId) : undefined;
        const previousLedger = compareToScanId ? findingStore.getBatchMetadata(compareToScanId) : undefined;
        if (compareToScanId && !previousFindings) {
          return sessionFailure(`compareToScanId '${compareToScanId}' não existe nesta sessão MCP.`, "unknown-scan", "compareToScanId");
        }
        const result = await scanPage(
          { url, selectors, checks, tokenChecks, components, actions, ...(arrival ? { arrival } : {}) },
          pageScanCache
        );
        // 2.10.0: estado não alcançado não vira lote — sem scanId, sem findings, sem cobertura; zero
        // achados aqui seria lido como "sem defeito" num estado que ninguém viu.
        if (result.status === "state-not-reached") return unreachedResponse(url, result);
        const scanId = findingStore.putBatch("page", result.findings, {
          stateFingerprint: result.stateFingerprint,
          cacheHit: result.cacheHit,
          ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
          coverage: result.coverage,
          state: result.state,
        });
        observationStore.set(scanId, result.observations);
        const stateDiff = compareToScanId && previousFindings
          ? {
              previousScanId: compareToScanId,
              previousFingerprint: previousLedger?.stateFingerprint ?? null,
              currentFingerprint: result.stateFingerprint,
              stateChanged: previousLedger?.stateFingerprint !== result.stateFingerprint,
              findings: diffSummary(recordDiff(scanId, compareToScanId, previousFindings, result.findings), scanId),
              elementsInspectedDelta:
                typeof (previousLedger?.coverage as { elementsInspected?: unknown } | undefined)?.elementsInspected === "number"
                  ? result.coverage.elementsInspected -
                    Number((previousLedger?.coverage as { elementsInspected: number }).elementsInspected)
                  : null,
            }
          : undefined;
        const summary = summarize(result.findings);
        const first = !cursor;
        // §10 + §15.8: investigate na ordem do DOM (coverage.componentsFound não é ordenado), 1ª página.
        const investigate = hasNorms && first ? investigateFor(result.coverage.componentsFound ?? [], scanId, unmeasuredFor) : undefined;
        const head = {
          contract: CONTRACT,
          kind: "scan",
          url,
          status: result.status,
          scanId,
          stateFingerprint: result.stateFingerprint,
          state: result.state,
          cacheHit: result.cacheHit,
          ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
          coverage: result.coverage,
          checksRun: checksRunFor(
            { url, selectors, checks, tokenChecks, components, actions, ...(arrival ? { arrival } : {}) },
            result.coverage,
            result.state.observed.viewport,
            false,
          ),
          summary,
          deduplication: result.deduplication,
          ...(stateDiff ? { stateDiff } : {}),
          ...(investigate ? { investigate } : {}),
          // S-09: zero achados (ou poucos) nunca é conformidade.
          absenceNote: ABSENCE_NOTE,
        };
        return ok(
          assembleScan(head, first ? result.observations : null, scanId, maxChars ?? SCAN_DEFAULT_MAX_CHARS, (budget) =>
            batchView(result.findings, result.stateFingerprint, { view, detail, cursor, limit, maxChars: budget, memberLimit }),
            { firstScanPage: first },
          ),
        );
      }
    )
  );

  if (knowledgeFree) server.registerTool(
    "scan_page",
    {
      title: "Varredura determinística (axe-core)",
      description:
        "Carrega a página uma vez e executa o axe-core no estado reproduzido. Retorna fingerprint, cobertura, o que rodou (checksRun), cache exato e findings compactos registrados no ledger da sessão, numa resposta de até ~8.000 caracteres. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: strictInput("scan_page", {
        url: z.string().describe("URL da página"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Escopos CSS combinados na mesma carga"),
        actions: PageActionsSchema
          .optional()
          .describe("Ações reproduzidas nesta mesma página antes do fingerprint e da varredura. click/fill/press com seletor exigem exatamente um elemento: zero ou mais de um interrompem a receita e o estado fica não alcançado"),
        arrival: ArrivalSchema
          .optional()
          .describe("Condições que mostram que o estado pedido foi alcançado (caminho, diálogo aberto, erro visível, controle expandido, foco, elemento visível); não satisfeitas, nada é varrido"),
        compareToScanId: z
          .string()
          .optional()
          .describe("Scan anterior da sessão; devolve diff de fingerprint e findings após a nova varredura"),
        ...FindingPageInputShape,
        maxChars: ScanMaxChars,
        ...FamilyViewInputShape,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    tool("scan_page", async ({ url, selectors, actions, arrival, compareToScanId, detail, cursor, limit, maxChars, view, memberLimit }) => {
      const previousFindings = compareToScanId ? findingStore.getBatch(compareToScanId) : undefined;
      const previousLedger = compareToScanId ? findingStore.getBatchMetadata(compareToScanId) : undefined;
      if (compareToScanId && !previousFindings) {
        return sessionFailure(`compareToScanId '${compareToScanId}' não existe nesta sessão MCP.`, "unknown-scan", "compareToScanId");
      }
      const result = await scanPage(
        { url, selectors, actions, ...(arrival ? { arrival } : {}) },
        pageScanCache,
        { knowledgeFree: true }
      );
      if (result.status === "state-not-reached") return unreachedResponse(url, result);
      const scanId = findingStore.putBatch("page", result.findings, {
        stateFingerprint: result.stateFingerprint,
        cacheHit: result.cacheHit,
        ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
        coverage: result.coverage,
        state: result.state,
      });
      const stateDiff = compareToScanId && previousFindings
        ? {
            previousScanId: compareToScanId,
            previousFingerprint: previousLedger?.stateFingerprint ?? null,
            currentFingerprint: result.stateFingerprint,
            stateChanged: previousLedger?.stateFingerprint !== result.stateFingerprint,
            findings: diffSummary(recordDiff(scanId, compareToScanId, previousFindings, result.findings), scanId),
          }
        : undefined;
      const head = {
        contract: CONTRACT,
        kind: "scan",
        url,
        status: result.status,
        scanId,
        stateFingerprint: result.stateFingerprint,
        state: result.state,
        cacheHit: result.cacheHit,
        ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
        coverage: result.coverage,
        checksRun: checksRunFor({ url, selectors, actions, ...(arrival ? { arrival } : {}) }, result.coverage, result.state.observed.viewport, true),
        summary: summarize(result.findings),
        deduplication: result.deduplication,
        ...(stateDiff ? { stateDiff } : {}),
        absenceNote: ABSENCE_NOTE_KNOWLEDGE_FREE,
      };
      return ok(
        assembleScan(head, null, scanId, maxChars ?? SCAN_DEFAULT_MAX_CHARS, (budget) =>
          batchView(result.findings, result.stateFingerprint, { view, detail, cursor, limit, maxChars: budget, memberLimit }),
          { firstScanPage: !cursor },
        ),
      );
    })
  );

  if (toolProfile === "full") server.registerTool(
    "check_token_compliance",
    {
      title: "Verificação determinística de tokens",
      description:
        "Compara cores, tipografia, raios e espaçamento computados com o registro de tokens. Retorna referências compactas por padrão; use get_finding_details para evidência ou objetos Finding completos. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: strictInput("check_token_compliance", {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS único (compatibilidade)"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Seletores CSS verificados no mesmo carregamento"),
        checks: z
          .array(z.enum(["color", "font", "radius", "spacing"]))
          .optional()
          .describe("Subconjunto de verificações (padrão: todas)"),
        ...FindingPageInputShape,
        maxChars: ScanMaxChars,
        ...FamilyViewInputShape,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "check_token_compliance",
      async ({ url, selector, selectors, checks, detail, cursor, limit, maxChars, view, memberLimit }) => {
        const activeChecks = checks ?? ALL_TOKEN_CHECKS;
        const evidence = await inspectComputedStyles(
          url,
          selectorBatch(selector, selectors),
          tokenProperties(activeChecks)
        );
        const rawFindings = checkTokenCompliance({ url }, evidence.elements, getTokenRegistry(), activeChecks);
        const observations = activeChecks.includes("font")
          ? collectTokenObservations({ url }, evidence.elements, getTokenRegistry())
          : [];
        const deduplication = deduplicateFindings(rawFindings);
        const findings = deduplication.findings;
        const scanId = findingStore.putBatch("tokens", findings);
        observationStore.set(scanId, observations);
        return ok(isolatedScan(
          {
            url,
            scanId,
            elementsInspected: evidence.count,
            summary: summarize(findings),
            deduplication: {
              input: deduplication.inputCount,
              output: deduplication.outputCount,
              merged: deduplication.merged,
              key: deduplication.key,
            },
          },
          observations, scanId, findings, { view, detail, cursor, limit, maxChars, memberLimit },
        ));
      }
    )
  );

  if (toolProfile === "full") server.registerTool(
    "check_component_structure",
    {
      title: "Verificação determinística de estrutura",
      description:
        "Compara elementos br-* com tags, variantes e requisitos de nome acessível da especificação canônica. Retorna referências compactas por padrão; detalhe completo é recuperado por id. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: strictInput("check_component_structure", {
        url: z.string().describe("URL da página"),
        component: z
          .string()
          .optional()
          .describe("Componente específico (ex.: 'button'). Omitir para validar todos os br-* presentes."),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Seletores CSS verificados no mesmo carregamento"),
        ...FindingPageInputShape,
        maxChars: ScanMaxChars,
        ...FamilyViewInputShape,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "check_component_structure",
      async ({ url, component, selectors, detail, cursor, limit, maxChars, view, memberLimit }) => {
        const specs = getComponentSpecs().components;
        if (component !== undefined && !Object.hasOwn(specs, component)) return unknownComponentFailure(component, "check_component_structure", { url });
        const targets = component ? [component] : Object.keys(specs);
        const selector = selectors ?? (component ? `.br-${component}` : "[class*='br-']");
        const evidence = await inspectComputedStyles(url, selector, []);

        const rawFindings = targets.flatMap((name) => {
          const spec = specs[name];
          if (!spec) return [];
          return checkComponentStructure({ url }, evidence.elements, spec);
        });
        // Canal separado, fora da pontuação (D-27): o que se observa mas não se pode afirmar.
        const observations = targets.flatMap((name) => {
          const spec = specs[name];
          if (!spec) return [];
          return collectStructureObservations({ url }, evidence.elements, spec);
        });

        const deduplication = deduplicateFindings(rawFindings);
        const findings = deduplication.findings;
        const componentsFound = [
          ...new Set(
            evidence.elements.flatMap((el) => el.classes.filter((c) => /^br-[a-z]+$/.test(c)).map((c) => c.slice(3)))
          ),
        ];

        const scanId = findingStore.putBatch("structure", findings);
        observationStore.set(scanId, observations);
        return ok(isolatedScan(
          {
            url,
            scanId,
            componentsFound,
            elementsInspected: evidence.count,
            summary: summarize(findings),
            deduplication: {
              input: deduplication.inputCount,
              output: deduplication.outputCount,
              merged: deduplication.merged,
              key: deduplication.key,
            },
          },
          observations, scanId, findings, { view, detail, cursor, limit, maxChars, memberLimit },
        ));
      }
    )
  );

  if (toolProfile === "full") server.registerTool(
    "run_axe_scan",
    {
      title: "Varredura axe-core",
      description:
        "Executa axe-core e cruza regras compatíveis com o e-MAG 3.1. Retorna referências compactas por padrão e preserva Findings completos para recuperação por id. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: strictInput("run_axe_scan", {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS único (compatibilidade)"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Subtrees avaliadas na mesma varredura"),
        ...FindingPageInputShape,
        maxChars: ScanMaxChars,
        ...FamilyViewInputShape,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "run_axe_scan",
      async ({ url, selector, selectors, detail, cursor, limit, maxChars, view, memberLimit }) => {
        const result = await runAxeScan(url, selectorBatch(selector, selectors)?.toString());
        const deduplication = deduplicateFindings(result.findings);
        const findings = deduplication.findings;
        const scanId = findingStore.putBatch("axe", findings);
        return ok(isolatedScan(
          {
            url,
            scanId,
            engine: result.engine,
            passes: result.passeCount,
            incomplete: result.incompleteCount,
            summary: summarize(findings),
            deduplication: {
              input: deduplication.inputCount,
              output: deduplication.outputCount,
              merged: deduplication.merged,
              key: deduplication.key,
            },
          },
          [], scanId, findings, { view, detail, cursor, limit, maxChars, memberLimit },
        ));
      }
    )
  );

  if (hasDeterministic || knowledgeFree) server.registerTool(
    "get_finding_details",
    {
      title: "Detalhes de findings já produzidos",
      description:
        "Recupera candidatos por ids ou continua uma página pelo scanId, sem executar novamente o scanner. Use full somente quando o objeto Finding completo for indispensável.",
      inputSchema: strictInput("get_finding_details", {
        ids: z.array(z.string()).min(1).max(50).optional().describe("Finding ids retornados nesta sessão MCP"),
        scanId: z.string().optional().describe("Id do lote retornado por um scanner; use com cursor para continuar sem repetir a varredura"),
        detail: FindingDetailSchema.optional().describe("summary, evidence (padrão para ids) ou full"),
        cursor: FindingPageInputShape.cursor,
        limit: FindingPageInputShape.limit,
        maxChars: z
          .number()
          .int()
          .min(1_000)
          .max(100_000)
          .optional()
          .describe("Orçamento da resposta inteira em caracteres (padrão 8000), cabeçalho e ledger incluídos; o resto vem por nextCursor"),
        view: (knowledgeFree ? z.enum(["findings", "families", "diff"]) : z.enum(["findings", "families", "observations", "diff"]))
          .optional()
          .describe(
            "families (padrão): agrupa instâncias idênticas (mesma norma, tipo, propriedade, estado e evidência) com contagem, " +
              "um exemplo, vereditos por membro e ids com cursor. findings: a página plana de findings. " +
              (knowledgeFree ? "" : "observations: as observações do scan (fora da pontuação), completas, por cursor. ") +
              "diff: as mudanças de findings de um scan com compareToScanId, por cursor. Só apresentação: contagens e lote não mudam"
          ),
        memberLimit: FamilyViewInputShape.memberLimit,
        familyId: z
          .string()
          .optional()
          .describe("Com scanId: pagina os membros de uma família (id, localizador, valor, assinatura, status individual); cursor=nextCursor percorre todos os ids"),
      }),
      annotations: { readOnlyHint: true },
    },
    tool(
      "get_finding_details",
      async ({ ids, scanId, detail, cursor, limit, maxChars, view, memberLimit, familyId }) => {
        if ((!ids && !scanId) || (ids && scanId)) {
          return fail({
            error: "Informe exatamente um de ids ou scanId.",
            errorCode: "invalid-combination",
            field: "scanId",
            next: [step("request-detail", "continue um lote pelo scanId devolvido pelo scan_page (com cursor), ou peça findings por ids", null)],
          });
        }
        if ((familyId || view !== undefined) && !scanId) {
          return fail({
            error: "familyId e view exigem scanId: a família é uma projeção de um lote.",
            errorCode: "invalid-combination",
            field: "familyId",
            next: [step("request-detail", "repita com o scanId do lote", null)],
          });
        }
        const batch = scanId ? findingStore.getBatch(scanId) : undefined;
        const ledger = scanId ? findingStore.getBatchMetadata(scanId) : undefined;
        if (scanId && !batch) return sessionFailure(`scanId '${scanId}' não existe nesta sessão MCP.`, "unknown-scan", "scanId");
        const stateFingerprint = typeof ledger?.stateFingerprint === "string" ? ledger.stateFingerprint : null;
        const budget = maxChars ?? RESPONSE_BUDGET;
        if (scanId && (view as string | undefined) === "observations") {
          return ok(observationPage(observationStore.get(scanId) ?? [], scanId, cursor ?? 0, budget));
        }
        if (scanId && (view as string | undefined) === "diff") {
          const stored = diffStore.get(scanId);
          if (!stored) {
            return fail({
              error: `scanId '${scanId}' não tem diff: o scan não foi feito com compareToScanId.`,
              errorCode: "invalid-argument",
              field: "view",
              next: [step("reproduce-state", "rode scan_page com compareToScanId e use o scanId devolvido", "scan_page")],
            });
          }
          return ok(diffPage(stored.diff, scanId, stored.previousScanId, cursor ?? 0, budget));
        }
        if (scanId && familyId) {
          // Revisão da 3.0.0: o orçamento conta a resposta inteira (os membros ficam com o resto).
          let memberBudget = budget - 300;
          let members = buildFamilyMemberPage(batch ?? [], familyId, { detail, cursor, limit, maxChars: memberBudget, stateFingerprint, verificationFor });
          for (let i = 0; members && i < 4 && textSize({ contract: CONTRACT, kind: "family-members", scanId, ...members }) > budget; i++) {
            memberBudget = Math.max(200, memberBudget - (textSize({ contract: CONTRACT, kind: "family-members", scanId, ...members }) - budget) - 100);
            members = buildFamilyMemberPage(batch ?? [], familyId, { detail, cursor, limit, maxChars: memberBudget, stateFingerprint, verificationFor });
          }
          if (!members) {
            return fail({
              error: `familyId '${familyId}' não existe no lote '${scanId}'.`,
              errorCode: "unknown-family",
              field: "familyId",
              next: [step("request-detail", "as famílias do lote", "get_finding_details", { scanId })],
            });
          }
          return ok({ contract: CONTRACT, kind: "family-members", scanId, ...members });
        }
        const { found, missing: missingAll } = ids ? findingStore.get(ids) : { found: batch ?? [], missing: [] };
        // 3.3.0 (N-01): ids ausentes ecoados com teto (≤ 20, cada um ≤ 80). O esquema não muda (o sha do
        // tools/list do knowledge-free fica fixo); scanId/familyId desconhecidos saem por fail(), que corta o eco.
        const missing = missingAll.slice(0, 20).map((id) => clip(id, 80));
        const familyView = view as "findings" | "families" | undefined;
        // Revisão da 3.0.0 (M3): o ledger (estado, cobertura) entra na conta do orçamento; na
        // continuação ele não se repete (já veio na 1ª página).
        const head = {
          contract: CONTRACT,
          kind: "finding-details",
          requested: ids?.length ?? found.length,
          ...(scanId ? { scanId } : {}),
          ...(ledger && !cursor ? { ledger } : {}),
          missing,
          ...(missingAll.length > missing.length ? { missingOmitted: missingAll.length - missing.length } : {}),
          ...(missing.length
            ? {
                missingNote:
                  "Ids de finding só valem na sessão MCP em que foram gerados; depois de um reinício, o mesmo id pode nomear outro achado. Rode scan_page nesta sessão.",
              }
            : {}),
        };
        return ok(
          assembleScan(head, null, scanId ?? "", budget, (pageBudget) =>
            scanId
              ? batchView(found, stateFingerprint, { view: familyView, detail: detail ?? "summary", cursor, limit, maxChars: pageBudget, memberLimit })
              : buildFindingPage(found, { detail: detail ?? "evidence", cursor, limit, maxChars: pageBudget }),
          ),
        );
      }
    )
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Verification gate (C3) and report (D2–D4)
  // ══════════════════════════════════════════════════════════════════════════

  if (hasCombinedGate || knowledgeFree) server.registerTool(
    "verify_finding",
    knowledgeFree ? {
      title: "Portão de verificação anti-alucinação",
      description:
        "Confere em separado: existência da regra citada (critérios WCAG 2.2 no registro público; regras do axe-core são do verificador embutido; outras fontes não são conferidas neste perfil), consistência dos dados estruturados (expectedCondition e campos da condição) e, com live, a violação por um predicado implementado em cada elemento do localizador, no estado reproduzido por actions ou pela receita do scanId. Dados estruturados ausentes ou sem predicado deixam o resultado unverifiable; dados contraditórios rejeitam; confirmed exige a violação verificada. observed/expected em texto livre são explicações humanas e não são interpretados. O servidor guarda o resultado para este payload exato.",
      inputSchema: strictInput("verify_finding", {
        finding: FindingSchemaKnowledgeFree.describe("O achado candidato, no esquema Finding"),
        live: z.boolean().optional().describe("Reabrir a página e verificar cada elemento do localizador (padrão: false)"),
        actions: PageActionsSchema.optional().describe("Ações reproduzidas antes da verificação, quando o estado alegado depende de interação"),
        stateFingerprint: z.string().optional().describe("Fingerprint do estado alegado (de scan_page); se o estado reproduzido for outro, a alegação fica sem verificação (limitação)"),
        arrival: ArrivalSchema.optional().describe("Condições de chegada do estado alegado; não satisfeitas, a alegação fica sem verificação"),
        scanId: z
          .string()
          .optional()
          .describe("scan_page desta sessão cujo estado é o alegado: reaplica a receita gravada e exige a mesma URL, janela e fingerprint. Não envie actions/arrival/stateFingerprint junto"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    } : {
      title: "Portão de verificação anti-alucinação",
      description:
        "Confere em separado: existência da regra num registro versionado, aplicabilidade, consistência dos dados estruturados (property, observed/observedHex ou observedTag e expectedCondition) com cada elemento vivo e, com live, a violação por um predicado implementado em cada elemento do localizador, no estado reproduzido por actions. Dados estruturados ausentes ou sem predicado deixam o resultado unverifiable; dados contraditórios rejeitam; confirmed exige a violação verificada. observed/expected em texto livre são explicações humanas e não são interpretados. O servidor guarda o resultado para este payload exato.",
      inputSchema: strictInput("verify_finding", {
        finding: FindingSchema.describe("O achado candidato, no esquema Finding"),
        live: z.boolean().optional().describe("Reabrir a página e verificar cada elemento do localizador (padrão: false)"),
        actions: PageActionsSchema.optional().describe("Ações reproduzidas antes da verificação, quando o estado alegado depende de interação"),
        stateFingerprint: z.string().optional().describe("Fingerprint do estado alegado (de scan_page); se o estado reproduzido for outro, a alegação fica sem verificação (limitação)"),
        arrival: ArrivalSchema.optional().describe("Condições de chegada do estado alegado; não satisfeitas, a alegação fica sem verificação"),
        scanId: z
          .string()
          .optional()
          .describe("scan_page desta sessão cujo estado é o alegado: reaplica a receita gravada e exige a mesma URL, janela e fingerprint. Não envie actions/arrival/stateFingerprint junto"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    tool("verify_finding", async ({ finding, live, actions, stateFingerprint, arrival, scanId }) => {
      let scanState: Parameters<typeof verifyFinding>[0]["scanState"];
      if (scanId) {
        if (actions !== undefined || arrival !== undefined || stateFingerprint !== undefined) {
          return fail({
            error: "scanId já carrega a receita, as condições de chegada e o fingerprint do estado; não envie actions, arrival ou stateFingerprint junto.",
            errorCode: "invalid-combination",
            field: "scanId",
            next: [step("request-detail", "repita só com scanId (sem actions, arrival e stateFingerprint)", null)],
          });
        }
        const ledger = findingStore.getBatchMetadata(scanId);
        const state = ledger?.state as StateAttestation | undefined;
        if (!ledger) return sessionFailure(`scanId '${scanId}' não existe nesta sessão MCP.`, "unknown-scan", "scanId");
        if (!state || typeof ledger.stateFingerprint !== "string") {
          return fail({
            error: `scanId '${scanId}' não é de scan_page: não tem receita de estado.`,
            errorCode: "not-a-page-scan",
            field: "scanId",
            next: [step("reproduce-state", "cite o scanId de um scan_page desta sessão", "scan_page")],
          });
        }
        if (!sameScanPage(finding.element.page, state.recipe.url)) {
          return fail({
            error: `scanId '${scanId}' é de ${state.recipe.url}, mas o achado aponta para ${finding.element.page}: cite o scan da página do achado (barra final e fragmento não contam).`,
            errorCode: "scan-page-mismatch",
            field: "scanId",
            next: [step("reproduce-state", "rode scan_page na página do achado e cite o scanId devolvido", "scan_page", { url: finding.element.page })],
          });
        }
        scanState = {
          scanId,
          recipe: state.recipe,
          url: state.observed.url,
          viewport: { width: state.observed.viewport.width, height: state.observed.viewport.height },
          fingerprint: ledger.stateFingerprint,
        };
      }
      const verification = await verifyFinding({
        finding: finding as Finding,
        live: live ?? false,
        actions,
        stateFingerprint,
        arrival,
        scanState,
        ...(knowledgeFree ? { knowledgeFree: true } : {}),
      });
      const stored = verificationStore.record(finding, verification);
      // 2.15.0: veredito que não decide (sem predicado, regra sem norma, estado não reproduzido) não
      // desmente o fato medido — a nota fixa diz isso em todo `unverifiable`, nos dois perfis.
      // 3.0.0 (§11): campos de leitura ao lado do objeto verification, que continua inteiro.
      return ok(
        verificationEnvelope(finding as Finding, verification, {
          verificationId: stored.verificationId,
          knowledgeFree,
          ...(scanId ? { scanId } : {}),
          ...(verification.verdict === "unverifiable" ? { absenceNote: knowledgeFree ? ABSENCE_NOTE_KNOWLEDGE_FREE : ABSENCE_NOTE } : {}),
        }),
      );
    })
  );

  if (toolProfile === "full") server.registerTool(
    "save_report",
    {
      title: "Consolidar e persistir relatório",
      description:
        "Persiste o relatório validado. Reuse finding_ids dos scanners sem reenviar objetos completos; envie findings somente para achados criados pelo agente.",
      inputSchema: strictInput("save_report", {
        url: z.string().describe("URL da página validada"),
        finding_ids: z
          .array(z.string())
          .max(500)
          .optional()
          .describe("Ids determinísticos guardados nesta sessão; evita recuperar e reenviar Findings completos"),
        findings: z
          .array(z.record(z.unknown()))
          .optional()
          .describe("Achados criados pelo agente no esquema Finding (explícitos/heurísticos). O campo verification enviado é ignorado: vale a verificação guardada pelo servidor para o payload idêntico; explicit sem verificação fica em revisão."),
        notes: z.string().optional().describe("Notas gerais da validação (contexto, limitações desta rodada)"),
      }),
    },
    instrumentTool(telemetry, "save_report", async ({ url, finding_ids, findings, notes }) => {
      const stored = findingStore.get(finding_ids ?? []);
      if (stored.missing.length) {
        return sessionFailure("Alguns finding_ids não existem nesta sessão MCP; o relatório não foi salvo.", "missing-finding-ids", "finding_ids", {
          missingFindingIds: stored.missing,
        });
      }
      const { accepted, reviewItems, rejected } = validateFindings(findings ?? [], {
        serverFindings: stored.found,
        verificationFor: (finding) => verificationStore.lookup(finding)?.verification,
      });
      const report = buildReport(url, accepted, notes, reviewItems);
      const persisted = persistReport(report, reportsDir);
      return ok({
        contract: CONTRACT,
        kind: "report",
        summary: report.summary,
        accepted: accepted.length,
        reviewItems: reviewItems.length,
        rejected,
        jsonPath: persisted.jsonPath,
        markdownPath: persisted.markdownPath,
      });
    })
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Resources (A1) — the same knowledge, addressable by URI
  // ══════════════════════════════════════════════════════════════════════════

  if (hasNorms) server.registerResource(
    "knowledge-conflicts",
    "govbr://knowledge/conflicts",
    {
      title: "Contradições e defeitos observados (D-10)",
      description:
        "Conflitos do knowledge base: 6 anomalias de acessibilidade nos exemplos canônicos do próprio @govbr-ds/core (4 img sem alt, 2 aria-labelledby quebrados), arquivos no CDN legado e erros factuais da documentação. A implementação oficial é evidência, não oráculo.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(getKnowledgeConflicts(), null, 2) }],
    })
  );

  if (hasDeterministic || hasCombinedGate) server.registerResource(
    "finding-schema",
    "govbr://schema/finding",
    {
      title: "Esquema Finding (D2)",
      description: "JSON Schema do formato de achado aceito por save_report e verify_finding",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(zodToJsonSchema(FindingSchema, "Finding"), null, 2) }],
    })
  );

  if (hasNorms) server.registerResource(
    "tokens",
    "govbr://tokens",
    {
      title: "Registro de tokens",
      description: "Tokens semânticos + índice reverso hex→token do @govbr-ds/core",
      mimeType: "application/json",
    },
    async (uri) => {
      const { meta, semantic, hexLookup } = getTokenRegistry();
      return { contents: [{ uri: uri.href, text: JSON.stringify({ meta, semantic, hexLookup }, null, 2) }] };
    }
  );

  if (hasNorms) server.registerResource(
    "emag-section",
    new ResourceTemplate("govbr://emag/{section}", {
      list: async () => ({
        resources: Object.entries(getEmag().sections).map(([n, s]) => ({
          uri: `govbr://emag/${n}`,
          name: `e-MAG seção ${n} — ${s.title}`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "e-MAG 3.1 por seção",
      description: "Recomendações do e-MAG 3.1 por seção (1–6)",
      mimeType: "application/json",
    },
    async (uri, { section }) => {
      const data = getEmag().sections[String(section)];
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(data ?? { error: `Seção ${section} não encontrada` }, null, 2) }],
      };
    }
  );

  if (hasNorms) server.registerResource(
    "component-spec",
    new ResourceTemplate("govbr://components/{name}", {
      list: async () => ({
        resources: Object.keys(getComponentSpecs().components).map((name) => ({
          uri: `govbr://components/${name}`,
          name: `Especificação: ${name}`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Especificações de componentes",
      description: "Especificação canônica por componente do gov.br DS",
      mimeType: "application/json",
    },
    async (uri, { name }) => {
      const spec = getComponentSpecs().components[String(name)];
      const payload = spec
        ? { ...spec, warnings: getComponentDefects(String(name)) }
        : { error: `Componente ${name} não encontrado` };
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Prompt (A6) — the standardized validation procedure
  // ══════════════════════════════════════════════════════════════════════════

  /** 3.0.0 (S-15): o procedimento só cita as ferramentas que este perfil registrou. */
  const profileTools: ReadonlySet<string> = new Set([
    ...(hasNorms ? ["get_ds_rules", "get_design_tokens", "get_emag_rules", "get_page_rules", "get_component_spec"] : []),
    ...(toolProfile === "full" ? ["list_components", "check_token_compliance", "check_component_structure", "run_axe_scan", "save_report"] : []),
    ...(hasEvidence ? ["inspect_computed_styles"] : []),
    ...(hasDeterministic || knowledgeFree ? ["scan_page", "get_finding_details"] : []),
    ...(hasCombinedGate || knowledgeFree ? ["verify_finding"] : []),
  ]);

  if (hasCombinedGate) server.registerPrompt(
    "validate_page",
    {
      title: "Procedimento padronizado de validação",
      description:
        "Procedimento completo de validação de uma página contra o gov.br DS + e-MAG 3.1: coleta determinística, julgamento semântico com via dupla (explícita/heurística com portão de verificação), limite de iterações e relatório no esquema Finding. Somente procedimento — o conhecimento de domínio vem das ferramentas.",
      argsSchema: {
        url: z.string().describe("URL da página a validar"),
        scope: z.string().optional().describe("Componentes a focar, separados por vírgula (ex.: 'button,input')"),
        // 3.0.0 (S-15): inteiro >= 0; "-5" entrava no texto como estava.
        max_iterations: z.string().regex(/^\d{1,2}$/, "max_iterations: inteiro de 0 a 99").optional().describe("Máximo de iterações adicionais (padrão: 2)"),
      },
    },
    ({ url, scope, max_iterations }) => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: buildValidatePagePrompt({ url, scope, max_iterations, tools: profileTools }) },
        },
      ],
    })
  );

  return server;
}
