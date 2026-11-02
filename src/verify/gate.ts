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
import { paintedBorderSides } from "../checkers/tokenCompliance.js";
import { measureFocusIndicators } from "../evidence/focusIndicator.js";
import { BrowserToolError, POLICY_OR_DEADLINE, sanitizeErrorMessage, withPage } from "../evidence/browser.js";
import { runAxeRuleOnLocator as axeRuleOnLocator } from "../checkers/axe.js";
import { inspectPageComputedStyles, type StyleProperty } from "../evidence/inspect.js";
import { inspectPageStructure, type PageFacts } from "../evidence/pageFacts.js";
import { reproduceState, unreachedLimitation, type PageScanAction, type StateAttestation } from "../scan/pageScan.js";
import type { Arrival } from "../scan/actions.js";
import { oracleViewport, STATE_IDENTITY_POLICY, compareStates, sameScanPage, type StateMismatch } from "../scan/state.js";
import {
  emagMembership,
  kbMembership,
  pageConstraintMembership,
  registryVersions,
  registryVersionsKnowledgeFree,
  groundingForCheckId,
  structureRuleMembership,
  tokenRuleMembership,
  wcagMembership,
  type Membership,
} from "./registries.js";
import { asCheckerForm, checkerOf, relatedRuleForCheckId, type CheckerRef } from "./registries.js";
import { selectPredicate, selectPredicateKnowledgeFree } from "./predicates.js";
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
  /**
   * 2.14.0 (NAT-61): perfil knowledge-free. Fontes do DS e do e-MAG não são conferidas
   * (`ruleExists: unknown`, nota neutra fixa, nunca `confirmed`); só a WCAG 2.2 e o axe-core; sem
   * conferência de token no registro; só os predicados P1 pela fonte WCAG.
   */
  knowledgeFree?: boolean;
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

/**
 * 2.15.0: resultado do portão. `next` é o próximo passo quando a conferência não decide aqui
 * (verificação do oráculo sem norma nomeada); não faz parte do esquema Finding.
 */
export type GateVerification = Verification & { next?: string; issue?: GateIssue };

/**
 * 3.6.6 (revisão da 3.6.5, ALTA 1): a nota que decidiu ou impediu a decisão (o detalhe do predicado, a limitação do estado
 * não alcançado, a falta de predicado) — fora do objeto da verificação (que é guardado e devolvido inteiro), para o bloco
 * `interaction` do verify_finding dizer o que faltou observar.
 * Revisão da 3.6.6 (MÉDIA 1): com o motivo ESTRUTURADO de a decisão faltar — `recipeGap` = a receita não levou ao que o
 * predicado precisa observar (estado não alcançado; alvo ausente no estado; predicado contextual com
 * ContextOutcome.recipeGap). Sem ele, a receita alcançou o estado e o predicado não decidiu por outro motivo.
 */
export interface DecisiveNote {
  note: string;
  recipeGap: boolean;
}
const DECISIVE_NOTE = new WeakMap<GateVerification, DecisiveNote>();
export function decisiveNoteOf(verification: GateVerification): DecisiveNote | undefined {
  return DECISIVE_NOTE.get(verification);
}

/**
 * 3.3.0 (S-04, N-06): o que impediu a decisão, quando não é contraevidência medida. Todos dão
 * `unverifiable` (nunca `rejected`): o fato não foi avaliado, a entrada é que precisa ser corrigida.
 */
export type GateIssue =
  | "evidence-inconsistent" // dados estruturados do payload malformados/incoerentes entre si
  | "evidence-incomplete" // o id tem predicado, mas faltam campos de evidence.data (projeção sem dados)
  | "locator-no-elements" // o localizador não achou nada no estado reproduzido
  | "locator-ambiguous" // o localizador resolveu elementos com valores diferentes do alegado
  | "invalid-locator" // o navegador recusou o seletor (XPath, text=, sintaxe)
  | "page-http-error" // a página reaberta respondeu com status HTTP de erro
  // 3.4.0 (B2): o predicado rodou e a condição da regra não vale neste estado (inaplicável), ou o
  // sujeito não é o que a condição mede (o invocador no lugar do diálogo). Nunca contradição medida.
  | "rule-not-applicable"
  | "subject-not-a-dialog";

