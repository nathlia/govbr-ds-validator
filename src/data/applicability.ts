/**
 * Contexto normativo (2.9.0, NAT-83): dado o que foi OBSERVADO numa página — componentes br-*,
 * regiões do Template Base e termos de estado/contexto —, quais regras da base valem a pena
 * investigar, por quê, e que evidência cada uma pede.
 *
 * Contrato, não julgamento:
 *  - Uma candidata é uma regra a investigar, nunca um defeito. Pertinência não é verificação: o
 *    oráculo não avalia condições textuais nem exceções, só as devolve rotuladas como desconhecidas.
 *  - A seleção usa apenas dimensões publicadas da base: `component`, `relatedComponents`,
 *    `conditions`/`exceptions`/`expectedEvidence`/título/regra normalizada para termos, e as
 *    variantes nominais documentadas de cada componente (id, classe raiz `br-<id>`, nome da página
 *    oficial). Não há mapa inventado componente → regra global: a base não publica essa relação
 *    além de `relatedComponents`, e uma tabela feita à mão seria uma norma que a fonte não declara.
 *  - Regra de componente não observado não é devolvida (fora do contexto não é inventada).
 *  - `force:"example"` nunca entra: exemplo canônico é evidência de implementação, não norma (D-10).
 *  - A ordem é função só da entrada normalizada e da ordem da base — nada de braço, modelo,
 *    resultados anteriores ou telas específicas. O mesmo contexto devolve o mesmo texto.
 */
import { getComponentSpecs, getPageRules } from "./load.js";
import { PAGE_REGION_SELECTORS, type PageRegion } from "../evidence/pageFacts.js";
import {
  getKnowledgeBase,
  getKnowledgeConflicts,
  getComponentDefects,
  normalizeText,
  type KnowledgeRule,
  type RuleForce,
} from "./knowledge.js";
import { isTableRow, scoreTerms, type MatchField, type ScoredRule } from "./retrieval.js";

/** Chave nominal: sem acento, sem caixa, sem `br-`/`<>`, sem separadores. "Cookie Bar" → "cookiebar". */
function nameKey(value: string): string {
  return normalizeText(value)
    .replace(/^<\s*/, "")
    .replace(/\s*\/?>$/, "")
    .replace(/^\.?br[-_ ]/, "")
    .replace(/[^a-z0-9]/g, "");
}

let aliases: Map<string, string> | undefined;

/**
 * Variantes nominais DOCUMENTADAS de cada componente: o id do pacote, a classe raiz publicada na
 * especificação e o nome que a página oficial do DS dá ao componente (`source.pageTitle` das regras
 * do próprio componente, "Padrão Digital de Governo - [Componentes - ]Nome"). Nenhuma tradução ou
 * apelido fora dessas fontes.
 */
function componentAliases(): Map<string, string> {
  if (aliases) return aliases;
  const map = new Map<string, string>();
  for (const [name, spec] of Object.entries(getComponentSpecs().components)) {
    map.set(nameKey(name), name);
    map.set(nameKey(spec.rootClass), name);
  }
  for (const rule of getKnowledgeBase().rules) {
    const title = rule.source.pageTitle;
    if (!rule.component || typeof title !== "string") continue;
    // 3.7.0: "Padrão Digital de Governo - Componentes - Input". Corpus literal (2.12.0): o título da
    // própria página, "Input (Campo de Entrada de Texto)" — vale o nome antes do parêntese; a glosa
    // em português entre parênteses não vira variante (mesma regra de não traduzir de antes).
    const display = title.startsWith("Padrão Digital de Governo")
      ? title.split(" - ").at(-1)
      : rule.source.captureType === "literal-corpus-markdown"
        ? title.replace(/\s*\(.*\)\s*$/, "").trim()
        : undefined;
    if (display) map.set(nameKey(display), rule.component);
  }
  aliases = map;
  return map;
}

