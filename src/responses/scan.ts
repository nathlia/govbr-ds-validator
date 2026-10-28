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
  structure: "a tag raiz e o nome acessível dos componentes br-* e o indicador de foco visível não foram conferidos neste estado.",
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
      why: `a estrutura só foi conferida para ${[...recipe.components].sort().join(", ")}; os demais componentes br-* e o indicador de foco visível não foram conferidos neste estado.`,
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
/**
 * 3.3.0 (N-03): limite por campo nas respostas — strings ≤ `maxString` (com "…[+N]"), listas ≤
 * `maxArray`. Só a resposta encolhe; o ledger guarda o valor inteiro (a receita é reaplicada como foi).
 */
export function boundStrings<T>(value: T, maxString = 300, maxArray = 50, depth = 0): T {
  if (typeof value === "string") {
    return (value.length > maxString ? `${value.slice(0, maxString)}…[+${value.length - maxString}]` : value) as T;
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, maxArray).map((v) => boundStrings(v, maxString, maxArray, depth + 1));
    return (value.length > maxArray ? [...head, `…[+${value.length - maxArray} itens]`] : head) as T;
  }
  if (value && typeof value === "object" && depth < 8) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, boundStrings(v, maxString, maxArray, depth + 1)])) as T;
  }
  return value;
}

/**
 * 3.3.0 (N-03): o teto vale para a resposta inteira. Se, depois de famílias e partes com continuação,
 * o envelope ainda passa de `maxChars`, encolhe o que se repete ou tem outra fonte — textos de
 * `checksRun.limits` (ficam os códigos), cobertura (ficam as contagens), estado (fica o essencial; o
 * inteiro está no ledger: get_finding_details(scanId)) — e só então declara `exceedsMaxChars`.
 */
export function enforceCeiling(response: Record<string, unknown>, maxChars: number, scanId: string): Record<string, unknown> {
  if (textSize(response) <= maxChars) return response;
  let out = { ...response };
  const squeezed: string[] = [];
  const steps: Array<[string, (r: Record<string, unknown>) => Record<string, unknown> | null]> = [
    [
      "checksRun → códigos",
      (r) => {
        const cr = r.checksRun as { limits?: Array<{ code: string }>; coverageNote?: string; executed?: unknown } | undefined;
        if (!cr) return null;
        const { coverageNote: _n, ...rest } = cr;
        return { ...r, checksRun: { ...rest, limits: (cr.limits ?? []).map((l) => l.code) } };
      },
    ],
    [
      "coverage → contagens",
      (r) => {
        const c = r.coverage as Record<string, unknown> | undefined;
        if (!c) return null;
        const count = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).length : undefined);
        return { ...r, coverage: { checks: c.checks, elementsInspected: c.elementsInspected, componentsFound: count("componentsFound"), actionsApplied: count("actionsApplied") } };
      },
    ],
    [
      "state → essencial (inteiro no ledger)",
      (r) => {
        const st = r.state as { observed?: Record<string, unknown>; reached?: unknown; settle?: { settled?: unknown }; replay?: { status?: unknown } } | undefined;
        if (!st) return null;
        const o = st.observed ?? {};
        return {
          ...r,
          state: {
            reached: st.reached,
            replay: st.replay?.status,
            settled: st.settle?.settled,
            observed: { url: o.url, path: o.path, viewport: o.viewport, ...(o.httpStatus ? { httpStatus: o.httpStatus } : {}) },
            ...(scanId ? { full: { tool: "get_finding_details", arguments: { scanId } } } : {}),
          },
        };
      },
    ],
    ["investigate → removido", (r) => (r.investigate ? (({ investigate: _i, ...rest }) => rest)(r) : null)],
    ["familyHint/chaves → removidos", (r) => (({ familyHint: _h, familyKey: _k, evidenceSignatureKey: _e, detailHint: _d, ...rest }) => rest)(r)],
  ];
  for (const [label, transform] of steps) {
    if (textSize(out) <= maxChars) break;
    const next = transform(out);
    if (!next) continue;
    out = next;
    squeezed.push(label);
  }
  out = { ...out, squeezed };
  if (textSize(out) > maxChars) {
    out.exceedsMaxChars = {
      maxChars,
      note: "O mínimo desta resposta não cabe no orçamento pedido; ela foi devolvida assim mesmo. Peça maxChars maior.",
    };
  }
  return out;
}

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
    const item = boundStrings(compactObservation(o, i + 1), 200);
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
  const items = observations.map((o, i) => boundStrings({ n: i + 1, ...o }, 400));
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
  options: { firstScanPage?: boolean } = {},
) {
  let response = assembleScanPage(head, observations, scanId, maxChars, page, options);
  if (options.firstScanPage) response = ensureFirstPageFamilies(response, head, observations, scanId, maxChars, page);
  return enforceCeiling(response, maxChars, scanId);
}

