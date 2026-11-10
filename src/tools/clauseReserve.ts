/** A5: catálogo ordenado para a reserva; nunca decide aplicabilidade ou registra pendências. */
import { createHash } from "node:crypto";
import type { KnowledgeRule } from "../data/knowledge.js";
import { byMeasurability, checklistRules, procedureOf, type Procedure } from "./componentChecklist.js";
import { pageChecklistRules } from "./pageChecklist.js";
import { oracleFullyMeasures } from "./oracleCoverage.js";
import { clauseWindow, procedureScope } from "./procedureScope.js";
import { textSize } from "../responses/contract.js";

/**
 * 3.7.4 (D1): 1.1.0 — a quota de conteúdo vale também para o contexto (inteiro só quando cabe; senão janela literal com
 * faixas declaradas, ou referência), o contexto já entregue nesta sessão volta só pela referência, e o bloco cabe no
 * espaço que os fatos deixam (montador: fatos primeiro).
 */
/**
 * 3.7.5: 1.2.0 — o estado das cláusulas sai separado do `complete` dos fatos (`clauses` no topo da resposta, com UM next
 * para as não entregues); o bloco mínimo adiado nunca sai sem esse caminho (R1); cláusula já entregue inteira na sessão
 * não se repete: vai só pela referência (`alreadyDelivered`) e o prefixo avança para as seguintes (R2).
 */
export const CLAUSE_RESERVE_VERSION = "clause-reserve/1.2.0";
type Scope = NonNullable<ReturnType<typeof procedureScope>>;
type Range = { start: number; end: number };
/** component = a fila do investigate de onde a candidata veio (null = checklist global da página). */
export type ReserveCandidate = { rule: KnowledgeRule; procedure: Procedure; context: Scope | null; component?: string | null };
/** Sessão: o scan em que o contexto (inteiro, ou as faixas pedidas) já saiu; undefined = não saiu. */
export type ContextDelivered = (key: string, ranges?: Range[]) => string | undefined;

export function reserveCandidates(components: string[]): ReserveCandidate[] {
  const candidates = (rules: KnowledgeRule[]) => byMeasurability(rules
    .filter(rule => !oracleFullyMeasures(rule.id))
    .map(rule => ({ rule, procedure: procedureOf(rule) }))
    .filter((x): x is { rule: KnowledgeRule; procedure: Procedure } => x.procedure !== null));
  const queues = [...new Set(components)].map(component => candidates(checklistRules(component)).map(x => ({ ...x, component })));
  // Rodízio preserva a ordem por componente/estado do investigate e a mensurabilidade dentro de cada fila.
  const ordered: Array<{ rule: KnowledgeRule; procedure: Procedure; component: string | null }> = [];
  for (let i = 0; queues.some(q => i < q.length); i++) for (const q of queues) if (q[i]) ordered.push(q[i]);
  if (!ordered.length) ordered.push(...candidates(pageChecklistRules()).map(x => ({ ...x, component: null })));
  const seen = new Set<string>();
  return ordered.filter(x => !seen.has(x.rule.id) && Boolean(seen.add(x.rule.id)))
    .map(x => ({ ...x, context: x.procedure.context ?? procedureScope(x.rule, 100_000) }));
}

/** Leitura literal contextual: união de parágrafos, sem repetir trechos já presentes. */
export function reserveContentChars(texts: string[]) {
  const normalized = [...new Set(texts.flatMap(s => s.split(/\n\s*\n/))
    .map(s => s.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean))];
  return normalized.filter(s => !normalized.some(other => other !== s && other.includes(s)))
    .reduce((n, s) => n + JSON.stringify(s).length - 2, 0);
}

/** Identidade do contexto: o objeto completo (texto, arquivo, versão, faixas). Estável entre scans da sessão. */
export const contextKey = (context: Scope) => createHash("sha256").update(JSON.stringify(context)).digest("hex").slice(0, 16);

const reread = (id: string) => ({ tool: "get_ds_rules", arguments: { id } });

const NOTE = "Leitura contextual deduplicada: candidatas, não veredito nem pendingId; confira condições e aplicabilidade (o contexto tem modalidade própria). contexts: literal-scope inteiro; literal-window = trechos literais (source.ranges; [… ] = salto); deferred/delivered = referência (delivered: o texto saiu em deliveredIn). next = get_ds_rules{id}: parágrafo literal e cláusulas adjacentes da seção, sem as introduções ancestrais do escopo.";

