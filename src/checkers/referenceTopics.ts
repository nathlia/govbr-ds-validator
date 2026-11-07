/** A7: assunto da referência secundária, nunca aplicabilidade ou equivalência de obrigação. */
import type { KnowledgeRule } from "../data/knowledge.js";

export const REFERENCE_TOPICS_VERSION = "emag-reference-topics/1.0.0";
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ");
const every = (...patterns: RegExp[]) => (text: string) => patterns.every(p => p.test(text));
const heading = /cabecalh|titulo|\bh[1-6]\b/;
const content = /vazi[oa]s?|(?:deve|precisa|obrigatori).{0,80}(?:conter|ter|apresentar).{0,30}(?:texto|conteudo)|texto descritivo/;
type Topic = { help: RegExp; query: string; accepts(text: string): boolean };

/**
 * Âncoras textuais do assunto do check. Consultas fixas descrevem esse assunto em PT,
 * sem mudar pesos/vocabulário/ranking do get_ds_rules e sem ids de tela ou referência.
 */
const TOPICS: Record<string, Topic> = {
  "empty-table-header": {
    help: /header|cabecalh/,
    query: "célula de cabeçalho texto vazio",
    accepts: every(/tabel|celula|\bth\b/, /cabecalh|\bth\b/, content),
  },
  "empty-heading": {
    help: /heading|cabecalh|titulo/,
    query: "cabeçalhos títulos texto vazio",
    accepts: every(heading, content),
  },
  "heading-order": {
    help: /heading|cabecalh|titulo/,
    query: "níveis de cabeçalho H1 H6 hierárquica",
    accepts: every(heading, /hierarqu|niveis|ordem/),
  },
  "page-has-heading-one": {
    help: /heading|cabecalh|titulo|\bh1\b/,
    query: "H1 conteúdo principal",
    accepts: every(/\bh1\b/, /principal|niveis|cabecalh/),
  },
  "label-title-only": {
    help: /label|rotulo|etiqueta/,
    query: "rótulo etiqueta LABEL campo",
    accepts: every(/label|rotulo|etiqueta/, /campo|\binput\b|formul/),
  },
  "landmark-one-main": {
    help: /landmark|regiao|\bmain\b/,
    query: "MAIN região principal única",
    accepts: every(/\bmain\b|regiao principal/, /principal|\bmain\b/),
  },
  region: {
    help: /landmark|regi|conteudo/,
    query: "áreas de informação divisão de conteúdo",
    accepts: text => /areas? de informacao|divisao de conteudo|regioes?/.test(text) &&
      !/rodape|banner|contentinfo|complementary/.test(text),
  },
  "skip-link": {
    help: /skip|salto|ancora|destino/,
    query: "âncoras links relevantes mesma página",
    accepts: every(/ancora|link/, /apont|destin|alvo/),
  },
  tabindex: {
    help: /tabindex/,
    query: "tabindex semântica correta",
    accepts: every(/\btabindex\b/),
  },
  "focus-order-semantics": {
    help: /focus|foco|role|papel/,
    query: "papel role ordem de foco",
    accepts: every(/role|papel/, /foco|tabula/),
  },
};

export function referenceTopic(ruleId: string, help: string, pool: KnowledgeRule[]) {
  const topic = Object.hasOwn(TOPICS, ruleId) ? TOPICS[ruleId] : undefined;
  if (!topic || !topic.help.test(plain(help))) return null;
  return { query: topic.query, candidates: pool.filter(r =>
    (r.force === "required" || r.force === "prohibited") && topic.accepts(plain(r.originalText))) };
}
