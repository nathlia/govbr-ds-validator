/**
 * Detector de vazamento de conhecimento do DS/e-MAG em respostas MCP (2.14.0, NAT-61, plano §5.2).
 *
 * É um detector AUXILIAR: a garantia por construção é a trava de carregamento (src/data/lock.ts).
 * Ele procura, em cada folha de texto de cada resposta, termos de um dicionário gerado do `data/`
 * desta versão (nunca escrito à mão) e classifica cada ocorrência:
 *
 *   - `eco`: o termo está nos argumentos que o próprio chamador enviou nesta chamada (ex.: um id de
 *     regra que o agente citou e o portão repete). Não é enriquecimento do servidor.
 *   - `pagina`: a folha está num campo medido da página (snippet, outerHTML, localizador, texto
 *     observado…) E o termo existe nos bytes servidos/renderizados DESSA página. Classes `br-*` e
 *     textos da tela estão lá.
 *   - `axe`: a folha está num campo que reproduz a saída do axe-core E o termo existe no bundle do axe.
 *   - `excecao-nomeada`: as normalizações de fingerprint declaradas no plano (§3).
 *   - `sem-explicacao`: qualquer outra ocorrência. O aceite do perfil knowledge-free é zero.
 *
 * Não há subtração global: um termo da página só é perdoado num campo de página, e cada perdão sai no
 * relatório com o caminho e a justificativa.
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

/** Campos medidos da página: só neles um termo presente na página é perdoado. */
export const PAGE_FIELDS = new Set([
  "snippet",
  "outerHTML",
  "locator",
  "selector",
  "selectors",
  "evidenceSelectors",
  "axeScope",
  "url",
  "page",
  "path",
  "text",
  "title",
  "message",
  "activeDescription",
  "nextTarget",
  "observed",
  "detail",
  "visibleText",
  "name",
  "description",
]);

/** Campos que reproduzem a saída do axe-core (id, help, helpUrl, tags, failureSummary). */
export const AXE_FIELDS = new Set(["id", "ruleId", "description", "expected", "observed", "helpUrl", "axeTags", "representative"]);

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
  /** Argumentos da chamada, serializados. */
  args: string;
  /** Bytes servidos + DOM renderizado da página, quando a chamada é sobre uma página. */
  page: string | null;
  /** Bundle do axe-core. */
  axe: string;
}

function contains(haystack: string, hit: Hit): boolean {
  if (hit.kind === "exact") return haystack.includes(hit.term);
  return words(haystack).join(" ").includes(hit.term);
}

const lastKey = (path: string) => path.replace(/\[\*\]/g, "").split(".").pop() ?? "";

export function classify(hit: Hit, provenance: Provenance, normalizedWordCache?: Map<string, string>): { class: Classification; why: string } {
  const containsCached = (key: "page" | "axe" | "args", haystack: string) => {
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
  if (containsCached("args", provenance.args)) return { class: "eco", why: "o termo está nos argumentos enviados pelo chamador nesta chamada" };
  const key = lastKey(hit.path);
  if (provenance.page !== null && PAGE_FIELDS.has(key) && containsCached("page", provenance.page)) {
    return { class: "pagina", why: `campo medido da página (${key}) e o termo existe nos bytes servidos/renderizados da página` };
  }
  if (AXE_FIELDS.has(key) && containsCached("axe", provenance.axe)) {
    return { class: "axe", why: `campo da saída do axe-core (${key}) e o termo existe no bundle do axe` };
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
