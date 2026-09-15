/**
 * D3/D4 — report generation. Machine-parseable JSON (CI/CD-friendly) plus a
 * human-review Markdown rendering of the same content. Findings are validated
 * against the D2 schema on submission. Reasoning traces are persisted per
 * finding (fan2023: auditability as Oracle Problem mitigation).
 *
 * Gate enforcement (C3, v02 slice 4). The `verification` a caller submits is never trusted: a
 * heuristic finding enters with the verification this server recorded for the identical payload.
 * `confirmed` enters the findings; `unverifiable` enters a separate, labeled review channel, never
 * promoted and never silently dropped; `rejected` and never-verified payloads are refused.
 * Deterministic findings enter only by `finding_ids`, as the server produced them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { FindingSchema, type Finding, type Verification } from "../schema/finding.js";

export interface ReportSummary {
  total: number;
  bySeverity: Record<string, number>;
  byNature: Record<string, number>;
  byPathway: Record<string, number>;
  bySource: Record<string, number>;
  /** Heuristic findings whose verification was inconclusive — outside `total`. */
  reviewItems?: number;
}

export interface Report {
  meta: {
    url: string;
    generatedAt: string;
    tool: string;
    disclaimer: string;
  };
  summary: ReportSummary;
  findings: Finding[];
  reviewItems: Finding[];
  notes?: string;
}

export interface SubmissionResult {
  accepted: Finding[];
  reviewItems: Finding[];
  rejected: { index: number; errors: string[] }[];
}

export interface ValidationOptions {
  /** Findings produced by this server's scanners and referenced by id. */
  serverFindings?: Finding[];
  /** Server-held verification for the exact payload. */
  verificationFor?: (finding: Finding) => Verification | undefined;
}

/**
 * Validate submitted findings. Invalid entries come back with actionable,
 * per-field errors (A5: responses as feedback signals the agent can act on),
 * never silently dropped.
 */
