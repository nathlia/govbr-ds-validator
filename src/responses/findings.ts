import { z } from "zod";
import type { Finding } from "../schema/finding.js";

export const FindingDetailSchema = z.enum(["summary", "evidence", "full"]);
export type FindingDetail = z.infer<typeof FindingDetailSchema>;

export const FindingPageInputShape = {
  detail: FindingDetailSchema.optional().describe(
    "Nível da resposta: summary (padrão, triagem), evidence (regra + observado/esperado) ou full (Finding completo)"
  ),
  cursor: z.number().int().min(0).optional().describe("Cursor numérico devolvido em nextCursor"),
  limit: z.number().int().min(1).max(200).optional().describe("Máximo de findings na página (padrão 40)"),
  maxChars: z
    .number()
    .int()
    .min(1_000)
    .max(100_000)
    .optional()
    .describe("Orçamento aproximado da resposta em caracteres (padrão 12000)"),
};

export interface FindingPageOptions {
  detail?: FindingDetail;
  cursor?: number;
  limit?: number;
  maxChars?: number;
}

export const FINDING_DEDUPLICATION_KEY =
  "rule.source + rule.id + element.page + element.locator + evidence.data.property/evidence.observed";

export function findingIdentity(finding: Finding): string {
  const property = finding.evidence.data?.property;
  return [
    finding.rule.source,
    finding.rule.id,
    finding.element.page,
    finding.element.locator,
    typeof property === "string" ? property : finding.evidence.observed,
  ].join("\u001f");
}

export function deduplicateFindings(input: Finding[]): {
  findings: Finding[];
  inputCount: number;
  outputCount: number;
  merged: number;
  key: string;
} {
  const unique = new Map<string, Finding>();
  for (const finding of input) {
    const key = findingIdentity(finding);
    if (!unique.has(key)) unique.set(key, finding);
  }
  const findings = [...unique.values()];
  return {
    findings,
    inputCount: input.length,
    outputCount: findings.length,
    merged: input.length - findings.length,
    key: FINDING_DEDUPLICATION_KEY,
  };
}

export function diffFindings(previous: Finding[], current: Finding[]) {
  const previousByKey = new Map(previous.map((finding) => [findingIdentity(finding), finding]));
  const currentByKey = new Map(current.map((finding) => [findingIdentity(finding), finding]));
  return {
    added: [...currentByKey.entries()]
      .filter(([key]) => !previousByKey.has(key))
      .map(([, finding]) => finding.id),
    removed: [...previousByKey.entries()]
      .filter(([key]) => !currentByKey.has(key))
      .map(([, finding]) => finding.id),
    unchanged: [...currentByKey.keys()].filter((key) => previousByKey.has(key)).length,
  };
}

export class FindingStore {
  private readonly findings = new Map<string, Finding>();
  private readonly batches = new Map<string, { findings: Finding[]; metadata?: Record<string, unknown> }>();
  private batchCounter = 0;

  put(items: Finding[]): void {
    for (const finding of items) this.findings.set(finding.id, finding);
  }

  putBatch(kind: string, items: Finding[], metadata?: Record<string, unknown>): string {
    this.put(items);
    this.batchCounter += 1;
    const scanId = `S-${kind}-${String(this.batchCounter).padStart(3, "0")}`;
    this.batches.set(scanId, { findings: [...items], metadata });
    return scanId;
  }

  get(ids: string[]): { found: Finding[]; missing: string[] } {
    const found: Finding[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const finding = this.findings.get(id);
      if (finding) found.push(finding);
      else missing.push(id);
    }
    return { found, missing };
  }

  getBatch(scanId: string): Finding[] | undefined {
    const batch = this.batches.get(scanId);
    return batch ? [...batch.findings] : undefined;
  }

  getBatchMetadata(scanId: string): Record<string, unknown> | undefined {
    const metadata = this.batches.get(scanId)?.metadata;
    return metadata ? { ...metadata } : undefined;
  }
}

function truncate(value: string, max = 240): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function projectFinding(finding: Finding, detail: FindingDetail): unknown {
  if (detail === "full") return finding;

  const common = {
    id: finding.id,
    rule: {
      id: finding.rule.id,
      source: finding.rule.source,
      ...(detail === "evidence"
        ? { description: finding.rule.description, wcag: finding.rule.wcag }
        : {}),
    },
    element: {
      locator: finding.element.locator,
      page: finding.element.page,
    },
    severity: finding.severity,
    confidence: finding.pathway === "deterministic" ? 1 : undefined,
    nature: finding.nature,
    mode: finding.mode,
    pathway: finding.pathway,
  };

  if (detail === "summary") {
    return { ...common, observed: truncate(finding.evidence.observed) };
  }
  return {
    ...common,
    evidence: {
      observed: finding.evidence.observed,
      expected: finding.evidence.expected,
    },
    verification: finding.verification,
  };
}

/**
 * Creates a bounded page. The budget is conservative and applies to projected findings; response
 * metadata adds a small fixed overhead. At least one finding is returned so callers can always
 * make progress, with budgetExceeded=true when that single item exceeds the requested budget.
 */
export function buildFindingPage(findings: Finding[], options: FindingPageOptions = {}) {
  const detail = options.detail ?? "summary";
  const cursor = Math.min(options.cursor ?? 0, findings.length);
  const limit = options.limit ?? 40;
  const maxChars = options.maxChars ?? 12_000;
  const projected: unknown[] = [];
  let usedChars = 0;
  let index = cursor;
  let budgetExceeded = false;

  while (index < findings.length && projected.length < limit) {
    const item = projectFinding(findings[index], detail);
    const itemChars = JSON.stringify(item).length + (projected.length ? 1 : 0);
    if (projected.length > 0 && usedChars + itemChars > maxChars) break;
    if (projected.length === 0 && itemChars > maxChars) budgetExceeded = true;
    projected.push(item);
    usedChars += itemChars;
    index += 1;
  }

  const truncated = index < findings.length;
  return {
    detail,
    total: findings.length,
    cursor,
    count: projected.length,
    findings: projected,
    truncated,
    ...(truncated ? { nextCursor: index } : {}),
    responseCharsEstimate: usedChars,
    ...(budgetExceeded ? { budgetExceeded: true } : {}),
    ...(detail !== "full"
      ? { detailHint: "Use get_finding_details com ids para candidatos específicos ou scanId+nextCursor para continuar a página; peça full somente quando indispensável." }
      : {}),
  };
}
