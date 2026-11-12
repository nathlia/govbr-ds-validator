/**
 * 3.0.0 (NAT-99): envelopes do contrato para get_ds_rules — busca (`query`/`context`), listagem de
 * catálogo, lote por `ids` e unidade por `id` (§5–§8). O ranking não muda aqui: a ordem que entra é a
 * do motor (retrieval.ts) ou a do adaptador de contexto (applicability.ts); este módulo só decide o
 * que sai, em que formato e dentro de que orçamento.
 */
import { lostExceptionOf } from "../data/lostExceptions.js";
import type { KnowledgeRule, RuleForce } from "../data/knowledge.js";
import { NORMATIVE_FORCES, getKnowledgeBase, isSpecification } from "../data/knowledge.js";
import { normativeUnit, normativeUnitRef, legacyResolution, emagUnits } from "../data/normativeUnits.js";
import { neededStateFor } from "../data/applicability.js";
import { isTableRow, rankRules } from "../data/retrieval.js";
import type { GuidanceConcept } from "../data/guidance.js";
import { componentProvenance } from "../data/componentProvenance.js";
import { ABSENCE_NOTE } from "./absence.js";
import type { RelatedItem } from "../data/relations.js";
import {
  CONTRACT,
  MESSAGES,
  RESPONSE_BUDGET,
  encodeCursor,
  step,
  textSize,
  type MessageCode,
  type NextStep,
} from "./contract.js";

export const RETRIEVAL_DEFAULT_LIMIT = 5;
export const RETRIEVAL_MAX_LIMIT = 10;
export const LISTING_DEFAULT_LIMIT = 20;
export const LISTING_MAX_LIMIT = 50;
export const IDS_MAX_DEFAULT = 10;
export const IDS_MAX_INDEX = 20;
export const CARD_TEXT_MAX = 600;
export const INDEX_TITLE_MAX = 110;
/** 3.3.0 (A-12): modalidade mostrada no cartão de uma linha de tabela. */
export const IMPLEMENTATION_PROPERTY = "propriedade da implementação";
/** 3.7.3 (D-167): modalidade mostrada no cartão de uma unidade de especificação (emenda-2). */
export const SPECIFICATION_MODALITY = "especificação (candidata a investigar)";
/** 3.3.0 (N-02): o rótulo de page.stop mais longo, usado na prova de orçamento. */
const LONGEST_STOP = "relevance-floor";
/** 3.3.0 (N-07): acima disto (JSON dos argumentos), a ambiguidade ecoa os argumentos uma vez só. */
export const AMBIGUITY_INLINE_ARGS_MAX = 200;

const MODALITY: Record<string, string> = {
  required: "obrigação",
  prohibited: "proibição",
  recommended: "recomendação",
  discouraged: "desaconselhado",
  permitted: "permitido",
  informative: "informativo",
  unclear: "indefinido",
  example: "exemplo",
  especificacao: SPECIFICATION_MODALITY,
};

