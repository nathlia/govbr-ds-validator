/**
 * Loader for the DS knowledge base (data/knowledge/ — decision D-11): the
 * authoritative rule store behind get_ds_rules. Rules are read from the
 * versioned tree's rules.jsonl, validated against the KB's own JSON Schema
 * (draft 2020-12) at load time, and indexed for the tool's filters.
 *
 * Epistemic separation (D-10): `force: "example"` records are canonical
 * implementation EVIDENCE, not norms. `isNormative`/`isEvidence` partition
 * the store so evidence can never surface in a normative listing.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

// ajv-formats ships CJS typings that NodeNext resolves as a namespace.
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = join(__dirname, "../../data/knowledge");

export type RuleForce =
  | "required"
  | "prohibited"
  | "recommended"
  | "discouraged"
  | "permitted"
  | "informative"
  | "example"
  | "unclear";

/** Forces that constitute normative guidance (D-10 bucket 1). */
export const NORMATIVE_FORCES: readonly RuleForce[] = [
  "required",
  "prohibited",
  "recommended",
  "discouraged",
  "permitted",
  "informative",
  "unclear",
];

export interface KnowledgeRule {
  id: string;
  dsVersion: string;
  status: "stable" | "legacy" | "alpha" | "beta" | "unknown";
  category: string;
  subcategory?: string | null;
  component: string | null;
  title: string;
  originalText: string;
  originalTextMode?: string;
  normalizedRule: string;
  force: RuleForce;
  rationale: string | null;
  conditions: string[];
  exceptions: string[];
  expectedEvidence: string[];
  validationStrategy: string;
  automatable: boolean;
  automationConfidence?: "high" | "medium" | "low";
  severitySuggestion?: string;
  relatedTokens: string[];
  relatedComponents: string[];
  wcagReferences: string[];
  emagReferences: string[];
  standard?: string;
  standardVersion?: string;
  notes?: string;
  source: {
    url: string;
    retrievedAt: string;
    contentHash: string;
    [key: string]: unknown;
  };
}

export interface KnowledgeBase {
  meta: {
    dsVersion: string;
    extractionTimestamp: string;
    totalRules: number;
    normativeRules: number;
    evidenceRules: number;
    schemaErrors: string[];
  };
  rules: KnowledgeRule[];
  byId: Map<string, KnowledgeRule>;
}

function latestVersionDir(): string {
  const versions = readdirSync(join(KNOWLEDGE_DIR, "versions"));
  // Single version today; if more appear, take the lexicographically greatest
  // semver (sufficient while major/minor stay single-digit).
  return versions.sort().at(-1)!;
}

let kb: KnowledgeBase | undefined;

