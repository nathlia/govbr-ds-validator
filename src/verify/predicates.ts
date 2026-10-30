/**
 * Predicados de violação do portão (v02, fatia 4).
 *
 * Um predicado é a única coisa que pode fazer `verify_finding` responder `confirmed`: ele recalcula,
 * na página reaberta e em CADA elemento alegado, a mesma decisão que o verificador determinístico
 * tomaria. Localizar o elemento não basta. E uma regra ampla (WCAG, e-MAG, KB) não seleciona
 * predicado nenhum: a mesma regra cobre defeitos diferentes, e o oráculo não sabe qual deles o texto
 * da alegação afirma.
 *
 * Limites declarados:
 * - só propriedades computadas de token e a tag raiz de componente; relações entre elementos, foco,
 *   ordem, texto, nome acessível e comportamento dinâmico não têm predicado;
 * - o estado é o que as `actions` reproduzem numa página nova — o que a sessão do agente fez em outro
 *   navegador não é herdado;
 * - valores computados passam pela mesma exigência de autoria do verificador: cor herdada ou do
 *   navegador não é atribuída à página, e a alegação sobre ela é contradita.
 */
import type { Finding } from "../schema/finding.js";
import type { ElementEvidence } from "../evidence/types.js";
import type { StyleProperty } from "../evidence/inspect.js";
import { BORDER_SIDE_PROPERTIES, checkTokenCompliance, paintedBorderSides, type TokenCheck } from "../checkers/tokenCompliance.js";
import { checkComponentStructure, scriptDependentAnchor } from "../checkers/structure.js";
import { FOCUS_INDICATOR_CONDITION, FOCUS_INDICATOR_GROUNDING } from "../checkers/focusIndicator.js";
import { PLACEHOLDER_LABEL_CONDITION, PLACEHOLDER_LABEL_GROUNDING, labelSourceOf } from "../checkers/formLabels.js";
import { DECORATIVE_ICON_CONDITION, DECORATIVE_ICON_GROUNDING, LINK_TITLE_CONDITION, LINK_TITLE_GROUNDING, exposedDecorativeIcons, isControl, linkTitleRepeatsText } from "../checkers/decorativeIcons.js";
import { checkPageStructure, pageConstraints } from "../checkers/pageStructure.js";
import type { PageFacts } from "../evidence/pageFacts.js";
import { normalizeColor } from "../checkers/color.js";
import { getComponentSpecs, getTokenRegistry } from "../data/load.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import {
  ANATOMY_PARTS,
  CONTEXT_CONDITIONS,
  KNOWLEDGE_FREE_CONDITIONS,
  anatomyPartFor,
  conditionByName,
  conditionsForRule,
  contextRuleOf,
  evaluateContext,
  type ContextCondition,
  type ContextEvidence,
} from "./contextual.js";

export interface PredicateOutcome {
  /** 2.13.0: `undetermined` — o predicado rodou no estado reproduzido e os dados não decidem. */
  status: "verified" | "contradicted" | "undetermined";
  detail: string;
  /** 3.4.0 (B2): motivo tipado de um `undetermined` com próximo passo próprio (contextual.ts). */
  code?: "rule-not-applicable" | "subject-not-a-dialog";
}

export interface ClaimOutcome {
  status: "consistent" | "contradicted";
  detail: string;
}

export interface Predicate {
  id: string;
  /** Propriedades que a inspeção precisa coletar para decidir. */
  properties: StyleProperty[];
  /** 2.7.0: o predicado decide sobre o documento e precisa dos fatos de página no estado reproduzido. */
  needsPageFacts?: boolean;
  /** 3.4.0 (B9): o portão mede o foco de cada elemento (evidence/focusIndicator.ts) antes de decidir. */
  needsFocusIndicator?: boolean;
  /**
   * 2.13.0 (NAT-85): fatos de contexto que o portão coleta no estado reproduzido — traço de foco e
   * visibilidade por passo, árvore de acessibilidade, anatomia. Predicados com contexto tratam alvo
   * ausente como `undetermined` (alvo desconhecido nunca vira rejeição) e, com traço, decidem pelos
   * sujeitos observados durante a receita, mesmo que o sujeito tenha saído do documento no fim.
   */
  context?: ContextCondition["needs"];
  /** Liga os dados estruturados alegados ao valor/tag de CADA elemento vivo (ou aos fatos de página). */
  verifyClaim(elements: ElementEvidence[], facts?: PageFacts): ClaimOutcome;
  evaluate(elements: ElementEvidence[], url: string, facts?: PageFacts, context?: ContextEvidence): PredicateOutcome;
}

export type PredicateSelection =
  | { predicate: Predicate; reason?: undefined; claimStatus?: undefined }
  | { predicate: null; reason: string; claimStatus?: "missing" | "contradicted" };

