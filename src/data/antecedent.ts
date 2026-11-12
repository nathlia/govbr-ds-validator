/**
 * 3.7.11 (auditoria A/A2, conserto 2; A-10): a cláusula que começa por referência anafórica ("Esta funcionalidade deve ser
 * informada…") chegava sem o referente — o agente não sabia que "esta funcionalidade" é arrastar arquivos. O referente é a
 * unidade da base imediatamente anterior na MESMA seção do mesmo arquivo do corpus (pelo charRange), lida da própria base;
 * vai junto com o id dela, como a frase da exceção do botão (icon-only-embedded). Nada é inventado nem resumido.
 *
 * Revisão (MED 2): a unidade anterior da base nem sempre é a frase anterior — entre as duas pode haver texto que não virou
 * cláusula (outro parágrafo, imagem, tabela), e aí o referente sai errado. Só se anexa quando as duas são ADJACENTES no
 * corpus: entre o fim de uma e o começo da outra só há espaço em branco ou marcação de lista/ênfase. Senão, nada.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getKnowledgeBase } from "./knowledge.js";

const plain = (t: string) => t.replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Demonstrativo em qualquer posição ("Esta funcionalidade…", "…sobre este comportamento", "tal…"). */
export const ANAPHORIC = /(^|[^\p{L}])(est[ae]s?|ess[ae]s?|isso|isto|nest[ae]s?|ness[ae]s?|dest[ae]s?|dess[ae]s?|tal|tais)(?![\p{L}])/iu;
/** Demonstrativo no começo da cláusula (depois de um "Atenção:" eventual): a cláusula sozinha não diz a que se refere. */
export const LEADING_ANAPHORIC = /^(?:aten[cç][aã]o\s*:\s*)?(est[ae]s?|ess[ae]s?|isso|isto|nest[ae]s?|ness[ae]s?|dest[ae]s?|dess[ae]s?|tal|tais)(?![\p{L}])/iu;
export const ANTECEDENT_TEXT_MAX = 220;

/**
 * Entre duas unidades adjacentes só cabe espaço em branco e marcação: marcador de lista (`-`, `*`, `+`, `1.`, `1)`),
 * citação (`>`), ênfase (`*`, `_`). Qualquer letra, dígito fora de marcador, imagem, tabela ou título = não adjacente.
 */
const ONLY_MARKUP = /^(?:\s|[-*+>_]|\d{1,3}[.)](?=\s))*$/u;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../data/knowledge/versions");
const corpusCache = new Map<string, string | null>();
function corpusText(file: string): string | null {
  if (corpusCache.has(file)) return corpusCache.get(file)!;
  const base = resolve(ROOT, getKnowledgeBase().meta.knowledgeDir, "corpus");
  const path = resolve(base, file);
  const text = path.startsWith(base + sep) && existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : null;
  corpusCache.set(file, text);
  return text;
}

/** O texto do corpus entre o fim da unidade anterior e o começo desta é só espaço em branco/marcação? */
export function adjacentInCorpus(file: unknown, prevEnd: number, start: number): boolean {
  if (typeof file !== "string" || !(prevEnd <= start)) return false;
  const text = corpusText(file);
  if (text === null) return false;
  return ONLY_MARKUP.test(text.slice(prevEnd, start));
}

type RuleLike = { id?: string; originalText?: string; source?: Record<string, unknown> };

/**
 * A unidade anterior ADJACENTE da mesma seção (id + texto), quando a cláusula tem demonstrativo (`leading`: só no começo).
 * Sem charRange, sem seção, sem unidade anterior ou com texto entre as duas: undefined.
 */
export function antecedentOf(rule: RuleLike, leading = false): { id: string; text: string } | undefined {
  const text = plain(String(rule.originalText ?? ""));
  if (!(leading ? LEADING_ANAPHORIC : ANAPHORIC).test(text)) return undefined;
  const src = (rule.source ?? {}) as { section?: unknown; corpusFile?: unknown; charRange?: unknown };
  if (typeof src.section !== "string" || !Array.isArray(src.charRange)) return undefined;
  const start = Number(src.charRange[0]);
  let best: { end: number; id: string; text: string } | undefined;
  for (const o of getKnowledgeBase().rules) {
    if (o.id === rule.id) continue;
    const os = (o.source ?? {}) as { section?: unknown; corpusFile?: unknown; charRange?: unknown };
    if (os.corpusFile !== src.corpusFile || os.section !== src.section || !Array.isArray(os.charRange)) continue;
    const end = Number(os.charRange[1]);
    if (end <= start && (!best || end > best.end)) best = { end, id: o.id, text: plain(String(o.originalText ?? "")) };
  }
  if (!best || !best.text || !adjacentInCorpus(src.corpusFile, best.end, start)) return undefined;
  return { id: best.id, text: clip(best.text, ANTECEDENT_TEXT_MAX) };
}
