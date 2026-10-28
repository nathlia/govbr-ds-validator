/**
 * Proveniência das declarações CSS: o que a página escreveu × o que o próprio DS publica.
 *
 * `getComputedStyle` não diz de quem é o valor, e a folha de estilo também não: num site real o
 * `core.css` do gov.br DS chega empacotado no mesmo arquivo que o CSS da página, então a origem do
 * arquivo não separa as duas autorias. O que separa é o conteúdo — uma declaração cujo seletor,
 * propriedade e valor coincidem com os da folha oficial é o DS falando, não a página.
 *
 * Sem essa separação os verificadores de token acusavam a folha do próprio DS: o raio de 6px do
 * `.br-textarea textarea`, o `margin-top: -2px` do `.br-select .br-list`, o `padding-right: 29px`
 * do campo do select. A página usa o componente como o DS o publica e não tem o que corrigir
 * (D-51: 5 das 7 alegações falsas do validator na tela A).
 *
 * O índice (`data/ds-stylesheet.json`) é gerado por `npm run build:data` lendo a folha oficial pelo
 * CSSOM do mesmo navegador que mede as páginas: seletor e valor saem serializados do mesmo jeito
 * dos dois lados, então a comparação é por igualdade.
 */
import type { ComputedStyleEvidence } from "./types.js";

/** Propriedades CSS que alimentam cada propriedade computada inspecionada. */
export const AUTHORED_CSS_NAMES: Record<keyof ComputedStyleEvidence, string[]> = {
  backgroundColor: ["background-color", "background"],
  color: ["color"],
  fontFamily: ["font-family", "font"],
  fontSize: ["font-size", "font"],
  fontWeight: ["font-weight", "font"],
  lineHeight: ["line-height", "font"],
  borderRadius: ["border-radius", "border"],
  borderColor: ["border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "border", "border-top", "border-right", "border-bottom", "border-left"],
  border: ["border", "border-top", "border-right", "border-bottom", "border-left"],
  padding: ["padding", "padding-top", "padding-right", "padding-bottom", "padding-left"],
  margin: ["margin", "margin-top", "margin-right", "margin-bottom", "margin-left"],
  outline: ["outline"],
  cursor: ["cursor"],
  opacity: ["opacity"],
};

/** Todas as propriedades CSS que o índice do DS precisa cobrir. */
export const INDEXED_CSS_NAMES: string[] = [...new Set(Object.values(AUTHORED_CSS_NAMES).flat())].sort();

/** seletor → propriedade CSS → valores declarados pela folha oficial (com ` !important` quando houver). */
export interface DsStylesheetIndex {
  meta: { source: string; version: string; generatedAt: string; files: string[]; selectors: number; declarations: number };
  declarations: Record<string, Record<string, string[]>>;
}

/** Uma declaração que alcança o elemento, como o navegador a devolve. `selectorText` nulo = estilo inline. */
export interface RawDeclaration {
  property: keyof ComputedStyleEvidence;
  cssName: string;
  value: string;
  selectorText: string | null;
}

/** Divide uma lista de seletores nas vírgulas de nível superior — `:is(a, b)` e `[x="a,b"]` ficam inteiros. */
export function splitSelectorList(selectorText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i];
    if (quote) {
      current += ch;
      if (ch === "\\") { current += selectorText[i + 1] ?? ""; i += 1; }
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

/**
 * A declaração é do DS quando TODOS os seletores da regra estão no índice com a mesma propriedade
 * e o mesmo valor. Todos, e não algum: um empacotador só funde regras do DS com regras do DS, e
 * uma regra da página que pegue carona num seletor oficial (`.minha, .br-textarea textarea`)
 * continua sendo escolha da página. Estilo inline nunca é do DS.
 */
export function isDsShipped(index: DsStylesheetIndex, declaration: RawDeclaration): boolean {
  if (declaration.selectorText === null) return false;
  const selectors = splitSelectorList(declaration.selectorText);
  return selectors.length > 0 && selectors.every(
    (selector) => index.declarations[selector]?.[declaration.cssName]?.includes(declaration.value) ?? false,
  );
}

export interface PartitionedDeclarations {
  authored: Partial<Record<keyof ComputedStyleEvidence, string[]>>;
  dsShipped: Partial<Record<keyof ComputedStyleEvidence, string[]>>;
}

/** Separa, preservando a ordem das folhas, o que a página declarou do que a folha oficial declara. */
export function partitionDeclarations(raw: RawDeclaration[], index: DsStylesheetIndex): PartitionedDeclarations {
  const out: PartitionedDeclarations = { authored: {}, dsShipped: {} };
  for (const declaration of raw) {
    const side = isDsShipped(index, declaration) ? out.dsShipped : out.authored;
    (side[declaration.property] ??= []).push(declaration.value);
  }
  return out;
}
