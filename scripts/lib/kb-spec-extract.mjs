/**
 * 3.7.3 (D-167, emenda-2 da base literal 3.7.0): extração MECÂNICA das unidades de especificação.
 *
 * Entrada: o corpus literal arquivado em data/knowledge/versions/<versão>/corpus/ (as páginas de designer e de
 * desenvolvedor dos 36 componentes), o rules.jsonl servido (para não repetir texto que já é unidade) e o
 * reports/normalizacao/cobertura.json da mesma versão (o destino que a normalização deu a cada frase com gatilho).
 * Saída: unidades `force: "especificacao"` — texto literal do arquivo, com proveniência (arquivo, linha, seção,
 * charRange, sha256 do arquivo), nunca reescritas como obrigação — e a representação das tabelas por linha
 * (parte do componente → propriedade → token/valor).
 *
 * As regras abaixo (RULES) são a definição inteira: nenhuma unidade é escrita à mão, nenhuma lista por componente.
 * A segmentação é a da normalização (lib/kb-segment.mjs, porta conferida contra cobertura.json).
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classify, COBERTURA_RE, estrategia, kebab, limpar, segment, tituloDe } from "./kb-segment.mjs";

export const SPEC_FORCE = "especificacao";
export const CAPTURE_TYPE = "literal-corpus-specification";
export const EXTRACTOR_VERSION = "kb-spec-extract/1.1.0";

/** Títulos de faceta de especificação (comparados sem acento/caixa, sem o que vem entre parênteses/colchetes). */
export const SPEC_FACETS = [
  "tipografia", "iconografia", "cor", "cores", "espacamento", "espacamentos", "dimensao", "dimensoes", "sombra",
  "borda", "arredondamento", "alinhamento", "alinhamentos", "elevacao", "opacidade", "movimento", "superficie",
  "densidade", "escala", "estado",
];
/**
 * Seções que não descrevem comportamento nem anatomia do componente (uso, conteúdo, instalação). 1.1.0 (revisão
 * independente): valem em QUALQUER nível de título do caminho (não só no nível 2): "### Tom de Voz do Accordion" sob
 * "## Anatomia" é orientação de escrita. Título igual ao nome, ou que começa pelo nome seguido de espaço.
 */
export const SENTENCE_EXCLUDED_SECTIONS = [
  "uso", "uso alternativo", "melhores praticas", "tom e voz", "tom de voz", "dependencias", "proximos passos", "referencias",
  "instanciacao do componente", "codigo basico",
];
/**
 * Motivos de exclusão da normalização (cobertura.json) que dizem "descritivo, não é regra". 1.1.0: + 'usuario' (o que
 * o usuário faz com o componente — "o usuário pode clicar no nome do arquivo para abri-lo": comportamento descrito).
 */
export const DESCRIPTIVE_EXCLUSIONS = ["info", "definicao", "usuario"];
/**
 * Primeira palavra que faz da frase um remetimento (a figura, a seção, outra página), não uma descrição. 1.1.0: as formas
 * no infinitivo ("Consultar …", "Acessar …").
 */
export const REFERENCE_OPENERS = ["veja", "consulte", "consultar", "confira", "conferir", "acesse", "acessar", "saiba", "clique", "clicar", "leia", "ler", "conheca", "visite", "seguem", "segue"];
/** 1.1.0: trecho em qualquer posição que faz da frase um remetimento. */
export const REFERENCE_PHRASES = ["para saber mais", "para mais informacoes", "para mais detalhes", "a seguir", "abaixo seguem", "abaixo segue"];
/**
 * 1.1.0 (revisão independente): instrução no infinitivo, que a tabela de força da normalização não pega ("Não exceder uma
 * linha de texto.", "Usar Utilitários CSS…", "Informar apenas a data…", "Incluir manualmente…", "Atentar-se…"): a frase
 * cuja 1ª palavra (depois do rótulo inicial e de um "Não") é um destes verbos fica fora.
 */
