import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { httpStatusOf, nativeDialogsOf, withPage } from "../evidence/browser.js";
import { DEFAULT_SELECTOR, inspectPageComputedStyles, type StyleProperty } from "../evidence/inspect.js";
import { checkTokenCompliance, collectTokenObservations, ALL_TOKEN_CHECKS, type TokenCheck } from "../checkers/tokenCompliance.js";
import { checkComponentStructure, collectStructureObservations } from "../checkers/structure.js";
import { demoteToObservations, ownershipOf, partitionByOwnership, splitOutside } from "../checkers/ownership.js";
import { axeBestPracticeObservations, runAxeScanOnPage } from "../checkers/axe.js";
import { checkPageStructure } from "../checkers/pageStructure.js";
import { checkFocusIndicators } from "../checkers/focusIndicator.js";
import { FOCUSABLE_SELECTOR, measureFocusIndicators } from "../evidence/focusIndicator.js";
import { ANATOMY_ROOT_SELECTOR, checkAnatomy } from "../checkers/anatomy.js";
import { collectAnatomy } from "../evidence/context.js";
import { inspectPageStructure } from "../evidence/pageFacts.js";
import { getComponentSpecs, getTokenRegistry } from "../data/load.js";
import { deduplicateFindings } from "../responses/findings.js";
import type { Finding, Observation } from "../schema/finding.js";
import { applyActions, type Arrival, type PageAction, type ReplayObserver, type ReplayResult } from "./actions.js";
import {
  oracleViewport,
  STATE_IDENTITY_NORMALIZATIONS,
  STATE_IDENTITY_POLICY,
  evaluateArrival,
  fingerprintPage,
  settlePage,
  snapshotPageState,
  type ArrivalAttestation,
  type SettleReport,
  type ObservedState,
} from "./state.js";

export type PageScanCheck = "tokens" | "structure" | "axe" | "page";

/** 3.4.0 (B5): elementos de texto e separadores cuja cor o scan confere além de DEFAULT_SELECTOR. */
export const TEXT_COLOR_SELECTOR =
  "p, span, label, li, dt, dd, h1, h2, h3, h4, h5, h6, small, strong, em, b, td, th, caption, legend, figcaption, blockquote, hr";
export type PageScanAction = PageAction;

export interface PageScanRequest {
  url: string;
  selectors?: string[];
  checks?: PageScanCheck[];
  tokenChecks?: TokenCheck[];
  components?: string[];
  actions?: PageScanAction[];
  /** Condições de chegada (2.10.0): declaradas, são medidas depois da receita; não satisfeitas, nada é varrido. */
  arrival?: Arrival;
  /**
   * Window for the scan. Accepted only from the deterministic baseline CLI (2.5.2): the MCP tool
   * schema does not expose it, so the agent-facing surface is unchanged.
   */
  viewport?: { width: number; height: number };
}

/**
 * A receita tipada de um estado e o que a reprodução dela provou (2.10.0, NAT-82). Vai junto com o
 * scanId: quem cita o scan cita esta receita, e `verify_finding({ scanId })` a reaplica.
 */
export interface StateAttestation {
  policy: typeof STATE_IDENTITY_POLICY;
  /** Renomeações consistentes que a política aplica antes do hash (state.ts). */
  normalizations: typeof STATE_IDENTITY_NORMALIZATIONS;
  recipe: {
    url: string;
    viewport: { width: number; height: number };
    /** `frozen-desktop`: a janela congelada das ferramentas MCP; `cli`: declarada pela linha de base. */
    /** 2.14.0: `harness` = declarada pelo harness em GOVBR_VALIDATOR_VIEWPORT (fora do esquema MCP). */
    viewportSource: "frozen-desktop" | "cli" | "harness";
    actions: PageScanAction[];
    arrival?: Arrival;
  };
  replay: ReplayResult;
  /** Espera de assentamento antes do fingerprint (state.ts, SETTLE_POLICY); fora do hash. */
  settle: SettleReport;
  observed: ObservedState;
  arrival: ArrivalAttestation;
  /** Receita aplicada por inteiro e nenhuma condição de chegada declarada falhou. */
  reached: boolean;
}

