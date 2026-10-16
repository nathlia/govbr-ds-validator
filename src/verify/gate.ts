/**
 * C3 — portão de verificação (wang2025sgcr dual-pathway), refeito na fatia 4 do v02.
 *
 * O portão respondia `confirmed` quando a regra citada existia e, com live, quando o localizador
 * achava um elemento: existência da regra e presença do elemento viravam confirmação de qualquer
 * alegação semântica. Nas execuções de 14/09 foram 4 chamadas, todas `confirmed` assim (D-38).
 * Agora cada coisa é conferida e devolvida em separado:
 *
 *   ruleExists          o id pertence a um registro versionado — formato nunca prova existência
 *   applicability       a regra pode sustentar achado (evidência de exemplo e verificação sem norma
 *                       não podem)
 *   evidenceConsistent  valores legíveis por máquina concordam com o registro e, com live, com cada
 *                       elemento no estado reproduzido
 *   violation           um predicado implementado recalculou a violação em todos os elementos
 *
 * `confirmed` só existe com `violation: verified`. Qualquer conferência que falha → `rejected`. O
 * resto — regra real, evidência não contradita, violação que o oráculo não decide — é
 * `unverifiable`, e é assim que ele deve chegar a quem revisa.
 */
import type { CheckStatus, Finding, Verdict, Verification, ViolationStatus } from "../schema/finding.js";
import { findEmagRule, getPageRules, getTokenRegistry } from "../data/load.js";
import { getRuleById } from "../data/knowledge.js";
import { normalizeColor } from "../checkers/color.js";
import { withPage } from "../evidence/browser.js";
import { inspectPageComputedStyles, type StyleProperty } from "../evidence/inspect.js";
import { inspectPageStructure, type PageFacts } from "../evidence/pageFacts.js";
import { reproduceState, unreachedLimitation, type PageScanAction, type StateAttestation } from "../scan/pageScan.js";
import type { Arrival } from "../scan/actions.js";
import { FROZEN_DESKTOP_VIEWPORT, STATE_IDENTITY_POLICY, compareStates, sameScanPage, type StateMismatch } from "../scan/state.js";
import {
  emagMembership,
  kbMembership,
  pageConstraintMembership,
  registryVersions,
  structureRuleMembership,
  tokenRuleMembership,
  wcagMembership,
  type Membership,
} from "./registries.js";
import { selectPredicate } from "./predicates.js";
import type { ContextEvidence } from "./contextual.js";
import { collectAccessibility, collectAnatomy, traceObserver, type TraceObservation, type TraceRequest } from "../evidence/context.js";
import { findingSha256 } from "./store.js";

export interface GateInput {
  finding: Finding;
  /** Reabre element.page, reproduz actions e verifica cada elemento de element.locator. */
  live?: boolean;
  actions?: PageScanAction[];
  /** Estado alegado; se o estado reproduzido tiver outro fingerprint, a alegação fica sem verificação (limitação). */
  stateFingerprint?: string;
  /** Condições de chegada do estado alegado (2.10.0); não satisfeitas, nada é verificado nele. */
  arrival?: Arrival;
  /**
   * Estado registrado por um scan_page desta sessão (2.10.0): a receita é reaplicada como foi
   * gravada, e URL, janela e fingerprint reproduzidos têm de ser os do scan.
   */
  scanState?: ScanStateClaim;
}

export interface ScanStateClaim {
  scanId: string;
  recipe: StateAttestation["recipe"];
  url: string;
  viewport: { width: number; height: number };
  fingerprint: string;
}

