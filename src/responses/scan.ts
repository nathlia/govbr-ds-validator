/**
 * 3.0.0 (NAT-99): blocos do contrato no scan_page (§10) — `checksRun` (sempre), `investigate`
 * (perfis com normas, 1ª página, ordem do DOM, §15.8), observações limitadas com continuação (S-03)
 * e a montagem da resposta inteira dentro do orçamento (padrão 8.000 caracteres).
 */
import type { Observation } from "../schema/finding.js";
import { CONTRACT, MESSAGES, budgetPage, step, textSize } from "./contract.js";

export const SCAN_DEFAULT_MAX_CHARS = 8_000;
export const OBSERVATION_PAGE_MAX_CHARS = 8_000;

const CHECK_OMISSION_WHY = {
  tokens: "cores, fonte, raio e espaçamento fora do registro de tokens do DS não foram medidos neste estado.",
  structure: "a tag raiz e o nome acessível dos componentes br-* não foram conferidos neste estado.",
  axe: "as regras do axe-core (WCAG) não rodaram neste estado.",
  page: "as regiões obrigatórias do Template Base (cabeçalho, rodapé) e o salto para o conteúdo não foram conferidos neste estado.",
} as const;
const TOKEN_CHECK_OMISSION_WHY = {
  color: "cores fora da paleta do DS não foram medidas neste estado.",
  font: "família tipográfica fora da Rawline não foi medida neste estado.",
  radius: "raio de borda fora dos tokens não foi medido neste estado.",
  spacing: "espaçamento fora dos tokens não foi medido neste estado.",
} as const;

type Check = keyof typeof CHECK_OMISSION_WHY;
type TokenCheck = keyof typeof TOKEN_CHECK_OMISSION_WHY;
const ALL_CHECKS = Object.keys(CHECK_OMISSION_WHY) as Check[];
const ALL_TOKEN_CHECKS = Object.keys(TOKEN_CHECK_OMISSION_WHY) as TokenCheck[];

export interface ScanRecipe {
  url: string;
  selectors?: string[];
  checks?: Check[];
  tokenChecks?: TokenCheck[];
  components?: string[];
  actions?: unknown[];
  arrival?: unknown;
}

function limits(actionsApplied: number, viewport: { width: number; height: number } | undefined, knowledgeFree: boolean) {
  const where = viewport ? ` nesta janela (${viewport.width}×${viewport.height})` : " nesta janela";
  const state = actionsApplied ? `o estado depois de ${actionsApplied} ação(ões) reproduzida(s)` : "o estado inicial, sem interação";
  return [
    {
      code: "no-state-semantics",
      text: "Nenhum check deste scan mede estado atual/selecionado, ordem de foco ou posição visual; zero achados não diz nada sobre eles.",
    },
    {
      code: "single-state",
      text: `Mediu só ${state}${where}; outros estados, conteúdo que só aparece após interação ou tempo e outras larguras não foram vistos.`,
    },
    ...(knowledgeFree
      ? []
      : [
          {
            code: "no-reference-integrity",
            text: "Referências ARIA por id (aria-controls, aria-describedby) de controles recolhidos não são conferidas por todos os checks; um id quebrado pode não gerar achado.",
          },
        ]),
  ];
}

