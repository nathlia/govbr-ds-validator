/**
 * NAT-97 (2.17.0): one relevance engine for `get_ds_rules` — `query` and `context` both rank here.
 *
 * What it is: deterministic lexical scoring over the loaded KB (BM25-style saturation per field,
 * concept coverage, exact identifier/phrase evidence, a component hint) with a declared relevance
 * floor. No model, no network, no screen maps, arms, results or answer keys.
 *
 * What it is not: a relevance score is a reason to READ a rule, never applicability or a
 * conformity claim. Nothing here writes text: every returned item is an existing KB record.
 *
 * Normalization: case, accents and markdown markers (`* _ \``) are folded; separators split words,
 * but hyphenated identifiers stay whole (`aria-current`, `br-tag`, `e-mag`, also indexed by their
 * parts), and dotted normative numbers stay whole (`3.9`, `1.3.1`). Words get a light Portuguese
 * plural fold (`pluralFold`) and a 6-character prefix stem for inflection
 * (`associado`/`associe` → `associ`); exact forms score above stem-only matches.
 *
 * 1.1.0 (validator 3.1.0, NAT-97 second pass), all general, none per query:
 *  - plurals -res/-zes, -ens/-uns, -ais/-eis/-ois/-uis fold too (cores → cor, imagens → imagem);
 *  - query words sharing a stem are one concept (a rule saying "paginação" no longer scores
 *    "pagina" and "paginacao" twice);
 *  - without `component`, ONE component named in the text (strict `componentsNamedIn`) gets the hint weight;
 *  - table rows get no exact-identifier credit and do not set the relative floor for prose;
 *  - vocabulary 1.1.0: `tab` alone is the key, not the Tab component; observation→rule groups
 *    (origem "observacao→regra", switch GOVBR_RETRIEVAL_VOCAB_OBS=off).
 *
 * Order: final score desc → force tier (mandatory, advisory, rest) → KB order. Force only breaks
 * ties; it never promotes a rule above a better-matching one. Same input + KB version + ranking
 * version + vocabulary state → same list.
 */
import { getKnowledgeBase, type KnowledgeBase, type KnowledgeRule, type RuleForce } from "./knowledge.js";
import { componentsNamedIn } from "./applicability.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Engine version: any change to tokenization, fields, weights or floor is a new version. */
export const RANKING_VERSION = "govbr-lexical/1.1.0";

/**
 * Declared weights. General, not per query: field weights say how much a term occurrence in that
 * field counts relative to the rule's own text; match weights say how much a non-exact form counts.
 */
export const RANKING_WEIGHTS = {
  /** BM25 saturation and length normalization (on the rule text). */
  k1: 1.2,
  b: 0.3,
  fields: {
    /** title / normalizedRule / originalText: the clause itself (counted once — they overlap). */
    text: 1.0,
    /** wcagReferences / emagReferences: normative numbers declared on the record. */
    references: 1.0,
    conditions: 0.6,
    exceptions: 0.6,
    expectedEvidence: 0.5,
    /** component id + documented page name (source.pageTitle), for rules of that component. */
    component: 0.6,
    /** source.sectionPath: the heading the clause sits under (gives title/body context). */
    section: 0.4,
  },
  match: { exact: 1.0, stem: 0.8, vocabulary: 0.7, compoundPart: 0.5 },
  /** Extra credit for an identifier/number token matched exactly in the rule text or references. */
  identifier: 1.0,
  /** Extra credit per adjacent query word pair found adjacent in the rule text. */
  phrasePair: 0.6,
  /** final = (lexical + bonuses) × (coverageBase + coverage) × (1 + componentHint if own component). */
  coverageBase: 0.5,
  componentHint: 0.3,
  /** Multiplier for a markdown table row (API/anatomy listing) — reference, not a prose clause. */
  tableRow: 0.6,
} as const;

/**
 * Declared relevance floor. A rule is returned only if (a) it matches at least `minCoverage` of the
 * query's known concept weight, (b) its final score reaches `minScore` (or it matches every known term), (c) it reaches
 * `relativeToTop` of the best score, and (d) on a question of 4+ known terms, it matches 2+ of them. Below it: not returned, `stop: "relevance-floor"`.
 */
export const RELEVANCE_FLOOR = {
  minCoverage: 0.1,
  minScore: 4.0,
  relativeToTop: 0.6,
  /** A question of >= `multiTermQuery` known terms needs >= `minMatchedTerms` of them: one shared word is not evidence. */
  multiTermQuery: 4,
  minMatchedTerms: 2,
} as const;

