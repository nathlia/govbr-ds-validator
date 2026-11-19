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
import { checkerOf, groundingForCheckId } from "../verify/registries.js";
import { findingSha256 } from "../verify/store.js";
import { sameScanPage } from "../scan/state.js";
import { getRuleById } from "../data/knowledge.js";
import { findEmagRule } from "../data/load.js";
import { renderMarkdown } from "./markdown.js";

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

/**
 * 3.3.0 (S-06): a norma que o achado diz implementar não é aceita como veio. Fonte do próprio oráculo:
 * vale a norma que o servidor resolve pelo id da verificação. Outras fontes: só ids que existem na base
 * (KB ou e-MAG) ficam. Devolve o valor final, ou `undefined` para "sem implements".
 */
function resolvedImplements(finding: Finding): string[] | undefined {
  const { implements: declared } = finding.rule;
  // 3.6.0: o check vem de rule.checker (a citação é rule.id); na forma antiga, do id do check.
  const checker = checkerOf(finding).ref;
  if (checker) {
    const grounded = groundingForCheckId(checker.family, checker.checker);
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
    // 3.6.0 (revisão independente): a forma antiga (id do check em rule.id, source da família do check) continua
    // verificável, mas não entra no relatório como citação — vira a norma que o check cita, com o check em
    // rule.checker. A troca é registrada em `normalized`; a verificação guardada é a do payload enviado.
    const legacy = checkerOf(finding).ref;
    if (legacy?.how === "legacy-id") {
      const grounded = groundingForCheckId(legacy.family, legacy.checker);
      if (grounded && grounded.length > 0) {
        const cited = grounded[0];
        const to = { id: cited, source: cited.startsWith("emag-") ? ("emag" as const) : ("govbr-ds-kb" as const), checker: legacy.checker };
        normalized.push({ index, field: "rule.id", from: { id: finding.rule.id, source: finding.rule.source }, to });
        finding = { ...finding, rule: { ...finding.rule, ...to } };
      }
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

/** Notas do relatório: no máximo 20.000 caracteres (S-20). */
export const REPORT_NOTES_MAX_CHARS = 20_000;

/** 3.8.0: a renderização Markdown mora em markdown.ts (só apresentação; o JSON não muda). */
export { renderMarkdown };

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