/** O que a reprodução do estado provou, guardado junto do veredito (2.10.0). */
export interface StateBinding {
  policy: typeof STATE_IDENTITY_POLICY;
  scanId: string | null;
  reached: boolean;
  replay: StateAttestation["replay"]["status"];
  failure?: Extract<StateAttestation["replay"], { status: "failed" }>["failure"];
  arrival: StateAttestation["arrival"];
  observed: { url: string; path: string; viewport: StateAttestation["observed"]["viewport"] };
  mismatches: StateMismatch[];
  /** A espera de assentamento terminou com o DOM estável (state.ts, SETTLE_POLICY). */
  settled: boolean;
  /**
   * `state-not-reproduced`: a receita rodou e a chegada se cumpriu, mas URL, janela ou fingerprint
   * diferem do estado alegado. Estado não reproduzido é limitação, não evidência contra o achado.
   */
  limitation?: { kind: "action-error" | "arrival-not-met" | "state-not-reproduced"; detail: string };
}

/**
 * Uso indevido de `scanState` por quem chama o portão diretamente (o servidor recusa antes, com o
 * mesmo erro tipado das outras misturas de scanId): o achado aponta para outra página que a do scan.
 */
export class ScanStateMisuseError extends Error {
  readonly code = "scan-page-mismatch" as const;
  constructor(readonly findingPage: string, readonly scanUrl: string, readonly scanId: string) {
    super(`O achado aponta para ${findingPage}, mas o scan ${scanId} foi feito em ${scanUrl}: cite o scan da página do achado.`);
    this.name = "ScanStateMisuseError";
  }
}

interface Checks {
  ruleExists: CheckStatus;
  applicability: CheckStatus;
  evidenceConsistent: CheckStatus;
  violation: ViolationStatus;
}

const COLOR_PROPERTIES = ["backgroundColor", "color", "borderColor"] as const;

export function verdictOf(checks: Checks): Verdict {
  if (
    checks.ruleExists === "fail" ||
    checks.applicability === "fail" ||
    checks.evidenceConsistent === "fail" ||
    checks.violation === "contradicted"
  ) {
    return "rejected";
  }
  if (checks.violation === "verified" && checks.ruleExists === "pass") return "confirmed";
  return "unverifiable";
}

