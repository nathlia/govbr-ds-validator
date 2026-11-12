/**
 * 3.7.11 (auditoria A/A2, conserto 2; A-10): a cláusula que começa por referência anafórica ("Esta funcionalidade deve ser
 * informada…") chegava sem o referente — o agente não sabia que "esta funcionalidade" é arrastar arquivos. O referente é a
 * frase literal imediatamente anterior na MESMA seção do mesmo arquivo do corpus (pelo charRange), lida da própria base; vai
 * junto com o id dela, como a frase da exceção do botão (icon-only-embedded). Nada é inventado nem resumido.
 */
import { getKnowledgeBase } from "./knowledge.js";

const plain = (t: string) => t.replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Demonstrativo em qualquer posição ("Esta funcionalidade…", "…sobre este comportamento", "tal…"). */
export const ANAPHORIC = /(^|[^\p{L}])(est[ae]s?|ess[ae]s?|isso|isto|nest[ae]s?|ness[ae]s?|dest[ae]s?|dess[ae]s?|tal|tais)(?![\p{L}])/iu;
/** Demonstrativo no começo da cláusula (depois de um "Atenção:" eventual): a cláusula sozinha não diz a que se refere. */
export const LEADING_ANAPHORIC = /^(?:aten[cç][aã]o\s*:\s*)?(est[ae]s?|ess[ae]s?|isso|isto|nest[ae]s?|ness[ae]s?|dest[ae]s?|dess[ae]s?|tal|tais)(?![\p{L}])/iu;
export const ANTECEDENT_TEXT_MAX = 220;

type RuleLike = { id?: string; originalText?: string; source?: Record<string, unknown> };

/**
 * A frase literal anterior da mesma seção (id + texto), quando a cláusula tem demonstrativo (`leading`: só no começo).
 * Sem charRange, sem seção ou sem frase anterior: undefined.
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
  return best && best.text ? { id: best.id, text: clip(best.text, ANTECEDENT_TEXT_MAX) } : undefined;
}
