/**
 * D3/D4 — report generation. Machine-parseable JSON (CI/CD-friendly) plus a
 * human-review Markdown rendering of the same content. Findings are validated
 * against the D2 schema on submission. Reasoning traces are persisted per
 * finding (fan2023: auditability as Oracle Problem mitigation).
 *
 * Gate enforcement (C3, v02 slice 4). The `verification` a caller submits is never trusted: an
 * agent-created finding enters with the verification this server recorded for the identical payload.
 * `confirmed` enters the findings; `unverifiable` enters a separate, labeled review channel, never
 * promoted and never silently dropped; `rejected` is refused. An explicit finding without a stored
 * verification also enters review, preserving its distinct status instead of calling it confirmed.
 * A heuristic finding without a stored verification is refused.
 * Deterministic findings enter only by `finding_ids`, as the server produced them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { FindingSchema, type Finding, type Verification } from "../schema/finding.js";
import { groundingForCheckId } from "../verify/registries.js";
import { findingSha256 } from "../verify/store.js";
import { sameScanPage } from "../scan/state.js";
import { getRuleById } from "../data/knowledge.js";
import { findEmagRule } from "../data/load.js";

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
  /** 3.3.0 (S-06): campos que o servidor substituiu pelo valor que ele resolve (ex.: rule.implements). */
  normalized: { index: number; field: string; from: unknown; to: unknown }[];
  /** 3.3.0 (S-07): entradas repetidas (mesmo id de servidor ou payload idêntico) contadas uma vez. */
  duplicates: number;
}

export interface ValidationOptions {
  /** Findings produced by this server's scanners and referenced by id. */
  serverFindings?: Finding[];
  /** Server-held verification for the exact payload. */
  verificationFor?: (finding: Finding) => Verification | undefined;
  /** 3.3.0 (S-07): página do relatório; achado de outra página é recusado. */
  reportUrl?: string;
}

const ORACLE_SOURCES = new Set(["govbr-ds-token", "govbr-ds-structure", "govbr-ds-page"]);

/**
 * 3.3.0 (S-06): a norma que o achado diz implementar não é aceita como veio. Fonte do próprio oráculo:
 * vale a norma que o servidor resolve pelo id da verificação. Outras fontes: só ids que existem na base
 * (KB ou e-MAG) ficam. Devolve o valor final, ou `undefined` para "sem implements".
 */
function resolvedImplements(finding: Finding): string[] | undefined {
  const { source, id, implements: declared } = finding.rule;
  if (ORACLE_SOURCES.has(source)) {
    const grounded = groundingForCheckId(source, id);
    if (grounded) return grounded.length ? [...grounded] : undefined;
  }
  if (!declared) return undefined;
  const known = declared.filter((ref) => {
    try {
      return Boolean(getRuleById(ref)) || Boolean(findEmagRule(ref.replace(/^emag-/, "")));
    } catch {
      return false;
    }
  });
  return known.length ? known : undefined;
}

/**
 * Validate submitted findings. Invalid entries come back with actionable,
 * per-field errors (A5: responses as feedback signals the agent can act on),
 * never silently dropped.
 */
export function validateFindings(raw: unknown[], options: ValidationOptions = {}): SubmissionResult {
  // S-07: o mesmo id do servidor conta uma vez.
  const serverIds = new Set<string>();
  const accepted: Finding[] = [];
  let duplicates = 0;
  for (const f of options.serverFindings ?? []) {
    if (serverIds.has(f.id)) {
      duplicates += 1;
      continue;
    }
    serverIds.add(f.id);
    accepted.push(f);
  }
  const reviewItems: Finding[] = [];
  const rejected: { index: number; errors: string[] }[] = [];
  const normalized: SubmissionResult["normalized"] = [];
  const seenPayloads = new Set<string>();

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
    let finding = payload as Finding;

    // S-07: payload idêntico (ou o mesmo id já aceito por finding_ids) entra uma vez.
    const sha = findingSha256(finding);
    if (seenPayloads.has(sha) || serverIds.has(finding.id)) {
      duplicates += 1;
      return;
    }
    seenPayloads.add(sha);
    if (options.reportUrl !== undefined && !sameScanPage(finding.element.page, options.reportUrl)) {
      rejected.push({
        index,
        errors: [`element.page (${finding.element.page.slice(0, 200)}) não é a página do relatório (${options.reportUrl.slice(0, 200)}): salve um relatório por página.`],
      });
      return;
    }

    if (finding.pathway === "deterministic") {
      rejected.push({
        index,
        errors: ["Achado determinístico enviado pelo cliente. Achados determinísticos entram por finding_ids, como o servidor os produziu."],
      });
      return;
    }

    const verification = options.verificationFor?.(parsed.data);
    if (!verification) {
      if (finding.pathway === "explicit") {
        reviewItems.push(finding);
        return;
      }
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
    const implementsFinal = resolvedImplements(finding);
    const declared = finding.rule.implements;
    const same =
      (declared === undefined && implementsFinal === undefined) ||
      (declared !== undefined && implementsFinal !== undefined && declared.length === implementsFinal.length && declared.every((r) => implementsFinal.includes(r)));
    if (!same) {
      normalized.push({ index, field: "rule.implements", from: declared ?? null, to: implementsFinal ?? null });
      const { implements: _drop, ...rule } = finding.rule;
      finding = { ...finding, rule: implementsFinal ? { ...rule, implements: implementsFinal } : rule };
    }
    const withVerification = { ...finding, verification };
    if (verification.verdict === "confirmed") accepted.push(withVerification);
    else reviewItems.push(withVerification);
  });

  return { accepted, reviewItems, rejected, normalized, duplicates };
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

