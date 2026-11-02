/**
 * 3.6.5 (D-155, item 3; rastreio dev-364 §2, A-05 p03): o exemplo canônico conferido pelas pendências do próprio
 * oráculo, e as obrigações globais que o oráculo cobra dos elementos da marcação do componente.
 *
 * No A-05 p03 o scan pedia o título da tabela (pendência `table-name`, cláusula obrigatória do CAPTION) e, na mesma
 * sessão, get_component_spec serviu o exemplo canônico de tabela SEM caption com `warnings: []`; o agente largou a
 * pendência citando o exemplo. Aqui:
 *   (a) cada exemplo do componente passa pelos MESMOS detectores que o scan_page aplica a uma página (pendências de
 *       elemento do notJudged, rótulo por placeholder, ícone decorativo exposto), numa página isolada, sem rede e sem
 *       a folha do DS — o que o exemplo não cumpre volta em `warnings` de quem o serve;
 *   (b) cada pendência/check de ELEMENTO do oráculo (o sujeito é o seletor que o scan lê) cujo sujeito aparece na
 *       marcação do componente vira uma obrigação listada na spec — a cláusula que o oráculo cobra desse elemento em
 *       qualquer página, tirada das mesmas tabelas de fundamentação dos checks. Nenhuma lista por componente.
 * Resultado em cache por processo (os exemplos são estáticos do pacote instalado).
 */
import { withHtmlPage } from "../evidence/browser.js";
import { inspectPageComputedStyles } from "../evidence/inspect.js";
import { inspectPageStructure } from "../evidence/pageFacts.js";
import { FORM_FIELD_SELECTOR, PLACEHOLDER_LABEL_CONDITION, PLACEHOLDER_LABEL_GROUNDING, PLACEHOLDER_SUBJECT_SELECTOR, checkPlaceholderLabels, labelSourceOf } from "../checkers/formLabels.js";
import { CONTROL_SELECTOR, checkDecorativeIcons } from "../checkers/decorativeIcons.js";
import { FOCUS_INDICATOR_CONDITION, FOCUS_INDICATOR_GROUNDING } from "../checkers/focusIndicator.js";
import { FOCUSABLE_SELECTOR } from "../evidence/focusIndicator.js";
import { ELEMENT_PENDING, elementPendingRule, notJudgedFor } from "../scan/notJudged.js";
import { unnamedTablesOf } from "../scan/pageScan.js";
import { getRuleById } from "../data/knowledge.js";
import type { Finding } from "../schema/finding.js";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const STRONG = new Set(["required", "prohibited"]);

export interface ExampleWarning {
  type: "oracle-pending" | "oracle-finding";
  /** Código da pendência (notJudged) ou o check que acusou. */
  code: string;
  element: string;
  count?: number;
  rule?: { id: string; force?: string; text?: string };
  norms?: string[];
  observed?: string;
}

/** Uma pendência/check de elemento do oráculo: o sujeito é o seletor que o scan lê; as cláusulas, as da fundamentação. */
interface ElementCheck {
  key: string;
  subject: string;
  oracle: string;
  clauses: () => Array<{ id: string; force: string; text: string }>;
}

