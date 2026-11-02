/**
 * 3.4.0 (D-153, A1/A10/A12): partes de `get_component_spec` que vêm da base, fora do server.ts.
 *
 * - `specClauses`: o texto das cláusulas de prosa do PRÓPRIO componente, na ordem fixa da listagem
 *   (obriga/proíbe → demais; ordem da base), dentro do orçamento. Antes a spec só contava regras por
 *   estratégia: a ordem ícone/fechar da mensagem (A-11) e o texto de apoio do upload (A-10) não apareciam.
 * - `fitComponentSpec`: cabe no teto sem adiar o exemplo à toa — primeiro adia `tokensUsed` (lista de
 *   nomes, pedida à parte), depois encurta as cláusulas, depois troca o exemplo implícito pelo primeiro
 *   que cabe (dito em `exampleChoice`); só então adia o exemplo, como antes.
 */
import { filterRules, type KnowledgeRule } from "../data/knowledge.js";
import { relatedFor, relationsLabel } from "../data/relations.js";
import { lostExceptionOf } from "../data/lostExceptions.js";
import { isTableRow } from "../data/retrieval.js";
import { isTitleRecord, listingOrder } from "../responses/retrieval.js";
import { RESPONSE_BUDGET, textSize } from "../responses/contract.js";

export const SPEC_CLAUSES_MAX = 5;
export const SPEC_CLAUSE_TEXT_MAX = 240;

const MODALITY: Record<string, string> = {
  required: "obrigação",
  prohibited: "proibição",
  recommended: "recomendação",
  discouraged: "desaconselhado",
  permitted: "permitido",
  informative: "informativo",
  unclear: "indefinido",
};

const plain = (text: string) => text.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

function cut(text: string, max: number): { text: string; complete: boolean } {
  if (text.length <= max) return { text, complete: true };
  const slice = text.slice(0, max - 1);
  const space = slice.lastIndexOf(" ");
  return { text: `${(space > max * 0.6 ? slice.slice(0, space) : slice).trimEnd()}…`, complete: false };
}

function heading(rule: KnowledgeRule): string {
  const path = typeof rule.source.sectionPath === "string" ? rule.source.sectionPath.split(" > ") : [];
  return plain(path.slice(-2).join(" > ")) || rule.title;
}

/** Cláusulas de prosa do componente (sem linhas de tabela nem registros-título), na ordem da listagem. */
export function specClauseRules(component: string): KnowledgeRule[] {
  return listingOrder(filterRules({ component })).filter((r) => !isTableRow(r.originalText ?? "") && !isTitleRecord(r));
}

export function specClauses(component: string, max = SPEC_CLAUSES_MAX) {
  const rules = specClauseRules(component);
  return {
    note: "Texto literal das cláusulas de prosa do componente (obrigação/proibição primeiro, depois as demais; ordem da base). Candidatas, não defeitos; leia a unidade por id antes de citar.",
    total: rules.length,
    items: rules.slice(0, max).map((r) => {
      const { text, complete } = cut(plain(r.originalText), SPEC_CLAUSE_TEXT_MAX);
      const lost = lostExceptionOf(r);
      return { citeAs: r.id, force: r.force, modality: MODALITY[r.force] ?? "indefinido", heading: heading(r), text, complete, ...(lost ? { condition: { code: lost.code, legacyId: lost.legacyId, text: lost.text } } : {}) };
    }),
    ...(rules.length > max
      ? { next: { tool: "get_ds_rules", arguments: { component, detail: "brief" } } }
      : {}),
  };
}

/** Bloco related (camada kb-relations) do componente, ou nada. */
export function specRelated(component: string) {
  const items = relatedFor({ components: [component] });
  return items.length ? { related: { version: relationsLabel(), items } } : {};
}

interface SpecExample {
  name: string;
  [k: string]: unknown;
}

/**
 * Ajusta a resposta ao teto. `implicit` = o exemplo veio de include_examples (não foi pedido pelo nome).
 * Muta e devolve `response`.
 */
export function fitComponentSpec(
  response: Record<string, unknown>,
  opts: { component: string; chosen?: SpecExample; implicit: boolean; examples: SpecExample[]; budget?: number },
): Record<string, unknown> {
  const budget = opts.budget ?? RESPONSE_BUDGET;
  const fits = () => textSize(response) <= budget;
  if (fits()) return response;
  // 1. tokensUsed: lista de nomes de tokens, a de menor valor para auditar — adiada com a contagem.
  if (Array.isArray(response.tokensUsed) && response.tokensUsed.length) {
    response.tokensUsed = {
      status: "deferred",
      count: response.tokensUsed.length,
      note: "Lista de tokens adiada para caber o exemplo e as cláusulas; peça a spec sem include_examples para vê-la.",
      next: { tool: "get_component_spec", arguments: { component: opts.component } },
    };
    if (fits()) return response;
  }
  // 2. cláusulas: de 5 para 3.
  const rules = response.rules as { clauses?: { items: unknown[] } } | undefined;
  if (rules?.clauses && rules.clauses.items.length > 3) {
    rules.clauses = { ...rules.clauses, items: rules.clauses.items.slice(0, 3) };
    if (fits()) return response;
  }
  // 3.6.5 (item 3b): as obrigações dos elementos ficam com sujeito, id e força (o texto pelo id, em get_ds_rules).
  const obligations = response.elementObligations as { note?: string; items?: Array<{ subject: string; citeAs: string; force: string; text?: string }> } | undefined;
  if (obligations?.items?.some((i) => i.text !== undefined)) {
    response.elementObligations = {
      ...obligations,
      items: obligations.items.map(({ subject, citeAs, force }) => ({ subject, citeAs, force })),
      textsNext: { tool: "get_ds_rules", arguments: { ids: obligations.items.map((i) => i.citeAs).slice(0, 10) } },
    };
    if (fits()) return response;
  }
  if (!opts.chosen) return response;
  // 3. exemplo implícito: o primeiro outro exemplo que cabe, dito.
  if (opts.implicit) {
    for (const other of opts.examples) {
      if (other.name === opts.chosen.name) continue;
      response.example = other;
      response.exampleChoice = {
        requested: opts.chosen.name,
        served: other.name,
        note: `O primeiro exemplo (${opts.chosen.name}) não coube junto com a especificação; veio o primeiro que coube. Peça qualquer um pelo nome.`,
        next: { tool: "get_component_spec", arguments: { component: opts.component, example: opts.chosen.name } },
      };
      if (fits()) return response;
    }
    delete response.exampleChoice;
  }
  // 4. como antes: adiado.
  response.example = {
    name: opts.chosen.name,
    status: "deferred",
    note: "O exemplo não coube junto com a especificação; peça-o sozinho pelo nome.",
    next: { tool: "get_component_spec", arguments: { component: opts.component, example: opts.chosen.name } },
  };
  return response;
}
