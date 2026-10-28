/**
 * NAT-107 (3.2.0, D-147): busca híbrida do `get_ds_rules` com query — léxica (retrieval.ts, sem
 * mudança) + vetorial local (embeddings.ts), fundidas por Reciprocal Rank Fusion.
 *
 * Fixado antes de medir (não ajustado no desenvolvimento):
 *  - RRF com k = 60 e pesos iguais (Cormack, Clarke & Büttcher, SIGIR 2009): fused = Σ 1/(k + posição).
 *  - Lista vetorial = as 50 regras elegíveis de maior cosseno (DENSE_TOP).
 *  - Piso honesto: uma regra só entra se passou o piso léxico OU tem cosseno ≥ limiar do modelo
 *    (models.json `threshold`, com a fonte em `thresholdSource`). Linha de tabela (listagem de API/anatomia)
 *    não entra só pelo vetor.
 *  - Elegibilidade igual à léxica: mesmo pool (filtros estritos), pista de componente exclui os outros
 *    componentes e mantém as globais.
 *  - Entrada só pelo vetor exige a âncora na base (`kbAnchor`: ≥ 1 e, desde a 3.3.0, MAIS da metade dos termos de conteúdo da
 *    pergunta no vocabulário da própria base), o cosseno da pergunta SEM a pista de componente ≥ limiar e (3.3.0)
 *    `denseClauseAdmissible` (≥ 4 termos na cláusula; termo em comum com a pergunta ou cosseno ≥ strictThreshold).
 *  - Ordem: fused desc → faixa de força → ordem da base → id.
 *
 * `retrieval:"lexical"` devolve exatamente o resultado do motor léxico (comportamento 3.1.0).
 * `retrieval:"dense"` (para medição) devolve só a lista vetorial acima do limiar.
 * Vetores indisponíveis → resultado léxico, e `ranking.dense: "unavailable"` com o motivo.
 */
import { getKnowledgeBase, type KnowledgeBase, type KnowledgeRule } from "./knowledge.js";
import { RANKING_VERSION, cleanText, forceRank, isTableRow, promoteHinted, rankRules, tokenize, type RankInput, type RankResult, type ScoredRule } from "./retrieval.js";
import { componentDisplayNames, cosine, denseState, embedText, modelLabel, queryText } from "./embeddings.js";

export const HYBRID_VERSION = "govbr-hybrid/1.1.0";
export const DENSE_VERSION = "govbr-dense/1.1.0";
/**
 * 3.3.0 (NAT-109, N-08): uma cláusula só entra pelo vetor se tiver ≥ DENSE_MIN_CLAUSE_TERMS termos de
 * conteúdo distintos (as cláusulas de 2–3 palavras, "Seu uso é opcional.", são "hubs" do e5 e passam do
 * limiar contra quase tudo) E (dividir ≥ 1 termo de conteúdo — chave ou radical — com a pergunta OU ter
 * cosseno ≥ strictThreshold do modelo, o p99 dos negativos da calibração). Regra fixada antes de medir.
 */
export const DENSE_MIN_CLAUSE_TERMS = 4;
export const RRF_K = 60;
export const DENSE_TOP = 50;

export type RetrievalMode = "hybrid" | "lexical" | "dense";
export const RETRIEVAL_MODES: readonly RetrievalMode[] = ["hybrid", "lexical", "dense"];

/**
 * Modo padrão do servidor (D-149): `GOVBR_RETRIEVAL_MODE` (hybrid | lexical | dense) ou **lexical** — a 3.1.0
 * byte a byte, sem carregar o modelo. Híbrida e vetorial ficam por `retrieval` ou pela variável.
 */
export function defaultRetrievalMode(): RetrievalMode {
  const v = (process.env.GOVBR_RETRIEVAL_MODE ?? "").trim().toLowerCase();
  if (!v) return "lexical";
  if ((RETRIEVAL_MODES as readonly string[]).includes(v)) return v as RetrievalMode;
  throw new InvalidRetrievalModeError(v);
}

/** GOVBR_RETRIEVAL_REQUIRE_DENSE=1: o servidor não sobe sem modelo + vetores conferidos (runner de bateria). */
export function denseRequiredByEnv(): boolean {
  return (process.env.GOVBR_RETRIEVAL_REQUIRE_DENSE ?? "").trim() === "1";
}