export function validateFindings(raw: unknown[], options: ValidationOptions = {}): SubmissionResult {
  const accepted: Finding[] = [...(options.serverFindings ?? [])];
  const reviewItems: Finding[] = [];
  const rejected: { index: number; errors: string[] }[] = [];

  raw.forEach((candidate, index) => {
    const parsed = FindingSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({
        index,
        errors: parsed.error.issues.map((i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`),
      });
      return;
    }
    const { verification: claimed, ...payload } = parsed.data;
    const finding = payload as Finding;

    if (finding.pathway === "deterministic") {
      rejected.push({
        index,
        errors: ["Achado determinístico enviado pelo cliente. Achados determinísticos entram por finding_ids, como o servidor os produziu."],
      });
      return;
    }

    const verification = options.verificationFor?.(parsed.data);
    if (finding.pathway === "explicit") {
      accepted.push(verification ? { ...finding, verification } : finding);
      return;
    }

    if (!verification) {
      rejected.push({
        index,
        errors: [
          claimed
            ? "O campo verification enviado não corresponde a nenhuma verificação guardada pelo servidor para este payload: o achado foi alterado depois de verify_finding ou nunca foi verificado. Submeta o achado final a verify_finding."
            : "Achado heurístico sem verificação do servidor. Submeta-o a verify_finding antes do relatório (via dupla: achados por iniciativa do agente precisam ser ancorados no oráculo).",
        ],
      });
      return;
    }
    if (verification.verdict === "rejected") {
      rejected.push({ index, errors: [`verify_finding rejeitou este achado: ${verification.detail ?? verification.verifiedBy}`] });
      return;
    }
    const withVerification = { ...finding, verification };
    if (verification.verdict === "confirmed") accepted.push(withVerification);
    else reviewItems.push(withVerification);
  });

  return { accepted, reviewItems, rejected };
}

export function summarize(findings: Finding[]): ReportSummary {
  const count = (key: (f: Finding) => string) =>
    findings.reduce<Record<string, number>>((acc, f) => {
      acc[key(f)] = (acc[key(f)] ?? 0) + 1;
      return acc;
    }, {});
  return {
    total: findings.length,
    bySeverity: count((f) => f.severity),
    byNature: count((f) => f.nature),
    byPathway: count((f) => f.pathway),
    bySource: count((f) => f.rule.source),
  };
}

export function buildReport(url: string, findings: Finding[], notes?: string, reviewItems: Finding[] = []): Report {
  return {
    meta: {
      url,
      generatedAt: new Date().toISOString(),
      tool: "govbr-ds-validator",
      disclaimer:
        "Primeira triagem para revisão humana; não substitui a avaliação de conformidade por especialista (salomon2025).",
    },
    summary: { ...summarize(findings), reviewItems: reviewItems.length },
    findings,
    reviewItems,
    notes,
  };
}

const severityOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function renderFinding(f: Finding): string[] {
  const lines = [
    `### ${f.id} — [${f.severity}] ${f.rule.id}`,
    "",
    `- **Regra:** ${f.rule.description}${f.rule.wcag ? ` (WCAG ${f.rule.wcag})` : ""} — fonte: ${f.rule.source}`,
    `- **Elemento:** \`${f.element.locator}\` em ${f.element.page}`,
    `- **Observado:** ${f.evidence.observed}`,
    `- **Esperado:** ${f.evidence.expected}`,
    `- **Classificação:** ${f.nature} / ${f.mode} · via ${f.pathway}`,
  ];
  if (f.verification) {
    lines.push(`- **Verificação:** ${f.verification.verdict} (${f.verification.verifiedBy})${f.verification.detail ? ` — ${f.verification.detail}` : ""}`);
    const c = f.verification.checks;
    if (c) {
      lines.push(`- **Conferências:** regra existe: ${c.ruleExists} · aplicável: ${c.applicability} · evidência: ${c.evidenceConsistent} · violação: ${c.violation}`);
    }
  }
  if (f.element.snippet) lines.push("", "```html", f.element.snippet, "```");
  if (f.trace) lines.push("", `<details><summary>Trilha de raciocínio</summary>`, "", f.trace, "", "</details>");
  lines.push("");
  return lines;
}

export function renderMarkdown(report: Report): string {
  const { meta, summary, findings } = report;
  const reviewItems = report.reviewItems ?? [];
  const lines: string[] = [
    `# Relatório de validação — ${meta.url}`,
    "",
    `Gerado em ${meta.generatedAt} por ${meta.tool}.`,
    "",
    `> ${meta.disclaimer}`,
    "",
    "## Resumo",
    "",
    `- Total de achados: **${summary.total}**`,
    `- Por severidade: ${Object.entries(summary.bySeverity).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}`,
    `- Por natureza: ${Object.entries(summary.byNature).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}`,
    `- Por via de detecção: ${Object.entries(summary.byPathway).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}`,
    `- Itens para revisão (verificação inconclusiva, fora do total): **${reviewItems.length}**`,
    "",
    "## Achados",
    "",
  ];

  for (const f of [...findings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])) {
    lines.push(...renderFinding(f));
  }

  if (reviewItems.length > 0) {
    lines.push(
      "## Itens para revisão — verificação inconclusiva",
      "",
      "> O portão não confirmou nem rejeitou estes achados heurísticos: a regra existe e a evidência não foi contradita, mas nenhum predicado do oráculo recalculou a violação. Não são achados confirmados e não entram no total.",
      ""
    );
    for (const f of [...reviewItems].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])) {
      lines.push(...renderFinding(f));
    }
  }

  if (report.notes) {
    lines.push("## Notas", "", report.notes, "");
  }

  return lines.join("\n");
}

export interface PersistedReport {
  jsonPath: string;
  markdownPath: string;
}

export function persistReport(report: Report, outDir: string): PersistedReport {
  mkdirSync(outDir, { recursive: true });
  const slug = report.meta.url.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const stamp = report.meta.generatedAt.replace(/[:.]/g, "-");
  const base = join(outDir, `${stamp}-${slug}`);
  const jsonPath = `${base}.json`;
  const markdownPath = `${base}.md`;
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(markdownPath, renderMarkdown(report));
  return { jsonPath, markdownPath };
}
