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
import type { ContrastIncompleteNode } from "../checkers/axe.js";

export interface NotJudgedItem {
  code: "document-title-adequacy" | "document-title-empty" | "field-name-source" | "table-name" | "lang-adequacy" | "landmark-adequacy" | "contrast-incomplete";
  subject: string;
  count?: number;
  observed?: string;
  examples?: string[];
  todo: string;
  norms?: string[];
  /**
   * 3.6.1 (D-155, item 1): a 1ª cláusula obrigatória de `norms`, com força e texto (curto), para que rejeitar
   * "por falta de norma" exija contrariar um texto visível. Ausente no perfil knowledge-free.
   */
  rule?: { id: string; force: string; text: string };
  /** 3.6.1 (item 5): o que o axe mediu nos nós de contraste que não decidiu (cores, razão, motivo). */
  measured?: Array<{ locator: string; fg: string | null; bg: string | null; ratio: number | null; reason: string | null }>;
  /**
   * 3.6.1: "low" = pendência de adequação presente em toda página sem nenhum sinal medido (idioma, regiões). No
   * na forma curta do teto e em sessionPending só são contadas (lowSignal); a cláusula vai só com id e força.
   */
  signal?: "low";
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
  /** 3.6.1 (item 5): nós de color-contrast que o axe deixou incomplete. */
  contrastIncomplete?: { nodes: number; items: ContrastIncompleteNode[] };
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

const RULE_TEXT_MAX = 100;

/** 3.6.1 (item 1): a 1ª cláusula obrigatória da recomendação e-MAG, com força e texto curto (para a pendência). */
function emagRule(id: string): NotJudgedItem["rule"] {
  try {
    const c = emagUnits(id).clauses.find((x) => x.force === "required") as { id: string; force: string; text?: unknown; originalText?: unknown } | undefined;
    if (!c) return undefined;
    const text = String(c.text ?? c.originalText ?? "").replace(/\s+/g, " ").trim();
    return { id: c.id, force: c.force, text: clip(text, RULE_TEXT_MAX) };
  } catch {
    return undefined;
  }
}

/** Norma + cláusula de uma pendência (a cláusula só quando a base a serve). */
function grounded(emagId: string, extra: string[] = []): Pick<NotJudgedItem, "norms" | "rule"> {
  const rule = emagRule(emagId);
  return { norms: [...emagNorms(emagId), ...extra], ...(rule ? { rule } : {}) };
}

/**
 * 3.6.1 (item 5): contraste que o axe não decidiu (`incomplete` de color-contrast) vira pendência explícita, com
 * as cores e a razão que ele mediu. `knowledgeFree`: só o critério WCAG (nenhum texto ou id da base).
 */
export function contrastPending(contrast: { nodes: number; items: ContrastIncompleteNode[] } | undefined, knowledgeFree = false): NotJudgedItem | null {
  if (!contrast?.nodes) return null;
  return {
    code: "contrast-incomplete",
    subject: "contraste que o axe não decidiu",
    count: contrast.nodes,
    examples: contrast.items.slice(0, EXAMPLES).map((n) => n.locator),
    measured: contrast.items.slice(0, 2).map((n) => ({ locator: clip(n.locator, 120), fg: n.fgColor, bg: n.bgColor, ratio: n.contrastRatio, reason: n.reason })),
    todo: "decida o contraste: o axe não concluiu (fundo não sólido, sobreposição, pseudo-elemento ou cor incerta)",
    ...(knowledgeFree ? { norms: ["wcag-1.4.3"] } : grounded("4.1", ["wcag-1.4.3"])),
    measure: "cor do texto × fundo efetivo no navegador; 4,5:1 (3:1 texto grande)",
  };
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
      ...grounded("3.3", ["wcag-2.4.2"]),
      measure: "title × assunto (h1)",
    });
  } else if (!input.axeRan) {
    items.push({
      code: "document-title-empty",
      subject: "<title>",
      observed: "vazio ou ausente",
      todo: "axe não rodou: título vazio não virou achado",
      ...grounded("3.3", ["wcag-2.4.2"]),
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
      ...grounded("6.2", ["wcag-3.3.2"]),
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
      ...grounded("6.2", ["wcag-3.3.2"]),
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
      ...grounded("6.2", ["wcag-4.1.2"]),
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
      ...grounded("3.9", ["wcag-1.3.1"]),
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
      ...grounded("3.1", ["emag-3.2"]),
      measure: "lang × idioma do texto",
      signal: "low",
    });
  }
  if (input.pageWide) items.push({
    code: "landmark-adequacy",
    subject: "regiões (main, nav, header, footer)",
    observed: `${facts.mainLandmarks} main`,
    todo: "se as regiões dividem o conteúdo (o axe só pede conteúdo em alguma)",
    ...grounded("1.8"),
    measure: "landmarks × áreas da página",
    signal: "low",
  });
  const contrast = contrastPending(input.contrastIncomplete);
  if (contrast) items.push(contrast);
  return items;
}