/** §10: o que rodou, o que não rodou (texto de 2.15.0), limites fixos e a chamada que completa. */
export function checksRunFor(
  recipe: ScanRecipe,
  coverage: { axe?: { engine: { name: string; version: string } }; actionsApplied?: unknown[]; selectors?: string[] },
  viewport: { width: number; height: number } | undefined,
  knowledgeFree: boolean,
) {
  const scope = recipe.selectors?.length ? recipe.selectors.join(", ") : "document";
  const engine = coverage.axe ? `${coverage.axe.engine.name} ${coverage.axe.engine.version}` : undefined;
  const actionsApplied = coverage.actionsApplied?.length ?? 0;
  if (knowledgeFree) {
    return {
      executed: [{ check: "axe", scope, ...(engine ? { engine } : {}) }],
      omitted: [],
      limits: limits(actionsApplied, viewport, true),
      coverageNote: MESSAGES["scan-coverage"],
      completeOmitted: null,
    };
  }
  const active = recipe.checks ?? ALL_CHECKS;
  const executed = active.map((check) => ({
    check,
    scope,
    ...(check === "structure" ? { components: recipe.components?.length ? [...recipe.components].sort() : "todos os br-* encontrados" } : {}),
    ...(check === "tokens" ? { tokenChecks: recipe.tokenChecks ?? ALL_TOKEN_CHECKS } : {}),
    ...(check === "axe" && engine ? { engine } : {}),
  }));
  const omitted: Array<{ check: string; why: string }> = [];
  for (const check of ALL_CHECKS) if (!active.includes(check)) omitted.push({ check, why: CHECK_OMISSION_WHY[check] });
  const omittedTokens = active.includes("tokens") && recipe.tokenChecks ? ALL_TOKEN_CHECKS.filter((t) => !recipe.tokenChecks!.includes(t)) : [];
  for (const sub of omittedTokens) omitted.push({ check: `tokens.${sub}`, why: TOKEN_CHECK_OMISSION_WHY[sub] });
  if (active.includes("structure") && recipe.components?.length) {
    omitted.push({
      check: "structure.components",
      why: `a estrutura só foi conferida para ${[...recipe.components].sort().join(", ")}; os demais componentes br-* não foram conferidos neste estado.`,
    });
  }
  // A chamada exata com SÓ o que faltou, na mesma receita (url, seletores, ações, chegada).
  const missingChecks = ALL_CHECKS.filter((c) => !active.includes(c));
  const completeChecks = [...missingChecks, ...(omittedTokens.length && !missingChecks.includes("tokens") ? (["tokens"] as Check[]) : [])];
  const base = {
    url: recipe.url,
    ...(recipe.selectors?.length ? { selectors: recipe.selectors } : {}),
    ...(recipe.actions?.length ? { actions: recipe.actions } : {}),
    ...(recipe.arrival ? { arrival: recipe.arrival } : {}),
  };
  const completeOmitted =
    omitted.length === 0
      ? null
      : {
          tool: "scan_page",
          arguments: {
            ...base,
            ...(completeChecks.length ? { checks: completeChecks } : { checks: ["structure"] }),
            ...(omittedTokens.length ? { tokenChecks: omittedTokens } : {}),
          },
        };
  return { executed, omitted, limits: limits(actionsApplied, viewport, false), coverageNote: MESSAGES["scan-coverage"], completeOmitted };
}

const INVESTIGATE_WHY =
  "componente encontrado neste estado; regras dele com estratégia keyboard-interaction ou semantic não são medidas pelos checks executados";

/**
 * §10 + §15.8: até 5 componentes na ordem em que aparecem no DOM, cada um com UM passo limitado
 * (get_component_spec). `unmeasured` conta as regras do componente nas estratégias que nenhum check
 * mede. Não é lista de tarefas nem de defeitos.
 */
export function investigateFor(componentsInDomOrder: string[], scanId: string, unmeasured: (component: string) => Record<string, number>) {
  if (!componentsInDomOrder.length) return undefined;
  const items = componentsInDomOrder.slice(0, 5).map((component) => ({
    component,
    stateRef: scanId,
    unmeasured: unmeasured(component),
    next: { tool: "get_component_spec", arguments: { component } },
  }));
  const rest = componentsInDomOrder.slice(5);
  return {
    note: "Até 5 componentes encontrados neste estado, na ordem do DOM, cada um com um passo limitado. Não é lista de tarefas nem de defeitos.",
    retrieval: "automatic" as const,
    why: INVESTIGATE_WHY,
    items,
    more: rest.length ? { remaining: rest.length, components: rest } : null,
    doNotRepeat: MESSAGES["scan-no-repeat"],
  };
}

// ── Observações (S-03) ──────────────────────────────────────────────────────────────────────

function compactObservation(o: Observation, n: number) {
  const note = o.note.length > 160 ? `${o.note.slice(0, 159)}…` : o.note;
  return { n, kind: o.kind, locator: o.element.locator, note };
}

/**
 * Observações dentro do orçamento: contagem por tipo, o porquê uma vez por tipo e itens compactos
 * (sem trecho de HTML); o resto pela continuação exata (get_finding_details view=observations).
 */
export function observationsBlock(observations: Observation[], scanId: string, budget: number) {
  const byKind: Record<string, number> = {};
  const whyByKind: Record<string, string> = {};
  for (const o of observations) {
    byKind[o.kind] = (byKind[o.kind] ?? 0) + 1;
    whyByKind[o.kind] ??= o.whyNotAFinding.length > 200 ? `${o.whyNotAFinding.slice(0, 199)}…` : o.whyNotAFinding;
  }
  const items: ReturnType<typeof compactObservation>[] = [];
  let used = 0;
  for (const [i, o] of observations.entries()) {
    const item = compactObservation(o, i + 1);
    const size = textSize(item) + 1;
    if (used + size > budget) break;
    items.push(item);
    used += size;
  }
  const remaining = observations.length - items.length;
  return {
    note: "Sinais de revisão fora da pontuação (D-27): o oráculo observa, mas não afirma violação.",
    total: observations.length,
    byKind,
    whyNotAFinding: whyByKind,
    items,
    returned: items.length,
    ...(remaining
      ? {
          nextCursor: items.length,
          next: { tool: "get_finding_details", arguments: { scanId, view: "observations", cursor: items.length } },
        }
      : {}),
  };
}

