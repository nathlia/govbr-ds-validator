/**
 * 3.7.3 (D-167, emenda-2): porta em JavaScript do segmentador da normalização do corpus literal
 * (`ds-rules/govbr-ds-3.7.0-corpus/normalizacao/tools/segmentar.py`, D-119) — blocos, sentenças e gatilhos de força —
 * para que a extração das unidades de especificação (scripts/kb-spec-units.mjs) parta dos MESMOS segmentos que a
 * normalização leu: o índice `k` de cada segmento é o do `reports/normalizacao/cobertura.json` servido, e o
 * extrator confere isso a cada execução (frase de `cobertura.json` com texto diferente do segmento k = falha).
 *
 * Diferenças de linguagem tratadas aqui, não de regra:
 *  - `\b` do Python é Unicode (letra acentuada é caractere de palavra); em JS `\b` é ASCII. Os padrões abaixo usam
 *    a fronteira Unicode explícita `B` (lookarounds sobre [\p{L}\p{N}_]).
 *  - Offsets: o Python conta pontos de código; o corpus dos componentes não tem caractere fora do BMP (o extrator
 *    confere), então o índice UTF-16 do JS é o mesmo.
 */
import { createHash } from "node:crypto";

const W = "[\\p{L}\\p{N}_]";
/** Fronteira de palavra Unicode (o `\b` do Python 3 em str). */
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
/** Compila um padrão escrito com `\b` do Python trocando-o pela fronteira Unicode. */
const rx = (source, flags = "giu") => new RegExp(source.replace(/\\b/g, B), flags);

// ── gatilhos de cobertura (lista do pedido, D-119) ──────────────────────────────────────────────
export const COBERTURA_RE = rx(
  String.raw`\b(deve|devem|deverá|deverão|deveria|deveriam|deve-se|evite|evitem|recomenda-se|utilize|utilizem|prefira|` +
    String.raw`obrigatóri[oa]s?)\b|\bé importante\b`,
  "iu",
);

const IMPERATIVOS =
  "use|utilize|utilizem|usem|adicione|associe|siga|permita|mantenha|garanta|certifique-se|forneça|inclua|coloque|" +
  "aplique|escreva|considere|defina|informe|indique|ofereça|posicione|exiba|mostre|apresente|disponibilize|" +
  "respeite|priorize|limite|agrupe|ordene|organize|trabalhe|adote|prefira|opte|insira|identifique|descreva|" +
  "explique|seja|sejam|procure|busque|reduza|alinhe|aplique|crie|evidencie|destaque|divida|faça|dê|deixe|" +
  "assegure|assegure-se|verifique|teste|valide|ajuste|reserve|empregue|combine|agrupe|explicite|utilize-o|" +
  "lembre-se|tenha|atente|atente-se|observe|escolha|substitua|sinalize|separe|marque|nomeie|evite|evitem|" +
  "acrescente|preserve|ofereça|vincule|declare|implemente|carregue|importe|instale|chame|inicialize|envolva|" +
  "esteja|fique|torne|acompanhe|altere|padronize|comunique|conduza|tente|reforce|fortaleça|preze|realce|" +
  "planeje|configure|numere|repare|determine|inverta|retire|realize|multiplique|formate|relacione|eduque|" +
  "oriente|pergunte|analise|atribua|guie|focalize|personalize|retorne|inicie|facilite|reutilize|ajude|" +
  "prepare|peça|sinta-se|confira|selecione|tome|evidencie|esclareça|resuma|simplifique|abrevie|adapte";