export interface PageScanResult {
  status: "scanned";
  url: string;
  stateFingerprint: string;
  state: StateAttestation;
  cacheHit: boolean;
  cacheMissReason?: "no-exact-fingerprint-and-scope-match";
  findings: Finding[];
  /** Sinais de revisão fora da pontuação (D-27). */
  observations: Observation[];
  coverage: {
    checks: PageScanCheck[];
    /** Explicit selectors from the request; empty means each checker uses its documented default. */
    selectors: string[];
    /** 3.4.0 (B8): com seletores, tokens/estrutura inspecionam os elementos casados E os descendentes deles. */
    selectorScope?: "matched-and-descendants";
    /** Ausente no perfil knowledge-free (2.14.0): só o axe roda, sem seletores de evidência. */
    evidenceSelectors?: string[];
    axeScope: string | null;
    elementsInspected: number;
    /** Ausente no perfil knowledge-free (2.14.0): a lista dos componentes do DS é conhecimento. */
    componentsRequested?: string[];
    /** Ausente no perfil knowledge-free (2.14.0). */
    componentsFound?: string[];
    axe?: { engine: { name: string; version: string }; passes: number; incomplete: number; incompleteRules?: Array<{ rule: string; nodes: number; example: string | null; help?: string }> };
    actionsApplied: Array<{ action: PageScanAction["action"]; selector?: string; key?: string; path?: string }>;
  };
  deduplication: {
    input: number;
    output: number;
    merged: number;
    key: string;
  };
}

/**
 * O estado pedido não foi alcançado: um passo da receita falhou ou uma condição de chegada não se
 * cumpriu. Nada foi varrido — sem findings, sem cobertura — porque zero achados aqui diria "sem
 * defeito" sobre um estado que ninguém viu. É limitação de quem escreveu a receita, não falha técnica.
 */
export interface PageScanUnreached {
  status: "state-not-reached";
  url: string;
  stateFingerprint: null;
  state: StateAttestation;
  limitation: { kind: "action-error" | "arrival-not-met"; detail: string; httpStatus?: number };
}

export type PageScanOutcome = PageScanResult | PageScanUnreached;

interface CachedScan extends Omit<PageScanResult, "cacheHit" | "cacheMissReason" | "state"> {}

/** Process-local LRU. A battery run starts a fresh MCP process, so entries never cross runs. */
export class PageScanCache {
  private readonly entries = new Map<string, CachedScan>();

  constructor(private readonly maxEntries = 20) {}