export const INSTRUCTION_INFINITIVES = [
  "usar", "utilizar", "incluir", "informar", "exceder", "atentar", "atentarse", "adicionar", "inserir", "definir", "aplicar",
  "colocar", "manter", "seguir", "evitar", "preencher", "verificar", "observar", "garantir", "instanciar", "importar",
  "chamar", "declarar", "configurar", "passar", "criar", "ver",
];
/** 1.1.0: palavras de obrigação sem o verbo que a tabela da normalização exige ("Necessário …", "Obrigatóro"/"Obrigatótio"). */
export const OBLIGATION_WORDS = /(?<![\p{L}])(necessari[oa]s?|obrigat[a-z]*)(?![\p{L}])/iu;
/** 1.1.0: legenda = sentença inteira entre * ou _ com menos de CAPTION_MAX_WORDS palavras; mais longa é descrição em itálico. */
export const CAPTION_MAX_WORDS = 8;
export const MIN_WORDS = 5;

/** As regras, literais, como vão para a emenda e para o relatório (D-167: "quais construções qualificam"). */
export const RULES = [
  {
    id: "T1",
    what: "linha de tabela de especificação",
    text:
      "Em componentes/<componente>__designer.md ou __desenvolvedor.md, cada linha de corpo (nem a de cabeçalho nem a delimitadora) " +
      "de uma tabela Markdown (linhas contíguas iniciadas por '|', a 2ª sendo a delimitadora '|---|') que está na região de " +
      "Especificações: sob o título de nível 2 'Especificações', ou sob um título de nível 2 posterior a ele, no mesmo arquivo, " +
      "cujo texto (sem acento, caixa e o que vem entre parênteses/colchetes) é uma faceta de especificação (" + SPEC_FACETS.join(", ") +
      ") — a região acaba no primeiro título de nível 2 que não é faceta. originalText = a linha, do primeiro ao último '|'. " +
      "A 1ª coluna é a parte do componente; cada outra coluna não vazia é uma entrada {coluna, propriedade, valor, tokens}: " +
      "propriedade = o valor da coluna 'Property'/'Propriedade' da linha, quando a tabela tem essa coluna, senão o nome da coluna; " +
      "tokens = os nomes '--…' do valor. Linha sem nenhum valor fora da 1ª coluna e da coluna Property não vira unidade.",
  },
  {
    id: "S1",
    what: "frase descritiva sem palavra de força",
    text:
      "Em componentes/<componente>__designer.md ou __desenvolvedor.md, cada sentença (segmentação da normalização: blocos de parágrafo " +
      "e de item de lista, cortados em sentenças) sob um título de nível 2 (sentença sem título de nível 2 — a introdução da página — " +
      "fica fora), sem nenhum título no caminho (nível 2 ou mais fundo) igual a, ou começando por, um de: " + SENTENCE_EXCLUDED_SECTIONS.join(", ") +
      " (sem acento/caixa), que NÃO tem gatilho de força da tabela da normalização (D-119: classificar() e os gatilhos de cobertura " +
      "deve/devem/evite/recomenda-se/é importante/utilize/prefira/obrigatório e variantes, imperativos inclusos) nem palavra de obrigação " +
      "solta (necessário/a, obrig…), e tem a forma de declaração: ao menos " + MIN_WORDS + " palavras; não termina em '?' nem em ':' " +
      "(pergunta, introdução de lista); não é legenda (sentença inteira entre * ou _ com menos de " + CAPTION_MAX_WORDS + " palavras); " +
      "a 1ª palavra — depois de um rótulo inicial '<Palavra>:' (ex.: 'OBS:', 'Importante:') e de um 'Não', se houver — não é " +
      "'Exemplo…', nem um remetimento (" + REFERENCE_OPENERS.join(", ") + "), nem uma instrução no infinitivo (" + INSTRUCTION_INFINITIVES.join(", ") +
      "); e não contém um remetimento (" + REFERENCE_PHRASES.join(", ") + ").",
  },
  {
    id: "S2",
    what: "frase com gatilho que a normalização julgou descritiva",
    text:
      "Mesmos arquivos, seções e forma de S1, para a sentença que TEM gatilho de força mas que a normalização excluiu com motivo " +
      DESCRIPTIVE_EXCLUSIONS.map((m) => `'${m}'`).join(" ou ") + " (reports/normalizacao/cobertura.json, excluidas[].motivo): texto " +
      "descritivo (info, definicao) ou o que o usuário faz com o componente (usuario), sem obrigação/recomendação de projeto, pelo " +
      "julgamento já registrado e auditado da normalização. A palavra de obrigação solta não exclui aqui (o gatilho já foi julgado).",
  },
  {
    id: "X1",
    what: "sem duplicar a base",
    text:
      "Fica fora o trecho que se sobrepõe (charRange no mesmo arquivo) a uma unidade que já está no rules.jsonl servido: aquele " +
      "texto já é citável com a força que a normalização lhe deu.",
  },
  {
    id: "ID",
    what: "id e campos",
    text:
      "id = govbr-3.7.0-<categoria>-<componente>-<12 hex de sha256(Caminho-fonte + originalText)>, sufixo -n em colisão (o esquema da " +
      "normalização); categoria = component (designer) ou development (desenvolvedor); force = especificacao; normalizedRule = o " +
      "trecho sem marcação Markdown (limpar() da normalização, não é paráfrase); title = o começo dele; validationStrategy/automatable " +
      "pela mesma heurística de palavras-chave (automationConfidence: low); relatedTokens = os nomes '--…' do trecho.",
  },
];

