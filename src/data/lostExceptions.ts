/**
 * 3.5.0 (revisão independente, HIGH 2; auditoria de mensurabilidade §5): exceção perdida na base literal.
 *
 * Quando a base literal recortou uma regra da versão parcial, uma frase de exceção do texto antigo pode ter
 * ficado fora da cláusula nova. Caso conhecido: `component-button-7ef75d42ac65` ("O rótulo é um elemento
 * obrigatório.") substitui o legado `component-button-4d7b5f978df1`, que dizia também "A exceção ocorre na versão
 * tipo circular uma vez que não existe rótulo." Pela letra servida, todo botão circular violaria.
 *
 * Detecção genérica, sem lista à mão: para cada id legado substituído, as frases do texto antigo que falam de
 * exceção (exceção/exceto/salvo se/a não ser) e que não estão no texto da sucessora viram uma CONDIÇÃO anotada
 * na sucessora — em cartões, listagens, leitura por id e na lista de verificação. Não muda força nem texto da base.
 */
import { getKnowledgeBase, type KnowledgeRule } from "./knowledge.js";

const EXCEPTION = /exce[çc][ãa]o|\bexceto\b|salvo se|a não ser que/i;
const plain = (t: string) => t.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

export interface LostException {
  code: "lost-exception";
  legacyId: string;
  /** Frase(s) de exceção do texto legado, literais. */
  text: string;
  note: string;
}

let index: Map<string, LostException> | undefined;
let indexFor: unknown;

function build(): Map<string, LostException> {
  const kb = getKnowledgeBase();
  const map = new Map<string, LostException>();
  for (const [legacyId, legacy] of kb.legacyById) {
    if (legacy.legacy?.class !== "superseded" || !EXCEPTION.test(legacy.originalText)) continue;
    const sentences = plain(legacy.originalText).split(/(?<=[.;!?])\s+/).filter((s) => EXCEPTION.test(s));
    for (const successorId of legacy.legacy.supersededBy) {
      const successor = kb.byId.get(successorId);
      if (!successor) continue;
      const kept = plain(successor.originalText);
      const lost = sentences.filter((s) => !kept.includes(s));
      if (!lost.length) continue;
      map.set(successorId, {
        code: "lost-exception",
        legacyId,
        text: lost.join(" "),
        note: `A cláusula servida perdeu a exceção do texto anterior (${legacyId}): "${lost.join(" ")}" Não aplique a cláusula ao caso excetuado.`,
      });
    }
  }
  return map;
}

/** Exceção que a cláusula servida perdeu em relação ao legado que ela substitui (ou nada). */
export function lostExceptionOf(rule: Pick<KnowledgeRule, "id">): LostException | undefined {
  const kb = getKnowledgeBase();
  if (!index || indexFor !== kb) {
    index = build();
    indexFor = kb;
  }
  return index.get(rule.id);
}