export type PendingItem = NotJudgedItem & { pendingId?: string; resolved?: unknown };

/** Na resposta: até 2 exemplos (o item inteiro fica no ledger); 3.6.1: com o id da pendência da sessão. */
function compactItem(item: PendingItem, withText: (code: string) => boolean = () => true) {
  const { examples, subject: _subject, measured, norms, signal, measure, ...rest } = item;
  // 3.6.1: a cláusula em `rule` não se repete em `norms` (fica o resto: e-MAG, WCAG).
  const others = norms && rest.rule ? norms.filter((n) => n !== rest.rule!.id) : norms;
  // Pendência sem sinal medido (idioma, regiões): a cláusula vai só com id e força; `measure` fica no ledger.
  // 3.6.1 (revisão H1): o texto da cláusula só na 1ª vez que o código aparece na sessão; depois, só id e força.
  const low = signal === "low";
  const rule = rest.rule && (low || !withText(item.code)) ? { id: rest.rule.id, force: rest.rule.force } : rest.rule;
  return {
    ...rest,
    ...(low ? { signal } : { measure }),
    ...(rule ? { rule } : {}),
    ...(others ? { norms: others } : {}),
    ...(examples && !measured ? { examples: examples.slice(0, 2) } : {}),
    ...(measured ? { measured } : {}),
  };
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
export function pageLevelBlock(checks: string[], items: PendingItem[], componentsRestricted = false, withText: (code: string) => boolean = () => true) {
  return {
    measured: pageLevelMeasured(checks, componentsRestricted),
    notMeasured: items.map((i) => compactItem(i, withText)),
    note: "notMeasured: pendências suas (nenhum check julgou; não é conformidade); cada pendingId volta até verify_finding ou pendingResolved; rule = a cláusula obrigatória.",
  };
}

/**
 * 3.6.1 (item 5): pendências do perfil knowledge-free — só o que o axe mediu e não decidiu, com o critério WCAG
 * (nenhum texto, id ou força da base de conhecimento).
 */
export function pageLevelBlockKnowledgeFree(items: PendingItem[]) {
  return {
    notMeasured: items.map((i) => compactItem(i)),
    note: "notMeasured: pendências suas — o axe mediu e não decidiu; não é conformidade. Cada pendingId volta em todo scan até você resolvê-lo com verify_finding (critério em norms).",
  };
}

/** A norma curta de uma pendência: o 1º e-MAG; senão o 1º WCAG; senão a 1ª da lista. */
function shortNorm(norms: string[] | undefined, rule?: { id: string }): string | null {
  const all = [...(norms ?? []), ...(rule ? [rule.id] : [])];
  return all.find((n) => n.startsWith("emag-")) ?? all.find((n) => n.startsWith("wcag-")) ?? all[0] ?? null;
}

/**
 * 3.6.1 (revisão H1): a forma curta das pendências — o piso antes de qualquer família sair da 1ª página. Uma linha
 * por pendência com sinal (`P-NN:código[:n]⇒emag-x.y`, ~35 caracteres); as sem sinal (idioma, regiões) só contadas.
 * A cláusula inteira está em `full` (get_finding_details) e no scan seguinte (sessionPending) enquanto não foi entregue.
 */
export function pageLevelShort(block: { notMeasured?: Array<PendingItem | string>; full?: unknown }) {
  let low = 0;
  const items: string[] = [];
  for (const i of block.notMeasured ?? []) {
    if (typeof i === "string") {
      items.push(i);
      continue;
    }
    if (i.signal === "low") {
      low += 1;
      continue;
    }
    const norm = shortNorm(i.norms, i.rule);
    items.push(`${i.pendingId ? `${i.pendingId}:` : ""}${i.code}${i.count !== undefined ? `:${i.count}` : ""}${norm ? `⇒${norm}` : ""}${i.resolved !== undefined ? "✓" : ""}`);
  }
  return {
    notMeasured: items,
    ...(low ? { lowSignal: low } : {}),
    ...(block.full ? { full: block.full } : {}),
  };
}

/** Último recurso do teto: só os códigos das pendências (inteiras no ledger: get_finding_details(scanId)). */
export function pageLevelCodes(block: { measured?: string[]; notMeasured?: Array<NotJudgedItem | string>; full?: unknown }, scanId = "") {
  const codes = (block.notMeasured ?? []).map((i) => {
    if (typeof i === "string") return i.split("⇒")[0];
    const pid = (i as PendingItem).pendingId;
    return `${pid ? `${pid}:` : ""}${i.count !== undefined ? `${i.code}:${i.count}` : i.code}`;
  });
  return {
    notMeasured: codes,
    count: codes.length,
    ...(block.full ? { next: block.full } : scanId ? { next: { tool: "get_finding_details", arguments: { scanId, view: "observations" } } } : {}),
  };
}
