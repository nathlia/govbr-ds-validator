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
import { rankRules, rankingMeta, vocabularyEnabledByDefault, getVocabulary, tokenize } from "./data/retrieval.js";
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

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const StylePropertySchema = z.enum(STYLE_PROPERTIES);

/**
 * 2.15.0: o que um check omitido deixa de medir. Na tela A (ensaio 03) o agente varreu o diálogo com
 * checks ["axe","structure"] e a cor fora da paleta (#334333), que o check tokens acusa nesse estado,
 * não apareceu — e o scan não dizia que tokens não tinha rodado.
 */
const CHECK_OMISSION_WHY = {
  tokens: "cores, fonte, raio e espaçamento fora do registro de tokens do DS não foram medidos neste estado.",
  structure: "a tag raiz e o nome acessível dos componentes br-* não foram conferidos neste estado.",
  axe: "as regras do axe-core (WCAG) não rodaram neste estado.",
  page: "as regiões obrigatórias do Template Base (cabeçalho, rodapé) e o salto para o conteúdo não foram conferidos neste estado.",
} as const;
const TOKEN_CHECK_OMISSION_WHY = {
  color: "cores fora da paleta do DS não foram medidas neste estado.",
  font: "família tipográfica fora da Rawline não foi medida neste estado.",
  radius: "raio de borda fora dos tokens não foi medido neste estado.",
  spacing: "espaçamento fora dos tokens não foi medido neste estado.",
} as const;

