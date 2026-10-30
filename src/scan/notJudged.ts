/**
 * 3.5.0 (D-155, item 1): o que o scan NÃO julgou nesta página, derivado do que está nela.
 *
 * No ensaio-trio-b-03 (validator 3.4.4) o agente com o oráculo tomou o silêncio do scan como cobertura:
 * mediu o título "PNIP" e o campo de busca só com placeholder e não os reportou, porque nenhum check
 * falou deles. Este bloco diz, para ESTA página e ESTE estado, o que está nela e nenhum check decidiu —
 * uma pendência para o agente medir, nunca um veredito. Nada é chaveado por tela, seletor ou texto: cada
 * item nasce de um fato genérico do documento (título, campos, tabelas, componentes do DS presentes).
 *
 * As normas citadas são as cláusulas obrigatórias que a base serve para o assunto (lidas das unidades
 * literais do e-MAG em tempo de execução), para o agente ler antes de citar.
 */
import type { PageFacts } from "../evidence/pageFacts.js";
import type { Observation } from "../schema/finding.js";
import type { LabelSource } from "../checkers/formLabels.js";
import { emagUnits } from "../data/normativeUnits.js";

export interface NotJudgedItem {
  code: "document-title-adequacy" | "document-title-empty" | "field-name-source" | "table-name" | "lang-adequacy" | "landmark-adequacy";
  subject: string;
  count?: number;
  observed?: string;
  examples?: string[];
  todo: string;
  norms?: string[];
  measure: string;
}

export interface NotJudgedInput {
  facts: PageFacts;
  /** Campo → de onde vem o rótulo (formLabels.labelSourceOf). */
  fields: Array<{ locator: string; source: LabelSource }>;
  /** Tabelas exibidas sem caption/aria-label/aria-labelledby/title (localizadores). */
  unnamedTables: string[];
  /** O detector de placeholder rodou (check structure sem `components` restrito). */
  placeholderChecked: boolean;
  axeRan: boolean;
  /** Scan da página inteira (sem seletores): só então título, idioma e regiões entram. */
  pageWide: boolean;
}