export async function verifyFinding({ finding, live = false, actions = [], stateFingerprint, arrival, scanState }: GateInput): Promise<Verification> {
  const checks: Checks = { ruleExists: "unknown", applicability: "unknown", evidenceConsistent: "unknown", violation: "not-checked" };
  const notes: string[] = [];
  const binding: {
    findingSha256: string;
    stateFingerprint: string | null;
    live: boolean;
    elements: number | null;
    state?: StateBinding;
    context?: unknown;
  } = { findingSha256: findingSha256(finding), stateFingerprint: null, live, elements: null };

  const rule = checkRule(finding);
  checks.ruleExists = rule.ruleExists;
  checks.applicability = rule.applicability;
  let verifiedBy = rule.verifiedBy;
  notes.push(...rule.notes);

  const claims = checkRegistryClaims(finding);
  if (claims) {
    checks.evidenceConsistent = claims.status;
    notes.push(claims.detail);
    if (claims.status === "fail") verifiedBy = "token-registry";
  }

  const selection = selectPredicate(finding);
  const result = (): Verification => ({
    verdict: verdictOf(checks),
    verifiedBy,
    detail: notes.join(" "),
    checks: { ...checks },
    predicate: selection.predicate?.id ?? null,
    binding,
    registries: registryVersions(),
  });

  if (verdictOf(checks) === "rejected") return result();
  if (!selection.predicate && selection.claimStatus === "contradicted") {
    checks.evidenceConsistent = "fail";
    notes.push(selection.reason);
    return result();
  }
  if (!selection.predicate) {
    checks.violation = "no-predicate";
    notes.push(selection.reason);
  }
  if (!live) {
    if (selection.predicate) {
      notes.push(`Predicado ${selection.predicate.id} disponível: repita com live=true, e com actions se a violação depender de interação.`);
    }
    return result();
  }

  verifiedBy = "live-inspection";
  const claimedHex = finding.evidence.data?.observedHex;
  const observedHex = typeof claimedHex === "string" ? normalizeColor(claimedHex) : null;
  // 2.10.0: a receita vem do scan citado, ou das actions/arrival enviadas; a janela é a do scan ou a
  // desktop congelada — o agente não escolhe janela.
  const recipe: StateAttestation["recipe"] = scanState?.recipe ?? {
    url: finding.element.page,
    viewport: { ...FROZEN_DESKTOP_VIEWPORT },
    viewportSource: "frozen-desktop",
    actions,
    ...(arrival ? { arrival } : {}),
  };
  // Origem + caminho + query; barra final e fragmento não distinguem páginas (state.ts, scanPageKey).
  if (scanState && !sameScanPage(finding.element.page, scanState.recipe.url)) {
    throw new ScanStateMisuseError(finding.element.page, scanState.recipe.url, scanState.scanId);
  }
  // 2.13.0 (NAT-85): predicados de transição pedem o traço da reprodução (foco, visibilidade e
  // texto antes da 1ª ação e depois de cada uma). Sem eles, a reprodução é a mesma da 2.12.0.
  const context = selection.predicate?.context;
  const claimData = (finding.evidence.data ?? {}) as Record<string, unknown>;
  const traceRequest: TraceRequest | null = context?.trace
    ? {
        subject: finding.element.locator,
        ...(context.trace.message && typeof claimData.errorMessage === "string" ? { message: claimData.errorMessage } : {}),
        ...(context.trace.text ? { text: true } : {}),
        ...(context.trace.focus ? { focus: true } : {}),
      }
    : null;
  const observations: TraceObservation[] = [];
  try {
    await withPage(recipe.url, async (page) => {
      const { attestation, fingerprint } = await reproduceState(page, recipe, traceRequest ? traceObserver(traceRequest, observations) : undefined);
      binding.stateFingerprint = fingerprint;
      const state: StateBinding = {
        policy: attestation.policy,
        scanId: scanState?.scanId ?? null,
        reached: attestation.reached,
        replay: attestation.replay.status,
        ...(attestation.replay.status === "failed" ? { failure: attestation.replay.failure } : {}),
        arrival: attestation.arrival,
        observed: { url: attestation.observed.url, path: attestation.observed.path, viewport: attestation.observed.viewport },
        mismatches: [],
        settled: attestation.settle.settled,
      };
      binding.state = state;
      if (!attestation.reached) {
        // Erro de receita/chegada é limitação de quem pediu: nada é verificado num estado que não foi
        // reproduzido — nem confirmado, nem rejeitado como se o defeito não existisse.
        state.limitation = unreachedLimitation(attestation);
        verifiedBy = "state-replay";
        notes.push(
          `Limitação: o estado alegado não foi reproduzido. ${state.limitation.detail} A alegação fica sem verificação; isto não indica ausência de defeito.`
        );
        return;
      }

      const claimed = scanState
        ? { url: scanState.url, viewport: scanState.viewport, fingerprint: scanState.fingerprint }
        : stateFingerprint
          ? { url: attestation.observed.url, viewport: attestation.observed.viewport, fingerprint: stateFingerprint }
          : null;
      if (claimed) {
        state.mismatches = compareStates(claimed, { url: attestation.observed.url, viewport: attestation.observed.viewport, fingerprint });
      }
      if (claimed && state.mismatches.length > 0) {
        // Estado não reproduzido é limitação, não evidência contra o achado: nada é verificado num
        // estado diferente do alegado, e o veredito fica `unverifiable` (nunca `rejected`).
        verifiedBy = "state-fingerprint";
        state.limitation = {
          kind: "state-not-reproduced",
          detail: `O estado reproduzido (${fingerprint}) não é o estado alegado (${claimed.fingerprint}); diverge em: ${state.mismatches.join(", ")}.${
            attestation.settle.settled ? "" : " A página não assentou dentro do teto de espera."
          } ${scanState ? `A receita do scan ${scanState.scanId} não reproduziu o mesmo estado.` : "Envie as actions que produzem o estado alegado."}`,
        };
        notes.push(`Limitação: ${state.limitation.detail} A alegação fica sem verificação; isto não indica ausência de defeito.`);
        return;
      }

      const properties = [...new Set<StyleProperty>([...(selection.predicate?.properties ?? []), ...(observedHex ? COLOR_PROPERTIES : [])])];
      const evidence = await inspectPageComputedStyles(page, finding.element.page, finding.element.locator, properties);
      binding.elements = evidence.count;
      if (evidence.count === 0 && context && !context.trace) {
        // Predicados contextuais: alvo desconhecido no estado é limitação, não contraprova.
        checks.violation = "undetermined";
        verifiedBy = `predicate:${selection.predicate!.id}`;
        notes.push(
          `Nenhum elemento para '${finding.element.locator}' no estado verificado: alvo desconhecido ou estado diferente do alegado. A alegação fica sem verificação; isto não indica ausência de defeito.`
        );
        return;
      }
      if (evidence.count === 0 && !context) {
        checks.evidenceConsistent = "fail";
        notes.push(
          `Nenhum elemento para '${finding.element.locator}' no estado verificado (${recipe.actions.length} ação(ões) reproduzida(s)). Se o defeito só existe depois de uma interação, envie actions.`
        );
        return;
      }

      if (observedHex) {
        const without = evidence.elements.filter(
          (element) =>
            !COLOR_PROPERTIES.map((property) => element.computed[property])
              .filter((value): value is string => typeof value === "string")
              .map((value) => normalizeColor(value))
              .includes(observedHex)
        );
        if (without.length > 0) {
          checks.evidenceConsistent = "fail";
          notes.push(
            `O valor alegado ${observedHex} não está nas cores computadas de ${without.length} de ${evidence.count} elemento(s) (${without.slice(0, 3).map((e) => e.locator).join(", ")}).`
          );
          return;
        }
      }

      // 2.7.0: predicado de página decide sobre o documento, não sobre o elemento localizado.
      const facts: PageFacts | undefined = selection.predicate?.needsPageFacts ? await inspectPageStructure(page, finding.element.page) : undefined;
      if (selection.predicate) {
        const claim = selection.predicate.verifyClaim(evidence.elements, facts);
        notes.push(claim.detail);
        if (claim.status === "contradicted") {
          checks.evidenceConsistent = "fail";
          return;
        }
      }

      // Finding an element cannot establish agreement with a structured assertion that is absent.
      checks.evidenceConsistent = selection.claimStatus === "missing" ? "unknown" : "pass";
      let contextEvidence: ContextEvidence | undefined;
      if (context) {
        contextEvidence = {
          actions: recipe.actions,
          ...(context.trace ? { trace: observations } : {}),
          ...(context.accessibility ? { accessibility: await collectAccessibility(page, finding.element.locator) } : {}),
          ...(context.anatomy ? { anatomy: await collectAnatomy(page, finding.element.locator) } : {}),
        };
        binding.context = summarizeContext(contextEvidence);
      }
      if (selection.predicate) {
        const outcome = selection.predicate.evaluate(evidence.elements, finding.element.page, facts, contextEvidence);
        checks.violation = outcome.status;
        verifiedBy = `predicate:${selection.predicate.id}`;
        notes.push(outcome.detail);
      } else {
        notes.push(`O localizador resolveu ${evidence.count} elemento(s); localizar não confirma a alegação.`);
      }
    }, { viewport: recipe.viewport });
  } catch (error) {
    if (checks.evidenceConsistent !== "fail") checks.violation = "error";
    notes.push(`Falha ao reabrir a página: ${error instanceof Error ? error.message : String(error)}`);
  }
  return result();
}

