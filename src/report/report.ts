/**
 * D3/D4 — report generation. Machine-parseable JSON (CI/CD-friendly) plus a
 * human-review Markdown rendering of the same content. Findings are validated
 * against the D2 schema on submission; heuristic findings without a
 * verification verdict are refused (C3 gate enforcement). Reasoning traces
 * are persisted per finding (fan2023: auditability as Oracle Problem
 * mitigation).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { FindingSchema, type Finding } from "../schema/finding.js";

export interface ReportSummary {
  total: number;
  bySeverity: Record<string, number>;
  byNature: Record<string, number>;
  byPathway: Record<string, number>;
  bySource: Record<string, number>;
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
  notes?: string;
}

export interface SubmissionResult {
  accepted: Finding[];
  rejected: { index: number; errors: string[] }[];
}

/**
 * Validate submitted findings. Invalid entries come back with actionable,
 * per-field errors (A5: responses as feedback signals the agent can act on),
 * never silently dropped.
 */
export function validateFindings(raw: unknown[]): SubmissionResult {
  const accepted: Finding[] = [];
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
    const finding = parsed.data;
    if (finding.pathway === "heuristic" && finding.verification?.verdict !== "confirmed") {
      rejected.push({
        index,
        errors: [
          "Achado heurístico sem verificação confirmada. Submeta-o primeiro a verify_finding e inclua o campo 'verification' com verdict='confirmed' (via dupla: achados por iniciativa do agente precisam ser ancorados no oráculo).",
        ],
      });
      return;
    }
    accepted.push(finding);
  });

  return { accepted, rejected };
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

export function buildReport(url: string, findings: Finding[], notes?: string): Report {
  return {
    meta: {
      url,
      generatedAt: new Date().toISOString(),
      tool: "govbr-ds-validator",
      disclaimer:
        "Primeira triagem para revisão humana; não substitui a avaliação de conformidade por especialista (salomon2025).",
    },
    summary: summarize(findings),
    findings,
    notes,
  };
}

export function renderMarkdown(report: Report): string {
  const { meta, summary, findings } = report;
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
    "",
    "## Achados",
    "",
  ];

  const severityOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const sorted = [...findings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  for (const f of sorted) {
    lines.push(
      `### ${f.id} — [${f.severity}] ${f.rule.id}`,
      "",
      `- **Regra:** ${f.rule.description}${f.rule.wcag ? ` (WCAG ${f.rule.wcag})` : ""} — fonte: ${f.rule.source}`,
      `- **Elemento:** \`${f.element.locator}\` em ${f.element.page}`,
      `- **Observado:** ${f.evidence.observed}`,
      `- **Esperado:** ${f.evidence.expected}`,
      `- **Classificação:** ${f.nature} / ${f.mode} · via ${f.pathway}`
    );
    if (f.verification) {
      lines.push(`- **Verificação:** ${f.verification.verdict} (${f.verification.verifiedBy})${f.verification.detail ? ` — ${f.verification.detail}` : ""}`);
    }
    if (f.element.snippet) {
      lines.push("", "```html", f.element.snippet, "```");
    }
    if (f.trace) {
      lines.push("", `<details><summary>Trilha de raciocínio</summary>`, "", f.trace, "", "</details>");
    }
    lines.push("");
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