/** (força, padrão) — a tabela de força do plano D-119, na ordem do segmentador (a máscara depende dela). */
const PADROES = [
  ["prohibited", String.raw`\bnão\s+(?:se\s+)?(?:deve|devem|deverá|deverão|deve-se|deveria)\b`],
  ["prohibited", String.raw`\bnão\s+(?:utilize|utilizem|utilizar)\b`],
  ["prohibited", String.raw`\bnão\s+(?:use|usem|usar|coloque|inclua|crie|aplique|altere|misture|exiba|faça|adicione|` +
    String.raw`combine|insira|abuse|esconda|omita|empregue)\b`],
  ["prohibited", String.raw`\bnão\s+(?:se\s+)?(?:pode|podem|poderá|poderão)\b`],
  ["prohibited", String.raw`(?:^|[.;:!?]\s+)["“(]*não\s+(?!é\b|são\b|há\b|existe|existem|tem\b|têm\b|se\b|seja|sejam|` +
    String.raw`fique|esque[çc]a)[a-zà-ú]+(?:e|em|a|am)\b`],
  ["prohibited", String.raw`\b(?:nunca|jamais)(?:\s+[a-zà-ú-]+)?`],
  ["prohibited", String.raw`\b(?:é|são)\s+proibid[oa]s?\b|\bnão\s+(?:é|são)\s+permitid[oa]s?\b`],
  ["unclear", String.raw`\b(?:deve|devem|deverá|deverão|deve-se|devem-se)\s+(?:ser\s+)?evitad[oa]s?\b|` +
    String.raw`\b(?:deve|devem|deverá|deverão|deve-se)\s+evitar\b`],
  ["discouraged", String.raw`\bnão\s+(?:é|são)\s+recomendad[oa]s?\b|\bnão\s+recomendamos\b|\bnão\s+se\s+recomenda\b|` +
    String.raw`\bnão\s+é\s+recomendável\b`],
  ["discouraged", String.raw`\bevite\b|\bevitem\b`],
  ["discouraged", String.raw`\bevitar\b|\bevitando\b|\bevitad[oa]s?\b`],
  ["required", String.raw`\b(?:deve|devem|deverá|deverão|deve-se|devem-se|devendo)\b`],
  ["required", String.raw`\b(?:é|são)\s+obrigatóri[oa]s?\b`],
  ["required", String.raw`\bobrigatóri[oa]s?\b|\bobrigatoriamente\b`],
  ["required", String.raw`\b(?:é|são|será|se faz)\s+necessári[oa]s?\b|\bprecisa(?:m|rá|rão)?\b|\bé\s+preciso\b|` +
    String.raw`\b(?:tem|têm)\s+que\b|\bnecessita(?:m)?\b`],
  ["recommended", String.raw`\brecomenda-se\b|\bé importante\b|\butilize(?:m)?\b|\bprefira\b`],
  ["recommended", String.raw`\brecomend(?:ad[oa]s?|ável|áveis|amos|a)\b|\bsugere-se\b|\bsugerimos\b|\bsugerid[oa]\b|` +
    String.raw`\baconselh(?:a-se|ável|amos)\b|\bpreferencialmente\b|\bde preferência\b|\bideal(?:mente)?\b|` +
    String.raw`\bboa prática\b|\bimportante\b(?!\s*[:!])`],
  ["permitted", String.raw`\bpode(?:m)?(?:-se)?\b|\bpoderá\b|\bpoderão\b|\bé permitid[oa]\b|\bopcional(?:mente)?\b`],
].map(([force, source]) => [force, rx(source)]);

const IMPERATIVOS_SEGUROS =
  "certifique-se|utilize|utilizem|forneça|garanta|mantenha|ofereça|considere|adicione|associe|inclua|aplique|" +
  "posicione|priorize|disponibilize|evidencie|assegure|assegure-se|verifique|prefira|opte|insira|defina|permita|" +
  "procure|atente-se|lembre-se|explicite|sinalize|evite|evitem";
const IMPERATIVO_SEGURO_RE = new RegExp(`(?<![\\p{L}\\p{N}_-])(${IMPERATIVOS_SEGUROS})(?![\\p{L}\\p{N}_-])`, "giu");
const IMPERATIVO_RE = rx(String.raw`(?:^|[,;:]\s+|\.\s+|\be\s+)[*_` + "`" + String.raw`"“(]*(` + IMPERATIVOS + String.raw`)\b`);

/** Gatilhos de força de um trecho, como `classificar` do segmentador: {forces:Set, triggers:[[força, trecho]]}. */
export function classify(text) {
  const t = text.replace(/\s+/g, " ").replace(/[*_`]/g, "");
  const mask = [...t];
  const triggers = [];
  for (const [force, re] of PADROES) {
    const cur = mask.join("");
    re.lastIndex = 0;
    for (const m of cur.matchAll(re)) {
      if (m[0] === "") continue;
      triggers.push([force, m[0]]);
      // A máscara é por índice de caractere do Python (ponto de código): o texto não tem astral (conferido).
      for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = "\0";
    }
  }
  const cur = mask.join("");
  for (const m of [...cur.matchAll(IMPERATIVO_RE), ...cur.matchAll(IMPERATIVO_SEGURO_RE)]) {
    const verb = m[1].toLowerCase();
    if (verb === "evite" || verb === "evitem") continue;
    triggers.push(["recommended", m[1]]);
  }
  return { forces: new Set(triggers.map((x) => x[0])), triggers };
}

/** O texto tem algum gatilho de força ou de cobertura (o que fazia dele candidata na normalização). */
export function hasForceWord(text) {
  if (classify(text).forces.size) return true;
  return COBERTURA_RE.test(text.replace(/\s+/g, " ").replace(/[*_`]/g, ""));
}

