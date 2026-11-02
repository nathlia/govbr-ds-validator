/**
 * 3.5.0 (D-155, item 2): que regra da base o próprio oráculo mede, e como. Derivado só das tabelas de
 * fundamentação que os checks e predicados já declaram (CHECK_GROUNDING, foco visível, rótulo por
 * placeholder, condições contextuais, anatomia) — nenhum mapa por componente escrito à mão.
 */
import { CHECK_GROUNDING, type CheckKind } from "../checkers/grounding.js";
import { FOCUS_INDICATOR_CONDITION, FOCUS_INDICATOR_GROUNDING } from "../checkers/focusIndicator.js";
import { PLACEHOLDER_LABEL_CONDITION, PLACEHOLDER_LABEL_GROUNDING } from "../checkers/formLabels.js";
import { DECORATIVE_ICON_CONDITION, DECORATIVE_ICON_GROUNDING, LINK_TITLE_CONDITION, LINK_TITLE_GROUNDING } from "../checkers/decorativeIcons.js";
import { ICON_ONLY_BUTTON_CONDITION, ICON_ONLY_BUTTON_GROUNDING } from "../checkers/iconOnlyButton.js";
import { FOCUS_ORDER_IMPLEMENTS } from "../checkers/pageStructure.js";
import { ANATOMY_PARTS, CONTEXT_CONDITIONS } from "../verify/contextual.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";

export interface OracleMeasure {
  /** `scan_page`: o check acha sozinho; `verify_finding`: decide a alegação com a condição estruturada. */
  tool: "scan_page" | "verify_finding";
  check?: "tokens" | "structure" | "page";
  expectedCondition?: string;
}

/** A regra geral de consumo de tokens sustenta vários checks, mas não é medida inteira por nenhum. */
const GENERAL_TOKEN_RULE = "govbr-3.7.0-development-global-137c50bea6ca";

let index: Map<string, OracleMeasure[]> | undefined;

function add(map: Map<string, OracleMeasure[]>, id: string, measure: OracleMeasure) {
  const list = map.get(id) ?? [];
  if (!list.some((m) => m.tool === measure.tool && m.check === measure.check && m.expectedCondition === measure.expectedCondition)) list.push(measure);
  map.set(id, list);
}

function build(): Map<string, OracleMeasure[]> {
  const map = new Map<string, OracleMeasure[]>();
  const conditionOf: Partial<Record<CheckKind, string>> = {
    "token-color": EXPECTED_CONDITIONS.tokenColor,
    "token-font-family": EXPECTED_CONDITIONS.tokenFontFamily,
    "token-radius": EXPECTED_CONDITIONS.tokenRadius,
    "token-spacing": EXPECTED_CONDITIONS.tokenSpacing,
    "structure-tag": EXPECTED_CONDITIONS.structureTag,
    "page-header": EXPECTED_CONDITIONS.pageRegion,
    "page-footer": EXPECTED_CONDITIONS.pageRegion,
    "page-skip-link": EXPECTED_CONDITIONS.skipLink,
  };
  for (const [kind, grounding] of Object.entries(CHECK_GROUNDING) as Array<[CheckKind, (typeof CHECK_GROUNDING)[CheckKind]]>) {
    const check = kind.startsWith("token-") ? "tokens" : kind.startsWith("page-") ? "page" : "structure";
    for (const id of grounding.implements) {
      if (id === GENERAL_TOKEN_RULE || !id.startsWith("govbr-")) continue;
      add(map, id, { tool: "scan_page", check });
      const condition = conditionOf[kind];
      if (condition) add(map, id, { tool: "verify_finding", expectedCondition: condition });
    }
  }
  for (const [grounding, condition] of [[FOCUS_INDICATOR_GROUNDING, FOCUS_INDICATOR_CONDITION], [PLACEHOLDER_LABEL_GROUNDING, PLACEHOLDER_LABEL_CONDITION], [DECORATIVE_ICON_GROUNDING, DECORATIVE_ICON_CONDITION], [LINK_TITLE_GROUNDING, LINK_TITLE_CONDITION], [ICON_ONLY_BUTTON_GROUNDING, ICON_ONLY_BUTTON_CONDITION]] as const) {
    for (const id of grounding.implements) {
      if (!id.startsWith("govbr-")) continue;
      add(map, id, { tool: "scan_page", check: "structure" });
      add(map, id, { tool: "verify_finding", expectedCondition: condition });
    }
  }
  for (const id of FOCUS_ORDER_IMPLEMENTS) {
    if (!id.startsWith("govbr-")) continue;
    add(map, id, { tool: "scan_page", check: "page" });
    add(map, id, { tool: "verify_finding", expectedCondition: EXPECTED_CONDITIONS.skipLinkFirstFocus });
  }
  for (const part of ANATOMY_PARTS) {
    for (const id of part.rules) {
      add(map, id, { tool: "scan_page", check: "structure" });
      add(map, id, { tool: "verify_finding", expectedCondition: EXPECTED_CONDITIONS.anatomyPart });
    }
  }
  for (const condition of CONTEXT_CONDITIONS) {
    if (condition.check === "anatomy-part") continue;
    for (const rule of condition.rules) if (rule.source === "govbr-ds-kb") add(map, rule.id, { tool: "verify_finding", expectedCondition: condition.condition });
  }
  return map;
}

/** Como o oráculo mede a regra (vazio = nenhuma medida automática). */
export function oracleMeasuresFor(ruleId: string): OracleMeasure[] {
  index ??= build();
  return index.get(ruleId) ?? [];
}
