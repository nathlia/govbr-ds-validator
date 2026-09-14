/**
 * B2 — axe-core embedded as the deterministic accessibility pass
 * (oyelayo2026: axe-core F1 0.66 aggregate; mowar2025codea11y: checkers and
 * AI in tandem). Findings are mapped into the D2 schema with e-MAG
 * cross-references so the same report format holds across pathways. Also
 * serves as the F2 baseline.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { Finding, Severity } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import { findEmagRule } from "../data/load.js";
import { withPage } from "../evidence/browser.js";
import { SHADOW_STEP } from "../evidence/inspect.js";
import type { Page } from "playwright";

const require = createRequire(import.meta.url);

/**
 * axe rule id → e-MAG recommendation id. Only pairs whose WCAG grounding
 * matches the e-MAG 3.1 mapping table are included — no speculative links.
 */
const AXE_TO_EMAG: Record<string, string> = {
  "color-contrast": "4.1",
  "color-contrast-enhanced": "4.1",
  label: "6.2",
  "label-title-only": "6.2",
  "select-name": "6.2",
  "form-field-multiple-labels": "6.2",
  "image-alt": "3.6",
  "input-image-alt": "6.1",
  "role-img-alt": "3.6",
  "html-has-lang": "3.1",
  "html-lang-valid": "3.1",
  "valid-lang": "3.2",
  "document-title": "3.3",
  "link-name": "3.5",
  "button-name": "2.2",
  "aria-allowed-attr": "2.2",
  "aria-required-attr": "2.2",
  "aria-valid-attr": "2.2",
  "aria-valid-attr-value": "2.2",
  "aria-roles": "2.2",
  "aria-hidden-focus": "2.2",
  "heading-order": "1.3",
  "empty-heading": "1.3",
  "page-has-heading-one": "1.3",
  region: "1.8",
  "landmark-one-main": "1.8",
  bypass: "1.5",
  "skip-link": "1.5",
  tabindex: "1.4",
  "th-has-data-cells": "3.10",
  "td-headers-attr": "3.10",
  "table-fake-caption": "3.9",
  "meta-refresh": "2.3",
  blink: "2.6",
  marquee: "2.6",
  "video-caption": "5.1",
  "audio-caption": "5.2",
  // 5.4 (controle de áudio para som em segundo plano), não 5.3 (audiodescrição): o mapeamento
  // herdou a identidade trocada que `data/emag.json` servia até 2026-09-14.
  "no-autoplay-audio": "5.4",
  "link-in-text-block": "4.2",
  "focus-order-semantics": "1.4",
};

const IMPACT_TO_SEVERITY: Record<string, Severity> = {
  critical: "critical",
  serious: "serious",
  moderate: "moderate",
  minor: "minor",
};

/** Rules whose violation only manifests under keyboard/AT interaction. */
const INTERACTION_RULE = /focus|keyboard|tabindex|bypass|skip|aria-hidden-focus/;

interface AxeNodeResult {
  /**
   * Axe returns a selector per frame/shadow hop, and a hop is itself an array when it crosses a
   * shadow boundary: `[["br-input", "input"]]` means "the <input> inside br-input's shadow root".
   */
  target: (string | string[])[];
  html: string;
  failureSummary?: string;
}

/**
 * Flatten axe's target into the locator format the evidence layer resolves.
 *
 * Joining the array with a space or a comma is the bug this replaces: `["br-input","input"]`
 * became `br-input input` (a descendant selector that matches nothing, since the input is not a
 * light-DOM descendant) or `br-input,input` (a selector list that matches the wrong elements).
 * Both fail silently, which is worse than not reporting the element at all.
 */
export function axeLocator(target: (string | string[])[]): string {
  return target
    .map((hop) => (Array.isArray(hop) ? hop.join(` ${SHADOW_STEP} `) : hop))
    .join(` ${SHADOW_STEP} `);
}

interface AxeViolation {
  id: string;
  impact?: string;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeNodeResult[];
}

interface AxeResults {
  violations: AxeViolation[];
  passes: { id: string }[];
  incomplete: { id: string }[];
  testEngine: { name: string; version: string };
}

function wcagFromTags(tags: string[]): string | undefined {
  // axe tags like "wcag143" → "1.4.3"; "wcag2a" and friends are levels, not criteria
  const t = tags.find((x) => /^wcag\d{3,4}$/.test(x));
  if (!t) return undefined;
  const digits = t.replace("wcag", "");
  return digits.length === 3
    ? `${digits[0]}.${digits[1]}.${digits[2]}`
    : `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
}

export interface AxeScanResult {
  findings: Finding[];
  engine: { name: string; version: string };
  passeCount: number;
  incompleteCount: number;
}

export async function runAxeScan(url: string, selector?: string): Promise<AxeScanResult> {
  return withPage(url, (page) => runAxeScanOnPage(page, url, selector));
}

/** Run axe against an already-loaded page so aggregate scans do not navigate twice. */
export async function runAxeScanOnPage(page: Page, url: string, selector?: string): Promise<AxeScanResult> {
  const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

  await page.evaluate(axeSource);
  const results = await page.evaluate(async (sel: string | null) => {
    // @ts-expect-error axe is injected into the page context above
    return (await axe.run(sel ?? document, { resultTypes: ["violations", "passes", "incomplete"] })) as unknown;
  }, selector ?? null);

  const axeResults = results as AxeResults;
  const findings: Finding[] = [];

  for (const violation of axeResults.violations) {
    const emagId = AXE_TO_EMAG[violation.id];
    const emagRule = emagId ? findEmagRule(emagId) : undefined;
    const wcag = wcagFromTags(violation.tags);

    for (const node of violation.nodes) {
      findings.push({
        id: nextFindingId(),
        rule: {
          id: violation.id,
          source: "axe-core",
          description: emagRule
            ? `${violation.help} (e-MAG ${emagId}: ${emagRule.title})`
            : violation.help,
          wcag,
        },
        element: {
          locator: axeLocator(node.target),
          snippet: node.html.slice(0, 300),
          page: url,
        },
        evidence: {
          observed: node.failureSummary ?? violation.description,
          expected: violation.help,
          data: { helpUrl: violation.helpUrl, axeTags: violation.tags, emagId: emagId ?? null },
        },
        severity: IMPACT_TO_SEVERITY[violation.impact ?? "moderate"] ?? "moderate",
        nature: "syntactic",
        mode: INTERACTION_RULE.test(violation.id) ? "interaction" : "display",
        pathway: "deterministic",
      });
    }
  }

  return {
    findings,
    engine: axeResults.testEngine,
    passeCount: axeResults.passes.length,
    incompleteCount: axeResults.incomplete.length,
  };
}
