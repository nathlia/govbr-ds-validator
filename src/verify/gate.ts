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
import { applyActions, fingerprintPage, type PageScanAction } from "../scan/pageScan.js";
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
import { findingSha256 } from "./store.js";

export interface GateInput {
  finding: Finding;
  /** Reabre element.page, reproduz actions e verifica cada elemento de element.locator. */
  live?: boolean;
  actions?: PageScanAction[];
  /** Estado alegado; se o estado reproduzido tiver outro fingerprint, a verificação é rejeitada. */
  stateFingerprint?: string;
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

export async function verifyFinding({ finding, live = false, actions = [], stateFingerprint }: GateInput): Promise<Verification> {
  const checks: Checks = { ruleExists: "unknown", applicability: "unknown", evidenceConsistent: "unknown", violation: "not-checked" };
  const notes: string[] = [];
  const binding = { findingSha256: findingSha256(finding), stateFingerprint: null as string | null, live, elements: null as number | null };

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
  try {
    await withPage(finding.element.page, async (page) => {
      await applyActions(page, actions);
      binding.stateFingerprint = await fingerprintPage(page);
      if (stateFingerprint && stateFingerprint !== binding.stateFingerprint) {
        checks.evidenceConsistent = "fail";
        verifiedBy = "state-fingerprint";
        notes.push(
          `O estado reproduzido (${binding.stateFingerprint}) não é o estado alegado (${stateFingerprint}). Envie as actions que produzem o estado alegado.`
        );
        return;
      }

      const properties = [...new Set<StyleProperty>([...(selection.predicate?.properties ?? []), ...(observedHex ? COLOR_PROPERTIES : [])])];
      const evidence = await inspectPageComputedStyles(page, finding.element.page, finding.element.locator, properties);
      binding.elements = evidence.count;
      if (evidence.count === 0) {
        checks.evidenceConsistent = "fail";
        notes.push(
          `Nenhum elemento para '${finding.element.locator}' no estado verificado (${actions.length} ação(ões) reproduzida(s)). Se o defeito só existe depois de uma interação, envie actions.`
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
      if (selection.predicate) {
        const outcome = selection.predicate.evaluate(evidence.elements, finding.element.page, facts);
        checks.violation = outcome.status;
        verifiedBy = `predicate:${selection.predicate.id}`;
        notes.push(outcome.detail);
      } else {
        notes.push(`O localizador resolveu ${evidence.count} elemento(s); localizar não confirma a alegação.`);
      }
    });
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
