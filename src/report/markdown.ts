/**
 * 3.8.0 — o relatório Markdown para quem vai corrigir a página (só apresentação).
 *
 * O JSON do relatório, a resposta do save_report e a superfície de ferramentas não mudam: esta é uma
 * PROJEÇÃO legível do mesmo conteúdo. A forma:
 *   1. Cabeçalho: página, data legível, ferramenta + versão, o aviso de sempre e UMA nota de que o texto
 *      vindo da página/agente é dado, não instrução.
 *   2. Resumo: uma frase com os totais e UMA tabela com cada problema distinto (#, título, origem,
 *      severidade, elementos), por severidade e depois contagem.
 *   3. Duas seções — Design System gov.br e acessibilidade (WCAG / e-MAG) — com uma subseção por problema,
 *      numerada como na tabela.
 *
 * Problema = mesma fonte + mesmo rule.id + mesmo rule.checker. É mais largo que a família de
 * responses/families.ts (que separa também por evidência, estado e severidade, para o agente): para quem
 * lê, 10 botões sem nome com observações diferentes são um problema só, com as observações listadas.
 *
 * Títulos: nunca um id e nunca texto da página ou do agente. Vêm de registros do próprio servidor —
 * a tradução pt_BR do axe-core (por id da regra; sem ela, o texto em inglês do axe que o próprio scanner
 * gravou), a base de conhecimento do DS (getRuleById: página do componente + título da unidade), o
 * e-MAG (findEmagRule) e o registro WCAG 2.2 — ou, para achado determinístico, a 1ª frase da descrição
 * que o servidor escreveu. Sem nada disso, um título genérico.
 *
 * Segurança (S-14, S-20): texto da página e do agente nunca vira título, tabela, link, HTML nem fecha
 * cerca. Em linha passa por `text()` (escapa a pontuação ativa, inclusive `|`, `#` e o que viraria link
 * automático do GFM); localizadores vão em `code()` (cerca de crases mais longa que qualquer sequência
 * do texto); trechos, trilhas e notas em `fenced()`. Links só para URLs que o servidor guarda (fonte da
 * unidade da base; helpUrl do axe em achado determinístico; endereço do e-MAG no registro), conferidas por padrão.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { CheckStatus, Finding, Severity, Verification, ViolationStatus } from "../schema/finding.js";
import type { Report } from "./report.js";
import { getRuleById, type KnowledgeRule } from "../data/knowledge.js";
import { findEmagRule, getEmag } from "../data/load.js";
import { getWcagRegistry } from "../verify/registries.js";
import { isKnowledgeLocked } from "../data/lock.js";

/** Quantos localizadores cada problema lista antes de "… e mais N". */
export const ELEMENT_LIST_CAP = 10;
/** Com observações diferentes: quantas observações distintas e quantos elementos em cada. */
export const OBSERVATION_GROUP_CAP = 8;
export const ELEMENTS_PER_OBSERVATION_CAP = 5;
/** Achados do agente: quantas verificações/trilhas por problema. */
export const AGENT_DETAIL_CAP = 10;

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const SEVERITY_PT: Record<Severity, string> = { critical: "crítica", serious: "grave", moderate: "moderada", minor: "leve" };
const SEVERITY_PT_PLURAL: Record<Severity, string> = { critical: "críticas", serious: "graves", moderate: "moderadas", minor: "leves" };

const SOURCE_PT: Record<Finding["rule"]["source"], string> = {
  "govbr-ds-kb": "base de conhecimento do Design System gov.br",
  "govbr-ds-token": "tokens do Design System gov.br",
  "govbr-ds-structure": "estrutura de componentes do Design System gov.br",
  "govbr-ds-page": "diretrizes de página do Design System gov.br",
  emag: "e-MAG 3.1",
  wcag: "WCAG 2.2",
  "axe-core": "axe-core",
};