/** Resolve uma variante nominal documentada ao id do componente; `undefined` se não houver. */
export function resolveComponentName(value: string): string | undefined {
  return componentAliases().get(nameKey(value));
}

let glosses: Map<string, string> | undefined;

/** Glosa em português da página oficial ("Table (Tabela)" → "tabela"), só para detectar menção no texto. */
function componentGlosses(): Map<string, string> {
  if (glosses) return glosses;
  const map = new Map<string, string>();
  for (const rule of getKnowledgeBase().rules) {
    const title = rule.source.pageTitle;
    if (!rule.component || typeof title !== "string") continue;
    const gloss = /\(([^)]+)\)/.exec(title)?.[1];
    if (!gloss) continue;
    map.set(nameKey(gloss), rule.component);
    if (!/\s/.test(gloss.trim())) map.set(singular(nameKey(gloss)), rule.component); // "Abas" → "aba"
  }
  glosses = map;
  return map;
}

/**
 * Nomes de UMA palavra que NÃO valem como menção a componente no texto livre (revisão de 28/10):
 * palavra comum do português ou nome genérico/elemento HTML que numa observação quase sempre fala de
 * outra coisa. Os sete da revisão: botão, item, menu, lista, mensagem, card, etiqueta.
 */
export const NAMED_IN_TEXT_EXCLUDED = new Set([
  // revisão 28/10 (q028 recebia regras de Button por "botão 'Selecione o arquivo'")
  "botao", "item", "menu", "lista", "mensagem", "card", "etiqueta",
  // palavras comuns do português usadas na descrição da tela, não do componente
  "tabela", "cabecalho", "rodape", "divisor", "notificacao", "assistente", "autenticacao", "aba", "abas",
  // nomes genéricos em inglês / elementos HTML (`<button>`, `<input>`, `<table>`, `<header>`…)
  "button", "input", "select", "table", "header", "footer", "list", "message", "modal", "radio", "switch",
  "step", "steps", "tag", "tab", "loading", "divider", "notification",
]);
/*
 * Ficam (uma palavra, nome próprio do DS, raro como palavra comum numa observação): accordion, avatar,
 * breadcrumb, carousel/carrossel, checkbox, cookiebar, datetimepicker, magicbutton, pagination/paginação,
 * scrim, signin, skiplink, textarea, tooltip, upload, wizard — cada um nomeia um único componente e não
 * tem outro sentido corrente numa descrição de tela.
 */

/**
 * Componentes NOMEADOS no texto de uma consulta (3.1.0, NAT-97; critério estrito da revisão):
 * (a) classe raiz `br-*` (`span.br-tag` → tag); (b) nome oficial de VÁRIAS palavras, exato (nome da
 * página ou glosa em português: "Skip Link", "Menu de Navegação", "Caixa de Seleção", "Migalhas de
 * Pão"); (c) nome de uma palavra só se não estiver em `NAMED_IN_TEXT_EXCLUDED`. Nunca resolve o
 * argumento `component`; a busca usa isto só quando a chamada não traz `component`.
 */
export function componentsNamedIn(text: string): string[] {
  const words = normalizeText(text).split(/[^a-z0-9-]+/).filter(Boolean);
  const out = new Set<string>();
  const resolve = (phrase: string) => {
    const key = nameKey(phrase);
    if (!key) return undefined;
    return componentAliases().get(key) ?? componentGlosses().get(key);
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^br-[a-z0-9-]+$/.test(w)) {
      const name = componentAliases().get(nameKey(w));
      if (name) out.add(name);
      continue;
    }
    for (let n = 2; n <= 4 && i + n <= words.length; n++) {
      const name = resolve(words.slice(i, i + n).join(" "));
      if (name) out.add(name);
    }
    const single = [w, singular(w)].find((x) => !NAMED_IN_TEXT_EXCLUDED.has(nameKey(x)) && resolve(x));
    if (single && !NAMED_IN_TEXT_EXCLUDED.has(nameKey(w))) out.add(resolve(single)!);
  }
  return [...out].sort();
}

