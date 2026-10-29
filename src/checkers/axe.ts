/**
 * B2 — axe-core embedded as the deterministic accessibility pass
 * (oyelayo2026: axe-core F1 0.66 aggregate; mowar2025codea11y: checkers and
 * AI in tandem). Findings are mapped into the D2 schema with e-MAG
 * cross-references so the same report format holds across pathways. Also
 * serves as the F2 baseline.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { Finding, Observation, Severity } from "../schema/finding.js";
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
  incomplete: { id: string; help?: string; nodes?: AxeNodeResult[] }[];
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

/**
 * 3.4.4 (C10a): regra só `best-practice` (nenhum critério WCAG nas tags) não reprova critério. A ponte
 * para o e-MAG fica (agrupa a mesma falha vista por duas regras), mas declarada como relação temática —
 * nunca como "viola e-MAG x.y".
 */
export function isBestPracticeOnly(tags: string[]): boolean {
  return tags.includes("best-practice") && wcagFromTags(tags) === undefined;
}

/**
 * 3.4.4 (C10b): `aria-valid-attr-value` reprovando SÓ `aria-controls` (IDREF para um id que não existe)
 * não é falha de nome, papel, estado ou valor: o estado (aria-expanded) continua exposto. O critério
 * 4.1.2 que a tag do axe traz fica como relação, não como critério reprovado, e a severidade cai para moderate.
 */
const RELATION_ONLY_ATTRS = new Set(["aria-controls"]);
export function relationOnlyAriaValue(ruleId: string, failureSummary: string | undefined): boolean {
  if (ruleId !== "aria-valid-attr-value" || !failureSummary) return false;
  const attrs = [...failureSummary.matchAll(/\b(aria-[a-z]+)\s*=/g)].map((m) => m[1]);
  return attrs.length > 0 && attrs.every((a) => RELATION_ONLY_ATTRS.has(a));
}

export interface AxeScanResult {
  findings: Finding[];
  /**
   * 3.4.4 (revisão, C10a): violações de regras só `best-practice` (sem critério WCAG). Com
   * `bestPractice: "separate"` (padrão) ficam aqui, fora de `findings` e fora da fusão por e-MAG; com
   * "inline" (perfil knowledge-free: a saída do axe como veio) ficam em `findings` e esta lista é vazia.
   */
  bestPracticeFindings: Finding[];
  engine: { name: string; version: string };
  passeCount: number;
  incompleteCount: number;
  /** 3.4.4 (C11): o que o axe não decidiu — regra, quantos elementos e um exemplo (até AXE_INCOMPLETE_DETAIL). */
  incompleteRules: Array<{ rule: string; nodes: number; example: string | null; help?: string }>;
}

export const AXE_INCOMPLETE_DETAIL = 5;

