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
import { createHash } from "node:crypto";
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
  isSpecification,
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
import { demoteToObservations, partitionByOwnership, splitOutside } from "./checkers/ownership.js";

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
import { bestPracticeReferences, runAxeScan } from "./checkers/axe.js";
import { pageConstraints, titleDuplicateFinding } from "./checkers/pageStructure.js";
import {
  inspectComputedStyles,
  STYLE_PROPERTIES,
  type StyleProperty,
} from "./evidence/inspect.js";
import { decisiveNoteOf, verifyFinding } from "./verify/gate.js";
import { mixedStateVerdict, routeOfUrl, stateReferences, type ScanStateInfo } from "./verify/mixedStates.js";
import { VerificationStore } from "./verify/store.js";
import { ArrivalSchema, PageActionsSchema, type PageAction } from "./scan/actions.js";
import type { StateAttestation } from "./scan/pageScan.js";
import { sameScanPage, scanPageKey } from "./scan/state.js";
import { validateFindings, buildReport, persistReport, summarize, REPORT_NOTES_MAX_CHARS } from "./report/report.js";
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
  PAGE_CONTENT_NOTE,
} from "./responses/findings.js";
import { FamilyViewInputShape, buildFamilyMemberPage, buildFamilyPage, evidenceSignature, familyIndex, groupFamilies, type FamilyExtras } from "./responses/families.js";
import { unitForceOf } from "./responses/normForce.js";
import { INTERACTION_NOTE, interactionOf } from "./checkers/interaction.js";
import { PageScanCache, pageLevelFirst, scanPage, type RevisitItem } from "./scan/pageScan.js";
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
import { fitComponentSpec, specClauses, specRelated, specSpecification } from "./tools/componentSpec.js";
import { emagTemplateCitation } from "./responses/retrieval.js";
import { emagClausesReply } from "./responses/emagClauses.js";

/** 3.3.0 (B-09): o resumo do e-MAG do projeto não é texto da norma (nada da base é reescrito). */
const EMAG_PARAPHRASE_NOTE =
  "description, wcag e meta.note são resumo do projeto (em inglês), não texto do e-MAG: não cite como norma. O texto literal está em normativeContext.clauses (por id) e sourceContext.";
import { looksLikeColor, parseColor } from "./data/colorValue.js";
import { serverInstructions } from "./prompts/instructions.js";

/**
 * Verificações assíncronas de subida (hoje nenhuma: a da busca vetorial saiu na 3.3.0, D-152). O index.ts
 * espera por elas antes de conectar o transporte.
 */
let startupCheck: Promise<void> = Promise.resolve();
export function startupChecks(): Promise<void> {
  return startupCheck;
}
import { getGuidance } from "./data/guidance.js";
import { capStateItems, notJudgedObservations, observedRequiredItems, observedSubjectOf, pageLevelBlock, pageLevelBlockKnowledgeFree, usageLedgerObservations, usageUnreadItem, type NotJudgedItem, type PendingItem } from "./scan/notJudged.js";
import { deliveredRuleIds, usageClauseIds, usageReadCalls } from "./tools/usageClauses.js";
import { ScanSession, UNITS_NOTE, routeKeyOf, routeLabel, routeTemplateOf, sessionPendingBlock, shortRoute, slotOf, slotRemaining } from "./scan/session.js";
import { checklistPendingClauses, componentChecklist, investigateClauses, unmeasuredStrongCount } from "./tools/componentChecklist.js";
import { reserveCandidates } from "./tools/clauseReserve.js";
import { pageChecklist, pageInvestigateClauses } from "./tools/pageChecklist.js";
import { EXAMPLE_WARNING_NOTE, auditComponentExamples, elementObligationsCompact } from "./tools/exampleAudit.js";
import { assembleScan, boundStrings, checksRunFor, diffPage, diffSummary, investigateFor, observationPage, refineDiff, SCAN_DEFAULT_MAX_CHARS, specificationFor } from "./responses/scan.js";
import { measurableSpecRows } from "./data/specParts.js";
import { verificationEnvelope } from "./responses/verify.js";
import type { Observation } from "./schema/finding.js";
import { ANATOMY_PARTS } from "./verify/contextual.js";
import { EXPECTED_CONDITIONS } from "./schema/structuredClaims.js";

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
/**
 * 3.6.1 (revisão L2): as `instructions` do initialize de um perfil — fora do hash do tools/list, então o braço que
 * as recebe muda sem o sha do tools/list mudar. `instructionsSha256(perfil)` dá o valor para o govbr-eval fixar.
 */
export function instructionsForProfile(profile: ToolProfile): string {
  const hasNorms = profile === "full" || profile === "evaluation" || profile === "normative";
  const hasDeterministic = profile === "full" || profile === "evaluation" || profile === "deterministic";
  const hasEvidence = profile === "full" || profile === "evidence";
  const hasCombinedGate = profile === "full" || profile === "evaluation";
  const knowledgeFree = profile === "knowledge-free";
  return serverInstructions(new Set([
    ...(hasNorms ? ["get_ds_rules", "get_component_spec"] : []),
    ...(hasEvidence ? ["inspect_computed_styles"] : []),
    ...(hasDeterministic || knowledgeFree ? ["scan_page", "get_finding_details"] : []),
    ...(hasCombinedGate || knowledgeFree ? ["verify_finding"] : []),
  ]));
}

export function instructionsSha256(profile: ToolProfile): string {
  return createHash("sha256").update(instructionsForProfile(profile)).digest("hex");
}

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

