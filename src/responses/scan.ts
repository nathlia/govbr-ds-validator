/**
 * 3.0.0 (NAT-99): blocos do contrato no scan_page (§10) — `checksRun` (sempre), `investigate`
 * (perfis com normas, 1ª página, ordem do DOM, §15.8), observações limitadas com continuação (S-03)
 * e a montagem da resposta inteira dentro do orçamento (padrão 8.000 caracteres).
 */
import type { Finding, Observation } from "../schema/finding.js";
import { CONTRACT, MESSAGES, budgetPage, step, textSize } from "./contract.js";
import { STATE_IDS_NOTE, idLabelOf, pageLevelCodes, pageLevelMinimal, pageLevelNorm, pageLevelShort, type NotJudgedItem } from "../scan/notJudged.js";
import { CROSS_ROUTE, sessionPendingChecklistCount, sessionPendingCodes } from "../scan/session.js";
import { clausesSummary, deferredReserve, referenceFloor, selectReserve, splitDelivered, type ClauseDelivered, type ContextDelivered, type ReserveCandidate } from "../tools/clauseReserve.js";

export const SCAN_DEFAULT_MAX_CHARS = 8_000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const OBSERVATION_PAGE_MAX_CHARS = 8_000;

const CHECK_OMISSION_WHY = {
  tokens: "cores, fonte, raio e espaçamento fora do registro de tokens do DS não foram medidos neste estado.",
  structure: "a tag raiz e o nome acessível dos componentes br-*, o indicador de foco visível e o rótulo dos campos (placeholder no lugar do rótulo) não foram conferidos neste estado.",
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

function limits(actionsApplied: number, viewport: { width: number; height: number } | undefined, knowledgeFree: boolean, statesPending = false) {
  const where = viewport ? ` nesta janela (${viewport.width}×${viewport.height})` : " nesta janela";
  const state = actionsApplied ? `o estado depois de ${actionsApplied} ação(ões) reproduzida(s)` : "o estado inicial, sem interação";
  return [
    {
      code: "no-state-semantics",
      text: "Nenhum check deste scan mede estado atual/selecionado, ordem de foco ou posição visual; zero achados não diz nada sobre eles.",
    },
    {
      code: "single-state",
      // 3.7.9 (D1): com estados recolhidos pendentes, o limite aponta para eles (a forma acionável) em vez da frase longa.
      text: statesPending
        ? "Só este estado; ver state-unscanned."
        : `Mediu só ${state}${where}; outros estados, conteúdo que só aparece após interação ou tempo e outras larguras não foram vistos.`,
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
  /** 3.6.5 (item 6): o que a revisita de elementos antes ocultos mediu neste scan (pageScan.RevisitItem). */
  revisited?: Array<{ locator: string; checker: string; now: string; findings?: string[] }>,
  /** 3.7.9 (D1): há pendência state-unscanned aberta neste scan. */
  statesPending = false,
  /** 3.7.10 (D5): checks já rodados NESTE estado (rota + fingerprint) na sessão — completeOmitted não os sugere de novo. */
  sessionRun: string[] = [],
) {
  const scope = recipe.selectors?.length ? recipe.selectors.join(", ") : "document";
  const engine = coverage.axe ? `${coverage.axe.engine.name} ${coverage.axe.engine.version}` : undefined;
  const actionsApplied = coverage.actionsApplied?.length ?? 0;
  if (knowledgeFree) {
    return {
      // 3.7.3 A8: a medida ARIA × estado nativo também roda neste perfil (só pendências, sem norma da base).
      executed: [{ check: "axe", scope, ...(engine ? { engine } : {}) }, { check: "aria-native-state", scope }],
      omitted: [],
      limits: limits(actionsApplied, viewport, true, statesPending),
      coverageNote: MESSAGES["scan-coverage"],
      completeOmitted: null,
    };
  }
  const active = recipe.checks ?? ALL_CHECKS;
  const executed: Array<Record<string, unknown> & { check: string }> = active.map((check) => ({
    check,
    scope,
    ...(check === "structure" ? { components: recipe.components?.length ? [...recipe.components].sort() : "todos os br-* encontrados" } : {}),
    ...(check === "tokens" ? { tokenChecks: recipe.tokenChecks ?? ALL_TOKEN_CHECKS } : {}),
    ...(check === "axe" && engine ? { engine } : {}),
  }));
  // 3.6.5 (D-155, item 6; rastreio dev-364 §2, B-15 p03): a revisita mediu tokens e gerou achado — o check aparece
  // como executado (só nesses elementos), em vez de só "tokens omitido", que contradizia o achado de token.
  const revisitHits = (revisited ?? []).filter((r) => r.now === "measured" && r.findings?.length);
  const revisitChecks = [...new Set(revisitHits.map((r) => r.checker.replace(/^ds-token-/, "").replace(/^font-family$/, "font")))];
  const revisitFindings = revisitHits.flatMap((r) => r.findings ?? []);
  if (revisitHits.length) {
    executed.push({ check: "tokens (revisita)", tokenChecks: revisitChecks, findings: revisitFindings.slice(0, 10) });
  }
  const omitted: Array<{ check: string; why: string }> = [];
  for (const check of ALL_CHECKS) {
    if (active.includes(check)) continue;
    const why = check === "tokens" && revisitHits.length
      ? "medidos só nos elementos antes ocultos (executed: tokens (revisita)); no resto deste estado, não."
      : CHECK_OMISSION_WHY[check];
    omitted.push({ check, why });
  }
  const omittedTokens = active.includes("tokens") && recipe.tokenChecks ? ALL_TOKEN_CHECKS.filter((t) => !recipe.tokenChecks!.includes(t)) : [];
  for (const sub of omittedTokens) omitted.push({ check: `tokens.${sub}`, why: TOKEN_CHECK_OMISSION_WHY[sub] });
  if (active.includes("structure") && recipe.components?.length) {
    omitted.push({
      check: "structure.components",
      why: `a estrutura só foi conferida para ${[...recipe.components].sort().join(", ")}; os demais componentes br-*, o indicador de foco visível e o rótulo dos campos não foram conferidos neste estado.`,
    });
  }
  // A chamada exata com SÓ o que faltou, na mesma receita (url, seletores, ações, chegada).
  const missingChecks = ALL_CHECKS.filter((c) => !active.includes(c) && !sessionRun.includes(c));
  const completeChecks = [...missingChecks, ...(omittedTokens.length && !missingChecks.includes("tokens") ? (["tokens"] as Check[]) : [])];
  const base = {
    url: recipe.url,
    ...(recipe.selectors?.length ? { selectors: recipe.selectors } : {}),
    ...(recipe.actions?.length ? { actions: recipe.actions } : {}),
    ...(recipe.arrival ? { arrival: recipe.arrival } : {}),
  };
  // 3.7.10 (D5): o que a sessão já mediu neste estado não volta na sugestão (sem isso, page ↔ resto em laço).
  const completeOmitted =
    omitted.length === 0 || (!missingChecks.length && !omittedTokens.length && !(active.includes("structure") && recipe.components?.length))
      ? null
      : {
          tool: "scan_page",
          arguments: {
            ...base,
            ...(completeChecks.length ? { checks: completeChecks } : { checks: ["structure"] }),
            ...(omittedTokens.length ? { tokenChecks: omittedTokens } : {}),
          },
        };
  return {
    executed,
    omitted,
    // 3.6.1 (item 3): o mínimo — pular um check não é conformidade.
    ...(omitted.length ? { omittedNote: "Omitido ≠ conforme: sem medida neste estado; achados dele não sumiram (stateDiff.notRemeasured)." } : {}),
    limits: limits(actionsApplied, viewport, false, statesPending),
    coverageNote: MESSAGES["scan-coverage"],
    completeOmitted,
  };
}

/**
 * §10 + §15.8; 3.5.0 (revisão Fable P1/P9): TODOS os componentes encontrados, ordenados pelas obrigações e
 * proibições da base que nenhum check do oráculo mede (empate: ordem do DOM). Os 5 primeiros com o passo
 * (a lista de verificação do componente); os demais por nome em `more`, na mesma ordem. Nunca encolhe abaixo
 * da lista de nomes + `next`. São candidatas a medir antes de encerrar, não defeitos.
 */
export function investigateFor(
  componentsInDomOrder: string[],
  scanId: string,
  unmeasured: (component: string) => Record<string, number>,
  strong: (component: string) => { strong: number; unmeasured: number } = () => ({ strong: 0, unmeasured: 0 }),
  /**
   * 3.7.0 (D-155/D-159; rastreio dev-364: o checklist nunca foi puxado): as cláusulas mensuráveis que nenhum check julga,
   * por mensurabilidade, com o procedimento — empurradas no item (componentChecklist.investigateClauses).
   */
  clauses?: (component: string) => { total: number; clauses: Array<{ citeAs: string; text: string; how: string; short?: string }> },
  /**
   * 3.7.2 (rastreio dev-371-a §4/§7, A-11: o message, único componente novo no estado de erro, saía em 11º de 16): os
   * componentes deste estado que não estavam no estado anterior escaneado na sessão — vêm primeiro (no investigate, nas
   * formas compactas, no aviso, na dica e no `next`), antes da ordem por obrigações sem medida.
   */
  newComponents: ReadonlySet<string> = new Set(),
  globalClauses?: { total: number; clauses: Array<{ citeAs: string; text: string; how: string; when?: string }> },
  /**
   * 3.7.8 (leitura dev-374-a2 §5 item 4; pendente desde a 3.7.1): a ordem por obrigações sem medida punha em todo scan os
   * componentes de base maior na frente (`radio:44, checkbox:44, tooltip:33…`), mesmo ocultos ou só como parte de outro
   * (o radio da lista fechada do select) — e os presentes no estado (aba, botão, upload, switch) ficavam em `more`. Agora:
   * os visíveis neste estado antes dos ocultos; o componente que só aparece como parte de um hospedeiro (como no exemplo
   * oficial dele) sai dos itens e vai para `more`, logo depois do hospedeiro. Sem `layout`, a ordem antiga.
   */
  layout?: Record<string, { visible: boolean; partOf?: string }>,
) {
  const page = globalClauses ? {
    stateRef: scanId,
    note: "Cláusulas globais candidatas: confira aplicabilidade e meça no estado; não são veredito nem pendingId registrado.",
    total: globalClauses.total,
    clauses: globalClauses.clauses,
    next: { tool: "get_page_rules", arguments: { view: "checklist" } },
  } : undefined;
  if (!componentsInDomOrder.length) return page ? {
    page, items: [], more: null, next: page.next, doNotRepeat: MESSAGES["scan-no-repeat"],
  } : undefined;
  const isNew = (c: string) => (newComponents.has(c) ? 1 : 0);
  const visible = (c: string) => (layout?.[c]?.visible === false ? 0 : 1);
  const hostOf = (c: string) => (isNew(c) ? undefined : layout?.[c]?.partOf);
  const byRank = componentsInDomOrder
    .map((component, i) => ({ component, i, s: strong(component) }))
    .sort((a, b) => isNew(b.component) - isNew(a.component) || visible(b.component) - visible(a.component) || b.s.unmeasured - a.s.unmeasured || a.i - b.i);
  // 3.7.8 (item 4): as partes vêm logo depois do hospedeiro; as de um hospedeiro que está nos itens, no fim de `more`.
  const standalone = byRank.filter((r) => !hostOf(r.component));
  const partsOf = (host: string) => byRank.filter((r) => hostOf(r.component) === host);
  const head = standalone.slice(0, 5);
  const tail = standalone.slice(5);
  // parte de uma parte vem depois dela (recursivo); o que sobrar (hospedeiro fora da lista) vai para o fim — ninguém some.
  const withParts = (r: (typeof byRank)[number], seen = new Set<string>()): Array<(typeof byRank)[number]> =>
    seen.has(r.component) ? [] : (seen.add(r.component), [r, ...partsOf(r.component).flatMap((p) => withParts(p, seen))]);
  const placed = [
    ...head,
    ...tail.flatMap((r) => withParts(r)),
    ...head.flatMap((r) => partsOf(r.component).flatMap((p) => withParts(p))),
  ];
  const ranked = [...new Map([...placed, ...byRank].map((r) => [r.component, r])).values()];
  const partOf = Object.fromEntries(ranked.filter((r) => hostOf(r.component)).map((r) => [r.component, hostOf(r.component)!]));
  const fresh = ranked.filter((r) => isNew(r.component)).map((r) => r.component);
  const clauseOf = new Map(ranked.map(({ component }) => [component, clauses?.(component)]));
  const items = ranked.slice(0, 5).map(({ component, s }) => ({
    component,
    ...(isNew(component) ? { newInState: true as const } : {}),
    stateRef: scanId,
    requiredUnmeasured: s.unmeasured,
    unmeasured: unmeasured(component),
    ...(() => {
      const c = clauseOf.get(component);
      return c && c.clauses.length
        ? { clauses: c.clauses.map(({ citeAs, text, how }) => ({ citeAs, text, how })), ...(c.total > c.clauses.length ? { clausesMore: c.total - c.clauses.length } : {}) }
        : {};
    })(),
    // 3.5.0 (D-155): o passo é a lista de verificação (obrigações/proibições + como medir).
    next: { tool: "get_component_spec", arguments: { component, view: "checklist" } },
  }));
  const rest = ranked.slice(5).map((r) => r.component);
  // 3.7.0 (revisão da reexecução, lacuna A): a forma compacta (todos os componentes, `id · procedimento curto`) fica guardada
  // fora do JSON (chave símbolo: não conta no tamanho nem sai na resposta) para os degraus da escada do teto.
  const compact: CompactClauses = { byComponent: {}, total: 0 };
  // Nos degraus de poucos componentes, primeiro os que têm cláusula de atributo/área/posição (a parte da anatomia — "parte
  // X presente" — por último): a ordem do investigate desempata. 3.7.2: o componente novo no estado vem antes de tudo.
  const anatomyOnly = (component: string) => (clauseOf.get(component)?.clauses ?? []).every((x) => (x.short ?? "").startsWith("parte "));
  for (const { component } of [...ranked].sort((a, b) => isNew(b.component) - isNew(a.component) || Number(anatomyOnly(a.component)) - Number(anatomyOnly(b.component)))) {
    const c = clauseOf.get(component);
    if (!c?.clauses.length) continue;
    compact.byComponent[component] = c.clauses.map((x) => `${x.citeAs} · ${x.short ?? x.how}`);
    compact.total += c.total;
  }
  // 3.7.2 (rastreio dev-371-a §4): a forma de itens só punha cláusulas nos 5 primeiros, e a compacta (orçamento menor)
  // chegava a todos — um orçamento maior mostrava MENOS componentes. Os de `more` levam a forma compacta deles.
  const moreClauses = Object.fromEntries(rest.filter((c) => compact.byComponent[c]).map((c) => [c, compact.byComponent[c]]));
  return {
    ...(page ? { page } : {}),
    ...(Object.keys(compact.byComponent).length ? { [COMPACT_CLAUSES]: compact } : {}),
    note: layout
      ? "Todos os componentes do DS deste estado: visíveis primeiro, por obrigações sem medida automática (requiredUnmeasured); candidatas a medir antes de encerrar; não são defeitos."
      : "Todos os componentes do DS deste estado, por obrigações sem medida automática (requiredUnmeasured): candidatas a medir antes de encerrar; não são defeitos.",
    ...(Object.keys(partOf).length ? { partOf, partOfNote: "partOf: achado só dentro do hospedeiro, como no exemplo oficial dele; vem depois do hospedeiro." } : {}),
    ...(fresh.length ? { newInState: fresh, newNote: "newInState: componentes que não estavam no estado anterior da sessão — vêm primeiro." } : {}),
    ...(items.some((i) => "clauses" in i)
      ? { clausesNote: "clauses: obrigações mensuráveis que nenhum check julgou, DOM/CSS primeiro; meça pelo how e dê a cada uma um estado (medida, violada ou não se aplica). As demais: next." }
      : {}),
    retrieval: "automatic" as const,
    items,
    more: rest.length ? { remaining: rest.length, components: rest, ...(Object.keys(moreClauses).length ? { clauses: moreClauses } : {}) } : null,
    next: { tool: "get_component_spec", arguments: { component: ranked[0].component, view: "checklist" } },
    doNotRepeat: MESSAGES["scan-no-repeat"],
  };
}

/** 3.7.2: os componentes novos no estado, levados às formas compactas do investigate (só quando há). */
const newOf = (inv: { newInState?: unknown }) => (Array.isArray(inv.newInState) && inv.newInState.length ? { newInState: inv.newInState as string[] } : {});

/** Leitura global tem continuação própria, mesmo quando o bloco de componentes encolhe. */
const pageOf = (inv: object) => ("page" in inv ? { page: inv.page } : {});

type GlobalClause = { citeAs: string; text?: string; how: string; when?: string };
function investigatePageOne(r: Record<string, unknown>): Record<string, unknown> | null {
  const inv = r.investigate as { page?: { clauses?: GlobalClause[] } } | undefined;
  if (!inv?.page?.clauses || inv.page.clauses.length <= 1) return null;
  return { ...r, investigate: { ...inv, page: { ...inv.page, clauses: inv.page.clauses.slice(0, 1) } } };
}
function investigatePagePointer(r: Record<string, unknown>): Record<string, unknown> | null {
  const inv = r.investigate as { page?: { total: number; clauses?: GlobalClause[]; next: unknown } } | undefined;
  if (!inv?.page?.clauses) return null;
  return { ...r, investigate: { ...inv, page: { total: inv.page.total, deferred: true, next: inv.page.next } } };
}

/** O ponteiro textual mínimo cede os metadados antes de uma família de fatos. */
function investigatePageTiny(r: Record<string, unknown>): Record<string, unknown> | null {
  const inv = r.investigate as { page?: { next?: unknown } } | undefined;
  if (!inv?.page || typeof inv.page.next === "string") return null;
  return { ...r, investigate: { ...inv, page: { next: "get_page_rules(view:checklist)" } } };
}

// ── Especificação por parte (3.7.6, leitura dev-374-a2 §5 itens 1–2) ─────────────────────────────────────────────

/**
 * 3.7.6 (item 1): as unidades de especificação (emenda-2, D-167) chegavam só com `force:"especificacao"` em get_ds_rules;
 * nenhum agente as pediu (a tipografia da aba, o centro do ícone). O bloco `specification` do 1º scan diz QUAIS
 * componentes desta página têm linhas mensuráveis por parte (token/valor), os desvios que o oráculo já mediu (`off`,
 * observação spec-part-token, com a unidade) e a chamada que traz as linhas (get_component_spec → specification.measure).
 * Fora das obrigações: descreve, não obriga. Cede em degraus no teto e nunca some (fica a chamada).
 */
export const SPEC_COMPONENTS_MAX = 12;
export const SPEC_OFF_MAX = 3;
export const SPEC_NOTE =
  "Especificação por parte (tabelas do DS; força especificacao: descreve, não obriga). Por componente: get_component_spec{component} → specification.measure; meça a parte e compare. off: desvios já medidos.";

type SpecBlock = { note?: string; components?: string[] | string; more?: number; off?: string[]; offMore?: number; offVerify?: string; next: unknown };

/** 3.7.7 (D1): como decidir cada desvio de `off` — a condição exata do verify_finding (fica até a forma mínima). */
export const SPEC_OFF_VERIFY = "verify_finding live por elemento: rule.id = a unidade, evidence.data {property, observed, expectedCondition:\"part-value-matches-spec-token\"}";

/** Uma linha por desvio (mesmas unidades, propriedade e valor): `ids propriedade observado≠token (valor) ×n @localizador`. */
export function specOffLines(observations: Observation[]): Array<{ component: string; line: string; unit: string; n: number }> {
  const groups = new Map<string, { component: string; unit: string; text: string; locators: string[] }>();
  for (const o of observations) {
    if (o.kind !== "spec-part-token") continue;
    const d = (o.data ?? {}) as { component?: string; property?: string; observed?: string; token?: string; expected?: string; unitIds?: string[] };
    const unit = (d.unitIds ?? [])[0];
    if (!unit || !d.component) continue;
    const text = `${(d.unitIds ?? []).join("|")} ${d.property} ${d.observed}≠${d.token} (${d.expected})`;
    const g = groups.get(text) ?? { component: d.component, unit, text, locators: [] };
    if (!g.locators.includes(o.element.locator)) g.locators.push(o.element.locator);
    groups.set(text, g);
  }
  return [...groups.values()].map((g) => ({
    component: g.component,
    unit: g.unit,
    n: g.locators.length,
    line: `${g.text}${g.locators.length > 1 ? ` ×${g.locators.length}` : ""} @${clip(g.locators[0], 60)}`,
  }));
}

export function specificationFor(
  /** Componentes desta página na ordem do investigate (depois os demais encontrados). */
  components: string[],
  measurable: (component: string) => number,
  observations: Observation[],
): SpecBlock | undefined {
  const off = specOffLines(observations);
  const withRows = components.filter((c) => measurable(c) > 0);
  if (!withRows.length && !off.length) return undefined;
  // os componentes com desvio medido primeiro
  const offComponents = [...new Set(off.map((o) => o.component))];
  const ranked = [...new Set([...offComponents.filter((c) => withRows.includes(c)), ...withRows])];
  const first = ranked[0] ?? offComponents[0];
  return {
    note: SPEC_NOTE,
    components: ranked.slice(0, SPEC_COMPONENTS_MAX),
    ...(ranked.length > SPEC_COMPONENTS_MAX ? { more: ranked.length - SPEC_COMPONENTS_MAX } : {}),
    ...(off.length ? { off: off.slice(0, SPEC_OFF_MAX).map((o) => o.line) } : {}),
    ...(off.length > SPEC_OFF_MAX ? { offMore: off.length - SPEC_OFF_MAX } : {}),
    ...(off.length ? { offVerify: SPEC_OFF_VERIFY } : {}),
    next: { tool: "get_component_spec", arguments: { component: first } },
  };
}

/** No teto: sem a nota, componentes numa linha curta (até 6 nomes + contagem). */
export function specificationShort(r: Record<string, unknown>): Record<string, unknown> | null {
  const sp = r.specification as SpecBlock | undefined;
  if (!sp || !Array.isArray(sp.components)) return null;
  const names = sp.components;
  const more = names.length - Math.min(6, names.length) + (sp.more ?? 0);
  const { note: _n, more: _m, ...rest } = sp;
  return { ...r, specification: { ...rest, components: `${names.slice(0, 6).join(",")}${more > 0 ? ` +${more}` : ""}` } };
}

/** O piso: os desvios só com as unidades e o valor, 3 nomes e a chamada em texto (nunca some). */
export function specificationMinimal(r: Record<string, unknown>): Record<string, unknown> | null {
  const sp = r.specification as SpecBlock | undefined;
  if (!sp || typeof sp.next === "string") return null;
  const [head, tail] = typeof sp.components === "string" ? sp.components.split(" +") : [undefined, undefined];
  const names = head !== undefined ? head.split(",") : (sp.components as string[] | undefined) ?? [];
  const total = names.length + (head !== undefined ? Number(tail ?? 0) : (sp.more ?? 0));
  const off = (sp.off ?? []).map((l) => l.split(" (")[0]);
  const comp = (sp.next as { arguments?: { component?: string } } | undefined)?.arguments?.component ?? names[0];
  return {
    ...r,
    specification: {
      components: `${names.slice(0, 3).join(",")}${total > 3 ? ` +${total - 3}` : ""}`,
      ...(off.length ? { off, offVerify: "expectedCondition part-value-matches-spec-token" } : {}),
      next: `get_component_spec{component:"${comp}"} → specification.measure`,
    },
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
 * o envelope ainda passa de `maxChars`, encolhe primeiro o que se repete ou tem outra fonte — estado
 * (fica o essencial; o inteiro está no ledger: get_finding_details(scanId)), cobertura (ficam as
 * contagens), investigate, dicas/chaves de família — e, só como último recurso, os textos de
 * `checksRun.limits` e a `coverageNote` (ficam os códigos), porque são a orientação de honestidade
 * (o que nenhum check mede). Só então declara `exceedsMaxChars`. 3.4.2 (D-154): essa ordem; antes os
 * textos de limits saíam primeiro. 3.5.0 (D-155): o investigate encolhe para nomes + next (nunca some) e, por último, `checksRun.pageLevel` → códigos.
 */
/**
 * 3.5.0 (revisão do coordenador): os blocos novos encolhem ANTES de tudo — os achados do scan têm prioridade
 * na 1ª página (todo spec que o braço com ganhou veio deles). investigate → nomes + contagens; pageLevel →
 * códigos + contagem + next (inteiro no ledger).
 */
/**
 * 3.7.1 (teste à mão da 3.7.0: no teto padrão a chegada de A e de B só trazia nomes — nem cláusula nem investigateNote): o
 * aviso dobra-se no `next`, que nunca sai — `next.hint` (≤ 100 caracteres) com até 3 componentes cujas cláusulas não
 * couberam. Só quando alguma cláusula foi tirada; sai por último (depois dele, só nomes + next).
 */
export const NEXT_HINT_MAX = 100;
export function nextHintFor(components: string[]): string | null {
  if (!components.length) return null;
  const tail = " não mostradas: este next por componente, ou maxChars maior";
  for (let k = Math.min(3, components.length); k >= 1; k--) {
    const more = components.length - k;
    const hint = `cláusulas de ${components.slice(0, k).join(", ")}${more > 0 ? ` +${more}` : ""}${tail}`;
    if (hint.length <= NEXT_HINT_MAX) return hint;
  }
  return null;
}

function investigateNames(r: Record<string, unknown>): Record<string, unknown> | null {
  const inv = r.investigate as ({ items?: Array<{ component: string; requiredUnmeasured?: number }>; more?: { components: string[] } | null; next?: Record<string, unknown>; components?: string[] } & { [COMPACT_CLAUSES]?: CompactClauses }) | undefined;
  if (!inv) return null;
  // 3.7.1: o next leva a dica das cláusulas que não couberam (só quando havia cláusula a mostrar).
  const compact = inv[COMPACT_CLAUSES];
  const hint = compact ? nextHintFor(Object.keys(compact.byComponent)) : null;
  const next = inv.next && hint ? { ...inv.next, hint } : inv.next;
  // 3.7.0: da forma compacta (nomes + cláusulas, ou o aviso) para só os nomes.
  if (inv.components) return (inv as { clauses?: unknown; investigateNote?: unknown }).clauses || (inv as { investigateNote?: unknown }).investigateNote ? { ...r, investigate: { components: inv.components, ...pageOf(inv), ...newOf(inv as never), next } } : null;
  const names = [
    ...(inv.items ?? []).map((i) => (i.requiredUnmeasured !== undefined ? `${i.component}:${i.requiredUnmeasured}` : i.component)),
    ...(inv.more?.components ?? []),
  ];
  return { ...r, investigate: { components: names, ...pageOf(inv), ...newOf(inv as never), next } };
}

/** 3.7.1: o último degrau do investigate — o next sem a dica (fica o passo). */
function investigateHintOut(r: Record<string, unknown>): Record<string, unknown> | null {
  const inv = r.investigate as { components?: string[]; next?: Record<string, unknown> } | undefined;
  if (!inv?.next || !("hint" in inv.next)) return null;
  const { hint: _h, ...next } = inv.next;
  return { ...r, investigate: { ...inv, next } };
}

/** 3.7.0: as cláusulas na forma compacta, por componente (ordem do investigate), e quantas há no total. */
type CompactClauses = { byComponent: Record<string, string[]>; total: number };
const COMPACT_CLAUSES = Symbol("investigate.compactClauses");

/**
 * 3.7.0 (revisão da reexecução, lacuna A: no teto padrão o investigate só chegava como nomes; 22 de 28 scans): a forma
 * compacta — os nomes + até `perComponent` cláusulas por componente como `id · procedimento curto` (a letra fica na lista de
 * verificação) + `clausesMore`. Custa ~1/3 da forma de itens.
 */
function investigateCompact(perComponent: number, maxComponents = Infinity) {
  return (r: Record<string, unknown>): Record<string, unknown> | null => {
    const inv = r.investigate as ({ items?: Array<{ component: string; requiredUnmeasured?: number }>; more?: { components: string[] } | null; next?: unknown; components?: string[]; clauses?: Record<string, string[]> } & { [COMPACT_CLAUSES]?: CompactClauses }) | undefined;
    const compact = inv?.[COMPACT_CLAUSES];
    if (!inv || !compact) return null;
    // só encolhe: cada degrau tem no máximo as cláusulas do anterior (por componente e em número de componentes)
    const shownNow = inv.clauses ? Object.values(inv.clauses) : null;
    if (inv.components && !shownNow) return null;
    if (shownNow && Math.max(...shownNow.map((c) => c.length)) <= perComponent && shownNow.length <= maxComponents) return null;
    const names = inv.components ?? [
      ...(inv.items ?? []).map((i) => (i.requiredUnmeasured !== undefined ? `${i.component}:${i.requiredUnmeasured}` : i.component)),
      ...(inv.more?.components ?? []),
    ];
    const byComponent = Object.fromEntries(Object.entries(compact.byComponent).slice(0, maxComponents).map(([c, list]) => [c, list.slice(0, perComponent)]));
    const shown = Object.values(byComponent).reduce((n, l) => n + l.length, 0);
    return {
      ...r,
      investigate: {
        [COMPACT_CLAUSES]: compact,
        components: names,
        ...pageOf(inv),
        ...newOf(inv as never),
        clauses: byComponent,
        ...(compact.total > shown ? { clausesMore: compact.total - shown } : {}),
        clausesNote: "clauses: obrigações que nenhum check julgou, `id · o que medir e o valor`; meça e dê estado. Letra e demais: next.",
        next: inv.next,
      },
    };
  };
}

/**
 * 3.7.0 (decisão do coordenador, 02/11): famílias primeiro — quando nem uma cláusula cabe, o degrau seguinte é só os nomes
 * + uma linha (`investigateNote`, ≤ 160 caracteres) com os componentes cujas cláusulas mensuráveis não couberam e a chamada
 * que as traz. Sai por último antes dos nomes sozinhos (o `next` fica sempre).
 */
export const INVESTIGATE_NOTE_MAX = 160;
export function investigateNoteFor(components: string[]): string | null {
  if (!components.length) return null;
  const head = "Cláusulas mensuráveis não couberam: ";
  const tail = " — get_component_spec{component, view:\"checklist\"} ou scan_page com maxChars maior.";
  const shown: string[] = [];
  for (const c of components) {
    const rest = components.length - shown.length - 1;
    const candidate = `${head}${[...shown, c].join(", ")}${rest > 0 ? ` +${rest}` : ""}${tail}`;
    if (candidate.length > INVESTIGATE_NOTE_MAX) break;
    shown.push(c);
  }
  if (!shown.length) return null;
  const more = components.length - shown.length;
  return `${head}${shown.join(", ")}${more > 0 ? ` +${more}` : ""}${tail}`;
}

function investigateNudge(r: Record<string, unknown>): Record<string, unknown> | null {
  const inv = r.investigate as ({ items?: Array<{ component: string; requiredUnmeasured?: number }>; more?: { components: string[] } | null; next?: unknown; components?: string[]; clauses?: unknown; investigateNote?: string } & { [COMPACT_CLAUSES]?: CompactClauses }) | undefined;
  const compact = inv?.[COMPACT_CLAUSES];
  if (!inv || !compact || inv.investigateNote) return null;
  const note = investigateNoteFor(Object.keys(compact.byComponent));
  if (!note) return null;
  const names = inv.components ?? [
    ...(inv.items ?? []).map((i) => (i.requiredUnmeasured !== undefined ? `${i.component}:${i.requiredUnmeasured}` : i.component)),
    ...(inv.more?.components ?? []),
  ];
  return { ...r, investigate: { [COMPACT_CLAUSES]: compact, components: names, ...pageOf(inv), ...newOf(inv as never), investigateNote: note, next: inv.next } };
}

type InvestigateItem = { component: string; clauses?: Array<{ citeAs: string; text?: string; how: string }>; clausesMore?: number };

/** 3.7.0: as cláusulas empurradas no investigate → só id + procedimento (a letra fica na lista de verificação). */
function investigateClausesShort(r: Record<string, unknown>): Record<string, unknown> | null {
  const inv = r.investigate as { items?: InvestigateItem[] } | undefined;
  if (!inv?.items?.some((i) => i.clauses?.some((c) => c.text !== undefined))) return null;
  return { ...r, investigate: { ...inv, items: inv.items.map((i) => (i.clauses ? { ...i, clauses: i.clauses.map(({ citeAs, how }) => ({ citeAs, how })) } : i)) } };
}

/** 3.6.1 (revisão H1): pendências → forma curta (`P-NN:código⇒emag-x.y`); a cláusula inteira em full. */
function pageLevelShortStep(r: Record<string, unknown>): Record<string, unknown> | null {
  const cr = r.checksRun as { pageLevel?: { notMeasured?: Array<NotJudgedItem | string>; count?: number } } | undefined;
  if (!cr?.pageLevel?.notMeasured?.length || cr.pageLevel.count !== undefined || cr.pageLevel.notMeasured.every((i) => typeof i === "string")) return null;
  return { ...r, checksRun: { ...cr, pageLevel: pageLevelShort(cr.pageLevel as never) } };
}

/** 3.6.1: sessionPending → ids:código (as normas e os textos estão nos scans que as abriram). */
function sessionPendingStep(r: Record<string, unknown>): Record<string, unknown> | null {
  const sp = r.sessionPending as { items?: Array<{ code: string; ids: string[] }>; count?: number; ids?: unknown; lowSignal?: number } | undefined;
  if (!sp || sp.ids || !sp.items) return null;
  return { ...r, sessionPending: sessionPendingCodes(sp) };
}

/** 3.6.5 (revisão): as cláusulas lidas no checklist (sub-bloco de sessionPending) → contagem + componentes. */
function sessionPendingChecklistStep(r: Record<string, unknown>): Record<string, unknown> | null {
  const sp = r.sessionPending as { checklist?: unknown } | undefined;
  if (!sp?.checklist) return null;
  const next = sessionPendingChecklistCount(sp);
  return next ? { ...r, sessionPending: next } : null;
}

/** 3.6.3: pendências curtas → mínimas (uma norma, um lugar com o valor medido, a tarefa em poucas palavras). */
function pageLevelMinimalStep(r: Record<string, unknown>): Record<string, unknown> | null {
  const cr = r.checksRun as { pageLevel?: { notMeasured?: unknown[]; count?: number } } | undefined;
  if (!cr?.pageLevel || cr.pageLevel.count !== undefined) return null;
  const next = pageLevelMinimal(cr.pageLevel);
  return next ? { ...r, checksRun: { ...cr, pageLevel: next } } : null;
}

/** 3.6.3 (revisão MEDIUM 2): pendências mínimas → `código⇒norma`. */
function pageLevelNormStep(r: Record<string, unknown>): Record<string, unknown> | null {
  const cr = r.checksRun as { pageLevel?: { notMeasured?: unknown[]; count?: number } } | undefined;
  if (!cr?.pageLevel || cr.pageLevel.count !== undefined) return null;
  const next = pageLevelNorm(cr.pageLevel);
  return next ? { ...r, checksRun: { ...cr, pageLevel: next } } : null;
}

/** 3.6.3 (revisão MEDIUM 2): pendências em códigos → só os ids (`P-NN`), contagem e continuação. */
export function pageLevelIdsStep(r: Record<string, unknown>): Record<string, unknown> | null {
  const cr = r.checksRun as { pageLevel?: { notMeasured?: unknown[]; count?: number; next?: unknown; full?: unknown; ids?: unknown } } | undefined;
  const pl = cr?.pageLevel as { notMeasured?: unknown[]; count?: number; next?: unknown; full?: unknown; ids?: unknown; lowSignal?: number; conditions?: Record<string, string> } | undefined;
  // Sem pendência com sinal nesta página (lista vazia, ou só as sem sinal, contadas): não há id a guardar — fica a contagem.
  if (pl && Array.isArray(pl.notMeasured) && pl.notMeasured.every((i) => typeof i === "object" && (i as { signal?: string }).signal === "low")) {
    return { ...r, checksRun: { ...cr, pageLevel: { count: pl.notMeasured.length + (pl.lowSignal ?? 0), next: pl.next ?? pl.full } } };
  }
  if (!pl?.notMeasured?.length || pl.ids || !pl.notMeasured.every((i) => typeof i === "string")) return null;
  // 3.7.5 (item 6): a linha de leitura agrega ids (`L-01..L-04` ou `L-01,L-04`; revisão M4: espaço próprio) — um rótulo só.
  // 3.7.9 (D1): estado recolhido e campo de arquivo ficam com o código e o 1º seletor (`P-18:state-unscanned@#gatilho`).
  const ids = (pl.notMeasured as string[]).map(idLabelOf).filter((i) => /^[PO]-\d+$|^L-\d+(?:(?:\.\.|,)L-\d+)*$|^P-\d+(?:(?:\.\.|,)P-\d+)+$|^P-\d+:(?:state-unscanned|upload-paths)(?:@|$)/.test(i));
  if (!ids.length) return null;
  // estados sem seletor curto e consecutivos numa entrada só (`P-07,P-08:state-unscanned`)
  for (let k = ids.length - 1; k > 0; k--) {
    const [a, b] = [ids[k - 1], ids[k]];
    const code = (x: string) => (x.includes("@") ? null : x.split(":")[1] ?? null);
    if (code(a) && code(a) === code(b)) ids.splice(k - 1, 2, `${a.split(":")[0]},${b}`);
  }
  const located = ids.some((i) => /:(?:state-unscanned|upload-paths)/.test(i));
  // revisão 3.7.8 (MED 6): a condição exata do verify por id de O-NN fica também aqui.
  return { ...r, checksRun: { ...cr, pageLevel: { ids, ...(located ? { idsNote: STATE_IDS_NOTE } : { count: pl.count ?? pl.notMeasured.length }), ...(pl.conditions ? { conditions: pl.conditions } : {}), next: pl.next ?? pl.full } } };
}

function pageLevelCompact(r: Record<string, unknown>, scanId: string): Record<string, unknown> | null {
  const cr = r.checksRun as { pageLevel?: { measured?: string[]; notMeasured?: Array<NotJudgedItem | string>; count?: number } } | undefined;
  if (!cr?.pageLevel?.notMeasured?.length || cr.pageLevel.count !== undefined) return null;
  return { ...r, checksRun: { ...cr, pageLevel: pageLevelCodes(cr.pageLevel, scanId) } };
}

export function enforceCeiling(response: Record<string, unknown>, maxChars: number, scanId: string): Record<string, unknown> {
  if (textSize(response) <= maxChars) return response;
  let out = { ...response };
  const squeezed: string[] = [];
  const steps: Array<[string, (r: Record<string, unknown>) => Record<string, unknown> | null]> = [
    // 3.5.0: os blocos novos cedem primeiro. 3.7.0: as cláusulas empurradas descem em degraus antes dos nomes.
    ["investigate.clauses → id + how", investigateClausesShort],
    ["specification → curta", specificationShort],
    ["investigate.page → primeira cláusula", investigatePageOne],
    ["investigate.page → checklist", investigatePagePointer],
    ["investigate → nomes + 2 cláusulas", investigateCompact(2)],
    ["investigate → nomes + 1 cláusula", investigateCompact(1)],
    ["investigate → nomes + aviso", investigateNudge],
    ["investigate → nomes + next", investigateNames],
    ["specification → mínima", specificationMinimal],
    ["investigate → next sem dica", investigateHintOut],
    // 3.6.1 (revisão H1): as pendências cedem para a forma curta (a cláusula fica em full).
    ["sessionPending → ids", sessionPendingStep],
    ["sessionPending.checklist → contagem", sessionPendingChecklistStep],
    [
      "state → essencial (inteiro no ledger)",
      (r) => {
        const st = r.state as { observed?: Record<string, unknown>; reached?: unknown; settle?: { settled?: unknown }; replay?: { status?: unknown }; recipe?: { viewport?: unknown; viewportSource?: unknown } } | undefined;
        if (!st) return null;
        const o = st.observed ?? {};
        // 3.4.3 (D-154): a janela da receita e a fonte dela ficam — é a atestação que o harness confere.
        const recipe = st.recipe?.viewportSource !== undefined ? { recipe: { viewport: st.recipe.viewport, viewportSource: st.recipe.viewportSource } } : {};
        return {
          ...r,
          state: {
            reached: st.reached,
            replay: st.replay?.status,
            settled: st.settle?.settled,
            ...recipe,
            observed: { url: o.url, path: o.path, viewport: o.viewport, ...(o.httpStatus ? { httpStatus: o.httpStatus } : {}) },
            ...(scanId ? { full: { tool: "get_finding_details", arguments: { scanId } } } : {}),
          },
        };
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
    ["familyHint/chaves → removidos", (r) => (({ familyHint: _h, familyKey: _k, evidenceSignatureKey: _e, detailHint: _d, ...rest }) => rest)(r)],
    // 3.5.0: contagens de deduplicação têm outra fonte (o ledger) e saem antes dos textos de honestidade.
    ["deduplication → removido (no ledger)", (r) => (r.deduplication ? (({ deduplication: _d, ...rest }) => rest)(r) : null)],
    // 3.6.3: as pendências cedem para a forma curta (com localizador, medida e tarefa) depois de estado e cobertura.
    ["checksRun.pageLevel → curto", pageLevelShortStep],
    ["checksRun.pageLevel → mínimo", pageLevelMinimalStep],
    ["checksRun.pageLevel → código⇒norma", pageLevelNormStep],
    [
      "checksRun → códigos",
      (r) => {
        const cr = r.checksRun as { limits?: Array<{ code: string }>; coverageNote?: string; executed?: unknown } | undefined;
        if (!cr) return null;
        const { coverageNote: _n, ...rest } = cr;
        return { ...r, checksRun: { ...rest, limits: (cr.limits ?? []).map((l) => l.code) } };
      },
    ],
    ["revisited → contagem", (r) => {
      const rv = r.revisited as { items?: unknown[]; count?: number } | undefined;
      if (!rv?.items) return null;
      return { ...r, revisited: { count: rv.items.length, next: { tool: "get_finding_details", arguments: { scanId } } } };
    }],
    // 3.6.1: a separação por rota/estado e as pendências de outras rotas cedem por último, sem sumir.
    ["units → códigos", (r) => {
      const u = r.units as { routes?: number; states?: number; note?: string } | undefined;
      if (!u?.note) return null;
      return { ...r, units: { routes: u.routes, states: u.states, rule: "um achado por rota/estado" } };
    }],
    ["sessionPending → contagem", (r) => {
      const sp = r.sessionPending as { count?: number; ids?: string[]; items?: unknown[] } | undefined;
      if (!sp || (sp.ids === undefined && sp.items === undefined)) return null;
      return { ...r, sessionPending: { count: sp.count ?? sp.ids?.length ?? 0 } };
    }],
    ["checksRun.pageLevel → códigos (inteiro no ledger)", (r) => pageLevelCompact(r, scanId)],
    // 3.5.0 (D-155): as pendências (notJudged) são a outra metade da honestidade do scan — encolhem só
    // depois de tudo, e só para códigos, assunto e contagem (inteiras no ledger).
    // 3.5.0: último recurso — as pendências ficam só como contagem + next (nunca somem).
    [
      "checksRun.pageLevel → contagem + next",
      (r) => {
        const cr = r.checksRun as { pageLevel?: { count?: number; notMeasured?: unknown[]; next?: unknown; full?: unknown } } | undefined;
        const pl = cr?.pageLevel;
        if (!pl || (pl.notMeasured === undefined && pl.count !== undefined)) return null;
        return { ...r, checksRun: { ...cr, pageLevel: { count: pl.count ?? pl.notMeasured?.length ?? 0, next: pl.next ?? pl.full } } };
      },
    ],
    // 3.6.1: último recurso — as observações ficam na contagem + continuação (a página inteira pela view).
    [
      "observations → contagem",
      (r) => {
        const o = r.observations as { total?: number; note?: string; next?: unknown; byKind?: unknown } | undefined;
        if (!o || (o.note === undefined && o.byKind === undefined)) return null;
        return { ...r, observations: { total: o.total, ...(o.next ? { next: o.next } : {}) } };
      },
    ],
  ];
  for (const [label, transform] of steps) {
    // 3.5.0: a lista `squeezed`, que vai junto, também conta (antes ela podia ser o que estourava o teto).
    if (textSize({ ...out, squeezed }) <= maxChars) break;
    const next = transform(out);
    if (!next) continue;
    out = next;
    // 3.6.1: etapas da mesma parte se sucedem (pageLevel curto → códigos → contagem): fica só a última.
    const part = label.split(" → ")[0];
    // 3.7.0: a etapa de uma parte também apaga as das subpartes (investigate → nomes apaga investigate.clauses).
    for (let i = squeezed.length - 1; i >= 0; i--) { const p = squeezed[i].split(" → ")[0]; if (p === part || p.startsWith(`${part}.`)) squeezed.splice(i, 1); }
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

type Diff = {
  added: string[];
  removed: string[];
  unchanged: number;
  evidenceChanged: Array<{ previousId: string; currentId: string }>;
  /** 3.6.1 (item 4): achados do scan anterior que este scan não mediu de novo (check fora de `checks` ou fora dos seletores). */
  notRemeasured?: Array<{ id: string; reason: "check-not-run" | "scope" ; check: string }>;
};

/** 3.6.1: a família de check que produz um achado do scan_page (axe, tokens, page; o resto é do check structure). */
export function checkFamilyOf(f: Finding): "axe" | "tokens" | "page" | "structure" {
  if (f.rule.source === "axe-core") return "axe";
  const checker = f.rule.checker ?? (f.rule.source.startsWith("govbr-ds-") ? f.rule.id : "");
  if (checker.startsWith("ds-token-")) return "tokens";
  if (checker.startsWith("ds-page-")) return "page";
  return "structure";
}

/**
 * 3.6.1 (D-155, item 4): "removido" só é o que foi medido de novo e não apareceu. O achado anterior cujo check não
 * rodou neste scan, ou (com seletores diferentes) que pode estar fora do escopo, vai para `notRemeasured`.
 */
export function refineDiff<T extends Diff>(diff: T, previous: Finding[], currentChecks: string[], scopeNarrowed: boolean): T & { notRemeasured: NonNullable<Diff["notRemeasured"]> } {
  const byId = new Map(previous.map((f) => [f.id, f]));
  const removed: string[] = [];
  const notRemeasured: NonNullable<Diff["notRemeasured"]> = [];
  for (const id of diff.removed) {
    const f = byId.get(id);
    const check = f ? checkFamilyOf(f) : "structure";
    if (!currentChecks.includes(check)) notRemeasured.push({ id, reason: "check-not-run", check });
    else if (scopeNarrowed) notRemeasured.push({ id, reason: "scope", check });
    else removed.push(id);
  }
  return { ...diff, removed, notRemeasured };
}

/**
 * Revisão da 3.0.0: o diff de findings entre dois scans sai em contagens + poucos ids no cabeçalho
 * (dentro do orçamento) e o resto por get_finding_details{scanId, view:"diff", cursor}.
 */
export function diffSummary(diff: Diff, scanId: string) {
  const sample = 10;
  const notRemeasured = diff.notRemeasured ?? [];
  const truncated = diff.added.length > sample || diff.removed.length > sample || diff.evidenceChanged.length > sample || notRemeasured.length > sample;
  return {
    added: diff.added.length,
    removed: diff.removed.length,
    unchanged: diff.unchanged,
    evidenceChanged: diff.evidenceChanged.length,
    addedIds: diff.added.slice(0, sample),
    removedIds: diff.removed.slice(0, sample),
    ...(notRemeasured.length
      ? {
          notRemeasured: notRemeasured.length,
          notRemeasuredIds: notRemeasured.slice(0, sample).map((n) => n.id),
          notRemeasuredNote: `Não medidos de novo (${[...new Set(notRemeasured.map((n) => (n.reason === "scope" ? "fora dos seletores" : `${n.check} não rodou`)))].join("; ")}): não sumiram.`,
        }
      : {}),
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
    ...(diff.notRemeasured ?? []).map((n) => ({ change: "not-remeasured", id: n.id, reason: n.reason, check: n.check })),
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
  options: { firstScanPage?: boolean; clauseCandidates?: ReserveCandidate[]; contextDelivered?: ContextDelivered; clauseDelivered?: ClauseDelivered } = {},
) {
  // 3.6.2: a 1ª página de um scan_page (1º scan ou posterior) monta por prioridade — famílias antes de tudo — e nunca
  // passa do teto pedido. Continuações seguem o caminho de sempre (≥ 1 item para o cursor andar).
  if (options.firstScanPage && options.clauseCandidates) return assembleReservedScan(head, observations, scanId, maxChars, page, options.clauseCandidates, options.contextDelivered, options.clauseDelivered);
  if (options.firstScanPage) return assembleFirstScanPage(head, observations, scanId, maxChars, page);
  const response = assembleScanPage(head, observations, scanId, maxChars, page, options);
  const ceiled = enforceCeiling(response, maxChars, scanId);
  const sized = withResponseSize(ceiled);
  // O campo de tamanho não pode ser o que estoura o teto.
  if (textSize(sized) <= maxChars || textSize(ceiled) > maxChars) return sized;
  // Sem espaço para o campo certo, ele sai (nunca o tamanho só da lista, que mentia sobre a resposta).
  const { responseCharsEstimate: _r, ...rest } = ceiled;
  return rest;
}

/**
 * A5 + 3.7.4 (D1, teste à mão da 3.7.3): FATOS PRIMEIRO. A 1ª página de fatos é montada como sem reserva; a reserva
 * ocupa o que sobra, até a sua quota. Se não sobra espaço, ela pode encolher o cabeçalho que tem continuação, mas nunca
 * tira família/achado da página nem encolhe as pendências desta página ou os acréscimos das famílias. Com todos os
 * fatos na página e nenhuma cláusula inteira cabendo, a reserva sai declarada como adiada (deferred-by-facts). Só quando
 * os fatos já não cabem inteiros o piso (uma cláusula inteira, contexto por referência) pode custar família — e, se nem
 * ele com uma família couber, a recusa da A5 (lote preservado, retry demonstrado).
 */
const PROTECTED_PARTS = (labels: unknown) =>
  Array.isArray(labels) ? new Set((labels as string[]).filter((l) => l.startsWith("extras") || l.startsWith("families") || l.startsWith("findings"))) : null;
/**
 * A forma das pendências desta página: 0 inteira, 1 linha com lugar e tarefa (curta/mínima), 3 só código⇒norma, 4 códigos,
 * ids ou contagem. A reserva pode levar as pendências até a linha com tarefa (o item inteiro fica no ledger), nunca abaixo.
 */
function pageLevelRank(r: Record<string, unknown>): number {
  const pl = (r.checksRun as { pageLevel?: { notMeasured?: unknown[]; count?: unknown; ids?: unknown } } | undefined)?.pageLevel;
  if (!pl) return 0;
  if (pl.count !== undefined || pl.ids !== undefined || !Array.isArray(pl.notMeasured)) return 4;
  if (pl.notMeasured.every((i) => typeof i === "object")) return 0;
  return pl.notMeasured.every((i) => typeof i !== "string" || i.includes(" · ")) ? 1 : 3;
}

/**
 * 3.7.5 (opção 1): o estado das cláusulas (`clauses`) vai logo depois do `complete` dos fatos, para não ser lido como parte
 * dele; sem `complete` na página, antes da reserva.
 */
function withClausesSummary(facts: Record<string, unknown>, summary: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!summary) return { ...facts };
  const out: Record<string, unknown> = {};
  let placed = false;
  for (const [k, v] of Object.entries(facts)) {
    if (k === "clauses") continue;
    out[k] = v;
    if (k === "complete") { out.clauses = summary; placed = true; }
  }
  if (!placed) out.clauses = summary;
  return out;
}

function assembleReservedScan(
  head: Record<string, unknown>, observations: Observation[] | null, scanId: string,
  maxChars: number, page: (budget: number) => Record<string, unknown>, allCandidates: ReserveCandidate[],
  delivered?: ContextDelivered, clauseDelivered?: ClauseDelivered,
): Record<string, unknown> {
  // 3.7.5 (R2): cláusula já entregue inteira nesta sessão não volta; o prefixo avança sobre as que faltam.
  const { fresh: candidates, earlier } = splitDelivered(allCandidates, clauseDelivered);
  const summaryOf = (block: Record<string, unknown>) => clausesSummary(block, candidates, earlier);
  const allItems = listedItems(page(1_000_000));
  /**
   * 3.7.5 (R1): com a página cheia de fatos (reserva adiada), o estado das cláusulas desce de forma — sem a nota, depois
   * a contagem com o next apontando o investigate.next da mesma resposta (a lista de verificação do 1º componente), por
   * fim sem a contagem — para que até a forma mínima da reserva leve o caminho sem tirar fato.
   */
  const summaryForms = (facts: Record<string, unknown>, block: Record<string, unknown>, tight: boolean) => {
    const full = summaryOf(block);
    if (!tight || !full || full.complete) return [full];
    // Revisão M2: o next é sempre a chamada (objeto), como em toda resposta; a contagem fica enquanto couber.
    const { note: _n, ...plain } = full;
    return [full, plain, { complete: false, deferred: full.deferred, next: full.next }, { complete: false, next: full.next }];
  };
  const attach = (facts: Record<string, unknown>, block: Record<string, unknown>, budget: number, tight = false) => {
    for (const summary of summaryForms(facts, block, tight)) {
      const out: Record<string, unknown> = { ...withClausesSummary(facts, summary), clauseReserve: block };
      if (typeof out.responseCharsEstimate === "number") {
        for (let i = 0; i < 4; i++) out.responseCharsEstimate = textSize(out);
      }
      if (textSize(out) <= budget) return out;
    }
    return null;
  };
  /** O bloco com o estado das cláusulas na forma compacta ({complete, deferred, next}): o piso do espaço que ele toma. */
  const tightSize = (block: Record<string, unknown>) => {
    const summary = summaryOf(block);
    if (!summary || summary.complete) return blockSize(block);
    return textSize({ clauseReserve: block, clauses: { complete: false, next: summary.next } }) - 1;
  };
  /** O bloco e o estado das cláusulas que o acompanha no topo (3.7.5): o espaço que a reserva toma da página. */
  const blockSize = (block: Record<string, unknown>) => {
    const summary = summaryOf(block);
    return textSize({ clauseReserve: block, ...(summary ? { clauses: summary } : {}) }) - 1;
  };
  const stripped = (b: number) => {
    let p = familyAlsoInOut(familyNotesOut(page(b)));
    for (const extra of EXTRAS_BY_FAMILY) p = familyExtraFrom(p, extra, 0);
    const { familyHint: _h, familyKey: _k, evidenceSignatureKey: _e, ...rest } = p;
    return rest;
  };
  /** Limite superior barato: a lista de fatos, sem acréscimos nem cabeçalho, no maior orçamento que cabe no teto. */
  const factsCouldFit = (budget: number) => {
    let lo = 200;
    let hi = 2 * budget;
    if (listedItems(page(hi)) < allItems) return false;
    if (textSize(stripped(hi)) <= budget) return true;
    for (let i = 0; i < 12 && hi - lo > 50; i++) {
      const mid = Math.floor((lo + hi) / 2);
      if (textSize(stripped(mid)) <= budget) lo = mid; else hi = mid;
    }
    return listedItems(page(lo)) >= allItems;
  };
  type Outcome = { ok: Record<string, unknown> } | { refuse: "literal-scope-unavailable" | "indivisible-content-and-floor-exceed-budget" };
  /**
   * Custo: cada montagem da página de fatos refaz a escada; com fatos que não cabem inteiros a escada já está no fim (o
   * cabeçalho no piso), então só a forma que cabe no que sobrou e o piso são tentados (revisão de custo, página de 635
   * famílias: 7 montagens custavam ~65 s).
   */
  const attempt = (budget: number): Outcome => {
    const built = new Map<number, Record<string, unknown>>();
    const factsWithin = (room: number) => {
      let f = built.get(room);
      if (!f) built.set(room, (f = assembleFirstScanPage(head, observations, scanId, room, page)));
      return f;
    };
    const full = selectReserve(candidates, budget, { delivered, earlier });
    if (full.unavailable && !full.block.clauses.length) return { refuse: "literal-scope-unavailable" };
    const floor = selectReserve(candidates, budget, { delivered, minimal: true, earlier }).block;
    // 3.7.5 (R2): com cláusulas destas candidatas já entregues na sessão, o piso de fatos que não cabem vai por referência.
    const refFloor = earlier ? referenceFloor(budget, earlier) : undefined;
    const pathFloor: Record<string, unknown> | undefined = refFloor ?? (floor.clauses.length ? floor : undefined);
    // Nem a lista de fatos sozinha, sem cabeçalho, cabe inteira no teto: os fatos não cabem — a página leva o piso (uma
    // cláusula inteira) e os fatos que couberem com ele, numa montagem só (a escada de uma página que não cabe é cara).
    // Revisão MED 2: "não cabem" decidido pela lista de fatos já sem os acréscimos e sem as chaves constantes (o que a
    // escada retira no fim), no maior orçamento de famílias cuja lista sozinha cabe no teto — sem cabeçalho nenhum.
    if (pathFloor && !factsCouldFit(budget)) {
      // Revisão (medida B1): com fatos que não cabem, o estado das cláusulas entra na forma compacta — a página de fatos é
      // montada como na 3.7.4 com o piso, e só o que sobrar leva nota e byComponent.
      const room = budget - tightSize(pathFloor) - 24;
      const f = room >= 300 ? factsWithin(room) : null;
      const out = f && f.kind !== "error" && (allItems === 0 || listedItems(f) >= 1) ? attach(f, pathFloor, budget, true) : null;
      return out ? { ok: out } : { refuse: "indivisible-content-and-floor-exceed-budget" };
    }
    const facts = factsWithin(budget);
    if (facts.kind === "error") return { refuse: "indivisible-content-and-floor-exceed-budget" };
    const listed = listedItems(facts);
    const complete = listed >= allItems;
    const guarded = PROTECTED_PARTS(facts.compacted) ?? new Set<string>();
    const pendingFloor = Math.max(pageLevelRank(facts), 1);
    const keepsFacts = (r: Record<string, unknown>) => {
      if (r.kind === "error" || listedItems(r) < listed || pageLevelRank(r) > pendingFloor) return false;
      const p = PROTECTED_PARTS(r.compacted);
      return p !== null ? [...p].every((l) => guarded.has(l)) : r.compacted === undefined;
    };
    const withReserve = (block: Record<string, unknown>, mustKeep: boolean, tight = false) => {
      const room = budget - (tight ? tightSize(block) : blockSize(block)) - 24;
      if (room < 300) return null;
      const f = factsWithin(room);
      if (mustKeep ? !keepsFacts(f) : f.kind === "error" || (allItems > 0 && listedItems(f) < 1)) return null;
      return attach(f, block, budget, tight);
    };
    // A reserva até a quota; se não cabe no que sobrou, encolhe o cabeçalho com continuação (investigate, cobertura,
    // estado, observações; pendências até a linha com tarefa) — nunca tira fato nem os acréscimos das famílias. Formas
    // da maior à menor; a 1ª que cabe fica. A que cabe no espaço que sobrou não mexe na página de fatos.
    const leftover = budget - textSize(facts) - 24;
    // A escada já chegou às pendências desta página ou aos acréscimos das famílias: o cabeçalho com continuação está no
    // piso e a reserva não tem o que encolher sem tirar o que é protegido — nenhuma remontagem (custo).
    const headerAtFloor = facts.compacted !== undefined && (!Array.isArray(facts.compacted) ||
      (facts.compacted as string[]).some((l) => l === "pageLevel" || l.startsWith("extras")));
    if (!candidates.length) {
      const out = attach(facts, full.block, budget) ?? withReserve(full.block, true);
      if (out) return { ok: out };
    }
    const variants = [full.block, floor];
    // blockSize = textSize do bloco + 15 (a chave): o teto do selectReserve é o do bloco sozinho.
    // 3.7.5: o estado das cláusulas no topo também ocupa o que sobrou (a forma com o maior estado, para a conta não faltar).
    const summaryChars = textSize({ clauses: summaryOf({ clauses: [] }) ?? {} });
    for (const cap of [Math.floor(blockSize(full.block) * .5), leftover - 16 - summaryChars]) {
      const v = selectReserve(candidates, budget, { delivered, maxBlockChars: cap, earlier }).block;
      if (v.clauses.length) variants.push(v);
    }
    let floorResult: Record<string, unknown> | null | undefined;
    const floorFits = () => (floorResult === undefined ? (floorResult = withReserve(floor, true)) : floorResult) !== null;
    const seen = new Set<number>();
    for (const v of variants.filter((x) => x.clauses.length).sort((x, y) => blockSize(y) - blockSize(x))) {
      const size = blockSize(v);
      if (seen.has(size)) continue;
      seen.add(size);
      if (size <= leftover) {
        const out = attach(facts, v, budget);
        if (out) return { ok: out };
      }
      // Fatos que não cabem inteiros: o cabeçalho já está no piso da escada — só o piso tenta encolher mais. Com fatos
      // inteiros, só a forma da quota e o piso remontam a página (revisão MED 6: cada remontagem refaz a escada).
      if (headerAtFloor || (!complete && v !== floor)) continue;
      // Se nem o piso cabe encolhendo o cabeçalho, uma forma maior também não: o piso é tentado antes.
      if (v !== floor && floor.clauses.length && !floorFits()) continue;
      const out = withReserve(v, true);
      if (out) return { ok: out };
    }
    // 3) todos os fatos na página e nenhuma cláusula inteira cabe sem tirá-los: reserva adiada, declarada.
    if (complete) {
      for (const tiny of [false, true]) {
        const block = deferredReserve(candidates, budget, tiny, earlier);
        const out = attach(facts, block, budget, true) ?? (tiny && !headerAtFloor ? withReserve(block, true) : null);
        if (out) return { ok: out };
      }
      // O aviso mínimo pode encolher qualquer parte do cabeçalho, nunca tirar fato; sem nem isso, só os fatos.
      // 3.7.5 (R1): até a forma mínima leva o caminho (o next de `clauses`, que o attach põe no topo).
      for (const tiny of [deferredReserve(candidates, budget, true, earlier), { status: "deferred-by-facts" }]) {
        const direct = attach(facts, tiny, budget, true);
        if (direct) return { ok: direct };
        // 3.7.5 (R1): a forma mínima do estado das cláusulas (o attach desce até ela) conta no espaço que a página cede; a
        // escada do cabeçalho não é monótona no teto, então a folga de montagem desce de 24 a -24 (o attach confere o teto).
        const least = textSize({ clauseReserve: tiny, clauses: { complete: false, next: summaryOf(tiny)?.next } }) - 1;
        for (const slack of [24, 12, 0, -12, -24]) {
          const f = factsWithin(budget - least - slack);
          const out = f.kind !== "error" && listedItems(f) >= listed ? attach(f, tiny, budget, true) : null;
          if (out) return { ok: out };
        }
      }
      // Revisão M2: nem o aviso mínimo da reserva coube — o estado das cláusulas não some: fica `clauses` sozinho (a reserva
      // adiada é dita por ele), encolhendo o cabeçalho se preciso. Só sem nem isso, os fatos sozinhos.
      const minimal = summaryOf({ clauses: [] });
      if (minimal && !minimal.complete) {
        // No piso, a chamada pode ser a do investigate.next (a lista de verificação do 1º componente do investigate), quando
        // ele também tem cláusulas não entregues — a mesma forma de chamada, às vezes mais curta.
        const inv = (facts.investigate as { next?: { tool?: string; arguments?: { component?: string; view?: string } } } | undefined)?.next;
        const byComponent = (minimal.byComponent ?? {}) as Record<string, number>;
        const invCall = inv?.tool === "get_component_spec" && inv.arguments?.component && (byComponent[inv.arguments.component] || (minimal.next as { arguments?: { component?: string } })?.arguments?.component === inv.arguments.component)
          ? { tool: "get_component_spec", arguments: { component: inv.arguments.component, view: "checklist" } } : undefined;
        const nexts = [minimal.next, ...(invCall && JSON.stringify(invCall).length < JSON.stringify(minimal.next).length ? [invCall] : [])];
        for (const summary of nexts.flatMap((next) => [{ complete: false, deferred: minimal.deferred, next }, { complete: false, next }])) {
          const fit = (f: Record<string, unknown>) => {
            const out: Record<string, unknown> = withClausesSummary(f, summary);
            if (typeof out.responseCharsEstimate === "number") for (let i = 0; i < 4; i++) out.responseCharsEstimate = textSize(out);
            if (textSize(out) <= budget) return out;
            // Como no montador de sempre (assembleScan): sem espaço para o campo de tamanho, ele sai — nunca o estado.
            const { responseCharsEstimate: _r, itemsChars: _i, ...rest } = out;
            return textSize(rest) <= budget ? rest : null;
          };
          const direct = fit(facts);
          if (direct) return { ok: direct };
          const least = textSize({ clauses: summary }) - 1;
          for (const slack of [24, 12, 0, -12, -24]) {
            const f = factsWithin(budget - least - slack);
            const out = f.kind !== "error" && listedItems(f) >= listed ? fit(f) : null;
            if (out) return { ok: out };
          }
        }
      }
      return { ok: facts };
    }
    // 4) os fatos já não cabem inteiros: o piso pode custar família (fica ao menos uma).
    if (pathFloor) {
      const out = withReserve(pathFloor, false, true);
      if (out) return { ok: out };
    }
    return { refuse: full.unavailable && !pathFloor ? "literal-scope-unavailable" : "indivisible-content-and-floor-exceed-budget" };
  };
  const result = attempt(maxChars);
  if ("ok" in result) return result.ok;
  // A quota cresce com o orçamento: só sugere um teto cuja reserva E piso realmente couberam.
  const nextBudget = result.refuse === "literal-scope-unavailable" ? undefined
    : [2000, 4000, 8000, 12000, 20000, 40000, 60000, 80000, 100000].find((b) => {
      // Revisão MED 1: o retry sugerido entrega de fato ao menos uma cláusula inteira (não só os fatos com a reserva adiada).
      const r = attempt(b);
      const block = r && "ok" in r ? r.ok.clauseReserve as { clauses?: unknown[]; status?: string } | undefined : undefined;
      // 3.7.5 (R2): o piso por referência (cláusulas já entregues na sessão) também é entrega.
      return block !== undefined && (block.status === "floor-by-reference" || (Array.isArray(block.clauses) && (block.clauses.length > 0 || !candidates.length)));
    });
  return {
    contract: CONTRACT, kind: "error", errorCode: "item-too-large", field: "maxChars", scanId,
    error: "Reserva de cláusulas não entregue. Lote de fatos preservado; pendências da sessão não entregues. Repetir a receita é nova observação.",
    reason: result.refuse,
    ...(nextBudget ? { retry: { maxChars: nextBudget, note: "Refaça a receita: nova observação, não snapshot das pendências antigas." } } : {}),
    next: [step("request-detail", "lote preservado", "get_finding_details", { scanId, maxChars: 8000 }),
      step("request-detail", "globais", "get_page_rules", { view: "checklist" })],
  };
}

/**
 * 3.4.4 (C1): `responseCharsEstimate` era só o tamanho das famílias (~2,4k), e o agente o lia como o
 * tamanho da resposta inteira (~7,8k de 8k) — parecia corte a 30% do teto. Agora é a resposta inteira;
 * o tamanho só da página de itens fica em `itemsChars`.
 */
function withResponseSize(response: Record<string, unknown>): Record<string, unknown> {
  if (typeof response.responseCharsEstimate !== "number") return response;
  let out: Record<string, unknown> = { ...response, itemsChars: response.responseCharsEstimate };
  for (let i = 0; i < 3; i++) {
    const size = textSize(out);
    if (out.responseCharsEstimate === size) break;
    out = { ...out, responseCharsEstimate: size };
  }
  return out;
}

/**
 * 3.4.0 (B6): meta mínima de famílias na 1ª página do scan (ou todas, se houver menos).
 * 3.4.4 (C1): a meta passou a ser TODAS as famílias que couberem: o cabeçalho segue encolhendo (só o que
 * tem continuação no ledger) enquanto isso traz mais famílias para dentro do teto. Os textos de
 * checksRun.limits nunca encolhem por esse caminho (D-154).
 */
export const FIRST_PAGE_MIN_FAMILIES = 3;

const listedItems = (r: Record<string, unknown>) =>
  Array.isArray(r.families) ? r.families.length : Array.isArray(r.findings) ? r.findings.length : 0;

/**
 * 3.6.2 (D-155; reexecução sem modelo de 128 chamadas reais, 3.5.0 × 3.6.0 × 3.6.1): a 1ª página de um scan_page —
 * do 1º scan ou de um posterior — monta por PRIORIDADE. As famílias de achados são fatos medidos e vencem: o
 * cabeçalho encolhe por etapas (cada uma até o seu piso, o inteiro fica no ledger), e uma família só sai da 1ª página
 * quando todo o resto já está no piso. Na 3.6.1 a busca gulosa guardava a 1ª tentativa que ganhava família e, em 9
 * scans posteriores, deixava `state`/`coverage`/`revisited` inteiros e cortava uma família (A p03 #21: a ordem de
 * foco e a família da cor; B p02 #11: aria-required-children). E o teto pedido é garantia: a resposta nunca passa
 * de `maxChars` (B p02 #13 voltava 3.191 para 3.000).
 *
 * Ordem das etapas (o que tem continuação ou é constante cede antes): pendências de outras rotas → ids; revisitados →
 * contagem + seletores; observações → contagem; chaves constantes das famílias; ids do diff → continuação; deduplicação;
 * 3.7.0: investigate (as cláusulas empurradas → só id + procedimento → a 1ª por componente → nomes + next); cobertura →
 * contagens e estado → essencial (a janela da receita e a fonte ficam: o runner do govbr-eval as lê, 3.4.3), sempre depois
 * do investigate, como até a 3.6.6; 3.6.3: só então pendências desta página → forma curta (com medida e tarefa)
 * → mínima (uma norma, um lugar com o valor, a tarefa em poucas palavras);
 * separação por rota → código; textos de limits → códigos; pendências → códigos → contagem. Só então famílias.
 */
type FirstPageState = {
  head: Record<string, unknown>;
  obs: Observation[] | null;
  pager: (budget: number) => Record<string, unknown>;
  labels: string[];
};

function firstPageStages(scanId: string, page: (budget: number) => Record<string, unknown>): Array<[string, (s: FirstPageState) => FirstPageState | null]> {
  const onHead = (f: (h: Record<string, unknown>) => Record<string, unknown> | null) => (s: FirstPageState) => {
    const next = f(s.head);
    return next ? { ...s, head: next } : null;
  };
  const constants = (p: Record<string, unknown>) => {
    const { familyHint: _h, familyKey: _k, evidenceSignatureKey: _e, ...rest } = p;
    return { ...rest, familyHint: "Mais famílias: get_finding_details(scanId, cursor=nextCursor); membros: get_finding_details(scanId, familyId, cursor=nextMemberCursor)." };
  };
  return [
    // 3.6.5 (revisão): na 1ª página, as cláusulas lidas no checklist descem junto, direto à contagem por componente.
    ["sessionPending → ids", onHead((h) => {
      const next = sessionPendingStep(h);
      return next ? (sessionPendingChecklistStep(next) ?? next) : null;
    })],
    ["revisited → contagem + seletores", onHead((h) => {
      const rv = h.revisited as { items?: Array<{ locator: string }>; count?: number } | undefined;
      if (!rv?.items) return null;
      return { ...h, revisited: { count: rv.items.length, selectors: rv.items.map((i) => clip(i.locator, 80)) } };
    })],
    ["observations → contagem", (s) => (s.obs?.length ? { ...s, head: { ...s.head, observations: minimalObservations(s.obs, scanId) }, obs: null } : null)],
    ["familyKey → removido", (s) => (s.pager === page ? { ...s, pager: (b) => constants(page(b)) } : null)],
    ["stateDiff ids → view:diff", onHead((h) => {
      const diff = h.stateDiff as { findings?: Record<string, unknown> } | undefined;
      const f = diff?.findings;
      if (!f || (!(f.addedIds as unknown[] | undefined)?.length && !(f.removedIds as unknown[] | undefined)?.length && !(f.notRemeasuredIds as unknown[] | undefined)?.length)) return null;
      const { addedIds: _a, removedIds: _r, notRemeasuredIds: _n, ...counts } = f;
      return { ...h, stateDiff: { ...diff, findings: { ...counts, next: { tool: "get_finding_details", arguments: { scanId, view: "diff" } } } } };
    })],
    ["deduplication → ledger", onHead((h) => (h.deduplication ? (({ deduplication: _d, ...rest }) => rest)(h) : null))],
    // 3.7.0 (D-155/D-159; rastreio dev-364): o investigate traz as cláusulas mensuráveis empurradas — ele cede DEPOIS do
    // que tem continuação no ledger (observações, cobertura, estado, ids do diff, deduplicação) e ANTES das pendências desta
    // página; em degraus (letra → só id + procedimento → a 1ª por componente → nomes + next), nunca some e nunca tira família.
    ["investigate.clauses → id + how", onHead(investigateClausesShort)],
    ["specification → curta", onHead(specificationShort)],
    ["investigate.page → primeira cláusula", onHead(investigatePageOne)],
    ["investigate.page → checklist", onHead(investigatePagePointer)],
    ["investigate → nomes + 2 cláusulas", onHead(investigateCompact(2))],
    ["investigate → nomes + 1 cláusula", onHead(investigateCompact(1))],
    // 3.7.0 (revisão da reexecução, lacuna A): no teto padrão a 1ª página está cheia de famílias — a cobertura e o estado (com
    // continuação no ledger) cedem antes da ÚLTIMA cláusula; o investigate desce a 3 componentes, depois a 1, e só então a nomes.
    ["investigate → nomes + 1 cláusula (3 componentes)", onHead(investigateCompact(1, 3))],
    ["coverage → contagens", onHead((h) => {
      const c = h.coverage as Record<string, unknown> | undefined;
      if (!c || c.compact) return null;
      const count = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).length : undefined);
      const axe = c.axe as { engine?: unknown; passes?: unknown; incomplete?: unknown } | undefined;
      return {
        ...h,
        coverage: {
          compact: true,
          checks: c.checks,
          elementsInspected: c.elementsInspected,
          componentsFound: count("componentsFound"),
          actionsApplied: count("actionsApplied"),
          ...(axe ? { axe: { passes: axe.passes, incomplete: axe.incomplete } } : {}),
          full: { tool: "get_finding_details", arguments: { scanId } },
        },
      };
    })],
    ["state → essencial", onHead((h) => {
      const st = h.state as { observed?: Record<string, unknown>; reached?: unknown; settle?: { settled?: unknown }; replay?: { status?: unknown }; recipe?: { viewport?: unknown; viewportSource?: unknown }; full?: unknown } | undefined;
      if (!st || st.full) return null;
      const o = st.observed ?? {};
      // 3.4.3/3.4.4: a janela da receita e a fonte dela ficam — é a atestação que o runner do govbr-eval confere.
      const recipe = st.recipe?.viewportSource !== undefined ? { recipe: { viewport: st.recipe.viewport, viewportSource: st.recipe.viewportSource } } : {};
      return {
        ...h,
        state: {
          reached: st.reached,
          replay: st.replay?.status,
          settled: st.settle?.settled,
          ...recipe,
          observed: { url: o.url, path: o.path, viewport: o.viewport, ...(o.httpStatus ? { httpStatus: o.httpStatus } : {}) },
          full: { tool: "get_finding_details", arguments: { scanId } },
        },
      };
    })],
    ["investigate → nomes + 1 cláusula (1 componente)", onHead(investigateCompact(1, 1))],
    ["investigate → nomes + aviso", onHead(investigateNudge)],
    // 3.6.3 (rastreio dev-362-b-01 §1): as pendências desta página só encolhem depois de observações, cobertura, estado,
    // ids do diff e deduplicação — e a forma curta guarda o localizador, o valor medido e a tarefa (notJudged.pendingLine).
    ["pageLevel → curto", onHead(pageLevelShortStep)],
    ["pageLevel → mínimo", onHead(pageLevelMinimalStep)],
    ["pageLevel → código⇒norma", onHead(pageLevelNormStep)],
    // 3.6.2 (revisão): os textos de checksRun.limits (D-154/3.4.2: a orientação de honestidade), a separação por
    // rota/estado e os ids das pendências de outras rotas NÃO entram aqui — ficam inteiros enquanto houver família
    // a cortar; só o teto rígido (hardFloor) os reduz, e a códigos/ids, nunca a nada.
    ["pageLevel → códigos", onHead((h) => pageLevelCompact(h, scanId))],
    // 3.6.3 (revisão MEDIUM 2): o piso da 1ª página enquanto uma família puder sair no lugar — só os ids das pendências
    // (P-NN), com a contagem e a continuação; nunca a contagem sozinha.
    ["pageLevel → ids", onHead(pageLevelIdsStep)],
    // 3.7.0 (decisão de 02/11): o aviso do investigate (componentes cujas cláusulas não couberam + a chamada) fica até as
    // pendências estarem no piso de ids (nenhuma pendência some) — só então nomes + next, o último degrau antes dos acréscimos.
    ["investigate → nomes", onHead(investigateNames)],
    ["specification → mínima", onHead(specificationMinimal)],
    ["investigate → chamada global curta", onHead(investigatePageTiny)],
    // 3.6.3 (revisão MEDIUM 2): sem a etapa "pageLevel → contagem" — os ids das pendências (códigos) são o piso da 1ª
    // página enquanto uma família puder sair no lugar; só o teto rígido (sem nenhuma família) desce à contagem.
    // 3.6.5 (reexecução das chamadas reais): os acréscimos da 3.6.5 nunca tiram família da 1ª página — encolhem por último,
    // depois de todo o cabeçalho no piso da 3.6.4, e a página só troca para uma forma com menos acréscimo quando ela ganha
    // família (empate: fica a com mais acréscimo).
    // 3.6.6 (revisão da 3.6.5, MÉDIA 2): em degraus, cada um marcado em `compacted` (a troca era tudo ou nada e sem rótulo:
    // no 1º scan da tela A saíam todas as forças e todos os passos). Ordem: notas → alsoIn → passos → força; os dois
    // últimos família a família, da última para a primeira (assembleFirstScanPage: extrasByFamily).
    // 3.7.2 (rastreio dev-371-b §3, B-23 p01): o alsoIn que liga a família a OUTRA rota nunca sai pelo orçamento — fica na
    // forma curta (rota + scanId + familyId), e a nota curta fica com ele; só o de outro estado da mesma rota sai.
    ["extras:notas → curtas", extrasStage(familyNotesShort)],
    ["extras:alsoIn → curto", extrasStage(familyAlsoInShort)],
    ["extras:notas → fora", extrasStage(familyNotesOut, headExtrasOut)],
    ["extras:alsoIn → fora", extrasStage(familyAlsoInOut)],
  ];
}

/**
 * 3.7.2 (revisão MÉDIA 4): o item do alsoIn é de outra rota — decidido pela rota INTEIRA na sessão (session.alsoIn marca
 * CROSS_ROUTE, chave símbolo: não sai no JSON), nunca pelo rótulo encurtado (duas rotas longas colidem em shortRoute). Sem a
 * marca (item que não veio da sessão): conta como outra rota (nunca sai sem saber).
 */
type AlsoInItem = { route?: string; scanId?: string; familyId?: string; [CROSS_ROUTE]?: boolean };
const otherRoute = (a: AlsoInItem) => a[CROSS_ROUTE] !== false;
/** A forma curta de um item: o de outra rota guarda a rota; a marca acompanha (símbolo). */
const shortItem = (a: AlsoInItem): AlsoInItem =>
  otherRoute(a) && a.route !== undefined
    ? { route: a.route, scanId: a.scanId, familyId: a.familyId, ...(a[CROSS_ROUTE] !== undefined ? { [CROSS_ROUTE]: a[CROSS_ROUTE] } : {}) }
    : { scanId: a.scanId, familyId: a.familyId, ...(a[CROSS_ROUTE] !== undefined ? { [CROSS_ROUTE]: a[CROSS_ROUTE] } : {}) };

/** 3.6.6: um degrau dos acréscimos — só quando tira algo (senão o rótulo em `compacted` mentiria e custaria espaço). */
function extrasStage(onPage: (p: Record<string, unknown>) => Record<string, unknown>, onHead?: (h: Record<string, unknown>) => Record<string, unknown>) {
  return (s: FirstPageState): FirstPageState | null => {
    const head = onHead ? onHead(s.head) : s.head;
    const all = s.pager(1_000_000);
    if (head === s.head && JSON.stringify(onPage(all)) === JSON.stringify(all)) return null;
    const prev = s.pager;
    return { ...s, head, pager: (b: number) => onPage(prev(b)) };
  };
}

/** 3.6.6: as partes dos acréscimos em `compacted`; todas fora → um rótulo só ("extras"), para o rótulo não custar família. */
const EXTRAS_PARTS = ["extras:notas", "extras:alsoIn", "extras:passos", "extras:força", "extras:normas"];
/**
 * 3.7.2 (revisão BAIXA 7): com o alsoIn de outra rota ainda na página (ele não sai pelo orçamento), o rótulo único não diz
 * "extras" (todos fora): diz `extras:alsoIn-kept` — todos os acréscimos que saem saíram; o alsoIn de outra rota ficou.
 */
export const EXTRAS_ALSO_IN_KEPT = "extras:alsoIn-kept";
function extrasLabels(labels: string[], part: string, allOut: boolean, alsoInKept = false): string[] {
  const next = [...labels.filter((l) => l !== part), part];
  return allOut ? [...next.filter((l) => !EXTRAS_PARTS.includes(l) && l !== EXTRAS_ALSO_IN_KEPT), alsoInKept ? EXTRAS_ALSO_IN_KEPT : "extras"] : next;
}

/** 3.6.6: os acréscimos por família que saem família a família (da última para a primeira), nesta ordem. */
export const EXTRAS_BY_FAMILY: Array<{ part: string; has: (f: Record<string, unknown>) => boolean; drop: (f: Record<string, unknown>) => Record<string, unknown> }> = [
  {
    part: "extras:passos",
    has: (f) => "interaction" in f,
    drop: (f) => (({ interaction: _i, ...rest }) => rest)(f),
  },
  // 3.7.2: as referências secundárias (norma obrigatória de uma regra só best-practice do axe) saem antes da força (são
  // secundárias), família a família, e só quando isso ganha família na 1ª página (inteiras em get_finding_details).
  {
    part: "extras:normas",
    has: (f) => Boolean(f.rule && typeof f.rule === "object" && "references" in (f.rule as Record<string, unknown>)),
    drop: (f) => ({ ...f, rule: (({ references: _r, ...r }) => r)(f.rule as Record<string, unknown>) }),
  },
  {
    part: "extras:força",
    has: (f) => Boolean(f.rule && typeof f.rule === "object" && "force" in (f.rule as Record<string, unknown>)),
    drop: (f) => ({ ...f, rule: (({ force: _f, ...r }) => r)(f.rule as Record<string, unknown>) }),
  },
];

const mapFamilies = (p: Record<string, unknown>, f: (family: Record<string, unknown>, index: number) => Record<string, unknown>) =>
  Array.isArray(p.families) ? { ...p, families: (p.families as Array<Record<string, unknown>>).map(f) } : p;

/** 3.6.6: um acréscimo por família fora das famílias de índice ≥ keep (as primeiras `keep` o mantêm). */
export function familyExtraFrom(p: Record<string, unknown>, extra: (typeof EXTRAS_BY_FAMILY)[number], keep: number): Record<string, unknown> {
  return mapFamilies(p, (f, i) => (i >= keep && extra.has(f) ? extra.drop(f) : f));
}

/** 3.6.6: as notas da página na forma curta. */
export function familyNotesShort(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p };
  if (out.alsoInNote) out.alsoInNote = "alsoIn: outro fato, cartão próprio";
  if (out.interactionNote) out.interactionNote = "interaction.steps → state.steps";
  return out;
}

/**
 * 3.6.6: o alsoIn na forma curta — o par scanId + familyId (o get_finding_details pede os dois; MÉDIA 5: a forma curta da
 * 3.6.5 guardava só o familyId), sem a rota. 3.7.2: o item de OUTRA rota guarda a rota (rota + registro: é ela que diz
 * "outro cartão"); o de outro estado da mesma rota fica só com scanId + familyId.
 */
export function familyAlsoInShort(p: Record<string, unknown>): Record<string, unknown> {
  return mapFamilies(p, (f) => {
    if (!f.alsoIn) return f;
    const { alsoIn, alsoInMore: _m, ...rest } = f;
    return { ...rest, alsoIn: (alsoIn as AlsoInItem[]).map(shortItem) };
  });
}

/** 3.7.2: alguma família ainda liga a outra rota (o alsoIn que não sai). */
export const hasCrossRouteAlsoIn = (p: Record<string, unknown>) =>
  Array.isArray(p.families) && (p.families as Array<Record<string, unknown>>).some((f) => Array.isArray(f.alsoIn) && (f.alsoIn as AlsoInItem[]).some(otherRoute));

/** 3.6.6: sem as notas da página (alsoInNote, interactionNote). 3.7.2: com alsoIn de outra rota, a nota fica curta. */
export function familyNotesOut(p: Record<string, unknown>): Record<string, unknown> {
  const { alsoInNote: _a, interactionNote: _i, ...rest } = p;
  return p.alsoInNote && hasCrossRouteAlsoIn(p) ? { ...rest, alsoInNote: "alsoIn: outro fato, cartão próprio" } : rest;
}

/** 3.6.6: sem o alsoIn nas famílias (fica no detalhe). 3.7.2: só o de outro estado da mesma rota sai; o de outra rota fica curto. */
export function familyAlsoInOut(p: Record<string, unknown>): Record<string, unknown> {
  return mapFamilies(p, (f) => {
    if (!f.alsoIn) return f;
    const { alsoIn, alsoInMore: _m, ...rest } = f;
    const kept = (alsoIn as AlsoInItem[]).filter(otherRoute).map(shortItem);
    return kept.length ? { ...rest, alsoIn: kept } : rest;
  });
}

/** 3.6.5: no cabeçalho, o sub-bloco checklist do sessionPending (a contagem total já está em count) e a revisita só com o nome. */
function headExtrasOut(h: Record<string, unknown>): Record<string, unknown> {
  let out = h;
  const sp = out.sessionPending as Record<string, unknown> | undefined;
  if (sp && ("checklist" in sp || "checklistUnregistered" in sp)) {
    const { checklist: _c, checklistUnregistered: _u, ...rest } = sp;
    out = { ...out, sessionPending: rest };
  }
  const cr = out.checksRun as { executed?: Array<Record<string, unknown> | string> } | undefined;
  if (cr?.executed?.some((e) => typeof e === "object" && e.check === "tokens (revisita)" && Object.keys(e).length > 1)) {
    out = { ...out, checksRun: { ...cr, executed: cr.executed.map((e) => (typeof e === "object" && e.check === "tokens (revisita)" ? { check: e.check } : e)) } };
  }
  return out;
}

/**
 * O mínimo de cada bloco, para o teto rígido (só quando nem a página começando na continuação cabe). Nada some:
 * cada bloco fica como código, contagem ou `next`; os textos de checksRun.limits viram códigos por último (D-154).
 */
function hardFloor(scanId: string): Array<(x: Record<string, unknown>) => Record<string, unknown>> {
  const full = { tool: "get_finding_details", arguments: { scanId } };
  const spIds = (sp: { ids?: string[]; items?: Array<{ code: string; ids: string[] }> }) => sp.ids ?? (sp.items ?? []).flatMap((i) => i.ids.map((id) => `${id}:${i.code}`));
  return [
    (x) => (x.compacted ? { ...x, compacted: (x.compacted as unknown[]).length } : x),
    (x) => specificationMinimal(specificationShort(x) ?? x) ?? x,
    (x) => {
      const inv = x.investigate as { next?: unknown; page?: { total?: number; next: unknown } } | undefined;
      return inv ? { ...x, investigate: {
        ...(inv.page ? { page: typeof inv.page.next === "string" ? inv.page : { total: inv.page.total, deferred: true, next: inv.page.next } } : {}),
        next: inv.next,
      } } : x;
    },
    (x) => (x.stateDiff ? { ...x, stateDiff: { previousScanId: (x.stateDiff as { previousScanId?: unknown }).previousScanId, stateChanged: (x.stateDiff as { stateChanged?: unknown }).stateChanged, next: { tool: "get_finding_details", arguments: { scanId, view: "diff" } } } } : x),
    (x) => (x.summary ? { ...x, summary: { total: (x.summary as { total?: unknown }).total } } : x),
    (x) => (x.coverage ? { ...x, coverage: { checks: (x.coverage as { checks?: unknown }).checks, full } } : x),
    (x) => (x.familyHint ? (({ familyHint: _h, ...rest }) => rest)(x) : x),
    (x) => (x.cacheMissReason ? (({ cacheMissReason: _c, ...rest }) => rest)(x) : x),
    (x) => (x.observations ? { ...x, observations: { total: (x.observations as { total?: unknown }).total, next: { tool: "get_finding_details", arguments: { scanId, view: "observations" } } } } : x),
    (x) => {
      if (!x.sessionPending) return x;
      const sp = x.sessionPending as { count?: unknown; checklist?: unknown };
      const counted = sp.checklist ? (sessionPendingChecklistCount(sp)?.checklist ?? sp.checklist) : undefined;
      return { ...x, sessionPending: { count: sp.count, ids: spIds(sp as never), ...(counted ? { checklist: counted } : {}) } };
    },
    (x) => (x.revisited ? { ...x, revisited: { count: (x.revisited as { count?: unknown; items?: unknown[] }).count ?? (x.revisited as { items?: unknown[] }).items?.length, next: full } } : x),
    (x) => (x.units ? { ...x, units: { routes: (x.units as { routes?: unknown }).routes, states: (x.units as { states?: unknown }).states, rule: "um achado por rota/estado" } } : x),
    // 3.6.3: sem família nenhuma na 1ª página, as pendências descem à contagem ANTES dos textos de limits (D-154: eles por último).
    (x) => {
      const cr = x.checksRun as { pageLevel?: { count?: number; notMeasured?: unknown[]; next?: unknown; full?: unknown; lowSignal?: number } } | undefined;
      const pl = cr?.pageLevel;
      if (!pl || pl.notMeasured === undefined) return x;
      return { ...x, checksRun: { ...cr, pageLevel: { count: (pl.count ?? pl.notMeasured.length) + (pl.lowSignal ?? 0), next: pl.next ?? pl.full } } };
    },
    (x) => {
      const cr = x.checksRun as { executed?: Array<{ check?: string } | string>; limits?: Array<{ code: string } | string>; pageLevel?: unknown } | undefined;
      return cr ? { ...x, checksRun: { executed: (cr.executed ?? []).map((e) => (typeof e === "string" ? e : e.check)), limits: (cr.limits ?? []).map((l) => (typeof l === "string" ? l : l.code)), pageLevel: cr.pageLevel } } : x;
    },
    // Último recurso: o envelope mínimo — o lote inteiro está no ledger pelo scanId; códigos, contagens e continuações ficam.
    (x) => {
      const st = x.state as { recipe?: unknown; reached?: unknown } | undefined;
      const cr = x.checksRun as { limits?: unknown; pageLevel?: { count?: unknown; notMeasured?: unknown[]; next?: unknown; full?: unknown } } | undefined;
      const pl = cr?.pageLevel;
      return {
        contract: x.contract, kind: x.kind, status: x.status, scanId: x.scanId, stateFingerprint: x.stateFingerprint,
        ...(st ? { state: { reached: st.reached, ...(st.recipe ? { recipe: st.recipe } : {}) } } : {}),
        ...(cr ? { checksRun: { limits: cr.limits, ...(pl ? { pageLevel: { count: pl.count ?? pl.notMeasured?.length, next: pl.next ?? pl.full } } : {}) } } : {}),
        ...(x.sessionPending ? { sessionPending: x.sessionPending } : {}),
        ...(x.revisited ? { revisited: { count: (x.revisited as { count?: unknown }).count } } : {}),
        ...(x.investigate ? { investigate: x.investigate } : {}),
        ...(x.specification ? { specification: x.specification } : {}),
        ...(x.units ? { units: x.units } : {}),
        ...(x.summary ? { summary: x.summary } : {}),
        totalFindings: x.totalFindings, totalFamilies: x.totalFamilies, families: x.families, count: x.count, cursor: x.cursor,
        complete: x.complete, partial: x.partial, nextCursor: x.nextCursor, next: x.next, absenceNote: x.absenceNote,
        compacted: "tudo (inteiro no ledger: get_finding_details)",
      };
    },
    // Teto de 1k: evite metadados repetidos, sem perder janela, limites ou continuações.
    (x) => {
      const { status: _s, ...rest } = x;
      const inv = x.investigate as { next?: unknown; page?: { next?: unknown } } | undefined;
      const duplicateNext = inv?.page && (JSON.stringify(inv.next) === JSON.stringify(inv.page.next) ||
        (typeof inv.page.next === "string" && (inv.next as { tool?: string } | undefined)?.tool === "get_page_rules"));
      const next = inv?.next as { hint?: string } | undefined;
      const { hint: _h, ...nextWithoutHint } = next ?? {};
      return {
        ...rest,
        ...(inv ? { investigate: { ...inv, ...(duplicateNext ? { next: undefined } : { next: nextWithoutHint }) } } : {}),
        absenceNote: "Zero achados não é conformidade.",
        compacted: "ledger: get_finding_details(scanId)",
      };
    },
    // O identificador do lote recupera fingerprint; totais e cursor conservam seu contrato.
    (x) => {
      const { stateFingerprint: _f, ...rest } = x;
      return { ...rest, ...(x.units ? { units: { rule: "um achado por rota/estado" } } : {}) };
    },
  ];
}

function assembleFirstScanPage(
  head: Record<string, unknown>,
  observations: Observation[] | null,
  scanId: string,
  maxChars: number,
  page: (familyBudget: number) => Record<string, unknown>,
): Record<string, unknown> {
  // O campo de tamanho conta: a página só é aceita com ele dentro do teto (a busca de orçamento mede a resposta final).
  const finish = (r: Record<string, unknown>, labels: string[]) => withResponseSize(labels.length ? { ...r, compacted: [...labels] } : r);
  const target = listedItems(page(1_000_000));
  const obsShare = Math.max(300, Math.floor(maxChars * 0.1));
  /** A melhor página para este cabeçalho: o maior orçamento de famílias que ainda cabe no teto. */
  const fill = (s: FirstPageState): Record<string, unknown> | null => {
    const fixed = { ...s.head, ...(s.obs ? { observations: observationsBlock(s.obs, scanId, obsShare) } : {}) };
    const build = (b: number) => finish({ ...fixed, ...s.pager(b) }, s.labels);
    // Busca binária do maior orçamento de famílias cuja resposta inteira (com `compacted` e o campo de tamanho) cabe:
    // a estimativa do construtor de páginas não é exata, e um passo fixo deixava família de fora por poucos caracteres.
    let lo = 200;
    let r = build(lo);
    if (textSize(r) > maxChars) return null;
    let hi = Math.max(lo, 2 * maxChars);
    for (let i = 0; i < 16 && hi - lo > 20; i++) {
      const mid = Math.floor((lo + hi) / 2);
      const trial = build(mid);
      if (textSize(trial) <= maxChars) {
        lo = mid;
        r = trial;
        if (listedItems(r) >= target) break;
      } else hi = mid;
    }
    return r;
  };
  let state: FirstPageState = { head, obs: observations, pager: page, labels: [] };
  let best: Record<string, unknown> | null = null;
  /** A página completa (todas as famílias que o pedido traria sem teto) encerra; senão guarda a que tem mais famílias. */
  const consider = (s: FirstPageState): Record<string, unknown> | null => {
    const r = fill(s);
    if (!r) return null;
    if (listedItems(r) >= target) return r;
    if (listedItems(r) > 0 && (!best || listedItems(r) > listedItems(best))) best = r;
    return null;
  };
  let done = consider(state);
  if (done) return done;
  for (const [label, apply] of firstPageStages(scanId, page)) {
    const next = apply(state);
    if (!next) continue;
    // 3.6.2: `compacted` lista só a PARTE encolhida (cada bloco mostra a sua forma e a continuação); etapas da mesma
    // parte não se repetem — a lista custava até ~350 caracteres, o espaço de uma família.
    const part = label.split(" → ")[0];
    // 3.7.0: a parte também apaga as subpartes (investigate apaga investigate.clauses: a forma final já diz tudo).
    state = part ? { ...next, labels: [...state.labels.filter((l) => l !== part && !l.startsWith(`${part}.`)), part] } : { ...next, labels: state.labels };
    done = consider(state);
    if (done) return done;
  }
  // 3.6.6 (revisão da 3.6.5, MÉDIA 2): passos e força saem família a família, da última para a primeira — primeiro da
  // família que ainda não coube (a seguinte à última da melhor página), depois das que estão na página. Cada degrau só é
  // tentado se tira algo; a melhor página continua a 1ª forma (com mais acréscimo) que alcança o maior número de famílias.
  for (const extra of EXTRAS_BY_FAMILY) {
    const all = state.pager(1_000_000);
    const fams = Array.isArray(all.families) ? (all.families as Array<Record<string, unknown>>) : [];
    const placed = best ? listedItems(best) : 0;
    for (let keep = Math.min(placed, fams.length); keep >= 0; keep--) {
      if (!fams.slice(keep).some(extra.has)) continue;
      // Da família `keep` em diante (as de índice maior já saíram no degrau anterior): fora o 1º degrau, só tenta quando a
      // família `keep` tem o acréscimo (senão a página seria a mesma).
      if (keep < Math.min(placed, fams.length) && !extra.has(fams[keep])) continue;
      const prev = state.pager;
      const pager = (b: number) => familyExtraFrom(prev(b), extra, keep);
      // Tudo fora (nada mais de acréscimo na página inteira): um rótulo só.
      const rest = pager(1_000_000);
      // 3.7.2 (A2): o alsoIn de outra rota (e a nota curta dele) não sai pelo orçamento — não impede o rótulo único.
      const allOut = keep === 0 && !(Array.isArray(rest.families) && (rest.families as Array<Record<string, unknown>>).some((f) => EXTRAS_BY_FAMILY.some((e) => e.has(f)))) && !rest.interactionNote;
      state = { ...state, pager, labels: extrasLabels(state.labels, extra.part, allOut, allOut && hasCrossRouteAlsoIn(rest)) };
      done = consider(state);
      if (done) return done;
    }
  }
  // Último recurso: com tudo fora, o próprio rótulo "extras" (≈ 9 caracteres) pode ser o que separa a página da 3.6.4 de
  // uma família a mais. Só então ele sai (consider só troca a melhor página quando ganha família): a família vence.
  const bareLabels = state.labels.filter((l) => l !== "extras" && l !== EXTRAS_ALSO_IN_KEPT);
  if (state.labels.some((l) => l === "extras" || l === EXTRAS_ALSO_IN_KEPT)) {
    done = consider({ ...state, labels: bareLabels });
    if (done) return done;
  }
  // 3.7.1: a dica das cláusulas no next do investigate sai por último — depois de todo o cabeçalho e dos acréscimos das
  // famílias; depois dela, só nomes + next (consider só troca a melhor página quando ganha família).
  const hintOut = investigateHintOut(state.head);
  if (hintOut) {
    done = consider({ ...state, head: hintOut, labels: [...bareLabels.filter((l) => l !== "investigate"), "investigate"] });
    if (done) return done;
  }
  // 3.7.6 (item 1): o bloco de especificação nunca tira família da 1ª página — sai inteiro por último, e só quando a página
  // ganha família com isso (consider só troca a melhor página quando ganha). Fica dito em `compacted`; as linhas estão na
  // spec de cada componente e os desvios medidos, nas observações (spec-part-token).
  if (state.head.specification) {
    const base = hintOut ? { ...state, head: hintOut, labels: [...bareLabels.filter((l) => l !== "investigate"), "investigate"] } : { ...state, labels: bareLabels };
    const { specification: _spec, ...without } = base.head;
    done = consider({ ...base, head: without, labels: [...base.labels.filter((l) => l !== "specification"), "specification:fora"] });
    if (done) return done;
  }
  if (best) return best;
  // Nem uma família cabe com o cabeçalho no piso: a página de famílias começa na continuação (cursor 0) — um único
  // cursor, coerente — e, se nem assim couber, cada bloco desce ao mínimo (fica a contagem ou o next), nunca acima do teto.
  const p = page(200);
  const listKey = (["families", "findings"] as const).find((k) => Array.isArray(p[k])) ?? "families";
  const items = Array.isArray(p[listKey]) ? (p[listKey] as unknown[]).length : 0;
  const totalItems = Number(p.totalFamilies ?? p.total ?? items);
  const totalFindings = Number(p.totalFindings ?? p.total ?? items);
  const labels = [...state.labels, `${listKey} → get_finding_details(scanId, cursor:0)`];
  let out: Record<string, unknown> = {
    ...state.head,
    ...(state.obs ? { observations: minimalObservations(state.obs, scanId) } : {}),
    ...p,
    [listKey]: [],
    count: 0,
    cursor: 0,
    truncated: true,
    complete: false,
    partial: { reasons: ["char-budget"], ...(listKey === "families" ? { familiesNotReturned: totalItems, membersNotReturned: totalFindings } : { notReturned: totalItems }), nextCursor: 0 },
    nextCursor: 0,
    next: { tool: "get_finding_details", arguments: { scanId, cursor: 0 } },
  };
  out = finish(out, labels);
  if (textSize(out) > maxChars && typeof out.responseCharsEstimate === "number") out = (({ responseCharsEstimate: _r, itemsChars: _i, ...rest }) => rest)(out);
  for (const f of hardFloor(scanId)) {
    if (textSize(out) <= maxChars) break;
    out = f(out);
  }
  // O piso não é uma licença para estourar o teto ou apagar pendências de outras rotas.
  // O lote continua no ledger. A sessão não tem paginação exata: a nova receita é nova observação.
  if (textSize(out) > maxChars) {
    const inv = out.investigate as { page?: { next?: string | { tool: string; arguments: Record<string, unknown> } }; next?: { tool: string; arguments: Record<string, unknown> } } | undefined;
    const next = [step("request-detail", "lote preservado", "get_finding_details", { scanId, maxChars: 8000 })];
    if (inv?.page?.next) next.push(step("request-detail", "globais", "get_page_rules", { view: "checklist" }));
    if (inv?.next && inv.next.tool !== "get_page_rules") next.push(step("request-detail", "componente", inv.next.tool, inv.next.arguments));
    return {
      contract: CONTRACT, kind: "error", errorCode: "item-too-large", field: "maxChars", scanId,
      error: "O piso do scan não cabe. O lote foi preservado; pendências da sessão não foram entregues. Para revê-las, refaça a receita com maxChars ≥ 8000 (nova observação).",
      next,
    };
  }
  return out;
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
