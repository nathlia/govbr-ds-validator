/** A2: catálogo das obrigações globais; nenhuma entrada afirma aplicabilidade à página. */
import { filterRules, getKnowledgeBase } from "../data/knowledge.js";
import { isTitleRecord, listingOrder } from "../responses/retrieval.js";
import { CONTRACT, RESPONSE_BUDGET, budgetPage, cursorKey, decodeCursor, encodeCursor, staleCursorError, step, textSize, fail, ok } from "../responses/contract.js";
import { MEASURABILITY, measurabilityOf, procedureLine, procedureOf } from "./componentChecklist.js";
import { oracleFullyMeasures, oracleMeasuresFor } from "./oracleCoverage.js";

const VERSION = "page-checklist/1.0.0";
const strong = new Set(["required", "prohibited"]);
const plain = (s: string) => s.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
const short = (s: string) => s.length <= 180 ? s : `${s.slice(0, 179)}…`;

/** Inclui e-MAG e as normas globais do DS; exclui títulos, exemplos e especificações. */
export function pageChecklistRules() {
  return listingOrder(filterRules())
    .filter((rule) => rule.component === null && strong.has(rule.force) && !isTitleRecord(rule))
    .sort((a, b) => MEASURABILITY.indexOf(measurabilityOf(a)) - MEASURABILITY.indexOf(measurabilityOf(b)) ||
      Number(oracleFullyMeasures(a.id)) - Number(oracleFullyMeasures(b.id)));
}

/** Cláusulas globais mensuráveis, sem decisão integral do oráculo; não são pendências registradas. */
export function pageInvestigateClauses(max = 3) {
  const rules = pageChecklistRules().filter((rule) => !oracleFullyMeasures(rule.id) && procedureOf(rule) !== null);
  return {
    total: rules.length,
    clauses: rules.slice(0, max).map((rule) => {
      const procedure = procedureOf(rule)!;
      return {
        citeAs: rule.id, text: short(plain(rule.originalText)), how: procedureLine(procedure),
        ...(procedure.when ? { when: procedure.when } : {}),
        ...(procedure.context ? { context: procedure.context } : {}),
      };
    }),
  };
}

/** Resposta MCP paginada. Não registra pendências. */
export function pageChecklist(cursor?: string) {
  const rules = pageChecklistRules();
  const meta = getKnowledgeBase().meta;
  const key = cursorKey({ tool: "get_page_rules", view: "checklist", version: VERSION,
    kb: meta.knowledgeVersion, rules });
  const start = cursor === undefined ? 0 : decodeCursor(cursor, key);
  if (start === null) return staleCursorError("get_page_rules", { view: "checklist" });
  const items = rules.map((rule) => {
    const oracle = oracleMeasuresFor(rule.id);
    const procedure = procedureOf(rule);
    return {
      citeAs: rule.id, force: rule.force, text: short(plain(rule.originalText)),
      source: { standard: rule.standard ?? "gov.br Design System", url: rule.source.url },
      measure: {
        automatic: oracleFullyMeasures(rule.id), strategy: rule.validationStrategy,
        measurability: measurabilityOf(rule),
        ...(oracle.length ? { oracle } : {}),
        ...(procedure ? { how: procedureLine(procedure), ...(procedure.when ? { when: procedure.when } : {}), ...(procedure.context ? { procedure } : {}) }
          : { how: "Leia a cláusula completa e registre a medida ou a dúvida; esta lista não deriva valor esperado nem decide aplicabilidade." }),
      },
    };
  });
  const automatic = items.filter((item) => item.measure.automatic).length;
  const response = budgetPage(items, start, (page, next) => ({
    contract: CONTRACT, kind: "page-checklist", version: VERSION,
    note: "Candidatas a investigar, não veredito. Confira a aplicabilidade no estado observado. automatic:false inclui cobertura parcial: meça o restante. Esta lista não registra pendingId; dê a cada cláusula um estado no relatório e leia o texto completo pelo citeAs.",
    total: items.length, automatic, unmeasured: items.length - automatic,
    cursor: Math.min(start, items.length), count: page.length, items: page,
    page: { cursor: next === null ? null : encodeCursor(next, key) },
    ...(next !== null ? { next: step("request-detail", "próximas cláusulas globais", "get_page_rules", { view: "checklist", cursor: encodeCursor(next, key) }) } : { end: true }),
  }), RESPONSE_BUDGET);
  if (textSize(response) > RESPONSE_BUDGET) return fail({
    error: "A cláusula inteira com seu procedimento não cabe no checklist; leia-a por id e continue a lista.",
    errorCode: "item-too-large", field: "cursor",
    next: [
      step("request-detail", "cláusula completa", "get_ds_rules", { id: rules[start].id }),
      step("request-detail", "continuar após esta cláusula", "get_page_rules", { view: "checklist", cursor: encodeCursor(start + 1, key) }),
    ],
  });
  return ok(response);
}
