/**
 * 3.7.3 A8 (NAT-111, D-155; rastreio dev-371-a2 §5, U-07): atributo de estado ARIA × estado nativo do elemento.
 *
 * O que mede: em elemento que tem AO MESMO TEMPO um estado nativo e o atributo ARIA correspondente, se os dois dizem o
 * mesmo no estado que o scan (ou a receita do verify_finding) alcançou. Pares comparados:
 *   - `checked`/`indeterminate` (input checkbox/radio) × `aria-checked` (true/false/mixed);
 *   - `selected` (option) × `aria-selected`;
 *   - `open` (details, e o summary dele) × `aria-expanded`;
 *   - `:disabled` (controle de formulário) × `aria-disabled`;
 *   - `required` (campo onde required se aplica) × `aria-required`.
 * As propriedades nativas são as vivas (inspect.ts `nativeState`), não os atributos de marcação: o `checked` de um
 * checkbox alternado pelo usuário muda sem mudar a marcação.
 *
 * Fora, de propósito:
 *   - ARIA sem par nativo (`div role=switch aria-checked`, `aria-pressed`, `aria-expanded` num botão): nada a comparar;
 *   - nativo sem ARIA: nada diverge;
 *   - `aria-disabled="true"`/`aria-required="true"` sem o nativo: padrão legítimo (controle desabilitado que continua
 *     focável; validação própria) — não comparado, nunca divergência;
 *   - valor ARIA fora dos tokens do atributo: não comparado;
 *   - elemento oculto (sem caixa, visibility hidden, aria-hidden/inert): não exposto neste estado.
 *
 * Força (D-27/D-32/D-155): só o Switch tem cláusula obrigatória literal na base — "Quando ativado, o elemento switch deve
 * ter o atributo aria-checked definido como true e quando desativado … false" (`accessibility-switch-364149c5aea4`). A
 * divergência num Switch do DS (role=switch ou dentro de .br-switch/<br-switch>) vira achado com essa cláusula. Nos demais
 * elementos não há cláusula: a divergência é pendência medida, `rule` ausente, com a WCAG 4.1.2 como referência CANDIDATA
 * (o Chromium pode expor o estado nativo e ignorar o ARIA: a 4.1.2 não fica afirmada pela medida). A cláusula recomendada
 * do Switch (`switch-f51eb28cdaa5`, preferir o `checked` nativo) é contexto, nunca citação de violação.
 *
 * Concordância não é conformidade: um atributo ARIA estático que concorda com o nativo neste estado pode parar de
 * concordar depois de alternar. Por isso a concordância vira a pendência `aria-state-unverified` (medida parcial
 * declarada), quando a divergência seria mensurável depois de uma interação: checked/selected/expanded em qualquer valor,
 * disabled/required só quando os dois são false (com os dois true, o nativo que sai deixa o ARIA "true" no padrão
 * legítimo, que não é comparado).
 */
import type { ElementEvidence } from "../evidence/types.js";
import type { Finding, Observation } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import type { CheckGrounding } from "./grounding.js";
import { demoteToObservations, ownershipOf } from "./ownership.js";
import type { NotJudgedItem } from "../scan/notJudged.js";
import { createHash } from "node:crypto";

export const ARIA_STATE_CONDITION = EXPECTED_CONDITIONS.ariaStateMatchesNative;

/** Elementos com algum atributo de estado ARIA que tem par nativo (o inspect atravessa shadow roots abertos). */
export const ARIA_STATE_SELECTOR = "[aria-checked], [aria-selected], [aria-expanded], [aria-disabled], [aria-required]";

/** Switch (obrigatória): "Quando ativado, o elemento switch deve ter o atributo aria-checked definido como true e … false". */
export const SWITCH_ARIA_CHECKED = "govbr-3.7.0-accessibility-switch-364149c5aea4";
/** Switch (recomendada): "recomenda-se usar o atributo checked em vez da propriedade aria-checked" — contexto. */
export const SWITCH_PREFER_CHECKED = "govbr-3.7.0-accessibility-switch-f51eb28cdaa5";
/** Referência candidata quando não há cláusula do componente: nunca afirmada pela medida. */
export const ARIA_STATE_CANDIDATE = "wcag-4.1.2";

export const SWITCH_ARIA_GROUNDING: CheckGrounding = {
  implements: [SWITCH_ARIA_CHECKED],
  basis:
    "Switch (required): 'Quando ativado, o elemento switch deve ter o atributo aria-checked definido como true e quando " +
    "desativado, o atributo aria-checked definido como false'. A verificação lê só isto, num switch que tem estado nativo " +
    "(input checkbox/radio): o checked vivo × o aria-checked, no estado alcançado. Sem aria-checked não acusa.",
};

