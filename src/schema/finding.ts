/**
 * D2 — Finding schema.
 *
 * Every validation result in the framework — deterministic checker output,
 * axe-core findings, agent judgments, verified heuristic findings — is
 * expressed as a Finding. The schema carries the triple proven sufficient to
 * ground remediation guidance (huang2024access, li2025portal):
 *
 *   observed evidence + violated rule (id/source) + expected behavior
 *
 * plus severity, element locator, the two classification axes used for
 * result slicing in the evaluation (oyelayo2026: semantic × syntactic ×
 * layout; zhao2024gtarena: display × interaction), the detection pathway
 * (wang2025sgcr dual-pathway), and an optional reasoning trace (fan2023 —
 * auditability as Oracle Problem mitigation).
 */
import { z } from "zod";
import { EXPECTED_CONDITIONS } from "./structuredClaims.js";

/** Where the violated rule comes from. */
export const RuleSourceSchema = z.enum([
  "govbr-ds-kb", // knowledge-base rule (data/knowledge rules.jsonl) — cite the exact KB id
  "govbr-ds-token", // design token registry parsed from @govbr-ds/core
  "govbr-ds-structure", // canonical component structure from @govbr-ds/core examples
  "govbr-ds-page", // page-level structural guidelines from the official docs
  "emag", // e-MAG 3.1 — Brazilian government accessibility model
  "wcag", // WCAG 2.2 success criteria
  "axe-core", // axe-core rule (deterministic accessibility pass)
]);
export type RuleSource = z.infer<typeof RuleSourceSchema>;

export const SeveritySchema = z.enum(["critical", "serious", "moderate", "minor"]);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Violation nature (oyelayo2026). Determines which half of the hybrid
 * architecture is expected to detect it:
 *   syntactic — exact-value mismatch (token values, required classes/attrs);
 *               deterministic code territory (LLM F1 0.48 on layout).
 *   semantic  — contextual correctness (right token for the context, ARIA
 *               correct for the role); LLM territory (F1 0.83).
 *   layout    — spatial/visual arrangement.
 */
export const NatureSchema = z.enum(["syntactic", "semantic", "layout"]);
export type Nature = z.infer<typeof NatureSchema>;

/** Interaction mode (zhao2024gtarena): visible at rest vs. only under interaction. */
export const ModeSchema = z.enum(["display", "interaction"]);
export type Mode = z.infer<typeof ModeSchema>;

/**
 * Detection pathway (wang2025sgcr dual-pathway):
 *   deterministic — produced by the syntactic checker layer (B1/B2), no LLM.
 *   explicit      — agent judgment against a predefined rule fed to it; without a server-held
 *                   verification it remains a review item, outside confirmed findings.
 *   heuristic     — agent-initiated finding; MUST pass the verification gate
 *                   (verify_finding) before entering a report.
 */
export const PathwaySchema = z.enum(["deterministic", "explicit", "heuristic"]);
export type Pathway = z.infer<typeof PathwaySchema>;

