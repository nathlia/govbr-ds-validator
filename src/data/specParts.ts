/**
 * 3.7.6 (leitura dev-374-a2 §5, itens 1 e 2): as linhas de tabela de especificação (emenda-2, D-167) que dizem um TOKEN ou
 * um valor por PARTE de um componente — o que se mede e compara no navegador. Tudo vem da base (unidades `force:
 * "especificacao"`, `specification.part/entries`) e do registro de tokens; nada aqui nomeia tela, parte ou unidade.
 *
 * - `measurableSpecRows`: as linhas com algum valor que se resolve (token do registro ou px), tipografia e cor primeiro —
 *   servidas em `get_component_spec` (`specification.measure`) e contadas no `investigate.spec` do scan.
 * - `typographyRows`: as linhas com token de tamanho/peso de fonte — o check por parte (checkers/specPartTokens.ts).
 */
import { filterRules, SPECIFICATION_FORCE, type KnowledgeRule } from "./knowledge.js";
import { getTokenRegistry } from "./load.js";

export type SpecProperty = "fontSize" | "fontWeight";

/** Token de tamanho / peso de fonte do DS, pelo nome (a escala do registro). */
const PROPERTY_OF_TOKEN: Array<[RegExp, SpecProperty]> = [
  [/^--font-size-/, "fontSize"],
  [/^--font-weight-/, "fontWeight"],
];

export function propertyOfToken(token: string): SpecProperty | null {
  for (const [re, prop] of PROPERTY_OF_TOKEN) if (re.test(token)) return prop;
  return null;
}

export interface SpecRowEntry {
  property: string;
  value: string;
  token?: string;
  /** Valor do token no registro do DS (ou o próprio valor, quando é px). */
  resolved?: string;
}

export interface SpecRow {
  id: string;
  part: string;
  facet: string;
  kind: "typography" | "color" | "other";
  entries: SpecRowEntry[];
}

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;
const PX = /^-?\d+(?:\.\d+)?px$/;

function rowOf(rule: KnowledgeRule, all: Record<string, string>): SpecRow | null {
  const spec = rule.specification;
  if (spec?.kind !== "table-row" || !spec.part || !spec.entries?.length) return null;
  const entries: SpecRowEntry[] = [];
  for (const e of spec.entries) {
    const token = e.tokens.find((t) => all[t] !== undefined);
    const raw = e.value.replace(/`/g, "").trim();
    if (token) entries.push({ property: e.property, value: raw, token, resolved: all[token] });
    else if (PX.test(raw)) entries.push({ property: e.property, value: raw, resolved: raw });
  }
  if (!entries.length) return null;
  const typography = entries.some((e) => e.token && propertyOfToken(e.token));
  const color = !typography && entries.some((e) => e.resolved && COLOR.test(e.resolved));
  return { id: rule.id, part: spec.part, facet: String(spec.facet ?? rule.source.section ?? ""), kind: typography ? "typography" : color ? "color" : "other", entries };
}

const cache = new Map<string, SpecRow[]>();

/** As linhas mensuráveis do componente: tipografia, cor, depois as demais (em cada grupo, a ordem da base). */
export function measurableSpecRows(component: string): SpecRow[] {
  const hit = cache.get(component);
  if (hit) return hit;
  const all = getTokenRegistry().all;
  const rows = filterRules({ component, force: SPECIFICATION_FORCE })
    .map((r) => rowOf(r, all))
    .filter((r): r is SpecRow => r !== null);
  const rank = { typography: 0, color: 1, other: 2 } as const;
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => rank[a.r.kind] - rank[b.r.kind] || a.i - b.i).map((x) => x.r);
  cache.set(component, sorted);
  return sorted;
}

/** Linha de tipografia: os pares (propriedade, token) que ela especifica para a parte. */
export interface TypographyRow {
  id: string;
  part: string;
  pairs: Array<{ property: SpecProperty; token: string }>;
}

export function typographyRows(component: string): TypographyRow[] {
  return measurableSpecRows(component)
    .filter((r) => r.kind === "typography")
    .map((r) => ({
      id: r.id,
      part: r.part,
      pairs: r.entries.flatMap((e) => {
        const property = e.token ? propertyOfToken(e.token) : null;
        return property && e.token ? [{ property, token: e.token }] : [];
      }),
    }))
    .filter((r) => r.pairs.length > 0);
}

/** Uma linha na forma compacta: `id · parte · propriedade token=valor; …`. */
export function specRowLine(row: SpecRow): string {
  const entries = row.entries.map((e) => `${e.property} ${e.token ? `${e.token}=${e.resolved}` : e.value}`).join("; ");
  return `${row.id} · ${row.part} · ${entries}`;
}

export function resetSpecPartsCache(): void {
  cache.clear();
}
