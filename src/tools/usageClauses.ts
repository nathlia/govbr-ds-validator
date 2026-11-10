/**
 * 3.7.5 (item 6; campanha dev-374-b-01): as cláusulas de USO e de juízo de um componente do DS — subseções `uso`,
 * `melhores-praticas` e `tom-e-voz` (com as variantes `tom-e-voz-…`/`tom-de-voz-…`) da página do componente. Nenhum
 * agente do braço com o oráculo as leu: a lista de verificação traz só as obrigações/proibições, e estas pedem juízo
 * ("julgue pelo conteúdo e uso na página"). A pendência `usage-unread` garante a LEITURA delas, nunca um veredito.
 *
 * 3.7.5-pre.2 (decisão do coordenador, custo): só as que obrigam, proíbem ou desaconselham (força `required`,
 * `prohibited`, `discouraged`); as frases "use X quando…" (`recommended`, `permitted`) ficam fora da pendência. A leitura
 * é por ids (`get_ds_rules{ids, detail:"index"}`, até 20 por chamada); a listagem `get_ds_rules{component, category:"component"}` pelo
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

/**
 * As chamadas que entregam as cláusulas de uso do componente: get_ds_rules{ids, detail:"index"} (3.7.5-pre.3: a frase de
 * cada cláusula, a força e o componente — o cartão inteiro custava ~940 caracteres por cláusula), até 20 ids cada.
 */
export function usageReadCalls(ids: string[]): Array<{ tool: "get_ds_rules"; arguments: { ids: string[]; detail: "index" } }> {
  const out: Array<{ tool: "get_ds_rules"; arguments: { ids: string[]; detail: "index" } }> = [];
  for (let i = 0; i < ids.length; i += IDS_PER_CALL) out.push({ tool: "get_ds_rules", arguments: { ids: ids.slice(i, i + IDS_PER_CALL), detail: "index" } });
  return out;
}

/** A listagem do componente (pelo cursor até o fim): também devolve todas, e também fecha. */
export const usageListingCall = (component: string) => ({ tool: "get_ds_rules", arguments: { component, category: "component" } });

const RULE_ID = /^govbr-\d+\.\d+\.\d+-[a-z0-9-]+-[0-9a-f]{12}$/;

/**
 * Revisão H1: os ids de cláusula que uma resposta de leitura ENTREGOU — só os itens de cláusula, nunca ids ecoados em
 * next, ambiguity, query, missing, related, anatomia ou listas de referência. get_ds_rules: `results[].citeAs|id` (ids,
 * query, context), `items[].id` (listagem), `rule.id` (por id), `rules[].id` (caminho literal da 2.x);
 * get_component_spec: `items[].citeAs` da lista de verificação; get_page_rules: `items[].citeAs` da lista global.
 */
export function deliveredRuleIds(tool: string, text: string): string[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const out: string[] = [];
  const take = (list: unknown, ...keys: string[]) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      for (const k of keys) {
        const v = (item as Record<string, unknown>)[k];
        if (typeof v === "string" && RULE_ID.test(v)) { out.push(v); break; }
      }
    }
  };
  if (tool === "get_ds_rules") {
    take(d.results, "citeAs", "id");
    take(d.items, "id");
    take(d.rules, "id");
    const rule = d.rule as { id?: unknown } | undefined;
    if (rule && typeof rule.id === "string" && RULE_ID.test(rule.id)) out.push(rule.id);
  } else if (tool === "get_component_spec") {
    if (d.kind === "component-checklist") take(d.items, "citeAs");
  } else if (tool === "get_page_rules") {
    take(d.items, "citeAs");
  }
  return out;
}