export async function runAxeScan(url: string, selector?: string): Promise<AxeScanResult> {
  return withPage(url, (page) => runAxeScanOnPage(page, url, selector));
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/**
 * 3.4.0 (B10, A F-031/F-032): duas regras do axe que reprovam o MESMO elemento pela MESMA recomendação
 * e-MAG (ex.: `label` e `label-title-only`, ambas 6.2) são a mesma falha vista duas vezes. Fica uma — a
 * de maior severidade, depois a primeira —, e as demais regras ficam em `evidence.data.alsoReportedBy`.
 */
export function mergeSameEmagOnElement(findings: Finding[]): Finding[] {
  const kept = new Map<string, Finding>();
  const order: Finding[] = [];
  for (const finding of findings) {
    const emagId = finding.evidence.data?.emagId;
    if (typeof emagId !== "string") { order.push(finding); continue; }
    const key = `${finding.element.locator}${emagId}`;
    const previous = kept.get(key);
    if (!previous) { kept.set(key, finding); order.push(finding); continue; }
    const [winner, loser] = (SEVERITY_RANK[finding.severity] ?? 9) < (SEVERITY_RANK[previous.severity] ?? 9) ? [finding, previous] : [previous, finding];
    const also = [...((winner.evidence.data?.alsoReportedBy as string[] | undefined) ?? []), loser.rule.id, ...((loser.evidence.data?.alsoReportedBy as string[] | undefined) ?? [])];
    winner.evidence.data = { ...winner.evidence.data, alsoReportedBy: [...new Set(also)] };
    if (winner !== previous) { order[order.indexOf(previous)] = winner; kept.set(key, winner); }
  }
  return order;
}

export interface AxeScanOptions {
  /**
   * 2.14.0 (NAT-61): anotar o achado com a recomendação e-MAG (sufixo em `rule.description` e
   * `evidence.data.emagId`). Padrão: sim. O perfil knowledge-free desliga: sai só a saída do axe.
   */
  emag?: boolean;
  /** 3.4.4: "inline" (padrão, comportamento da 3.4.3) mantém as regras só best-practice como achados, marcados com data.bestPractice=true; "separate" as separa (não usado pelos scans). */
  bestPractice?: "separate" | "inline";
}

/**
 * 3.4.4 (revisão, C10a): regra só best-practice do axe não reprova critério — sinal de revisão (observação),
 * com a regra, o elemento, o texto do axe e a ponte e-MAG temática quando houver. Nada da informação se perde.
 */
export function axeBestPracticeObservations(findings: Finding[]): Observation[] {
  return findings.map((f) => ({
    kind: "axe-best-practice",
    element: f.element,
    note: `${f.rule.id}: ${f.rule.description}`,
    whyNotAFinding:
      "Regra best-practice do axe-core: nenhuma tag de critério WCAG, então não reprova critério; a ponte com o e-MAG, quando há, é só temática. Sinal de revisão para julgar com a página na frente, não violação afirmada pelo oráculo.",
    data: {
      rule: { source: "axe-core", id: f.rule.id },
      observed: f.evidence.observed,
      severityFromAxe: f.severity,
      ...(f.evidence.data?.emagId ? { emagTopical: f.evidence.data.emagId } : {}),
      ...(f.evidence.data?.helpUrl ? { helpUrl: f.evidence.data.helpUrl } : {}),
    },
  }));
}

/** Run axe against an already-loaded page so aggregate scans do not navigate twice. */
export async function runAxeScanOnPage(
  page: Page,
  url: string,
  selector?: string,
  options: AxeScanOptions = {}
): Promise<AxeScanResult> {
  const withEmag = options.emag ?? true;
  const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

  await page.evaluate(axeSource);
  const results = await page.evaluate(async (sel: string | null) => {
    // @ts-expect-error axe is injected into the page context above
    return (await axe.run(sel ?? document, { resultTypes: ["violations", "passes", "incomplete"] })) as unknown;
  }, selector ?? null);

  const axeResults = results as AxeResults;
  const findings: Finding[] = [];

  for (const violation of axeResults.violations) {
    const emagId = withEmag ? AXE_TO_EMAG[violation.id] : undefined;
    const emagRule = emagId ? findEmagRule(emagId) : undefined;
    const tagWcag = wcagFromTags(violation.tags);
    const bestPractice = isBestPracticeOnly(violation.tags);

    for (const node of violation.nodes) {
      const relationOnly = relationOnlyAriaValue(violation.id, node.failureSummary);
      const wcag = relationOnly ? undefined : tagWcag;
      findings.push({
        id: nextFindingId(),
        rule: {
          id: violation.id,
          source: "axe-core",
          description: emagRule
            ? bestPractice
              ? `${violation.help} (best-practice do axe, sem critério WCAG; e-MAG ${emagId} só por tema: ${emagRule.title})`
              : `${violation.help} (e-MAG ${emagId}: ${emagRule.title})`
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
          data: {
            ...(withEmag
              ? { helpUrl: violation.helpUrl, axeTags: violation.tags, emagId: emagId ?? null }
              : { helpUrl: violation.helpUrl, axeTags: violation.tags }),
            ...(bestPractice ? { bestPractice: true, normative: "best-practice", ...(emagId ? { emagRelation: "topical" } : {}) } : {}),
            ...(relationOnly
              ? {
                  wcagRelation: { criterion: tagWcag ?? null, kind: "related", note: "só aria-controls com IDREF inexistente: o estado do controle continua exposto; não é falha de nome/papel/estado/valor." },
                }
              : {}),
          },
        },
        severity: ((impact: Severity) => (relationOnly && (impact === "critical" || impact === "serious") ? "moderate" : impact))(IMPACT_TO_SEVERITY[violation.impact ?? "moderate"] ?? "moderate"),
        nature: "syntactic",
        mode: INTERACTION_RULE.test(violation.id) ? "interaction" : "display",
        pathway: "deterministic",
      });
    }
  }

  const separate = (options.bestPractice ?? "inline") === "separate";
  const isBp = (f: Finding) => isBestPracticeOnly((f.evidence.data?.axeTags as string[] | undefined) ?? []);
  const scored = separate ? findings.filter((f) => !isBp(f)) : findings;
  return {
    findings: withEmag ? mergeSameEmagOnElement(scored) : scored,
    bestPracticeFindings: separate ? findings.filter(isBp) : [],
    engine: axeResults.testEngine,
    passeCount: axeResults.passes.length,
    incompleteCount: axeResults.incomplete.length,
    incompleteRules: axeResults.incomplete.slice(0, AXE_INCOMPLETE_DETAIL).map((r) => ({
      rule: r.id,
      nodes: r.nodes?.length ?? 0,
      example: r.nodes?.[0] ? axeLocator(r.nodes[0].target).slice(0, 160) : null,
      ...(r.help ? { help: r.help.slice(0, 120) } : {}),
    })),
  };
}

/** 3.3.0 (S-05): resultado de uma única regra do axe sobre os elementos de um localizador. */
export interface AxeRuleRecheck {
  version: string;
  known: boolean;
  matched: number;
  violating: number;
  passing: number;
  incomplete: number;
  inapplicable: number;
  /** Fora do alcance da regra e oculto: o estado pode ser outro — não decide. */
  hidden: number;
}

/**
 * Roda só `ruleId` no documento inteiro (regras como aria-hidden-focus e region precisam do contexto)
 * e classifica cada elemento de `locator`: reprovado, aprovado, incompleto ou fora do alcance da regra.
 * Um seletor inválido sobe como erro do navegador (o portão o traduz para invalid-locator).
 */
export async function runAxeRuleOnLocator(page: Page, locator: string, ruleId: string): Promise<AxeRuleRecheck> {
  const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  await page.evaluate(axeSource);
  return (await page.evaluate(
    async ({ locator, ruleId, step }: { locator: string; ruleId: string; step: string }) => {
      // @ts-expect-error axe is injected into the page context above
      const engine = axe;
      const version = String(engine.version);
      const known = (engine.getRules() as Array<{ ruleId: string }>).some((r) => r.ruleId === ruleId);
      // Localizador do axe com saltos de shadow root (`a >>> b`): cada salto desce no shadowRoot aberto.
      const hops = locator.split(` ${step} `);
      let roots: Array<Document | ShadowRoot> = [document];
      let targets: Element[] = [];
      hops.forEach((hop, index) => {
        targets = roots.flatMap((root) => Array.from(root.querySelectorAll(hop)));
        if (index < hops.length - 1) roots = targets.map((el) => el.shadowRoot).filter((r): r is ShadowRoot => Boolean(r));
      });
      const empty = { version, known, matched: targets.length, violating: 0, passing: 0, incomplete: 0, inapplicable: 0, hidden: 0 };
      if (!known || targets.length === 0) return empty;
      const result = await engine.run(document, {
        runOnly: { type: "rule", values: [ruleId] },
        resultTypes: ["violations", "passes", "incomplete"],
        elementRef: true,
      });
      const bucket = (list: Array<{ nodes: Array<{ element?: Element }> }>) =>
        new Set(list.flatMap((r) => r.nodes.map((n) => n.element).filter((e): e is Element => Boolean(e))));
      const violations = bucket(result.violations);
      const passes = bucket(result.passes);
      const incomplete = bucket(result.incomplete);
      for (const el of targets) {
        if (violations.has(el)) empty.violating += 1;
        else if (incomplete.has(el)) empty.incomplete += 1;
        else if (passes.has(el)) empty.passing += 1;
        else {
          // Fora do alcance da regra: num elemento visível é contraprova; oculto, pode ser estado (S-04).
          const style = getComputedStyle(el);
          const visible = el.getClientRects().length > 0 && style.visibility !== "hidden" && style.display !== "none";
          if (visible) empty.inapplicable += 1;
          else empty.hidden += 1;
        }
      }
      return empty;
    },
    { locator, ruleId, step: SHADOW_STEP },
  )) as AxeRuleRecheck;
}
