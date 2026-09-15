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

export interface PredicateOutcome {
  status: "verified" | "contradicted";
  detail: string;
}

export interface Predicate {
  id: string;
  /** Propriedades que a inspeção precisa coletar para decidir. */
  properties: StyleProperty[];
  evaluate(elements: ElementEvidence[], url: string): PredicateOutcome;
}

export type PredicateSelection = { predicate: Predicate; reason?: undefined } | { predicate: null; reason: string };

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

function tokenPredicate(
  id: string,
  check: TokenCheck,
  properties: StyleProperty[],
  label: string,
  matches: (finding: Finding) => boolean
): Predicate {
  return {
    id,
    properties,
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
  const none = (reason: string): PredicateSelection => ({ predicate: null, reason });
  const generic =
    `Nenhum predicado implementado para ${source} '${id}': a regra existe, mas o oráculo não decide ` +
    "mecanicamente a violação alegada. Localizar o elemento não confirma a alegação.";

  if (source === "govbr-ds-token") {
    const property = typeof data.property === "string" ? data.property : null;
    switch (id) {
      case "ds-token-color": {
        const observedHex = typeof data.observedHex === "string" ? normalizeColor(data.observedHex) : null;
        if (!property || !COLOR_PROPERTIES.has(property) || !observedHex) {
          return none("ds-token-color só é verificável com evidence.data.property (background-color, color ou border-color) e evidence.data.observedHex.");
        }
        return {
          predicate: tokenPredicate("token-color", "color", ["backgroundColor", "color", "borderColor"],
            `${property} ${observedHex} fora do registro de tokens`,
            (f) => f.evidence.data?.property === property && f.evidence.data?.observedHex === observedHex),
        };
      }
      case "ds-token-font-family":
        return {
          predicate: tokenPredicate("token-font-family", "font", ["fontFamily", "fontSize"],
            "font-family fora da família do DS", (f) => f.rule.id === "ds-token-font-family"),
        };
      case "ds-token-radius":
        return {
          predicate: tokenPredicate("token-radius", "radius", ["borderRadius", "fontSize"],
            "border-radius fora da escala do DS", (f) => f.rule.id === "ds-token-radius"),
        };
      case "ds-token-spacing":
        if (!property || !SPACING_PROPERTIES.has(property)) {
          return none("ds-token-spacing só é verificável com evidence.data.property (padding ou margin).");
        }
        return {
          predicate: tokenPredicate("token-spacing", "spacing", ["padding", "margin"],
            `${property} fora da escala do DS`,
            (f) => f.rule.id === "ds-token-spacing" && f.evidence.data?.property === property),
        };
      default:
        return none(generic);
    }
  }

  if (source === "govbr-ds-structure") {
    const spec = Object.values(getComponentSpecs().components).find((candidate) => `ds-structure-${candidate.name}-tag` === id);
    if (!spec || spec.tags.length === 0) return none(generic);
    return {
      predicate: {
        id: "structure-tag",
        properties: [],
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