export type AriaState = "checked" | "selected" | "expanded" | "disabled" | "required";
export const ARIA_STATES: readonly AriaState[] = ["checked", "selected", "expanded", "disabled", "required"];

export interface AriaNativePair {
  state: AriaState;
  ariaAttribute: `aria-${AriaState}`;
  /** Valor do atributo ARIA, normalizado (aparado, minúsculo). */
  aria: string;
  /** Estado nativo no mesmo vocabulário (true/false/mixed). */
  native: string;
  relation: "agree" | "mismatch" | "not-compared";
  /** Por que não comparado. */
  why?: string;
}

const TOKENS: Record<AriaState, string[]> = {
  checked: ["true", "false", "mixed"],
  selected: ["true", "false"],
  expanded: ["true", "false"],
  disabled: ["true", "false"],
  required: ["true", "false"],
};

function pair(state: AriaState, raw: string, native: string): AriaNativePair {
  const aria = raw.trim().toLowerCase();
  const base = { state, ariaAttribute: `aria-${state}` as const, aria, native };
  if (!TOKENS[state].includes(aria)) return { ...base, relation: "not-compared", why: `valor ARIA "${raw.slice(0, 20)}" fora de ${TOKENS[state].join("/")}` };
  if ((state === "disabled" || state === "required") && native === "false" && aria === "true") {
    return { ...base, relation: "not-compared", why: `aria-${state}="true" sem o ${state} nativo é padrão legítimo (não comparado)` };
  }
  return { ...base, relation: aria === native ? "agree" : "mismatch" };
}

/** Os pares ARIA × nativo do elemento (vazio: sem atributo de estado ARIA com par nativo). */
export function ariaNativePairs(el: ElementEvidence): AriaNativePair[] {
  const ns = el.nativeState;
  if (!ns) return [];
  const out: AriaNativePair[] = [];
  const a = el.attributes;
  if (ns.checked !== undefined && a.ariaChecked !== undefined) out.push(pair("checked", a.ariaChecked, ns.indeterminate ? "mixed" : String(ns.checked)));
  if (ns.selected !== undefined && a.ariaSelected !== undefined) out.push(pair("selected", a.ariaSelected, String(ns.selected)));
  if (ns.open !== undefined && a.ariaExpanded !== undefined) out.push(pair("expanded", a.ariaExpanded, String(ns.open)));
  if (ns.disabled !== undefined && a.ariaDisabled !== null && a.ariaDisabled !== undefined) out.push(pair("disabled", a.ariaDisabled, String(ns.disabled)));
  if (ns.required !== undefined && a.ariaRequired !== null && a.ariaRequired !== undefined) out.push(pair("required", a.ariaRequired, String(ns.required)));
  return out;
}

/** A concordância deste par pode virar divergência mensurável depois de uma interação (ver o cabeçalho). */
export function unverifiedAfterInteraction(p: AriaNativePair): boolean {
  if (p.relation !== "agree") return false;
  if (p.state === "disabled" || p.state === "required") return p.native === "false";
  return true;
}

/** Switch: role=switch no elemento ou, fora do perfil knowledge-free, dentro de um Switch do DS. */
export function isSwitch(el: ElementEvidence): boolean {
  return (el.attributes.role ?? "").trim().toLowerCase() === "switch" || el.nativeState?.dsSwitch === true;
}

/** Exposto neste estado: com caixa e fora de aria-hidden/inert; a opção vale pela caixa do select que a contém. */
export function exposedForAria(el: ElementEvidence): boolean {
  if (el.axHidden) return false;
  return el.rendered !== false || (el.tagName === "option" && el.nativeState?.inRenderedSelect === true);
}
const exposed = exposedForAria;

const NATIVE_PROP: Record<AriaState, "checked" | "selected" | "open" | "disabled" | "required"> = {
  checked: "checked", selected: "selected", expanded: "open", disabled: "disabled", required: "required",
};

/**
 * O elemento tem o estado nativo equivalente a `state`, mesmo sem o atributo ARIA (revisão MED 1): lido do `nativeState`
 * coletado quando existe; sem coleta (nenhum atributo ARIA de estado), pela tag/tipo — o summary só conta com a coleta
 * (precisa ser o 1º summary de um details). Sem `state`, nunca: um par não alegado não se compara.
 */
export function hasNativeTwin(el: ElementEvidence, state: AriaState | null): boolean {
  if (!state) return false;
  if (el.nativeState) return el.nativeState[NATIVE_PROP[state]] !== undefined;
  const tag = el.tagName.toLowerCase();
  const type = (el.attributes.type ?? "").trim().toLowerCase();
  const twins: Record<AriaState, boolean> = {
    checked: tag === "input" && (type === "checkbox" || type === "radio"),
    selected: tag === "option",
    expanded: tag === "details",
    disabled: ["button", "input", "select", "textarea", "fieldset", "optgroup", "option"].includes(tag),
    required: (tag === "input" && !["hidden", "range", "color", "submit", "reset", "button", "image"].includes(type)) || tag === "select" || tag === "textarea",
  };
  return twins[state];
}
const outsidePage = (el: ElementEvidence) => ownershipOf(el) === "ds-web-component" || ownershipOf(el) === "ds-third-party";