const CHECK_PT: Record<CheckStatus, string> = { pass: "sim", fail: "não", unknown: "não determinado", "not-applicable": "não se aplica" };
const VIOLATION_PT: Record<ViolationStatus, string> = {
  verified: "recalculada e confirmada pelo oráculo",
  contradicted: "contradita pela página",
  "no-predicate": "sem predicado no oráculo (não recalculada)",
  "not-checked": "não conferida na página viva",
  undetermined: "indeterminada no estado reproduzido",
  error: "erro ao reabrir a página",
};
const VERDICT_PT: Record<Verification["verdict"], string> = {
  confirmed: "confirmado",
  rejected: "rejeitado",
  unverifiable: "não verificável",
};

/** Os checks de token citam a mesma unidade da base; o título diz qual propriedade. */
const TOKEN_CHECK_PT: Record<string, string> = {
  "ds-token-color": "cores",
  "ds-token-spacing": "espaçamentos",
  "ds-token-radius": "cantos arredondados",
  "ds-token-font-family": "família tipográfica",
  "ds-token-font-size": "tamanho de fonte",
};

// ── Escapes ────────────────────────────────────────────────────────────────

/**
 * Texto em linha, de qualquer origem: sem quebras; pontuação ativa escapada (ênfase, código, links,
 * imagens, HTML, tabela, tachado); esquema de URL, `www.` e `@` quebrados para o GFM não criar link
 * automático; `#` final (que fecharia um título) escapado. O que só é ativo no início da linha (`#`,
 * `>`, marcador de lista) fica com `lead()`, usado onde o texto abre um item.
 */