export class DenseRequiredError extends Error {
  constructor(reason: string) {
    super(`GOVBR_RETRIEVAL_REQUIRE_DENSE=1 e a busca vetorial está indisponível: ${reason}`);
    this.name = "DenseRequiredError";
  }
}

export class InvalidRetrievalModeError extends Error {
  constructor(value: string) {
    super(`GOVBR_RETRIEVAL_MODE='${value}' desconhecido (use hybrid, lexical ou dense).`);
    this.name = "InvalidRetrievalModeError";
  }
}

/** Bloco `kb.ranking` das respostas híbridas/vetoriais (a léxica mantém a string da 3.1.0). */
export interface RankingInfo {
  engine: string;
  retrieval: RetrievalMode;
  lexical: string;
  dense: string;
  fusion?: string;
  threshold?: number;
  strictThreshold?: number;
  denseNote?: string;
}

export interface HybridHit extends ScoredRule {
  /** Cosseno com a pergunta, quando a regra está na lista vetorial. */
  cosine?: number;
  /** Entrou só pelo vetor (sem passar o piso léxico). */
  denseOnly?: boolean;
  /** Em qual lista a regra apareceu (híbrida/vetorial). */
  via?: Via;
}

export interface HybridResult {
  lexical: RankResult;
  results: HybridHit[];
  ranking: string | RankingInfo;
  /** 3.3.0 (N-18): só em retrieval:"dense" sem vetores — o motivo; o chamador responde com erro. */
  denseUnavailable?: string;
}

function eligibleRules(input: RankInput, kb: KnowledgeBase): KnowledgeRule[] {
  const base = input.pool ?? kb.rules.filter((r) => r.force !== "example");
  const hint = input.component ?? null;
  return base.filter((r) => hint === null || r.component === null || r.component === hint);
}

/**
 * Vocabulário da própria base (revisão 3): chaves e radicais dobrados (caixa, acento, plural; sem palavras
 * vazias) de todos os campos que o motor léxico indexa. Uma regra só entra pelo vetor se a pergunta tiver
 * ao menos um termo de conteúdo neste conjunto — sem nenhum ("xyzzy quux"), a resposta é a ausência
 * normal em todos os modos, também com pista de componente. Sem vocabulário de sinônimos: só a base.
 */
const kbVocabularies = new WeakMap<KnowledgeBase, Set<string>>();
function kbVocabulary(kb: KnowledgeBase): Set<string> {
  let v = kbVocabularies.get(kb);
  if (v) return v;
  v = new Set<string>();
  for (const r of kb.rules) {
    const section = typeof r.source.sectionPath === "string" ? r.source.sectionPath : String(r.source.section ?? "");
    const fields = [r.title, r.normalizedRule, r.originalText, ...r.wcagReferences, ...r.emagReferences, ...r.conditions, ...r.exceptions, ...r.expectedEvidence, r.component ?? "", typeof r.source.pageTitle === "string" ? r.source.pageTitle : "", section];
    for (const t of tokenize(fields.filter(Boolean).join(" | "))) {
      v.add(t.key);
      v.add(t.stem);
    }
  }
  kbVocabularies.set(kb, v);
  return v;
}

/**
 * Âncora na base (revisão 4): termos de conteúdo distintos da pergunta (sem as partes de identificadores);
 * `anchored` exige ≥ 1 na base e pelo menos metade deles na base. Sem âncora, nada entra só pelo vetor.
 */
export function kbAnchor(text: string, kb: KnowledgeBase = getKnowledgeBase()): { terms: number; inKb: number; anchored: boolean } {
  const v = kbVocabulary(kb);
  const tokens = [...new Map(tokenize(text).filter((t) => !t.partOf).map((t) => [t.key, t])).values()];
  const inKb = tokens.filter((t) => v.has(t.key) || v.has(t.stem)).length;
  // 3.3.0 (N-09): maioria estrita — "futebol botão" (1 de 2) não abre a porta do vetor.
  return { terms: tokens.length, inKb, anchored: inKb >= 1 && inKb * 2 > tokens.length };
}