/** `#x: checked=true × aria-checked="false"` (o par de cada elemento, curto). */
export function pairText(p: AriaNativePair, sep = "×"): string {
  return `${p.state === "expanded" ? "open" : p.state}=${p.native} ${sep} ${p.ariaAttribute}="${p.aria}"`;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
function setHash(parts: string[]): string {
  return createHash("sha256").update([...new Set(parts)].sort().join("\u0001")).digest("hex").slice(0, 16);
}

export interface AriaStateItemPair {
  locator: string;
  state: AriaState;
  native: string;
  aria: string;
}

export interface AriaNativeOptions {
  /** Perfil knowledge-free: nada da base (nem Switch do DS, nem cláusula, nem autoria do DS). */
  knowledgeFree?: boolean;
  /** A cláusula do Switch com força e texto curto (para a pendência); ausente no knowledge-free. */
  switchRule?: NotJudgedItem["rule"];
}

const EXAMPLES = 3;

function pendingItem(
  code: "aria-native-mismatch" | "aria-state-unverified",
  subject: string,
  entries: Array<{ el: ElementEvidence; pairs: AriaNativePair[] }>,
  extra: Pick<NotJudgedItem, "todo" | "measure" | "norms" | "rule">,
): NotJudgedItem {
  const pairs: AriaStateItemPair[] = entries.flatMap(({ el, pairs: ps }) => ps.map((p) => ({ locator: el.locator, state: p.state, native: p.native, aria: p.aria })));
  const sep = code === "aria-native-mismatch" ? "×" : "=";
  return {
    code,
    subject,
    count: entries.length,
    examples: entries.slice(0, EXAMPLES).map(({ el }) => clip(el.locator, 120)),
    elementSet: setHash(pairs.map((p) => `${p.locator}|${p.state}=${p.native}/${p.aria}`)),
    elementBound: true,
    boundLocators: entries.map(({ el }) => el.locator),
    observed: entries.slice(0, 2).map(({ el, pairs: ps }) => `${clip(el.locator, 60)}: ${ps.map((p) => pairText(p, sep)).join(", ")}`).join("; "),
    ariaPairs: pairs,
    ...extra,
  };
}

/**
 * Mede os pares nos elementos dados (a coleta de ARIA_STATE_SELECTOR, ou a região de um scan com seletores). Devolve os
 * achados (Switch do DS, perfil com conhecimento), as observações (divergência dentro de web component do DS) e as
 * pendências (divergência sem cláusula; concordância não verificada depois de interação).
 */
export function checkAriaNativeStates(page: { url: string }, elements: ElementEvidence[], options: AriaNativeOptions = {}): { findings: Finding[]; observations: Observation[]; pending: NotJudgedItem[] } {
  const kf = options.knowledgeFree === true;
  const findings: Finding[] = [];
  const observations: Observation[] = [];
  const mismatchOther: Array<{ el: ElementEvidence; pairs: AriaNativePair[] }> = [];
  const unverifiedSwitch: Array<{ el: ElementEvidence; pairs: AriaNativePair[] }> = [];
  const unverifiedOther: Array<{ el: ElementEvidence; pairs: AriaNativePair[] }> = [];
  const seen = new Set<string>();
  for (const el of elements) {
    if (seen.has(el.locator)) continue;
    seen.add(el.locator);
    if (!exposed(el)) continue;
    const pairs = ariaNativePairs(el);
    if (!pairs.length) continue;
    const mismatched = pairs.filter((p) => p.relation === "mismatch");
    const outside = !kf && outsidePage(el);
    const switchEl = !kf && isSwitch(el);
    if (mismatched.length) {
      const checked = mismatched.find((p) => p.state === "checked" && p.native !== "mixed");
      if (switchEl && checked) {
        findings.push(switchFinding(page, el, checked));
        const rest = mismatched.filter((p) => p !== checked);
        if (rest.length && !outside) mismatchOther.push({ el, pairs: rest });
      } else if (outside) {
        observations.push(outsideObservation(page, el, mismatched));
      } else {
        mismatchOther.push({ el, pairs: mismatched });
      }
      continue;
    }
    // Interno de web component do DS: o ARIA é do componente, não da página (como nos demais checks de autoria).
    if (outside) continue;
    const open = pairs.filter(unverifiedAfterInteraction);
    if (!open.length) continue;
    (switchEl && open.some((p) => p.state === "checked") ? unverifiedSwitch : unverifiedOther).push({ el, pairs: open });
  }
  // O achado do Switch dentro de web component do DS vira observação de autoria (ownership.ts), como nos outros checks.
  const byLocator = new Map(elements.map((el) => [el.locator, el]));
  const own = findings.filter((f) => !outsidePage(byLocator.get(f.element.locator)!));
  const demoted = findings.filter((f) => outsidePage(byLocator.get(f.element.locator)!));
  observations.push(...demoteToObservations(demoted, elements));

  const pending: NotJudgedItem[] = [];
  const candidate = { norms: [ARIA_STATE_CANDIDATE] };
  const measure = "estado nativo vivo (checked/indeterminate, selected, open, :disabled, required) × atributo ARIA, no mesmo estado";
  if (mismatchOther.length) {
    pending.push(pendingItem("aria-native-mismatch", "estado ARIA diverge do estado nativo", mismatchOther, {
      todo: `decida: o atributo ARIA não diz o estado nativo neste estado; sem cláusula do componente, WCAG 4.1.2 é referência candidata, não violação afirmada (verify_finding: expectedCondition ${ARIA_STATE_CONDITION})`,
      measure,
      ...candidate,
    }));
  }
  const procedure = `alterne com actions (click/press) e meça: verify_finding live (expectedCondition ${ARIA_STATE_CONDITION}) com essa receita, ou scan_page com ela e pendingResolved`;
  const requires = { resolveRequires: { actions: true as const, expectedCondition: ARIA_STATE_CONDITION } };
  if (unverifiedSwitch.length) {
    pending.push(pendingItem("aria-state-unverified", "switch: aria-checked não verificado depois de alternar", unverifiedSwitch, {
      todo: `${procedure}: aria-checked acompanha o checked?`,
      measure,
      norms: [SWITCH_ARIA_CHECKED, ARIA_STATE_CANDIDATE],
      ...(options.switchRule ? { rule: options.switchRule } : {}),
      ...requires,
    }));
  }
  if (unverifiedOther.length) {
    pending.push(pendingItem("aria-state-unverified", "estado ARIA não verificado depois de interação", unverifiedOther, {
      todo: `${procedure}: o atributo ARIA acompanha o estado nativo?`,
      measure,
      ...candidate,
      ...requires,
    }));
  }
  return { findings: own, observations, pending };
}

/**
 * `mode: display`: a divergência está no DOM do estado que a receita reproduziu (mesmo quando a receita alternou o
 * switch) — nenhum passo depois da receita é preciso, e a identidade da família não muda entre estados.
 */
function switchFinding(page: { url: string }, el: ElementEvidence, p: AriaNativePair): Finding {
  const on = p.native === "true";
  return {
    id: nextFindingId(),
    rule: {
      id: SWITCH_ARIA_CHECKED,
      source: "govbr-ds-kb",
      description: "Switch (obrigatória): ativado, aria-checked=\"true\"; desativado, aria-checked=\"false\".",
      implements: [...SWITCH_ARIA_GROUNDING.implements],
    },
    element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: page.url },
    evidence: {
      observed: `switch ${on ? "ativado" : p.native === "mixed" ? "indeterminado" : "desativado"} (checked=${p.native}) com aria-checked="${p.aria}" neste estado`,
      expected: `aria-checked="${p.native}": o atributo acompanha o estado do switch`,
      data: {
        expectedCondition: ARIA_STATE_CONDITION,
        component: "switch",
        state: "checked",
        ariaAttribute: "aria-checked",
        observedNative: p.native,
        observedAria: p.aria,
        context: SWITCH_PREFER_CHECKED,
      },
    },
    severity: "moderate",
    nature: "syntactic",
    mode: "display",
    pathway: "deterministic",
  };
}

function outsideObservation(page: { url: string }, el: ElementEvidence, pairs: AriaNativePair[]): Observation {
  return {
    kind: "outside-page-authorship",
    element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: page.url },
    note: `estado ARIA diverge do nativo: ${pairs.map((p) => pairText(p)).join(", ")}${el.originHost ? ` (dentro de <${el.originHost}>)` : ""}`,
    whyNotAFinding:
      "O elemento está dentro do shadow root de um web component do próprio DS: o ARIA é do componente, não da página que o usou. Não é defeito de autoria desta tela.",
    data: {
      reason: ownershipOf(el),
      ...(el.originHost ? { host: el.originHost } : {}),
      rule: null,
      candidate: ARIA_STATE_CANDIDATE,
      expectedCondition: ARIA_STATE_CONDITION,
      pairs: pairs.map((p) => ({ state: p.state, native: p.native, aria: p.aria })),
    },
  };
}
