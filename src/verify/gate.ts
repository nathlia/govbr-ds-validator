/**
 * C3 — anti-hallucination verification gate (wang2025sgcr dual-pathway:
 * adoption 22%→42% when heuristic findings are grounded). Any finding the
 * agent raises on its own initiative (pathway "heuristic") must pass through
 * this gate before entering a report.
 *
 * Verification is layered:
 *   1. Rule grounding — does the cited rule actually exist in the oracle?
 *   2. Claim consistency — do machine-readable evidence values agree with
 *      the token registry (e.g. "this hex is not a DS token")?
 *   3. Live evidence (optional) — re-inspect the element on the page and
 *      confirm the observed value is really there.
 */
import type { Finding, Verification } from "../schema/finding.js";
import { findEmagRule, getComponentSpecs, getPageRules, getTokenRegistry } from "../data/load.js";
import { getRuleById } from "../data/knowledge.js";
import { normalizeColor } from "../checkers/color.js";
import { inspectComputedStyles } from "../evidence/inspect.js";

export interface GateInput {
  finding: Finding;
  /** Re-inspect element.locator on element.page to confirm observed values. */
  live?: boolean;
}

export async function verifyFinding({ finding, live = false }: GateInput): Promise<Verification> {
  // ── Layer 1: the cited rule must exist in the oracle ──────────────────────
  const ruleCheck = verifyRuleExists(finding);
  if (ruleCheck) return ruleCheck;

  // ── Layer 2: machine-readable claims must agree with the registry ─────────
  const claimCheck = verifyTokenClaims(finding);
  if (claimCheck) return claimCheck;

  // ── Layer 3 (optional): live re-inspection of the element ─────────────────
  if (live) {
    return verifyLive(finding);
  }

  return {
    verdict: "confirmed",
    verifiedBy: "rule-index",
    detail:
      "Regra citada existe no oráculo e as alegações verificáveis são consistentes. Evidência do elemento não foi re-inspecionada (live=false).",
  };
}

function verifyRuleExists(finding: Finding): Verification | null {
  const { id, source } = finding.rule;

  switch (source) {
    case "govbr-ds-kb": {
      const rule = getRuleById(id);
      if (!rule) {
        return {
          verdict: "rejected",
          verifiedBy: "kb-rule-index",
          detail: `Regra '${id}' não existe no knowledge base. Use get_ds_rules para obter ids válidos (formato govbr-<versão>-…).`,
        };
      }
      // D-10 precedence: evidence records are not norms — a finding cannot
      // cite a canonical example as the violated rule.
      if (rule.force === "example") {
        return {
          verdict: "rejected",
          verifiedBy: "kb-rule-index",
          detail: `'${id}' é evidência de implementação (force=example), não uma regra normativa. Cite uma regra required/prohibited/recommended do get_ds_rules.`,
        };
      }
      return null;
    }
    case "emag": {
      const ruleId = id.replace(/^emag-/, "");
      const rule = findEmagRule(ruleId);
      if (!rule) {
        return {
          verdict: "rejected",
          verifiedBy: "emag-rule-index",
          detail: `Regra e-MAG '${ruleId}' não existe. Ids válidos: 1.1–1.9, 2.1–2.7, 3.1–3.12, 4.1–4.4, 5.1–5.5, 6.1–6.8.`,
        };
      }
      return null;
    }
    case "govbr-ds-token": {
      // Rule ids are checker-defined; accept the known family
      if (!/^ds-token-/.test(id)) {
        return {
          verdict: "rejected",
          verifiedBy: "token-rule-family",
          detail: `Id de regra de token desconhecido: '${id}'. Família válida: ds-token-*.`,
        };
      }
      return null;
    }
    case "govbr-ds-structure": {
      const m = id.match(/^ds-structure-([\w]+)/);
      const component = m?.[1];
      if (!component || !getComponentSpecs().components[component]) {
        return {
          verdict: "rejected",
          verifiedBy: "component-spec-index",
          detail: `Componente desconhecido em '${id}'. Componentes válidos: ${Object.keys(getComponentSpecs().components).join(", ")}.`,
        };
      }
      return null;
    }
    case "govbr-ds-page": {
      const categories = Object.keys(getPageRules().categories);
      const known = categories.some((c) => id.includes(c));
      if (!known) {
        return {
          verdict: "unverifiable",
          verifiedBy: "page-rule-index",
          detail: `Não foi possível ancorar '${id}' a uma categoria de diretrizes de página (${categories.join(", ")}).`,
        };
      }
      return null;
    }
    case "wcag": {
      if (!/^\d\.\d{1,2}\.\d{1,2}$/.test(finding.rule.wcag ?? id.replace(/^wcag-/, ""))) {
        return {
          verdict: "unverifiable",
          verifiedBy: "wcag-pattern",
          detail: "Critério WCAG citado não segue o formato X.Y.Z.",
        };
      }
      return null;
    }
    case "axe-core":
      // axe findings are deterministic by construction; the gate is for agent findings
      return null;
    default:
      return {
        verdict: "rejected",
        verifiedBy: "rule-source-index",
        detail: `Fonte de regra desconhecida: '${String(source)}'. Fontes válidas: govbr-ds-kb, govbr-ds-token, govbr-ds-structure, govbr-ds-page, emag, wcag, axe-core.`,
      };
  }
}