/** 3.7.5 (R2): cláusulas da reserva já entregues inteiras nesta sessão — referência, não texto (L1: com os ids). */
export type EarlierClauses = { count: number; in: string[]; ids: string[] };
/** Sessão: o scan em que a cláusula da reserva já saiu inteira; undefined = não saiu. */
export type ClauseDelivered = (id: string) => string | undefined;

/**
 * 3.7.5 (R2): separa as candidatas cujo texto já saiu inteiro nesta sessão (não se repetem; vão por referência) das que
 * ainda não saíram (o prefixo da reserva avança sobre estas, na mesma ordem).
 */
export function splitDelivered(candidates: ReserveCandidate[], delivered?: ClauseDelivered): { fresh: ReserveCandidate[]; earlier?: EarlierClauses } {
  if (!delivered) return { fresh: candidates };
  const fresh: ReserveCandidate[] = [];
  const scans: string[] = [];
  const ids: string[] = [];
  for (const c of candidates) {
    const scanId = delivered(c.rule.id);
    if (scanId === undefined) { fresh.push(c); continue; }
    ids.push(c.rule.id);
    if (!scans.includes(scanId)) scans.push(scanId);
  }
  return ids.length ? { fresh, earlier: { count: ids.length, in: scans.slice(0, 3), ids } } : { fresh };
}

/**
 * Referência às cláusulas já entregues: os scans em que saíram e (revisão L1) os ids, para reler por
 * get_ds_rules{ids} sem procurar nas respostas antigas.
 */
const earlierBlock = (earlier?: EarlierClauses) => earlier ? { alreadyDelivered: { count: earlier.count, in: earlier.in, ids: earlier.ids } } : {};

/** Revisão M1: o next é a lista de UM componente; byComponent diz quantas faltam em cada um (a mesma chamada, outro componente). */
const CLAUSES_NOTE = "O complete dos fatos não cobre as cláusulas. deferred = candidatas não entregues aqui, por componente em byComponent; next = a lista de verificação do 1º (para os demais, a mesma chamada com o componente; page = get_page_rules{view:\"checklist\"}).";

/**
 * 3.7.5 (opção 1 do mecanismo dev-374-b): estado das cláusulas candidatas desta resposta, separado do `complete` dos fatos.
 * deferred = candidatas cujo texto não veio aqui (nem antes, na sessão); contextsByReference = contextos adiados (só
 * referência). UM next: a lista de verificação do componente com mais cláusulas não entregues (texto, força e como
 * medir), ou a global da página; só com contextos adiados, a releitura do 1º. Sem candidatas (nem entregues antes): nada.
 */
export function clausesSummary(block: Record<string, unknown>, fresh: ReserveCandidate[], earlier?: EarlierClauses): Record<string, unknown> | undefined {
  if (!fresh.length && !earlier) return undefined;
  // Revisão L7: pelo conjunto de ids mostrados, não pela contagem.
  const shownIds = new Set((Array.isArray(block.clauses) ? block.clauses : []).map((c) => (c as { citeAs?: string }).citeAs));
  const pending = fresh.filter((c) => !shownIds.has(c.rule.id));
  const deferred = pending.length;
  const refs = Object.values((block.contexts ?? {}) as Record<string, { status?: string; next?: unknown }>).filter((c) => c && c.status === "deferred");
  if (!deferred && !refs.length) return { complete: true };
  let next: unknown;
  if (deferred) {
    const counts = new Map<string | null, number>();
    for (const c of pending) {
      const k = c.component === undefined ? (c.rule.component ?? null) : c.component;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let best: string | null = null;
    let most = -1;
    for (const [k, n] of counts) if (n > most) { best = k; most = n; }
    next = best === null
      ? { tool: "get_page_rules", arguments: { view: "checklist" } }
      : { tool: "get_component_spec", arguments: { component: best, view: "checklist" } };
  } else next = refs[0].next;
  // Revisão M1: quantas faltam por componente (o next cobre um só: o 1º daqui, o de mais pendentes); `page` = as globais.
  const byComponent: Record<string, number> = {};
  if (deferred) {
    const counts = new Map<string, number>();
    for (const c of pending) {
      const k = (c.component === undefined ? c.rule.component : c.component) ?? "page";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, n] of [...counts].sort((x, y) => y[1] - x[1])) byComponent[k] = n;
  }
  return { complete: false, deferred, ...(Object.keys(byComponent).length > 1 ? { byComponent } : {}), ...(refs.length ? { contextsByReference: refs.length } : {}), next, note: CLAUSES_NOTE };
}