function kbClauses(ids: readonly string[]): Array<{ id: string; force: string; text: string }> {
  return ids.flatMap((id) => {
    const r = getRuleById(id);
    return r && STRONG.has(r.force) ? [{ id, force: r.force, text: String(r.originalText ?? "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim() }] : [];
  });
}

/** O catálogo de checks de ELEMENTO que já existem (pendências do notJudged + checks de estrutura com sujeito por tag). */
export const ELEMENT_CHECKS: ElementCheck[] = [
  ...(Object.keys(ELEMENT_PENDING) as Array<keyof typeof ELEMENT_PENDING>).map((code) => ({
    key: code,
    subject: ELEMENT_PENDING[code].subject,
    oracle: `scan_page: pendência ${code}`,
    clauses: () => {
      const rule = elementPendingRule(code);
      if (!rule) return [];
      const full = getRuleById(rule.id);
      return [{ id: rule.id, force: rule.force, text: full ? String(full.originalText ?? "").replace(/\s+/g, " ").trim() : rule.text }];
    },
  })),
  {
    key: PLACEHOLDER_LABEL_CONDITION,
    subject: PLACEHOLDER_SUBJECT_SELECTOR,
    oracle: `scan_page structure + verify_finding (${PLACEHOLDER_LABEL_CONDITION})`,
    clauses: () => kbClauses(PLACEHOLDER_LABEL_GROUNDING.implements),
  },
  {
    key: FOCUS_INDICATOR_CONDITION,
    subject: FOCUSABLE_SELECTOR,
    oracle: `scan_page structure + verify_finding (${FOCUS_INDICATOR_CONDITION})`,
    clauses: () => kbClauses(FOCUS_INDICATOR_GROUNDING.implements),
  },
];

export interface ExampleAudit {
  /** Por nome de exemplo: o que ele não cumpre pelas pendências/checks do oráculo. */
  warnings: Record<string, ExampleWarning[]>;
  /** Por chave de ELEMENT_CHECKS: quantos elementos sujeitos há na marcação do componente e de que tags. */
  subjects: Record<string, { count: number; tags: string[] }>;
  error?: string;
}

const PAGE = (html: string) =>
  `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>exemplo</title></head><body><main>${html}</main></body></html>`;

function findingWarning(f: Finding): ExampleWarning {
  return {
    type: "oracle-finding",
    code: f.rule.checker ?? f.rule.id,
    element: clip(f.element.locator, 120),
    rule: { id: f.rule.id },
    ...(f.rule.implements?.length ? { norms: [...f.rule.implements].slice(0, 3) } : {}),
    observed: clip(f.evidence.observed, 160),
  };
}

const cache = new Map<string, Promise<ExampleAudit>>();

/** Confere todos os exemplos de um componente (uma vez por processo). Falha do navegador → `error`, nunca exceção. */
export function auditComponentExamples(component: string, examples: Array<{ name: string; html?: unknown }>): Promise<ExampleAudit> {
  const cached = cache.get(component);
  if (cached) return cached;
  const run = runAudit(component, examples).catch((error: unknown): ExampleAudit => {
    cache.delete(component);
    return { warnings: {}, subjects: {}, error: clip(error instanceof Error ? error.message : String(error), 200) };
  });
  cache.set(component, run);
  return run;
}

async function runAudit(component: string, examples: Array<{ name: string; html?: unknown }>): Promise<ExampleAudit> {
  return withHtmlPage(async (page, load) => {
    const warnings: Record<string, ExampleWarning[]> = {};
    const subjects: Record<string, { count: number; tags: Set<string> }> = {};
    for (const example of examples) {
      if (typeof example.html !== "string" || !example.html.trim()) continue;
      const url = `govbr-ds-example:${component}/${example.name}`;
      await load(PAGE(example.html));
      const facts = await inspectPageStructure(page, url);
      const tables = (await inspectPageComputedStyles(page, url, "table", [])).elements;
      const fields = (await inspectPageComputedStyles(page, url, FORM_FIELD_SELECTOR, [])).elements;
      const controls = (await inspectPageComputedStyles(page, url, CONTROL_SELECTOR, [])).elements;
      // As mesmas pendências de elemento do scan (escopo de região: sem título, idioma e regiões do documento); o axe
      // não rodou, então o campo sem nome nenhum também é pendência — como num scan sem axe.
      const pending = notJudgedFor({
        facts,
        pageWide: false,
        fields: fields.map((el) => ({ locator: el.locator, source: labelSourceOf(el) })),
        unnamedTables: unnamedTablesOf(tables, facts, false),
        placeholderChecked: true,
        axeRan: false,
      });
      const found = [...checkPlaceholderLabels({ url }, fields).findings, ...checkDecorativeIcons({ url }, controls).findings];
      const list: ExampleWarning[] = [
        ...pending.map((item) => ({
          type: "oracle-pending" as const,
          code: item.code,
          element: item.examples?.[0] ?? "html",
          ...(item.count !== undefined ? { count: item.count } : {}),
          ...(item.rule ? { rule: { id: item.rule.id, force: item.rule.force, text: item.rule.text } } : {}),
          ...(item.norms ? { norms: item.norms.filter((n) => n !== item.rule?.id).slice(0, 3) } : {}),
          observed: item.subject,
        })),
        ...found.map(findingWarning),
      ];
      if (list.length) warnings[example.name] = list;
      // (b) sujeitos dos checks de elemento presentes nesta marcação (exibidos ou não: a obrigação vale para a tag).
      const counts = await page.evaluate((selectors: string[]) =>
        selectors.map((selector) => {
          const els = Array.from(document.querySelectorAll(`main ${selector.split(",").join(", main ")}`));
          return { count: els.length, tags: [...new Set(els.map((el) => el.tagName.toLowerCase()))] };
        }), ELEMENT_CHECKS.map((c) => c.subject));
      ELEMENT_CHECKS.forEach((check, i) => {
        if (!counts[i].count) return;
        const entry = (subjects[check.key] ??= { count: 0, tags: new Set() });
        entry.count += counts[i].count;
        for (const tag of counts[i].tags) entry.tags.add(tag);
      });
    }
    return {
      warnings,
      subjects: Object.fromEntries(Object.entries(subjects).map(([k, v]) => [k, { count: v.count, tags: [...v.tags] }])),
    };
  });
}

export const EXAMPLE_WARNING_NOTE =
  "oracle-pending/oracle-finding: o exemplo conferido pelas mesmas pendências e checks que o scan_page aplica a uma página " +
  "(sem a folha do DS): ele NÃO cumpre isto — não o tome como modelo neste ponto; a obrigação continua valendo na página.";

/** (b) As obrigações globais que o oráculo cobra dos elementos presentes na marcação do componente. */
export function elementObligations(audit: ExampleAudit, textMax = 140) {
  const items: Array<{ subject: string; citeAs: string; force: string; text: string; oracle: string }> = [];
  const seen = new Set<string>();
  for (const check of ELEMENT_CHECKS) {
    const subject = audit.subjects[check.key];
    if (!subject?.count) continue;
    for (const clause of check.clauses()) {
      if (seen.has(clause.id)) continue;
      seen.add(clause.id);
      items.push({ subject: subject.tags.map((t) => `<${t}>`).join(" "), citeAs: clause.id, force: clause.force, text: clip(clause.text, textMax), oracle: check.oracle });
    }
  }
  if (!items.length) return undefined;
  return {
    note: "Obrigações globais que o oráculo cobra destes elementos em QUALQUER página (as mesmas pendências/checks do scan_page), presentes na marcação do componente. Valem além das cláusulas próprias dele; o exemplo canônico não as dispensa.",
    items,
  };
}

/**
 * 3.6.5 (revisão): a forma da lista de verificação — sujeito, id e força (o texto pelo id, em get_ds_rules), para não
 * tirar itens próprios do componente da 1ª página.
 */
export function elementObligationsCompact(audit: ExampleAudit) {
  const full = elementObligations(audit);
  if (!full) return undefined;
  return {
    note: "Obrigações globais que o oráculo cobra destes elementos em qualquer página, além das do componente (texto: get_ds_rules ids=citeAs).",
    items: full.items.map(({ subject, citeAs, force }) => ({ subject, citeAs, force })),
  };
}
