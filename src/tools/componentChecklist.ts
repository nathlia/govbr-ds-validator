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
import { CONTRACT, MESSAGES, RESPONSE_BUDGET, budgetPage, step } from "../responses/contract.js";
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

/** Sem medida automática: o que observar, pela estratégia de verificação que a base declara. */
function manualMeasure(rule: KnowledgeRule): { how: string; properties?: string[] } {
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

/** Quantas obrigações/proibições do componente nenhum check ou predicado do oráculo mede. */
export function unmeasuredStrongCount(component: string): { strong: number; unmeasured: number } {
  const rules = checklistRules(component);
  return { strong: rules.length, unmeasured: rules.filter((r) => oracleMeasuresFor(r.id).length === 0).length };
}

export function componentChecklist(component: string, cursor: number, budget = RESPONSE_BUDGET): Record<string, unknown> {
  const rules = checklistRules(component);
  const items = rules.map((r) => {
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
  const automatic = items.filter((i) => i.measure.automatic).length;
  // Obrigações/proibições de fora do componente que a camada de relações liga a ele (ex.: rótulo × placeholder
  // do padrão Formulário para o Input). Só na 1ª página; "leia também", nunca aplicabilidade.
  const own = new Set(rules.map((r) => r.id));
  const related = cursor === 0
    ? relatedFor({ components: [component], exclude: own, max: 5 })
        .map((item) => getRuleById(item.id))
        .filter((r): r is KnowledgeRule => Boolean(r) && STRONG.has(r!.force))
        .map((r) => ({ citeAs: r.id, force: r.force, text: cut(plain(r.originalText), CHECKLIST_TEXT_MAX), measure: measureOf(r) }))
    : [];
  return budgetPage(
    items,
    cursor,
    (page, next) => ({
      contract: CONTRACT,
      kind: "component-checklist",
      component,
      note:
        "Pendências suas, não veredito: cada obrigação/proibição do componente na base, com como medi-la. " +
        "automatic:true = o oráculo mede (scan_page acha; verify_finding decide com a expectedCondition). " +
        "automatic:false = nenhum check mede: zero achados do scan não diz nada sobre ela; meça como indicado e cite o citeAs.",
      total: items.length,
      automatic,
      unmeasured: items.length - automatic,
      cursor: Math.min(cursor, items.length),
      count: page.length,
      items: page,
      ...(related.length ? { related: { note: "Obrigações de fora do componente ligadas a ele pela camada de relações (leia também; não é aplicabilidade).", items: related } } : {}),
      ...(next !== null
        ? { nextCursor: next, next: step("request-detail", "próximos itens da lista", "get_component_spec", { component, view: "checklist", cursor: next }) }
        : { end: MESSAGES["page-end"] }),
      ...(items.length === 0 ? { absenceNote: "A base não tem obrigação nem proibição própria deste componente; isso descreve a base, não a página." } : {}),
    }),
    budget,
  );
}