/** Termos de conteúdo (chaves e radicais) de uma cláusula, memoizados por regra. */
const clauseTermsMemo = new WeakMap<KnowledgeRule, { keys: Set<string>; distinct: number }>();
function clauseTerms(rule: KnowledgeRule): { keys: Set<string>; distinct: number } {
  let c = clauseTermsMemo.get(rule);
  if (!c) {
    const toks = tokenize(rule.originalText || rule.normalizedRule || rule.title).filter((t) => !t.partOf);
    const keys = new Set<string>();
    for (const t of toks) {
      keys.add(t.key);
      keys.add(t.stem);
    }
    c = { keys, distinct: new Set(toks.map((t) => t.key)).size };
    clauseTermsMemo.set(rule, c);
  }
  return c;
}

/**
 * 3.3.0 (N-08): a cláusula pode entrar só pelo vetor? Pura: `queryKeys` = chaves e radicais de conteúdo
 * da pergunta; `cos` = cosseno de admissão; `strict` = strictThreshold do modelo (ausente → só o caminho
 * do termo em comum).
 */
export function denseClauseAdmissible(rule: KnowledgeRule, queryKeys: Set<string>, cos: number, strict: number | undefined): boolean {
  const c = clauseTerms(rule);
  if (c.distinct < DENSE_MIN_CLAUSE_TERMS) return false;
  for (const k of c.keys) if (queryKeys.has(k)) return true;
  return strict !== undefined && cos >= strict;
}

/** A pergunta passa a âncora na base? */
export function queryHasKbTerm(text: string, kb: KnowledgeBase = getKnowledgeBase()): boolean {
  return kbAnchor(text, kb).anchored;
}

const orders = new WeakMap<KnowledgeBase, Map<string, number>>();
function orderOf(kb: KnowledgeBase): Map<string, number> {
  let o = orders.get(kb);
  if (!o) {
    o = new Map(kb.rules.map((r, i) => [r.id, i]));
    orders.set(kb, o);
  }
  return o;
}

export type Via = "lexical" | "dense" | "both";

/**
 * Reciprocal Rank Fusion (k = RRF_K, pesos iguais), pura: `lexical` = ids acima do piso léxico, em ordem;
 * `dense` = top-N vetorial, em ordem; `admitDenseOnly` diz se um id fora da léxica pode entrar. Empate de
 * soma → `tiebreak`. `via`: em qual lista o id aparece.
 */
export function rrfFuse(
  lexical: string[],
  dense: string[],
  admitDenseOnly: (id: string) => boolean,
  tiebreak: (a: string, b: string) => number,
): Array<{ id: string; score: number; via: Via }> {
  const lexRank = new Map(lexical.map((id, i) => [id, i + 1]));
  const denseRank = new Map(dense.map((id, i) => [id, i + 1]));
  const rrf = (id: string) => (lexRank.has(id) ? 1 / (RRF_K + lexRank.get(id)!) : 0) + (denseRank.has(id) ? 1 / (RRF_K + denseRank.get(id)!) : 0);
  const out = lexical.map((id) => ({ id, score: rrf(id), via: (denseRank.has(id) ? "both" : "lexical") as Via }));
  for (const id of dense) if (!lexRank.has(id) && admitDenseOnly(id)) out.push({ id, score: rrf(id), via: "dense" });
  return out.sort((a, b) => b.score - a.score || tiebreak(a.id, b.id));
}