const EXAMPLES = 3;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A(s) cláusula(s) obrigatória(s) que a base serve para uma recomendação e-MAG, e o id da recomendação. */
function emagNorms(id: string, max = 1): string[] {
  try {
    const required = emagUnits(id).clauses.filter((c) => c.force === "required").slice(0, max).map((c) => c.id);
    return [...required, `emag-${id}`];
  } catch {
    return [`emag-${id}`];
  }
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function notJudgedFor(input: NotJudgedInput): NotJudgedItem[] {
  const items: NotJudgedItem[] = [];
  const { facts } = input;

  const title = input.pageWide ? (facts.title ?? "").trim() : "";
  if (!input.pageWide) {
    /* escopo por seletores: título, idioma e regiões não são do escopo */
  } else if (title) {
    const hints: string[] = [];
    if (facts.siteTitle && fold(facts.siteTitle) === fold(title)) hints.push("igual ao nome do sítio no cabeçalho");
    if (facts.h1 && !fold(title).includes(fold(facts.h1))) hints.push(`não contém o texto do h1 ("${clip(facts.h1, 60)}")`);
    if (!facts.h1) hints.push("a página não tem h1 exibido para comparar");
    items.push({
      code: "document-title-adequacy",
      subject: "<title>",
      observed: `"${clip(title, 80)}"${hints.length ? ` — ${hints.join("; ")}` : ""}`,
      todo: "se descreve o conteúdo principal (axe só exige não vazio)",
      norms: [...emagNorms("3.3"), "wcag-2.4.2"],
      measure: "title × assunto (h1)",
    });
  } else if (!input.axeRan) {
    items.push({
      code: "document-title-empty",
      subject: "<title>",
      observed: "vazio ou ausente",
      todo: "axe não rodou: título vazio não virou achado",
      norms: [...emagNorms("3.3"), "wcag-2.4.2"],
      measure: "document.title",
    });
  }

  const byKind = (kind: LabelSource["kind"]) => input.fields.filter((f) => f.source.kind === kind);
  const titleOnly = byKind("title-only");
  if (titleOnly.length) {
    items.push({
      code: "field-name-source",
      subject: "campos com nome só pelo title",
      count: titleOnly.length,
      examples: titleOnly.slice(0, EXAMPLES).map((f) => clip(f.locator, 120)),
      todo: "rótulo associado (o axe aceita o title como nome)",
      norms: [...emagNorms("6.2"), "wcag-3.3.2"],
      measure: "label/aria-labelledby/aria-label",
    });
  }
  const placeholderOnly = byKind("placeholder-only");
  if (placeholderOnly.length && !input.placeholderChecked) {
    items.push({
      code: "field-name-source",
      subject: "campos com nome só pelo placeholder",
      count: placeholderOnly.length,
      examples: placeholderOnly.slice(0, EXAMPLES).map((f) => clip(f.locator, 120)),
      todo: "rótulo associado (structure não rodou inteiro; o axe aceita o placeholder)",
      norms: [...emagNorms("6.2"), "wcag-3.3.2"],
      measure: "label/aria-labelledby/aria-label",
    });
  }
  const unnamed = byKind("unnamed");
  if (unnamed.length && !input.axeRan) {
    items.push({
      code: "field-name-source",
      subject: "campos sem nome acessível",
      count: unnamed.length,
      examples: unnamed.slice(0, EXAMPLES).map((f) => clip(f.locator, 120)),
      todo: "axe não rodou: campo sem nome não virou achado",
      norms: [...emagNorms("6.2"), "wcag-4.1.2"],
      measure: "nome acessível do campo",
    });
  }

  if (input.unnamedTables.length) {
    items.push({
      code: "table-name",
      subject: "tabelas sem caption/aria-label/aria-labelledby/title",
      count: input.unnamedTables.length,
      examples: input.unnamedTables.slice(0, EXAMPLES).map((l) => clip(l, 120)),
      todo: "título da tabela (o axe não exige caption)",
      norms: [...emagNorms("3.9"), "wcag-1.3.1"],
      measure: "<caption> 1º filho",
    });
  }

  // Idioma e regiões: o axe confere presença/validade; a adequação ao conteúdo nenhum check julga.
  if (input.pageWide && facts.lang) {
    items.push({
      code: "lang-adequacy",
      subject: "idioma da página",
      observed: `lang="${clip(facts.lang, 20)}"`,
      todo: "se corresponde ao conteúdo; trechos em outro idioma",
      norms: [...emagNorms("3.1"), `emag-3.2`],
      measure: "lang × idioma do texto",
    });
  }
  if (input.pageWide) items.push({
    code: "landmark-adequacy",
    subject: "regiões (main, nav, header, footer)",
    observed: `${facts.mainLandmarks} main`,
    todo: "se as regiões dividem o conteúdo (o axe só pede conteúdo em alguma)",
    norms: emagNorms("1.8"),
    measure: "landmarks × áreas da página",
  });
  return items;
}

/** Na resposta: até 2 exemplos (o item inteiro fica no ledger). */
function compactItem(item: NotJudgedItem) {
  const { examples, subject: _subject, ...rest } = item;
  return { ...rest, ...(examples ? { examples: examples.slice(0, 2) } : {}) };
}

/**
 * O que os checks executados medem no nível da página (para o agente não tomar o resto como coberto). Com
 * `components` restrito, os detectores de página do check structure (rótulo, ícone, title, foco) não rodam.
 */
export function pageLevelMeasured(checks: string[], componentsRestricted = false): string[] {
  const out: string[] = [];
  if (checks.includes("page")) out.push("header/footer", "skip-link", "focus-order");
  if (checks.includes("axe")) out.push("title-present", "lang-valid", "h1", "regions (axe)");
  if (checks.includes("structure")) out.push(...(componentsRestricted ? ["component-structure"] : ["component-structure", "placeholder-label", "decorative-icon", "link-title", "focus-visible"]));
  return out;
}

/** 3.5.0 (revisão, MED): os itens inteiros paginam como observações `not-judged` (nunca achado). */
export function notJudgedObservations(items: NotJudgedItem[], url: string): Observation[] {
  return items.map((item) => ({
    kind: "not-judged",
    element: { locator: item.examples?.[0] ?? "html", page: url },
    note: `${item.code}: ${item.observed ?? item.subject}${item.count !== undefined ? ` (${item.count})` : ""}`,
    whyNotAFinding: `Pendência: nenhum check deste scan julgou — ${item.todo}. Meça: ${item.measure}.`,
    data: { ...item },
  }));
}

/**
 * 3.5.0 (D-155 item 1; revisão Fable P8): `checksRun.pageLevel` — o que foi medido no nível da página e o
 * que está nela e nenhum check julgou (pendências, nunca veredito). Só encolhe como último recurso do teto.
 */
export function pageLevelBlock(checks: string[], items: NotJudgedItem[], componentsRestricted = false) {
  return {
    measured: pageLevelMeasured(checks, componentsRestricted),
    notMeasured: items.map(compactItem),
    note: "notMeasured: pendências suas — está na página e nenhum check julgou; não é conformidade. Meça; norms = cláusulas obrigatórias.",
  };
}

/** Último recurso do teto: só os códigos das pendências (inteiras no ledger: get_finding_details(scanId)). */
export function pageLevelCodes(block: { measured?: string[]; notMeasured?: Array<NotJudgedItem | string>; full?: unknown }, scanId = "") {
  const codes = (block.notMeasured ?? []).map((i) => (typeof i === "string" ? i : i.count !== undefined ? `${i.code}:${i.count}` : i.code));
  return {
    notMeasured: codes,
    count: codes.length,
    ...(block.full ? { next: block.full } : scanId ? { next: { tool: "get_finding_details", arguments: { scanId, view: "observations" } } } : {}),
  };
}
