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

export type TermField = "conditions" | "exceptions" | "expectedEvidence" | "title" | "normalizedRule";

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

function termFields(rule: KnowledgeRule, term: string): TermField[] {
  const fields: Array<[TermField, string[]]> = [
    ["conditions", rule.conditions],
    ["exceptions", rule.exceptions],
    ["expectedEvidence", rule.expectedEvidence],
    ["title", [rule.title]],
    ["normalizedRule", [rule.normalizedRule]],
  ];
  return fields.filter(([, values]) => values.some((v) => containsTerm(normalizeText(v), term))).map(([f]) => f);
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

/**
 * Seleciona candidatas sobre `base` (já filtrada por força/categoria/estratégia, sem exemplos).
 * Ordem: força do motivo (componente/região observados → relação documentada → termo), depois o
 * componente da regra (globais por último), depois a ordem da própria base.
 */
export function retrieveContextCandidates(base: KnowledgeRule[], context: NormalizedContext): ContextCandidate[] {
  const observed = new Set(context.components);
  const regionOf = new Map(context.regions.map((region) => [regionComponent(region), region]));
  const order = new Map(getKnowledgeBase().rules.map((rule, index) => [rule.id, index]));
  const out: ContextCandidate[] = [];

  for (const rule of base) {
    if (rule.force === "example") continue;
    const ownInScope = rule.component === null || observed.has(rule.component);
    if (!ownInScope) continue; // regra de componente não observado: fora do contexto

    const reasons: RetrievalReason[] = [];
    if (rule.component !== null) {
      const region = regionOf.get(rule.component);
      reasons.push(region ? { kind: "region-observed", region, component: rule.component } : { kind: "component-observed", component: rule.component });
    }
    for (const related of rule.relatedComponents) {
      if (observed.has(related)) reasons.push({ kind: "related-component-observed", component: related, via: "relatedComponents" });
    }
    for (const term of context.terms) {
      const fields = termFields(rule, term);
      if (fields.length) reasons.push({ kind: "term", term, fields });
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
      reasons,
      applicability: { status, unevaluated, unknowns },
      obligation: obligationOf(rule.force),
      neededState: neededStateFor(rule.validationStrategy),
      conflicts: conflictLabels(rule),
    });
  }

  return interleaveByGroup(out, order);
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
 * observado e um grupo global; dentro do grupo, faixa de força, depois motivo, depois a ordem da
 * base; e os grupos se alternam (global primeiro, componentes em ordem alfabética), de modo que a
 * primeira página traz as obrigações de todos. Continua função só do contexto normalizado.
 */
function interleaveByGroup(candidates: ContextCandidate[], order: Map<string, number>): ContextCandidate[] {
  const groups = new Map<string, ContextCandidate[]>();
  for (const c of candidates) {
    const g = candidateGroup(c);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }
  const keys = [...groups.keys()].sort((a, b) =>
    a === GLOBAL_GROUP ? -1 : b === GLOBAL_GROUP ? 1 : codeUnitCompare(a, b),
  );
  const queues = keys.map((k) =>
    groups.get(k)!.sort(
      (a, b) =>
        forceTier(a.rule.force) - forceTier(b.rule.force) ||
        a.rank - b.rank ||
        (order.get(a.rule.id) ?? 0) - (order.get(b.rule.id) ?? 0),
    ),
  );
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
}