/** Próximo passo fixo para verificação do oráculo sem norma nomeada (D-27, 2.15.0). */
export const UNGROUNDED_NEXT =
  "Esta verificação do oráculo não nomeia norma: o desvio é observação, não achado do oráculo. " +
  "Se o fato medido viola um critério que você justifica, reescreva o achado com source 'wcag' ou 'emag' " +
  "e esse critério; senão, mantenha o fato com rule: null.";

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

export async function verifyFinding({
  finding,
  live = false,
  actions = [],
  stateFingerprint,
  arrival,
  scanState,
  knowledgeFree = false,
}: GateInput): Promise<GateVerification> {
  const checks: Checks = { ruleExists: "unknown", applicability: "unknown", evidenceConsistent: "unknown", violation: "not-checked" };
  const notes: string[] = [];
  /** 3.6.6: a decisão faltou porque a receita não levou ao que o predicado observa (ver DecisiveNote). */
  let recipeGap = false;
  const binding: {
    findingSha256: string;
    stateFingerprint: string | null;
    live: boolean;
    elements: number | null;
    state?: StateBinding;
    context?: unknown;
  } = { findingSha256: findingSha256(finding), stateFingerprint: null, live, elements: null };

  // 3.6.0: o achado de um check cita a norma em rule.id e nomeia o check em rule.checker. A citação é conferida
  // como veio; o check (quando a norma citada é dele) escolhe o predicado e a norma resolvida pelo servidor.
  const resolution = knowledgeFree ? { ref: null } : checkerOf(finding);
  const checker = resolution.ref;
  const asChecker = checker ? asCheckerForm(finding, checker) : finding;
  const rule = knowledgeFree ? checkRuleKnowledgeFree(finding) : checkRule(finding, checker);
  checks.ruleExists = rule.ruleExists;
  checks.applicability = rule.applicability;
  let verifiedBy = rule.verifiedBy;
  notes.push(...rule.notes);
  if ("note" in resolution && resolution.note) notes.push(resolution.note);
  // 2.15.0: verificação do oráculo sem norma nunca confirma — e também não rejeita o fato medido.
  const ungrounded = rule.ungrounded === true;
  // 3.4.4 (C7): sem norma decidível por máquina, mas com norma da base sobre o assunto — o próximo passo a nomeia.
  const related = ungrounded && checker ? relatedRuleForCheckId(checker.family, checker.checker) : undefined;

  const claims = knowledgeFree ? null : checkRegistryClaims(asChecker);
  if (claims) {
    checks.evidenceConsistent = claims.status;
    notes.push(claims.detail);
    if (claims.status === "fail") verifiedBy = "token-registry";
  }

  const selection = knowledgeFree ? selectPredicateKnowledgeFree(finding) : selectPredicate(asChecker);
  const baseResult = (): GateVerification => ({
    verdict: ungrounded && verdictOf(checks) === "confirmed" ? "unverifiable" : verdictOf(checks),
    verifiedBy,
    detail: notes.join(" "),
    checks: { ...checks },
    predicate: selection.predicate?.id ?? null,
    binding,
    registries: knowledgeFree ? registryVersionsKnowledgeFree() : registryVersions(),
    ...(ungrounded
      ? {
          next: related
            ? `Há norma na base sobre isto: ${related.id} (${related.force}): "${related.text}" O oráculo não a decide por máquina (tolerância da escala). Leia a unidade, meça o valor e mantenha o fato citando essa unidade se o desvio for claro; senão, declare a incerteza.`
            : UNGROUNDED_NEXT,
        }
      : {}),
  });

  let issue: GateIssue | undefined;
  const result = (): GateVerification => {
    const out: GateVerification = {
      ...baseResult(),
      ...(issue ? { issue } : {}),
    };
    // 3.6.6: a última nota é a que decidiu (ou impediu) — o predicado, a limitação do estado, o motivo de não haver predicado.
    if (notes.length) DECISIVE_NOTE.set(out, { note: notes[notes.length - 1], recipeGap });
    return out;
  };

  if (verdictOf(checks) === "rejected") return result();
  if (!selection.predicate && selection.claimStatus === "contradicted") {
    // 3.3.0 (S-04): dados do payload incoerentes entre si (ex.: expectedCondition com erro de
    // digitação) não são contraevidência medida — o fato não foi avaliado; corrija evidence.data.
    checks.violation = "undetermined";
    issue = "evidence-inconsistent";
    notes.push(selection.reason);
    return result();
  }
  if (!selection.predicate) {
    checks.violation = "no-predicate";
    notes.push(selection.reason);
    // N-01: há predicado para este id, mas o payload veio sem os dados estruturados que ele lê.
    if (selection.claimStatus === "missing") issue = "evidence-incomplete";
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
    viewport: oracleViewport().viewport,
    viewportSource: oracleViewport().source,
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
        recipeGap = true;
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
        recipeGap = true;
        state.limitation = {
          kind: "state-not-reproduced",
          detail: `O estado reproduzido (${fingerprint}) não é o estado alegado (${claimed.fingerprint}); diverge em: ${state.mismatches.join(", ")}.${
            attestation.settle.settled ? "" : " A página não assentou dentro do teto de espera."
          } ${scanState ? `A receita do scan ${scanState.scanId} não reproduziu o mesmo estado.` : "Envie as actions que produzem o estado alegado."}`,
        };
        notes.push(`Limitação: ${state.limitation.detail} A alegação fica sem verificação; isto não indica ausência de defeito.`);
        return;
      }

      // 3.3.0 (S-11): a página reaberta é uma página de erro HTTP — nada é medido nela.
      const httpStatus = attestation.observed.httpStatus;
      if (httpStatus !== undefined) {
        issue = "page-http-error";
        checks.violation = "undetermined";
        notes.push(`A página reaberta respondeu HTTP ${httpStatus}: nada foi medido numa página de erro. A alegação fica sem verificação; isto não indica ausência de defeito.`);
        return;
      }

      // 3.3.0 (S-05): achado do axe-core (ou que nomeia evidence.data.axeRule) — o axe roda de novo só
      // com aquela regra, no estado reproduzido, e decide sobre os elementos do localizador.
      const axeRule = axeRuleOf(finding);
      if (axeRule) {
        const outcome = await axeRuleOnLocator(page, finding.element.locator, axeRule);
        verifiedBy = `axe-recheck:${axeRule}`;
        binding.elements = outcome.matched;
        if (!outcome.known) {
          if (finding.rule.source === "axe-core") checks.ruleExists = "fail";
          checks.violation = "undetermined";
          notes.push(`'${axeRule}' não é regra do axe-core ${outcome.version}.`);
          return;
        }
        if (finding.rule.source === "axe-core") {
          checks.ruleExists = "pass";
          checks.applicability = "pass";
        }
        if (outcome.matched === 0) {
          issue = "locator-no-elements";
          recipeGap = true;
          checks.violation = "undetermined";
          notes.push(`Nenhum elemento para '${finding.element.locator}' no estado verificado; o axe não decidiu sobre o alvo. Se o defeito só existe depois de uma interação, envie actions ou cite o scanId.`);
          return;
        }
        const { violating, passing, incomplete, inapplicable, hidden, matched } = outcome;
        if (violating === matched) {
          checks.evidenceConsistent = "pass";
          checks.violation = "verified";
          notes.push(`axe-core ${outcome.version} (só a regra ${axeRule}) reprovou ${violating} de ${matched} elemento(s) do localizador no estado verificado.`);
        } else if (violating === 0 && incomplete === 0 && hidden === 0) {
          checks.violation = "contradicted";
          notes.push(
            `axe-core ${outcome.version} (só a regra ${axeRule}) não reprovou nenhum dos ${matched} elemento(s): ${passing} passaram e ${inapplicable} estão fora do alcance da regra.`
          );
        } else {
          if (violating > 0) issue = "locator-ambiguous";
          checks.violation = "undetermined";
          notes.push(
            `axe-core ${outcome.version} (só a regra ${axeRule}): ${violating} reprovado(s), ${passing} aprovado(s), ${incomplete} incompleto(s), ${inapplicable} fora do alcance e ${hidden} oculto(s), de ${matched} elemento(s). ${
              hidden > 0 && violating === 0 ? "Elemento oculto neste estado: se o defeito aparece depois de uma interação, envie actions ou cite o scanId." : "Restrinja o localizador ao elemento do defeito."
            }`
          );
        }
        return;
      }

      const properties = [...new Set<StyleProperty>([...(selection.predicate?.properties ?? []), ...(observedHex ? COLOR_PROPERTIES : [])])];
      const evidence = await inspectPageComputedStyles(page, finding.element.page, finding.element.locator, properties);
      binding.elements = evidence.count;
      if (evidence.count === 0 && context && !context.trace) {
        // Predicados contextuais: alvo desconhecido no estado é limitação, não contraprova.
        checks.violation = "undetermined";
        recipeGap = true;
        verifiedBy = `predicate:${selection.predicate!.id}`;
        notes.push(
          `Nenhum elemento para '${finding.element.locator}' no estado verificado: alvo desconhecido ou estado diferente do alegado. A alegação fica sem verificação; isto não indica ausência de defeito.`
        );
        return;
      }
      if (evidence.count === 0 && !context) {
        // 3.3.0 (S-04): alvo ausente é limitação do estado (interação, atraso), não contraprova.
        issue = "locator-no-elements";
        recipeGap = true;
        checks.violation = "undetermined";
        notes.push(
          `Nenhum elemento para '${finding.element.locator}' no estado verificado (${recipe.actions.length} ação(ões) reproduzida(s)). Se o defeito só existe depois de uma interação, envie actions.`
        );
        return;
      }

      if (observedHex) {
        // 3.4.0 (B5): as cores dos lados pintados da borda também contam (B-15: `hr` com só border-top).
        const without = evidence.elements.filter(
          (element) =>
            ![
              ...COLOR_PROPERTIES.filter((property) => property !== "borderColor" || !element.borderSides || paintedBorderSides(element).length > 0)
                .map((property) => element.computed[property]),
              ...paintedBorderSides(element).map((s) => s.raw),
            ]
              .filter((value): value is string => typeof value === "string")
              .map((value) => normalizeColor(value))
              .includes(observedHex)
        );
        if (without.length === evidence.count) {
          checks.evidenceConsistent = "fail";
          notes.push(
            `O valor alegado ${observedHex} não está nas cores computadas de nenhum dos ${evidence.count} elemento(s) (${without.slice(0, 3).map((e) => e.locator).join(", ")}).`
          );
          return;
        }
        if (without.length > 0) {
          // 3.3.0 (S-04): localizador largo — parte dos elementos tem o valor, parte não. Não é
          // contraprova do fato; o localizador é que não nomeia só o elemento do defeito.
          issue = "locator-ambiguous";
          checks.violation = "undetermined";
          notes.push(
            `O localizador '${finding.element.locator}' resolveu ${evidence.count} elemento(s); o valor alegado ${observedHex} está em ${evidence.count - without.length} e falta em ${without.length} (${without.slice(0, 3).map((e) => e.locator).join(", ")}). Restrinja o localizador ao elemento do defeito.`
          );
          return;
        }
      }

      // 3.4.0 (B9): foco visível — medido em cada elemento resolvido, no estado reproduzido.
      if (selection.predicate?.needsFocusIndicator) {
        const measured = await measureFocusIndicators(page, evidence.elements.map((element) => element.locator));
        evidence.elements.forEach((element, i) => {
          element.focusIndicator = { focused: measured[i]?.focused ?? false, changed: measured[i]?.changed ?? [], complete: measured[i]?.complete ?? false, ...(measured[i]?.discounted ? { discounted: measured[i].discounted } : {}) };
        });
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
        if (outcome.status === "undetermined" && outcome.recipeGap) recipeGap = true;
        if (outcome.status === "undetermined" && outcome.code) issue = outcome.code;
        // 3.4.4 (C8): a regra julgada inaplicável neste estado não pode sair com applicability "pass" —
        // quem lê só `checks` entendia "aplicável e indeterminado".
        if (outcome.status === "undetermined" && outcome.code === "rule-not-applicable") checks.applicability = "not-applicable";
      } else {
        notes.push(`O localizador resolveu ${evidence.count} elemento(s); localizar não confirma a alegação.`);
      }
    }, { viewport: recipe.viewport });
  } catch (error) {
    // 3.3.0 (S-01, S-08): política de URL, prazo e cancelamento não são sobre a página — sobem como erro.
    if (error instanceof BrowserToolError && POLICY_OR_DEADLINE.has(error.errorCode)) throw error;
    const raw = error instanceof Error ? error.message : String(error);
    const message = sanitizeErrorMessage(raw);
    if (/selector|Unexpected token|Unknown engine|is not a valid/i.test(raw)) {
      // N-06: o problema é o localizador, não a página.
      issue = "invalid-locator";
      checks.violation = "undetermined";
      notes.push(`Localizador recusado pelo navegador: ${message}. Use um seletor CSS válido (sem XPath nem text=).`);
    } else {
      if (checks.evidenceConsistent !== "fail") checks.violation = "error";
      notes.push(`Falha ao reabrir a página: ${message}`);
    }
  }
  return result();
}

