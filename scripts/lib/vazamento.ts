/**
 * Detector de vazamento de conhecimento do DS/e-MAG em respostas MCP (2.14.0, NAT-61, plano §5.2;
 * 2.14.1 apertado pela revisão Codex db6d022d).
 *
 * É um detector AUXILIAR, não prova universal de ausência: a garantia por construção é a trava de
 * carregamento (src/data/lock.ts). Ele só vê o que está no dicionário (gerado do `data/` desta versão,
 * nunca escrito à mão: ids, títulos, trechos de 6 palavras, tokens, classes…); uma paráfrase curta, um
 * fato do DS reescrito com outras palavras ou um termo fora do dicionário passam. Em cada folha de texto
 * de cada resposta ele procura os termos e classifica cada ocorrência:
 *
 *   - `eco`: o termo é o VALOR INTEIRO de um argumento que o chamador enviou, numa folha declarada para
 *     ecoar aquele argumento naquela ferramenta (TOOL_FIELDS.echo; ex.: o id de regra citado, repetido no
 *     detalhe do veredito), ou o nome da própria ferramenta no texto de erro. Termo presente em outro
 *     ponto dos argumentos, ou eco fora do campo declarado, NÃO é perdoado.
 *   - `pagina`: a folha está num campo medido da página declarado PARA AQUELA FERRAMENTA pelo caminho
 *     inteiro (TOOL_FIELDS.page: localizador, snippet, URL, textos e nome acessível do traço) E o termo
 *     existe nos bytes servidos/renderizados DESSA página. Nome final genérico (detail, name,
 *     description) não perdoa.
 *   - `axe`: a folha está num campo declarado da saída do axe-core E o termo existe no bundle do axe.
 *   - `excecao-nomeada`: as normalizações de fingerprint declaradas no plano (§3).
 *   - `sem-explicacao`: qualquer outra ocorrência. O aceite do perfil knowledge-free é zero.
 *
 * Não há subtração global: cada perdão sai no relatório com o caminho, a ferramenta e a justificativa
 * (e o caminho do argumento, no eco). Ferramenta sem campos declarados não perdoa nada além do eco do
 * próprio nome e das exceções nomeadas.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type TermKind = "exact" | "phrase";
export interface Term {
  term: string;
  kind: TermKind;
  source: string;
}

export interface Dictionary {
  exact: Map<string, Term>;
  /** frase normalizada → termo; indexado também por número de palavras. */
  phrases: Map<string, Term>;
  phraseLengths: number[];
  counts: Record<string, number>;
}

export const SHINGLE = 6;
export const MIN_TITLE_WORDS = 3;

/** Normalização de frase: minúsculas, sem acento, só letras/dígitos como palavras. */
export function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Tokens exatos (ids, nomes de token CSS, classes): sensível a caixa. */
export function exactTokens(text: string): string[] {
  return (text.match(/[A-Za-z0-9_.\-]+/g) ?? []).map((t) => t.replace(/\.+$/, ""));
}

function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsOf(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => stringsOf(v, out));
  return out;
}

export class DictionaryBuilder {
  readonly exact = new Map<string, Term>();
  readonly phrases = new Map<string, Term>();
  readonly counts: Record<string, number> = {};

  addExact(term: string, source: string): void {
    if (!term || this.exact.has(term)) return;
    this.exact.set(term, { term, kind: "exact", source });
    this.counts[source] = (this.counts[source] ?? 0) + 1;
  }

  /** Frase inteira (título, termo fixo): entra se tiver ao menos `minWords` palavras. */
  addPhrase(text: string, source: string, minWords = MIN_TITLE_WORDS): void {
    const w = words(text);
    if (w.length < minWords) return;
    const key = w.join(" ");
    if (this.phrases.has(key)) return;
    this.phrases.set(key, { term: text, kind: "phrase", source });
    this.counts[source] = (this.counts[source] ?? 0) + 1;
  }

  /** Trechos de 6 palavras de um texto longo. */
  addShingles(text: string, source: string): void {
    const w = words(text);
    for (let i = 0; i + SHINGLE <= w.length; i += 1) {
      const key = w.slice(i, i + SHINGLE).join(" ");
      if (this.phrases.has(key)) continue;
      this.phrases.set(key, { term: key, kind: "phrase", source });
      this.counts[source] = (this.counts[source] ?? 0) + 1;
    }
  }

