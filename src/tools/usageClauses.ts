/**
 * 3.7.5 (item 6; campanha dev-374-b-01): as cláusulas de USO e de juízo de um componente do DS — subseções `uso`,
 * `melhores-praticas` e `tom-e-voz` (com as variantes `tom-e-voz-…`/`tom-de-voz-…`) da página do componente. Nenhum
 * agente do braço com o oráculo as leu: a lista de verificação traz só as obrigações/proibições, e estas pedem juízo
 * ("julgue pelo conteúdo e uso na página"). A pendência `usage-unread` garante a LEITURA delas, nunca um veredito.
 *
 * O conjunto é o que a listagem existente devolve: `get_ds_rules{component, category:"component"}` (mesmo filtro,
 * `filterRules`), seguida pelo cursor até o fim. As orientações de padrão (`pattern/*`) não têm componente na base e
 * ficam de fora (não há componente detectado a que prendê-las).
 */
import { filterRules } from "../data/knowledge.js";

export const USAGE_SUBCATEGORY = /^(uso|melhores-praticas|tom-(e|de)-voz)(-|$)/;

const cache = new Map<string, string[]>();

/** Ids das cláusulas de uso/juízo do componente na base ativa (vazio = nenhuma). */
export function usageClauseIds(component: string): string[] {
  let ids = cache.get(component);
  if (!ids) {
    ids = filterRules({ component, category: "component" })
      .filter((r) => !r.legacy && USAGE_SUBCATEGORY.test(r.subcategory ?? ""))
      .map((r) => r.id);
    cache.set(component, ids);
  }
  return ids;
}

/** A única chamada que entrega as cláusulas de uso do componente (continuação pelo cursor da própria resposta). */
export const usageReadCall = (component: string) => ({ tool: "get_ds_rules", arguments: { component, category: "component" } });

/** Ids da base citados numa resposta (o servidor vê o que a chamada devolveu). */
const RULE_ID = /govbr-\d+\.\d+\.\d+-[a-z0-9-]+-[0-9a-f]{12}/g;
export function ruleIdsIn(text: string): string[] {
  return text.match(RULE_ID) ?? [];
}
