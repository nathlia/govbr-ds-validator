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
import { checkTokenCompliance, type TokenCheck } from "../checkers/tokenCompliance.js";
import { checkComponentStructure } from "../checkers/structure.js";
import { normalizeColor } from "../checkers/color.js";
import { getComponentSpecs, getTokenRegistry } from "../data/load.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";

export interface PredicateOutcome {
  status: "verified" | "contradicted";
  detail: string;
}

export interface ClaimOutcome {
  status: "consistent" | "contradicted";
  detail: string;
}

export interface Predicate {
  id: string;
  /** Propriedades que a inspeção precisa coletar para decidir. */
  properties: StyleProperty[];
  /** Liga os dados estruturados alegados ao valor/tag de CADA elemento vivo. */
  verifyClaim(elements: ElementEvidence[]): ClaimOutcome;
  evaluate(elements: ElementEvidence[], url: string): PredicateOutcome;
}

export type PredicateSelection =
  | { predicate: Predicate; reason?: undefined; claimStatus?: undefined }
  | { predicate: null; reason: string; claimStatus?: "missing" | "contradicted" };

const COLOR_PROPERTIES = new Set(["background-color", "color", "border-color"]);
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

export function selectPredicate(finding: Finding): PredicateSelection {
  const { source, id } = finding.rule;
  const data = (finding.evidence.data ?? {}) as Record<string, unknown>;
  const none = (reason: string, claimStatus?: "missing" | "contradicted"): PredicateSelection => ({ predicate: null, reason, claimStatus });
  const generic =
    `Nenhum predicado implementado para ${source} '${id}': a regra existe, mas o oráculo não decide ` +
    "mecanicamente a violação alegada. Localizar o elemento não confirma a alegação.";

  if (source === "govbr-ds-token") {
    const property = typeof data.property === "string" ? data.property : null;
    switch (id) {
      case "ds-token-color": {
        if (data.property === undefined || data.observedHex === undefined || data.expectedCondition === undefined) {
          return none("ds-token-color só é verificável com evidence.data.property (background-color, color ou border-color), observedHex e expectedCondition.", "missing");
        }
        const observedHex = typeof data.observedHex === "string" ? normalizeColor(data.observedHex) : null;
        if (!property || !COLOR_PROPERTIES.has(property) || !observedHex || data.expectedCondition !== EXPECTED_CONDITIONS.tokenColor) {
          return none(`Dados estruturados contraditórios para ds-token-color: property/observedHex devem ser suportados e expectedCondition deve ser '${EXPECTED_CONDITIONS.tokenColor}'.`, "contradicted");
        }
        const computedProperty = ({
          "background-color": "backgroundColor",
          color: "color",
          "border-color": "borderColor",
        } as const)[property as "background-color" | "color" | "border-color"];
        return {
          predicate: tokenPredicate("token-color", "color", ["backgroundColor", "color", "borderColor"],
            `${property} ${observedHex} fora do registro de tokens`,
            (element) => normalizeColor(element.computed[computedProperty] ?? "") === observedHex
              ? null
              : `${element.locator}: ${property} vivo é ${element.computed[computedProperty] ?? "(ausente)"}, não ${observedHex}`,
            (f) => f.evidence.data?.property === property && f.evidence.data?.observedHex === observedHex),
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
        evaluate: (elements, url) =>
          onEveryElement(elements, `tag raiz de ${spec.rootClass}`, (element) =>
            checkComponentStructure({ url }, [element], spec).some((f) => f.rule.id === id)
              ? null
              : `${element.locator} (<${element.tagName}>) não viola neste estado`
          ),
      },
    };
  }

  return none(generic);
}