/** Página de observações completas (com trecho e dados), por cursor; o orçamento conta a resposta inteira. */
export function observationPage(observations: Observation[], scanId: string, cursor: number, maxChars: number) {
  const items = observations.map((o, i) => ({ n: i + 1, ...o }));
  return budgetPage(
    items,
    cursor,
    (page, next) => ({
      contract: CONTRACT,
      kind: "observations",
      scanId,
      view: "observations",
      total: observations.length,
      cursor: Math.min(cursor, observations.length),
      count: page.length,
      observations: page,
      ...(next !== null
        ? { nextCursor: next, next: step("request-detail", "próximas observações", "get_finding_details", { scanId, view: "observations", cursor: next }) }
        : { note: MESSAGES["page-end"] }),
    }),
    maxChars,
  );
}

type Diff = { added: string[]; removed: string[]; unchanged: number; evidenceChanged: Array<{ previousId: string; currentId: string }> };

/**
 * Revisão da 3.0.0: o diff de findings entre dois scans sai em contagens + poucos ids no cabeçalho
 * (dentro do orçamento) e o resto por get_finding_details{scanId, view:"diff", cursor}.
 */
export function diffSummary(diff: Diff, scanId: string) {
  const sample = 10;
  const truncated = diff.added.length > sample || diff.removed.length > sample || diff.evidenceChanged.length > sample;
  return {
    added: diff.added.length,
    removed: diff.removed.length,
    unchanged: diff.unchanged,
    evidenceChanged: diff.evidenceChanged.length,
    addedIds: diff.added.slice(0, sample),
    removedIds: diff.removed.slice(0, sample),
    ...(truncated || diff.evidenceChanged.length
      ? { next: { tool: "get_finding_details", arguments: { scanId, view: "diff", cursor: 0 } } }
      : {}),
  };
}

/** Página do diff completo: uma linha por mudança, por cursor, no orçamento. */
export function diffPage(diff: Diff, scanId: string, previousScanId: string, cursor: number, maxChars: number) {
  const rows: Array<Record<string, unknown>> = [
    ...diff.added.map((id) => ({ change: "added", id })),
    ...diff.removed.map((id) => ({ change: "removed", id })),
    ...diff.evidenceChanged.map((e) => ({ change: "evidence-changed", ...e })),
  ];
  return budgetPage(
    rows,
    cursor,
    (page, next) => ({
      contract: CONTRACT,
      kind: "finding-diff",
      scanId,
      previousScanId,
      total: rows.length,
      unchanged: diff.unchanged,
      cursor: Math.min(cursor, rows.length),
      count: page.length,
      changes: page,
      ...(next !== null
        ? { nextCursor: next, next: step("request-detail", "próximas mudanças", "get_finding_details", { scanId, view: "diff", cursor: next }) }
        : { note: MESSAGES["page-end"] }),
    }),
    maxChars,
  );
}

/**
 * Monta a resposta do scan: cabeçalho fixo + observações (até ~20% do orçamento) + página de
 * famílias com o que sobra. Se a soma passar do orçamento, a página de famílias é refeita com
 * menos espaço (no máximo 4 tentativas; a 1ª família entra sempre, para a continuação andar).
 */
export function assembleScan(
  head: Record<string, unknown>,
  observations: Observation[] | null,
  scanId: string,
  maxChars: number,
  page: (familyBudget: number) => Record<string, unknown>,
) {
  const build = (obsBudget: number) => {
    const obs = observations ? observationsBlock(observations, scanId, obsBudget) : undefined;
    const fixed = { ...head, ...(obs ? { observations: obs } : {}) };
    let familyBudget = Math.max(1_000, maxChars - textSize(fixed) - 900);
    let response: Record<string, unknown> = { ...fixed, ...page(familyBudget) };
    for (let i = 0; i < 4 && textSize(response) > maxChars && familyBudget > 200; i++) {
      familyBudget = Math.max(200, familyBudget - (textSize(response) - maxChars) - 100);
      response = { ...fixed, ...page(familyBudget) };
    }
    return response;
  };
  const response = build(observations ? Math.max(300, Math.floor(maxChars * 0.1)) : 0);
  // A 1ª família entra sempre; se ainda passa do teto, as observações ficam só na contagem + continuação.
  return observations && textSize(response) > maxChars ? build(0) : response;
}