/** C3 verification gate verdicts. */
export const VerdictSchema = z.enum(["confirmed", "rejected", "unverifiable"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const RuleRefSchema = z.object({
  id: z
    .string()
    .describe(
      "Rule identifier, e.g. 'govbr-3.7.0-…' (KB id — preferred when the rule came from get_ds_rules), 'emag-3.5', 'token-color', 'br-button-structure', 'color-contrast' (axe)"
    ),
  source: RuleSourceSchema,
  description: z.string().describe("What the rule requires, quoted or paraphrased from the source"),
  wcag: z.string().optional().describe("Related WCAG success criterion, e.g. '1.4.3'"),
  implements: z
    .array(z.string())
    .optional()
    .describe(
      "Normative rule ids (KB 'govbr-…' or 'emag-n.n') this check implements. Required for the " +
        "deterministic checkers: a check that cannot name a rule of the oracle does not produce a " +
        "Finding, it produces a review Observation (D-27)."
    ),
});
export type RuleRef = z.infer<typeof RuleRefSchema>;

export const ElementRefSchema = z.object({
  locator: z.string().describe("CSS selector or Playwright locator uniquely identifying the element"),
  snippet: z.string().optional().describe("outerHTML excerpt (truncated) of the offending element"),
  page: z.string().describe("URL of the page the element was found on"),
});
export type ElementRef = z.infer<typeof ElementRefSchema>;

export const EvidenceSchema = z.object({
  observed: z.string().describe("What was actually found (computed value, attribute, structure)"),
  expected: z.string().describe("What the rule requires instead"),
  data: z
    .record(z.unknown())
    .optional()
    .describe(
      "Machine-readable supporting values. Verifiable token claims require property, observed/observedHex and " +
        "the predicate's exact expectedCondition; verifiable structure-tag claims require component, observedTag " +
        "and expectedCondition. Exact expectedCondition by predicate: " +
        `ds-token-color=${EXPECTED_CONDITIONS.tokenColor}; ds-token-font-family=${EXPECTED_CONDITIONS.tokenFontFamily}; ` +
        `ds-token-radius=${EXPECTED_CONDITIONS.tokenRadius}; ds-token-spacing=${EXPECTED_CONDITIONS.tokenSpacing}; ` +
        `ds-structure-<component>-tag=${EXPECTED_CONDITIONS.structureTag}; ` +
        `ds-page-header|ds-page-footer (region + observedCount)=${EXPECTED_CONDITIONS.pageRegion}; ` +
        `ds-page-skip-link (region + firstLinkHref)=${EXPECTED_CONDITIONS.skipLink}. ` +
        "Free-text observed/expected remain human explanations, not semantic gate inputs."
    ),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** Outcome of one separate gate check (v02, slice 4). */
export const CheckStatusSchema = z.enum(["pass", "fail", "unknown", "not-applicable"]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

/**
 * Whether the violation itself was verified:
 *   verified      an implemented predicate recomputed it on every asserted element, in the state checked
 *   contradicted  the predicate ran and at least one asserted element does not violate
 *   no-predicate  no predicate exists for this rule/claim — the only honest answer is unverifiable
 *   not-checked   a predicate exists but live=false
 *   error         the page could not be reopened
 */
export const ViolationStatusSchema = z.enum(["verified", "contradicted", "no-predicate", "not-checked", "error"]);
export type ViolationStatus = z.infer<typeof ViolationStatusSchema>;

export const VerificationSchema = z.object({
  verdict: VerdictSchema,
  verifiedBy: z.string().describe("Which oracle check produced the verdict, e.g. 'token-registry', 'emag-rule-index'"),
  detail: z.string().optional(),
  checks: z
    .object({
      ruleExists: CheckStatusSchema.describe("The cited id is a member of a versioned registry (KB, e-MAG 3.1, WCAG 2.2, published checker ids)"),
      applicability: CheckStatusSchema.describe("The rule can support a finding (not implementation evidence, not a check without a norm)"),
      evidenceConsistent: CheckStatusSchema.describe("Machine-readable values and, when live, the element in the checked state agree with the claim"),
      violation: ViolationStatusSchema,
    })
    .optional(),
  predicate: z.string().nullable().optional().describe("Implemented predicate used to verify the violation, if any"),
  binding: z
    .object({
      findingSha256: z.string().describe("SHA-256 of the verified payload (everything except verification)"),
      stateFingerprint: z.string().nullable(),
      live: z.boolean(),
      elements: z.number().int().nullable(),
      state: z
        .unknown()
        .optional()
        .describe("2.10.0: what replaying the claimed state proved — policy, scanId, replay status/failure, arrival conditions, observed url/viewport, mismatches"),
    })
    .optional(),
  registries: z.record(z.string()).optional().describe("Registry versions the ids were checked against"),
});
export type Verification = z.infer<typeof VerificationSchema>;

export const FindingSchema = z.object({
  id: z.string().describe("Stable finding id, e.g. 'F-001'"),
  rule: RuleRefSchema,
  element: ElementRefSchema,
  evidence: EvidenceSchema,
  severity: SeveritySchema,
  nature: NatureSchema,
  mode: ModeSchema,
  pathway: PathwaySchema,
  verification: VerificationSchema.optional().describe("Present for heuristic findings that passed the gate"),
  trace: z
    .string()
    .optional()
    .describe("Reasoning trace: why this was judged a violation (auditable, persisted per finding)"),
});
export type Finding = z.infer<typeof FindingSchema>;

/** Raw ZodRawShape variants for MCP registerTool input/output schemas. */
export const FindingShape = FindingSchema.shape;

/**
 * Sinal de revisão (D-27) — o que um verificador observa mas não pode afirmar como violação,
 * porque não há regra normativa que o sustente.
 *
 * Deliberadamente NÃO é um Finding e não tem severidade: se entrasse no mesmo canal, entraria
 * também na precisão, e o oráculo estaria cobrando por uma norma que o design system não escreveu.
 * Serve a quem revisa a página, não à pontuação.
 */
export const ObservationSchema = z.object({
  kind: z.string().describe("Which check produced it, e.g. 'structure-unknown-classes'"),
  element: ElementRefSchema,
  note: z.string().describe("What was observed, in plain terms"),
  whyNotAFinding: z.string().describe("Why this is not asserted as a violation"),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type Observation = z.infer<typeof ObservationSchema>;

let counter = 0;

/** Sequential finding ids within a server process. */
export function nextFindingId(): string {
  counter += 1;
  return `F-${String(counter).padStart(3, "0")}`;
}

/** Reset the counter (tests only). */
export function resetFindingIds(): void {
  counter = 0;
}