/** 3.4.0 (B6): meta de famílias na 1ª página do scan (ou todas, se houver menos). */
export const FIRST_PAGE_MIN_FAMILIES = 3;

const listedItems = (r: Record<string, unknown>) =>
  Array.isArray(r.families) ? r.families.length : Array.isArray(r.findings) ? r.findings.length : 0;

/**
 * 3.4.0 (B6, N-05): na 1ª página o cabeçalho cedia o orçamento e voltava 1 de 5 famílias (tela A),
 * 1 de 6 (fluxo), 1 de 15 (tela B). Enquanto a página traz menos de FIRST_PAGE_MIN_FAMILIES e há mais,
 * o cabeçalho encolhe por etapas — só o que tem continuação ou é constante —, e para na primeira que
 * atinge a meta. O que encolheu fica em `compacted`; o inteiro continua no ledger (get_finding_details).
 */
function ensureFirstPageFamilies(
  response: Record<string, unknown>,
  head: Record<string, unknown>,
  observations: Observation[] | null,
  scanId: string,
  maxChars: number,
  page: (familyBudget: number) => Record<string, unknown>,
): Record<string, unknown> {
  const total = Number(response.totalFamilies ?? response.total ?? 0);
  const want = Math.min(FIRST_PAGE_MIN_FAMILIES, total);
  if (response.nextCursor === undefined || listedItems(response) >= want) return response;
  const constants = (p: Record<string, unknown>) => {
    const { familyHint: _h, familyKey: _k, evidenceSignatureKey: _e, ...rest } = p;
    return { ...rest, familyHint: "Mais famílias: get_finding_details(scanId, cursor=nextCursor); membros: get_finding_details(scanId, familyId, cursor=nextMemberCursor)." };
  };
  let h = head;
  let obs = observations;
  let pager = page;
  const done: string[] = [];
  const stages: Array<[string, () => boolean]> = [
    ["observations → contagem + get_finding_details(view:observations)", () => {
      if (!obs?.length) return false;
      h = { ...h, observations: minimalObservations(obs, scanId) };
      obs = null;
      return true;
    }],
    ["investigate.items > 1 → investigate.more", () => {
      const inv = h.investigate as { items?: Array<{ component: string }>; more?: { remaining: number; components: string[] } } | undefined;
      if (!inv?.items || inv.items.length <= 1) return false;
      const moved = inv.items.slice(1).map((i) => i.component);
      h = { ...h, investigate: { ...inv, items: inv.items.slice(0, 1), more: { remaining: (inv.more?.remaining ?? 0) + moved.length, components: [...moved, ...(inv.more?.components ?? [])] } } };
      return true;
    }],
    ["familyKey/evidenceSignatureKey → removidos (constantes)", () => {
      pager = (b) => constants(page(b));
      return true;
    }],
    ["coverage → contagens (inteira no ledger)", () => {
      const c = h.coverage as Record<string, unknown> | undefined;
      if (!c) return false;
      const count = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).length : undefined);
      const { componentsRequested: _r, evidenceSelectors: _e, ...rest } = c;
      h = { ...h, coverage: { ...rest, componentsRequested: count("componentsRequested"), evidenceSelectors: count("evidenceSelectors") } };
      return true;
    }],
    ["state → essencial (inteiro no ledger)", () => {
      const st = h.state as { observed?: Record<string, unknown>; reached?: unknown; settle?: { settled?: unknown }; replay?: { status?: unknown } } | undefined;
      if (!st) return false;
      const o = st.observed ?? {};
      h = {
        ...h,
        state: {
          reached: st.reached,
          replay: st.replay?.status,
          settled: st.settle?.settled,
          observed: { url: o.url, path: o.path, viewport: o.viewport, ...(o.httpStatus ? { httpStatus: o.httpStatus } : {}) },
          full: { tool: "get_finding_details", arguments: { scanId } },
        },
      };
      return true;
    }],
    ["investigate.items → investigate.more", () => {
      const inv = h.investigate as { items?: Array<{ component: string }>; more?: { remaining: number; components: string[] } } | undefined;
      if (!inv?.items?.length) return false;
      const moved = inv.items.map((i) => i.component);
      h = { ...h, investigate: { ...inv, items: [], more: { remaining: (inv.more?.remaining ?? 0) + moved.length, components: [...moved, ...(inv.more?.components ?? [])] } } };
      return true;
    }],
  ];
  let best = response;
  for (const [label, apply] of stages) {
    if (!apply()) continue;
    done.push(label);
    const trial = assembleScanPage(h, obs, scanId, maxChars, pager, { firstScanPage: true });
    if (textSize(trial) > maxChars || listedItems(trial) <= listedItems(best)) continue;
    best = { ...trial, compacted: [...done, ...((trial.compacted as string[] | undefined) ?? [])] };
    if (listedItems(best) >= want) break;
  }
  return best;
}