export type ReserveOptions = {
  /** Teto do bloco serializado (o espaço que os fatos deixaram). */
  maxBlockChars?: number;
  delivered?: ContextDelivered;
  /** Piso: uma cláusula inteira com o contexto só por referência (ou já entregue). */
  minimal?: boolean;
  /** 3.7.5 (R2): as cláusulas já entregues inteiras (fora de `candidates`), declaradas por referência no bloco. */
  earlier?: EarlierClauses;
};

/**
 * Conta contexto literal obrigatório; ids, when/provenance, fonte e metadados não preenchem quota.
 * 3.7.4 (D1): a cláusula vai sempre inteira (texto, força, condições, exceções, procedimento); o contexto entra inteiro só
 * quando cabe na quota restante, senão como janela literal da própria seção (faixas declaradas), senão por referência. A
 * 1ª cláusula pode passar da quota sozinha (nunca é cortada); as seguintes só entram se couberem nela. `maxBlockChars`
 * limita o bloco serializado; sem nenhuma cláusula que caiba, `clauses` vem vazio (quem monta decide).
 */
export function selectReserve(candidates: ReserveCandidate[], maxChars: number, options: ReserveOptions = {}) {
  const targetChars = Math.ceil(maxChars * .2);
  const maxBlock = options.maxBlockChars ?? Number.POSITIVE_INFINITY;
  const clauses: Array<Record<string, unknown>> = [];
  const contexts: Record<string, Record<string, unknown>> = {};
  const content: string[] = [];
  const literals: string[] = [];
  const scoped: string[] = [];
  let unavailable: string | undefined;
  let stop: "quota" | "block" | undefined;
  const counts = () => {
    const contentChars = reserveContentChars(content);
    const literalChars = reserveContentChars(literals);
    const scopedChars = reserveContentChars(scoped);
    return { contentChars, literalChars, contextChars: scopedChars - literalChars, procedureChars: contentChars - scopedChars };
  };
  const blockWith = (status: string) => {
    const c = counts();
    return { version: CLAUSE_RESERVE_VERSION, targetChars, ...c, status,
      ...(clauses.length < candidates.length && clauses.length ? { more: candidates.length - clauses.length } : {}),
      ...earlierBlock(options.earlier),
      note: NOTE, clauses, ...(clauses.length ? { contexts } : {}) };
  };
  for (const { rule, procedure, context } of candidates) {
    if (!context) { unavailable = rule.id; break; }
    const { context: _context, ...measure } = procedure;
    const clauseTexts = [rule.originalText, measure.select, measure.measure, measure.expect];
    const withClause = reserveContentChars([...content, ...clauseTexts]);
    // Nunca troca uma cláusula por outra mais barata: a seguinte que passaria da quota encerra o prefixo.
    if (clauses.length && withClause > targetChars) { stop = "quota"; break; }
    const key = contextKey(context);
    const clause: Record<string, unknown> = { citeAs: rule.id, force: rule.force, text: rule.originalText, conditions: rule.conditions,
      exceptions: rule.exceptions, procedure: measure, context: key,
      source: { url: rule.source.url, sectionPath: rule.source.sectionPath, charRange: rule.source.charRange } };
    const ref = (status: "deferred" | "delivered", scanId?: string, windowChars?: number) => ({ kind: windowChars !== undefined ? "literal-window" : context.kind, status,
      ...(scanId ? { deliveredIn: scanId } : {}), chars: windowChars ?? context.text.length, next: reread(rule.id) });
    // Formas do contexto, da mais rica à referência; a 1ª que respeita quota e bloco fica.
    const options_: Array<{ ctx: Record<string, unknown>; texts: string[]; delivered?: boolean }> = [];
    let known: Record<string, unknown> | undefined = contexts[key];
    // Revisão (LOW): a janela recortada em torno de outra cláusula do mesmo escopo pode não conter esta — então esta
    // cláusula leva a sua própria referência, sob chave derivada.
    if (known?.kind === "literal-window" && typeof known.text === "string" && !known.text.includes(rule.originalText)) {
      known = undefined;
      clause.context = `${key}~${clauses.length + 1}`;
    }
    const ctxKey = clause.context as string;
    if (known) options_.push({ ctx: known, texts: [] });
    else {
      const whole = options.delivered?.(key);
      if (whole) options_.push({ ctx: ref("delivered", whole), texts: [] });
      else if (ctxKey !== key) { /* janela de outra cláusula: só a referência abaixo */ }
      else if (!options.minimal) {
        if (reserveContentChars([...content, ...clauseTexts, context.text]) <= targetChars) options_.push({ ctx: context as unknown as Record<string, unknown>, texts: [context.text] });
        let allowance = targetChars - withClause;
        for (let i = 0; i < 4 && allowance > 0; i++, allowance = Math.floor(allowance * .6)) {
          const w = clauseWindow(rule, context, allowance);
          if (!w) continue;
          const { parts, ...shown } = w;
          const seenIn = options.delivered?.(key, w.source.ranges);
          options_.push(seenIn
            ? { ctx: ref("delivered", seenIn, w.text.length), texts: [] }
            : { ctx: { ...shown, scopeChars: context.text.length, next: reread(rule.id) }, texts: parts });
        }
      }
      options_.push({ ctx: ref("deferred"), texts: [] });
    }
    let placed = false;
    for (const option of options_) {
      contexts[ctxKey] = option.ctx;
      clauses.push(clause);
      if (textSize(blockWith("limited-by-facts")) <= maxBlock) {
        placed = true;
        literals.push(rule.originalText);
        if (option.texts.length) scoped.push(rule.originalText, ...option.texts);
        else scoped.push(rule.originalText);
        content.push(...clauseTexts, ...option.texts);
        break;
      }
      clauses.pop();
      if (known) break;
      delete contexts[ctxKey];
    }
    if (!placed) { if (known) contexts[ctxKey] = known; stop = "block"; break; }
    if (options.minimal || reserveContentChars(content) >= targetChars) break;
  }
  const { contentChars } = counts();
  const status = !candidates.length ? (options.earlier ? "delivered-earlier" : "no-candidates")
    : contentChars >= targetChars ? "fulfilled"
      : stop === "block" ? "limited-by-facts"
        : stop === "quota" ? "quota-reached"
          : clauses.length >= candidates.length ? "exhausted" : options.minimal ? "floor" : unavailable ? "context-unavailable" : "exhausted";
  return { unavailable, block: blockWith(status) };
}