const fold = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const facetKey = (heading) => fold(heading.replace(/\(.*?\)|\[.*?\]/g, ""));
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const TOKEN_RE = /--[a-z0-9][a-z0-9-]*/gi;
const plainCell = (c) => c.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

/** Células de uma linha de tabela Markdown ("| a | b |" → ["a", "b"]), cruas (aparadas). */
export function cells(row) {
  const t = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

/** Região de Especificações por título de nível 2: Set dos índices de h2 que a compõem (ver T1). */
function specRegionH2(segments) {
  const h2 = segments.filter((s) => s.type === "titulo" && s.path.length && s.path[s.path.length - 1][0] === 2);
  const inside = new Set();
  let open = false;
  for (const h of h2) {
    const title = h.path[h.path.length - 1][1];
    if (fold(title) === "especificacoes") open = true;
    else if (open && !SPEC_FACETS.includes(facetKey(title))) open = false;
    if (open) inside.add(title);
  }
  return inside;
}
const h2Of = (seg) => seg.path.find((c) => c[0] === 2)?.[1] ?? null;

function lineOf(text, offset) {
  let n = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Extrai as unidades. `rules` = registros do rules.jsonl servido SEM as unidades de especificação (a base sobre a
 * qual a emenda se aplica); `coverage` = cobertura.json.
 */
export function extractSpecUnits({ corpusDir, rules, coverage }) {
  const covered = new Map(); // corpusFile → [[a, z]]
  for (const r of rules) {
    const f = r.source?.corpusFile;
    if (typeof f !== "string" || !Array.isArray(r.source.charRange)) continue;
    if (!covered.has(f)) covered.set(f, []);
    covered.get(f).push(r.source.charRange);
  }
  const excluded = new Map(); // corpusFile → Map(k → motivo)
  for (const a of coverage.arquivos) excluded.set(a.arquivo, new Map((a.excluidas ?? []).filter((e) => typeof e.k === "number").map((e) => [e.k, e.motivo])));
  const usedIds = new Set(rules.map((r) => r.id));

  const files = readdirSync(join(corpusDir, "componentes")).filter((f) => /__(designer|desenvolvedor)\.md$/.test(f)).sort();
  const units = [];
  const tables = [];
  const skipped = { T1: { overlap: 0, empty: 0 }, S: { overlap: 0, section: 0, noH2: 0, force: 0, shape: 0 } };
  for (const name of files) {
    const rel = `componentes/${name}`;
    const raw = readFileSync(join(corpusDir, rel));
    const { meta, text, sha256: fileSha, segments } = segment(raw);
    if (/[\u{10000}-\u{10FFFF}]/u.test(text)) throw new Error(`${rel}: caractere fora do BMP — offsets do JS ≠ os da normalização`);
    if (meta["Status da coleta"] !== "ok") continue;
    const [component, tab] = name.replace(/\.md$/, "").split("__");
    const category = tab === "designer" ? "component" : "development";
    const locator = meta["Caminho-fonte"];
    const h1 = segments.find((s) => s.type === "titulo" && s.path.length === 1);
    const pageTitle = h1 ? limpar(text.slice(h1.ini, h1.fim)).replace(/\.+$/, "") : null;
    const overlaps = (a, z) => (covered.get(rel) ?? []).some(([x, y]) => a < y && x < z);
    const region = specRegionH2(segments);
    const exclusions = excluded.get(rel) ?? new Map();

    // Conferência da porta: toda frase da cobertura bate com o segmento k (o texto da cobertura pode vir cortado em 300).
    const cov = coverage.arquivos.find((x) => x.arquivo === rel);
    if (cov && cov.sha256 !== fileSha) throw new Error(`${rel}: sha256 do arquivo ≠ o da cobertura.json`);
    for (const f of [...(cov?.frases ?? []), ...(cov?.excluidas ?? [])]) {
      if (typeof f.k !== "number") continue;
      const norm = (s) => s.replace(/\s+/g, " ").trim();
      const seg = segments[f.k];
      if (!seg || !norm(seg.text).startsWith(norm(f.texto))) throw new Error(`${rel} k=${f.k}: segmentação difere da cobertura.json`);
    }

    const makeUnit = (seg, ruleId, extra) => {
      const originalText = seg.text;
      const h = sha256(Buffer.from(locator + originalText, "utf8")).slice(0, 12);
      let id = `govbr-3.7.0-${category}-${component}-${h}`;
      for (let n = 2; usedIds.has(id); n++) id = `govbr-3.7.0-${category}-${component}-${h}-${n}`;
      usedIds.add(id);
      const [strategy, automatable] = estrategia(originalText, category);
      const leaf = seg.leaf;
      return {
        id,
        dsVersion: "3.7.0",
        status: "stable",
        standard: "gov.br Design System",
        standardVersion: "3.7.0",
        category,
        subcategory: kebab(leaf),
        component,
        title: tituloDe(originalText),
        originalText,
        originalTextMode: "verbatim",
        normalizedRule: limpar(originalText),
        force: SPEC_FORCE,
        rationale: null,
        conditions: [],
        exceptions: [],
        expectedEvidence: [],
        validationStrategy: strategy,
        automatable,
        automationConfidence: "low",
        relatedTokens: [...new Set(originalText.match(TOKEN_RE) ?? [])],
        relatedComponents: [],
        wcagReferences: [],
        emagReferences: [],
        notes: [`emenda-2 (D-167): unidade de especificação pela regra ${ruleId} (${EXTRACTOR_VERSION}); descreve o componente, não obriga nem proíbe`],
        source: {
          url: meta.URL,
          pageTitle,
          tab,
          section: leaf,
          sectionPath: seg.section,
          retrievedAt: "2026-10-15",
          contentHash: fileSha,
          locator,
          commit: meta.Commit,
          corpusFile: rel,
          charRange: [seg.ini, seg.fim],
          line: lineOf(text, seg.ini),
          captureType: CAPTURE_TYPE,
        },
        specification: { rule: ruleId, ...extra },
      };
    };

    // ── T1: tabelas da região de Especificações ──
    let table = null;
    for (const seg of segments) {
      if (seg.type !== "tabela") {
        table = null;
        continue;
      }
      const h2 = h2Of(seg);
      if (!h2 || !region.has(h2)) {
        table = null;
        continue;
      }
      if (seg.header) {
        const columns = cells(seg.text).map(plainCell);
        const propCol = columns.findIndex((c, i) => i > 0 && /^(property|propriedade)$/i.test(c));
        table = {
          id: `${rel}#L${lineOf(text, seg.ini)}`,
          component,
          corpusFile: rel,
          line: lineOf(text, seg.ini),
          headingPath: seg.section,
          facet: seg.leaf,
          columns,
          propertyColumn: propCol >= 0 ? columns[propCol] : null,
          header: seg.text,
          rows: [],
        };
        tables.push(table);
        continue;
      }
      if (!table) continue; // corpo sem cabeçalho reconhecido: não é tabela Markdown bem formada
      const row = cells(seg.text);
      const propIdx = table.propertyColumn ? table.columns.indexOf(table.propertyColumn) : -1;
      const entries = [];
      row.forEach((value, i) => {
        if (i === 0 || i === propIdx || !value) return;
        const column = table.columns[i] ?? `col${i + 1}`;
        entries.push({ column, property: propIdx >= 0 ? plainCell(row[propIdx] ?? "") || column : column, value: plainCell(value), tokens: [...new Set(value.match(TOKEN_RE) ?? [])] });
      });
      if (!entries.length) {
        skipped.T1.empty++;
        continue;
      }
      if (overlaps(seg.ini, seg.fim)) {
        skipped.T1.overlap++;
        continue;
      }
      const part = plainCell(row[0] ?? "");
      const unit = makeUnit(seg, "T1", { kind: "table-row", table: table.id, facet: table.facet, columns: table.columns, part, entries });
      units.push(unit);
      table.rows.push({ unitId: unit.id, line: unit.source.line, part, entries });
    }

    // ── S1/S2: frases descritivas ──
    for (const seg of segments) {
      if (seg.type !== "paragrafo" && seg.type !== "item") continue;
      const h2 = h2Of(seg);
      if (!h2) {
        skipped.S.noH2++;
        continue;
      }
      const excludedHeading = seg.path.some(
        ([level, title]) => level >= 2 && SENTENCE_EXCLUDED_SECTIONS.some((name) => fold(title) === name || fold(title).startsWith(name + " ")),
      );
      if (excludedHeading) {
        skipped.S.section++;
        continue;
      }
      const flat = seg.text.replace(/\s+/g, " ").replace(/[*_`]/g, "");
      const trigger = classify(seg.text).forces.size > 0 || COBERTURA_RE.test(flat);
      let ruleId = null;
      if (!trigger && !OBLIGATION_WORDS.test(fold(flat))) ruleId = "S1";
      else if (DESCRIPTIVE_EXCLUSIONS.includes(exclusions.get(seg.k))) ruleId = "S2";
      if (!ruleId) {
        skipped.S.force++;
        continue;
      }
      const plain = limpar(seg.text);
      const words = plain.split(/\s+/).filter((w) => /\p{L}/u.test(w));
      const raw = seg.text.trim();
      // 1ª palavra depois de um rótulo inicial "<Palavra>:" (OBS:, Importante:, Atenção:) e de um "Não", se houver.
      let at = /^\p{L}+:$/u.test(words[0] ?? "") ? 1 : 0;
      if (fold(words[at] ?? "").replace(/[^a-z]/g, "") === "nao") at += 1;
      const first = fold(words[at] ?? "").replace(/[^a-z]/g, "");
      const caption = /^(\*[^*][\s\S]*\*|_[^_][\s\S]*_)$/.test(raw) && words.length < CAPTION_MAX_WORDS;
      const shapeOk =
        words.length >= MIN_WORDS &&
        !/[?:]\s*$/.test(raw.replace(/[*_]+$/, "")) &&
        !caption &&
        !first.startsWith("exemplo") &&
        !REFERENCE_OPENERS.includes(first) &&
        !INSTRUCTION_INFINITIVES.includes(first) &&
        !REFERENCE_PHRASES.some((p) => fold(plain).includes(p));
      if (!shapeOk) {
        skipped.S.shape++;
        continue;
      }
      if (overlaps(seg.ini, seg.fim)) {
        skipped.S.overlap++;
        continue;
      }
      units.push(makeUnit(seg, ruleId, { kind: "sentence" }));
    }
  }
  return { units, tables: tables.filter((t) => t.rows.length), skipped };
}

/** Contagens da emenda (manifest, relatório). */
export function specCounts(units, tables) {
  const by = (pick) => {
    const out = {};
    for (const u of units) out[pick(u)] = (out[pick(u)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  };
  const byComponent = {};
  for (const u of units) {
    const c = (byComponent[u.component] ??= { tableRows: 0, sentences: 0, tables: 0 });
    if (u.specification.kind === "table-row") c.tableRows++;
    else c.sentences++;
  }
  for (const t of tables) byComponent[t.component].tables++;
  return {
    units: units.length,
    tables: tables.length,
    tableRows: units.filter((u) => u.specification.kind === "table-row").length,
    sentences: units.filter((u) => u.specification.kind === "sentence").length,
    byRule: by((u) => u.specification.rule),
    byTab: by((u) => u.source.tab),
    components: Object.keys(byComponent).length,
    byComponent: Object.fromEntries(Object.entries(byComponent).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
  };
}

/** sha256 das unidades geradas (uma linha JSON por unidade) — o que a emenda declarada fixa. */
export const unitsSha256 = (units) => sha256(units.map((u) => JSON.stringify(u)).join("\n") + "\n");