export function text(value: string, max = 600): string {
  const flat = value.replace(/\s+/g, " ").trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return cut
    .replace(/[\\`*_[\]<>|~!&@]/g, (c) => `\\${c}`)
    .replace(/:\/\//g, ":\\/\\/")
    .replace(/\b(www)\./gi, "$1\\.")
    .replace(/(^|\s)(#+)$/, "$1\\$2");
}

/** Texto que abre um item de lista: além de `text()`, o início que viraria título, citação ou lista. */
export function lead(value: string, max = 600): string {
  return text(value, max)
    .replace(/^#/, "\\#")
    .replace(/^([-+=])/, "\\$1")
    .replace(/^(\d+)([.)])/, "$1\\$2");
}

/** Código em linha: a cerca de crases é mais longa que qualquer sequência de crases do valor. */
export function code(value: string, max = 300): string {
  const flat = value.replace(/\s+/g, " ").trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  const longest = Math.max(0, ...Array.from(cut.matchAll(/`+/g), (m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = cut.startsWith("`") || cut.endsWith("`") || cut === "" ? " " : "";
  return `${fence}${pad}${cut}${pad}${fence}`;
}

/** Cerca de código mais longa que qualquer sequência de crases do texto: o texto nunca fecha o bloco. */
export function fenced(value: string, lang = ""): string[] {
  const longest = Math.max(2, ...Array.from(value.matchAll(/`+/g), (m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return [`${fence}${lang}`, value, fence];
}

/** Só URLs https sem nada que feche o destino do link. */
function safeUrl(url: unknown): string | undefined {
  return typeof url === "string" && /^https:\/\/[A-Za-z0-9.-]+(\/[^\s()<>[\]`"'\\]*)?$/.test(url) ? url : undefined;
}

const AXE_HELP_URL = /^https:\/\/dequeuniversity\.com\/rules\/axe\/[0-9.]+\/[a-z0-9-]+\?application=axeAPI$/;

// ── Registros (títulos, textos, referências) ───────────────────────────────

interface AxeLocale {
  rules: Record<string, { description?: string; help?: string }>;
  failureSummaries?: Record<string, { failureMessage?: string }>;
}

let axeLocale: AxeLocale | null | undefined;
function getAxeLocale(): AxeLocale | null {
  if (axeLocale !== undefined) return axeLocale;
  try {
    const require = createRequire(import.meta.url);
    axeLocale = JSON.parse(readFileSync(require.resolve("axe-core/locales/pt_BR.json"), "utf8")) as AxeLocale;
  } catch {
    axeLocale = null;
  }
  return axeLocale;
}

function axeRulePt(id: string): { help?: string; description?: string } | undefined {
  const rule = getAxeLocale()?.rules?.[id];
  return rule && (rule.help || rule.description) ? rule : undefined;
}

/** Cabeçalho do resumo de falha do axe em pt_BR: o texto antes do primeiro `{{` do modelo da tradução. */
function axeSummaryHeader(kind: "any" | "none"): string {
  const template = getAxeLocale()?.failureSummaries?.[kind]?.failureMessage;
  const head = typeof template === "string" ? template.split("{{")[0].trim() : "";
  if (head) return head;
  return kind === "any" ? "Corrija qualquer um dos itens a seguir:" : "Corrija todos os itens a seguir:";
}

/** Sob a trava de conhecimento (perfil knowledge-free), nenhum carregador da base é chamado: o título cai na reserva. */
function knowledge<T>(read: () => T): T | undefined {
  if (isKnowledgeLocked()) return undefined;
  try {
    return read();
  } catch {
    return undefined;
  }
}

function kbRule(f: Finding): KnowledgeRule | undefined {
  return f.rule.source === "govbr-ds-kb" ? knowledge(() => getRuleById(f.rule.id)) : undefined;
}

function emagRule(id: string) {
  return knowledge(() => findEmagRule(id.replace(/^emag-/, "")));
}

function wcagHandle(num: string): string | undefined {
  try {
    return getWcagRegistry().criteria.find((c) => c.num === num)?.handle;
  } catch {
    return undefined;
  }
}

function firstSentence(value: string, max = 110): string {
  const flat = value.replace(/\s+/g, " ").trim();
  // Um rótulo curto antes de ":" ("Button: …") não é a frase: o corte só vale depois de 15 caracteres.
  const stop = Array.from(flat.matchAll(/[.:;](?=\s|$)/g)).find((m) => (m.index ?? 0) >= 15)?.index;
  const sentence = stop !== undefined ? flat.slice(0, stop) : flat;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

function isDsSource(source: Finding["rule"]["source"]): boolean {
  return source.startsWith("govbr-ds-");
}

/** Título do problema: só de registros do servidor (ou da descrição que o servidor escreveu). */
export function problemTitle(f: Finding): string {
  const { source, id, checker } = f.rule;
  const deterministic = f.pathway === "deterministic";
  let title: string | undefined;
  if (source === "axe-core") {
    title = axeRulePt(id)?.help;
    // Sem tradução: o texto em inglês do próprio axe, que o scanner gravou em expected.
    if (!title && deterministic && f.evidence.expected) title = f.evidence.expected;
  } else if (source === "govbr-ds-kb") {
    const rule = kbRule(f);
    if (rule) {
      const unit = firstSentence(rule.title.replace(/^\d+(\.\d+)*\.?\s+/, ""), 90);
      const page = typeof rule.source?.pageTitle === "string" ? rule.source.pageTitle.trim() : "";
      title = page && page.toLowerCase() !== unit.toLowerCase() ? `${page} — ${unit}` : unit;
    }
  } else if (source === "emag") {
    title = emagRule(id)?.title;
  } else if (source === "wcag") {
    title = wcagHandle(id);
  }
  if (!title && deterministic && f.rule.description) title = firstSentence(f.rule.description);
  if (!title) title = isDsSource(source) ? "Regra do Design System gov.br sem título no registro" : "Regra de acessibilidade sem título no registro";
  const qualifier = checker ? TOKEN_CHECK_PT[checker] : undefined;
  return qualifier ? `${title} (${qualifier})` : title;
}

// ── Agrupamento ────────────────────────────────────────────────────────────

export interface Problem {
  key: string;
  title: string;
  ds: boolean;
  members: Finding[];
  worst: Severity;
}

/** Problema = fonte + rule.id + rule.checker; ordem: severidade mais alta, mais elementos, 1ª aparição. */
export function groupProblems(findings: Finding[]): Problem[] {
  const byKey = new Map<string, Problem>();
  for (const f of findings) {
    const key = JSON.stringify([f.rule.source, f.rule.id, f.rule.checker ?? null]);
    let problem = byKey.get(key);
    if (!problem) {
      problem = { key, title: "", ds: isDsSource(f.rule.source), members: [], worst: f.severity };
      byKey.set(key, problem);
    }
    problem.members.push(f);
    if (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[problem.worst]) problem.worst = f.severity;
  }
  const problems = [...byKey.values()];
  for (const p of problems) {
    // O título vem do membro determinístico, se houver (o fallback pela descrição só vale para ele).
    p.title = problemTitle(p.members.find((m) => m.pathway === "deterministic") ?? p.members[0]);
  }
  return problems
    .map((p, order) => ({ p, order }))
    .sort((a, b) => SEVERITY_ORDER[a.p.worst] - SEVERITY_ORDER[b.p.worst] || b.p.members.length - a.p.members.length || a.order - b.order)
    .map(({ p }) => p);
}

// ── Peças da subseção ──────────────────────────────────────────────────────

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function originLabel(ds: boolean): string {
  return ds ? "Design System gov.br" : "Acessibilidade";
}

/**
 * O resumo de falha do axe ("Fix any of the following:\n  item\n  item"): cabeçalho em pt_BR e itens
 * separados. Os itens ficam como o axe os mediu (em inglês), com razão de contraste e cores intactas.
 */
function axeFailureParts(observed: string): { header?: string; items: string[] }[] | undefined {
  if (!/^\s*Fix (any|all) of the following:/.test(observed)) return undefined;
  const blocks: { header?: string; items: string[] }[] = [];
  for (const raw of observed.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = /^Fix (any|all) of the following:$/.exec(line);
    if (head) blocks.push({ header: axeSummaryHeader(head[1] === "any" ? "any" : "none"), items: [] });
    else if (blocks.length) blocks[blocks.length - 1].items.push(line);
    else blocks.push({ items: [line] });
  }
  return blocks;
}

/** Observação em uma linha (para listas): o item único do axe sem o cabeçalho; senão, tudo achatado. */
function observedInline(f: Finding, atStart = false): string {
  const t = atStart ? lead : text;
  const parts = f.rule.source === "axe-core" ? axeFailureParts(f.evidence.observed) : undefined;
  if (!parts) return t(f.evidence.observed);
  const items = parts.flatMap((b) => b.items);
  if (items.length === 1) return t(items[0]);
  return t(parts.map((b) => `${b.header ? `${b.header} ` : ""}${b.items.join("; ")}`).join(" "));
}

/** Observação como item de lista: com várias mensagens do axe, uma sublista. */
function observedBlock(label: string, f: Finding): string[] {
  const parts = f.rule.source === "axe-core" ? axeFailureParts(f.evidence.observed) : undefined;
  const items = parts?.flatMap((b) => b.items) ?? [];
  if (!parts || items.length <= 1) return [`- **${label}:** ${observedInline(f)}`];
  const lines = [`- **${label}** (mensagens do axe-core):`];
  for (const block of parts) {
    if (block.header) {
      lines.push(`  - ${lead(block.header)}`);
      for (const item of block.items) lines.push(`    - ${lead(item, 300)}`);
    } else {
      for (const item of block.items) lines.push(`  - ${lead(item, 300)}`);
    }
  }
  return lines;
}

function distinct<T>(values: T[], keyOf: (v: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const v of values) {
    const k = keyOf(v);
    const list = out.get(k) ?? [];
    list.push(v);
    out.set(k, list);
  }
  return out;
}

function severityLine(p: Problem): string {
  const counts = distinct(p.members, (m) => m.severity);
  if (counts.size === 1) return `- **Severidade:** ${SEVERITY_PT[p.worst]}`;
  const parts = [...counts.entries()]
    .sort((a, b) => SEVERITY_ORDER[a[0] as Severity] - SEVERITY_ORDER[b[0] as Severity])
    .map(([sev, list]) => `${list.length} ${list.length === 1 ? SEVERITY_PT[sev as Severity] : SEVERITY_PT_PLURAL[sev as Severity]}`);
  return `- **Severidade:** ${SEVERITY_PT[p.worst]} (${parts.join(", ")})`;
}

function detectionLine(p: Problem): string {
  const by = distinct(p.members, (m) => m.pathway);
  const parts: string[] = [];
  const scanner = p.members[0].rule.source === "axe-core" ? "medição automática do oráculo (axe-core)" : "medição automática do oráculo";
  const det = by.get("deterministic");
  if (det) parts.push(by.size > 1 ? `${scanner}: ${plural(det.length, "elemento", "elementos")}` : scanner);
  for (const pathway of ["explicit", "heuristic"] as const) {
    const list = by.get(pathway);
    if (!list) continue;
    const kind = pathway === "explicit" ? "achado do agente sobre regra fornecida a ele" : "achado do agente por iniciativa própria";
    const verdicts = distinct(list, (m) => (m.verification ? VERDICT_PT[m.verification.verdict] : "sem verificação do servidor"));
    const gate = [...verdicts.entries()].map(([v, l]) => (verdicts.size > 1 || by.size > 1 ? `${v} (${l.length})` : v)).join(", ");
    parts.push(`${kind}, conferido pelo portão do oráculo: ${gate}`);
  }
  return `- **Como foi detectado:** ${parts.join("; ")}`;
}

function verificationLines(f: Finding): string[] {
  const v = f.verification;
  if (!v) return ["sem verificação guardada pelo servidor (o portão não conferiu este achado)"];
  const head = `portão: **${VERDICT_PT[v.verdict]}**, por ${code(v.verifiedBy, 80)}${v.detail ? ` — ${text(v.detail)}` : ""}`;
  const c = v.checks;
  if (!c) return [head];
  return [
    head,
    `conferências: regra existe — ${CHECK_PT[c.ruleExists]}; regra aplicável — ${CHECK_PT[c.applicability]}; ` +
      `evidência coerente com a página — ${CHECK_PT[c.evidenceConsistent]}; violação — ${VIOLATION_PT[c.violation]}`,
  ];
}

function ruleLines(p: Problem): string[] {
  const f = p.members.find((m) => m.pathway === "deterministic") ?? p.members[0];
  const { source, id, checker, wcag } = f.rule;
  const lines: string[] = [];
  const data = f.evidence.data ?? {};
  const kb = kbRule(f);
  const axe = source === "axe-core" ? axeRulePt(id) : undefined;

  if (kb) {
    lines.push(`- **Regra:** “${text(kb.normalizedRule || kb.title)}”`);
    if (f.rule.description && f.rule.description.trim() !== kb.normalizedRule.trim()) {
      lines.push(`- **${f.pathway === "deterministic" ? "Como o oráculo mede" : "Descrição do agente"}:** ${text(f.rule.description)}`);
    }
  } else if (axe?.description) {
    lines.push(`- **Regra:** ${text(axe.description)}`);
  } else {
    lines.push(`- **Regra:** ${text(f.rule.description)}`);
  }

  const refs: string[] = [code(id, 120)];
  if (kb) {
    const page = typeof kb.source?.pageTitle === "string" ? kb.source.pageTitle : undefined;
    const std = kb.standard ? `${kb.standard}${kb.standardVersion ? ` ${kb.standardVersion}` : ""}` : SOURCE_PT[source];
    refs.push(text(page ? `${std}, ${page}` : std, 160));
  } else {
    refs.push(text(SOURCE_PT[source]));
  }
  if (checker) refs.push(`verificação ${code(checker, 80)}`);
  const wcagRefs = new Set<string>([...(wcag ? [wcag] : []), ...(kb?.wcagReferences ?? [])]);
  if (wcagRefs.size && source !== "wcag") refs.push(`WCAG ${text([...wcagRefs].join(", "), 60)}`);
  if (source === "axe-core" && data.bestPractice === true) refs.push("boa prática do axe-core (sem critério WCAG)");
  const emagIds = new Set<string>();
  if (source === "axe-core" && typeof data.emagId === "string") emagIds.add(data.emagId);
  for (const ref of kb?.emagReferences ?? []) emagIds.add(ref);
  for (const emagId of emagIds) {
    const title = emagRule(emagId)?.title;
    const topical = source === "axe-core" && data.emagRelation === "topical" ? ", só por tema" : "";
    refs.push(`e-MAG ${text(emagId, 20)}${title ? ` (${text(title, 120)}${topical})` : topical ? ` (${topical.slice(2)})` : ""}`);
  }
  lines.push(`- **Referência:** ${refs.join(" · ")}`);

  // Só URLs que o servidor guarda: a fonte da unidade da base, o helpUrl do axe gravado pelo scanner, o endereço
  // do e-MAG no registro (data/emag.json). Nenhuma é montada aqui.
  let doc: { url: string; label: string } | undefined;
  const kbUrl = kb ? safeUrl(kb.source?.url) : undefined;
  if (kbUrl) doc = { url: kbUrl, label: "página oficial da regra" };
  else if (source === "axe-core" && f.pathway === "deterministic" && typeof data.helpUrl === "string" && AXE_HELP_URL.test(data.helpUrl)) {
    doc = { url: data.helpUrl, label: "explicação da regra no axe-core (Deque, em inglês)" };
  } else if (source === "emag" && emagRule(id)) {
    const emagUrl = safeUrl(knowledge(() => getEmag().meta.url));
    if (emagUrl) doc = { url: emagUrl, label: "e-MAG 3.1 (página oficial)" };
  }
  if (doc) lines.push(`- **Documentação:** [${doc.label}](${doc.url})`);
  return lines;
}

function expectedText(f: Finding, atStart = false): string {
  const t = atStart ? lead : text;
  // O expected do axe é o help em inglês da própria regra: com tradução, vai a tradução.
  if (f.rule.source === "axe-core" && f.pathway === "deterministic") {
    const help = axeRulePt(f.rule.id)?.help;
    if (help) return t(help);
  }
  return t(f.evidence.expected);
}

function elementLine(f: Finding, indent = ""): string {
  return `${indent}- ${code(f.element.locator)} · ${text(f.id, 40)}`;
}

function moreLine(rest: number, indent = ""): string {
  return `${indent}- … e mais ${rest} (lista completa no arquivo JSON)`;
}

function renderProblem(p: Problem, label: string): string[] {
  const lines = [`### ${label}. ${text(p.title, 160)}`, ""];
  lines.push(severityLine(p), `- **Origem:** ${originLabel(p.ds)}`, detectionLine(p));
  lines.push(...ruleLines(p));

  const byObserved = distinct(p.members, (m) => m.evidence.observed);
  const uniform = byObserved.size === 1;
  if (uniform) lines.push(...observedBlock("O que foi encontrado", p.members[0]));
  else lines.push(`- **O que foi encontrado:** varia entre os elementos (${byObserved.size} observações distintas, listadas em “Elementos afetados”)`);
  const byExpected = distinct(p.members, (m) => m.evidence.expected);
  if (byExpected.size === 1) lines.push(`- **O que se espera:** ${expectedText(p.members[0])}`);
  else {
    lines.push("- **O que se espera:**");
    const groups = [...byExpected.values()];
    for (const list of groups.slice(0, OBSERVATION_GROUP_CAP)) lines.push(`  - ${expectedText(list[0], true)} (${plural(list.length, "elemento", "elementos")})`);
    if (groups.length > OBSERVATION_GROUP_CAP) lines.push(`  - … e mais ${groups.length - OBSERVATION_GROUP_CAP} expectativas distintas (arquivo JSON)`);
  }
  lines.push("");

  const example = p.members.find((m) => m.element.snippet);
  if (example?.element.snippet) {
    lines.push(`**Exemplo** (${code(example.element.locator, 160)}):`, "", ...fenced(example.element.snippet.slice(0, 600), "html"), "");
  }

  lines.push(`**Elementos afetados (${p.members.length}):**`, "");
  if (uniform) {
    for (const f of p.members.slice(0, ELEMENT_LIST_CAP)) lines.push(elementLine(f));
    if (p.members.length > ELEMENT_LIST_CAP) lines.push(moreLine(p.members.length - ELEMENT_LIST_CAP));
  } else {
    const groups = [...byObserved.values()];
    for (const list of groups.slice(0, OBSERVATION_GROUP_CAP)) {
      lines.push(`- ${observedInline(list[0], true)} — ${plural(list.length, "elemento", "elementos")}:`);
      for (const f of list.slice(0, ELEMENTS_PER_OBSERVATION_CAP)) lines.push(elementLine(f, "  "));
      if (list.length > ELEMENTS_PER_OBSERVATION_CAP) lines.push(moreLine(list.length - ELEMENTS_PER_OBSERVATION_CAP, "  "));
    }
    if (groups.length > OBSERVATION_GROUP_CAP) {
      const rest = groups.slice(OBSERVATION_GROUP_CAP).reduce((n, l) => n + l.length, 0);
      lines.push(`- … e mais ${groups.length - OBSERVATION_GROUP_CAP} observações distintas em ${plural(rest, "elemento", "elementos")} (arquivo JSON)`);
    }
  }
  lines.push("");

  const agent = p.members.filter((m) => m.pathway !== "deterministic");
  if (agent.length) {
    lines.push("**Verificação dos achados do agente:**", "");
    const byVerification = distinct(agent, (m) => JSON.stringify(verificationLines(m)));
    const groups = [...byVerification.values()];
    for (const list of groups.slice(0, AGENT_DETAIL_CAP)) {
      const [first, ...rest] = verificationLines(list[0]);
      const ids = list.slice(0, 10).map((m, k) => (k === 0 ? lead : text)(m.id, 40)).join(", ") + (list.length > 10 ? ` e mais ${list.length - 10}` : "");
      lines.push(`- ${ids}: ${first}`);
      for (const r of rest) lines.push(`  - ${r}`);
    }
    if (groups.length > AGENT_DETAIL_CAP) lines.push(`- … e mais ${groups.length - AGENT_DETAIL_CAP} verificações distintas (arquivo JSON)`);
    lines.push("");
    const traced = agent.filter((m) => m.trace);
    for (const f of traced.slice(0, AGENT_DETAIL_CAP)) {
      lines.push(`Trilha de raciocínio do agente (${text(f.id, 40)}):`, "", ...fenced(f.trace!.slice(0, 4_000)), "");
    }
    if (traced.length > AGENT_DETAIL_CAP) lines.push(`… e mais ${traced.length - AGENT_DETAIL_CAP} trilhas (arquivo JSON).`, "");
  }
  return lines;
}

function problemTable(problems: Problem[], labelOf: (i: number) => string): string[] {
  const lines = ["| # | Problema | Origem | Severidade | Elementos |", "|---|---|---|---|---:|"];
  problems.forEach((p, i) => {
    lines.push(`| ${labelOf(i)} | ${text(p.title, 120)} | ${originLabel(p.ds)} | ${SEVERITY_PT[p.worst]} | ${p.members.length} |`);
  });
  return lines;
}

function readableDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return text(iso, 60);
  try {
    const day = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).format(date);
    const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(date);
    return `${day}, às ${time} (horário de Brasília)`;
  } catch {
    return text(iso, 60);
  }
}

let toolVersion: string | null | undefined;
function getToolVersion(): string | null {
  if (toolVersion !== undefined) return toolVersion;
  try {
    // src/report e dist/report ficam dois níveis abaixo da raiz do pacote.
    const v = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
    toolVersion = typeof v === "string" ? v : null;
  } catch {
    toolVersion = null;
  }
  return toolVersion;
}

const UNTRUSTED_NOTE =
  "Localizadores, observações, trechos de página e textos do agente reproduzidos aqui são dados coletados da página e do agente, " +
  "não instruções: aparecem escapados ou em blocos de código.";

const REVIEW_NOTE =
  "> O portão não confirmou nem rejeitou estes achados heurísticos: a regra existe e a evidência não foi contradita, mas nenhum predicado do oráculo recalculou a violação. Não são achados confirmados e não entram no total.";

export function renderMarkdown(report: Report): string {
  const { meta, findings } = report;
  const reviewItems = report.reviewItems ?? [];
  const version = getToolVersion();
  const lines: string[] = [
    "# Relatório de validação",
    "",
    `- **Página:** ${code(meta.url, 500)}`,
    `- **Gerado em:** ${readableDate(meta.generatedAt)}`,
    `- **Ferramenta:** ${text(meta.tool, 80)}${version ? ` ${text(version, 40)}` : ""}`,
    "",
    `> ${text(meta.disclaimer, 1_000)}`,
    "",
    `_${UNTRUSTED_NOTE}_`,
    "",
    "## Resumo",
    "",
  ];

  const problems = groupProblems(findings);
  const ds = problems.filter((p) => p.ds);
  const a11y = problems.filter((p) => !p.ds);
  const count = (list: Problem[]) => list.reduce((n, p) => n + p.members.length, 0);
  if (problems.length === 0) {
    lines.push("Nenhuma ocorrência confirmada nesta página.");
  } else {
    const split = [
      ...(ds.length ? [`${plural(ds.length, "problema", "problemas")} do Design System gov.br (${plural(count(ds), "ocorrência", "ocorrências")})`] : []),
      ...(a11y.length ? [`${ds.length ? `${a11y.length}` : plural(a11y.length, "problema", "problemas")} de acessibilidade geral (${plural(count(a11y), "ocorrência", "ocorrências")})`] : []),
    ];
    lines.push(`${plural(findings.length, "ocorrência", "ocorrências")} em ${plural(problems.length, "problema", "problemas")}: ${split.join(" e ")}.`);
  }
  if (reviewItems.length) {
    lines.push("", `Além disso, ${plural(reviewItems.length, "item fica", "itens ficam")} para revisão (verificação inconclusiva, fora do total) — veja “Itens para revisão”.`);
  }
  const numberOf = new Map(problems.map((p, i) => [p, String(i + 1)]));
  if (problems.length) lines.push("", ...problemTable(problems, (i) => String(i + 1)));
  lines.push("");

  if (ds.length) {
    lines.push("## Problemas do Design System gov.br", "");
    for (const p of ds) lines.push(...renderProblem(p, numberOf.get(p)!));
  }
  if (a11y.length) {
    lines.push("## Problemas de acessibilidade (WCAG / e-MAG)", "");
    for (const p of a11y) lines.push(...renderProblem(p, numberOf.get(p)!));
  }

  if (reviewItems.length > 0) {
    const review = groupProblems(reviewItems);
    lines.push("## Itens para revisão — verificação inconclusiva", "", REVIEW_NOTE, "", ...problemTable(review, (i) => `R${i + 1}`), "");
    review.forEach((p, i) => lines.push(...renderProblem(p, `R${i + 1}`)));
  }

  if (report.notes) {
    // S-20: notas do agente em bloco literal — não viram título, tabela, script nem link.
    lines.push("## Notas (do agente)", "", ...fenced(report.notes), "");
  }

  return lines.join("\n");
}
