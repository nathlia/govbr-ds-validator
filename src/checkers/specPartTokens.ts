/**
 * 3.7.6 (leitura dev-374-a2 §5, item 2): token por PARTE de componente — o valor computado da parte × o token que a tabela
 * de especificação do DS dá a ela (unidade de especificação da emenda-2, D-167). Como `token-font-size-off-scale`, é
 * observação (D-27/D-32), nunca achado: a unidade descreve o componente, não obriga.
 *
 * Como a parte é localizada sem nomear parte nenhuma: a folha oficial do DS (`data/ds-stylesheet.json`) diz em que seletor,
 * dentro de `.br-<componente>`, ela aplica cada token de fonte. Um seletor que aplica um token que a tabela do componente
 * atribui a uma parte É a parte na marcação do DS. Entre as linhas da tabela, fica a que casa mais pares (propriedade,
 * token) do mesmo elemento (tamanho E peso desempatam o rótulo do contador); empate → todas (até 3), ditas ambíguas.
 *
 * Só desvio que a PÁGINA escreveu conta: o elemento tem declaração autoral da propriedade e o valor computado não é nenhum
 * dos que a folha do DS declara para ele (variantes e estados do próprio DS ficam de fora). Medidos: font-size e font-weight
 * (não variam por estado). Pulados, e ditos em `skipped`: cor/borda/espaçamento (estado, densidade e variáveis indiretas
 * do componente), seletores com pseudo-elemento ou estado de interação, valores do DS que não se resolvem no registro.
 */
import type { Page } from "playwright";
import { inspectPageComputedStyles, type StyleProperty } from "../evidence/inspect.js";
import type { ElementEvidence } from "../evidence/types.js";
import type { Observation } from "../schema/finding.js";
import { getDsStylesheet, getTokenRegistry } from "../data/load.js";
import { typographyRows, propertyOfToken, type SpecProperty, type TypographyRow } from "../data/specParts.js";
import { ownershipOf } from "./ownership.js";

export const SPEC_PART_KIND = "spec-part-token";

const CSS_NAME: Record<SpecProperty, string> = { fontSize: "font-size", fontWeight: "font-weight" };
/** Pseudo-elementos e estados de interação: a parte não está no DOM consultável, ou o valor depende do estado. */
const STATEFUL = /::|:(hover|focus|focus-visible|focus-within|active|visited|checked|disabled|invalid|placeholder-shown)\b/;