interface RuleCheck {
  ruleExists: CheckStatus;
  applicability: CheckStatus;
  verifiedBy: string;
  notes: string[];
  /** 2.15.0: verificação publicada do oráculo cujo id não nomeia norma (D-27) — `unverifiable` + next. */
  ungrounded?: boolean;
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

function checkRule(finding: Finding, checker: CheckerRef | null = null): RuleCheck {
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
      // 2.15.0: a falta de norma (token-font-size, D-32) é decidida abaixo, pelo id, no servidor.
      check = fromMembership(tokenRuleMembership(id), "token-check-index");
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
  checkWcagCrossReference(finding, check);

  // D-27, decidido no servidor (2.15.0): a norma de uma verificação do próprio oráculo sai do id do
  // check (CHECK_GROUNDING / restrições publicadas), nunca do `implements` do payload — que pode faltar
  // (as projeções não o mostravam até a 2.14.3) ou divergir. Sem norma nomeada: `unverifiable` com
  // próximo passo, nunca `rejected` (o fato medido não é desmentido pela falta de norma).
  // 3.6.0: o check vem de rule.checker (ou do id, na forma antiga); a citação já foi conferida acima.
  if (checker) {
    const { family, checker: checkId } = checker;
    const grounded = groundingForCheckId(family, checkId);
    if (grounded !== null && grounded.length === 0) {
      if (check.applicability !== "fail") check.applicability = "unknown";
      check.ungrounded = true;
      check.verifiedBy = "rule-grounding-index";
      check.notes.push(
        `'${checkId}' é verificação do oráculo sem norma nomeada: o desvio é observação de revisão, não achado do oráculo (D-27/D-32). Isto não desmente o fato medido.${
          relatedRuleForCheckId(family, checkId) ? ` Há norma na base sobre o assunto, que o oráculo não decide por máquina: ${relatedRuleForCheckId(family, checkId)!.id}.` : ""
        }`
      );
    } else if (grounded !== null) {
      const declared = finding.rule.implements;
      const differs =
        declared !== undefined && (declared.length !== grounded.length || declared.some((ruleId) => !grounded.includes(ruleId)));
      check.notes.push(
        `Norma resolvida pelo servidor a partir da verificação '${checkId}': ${grounded.join(", ")}.${
          differs ? ` O implements enviado (${declared!.join(", ") || "vazio"}) foi ignorado.` : ""
        }${
          // 3.6.0: a forma antiga (id do check em rule.id) continua aceita, mas não é citação.
          checker.how === "legacy-id"
            ? ` O id do check não é citação: cite rule.id '${grounded[0]}' (source ${grounded[0].startsWith("emag-") ? "emag" : "govbr-ds-kb"}) com rule.checker '${checkId}'.`
            : ""
        }`
      );
      // Ids do próprio oráculo que não existem na base são defeito do oráculo (o teste de fundamentação
      // os confere); se acontecer, a alegação não se sustenta aqui.
      const missing = grounded.filter((ruleId) =>
        ruleId.startsWith("emag-") ? !findEmagRule(ruleId.replace(/^emag-/, "")) : !getRuleById(ruleId)
      );
      if (missing.length > 0) {
        check.ruleExists = "fail";
        check.verifiedBy = "rule-grounding-index";
        check.notes.push(`'${checkId}' implementa ${missing.join(", ")}, que não existe(m) no oráculo (defeito do oráculo).`);
      }
    }
  }

  return check;
}

/** Nota fixa das fontes que o perfil knowledge-free não confere (2.14.0, NAT-61). */
export const KNOWLEDGE_FREE_SOURCE_NOTE = "Fonte não conferida neste perfil.";

/** Uma referência WCAG cruzada também tem de existir — o mesmo laço dos dois perfis. */
function checkWcagCrossReference(finding: Finding, check: RuleCheck): void {
  if (finding.rule.source === "wcag" || !finding.rule.wcag) return;
  for (const reference of finding.rule.wcag.split(/[,;]/).map((value) => value.trim()).filter(Boolean)) {
    const membership = wcagMembership(reference);
    if (membership.status !== "member") {
      check.ruleExists = "fail";
      check.verifiedBy = "wcag-2.2-registry";
      check.notes.push(`Referência WCAG inválida: ${membership.detail}`);
    }
  }
}

/**
 * Conferência de regra do perfil knowledge-free (2.14.0, NAT-61, plano §3): WCAG no registro público
 * e axe-core como no perfil completo; DS e e-MAG viram `unknown` com nota neutra fixa — sem dizer se
 * a regra existe, o que impede `confirmed`. Nenhum carregador de conhecimento é chamado.
 */
function checkRuleKnowledgeFree(finding: Finding): RuleCheck {
  const { id, source } = finding.rule;
  let check: RuleCheck;
  switch (source) {
    case "wcag": {
      const cited = wcagMembership(id).status === "malformed" && finding.rule.wcag ? finding.rule.wcag : id;
      check = fromMembership(wcagMembership(cited), "wcag-2.2-registry");
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
    case "govbr-ds-kb":
    case "emag":
    case "govbr-ds-token":
    case "govbr-ds-structure":
    case "govbr-ds-page":
      check = { ruleExists: "unknown", applicability: "unknown", verifiedBy: "rule-source-not-checked", notes: [KNOWLEDGE_FREE_SOURCE_NOTE] };
      break;
    default:
      return {
        ruleExists: "fail",
        applicability: "unknown",
        verifiedBy: "rule-source-index",
        notes: [`Fonte de regra desconhecida: '${String(source)}'.`],
      };
  }
  checkWcagCrossReference(finding, check);
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

/** 3.3.0 (S-05): regra do axe que o portão pode rodar de novo — a do achado axe-core, ou evidence.data.axeRule. */
function axeRuleOf(finding: Finding): string | null {
  if (finding.rule.source === "axe-core") return finding.rule.id;
  const named = (finding.evidence.data as Record<string, unknown> | undefined)?.axeRule;
  return typeof named === "string" && /^[a-z0-9-]{2,60}$/.test(named) ? named : null;
}
