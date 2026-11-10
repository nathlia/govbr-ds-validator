/**
 * 3.7.5 (item 6; campanha dev-374-b-01): as cláusulas de USO e de juízo de um componente do DS — subseções `uso`,
 * `melhores-praticas` e `tom-e-voz` (com as variantes `tom-e-voz-…`/`tom-de-voz-…`) da página do componente. Nenhum
 * agente do braço com o oráculo as leu: a lista de verificação traz só as obrigações/proibições, e estas pedem juízo
 * ("julgue pelo conteúdo e uso na página"). A pendência `usage-unread` garante a LEITURA delas, nunca um veredito.
 *
 * 3.7.5-pre.2 (decisão do coordenador, custo): só as que obrigam, proíbem ou desaconselham (força `required`,
 * `prohibited`, `discouraged`); as frases "use X quando…" (`recommended`, `permitted`) ficam fora da pendência. A leitura
 * é por ids (`get_ds_rules{ids}`, até 20 por chamada); a listagem `get_ds_rules{component, category:"component"}` pelo
 * cursor também as devolve todas e também fecha. As orientações de padrão (`pattern/*`) não têm componente na base.
 */
import { filterRules } from "../data/knowledge.js";

export const USAGE_SUBCATEGORY = /^(uso|melhores-praticas|tom-(e|de)-voz)(-|$)/;
/** Forças da pendência de leitura: obriga, proíbe, desaconselha. */
export const USAGE_FORCES: ReadonlySet<string> = new Set(["required", "prohibited", "discouraged"]);
/** Teto de ids do get_ds_rules (esquema `ids`: max 20). */
export const IDS_PER_CALL = 20;

const cache = new Map<string, string[]>();

/** Ids das cláusulas de uso/juízo do componente que obrigam, proíbem ou desaconselham (vazio = nenhuma). */
export function usageClauseIds(component: string): string[] {
  let ids = cache.get(component);
  if (!ids) {
    ids = filterRules({ component, category: "component" })
      .filter((r) => !r.legacy && USAGE_SUBCATEGORY.test(r.subcategory ?? "") && USAGE_FORCES.has(r.force))
      .map((r) => r.id);
    cache.set(component, ids);
  }
  return ids;
}

/** As chamadas que entregam as cláusulas de uso do componente: get_ds_rules{ids}, até 20 ids cada. */
export function usageReadCalls(ids: string[]): Array<{ tool: "get_ds_rules"; arguments: { ids: string[] } }> {
  const out: Array<{ tool: "get_ds_rules"; arguments: { ids: string[] } }> = [];
  for (let i = 0; i < ids.length; i += IDS_PER_CALL) out.push({ tool: "get_ds_rules", arguments: { ids: ids.slice(i, i + IDS_PER_CALL) } });
  return out;
}

/** A listagem do componente (pelo cursor até o fim): também devolve todas, e também fecha. */
export const usageListingCall = (component: string) => ({ tool: "get_ds_rules", arguments: { component, category: "component" } });

/** Ids da base citados numa resposta (o servidor vê o que a chamada devolveu). */
const RULE_ID = /govbr-\d+\.\d+\.\d+-[a-z0-9-]+-[0-9a-f]{12}/g;
export function ruleIdsIn(text: string): string[] {
  return text.match(RULE_ID) ?? [];
}