  build(): Dictionary {
    const lengths = new Set<number>();
    for (const key of this.phrases.keys()) lengths.add(key.split(" ").length);
    return { exact: this.exact, phrases: this.phrases, phraseLengths: [...lengths].sort((a, b) => a - b), counts: this.counts };
  }
}

/** Termos fixos do plano (§5.2) e o vocabulário que só o conhecimento curado traz. */
export const FIXED_TERMS = ["Template Base", "Rawline", "knowledge base", "e-MAG", "eMAG", "Design System"];
export const RETIRED_TOOLS = ["get_ds_rules", "get_design_tokens", "get_emag_rules", "get_page_rules", "get_component_spec", "list_components", "normativeContext"];

/**
 * Dicionário gerado do `data/` de uma árvore do validator: base (todas as versões), tokens, specs,
 * e-MAG, conflitos e os ids publicados das checagens que aplicam a base.
 */
export function buildDictionary(validatorRoot: string, published: { checkIds: string[] }): Dictionary {
  const b = new DictionaryBuilder();
  const data = join(validatorRoot, "data");

  // Base de conhecimento: todas as versões e arquivos normalizados (inclui as herdadas e legadas).
  const versions = join(data, "knowledge", "versions");
  for (const version of readdirSync(versions)) {
    const dir = join(versions, version, "normalized");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
      for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
        if (!line.trim()) continue;
        const rule = JSON.parse(line) as Record<string, unknown>;
        if (typeof rule.id === "string") b.addExact(rule.id, "kb:id");
        const legacy = rule.legacy as { supersededBy?: string[] } | undefined;
        for (const id of legacy?.supersededBy ?? []) b.addExact(id, "kb:id");
        if (typeof rule.title === "string") b.addPhrase(rule.title, "kb:title");
        for (const field of ["originalText", "normalizedRule", "basis", "rationale", "expectedEvidence", "conditions", "exceptions", "notes"]) {
          for (const text of stringsOf(rule[field])) b.addShingles(text, `kb:${field}`);
        }
      }
    }
    // Ids legados (normalized/legacy-ids.json) — também são ids da base.
    const legacyFile = join(dir, "legacy-ids.json");
    if (existsSync(legacyFile)) {
      for (const text of stringsOf(JSON.parse(readFileSync(legacyFile, "utf8")))) {
        if (/^govbr-/.test(text)) b.addExact(text, "kb:id");
      }
    }
    // Conflitos documentados e auditoria do pacote oficial (o recurso govbr://knowledge/conflicts).
    for (const name of ["conflicts.json", "official-package-audit.json"]) {
      const f = join(versions, version, "reports", name);
      if (existsSync(f)) for (const text of stringsOf(JSON.parse(readFileSync(f, "utf8")))) b.addShingles(text, "kb:conflicts");
    }
  }

  // Tokens.
  const tokens = JSON.parse(readFileSync(join(data, "tokens.json"), "utf8")) as { all: Record<string, string> };
  for (const name of Object.keys(tokens.all)) b.addExact(name.startsWith("--") ? name : `--${name}`, "tokens:name");

  // Especificações de componente: classe raiz e classes de variante.
  const specs = JSON.parse(readFileSync(join(data, "component-specs.json"), "utf8")) as {
    components: Record<string, { rootClass: string; variantClasses: string[] }>;
  };
  for (const spec of Object.values(specs.components)) {
    b.addExact(spec.rootClass.replace(/^\./, ""), "specs:rootClass");
    // Classes de variante que são palavras soltas ("full", "status", "interaction", "foco") não
    // distinguem o DS de texto comum; entram só as compostas ("is-primary", "primary-darken-01").
    for (const v of spec.variantClasses) if (v.includes("-")) b.addExact(v.replace(/^\./, ""), "specs:variantClass");
  }

  // e-MAG: títulos e paráfrases.
  const emag = JSON.parse(readFileSync(join(data, "emag.json"), "utf8")) as {
    sections: Record<string, { title: string; rules: Array<{ title: string; description: string }> }>;
  };
  for (const section of Object.values(emag.sections)) {
    b.addPhrase(section.title, "emag:section");
    for (const rule of section.rules) {
      b.addPhrase(rule.title, "emag:title");
      b.addShingles(rule.description, "emag:description");
    }
  }

  // Diretrizes de página (prosa): trechos.
  const pageRules = JSON.parse(readFileSync(join(data, "ds-page-rules.json"), "utf8")) as { categories: unknown };
  for (const text of stringsOf(pageRules.categories)) b.addShingles(text, "page-rules:text");

  for (const id of published.checkIds) b.addExact(id, "checks:id");
  for (const tool of RETIRED_TOOLS) b.addExact(tool, "tools:retired");
  for (const term of FIXED_TERMS) b.addPhrase(term, "fixed", 1);
  return b.build();
}