// 3.4.0 (B5): a cor de borda por lado também é alegável (B-15: `hr` com só `border-top`).
const COLOR_PROPERTIES = new Set(["background-color", "color", "border-color", ...BORDER_SIDE_PROPERTIES]);
const isBorderColor = (property: unknown) => typeof property === "string" && /^border(?:-(?:top|right|bottom|left))?-color$/.test(property);

/** O valor vivo da propriedade de cor alegada: lados pintados para a borda, o computado para o resto. */
function liveColorHexes(element: ElementEvidence, property: string): string[] {
  if (property === "background-color") return [normalizeColor(element.computed.backgroundColor ?? "")].filter((h): h is string => !!h);
  if (property === "color") return [normalizeColor(element.computed.color ?? "")].filter((h): h is string => !!h);
  const sides = paintedBorderSides(element);
  // 3.4.1: cor uniforme só conta com algum lado pintado (ou com evidência sem os lados medidos).
  const uniform = element.borderSides && sides.length === 0 ? null : normalizeColor(element.computed.borderColor ?? "");
  if (property === "border-color") {
    return [...(uniform ? [uniform] : []), ...sides.map((s) => normalizeColor(s.raw)).filter((h): h is string => !!h)];
  }
  const side = property.replace(/^border-|-color$/g, "");
  const painted = sides.find((s) => s.side === side);
  return painted ? [normalizeColor(painted.raw)].filter((h): h is string => !!h) : [];
}
const SPACING_PROPERTIES = new Set(["padding", "margin"]);

function onEveryElement(elements: ElementEvidence[], label: string, failure: (element: ElementEvidence) => string | null): PredicateOutcome {
  const failures = elements.map(failure).filter((value): value is string => value !== null);
  if (failures.length > 0) {
    return {
      status: "contradicted",
      detail: `${failures.length} de ${elements.length} elemento(s) não sustentam a alegação (${label}): ${failures.slice(0, 3).join("; ")}.`,
    };
  }
  return { status: "verified", detail: `Violação recalculada em ${elements.length} de ${elements.length} elemento(s): ${label}.` };
}

function claimOnEveryElement(
  elements: ElementEvidence[],
  label: string,
  failure: (element: ElementEvidence) => string | null
): ClaimOutcome {
  const failures = elements.map(failure).filter((value): value is string => value !== null);
  if (failures.length > 0) {
    return {
      status: "contradicted",
      detail: `${failures.length} de ${elements.length} elemento(s) contradizem os dados estruturados (${label}): ${failures.slice(0, 3).join("; ")}.`,
    };
  }
  return { status: "consistent", detail: `Dados estruturados conferidos em ${elements.length} de ${elements.length} elemento(s): ${label}.` };
}

function normalizeCssValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeFontFamily(value: string): string {
  return normalizeCssValue(value).replace(/["']/g, "").replace(/\s*,\s*/g, ",");
}

function tokenPredicate(
  id: string,
  check: TokenCheck,
  properties: StyleProperty[],
  label: string,
  verifyClaim: (element: ElementEvidence) => string | null,
  matches: (finding: Finding) => boolean
): Predicate {
  return {
    id,
    properties,
    verifyClaim(elements) {
      return claimOnEveryElement(elements, label, verifyClaim);
    },
    evaluate(elements, url) {
      const registry = getTokenRegistry();
      return onEveryElement(elements, label, (element) =>
        checkTokenCompliance({ url }, [element], registry, [check]).some(matches)
          ? null
          : `${element.locator} não viola neste estado`
      );
    },
  };
}

/** 3.4.0 (B9): normas que o predicado de foco visível decide (e-MAG 4.4, a frase obrigatória dela, WCAG 2.4.7). */
function focusIndicatorRule(finding: Finding): boolean {
  const { source, id } = finding.rule;
  if (source === "emag") return id.trim().replace(/^emag[-:.]?/i, "") === "4.4";
  if (source === "wcag") return id.trim().replace(/^wcag[-:.]?/i, "") === "2.4.7";
  return source === "govbr-ds-kb" && FOCUS_INDICATOR_GROUNDING.implements.includes(id);
}

const focusIndicatorPredicate: Predicate = {
  id: "focus-indicator",
  properties: [],
  needsFocusIndicator: true,
  verifyClaim: (elements) => ({
    status: "consistent",
    detail: `Condição '${FOCUS_INDICATOR_CONDITION}' aceita; ${elements.length} elemento(s) no estado reproduzido.`,
  }),
  evaluate: (elements) => {
    const unmeasured = elements.filter((element) => !element.focusIndicator?.focused);
    if (unmeasured.length > 0) {
      return {
        status: "undetermined",
        detail: `${unmeasured.length} de ${elements.length} elemento(s) não recebeu(ram) o foco por script (não focável, desabilitado ou o foco foi movido): o indicador não foi medido.`,
      };
    }
    const marked = elements.filter((element) => (element.focusIndicator?.changed.length ?? 0) > 0);
    // 3.4.1: sem mudança vista, mas a medição não cobriu tudo (subárvore acima do teto): sem decisão.
    const partial = elements.filter((element) => (element.focusIndicator?.changed.length ?? 0) === 0 && element.focusIndicator?.complete !== true);
    if (marked.length === 0 && partial.length > 0) {
      return {
        status: "undetermined",
        detail: `${partial.length} de ${elements.length} elemento(s) sem mudança que indique foco, mas a medição não é conclusiva: ${(() => {
          const lost = partial.flatMap((e) => e.focusIndicator?.discounted ?? []).filter((d) => d.includes("perde a cor de erro"));
          return lost.length
            ? `a única mudança é o campo em erro perdendo a cor de erro (${lost.slice(0, 2).join("; ")}); a cor de repouso sem o erro não é conhecida`
            : "a medição não cobriu todos os descendentes (teto)";
        })()}: uma marca de foco não pode ser descartada.`,
      };
    }
    if (marked.length > 0) {
      return {
        status: "contradicted",
        detail: `${marked.length} de ${elements.length} elemento(s) muda(m) de estilo ao receber foco: ${marked
          .slice(0, 3)
          .map((e) => `${e.locator} (${e.focusIndicator!.changed.slice(0, 4).join(", ")})`)
          .join("; ")}.`,
      };
    }
    return {
      status: "verified",
      detail: `Em ${elements.length} de ${elements.length} elemento(s), nenhuma propriedade visual do elemento, dos pseudo-elementos, do rótulo ou do pai mudou com o foco${(() => {
        const d = elements.flatMap((e) => e.focusIndicator?.discounted ?? []);
        return d.length ? ` de forma que marque o foco (descartadas: ${d.slice(0, 3).join("; ")})` : "";
      })()}.`,
    };
  },
};

/** 3.5.0 (D-155): normas que o predicado de rótulo por placeholder decide (e-MAG 6.2, as cláusulas da base, WCAG 3.3.2/1.3.1/4.1.2). */
function placeholderLabelRule(finding: Finding): boolean {
  const { source, id } = finding.rule;
  if (source === "emag") return id.trim().replace(/^emag[-:.]?/i, "") === "6.2";
  // 3.5.0 (revisão, HIGH 1): 4.1.2 e 1.3.1 aceitam o placeholder como fonte de nome — não decidem este caso.
  if (source === "wcag") return id.trim().replace(/^wcag[-:.]?/i, "") === "3.3.2";
  return source === "govbr-ds-kb" && [...PLACEHOLDER_LABEL_GROUNDING.implements, "govbr-3.7.0-pattern-global-62888bfde020"].includes(id);
}

const placeholderLabelPredicate: Predicate = {
  id: "placeholder-label",
  properties: [],
  verifyClaim: (elements) => ({
    status: "consistent",
    detail: `Condição '${PLACEHOLDER_LABEL_CONDITION}' aceita; ${elements.length} elemento(s) no estado reproduzido.`,
  }),
  evaluate: (elements) => {
    const sources = elements.map((element) => ({ element, source: labelSourceOf(element) }));
    const labelled = sources.filter((s) => s.source.kind === "labelled");
    if (labelled.length > 0) {
      return {
        status: "contradicted",
        detail: `${labelled.length} de ${elements.length} campo(s) tem rótulo associado: ${labelled
          .slice(0, 3)
          .map((s) => `${s.element.locator} (${(s.source as { via: string }).via})`)
          .join("; ")}.`,
      };
    }
    const other = sources.filter((s) => s.source.kind !== "placeholder-only");
    if (other.length > 0) {
      return {
        status: "undetermined",
        detail: `${other.length} de ${elements.length} elemento(s) não é campo com placeholder e sem rótulo neste estado (${other
          .slice(0, 3)
          .map((s) => `${s.element.locator}: ${s.source.kind === "not-applicable" ? s.source.why : s.source.kind === "title-only" ? "nome só pelo title, sem placeholder" : "sem placeholder nem nome"}`)
          .join("; ")}); o predicado não decide.`,
      };
    }
    const thirdParty = elements.filter((element) => element.origin === "flatpickr");
    if (thirdParty.length > 0) {
      return { status: "undetermined", detail: `${thirdParty.length} campo(s) injetado(s) por terceiro que o DS embute (flatpickr): fora da autoria da página — observação, não violação (como no scan).` };
    }
    const namedHost = elements.filter((element) => element.origin === "ds-web-component" && element.originHostNamed === true);
    if (namedHost.length > 0) {
      return {
        status: "undetermined",
        detail: `${namedHost.length} campo(s) dentro de web component do DS cujo host recebeu nome da página: o rótulo interno é do componente, não da página.`,
      };
    }
    return {
      status: "verified",
      detail: `Em ${elements.length} de ${elements.length} campo(s): placeholder presente e nenhum rótulo associado (sem <label> com texto, aria-labelledby com texto ou aria-label).`,
    };
  },
};

/** 3.5.0 (C03): predicado por elemento — verified quando todos violam, contradicted quando algum não. */
function elementPredicate(id: string, condition: string, label: string, violates: (el: ElementEvidence) => boolean): Predicate {
  return {
    id,
    properties: [],
    verifyClaim: (elements) => ({ status: "consistent", detail: `Condição '${condition}' aceita; ${elements.length} elemento(s) no estado reproduzido.` }),
    evaluate: (elements) => {
      const hidden = elements.filter((el) => el.rendered === false || el.axHidden);
      if (hidden.length) return { status: "undetermined", detail: `${hidden.length} de ${elements.length} elemento(s) oculto(s) neste estado: meça no estado em que aparece.` };
      // Fora da autoria da página (interno de web component do DS, terceiro embutido): observação, como no scan.
      const outside = elements.filter((el) => el.origin === "ds-web-component" || el.origin === "flatpickr");
      if (outside.length) return { status: "undetermined", detail: `${outside.length} de ${elements.length} elemento(s) dentro de componente do DS ou de terceiro embutido: fora da autoria da página — observação, não violação.` };
      // O localizador tem de nomear o CONTROLE (button, a, papel interativo), não o ícone dentro dele.
      const notControl = elements.filter((el) => !isControl(el));
      if (notControl.length) return { status: "undetermined", detail: `${notControl.length} de ${elements.length} elemento(s) não é controle (<${notControl[0].tagName}>): aponte element.locator para o botão/link que contém o ícone e repita.` };
      return onEveryElement(elements, label, (el) => (violates(el) ? null : `${el.locator} não viola neste estado`));
    },
  };
}
const decorativeIconPredicate = elementPredicate("decorative-icon", DECORATIVE_ICON_CONDITION, "ícone decorativo exposto ao lado do rótulo", (el) => exposedDecorativeIcons(el) > 0);
const linkTitlePredicate = elementPredicate("link-title", LINK_TITLE_CONDITION, "title do link repete o texto", linkTitleRepeatsText);

function citesAny(finding: Finding, grounding: { implements: string[] }, emag?: string, wcag: string[] = []): boolean {
  const { source, id } = finding.rule;
  if (source === "emag") return emag !== undefined && id.trim().replace(/^emag[-:.]?/i, "") === emag;
  if (source === "wcag") return wcag.includes(id.trim().replace(/^wcag[-:.]?/i, ""));
  return source === "govbr-ds-kb" && grounding.implements.includes(id);
}

export function selectPredicate(finding: Finding): PredicateSelection {
  const { source, id } = finding.rule;
  const data = (finding.evidence.data ?? {}) as Record<string, unknown>;
  const none = (reason: string, claimStatus?: "missing" | "contradicted"): PredicateSelection => ({ predicate: null, reason, claimStatus });
  const generic =
    `Nenhum predicado implementado para ${source} '${id}': a regra existe, mas o oráculo não decide ` +
    "mecanicamente a violação alegada. Localizar o elemento não confirma a alegação.";

  // 3.4.0 (B9): foco visível (A-04, V-05) — só com a condição estruturada exata.
  if (focusIndicatorRule(finding)) {
    if (data.expectedCondition === FOCUS_INDICATOR_CONDITION) return { predicate: focusIndicatorPredicate };
    return none(`${generic} Para foco visível, envie evidence.data.expectedCondition='${FOCUS_INDICATOR_CONDITION}'.`);
  }

  // 3.5.0 (D-155): campo com placeholder no lugar do rótulo — só com a condição estruturada exata.
  if (data.expectedCondition === PLACEHOLDER_LABEL_CONDITION) {
    if (placeholderLabelRule(finding)) return { predicate: placeholderLabelPredicate };
    return none(`A condição '${PLACEHOLDER_LABEL_CONDITION}' só é decidida para emag-6.2, WCAG 3.3.2 ou ${[...PLACEHOLDER_LABEL_GROUNDING.implements.filter((i) => i.startsWith("govbr-")), "govbr-3.7.0-pattern-global-62888bfde020"].join(", ")}: a regra citada não decide placeholder × rótulo (WCAG 4.1.2/1.3.1 aceitam o placeholder como nome). Cite uma dessas normas.`);
  }

  // 3.5.0 (C03): ícone decorativo exposto e title que repete o link — só com a condição exata e a norma do caso.
  if (data.expectedCondition === DECORATIVE_ICON_CONDITION) {
    if (citesAny(finding, DECORATIVE_ICON_GROUNDING, undefined, ["1.1.1"]) || (finding.rule.source === "govbr-ds-kb" && finding.rule.id === "govbr-3.7.0-accessibility-button-23e3cfbf49f3")) return { predicate: decorativeIconPredicate };
    return none(`A condição '${DECORATIVE_ICON_CONDITION}' só é decidida para ${DECORATIVE_ICON_GROUNDING.implements.join(", ")}, govbr-3.7.0-accessibility-button-23e3cfbf49f3 ou WCAG 1.1.1.`);
  }
  if (data.expectedCondition === LINK_TITLE_CONDITION) {
    // 3.5.0 (revisão, MED): title redundante não reprova a WCAG 2.4.4 — só a cláusula do e-MAG 3.5 que o proíbe.
    if (citesAny(finding, LINK_TITLE_GROUNDING, "3.5") || (finding.rule.source === "govbr-ds-kb" && finding.rule.id === "govbr-3.7.0-pattern-global-38e29fcf7bc4")) return { predicate: linkTitlePredicate };
    return none(`A condição '${LINK_TITLE_CONDITION}' só é decidida para ${LINK_TITLE_GROUNDING.implements.join(", ")} ou govbr-3.7.0-pattern-global-38e29fcf7bc4 (title redundante não reprova a WCAG 2.4.4).`);
  }

  // 2.13.0 (NAT-85): condições contextuais. Só a regra listada na condição e a condição exata
  // selecionam o predicado; regra genérica ou condição de outra regra ficam sem predicado.
  const contextual = selectContextPredicate(finding, data);
  if (contextual) return contextual;

  if (source === "govbr-ds-token") {
    const property = typeof data.property === "string" ? data.property : null;
    switch (id) {
      case "ds-token-color": {
        if (data.property === undefined || data.observedHex === undefined || data.expectedCondition === undefined) {
          return none("ds-token-color só é verificável com evidence.data.property (background-color, color, border-color ou border-{top,right,bottom,left}-color), observedHex e expectedCondition.", "missing");
        }
        const observedHex = typeof data.observedHex === "string" ? normalizeColor(data.observedHex) : null;
        if (!property || !COLOR_PROPERTIES.has(property) || !observedHex || data.expectedCondition !== EXPECTED_CONDITIONS.tokenColor) {
          return none(`Dados estruturados contraditórios para ds-token-color: property/observedHex devem ser suportados e expectedCondition deve ser '${EXPECTED_CONDITIONS.tokenColor}'.`, "contradicted");
        }
        return {
          predicate: tokenPredicate("token-color", "color", ["backgroundColor", "color", "borderColor"],
            `${property} ${observedHex} fora do registro de tokens`,
            (element) => liveColorHexes(element, property).includes(observedHex)
              ? null
              : `${element.locator}: ${property} vivo é ${liveColorHexes(element, property).join("/") || "(ausente ou lado sem borda)"}, não ${observedHex}`,
            (f) => f.evidence.data?.observedHex === observedHex &&
              (f.evidence.data?.property === property ||
                (property === "border-color" && isBorderColor(f.evidence.data?.property)) ||
                (isBorderColor(property) && Array.isArray(f.evidence.data?.sides) && (f.evidence.data.sides as string[]).includes(property.replace(/^border-|-color$/g, ""))))),
        };
      }
      case "ds-token-font-family": {
        if (data.property === undefined || data.observed === undefined || data.expectedCondition === undefined) {
          return none("ds-token-font-family só é verificável com evidence.data.property='font-family', observed e expectedCondition.", "missing");
        }
        if (property !== "font-family" || typeof data.observed !== "string" || !data.observed.trim() || data.expectedCondition !== EXPECTED_CONDITIONS.tokenFontFamily) {
          return none(`Dados estruturados contraditórios para ds-token-font-family: property/observed devem ser suportados e expectedCondition deve ser '${EXPECTED_CONDITIONS.tokenFontFamily}'.`, "contradicted");
        }
        const observed = data.observed;
        return {
          predicate: tokenPredicate("token-font-family", "font", ["fontFamily", "fontSize"],
            `font-family ${observed} fora da família do DS`,
            (element) => normalizeFontFamily(element.computed.fontFamily ?? "") === normalizeFontFamily(observed)
              ? null
              : `${element.locator}: font-family vivo é ${element.computed.fontFamily ?? "(ausente)"}, não ${observed}`,
            (f) => f.rule.id === "ds-token-font-family" && f.evidence.data?.property === "font-family" &&
              typeof f.evidence.data?.observed === "string" && normalizeFontFamily(f.evidence.data.observed) === normalizeFontFamily(observed)),
        };
      }
      case "ds-token-radius": {
        if (data.property === undefined || data.observed === undefined || data.expectedCondition === undefined) {
          return none("ds-token-radius só é verificável com evidence.data.property='border-radius', observed e expectedCondition.", "missing");
        }
        if (property !== "border-radius" || typeof data.observed !== "string" || !data.observed.trim() || data.expectedCondition !== EXPECTED_CONDITIONS.tokenRadius) {
          return none(`Dados estruturados contraditórios para ds-token-radius: property/observed devem ser suportados e expectedCondition deve ser '${EXPECTED_CONDITIONS.tokenRadius}'.`, "contradicted");
        }
        const observed = data.observed;
        return {
          predicate: tokenPredicate("token-radius", "radius", ["borderRadius", "fontSize"],
            `border-radius ${observed} fora da escala do DS`,
            (element) => normalizeCssValue(element.computed.borderRadius ?? "") === normalizeCssValue(observed)
              ? null
              : `${element.locator}: border-radius vivo é ${element.computed.borderRadius ?? "(ausente)"}, não ${observed}`,
            (f) => f.rule.id === "ds-token-radius" && f.evidence.data?.property === "border-radius" &&
              typeof f.evidence.data?.observed === "string" && normalizeCssValue(f.evidence.data.observed) === normalizeCssValue(observed)),
        };
      }
      case "ds-token-spacing": {
        if (data.property === undefined || data.observed === undefined || data.expectedCondition === undefined) {
          return none("ds-token-spacing só é verificável com evidence.data.property (padding ou margin), observed e expectedCondition.", "missing");
        }
        if (!property || !SPACING_PROPERTIES.has(property) || typeof data.observed !== "string" || !data.observed.trim() || data.expectedCondition !== EXPECTED_CONDITIONS.tokenSpacing) {
          return none(`Dados estruturados contraditórios para ds-token-spacing: property/observed devem ser suportados e expectedCondition deve ser '${EXPECTED_CONDITIONS.tokenSpacing}'.`, "contradicted");
        }
        const observed = data.observed;
        const computedProperty = property as "padding" | "margin";
        return {
          predicate: tokenPredicate("token-spacing", "spacing", ["padding", "margin"],
            `${property} ${observed} fora da escala do DS`,
            (element) => normalizeCssValue(element.computed[computedProperty] ?? "") === normalizeCssValue(observed)
              ? null
              : `${element.locator}: ${property} vivo é ${element.computed[computedProperty] ?? "(ausente)"}, não ${observed}`,
            (f) => f.rule.id === "ds-token-spacing" && f.evidence.data?.property === property &&
              typeof f.evidence.data?.observed === "string" && normalizeCssValue(f.evidence.data.observed) === normalizeCssValue(observed)),
        };
      }
      default:
        return none(generic);
    }
  }

  if (source === "govbr-ds-structure") {
    const spec = Object.values(getComponentSpecs().components).find((candidate) => `ds-structure-${candidate.name}-tag` === id);
    if (!spec || spec.tags.length === 0) return none(generic);
    if (data.component === undefined || data.observedTag === undefined || data.expectedCondition === undefined) {
      return none(`${id} só é verificável com evidence.data.component, observedTag e expectedCondition.`, "missing");
    }
    if (data.component !== spec.name || typeof data.observedTag !== "string" || !data.observedTag.trim() || data.expectedCondition !== EXPECTED_CONDITIONS.structureTag) {
      return none(`Dados estruturados contraditórios para ${id}: component/observedTag devem ser suportados e expectedCondition deve ser '${EXPECTED_CONDITIONS.structureTag}'.`, "contradicted");
    }
    const observedTag = data.observedTag.toLowerCase();
    return {
      predicate: {
        id: "structure-tag",
        properties: [],
        verifyClaim: (elements) =>
          claimOnEveryElement(elements, `${spec.rootClass} aplicado a <${observedTag}>`, (element) =>
            element.tagName.toLowerCase() === observedTag
              ? null
              : `${element.locator}: tag viva é <${element.tagName}>, não <${observedTag}>`
          ),
        evaluate: (elements, url) => {
          // 3.4.1 (revisão, B3): `<a class="br-button" href="#">` com onclick pode ser ação ou link — o
          // comportamento depende de script, não medido aqui: sem decisão, nunca contraprova.
          const dependent = elements.filter((element) => scriptDependentAnchor(element, spec));
          if (dependent.length > 0) {
            return {
              status: "undetermined",
              detail: `${dependent.length} de ${elements.length} elemento(s) é <a> com href "#", vazio ou javascript: — se navega ou age depende de script, que o oráculo não mede.`,
            };
          }
          return onEveryElement(elements, `tag raiz de ${spec.rootClass}`, (element) =>
            checkComponentStructure({ url }, [element], spec).some((f) => f.rule.id === id)
              ? null
              : `${element.locator} (<${element.tagName}>) não viola neste estado`
          );
        },
      },
    };
  }

  if (source === "govbr-ds-page") {
    const constraint = pageConstraints().find((candidate) => candidate.id === id);
    if (!constraint) return none(generic);
    const condition = constraint.claim.expectedCondition;
    if (constraint.kind === "page-region") {
      if (data.region === undefined || data.observedCount === undefined || data.expectedCondition === undefined) {
        return none(`${id} só é verificável com evidence.data.region, observedCount e expectedCondition ('${condition}').`, "missing");
      }
      if (data.region !== constraint.region || typeof data.observedCount !== "number" || data.expectedCondition !== condition) {
        return none(`Dados estruturados contraditórios para ${id}: region deve ser '${constraint.region}', observedCount numérico e expectedCondition '${condition}'.`, "contradicted");
      }
      const region = constraint.region as "header" | "footer";
      const observedCount = data.observedCount;
      return {
        predicate: {
          id: "page-region",
          properties: [],
          needsPageFacts: true,
          verifyClaim: (_elements, facts) => {
            if (!facts) return { status: "contradicted", detail: "Fatos de página indisponíveis para o predicado page-region." };
            const live = facts.regions[region];
            return live === observedCount
              ? { status: "consistent", detail: `Dados estruturados conferidos no documento: ${live} elemento(s) ${constraint.selector}.` }
              : { status: "contradicted", detail: `O documento tem ${live} elemento(s) ${constraint.selector}, não ${observedCount}.` };
          },
          evaluate: (_elements, url, facts) => {
            if (!facts) return { status: "contradicted", detail: "Fatos de página indisponíveis para o predicado page-region." };
            return checkPageStructure({ url }, facts).some((f) => f.rule.id === id)
              ? { status: "verified", detail: `Violação recalculada no documento: nenhum ${constraint.selector} (${region} do Template Base).` }
              : { status: "contradicted", detail: `O documento tem ${facts.regions[region]} elemento(s) ${constraint.selector}; não viola neste estado.` };
          },
        },
      };
    }
    if (constraint.kind === "page-focus-order") {
      if (data.region === undefined || data.firstLinkHref === undefined || data.expectedCondition === undefined) {
        return none(`${id} só é verificável com evidence.data.region='focus-order', firstLinkHref e expectedCondition ('${condition}').`, "missing");
      }
      if (data.region !== "focus-order" || typeof data.firstLinkHref !== "string" || data.expectedCondition !== condition) {
        return none(`Dados estruturados contraditórios para ${id}: region deve ser 'focus-order', firstLinkHref texto e expectedCondition '${condition}'.`, "contradicted");
      }
      const href = data.firstLinkHref;
      return {
        predicate: {
          id: "page-focus-order",
          properties: [],
          needsPageFacts: true,
          verifyClaim: (_elements, facts) => {
            if (!facts) return { status: "contradicted", detail: "Fatos de página indisponíveis para o predicado page-focus-order." };
            const live = facts.firstLink?.href ?? null;
            return live === href
              ? { status: "consistent", detail: `Dados estruturados conferidos: o primeiro link do documento é href="${live}".` }
              : { status: "contradicted", detail: `O primeiro link do documento é ${live === null ? "inexistente" : `href="${live}"`}, não href="${href}".` };
          },
          evaluate: (_elements, url, facts) => {
            if (!facts) return { status: "contradicted", detail: "Fatos de página indisponíveis para o predicado page-focus-order." };
            if (!facts.firstLink?.skipsToContent) {
              return { status: "undetermined", code: "rule-not-applicable", detail: "O primeiro link não é um salto válido: a regra de ordem de foco do salto não se aplica; o caso é ds-page-skip-link (e-MAG 1.5)." };
            }
            return checkPageStructure({ url }, facts).some((f) => f.rule.id === id)
              ? { status: "verified", detail: "Violação recalculada no documento: um elemento com tabindex positivo recebe o foco antes do salto para o conteúdo." }
              : { status: "contradicted", detail: "Nenhum elemento exibido com tabindex positivo recebe o foco antes do salto; não viola neste estado." };
          },
        },
      };
    }
    if (data.region === undefined || data.firstLinkHref === undefined || data.expectedCondition === undefined) {
      return none(`${id} só é verificável com evidence.data.region='skip-link', firstLinkHref e expectedCondition ('${condition}').`, "missing");
    }
    if (data.region !== "skip-link" || typeof data.firstLinkHref !== "string" || data.expectedCondition !== condition) {
      return none(`Dados estruturados contraditórios para ${id}: region deve ser 'skip-link', firstLinkHref texto e expectedCondition '${condition}'.`, "contradicted");
    }
    const firstLinkHref = data.firstLinkHref;
    return {
      predicate: {
        id: "page-skip-link",
        properties: [],
        needsPageFacts: true,
        verifyClaim: (_elements, facts) => {
          if (!facts) return { status: "contradicted", detail: "Fatos de página indisponíveis para o predicado page-skip-link." };
          const live = facts.firstLink?.href ?? null;
          return live === firstLinkHref
            ? { status: "consistent", detail: `Dados estruturados conferidos: o primeiro link do documento é href="${live}".` }
            : { status: "contradicted", detail: `O primeiro link do documento é ${live === null ? "inexistente" : `href="${live}"`}, não href="${firstLinkHref}".` };
        },
        evaluate: (_elements, url, facts) => {
          if (!facts) return { status: "contradicted", detail: "Fatos de página indisponíveis para o predicado page-skip-link." };
          // 3.5.0 (P2): salto como 1º link, mas tabindex positivo antes dele — e-MAG 1.5 cumprida; a regra
          // que se aplica é ds-page-focus-order. Não desmente o fato medido.
          const before = facts.positiveTabindexFirst;
          if (facts.firstLink?.skipsToContent && before && !before.isFirstLink) {
            return {
              status: "undetermined",
              code: "rule-not-applicable",
              detail: `O primeiro link é o salto (e-MAG 1.5 cumprida), mas <${before.tag}> com tabindex=${before.tabindex} recebe o foco antes dele: cite ds-page-focus-order (Skip Link "primeiro elemento a receber o foco"; e-MAG 1.4 / WCAG 2.4.3).`,
            };
          }
          return checkPageStructure({ url }, facts).some((f) => f.rule.id === id)
            ? { status: "verified", detail: "Violação recalculada no documento: o primeiro a receber o foco não é o salto para o conteúdo (primeiro link sem âncora válida, ou tabindex positivo antes dele; e-MAG 1.5)." }
            : { status: "contradicted", detail: "O primeiro link do documento é uma âncora interna com alvo existente e nenhum tabindex positivo recebe o foco antes dele; não viola neste estado." };
        },
      },
    };
  }

  return none(generic);
}

/**
 * Seleção do perfil knowledge-free (2.14.0, NAT-61, decisão 5): só as condições P1 citadas pela fonte
 * WCAG selecionam predicado. Token, estrutura, página, P2 e P3 aplicam a base do DS e ficam
 * desligados; nenhuma mensagem afirma que uma regra fora da WCAG existe.
 */
export function selectPredicateKnowledgeFree(finding: Finding): PredicateSelection {
  const { source, id } = finding.rule;
  const data = (finding.evidence.data ?? {}) as Record<string, unknown>;
  const generic: PredicateSelection = {
    predicate: null,
    reason:
      `Nenhum predicado implementado para ${source} '${id}' neste perfil: só critérios WCAG com condição ` +
      "estruturada têm predicado. Localizar o elemento não confirma a alegação.",
  };
  if (source !== "wcag") return generic;
  return selectContextPredicate(finding, data, KNOWLEDGE_FREE_CONDITIONS, { knowledgeFree: true }) ?? generic;
}

/** Seleção das condições contextuais (P1–P3). `null`: a alegação não é contextual. */
function selectContextPredicate(
  finding: Finding,
  data: Record<string, unknown>,
  pool: typeof CONTEXT_CONDITIONS = CONTEXT_CONDITIONS,
  options: { knowledgeFree?: boolean } = {}
): PredicateSelection | null {
  const rule = contextRuleOf(finding);
  const forRule = rule ? conditionsForRule(rule, pool) : [];
  const requested = conditionByName(data.expectedCondition, pool);
  if (!requested && forRule.length === 0) return null;
  const cited = `${finding.rule.source} '${finding.rule.id}'`;
  if (!requested) {
    return {
      predicate: null,
      claimStatus: "missing",
      reason: `${cited} só é verificável com evidence.data.expectedCondition = ${forRule.map((c) => `'${c.condition}'`).join(" ou ")}.`,
    };
  }
  if (!rule || !requested.rules.some((r) => r.source === rule.source && r.id === rule.id)) {
    return {
      predicate: null,
      reason:
        `A condição '${requested.condition}' só é decidida para ${requested.rules.map((r) => `${r.source} ${r.id}`).join(", ")}; ` +
        `${cited} não seleciona predicado (norma genérica ou de outro defeito).`,
    };
  }
  const missing = requested.fields.filter((field) => data[field] === undefined);
  if (missing.length > 0) {
    return { predicate: null, claimStatus: "missing", reason: `'${requested.condition}' exige evidence.data.${missing.join(", evidence.data.")}.` };
  }
  if (requested.check === "error-item-identified" && (typeof data.errorMessage !== "string" || !data.errorMessage.trim())) {
    return { predicate: null, claimStatus: "contradicted", reason: "evidence.data.errorMessage deve ser o seletor do texto de erro." };
  }
  if (requested.check === "anatomy-part" && !anatomyPartFor(finding.rule.id, data.component, data.part)) {
    return {
      predicate: null,
      claimStatus: "contradicted",
      reason: `component/part não correspondem a '${finding.rule.id}' (esperado: ${ANATOMY_PARTS.filter((p) => p.rules.includes(finding.rule.id))
        .map((p) => `component='${p.component}', part='${p.part}'`)
        .join(" ou ")}).`,
    };
  }
  const condition = requested;
  return {
    predicate: {
      id: `context-${condition.check}`,
      properties: [],
      context: condition.needs,
      verifyClaim: (elements) => ({
        status: "consistent",
        detail: `Condição estruturada '${condition.condition}' (${condition.family}) aceita para ${cited}; ${elements.length} sujeito(s) no estado final.`,
      }),
      evaluate: (_elements, _url, _facts, context) =>
        evaluateContext(condition, finding, context ?? { actions: [] }, options),
    },
  };
}
