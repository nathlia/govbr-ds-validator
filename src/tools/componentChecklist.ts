/**
 * 3.5.0 (D-155, item 2): lista de verificação de um componente do DS — as cláusulas OBRIGATÓRIAS e
 * PROIBIÇÕES do componente na base servida, cada uma com o id citável, a força e como medi-la: o que o
 * oráculo mede sozinho (scan_page / verify_finding com a condição estruturada) ou, sem medida automática,
 * o que observar no navegador conforme a estratégia de verificação que a base declara. É pendência para
 * o agente, nunca veredito: nada aqui diz que a página cumpre ou viola.
 *
 * Servida por `get_component_spec{component, view:"checklist", cursor}`, dentro do teto da resposta.
 */
import { filterRules, getRuleById, type KnowledgeRule } from "../data/knowledge.js";
import { relatedFor } from "../data/relations.js";
import { lostExceptionOf } from "../data/lostExceptions.js";
import { isTitleRecord, listingOrder } from "../responses/retrieval.js";
import { CONTRACT, MESSAGES, RESPONSE_BUDGET, budgetPage, step, textSize } from "../responses/contract.js";
import { oracleFullyMeasures, oracleMeasuresFor, type OracleMeasure } from "./oracleCoverage.js";
import { ARIA_STATE_CONDITION } from "../checkers/ariaNativeState.js";
import { getComponentSpecs } from "../data/load.js";
import { BUTTON_LABEL_ANATOMY, BUTTON_LABEL_LEGACY, BUTTON_LABEL_REQUIRED } from "../checkers/iconOnlyButton.js";
import { literalProcedure } from "./literalProcedures.js";
import type { procedureScope } from "./procedureScope.js";

export const CHECKLIST_TEXT_MAX = 180;
const STRONG = new Set(["required", "prohibited"]);