/** Plural regular → singular, só para nomes ("tabelas" → "tabela", "botoes" → "botao", "abas" → "aba"). */
function singular(word: string): string {
  if (/oes$/.test(word)) return word.slice(0, -3) + "ao";
  if (/ns$/.test(word)) return word.slice(0, -2) + "m";
  return word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Sugestões para um nome NÃO resolvido (2.17.0, B-05): a glosa em português da página oficial
 * ("Pagination (Paginação)" → "paginacao") e variantes documentadas a até 2 edições. Só sugere —
 * nunca resolve sozinho (a regra de não traduzir de `componentAliases` continua).
 */
export function suggestComponentNames(value: string): string[] {
  const key = nameKey(value);
  if (!key) return [];
  const out = new Set<string>();
  for (const rule of getKnowledgeBase().rules) {
    const title = rule.source.pageTitle;
    if (!rule.component || typeof title !== "string") continue;
    const gloss = /\(([^)]+)\)/.exec(title)?.[1];
    if (gloss && nameKey(gloss) === key) out.add(rule.component);
  }
  for (const [alias, name] of componentAliases()) if (editDistance(alias, key) <= 2) out.add(name);
  return [...out].sort();
}

/** Componente cuja classe raiz identifica a região do Template Base (`.br-header` → `header`). */
export function regionComponent(region: PageRegion): string {
  return PAGE_REGION_SELECTORS[region].replace(/^\.br-/, "");
}

export const PAGE_REGIONS = Object.keys(PAGE_REGION_SELECTORS) as PageRegion[];

export interface RuleContext {
  components?: string[];
  regions?: PageRegion[];
  terms?: string[];
}

export interface NormalizedContext {
  /** Componentes resolvidos, ordenados e sem repetição. */
  components: string[];
  regions: PageRegion[];
  terms: string[];
  /** Nomes que não correspondem a nenhuma variante documentada — nunca adivinhados. */
  unresolved: string[];
}

export function normalizeContext(context: RuleContext): NormalizedContext {
  const components = new Set<string>();
  const unresolved = new Set<string>();
  for (const raw of context.components ?? []) {
    const name = resolveComponentName(raw);
    if (name) components.add(name);
    else unresolved.add(raw.trim());
  }
  const regions = [...new Set(context.regions ?? [])].sort();
  for (const region of regions) components.add(regionComponent(region));
  const terms = [...new Set((context.terms ?? []).map(normalizeText).filter((t) => t.length >= 3))].sort();
  return { components: [...components].sort(), regions, terms, unresolved: [...unresolved].sort() };
}

export type RetrievalReason =
  | { kind: "component-observed"; component: string }
  | { kind: "region-observed"; region: PageRegion; component: string }
  | { kind: "related-component-observed"; component: string; via: "relatedComponents" }
  | { kind: "term"; term: string; fields: TermField[] };

/**
 * Field where a context term matched (2.17.0: reported by the relevance engine; `text` =
 * title/normalizedRule/originalText, `section` = source.sectionPath, `references` = WCAG/e-MAG ids).
 */
export type TermField = MatchField | "title" | "normalizedRule";

/** Requisito, orientação ou permissão — a força não muda por ter sido recuperada. */
export type Obligation = "mandatory" | "advisory" | "permissive" | "informative" | "unclear";

export function obligationOf(force: RuleForce): Obligation {
  switch (force) {
    case "required":
    case "prohibited":
      return "mandatory";
    case "recommended":
    case "discouraged":
      return "advisory";
    case "permitted":
      return "permissive";
    case "informative":
      return "informative";
    default:
      return "unclear";
  }
}