// ── metadados (cabeçalho <!-- … --> do arquivo coletado) ──────────────────────────────────────
export function metadata(text) {
  const m = /^<!--([\s\S]*?)-->/.exec(text);
  const meta = {};
  if (!m) return { meta, start: 0 };
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i >= 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, start: m[0].length };
}

// ── blocos ────────────────────────────────────────────────────────────────────────────────────
const TITULO_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/u;
const ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+/u;
const CERCA_RE = /^\s*(```|~~~)/u;
const TABELA_RE = /^\s*\|/u;
const SEP_TABELA_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/u;
const IMAGEM_RE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/u;
/** Python `str.strip()` sem argumento: espaço Unicode. */
const strip = (s) => s.replace(/^\s+|\s+$/gu, "");

export const cleanHeading = (t) => strip(t.replace(/[*_`]/g, ""));

/** Blocos do arquivo a partir de `start`: {type, ini, fim, path:[[nível, título]], header?}. */
export function blocks(text, start) {
  const lines = [];
  let pos = 0;
  for (const piece of text.split(/(?<=\n)/)) {
    if (piece === "") continue;
    lines.push([pos, piece]);
    pos += piece.length;
  }
  let path = [];
  const n = lines.length;
  const out = [];
  const rstripNl = (s) => s.replace(/\n+$/, "");
  let i = 0;
  while (i < n) {
    const [p, l] = lines[i];
    if (p < start) {
      i += 1;
      continue;
    }
    const s = rstripNl(l);
    if (!strip(s)) {
      i += 1;
      continue;
    }
    const fence = CERCA_RE.exec(s);
    if (fence) {
      let j = i + 1;
      while (j < n && !strip(lines[j][1]).startsWith(fence[1])) j += 1;
      const fim = j < n ? lines[j][0] + lines[j][1].length : text.length;
      out.push({ type: "codigo", ini: p, fim, path: [...path] });
      i = j + 1;
      continue;
    }
    if (strip(s).startsWith("<!--")) {
      let j = i;
      while (j < n && !lines[j][1].includes("-->")) j += 1;
      const fim = j < n ? lines[j][0] + lines[j][1].length : text.length;
      out.push({ type: "comentario", ini: p, fim, path: [...path] });
      i = j + 1;
      continue;
    }
    const mt = TITULO_RE.exec(s);
    if (mt) {
      const level = mt[1].length;
      path = [...path.filter((c) => c[0] < level), [level, cleanHeading(mt[2])]];
      out.push({ type: "titulo", ini: mt[2] ? p + s.indexOf(mt[2]) : p, fim: p + s.length, path: [...path] });
      i += 1;
      continue;
    }
    if (TABELA_RE.test(s)) {
      if (!SEP_TABELA_RE.test(s)) {
        const ini = p + s.indexOf("|");
        const header = i + 1 < n && SEP_TABELA_RE.test(lines[i + 1][1].replace(/\s+$/u, ""));
        out.push({ type: "tabela", ini, fim: p + s.replace(/\s+$/u, "").length, path: [...path], header, line: i + 1 });
      }
      i += 1;
      continue;
    }
    if (IMAGEM_RE.test(s)) {
      i += 1;
      continue;
    }
    const mi = ITEM_RE.exec(s);
    if (mi) {
      const ini = p + mi[0].length;
      let j = i + 1;
      while (j < n) {
        const sj = rstripNl(lines[j][1]);
        if (!strip(sj) || ITEM_RE.test(sj) || TITULO_RE.test(sj) || CERCA_RE.test(sj) || TABELA_RE.test(sj)) break;
        j += 1;
      }
      const fim = lines[j - 1][0] + rstripNl(lines[j - 1][1]).length;
      out.push({ type: "item", ini, fim, path: [...path] });
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < n) {
      const sj = rstripNl(lines[j][1]);
      if (!strip(sj) || ITEM_RE.test(sj) || TITULO_RE.test(sj) || CERCA_RE.test(sj) || TABELA_RE.test(sj) || strip(sj).startsWith("<!--")) break;
      j += 1;
    }
    let ini = p + (s.length - s.replace(/^\s+/u, "").length);
    if (s.replace(/^\s+/u, "").startsWith(">")) ini = p + s.indexOf(">") + 1;
    const fim = lines[j - 1][0] + rstripNl(lines[j - 1][1]).length;
    out.push({ type: "paragrafo", ini, fim, path: [...path] });
    i = j;
  }
  return out;
}