// 3.3.0 (N-10): "outline" está nas duas listas; o enum publicado não repete valor.
const StylePropertySchema = z.enum([...new Set(STYLE_PROPERTIES)] as unknown as [StyleProperty, ...StyleProperty[]]);

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
            // 3.6.0: os ids são checks, não citação; o tamanho da nota fica o mesmo (o orçamento da 1ª página não muda).
            "Checks de página (get_page_rules; o achado cita a norma em citeAs, não o id): valem para página " +
            "completa no Template Base, independentemente dos componentes; se a avaliada é completa ou " +
            "fragmento não é informado.",
          // 3.6.1: ds-page-title (e-MAG 3.3, documento) não é região do Template Base: fica fora desta lista, e o
          // contexto do get_ds_rules continua byte a byte o da 3.6.0 (guarda da busca intocada).
          ids: pageConstraints().filter((c) => c.kind !== "page-title").map((c) => c.id),
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
  /** 3.6.1 (D-155): memória da sessão entre scans — rotas, títulos, pendências abertas, elementos ocultos. */
  const session = new ScanSession();
  /** 3.0.0 (S-03): observações por scanId, fora da resposta inicial e pagináveis (get_finding_details view=observations). */
  const observationStore = new Map<string, Observation[]>();
  /** Revisão da 3.0.0: diff completo de findings por scanId (o cabeçalho leva só contagens). */
  const diffStore = new Map<string, { previousScanId: string; diff: ReturnType<typeof diffFindings> & { notRemeasured?: Array<{ id: string; reason: "check-not-run" | "scope"; check: string }> } }>();
  /** 3.3.0 (N-04): coletas do inspect_computed_styles por argumentos, para paginar sem recarregar. */
  const inspectSnapshots = new Map<string, { id: string; takenAt: string; evidence: Record<string, unknown>; elements: unknown[] }>();
  let inspectSnapshotCounter = 0;
  const verificationFor = (finding: Finding) => verificationStore.lookup(finding)?.verification;
  /** 3.6.3: os scans de página desta sessão com o estado de cada um (para recusar evidência de estados misturados). */
  const pageScanStates = (): ScanStateInfo[] =>
    findingStore.batchIds().flatMap((id) => {
      const ledger = findingStore.getBatchMetadata(id);
      const state = ledger?.state as StateAttestation | undefined;
      if (!state?.observed?.url || typeof ledger?.stateFingerprint !== "string") return [];
      return [{
        scanId: id,
        url: state.observed.url,
        // 3.6.3 (revisão LOW 1): a mesma chave de rota das pendências (routeKeyOf); a query fica na receita.
        page: routeOfUrl(state.observed.url),
        fingerprint: ledger.stateFingerprint,
        recipeKey: JSON.stringify({ url: state.recipe?.url ?? state.observed.url, actions: state.recipe?.actions ?? [], arrival: state.recipe?.arrival ?? null }),
        findings: findingStore.getBatch(id) ?? [],
      }];
    });

  /**
   * 3.6.5 (D-155, itens 1, 2 e 4): o que as famílias mostram fora do perfil knowledge-free — força da unidade citada (da
   * base), passo de interação e a mesma evidência em outra rota/estado da sessão. As famílias seguem iguais entre os perfis
   * que varrem com a base (NAT-84); o knowledge-free fica como estava (nada da base).
   */
  const familyExtras = (batchScanId?: string): FamilyExtras => {
    if (knowledgeFree) return {};
    // 3.7.2: a norma obrigatória do DS/e-MAG do mesmo assunto nas famílias de regras só best-practice do axe.
    const extras: FamilyExtras = { forceOf: unitForceOf, interaction: true, referencesOf: bestPracticeReferences };
    const ledger = batchScanId ? findingStore.getBatchMetadata(batchScanId) : undefined;
    const state = ledger?.state as StateAttestation | undefined;
    if (batchScanId && state?.observed?.url && typeof ledger?.stateFingerprint === "string") {
      const route = routeKeyOf(state.observed.url);
      const fingerprint = ledger.stateFingerprint;
      extras.recipeActions = state.recipe?.actions ?? [];
      extras.alsoInFor = (signature, _familyId, locators) => session.alsoIn(signature, batchScanId, route, fingerprint, locators);
    }
    return extras;
  };

  /**
   * 3.6.6 (revisão da 3.6.5, MÉDIA 3): as ações da receita do estado de um lote (scan de página). undefined quando o lote
   * não tem estado (o passo projetado fica o de sempre).
   */
  const recipeActionsOfBatch = (batchScanId?: string): readonly unknown[] | undefined => {
    const ledger = batchScanId ? findingStore.getBatchMetadata(batchScanId) : undefined;
    const state = ledger?.state as StateAttestation | undefined;
    return state?.observed?.url ? (state.recipe?.actions ?? []) : undefined;
  };
  /** 3.6.6: a receita do lote mais recente de cada achado, para a projeção por ids concordar com a família e o verify. */
  const recipeActionsOfFinding = (finding: Finding) => recipeActionsOfBatch(findingStore.batchIdOf(finding.id));

  /**
   * 3.7.2 (rastreio dev-371-b §3, B-23 p01): os ids pedidos no get_finding_details são de scans de rotas diferentes (outra
   * página, ou o mesmo modelo de rota com outro registro) — o aviso diz quantos cartões são, antes do verify_finding recusar
   * (mixed-states). Só scans de página (com estado); ids sem lote de página não entram na conta.
   */
  const idsRoutesWarning = (found: Finding[]) => {
    const byRoute = new Map<string, { scanIds: string[]; ids: string[] }>();
    for (const f of found) {
      const batchId = findingStore.batchIdOf(f.id);
      const state = batchId ? (findingStore.getBatchMetadata(batchId)?.state as StateAttestation | undefined) : undefined;
      if (!batchId || !state?.observed?.url) continue;
      const route = routeKeyOf(state.observed.url);
      const entry = byRoute.get(route) ?? { scanIds: [], ids: [] };
      if (!entry.scanIds.includes(batchId)) entry.scanIds.push(batchId);
      entry.ids.push(f.id);
      byRoute.set(route, entry);
    }
    if (byRoute.size < 2) return undefined;
    const templates = new Set([...byRoute.keys()].map(routeTemplateOf)).size;
    // 3.7.2 (revisão BAIXA 6): até 5 rotas; as demais só contadas.
    const all = [...byRoute];
    return {
      routes: all.slice(0, 5).map(([route, e]) => ({ route: shortRoute(route), scanIds: e.scanIds.slice(0, 5), ids: e.ids.slice(0, 10), ...(e.ids.length > 10 ? { more: e.ids.length - 10 } : {}) })),
      ...(all.length > 5 ? { more: all.length - 5 } : {}),
      note:
        `ids de ${byRoute.size} rotas${templates < byRoute.size ? " (o mesmo modelo de rota com outro registro conta como outra rota)" : ""}: ` +
        `${byRoute.size} cartões, um por rota, cada um com o scanId do seu — a evidência de um não vale pelo outro (verify_finding recusa juntar: mixed-states).`,
    };
  };

  /** 3.6.5 (item 4): as famílias de um scan de página entram no registro da sessão (todas, pela chave completa). */
  const recordScanFamilies = (scanId: string, url: string, fingerprint: string, findings: Finding[]) => {
    session.recordFamilies(
      scanId,
      routeKeyOf(url),
      fingerprint,
      groupFamilies(findings, fingerprint).map((f) => ({ signature: evidenceSignature(f.members[0]), familyId: f.familyId, locators: f.members.map((m) => m.element.locator) })),
    );
  };

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
    /** 3.6.5 (D-155): o scan do lote (para alsoIn); ausente fora de um scan de página. */
    batchScanId?: string,
  ) {
    const { view, detail, cursor, limit, maxChars, memberLimit } = args;
    // Padrão: famílias (decisão do coordenador na revisão do NAT-84). A lista plana segue em view="findings".
    if ((view ?? "families") === "families") {
      return buildFamilyPage(findings, { cursor, limit, maxChars, memberLimit, stateFingerprint, verificationFor, ...familyExtras(batchScanId) });
    }
    const page = buildFindingPage(findings, { detail, cursor, limit, maxChars, recipeActionsOf: () => recipeActionsOfBatch(batchScanId) });
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
    instructions: instructionsForProfile(toolProfile),
  });
  // 3.6.3: toda recusa de entrada também vira um evento de telemetria (eventos = chamadas, nos dois perfis).
  installContractInputValidation(server, (name, args, result, errorCode) => telemetry.rejected(name, args, result, errorCode));
  // 3.7.5 (item 6): o servidor vê o que as ferramentas de leitura da base devolvem — os ids das cláusulas ENTREGUES (revisão
  // H1: só os itens de cláusula da resposta, nunca ids ecoados em next/ambiguity/query) fecham as pendências de leitura
  // (usage-unread) cujo conjunto inteiro já passou. Só o handler é envolvido: nome, descrição e esquema (o tools/list)
  // ficam como estão.
  if (hasNorms) {
    const READ_TOOLS = new Set(["get_ds_rules", "get_component_spec", "get_page_rules"]);
    const register = server.registerTool.bind(server) as (...a: unknown[]) => unknown;
    (server as { registerTool: unknown }).registerTool = (name: string, config: unknown, cb: (...a: unknown[]) => Promise<unknown>) =>
      register(name, config, READ_TOOLS.has(name)
        ? async (...a: unknown[]) => {
            const result = await cb(...a) as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
            if (!result?.isError) {
              const delivered = (result?.content ?? []).flatMap((c) => (typeof c.text === "string" ? deliveredRuleIds(name, c.text) : []));
              session.noteRead(delivered);
              // 3.7.6-pre.2 (revisão MED): só a leitura POR ID (ids/id), nunca o resultado de uma busca, fecha a `O-NN`.
              const args = (a[0] ?? {}) as { ids?: unknown; id?: unknown };
              const asked = new Set([...(Array.isArray(args.ids) ? args.ids : []), ...(typeof args.id === "string" ? [args.id] : [])].filter((x): x is string => typeof x === "string"));
              if (name === "get_ds_rules" && asked.size) session.noteReadById(delivered.filter((id) => asked.has(id)));
            }
            return result;
          }
        : cb);
  }

  // Phase 2.5 guard: the KB and the installed @govbr-ds/core must describe
  // the same DS release (logs to stderr — stdout is the MCP transport). Sem base no knowledge-free.
  if (!knowledgeFree) warnOnVersionMismatch();
  // 3.0.0 (revisão): orientação curada sem basis válido não sobe (§15.6b, falha cedo).
  if (hasNorms) getGuidance();
  // 3.3.0 (D-152): a busca híbrida/vetorial da 3.2.0 foi removida; nenhuma checagem de subida assíncrona.
  startupCheck = Promise.resolve();

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
          .enum(["required", "prohibited", "recommended", "discouraged", "permitted", "informative", "unclear", "especificacao"])
          .optional()
          .describe("Força normativa (exemplos: include_evidence); 'especificacao' lista só as unidades de especificação (tabelas e frases descritivas, candidatas, não obrigações)"),
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
      if (args.match !== "literal") return getDsRules(args, { brief: briefRule, full: projectRule, tools: profileTools });
      if (args.cursor !== undefined || args.clauseCursor !== undefined || args.detail === "index") {
        return fail({
          error: "match:'literal' é o caminho da 2.x: não aceita cursor, clauseCursor nem detail:'index'. Pagine com offset.",
          errorCode: "invalid-combination",
          field: "match",
          next: [step("request-detail", "repita sem match:'literal' para o contrato 3.0.0", null)],
        });
      }
      const { id, ids, context, include_evidence, limit, offset, match, vocabulary, cursor: _cursor, clauseCursor: _clause, detail: rawDetail, ...rawFilter } = args;
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
          kind: rule.legacy ? "historical" : isSpecification(rule) ? "specification" : NORMATIVE_FORCES.includes(rule.force as RuleForce) ? "normative" : "evidence",
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
            kind: rule.legacy ? "historical" : isSpecification(rule) ? "specification" : NORMATIVE_FORCES.includes(rule.force as RuleForce) ? "normative" : "evidence",
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
        clauseCursor: z.string().max(40).optional().describe("Com id: continuação das cláusulas literais, devolvida em clausesDeferred.next"),
      }),
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_emag_rules", async ({ section, id, clauseCursor }) => {
      const emag = getEmag();
      if (clauseCursor !== undefined && !id) return fail({
        error: "clauseCursor exige o id da recomendação.", errorCode: "invalid-combination", field: "clauseCursor",
        next: [step("request-detail", "reinicie pelo índice ou informe o id da recomendação", "get_emag_rules", {})],
      });
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
        return emagClausesReply(response, units, id, clauseCursor);
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
        "Consulta diretrizes de página por categoria. view:checklist lista cláusulas globais obrigatórias/proibidas do DS e e-MAG por mensurabilidade, sem decidir aplicabilidade; continue pelo cursor. Sem categoria nem view, retorna o índice e as restrições de página (checks ds-page-header, ds-page-footer, ds-page-skip-link, ds-page-focus-order, ds-page-title: regiões obrigatórias do Template Base, salto para o conteúdo, o salto como primeiro a receber o foco e o título do documento), cada uma com a norma que o achado cita (citeAs), verificáveis pelo scan_page e pelo verify_finding.",
      inputSchema: strictInput("get_page_rules", {
        view: z.enum(["checklist"]).optional().describe("Sem category: catálogo global paginado, não veredito nem pendência registrada"),
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
        cursor: z.string().max(40).optional().describe("Com category ou view:checklist: continuação devolvida em page.cursor"),
      }),
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_page_rules", async ({ category, cursor, view }) => {
      if (view === "checklist") {
        if (category !== undefined) return fail({
          error: "view:checklist não pode ser combinado com category.", errorCode: "invalid-combination", field: "category",
          next: [step("request-detail", "o checklist global", "get_page_rules", { view: "checklist" })],
        });
        return pageChecklist(cursor);
      }
      const pageRules = getPageRules();
      // 3.3.0 (N-13): cursor sem category não continua nada — erro, não índice em silêncio.
      if (!category && cursor !== undefined) {
        return fail({ error: "cursor só vale com category ou view:checklist (continuação da consulta correspondente).", errorCode: "invalid-combination", field: "cursor", next: [step("request-detail", "o índice de categorias", "get_page_rules", {})] });
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
        view: z
          .enum(["spec", "checklist"])
          .optional()
          .describe("spec (padrão) = especificação; checklist = obrigações e proibições do componente na base, cada uma com o id citável e como medi-la (o que o oráculo mede e o que medir no navegador), com cursor"),
        cursor: z.number().int().min(0).optional().describe("Continuação da checklist (nextCursor)"),
      }),
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_component_spec", async ({ component, include_examples, example, view, cursor }) => {
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
      // 3.5.0 (D-155, item 2): lista de verificação do componente (obrigações/proibições + como medir).
      if (view === "checklist") {
        if (example !== undefined || include_examples) {
          return fail({
            error: "view 'checklist' não traz exemplos: peça o exemplo à parte.",
            errorCode: "invalid-combination",
            field: example !== undefined ? "example" : "include_examples",
            next: [step("request-detail", "a lista de verificação, sem exemplo", "get_component_spec", { component: spec.name, view: "checklist" })],
          });
        }
        // 3.6.5 (item 3b): as obrigações globais dos elementos da marcação; (item 5) as cláusulas obrigatórias e
        // mensuráveis sem medida do oráculo viram pendências da sessão (pendingId em cada item).
        const audit = await auditComponentExamples(spec.name, spec.examples as Array<{ name: string; html?: unknown }>);
        return ok(checklistWithPending(spec.name, cursor ?? 0, elementObligationsCompact(audit)));
      }
      if (cursor !== undefined) {
        return fail({
          error: "cursor só vale com view 'checklist'.",
          errorCode: "invalid-combination",
          field: "cursor",
          next: [step("request-detail", "a lista de verificação", "get_component_spec", { component: spec.name, view: "checklist", cursor })],
        });
      }
      // Defect awareness (D-10/Phase 2.4): the canonical examples of some
      // components are themselves non-conformant — warn at spec-serving time.
      const defects = getComponentDefects(spec.name);
      // 3.6.5 (D-155, item 3): os exemplos conferidos pelas pendências/checks do próprio oráculo (a) e as obrigações
      // globais que ele cobra dos elementos da marcação do componente (b).
      const audit = await auditComponentExamples(spec.name, spec.examples as Array<{ name: string; html?: unknown }>);
      const oracleWarnings = (name: string | undefined) => (name ? audit.warnings[name] ?? [] : []);
      const auditUnavailable = audit.error ? { exampleAudit: { status: "unavailable", reason: audit.error } } : {};
      const obligations = elementObligationsCompact(audit);
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
          warnings: [
            ...defects.map((d) => ({
              type: d.type, severity: d.severity, file: d.file, element: d.element,
              note: "Defeito de acessibilidade no exemplo canônico oficial — não trate este fragmento como norma (veja govbr://knowledge/conflicts).",
            })),
            ...oracleWarnings(chosen.name),
          ],
          ...(oracleWarnings(chosen.name).length ? { warningsNote: EXAMPLE_WARNING_NOTE } : {}),
          ...auditUnavailable,
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
          // 3.4.0 (A1/A10): texto das cláusulas de prosa do componente; A12: ligações kb-relations.
          clauses: specClauses(spec.name),
          ...specRelated(spec.name),
          // 3.7.3 (D-167): unidades de especificação (emenda-2), fora de total e do checklist.
          ...specSpecification(spec.name),
          // 3.5.0 (D-155): todas as obrigações/proibições do componente, com como medir cada uma.
          checklist: { tool: "get_component_spec", arguments: { component: spec.name, view: "checklist" } },
          next: ruleNext.slice(0, 3),
        },
        // 3.4.4 (C13, D4): os valores aceitos de `part` no predicado de anatomia só apareciam no erro.
        ...(ANATOMY_PARTS.some((p) => p.component === spec.name)
          ? {
              verifiableAnatomy: {
                expectedCondition: EXPECTED_CONDITIONS.anatomyPart,
                parts: ANATOMY_PARTS.filter((p) => p.component === spec.name).map((p) => ({ part: p.part, label: p.label, rules: p.rules })),
                note: "verify_finding decide a ausência destas partes com evidence.data {expectedCondition, component, part} e rule.id = uma das rules.",
              },
            }
          : {}),
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
        ...(obligations ? { elementObligations: obligations } : {}),
        ...auditUnavailable,
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
      // 3.6.5 (item 3a): os alertas do oráculo são os do exemplo SERVIDO (o ajuste ao teto pode trocar o implícito).
      const withOracleWarnings = (name: string | undefined) => {
        const base = (response.warnings as Array<{ type: string }>).filter((w) => w.type !== "oracle-pending" && w.type !== "oracle-finding");
        const own = oracleWarnings(name);
        response.warnings = [...base, ...own];
        if (own.length) response.warningsNote = EXAMPLE_WARNING_NOTE;
        else delete response.warningsNote;
      };
      withOracleWarnings(chosen?.name);
      const fitted = fitComponentSpec(response, { component: spec.name, chosen, implicit: example === undefined, examples });
      const served = (fitted.example as { name?: string; status?: string } | undefined);
      if (served?.name !== chosen?.name || served?.status === "deferred") withOracleWarnings(served?.status === "deferred" ? undefined : served?.name);
      return ok(fitted);
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
        cursor: z.number().int().min(0).optional().describe("Continuação devolvida em nextCursor (pagina a mesma coleta, guardada no servidor; a página não é recarregada)"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(telemetry, "inspect_computed_styles", async ({ url, selector, selectors, properties, cursor }) => {
      // Revisão da 3.0.0 (M3): elementos no orçamento de 8.000, em ordem do DOM, com continuação.
      // 3.3.0 (N-04): a coleta é feita uma vez e guardada; a continuação pagina a mesma coleta (ids
      // estáveis), sem recarregar a página. Sem coleta guardada (outra sessão), coleta de novo e avisa.
      const args = { url, ...(selector ? { selector } : {}), ...(selectors ? { selectors } : {}), ...(properties ? { properties } : {}) };
      const key = JSON.stringify(args);
      let snapshot = cursor ? inspectSnapshots.get(key) : undefined;
      const recollected = Boolean(cursor) && !snapshot;
      if (!snapshot) {
        const { elements, ...evidence } = await inspectComputedStyles(url, selectorBatch(selector, selectors), properties);
        inspectSnapshotCounter += 1;
        // N-03: atributos, classes e textos da página com teto por campo.
        snapshot = { id: `I-${String(inspectSnapshotCounter).padStart(3, "0")}`, takenAt: new Date().toISOString(), evidence, elements: elements.map((e) => boundStrings(e, 300, 40)) };
        inspectSnapshots.delete(key);
        inspectSnapshots.set(key, snapshot);
        while (inspectSnapshots.size > 20) inspectSnapshots.delete(inspectSnapshots.keys().next().value as string);
      }
      const { elements, evidence, id: snapshotId, takenAt } = snapshot;
      const start = cursor ?? 0;
      return ok(
        budgetPage(elements, start, (page, next) => ({
          contract: CONTRACT,
          kind: "evidence",
          ...evidence,
          snapshotId,
          takenAt,
          ...(recollected ? { warning: "A coleta original não está nesta sessão: a página foi coletada de novo e pode ter mudado; recomece sem cursor." } : {}),
          pageContent: PAGE_CONTENT_NOTE,
          cursor: Math.min(start, elements.length),
          returned: page.length,
          elements: page,
          ...(next !== null
            ? {
                nextCursor: next,
                next: step("request-detail", "próximos elementos da mesma coleta (a página não é recarregada)", "inspect_computed_styles", { ...args, cursor: next }),
              }
            : start > 0 ? { status: "end-of-results" } : {}),
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
        : "Orçamento da resposta inteira em caracteres (padrão 8000). Na primeira página, 20% para leitura literal contextual deduplicada de cláusulas mensuráveis inteiras; fatos no restante, com cursor. Unidade e piso que não cabem: recusa explícita.",
    );

  /** 3.3.0 (N-09): diff entre páginas diferentes é dito, não escondido. */
  const comparePage = (previousLedger: Record<string, unknown> | undefined, url: string) => {
    const previousUrl = (previousLedger?.state as { recipe?: { url?: string } } | undefined)?.recipe?.url;
    if (!previousUrl || sameScanPage(previousUrl, url)) return {};
    return { urlChanged: true, previousUrl, warning: "O scan comparado é de outra página: o diff compara páginas diferentes, não estados da mesma página." };
  };

  /**
   * 3.6.1 (D-155, item 4): o diff de findings com os "removidos" que só não foram medidos de novo separados —
   * achado cujo check não rodou neste scan (ou que pode estar fora dos seletores deste scan) não sumiu.
   */
  const stateDiffFindings = (
    scanId: string,
    previousScanId: string,
    previous: Finding[],
    current: Finding[],
    previousLedger: Record<string, unknown> | undefined,
    currentChecks: string[],
    currentSelectors: string[],
  ) => {
    const prevSelectors = ((previousLedger?.coverage as { selectors?: string[] } | undefined)?.selectors ?? []).slice().sort();
    const now = [...currentSelectors].sort();
    const scopeNarrowed = now.length > 0 && JSON.stringify(now) !== JSON.stringify(prevSelectors);
    const diff = refineDiff(diffFindings(previous, current), previous, currentChecks, scopeNarrowed);
    diffStore.set(scanId, { previousScanId, diff });
    return diffSummary(diff, scanId);
  };

  /** 3.6.1 (item 1): itens do notJudged com o id da pendência da sessão (e a resolução, se já houver). */
  /**
   * 3.6.5 (D-155, item 5; revisão): as cláusulas obrigatórias e mensuráveis sem medida do oráculo viram pendências da
   * sessão quando SERVIDAS na página do checklist que o agente recebeu (as páginas seguintes registram quando o cursor é
   * pedido), nas rotas em que um scan encontrou o componente. Sem scan que o encontrou, nada é registrado (e a nota diz);
   * no perfil sem scan_page, também não. A página é montada com ids provisórios da largura final (o pendingId conta no
   * orçamento), os citeAs servidos são registrados e a página é montada de novo com os ids reais.
   */
  const checklistWithPending = (component: string, cursor: number, obligations: ReturnType<typeof elementObligationsCompact>) => {
    const base = { elementObligations: obligations };
    const clauses = checklistPendingClauses(component);
    if (!clauses.length) return componentChecklist(component, cursor, undefined, base);
    if (!hasDeterministic) return componentChecklist(component, cursor, undefined, { ...base, pendingStatus: "no-scan-tool" });
    const routes = [...new Set(session.previousScans().filter((s) => s.components?.includes(component)).map((s) => s.route))];
    if (!routes.length) return componentChecklist(component, cursor, undefined, { ...base, pendingStatus: "component-not-found" });
    const provisional = session.clauseIdsPreview(component, clauses.map((c) => c.id));
    const draft = componentChecklist(component, cursor, undefined, { ...base, pendingIds: provisional });
    // 3.6.6 (revisão da 3.6.5, MÉDIA 4, opção a): registra só a cláusula cujo pendingId a página MOSTROU. Sem id à vista o
    // agente não teria como fechá-la (pendingResolved pede o id, e o sessionPending mostra até 3 por componente); a opção b
    // (todo id registrado no sessionPending) custaria espaço na 1ª página do scan, que é das famílias. A cláusula servida
    // sem id fica no checklist com a nota "sem pendingId: dê estado no relatório"; volta a registrar quando for mostrada.
    const served = new Set(((draft.items as Array<{ citeAs: string; pendingId?: string }> | undefined) ?? []).filter((i) => i.pendingId).map((i) => i.citeAs));
    session.registerClauses(component, routes, clauses.filter((c) => served.has(c.id)));
    const page = componentChecklist(component, cursor, undefined, { ...base, pendingIds: session.clauseIds(component) });
    // 3.6.6 (revisão da 3.6.6, BAIXA 2): a cláusula mensurável servida sem pendingId fica contada (sessionPending.checklist.unregistered).
    const candidates = new Set(clauses.map((c) => c.id));
    session.noteUnregistered(component, ((page.items as Array<{ citeAs: string; pendingId?: string }> | undefined) ?? []).filter((i) => candidates.has(i.citeAs) && !i.pendingId).map((i) => i.citeAs));
    return page;
  };

  const withPendingIds = (scanId: string, route: string, items: NotJudgedItem[]): PendingItem[] => {
    // 3.7.2 (revisão HIGH 1): a pendência de elementos guarda todos os localizadores (inteiros), não só os exemplos.
    const entries = session.registerPending(scanId, route, items, (item) => (item.boundLocators ?? item.examples ?? []).slice());
    return items.map((item, i) => {
      const e = entries[i];
      // 3.6.3 (revisão HIGH 1): resolvida NESTA rota (a mesma pendência pode seguir aberta noutra).
      const slot = slotOf(e, route);
      return {
        ...item,
        pendingId: e.id,
        ...(slot?.status === "resolved" ? { resolved: slot.resolution?.status ?? slot.resolution?.by ?? true } : {}),
        // 3.7.4 (D2): verificada em parte nesta rota — quantos elementos já decididos e os que faltam.
        ...(slot?.status === "open" && slot.decided?.length
          ? (() => { const rest = slotRemaining(slot); return { decided: slot.decided!.length, remaining: rest.slice(0, 3).map((l) => clip(l, 120)), ...(rest.length > 3 ? { remainingMore: rest.length - 3 } : {}) }; })()
          : {}),
      };
    });
  };

  /**
   * 3.7.9 (D1/D2): as pendências de estado já vistas abertas nesta rota nascem fechadas (✓), e a ordem passa a ser estados
   * recolhidos, campo de arquivo, demais — a mesma no ledger e na linha do scan.
   */
  const settleStateItems = (route: string, items: PendingItem[], checks: string[], scanId: string, previousScanId?: string): PendingItem[] => {
    const born = new Set(session.settleStates(route, items.filter((i) => i.code === "state-unscanned").map((i) => i.pendingId as string), checks, scanId));
    // 3.7.11 (2ª revisão LOW): com compareToScanId, a mensagem do campo que já estava no scan anterior vem marcada (não é
    // efeito desta receita).
    const before = new Set(
      previousScanId
        ? (observationStore.get(previousScanId) ?? []).flatMap((o) => {
            const d = o.data as { code?: string; fieldNow?: { associated?: Array<{ text: string }> } } | undefined;
            return d?.code === "upload-paths" ? (d.fieldNow?.associated ?? []).map((a) => a.text) : [];
          })
        : [],
    );
    // 3.7.11 (revisão H4): a receita de envio compara com o scan desta resposta (o antes do envio)
    const settled = items.map((i) => {
      let it = born.has(i.pendingId as string) ? { ...i, resolved: "state-scanned" } : i;
      const fn = (it as { fieldNow?: { associated: Array<{ text: string; inPrevious?: boolean }> } }).fieldNow;
      if (it.code === "upload-paths" && fn && before.size) {
        const same = fn.associated.filter((x) => before.has(x.text)).length;
        if (same) {
          it = {
            ...it,
            fieldNow: { ...fn, associated: fn.associated.map((x) => (before.has(x.text) ? { ...x, inPrevious: true } : x)) },
            observed: `${it.observed ?? ""}; ${same} das mensagens do campo já estavam no scan ${previousScanId} (não são efeito desta receita)`,
          } as PendingItem;
        }
      }
      const sr = (it as { submitRecipe?: { tool: string; arguments: Record<string, unknown> } }).submitRecipe;
      return sr ? { ...it, submitRecipe: { ...sr, arguments: { ...sr.arguments, compareToScanId: scanId } } } : it;
    });
    const rank = (i: PendingItem) => (i.code === "state-unscanned" ? 0 : i.code === "upload-paths" ? 1 : 2);
    return settled.map((i, k) => ({ i, k })).sort((a, b) => rank(a.i) - rank(b.i) || a.k - b.k).map(({ i }) => i);
  };

  /** 3.6.1 (revisão H1): os códigos cuja cláusula com texto saiu nesta resposta não repetem o texto na sessão. */
  const markDeliveredTexts = (response: Record<string, unknown>) => {
    const pl = (response.checksRun as { pageLevel?: { notMeasured?: unknown[] } } | undefined)?.pageLevel;
    for (const i of pl?.notMeasured ?? []) {
      const item = i as { code?: string; rule?: { text?: string } };
      if (item && typeof item === "object" && item.code && item.rule?.text) session.markDelivered(item.code);
    }
    for (const i of ((response.sessionPending as { items?: unknown[] } | undefined)?.items ?? [])) {
      const item = i as { code?: string; rule?: { text?: string } };
      if (item.code && item.rule?.text) session.markDelivered(item.code);
    }
  };

  /** 3.7.4 (D1): os contextos da reserva que saíram com texto nesta resposta voltam, nos próximos scans, só pela referência. */
  const markDeliveredContexts = (response: Record<string, unknown>, scanId: string) => {
    if (response.kind === "error") return;
    const contexts = (response.clauseReserve as { contexts?: Record<string, { text?: unknown; kind?: string; source?: { ranges?: Array<{ start: number; end: number }> } }> } | undefined)?.contexts;
    for (const [key, ctx] of Object.entries(contexts ?? {})) {
      if (typeof ctx.text !== "string") continue;
      session.markContextDelivered(key, scanId, ctx.kind === "literal-window" ? (ctx.source?.ranges ?? []) : "full");
    }
    // 3.7.5 (R2): a cláusula que saiu inteira não se repete nos próximos scans da sessão (vai por referência).
    for (const clause of ((response.clauseReserve as { clauses?: Array<{ citeAs?: unknown; text?: unknown }> } | undefined)?.clauses ?? [])) {
      if (typeof clause.citeAs === "string" && typeof clause.text === "string") session.markClauseDelivered(clause.citeAs, scanId);
    }
  };

  /** 3.6.1 (item 6): a separação por rota/estado, só quando a sessão já viu outra rota ou outro estado. */
  const unitsBlock = (route: string, fingerprint: string) => {
    const u = session.units(route, fingerprint);
    if (u.routes.length < 2 && u.states < 2) return undefined;
    return { routes: u.routes.length, states: u.states, thisRoute: routeLabel(route), note: UNITS_NOTE };
  };

  /** 3.6.1 (item 3): o que aconteceu com os elementos antes ocultos (só os que estão visíveis agora, até 5). */
  const revisitedBlock = (items: RevisitItem[] | undefined) => {
    if (!items?.length) return undefined;
    const visible = items.filter((i) => i.now === "measured" || i.now === "outside");
    const stillHidden = items.filter((i) => i.now === "hidden").length;
    if (!visible.length) return undefined;
    return {
      note: "Elementos ocultos num scan anterior e visíveis agora: o subcheck de tokens que os marcou foi medido neles neste estado, mesmo fora de checks. O resto da página segue com o que checks pediu.",
      items: visible.slice(0, 5).map((i) => ({
        locator: clip(i.locator, 120),
        check: i.checker,
        from: `${i.fromScan} n${i.n}`,
        now: i.now === "measured" ? (i.findings?.length ? i.findings : "medido: sem achado") : "fora da autoria da página",
      })),
      ...(visible.length > 5 ? { more: visible.length - 5 } : {}),
      ...(stillHidden ? { stillHidden } : {}),
    };
  };

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
      state: boundStrings(result.state),
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
          .describe("Ações reproduzidas nesta mesma página antes do fingerprint e da varredura. click/fill/press/upload/drop com seletor exigem exatamente um elemento: zero ou mais de um interrompem a receita e o estado fica não alcançado"),
        arrival: ArrivalSchema
          .optional()
          .describe("Condições que mostram que o estado pedido foi alcançado (caminho, diálogo aberto, erro visível, controle expandido, foco, elemento visível); não satisfeitas, nada é varrido"),
        compareToScanId: z
          .string()
          .optional()
          .describe("Scan anterior da sessão; devolve diff de fingerprint e findings após a nova varredura"),
        // 3.6.1 (D-155, item 1): a única entrada nova — o agente fecha pendências que mediu e decidiu.
        pendingResolved: z
          .array(
            z
              .object({
                id: z.string().describe("pendingId (P-NN) de checksRun.pageLevel ou sessionPending"),
                status: z.enum(["violada", "conforme", "não se aplica"]),
                reason: z.string().max(300).optional().describe("O que você mediu; obrigatório para conforme e não se aplica (sem ele a pendência continua aberta)"),
              })
              .strict(),
          )
          .min(1)
          .max(50)
          .optional()
          .describe("Pendências que você mediu e decidiu; saem de sessionPending nos próximos scans"),
        ...FindingPageInputShape,
        maxChars: ScanMaxChars,
        ...FamilyViewInputShape,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "scan_page",
      async ({ url, selectors, checks, tokenChecks, components, actions, arrival, compareToScanId, pendingResolved, detail, cursor, limit, maxChars, view, memberLimit }) => {
        const previousFindings = compareToScanId ? findingStore.getBatch(compareToScanId) : undefined;
        const previousLedger = compareToScanId ? findingStore.getBatchMetadata(compareToScanId) : undefined;
        if (compareToScanId && !previousFindings) {
          return sessionFailure(`compareToScanId '${compareToScanId}' não existe nesta sessão MCP.`, "unknown-scan", "compareToScanId");
        }
        const pendingResolution = pendingResolved?.length ? session.resolveExplicit(pendingResolved, routeKeyOf(url)) : undefined;
        // 3.6.1 (item 3): elementos que um scan anterior desta página viu ocultos.
        const revisit = session.hiddenFor(url).map((h) => ({ locator: h.locator, checker: h.checker, fromScan: h.scanId, n: h.n }));
        const result = await scanPage(
          { url, selectors, checks, tokenChecks, components, actions, ...(arrival ? { arrival } : {}), ...(revisit.length ? { revisit } : {}) },
          pageScanCache
        );
        // 2.10.0: estado não alcançado não vira lote — sem scanId, sem findings, sem cobertura; zero
        // achados aqui seria lido como "sem defeito" num estado que ninguém viu.
        if (result.status === "state-not-reached") return unreachedResponse(url, result);
        const executedChecks = (checks ?? ["tokens", "structure", "axe", "page"]) as string[];
        const route = routeKeyOf(result.state.observed.url);
        const pageWide = !selectors?.length;
        const title = pageWide && result.document ? result.document.title.trim() : null;
        const heading = pageWide && result.document ? result.document.mainHeading : null;
        // 3.6.1 (item 2; revisão M4): o mesmo <title> em rotas de outro modelo cujo assunto principal difere e não está
        // nele (heurística, check de página, scan da página inteira).
        const sameTitle = title && executedChecks.includes("page") ? session.sameTitleElsewhere(route, title, heading) : [];
        const findings = sameTitle.length
          ? pageLevelFirst([
              ...result.findings,
              titleDuplicateFinding(
                { url, route: routeLabel(route), heading: heading as string },
                title as string,
                sameTitle.map((s) => ({ route: routeLabel(s.route), scanId: s.scanId, heading: s.heading ?? "" })),
              ),
            ])
          : result.findings;
        const scanId = findingStore.putBatch("page", findings, {
          stateFingerprint: result.stateFingerprint,
          cacheHit: result.cacheHit,
          ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
          coverage: result.coverage,
          state: result.state,
          // 3.5.0 (revisão, MED): só a contagem fica no cabeçalho do ledger; os itens inteiros paginam como
          // observações `not-judged` depois das observações do scan (get_finding_details view:observations, cursor).
          ...(result.notJudged?.length ? { notJudged: { count: result.notJudged.length, codes: result.notJudged.map((i) => i.code), next: { view: "observations", cursor: result.observations.length, note: "get_finding_details(scanId, view:'observations', cursor) traz os itens inteiros" } } } : {}),
        });
        observationStore.set(scanId, [...result.observations, ...notJudgedObservations(result.notJudged ?? [], url)]);
        // 3.6.1 (item 3): o que está oculto neste estado volta como revisita no próximo scan desta página;
        // o que foi medido visível sai da lista.
        for (const r of result.revisited ?? []) {
          if (r.now === "measured" || r.now === "outside" || r.now === "covered") {
            for (const h of session.hiddenFor(url, 1_000)) if (h.locator === r.locator && h.checker === r.checker) session.forgetHidden(h);
          }
        }
        session.recordHidden(scanId, url, result.observations);
        // 3.6.5 (item 4): as famílias deste estado, para marcar a mesma evidência noutra rota/estado.
        recordScanFamilies(scanId, result.state.observed.url, result.stateFingerprint, findings);
        const stateDiff = compareToScanId && previousFindings
          ? {
              previousScanId: compareToScanId,
              previousFingerprint: previousLedger?.stateFingerprint ?? null,
              currentFingerprint: result.stateFingerprint,
              stateChanged: previousLedger?.stateFingerprint !== result.stateFingerprint,
              ...comparePage(previousLedger, url),
              findings: stateDiffFindings(scanId, compareToScanId, previousFindings, findings, previousLedger, executedChecks, selectors ?? []),
              elementsInspectedDelta:
                typeof (previousLedger?.coverage as { elementsInspected?: unknown } | undefined)?.elementsInspected === "number"
                  ? result.coverage.elementsInspected -
                    Number((previousLedger?.coverage as { elementsInspected: number }).elementsInspected)
                  : null,
            }
          : undefined;
        const summary = summarize(findings);
        const first = !cursor;
        // §10 + §15.8: investigate na ordem do DOM (coverage.componentsFound não é ordenado), 1ª página.
        // 3.5.0 (revisão Fable P1): todos os componentes encontrados, por obrigações/proibições sem medida.
        // 3.7.2 (rastreio dev-371-a §7): os componentes que não estavam no estado anterior escaneado na sessão vêm primeiro.
        // O anterior é o compareToScanId, quando dado (sem inventário de componentes, não há "novo"); senão o scan mais recente
        // do MESMO modelo de rota (revisão MÉDIA 3) que tem inventário: página inteira, com tokens ou structure (revisão MÉDIA
        // 2; o scan só do axe, só de página ou por seletores não inventaria componentes).
        const hasInventory = (s: { title: string | null; checks: string[]; components?: string[] }) =>
          s.title !== null && Array.isArray(s.components) && s.checks.some((c) => c === "tokens" || c === "structure");
        const previousScan = (() => {
          const scans = session.previousScans();
          if (compareToScanId) {
            const s = scans.find((x) => x.scanId === compareToScanId);
            return s && hasInventory(s) ? s : undefined;
          }
          const template = routeTemplateOf(route);
          for (let i = scans.length - 1; i >= 0; i--) if (routeTemplateOf(scans[i].route) === template && hasInventory(scans[i])) return scans[i];
          return undefined;
        })();
        const newComponents = new Set(previousScan ? (result.coverage.componentsFound ?? []).filter((c) => !(previousScan.components ?? []).includes(c)) : []);
        const investigate = hasNorms && first ? investigateFor(result.coverage.componentsFound ?? [], scanId, unmeasuredFor, unmeasuredStrongCount, (c) => investigateClauses(c), newComponents, pageInvestigateClauses(), result.componentLayout) : undefined;
        // 3.6.1 (item 1): cada pendência ganha um id de sessão e volta em todo scan até ser resolvida.
        const titleNote = sameTitle.length ? `; o mesmo <title> de ${sameTitle.slice(0, 2).map((s) => routeLabel(s.route)).join(", ")} (achado ds-page-title)` : "";
        const notJudged = (result.notJudged ?? []).map((i) => (i.code === "document-title-adequacy" && titleNote ? { ...i, observed: `${i.observed ?? ""}${titleNote}` } : i));
        // 3.7.5 (item 6; pre.2): cada componente que o scan põe no investigate e que tem, na base, cláusulas de uso/juízo que
        // obrigam, proíbem ou desaconselham abre UMA pendência de leitura na sessão; as ainda não lidas desta página saem numa
        // linha só, depois das demais pendências. Os ids a ler (get_ds_rules{ids} por componente) ficam numa observação do
        // ledger, com todas as pendências de leitura abertas na sessão.
        // 3.7.8 (N5): este scan mediu um estado aberto (controle aberto no estado, ou a receita clicou nele): fecha a
        // pendência state-unscanned desse gatilho nesta rota, antes de registrar as deste estado.
        // 3.7.9 (D3): fecha só se este scan rodou pelo menos os checks do scan que abriu a pendência; senão diz o que falta.
        // 3.7.10 (D5): os checks se somam entre scans do MESMO estado (rota + fingerprint) na sessão.
        // Só o escopo inteiro conta (revisão de 3c21aa1): sem selectors; structure sem components; tokens com todos os tokenChecks.
        const fullScope = selectors?.length ? [] : executedChecks.filter((c) =>
          (c !== "structure" || !components?.length) && (c !== "tokens" || !tokenChecks || ["color", "font", "radius", "spacing"].every((t) => (tokenChecks as string[]).includes(t))));
        // 3.7.11 (2ª revisão MED 4): os subchecks de tokens também se somam (tokens.color…); a união inteira conta como tokens.
        const tokenSubs = selectors?.length || !executedChecks.includes("tokens") ? [] : ((tokenChecks as string[] | undefined) ?? ["color", "font", "radius", "spacing"]).map((t) => `tokens.${t}`);
        const ranOnState = session.checksRunOnState(route, result.stateFingerprint, scanId, [...fullScope, ...tokenSubs]);
        const states = hasNorms
          ? session.resolveStatesSeen(route, result.disclosuresOpened ?? [], scanId,
              (actions ?? []).flatMap((a) => (a.action === "click" ? [a.selector] : [])), Object.keys(ranOnState))
          : { closed: [], incomplete: [] };
        const statesSeen = states.closed;
        // 3.7.9 (D2): estado já visto aberto nesta rota nasce fechado; (D1) estados e campos de arquivo primeiro no ledger e
        // na linha (a página do next começa por eles).
        const regularItems = hasNorms ? settleStateItems(route, withPendingIds(scanId, route, notJudged), executedChecks, scanId, compareToScanId) : [];
        // 3.7.6 (item 3): observação que já traz norma obrigatória/proibitiva vira pendência `O-NN` (espaço próprio, depois
        // das de sempre), não só contagem em observations.byKind.
        const observedItems = hasNorms ? withPendingIds(scanId, route, observedRequiredItems(result.observations)) : [];
        // 3.7.8 (teste à mão da 3.7.7, H1): no ledger, cada pendência leva o seu pendingId — as P-NN e as O-NN (que antes
        // nem estavam na página para onde a forma compacta aponta) — e a observação de onde a O-NN nasceu também o leva.
        // O prefixo (as observações do scan) não muda de tamanho: os cursores de sempre continuam valendo.
        if (hasNorms) {
          const observedPid = new Map(observedItems.map((i) => [i.subject, i.pendingId as string]));
          const tagged = result.observations.map((o) => {
            const subject = observedSubjectOf(o);
            const pid = subject ? observedPid.get(subject) : undefined;
            return pid ? { ...o, data: { ...(o.data ?? {}), pendingId: pid } } : o;
          });
          observationStore.set(scanId, [...tagged, ...notJudgedObservations(regularItems, url, true), ...notJudgedObservations(observedItems, url, true)]);
        }
        const usageComponents = investigate ? [...new Set([...investigate.items.map((i) => i.component), ...(investigate.more?.components ?? [])])] : [];
        const usageOpen = usageComponents.flatMap((component) => {
          const ids = usageClauseIds(component);
          if (!ids.length) return [];
          const entry = session.registerUsage(component, route, scanId, ids);
          return entry.status === "open" ? [{ id: entry.id, component }] : [];
        });
        const ledger = observationStore.get(scanId);
        const usageSession = session.open().filter((e) => e.usage);
        const usageLedger = ledger && usageSession.length ? { scanId, cursor: ledger.length } : undefined;
        if (ledger && usageLedger) {
          // 3.7.8 (teste à mão da 3.7.7, H2): as desta rota primeiro (a linha usage-unread aponta para o início); as abertas só
          // em outras rotas vêm depois, marcadas com a rota e o scan de origem (não são desta página).
          const here = (e: (typeof usageSession)[number]) => (e.routes.includes(route) ? 0 : 1);
          const ordered = [...usageSession].sort((x, y) => here(x) - here(y) || Number(x.id.slice(2)) - Number(y.id.slice(2)));
          ledger.push(...usageLedgerObservations(ordered.map((e) => ({
            id: e.id, component: e.usage!.component, calls: usageReadCalls(e.usage!.ids),
            ...(here(e) ? { route: e.route, scanId: e.scans[0] } : {}),
          })), url));
        }
        const usageItem = usageLedger ? usageUnreadItem(usageOpen, usageLedger) : undefined;
        // Registradas depois das demais: os ids das pendências de sempre não mudam por causa desta.
        const pageItems = [...regularItems, ...observedItems, ...(usageItem ? [usageItem] : [])];
        const currentCodes = new Set<string>(pageItems.map((i) => i.code));
        const sessionPending = hasNorms && first
          ? sessionPendingBlock(session.open(), new Set([...pageItems.map((i) => i.pendingId as string), ...usageOpen.map((u) => u.id)]), (c) => session.textDelivered(c) || currentCodes.has(c), true, route, session.unregisteredCounts(),
              usageLedger ? { tool: "get_finding_details", arguments: { scanId, view: "observations", cursor: usageLedger.cursor } } : undefined)
          : undefined;
        const units = first ? unitsBlock(route, result.stateFingerprint) : undefined;
        // 3.7.6 (item 1): os componentes desta página com linhas de especificação mensuráveis por parte, os desvios já
        // medidos (item 2) e a chamada que traz as linhas — na ordem do investigate.
        const specification = hasNorms && first
          ? specificationFor(
              [...new Set([...usageComponents, ...(result.coverage.componentsFound ?? [])])],
              (c) => measurableSpecRows(c).length,
              result.observations,
            )
          : undefined;
        session.recordScan({ scanId, route, fingerprint: result.stateFingerprint, title, heading, checks: executedChecks, components: result.coverage.componentsFound ?? [] });
        const revisited = first ? revisitedBlock(result.revisited) : undefined;
        const head = {
          contract: CONTRACT,
          kind: "scan",
          url,
          status: result.status,
          scanId,
          stateFingerprint: result.stateFingerprint,
          state: boundStrings(result.state),
          cacheHit: result.cacheHit,
          ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
          coverage: boundStrings(result.coverage),
          ...(pendingResolution ? { pendingResolution } : {}),
          ...(statesSeen.length ? { statesScanned: statesSeen } : {}),
          ...(states.incomplete.length ? { statesIncomplete: states.incomplete, statesIncompleteNote: "estado aberto escaneado com checks a menos que o scan que abriu a pendência: continua aberta; repita a receita com os checks que faltam (missing)." } : {}),
          checksRun: {
            ...checksRunFor(
              { url, selectors, checks, tokenChecks, components, actions, ...(arrival ? { arrival } : {}) },
              result.coverage,
              result.state.observed.viewport,
              false,
              result.revisited,
              hasNorms && first && pageItems.some((i) => i.code === "state-unscanned" && i.resolved === undefined),
              ranOnState,
              scanId,
            ),
            // 3.5.0 (D-155 item 1, revisão Fable P8): o que foi medido no nível da página e o que está nela e
            // nenhum check julgou — pendências, nunca veredito. 3.6.1: com pendingId e a cláusula (força e texto).
            // 3.6.1 (revisão H1): o texto da cláusula só enquanto não foi entregue nesta sessão; depois, só o id.
            ...(hasNorms && first ? { pageLevel: { ...pageLevelBlock(executedChecks, capStateItems(pageItems, { scanId, cursorOf: (id) => { const k = regularItems.findIndex((i) => i.pendingId === id); return k < 0 ? undefined : result.observations.length + k; } }), Boolean(components?.length), (c) => !session.textDelivered(c)), full: { tool: "get_finding_details", arguments: { scanId, view: "observations", cursor: result.observations.length } } } } : {}),
          },
          ...(sessionPending ? { sessionPending } : {}),
          ...(revisited ? { revisited } : {}),
          summary,
          deduplication: result.deduplication,
          ...(stateDiff ? { stateDiff } : {}),
          ...(units ? { units } : {}),
          ...(investigate ? { investigate } : {}),
          ...(specification ? { specification } : {}),
          // S-09: zero achados (ou poucos) nunca é conformidade.
          absenceNote: ABSENCE_NOTE,
        };
        const response = assembleScan(head, first ? result.observations : null, scanId, maxChars ?? SCAN_DEFAULT_MAX_CHARS, (budget) =>
          batchView(findings, result.stateFingerprint, { view, detail, cursor, limit, maxChars: budget, memberLimit }, scanId),
          { firstScanPage: first, ...(hasNorms && first ? { clauseCandidates: reserveCandidates([
            ...(investigate?.items ?? []).map(i => i.component), ...(investigate?.more?.components ?? []),
          ]), contextDelivered: (key: string, ranges?: Array<{ start: number; end: number }>) => session.contextDelivered(key, ranges),
          clauseDelivered: (id: string) => session.clauseDelivered(id) } : {}) },
        );
        markDeliveredTexts(response);
        markDeliveredContexts(response, scanId);
        // 3.7.6-pre.2 (revisão MED): as `O-NN` que esta resposta mostra ficam entregues (a leitura por id depois as fecha).
        // 3.7.11 (auditoria V-3): só com a norma ou a condição junto (o id sozinho não diz o que ler).
        if (response.kind !== "error") session.markObservedDeliveredIn(response);
        if (response.kind === "error") return fail(response as ContractError);
        return ok(response);
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
          .describe("Ações reproduzidas nesta mesma página antes do fingerprint e da varredura. click/fill/press/upload/drop com seletor exigem exatamente um elemento: zero ou mais de um interrompem a receita e o estado fica não alcançado"),
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
            ...comparePage(previousLedger, url),
            findings: stateDiffFindings(scanId, compareToScanId, previousFindings, result.findings, previousLedger, ["axe"], selectors ?? []),
          }
        : undefined;
      // 3.6.1 (itens 1, 5, 6): pendências do axe (contraste não decidido, só o critério WCAG), repetidas até a
      // resolução por verify_finding, e a separação por rota/estado. Nada da base de conhecimento.
      const route = routeKeyOf(result.state.observed.url);
      const first = !cursor;
      // 3.7.8 (paridade de perfil, N5): o estado aberto escaneado fecha a pendência state-unscanned, como no perfil completo.
      const statesSeen = session.resolveStatesSeen(route, result.disclosuresOpened ?? [], scanId,
        (actions ?? []).flatMap((a) => (a.action === "click" ? [a.selector] : [])), ["axe"]).closed;
      const pageItems = settleStateItems(route, withPendingIds(scanId, route, result.notJudged ?? []), ["axe"], scanId, compareToScanId);
      // 3.7.3 A6: a continuação sugerida pelo teto recupera só as pendências do axe deste lote.
      // Não reutilizar observações dos scanners com conhecimento no perfil knowledge-free.
      observationStore.set(scanId, notJudgedObservations(pageItems, url));
      const sessionPending = first
        ? sessionPendingBlock(session.open(), new Set(pageItems.map((i) => i.pendingId as string)), () => true, false, route)
        : undefined;
      const units = first ? unitsBlock(route, result.stateFingerprint) : undefined;
      session.recordScan({ scanId, route, fingerprint: result.stateFingerprint, title: null, checks: ["axe"] });
      const head = {
        contract: CONTRACT,
        kind: "scan",
        url,
        status: result.status,
        scanId,
        stateFingerprint: result.stateFingerprint,
        state: boundStrings(result.state),
        cacheHit: result.cacheHit,
        ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
        coverage: boundStrings(result.coverage),
        ...(statesSeen.length ? { statesScanned: statesSeen } : {}),
        checksRun: {
          ...checksRunFor({ url, selectors, actions, ...(arrival ? { arrival } : {}) }, result.coverage, result.state.observed.viewport, true, undefined,
            pageItems.some((i) => i.code === "state-unscanned" && i.resolved === undefined)),
          ...(first && pageItems.length ? { pageLevel: pageLevelBlockKnowledgeFree(capStateItems(pageItems, { scanId, cursorOf: (id) => { const k = pageItems.findIndex((i) => i.pendingId === id); return k < 0 ? undefined : k; } })) } : {}),
        },
        ...(sessionPending ? { sessionPending } : {}),
        summary: summarize(result.findings),
        deduplication: result.deduplication,
        ...(stateDiff ? { stateDiff } : {}),
        ...(units ? { units } : {}),
        absenceNote: ABSENCE_NOTE_KNOWLEDGE_FREE,
      };
      const response = assembleScan(head, null, scanId, maxChars ?? SCAN_DEFAULT_MAX_CHARS, (budget) =>
          batchView(result.findings, result.stateFingerprint, { view, detail, cursor, limit, maxChars: budget, memberLimit }),
          { firstScanPage: !cursor },
        );
      return response.kind === "error" ? fail(response as ContractError) : ok(response);
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
        // 3.4.4 (C3/C4): fora da autoria da página (web component do DS, terceiros, não renderizado) → observação.
        const scope = partitionByOwnership(evidence.elements, true);
        const rawFindings = checkTokenCompliance({ url }, scope.page, getTokenRegistry(), activeChecks);
        const observations = [
          ...(activeChecks.includes("font") ? collectTokenObservations({ url }, scope.page, getTokenRegistry()) : []),
          ...demoteToObservations(checkTokenCompliance({ url }, scope.outside, getTokenRegistry(), activeChecks), scope.outside),
        ];
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

        // 3.4.4 (C3/C5): internos de web component do DS e terceiros embutidos pelo DS → observação.
        const scope = partitionByOwnership(evidence.elements, false);
        const outside = targets.map((name) => (specs[name] ? splitOutside(checkComponentStructure({ url }, scope.outside, specs[name]), scope.outside) : { findings: [], observations: [] }));
        const rawFindings = [
          ...targets.flatMap((name) => {
            const spec = specs[name];
            if (!spec) return [];
            return checkComponentStructure({ url }, scope.page, spec);
          }),
          ...outside.flatMap((o) => o.findings),
        ];
        // Canal separado, fora da pontuação (D-27): o que se observa mas não se pode afirmar.
        const observations = targets.flatMap((name) => {
          const spec = specs[name];
          if (!spec) return [];
          return collectStructureObservations({ url }, evidence.elements, spec);
        }).concat(outside.flatMap((o) => o.observations));

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
            ...(result.incompleteRules.length ? { incompleteRules: result.incompleteRules } : {}),
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
        view: z.enum(["findings", "families", "observations", "diff"])
          .optional()
          .describe(
            "families (padrão): agrupa instâncias idênticas (mesma norma, tipo, propriedade, estado e evidência) com contagem, " +
              "um exemplo, vereditos por membro e ids com cursor. findings: a página plana de findings. " +
              (knowledgeFree ? "observations: as pendências do axe deste scan (fora da pontuação), completas, por cursor. " : "observations: as observações do scan (fora da pontuação), completas, por cursor. ") +
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
          const page = observationPage(observationStore.get(scanId) ?? [], scanId, cursor ?? 0, budget);
          // A6: budgetPage preserva o primeiro item inteiro. Se não cabe, o novo caminho sem conhecimento
          // recusa com continuação explícita, sem truncar medidas nem exceder o teto pedido.
          if (knowledgeFree && textSize(page) > budget) return fail({
            error: "A observação completa não cabe no orçamento pedido. Repita com o orçamento indicado.",
            errorCode: "invalid-argument",
            field: "maxChars",
            next: [step("request-detail", "recupere a mesma observação sem cortar evidência", "get_finding_details", {
              scanId, view: "observations", cursor: cursor ?? 0, maxChars: Math.min(100_000, textSize(page)),
            })],
          });
          // 3.7.11 (auditoria V-3): a página do ledger que traz a O-NN com a norma também a entrega.
          session.markObservedDeliveredIn(page);
          return ok(page);
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
        // 3.3.0 (N-10): o mesmo id pedido duas vezes vem uma vez.
        const { found, missing: missingAll } = ids ? findingStore.get([...new Set(ids)]) : { found: batch ?? [], missing: [] };
        // 3.3.0 (N-01): ids ausentes ecoados com teto (≤ 20, cada um ≤ 80). O esquema não muda (o sha do
        // tools/list do knowledge-free fica fixo); scanId/familyId desconhecidos saem por fail(), que corta o eco.
        const missing = missingAll.slice(0, 20).map((id) => clip(id, 80));
        const familyView = view as "findings" | "families" | undefined;
        // Revisão da 3.0.0 (M3): o ledger (estado, cobertura) entra na conta do orçamento; na
        // continuação ele não se repete (já veio na 1ª página).
        const head = {
          contract: CONTRACT,
          kind: "finding-details",
          requested: ids ? new Set(ids).size : found.length,
          ...(scanId ? { scanId } : {}),
          ...(ledger && !cursor ? { ledger } : {}),
          missing,
          ...(missingAll.length > missing.length ? { missingOmitted: missingAll.length - missing.length } : {}),
          // 3.7.2: ids de rotas diferentes no mesmo pedido — um cartão por rota.
          ...((() => {
            // revisão BAIXA 6: só na 1ª página (a continuação não repete o aviso)
            const warning = ids && !cursor ? idsRoutesWarning(found) : undefined;
            return warning ? { routesWarning: warning } : {};
          })()),
          ...(missing.length
            ? {
                missingNote:
                  "Ids de finding só valem na sessão MCP em que foram gerados; depois de um reinício, o mesmo id pode nomear outro achado. Rode scan_page nesta sessão.",
              }
            : {}),
        };
        const details = assembleScan(head, null, scanId ?? "", budget, (pageBudget) =>
            scanId
              ? batchView(found, stateFingerprint, { view: familyView, detail: detail ?? "summary", cursor, limit, maxChars: pageBudget, memberLimit }, scanId)
              : buildFindingPage(found, { detail: detail ?? "evidence", cursor, limit, maxChars: pageBudget, recipeActionsOf: recipeActionsOfFinding }),
        );
        if ((details as { kind?: string }).kind !== "error") session.markObservedDeliveredIn(details);
        return ok(details);
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
      // 3.6.3 (D-155; rastreio dev-362-b-01 §1; revisão MEDIUM 1): um fato por rota/estado. Recusa a evidência que afirma
      // um fato com membros de rotas diferentes, ou membros de estados diferentes sem relação antes/depois declarada; o
      // achado de outro estado da mesma rota e a relação declarada passam, com stateWarning.
      const sessionScans = pageScanStates();
      const states = mixedStateVerdict(stateReferences(finding as Finding, scanId, sessionScans, (id) => findingStore.get([id]).found[0]), sessionScans);
      if (states.refuse) {
        const groups = states.refuse.groups;
        return fail({
          error: states.refuse.reason === "routes"
            ? `O achado afirma um fato com evidência de ${groups.length} rotas diferentes: um achado é de uma rota só, e a evidência de uma não vale pela outra. Nada foi verificado.`
            : `Os membros em evidence.data são de ${groups.length} estados diferentes, sem relação antes/depois declarada (before/after): um achado é de um estado só. Nada foi verificado.`,
          errorCode: "mixed-states",
          field: states.refuse.reason === "routes" && scanId ? "scanId" : "finding.evidence.data",
          groups,
          next: groups.map((g) =>
            step("request-detail", `um achado só com o que é de ${g.route} (${g.cited.join(", ")}), verificado com scanId ${g.scanIds[0]}`, "verify_finding", { scanId: g.scanIds[0] }),
          ),
        });
      }
      const stateWarning = states.warning
        ? { note: "A evidência cita mais de um estado da mesma rota (ou uma relação antes/depois declarada): a verificação vale para o estado reproduzido (scanId/actions), não para os outros.", groups: states.warning }
        : undefined;
      // 3.4.4 (C9): o achado do próprio scanner volta sem edição. A projeção compacta do scan não traz
      // evidence.data (expectedCondition e os campos da condição); com o id de um achado do ledger desta
      // sessão — mesma norma e mesmo localizador —, os campos que faltam são herdados do achado guardado
      // e a resposta diz quais. O que o agente enviou prevalece.
      let candidate = finding as Finding;
      let inherited: { findingId: string; fields: string[] } | undefined;
      if (typeof candidate.id === "string") {
        const stored = findingStore.get([candidate.id]).found[0];
        if (
          stored &&
          stored.rule.id === candidate.rule.id &&
          stored.rule.source === candidate.rule.source &&
          stored.element.locator === candidate.element.locator &&
          stored.evidence.data
        ) {
          const sent = (candidate.evidence?.data ?? {}) as Record<string, unknown>;
          const fields = Object.keys(stored.evidence.data).filter((k) => !(k in sent));
          if (fields.length) {
            candidate = { ...candidate, evidence: { ...candidate.evidence, data: { ...stored.evidence.data, ...sent } } };
            inherited = { findingId: stored.id, fields };
          }
          // 3.6.0: o check que mediu (rule.checker) também é herdado quando o agente copiou só a norma citada.
          if (stored.rule.checker !== undefined && candidate.rule.checker === undefined) {
            candidate = { ...candidate, rule: { ...candidate.rule, checker: stored.rule.checker } };
            inherited = { findingId: stored.id, fields: [...(inherited?.fields ?? []), "rule.checker"] };
          }
        }
      }
      const verification = await verifyFinding({
        finding: candidate,
        live: live ?? false,
        actions,
        stateFingerprint,
        arrival,
        scanState,
        ...(knowledgeFree ? { knowledgeFree: true } : {}),
      });
      const stored = verificationStore.record(candidate, verification);
      // 3.6.5 (D-155, item 1): o passo de interação que leva ao estado do fato, depois das ações da receita — a forma
      // de state.steps do cartão. Nos perfis com normas; o knowledge-free fica como estava.
      const recipeActions = (scanState?.recipe.actions ?? actions ?? []) as PageAction[];
      const interaction = knowledgeFree ? undefined : interactionOf(candidate, recipeActions);
      // Reexecução 3.6.5: o bloco só vai para achado mode:"interaction" que precisa de passo, ou cujo passo o oráculo não
      // sabe. Fato da marcação (axe, estrutura, ordem de foco depois de ações) não ganha bloco.
      // 3.6.6 (revisão da 3.6.5, ALTA 1): "unknown" vira needed:false SÓ quando o predicado DECIDIU no estado desta receita
      // (violação verificada ou contradita): então a receita leva ao fato. A condição contextual com ações não basta — a
      // receita pode não chegar ao fato (só abrir a modal, sem fechá-la; nenhum Tab dentro dela; passo quebrado). Estado não
      // alcançado, predicado sem decisão ou sem predicado: needed:"unknown" com `missing` = o que faltou observar (a nota que
      // impediu a decisão: o detalhe do predicado ou a limitação do estado).
      // Revisão da 3.6.6 (MÉDIA 1): sem decisão, o pedido de passo (needed:"unknown", stateSteps, nota "sem o passo, o fato
      // não aparece") só vale quando a falta é da RECEITA — estado não alcançado/não reproduzido (sem live, nem tentado), alvo
      // ausente no estado, ou o predicado contextual diz que não observou o que precisa (abrir, fechar, Tab, a última ação):
      // motivo estruturado `recipeGap` do gate/predicado, não o texto. Nos demais (sujeito que não é o da condição, norma sem
      // predicado, ambiguidade com o fato no DOM), a receita alcançou o estado: needed:false com o motivo neutro em `missing`.
      const violation = verification.checks?.violation;
      const decided = violation === "verified" || violation === "contradicted";
      const decisive = decisiveNoteOf(verification);
      const reached = (verification.binding?.state as { reached?: unknown } | undefined)?.reached === true;
      const recipeGap = decisive?.recipeGap === true || !reached;
      const missing = decisive?.note ? { missing: clip(decisive.note, 300) } : {};
      const interactionBlock = !interaction || interaction.needed === false
        ? undefined
        : interaction.needed === "unknown" && decided
          ? {
              needed: false,
              text: violation === "verified"
                ? "o predicado confirmou o fato no estado desta receita: ela basta como state.steps"
                : "o predicado decidiu no estado desta receita (o fato não se sustenta nele): a receita leva ao estado; nenhum passo a mais",
            }
          : interaction.needed === "unknown" && !recipeGap
            ? {
                needed: false,
                text: "a receita alcança o estado; o predicado não decidiu por outro motivo (missing), não por falta de passo",
                ...missing,
              }
            : interaction.needed === "unknown"
              ? {
                  needed: "unknown" as const,
                  steps: [],
                  text: verification.binding?.live
                    ? "a receita não levou ao que o predicado observa: complete-a com o que falta (missing) e verifique de novo"
                    : interaction.text,
                  ...missing,
                  stateSteps: [...recipeActions],
                  note: INTERACTION_NOTE,
                }
              : { needed: interaction.needed, steps: interaction.steps, text: interaction.text, stateSteps: [...recipeActions, ...interaction.steps], note: INTERACTION_NOTE };
      // 3.6.1 (D-155, item 1): verificar uma das normas de uma pendência, na rota dela, a resolve (qualquer veredito).
      // 3.7.7 (D-32): o verify que MEDIU cada elemento (sem decidir a violação) conta como decisão do elemento para a O-NN.
      // 3.7.7 (revisão MED-3): para a O-NN, só a decisão do PREDICADO no elemento (verified/contradicted) ou a medida conta —
      // um rejected por evidência incoerente (observed errado) não mediu nada e não fecha. As demais pendências, como antes.
      const decision = verification.issue === "measured-not-decided" && verification.measured?.length
        ? "measured"
        : decided ? verification.verdict : null;
      const { resolved: pendingResolved, partial: pendingPartial } = session.resolveByVerifyDetailed(candidate, stored.verificationId, verification.verdict, { live: verification.binding?.live === true, reached, actions: recipeActions.length, decision });
      // 2.15.0: veredito que não decide (sem predicado, regra sem norma, estado não reproduzido) não
      // desmente o fato medido — a nota fixa diz isso em todo `unverifiable`, nos dois perfis.
      // 3.0.0 (§11): campos de leitura ao lado do objeto verification, que continua inteiro.
      return ok({
        ...verificationEnvelope(candidate, verification, {
          verificationId: stored.verificationId,
          knowledgeFree,
          ...(scanId ? { scanId } : {}),
          ...(inherited ? { inheritedFromLedger: { ...inherited, note: "Campos que faltavam no payload (evidence.data; 3.6.0: rule.checker) foram herdados do achado guardado nesta sessão (mesma norma e localizador)." } } : {}),
          ...(verification.verdict === "unverifiable" ? { absenceNote: knowledgeFree ? ABSENCE_NOTE_KNOWLEDGE_FREE : ABSENCE_NOTE } : {}),
        }),
        ...(stateWarning ? { stateWarning } : {}),
        ...(interactionBlock ? { interaction: interactionBlock } : {}),
        ...(pendingResolved.length ? { pendingResolved } : {}),
        // 3.7.4 (D2): pendência de N elementos com só parte decidida — continua aberta (mesmo pendingId) com os que faltam.
        ...(pendingPartial.length
          ? { pendingPartial: pendingPartial.slice(0, 5).map((p) => ({
                id: p.id,
                decided: p.decided.slice(-3).map((l) => clip(l, 120)),
                decidedCount: p.decided.length,
                remaining: p.remaining.slice(0, 5).map((l) => clip(l, 120)),
                remainingCount: p.remaining.length,
              })),
              pendingPartialNote: "Este verify decidiu só os elementos em decided; a pendência segue aberta até cada elemento em remaining ser verificado (ou declarado em pendingResolved)." }
          : {}),
        // 3.6.3 (revisão HIGH 1): a mesma pendência em outras rotas segue aberta até ser medida lá.
        ...(pendingResolved.length && session.stillOpen(pendingResolved).length ? { pendingStillOpen: session.stillOpen(pendingResolved) } : {}),
      });
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
      // 3.3.0 (S-07): a página do relatório é uma URL http(s) absoluta; ids repetidos contam uma vez;
      // achados de outra página não entram.
      if (scanPageKey(url) === null || !/^https?:$/.test(new URL(url).protocol)) {
        return fail({
          error: `url '${url.slice(0, 200)}' não é uma URL http(s) absoluta; o relatório não foi salvo.`,
          errorCode: "invalid-url",
          field: "url",
          next: [step("fix-input", "repita com a URL da página validada (a mesma do scan_page)", "save_report")],
        });
      }
      const stored = findingStore.get([...new Set(finding_ids ?? [])]);
      if (stored.missing.length) {
        return sessionFailure("Alguns finding_ids não existem nesta sessão MCP; o relatório não foi salvo.", "missing-finding-ids", "finding_ids", {
          missingFindingIds: stored.missing.slice(0, 50),
        });
      }
      const otherPage = stored.found.filter((f) => !sameScanPage(f.element.page, url));
      if (otherPage.length) {
        return fail({
          error: `${otherPage.length} finding_ids são de outra página que ${url.slice(0, 200)}; o relatório não foi salvo.`,
          errorCode: "report-page-mismatch",
          field: "finding_ids",
          otherPageIds: otherPage.slice(0, 50).map((f) => f.id),
          next: [step("fix-input", "salve um relatório por página: repita sem esses ids (ou com a url da página deles)", "save_report")],
        });
      }
      const notesCapped = notes !== undefined && notes.length > REPORT_NOTES_MAX_CHARS ? `${notes.slice(0, REPORT_NOTES_MAX_CHARS)}… [notas truncadas em ${REPORT_NOTES_MAX_CHARS} caracteres]` : notes;
      const { accepted, reviewItems, rejected, normalized, duplicates } = validateFindings(findings ?? [], {
        serverFindings: stored.found,
        verificationFor: (finding) => verificationStore.lookup(finding)?.verification,
        reportUrl: url,
      });
      const report = buildReport(url, accepted, notesCapped, reviewItems);
      const persisted = persistReport(report, reportsDir);
      // N-03: a resposta é um resumo + caminhos, nunca o conteúdo; listas longas vêm cortadas com contagem.
      const brief = <T,>(items: T[], n: number) => items.slice(0, n);
      return ok({
        contract: CONTRACT,
        kind: "report",
        summary: report.summary,
        accepted: accepted.length,
        reviewItems: reviewItems.length,
        rejected: brief(rejected, 20).map((r) => ({ index: r.index, errors: r.errors.slice(0, 3).map((e) => (e.length > 300 ? `${e.slice(0, 299)}…` : e)) })),
        ...(rejected.length > 20 ? { rejectedNotShown: rejected.length - 20 } : {}),
        rejectedTotal: rejected.length,
        ...(normalized.length ? { normalized: brief(normalized, 20), ...(normalized.length > 20 ? { normalizedNotShown: normalized.length - 20 } : {}) } : {}),
        ...(duplicates ? { duplicatesIgnored: duplicates } : {}),
        ...(notesCapped !== notes ? { notesTruncated: true } : {}),
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