/** Portuguese function words plus observation fillers; never content words of the KB's domain. */
const STOPWORDS = new Set(
  (
    "a o e de da do das dos em no na nos nas num numa um uma uns umas para pra pro pros por com sem que se " +
    "ao aos as os ou mais menos muito muita como pela pelo pelas pelos ser sao esta este estao isso isto essa esse " +
    "ja nao seu sua seus suas lhe ele ela eles elas entre sobre ate quando onde qual quais tambem pode deve " +
    "tem ter fica ficam vai vao so mas nem nenhum nenhuma nada isso aqui la ai ha foi era sendo sera " +
    "the of and to is in on for"
  ).split(" "),
);
// "for" is an HTML attribute name: keep it out of the English stop list.
STOPWORDS.delete("for");

export type TokenKind = "word" | "identifier" | "number";
export interface Token {
  /** Folded exact form. */
  key: string;
  /** Inflection key (words only; identifiers/numbers stem to themselves). */
  stem: string;
  kind: TokenKind;
  /** Set on the parts of a hyphenated identifier (`aria`, `current` of `aria-current`). */
  partOf?: string;
}

/** Case, accents and markdown markers folded; whitespace collapsed. */
export function foldText(value: string): string {
  return value
    // Markdown link targets are navigation, not clause text: "[Select](/ds/components/select?tab=designer)" → "[Select]".
    .replace(/\]\([^)\s]*\)/g, "]")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[*_`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Light Portuguese plural fold (3.1.0). Applied to index and query alike; exact forms are kept apart.
 * `accented` is the word as written (lowercase, with accents) when known: it tells the oxytone
 * singular in -s (mês, país, português, através) — which keeps its s — and the plural of -el/-il
 * with an accented ending (papéis → papel) from the paroxytone -il (fáceis → fácil, úteis → útil).
 * -ões/-ães → -ão · -eses → -ês (meses → mês, portugueses → português) · -íses → -ís (países → país) ·
 * -res/-zes → -r/-z (cores → cor) · -ens/-uns → -em/-um (imagens → imagem) · -veis → -vel ·
 * -éis → -el · other -eis → -il · -ais/-ois/-uis → -al/-ol/-ul · other final -s dropped. A final -en
 * is written -em so the English "token"/"tokens" stay one key.
 * Known misses: singulars in -re ("livre"/"livres") and in -se from -ses with -ês plural ("teses").
 */
export function pluralFold(word: string, accented?: string): string {
  let w = word;
  const a = accented ?? "";
  if (w.length > 4 && /(oes|aes)$/.test(w)) w = w.slice(0, -3) + "ao";
  else if (/[áéêíóôú]s$/.test(a)) w = word; // mês, país, português, através: singular
  else if (/[íé]ses$/.test(a) || (w.length > 4 && /eses$/.test(w))) w = w.slice(0, -2);
  else if (w.length > 4 && /(res|zes)$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 4 && /(ens|uns)$/.test(w)) w = w.slice(0, -2) + "m";
  else if (w.length > 4 && /veis$/.test(w)) w = w.slice(0, -4) + "vel";
  else if (/éis$/.test(a)) w = w.slice(0, -3) + "el";
  else if (w.length > 4 && /eis$/.test(w)) w = w.slice(0, -3) + "il";
  else if (w.length > 4 && /(ais|ois|uis)$/.test(w)) w = w.slice(0, -2) + "l";
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("en")) w = w.slice(0, -1) + "m";
  return w;
}

/**
 * Word families that a 6-letter prefix would merge although they are unrelated (3.1.0, review 28/10):
 * contraste/contrário, internet/interno, principal/princípio. A word starting with one of these
 * longer prefixes is stemmed to that prefix instead.
 */
export const STEM_EXCEPTIONS: ReadonlyArray<string> = ["contrast", "internet", "principa"];

function stemOf(word: string, accented?: string): string {
  const w = pluralFold(word, accented);
  const exception = STEM_EXCEPTIONS.find((p) => w.startsWith(p));
  if (exception) return exception;
  return w.length > 6 ? w.slice(0, 6) : w;
}

/** Folded word → the same word as written (lowercase, accents kept), for the plural fold. */
function accentedForms(value: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const w of value.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const f = w.normalize("NFD").replace(/\p{M}/gu, "");
    if (f !== w && !map.has(f)) map.set(f, w);
  }
  return map;
}

const TOKEN_RE = /\d+(?:[.,]\d+)+|[a-z0-9]+(?:-[a-z0-9]+)+|[a-z0-9]+/g;

/** Tokens of a text in order (stopwords and 1-character tokens dropped; identifier parts added). */
export function tokenize(value: string): Token[] {
  const out: Token[] = [];
  const accents = /[^\x00-\x7f]/.test(value) ? accentedForms(value) : null;
  for (const raw of foldText(value).match(TOKEN_RE) ?? []) {
    if (/^\d+(?:[.,]\d+)+$/.test(raw)) {
      // "4,5" (one comma, no dot) is a decimal; "1.3.1,1.4.1" or "1,2,3" is a list of numbers.
      const decimal = !raw.includes(".") && raw.split(",").length === 2;
      for (const n of decimal ? [raw.replace(",", ".")] : raw.split(",")) {
        if (n.length >= 2 || n.includes(".")) out.push({ key: n, stem: n, kind: "number" });
      }
      continue;
    }
    if (raw.includes("-")) {
      out.push({ key: raw, stem: raw, kind: "identifier" });
      for (const part of raw.split("-")) {
        if (part.length < 2 || STOPWORDS.has(part)) continue;
        out.push({ key: part, stem: /^\d+$/.test(part) ? part : stemOf(part, accents?.get(part)), kind: /^\d+$/.test(part) ? "number" : "word", partOf: raw });
      }
      continue;
    }
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    if (/^\d+$/.test(raw)) out.push({ key: raw, stem: raw, kind: "number" });
    else out.push({ key: raw, stem: stemOf(raw, accents?.get(raw)), kind: "word" });
  }
  return out;
}

function codeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ── Vocabulary (versioned, switchable) ────────────────────────────────────────────────────────

export interface VocabularyGroup {
  id: string;
  /** Interchangeable terms (folded); every term expands to the others. */
  terms?: string[];
  /** One-way expansions: from → to (e.g. an HTML element name to the Portuguese concept). */
  from?: string[];
  to?: string[];
  provenance: string;
  /** Set when the group was derived from a development-screen diagnosis (reported apart). */
  origem?: string;
}
export interface Vocabulary {
  version: string;
  note: string;
  groups: VocabularyGroup[];
}

const VOCAB_FILE = join(__dirname, "../../data/retrieval/vocab-1.1.0.json");
let vocabulary: Vocabulary | undefined;
let expansionMap: Map<string, Array<{ term: string; group: string; obs?: boolean }>> | undefined;

export function getVocabulary(): Vocabulary {
  vocabulary ??= JSON.parse(readFileSync(VOCAB_FILE, "utf8")) as Vocabulary;
  return vocabulary;
}

/** Vocabulary is ON unless GOVBR_RETRIEVAL_VOCAB=off (or a caller passes `vocabulary:false`). */
export function vocabularyEnabledByDefault(): boolean {
  return (process.env.GOVBR_RETRIEVAL_VOCAB ?? "").trim().toLowerCase() !== "off";
}

/** Origin of the observation→rule bridges (vocab 1.1.0): switchable apart from the base vocabulary. */
export const OBSERVATION_ORIGIN = "observacao→regra";

/** Observation→rule groups are ON unless GOVBR_RETRIEVAL_VOCAB_OBS=off (measurement switch). */
export function observationGroupsEnabled(): boolean {
  return (process.env.GOVBR_RETRIEVAL_VOCAB_OBS ?? "").trim().toLowerCase() !== "off";
}

/** Vocabulary label recorded in responses: the version, marked when the observation groups are off. */
export function vocabularyLabel(): string {
  return getVocabulary().version + (observationGroupsEnabled() ? "" : "-sem-observacao");
}

let expansionObs: boolean | undefined;
function expansions(): Map<string, Array<{ term: string; group: string; obs?: boolean }>> {
  if (expansionMap && expansionObs === observationGroupsEnabled()) return expansionMap;
  expansionObs = observationGroupsEnabled();
  const map = new Map<string, Array<{ term: string; group: string; obs?: boolean }>>();
  const add = (from: string, to: string, group: string, obs = false) => {
    const f = foldText(from), t = foldText(to);
    if (f === t) return;
    const list = map.get(f) ?? [];
    if (!list.some((x) => x.term === t)) list.push({ term: t, group, ...(obs ? { obs } : {}) });
    map.set(f, list);
  };
  for (const g of getVocabulary().groups) {
    if (!expansionObs && g.origem === OBSERVATION_ORIGIN) continue;
    for (const a of g.terms ?? []) for (const b of g.terms ?? []) add(a, b, g.id);
    for (const a of g.from ?? []) for (const b of g.to ?? []) add(a, b, g.id, g.origem === OBSERVATION_ORIGIN);
  }
  expansionMap = map;
  return map;
}

// ── Index (memoized per KB object) ────────────────────────────────────────────────────────────

type Field = keyof typeof RANKING_WEIGHTS.fields;
/** Fields reported in `matched` (the text field is reported by its record field names). */
export type MatchField = "text" | "references" | "conditions" | "exceptions" | "expectedEvidence" | "component" | "section";

interface Doc {
  rule: KnowledgeRule;
  order: number;
  /** Per field: exact key → tf and stem key → tf. */
  exact: Map<Field, Map<string, number>>;
  stem: Map<Field, Map<string, number>>;
  /** Adjacent stem pairs of the rule text ("a b"). */
  pairs: Set<string>;
  /** Distinct keys over all fields (document-frequency input). */
  keysExact: Set<string>;
  keysStem: Set<string>;
  /** Folded rule text, for whole-query phrase evidence. */
  folded: string;
  len: number;
  /** The clause is one row of a markdown table (API/anatomy listing), not prose. */
  tableRow: boolean;
}
/** Collection statistics of the documents being ranked (N, document frequencies, mean length). */
interface Stats {
  n: number;
  dfExact: Map<string, number>;
  dfStem: Map<string, number>;
  avgLen: number;
}
interface Index {
  docs: Doc[];
  /** Statistics of the normative rules (the default pool). */
  normative: Stats;
  /** Statistics per explicit pool (keyed by its sorted ids), small LRU. */
  pools: Map<string, Stats>;
}

const indexes = new WeakMap<KnowledgeBase, Index>();

/**
 * Term frequencies. A word that occurs only inside an identifier of the rule counts
 * `RANKING_WEIGHTS.match.compoundPart` ("current" in `data-current` is weak evidence for `aria-current`).
 */
function counts(tokens: Token[], pick: (t: Token) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(pick(t), (m.get(pick(t)) ?? 0) + (t.partOf ? RANKING_WEIGHTS.match.compoundPart : 1));
  return m;
}

/** Text field: title/normalizedRule/originalText overlap, so each key counts its max over the three. */
function textCounts(rule: KnowledgeRule, pick: (t: Token) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const value of [rule.title, rule.normalizedRule, rule.originalText]) {
    for (const [k, n] of counts(tokenize(value ?? ""), pick)) m.set(k, Math.max(m.get(k) ?? 0, n));
  }
  return m;
}

/** Documented component names: id + source.pageTitle of that component's own rules (incl. its PT gloss). */
function componentNames(kb: KnowledgeBase): Map<string, string> {
  const names = new Map<string, Set<string>>();
  for (const rule of kb.rules) {
    if (!rule.component) continue;
    const set = names.get(rule.component) ?? new Set<string>([rule.component]);
    const title = rule.source.pageTitle;
    if (typeof title === "string") set.add(title.replace(/^Padrão Digital de Governo - (Componentes - )?/, ""));
    names.set(rule.component, set);
  }
  return new Map([...names].map(([c, s]) => [c, [...s].join(" ")]));
}

function buildIndex(kb: KnowledgeBase): Index {
  const names = componentNames(kb);
  const docs: Doc[] = [];
  kb.rules.forEach((rule, order) => {
    const fieldText: Record<Exclude<Field, "text">, string> = {
      references: [...rule.wcagReferences, ...rule.emagReferences].join(" "),
      conditions: rule.conditions.join(" "),
      exceptions: rule.exceptions.join(" "),
      expectedEvidence: rule.expectedEvidence.join(" "),
      component: rule.component ? names.get(rule.component) ?? rule.component : "",
      section: typeof rule.source.sectionPath === "string" ? rule.source.sectionPath : String(rule.source.section ?? ""),
    };
    const exact = new Map<Field, Map<string, number>>();
    const stem = new Map<Field, Map<string, number>>();
    exact.set("text", textCounts(rule, (t) => t.key));
    stem.set("text", textCounts(rule, (t) => t.stem));
    for (const [field, text] of Object.entries(fieldText) as Array<[Exclude<Field, "text">, string]>) {
      const toks = tokenize(text);
      exact.set(field, counts(toks, (t) => t.key));
      stem.set(field, counts(toks, (t) => t.stem));
    }
    const bodyTokens = tokenize(rule.originalText || rule.normalizedRule || rule.title).filter((t) => !t.partOf);
    const pairs = new Set<string>();
    for (let i = 1; i < bodyTokens.length; i++) pairs.add(`${bodyTokens[i - 1].stem} ${bodyTokens[i].stem}`);
    const keysExact = new Set<string>(), keysStem = new Set<string>();
    for (const m of exact.values()) for (const k of m.keys()) keysExact.add(k);
    for (const m of stem.values()) for (const k of m.keys()) keysStem.add(k);
    const len = [...exact.get("text")!.values()].reduce((a, b) => a + b, 0);
    const tableRow = isTableRow(rule.originalText ?? "");
    docs.push({ rule, order, exact, stem, keysExact, keysStem, pairs, folded: foldText(rule.originalText || rule.normalizedRule || ""), len, tableRow });
  });
  return { docs, normative: statsOf(docs.filter((d) => d.rule.force !== "example")), pools: new Map() };
}

function statsOf(docs: Doc[]): Stats {
  const dfExact = new Map<string, number>();
  const dfStem = new Map<string, number>();
  for (const d of docs) {
    for (const k of d.keysExact) dfExact.set(k, (dfExact.get(k) ?? 0) + 1);
    for (const k of d.keysStem) dfStem.set(k, (dfStem.get(k) ?? 0) + 1);
  }
  return { n: docs.length, dfExact, dfStem, avgLen: docs.reduce((n, d) => n + d.len, 0) / (docs.length || 1) };
}

/**
 * Statistics of the pool being ranked: the normative rules by default; for an explicit pool
 * (strict filters, the observed components of a context, canonical evidence) its own documents,
 * so a term that only occurs in that pool still has a document frequency. Memoized per pool.
 */
function statsFor(ix: Index, docs: Doc[] | null): Stats {
  if (!docs) return ix.normative;
  const key = docs.map((d) => d.rule.id).sort().join("\n");
  let st = ix.pools.get(key);
  if (!st) {
    st = statsOf(docs);
    if (ix.pools.size >= 32) ix.pools.delete(ix.pools.keys().next().value!);
    ix.pools.set(key, st);
  }
  return st;
}

/**
 * A markdown table row ("| class | string | **data-current** | Página ativa |", "| 4 | Título | … | Obrigatório |"):
 * API/anatomy reference listed by the DS, served by the KB with the force of its table. Ranked
 * below prose clauses of similar match (RANKING_WEIGHTS.tableRow); the KB record is unchanged.
 */
export function isTableRow(text: string): boolean {
  const t = text.trim();
  return t.startsWith("|") && t.endsWith("|") && (t.match(/\|/g) ?? []).length >= 3;
}

function indexFor(kb: KnowledgeBase): Index {
  let ix = indexes.get(kb);
  if (!ix) {
    ix = buildIndex(kb);
    indexes.set(kb, ix);
  }
  return ix;
}

// ── Query ─────────────────────────────────────────────────────────────────────────────────────

interface Alternative {
  key: string;
  byStem: boolean;
  weight: number;
  /** Set when the alternative comes from the vocabulary. */
  via?: string;
}
interface Concept {
  term: string;
  kind: TokenKind;
  weight: number;
  alternatives: Alternative[];
  /** idf of the best-known alternative; 0 = the term is not in the base at all. */
  idf: number;
  /** Set on the parts of a hyphenated identifier. */
  partOf?: string;
  stem: string;
  /** Other query words folded into this concept because they share its stem (3.1.0). */
  merged?: string[];
}

export interface QueryAnalysis {
  terms: string[];
  expansions: Array<{ term: string; as: string[]; source: string }>;
  /** Terms with no occurrence in the served base, even after expansion. */
  unmatchedTerms: string[];
  concepts: Concept[];
  /** Unordered stem pairs of distinct query content words ("a b", a < b). */
  pairs: string[];
  folded: string;
}

function idfOf(df: number, n: number): number {
  return df > 0 ? Math.log(1 + (n - df + 0.5) / (df + 0.5)) : 0;
}

export function analyzeQuery(
  text: string,
  options: { vocabulary?: boolean } = {},
  kb: KnowledgeBase = getKnowledgeBase(),
  stats: Stats = indexFor(kb).normative,
): QueryAnalysis {
  const n = stats.n;
  const ix = stats;
  const useVocab = options.vocabulary ?? vocabularyEnabledByDefault();
  // Order-independent: one concept per key; a key that occurs as a standalone word anywhere in the
  // question keeps full weight even if it also occurs inside an identifier ("aria-label label").
  const all = tokenize(text);
  const standalone = new Set(all.filter((t) => !t.partOf).map((t) => t.key));
  const tokens = [...new Map(all.map((t) => [t.key, standalone.has(t.key) ? { ...t, partOf: undefined } : t])).values()]
    .sort((a, b) => codeUnitCompare(a.key, b.key));
  const seen = new Set<string>();
  const concepts: Concept[] = [];
  const expansionsUsed: QueryAnalysis["expansions"] = [];
  const W = RANKING_WEIGHTS.match;
  for (const t of tokens) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    const alternatives: Alternative[] = [{ key: t.key, byStem: false, weight: W.exact }];
    if (t.kind === "word" && t.stem !== t.key) alternatives.push({ key: t.stem, byStem: true, weight: W.stem });
    else if (t.kind === "word") alternatives.push({ key: t.stem, byStem: true, weight: W.exact });
    if (useVocab) {
      // An observation→rule bridge applies only to the exact word ("tabs" is the Tab component, not the key).
      const ex = expansions().get(t.key) ?? (expansions().get(pluralFold(t.key)) ?? []).filter((e) => !e.obs);
      const used: string[] = [];
      for (const e of ex) {
        for (const et of tokenize(e.term)) {
          if (et.partOf) continue;
          alternatives.push({ key: et.key, byStem: false, weight: W.vocabulary, via: e.term });
          if (et.kind === "word" && pluralFold(et.key) !== et.key) alternatives.push({ key: pluralFold(et.key), byStem: false, weight: W.vocabulary, via: e.term });
        }
        used.push(e.term);
      }
      if (used.length) expansionsUsed.push({ term: t.key, as: used, source: vocabularyLabel() + ":" + [...new Set(ex.map((e) => e.group))].join(",") });
    }
    const idf = Math.max(0, ...alternatives.map((a) => idfOf((a.byStem ? ix.dfStem : ix.dfExact).get(a.key) ?? 0, n)));
    // 3.1.0: query words with the same stem are ONE concept ("pagina"/"paginacao", "pesquisa"/"pesquise"):
    // a rule saying the word once must not score it twice. Alternatives are pooled; the first key
    // (code-unit order) names the concept, the others stay listed in `terms`.
    const twin = t.kind === "word" && !t.partOf ? concepts.find((c) => c.kind === "word" && !c.partOf && c.stem === t.stem) : undefined;
    if (twin) {
      for (const a of alternatives) {
        const same = twin.alternatives.find((x) => x.key === a.key && x.byStem === a.byStem);
        if (!same) twin.alternatives.push(a);
        else if (a.weight > same.weight) Object.assign(same, a);
      }
      twin.idf = Math.max(twin.idf, idf);
      twin.merged = [...(twin.merged ?? []), t.key];
      continue;
    }
    concepts.push({ term: t.key, kind: t.kind, weight: t.partOf ? W.compoundPart : 1, alternatives, idf, stem: t.stem, ...(t.partOf ? { partOf: t.partOf } : {}) });
  }
  // An identifier absent from the served base is searched by its parts at full weight (it stays in
  // unmatchedTerms: "aria-current" is not in the base, "aria" and "current" may be).
  const absent = new Set(concepts.filter((c) => c.kind === "identifier" && c.idf === 0).map((c) => c.term));
  for (const c of concepts) if (c.partOf && absent.has(c.partOf)) c.weight = 1;
  // Proximity, order-independent: every pair of distinct content terms; a rule earns the pair bonus
  // when the two occur adjacent in its text, in either order.
  const content = tokens.filter((t) => !t.partOf);
  const pairs: string[] = [];
  for (let i = 0; i < content.length; i++) for (let j = i + 1; j < content.length; j++) if (content[i].stem !== content[j].stem) pairs.push(`${content[i].stem} ${content[j].stem}`);
  return {
    terms: concepts.flatMap((c) => [c.term, ...(c.merged ?? [])]).sort(codeUnitCompare),
    expansions: expansionsUsed,
    unmatchedTerms: concepts.filter((c) => c.idf === 0).flatMap((c) => [c.term, ...(c.merged ?? [])]).sort(codeUnitCompare),
    concepts,
    pairs: [...new Set(pairs)],
    folded: content.map((t) => t.key).join(" "),
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────────────────────

export interface MatchedTerm {
  term: string;
  /** Present when the match came through the vocabulary or the stem (`via`/`stem`). */
  via?: string;
  stem?: boolean;
  fields: MatchField[];
}

export interface ScoredRule {
  rule: KnowledgeRule;
  score: number;
  coverage: number;
  matched: MatchedTerm[];
  ownComponent: boolean;
  order: number;
}

/** Faixa de força: obrigação → orientação → o resto (só desempate). */
export function forceRank(force: RuleForce): number {
  return force === "required" || force === "prohibited" ? 0 : force === "recommended" || force === "discouraged" ? 1 : 2;
}

export function compareScored(a: ScoredRule, b: ScoredRule): number {
  return b.score - a.score || forceRank(a.rule.force) - forceRank(b.rule.force) || a.order - b.order || codeUnitCompare(a.rule.id, b.rule.id);
}

/** Score one rule against an analysed query. Returns null when nothing matches. */
function scoreDoc(doc: Doc, q: QueryAnalysis, ix: Stats, hint: string | null): ScoredRule | null {
  const n = ix.n;
  const { k1, b } = RANKING_WEIGHTS;
  const fw = RANKING_WEIGHTS.fields;
  const norm = 1 - b + (b * doc.len) / (ix.avgLen || 1);
  let lexical = 0, bonus = 0, covered = 0, known = 0;
  const matched: MatchedTerm[] = [];
  for (const c of q.concepts) {
    if (c.idf > 0) known += c.idf * c.weight;
    let best = 0;
    let bestAlt: Alternative | undefined;
    let bestFields: MatchField[] = [];
    for (const alt of c.alternatives) {
      const maps = alt.byStem ? doc.stem : doc.exact;
      let wtf = 0;
      const fields: MatchField[] = [];
      for (const [field, weight] of Object.entries(fw) as Array<[Field, number]>) {
        // With a hint, naming the component matches every rule of it: the hint already carries that.
        if (field === "component" && hint !== null) continue;
        const tf = maps.get(field)?.get(alt.key) ?? 0;
        if (tf) {
          wtf += weight * tf;
          fields.push(field);
        }
      }
      if (!wtf) continue;
      const idf = idfOf((alt.byStem ? ix.dfStem : ix.dfExact).get(alt.key) ?? 0, n);
      const s = alt.weight * idf * ((wtf * (k1 + 1)) / (wtf + k1 * norm));
      if (s > best) {
        best = s;
        bestAlt = alt;
        bestFields = fields;
      }
    }
    if (!bestAlt) continue;
    lexical += best * c.weight;
    covered += c.idf * c.weight;
    // 3.1.0: no identifier credit for a table row — an API/anatomy listing repeats identifiers by construction.
    if (!doc.tableRow && c.kind !== "word" && !bestAlt.byStem && !bestAlt.via && (bestFields.includes("text") || bestFields.includes("references"))) {
      bonus += RANKING_WEIGHTS.identifier * c.idf;
    }
    matched.push({
      term: c.term,
      ...(bestAlt.via ? { via: bestAlt.via } : bestAlt.byStem && bestAlt.key !== c.term ? { stem: true } : {}),
      fields: bestFields,
    });
  }
  if (!matched.length) return null;
  matched.sort((a, z) => codeUnitCompare(a.term, z.term));
  for (const pair of q.pairs) {
    const [x, y] = pair.split(" ");
    if (doc.pairs.has(pair) || doc.pairs.has(`${y} ${x}`)) {
      const [a, z] = pair.split(" ");
      bonus += RANKING_WEIGHTS.phrasePair * ((idfOf(ix.dfStem.get(a) ?? 0, n) + idfOf(ix.dfStem.get(z) ?? 0, n)) / 2);
    }
  }
  const coverage = known > 0 ? covered / known : 0;
  const own = hint !== null && doc.rule.component === hint;
  const score = (lexical + bonus) * (RANKING_WEIGHTS.coverageBase + coverage) * (own ? 1 + RANKING_WEIGHTS.componentHint : 1) *
    (doc.tableRow ? RANKING_WEIGHTS.tableRow : 1);
  return { rule: doc.rule, score, coverage, matched, ownComponent: own, order: doc.order };
}

export interface RankInput {
  /** Free text (query) — terms are combined, never required as a whole phrase. */
  text: string;
  /** Component hint: its rules get the hint weight; globals stay eligible; other components are out. */
  component?: string | null;
  /** Rules eligible at all (strict filters already applied by the caller). */
  pool?: KnowledgeRule[];
  vocabulary?: boolean;
  /**
   * Apply `RELEVANCE_FLOOR.relativeToTop` (default true). The context adapter turns it off: there the
   * observed components define the scope, the page alternates groups, and a rule matching an explicit
   * observation term above the absolute floor stays a candidate.
   */
  relativeFloor?: boolean;
}

export interface RankResult {
  analysis: QueryAnalysis;
  /** Above the floor, in final order. */
  results: ScoredRule[];
  /** Matched at least one term but fell below the floor. */
  belowFloor: number;
  componentHint: string | null;
  vocabulary: string | "off";
}

/**
 * Rank `pool` (default: all normative rules) for a free-text query. Rules of a component other
 * than the hint are not eligible when a hint is given; rules without component (global) always are.
 */
export function rankRules(input: RankInput, kb: KnowledgeBase = getKnowledgeBase()): RankResult {
  const ix = indexFor(kb);
  const useVocab = input.vocabulary ?? vocabularyEnabledByDefault();
  const allowed = input.pool ? new Set(input.pool.map((r) => r.id)) : null;
  const poolDocs = allowed ? ix.docs.filter((d) => allowed.has(d.rule.id)) : ix.docs.filter((d) => d.rule.force !== "example");
  const stats = statsFor(ix, allowed ? poolDocs : null);
  const analysis = analyzeQuery(input.text, { vocabulary: useVocab }, kb, stats);
  const hint = input.component ?? null;
  // 3.1.0 (strict, review 28/10): with `component` given, text-named components are NOT added. Without
  // it, ONE component named in the text (br-* class, exact multi-word official name, or a single-word
  // name outside NAMED_IN_TEXT_EXCLUDED) gets the hint weight; nothing is excluded.
  const named = hint === null && input.text ? componentsNamedIn(input.text) : [];
  const soft = named.length === 1 ? named[0] : null;
  const scored: ScoredRule[] = [];
  for (const doc of poolDocs) {
    if (hint !== null && doc.rule.component !== null && doc.rule.component !== hint) continue;
    const s = scoreDoc(doc, analysis, stats, hint ?? soft);
    if (s) scored.push(s);
  }
  scored.sort(compareScored);
  const f = RELEVANCE_FLOOR;
  const knownTerms = analysis.concepts.filter((c) => c.idf > 0 && c.weight === 1).length;
  const needTerms = knownTerms >= f.multiTermQuery ? f.minMatchedTerms : 1;
  const passes = (s: ScoredRule) => s.coverage >= f.minCoverage && (s.score >= f.minScore || s.coverage >= 1) && s.matched.length >= needTerms;
  // 3.1.0: the relative cut is set by the best PROSE clause; a table row only sets it when no prose passes.
  const top = (scored.find((s) => passes(s) && !indexFor(kb).docs[s.order].tableRow) ?? scored.find(passes))?.score ?? 0;
  const results = scored.filter((s) => passes(s) && (input.relativeFloor === false || s.score >= f.relativeToTop * top));
  return {
    analysis,
    results,
    belowFloor: scored.length - results.length,
    componentHint: hint,
    vocabulary: useVocab ? vocabularyLabel() : "off",
  };
}

/**
 * Lexical relevance of each pool rule for context terms (the context adapter): same tokenization,
 * fields, weights and absolute floor as `rankRules` (no relative cut), without a component hint (the observed components
 * are handled by the caller). Returns scores above the floor only.
 */
export function scoreTerms(terms: string[], pool: KnowledgeRule[], vocabulary?: boolean, kb: KnowledgeBase = getKnowledgeBase()): Map<string, ScoredRule> {
  if (!terms.length) return new Map();
  const ranked = rankRules({ text: terms.join(" "), pool, vocabulary, relativeFloor: false }, kb);
  return new Map(ranked.results.map((s) => [s.rule.id, s]));
}

/** Meta block recorded in every relevance response. */
export function rankingMeta(vocab: string | "off") {
  return { engine: RANKING_VERSION, vocabulary: vocab, weights: RANKING_WEIGHTS, floor: RELEVANCE_FLOOR };
}

/** Reset memoized vocabulary (tests only). The index is keyed by the KB object itself. */
export function resetRetrievalCache(): void {
  vocabulary = undefined;
  expansionMap = undefined;
}