/**
 * 3.7.4 (D1): os fatos ocuparam a 1ª página e não sobrou espaço para uma cláusula inteira: a reserva não foi entregue nesta
 * resposta (declarado), com as primeiras candidatas por id e o caminho para lê-las.
 */
export function deferredReserve(candidates: ReserveCandidate[], maxChars: number, tiny = false, earlier?: EarlierClauses) {
  const ids = candidates.slice(0, 3).map((c) => c.rule.id);
  // 3.7.5 (R1): o caminho para lê-las é o next de `clauses` (topo da resposta), que acompanha toda forma deste bloco.
  // Revisão L3: sem candidata que falte (todas já entregues na sessão), o status é o mesmo do bloco cheio.
  if (!candidates.length && earlier) {
    return { version: CLAUSE_RESERVE_VERSION, targetChars: Math.ceil(maxChars * .2), contentChars: 0, status: "delivered-earlier", ...(tiny ? {} : earlierBlock(earlier)) };
  }
  return { version: CLAUSE_RESERVE_VERSION, targetChars: Math.ceil(maxChars * .2), contentChars: 0, status: "deferred-by-facts",
    ...(tiny ? {} : { note: "A 1ª página (fatos e pendências) não deixou espaço para uma cláusula inteira. Leia as candidatas pelo next de clauses ou peça maxChars maior.", candidates: ids, total: candidates.length, ...earlierBlock(earlier) }) };
}

/**
 * 3.7.5 (R2): o piso de uma resposta cujos fatos não cabem inteiros, quando a sessão já recebeu inteiras cláusulas destas
 * candidatas: em vez de repetir uma cláusula (ou trocar fatos por uma nova), a reserva vai por referência — as já
 * entregues pelos scans indicados, as demais pelo next de `clauses`.
 */
export function referenceFloor(maxChars: number, earlier: EarlierClauses) {
  return { version: CLAUSE_RESERVE_VERSION, targetChars: Math.ceil(maxChars * .2), contentChars: 0, status: "floor-by-reference", ...earlierBlock(earlier) };
}
