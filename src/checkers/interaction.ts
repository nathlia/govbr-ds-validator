/**
 * 3.6.5 (D-155; rastreio dev-364 §2, A-04 p03): o passo de interação que leva ao estado em que o fato existe.
 *
 * Um achado `mode:"interaction"` descreve um defeito que se manifesta quando alguém interage. Em parte deles o
 * próprio oráculo interagiu para medir (o foco visível: o elemento foi focado antes da comparação de estilo) e o
 * fato só existe nesse estado — mas o achado saía ligado ao estado do scan, sem dizer que era preciso focar. O
 * agente copiava o estado do scan como receita (só carregar) e o juiz não reproduzia o fato.
 *
 * Aqui: (1) o que o check fez fica gravado em `evidence.data.interaction` (genérico por check, nunca por tela,
 * seletor ou componente); (2) `interactionOf` projeta, para QUALQUER achado `mode:"interaction"`, o passo mínimo
 * na forma das ações do scan_page/verify_finding. Ordem de decisão:
 *   - o que o check gravou;
 *   - sem gravação (o agente reescreveu a evidência), a condição estruturada que o predicado decide
 *     (`expectedCondition`): foco visível → focar o elemento; salto como 1º foco → Tab a partir do carregamento;
 *   - check que decide pela marcação (axe, estrutura do componente): nenhum passo (`needed:false`);
 *   - nada disso: `needed:"unknown"` — o oráculo não sabe; nunca "nenhum passo" por omissão.
 * Revisão: o Tab a partir do carregamento só vale numa receita sem ações (depois de ações, o foco está noutro lugar);
 * com ações, a ordem de foco é dita como fato da marcação (o tabindex).
 */
import type { Finding } from "../schema/finding.js";
import type { PageAction } from "../scan/actions.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";

/** O que o check fez antes de medir (gravado em evidence.data.interaction; sem localizador, para não partir famílias). */
export type RecordedInteraction =
  /** O elemento do achado recebeu foco em modalidade de teclado (Shift + element.focus(); o mesmo que Tab até ele). */
  | { action: "focus"; via: "keyboard" }
  /** A partir do carregamento, `presses` Tab(s): o fato é quem recebe o foco. */
  | { action: "tab-from-start"; presses: number }
  /** O fato está na marcação do estado (o scan tinha ações: o Tab a partir do carregamento não se aplica). */
  | { action: "markup" };

export const FOCUS_INTERACTION: RecordedInteraction = { action: "focus", via: "keyboard" };
export const TAB_FROM_START: RecordedInteraction = { action: "tab-from-start", presses: 1 };
export const MARKUP_FACT: RecordedInteraction = { action: "markup" };

/** A condição do predicado de foco visível (a mesma de checkers/focusIndicator.ts; aqui sem importar o check). */
const FOCUS_VISIBLE_CONDITION = "focus-indicator-visible";

export interface FindingInteraction {
  /** true = o fato só existe depois dos passos; false = o fato está no DOM do estado do scan; "unknown" = o oráculo não sabe. */
  needed: boolean | "unknown";
  /** Os passos, na forma de `actions` do scan_page/verify_finding — vão DEPOIS das ações da receita do estado. */
  steps: PageAction[];
  text: string;
  /** De onde veio: gravado pelo check, deduzido da condição, check da marcação, ou nada. */
  basis: "recorded" | "condition" | "markup-check" | "none";
}

/** Localizador do inspect (saltos de shadow root com ` >>> `) → seletor das ações (Playwright atravessa shadow abertos). */
export function actionSelector(locator: string): string {
  return locator.replace(/\s+>>>\s+/g, " >> ");
}

function recorded(finding: Finding): RecordedInteraction | undefined {
  const value = finding.evidence?.data?.interaction as RecordedInteraction | undefined;
  if (!value || typeof value !== "object") return undefined;
  if (value.action === "focus" || value.action === "tab-from-start" || value.action === "markup") return value;
  return undefined;
}

/** Sem gravação: a condição estruturada que o predicado decide diz o passo. */
function deduced(finding: Finding): RecordedInteraction | undefined {
  const condition = finding.evidence?.data?.expectedCondition;
  if (condition === FOCUS_VISIBLE_CONDITION) return FOCUS_INTERACTION;
  if (condition === EXPECTED_CONDITIONS.skipLinkFirstFocus) return TAB_FROM_START;
  return undefined;
}

/** Checks que decidem pela marcação do estado (sem interagir): o axe e a estrutura do componente. */
function markupCheck(finding: Finding): boolean {
  const checker = finding.rule.checker ?? "";
  return finding.rule.source === "axe-core" || checker.startsWith("ds-structure-") || finding.evidence?.data?.expectedCondition === EXPECTED_CONDITIONS.structureTag;
}

/**
 * O passo mínimo de interação de um achado `mode:"interaction"` (undefined para os demais modos). `recipeActions`: as
 * ações da receita do estado, quando conhecidas (o Tab a partir do carregamento só vale sem ações).
 */
export function interactionOf(finding: Finding, recipeActions?: readonly unknown[]): FindingInteraction | undefined {
  if (finding.mode !== "interaction") return undefined;
  const fromCheck = recorded(finding);
  const done = fromCheck ?? deduced(finding);
  const basis = fromCheck ? "recorded" : "condition";
  if (done?.action === "focus") {
    const selector = actionSelector(finding.element.locator);
    return {
      needed: true,
      steps: [{ action: "press", selector, key: "Shift" }],
      text: `foque ${selector} pelo teclado (Tab até ele; na receita, press Shift com selector dá o foco sem editar): o fato só existe com o elemento focado`,
      basis,
    };
  }
  if (done?.action === "tab-from-start" || done?.action === "markup") {
    if (done.action === "markup" || recipeActions?.length) {
      return {
        needed: false,
        steps: [],
        text: "o fato está na marcação (tabindex) deste estado; depois das ações da receita o foco já está noutro lugar, então o Tab a partir do carregamento não se aplica",
        basis,
      };
    }
    const presses = Math.max(1, Math.min(20, Math.trunc(done.presses) || 1));
    return {
      needed: true,
      steps: Array.from({ length: presses }, () => ({ action: "press" as const, key: "Tab" })),
      text: `a partir do carregamento, ${presses} Tab: o fato é o elemento que recebe o foco (o tabindex na marcação o põe antes)`,
      basis,
    };
  }
  if (markupCheck(finding)) {
    return {
      needed: false,
      steps: [],
      text: "nenhum passo: o check decide pela marcação deste estado (a interação só mostra o efeito); a receita é a do estado do scan",
      basis: "markup-check",
    };
  }
  return {
    needed: "unknown",
    steps: [],
    text: "o oráculo não sabe que interação leva a este fato: descreva em state.steps a que você fez para observá-lo",
    basis: "none",
  };
}

/** Nota fixa do verify/família: onde o passo vai no cartão. */
export const INTERACTION_NOTE =
  "Copie para state.steps do cartão: as ações da receita do estado e, depois, interaction.steps. Sem o passo, o fato não aparece.";