export interface PartSelector {
  selector: string;
  pairs: Array<{ property: SpecProperty; token: string }>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const varOf = (value: string): string | null => value.replace(/\s*!important$/, "").trim().match(/^var\((--[\w-]+)\)$/)?.[1] ?? null;

const selectorCache = new Map<string, PartSelector[]>();

/** Os seletores da folha oficial, dentro de `.br-<componente>`, que aplicam um token de fonte da tabela do componente. */
export function partSelectors(component: string, rows: TypographyRow[] = typographyRows(component)): PartSelector[] {
  const hit = selectorCache.get(component);
  if (hit) return hit;
  const wanted = new Set(rows.flatMap((r) => r.pairs.map((p) => `${p.property}|${p.token}`)));
  const out: PartSelector[] = [];
  if (wanted.size) {
    const root = new RegExp(`\\.br-${escapeRe(component)}(?![\\w-])`);
    for (const [selector, decls] of Object.entries(getDsStylesheet().declarations)) {
      if (!root.test(selector) || STATEFUL.test(selector)) continue;
      const pairs: PartSelector["pairs"] = [];
      for (const property of ["fontSize", "fontWeight"] as SpecProperty[]) {
        for (const value of decls[CSS_NAME[property]] ?? []) {
          const token = varOf(value);
          if (token && wanted.has(`${property}|${token}`)) pairs.push({ property, token });
        }
      }
      if (pairs.length) out.push({ selector, pairs });
    }
  }
  selectorCache.set(component, out);
  return out;
}

/** O valor de uma declaração (do DS ou da página), resolvido: `var(--x)` pelo registro, px e pesos literais; null = não se resolve. */
function resolveDs(value: string, property: SpecProperty, all: Record<string, string>): number | null {
  const token = varOf(value);
  const raw = token ? all[token] : value.replace(/\s*!important$/, "").trim();
  if (raw === undefined) return null;
  return numeric(raw, property);
}

function numeric(raw: string, property: SpecProperty): number | null {
  if (property === "fontSize") {
    const m = raw.match(/^(-?\d+(?:\.\d+)?)px$/);
    return m ? Number(m[1]) : null;
  }
  if (raw === "normal") return 400;
  if (raw === "bold") return 700;
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/**
 * 3.7.6-pre.2 (revisão LOW): o valor que a PÁGINA declarou, também em unidade relativa — `rem` pela fonte computada da raiz,
 * `em`/`%`/`inherit` pela fonte computada do pai (o contexto vem da página viva). Variável definida pela própria página
 * (fora do registro) segue sem resolver.
 */
export interface FontContext { rootPx: number | null; parentPx: number | null }

export function resolvePage(value: string, property: SpecProperty, all: Record<string, string>, ctx?: FontContext): number | null {
  const direct = resolveDs(value, property, all);
  if (direct !== null || property !== "fontSize" || !ctx) return direct;
  const raw = value.replace(/\s*!important$/, "").trim();
  const m = raw.match(/^(-?\d*\.?\d+)(rem|em|%)$/);
  if (m) {
    const n = Number(m[1]);
    const base = m[2] === "rem" ? ctx.rootPx : ctx.parentPx;
    return base === null ? null : m[2] === "%" ? (n / 100) * base : n * base;
  }
  return raw === "inherit" ? ctx.parentPx : null;
}

const close = (a: number, b: number, property: SpecProperty) => Math.abs(a - b) <= (property === "fontSize" ? 0.5 : 0.01);

export interface SpecPartResult {
  observations: Observation[];
  /** Por que partes não foram comparadas (contagem por motivo), para o relato. */
  skipped: Record<string, number>;
  /** Elementos de partes comparados. */
  measured: number;
}

/**
 * Compara, nos elementos que a folha do DS estiliza como parte (um token da tabela do componente), o valor computado com
 * o token. Função pura sobre a evidência (testável sem navegador); `scanPartTokens` a alimenta na página viva.
 */
export function comparePartTokens(
  url: string,
  component: string,
  elements: ElementEvidence[],
  rows: TypographyRow[] = typographyRows(component),
  /** 3.7.6-pre.2: fonte computada da raiz e do pai, por localizador (para `rem`/`em`/`%` da página). */
  context: Map<string, FontContext> = new Map(),
): SpecPartResult {
  const all = getTokenRegistry().all;
  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const observations: Observation[] = [];
  const wanted = new Set(rows.flatMap((r) => r.pairs.map((p) => `${p.property}|${p.token}`)));
  let measured = 0;
  for (const el of elements) {
    if (ownershipOf(el) !== "page") { skip("fora-da-autoria-ou-oculto"); continue; }
    // os pares (propriedade, token da tabela) que a folha do DS aplica a ESTE elemento
    const elementPairs: Array<{ property: SpecProperty; token: string }> = [];
    for (const property of ["fontSize", "fontWeight"] as SpecProperty[]) {
      for (const value of el.dsShipped?.[property] ?? []) {
        const token = varOf(value);
        if (token && propertyOfToken(token) === property && wanted.has(`${property}|${token}`)) elementPairs.push({ property, token });
      }
    }
    if (!elementPairs.length) { skip("sem-token-da-tabela"); continue; }
    measured += 1;
    for (const property of ["fontSize", "fontWeight"] as SpecProperty[]) {
      const tokens = [...new Set(elementPairs.filter((p) => p.property === property).map((p) => p.token))];
      if (!tokens.length) continue;
      const authored = el.authored?.[property] ?? [];
      // Sem declaração da página para a propriedade: o valor é do DS (ou herdado) — nada a cobrar da página.
      if (!authored.length) continue;
      const observedRaw = el.computed[property];
      const observed = observedRaw === undefined ? null : numeric(String(observedRaw), property);
      if (observed === null) { skip("valor-computado-nao-numerico"); continue; }
      // O valor que o próprio DS declara para o elemento (variante, estado, reset) não é desvio da página.
      const expected = (el.dsShipped?.[property] ?? []).map((v) => resolveDs(v, property, all)).filter((v): v is number => v !== null);
      if (expected.some((v) => close(observed, v, property))) continue;
      // E o desvio é da página só quando o valor computado é o que a página declarou (o `100%` de um reset do DS, que não
      // se resolve sem o pai, não decide nada: quem decide é a declaração da página que venceu).
      const fromPage = authored.map((v) => resolvePage(v, property, all, context.get(el.locator))).filter((v): v is number => v !== null);
      if (!fromPage.some((v) => close(observed, v, property))) { skip("valor-autoral-nao-atribuido"); continue; }
      // a parte: as linhas com o par desta propriedade, as que casam mais pares do elemento
      const candidates = rows.filter((r) => r.pairs.some((p) => p.property === property && tokens.includes(p.token)));
      const score = (r: TypographyRow) => r.pairs.filter((p) => elementPairs.some((q) => q.property === p.property && q.token === p.token)).length;
      const best = Math.max(...candidates.map(score));
      const parts = candidates.filter((r) => score(r) === best);
      if (parts.length > 3) { skip("parte-ambigua"); continue; }
      const token = parts[0].pairs.find((p) => p.property === property && tokens.includes(p.token))!.token;
      const expectedValue = all[token];
      const css = CSS_NAME[property];
      const names = [...new Set(parts.map((p) => p.part))];
      observations.push({
        kind: SPEC_PART_KIND,
        element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: url },
        note: `${component} · parte "${names.join('" | "')}": ${css} ${observedRaw}; a especificação do DS dá ${token} (${expectedValue}). Unidade${parts.length > 1 ? "s" : ""}: ${parts.map((p) => p.id).join(", ")} (especificacao).`,
        whyNotAFinding:
          "Unidade de especificação (tabela de Especificações do componente): descreve o valor da parte, não obriga. Candidata a investigar; para afirmar violação, cite a norma que obriga.",
        data: {
          component,
          property: css,
          observed: String(observedRaw),
          token,
          expected: expectedValue,
          parts: names,
          unitIds: parts.map((p) => p.id),
          ...(parts.length > 1 ? { ambiguous: true } : {}),
          specUnit: { id: parts[0].id, force: "especificacao" },
          authoredDeclarations: authored,
          dsDeclarations: el.dsShipped?.[property] ?? [],
        },
      });
    }
  }
  return { observations, skipped, measured };
}

/** Na página viva: os componentes encontrados com seletores de parte; um inspect por componente (atribuição certa). */
export async function scanPartTokens(page: Page, url: string, components: string[]): Promise<SpecPartResult> {
  const out: SpecPartResult = { observations: [], skipped: {}, measured: 0 };
  const seen = new Set<string>();
  for (const component of components) {
    const rows = typographyRows(component);
    const selectors = partSelectors(component, rows).map((s) => s.selector);
    if (!selectors.length) continue;
    let elements: ElementEvidence[];
    try {
      elements = (await inspectPageComputedStyles(page, url, selectors, ["fontSize", "fontWeight"] as StyleProperty[])).elements;
    } catch {
      out.skipped["seletor-nao-consultavel"] = (out.skipped["seletor-nao-consultavel"] ?? 0) + 1;
      continue;
    }
    const r = comparePartTokens(url, component, elements, rows, await fontContexts(page, elements.filter((el) => ownershipOf(el) === "page").map((el) => el.locator)));
    out.measured += r.measured;
    for (const [k, v] of Object.entries(r.skipped)) out.skipped[k] = (out.skipped[k] ?? 0) + v;
    for (const o of r.observations) {
      const key = `${o.element.locator}|${(o.data as { property: string }).property}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.observations.push(o);
    }
  }
  return out;
}

/** 3.7.6-pre.2: a fonte computada da raiz e do pai de cada elemento (localizadores do DOM claro; os demais ficam sem contexto). */
async function fontContexts(page: Page, locators: string[]): Promise<Map<string, FontContext>> {
  if (!locators.length) return new Map();
  try {
    const rows = await page.evaluate((list: string[]) => {
      const px = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : NaN);
      const root = px(document.documentElement);
      return list.map((loc) => {
        let el: Element | null = null;
        try { el = loc.includes(">>>") ? null : document.querySelector(loc); } catch { el = null; }
        const parent = el?.parentElement ?? null;
        return { loc, rootPx: Number.isFinite(root) ? root : null, parentPx: el && parent && Number.isFinite(px(parent)) ? px(parent) : null };
      });
    }, locators);
    return new Map(rows.map((r) => [r.loc, { rootPx: r.rootPx, parentPx: r.parentPx }]));
  } catch {
    return new Map();
  }
}

export function resetPartSelectorCache(): void {
  selectorCache.clear();
}