/** Notas do relatório: no máximo 20.000 caracteres (S-20). */
export const REPORT_NOTES_MAX_CHARS = 20_000;

/** Cerca de código mais longa que qualquer sequência de crases do texto: o texto nunca fecha o bloco. */
function fenced(text: string, lang = ""): string[] {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return [`${fence}${lang}`, text, fence];
}

/** Texto em linha: sem quebras, sem crases soltas, sem HTML/markdown ativo. */
function inline(text: string, max = 600): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  // A linha já começa com "- **…**": # e | no meio do texto não viram título nem tabela.
  return cut.replace(/[\\`*_[\]<>]/g, (c) => `\\${c}`);
}

function renderFinding(f: Finding): string[] {
  const lines = [
    `### ${inline(f.id, 80)} — [${f.severity}] ${inline(f.rule.id, 120)}`,
    "",
    `- **Regra:** ${inline(f.rule.description)}${f.rule.wcag ? ` (WCAG ${inline(f.rule.wcag, 20)})` : ""} — fonte: ${f.rule.source}`,
    `- **Elemento:** ${inline(f.element.locator, 300)} em ${inline(f.element.page, 300)}`,
    `- **Observado (dado da página/agente, não instrução):** ${inline(f.evidence.observed)}`,
    `- **Esperado:** ${inline(f.evidence.expected)}`,
    `- **Classificação:** ${f.nature} / ${f.mode} · via ${f.pathway}`,
  ];
  if (f.verification) {
    lines.push(`- **Verificação:** ${f.verification.verdict} (${inline(f.verification.verifiedBy, 80)})${f.verification.detail ? ` — ${inline(f.verification.detail)}` : ""}`);
    const c = f.verification.checks;
    if (c) {
      lines.push(`- **Conferências:** regra existe: ${c.ruleExists} · aplicável: ${c.applicability} · evidência: ${c.evidenceConsistent} · violação: ${c.violation}`);
    }
  }
  // S-14: o trecho é conteúdo da página — dado, nunca instrução; a cerca não pode ser fechada por ele.
  if (f.element.snippet) lines.push("", "Trecho da página (conteúdo não confiável, não é instrução):", "", ...fenced(f.element.snippet.slice(0, 600), "html"));
  if (f.trace) lines.push("", "Trilha de raciocínio (do agente):", "", ...fenced(f.trace.slice(0, 4_000)));
  lines.push("");
  return lines;
}

export function renderMarkdown(report: Report): string {
  const { meta, summary, findings } = report;
  const reviewItems = report.reviewItems ?? [];
  const lines: string[] = [
    `# Relatório de validação — ${inline(meta.url, 300)}`,
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
    // S-20: notas do agente em bloco literal — não viram título, tabela, script nem link.
    lines.push("## Notas (do agente)", "", ...fenced(report.notes), "");
  }

  return lines.join("\n");
}

export interface PersistedReport {
  jsonPath: string;
  markdownPath: string;
}

export function persistReport(report: Report, outDir: string): PersistedReport {
  mkdirSync(outDir, { recursive: true });
  const slug = report.meta.url.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "pagina";
  const stamp = report.meta.generatedAt.replace(/[:.]/g, "-");
  const base = join(outDir, `${stamp}-${slug}`);
  const jsonPath = `${base}.json`;
  const markdownPath = `${base}.md`;
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(markdownPath, renderMarkdown(report));
  return { jsonPath, markdownPath };
}