interface RuleCheck {
  ruleExists: CheckStatus;
  applicability: CheckStatus;
  verifiedBy: string;
  notes: string[];
}

function fromMembership<T>(membership: Membership<T>, verifiedBy: string): RuleCheck {
  const member = membership.status === "member";
  return {
    ruleExists: member ? "pass" : "fail",
    applicability: member ? "pass" : "unknown",
    verifiedBy,
    notes: [membership.detail],
  };
}

function checkRule(finding: Finding): RuleCheck {
  const { id, source } = finding.rule;
  let check: RuleCheck;

  switch (source) {
    case "govbr-ds-kb": {
      const membership = kbMembership(id);
      check = fromMembership(membership, "kb-rule-index");
      // D-10: evidência de implementação não é norma e não pode ser citada como regra violada.
      if (membership.entry?.force === "example") {
        check.applicability = "fail";
        check.notes.push(
          `'${id}' é evidência de implementação (force=example), não uma regra normativa. Cite uma regra required/prohibited/recommended do get_ds_rules.`
        );
      }
      // 2.12.0: id legado da versão anterior. Existe (a âncora não some), mas não sustenta achado
      // sozinho: descartado → aplicabilidade desconhecida; substituído → vale o que a sucessora vale.
      const legacy = membership.entry?.legacy;
      if (legacy?.class === "dropped") {
        check.applicability = "unknown";
        check.notes.push(
          `'${id}' é id legado da versão ${legacy.fromVersion}: regra sem texto na fonte oficial coletada. Cite uma regra listada pelo get_ds_rules.`
        );
      } else if (legacy?.class === "superseded") {
        const successors = legacy.supersededBy.map((s) => getRuleById(s)).filter((r): r is NonNullable<typeof r> => Boolean(r));
        check.applicability = successors.length === 0 ? "unknown" : successors.some((r) => r.force !== "example") ? "pass" : "fail";
        check.notes.push(
          `'${id}' é id legado da versão ${legacy.fromVersion}, substituído por ${legacy.supersededBy.join(", ")}; ` +
            `aplicabilidade conferida pela(s) sucessora(s) (${successors.map((r) => r.force).join(", ") || "nenhuma encontrada"}). Prefira citar o id novo.`
        );
      }
      break;
    }
    case "emag":
      check = fromMembership(emagMembership(id), "emag-rule-index");
      break;
    case "wcag": {
      const cited = wcagMembership(id).status === "malformed" && finding.rule.wcag ? finding.rule.wcag : id;
      check = fromMembership(wcagMembership(cited), "wcag-2.2-registry");
      break;
    }
    case "govbr-ds-token": {
      const membership = tokenRuleMembership(id);
      check = fromMembership(membership, "token-check-index");
      if (membership.entry && membership.entry.implements.length === 0) {
        check.applicability = "fail";
        check.notes.push(`'${id}' não tem norma que sustente achado; o desvio é observação (D-27/D-32).`);
      }
      break;
    }
    case "govbr-ds-structure":
      check = fromMembership(structureRuleMembership(id), "component-spec-index");
      break;
    case "govbr-ds-page": {
      // 2.7.0: as restrições publicadas por get_page_rules têm id e existência conferível. O resto
      // das diretrizes de página continua prosa sem id: ancorada a uma categoria fica `unknown`.
      const membership = pageConstraintMembership(id);
      if (membership.status === "member") {
        check = fromMembership(membership, "page-constraint-index");
        break;
      }
      const categories = Object.keys(getPageRules().categories);
      const known = categories.find((category) => id.includes(category));
      check = {
        ruleExists: "unknown",
        applicability: "unknown",
        verifiedBy: "page-rule-index",
        notes: [
          known
            ? `Diretrizes de página (${known}) não têm id citável por regra; a existência não pode ser conferida. ${membership.detail}`
            : `Não foi possível ancorar '${id}' a uma categoria de diretrizes de página (${categories.join(", ")}). ${membership.detail}`,
        ],
      };
      break;
    }
    case "axe-core":
      check = {
        ruleExists: "not-applicable",
        applicability: "not-applicable",
        verifiedBy: "axe-core",
        notes: ["Regras do axe-core são produzidas pelo verificador embutido, não conferidas por este portão."],
      };
      break;
    default:
      return {
        ruleExists: "fail",
        applicability: "unknown",
        verifiedBy: "rule-source-index",
        notes: [`Fonte de regra desconhecida: '${String(source)}'.`],
      };
  }

  // Uma referência WCAG cruzada também tem de existir: `emag-2.2` com `wcag: "9.9.9"` não passa.
  if (source !== "wcag" && finding.rule.wcag) {
    for (const reference of finding.rule.wcag.split(/[,;]/).map((value) => value.trim()).filter(Boolean)) {
      const membership = wcagMembership(reference);
      if (membership.status !== "member") {
        check.ruleExists = "fail";
        check.verifiedBy = "wcag-2.2-registry";
        check.notes.push(`Referência WCAG inválida: ${membership.detail}`);
      }
    }
  }

  // D-27: verificação determinística tem de nomear norma existente em `implements`.
  if (finding.pathway === "deterministic" && (source === "govbr-ds-token" || source === "govbr-ds-structure" || source === "govbr-ds-page")) {
    const declared = finding.rule.implements ?? [];
    if (declared.length === 0) {
      check.applicability = "fail";
      check.verifiedBy = "rule-grounding-index";
      check.notes.push(
        `'${id}' não declara qual regra normativa implementa. Verificação determinística sem norma nomeada não produz achado — produz observação de revisão (D-27).`
      );
    }
    const missing = declared.filter((ruleId) =>
      ruleId.startsWith("emag-") ? !findEmagRule(ruleId.replace(/^emag-/, "")) : !getRuleById(ruleId)
    );
    if (missing.length > 0) {
      check.ruleExists = "fail";
      check.verifiedBy = "rule-grounding-index";
      check.notes.push(`'${id}' declara implementar ${missing.join(", ")}, que não existe(m) no oráculo.`);
    }
  }

  return check;
}