/** Estado/evidência que a estratégia de validação publicada exige antes de qualquer julgamento. */
const NEEDED_STATE: Record<string, string> = {
  dom: "DOM do estado em que o elemento aparece.",
  "computed-style": "Estilos computados no estado em que a regra se aplica.",
  "keyboard-interaction": "Interação por teclado reproduzida (ações), não apenas o DOM inicial.",
  "accessibility-tree": "Árvore de acessibilidade calculada pelo navegador.",
  "responsive-viewport": "Observação em mais de uma largura de viewport.",
  semantic: "Leitura do conteúdo no contexto; julgamento, não medição.",
  visual: "Inspeção visual da renderização.",
  manual: "Revisão humana.",
  "source-code": "Código-fonte ou carregamento de recursos; o DOM renderizado não basta.",
};

export function neededStateFor(strategy: string): string {
  return NEEDED_STATE[strategy] ?? "Estratégia de validação não mapeada; tratar como revisão humana.";
}

export interface CandidateApplicability {
  /**
   * `in-scope`: o componente da própria regra foi observado e a regra não declara condição nem exceção.
   * `unknown`: pertinência por relação, região ou termo, ou condição/exceção não avaliada.
   * Nunca `applicable`/`verified`: o oráculo não decide aplicabilidade a partir de texto.
   */
  status: "in-scope" | "unknown";
  /** Campos declarados na regra que o oráculo NÃO avalia (o texto está na própria candidata). */
  unevaluated: Array<"conditions" | "exceptions">;
  /** Lacunas de contexto: relação não observada, regra global por relação/termo. */
  unknowns: string[];
}

export interface ConflictLabel {
  type: string;
  status: string;
  /** Único vínculo aceito: a fonte do conflito nomeia a regra pelo título exato. */
  link: "ruleTitle";
}

/** Conflito documentado sobre uma PÁGINA-fonte de candidatas, sem associação a regra específica. */
export interface SourcePageNote {
  type: string;
  status: string;
  url: string;
}

export interface ContextCandidate {
  rule: KnowledgeRule;
  rank: number;
  /** Lexical relevance from the engine for context terms/query (0 = entered by observation only). */
  relevance: number;
  reasons: RetrievalReason[];
  applicability: CandidateApplicability;
  obligation: Obligation;
  neededState: string;
  conflicts: ConflictLabel[];
}

/**
 * Termo casa no INÍCIO de palavra, admitindo sufixo ("erro" casa "erros", não "interrompe"). Ambos
 * os lados já normalizados (sem caixa/acento).
 */
export function containsTerm(normalizedText: string, term: string): boolean {
  let from = 0;
  for (;;) {
    const at = normalizedText.indexOf(term, from);
    if (at < 0) return false;
    if (at === 0 || !/[a-z0-9]/.test(normalizedText[at - 1])) return true;
    from = at + 1;
  }
}

function conflictEntries(): Array<Record<string, unknown>> {
  // conflicts.json é `{ conflicts: [...] }`; getKnowledgeConflicts() guarda o arquivo inteiro.
  const file = getKnowledgeConflicts().conflicts as { conflicts?: unknown } | undefined;
  return Array.isArray(file?.conflicts) ? (file.conflicts as Array<Record<string, unknown>>) : [];
}

function entrySources(entry: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(entry.sources) ? (entry.sources as Array<Record<string, unknown>>) : [];
}

/**
 * Conflitos ligados à regra SÓ pelo título exato que a fonte do conflito cita (a base não publica id
 * de regra nos conflitos). Mesma página-fonte não é vínculo: uma página tem várias regras e o
 * conflito pode tratar de outra — esses vão para `sourcePageNotes`, sem associação.
 */
function conflictLabels(rule: KnowledgeRule): ConflictLabel[] {
  return conflictEntries()
    .filter((entry) => entrySources(entry).some((s) => s.ruleTitle === rule.title))
    .map((entry) => ({ type: String(entry.type ?? "unknown"), status: String(entry.status ?? "unknown"), link: "ruleTitle" as const }));
}