/** Busca por query no modo pedido. Determinística para a mesma entrada, base, motor e vetores. */
export async function rankForQuery(input: RankInput, mode: RetrievalMode, kb: KnowledgeBase = getKnowledgeBase()): Promise<HybridResult> {
  const lexical = rankRules(input, kb);
  if (mode === "lexical") return { lexical, results: lexical.results, ranking: RANKING_VERSION };
  const engine = mode === "dense" ? DENSE_VERSION : HYBRID_VERSION;
  const state = await denseState();
  if (state.status !== "ready") {
    // 3.3.0 (N-18): "dense" é só vetorial — sem vetores não há resultado (o chamador devolve erro); a
    // híbrida cai para a léxica e o motor que de fato rodou é o léxico.
    if (mode === "dense") {
      return { lexical, results: [], ranking: { engine, retrieval: mode, lexical: RANKING_VERSION, dense: "unavailable", denseNote: `${state.model}: ${state.reason}` }, denseUnavailable: `${state.model}: ${state.reason}` };
    }
    return {
      lexical,
      results: lexical.results,
      ranking: { engine: RANKING_VERSION, retrieval: mode, lexical: RANKING_VERSION, dense: "unavailable", denseNote: `${state.model}: ${state.reason}; resultado só léxico` },
    };
  }
  const { index } = state;
  const hint = input.component ?? null;
  const names = componentDisplayNames(kb);
  // Ordem vetorial: a pergunta com o nome do componente (pista). Admissão só-vetorial: o cosseno da pergunta
  // SEM a pista — o limiar 0,856 foi calibrado sem ela (revisão 4).
  const qRank = await embedText(index.key, queryText(cleanText(input.text), hint ? names.get(hint) ?? hint : null), "query");
  const qAdmit = hint ? await embedText(index.key, queryText(cleanText(input.text), null), "query") : qRank;
  const order = orderOf(kb);
  const dense = eligibleRules(input, kb)
    .filter((rule) => index.vectors.has(rule.id))
    .map((rule) => ({ rule, cos: cosine(qRank, index.vectors.get(rule.id)!) }))
    .sort((a, b) => b.cos - a.cos || order.get(a.rule.id)! - order.get(b.rule.id)!)
    .slice(0, DENSE_TOP);
  const threshold = index.model.threshold;
  const ranking: RankingInfo = {
    engine,
    retrieval: mode,
    lexical: RANKING_VERSION,
    dense: modelLabel(index.key),
    ...(mode === "hybrid" ? { fusion: `rrf-k${RRF_K}-top${DENSE_TOP}` } : {}),
    threshold,
    ...(index.model.strictThreshold !== undefined ? { strictThreshold: index.model.strictThreshold } : {}),
  };
  const anchored = kbAnchor(input.text, kb).anchored;
  const byId = new Map(dense.map((d) => [d.rule.id, d]));
  const admitCos = new Map<string, number>();
  const admissionCosine = (id: string) => {
    if (!admitCos.has(id)) admitCos.set(id, cosine(qAdmit, index.vectors.get(id)!));
    return admitCos.get(id)!;
  };
  const queryKeys = new Set<string>();
  for (const t of tokenize(input.text)) {
    if (t.partOf) continue;
    queryKeys.add(t.key);
    queryKeys.add(t.stem);
  }
  const strict = index.model.strictThreshold;
  const admit = (id: string) => {
    const d = byId.get(id)!;
    if (!anchored || isTableRow(d.rule.originalText ?? "")) return false;
    const cos = admissionCosine(id);
    return cos >= threshold && denseClauseAdmissible(d.rule, queryKeys, cos, strict);
  };
  const own = (rule: KnowledgeRule) => hint !== null && rule.component === hint;
  const denseHit = (rule: KnowledgeRule, score: number): HybridHit => ({
    rule, score, coverage: 0, matched: [], ownComponent: own(rule), order: order.get(rule.id)!, cosine: admissionCosine(rule.id), denseOnly: true, via: "dense",
  });
  const hinted = <T extends { ownComponent: boolean }>(list: T[]) => (hint !== null ? promoteHinted(list, (x) => x.ownComponent) : list);
  if (mode === "dense") return { lexical, results: hinted(dense.filter((d) => admit(d.rule.id)).map((d) => denseHit(d.rule, d.cos))), ranking };

  const lexById = new Map(lexical.results.map((s) => [s.rule.id, s]));
  const ruleOf = (id: string) => lexById.get(id)?.rule ?? byId.get(id)!.rule;
  const tiebreak = (a: string, b: string) =>
    forceRank(ruleOf(a).force) - forceRank(ruleOf(b).force) || order.get(a)! - order.get(b)! || (a < b ? -1 : a > b ? 1 : 0);
  const fused = rrfFuse(lexical.results.map((s) => s.rule.id), dense.map((d) => d.rule.id), admit, tiebreak);
  const results: HybridHit[] = fused.map((f) =>
    f.via === "dense" ? denseHit(byId.get(f.id)!.rule, f.score) : { ...lexById.get(f.id)!, score: f.score, via: f.via, ...(byId.has(f.id) ? { cosine: byId.get(f.id)!.cos } : {}) },
  );
  return { lexical, results: hinted(results), ranking };
}