/** Alegações legíveis por máquina conferidas contra o registro de tokens, sem abrir a página. */
function checkRegistryClaims(finding: Finding): { status: CheckStatus; detail: string } | null {
  const data = finding.evidence.data as Record<string, unknown> | undefined;
  if (!data) return null;
  const registry = getTokenRegistry();
  const passes: string[] = [];

  const observedHex = typeof data.observedHex === "string" ? normalizeColor(data.observedHex) : null;
  if (observedHex && finding.rule.source === "govbr-ds-token") {
    const tokens = registry.hexLookup[observedHex];
    if (tokens) {
      return { status: "fail", detail: `Alegação inconsistente: ${observedHex} É um valor de token do DS (${tokens.join(", ")}).` };
    }
    passes.push(`${observedHex} não é valor de token do DS.`);
  }

  const claimedToken = typeof data.expectedToken === "string" ? data.expectedToken : null;
  if (claimedToken) {
    if (registry.all[claimedToken] === undefined) {
      return { status: "fail", detail: `Token citado '${claimedToken}' não existe no registro do DS.` };
    }
    passes.push(`Token ${claimedToken} existe no registro.`);
  }

  return passes.length > 0 ? { status: "pass", detail: passes.join(" ") } : null;
}

/**
 * Evidência contextual exportada com o veredito (2.13.0): o traço por passo (foco, sujeitos exibidos,
 * foco dentro), os fatos de acessibilidade e de anatomia. É o que um revisor confere sem reabrir a página.
 */
function summarizeContext(evidence: ContextEvidence): unknown {
  return {
    actions: evidence.actions.length,
    ...(evidence.trace
      ? {
          trace: evidence.trace.map((o) => ({
            step: o.step,
            url: o.url,
            active: o.activeDescription,
            nextTarget: o.nextTarget,
            subjects: o.subjects.map((s) => ({ ref: s.ref, shown: s.shown, focusInside: s.focusInside, text: s.text.slice(0, 120) })),
            ...(o.message ? { message: o.message } : {}),
            ...(o.error ? { error: o.error } : {}),
          })),
        }
      : {}),
    ...(evidence.accessibility ? { accessibility: evidence.accessibility } : {}),
    ...(evidence.anatomy ? { anatomy: evidence.anatomy } : {}),
  };
}
