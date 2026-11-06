/** A3: continuação completa das cláusulas literais, sem cortar a lista em dez ids. */
import type { emagUnits } from "../data/normativeUnits.js";
import { CONTRACT, MESSAGES, RESPONSE_BUDGET, cursorKey, decodeCursor, encodeCursor, fail, ok, step, textSize } from "./contract.js";

export function emagClausesReply(response: Record<string, unknown>, units: ReturnType<typeof emagUnits>, id: string, cursor?: string) {
  const key = cursorKey({ tool: "get_emag_rules", id, units });
  const start = cursor === undefined ? 0 : decodeCursor(cursor, key);
  if (start === null || start > units.clauses.length) return fail({
    error: "Cursor de cláusulas inválido ou de outra recomendação/versão. Reinicie pelo id.",
    errorCode: "stale-cursor", field: "clauseCursor",
    next: [step("request-detail", "reinicie a recomendação", "get_emag_rules", { id })],
  });
  if (cursor === undefined && textSize(response) <= RESPONSE_BUDGET) return ok(response);
  const compose = (clauses: typeof units.clauses) => {
    const nextPosition = start + clauses.length;
    return {
      ...(cursor === undefined ? response : { contract: CONTRACT, kind: "emag-clauses", id }),
      normativeContext: {
        ...(cursor === undefined ? units : { knowledgeVersion: units.knowledgeVersion, contextCompleteness: units.contextCompleteness, note: units.note }),
        clauses,
        ...(nextPosition < units.clauses.length ? {
          clausesDeferred: {
            count: units.clauses.length - nextPosition, note: MESSAGES["text-deferred"],
            next: { tool: "get_emag_rules", arguments: { id, clauseCursor: encodeCursor(nextPosition, key) } },
          },
        } : {}),
      },
      page: { cursor: start, count: clauses.length, total: units.clauses.length },
    };
  };
  const page: typeof units.clauses = [];
  for (let i = start; i < units.clauses.length; i++) {
    if (textSize(compose([...page, units.clauses[i]])) > RESPONSE_BUDGET) break;
    page.push(units.clauses[i]);
  }
  if (page.length === 0 && start < units.clauses.length) return fail({
    error: "A cláusula ou seu contexto não cabe nesta resposta. Leia a unidade por id antes de continuar.",
    errorCode: "invalid-argument", field: "clauseCursor",
    next: [
      step("request-detail", "leia a cláusula inteira pela unidade citável", "get_ds_rules", { id: units.clauses[start].id }),
      step("request-detail", "depois continue pelas cláusulas seguintes", "get_emag_rules", { id, clauseCursor: encodeCursor(start + 1, key) }),
    ],
  });
  return ok(compose(page));
}