export function getKnowledgeBase(): KnowledgeBase {
  if (kb) return kb;

  const version = latestVersionDir();
  const manifest = JSON.parse(readFileSync(join(KNOWLEDGE_DIR, "manifest.json"), "utf8")) as {
    designSystemVersion: string;
    extractionTimestamp: string;
  };
  const schema = JSON.parse(readFileSync(join(KNOWLEDGE_DIR, "schemas/rule.schema.json"), "utf8"));

  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const lines = readFileSync(join(KNOWLEDGE_DIR, `versions/${version}/normalized/rules.jsonl`), "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  const rules: KnowledgeRule[] = [];
  const schemaErrors: string[] = [];
  for (const line of lines) {
    const parsed: unknown = JSON.parse(line);
    if (!validate(parsed)) {
      const rid = (parsed as { id?: string }).id ?? "(no id)";
      schemaErrors.push(`${rid}: ${ajv.errorsText(validate.errors)}`);
      continue; // an invalid rule never enters the oracle
    }
    rules.push(parsed as KnowledgeRule);
  }

  const byId = new Map(rules.map((r) => [r.id, r]));

  kb = {
    meta: {
      dsVersion: manifest.designSystemVersion,
      extractionTimestamp: manifest.extractionTimestamp,
      totalRules: rules.length,
      normativeRules: rules.filter((r) => r.force !== "example").length,
      evidenceRules: rules.filter((r) => r.force === "example").length,
      schemaErrors,
    },
    rules,
    byId,
  };
  return kb;
}

export interface RuleFilter {
  component?: string;
  category?: string;
  force?: RuleForce;
  validationStrategy?: string;
  automatable?: boolean;
  automationConfidence?: "high" | "medium" | "low";
  severitySuggestion?: string;
  standard?: string;
  query?: string;
}

/** Caixa, acentos e espaços normalizados — usada só pelo caminho `context` (termos e nomes). */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Filter the KB. Evidence records (`force:"example"`) are excluded unless
 * explicitly requested via `force:"example"` — they are returned by
 * `getEvidence`, keeping the normative/evidence channels separate (D-10).
 *
 * Semântica legada preservada byte a byte (2.9.0): `query` é substring com caixa ignorada sobre
 * título/regra/texto original/rationale/notes; `component` é o id exato. A busca ampliada (sem
 * acento, em condições/exceções/evidência esperada, com variantes nominais) existe só no caminho
 * `context` (`applicability.ts`), para não mudar o resultado de chamadas antigas.
 */
export function filterRules(filter: RuleFilter = {}): KnowledgeRule[] {
  const { rules } = getKnowledgeBase();
  const q = filter.query?.toLowerCase();

  return rules.filter((r) => {
    if (filter.force !== undefined ? r.force !== filter.force : r.force === "example") return false;
    if (filter.component !== undefined && r.component !== filter.component) return false;
    if (filter.category !== undefined && r.category !== filter.category) return false;
    if (filter.validationStrategy !== undefined && r.validationStrategy !== filter.validationStrategy) return false;
    if (filter.automatable !== undefined && r.automatable !== filter.automatable) return false;
    if (filter.automationConfidence !== undefined && r.automationConfidence !== filter.automationConfidence)
      return false;
    if (filter.severitySuggestion !== undefined && r.severitySuggestion !== filter.severitySuggestion) return false;
    if (filter.standard !== undefined && r.standard !== filter.standard) return false;
    if (q) {
      const haystack = [r.title, r.normalizedRule, r.originalText, r.rationale ?? "", r.notes ?? ""]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Canonical implementation evidence (force:"example") for a component. */
export function getEvidence(component?: string): KnowledgeRule[] {
  return getKnowledgeBase().rules.filter(
    (r) => r.force === "example" && (component === undefined || r.component === component)
  );
}

export function getRuleById(id: string): KnowledgeRule | undefined {
  return getKnowledgeBase().byId.get(id);
}

// ── Conflicts / defect awareness (D-10 bucket 3) ──────────────────────────

export interface PackageAccessibilityFinding {
  id: string;
  type: string;
  severity: string;
  component: string;
  file: string;
  element: string;
  evidence: string;
  sourceSha256: string;
  status: string;
  [key: string]: unknown;
}

export interface KnowledgeConflicts {
  conflicts: unknown;
  packageAudit: {
    accessibilityFindings: PackageAccessibilityFinding[];
    [key: string]: unknown;
  };
}

let conflicts: KnowledgeConflicts | undefined;

export function getKnowledgeConflicts(): KnowledgeConflicts {
  if (conflicts) return conflicts;
  const version = latestVersionDir();
  const reports = join(KNOWLEDGE_DIR, `versions/${version}/reports`);
  conflicts = {
    conflicts: JSON.parse(readFileSync(join(reports, "conflicts.json"), "utf8")),
    packageAudit: JSON.parse(readFileSync(join(reports, "official-package-audit.json"), "utf8")),
  };
  return conflicts;
}

/**
 * Defects observed in the official package's canonical examples for a
 * component (D-13's organic wing source). Served as warnings alongside
 * component specs so the agent knows the reference artifact is imperfect.
 */
export function getComponentDefects(component: string): PackageAccessibilityFinding[] {
  const audit = getKnowledgeConflicts().packageAudit;
  return (audit.accessibilityFindings ?? []).filter((f) => f.component === component);
}

// ── e-MAG validation templates ─────────────────────────────────────────────

export interface EmagValidationTemplate {
  ruleId: string;
  recommendation: string;
  strategy: string;
  automatable: boolean;
  checks: string[];
  manualReviewRequired: boolean;
}

let emagTemplates: Map<string, EmagValidationTemplate> | undefined;

/** KB validation template for an e-MAG recommendation id (e.g. "6.2"). */
export function getEmagValidationTemplate(recommendation: string): EmagValidationTemplate | undefined {
  if (!emagTemplates) {
    const version = latestVersionDir();
    const file = JSON.parse(
      readFileSync(join(KNOWLEDGE_DIR, `versions/${version}/normalized/accessibility/emag-validation-templates.json`), "utf8")
    ) as { templates: EmagValidationTemplate[] };
    emagTemplates = new Map(file.templates.map((t) => [t.recommendation, t]));
  }
  return emagTemplates.get(recommendation);
}

// ── Version guard (Phase 2.5) ──────────────────────────────────────────────

export interface VersionAlignment {
  kbVersion: string;
  installedVersion: string | null;
  aligned: boolean;
}

/**
 * Compare the KB's dsVersion with the installed @govbr-ds/core. A mismatch
 * means the oracle's rules describe a different DS release than the package
 * the deterministic checkers' data was generated from.
 */
export function checkVersionAlignment(installedVersion?: string): VersionAlignment {
  const kbVersion = getKnowledgeBase().meta.dsVersion;
  let installed = installedVersion ?? null;
  if (installed === null) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(__dirname, "../../node_modules/@govbr-ds/core/package.json"), "utf8")
      ) as { version: string };
      installed = pkg.version;
    } catch {
      installed = null;
    }
  }
  return { kbVersion, installedVersion: installed, aligned: installed !== null && installed === kbVersion };
}

/** Log a warning when the installed DS diverges from the KB (startup guard). */
export function warnOnVersionMismatch(
  installedVersion?: string,
  log: (msg: string) => void = (msg) => console.error(msg)
): VersionAlignment {
  const alignment = checkVersionAlignment(installedVersion);
  if (!alignment.aligned) {
    log(
      `[govbr-ds-validator] AVISO: @govbr-ds/core instalado (${alignment.installedVersion ?? "não encontrado"}) ` +
        `difere da versão do knowledge base (${alignment.kbVersion}). ` +
        `Re-crawl o KB ou alinhe a dependência antes de confiar nas regras.`
    );
  }
  return alignment;
}

/** Reset memoized state (tests only). */
export function resetKnowledgeCache(): void {
  kb = undefined;
  conflicts = undefined;
  emagTemplates = undefined;
}