function verifyTokenClaims(finding: Finding): Verification | null {
  const data = finding.evidence.data as Record<string, unknown> | undefined;
  if (!data) return null;
  const registry = getTokenRegistry();

  // Claim: observedHex is not a DS token value
  const observedHex = typeof data.observedHex === "string" ? normalizeColor(data.observedHex) : null;
  if (observedHex && finding.rule.source === "govbr-ds-token") {
    if (registry.hexLookup[observedHex]) {
      return {
        verdict: "rejected",
        verifiedBy: "token-registry",
        detail: `Alegação inconsistente: ${observedHex} É um valor de token do DS (${registry.hexLookup[observedHex].join(", ")}).`,
      };
    }
  }

  // Claim: a named token has a given value
  const claimedToken = typeof data.expectedToken === "string" ? data.expectedToken : null;
  if (claimedToken) {
    const actual = registry.all[claimedToken];
    if (actual === undefined) {
      return {
        verdict: "rejected",
        verifiedBy: "token-registry",
        detail: `Token citado '${claimedToken}' não existe no registro do DS.`,
      };
    }
  }

  return null;
}

async function verifyLive(finding: Finding): Promise<Verification> {
  const { locator, page } = finding.element;
  try {
    const evidence = await inspectComputedStyles(page, locator);
    if (evidence.count === 0) {
      return {
        verdict: "rejected",
        verifiedBy: "live-inspection",
        detail: `Nenhum elemento encontrado para o localizador '${locator}' em ${page}.`,
      };
    }

    const data = finding.evidence.data as Record<string, unknown> | undefined;
    const observedHex = typeof data?.observedHex === "string" ? normalizeColor(data.observedHex) : null;
    if (observedHex) {
      const el = evidence.elements[0];
      const pageColors = [el.computed.backgroundColor, el.computed.color, el.computed.borderColor]
        .map((c) => normalizeColor(c))
        .filter(Boolean);
      if (!pageColors.includes(observedHex)) {
        return {
          verdict: "rejected",
          verifiedBy: "live-inspection",
          detail: `Valor alegado ${observedHex} não encontrado nas cores computadas do elemento (${pageColors.join(", ")}).`,
        };
      }
    }

    return {
      verdict: "confirmed",
      verifiedBy: "live-inspection",
      detail: `Elemento localizado em ${page}; evidência consistente com o DOM real.`,
    };
  } catch (err) {
    return {
      verdict: "unverifiable",
      verifiedBy: "live-inspection",
      detail: `Falha ao re-inspecionar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