const plain = (text: string) => text.replace(/[*_`]/g, "").replace(/[ \t]+/g, " ").trim();

/** Corte em fronteira de palavra, com reticência; `complete` diz se houve corte. */
function cut(text: string, max: number): { text: string; complete: boolean } {
  if (text.length <= max) return { text, complete: true };
  const slice = text.slice(0, max - 1);
  const space = slice.lastIndexOf(" ");
  return { text: `${(space > max * 0.6 ? slice.slice(0, space) : slice).trimEnd()}…`, complete: false };
}

export function isTitleRecord(rule: KnowledgeRule): boolean {
  return typeof rule.source.section === "string" && plain(rule.originalText) === plain(rule.source.section);
}

function sectionKey(rule: KnowledgeRule): string | null {
  const file = rule.source.corpusFile;
  const path = rule.source.sectionPath;
  return typeof file === "string" && typeof path === "string" ? `${file}#${path}` : null;
}

/**
 * Unidade distinta (§5.2, estreitada na revisão da NAT-99): só se fundem num cartão (a) o registro
 * de título de uma recomendação/seção com o corpo dela e (b) linhas da mesma tabela (API/anatomia).
 * Cláusulas de prosa distintas da mesma seção continuam cartões separados, cada uma com seu citeAs.
 */
export function unitKey(rule: KnowledgeRule): string {
  const section = sectionKey(rule);
  // 3.7.3 (D-167): linhas da mesma tabela de especificação se fundem entre si, nunca com linhas normativas.
  // A seção pode conter várias tabelas (por exemplo, Borda do Header); preserve a identidade da tabela extraída.
  if (isSpecification(rule) && isTableRow(rule.originalText ?? "")) {
    return `spec-table:${rule.specification?.table ?? section ?? rule.id}`;
  }
  if (section && isTableRow(rule.originalText ?? "")) return `table:${section}`;
  return `id:${rule.id}`;
}

function heading(rule: KnowledgeRule): string {
  const section = typeof rule.source.section === "string" ? rule.source.section : null;
  const path = typeof rule.source.sectionPath === "string" ? rule.source.sectionPath.split(" > ") : [];
  if (!section) return path.join(" > ") || rule.title;
  const top = path[0];
  return top && top !== section ? `${plain(top)} > ${plain(section)}` : plain(section);
}

function evidenceState(strategy: string): "observed" | "initial" | "after-interaction" {
  return strategy === "keyboard-interaction" ? "after-interaction" : strategy === "source-code" ? "initial" : "observed";
}

/** `evidence` (≤2): de `expectedEvidence` + `validationStrategy` (§3). */
function evidenceOf(rule: KnowledgeRule) {
  const kind = rule.validationStrategy;
  const state = evidenceState(kind);
  const items = rule.expectedEvidence.length ? rule.expectedEvidence.slice(0, 2) : [neededStateFor(kind)];
  return items.map((what) => ({ kind, what: cut(plain(what), 200).text, state }));
}

function sourceOf(rule: KnowledgeRule) {
  return {
    standard: rule.standard ?? "gov.br Design System",
    version: rule.standardVersion ?? rule.dsVersion,
    url: rule.source.url,
  };
}

/** Uma ocorrência que entrou na lista, com o motivo que o motor ou o adaptador declarou. */
export interface Hit {
  rule: KnowledgeRule;
  matched: string[];
  relation: "component" | "global" | "related";
  field: string | null;
  /** Conflito documentado que nomeia a regra pelo título (conflicts.json), quando houver. */
  conflicts?: unknown[];
  /** 3.3.0 (N-05): termos que casaram só na paráfrase do projeto (normalizedRule), não no texto mostrado. */
  paraphraseOnly?: string[];
}

interface Unit {
  key: string;
  hits: Hit[];
}

export function groupUnits(hits: Hit[]): Unit[] {
  // O título de uma seção se junta à primeira cláusula de prosa (não título, não linha de tabela) da
  // mesma seção presente na lista; sem ela, fica sozinho.
  const bodyOf = new Map<string, string>();
  for (const hit of hits) {
    const section = sectionKey(hit.rule);
    // 3.7.3 (D-167): um título nunca se funde a uma unidade de especificação (o cartão continua citando a norma).
    if (section && !isTitleRecord(hit.rule) && !isSpecification(hit.rule) && !isTableRow(hit.rule.originalText ?? "") && !bodyOf.has(section)) {
      bodyOf.set(section, unitKey(hit.rule));
    }
  }
  const keyOf = (rule: KnowledgeRule) => {
    const section = sectionKey(rule);
    return isTitleRecord(rule) && section && bodyOf.has(section) ? bodyOf.get(section)! : unitKey(rule);
  };
  const units: Unit[] = [];
  const byKey = new Map<string, Unit>();
  for (const hit of hits) {
    const key = keyOf(hit.rule);
    const unit = byKey.get(key);
    if (unit) unit.hits.push(hit);
    else {
      const created = { key, hits: [hit] };
      byKey.set(key, created);
      units.push(created);
    }
  }
  return units;
}

/** Cláusula principal: a primeira que não é só o título da seção (§5.2). */
function mainHit(unit: Unit): Hit {
  return unit.hits.find((h) => !isTitleRecord(h.rule)) ?? unit.hits[0];
}

function unitIds(unit: Unit): string[] {
  const main = mainHit(unit);
  const rest = unit.hits.filter((h) => h !== main);
  return [main.rule.id, ...rest.filter((h) => !isTitleRecord(h.rule)).map((h) => h.rule.id), ...rest.filter((h) => isTitleRecord(h.rule)).map((h) => h.rule.id)];
}

type ToVerify = { text: string; origin: string } | { code: MessageCode; origin: string };

interface CardContext {
  concept: GuidanceConcept | null;
  conceptRef: string | null;
  used: Set<MessageCode>;
}

function toVerifyOf(rule: KnowledgeRule, ctx: CardContext): ToVerify[] {
  const out: ToVerify[] = [];
  const note = ctx.concept?.cardNotes?.[rule.id];
  if (note && ctx.conceptRef) out.push({ text: note.text, origin: ctx.conceptRef });
  for (const condition of rule.conditions) out.push({ text: cut(plain(condition), 240).text, origin: "extracted-condition" });
  for (const exception of rule.exceptions) out.push({ text: cut(plain(exception), 240).text, origin: "extracted-exception" });
  if (!out.length) {
    ctx.used.add("no-declared-condition");
    out.push({ code: "no-declared-condition", origin: "clause" });
  }
  return out.slice(0, 3);
}

function moreOf(rule: KnowledgeRule) {
  return {
    adjacentClauses: normativeUnitRef(rule)?.adjacentClauses ?? 0,
    next: { tool: "get_ds_rules", arguments: { id: rule.id } },
  };
}

function requirementOf(rule: KnowledgeRule, ctx: CardContext) {
  const { text, complete } = cut(plain(rule.originalText), CARD_TEXT_MAX);
  if (!complete) ctx.used.add("text-deferred");
  return { heading: heading(rule), text, complete, ...(complete ? {} : { code: "text-deferred" as const }) };
}

/** Cartão completo (§5.2). `why` só existe quando houve busca. */
function card(unit: Unit, rank: number, ctx: CardContext, withWhy = true, compact = false) {
  const main = mainHit(unit);
  const rule = main.rule;
  const matched = [...new Set(unit.hits.flatMap((h) => h.matched))];
  const literal = new Set(matched);
  const paraphrase = [...new Set(unit.hits.flatMap((h) => h.paraphraseOnly ?? []))].filter((t) => !literal.has(t));
  const spec = isSpecification(rule);
  const table = !spec && isTableRow(rule.originalText ?? "");
  if (table) ctx.used.add("table-row");
  if (spec) ctx.used.add("specification");
  return {
    rank,
    ids: unitIds(unit),
    citeAs: rule.id,
    status: "investigate" as const,
    // 3.3.0 (A-12): linha de tabela de API/anatomia é propriedade da implementação, não obrigação de
    // comportamento — a força da tabela na base não vai para o cartão (o registro por id a mantém).
    // 3.7.3 (D-167): unidade de especificação com a força e a modalidade próprias, nunca obrigação/recomendação.
    ...(spec
      ? { kind: "specification" as const, force: rule.force, modality: SPECIFICATION_MODALITY }
      : table
        ? { kind: "implementation-property" as const, force: null, modality: IMPLEMENTATION_PROPERTY }
        : { force: rule.force, modality: MODALITY[rule.force] ?? "indefinido" }),
    requirement: requirementOf(rule, ctx),
    ...(withWhy
      ? { why: { matched, ...(paraphrase.length ? { matchedInParaphrase: paraphrase } : {}), relation: main.relation, field: main.field } }
      : {}),
    toVerify: compact ? toVerifyOf(rule, ctx).slice(0, 1) : toVerifyOf(rule, ctx),
    evidence: compact ? evidenceOf(rule).slice(0, 1) : evidenceOf(rule),
    applicability: "unknown" as const,
    source: sourceOf(rule),
    more: moreOf(rule),
    ...(main.conflicts?.length ? { conflicts: main.conflicts } : {}),
    ...(table ? { note: { code: "table-row" as const } } : spec ? { note: { code: "specification" as const } } : {}),
    ...(lostExceptionOf(rule) ? { condition: lostExceptionOf(rule) } : {}),
  };
}

export interface KbMeta {
  dsVersion: string;
  knowledgeVersion: string;
  /** Versão do motor léxico. */
  ranking: string;
  vocabulary: string;
  guidance: string;
}

export interface RetrievalInput {
  mode: "query" | "context";
  hits: Hit[];
  /** Posição (em unidades distintas) onde a página começa; 0 = resposta inicial. */
  position: number;
  limit: number;
  /** Argumentos da chamada inicial (sem cursor/offset/limit): base de `next`. */
  args: Record<string, unknown>;
  cursorKey: string;
  kb: KbMeta;
  query: Record<string, unknown>;
  /** Termos sem nenhuma unidade na base (mecânico, §5.3). */
  unmatchedTerms: string[];
  /** 3.3.0 (N-17): "context" = sem candidata no contexto (componentes observados + globais); padrão "kb". */
  unmatchedScope?: "kb" | "context";
  concept: GuidanceConcept | null;
  /** Pista de componente efetiva (null = sem pista): decide ambiguidade e `next` de ausência. */
  componentHint: string | null;
  /** Consulta sem pista e sem filtro `global`: a única que pode ser ambígua (§5.1). */
  ambiguityAllowed: boolean;
  /** Aviso de depreciação do `offset` legado, quando usado. */
  deprecation?: string;
  evidence?: unknown;
  /** Avisos fixos da 1ª página (defeitos dos exemplos, conflitos de página-fonte). */
  warnings?: Record<string, unknown>;
  budget?: number;
  /** 3.4.0 (A12): ligações da camada kb-relations (1ª página), com a versão da camada. */
  related?: { version: string; items: RelatedItem[] };
  /** 3.4.0 (A6): números WCAG do registro para termos sem correspondência (registryRoutes). */
  unmatchedRegistry?: string[];
  /** 3.4.0 (A4): passos de roteamento pela intenção (vão primeiro em next, 1ª página). */
  routing?: NextStep[];
  /**
   * 3.7.2: com `component`, a linha das OUTRAS cláusulas mensuráveis do componente (as que esta página não mostrou) e o
   * checklist — recebe o texto dos cartões mostrados e devolve a linha, ou null.
   */
  componentClauses?: (shownText: string) => string | null;
  /** 3.4.0 (A5): componente em escopo (component, ou o único nomeado no texto); null = nenhum. */
  scopeComponent?: string | null;
  /** 3.4.0 (A7): termos casados só por aproximação. */
  approximations?: Array<{ term: string; as: string; distance: number }>;
  /**
   * 3.7.3 (D-167): unidades de especificação ranqueadas à parte (pool próprio). Vão no bloco `specification` da 1ª
   * página, depois que os cartões das normas já foram escolhidos: o bloco nunca tira uma norma da página nem muda a ordem.
   * `next` = os argumentos da chamada que lista todas (force:"especificacao").
   */
  specification?: { hits: Hit[]; next: Record<string, unknown> };
}

/** 3.7.3 (D-167): teto de cartões no bloco `specification` (uma tabela = um cartão, com os ids das linhas). */
export const SPECIFICATION_BLOCK_MAX = 3;

function groupOf(unit: Unit): string {
  return mainHit(unit).rule.component ?? "global";
}

/** §5.1: ≥ 3 componentes (global conta como grupo) e nenhum grupo com a maioria das unidades. */
export function isAmbiguous(units: Unit[]): boolean {
  if (units.length < 3) return false;
  const counts = new Map<string, number>();
  for (const unit of units) counts.set(groupOf(unit), (counts.get(groupOf(unit)) ?? 0) + 1);
  if (counts.size < 3) return false;
  return Math.max(...counts.values()) * 2 <= units.length;
}

function registryChecked(refs: Array<{ ref: string; name: string }>, wcagNames: Map<string, string>) {
  return refs
    .filter((r) => r.ref.startsWith("wcag:") && wcagNames.has(r.ref.slice(5)))
    .map((r) => ({ ref: r.ref, name: wcagNames.get(r.ref.slice(5)) ?? r.name, status: "registry-only" as const, note: MESSAGES["registry-ref"] }));
}

export function retrievalResponse(input: RetrievalInput, wcagNames: Map<string, string>, ruleExists: (id: string) => boolean) {
  const budget = input.budget ?? RESPONSE_BUDGET;
  // 3.3.0 (A-12): linhas de tabela (API/anatomia) depois de toda cláusula de prosa da resposta (ordem estável).
  const grouped = groupUnits(input.hits);
  // 3.7.3 (D-167): a linha de tabela de ESPECIFICAÇÃO fica na ordem do ranking (é o que a emenda-2 tornou citável).
  const isRow = (u: Unit) => !isSpecification(mainHit(u).rule) && isTableRow(mainHit(u).rule.originalText ?? "");
  const units = [...grouped.filter((u) => !isRow(u)), ...grouped.filter(isRow)];
  const first = input.position === 0;
  const ctx: CardContext = {
    concept: input.concept,
    conceptRef: input.concept ? `${input.kb.guidance}#${input.concept.id}` : null,
    used: new Set(),
  };

  // Posição além da última unidade (offset legado ou cursor forjado): fim explícito, não "candidatas".
  if (input.position > 0 && input.position >= units.length) {
    return {
      contract: CONTRACT,
      kind: "retrieval",
      status: "end-of-results",
      results: [],
      page: { returned: 0, matched: units.length, cursor: null, stop: "end", note: MESSAGES["results-end"] },
      next: [step("request-detail", "primeira página desta consulta", "get_ds_rules", input.args)],
      ...(input.deprecation ? { deprecation: input.deprecation } : {}),
    };
  }

  // ── lacunas (mecânicas + auditadas) ──
  const gaps: Array<Record<string, unknown>> = [];
  if (input.unmatchedTerms.length) {
    // 3.4.0 (A6): termo aria-*/role sem correspondência → números do registro WCAG (texto não servido).
    const refs = registryChecked((input.unmatchedRegistry ?? []).map((num) => ({ ref: `wcag:${num}`, name: "" })), wcagNames);
    gaps.push({
      kind: "unmatched-terms",
      about: input.unmatchedTerms.join(" "),
      message: MESSAGES[input.unmatchedScope === "context" ? "gap-unmatched-context" : "gap-unmatched"],
      ...(refs.length ? { registryRefs: refs, registryNote: MESSAGES["registry-only"] } : {}),
    });
  }
  const coverage = input.concept?.kbCoverage;
  if (coverage && coverage.status !== "covered") {
    const refs = registryChecked(coverage.registryRefs, wcagNames);
    const related = coverage.related.filter((r) => ruleExists(r.id));
    gaps.push({
      kind: "no-clause-in-kb",
      about: coverage.about,
      message: MESSAGES["gap-no-clause"],
      ...(refs.length ? { registryRefs: refs, registryNote: MESSAGES["registry-only"] } : {}),
      ...(related.length ? { related } : {}),
      origin: ctx.conceptRef,
    });
  }
  // 3.4.0 (A5): a 1ª página só tem permissão ou regra de outro componente → dito, com nota de ausência.
  if (first && input.mode === "query") {
    const page = units.slice(0, Math.min(input.limit, RETRIEVAL_MAX_LIMIT)).map(mainHit);
    const scope = input.scopeComponent ?? null;
    const weak = (h: Hit) => h.rule.force === "permitted" || (scope !== null && h.rule.component !== null && h.rule.component !== scope);
    if (page.length && page.every(weak)) {
      gaps.push({
        kind: "only-permission-or-other-component",
        about: page.map((h) => h.rule.id).join(" "),
        message: MESSAGES["gap-only-permission"],
        ...(scope ? { scope } : {}),
      });
    }
  }
  const hasNoClause = gaps.some((g) => g.kind === "no-clause-in-kb" || g.kind === "only-permission-or-other-component");

  // ── ambígua (§5.1, revisão NAT-99): sinal + orientação, NÃO outro conjunto de resultados. Os
  // cartões seguem as mesmas unidades e a mesma ordem do ranking; ambiguity.groups dá a chamada exata
  // de cada grupo.
  let ambiguity: Record<string, unknown> | undefined;
  if (first && input.ambiguityAllowed && isAmbiguous(units)) {
    const groups = new Map<string, Unit[]>();
    for (const unit of units) {
      const g = groupOf(unit);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(unit);
    }
    const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const shown = ordered.slice(0, 5);
    const others = ordered.slice(5);
    // 3.3.0 (N-07): com argumentos longos (a pergunta inteira), a chamada vai UMA vez em baseCall e cada
    // grupo leva só o componente, com extends:"ambiguity.baseCall" — antes a pergunta se repetia em cada grupo.
    const long = JSON.stringify(input.args).length > AMBIGUITY_INLINE_ARGS_MAX;
    const groupNext = (component: string) =>
      long
        ? { tool: "get_ds_rules", arguments: { component }, extends: "ambiguity.baseCall" }
        : { tool: "get_ds_rules", arguments: { ...input.args, component } };
    const otherMembers = others.map(([g]) => g).sort();
    ambiguity = {
      message: MESSAGES.ambiguous,
      ...(long ? { baseCall: { tool: "get_ds_rules", arguments: input.args, note: "groups[].next = esta chamada com o component do grupo" } } : {}),
      groups: [
        ...shown.map(([group, list]) => ({
          group,
          matched: list.length,
          next: groupNext(group),
        })),
        // 3.3.0 (N-16): o grupo "outros" também traz a chamada exata (o 1º membro; troque pelo que observou).
        ...(others.length
          ? [{ group: "outros", matched: others.reduce((n, [, l]) => n + l.length, 0), members: otherMembers, next: groupNext(otherMembers[0]) }]
          : []),
      ],
    };
  }

  // ── cartões dentro do orçamento ──
  const rest = units.slice(input.position);
  const take = Math.min(input.limit, RETRIEVAL_MAX_LIMIT);
  const cards: ReturnType<typeof card>[] = [];
  const investigation =
    first && input.concept
      ? {
          concept: ctx.conceptRef,
          toVerify: input.concept.toVerify.slice(0, 3).map((p) => ({ text: p.text, basis: p.basis })),
          ...implementationFor(input.componentHint),
        }
      : undefined;

  // 3.4.0 (A12): o bloco related nunca tira um cartão — entra no fim, inteiro, compacto (título + next), mínimo (id + ligação) ou não entra.
  let related: RetrievalInput["related"] | undefined;
  // 3.7.3 (D-167): o bloco de especificação idem — cartões compactos, ou só id + texto curto, ou não entra.
  let specBlock: Record<string, unknown> | undefined;
  const compose = (list: ReturnType<typeof card>[], stop: string, nextPosition: number | null) => {
    const matched = units.length;
    // 3.7.3 (D-167): sem norma mas com o bloco de especificação, "partial-match" (a resposta não está vazia).
    const status = matched === 0 ? (specBlock ? "partial-match" : "no-match") : ambiguity ? "ambiguous" : gaps.length ? "partial-match" : "candidates";
    const cursor = nextPosition !== null ? encodeCursor(nextPosition, input.cursorKey) : null;
    const nextSteps: NextStep[] = [];
    // 3.4.0 (A4): roteamento pela intenção primeiro (1ª página).
    if (first && input.routing?.length) {
      ctx.used.add("routing");
      nextSteps.push(...input.routing);
    }
    if (first && related?.items.length) ctx.used.add("kb-relation");
    if (first && input.approximations?.length) ctx.used.add("approximate");
    if (ambiguity && matched > 0) {
      nextSteps.push(
        step("request-detail", "repita com o componente observado (ambiguity.groups[].next) ou acrescente o estado: abrir, exibir, foco, posição"),
      );
    }
    if (cursor) nextSteps.push(step("request-detail", "próxima página", "get_ds_rules", { ...input.args, cursor }));
    if (matched === 0) {
      nextSteps.push(
        step(
          "request-detail",
          "Reformule pela propriedade que você mediu (cor, contraste, foco, nome, posição, estado), não pelo tema da tela, e repita a consulta.",
        ),
      );
      if (input.componentHint) {
        nextSteps.push(
          step("request-detail", "regras do componente agrupadas por estratégia de verificação", "get_component_spec", {
            component: input.componentHint,
          }),
        );
      }
      nextSteps.push(
        step(
          "keep-uncertain",
          "se o fato foi medido e nenhuma norma da base o sustenta, mantenha-o com a referência WCAG/e-MAG que você justifica, ou rule: null",
        ),
      );
    } else {
      for (const n of first ? input.concept?.next ?? [] : []) nextSteps.push(step(n.action, n.what));
      if (list.length) nextSteps.push(step("request-detail", "unidade completa da 1ª candidata", "get_ds_rules", { id: list[0].citeAs }));
      if (!input.concept) {
        nextSteps.push(step("measure-condition", "meça as condições em toVerify de cada candidata, no estado em que a regra se aplica, antes de citar"));
      }
    }
    const messages = Object.fromEntries([...ctx.used].map((code) => [code, MESSAGES[code]]));
    const noteCode: MessageCode = cursor ? "continuation" : matched === 0 ? "no-match-floor" : "relevance-floor";
    return {
      contract: CONTRACT,
      kind: "retrieval",
      status,
      ...(first ? { reading: MESSAGES.reading } : {}),
      ...(first && Object.keys(messages).length ? { messages } : {}),
      ...(first ? { kb: input.kb } : {}),
      ...(first ? { query: input.query } : {}),
      ...(first && input.unmatchedScope === "context" && input.unmatchedTerms.length ? { unmatchedTerms: input.unmatchedTerms } : {}),
      ...(ambiguity ? { ambiguity } : {}),
      results: list,
      ...(first && specBlock ? { specification: specBlock } : {}),
      ...(first && related?.items.length ? { related } : {}),
      ...(investigation ? { investigation } : {}),
      ...(first ? { gaps } : {}),
      page: { returned: list.length, matched, cursor, stop, note: MESSAGES[noteCode] },
      next: nextSteps.slice(0, 3),
      ...((() => {
        // 3.7.2: a linha conta no orçamento (está dentro de compose): uma por resposta, só na 1ª página.
        // revisão BAIXA 10: "já mostrada" = em qualquer parte da resposta composta (cartões, related, investigação, lacunas, evidência).
        const shown = JSON.stringify([list, first && related?.items.length ? related : null, investigation ?? null, first ? gaps : null, input.evidence && first ? input.evidence : null]);
        const line = first && input.componentClauses ? input.componentClauses(shown) : null;
        return line ? { componentClauses: line } : {};
      })()),
      ...(input.evidence && first ? { evidence: input.evidence } : {}),
      ...(input.warnings && first ? { warnings: input.warnings } : {}),
      ...(status === "no-match" || status === "partial-match" || hasNoClause || (ambiguity && gaps.length) ? { absenceNote: ABSENCE_NOTE } : {}),
      ...(input.deprecation ? { deprecation: input.deprecation } : {}),
    };
  };

  let stop = rest.length === 0 ? (units.length === 0 ? "no-match" : "relevance-floor") : "relevance-floor";
  let consumed = 0;
  // Revisão NAT-99: o orçamento não derruba uma busca normal abaixo de 5 cartões enquanto der para
  // encurtar campos: antes de cortar um cartão, todos passam a levar 1 toVerify e 1 evidence (o texto
  // da cláusula, até 600, fica). Só então o corte por orçamento vale (page.stop:"budget").
  const floorCards = Math.min(RETRIEVAL_DEFAULT_LIMIT, take);
  let compact = false;
  const rebuild = () => rest.slice(0, cards.length).map((u, i) => card(u, input.position + i + 1, ctx, true, true));
  for (const unit of rest) {
    if (cards.length >= take) {
      stop = "limit";
      break;
    }
    const used = new Set(ctx.used);
    let candidate = card(unit, input.position + cards.length + 1, ctx, true, compact);
    // 3.3.0 (N-02): a prova usa o rótulo de parada mais longo, para a resposta final nunca passar do teto.
    let trial = compose([...cards, candidate], LONGEST_STOP, input.position + cards.length + 1);
    if (cards.length > 0 && textSize(trial) > budget && !compact && cards.length < floorCards) {
      compact = true;
      cards.splice(0, cards.length, ...rebuild());
      candidate = card(unit, input.position + cards.length + 1, ctx, true, true);
      trial = compose([...cards, candidate], LONGEST_STOP, input.position + cards.length + 1);
    }
    if (cards.length > 0 && textSize(trial) > budget) {
      ctx.used.clear();
      for (const code of used) ctx.used.add(code);
      stop = "budget";
      break;
    }
    cards.push(candidate);
    consumed += 1;
  }
  const nextPosition = input.position + consumed < units.length ? input.position + consumed : null;
  if (nextPosition === null && stop !== "no-match") stop = "relevance-floor";
  if (first && cards.length && input.related?.items.length) {
    const full = input.related;
    const beforeRelated = new Set(ctx.used);
    // 3.4.1: a ligação inferida leva o kind em todas as formas, para nunca parecer declarada pela cláusula.
    const kindOf = (i: RelatedItem) => (i.kind === "inferred" ? { kind: i.kind } : {});
    const compact = { version: full.version, items: full.items.map((i) => ({ id: i.id, relation: i.relation, ...kindOf(i), title: i.title, next: i.next })) };
    const minimal = { version: full.version, items: full.items.map((i) => ({ id: i.id, relation: i.relation, ...kindOf(i) })) };
    for (const candidate of [full, compact, minimal]) {
      related = candidate as RetrievalInput["related"];
      if (textSize(compose(cards, stop, nextPosition)) <= budget) break;
      related = undefined;
    }
    // compose registra mensagens enquanto mede os candidatos. Um bloco recusado não pode deixar a mensagem
    // kb-relation na resposta: esse texto não participou da escolha dos cartões e pode ultrapassar o teto.
    if (!related) {
      ctx.used.clear();
      for (const code of beforeRelated) ctx.used.add(code);
    }
  }
  // 3.7.3 (D-167): depois do related (que fica como era), com o que sobra do orçamento.
  if (first && input.specification?.hits.length) {
    const specUnits = groupUnits(input.specification.hits);
    const shown = specUnits.slice(0, SPECIFICATION_BLOCK_MAX);
    const head = {
      modality: SPECIFICATION_MODALITY,
      matched: specUnits.length,
      ...(specUnits.length > shown.length
        ? { next: step("request-detail", "todas as unidades de especificação desta consulta", "get_ds_rules", input.specification.next) }
        : {}),
    };
    const before = new Set(ctx.used);
    const restore = () => {
      ctx.used.clear();
      for (const code of before) ctx.used.add(code);
    };
    specBlock = { ...head, results: shown.map((u, i) => card(u, i + 1, ctx, true, true)) };
    if (textSize(compose(cards, stop, nextPosition)) > budget) {
      // Mínimo: id, ids das linhas, força e texto curto (a modalidade do bloco diz o que é), de 3 cartões a 1.
      restore();
      const minimal = (u: Unit) => {
        const rule = mainHit(u).rule;
        return { citeAs: rule.id, ids: unitIds(u), kind: "specification", force: rule.force, heading: heading(rule), text: cut(plain(rule.originalText), 160).text };
      };
      specBlock = undefined;
      for (let n = shown.length; n >= 1; n--) {
        const more = specUnits.length > n;
        specBlock = {
          modality: SPECIFICATION_MODALITY,
          matched: specUnits.length,
          ...(more ? { next: step("request-detail", "todas as unidades de especificação desta consulta", "get_ds_rules", input.specification.next) } : {}),
          results: shown.slice(0, n).map(minimal),
        };
        if (textSize(compose(cards, stop, nextPosition)) <= budget) break;
        specBlock = undefined;
      }
      // Sem lugar nem para um cartão: fica a contagem e a chamada que as lista (revisão: o bloco não some calado).
      if (!specBlock) {
        specBlock = {
          modality: SPECIFICATION_MODALITY,
          matched: specUnits.length,
          next: step("request-detail", "as unidades de especificação desta consulta", "get_ds_rules", input.specification.next),
        };
        if (textSize(compose(cards, stop, nextPosition)) > budget) specBlock = undefined;
      }
    }
  }
  return compose(cards, stop, nextPosition);
}

/** `investigation.implementation` (§5.3): só de componentProvenance, com o texto fixo `implementation`. */
function implementationFor(component: string | null) {
  if (!component) return {};
  const provenance = componentProvenance(component) as { runtimeSource?: { kind: string; note?: string } };
  const note = provenance.runtimeSource?.kind === "implementation-source-code" ? provenance.runtimeSource.note : undefined;
  if (!note) return {};
  return {
    implementation: {
      text: note,
      code: "implementation",
      message: MESSAGES.implementation,
      next: { tool: "get_component_spec", arguments: { component } },
    },
  };
}

// ── Listagem de catálogo (§7.5, §8) ─────────────────────────────────────────────────────────

export function indexItem(rule: KnowledgeRule, n: number) {
  const { text, complete } = cut(plain(rule.title), INDEX_TITLE_MAX);
  // Títulos da base já podem vir cortados ("…"): completo só se nem a base nem este corte cortaram.
  const item = { n, id: rule.id, force: rule.force as RuleForce | null, title: text, titleComplete: complete && !rule.title.trimEnd().endsWith("…"), category: rule.category };
  return asImplementationProperty(rule, item);
}

/** 3.7.5-pre.3: teto da frase da cláusula no índice por ids; acima dele, corte em palavra com "…" e textComplete:false. */
export const IDS_INDEX_TEXT_MAX = 300;

/**
 * 3.7.5-pre.3 (decisão do coordenador): o índice de um lote de ids (`get_ds_rules{ids, detail:"index"}`) traz a FRASE da
 * própria cláusula (normalizedRule; sem ela, o título), a força declarada e o componente — ler o índice é ler a regra. Na
 * 3.7.4 trazia só o título cortado em 110 caracteres. A listagem de catálogo (indexItem) não muda.
 */
export function idsIndexItem(rule: KnowledgeRule, n: number) {
  const { text, complete } = cut(plain(rule.normalizedRule?.trim() || rule.title).replace(/\s+/g, " "), IDS_INDEX_TEXT_MAX);
  const item = { n, id: rule.id, force: rule.force as RuleForce | null, component: rule.component ?? null, text, ...(complete ? {} : { textComplete: false }), category: rule.category };
  return asImplementationProperty(rule, item);
}

/**
 * 3.4.0 (A11): a MESMA projeção do cartão (3.3.0, A-12) em toda listagem e lote: linha de tabela de API/anatomia
 * sai como propriedade da implementação, sem a força da tabela (o registro por id a mantém).
 */
export function asImplementationProperty<T extends Record<string, unknown>>(rule: KnowledgeRule, item: T): T {
  // 3.5.0 (revisão, HIGH 2): exceção que a cláusula perdeu em relação ao legado (data/lostExceptions.ts).
  const lost = lostExceptionOf(rule);
  const withCondition = lost ? { ...item, condition: lost } : item;
  // 3.7.3 (D-167): unidade de especificação sai com a modalidade própria (linha de tabela ou frase).
  if (isSpecification(rule)) return { ...withCondition, kind: "specification", force: rule.force, modality: SPECIFICATION_MODALITY };
  if (!isTableRow(rule.originalText ?? "")) return withCondition;
  return { ...withCondition, kind: "implementation-property", force: null, modality: IMPLEMENTATION_PROPERTY };
}

/**
 * 3.4.0 (A1): ordem fixa da listagem de catálogo — prosa que obriga/proíbe, depois a outra prosa, depois linhas
 * de tabela; em cada faixa, a ordem da base. Sem relevância: só a forma e a força do registro.
 */
export function listingBand(rule: KnowledgeRule): number {
  if (isTableRow(rule.originalText ?? "")) return 2;
  return rule.force === "required" || rule.force === "prohibited" ? 0 : 1;
}
export function listingOrder(rules: KnowledgeRule[]): KnowledgeRule[] {
  return rules.map((rule, i) => ({ rule, i })).sort((a, b) => listingBand(a.rule) - listingBand(b.rule) || a.i - b.i).map((x) => x.rule);
}

export interface ListingInput {
  rules: KnowledgeRule[];
  position: number;
  limit: number;
  args: Record<string, unknown>;
  filter: Record<string, unknown>;
  cursorKey: string;
  kb: { dsVersion: string; knowledgeVersion: string };
  project: (rule: KnowledgeRule, n: number) => unknown;
  detail: "index" | "brief" | "full";
  deprecation?: string;
  evidence?: unknown;
  budget?: number;
  /** 3.4.0 (A12): ligações da camada kb-relations do componente listado (1ª página). */
  related?: { version: string; items: RelatedItem[] };
}

export function listingResponse(input: ListingInput) {
  const budget = input.budget ?? RESPONSE_BUDGET;
  const total = input.rules.length;
  const take = Math.min(input.limit, LISTING_MAX_LIMIT);
  const force: Record<string, number> = {};
  for (const r of input.rules) force[r.force] = (force[r.force] ?? 0) + 1;
  const first = input.position === 0;
  const compose = (items: unknown[], stop: string) => {
    const end = input.position + items.length;
    const cursor = end < total ? encodeCursor(end, input.cursorKey) : null;
    const next: NextStep[] = [];
    if (cursor) next.push(step("request-detail", "próxima página", "get_ds_rules", { ...input.args, cursor }));
    if (total === 0) {
      next.push(step("request-detail", "afrouxe um filtro, ou busque pelo que você mediu com query", null));
      next.push(step("keep-uncertain", "ausência na base não desmente o fato medido: mantenha-o com a referência que você justifica, ou rule: null"));
    } else {
      next.push(
        step(
          "request-detail",
          "estreitar pelo que você observou: acrescente query (o que mediu) ou validationStrategy; com query a resposta vira busca com relevância",
        ),
      );
    }
    const tableRows = items.some((i) => (i as { kind?: string } | null)?.kind === "implementation-property");
    const messages = {
      ...(first && tableRows ? { "table-row": MESSAGES["table-row"] } : {}),
      ...(first && input.related?.items.length ? { "kb-relation": MESSAGES["kb-relation"] } : {}),
    };
    return {
      contract: CONTRACT,
      kind: "listing",
      status: total === 0 ? "no-match" : "listed",
      ...(first ? { reading: MESSAGES["listing-reading"], kb: input.kb } : {}),
      ...(Object.keys(messages).length ? { messages } : {}),
      filter: input.filter,
      total,
      ...(first ? { facets: { force } } : {}),
      detail: input.detail,
      items,
      page: {
        returned: items.length,
        offset: input.position,
        total,
        cursor,
        stop: total === 0 ? "no-match" : cursor ? stop : "end",
        note: cursor ? MESSAGES.continuation : MESSAGES["listing-end"],
      },
      next: next.slice(0, 3),
      ...(first && input.related?.items.length ? { related: input.related } : {}),
      ...(input.evidence && first ? { evidence: input.evidence } : {}),
      ...(total === 0 ? { absenceNote: ABSENCE_NOTE } : {}),
      ...(input.deprecation ? { deprecation: input.deprecation } : {}),
    };
  };
  const items: unknown[] = [];
  let stop = "limit";
  for (const rule of input.rules.slice(input.position)) {
    if (items.length >= take) break;
    const item = input.project(rule, input.position + items.length + 1);
    if (items.length > 0 && textSize(compose([...items, item], LONGEST_STOP)) > budget) {
      stop = "budget";
      break;
    }
    items.push(item);
  }
  return compose(items, stop);
}

// ── Lote por ids (§8) ───────────────────────────────────────────────────────────────────────

export function ruleKind(rule: KnowledgeRule): "historical" | "normative" | "evidence" | "specification" {
  if (!rule.legacy && isSpecification(rule)) return "specification";
  return rule.legacy ? "historical" : NORMATIVE_FORCES.includes(rule.force as RuleForce) ? "normative" : "evidence";
}

/** Cartão de lookup: o cartão sem `why` (não houve busca), com `toVerify`/`evidence` (§8). */
export function lookupCard(rule: KnowledgeRule, rank: number, used: Set<MessageCode>) {
  const ctx: CardContext = { concept: null, conceptRef: null, used };
  const c = card({ key: unitKey(rule), hits: [{ rule, matched: [], relation: rule.component ? "component" : "global", field: null }] }, rank, ctx, false);
  if (rule.legacy) {
    // 3.3.0 (N-19): id histórico não é candidata citável — sem citeAs, status "historical", e o ponteiro
    // para a regra corrente (sucessora auditada ou, sem ela, a de texto mais próximo, dito como tal).
    return {
      ...c,
      citeAs: null,
      status: "historical" as const,
      kind: ruleKind(rule),
      current: currentPointer(rule),
      absenceNote: ABSENCE_NOTE,
      legacyResolution: legacyResolution(rule),
    };
  }
  return { ...c, kind: ruleKind(rule) };
}

/** 1ª cláusula que carrega obrigação (required/prohibited), não título; senão a 1ª de prosa; senão null. */
function obligationClause(rules: KnowledgeRule[]): KnowledgeRule | null {
  const prose = rules.filter((r) => !isTitleRecord(r) && !r.legacy && r.force !== "example" && !isSpecification(r));
  return prose.find((r) => r.force === "required" || r.force === "prohibited") ?? prose[0] ?? null;
}

/** Cláusulas correntes da mesma seção de uma regra (incluída), em ordem da base. */
function sectionClauses(rule: KnowledgeRule): KnowledgeRule[] {
  const kb = getKnowledgeBase();
  return kb.rules.filter((r) => r.source.corpusFile === rule.source.corpusFile && r.source.sectionPath === rule.source.sectionPath && typeof r.source.corpusFile === "string");
}

export interface CurrentPointer {
  id: string | null;
  basis: "legacy-map" | "legacy-map-title→section-obligation" | "closest-text-lexical" | "none";
  caveat: string;
  next?: { tool: "get_ds_rules"; arguments: { id: string } };
  wcagFallback?: string[];
}

/**
 * 3.3.0 (B-15, N-15, N-19): para onde apontar um id histórico. (1) sucessora auditada que não é registro-título;
 * (2) sucessora título → a cláusula que obriga na mesma seção; (3) sem sucessora (dropped) → a regra corrente de
 * texto mais próximo pelo motor léxico (ponteiro de leitura, não equivalência). WCAG do registro, se houver.
 */
export function currentPointer(rule: KnowledgeRule): CurrentPointer {
  const kb = getKnowledgeBase();
  const successors = (rule.legacy?.supersededBy ?? []).map((id) => kb.byId.get(id)).filter((r): r is KnowledgeRule => Boolean(r));
  const wcag = rule.wcagReferences.length ? { wcagFallback: rule.wcagReferences } : {};
  const pointer = (id: string, basis: CurrentPointer["basis"], caveat: string): CurrentPointer => ({
    id,
    basis,
    caveat,
    next: { tool: "get_ds_rules", arguments: { id } },
    ...wcag,
  });
  const direct = successors.find((r) => !isTitleRecord(r));
  if (direct) return pointer(direct.id, "legacy-map", "Sucessora do mapa de ids existente; leia-a por id antes de citar.");
  const title = successors.find((r) => isTitleRecord(r));
  if (title) {
    const clause = obligationClause(sectionClauses(title));
    if (clause) {
      return pointer(clause.id, "legacy-map-title→section-obligation", "A sucessora do mapa é o título da seção; esta é a cláusula da mesma seção que carrega a obrigação. Leia a unidade por id antes de citar.");
    }
    return pointer(title.id, "legacy-map", "Sucessora do mapa (registro-título); leia a unidade por id antes de citar.");
  }
  const text = (rule.originalText || rule.normalizedRule || rule.title || "").slice(0, 400);
  const top = text ? rankRules({ text }, kb).results.find((s) => !s.rule.legacy && !isTitleRecord(s.rule)) : undefined;
  if (top) {
    return pointer(top.rule.id, "closest-text-lexical", "Sem sucessora auditada: esta é a regra corrente de texto mais próximo (motor léxico), só um ponteiro de leitura — não é equivalência. Confira o texto antes de citar.");
  }
  return { id: null, basis: "none", caveat: "Sem sucessora auditada nem regra corrente próxima: cite uma referência WCAG/e-MAG que você justifique, ou rule: null.", ...wcag };
}

/**
 * 3.3.0 (B-09, N-15): citação do template de validação do e-MAG. O template guarda o id da base anterior
 * (histórico); a resposta aponta para a cláusula CORRENTE da recomendação que carrega a obrigação
 * (normativeContext.clauses), e diz de onde veio. Nenhum texto da base é reescrito.
 */
export function emagTemplateCitation(recommendation: string, templateRuleId: string, getRule: (id: string) => KnowledgeRule | undefined) {
  const templateRule = getRule(templateRuleId);
  if (templateRule && !templateRule.legacy) return { id: templateRule.id, kind: "current" as const, basis: "template" };
  const unitClause = obligationClause(emagUnits(recommendation).clauses.map((c) => getRule(c.id)).filter((r): r is KnowledgeRule => Boolean(r)));
  const fromHistorical = templateRule
    ? { from: { id: templateRuleId, kind: "historical" as const, legacyResolution: legacyResolution(templateRule) } }
    : { from: { id: templateRuleId, kind: "unresolved" as const } };
  if (unitClause) return { id: unitClause.id, kind: "current" as const, basis: "emag-unit-obligation", ...fromHistorical };
  if (templateRule) {
    const p = currentPointer(templateRule);
    if (p.id) return { id: p.id, kind: "current" as const, basis: p.basis, caveat: p.caveat, ...fromHistorical };
  }
  return { id: null, kind: "unresolved" as const, absenceNote: ABSENCE_NOTE, ...fromHistorical };
}

export interface LookupInput {
  requested: string[];
  found: KnowledgeRule[];
  missing: string[];
  position: number;
  args: Record<string, unknown>;
  cursorKey: string;
  detail: "index" | "brief" | "full";
  project: (rule: KnowledgeRule, n: number, used: Set<MessageCode>) => unknown;
  budget?: number;
  /** 3.7.11 (teste à mão): campos uma vez por resposta, conforme as unidades da página (p. ex. forceNote), dentro do orçamento. */
  noteFor?: (rules: KnowledgeRule[]) => Record<string, unknown>;
}

export function lookupResponse(input: LookupInput) {
  const budget = input.budget ?? RESPONSE_BUDGET;
  const used = new Set<MessageCode>();
  const first = input.position === 0;
  const compose = (items: unknown[]) => {
    const end = input.position + items.length;
    const note = input.noteFor ? input.noteFor(input.found.slice(input.position, end)) : {};
    const cursor = end < input.found.length ? encodeCursor(end, input.cursorKey) : null;
    const messages = Object.fromEntries([...used].map((code) => [code, MESSAGES[code]]));
    const next: NextStep[] = [];
    if (cursor) next.push(step("request-detail", "próximos ids do lote", "get_ds_rules", { ...input.args, cursor }));
    if (input.missing.length) {
      next.push(step("correct-citation", "ids ausentes não existem nesta base: cite só ids devolvidos por uma ferramenta; não ajuste o id até ele existir"));
    }
    return {
      contract: CONTRACT,
      kind: "lookup",
      status: input.found.length ? (input.missing.length ? "partial-match" : "found") : "no-match",
      ...(first && Object.keys(messages).length ? { messages } : {}),
      requested: input.requested.length,
      missing: input.missing,
      detail: input.detail,
      ...note,
      results: items,
      page: {
        returned: items.length,
        found: input.found.length,
        cursor,
        stop: cursor ? "budget" : "end",
        ...(cursor ? { note: MESSAGES.continuation } : {}),
      },
      next: next.slice(0, 3),
      ...(input.missing.length ? { absenceNote: ABSENCE_NOTE } : {}),
    };
  };
  const items: unknown[] = [];
  for (const rule of input.found.slice(input.position)) {
    const snapshot = new Set(used);
    const item = input.project(rule, input.position + items.length + 1, used);
    if (items.length > 0 && textSize(compose([...items, item])) > budget) {
      used.clear();
      for (const code of snapshot) used.add(code);
      break;
    }
    items.push(item);
  }
  return compose(items);
}

// ── Unidade por id (§7.7) ───────────────────────────────────────────────────────────────────

/**
 * Registro + unidade sem duplicação: `unitSource` = `rule.source` e o texto de `mainClause` = o da
 * regra saem (ficam as referências). Acima do teto, cláusulas adjacentes por `clauseCursor`, cada uma
 * inteira ou ausente.
 */
export function idResponse(rule: KnowledgeRule, clauseCursor: number | undefined, budget = RESPONSE_BUDGET, extra: Record<string, unknown> = {}) {
  const unit = normativeUnit(rule) as
    | (Record<string, unknown> & { unitSource: unknown; mainClause: Record<string, unknown>; adjacentClauses: unknown[] })
    | undefined;
  const base = { contract: CONTRACT, kind: ruleKind(rule) };
  if (!unit) {
    return { ...base, rule, normativeContext: unit ?? null, legacyResolution: legacyResolution(rule) ?? null, next: [] as NextStep[], ...extra };
  }
  const { unitSource, mainClause, adjacentClauses, ...restUnit } = unit;
  const sameSource = JSON.stringify(unitSource) === JSON.stringify(rule.source);
  const dedupedUnit: Record<string, unknown> = {
    ...restUnit,
    unitSource: sameSource ? { ref: "rule.source" } : unitSource,
    mainClause: { id: mainClause.id, ref: "rule", applicability: "unknown" },
  };
  const start = clauseCursor ?? 0;
  const compose = (clauses: unknown[], end: number) => {
    const more = end < adjacentClauses.length;
    const next: NextStep[] = more
      ? [step("request-detail", "próximas cláusulas adjacentes desta unidade", "get_ds_rules", { id: rule.id, clauseCursor: end })]
      : [];
    if (clauseCursor !== undefined) {
      return {
        ...base,
        kind: "clauses",
        id: rule.id,
        clauseCursor: start,
        adjacentClauses: clauses,
        totalAdjacent: adjacentClauses.length,
        nextClauseCursor: more ? end : null,
        next,
      };
    }
    return {
      ...base,
      rule,
      ...(lostExceptionOf(rule) ? { condition: lostExceptionOf(rule) } : {}),
      normativeContext: { ...dedupedUnit, adjacentClauses: clauses, totalAdjacent: adjacentClauses.length, nextClauseCursor: more ? end : null },
      legacyResolution: legacyResolution(rule) ?? null,
      next,
      // 3.7.11 (revisão HIGH 1): o que a ferramenta acrescenta (forceNote, antecedent) entra ANTES do orçamento
      ...extra,
    };
  };
  // 3.7.11 (revisão HIGH 1): sem nenhuma cláusula adjacente a unidade ainda passava do teto (48 unidades, o parágrafo
  // literal da seção longo — tabelas de especificação). O parágrafo literal é cortado no limite, com a marca e o tamanho
  // inteiro; as cláusulas seguem pelo clauseCursor.
  const ctx = dedupedUnit.sourceContext as { text?: string } | null | undefined;
  if (clauseCursor === undefined && ctx && typeof ctx.text === "string" && textSize(compose([], 0)) > budget) {
    const full = ctx.text;
    const over = textSize(compose([], 0)) - budget;
    let keep = Math.max(0, full.length - over - 200);
    const cut = (n: number) => ({ ...ctx, text: `${full.slice(0, n).trimEnd()}…`, textComplete: false, textChars: full.length });
    dedupedUnit.sourceContext = cut(keep);
    while (keep > 0 && textSize(compose([], 0)) > budget) {
      keep = Math.max(0, keep - 200);
      dedupedUnit.sourceContext = cut(keep);
    }
  }
  const clauses: unknown[] = [];
  let index = start;
  while (index < adjacentClauses.length) {
    const trial = compose([...clauses, adjacentClauses[index]], index + 1);
    if (textSize(trial) > budget && (clauses.length > 0 || clauseCursor === undefined)) break;
    clauses.push(adjacentClauses[index]);
    index += 1;
  }
  return compose(clauses, index);
}