/** Conflitos cuja página-fonte é a de alguma candidata e que não citam regra por título. */
export function sourcePageNotes(candidates: ContextCandidate[]): SourcePageNote[] {
  const urls = new Set(candidates.map((c) => c.rule.source.url));
  const notes: SourcePageNote[] = [];
  for (const entry of conflictEntries()) {
    const type = String(entry.type ?? "unknown");
    const status = String(entry.status ?? "unknown");
    const pages = [
      ...(typeof entry.sourceUrl === "string" ? [entry.sourceUrl] : []),
      ...entrySources(entry).filter((s) => s.ruleTitle === undefined && typeof s.url === "string").map((s) => s.url as string),
    ];
    for (const url of pages) if (urls.has(url)) notes.push({ type, status, url });
  }
  return notes.sort((a, b) => codeUnitCompare(a.url, b.url) || codeUnitCompare(a.type, b.type));
}

/** Ordem por unidade de código — independente de locale/ICU. */
function codeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const RANK: Record<RetrievalReason["kind"], number> = {
  "component-observed": 0,
  "region-observed": 0,
  "related-component-observed": 1,
  term: 2,
};

/** 2.9.0–2.16.1 term matching, kept for match:"literal": word-start substring in five fields. */
function literalTermFields(rule: KnowledgeRule, term: string): TermField[] {
  const fields: Array<[TermField, string[]]> = [
    ["conditions", rule.conditions],
    ["exceptions", rule.exceptions],
    ["expectedEvidence", rule.expectedEvidence],
    ["title", [rule.title]],
    ["normalizedRule", [rule.normalizedRule]],
  ];
  return fields.filter(([, values]) => values.some((v) => containsTerm(normalizeText(v), term))).map(([f]) => f);
}

/**
 * Seleciona candidatas sobre `base` (já filtrada por força/categoria/estratégia, sem exemplos).
 *
 * 2.17.0 (NAT-97): adaptador do motor único de relevância (`retrieval.ts`). Os componentes/regiões
 * observados definem quem é elegível (próprias regras + globais). Cada termo do contexto é uma
 * observação independente: é pontuado SOZINHO pelo motor (mesma normalização, campos, pesos e piso
 * absoluto, sem corte relativo) e a relevância da regra é a SOMA das pontuações dos termos que ela
 * passa — uma regra pertinente a duas observações sobe, e um termo nunca derruba outro. Uma `query`
 * dada junto é pontuada como uma pergunta (com a regra de 2 termos em 4+) e somada da mesma forma.
 * Global só entra por relação documentada ou por algum termo acima do piso. Ordem: grupos
 * alternados (global primeiro, componentes A→Z); dentro do grupo, relevância → motivo → prosa antes
 * de linha de tabela → faixa de força (só desempate) → ordem da base.
 *
 * Com `match:"literal"`, o caminho é o da 2.16.1 sem mudança: termo por início de palavra em
 * condições/exceções/evidência/título/regra, ordem força → motivo → base.
 */