/** Checks que NÃO rodaram neste estado, um por linha com o que ficou sem medir. Vazio: nada omitido. */
function checksOmittedFor(
  checks: Array<keyof typeof CHECK_OMISSION_WHY> | undefined,
  tokenChecks: Array<keyof typeof TOKEN_CHECK_OMISSION_WHY> | undefined,
  components: string[] | undefined,
) {
  const omitted: Array<{ check: string; why: string }> = [];
  const active = checks ?? (Object.keys(CHECK_OMISSION_WHY) as Array<keyof typeof CHECK_OMISSION_WHY>);
  for (const check of Object.keys(CHECK_OMISSION_WHY) as Array<keyof typeof CHECK_OMISSION_WHY>) {
    if (!active.includes(check)) omitted.push({ check, why: CHECK_OMISSION_WHY[check] });
  }
  if (active.includes("tokens") && tokenChecks) {
    for (const sub of Object.keys(TOKEN_CHECK_OMISSION_WHY) as Array<keyof typeof TOKEN_CHECK_OMISSION_WHY>) {
      if (!tokenChecks.includes(sub)) omitted.push({ check: `tokens.${sub}`, why: TOKEN_CHECK_OMISSION_WHY[sub] });
    }
  }
  if (active.includes("structure") && components?.length) {
    omitted.push({
      check: "structure.components",
      why: `a estrutura só foi conferida para ${[...components].sort().join(", ")}; os demais componentes br-* não foram conferidos neste estado.`,
    });
  }
  return omitted.length
    ? {
        checksOmitted: {
          note: "Checks que não rodaram neste estado. Zero achados de um check omitido não é ausência de defeito: repita o scan neste estado sem restringir checks para medir.",
          items: omitted,
        },
      }
    : {};
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
      ...(search.match === "literal" ? {} : { ranking: { engine: rankingMeta("off").engine, vocabulary: vocabulary ? getVocabulary().version : "off", match: "relevance" } }),
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

/**
 * Projeção automática no scan_page (perfis com normas): só contagem e a chamada exata que devolve as
 * candidatas para os componentes encontrados. Marcada `retrieval:"automatic"` para separar, na
 * análise, conhecimento empurrado pelo scanner de consulta direta (`retrieval:"direct"`). Não exige
 * nenhuma chamada: é ponteiro, não tarefa. Perfis sem normas (deterministic/evidence) não a recebem.
 */
function normativeContextFor(componentsFound: string[]) {
  const components = [...componentsFound].sort();
  if (!components.length) return {};
  const { normalized, candidates } = contextCandidates({ components }, {});
  const byReason: Record<string, number> = {};
  for (const c of candidates) {
    const kind = c.reasons[0].kind;
    byReason[kind] = (byReason[kind] ?? 0) + 1;
  }
  // 2.12.0: contagem por componente, para o agente ver o tamanho de cada um antes de pedir.
  const byComponent = Object.fromEntries(summarizeGroups(candidates).map((g) => [g.group, g.total]));
  return {
    normativeContext: {
      retrieval: "automatic" as const,
      basis: "coverage.componentsFound",
      components: normalized.components,
      candidates: candidates.length,
      byReason,
      byComponent,
      next: { tool: "get_ds_rules", arguments: { context: { components: normalized.components } } },
      note:
        "Regras candidatas a investigar para os componentes encontrados — pertinência, não defeito nem verificação. " +
        "A resposta alterna os componentes (obrigações primeiro); byComponent dá o tamanho de cada um, e " +
        "context.components com um componente só pagina apenas ele.",
    },
  };
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
  });

  // Phase 2.5 guard: the KB and the installed @govbr-ds/core must describe
  // the same DS release (logs to stderr — stdout is the MCP transport). Sem base no knowledge-free.
  if (!knowledgeFree) warnOnVersionMismatch();

  // ══════════════════════════════════════════════════════════════════════════
  // Oracle knowledge tools (A1–A4)
  // ══════════════════════════════════════════════════════════════════════════

  if (hasNorms) server.registerTool(
    "get_ds_rules",
    {
      title: "Regras atômicas do gov.br DS (knowledge base)",
      description:
        "Busca regras normativas do gov.br DS e e-MAG por filtro ou id. Com query, ordena por relevância (termos combinados, sem acento; component é pista e as regras globais continuam elegíveis) e para no piso de relevância — relevância não é aplicabilidade. Use a projeção breve para triagem e detalhe completo somente para regras candidatas. Com context (componentes/regiões observados, termos de estado), devolve candidatas a investigar com motivo, aplicabilidade desconhecida rotulada e evidência esperada — candidata não é defeito.",
      inputSchema: {
        context: z
          .object({
            components: z
              .array(z.string().min(1).max(60))
              .max(36)
              .optional()
              .describe("Componentes observados (id, classe br-<id> ou nome da página oficial), ex.: coverage.componentsFound do scan_page"),
            regions: z
              .array(z.enum(PAGE_REGIONS as [PageRegion, ...PageRegion[]]))
              .max(PAGE_REGIONS.length)
              .optional()
              .describe("Regiões do Template Base observadas"),
            terms: z
              .array(z.string().min(3).max(60))
              .max(10)
              .optional()
              .describe("Termos do estado/contexto observado, buscados em condições, exceções, evidência esperada, título e regra"),
          })
          .optional()
          .describe("Contexto observado → regras candidatas (componente/região próprios, relatedComponents, termos). Combina com force/category/validationStrategy/standard/query; não com component/id/ids"),
        id: z.string().optional().describe("Id exato de regra (govbr-3.7.0-…) — retorna o registro completo"),
        ids: z
          .array(z.string())
          .min(1)
          .max(20)
          .optional()
          .describe("Até 20 ids exatos em lote; usa detail brief por padrão"),
        component: z.string().optional().describe("Componente: id, classe br-<id> ou nome da página oficial (ex.: 'button', 'br-modal'); nome desconhecido ou vazio é erro com sugestões"),
        category: z
          .enum(["accessibility", "component", "development", "foundation", "page", "pattern", "template"])
          .optional(),
        force: z
          .enum(["required", "prohibited", "recommended", "discouraged", "permitted", "informative", "unclear"])
          .optional()
          .describe("Força normativa ('example' não é aceito aqui — use include_evidence)"),
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
          .optional()
          .describe("Pergunta ou observação em texto livre (até 500 caracteres): busca por relevância (padrão 10 resultados acima do piso)"),
        match: z
          .enum(["relevance", "literal"])
          .optional()
          .describe("'relevance' (padrão) ou 'literal': query como substring exata, sensível a acento, com component como filtro exato (semântica da 2.16.1)"),
        vocabulary: z
          .boolean()
          .optional()
          .describe("Expansões de vocabulário versionadas (PT/EN, nomes HTML/ARIA); padrão ligado. false desliga"),
        include_evidence: z
          .boolean()
          .optional()
          .describe("Anexar fragmentos canônicos (force=example) no campo separado 'evidence'"),
        detail: z
          .enum(["summary", "brief", "full"])
          .optional()
          .describe("Detalhe: 'brief' (padrão das listagens) traz id/título/regra/força/estratégia; 'full' traz o registro projetado inteiro; 'summary' (padrão com context) traz id, motivo, aplicabilidade e passos de evidência — fora de context equivale a brief"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Máximo de regras por página (padrão 40)"),
        offset: z.number().int().min(0).optional().describe("Deslocamento da paginação (padrão 0)"),
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_ds_rules", async ({ id, ids, context, include_evidence, detail, limit, offset, match, vocabulary, ...rawFilter }) => {
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
      inputSchema: {
        query: z.string().optional().describe("Fragmento de nome para filtrar (omitir para destaques semânticos + índice hex)"),
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_design_tokens", async ({ query }) => {
      const registry = getTokenRegistry();
      if (!query) {
        return json({ meta: registry.meta, semantic: registry.semantic, hexLookup: registry.hexLookup });
      }
      const q = query.toLowerCase();
      const matches = Object.fromEntries(Object.entries(registry.all).filter(([k]) => k.toLowerCase().includes(q)));
      return json({ query, count: Object.keys(matches).length, tokens: matches });
    })
  );

  if (hasNorms) server.registerTool(
    "get_emag_rules",
    {
      title: "Regras e-MAG 3.1",
      description:
        "Consulta recomendações do e-MAG por seção ou id. Sem filtro, retorna somente o índice de seções.",
      inputSchema: {
        section: z.number().min(1).max(6).optional().describe("Seção 1–6"),
        id: z.string().optional().describe("Id de regra específica, ex.: '4.1'"),
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_emag_rules", async ({ section, id }) => {
      const emag = getEmag();
      if (id) {
        const rule = findEmagRule(id);
        if (!rule) return json({ error: `Regra '${id}' não encontrada. Use section para listar ids válidos.`, absenceNote: ABSENCE_NOTE });
        // KB enrichment (Phase 2.6): how to verify this recommendation.
        const template = getEmagValidationTemplate(id);
        const templateRule = template ? getRuleById(template.ruleId) : undefined;
        const templateCitation = template ? {
          id: template.ruleId,
          kind: templateRule?.legacy ? "historical" : templateRule ? "current" : "unresolved",
          ...(templateRule ? { legacyResolution: legacyResolution(templateRule) } : { absenceNote: ABSENCE_NOTE }),
        } : undefined;
        const normativeContext = emagUnits(id);
        const description = id === "3.9" && normativeContext.sourceContext
          ? normativeContext.sourceContext.text : rule.description;
        return json({ ...rule, description, normativeContext, ...(template ? { validationTemplate: { ...template, citation: templateCitation } } : {}) });
      }
      if (section) {
        const found = emag.sections[String(section)];
        return json({ meta: emag.meta, section: found ? { ...found, rules: found.rules.map((rule) => {
          // 2.16.1: a listagem leva só a referência; a descrição contextual da 3.9 continua aqui.
          const units = emagUnits(rule.id);
          return { ...rule, ...(rule.id === "3.9" && units.sourceContext ? { description: units.sourceContext.text } : {}), normativeContext: emagUnitsRef(rule.id) };
        }) } : `Seção ${section} não encontrada`, ...(found ? { normativeContextNote: LIST_CONTEXT_NOTE } : { absenceNote: ABSENCE_NOTE }) });
      }
      return json({
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
      inputSchema: {
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
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_page_rules", async ({ category }) => {
      const pageRules = getPageRules();
      // 2.7.0: as restrições citáveis de página acompanham o índice e as categorias que as sustentam,
      // como as restrições estruturais acompanham get_component_spec (D-29).
      const constraints = pageConstraints();
      if (!category) {
        return json({
          meta: pageRules.meta,
          constraints,
          available: Object.entries(pageRules.categories).map(([key, { label, url }]) => ({ key, label, url })),
        });
      }
      const found = pageRules.categories[category];
      if (!found) return json({ error: `Categoria '${category}' não encontrada.` });
      return json(category === "page_structure" || category === "minimum_standard" ? { ...found, constraints } : found);
    })
  );

  if (toolProfile === "full") server.registerTool(
    "list_components",
    {
      title: "Componentes do gov.br DS",
      description: "Lista os componentes disponíveis no @govbr-ds/core instalado, com classe raiz e tags canônicas.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "list_components", async () => {
      const { meta, components } = getComponentSpecs();
      return json({
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
        "Consulta estrutura, variantes, atributos e tokens de um componente. Exemplos HTML são opcionais e podem conter alertas conhecidos.",
      inputSchema: {
        component: z.string().describe("Nome do componente, ex.: 'button', 'input', 'select'"),
        include_examples: z.boolean().optional().describe("Incluir fragmentos HTML canônicos (padrão: false, até 5)"),
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_component_spec", async ({ component, include_examples }) => {
      const specs = getComponentSpecs();
      const spec = specs.components[component];
      if (!spec) {
        return json({
          error: `Componente '${component}' não encontrado.`,
          available: Object.keys(specs.components),
          absenceNote: ABSENCE_NOTE,
        });
      }
      const includeExamples = include_examples ?? false;
      // Defect awareness (D-10/Phase 2.4): the canonical examples of some
      // components are themselves non-conformant — warn at spec-serving time.
      const defects = getComponentDefects(spec.name);
      // 2.9.0 (NAT-83): a especificação aponta para as regras da base sobre o componente, para que
      // a ligação componente → regra não dependa de o agente lembrar de consultar get_ds_rules.
      const { candidates } = contextCandidates({ components: [spec.name] }, {});
      return json({
        ...spec,
        implementationEvidence: componentProvenance(spec.name),
        constraints: constraintsForComponent(spec),
        rules: {
          retrieval: "automatic",
          note: "Regras da base pertinentes a este componente (próprias ou por relatedComponents) — candidatas, não defeitos. Detalhe e evidência esperada: get_ds_rules com context ou ids.",
          ids: candidates.map((c) => c.rule.id),
          next: { tool: "get_ds_rules", arguments: { context: { components: [spec.name] } } },
        },
        warnings: defects.map((d) => ({
          type: d.type,
          severity: d.severity,
          file: d.file,
          element: d.element,
          evidence: d.evidence,
          note: "Defeito de acessibilidade no exemplo canônico oficial — não trate este fragmento como norma (veja govbr://knowledge/conflicts).",
        })),
        examples: includeExamples ? spec.examples.slice(0, 5) : [],
        availableExamples: spec.examples.map((e) => e.name),
        // 2.15.0: a especificação é extraída dos exemplos estáticos; atributo, regra ou estado que ela
        // não lista (ex.: ARIA escrito em tempo de execução) não é prova de conformidade.
        absenceNote: ABSENCE_NOTE,
      });
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
      inputSchema: {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS único (compatibilidade)"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Seletores CSS avaliados no mesmo carregamento"),
        properties: z
          .array(StylePropertySchema)
          .max(STYLE_PROPERTIES.length)
          .optional()
          .describe("Somente propriedades necessárias; omitir mantém o contrato completo legado"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(telemetry, "inspect_computed_styles", async ({ url, selector, selectors, properties }) =>
      json(await inspectComputedStyles(url, selectorBatch(selector, selectors), properties))
    )
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Deterministic checkers (B1/B2) — findings come out in the D2 schema
  // ══════════════════════════════════════════════════════════════════════════

  if (hasDeterministic) server.registerTool(
    "scan_page",
    {
      title: "Varredura determinística agregada",
      description:
        "Carrega a página uma vez e executa tokens, estrutura, página (regiões obrigatórias do Template Base e salto para o conteúdo) e/ou axe no mesmo estado. Retorna fingerprint, cobertura, cache exato e findings compactos registrados no ledger da sessão. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: {
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
        ...FamilyViewInputShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "scan_page",
      async ({ url, selectors, checks, tokenChecks, components, actions, arrival, compareToScanId, detail, cursor, limit, maxChars, view, memberLimit }) => {
        const previousFindings = compareToScanId ? findingStore.getBatch(compareToScanId) : undefined;
        const previousLedger = compareToScanId ? findingStore.getBatchMetadata(compareToScanId) : undefined;
        if (compareToScanId && !previousFindings) {
          return json({ error: `compareToScanId '${compareToScanId}' não existe nesta sessão MCP.` });
        }
        const result = await scanPage(
          { url, selectors, checks, tokenChecks, components, actions, ...(arrival ? { arrival } : {}) },
          pageScanCache
        );
        if (result.status === "state-not-reached") {
          // 2.10.0: estado não alcançado não vira lote — sem scanId, sem findings, sem cobertura; zero
          // achados aqui seria lido como "sem defeito" num estado que ninguém viu.
          return json({
            url,
            status: result.status,
            scanId: null,
            stateFingerprint: null,
            limitation: result.limitation,
            state: result.state,
          });
        }
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
              findings: diffFindings(previousFindings, result.findings),
              elementsInspectedDelta:
                typeof (previousLedger?.coverage as { elementsInspected?: unknown } | undefined)?.elementsInspected === "number"
                  ? result.coverage.elementsInspected -
                    Number((previousLedger?.coverage as { elementsInspected: number }).elementsInspected)
                  : null,
            }
          : undefined;
        return json({
          url,
          status: result.status,
          scanId,
          stateFingerprint: result.stateFingerprint,
          state: result.state,
          cacheHit: result.cacheHit,
          ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
          coverage: result.coverage,
          ...checksOmittedFor(checks, tokenChecks, components),
          // Fora da pontuação, de propósito (D-27): o que o oráculo observa mas não afirma.
          observations: result.observations,
          summary: summarize(result.findings),
          deduplication: result.deduplication,
          ...(stateDiff ? { stateDiff } : {}),
          // Só na primeira página (cursor ausente ou 0): a continuação não repete o ponteiro.
          ...(hasNorms && !cursor ? normativeContextFor(result.coverage.componentsFound ?? []) : {}),
          ...batchView(result.findings, result.stateFingerprint, { view, detail, cursor, limit, maxChars, memberLimit }),
        });
      }
    )
  );

  if (knowledgeFree) server.registerTool(
    "scan_page",
    {
      title: "Varredura determinística (axe-core)",
      description:
        "Carrega a página uma vez e executa o axe-core no estado reproduzido. Retorna fingerprint, cobertura, cache exato e findings compactos registrados no ledger da sessão. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: {
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
        ...FamilyViewInputShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    tool("scan_page", async ({ url, selectors, actions, arrival, compareToScanId, detail, cursor, limit, maxChars, view, memberLimit }) => {
      const previousFindings = compareToScanId ? findingStore.getBatch(compareToScanId) : undefined;
      const previousLedger = compareToScanId ? findingStore.getBatchMetadata(compareToScanId) : undefined;
      if (compareToScanId && !previousFindings) {
        return json({ error: `compareToScanId '${compareToScanId}' não existe nesta sessão MCP.` });
      }
      const result = await scanPage(
        { url, selectors, actions, ...(arrival ? { arrival } : {}) },
        pageScanCache,
        { knowledgeFree: true }
      );
      if (result.status === "state-not-reached") {
        return json({
          url,
          status: result.status,
          scanId: null,
          stateFingerprint: null,
          limitation: result.limitation,
          state: result.state,
        });
      }
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
            findings: diffFindings(previousFindings, result.findings),
          }
        : undefined;
      return json({
        url,
        status: result.status,
        scanId,
        stateFingerprint: result.stateFingerprint,
        state: result.state,
        cacheHit: result.cacheHit,
        ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
        coverage: result.coverage,
        summary: summarize(result.findings),
        deduplication: result.deduplication,
        ...(stateDiff ? { stateDiff } : {}),
        ...batchView(result.findings, result.stateFingerprint, { view, detail, cursor, limit, maxChars, memberLimit }),
      });
    })
  );

  if (toolProfile === "full") server.registerTool(
    "check_token_compliance",
    {
      title: "Verificação determinística de tokens",
      description:
        "Compara cores, tipografia, raios e espaçamento computados com o registro de tokens. Retorna referências compactas por padrão; use get_finding_details para evidência ou objetos Finding completos. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS único (compatibilidade)"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Seletores CSS verificados no mesmo carregamento"),
        checks: z
          .array(z.enum(["color", "font", "radius", "spacing"]))
          .optional()
          .describe("Subconjunto de verificações (padrão: todas)"),
        ...FindingPageInputShape,
        ...FamilyViewInputShape,
      },
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
        return json({
          url,
          scanId,
          elementsInspected: evidence.count,
          summary: summarize(findings),
          ...(observations.length ? { observations } : {}),
          deduplication: {
            input: deduplication.inputCount,
            output: deduplication.outputCount,
            merged: deduplication.merged,
            key: deduplication.key,
          },
          ...batchView(findings, null, { view, detail, cursor, limit, maxChars, memberLimit }),
        });
      }
    )
  );

  if (toolProfile === "full") server.registerTool(
    "check_component_structure",
    {
      title: "Verificação determinística de estrutura",
      description:
        "Compara elementos br-* com tags, variantes e requisitos de nome acessível da especificação canônica. Retorna referências compactas por padrão; detalhe completo é recuperado por id. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        component: z
          .string()
          .optional()
          .describe("Componente específico (ex.: 'button'). Omitir para validar todos os br-* presentes."),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Seletores CSS verificados no mesmo carregamento"),
        ...FindingPageInputShape,
        ...FamilyViewInputShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "check_component_structure",
      async ({ url, component, selectors, detail, cursor, limit, maxChars, view, memberLimit }) => {
        const specs = getComponentSpecs().components;
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
        return json({
          url,
          scanId,
          componentsFound,
          elementsInspected: evidence.count,
          observations,
          summary: summarize(findings),
          deduplication: {
            input: deduplication.inputCount,
            output: deduplication.outputCount,
            merged: deduplication.merged,
            key: deduplication.key,
          },
          ...batchView(findings, null, { view, detail, cursor, limit, maxChars, memberLimit }),
        });
      }
    )
  );

  if (toolProfile === "full") server.registerTool(
    "run_axe_scan",
    {
      title: "Varredura axe-core",
      description:
        "Executa axe-core e cruza regras compatíveis com o e-MAG 3.1. Retorna referências compactas por padrão e preserva Findings completos para recuperação por id. Por padrão agrupa instâncias idênticas em famílias (contagem, exemplo, ids); os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor); view=findings dá a lista plana.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS único (compatibilidade)"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Subtrees avaliadas na mesma varredura"),
        ...FindingPageInputShape,
        ...FamilyViewInputShape,
      },
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
        return json({
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
          ...batchView(findings, null, { view, detail, cursor, limit, maxChars, memberLimit }),
        });
      }
    )
  );

  if (hasDeterministic || knowledgeFree) server.registerTool(
    "get_finding_details",
    {
      title: "Detalhes de findings já produzidos",
      description:
        "Recupera candidatos por ids ou continua uma página pelo scanId, sem executar novamente o scanner. Use full somente quando o objeto Finding completo for indispensável.",
      inputSchema: {
        ids: z.array(z.string()).min(1).max(50).optional().describe("Finding ids retornados nesta sessão MCP"),
        scanId: z.string().optional().describe("Id do lote retornado por um scanner; use com cursor para continuar sem repetir a varredura"),
        detail: FindingDetailSchema.optional().describe("summary, evidence (padrão para ids) ou full"),
        cursor: FindingPageInputShape.cursor,
        limit: FindingPageInputShape.limit,
        maxChars: FindingPageInputShape.maxChars,
        view: FamilyViewInputShape.view,
        memberLimit: FamilyViewInputShape.memberLimit,
        familyId: z
          .string()
          .optional()
          .describe("Com scanId: pagina os membros de uma família (id, localizador, valor, assinatura, status individual); cursor=nextCursor percorre todos os ids"),
      },
      annotations: { readOnlyHint: true },
    },
    tool(
      "get_finding_details",
      async ({ ids, scanId, detail, cursor, limit, maxChars, view, memberLimit, familyId }) => {
        if ((!ids && !scanId) || (ids && scanId)) {
          return json({ error: "Informe exatamente um de ids ou scanId." });
        }
        if ((familyId || view !== undefined) && !scanId) {
          return json({ error: "familyId e view exigem scanId: a família é uma projeção de um lote." });
        }
        const batch = scanId ? findingStore.getBatch(scanId) : undefined;
        const ledger = scanId ? findingStore.getBatchMetadata(scanId) : undefined;
        if (scanId && !batch) return json({ error: `scanId '${scanId}' não existe nesta sessão MCP.` });
        const stateFingerprint = typeof ledger?.stateFingerprint === "string" ? ledger.stateFingerprint : null;
        if (scanId && familyId) {
          const members = buildFamilyMemberPage(batch ?? [], familyId, {
            detail, cursor, limit, maxChars, stateFingerprint, verificationFor,
          });
          if (!members) return json({ error: `familyId '${familyId}' não existe no lote '${scanId}'.` });
          return json({ scanId, ...members });
        }
        const { found, missing } = ids ? findingStore.get(ids) : { found: batch ?? [], missing: [] };
        return json({
          requested: ids?.length ?? found.length,
          ...(scanId ? { scanId } : {}),
          ...(ledger ? { ledger } : {}),
          missing,
          ...(scanId
            ? batchView(found, stateFingerprint, { view, detail: detail ?? "summary", cursor, limit, maxChars, memberLimit })
            : buildFindingPage(found, { detail: detail ?? "evidence", cursor, limit, maxChars })),
        });
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
      inputSchema: {
        finding: FindingSchemaKnowledgeFree.describe("O achado candidato, no esquema Finding"),
        live: z.boolean().optional().describe("Reabrir a página e verificar cada elemento do localizador (padrão: false)"),
        actions: PageActionsSchema.optional().describe("Ações reproduzidas antes da verificação, quando o estado alegado depende de interação"),
        stateFingerprint: z.string().optional().describe("Fingerprint do estado alegado (de scan_page); se o estado reproduzido for outro, a alegação fica sem verificação (limitação)"),
        arrival: ArrivalSchema.optional().describe("Condições de chegada do estado alegado; não satisfeitas, a alegação fica sem verificação"),
        scanId: z
          .string()
          .optional()
          .describe("scan_page desta sessão cujo estado é o alegado: reaplica a receita gravada e exige a mesma URL, janela e fingerprint. Não envie actions/arrival/stateFingerprint junto"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    } : {
      title: "Portão de verificação anti-alucinação",
      description:
        "Confere em separado: existência da regra num registro versionado, aplicabilidade, consistência dos dados estruturados (property, observed/observedHex ou observedTag e expectedCondition) com cada elemento vivo e, com live, a violação por um predicado implementado em cada elemento do localizador, no estado reproduzido por actions. Dados estruturados ausentes ou sem predicado deixam o resultado unverifiable; dados contraditórios rejeitam; confirmed exige a violação verificada. observed/expected em texto livre são explicações humanas e não são interpretados. O servidor guarda o resultado para este payload exato.",
      inputSchema: {
        finding: FindingSchema.describe("O achado candidato, no esquema Finding"),
        live: z.boolean().optional().describe("Reabrir a página e verificar cada elemento do localizador (padrão: false)"),
        actions: PageActionsSchema.optional().describe("Ações reproduzidas antes da verificação, quando o estado alegado depende de interação"),
        stateFingerprint: z.string().optional().describe("Fingerprint do estado alegado (de scan_page); se o estado reproduzido for outro, a alegação fica sem verificação (limitação)"),
        arrival: ArrivalSchema.optional().describe("Condições de chegada do estado alegado; não satisfeitas, a alegação fica sem verificação"),
        scanId: z
          .string()
          .optional()
          .describe("scan_page desta sessão cujo estado é o alegado: reaplica a receita gravada e exige a mesma URL, janela e fingerprint. Não envie actions/arrival/stateFingerprint junto"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    tool("verify_finding", async ({ finding, live, actions, stateFingerprint, arrival, scanId }) => {
      let scanState: Parameters<typeof verifyFinding>[0]["scanState"];
      if (scanId) {
        if (actions !== undefined || arrival !== undefined || stateFingerprint !== undefined) {
          return json({ error: "scanId já carrega a receita, as condições de chegada e o fingerprint do estado; não envie actions, arrival ou stateFingerprint junto." });
        }
        const ledger = findingStore.getBatchMetadata(scanId);
        const state = ledger?.state as StateAttestation | undefined;
        if (!ledger) return json({ error: `scanId '${scanId}' não existe nesta sessão MCP.` });
        if (!state || typeof ledger.stateFingerprint !== "string") {
          return json({ error: `scanId '${scanId}' não é de scan_page: não tem receita de estado.` });
        }
        if (!sameScanPage(finding.element.page, state.recipe.url)) {
          return json({
            error: `scanId '${scanId}' é de ${state.recipe.url}, mas o achado aponta para ${finding.element.page}: cite o scan da página do achado (barra final e fragmento não contam).`,
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
      return json({
        findingId: finding.id,
        verificationId: stored.verificationId,
        verification,
        ...(verification.verdict === "unverifiable" ? { absenceNote: knowledgeFree ? ABSENCE_NOTE_KNOWLEDGE_FREE : ABSENCE_NOTE } : {}),
      });
    })
  );

  if (toolProfile === "full") server.registerTool(
    "save_report",
    {
      title: "Consolidar e persistir relatório",
      description:
        "Persiste o relatório validado. Reuse finding_ids dos scanners sem reenviar objetos completos; envie findings somente para achados criados pelo agente.",
      inputSchema: {
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
      },
    },
    instrumentTool(telemetry, "save_report", async ({ url, finding_ids, findings, notes }) => {
      const stored = findingStore.get(finding_ids ?? []);
      if (stored.missing.length) {
        return json({
          error: "Alguns finding_ids não existem nesta sessão MCP; o relatório não foi salvo.",
          missingFindingIds: stored.missing,
        });
      }
      const { accepted, reviewItems, rejected } = validateFindings(findings ?? [], {
        serverFindings: stored.found,
        verificationFor: (finding) => verificationStore.lookup(finding)?.verification,
      });
      const report = buildReport(url, accepted, notes, reviewItems);
      const persisted = persistReport(report, reportsDir);
      return json({
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

  if (hasCombinedGate) server.registerPrompt(
    "validate_page",
    {
      title: "Procedimento padronizado de validação",
      description:
        "Procedimento completo de validação de uma página contra o gov.br DS + e-MAG 3.1: coleta determinística, julgamento semântico com via dupla (explícita/heurística com portão de verificação), limite de iterações e relatório no esquema Finding. Somente procedimento — o conhecimento de domínio vem das ferramentas.",
      argsSchema: {
        url: z.string().describe("URL da página a validar"),
        scope: z.string().optional().describe("Componentes a focar, separados por vírgula (ex.: 'button,input')"),
        max_iterations: z.string().optional().describe("Máximo de iterações adicionais (padrão: 2)"),
      },
    },
    ({ url, scope, max_iterations }) => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: buildValidatePagePrompt({ url, scope, max_iterations }) },
        },
      ],
    })
  );

  return server;
}