function assembleScanPage(
  head: Record<string, unknown>,
  observations: Observation[] | null,
  scanId: string,
  maxChars: number,
  page: (familyBudget: number) => Record<string, unknown>,
  /**
   * 3.1.0: `firstScanPage` = 1ª página de um scan_page (sem cursor). Só ali, como último recurso, a
   * página de achados pode começar vazia na continuação (cursor 0). Em continuações e em
   * get_finding_details a página guarda sempre ≥ 1 item (a continuação anda) e diz que passou do teto.
   */
  options: { firstScanPage?: boolean } = {},
): Record<string, unknown> {
  const build = (obsBudget: number) => {
    const obs = observations ? observationsBlock(observations, scanId, obsBudget) : undefined;
    const fixed = { ...head, ...(obs ? { observations: obs } : {}) };
    let familyBudget = Math.max(1_000, maxChars - textSize(fixed) - 900);
    let response: Record<string, unknown> = { ...fixed, ...page(familyBudget) };
    for (let i = 0; i < 4 && textSize(response) > maxChars && familyBudget > 200; i++) {
      familyBudget = Math.max(200, familyBudget - (textSize(response) - maxChars) - 100);
      response = { ...fixed, ...page(familyBudget) };
    }
    // 3.3.0 (N-05): a reserva de 900 é estimativa; se sobrou espaço e ficaram itens de fora, a página
    // usa a sobra (no máximo 2 tentativas, e só fica com a tentativa que ainda cabe).
    for (let i = 0; i < 2 && response.nextCursor !== undefined && maxChars - textSize(response) > 150; i++) {
      const wider = familyBudget + (maxChars - textSize(response)) - 50;
      const trial = { ...fixed, ...page(wider) };
      if (textSize(trial) > maxChars) break;
      familyBudget = wider;
      response = trial;
    }
    return response;
  };
  const obsShare = observations ? Math.max(300, Math.floor(maxChars * 0.1)) : 0;
  let response = build(obsShare);
  const compacted: string[] = [];
  const moveInvestigate = (h: Record<string, unknown>, keep: number) => {
    const inv = h.investigate as { items?: Array<{ component: string }>; more?: { remaining: number; components: string[] } } | undefined;
    if (!inv?.items || inv.items.length <= keep) return h;
    const moved = inv.items.slice(keep).map((i) => i.component);
    return {
      ...h,
      investigate: {
        ...inv,
        items: inv.items.slice(0, keep),
        more: { remaining: (inv.more?.remaining ?? 0) + moved.length, components: [...moved, ...(inv.more?.components ?? [])] },
      },
    };
  };
  // 3.3.0 (N-05): famílias antes de investigate no orçamento. Se ficaram famílias de fora e o
  // investigate tem mais de um componente, ele cede o espaço (os demais vão para investigate.more).
  const invItems = (head.investigate as { items?: unknown[] } | undefined)?.items;
  const listed = (r: Record<string, unknown>) => (Array.isArray(r.families) ? r.families.length : Array.isArray(r.findings) ? r.findings.length : 0);
  if (response.nextCursor !== undefined && invItems && invItems.length > 1) {
    const moved = moveInvestigate(head, 1);
    const retry: Record<string, unknown> = assembleScanPage(moved, observations, scanId, maxChars, page, options);
    // Só cede quando a página de fato ganha itens; senão nada muda.
    if (listed(retry) > listed(response) && textSize(retry) <= maxChars) {
      const label = "investigate.items > 1 → investigate.more (famílias primeiro)";
      return { ...retry, compacted: [label, ...((retry.compacted as string[] | undefined) ?? [])] };
    }
  }
  // A 1ª família entra sempre; se ainda passa do teto, as observações ficam só na contagem + continuação.
  if (observations && textSize(response) > maxChars) response = build(0);
  if (textSize(response) <= maxChars) return response;
  // 3.1.0: o cabeçalho também conta (receita, chegada, stateDiff, investigate). Se ainda passa do teto,
  // encolhe as partes que têm continuação, na ordem, e diz o que encolheu e onde está o resto.
  // Só entra em `compacted` o que tinha itens e de fato encolheu.
  const shrink = (part: string, transform: (h: Record<string, unknown>) => Record<string, unknown>) => {
    if (textSize(response) <= maxChars) return;
    head = transform(head);
    compacted.push(part);
    response = { ...build(0), compacted: [...compacted] };
  };
  if (observations?.length) {
    const all = observations;
    observations = null;
    shrink("observations.whyNotAFinding → get_finding_details(view:observations)", (h) => ({
      ...h,
      observations: minimalObservations(all, scanId),
    }));
  }
  for (const keep of [3, 1, 0]) {
    const inv = head.investigate as { items?: unknown[] } | undefined;
    if (!inv?.items || inv.items.length <= keep) continue;
    shrink(`investigate.items > ${keep} → investigate.more`, (h) => moveInvestigate(h, keep));
  }
  const diff = head.stateDiff as { findings?: { addedIds?: unknown[]; removedIds?: unknown[] } } | undefined;
  if (diff?.findings && ((diff.findings.addedIds?.length ?? 0) + (diff.findings.removedIds?.length ?? 0)) > 0) {
    shrink("stateDiff.findings ids → get_finding_details(view:diff)", (h) => {
      const { addedIds: _a, removedIds: _r, ...counts } = diff.findings as Record<string, unknown>;
      return { ...h, stateDiff: { ...diff, findings: { ...counts, next: { tool: "get_finding_details", arguments: { scanId, view: "diff" } } } } };
    });
  }
  if (textSize(response) <= maxChars) return response;
  const p = page(200);
  const listKey = (["families", "findings"] as const).find((k) => Array.isArray(p[k]));
  const items = listKey ? (p[listKey] as unknown[]).length : 0;
  // 3.3.0 (N-02): antes de esvaziar a página, o envelope encolhe (textos fixos, cobertura, estado) e a
  // 1ª família fica — cortada nos ids. Só se nem assim couber, a página começa na continuação.
  const squeezedPage = enforceCeiling({ ...head, ...p, ...(compacted.length ? { compacted: [...compacted] } : {}) }, maxChars, scanId);
  if (items > 0 && !squeezedPage.exceedsMaxChars) return squeezedPage;
  if (options.firstScanPage && scanId && listKey && items > 0) {
    // Último recurso (1ª página do scan_page): a página de achados começa na continuação (cursor 0).
    compacted.push(`${listKey} → get_finding_details(scanId, cursor:0)`);
    // N-02: nada da página veio, então nada conta como devolvido — um único cursor (0), coerente.
    const totalItems = Number(p.totalFamilies ?? p.total ?? items);
    const totalFindings = Number(p.totalFindings ?? p.total ?? items);
    return {
      ...head,
      ...p,
      [listKey]: [],
      count: 0,
      cursor: 0,
      truncated: true,
      complete: false,
      partial: {
        reasons: ["char-budget"],
        ...(listKey === "families" ? { familiesNotReturned: totalItems, membersNotReturned: totalFindings } : { notReturned: totalItems }),
        nextCursor: 0,
      },
      nextCursor: 0,
      next: { tool: "get_finding_details", arguments: { scanId, cursor: 0 } },
      compacted: [...compacted],
    };
  }
  // Em continuação: ≥ 1 item fica (a continuação anda) e a resposta diz que passou do teto.
  return {
    ...response,
    exceedsMaxChars: {
      maxChars,
      note: "Um único item não cabe no orçamento pedido; ele foi devolvido assim mesmo para a continuação andar. Peça detail menor ou maxChars maior.",
    },
  };
}

/** Observações só na contagem, sem as justificativas por tipo: o detalhe está na página de observações. */
function minimalObservations(observations: Observation[], scanId: string) {
  const byKind: Record<string, number> = {};
  for (const o of observations) byKind[o.kind] = (byKind[o.kind] ?? 0) + 1;
  return {
    note: "Sinais de revisão fora da pontuação (D-27): o oráculo observa, mas não afirma violação.",
    total: observations.length,
    byKind,
    returned: 0,
    ...(observations.length
      ? { nextCursor: 0, next: { tool: "get_finding_details", arguments: { scanId, view: "observations", cursor: 0 } } }
      : {}),
  };
}