const ABREV = /(?:(?<![\p{L}\p{N}_])(?:ex|Ex|p|pág|págs|Sr|Sra|Dr|nº|n|aprox|vs|obs|Obs|e\.g|i\.e|cf|Cf|art|fig|Fig|min|máx|mín|séc|tel|etc\.\)|a\.C|d\.C))\.$/u;
const FRONTEIRA = /(?<=[.!?;…])["”')\]*_]*\s+(?=["“'(\[*_`]*[A-ZÀ-ÝÉÊÓÔÚÍÇ])/gu;

/** Sentenças de text[ini:fim] → [[ini, fim]]. */
export function sentences(text, ini, fim) {
  const chunk = text.slice(ini, fim);
  const cuts = [0];
  for (const m of chunk.matchAll(FRONTEIRA)) {
    const before = chunk.slice(0, m.index);
    const last = /\S+$/u.exec(before);
    if (last && ABREV.test(last[0])) continue;
    cuts.push(m.index + m[0].length);
  }
  cuts.push(chunk.length);
  const out = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const seg = chunk.slice(cuts[k], cuts[k + 1]);
    const l = seg.length - seg.replace(/^\s+/u, "").length;
    const r = seg.replace(/\s+$/u, "").length;
    if (r > l) out.push([ini + cuts[k] + l, ini + cuts[k] + r]);
  }
  return out;
}

/** Segmentos do arquivo, numerados como na normalização (k = ordem). */
export function segment(raw) {
  const text = raw.toString("utf8");
  const { meta, start } = metadata(text);
  const segs = [];
  for (const b of blocks(text, start)) {
    const section = b.path.map((c) => c[1]).join(" > ");
    const leaf = b.path.length ? b.path[b.path.length - 1][1] : null;
    const parts = ["titulo", "tabela", "codigo", "comentario"].includes(b.type) ? [[b.ini, b.fim]] : sentences(text, b.ini, b.fim);
    for (const [a, z] of parts) {
      segs.push({ k: segs.length, type: b.type, header: Boolean(b.header), ini: a, fim: z, section, leaf, path: b.path, text: text.slice(a, z), ...(b.line ? { line: b.line } : {}) });
    }
  }
  return { meta, text, sha256: createHash("sha256").update(raw).digest("hex"), segments: segs };
}

// ── convenções de texto da normalização (montar.py) ─────────────────────────────────────────
export function limpar(t) {
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/<(https?:\/\/[^>]+)>/g, "$1");
  t = t.replace(/[*_`]/g, "");
  t = strip(t.replace(/\s+/gu, " "));
  t = t.replace(/^\|\s*|\s*\|$/g, "");
  t = t.replace(/\s*\|\s*/g, " | ");
  t = t.replace(/;+$/, "").replace(/\s+$/u, "");
  if (t && !".!?:)".includes(t[t.length - 1])) t += ".";
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function tituloDe(t) {
  t = limpar(t).replace(/\.+$/, "");
  if ([...t].length <= 90) return t;
  const head = t.slice(0, 90);
  const i = head.lastIndexOf(" ");
  return (i >= 0 ? head.slice(0, i) : head) + "…";
}

export function kebab(s) {
  const ascii = (s ?? "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "");
  return ascii.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || null;
}

/** Estratégia de verificação pela heurística de palavras-chave da normalização (automationConfidence: low). */
export function estrategia(t, categoria) {
  const b = limpar(t).toLowerCase();
  const test = (src) => rx(src, "u").test(b);
  if (test(String.raw`\btecla|teclado|\btab\b|\bfoco\b|\bfocus|\benter\b|\bspace\b|\besc\b|setas?\b`)) return ["keyboard-interaction", true];
  if (test(String.raw`aria-|\batributo|\btag\b|<[a-z]|\brole\b|\balt\b|\bhtml\b|\belemento\b|\bid\b|\blabel\b|\bsem[aâ]ntic`)) return ["dom", true];
  if (test(String.raw`\bcor(es)?\b|contraste|\bpx\b|pixels|espaçamento|\bmargem|\baltura|\blargura|\btamanho|\bfonte\b|\btipografia|\bpeso\b|\bsombra|\bopacidade|\bgrid\b|\bcoluna|\bbreakpoint|\bícone`)) return ["computed-style", true];
  if (categoria === "development" && test(String.raw`\bclasse|\bclass\b|\bcss\b|javascript|\bjs\b|\bnpm\b|import|\bscss|\bsass|\bm[eé]todo|\bevento`)) return ["source-code", true];
  return ["semantic", false];
}

export function pageTitle(text) {
  const m = /^#\s+(.+)$/mu.exec(text);
  return m ? limpar(m[1]).replace(/\.+$/, "") : null;
}
