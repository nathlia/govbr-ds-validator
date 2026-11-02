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
import { oracleMeasuresFor, type OracleMeasure } from "./oracleCoverage.js";

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

function measureOf(rule: KnowledgeRule): Record<string, unknown> {
  const oracle = oracleMeasuresFor(rule.id);
  if (oracle.length) {
    return {
      automatic: true,
      oracle: oracle.map((m: OracleMeasure) => (m.tool === "scan_page" ? { tool: m.tool, check: m.check } : { tool: m.tool, expectedCondition: m.expectedCondition })),
    };
  }
  return { automatic: false, strategy: rule.validationStrategy, ...manualMeasure(rule) };
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
    .filter((r) => oracleMeasuresFor(r.id).length === 0 && (MEASURABLE.has(r.validationStrategy) || geometryHint(r)))
    .map((r) => ({ id: r.id, force: r.force, text: cut(plain(r.originalText), 100) }));
}

/** Quantas obrigações/proibições do componente nenhum check ou predicado do oráculo mede. */
export function unmeasuredStrongCount(component: string): { strong: number; unmeasured: number } {
  const rules = checklistRules(component);
  return { strong: rules.length, unmeasured: rules.filter((r) => oracleMeasuresFor(r.id).length === 0).length };
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
type Level = { obligations: "full" | "pointer" | "none"; note: "full" | "short" | "none"; geometry: "full" | "marker" | "none"; pendingIds: boolean | number };
const BASE: Level = { obligations: "none", note: "none", geometry: "none", pendingIds: false };
const LADDER: Level[] = [
  { obligations: "full", note: "full", geometry: "full", pendingIds: true },
  { obligations: "pointer", note: "full", geometry: "full", pendingIds: true },
  { obligations: "none", note: "full", geometry: "full", pendingIds: true },
  { obligations: "none", note: "short", geometry: "full", pendingIds: true },
  { obligations: "none", note: "short", geometry: "marker", pendingIds: true },
  { obligations: "none", note: "short", geometry: "none", pendingIds: true },
  // Depois: os ids só nos primeiros itens que couberem (componentChecklist tenta do maior número ao menor); último
  // recurso, nenhum (as pendências seguem registradas; a nota curta diz como fechá-las).
];
const LAST: Level[] = [
  { obligations: "none", note: "short", geometry: "none", pendingIds: false },
  { obligations: "none", note: "none", geometry: "none", pendingIds: false },
];

/** Sem o texto da geometria: `geometry: true` marca a cláusula (ou nada, `drop`, para o limite da página da 3.6.4). */
function withoutGeometry<T extends { measure: Record<string, unknown> }>(item: T, drop = false): T {
  if (!("geometry" in item.measure)) return item;
  const { geometry: _g, ...measure } = item.measure;
  return { ...item, measure: drop ? measure : { ...measure, geometry: true } };
}

export function componentChecklist(component: string, cursor: number, budget = RESPONSE_BUDGET, extras: ChecklistExtras = {}): Record<string, unknown> {
  const rules = checklistRules(component);
  const pendingIds = extras.pendingIds ?? {};
  const baseItems = rules.map((r) => {
    const lost = lostExceptionOf(r);
    return {
      citeAs: r.id,
      force: r.force,
      text: cut(plain(r.originalText), CHECKLIST_TEXT_MAX),
      // 3.5.0 (revisão, HIGH 2): a exceção que a base literal perdeu vai junto, como condição do item.
      ...(lost ? { condition: { code: lost.code, legacyId: lost.legacyId, text: lost.text, note: "não se aplica ao caso excetuado" } } : {}),
      measure: measureOf(r),
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
  const hasPending = Object.keys(pendingIds).length > 0;
  const pendingNote = (level: Level) => {
    if (level.note === "none") return {};
    if (hasPending) {
      return {
        pendingNote: level.note === "full"
          ? "pendingId = pendência da sessão até ter estado: verify_finding citando citeAs, ou scan_page pendingResolved [{id, status, reason}]."
          : level.pendingIds === true
            ? "pendingId: verify_finding ou pendingResolved."
            : "As obrigações sem medida desta página (com ou sem pendingId à vista) são pendência: verify_finding citando citeAs.",
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
    return {
    contract: CONTRACT,
    kind: "component-checklist",
    component,
    note:
      "Pendências suas, não veredito: cada obrigação/proibição do componente na base, com como medi-la. " +
      "automatic:true = o oráculo mede (scan_page acha; verify_finding decide com a expectedCondition). " +
      "automatic:false = nenhum check mede: zero achados do scan não diz nada sobre ela; meça como indicado e cite o citeAs.",
    total: baseItems.length,
    automatic,
    unmeasured: baseItems.length - automatic,
    cursor: Math.min(cursor, baseItems.length),
    count: page.length,
    items: page.map((item) => {
      const { citeAs, ...rest } = item;
      const id = idOf(citeAs);
      const it = id ? { citeAs, pendingId: id, ...rest } : item;
      return level.geometry === "full" ? it : withoutGeometry(it, level.geometry === "none");
    }),
    ...(related.length ? { related: { note: "Obrigações de fora do componente ligadas a ele pela camada de relações (leia também; não é aplicabilidade).", items: level.geometry === "full" ? related : related.map((r) => withoutGeometry(r, level.geometry === "none")) } } : {}),
    ...obligations(level),
    ...pendingNote(level),
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
  const onPage = page.filter((item) => pendingIds[item.citeAs]).length;
  for (let k = onPage - 1; k > 0; k--) {
    const response = compose({ obligations: "none", note: "short", geometry: "none", pendingIds: k })(page, next);
    if (textSize(response) <= budget) return response;
  }
  for (const level of LAST) {
    const response = compose(level)(page, next);
    if (textSize(response) <= budget) return response;
  }
  return budgetPage(baseItems, cursor, compose(LADDER[LADDER.length - 1]), budget);
}