export interface Hit {
  term: string;
  kind: TermKind;
  source: string;
  path: string;
}

/** Todas as ocorrências do dicionário numa folha de texto. */
export function hitsInText(dict: Dictionary, text: string, path: string): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  for (const token of exactTokens(text)) {
    const t = dict.exact.get(token);
    if (t && !seen.has(`e:${token}`)) {
      seen.add(`e:${token}`);
      hits.push({ term: token, kind: "exact", source: t.source, path });
    }
  }
  const w = words(text);
  for (const n of dict.phraseLengths) {
    for (let i = 0; i + n <= w.length; i += 1) {
      const key = w.slice(i, i + n).join(" ");
      const t = dict.phrases.get(key);
      if (t && !seen.has(`p:${key}`)) {
        seen.add(`p:${key}`);
        hits.push({ term: key, kind: "phrase", source: t.source, path });
      }
    }
  }
  return hits;
}

/** Folhas de texto de um JSON com o caminho (índices de array viram [*]). */
export function leaves(value: unknown, path = "$", out: Array<{ path: string; text: string }> = []) {
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v) => leaves(v, `${path}[*]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      // A chave também é texto que o servidor escolheu (ex.: "normativeContext").
      out.push({ path: `${path}.<chave>`, text: k });
      leaves(v, `${path}.${k}`, out);
    }
  }
  return out;
}

/**
 * 2.14.1 (revisão Codex db6d022d): campos declarados POR FERRAMENTA, pelo caminho inteiro da folha
 * (nunca pelo nome final: `detail`, `name`, `description` genéricos não perdoam nada).
 *
 *   page  folhas que transcrevem o que foi medido na página (localizador, snippet, URL, texto e nome
 *         acessível observados no traço). Prosa do servidor (`detail`, `observed`) NÃO entra: um termo
 *         da página citado numa frase do servidor sai `sem-explicacao` (falha conservadora).
 *   axe   folhas que reproduzem a saída do axe-core (id, help, tags, failureSummary).
 *   echo  folha → caminhos dos argumentos cujo VALOR INTEIRO pode voltar ali (ex.: o id da regra que o
 *         chamador citou, repetido no detalhe do veredito). Perdoa só o termo idêntico ao valor do
 *         argumento; qualquer outro termo na mesma folha (enriquecimento) continua contando.
 *
 * O texto não-JSON (`$`, mensagens de erro do protocolo) pode ecoar o nome da própria ferramenta.
 */
export interface ToolFields {
  page: string[];
  axe: string[];
  echo: Array<{ path: string; args: string[] }>;
}

const element = (prefix: string) => [`${prefix}.element.locator`, `${prefix}.element.snippet`, `${prefix}.element.page`];
const axeFinding = (prefix: string) => [
  `${prefix}.rule.id`,
  `${prefix}.rule.description`,
  `${prefix}.rule.wcag`,
  `${prefix}.evidence.expected`,
  `${prefix}.evidence.observed`,
  `${prefix}.evidence.data.helpUrl`,
  `${prefix}.evidence.data.axeTags[*]`,
];
const observedState = (prefix: string) => [
  `${prefix}.observed.url`,
  `${prefix}.observed.path`,
  `${prefix}.observed.focus.locator`,
  `${prefix}.observed.unobservableRoots[*]`,
];
const SCAN_PAGE_FIELDS = [
  ...element("$.findings[*]"),
  ...element("$.families[*].example"),
  ...element("$.observations[*]"),
  // 3.0.0 (NAT-99, S-03): bloco limitado de observações e a página completa por cursor.
  "$.observations.items[*].locator",
  ...observedState("$.state"),
  "$.url",
];
const SCAN_AXE_FIELDS = [
  ...axeFinding("$.findings[*]"),
  "$.families[*].example.rule.id",
  "$.families[*].example.observed",
  "$.families[*].rule.id",
];
const CONTEXT = "$.verification.binding.context";

export const TOOL_FIELDS: Record<string, ToolFields> = {
  scan_page: {
    page: SCAN_PAGE_FIELDS,
    axe: SCAN_AXE_FIELDS,
    echo: [
      { path: "$.url", args: ["url"] },
      { path: "$.state.recipe.url", args: ["url"] },
      { path: "$.state.recipe.actions[*].selector", args: ["actions[*].selector"] },
      { path: "$.state.replay.failure.selector", args: ["actions[*].selector"] },
    ],
  },
  get_finding_details: {
    page: [...SCAN_PAGE_FIELDS, "$.members[*].locator", ...observedState("$.ledger.state")],
    axe: SCAN_AXE_FIELDS,
    echo: [{ path: "$.familyId", args: ["familyId"] }],
  },
  verify_finding: {
    page: [
      ...observedState("$.verification.binding.state"),
      `${CONTEXT}.trace[*].url`,
      `${CONTEXT}.trace[*].activeDescription`,
      `${CONTEXT}.trace[*].message.text`,
      `${CONTEXT}.trace[*].visibleText[*]`,
      `${CONTEXT}.trace[*].subjects[*].text`,
      `${CONTEXT}.trace[*].subjects[*].classes[*]`,
      `${CONTEXT}.accessibility[*].ax.name`,
      `${CONTEXT}.accessibility[*].ax.description`,
      `${CONTEXT}.anatomy[*].classes[*]`,
      `${CONTEXT}.anatomy[*].messageText[*]`,
      `${CONTEXT}.anatomy[*].header.titleText`,
      `${CONTEXT}.anatomy[*].header.infoText`,
      `${CONTEXT}.anatomy[*].breadcrumb.items[*].text`,
      `${CONTEXT}.anatomy[*].breadcrumb.h1`,
      `${CONTEXT}.anatomy[*].breadcrumb.title`,
    ],
    axe: [],
    echo: [
      {
        path: "$.verification.detail",
        args: ["finding.rule.id", "finding.rule.source", "finding.rule.wcag", "finding.evidence.data.expectedCondition", "finding.evidence.data.component", "finding.evidence.data.part"],
      },
      // 3.0.0 (NAT-99): reasons[].detail repete o detalhe do veredito (mesmos ecos permitidos).
      {
        path: "$.reasons[*].detail",
        args: ["finding.rule.id", "finding.rule.source", "finding.rule.wcag", "finding.evidence.data.expectedCondition", "finding.evidence.data.component", "finding.evidence.data.part"],
      },
      { path: "$.findingId", args: ["finding.id"] },
      { path: "$.verification.binding.state.scanId", args: ["scanId"] },
    ],
  },
};

/** Valores (strings) de um caminho de argumento ("finding.rule.id", "actions[*].selector"). */
export function argValues(args: unknown, path: string): string[] {
  let current: unknown[] = [args];
  for (const raw of path.split(".")) {
    const many = raw.endsWith("[*]");
    const key = many ? raw.slice(0, -3) : raw;
    const next: unknown[] = [];
    for (const c of current) {
      if (!c || typeof c !== "object" || Array.isArray(c)) continue;
      const v = (c as Record<string, unknown>)[key];
      if (many) {
        if (Array.isArray(v)) next.push(...v);
      } else if (v !== undefined) next.push(v);
    }
    current = next;
  }
  return current.filter((v): v is string => typeof v === "string");
}

/** Exceções nomeadas do plano (§3): política de fingerprint, igual nos braços. */
export const NAMED_EXCEPTIONS: Array<{ path: RegExp; terms: string[]; why: string }> = [
  {
    path: /\.rule\.properties\.source\.enum\[\*\]$/,
    terms: ["emag", "e mag"],
    why: "valor do enum RuleSource no esquema Finding: os valores ficam para não quebrar o contrato (plano, decisão 8)",
  },
  {
    path: /\.normalizations\[\*\]$/,
    terms: ["ds-core-random-list-id", "angular-emulated-app-id"],
    why: "rótulo da política de fingerprint state-identity-1 (plano §3, decisão 9)",
  },
];

export type Classification = "eco" | "pagina" | "axe" | "excecao-nomeada" | "sem-explicacao";

export interface Provenance {
  /** Ferramenta cuja resposta é varrida (ou a superfície: "tools/list", "serverInfo"…). */
  tool: string;
  /** Argumentos da chamada, como objeto (o nome da ferramenta é `tool`). */
  args: unknown;
  /** Bytes servidos + DOM renderizado da página, quando a chamada é sobre uma página. */
  page: string | null;
  /** Bundle do axe-core. */
  axe: string;
}

function contains(haystack: string, hit: Hit): boolean {
  if (hit.kind === "exact") return haystack.includes(hit.term);
  return words(haystack).join(" ").includes(hit.term);
}

/** O termo é o valor inteiro (eco exato), não um pedaço dele. */
function sameValue(hit: Hit, value: string): boolean {
  if (hit.kind === "exact") return value.trim() === hit.term;
  return words(value).join(" ") === hit.term;
}

export function classify(hit: Hit, provenance: Provenance, normalizedWordCache?: Map<string, string>): { class: Classification; why: string } {
  const containsCached = (key: "page" | "axe", haystack: string) => {
    if (hit.kind === "exact") return haystack.includes(hit.term);
    let normalized = normalizedWordCache?.get(key);
    if (normalized === undefined) {
      normalized = ` ${words(haystack).join(" ")} `;
      normalizedWordCache?.set(key, normalized);
    }
    return normalized.includes(` ${hit.term} `);
  };
  for (const exception of NAMED_EXCEPTIONS) {
    if (exception.path.test(hit.path) && exception.terms.includes(hit.term)) return { class: "excecao-nomeada", why: exception.why };
  }
  if (hit.path === "$" && sameValue(hit, provenance.tool)) {
    return { class: "eco", why: `eco exato do nome da ferramenta chamada (${provenance.tool}) no texto de erro` };
  }
  const fields = TOOL_FIELDS[provenance.tool];
  if (!fields) return { class: "sem-explicacao", why: "" };
  for (const echo of fields.echo) {
    if (echo.path !== hit.path) continue;
    for (const argPath of echo.args) {
      if (argValues(provenance.args, argPath).some((v) => sameValue(hit, v))) {
        return { class: "eco", why: `eco exato do argumento ${argPath} no campo ${hit.path} de ${provenance.tool}` };
      }
    }
  }
  if (provenance.page !== null && fields.page.includes(hit.path) && containsCached("page", provenance.page)) {
    return { class: "pagina", why: `campo medido da página (${provenance.tool} ${hit.path}) e o termo existe nos bytes servidos/renderizados da página` };
  }
  if (fields.axe.includes(hit.path) && containsCached("axe", provenance.axe)) {
    return { class: "axe", why: `campo da saída do axe-core (${provenance.tool} ${hit.path}) e o termo existe no bundle do axe` };
  }
  return { class: "sem-explicacao", why: "" };
}

export interface ScanResult {
  hits: Array<Hit & { class: Classification; why: string }>;
}

/** Varre uma resposta (texto MCP) com a proveniência da chamada. */
export function scanResponse(dict: Dictionary, text: string, provenance: Provenance): ScanResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  const cache = new Map<string, string>();
  const hits: ScanResult["hits"] = [];
  for (const leaf of leaves(parsed)) {
    for (const hit of hitsInText(dict, leaf.text, leaf.path)) hits.push({ ...hit, ...classify(hit, provenance, cache) });
  }
  return { hits };
}

export { contains as termIn };