export function retrieveContextCandidates(
  base: KnowledgeRule[],
  context: NormalizedContext,
  options: { query?: string; vocabulary?: boolean; match?: "relevance" | "literal" } = {},
): ContextCandidate[] {
  const literal = options.match === "literal";
  const observed = new Set(context.components);
  const regionOf = new Map(context.regions.map((region) => [regionComponent(region), region]));
  const order = new Map(getKnowledgeBase().rules.map((rule, index) => [rule.id, index]));
  const eligible = base.filter((rule) => rule.force !== "example" && (rule.component === null || observed.has(rule.component)));
  const query = options.query?.trim() ?? "";
  const perTerm = literal ? [] : context.terms.map((term) => ({ term, scores: scoreTerms([term], eligible, options.vocabulary) }));
  const queryScores = !literal && query ? scoreTerms([query], eligible, options.vocabulary) : new Map<string, ScoredRule>();
  const out: ContextCandidate[] = [];

  for (const rule of eligible) {
    const reasons: RetrievalReason[] = [];
    if (rule.component !== null) {
      const region = regionOf.get(rule.component);
      reasons.push(region ? { kind: "region-observed", region, component: rule.component } : { kind: "component-observed", component: rule.component });
    }
    for (const related of rule.relatedComponents) {
      if (observed.has(related)) reasons.push({ kind: "related-component-observed", component: related, via: "relatedComponents" });
    }
    let relevance = 0;
    if (literal) {
      for (const term of context.terms) {
        const fields = literalTermFields(rule, term);
        if (fields.length) reasons.push({ kind: "term", term, fields });
      }
    } else {
      for (const { term, scores } of perTerm) {
        const scored = scores.get(rule.id);
        if (!scored) continue;
        relevance += scored.score;
        reasons.push({ kind: "term", term, fields: [...new Set(scored.matched.flatMap((m) => m.fields))].sort() });
      }
      const q = queryScores.get(rule.id);
      if (q) {
        relevance += q.score;
        reasons.push({ kind: "term", term: query, fields: [...new Set(q.matched.flatMap((m) => m.fields))].sort() });
      }
    }
    if (!reasons.length) continue;

    const unevaluated: CandidateApplicability["unevaluated"] = [];
    if (rule.conditions.length) unevaluated.push("conditions");
    if (rule.exceptions.length) unevaluated.push("exceptions");
    const unknowns: string[] = [];
    for (const related of rule.relatedComponents) {
      if (!observed.has(related)) unknowns.push(`Relação documentada com '${related}' (relatedComponents), que não foi informado como observado.`);
    }
    if (rule.component === null) {
      unknowns.push("Regra global: a pertinência vem da relação ou do termo informado, não de verificação do contexto.");
    }
    const strongest = Math.min(...reasons.map((r) => RANK[r.kind]));
    // Condição ou exceção declarada e não avaliada deixa a aplicabilidade desconhecida.
    const status: CandidateApplicability["status"] =
      rule.component !== null && rule.conditions.length === 0 && rule.exceptions.length === 0 ? "in-scope" : "unknown";

    out.push({
      rule,
      rank: strongest,
      relevance: Math.round(relevance * 1000) / 1000,
      reasons,
      applicability: { status, unevaluated, unknowns },
      obligation: obligationOf(rule.force),
      neededState: neededStateFor(rule.validationStrategy),
      conflicts: conflictLabels(rule),
    });
  }

  return interleaveByGroup(out, order, literal);
}

/** Grupo de uma candidata: o componente dono da regra, ou GLOBAL_GROUP (relação documentada/termo). */
export const GLOBAL_GROUP = "(global)";
export function candidateGroup(candidate: ContextCandidate): string {
  return candidate.rule.component ?? GLOBAL_GROUP;
}

/** Faixa de força: obrigação (required/prohibited) → orientação (recommended/discouraged) → o resto. */
export function forceTier(force: RuleForce): number {
  const o = obligationOf(force);
  return o === "mandatory" ? 0 : o === "advisory" ? 1 : 2;
}

/**
 * Ordem das candidatas (2.12.0, revisão da base literal). Até a 2.11.0 a ordem era motivo →
 * componente A→Z → ordem da base: com a base literal (dezenas de regras por componente), um
 * formulário {button, datetimepicker, input, upload} ocupava as 4 primeiras páginas só com button e
 * as regras globais do e-MAG casadas por termo ficavam na página 11. Agora: um grupo por componente
 * observado e um grupo global, e os grupos se alternam (global primeiro, componentes em ordem
 * alfabética), de modo que a primeira página traz candidatas de todos. Continua função só do
 * contexto normalizado. Dentro do grupo: 2.17.0, relevância → motivo → prosa antes de linha de
 * tabela (API/anatomia, B-06) → faixa de força (só desempate) → ordem da base; com match:"literal",
 * a ordem da 2.12.0–2.16.1 (faixa de força → motivo → ordem da base).
 */