  get(key: string): CachedScan | undefined {
    const value = this.entries.get(key);
    if (!value) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: CachedScan): void {
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export { applyActions, fingerprintPage };

/**
 * 3.3.0 (S-10, S-11, S-19): o que a página fez fora do DOM medido — status HTTP de erro, diálogos
 * nativos descartados, iframes não varridos. Só aparece quando existe (a resposta comum não cresce).
 */
function pageCircumstances(page: Page): Partial<ObservedState> {
  const out: Partial<ObservedState> = {};
  const status = httpStatusOf(page);
  if (status !== null && (status < 200 || status >= 400)) out.httpStatus = status;
  const dialogs = nativeDialogsOf(page);
  if (dialogs.length) out.nativeDialogs = dialogs.map((d) => ({ type: d.type, message: d.message.slice(0, 120) }));
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  if (frames.length) out.framesNotScanned = { count: frames.length, urls: frames.slice(0, 5).map((f) => f.url().slice(0, 200)) };
  return out;
}

/**
 * Reproduz a receita numa página recém-carregada e mede o que ela provou. Usado igualmente pelo
 * scanner e pelo portão: o mesmo código decide "estado alcançado" para qualquer chamador.
 */
export async function reproduceState(
  page: Page,
  recipe: StateAttestation["recipe"],
  observe?: ReplayObserver
): Promise<{ attestation: StateAttestation; fingerprint: string }> {
  const replay = await applyActions(page, recipe.actions, observe);
  // Mesma espera no scan e na reprodução: o fingerprint é tirado do estado assentado, não do meio
  // de uma transição disparada pela última ação.
  const settle = await settlePage(page);
  const snapshot = await snapshotPageState(page);
  const arrival: ArrivalAttestation =
    replay.status === "applied"
      ? await evaluateArrival(page, snapshot.observed, recipe.arrival)
      : { status: "not-reached", conditions: [] };
  return {
    fingerprint: snapshot.fingerprint,
    attestation: {
      policy: snapshot.policy,
      normalizations: STATE_IDENTITY_NORMALIZATIONS,
      recipe,
      replay,
      settle,
      observed: { ...snapshot.observed, ...pageCircumstances(page) },
      arrival,
      reached: replay.status === "applied" && arrival.status !== "not-reached",
    },
  };
}

/**
 * 3.4.0 (B1, P-01/P-02): achados de nível de página (cabeçalho, rodapé, salto — e os do axe sobre o
 * documento inteiro) vêm primeiro, na ordem estável, para caberem na 1ª página do scan. Só a ordem
 * muda: ids, contagens e conteúdo dos achados são os mesmos.
 */
export function pageLevelFirst(findings: Finding[]): Finding[] {
  const rank = (f: Finding) => (f.rule.source === "govbr-ds-page" ? 0 : f.element.locator === "html" ? 1 : 2);
  return findings.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map(({ f }) => f);
}

/** 3.4.0 (B9): teto de elementos focáveis medidos por scan. */
export const FOCUS_INDICATOR_LIMIT = 300;

async function focusIndicatorFindings(page: Page, url: string, selectors: string[]): Promise<Finding[]> {
  const focusable = await inspectPageComputedStyles(page, url, FOCUSABLE_SELECTOR, []);
  let candidates = focusable.elements.filter(
    (element) => element.rendered !== false && !element.attributes.disabled && element.attributes.ariaDisabled !== "true" && element.origin === undefined
  );
  if (selectors.length) {
    const scoped = await inspectPageComputedStyles(page, url, selectors, [], { descendants: true });
    const inScope = new Set(scoped.elements.map((element) => element.locator));
    candidates = candidates.filter((element) => inScope.has(element.locator));
  }
  candidates = candidates.slice(0, FOCUS_INDICATOR_LIMIT);
  const facts = await measureFocusIndicators(page, candidates.map((element) => element.locator));
  const snippetOf = new Map(candidates.map((element) => [element.locator, element.outerHTML.slice(0, 300)]));
  return checkFocusIndicators({ url }, facts.map((fact) => ({ ...fact, snippet: snippetOf.get(fact.locator) ?? "" })));
}

export function unreachedLimitation(state: StateAttestation): PageScanUnreached["limitation"] {
  // 3.4.0 (B7): uma página de erro HTTP por trás do estado não alcançado fica dita na limitação —
  // na tela B, o 404 de uma rota de SPA sem fallback aparecia só como "visible não satisfeito".
  const http = state.observed.httpStatus;
  const httpNote = http !== undefined
    ? ` A página carregada respondeu HTTP ${http}: o estado medido é uma página de erro. Numa SPA servida sem fallback de rota, carregue a raiz do app e use a ação navigate com o caminho.`
    : "";
  if (state.replay.status === "failed") {
    const f = state.replay.failure;
    return { kind: "action-error", detail: `Passo ${f.index} (${f.action}) da receita falhou: ${f.reason}. ${f.detail}${httpNote}`, ...(http !== undefined ? { httpStatus: http } : {}) };
  }
  const failed = state.arrival.conditions.filter((c) => !c.satisfied);
  return {
    kind: "arrival-not-met",
    detail: `Condição(ões) de chegada não satisfeita(s): ${failed
      .map((c) => `${c.condition} (esperado ${JSON.stringify(c.expected)}, observado ${JSON.stringify(c.observed)}${c.detail ? `: ${c.detail}` : ""})`)
      .join("; ")}.${httpNote}`,
    ...(http !== undefined ? { httpStatus: http } : {}),
  };
}

function tokenProperties(checks: TokenCheck[]): StyleProperty[] {
  const properties = new Set<StyleProperty>();
  if (checks.includes("color")) ["backgroundColor", "color", "borderColor"].forEach((p) => properties.add(p as StyleProperty));
  if (checks.includes("font")) ["fontFamily", "fontSize"].forEach((p) => properties.add(p as StyleProperty));
  if (checks.includes("radius")) ["borderRadius", "fontSize"].forEach((p) => properties.add(p as StyleProperty));
  if (checks.includes("spacing")) ["padding", "margin"].forEach((p) => properties.add(p as StyleProperty));
  return [...properties];
}

function normalizedRequest(request: PageScanRequest) {
  return {
    selectors: [...(request.selectors ?? [])].sort(),
    checks: [...(request.checks ?? ["tokens", "structure", "axe", "page"] as PageScanCheck[])].sort(),
    tokenChecks: [...(request.tokenChecks ?? ALL_TOKEN_CHECKS)].sort(),
    components: [...(request.components ?? [])].sort(),
    actions: request.actions ?? [],
  };
}

export interface PageScanOptions {
  /**
   * 2.14.0 (NAT-61): perfil sem conhecimento do DS/e-MAG. Só o axe roda (as checagens de tokens,
   * estrutura, anatomia e página aplicam a base), sem a anotação e-MAG, e a cobertura não lista
   * componentes do DS. Nenhum carregador de conhecimento é chamado.
   */
  knowledgeFree?: boolean;
}

export async function scanPage(request: PageScanRequest, cache: PageScanCache, options: PageScanOptions = {}): Promise<PageScanOutcome> {
  if (options.knowledgeFree) return scanPageKnowledgeFree(request, cache);
  const window = oracleViewport();
  const viewport = request.viewport ?? window.viewport;
  return withPage(request.url, async (page): Promise<PageScanOutcome> => {
    const { attestation: state, fingerprint: stateFingerprint } = await reproduceState(page, {
      url: request.url,
      viewport,
      viewportSource: request.viewport ? "cli" : window.source,
      actions: request.actions ?? [],
      ...(request.arrival ? { arrival: request.arrival } : {}),
    });
    if (!state.reached) {
      return { status: "state-not-reached", url: request.url, stateFingerprint: null, state, limitation: unreachedLimitation(state) };
    }
    const normalized = normalizedRequest(request);
    // A chegada é medida de novo a cada chamada (acima); o cache guarda só o que o estado exato determina.
    const cacheKey = hash({ stateFingerprint, ...normalized });
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, state, cacheHit: true };

    const checks = normalized.checks as PageScanCheck[];
    const activeTokenChecks = normalized.tokenChecks as TokenCheck[];
    const specs = getComponentSpecs().components;
    const componentTargets = normalized.components.length ? normalized.components : Object.keys(specs);
    const selectors = normalized.selectors.length ? normalized.selectors : [DEFAULT_SELECTOR];
    const rawFindings: Finding[] = [];
    const observations: Observation[] = [];
    let elementsInspected = 0;
    let componentsFound: string[] = [];

    if (checks.includes("tokens") || checks.includes("structure")) {
      const properties = checks.includes("tokens") ? tokenProperties(activeTokenChecks) : [];
      // 3.4.0 (B8): com seletores explícitos o escopo é a região — a raiz e os seus descendentes.
      const evidence = await inspectPageComputedStyles(page, request.url, selectors, properties, { descendants: normalized.selectors.length > 0 });
      elementsInspected = evidence.count;
      componentsFound = [
        ...new Set(
          evidence.elements.flatMap((element) =>
            element.classes.filter((name) => /^br-[a-z]+$/.test(name)).map((name) => name.slice(3))
          )
        ),
      ];
      if (checks.includes("tokens")) {
        // 3.4.4 (C3/C4/C5): internos de web component do DS, terceiros embutidos pelo DS e elementos não
        // renderizados não geram achado de estilo — viram observação com o motivo (ownership.ts).
        const tokenScope = partitionByOwnership(evidence.elements, true);
        rawFindings.push(
          ...checkTokenCompliance({ url: request.url }, tokenScope.page, getTokenRegistry(), activeTokenChecks)
        );
        observations.push(
          ...demoteToObservations(checkTokenCompliance({ url: request.url }, tokenScope.outside, getTokenRegistry(), activeTokenChecks), tokenScope.outside)
        );
        if (activeTokenChecks.includes("font")) {
          observations.push(...collectTokenObservations({ url: request.url }, tokenScope.page, getTokenRegistry()));
        }
        // 3.4.0 (B5, V-09): texto autoral fora dos controles (`p`, `span`, títulos, células, `hr`) também
        // tem a cor conferida — só a cor, só elementos exibidos, e com a mesma exigência de autoria (cor
        // herdada ou da folha do DS não conta). Com seletores explícitos, os descendentes já entram (B8).
        if (activeTokenChecks.includes("color") && normalized.selectors.length === 0) {
          const text = await inspectPageComputedStyles(page, request.url, TEXT_COLOR_SELECTOR, ["backgroundColor", "color", "borderColor"]);
          const known = new Set(evidence.elements.map((element) => element.locator));
          const authoredText = text.elements.filter((element) => ownershipOf(element) === "page" && !known.has(element.locator));
          elementsInspected += authoredText.length;
          rawFindings.push(...checkTokenCompliance({ url: request.url }, authoredText, getTokenRegistry(), ["color"]));
          // 3.4.4 (revisão, L6): o texto fora da autoria da página (dentro de componente do DS, de terceiros ou
          // oculto neste estado) não some em silêncio — vira observação com o motivo, como nos outros checks.
          const outsideText = text.elements.filter((element) => ownershipOf(element) !== "page" && !known.has(element.locator));
          observations.push(...demoteToObservations(checkTokenCompliance({ url: request.url }, outsideText, getTokenRegistry(), ["color"]), outsideText));
        }
      }
      if (checks.includes("structure")) {
        const structureScope = partitionByOwnership(evidence.elements, false);
        for (const component of componentTargets) {
          const spec = specs[component];
          if (!spec) continue;
          rawFindings.push(...checkComponentStructure({ url: request.url }, structureScope.page, spec));
          const outside = splitOutside(checkComponentStructure({ url: request.url }, structureScope.outside, spec), structureScope.outside);
          rawFindings.push(...outside.findings);
          observations.push(...outside.observations);
          observations.push(...collectStructureObservations({ url: request.url }, evidence.elements, spec));
        }
      }
    }

    // 2.13.0 (NAT-85 P2): anatomia obrigatória ausente — parte do check de estrutura. Lê as raízes
    // (.br-message, .br-header, .br-breadcrumb, .br-modal) no DOM claro e em shadow roots abertos.
    if (checks.includes("structure")) {
      const roots = await inspectPageComputedStyles(page, request.url, ANATOMY_ROOT_SELECTOR, []);
      const facts = await collectAnatomy(page, ANATOMY_ROOT_SELECTOR);
      if (facts.length === roots.count) {
        rawFindings.push(
          ...checkAnatomy(
            { url: request.url },
            roots.elements.map((element, i) => ({ locator: element.locator, snippet: element.outerHTML.slice(0, 300), facts: facts[i] })),
            normalized.components.length ? normalized.components : undefined
          )
        );
      }
    }

    // 2.7.0: regiões obrigatórias do Template Base e salto para o conteúdo — fatos do documento,
    // não de um elemento; a ausência de um rodapé não aparece em evidência por elemento.
    if (checks.includes("page")) {
      rawFindings.push(...checkPageStructure({ url: request.url }, await inspectPageStructure(page, request.url)));
    }

    let axe: PageScanResult["coverage"]["axe"];
    if (checks.includes("axe")) {
      const result = await runAxeScanOnPage(
        page,
        request.url,
        normalized.selectors.length ? normalized.selectors.join(", ") : undefined
      );
      rawFindings.push(...result.findings);
      observations.push(...axeBestPracticeObservations(result.bestPracticeFindings));
      axe = {
        engine: result.engine,
        passes: result.passeCount,
        incomplete: result.incompleteCount,
        ...(result.incompleteRules.length ? { incompleteRules: result.incompleteRules } : {}),
      };
    }

    // 3.4.0 (B9): foco visível — por último, porque dar foco pode disparar reações da página (abrir um
    // calendário, um menu) e nenhum outro check pode ler o estado depois disso. Não é verificação de
    // componente: com `components` restrito, não roda (e checksRun diz isso).
    if (checks.includes("structure") && normalized.components.length === 0) {
      rawFindings.push(...(await focusIndicatorFindings(page, request.url, normalized.selectors)));
    }

    const deduplicated = deduplicateFindings(rawFindings);
    const value: CachedScan = {
      status: "scanned",
      url: request.url,
      stateFingerprint,
      findings: pageLevelFirst(deduplicated.findings),
      observations,
      coverage: {
        checks,
        selectors: normalized.selectors,
        ...(normalized.selectors.length ? { selectorScope: "matched-and-descendants" as const } : {}),
        evidenceSelectors: checks.includes("tokens") || checks.includes("structure") ? selectors : [],
        axeScope: checks.includes("axe")
          ? (normalized.selectors.length ? normalized.selectors.join(", ") : "document")
          : null,
        elementsInspected,
        componentsRequested: componentTargets,
        componentsFound,
        actionsApplied: (request.actions ?? []).map((action) => ({
          action: action.action,
          ...("selector" in action && action.selector ? { selector: action.selector } : {}),
          ...(action.action === "navigate" ? { path: action.path } : {}),
          ...(action.action === "press" ? { key: action.key } : {}),
        })),
        ...(axe ? { axe } : {}),
      },
      deduplication: {
        input: deduplicated.inputCount,
        output: deduplicated.outputCount,
        merged: deduplicated.merged,
        key: deduplicated.key,
      },
    };
    cache.set(cacheKey, value);
    return { ...value, state, cacheHit: false, cacheMissReason: "no-exact-fingerprint-and-scope-match" };
  }, { viewport });
}

/**
 * `scan_page` do perfil knowledge-free (2.14.0, NAT-61, plano §3): a mesma carga, receita, chegada,
 * fingerprint e cache do scanner completo, e só o axe-core com a saída do próprio axe. Fica separado
 * do `scanPage` para que o caminho dos outros perfis não mude em nada.
 */
async function scanPageKnowledgeFree(request: PageScanRequest, cache: PageScanCache): Promise<PageScanOutcome> {
  const window = oracleViewport();
  const viewport = request.viewport ?? window.viewport;
  return withPage(request.url, async (page): Promise<PageScanOutcome> => {
    const { attestation: state, fingerprint: stateFingerprint } = await reproduceState(page, {
      url: request.url,
      viewport,
      viewportSource: request.viewport ? "cli" : window.source,
      actions: request.actions ?? [],
      ...(request.arrival ? { arrival: request.arrival } : {}),
    });
    if (!state.reached) {
      return { status: "state-not-reached", url: request.url, stateFingerprint: null, state, limitation: unreachedLimitation(state) };
    }
    const selectors = [...(request.selectors ?? [])].sort();
    const checks: PageScanCheck[] = ["axe"];
    const cacheKey = hash({ profile: "knowledge-free", stateFingerprint, selectors, checks, actions: request.actions ?? [] });
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, state, cacheHit: true };

    const axeScope = selectors.length ? selectors.join(", ") : undefined;
    const result = await runAxeScanOnPage(page, request.url, axeScope, { emag: false, bestPractice: "inline" });
    const deduplicated = deduplicateFindings(result.findings);
    const value: CachedScan = {
      status: "scanned",
      url: request.url,
      stateFingerprint,
      findings: pageLevelFirst(deduplicated.findings),
      observations: [],
      coverage: {
        checks,
        selectors,
        axeScope: axeScope ?? "document",
        elementsInspected: 0,
        actionsApplied: (request.actions ?? []).map((action) => ({
          action: action.action,
          ...("selector" in action && action.selector ? { selector: action.selector } : {}),
          ...(action.action === "navigate" ? { path: action.path } : {}),
          ...(action.action === "press" ? { key: action.key } : {}),
        })),
        axe: { engine: result.engine, passes: result.passeCount, incomplete: result.incompleteCount, ...(result.incompleteRules.length ? { incompleteRules: result.incompleteRules } : {}) },
      },
      deduplication: {
        input: deduplicated.inputCount,
        output: deduplicated.outputCount,
        merged: deduplicated.merged,
        key: deduplicated.key,
      },
    };
    cache.set(cacheKey, value);
    return { ...value, state, cacheHit: false, cacheMissReason: "no-exact-fingerprint-and-scope-match" };
  }, { viewport });
}