const plain = (text: string) =>
  text.replace(/[*_`]/g, "").replace(/\s*\|\s*/g, " · ").replace(/^[·\s]+|[·\s]+$/g, "").replace(/\s+/g, " ").trim();

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const space = slice.lastIndexOf(" ");
  return `${(space > max * 0.6 ? slice.slice(0, space) : slice).trimEnd()}…`;
}

/** Propriedades CSS que o texto da cláusula nomeia (pista para medir; não interpreta a cláusula). */
function propertyHints(text: string): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  const add = (cond: boolean, ...props: string[]) => cond && props.forEach((p) => !out.includes(p) && out.push(p));
  add(/\bcor(es)?\b|colou?r|contraste|fundo/.test(t), "color", "background-color");
  add(/borda|border|contorno/.test(t), "border-color", "border-width");
  add(/fonte|tipograf|texto|peso|negrito|font/.test(t), "font-size", "font-weight", "font-family");
  add(/espaç|margem|margin|padding|distância|afastamento/.test(t), "padding", "margin");
  add(/altura|largura|tamanho|dimens|width|height/.test(t), "width", "height");
  add(/raio|arredond|canto|radius/.test(t), "border-radius");
  add(/sombra|shadow|elevaç/.test(t), "box-shadow");
  add(/foco|focus/.test(t), "outline", "box-shadow");
  return out.slice(0, 5);
}

/**
 * 3.6.5 (D-155, item 5b; rastreio dev-364 §2, A-11 p01): a cláusula fala de POSIÇÃO VISUAL (esquerda, direita, topo,
 * acima, abaixo, embaixo, centralizado) ou de ORDEM que não é de foco/teclado/leitura. Pista lida do texto,
 * como `propertyHints`: não interpreta a cláusula, só diz que ela também se mede por geometria — a base a classifica às
 * vezes como "semantic" ("julgue pelo conteúdo"). Revisão: ordem de tabulação, de foco ou de leitura não é posição visual.
 */
// "alinhado"/"posicionado" sozinhos não bastam ("alinhado com o tom de voz"): a posição vem do lugar que a cláusula nomeia.
const VISUAL_POSITION = /\b(esquerda|direita|topo|acima|abaixo|embaixo|centralizad[oa]s?)\b/i;
const NON_VISUAL_ORDER = /tabula|\bfoco\b|teclado|\btab\b|leitor|leitura|navega/i;

export function positionHint(text: string): boolean {
  return VISUAL_POSITION.test(text) || (/\bordem\b/i.test(text) && !NON_VISUAL_ORDER.test(text));
}

/** Estratégias em que a geometria não é a medida (operar pelo teclado; código-fonte). */
const NO_GEOMETRY = new Set(["keyboard-interaction", "source-code"]);

/** A cláusula se mede também por geometria (posição/ordem visual, numa estratégia observável na página). */
export function geometryHint(rule: KnowledgeRule): boolean {
  return !NO_GEOMETRY.has(rule.validationStrategy) && positionHint(rule.originalText ?? "");
}

const GEOMETRY_HOW = "getBoundingClientRect() relativo à raiz do componente e a ordem no DOM; registre os números";

/** Estratégias que se medem na página renderizada (as demais pedem juízo ou não são observáveis). */
const MEASURABLE = new Set(["computed-style", "dom", "accessibility-tree", "keyboard-interaction", "responsive-viewport"]);

/** Sem medida automática: o que observar, pela estratégia de verificação que a base declara (+ geometria, quando é posição). */
function manualMeasure(rule: KnowledgeRule): { how: string; properties?: string[]; geometry?: string } {
  const base = strategyMeasure(rule);
  return geometryHint(rule) ? { ...base, geometry: GEOMETRY_HOW } : base;
}

function strategyMeasure(rule: KnowledgeRule): { how: string; properties?: string[] } {
  switch (rule.validationStrategy) {
    case "computed-style": {
      const properties = propertyHints(rule.originalText);
      return { how: "leia getComputedStyle no elemento do componente, no estado em que ele aparece", ...(properties.length ? { properties } : {}) };
    }
    case "dom":
      return { how: "leia no DOM o elemento/atributo que a cláusula cita (presença, valor, ordem) no estado em que o componente aparece" };
    case "accessibility-tree":
      return { how: "leia papel, nome e estado na árvore de acessibilidade (snapshot do navegador)" };
    case "keyboard-interaction":
      return { how: "opere só pelo teclado (Tab, Shift+Tab, Enter, Espaço, Esc, setas) e registre document.activeElement e o que muda" };
    case "source-code":
      return { how: "não observável na página renderizada: declare como não verificado" };
    case "responsive-viewport":
      return { how: "meça em outra largura de janela (a do scan é uma só)" };
    case "visual":
    case "manual":
      return { how: "observe na captura de tela do estado e registre o que viu" };
    default:
      return { how: "julgue pelo conteúdo e uso na página, com o estado na frente; registre o que leu e a dúvida" };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3.7.0 (D-155/D-159): mensurabilidade e procedimento de medida por cláusula
// ════════════════════════════════════════════════════════════════════════════
//
// Nos trios dev-364 o agente com o oráculo não PUXOU a lista de verificação (tela B: zero get_component_spec em 3
// execuções; tela A: 1 de 15 investigate seguidos). A 3.7.0 EMPURRA para o scan as cláusulas que se medem e ordena a
// lista por mensurabilidade.
//
// Revisão da 3.7.0 (ALTA): a estratégia de verificação declarada na base (`dom`, `computed-style`) não basta — a 1ª
// versão empurrava "deve ser ignorado pelos leitores" ou "O HTML Base do componente" com "espera: presente", uma
// expectativa que a cláusula não diz (lida como norma do oráculo, convida falso positivo). Agora uma cláusula só tem
// PROCEDIMENTO quando o próprio texto dá o que medir E o valor: a parte obrigatória da anatomia ("| n | Parte | … |
// Obrigatório |"), uma dimensão em px, um atributo citado entre crases (com a força dando presente/ausente), ou uma
// posição visual nomeada. Só essas são empurradas no investigate e ficam no topo da lista; o resto fica na lista como
// julgamento, sem expectativa inventada. Nada por tela, nada por gabarito.

/**
 * Postos de mensurabilidade, do mais mensurável ao que pede juízo; `source` = não observável na página. dom-css: atributo
 * citado ou área mínima em px; geometry: lugar nomeado ("à esquerda"); anatomy: parte obrigatória da tabela de anatomia
 * (o nome da parte não é seletor: o agente a localiza).
 */
export const MEASURABILITY = ["dom-css", "geometry", "anatomy", "keyboard", "viewport", "visual", "judgement", "source"] as const;
export type Measurability = (typeof MEASURABILITY)[number];

/** Linha de tabela de anatomia ("| 2 | Rótulo | … | Obrigatório |"), lida já sem markdown (`plain`). */
const ANATOMY_ROW = /^\|?\s*\d+\s*·?\s*([^·|]+?)\s*·.*\bObrigat[óo]rio\b/i;
/** Dimensão mínima em px ("48x48px"). */
const SIZE = /(\d+)\s*[x×]\s*(\d+)\s*px/i;
/** Atributo HTML/ARIA citado entre crases: `aria-hidden="true"`, `title`, `role="dialog"`. */
const ATTRIBUTE = /^(aria-[a-z]+|role|title|alt|tabindex|lang|for|id|href|scope|type)(\s*=\s*("[^"]*"|'[^']*'|[^\s"']+))?$/i;
/** Cláusula condicional: a expectativa depende de um caso que o texto abre ("Quando…", "Caso…", "… do tipo icônico…"). */
const CONDITIONAL = /^(?:[a-z0-9]{1,2}\s*[-–.)]\s*|aten[çc][ãa]o:\s*)?(se|ao|em caso|nos? casos?|em layouts|em telas|aqui)\b|(?:^|[^\p{L}])(quando|caso|sempre que|do tipo|se houver)(?=[^\p{L}]|$)/iu;
/** Área mínima de interação/toque/clique (a dimensão em px de outra coisa — o tamanho de uma variante — não é procedimento). */
const AREA = /(?:^|[^\p{L}])[áa]rea(?=[^\p{L}]|$)/iu;
/** Lugar nomeado ("à esquerda", "no topo"); "acima de duas linhas" ou "abaixo do campo" não são posição medível. */
const PLACE = /(?:^|\s)(?:à|a|na|no|ao)\s+(esquerda|direita|topo)(?=[^\p{L}]|$)/giu;
/** Ordem de navegação, foco ou gesto não é lugar na tela (a geometria não a mede). */
const NOT_A_PLACE = /navega|\bfoco\b|teclado|\btab\b|swipe|arrast/i;

const TOUCH = /dispositivos? m[óo]ve(l|is)|\bmobile\b|\btouch\b|\btoque\b/i;

export interface Procedure {
  /** Escopo herdado literal; formas compactas devem diferir, não apagar esse contexto. */
  context?: NonNullable<ReturnType<typeof procedureScope>>;
  /** O que selecionar na página. */
  select: string;
  /** O que medir nele. */
  measure: string;
  /** O valor esperado — o que a cláusula DIZ (ou o que ela proíbe). */
  expect: string;
  /** Quando a cláusula só vale numa condição que o scan não reproduz (ex.: janela de toque/móvel). */
  when?: string;
  /** Presente quando o procedimento é do ORÁCULO e não está na letra da cláusula servida (ex.: exceção perdida). */
  provenance?: string;
}

/**
 * Procedimentos do oráculo para cláusulas cuja letra servida não basta para medir sem erro. Só o que um check do oráculo
 * mede com o mesmo critério: o rótulo obrigatório do Button perdeu a exceção do circular na base literal — sem ela, todo
 * botão circular "violaria" (iconOnlyButton.ts).
 */
const ORACLE_PROCEDURES: Record<string, Procedure> = Object.fromEntries(
  [BUTTON_LABEL_REQUIRED, BUTTON_LABEL_ANATOMY].map((id) => [
    id,
    {
      select: ".br-button (<button>/<a>) exibido",
      measure: "texto visível (sr-only não conta) e ícones (i/svg/img); a classe circle",
      expect: "só ícone ⇒ classe circle (variante circular); senão, rótulo visível",
      provenance: `procedimento do oráculo, não letra da cláusula: a exceção do circular está no legado ${BUTTON_LABEL_LEGACY} ("A exceção ocorre na versão tipo circular…"), que a base literal perdeu; o check icon-only-button mede isto`,
    },
  ]),
);

/**
 * O procedimento que o TEXTO da cláusula permite derivar — o que selecionar, o que medir e o valor que ela mesma diz — ou
 * `null` quando o texto não dá os dois (a cláusula fica como julgamento). Lido do texto, nunca da página.
 */
export function procedureOf(rule: KnowledgeRule, component?: string | null): Procedure | null {
  const oracle = ORACLE_PROCEDURES[rule.id];
  if (oracle) return oracle;
  if (rule.validationStrategy === "source-code") return null;
  const text = plain(rule.originalText ?? "");
  const comp = component ?? rule.component;
  const root = comp ? (getComponentSpecs().components[comp]?.rootClass ?? `br-${comp}`) : null;
  const select = root ? `.${root}` : "o elemento citado";
  const prohibited = rule.force === "prohibited";
  const when = TOUCH.test(text) ? "janela de toque/móvel (o scan mede 1280×900 sem toque): meça com emulação móvel ou declare não medida" : undefined;
  const out = (measure: string, expect: string, sel = select): Procedure => ({ select: sel, measure, expect, ...(when ? { when } : {}) });
  const anatomy = ANATOMY_ROW.exec(text);
  if (anatomy) return out(`a parte "${anatomy[1].trim()}" em cada ${select}`, "presente e visível");
  const literal = literalProcedure(rule, select);
  if (literal) return literal;
  if (CONDITIONAL.test(text) || (rule.conditions ?? []).length > 0) return null;
  const size = AREA.test(text) ? SIZE.exec(text) : null;
  if (size) return out("getBoundingClientRect() da área clicável", `≥ ${size[1]}×${size[2]}px`, root ? `${select} interativo` : "controle (button, a, [role=button]) com ícone");
  const attribute = [...(rule.originalText ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).find((c) => ATTRIBUTE.test(c));
  if (attribute && (rule.validationStrategy === "dom" || rule.validationStrategy === "accessibility-tree" || rule.validationStrategy === "computed-style")) {
    // Valor literal curto (`aria-hidden="true"`) é o esperado; valor em prosa ("nome descritivo…") só diz "não vazio".
    const value = /=\s*["']?([^"']*)["']?$/.exec(attribute)?.[1];
    const literal = value !== undefined && /^[\w-]{1,24}$/.test(value);
    const name = attribute.split("=")[0].trim();
    const expect = prohibited ? "ausente" : literal ? "presente com esse valor" : value !== undefined ? "presente e não vazio" : "presente";
    return out(`o atributo ${literal ? attribute : name} nos elementos que a cláusula nomeia`, expect);
  }
  const places = geometryHint(rule) && !NOT_A_PLACE.test(text) ? [...new Set([...text.matchAll(PLACE)].map((m) => m[1].toLowerCase()))] : [];
  if (places.length) return out("getBoundingClientRect() relativo à raiz e a ordem no DOM", `posição: ${places.map((w) => (w === "topo" ? "no topo" : `à ${w}`)).join(" e ")}`);
  return null;
}

export function measurabilityOf(rule: KnowledgeRule): Measurability {
  const proc = procedureOf(rule);
  if (proc) return proc.measure.startsWith("getBoundingClientRect() relativo") ? "geometry" : proc.measure.startsWith("a parte ") ? "anatomy" : "dom-css";
  switch (rule.validationStrategy) {
    case "keyboard-interaction":
      return "keyboard";
    case "responsive-viewport":
      return "viewport";
    case "source-code":
      return "source";
    case "visual":
    case "manual":
      return "visual";
    default:
      return "judgement";
  }
}

const rankOf = (rule: KnowledgeRule) => MEASURABILITY.indexOf(measurabilityOf(rule));

/** Ordem estável por mensurabilidade (empate: a ordem da listagem da base). */
export function byMeasurability<T extends { rule: KnowledgeRule }>(items: T[]): T[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => rankOf(a.item.rule) - rankOf(b.item.rule) || a.i - b.i).map(({ item }) => item);
}

/** O procedimento numa linha (investigate e o `how` da lista). */
export function procedureLine(p: Procedure, max = 160): string {
  return cut(`${p.select} → ${p.measure} → espera: ${p.expect}${p.when ? ` (só em ${p.when.split(" (")[0]})` : ""}${p.provenance ? " [oráculo]" : ""}`, max);
}

/** Sem procedimento derivável: o que fazer, sem valor esperado (a cláusula pede juízo). */
const JUDGEMENT_HOW = "julgamento: o texto não dá o que medir nem o valor; registre o que leu";
/** 3.7.3 A8: cláusula medida em parte pelo oráculo (oracle[].limitation diz qual parte); o resto, com a receita que falta. */
const PARTIAL_HOW = "parcial: o oráculo mede o estado alcançado (oracle); meça os demais estados com actions e registre o que mediu";

function measureOf(rule: KnowledgeRule, component?: string): Record<string, unknown> {
  const oracle = oracleMeasuresFor(rule.id);
  if (oracle.length) {
    const own = ORACLE_PROCEDURES[rule.id];
    return {
      automatic: oracleFullyMeasures(rule.id),
      oracle: oracle.map((m: OracleMeasure) => ({
        ...(m.tool === "scan_page" ? { tool: m.tool, check: m.check } : { tool: m.tool, expectedCondition: m.expectedCondition }),
        ...(m.coverage ? { coverage: m.coverage, limitation: m.limitation } : {}),
      })),
      // 3.7.0: a medida do próprio oráculo dita como procedimento, quando a letra servida não basta (exceção perdida).
      ...(own ? { procedure: own } : {}),
      // 3.7.3 A8: medida parcial (só o estado alcançado): o restante tem o seu `how` — o procedimento da letra, quando há.
      ...(oracle.some((m) => m.expectedCondition === ARIA_STATE_CONDITION) && !oracleFullyMeasures(rule.id) ? { how: (() => { const proc = procedureOf(rule, component); return proc ? procedureLine(proc) : PARTIAL_HOW; })() } : {}),
    };
  }
  // 3.7.0: com procedimento derivável, `how` é ele (o que selecionar → o que medir → o valor que a cláusula diz). Sem ele, a
  // cláusula é julgamento: teclado, outra largura e captura mantêm a instrução da estratégia (sem valor esperado); as demais
  // dizem que é juízo — nada de "espera:" que a cláusula não diz.
  const proc = procedureOf(rule, component);
  const base = manualMeasure(rule);
  if (proc) return { automatic: false, strategy: rule.validationStrategy, ...base, how: procedureLine(proc), ...(proc.when ? { when: proc.when } : {}), ...(proc.context ? { procedure: proc } : {}) };
  const keepsStrategy = ["keyboard-interaction", "responsive-viewport", "source-code", "visual", "manual"].includes(rule.validationStrategy);
  const { properties: _p, ...rest } = base;
  return { automatic: false, strategy: rule.validationStrategy, ...(keepsStrategy ? base : { ...rest, how: JUDGEMENT_HOW }) };
}

/** Obrigações e proibições do componente (sem registros-título), na ordem da listagem da base. */
export function checklistRules(component: string): KnowledgeRule[] {
  return listingOrder(filterRules({ component })).filter((r) => STRONG.has(r.force) && !isTitleRecord(r));
}

/**
 * 3.6.5 (D-155, item 5): as obrigações/proibições do componente que nenhum check mede e que se medem na página
 * (estratégia observável, ou posição/ordem por geometria) — viram pendências da sessão quando a lista é lida.
 */
export function checklistPendingClauses(component: string): Array<{ id: string; force: string; text: string }> {
  return checklistRules(component)
    .filter((r) => !oracleFullyMeasures(r.id) && (MEASURABLE.has(r.validationStrategy) || geometryHint(r)))
    .map((r) => ({ id: r.id, force: r.force, text: cut(plain(r.originalText), 100) }));
}

/**
 * 3.7.0 (D-155/D-159; rastreio dev-364; revisão ALTA): as cláusulas que o scan EMPURRA no investigate — as
 * obrigações/proibições que nenhum check julga e cujo TEXTO dá um procedimento (procedureOf ≠ null), por mensurabilidade,
 * cada uma com o id citável, a letra curta e o procedimento numa linha. `total` = quantas há (as demais pela lista).
 */
export function investigateClauses(component: string, max = 2): { total: number; clauses: Array<{ citeAs: string; text: string; how: string; short: string }> } {
  const ranked = byMeasurability(checklistRules(component).filter((r) => !oracleFullyMeasures(r.id) && procedureOf(r, component) !== null).map((rule) => ({ rule })));
  return {
    total: ranked.length,
    clauses: ranked.slice(0, max).map(({ rule }) => {
      const proc = procedureOf(rule, component)!;
    return { citeAs: rule.id, text: cut(plain(rule.originalText), 90), how: proc.context ? "Contexto e procedimento diferidos: leia o checklist deste componente (next)." : procedureLine(proc, 150), short: procedureShort(proc) };
    }),
  };
}

/**
 * 3.7.0 (revisão da reexecução, lacuna A): o procedimento na forma mínima, para a forma compacta do investigate no teto
 * padrão — sem o seletor (o componente já está na chave) e sem "espera:"; o valor que a cláusula diz fica. ≤ 70 caracteres.
 */
export function procedureShort(p: Procedure): string {
  if (p.context) return "contexto/procedimento: checklist deste componente";
  const part = /^a parte "(.+)" em cada /.exec(p.measure);
  const touch = p.when ? " (toque/móvel)" : "";
  if (part) return cut(`parte "${part[1]}" ${p.expect}`, 70);
  if (p.measure.startsWith("getBoundingClientRect() relativo")) return cut(`${p.expect} (geometria)`, 70);
  if (p.measure.startsWith("getBoundingClientRect() da área")) return cut(`área clicável ${p.expect}${touch}`, 70);
  const attr = /^o atributo (.+) nos elementos/.exec(p.measure);
  if (attr) return cut(`${attr[1]}: ${p.expect}`, 70);
  return cut(`${p.measure} → ${p.expect}`, 70);
}

/**
 * 3.7.2 (rastreio dev-371-a §7, A-11 p01: a consulta sobre o foco da mensagem devolveu 1 cláusula e parou no piso de
 * relevância; as 2 de posição do mesmo componente nunca chegaram): uma linha para o get_ds_rules com `component` — as
 * OUTRAS cláusulas mensuráveis do componente que nenhum check mede (as que a resposta não mostrou) e a chamada do checklist.
 * null quando não há outra.
 */
export const COMPONENT_CLAUSES_LINE_MAX = 320;
export function otherMeasurableClausesLine(component: string, shown: (id: string) => boolean): string | null {
  const others = investigateClauses(component, Number.POSITIVE_INFINITY).clauses.filter((c) => !shown(c.citeAs));
  if (!others.length) return null;
  const call = ` → get_component_spec{component:"${component}", view:"checklist"}`;
  for (let k = Math.min(2, others.length); k >= 0; k--) {
    const listed = others.slice(0, k).map((c) => `${c.citeAs} (${c.short})`).join("; ");
    const more = others.length - k;
    const line = `${component}: ${others.length} outra(s) cláusula(s) mensurável(is) que nenhum check mede${listed ? ` — ${listed}` : ""}${more > 0 && k > 0 ? ` +${more}` : ""}${call}`;
    if (line.length <= COMPONENT_CLAUSES_LINE_MAX || k === 0) return line;
  }
  return null;
}

/** Quantas obrigações/proibições do componente nenhum check ou predicado do oráculo mede. */
export function unmeasuredStrongCount(component: string): { strong: number; unmeasured: number } {
  const rules = checklistRules(component);
  return { strong: rules.length, unmeasured: rules.filter((r) => !oracleFullyMeasures(r.id)).length };
}

export interface ChecklistExtras {
  /** 3.6.5 (item 3b): obrigações globais dos elementos da marcação do componente (exampleAudit.elementObligations). */
  elementObligations?: { note: string; items: unknown[]; textsNext?: unknown };
  /** 3.6.5 (item 5): citeAs → pendingId da sessão. */
  pendingIds?: Record<string, string>;
  /**
   * 3.6.5 (revisão): por que as obrigações mensuráveis desta lista não viraram pendência — o perfil não tem scan_page,
   * ou nenhum scan desta sessão encontrou o componente.
   */
  pendingStatus?: "no-scan-tool" | "component-not-found";
  /** Interno: a 1ª página não coube as obrigações; elas vão na última. */
  obligationsDeferred?: boolean;
}

/**
 * 3.6.5 (reexecução das chamadas reais): os acréscimos da 3.6.5 (pendingId, geometria, obrigações dos elementos, nota de
 * pendência) nunca tiram item próprio do componente da página. O limite da página é decidido como na 3.6.4 (itens sem
 * acréscimo); depois os acréscimos entram na ordem e encolhem até caber: obrigações inteiras → ponteiro → fora; nota →
 * curta; geometria → marca; nota → fora. Só se nem assim couber (não visto nas chamadas reais), a página volta a ser
 * medida com os acréscimos.
 */
type Level = {
  obligations: "full" | "pointer" | "none";
  note: "full" | "short" | "none";
  geometry: "full" | "marker" | "none";
  pendingIds: boolean | number;
  /** 3.6.6: a nota geral da lista, inteira ou curta (o último recurso para caber a nota curta de pendência). */
  general?: "full" | "short";
};
const BASE: Level = { obligations: "none", note: "none", geometry: "none", pendingIds: false };
const LADDER: Level[] = [
  { obligations: "full", note: "full", geometry: "full", pendingIds: true },
  { obligations: "pointer", note: "full", geometry: "full", pendingIds: true },
  { obligations: "none", note: "full", geometry: "full", pendingIds: true },
  { obligations: "none", note: "short", geometry: "full", pendingIds: true },
  { obligations: "none", note: "short", geometry: "marker", pendingIds: true },
  { obligations: "none", note: "short", geometry: "none", pendingIds: true },
  // Depois: os ids nos primeiros k itens que couberem, do maior k ao menor — para cada k, a nota geral inteira e, se não
  // couber, a curta; por último nenhum id. 3.6.6 (revisão da 3.6.5, MÉDIA 4): a nota curta de pendência
  // nunca sai (a 3.6.5 descia a "sem nota nem id" em modal@0, step@0, carousel@0 e checkbox@19); a nota geral curta abre
  // o espaço dela — a página da 3.6.4 cabia com a nota geral inteira, e a curta + a nota de pendência curta é menor.
];
const LAST: Level[] = [
  { obligations: "none", note: "short", geometry: "none", pendingIds: false },
  { obligations: "none", note: "short", geometry: "none", pendingIds: false, general: "short" },
];

const GENERAL_NOTE =
  "Pendências suas, não veredito: cada obrigação/proibição do componente na base, com como medi-la. " +
  "automatic:true = o oráculo mede (scan_page acha; verify_finding decide com a expectedCondition). " +
  "automatic:false = nenhum check decide integralmente; coverage:partial/limitation delimitam a parte medida. Meça o restante e cite o citeAs.";
const GENERAL_NOTE_SHORT = "Pendências suas, não veredito. automatic:false = sem decisão integral: meça o restante e cite o citeAs.";

/** Sem o texto da geometria: `geometry: true` marca a cláusula (ou nada, `drop`, para o limite da página da 3.6.4). */
function withoutGeometry<T extends { measure: Record<string, unknown> }>(item: T, drop = false): T {
  if (!("geometry" in item.measure)) return item;
  const { geometry: _g, ...measure } = item.measure;
  return { ...item, measure: drop ? measure : { ...measure, geometry: true } };
}

export function componentChecklist(component: string, cursor: number, budget = RESPONSE_BUDGET, extras: ChecklistExtras = {}): Record<string, unknown> {
  const rules = checklistRules(component);
  const pendingIds = extras.pendingIds ?? {};
  // 3.7.0: por mensurabilidade (DOM/CSS primeiro, juízo por último); no mesmo posto, o que nenhum check mede vem antes.
  const ranked = byMeasurability(rules.map((rule) => ({ rule, auto: oracleFullyMeasures(rule.id) })));
  const ordered = [...ranked].sort((a, b) => rankOf(a.rule) - rankOf(b.rule) || Number(a.auto) - Number(b.auto)).map((x) => x.rule);
  const baseItems = ordered.map((r) => {
    const lost = lostExceptionOf(r);
    return {
      citeAs: r.id,
      force: r.force,
      text: cut(plain(r.originalText), CHECKLIST_TEXT_MAX),
      // 3.5.0 (revisão, HIGH 2): a exceção que a base literal perdeu vai junto, como condição do item.
      ...(lost ? { condition: { code: lost.code, legacyId: lost.legacyId, text: lost.text, note: "não se aplica ao caso excetuado" } } : {}),
      measure: measureOf(r, component),
    };
  });
  const automatic = baseItems.filter((i) => i.measure.automatic).length;
  // Obrigações/proibições de fora do componente que a camada de relações liga a ele (ex.: rótulo × placeholder
  // do padrão Formulário para o Input). Só na 1ª página; "leia também", nunca aplicabilidade.
  const own = new Set(rules.map((r) => r.id));
  const related = cursor === 0
    ? relatedFor({ components: [component], exclude: own, max: 5 })
        .map((item) => getRuleById(item.id))
        .filter((r): r is KnowledgeRule => Boolean(r) && STRONG.has(r!.force))
        .map((r) => ({ citeAs: r.id, force: r.force, text: cut(plain(r.originalText), CHECKLIST_TEXT_MAX), measure: measureOf(r) }))
    : [];
  // 3.6.6 (revisão da 3.6.5, MÉDIA 4): a sessão registra pendência só da cláusula cujo pendingId foi MOSTRADO (o servidor
  // registra o que a página mostrou); a cláusula mensurável servida sem pendingId não é pendência registrada — a nota o diz.
  // A nota depende só do que a página mostra (candidatas da base × ids à vista), para o rascunho e a página final medirem igual.
  const hasPending = extras.pendingIds !== undefined;
  const candidates = hasPending ? new Set(checklistPendingClauses(component).map((c) => c.id)) : new Set<string>();
  const pendingNote = (level: Level, unshown: number) => {
    if (level.note === "none") return {};
    if (hasPending) {
      return {
        pendingNote: level.note === "full"
          ? "pendingId = pendência da sessão até ter estado: verify_finding citando citeAs, ou scan_page pendingResolved [{id, status, reason}]." +
            (unshown ? " Item mensurável sem pendingId não virou pendência: dê a ele um estado no relatório." : "")
          : unshown === 0
            ? "pendingId: verify_finding ou pendingResolved."
            : "pendingId: verify_finding ou pendingResolved; sem pendingId: dê estado no relatório.",
      };
    }
    if (extras.pendingStatus === "component-not-found") {
      return { pendingNote: level.note === "full" ? `Nenhum scan_page desta sessão encontrou ${component}: as obrigações mensuráveis não viraram pendência. Viram quando um scan o encontrar e você pedir a lista de novo.` : `Nenhum scan encontrou ${component}: sem pendências.` };
    }
    if (extras.pendingStatus === "no-scan-tool") {
      return { pendingNote: level.note === "full" ? "Este perfil não mede a página: as obrigações não viram pendência da sessão. Dê a cada obrigação um estado (medida, violada ou não se aplica) no seu relatório, citando o citeAs." : "Perfil sem medida da página: sem pendências." };
    }
    return {};
  };
  // As obrigações dos elementos vão na 1ª página quando cabem sem tirar item; senão, depois dos itens (na última página).
  const obligationsHere = () => {
    if (!extras.elementObligations) return false;
    if (cursor === 0) return true;
    return extras.obligationsDeferred === true;
  };
  const obligations = (level: Level) => {
    const ob = extras.elementObligations;
    if (!ob || !obligationsHere() || level.obligations === "none") return {};
    if (level.obligations === "full") return { elementObligations: ob };
    return { elementObligations: { count: ob.items.length, next: { tool: "get_component_spec", arguments: { component } } } };
  };
  const compose = (level: Level) => (page: typeof baseItems, next: number | null) => {
    let shown = 0;
    const idOf = (citeAs: string) => {
      if (!level.pendingIds || !pendingIds[citeAs]) return undefined;
      if (level.pendingIds !== true && shown >= level.pendingIds) return undefined;
      shown += 1;
      return pendingIds[citeAs];
    };
    const items = page.map((item) => {
      const { citeAs, ...rest } = item;
      const id = idOf(citeAs);
      const it = id ? { citeAs, pendingId: id, ...rest } : item;
      return level.geometry === "full" ? it : withoutGeometry(it, level.geometry === "none");
    });
    const unshown = items.filter((i) => candidates.has(i.citeAs) && !("pendingId" in i)).length;
    return {
    contract: CONTRACT,
    kind: "component-checklist",
    component,
    note: level.general === "short" ? GENERAL_NOTE_SHORT : GENERAL_NOTE,
    total: baseItems.length,
    automatic,
    unmeasured: baseItems.length - automatic,
    cursor: Math.min(cursor, baseItems.length),
    count: page.length,
    items,
    ...(related.length ? { related: { note: "Obrigações de fora do componente ligadas a ele pela camada de relações (leia também; não é aplicabilidade).", items: level.geometry === "full" ? related : related.map((r) => withoutGeometry(r, level.geometry === "none")) } } : {}),
    ...obligations(level),
    ...pendingNote(level, unshown),
    ...(next !== null
      ? { nextCursor: next, next: step("request-detail", "próximos itens da lista", "get_component_spec", { component, view: "checklist", cursor: next }) }
      : { end: MESSAGES["page-end"] }),
    ...(baseItems.length === 0 ? { absenceNote: "A base não tem obrigação nem proibição própria deste componente; isso descreve a base, não a página." } : {}),
    };
  };
  // O limite da página: o dos itens sem acréscimo (a página da 3.6.4).
  const strip = (item: (typeof baseItems)[number]) => withoutGeometry(item, true);
  const basePage = budgetPage(baseItems.map(strip), cursor, compose(BASE), budget);
  const start = Math.min(cursor, baseItems.length);
  const end = typeof basePage.nextCursor === "number" ? basePage.nextCursor : baseItems.length;
  const page = baseItems.slice(start, end);
  const next = end < baseItems.length ? end : null;
  if (cursor > 0 && next === null && extras.elementObligations && extras.obligationsDeferred === undefined) {
    // Última página: as obrigações vêm aqui se a 1ª não as trouxe.
    const first = componentChecklist(component, 0, budget, { ...extras, obligationsDeferred: false });
    return componentChecklist(component, cursor, budget, { ...extras, obligationsDeferred: first.elementObligations === undefined });
  }
  for (const level of LADDER) {
    const response = compose(level)(page, next);
    if (textSize(response) <= budget) return response;
  }
  // 3.6.6 (MÉDIA 4): só a cláusula com pendingId à vista vira pendência, então o número de ids vem antes da nota geral
  // inteira: para cada k (do maior ao menor), a nota geral inteira e, se não couber, a curta.
  const onPage = page.filter((item) => pendingIds[item.citeAs]).length;
  for (let k = onPage; k > 0; k--) {
    for (const general of ["full", "short"] as const) {
      if (k === onPage && general === "full") continue; // já tentado no último degrau da escada
      const response = compose({ obligations: "none", note: "short", geometry: "none", pendingIds: k === onPage ? true : k, general })(page, next);
      if (textSize(response) <= budget) return response;
    }
  }
  for (const level of LAST) {
    const response = compose(level)(page, next);
    if (textSize(response) <= budget) return response;
  }
  // Inalcançável no orçamento padrão (a nota geral curta + a nota de pendência curta são menores que a nota geral da
  // página da 3.6.4); com orçamento menor, a página volta a ser medida na forma do último degrau.
  return budgetPage(baseItems, cursor, compose(LAST[LAST.length - 1]), budget);
}