function interleaveByGroup(candidates: ContextCandidate[], order: Map<string, number>, literal = false): ContextCandidate[] {
  const groups = new Map<string, ContextCandidate[]>();
  for (const c of candidates) {
    const g = candidateGroup(c);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }
  const keys = [...groups.keys()].sort((a, b) =>
    a === GLOBAL_GROUP ? -1 : b === GLOBAL_GROUP ? 1 : codeUnitCompare(a, b),
  );
  const byOrder = (a: ContextCandidate, b: ContextCandidate) => (order.get(a.rule.id) ?? 0) - (order.get(b.rule.id) ?? 0);
  const compare = literal
    ? (a: ContextCandidate, b: ContextCandidate) => forceTier(a.rule.force) - forceTier(b.rule.force) || a.rank - b.rank || byOrder(a, b)
    : (a: ContextCandidate, b: ContextCandidate) =>
        b.relevance - a.relevance ||
        a.rank - b.rank ||
        // B-06: an API/anatomy table row never precedes a prose clause by force alone.
        Number(isTableRow(a.rule.originalText ?? "")) - Number(isTableRow(b.rule.originalText ?? "")) ||
        forceTier(a.rule.force) - forceTier(b.rule.force) ||
        byOrder(a, b);
  const queues = keys.map((k) => groups.get(k)!.sort(compare));
  const out: ContextCandidate[] = [];
  for (let i = 0; out.length < candidates.length; i++) {
    for (const q of queues) if (i < q.length) out.push(q[i]);
  }
  return out;
}

export interface CandidateGroupSummary {
  group: string;
  total: number;
  byObligation: Partial<Record<Obligation, number>>;
}

/** Contagem por grupo (componente observado ou global), na ordem em que os grupos se alternam. */
export function summarizeGroups(candidates: ContextCandidate[]): CandidateGroupSummary[] {
  const map = new Map<string, CandidateGroupSummary>();
  for (const c of candidates) {
    const g = candidateGroup(c);
    const entry = map.get(g) ?? { group: g, total: 0, byObligation: {} };
    entry.total += 1;
    entry.byObligation[c.obligation] = (entry.byObligation[c.obligation] ?? 0) + 1;
    map.set(g, entry);
  }
  return [...map.values()].sort((a, b) =>
    a.group === GLOBAL_GROUP ? -1 : b.group === GLOBAL_GROUP ? 1 : codeUnitCompare(a.group, b.group),
  );
}

/** Avisos de exemplos canônicos defeituosos por componente do contexto (mesma fonte do get_component_spec). */
export function exampleDefectWarnings(components: string[]): Array<{ component: string; count: number; types: string[] }> {
  return components
    .map((component) => {
      const defects = getComponentDefects(component);
      return { component, count: defects.length, types: [...new Set(defects.map((d) => d.type))].sort() };
    })
    .filter((w) => w.count > 0);
}

/**
 * Categorias de `get_page_rules` cujo texto publicado contém algum termo do contexto — ponteiros,
 * não regras: a prosa de página não tem id normativo por frase. Seções devolvidas pelo nome.
 */
export function pageCategoryPointers(terms: string[]): Array<{ category: string; label: string; terms: string[]; sections: string[] }> {
  if (!terms.length) return [];
  const out: Array<{ category: string; label: string; terms: string[]; sections: string[] }> = [];
  for (const [category, data] of Object.entries(getPageRules().categories)) {
    const sections = Object.entries(data.sections ?? {}).map(([name, text]) => [name, normalizeText(typeof text === "string" ? text : JSON.stringify(text))] as const);
    const label = normalizeText(data.label);
    const matched = terms.filter((t) => containsTerm(label, t) || sections.some(([, text]) => containsTerm(text, t)));
    if (!matched.length) continue;
    out.push({
      category,
      label: data.label,
      terms: matched,
      sections: sections.filter(([, text]) => matched.some((t) => containsTerm(text, t))).map(([name]) => name),
    });
  }
  return out;
}

/** Reset memoized aliases (tests only). */
export function resetApplicabilityCache(): void {
  aliases = undefined;
  glosses = undefined;
}
