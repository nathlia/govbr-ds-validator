import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { httpStatusOf, nativeDialogsOf, withPage } from "../evidence/browser.js";
import { DEFAULT_SELECTOR, inspectPageComputedStyles, type StyleProperty } from "../evidence/inspect.js";
import { checkTokenCompliance, collectTokenObservations, ALL_TOKEN_CHECKS, type TokenCheck } from "../checkers/tokenCompliance.js";
import { checkComponentStructure, collectStructureObservations } from "../checkers/structure.js";
import { scanPartTokens, type SpecPartResult } from "../checkers/specPartTokens.js";
import { demoteToObservations, ownershipOf, partitionByOwnership, splitOutside } from "../checkers/ownership.js";
import { runAxeScanOnPage } from "../checkers/axe.js";
import { checkPageStructure } from "../checkers/pageStructure.js";
import { checkFocusIndicators } from "../checkers/focusIndicator.js";
import { FOCUSABLE_SELECTOR, measureFocusIndicators } from "../evidence/focusIndicator.js";
import { ANATOMY_ROOT_SELECTOR, checkAnatomy } from "../checkers/anatomy.js";
import { collectAnatomy } from "../evidence/context.js";
import { inspectPageStructure, type PageFacts } from "../evidence/pageFacts.js";
import { FORM_FIELD_SELECTOR, checkPlaceholderLabels, labelSourceOf } from "../checkers/formLabels.js";
import { CONTROL_SELECTOR, checkDecorativeIcons, isControl } from "../checkers/decorativeIcons.js";
import { checkIconOnlyButtons } from "../checkers/iconOnlyButton.js";
import { SUPPORT_HIDDEN, contrastPending, kbRule, notJudgedFor, type NotJudgedItem } from "./notJudged.js";
import { ARIA_STATE_SELECTOR, SWITCH_ARIA_CHECKED, checkAriaNativeStates } from "../checkers/ariaNativeState.js";
import { componentPartsOf, getComponentSpecs, getTokenRegistry } from "../data/load.js";
import { deduplicateFindings } from "../responses/findings.js";
import type { Finding, Observation } from "../schema/finding.js";
import { applyActions, type Arrival, type PageAction, type ReplayObserver, type ReplayResult, type SyntheticFile } from "./actions.js";
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

/** Texto/separadores adicionais: cor (B5) e observação de tamanho autoral (A8), além de DEFAULT_SELECTOR. */
export const TEXT_COLOR_SELECTOR =
  "p, span, label, li, dt, dd, h1, h2, h3, h4, h5, h6, small, strong, em, b, td, th, caption, legend, figcaption, blockquote, hr";
const TEXT_FONT_SELECTOR = TEXT_COLOR_SELECTOR.replace(/, hr$/, "");
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
  /**
   * 3.6.1 (D-155, item 3): elementos que um scan ANTERIOR da sessão viu ocultos (observação `hiddenInState` de
   * tokens). Interno — o servidor preenche a partir da sessão; não está no esquema MCP. Os que estiverem
   * renderizados agora têm o check que os marcou medido, mesmo que `checks` exclua tokens.
   */
  revisit?: Array<{ locator: string; checker: string; fromScan: string; n: number }>;
}

/** 3.6.1 (item 3): o que aconteceu com cada elemento antes oculto neste estado. */
export interface RevisitItem {
  locator: string;
  checker: string;
  fromScan: string;
  n: number;
  /** measured: renderizado e autoral, medido agora; hidden: segue oculto; outside: fora da autoria; absent: não existe; covered: o scan de tokens já o mediu. */
  now: "measured" | "hidden" | "outside" | "absent" | "covered";
  findings?: string[];
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
    actionsApplied: Array<{ action: PageScanAction["action"]; selector?: string; key?: string; path?: string; files?: SyntheticFile[]; method?: "set-input-files" | "synthetic-drag-events" }>;
  };
  deduplication: {
    input: number;
    output: number;
    merged: number;
    key: string;
  };
  /**
   * 3.5.0 (D-155): o que está nesta página e nenhum check julgou — pendências para o agente (scan/notJudged.ts).
   * Ausente no perfil knowledge-free.
   */
  notJudged?: NotJudgedItem[];
  /** 3.7.6 (item 2): o check de token por parte — elementos comparados e o que ficou de fora, por motivo. */
  specParts?: { measured: number; skipped: Record<string, number> };
  /** 3.6.1 (item 2): título do documento e 1º h1 exibido, lidos no estado do scan (ausente no knowledge-free). */
  document?: { title: string; h1: string | null; mainHeading: string | null };
  /** 3.6.1 (item 3): elementos antes ocultos, revisitados neste estado. */
  revisited?: RevisitItem[];
  /**
   * 3.7.8 (leitura dev-374-a2 §5 item 4): por componente encontrado, se alguma instância tem caixa neste estado e, quando
   * TODAS as instâncias estão dentro de um hospedeiro cujo exemplo oficial as traz, esse hospedeiro (o mais externo).
   * Só ordena o investigate; nunca sai na resposta. Ausente no perfil knowledge-free.
   */
  componentLayout?: ComponentLayout;
}

export type ComponentLayout = Record<string, { visible: boolean; partOf?: string }>;

/**
 * 3.7.8 (N3): o texto de apoio visível de cada campo de arquivo — o que `aria-describedby` aponta e, no componente do DS,
 * o texto logo depois do `.br-upload` (onde os exemplos oficiais o põem). Só texto com caixa; nada → ausente.
 */
// SUPPORT_HIDDEN vem de notJudged (o mesmo marcador nos dois lados).

/**
 * 3.7.8 (N1): para cada elemento oculto, o contêiner que o esconde (o ancestral mais alto ainda sem caixa) e o controle
 * que o mostra, quando a marcação o declara: um único elemento com `aria-controls` contendo o id do contêiner, `data-target`
 * / `data-bs-target` / `href` apontando para `#id`, ou o irmão anterior do contêiner com `aria-expanded`. Seletor do
 * controle: `#id` dele, ou o próprio seletor de atributo (único). Sem isso, `trigger: null` (o agente acha o gatilho).
 */
export async function revealRecipes(page: Page, locators: string[]): Promise<Record<string, { container: string; trigger: string | null }>> {
  return page.evaluate((locators: string[]) => {
    const out: Record<string, { container: string; trigger: string | null }> = {};
    const notShown = (n: Element) => n.getClientRects().length === 0 || getComputedStyle(n).visibility === "hidden";
    const esc = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`));
    const unique = (selector: string): Element | null => {
      try {
        const found = document.querySelectorAll(selector);
        return found.length === 1 ? found[0] : null;
      } catch {
        return null;
      }
    };
    for (const locator of locators) {
      if (locator.includes(">>>")) continue;
      let el: Element | null = null;
      try { el = document.querySelector(locator); } catch { continue; }
      if (!el || !notShown(el)) continue;
      let c: Element = el;
      while (c.parentElement && c.parentElement !== document.body && notShown(c.parentElement)) c = c.parentElement;
      const id = c.id;
      let trigger: string | null = null;
      if (id) {
        const attrs = [`[aria-controls~="${id}"]`, `[data-target="#${id}"]`, `[data-target="${id}"]`, `[data-bs-target="#${id}"]`, `[href="#${id}"]`];
        for (const a of attrs) {
          const t = unique(a);
          if (t && t !== c && !c.contains(t)) {
            trigger = t.id ? `#${esc(t.id)}` : a;
            break;
          }
        }
      }
      if (!trigger) {
        const prev = c.previousElementSibling;
        if (prev && prev.hasAttribute("aria-expanded") && prev.id && unique(`#${esc(prev.id)}`)) trigger = `#${esc(prev.id)}`;
      }
      out[locator] = { container: id ? `#${esc(id)}` : locator, trigger };
    }
    return out;
  }, locators);
}
export async function fileInputSupport(page: Page, locators: string[]): Promise<Record<string, string>> {
  return page.evaluate(({ locators, HIDDEN }: { locators: string[]; HIDDEN: string }) => {
    const shown = (el: Element | null) => Boolean(el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
    const text = (el: Element | null) => (el && shown(el) ? ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim() : "");
    const out: Record<string, string> = {};
    for (const locator of locators) {
      if (locator.includes(">>>")) continue;
      let input: Element | null = null;
      try { input = document.querySelector(locator); } catch { continue; }
      if (!input) continue;
      const parts: string[] = [];
      const host = input.closest(".br-upload") ?? input.parentElement;
      const candidates = [
        ...(input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)),
        host?.nextElementSibling ?? null,
      ].filter((el): el is Element => el !== null && (el.textContent ?? "").trim().length > 0);
      for (const el of candidates) {
        const t = text(el);
        if (t && !parts.includes(t)) parts.push(t);
      }
      // o texto existe mas não aparece neste estado (aba inativa, região recolhida): diz isso, não "nenhum apoio".
      if (parts.length) out[locator] = parts.join(" | ").slice(0, 200);
      else if (candidates.length) out[locator] = HIDDEN;
    }
    return out;
  }, { locators, HIDDEN: SUPPORT_HIDDEN });
}

/**
 * 3.7.8 (item 4): visibilidade e hospedeiro de cada componente encontrado, lidos no DOM (claro e shadow roots abertos) do
 * estado alcançado. Componente que o DOM não devolve (só a evidência o viu) fica visível e sem hospedeiro: a ordem antiga.
 */
export async function componentLayoutOf(page: Page, found: string[]): Promise<ComponentLayout> {
  if (!found.length) return {};
  const parts = componentPartsOf();
  const raw = await page.evaluate(({ found, parts }: { found: string[]; parts: Record<string, string[]> }) => {
    const wanted = new Set(found);
    const out: Record<string, { n: number; visible: number; hosts: Array<string | null> }> = {};
    const rootClasses = (el: Element) => Array.from(el.classList).filter((c) => /^br-[a-z]+$/.test(c)).map((c) => c.slice(3));
    const parentOf = (el: Element): Element | null => el.parentElement ?? ((el.parentNode as ShadowRoot | null)?.host ?? null);
    const visit = (root: Document | ShadowRoot) => {
      for (const el of Array.from(root.querySelectorAll("*"))) {
        if (el.shadowRoot) visit(el.shadowRoot);
        for (const c of rootClasses(el)) {
          if (!wanted.has(c)) continue;
          const o = (out[c] ??= { n: 0, visible: 0, hosts: [] });
          o.n += 1;
          const style = getComputedStyle(el);
          if (el.getClientRects().length > 0 && style.visibility !== "hidden" && style.visibility !== "collapse") o.visible += 1;
          // o hospedeiro mais externo cujo exemplo oficial traz este componente
          let host: string | null = null;
          for (let a = parentOf(el); a; a = parentOf(a)) for (const h of rootClasses(a)) if (h !== c && (parts[h] ?? []).includes(c)) host = h;
          o.hosts.push(host);
        }
      }
    };
    visit(document);
    return out;
  }, { found, parts });
  const layout: ComponentLayout = {};
  for (const c of found) {
    const r = raw[c];
    if (!r) {
      layout[c] = { visible: true };
      continue;
    }
    const hosts = [...new Set(r.hosts)];
    const partOf = hosts.length === 1 && hosts[0] && found.includes(hosts[0]) ? hosts[0] : undefined;
    layout[c] = { visible: r.visible > 0, ...(partOf ? { partOf } : {}) };
  }
  return layout;
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
  const rank = (f: Finding) => (f.rule.checker?.startsWith("ds-page-") || f.rule.source === "govbr-ds-page" ? 0 : f.element.locator === "html" ? 1 : 2);
  return findings.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map(({ f }) => f);
}

/** Regras do axe que reprovam controle sem nome acessível — a mesma condição da estrutura "só ícone". */
const AXE_NAME_RULES = new Set(["button-name", "link-name", "aria-command-name", "input-button-name"]);

/**
 * 3.5.0 (revisão Fable P5): achados de nome acessível da estrutura (só ícone) cujo elemento o axe já reprovou
 * por uma regra de nome. Os localizadores têm formatos diferentes (o do axe e o do inspect); a identidade é
 * decidida no navegador, resolvendo os dois até o nó.
 */
async function sameElementDuplicates(page: Page, findings: Finding[]): Promise<Set<Finding>> {
  const structural = findings.filter((f) => f.rule.source !== "axe-core" && f.evidence.data?.hasIconOnly === true);
  const axeNames = findings.filter((f) => f.rule.source === "axe-core" && AXE_NAME_RULES.has(f.rule.id));
  if (!structural.length || !axeNames.length) return new Set();
  const same = await page.evaluate(
    ({ a, b, step }: { a: string[]; b: string[]; step: string }) => {
      const resolve = (locator: string): Element | null => {
        try {
          let roots: Array<Document | ShadowRoot> = [document];
          let found: Element[] = [];
          const hops = locator.split(` ${step} `);
          hops.forEach((hop, i) => {
            found = roots.flatMap((r) => Array.from(r.querySelectorAll(hop)));
            if (i < hops.length - 1) roots = found.map((el) => el.shadowRoot).filter((r): r is ShadowRoot => Boolean(r));
          });
          return found.length === 1 ? found[0] : null;
        } catch {
          return null;
        }
      };
      const axeEls = b.map(resolve).filter((el): el is Element => el !== null);
      return a.map((loc) => {
        const el = resolve(loc);
        return el !== null && axeEls.includes(el);
      });
    },
    { a: structural.map((f) => f.element.locator), b: axeNames.map((f) => f.element.locator), step: ">>>" },
  );
  return new Set(structural.filter((_, i) => same[i]));
}

/**
 * Tabelas exibidas sem nome (caption, aria-label, aria-labelledby, title) — a pendência `table-name`. 3.6.5: função
 * própria, para que o exemplo canônico do componente seja conferido pela MESMA leitura que a página.
 */
export function unnamedTablesOf(tableEvidence: Awaited<ReturnType<typeof inspectPageComputedStyles>>["elements"], facts: PageFacts, scoped: boolean): string[] {
  const tableFacts = facts.tables ?? [];
  return scoped || tableFacts.length !== tableEvidence.length
    // escopo ou contagens diferentes: a leitura por localizador decide (caption não é colhido; nome por atributos).
    ? tableEvidence.filter((el) => el.rendered !== false && !["presentation", "none"].includes((el.attributes.role ?? "").toLowerCase()) &&
        !/<caption[\s>]/i.test(el.outerHTML) && !el.attributes.ariaLabel?.trim() && !el.content.labelledbyText?.trim() && !el.attributes.title?.trim()).map((el) => el.locator)
    : tableEvidence.filter((_, i) => tableFacts[i].rendered && !tableFacts[i].presentational && !tableFacts[i].named).map((el) => el.locator);
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

const TOKEN_CHECK_OF: Record<string, TokenCheck> = {
  "ds-token-color": "color",
  "ds-token-font-family": "font",
  "ds-token-radius": "radius",
  "ds-token-spacing": "spacing",
};

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
    const revisit = (request.revisit ?? []).filter((r) => TOKEN_CHECK_OF[r.checker]);
    // A chegada é medida de novo a cada chamada (acima); o cache guarda só o que o estado exato determina.
    // 3.6.1: a lista de revisita entra na chave só quando existe (as chaves de sempre não mudam).
    const cacheKey = hash({ stateFingerprint, ...normalized, ...(revisit.length ? { revisit: revisit.map((r) => [r.locator, r.checker, r.fromScan, r.n]) } : {}) });
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
    let componentLayout: ComponentLayout | undefined;
    let specParts: SpecPartResult | undefined;
    /** 3.6.1: localizadores que o check de tokens mediu neste scan (para não revisitar o que já foi medido). */
    const tokenMeasured = new Map<string, Set<TokenCheck>>();
    const markTokensMeasured = (locator: string, measured: TokenCheck[]) => {
      const kinds = tokenMeasured.get(locator) ?? new Set<TokenCheck>();
      for (const kind of measured) kinds.add(kind);
      tokenMeasured.set(locator, kinds);
    };

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
      componentLayout = await componentLayoutOf(page, componentsFound);
      if (checks.includes("tokens")) {
        // 3.4.4 (C3/C4/C5): internos de web component do DS, terceiros embutidos pelo DS e elementos não
        // renderizados não geram achado de estilo — viram observação com o motivo (ownership.ts).
        const tokenScope = partitionByOwnership(evidence.elements, true);
        for (const element of tokenScope.page) markTokensMeasured(element.locator, activeTokenChecks);
        rawFindings.push(
          ...checkTokenCompliance({ url: request.url }, tokenScope.page, getTokenRegistry(), activeTokenChecks)
        );
        observations.push(
          ...demoteToObservations(checkTokenCompliance({ url: request.url }, tokenScope.outside, getTokenRegistry(), activeTokenChecks), tokenScope.outside)
        );
        if (activeTokenChecks.includes("font")) {
          observations.push(...collectTokenObservations({ url: request.url }, tokenScope.page, getTokenRegistry()));
        }
        // A8: tamanho fora da escala em títulos/texto autoral é observação, nunca achado (D-32).
        // Com seletores explícitos os descendentes já entram; não ampliar o escopo pedido.
        if ((activeTokenChecks.includes("color") || activeTokenChecks.includes("font")) && normalized.selectors.length === 0) {
          const color = activeTokenChecks.includes("color");
          const font = activeTokenChecks.includes("font");
          const properties: StyleProperty[] = [...(color ? ["backgroundColor", "color", "borderColor"] as StyleProperty[] : []), ...(font ? ["fontSize"] as StyleProperty[] : [])];
          const text = await inspectPageComputedStyles(page, request.url, color ? TEXT_COLOR_SELECTOR : TEXT_FONT_SELECTOR, properties, { renderedText: font });
          const known = new Set(evidence.elements.map((element) => element.locator));
          const authoredText = text.elements.filter((element) => ownershipOf(element) === "page" && !known.has(element.locator));
          elementsInspected += authoredText.length;
          if (font) observations.push(...collectTokenObservations({ url: request.url }, authoredText.filter(element => element.tagName.toLowerCase() !== "hr" && element.content.hasRenderedText === true), getTokenRegistry()));
          if (color) {
            for (const element of authoredText) markTokensMeasured(element.locator, ["color"]);
            rawFindings.push(...checkTokenCompliance({ url: request.url }, authoredText, getTokenRegistry(), ["color"]));
            // 3.4.4 (revisão, L6): cor fora da autoria da página conserva motivo e norma como observação.
            const outsideText = text.elements.filter((element) => ownershipOf(element) !== "page" && !known.has(element.locator));
            observations.push(...demoteToObservations(checkTokenCompliance({ url: request.url }, outsideText, getTokenRegistry(), ["color"]), outsideText));
          }
        }
      }
      // 3.7.6 (item 2): token por parte de componente × tabela de especificação (observação, nunca achado). Só na página
      // inteira (com seletores, o escopo é a região pedida) e com o check de fonte.
      if (checks.includes("tokens") && activeTokenChecks.includes("font") && normalized.selectors.length === 0) {
        specParts = await scanPartTokens(page, request.url, componentsFound.filter((c) => componentTargets.includes(c)));
        observations.push(...specParts.observations);
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
      // 3.7.8 (N1): desvio de estilo autoral medido em conteúdo OCULTO (menu fechado, diálogo fechado) — o contêiner que o
      // esconde e, quando o DOM o diz (aria-controls / data-target / href para o id, ou o irmão anterior com
      // aria-expanded), o controle que o mostra. Vai na observação; a pendência O-NN leva a receita.
      const hidden = observations.filter((o) => (o.data as { hiddenInState?: unknown } | undefined)?.hiddenInState === true);
      if (hidden.length) {
        const reveal = await revealRecipes(page, [...new Set(hidden.map((o) => o.element.locator))]);
        for (const o of hidden) {
          const r = reveal[o.element.locator];
          if (r) o.data = { ...(o.data ?? {}), reveal: r };
        }
      }
    }

    // 3.6.1 (D-155, item 3): elementos ocultos num scan anterior. Os renderizados agora têm medido o check de
    // tokens que os marcou (só esse subcheck, como na passada original), mesmo com `checks` sem tokens.
    let revisited: RevisitItem[] | undefined;
    /** 3.6.2: os achados da revisita entram DEPOIS dos achados dos checks pedidos (são extra; não deslocam famílias). */
    const revisitFindings: Finding[] = [];
    if (revisit.length) {
      const covered = (r: (typeof revisit)[number]) =>
        checks.includes("tokens") && activeTokenChecks.includes(TOKEN_CHECK_OF[r.checker]) && tokenMeasured.get(r.locator)?.has(TOKEN_CHECK_OF[r.checker]);
      const todo = revisit.filter((r) => !covered(r));
      const evidence = todo.length
        ? await inspectPageComputedStyles(page, request.url, [...new Set(todo.map((r) => r.locator))], ["backgroundColor", "color", "borderColor", "fontFamily", "fontSize", "borderRadius", "padding", "margin"])
        : { elements: [] as Awaited<ReturnType<typeof inspectPageComputedStyles>>["elements"] };
      const byLocator = new Map(evidence.elements.map((element) => [element.locator, element]));
      revisited = revisit.map((r) => {
        const base = { locator: r.locator, checker: r.checker, fromScan: r.fromScan, n: r.n };
        if (covered(r)) return { ...base, now: "covered" as const };
        const element = byLocator.get(r.locator);
        if (!element) return { ...base, now: "absent" as const };
        const own = ownershipOf(element);
        if (own !== "page") return { ...base, now: own === "not-rendered" ? ("hidden" as const) : ("outside" as const) };
        const found = checkTokenCompliance({ url: request.url }, [element], getTokenRegistry(), [TOKEN_CHECK_OF[r.checker]]);
        revisitFindings.push(...found);
        return { ...base, now: "measured" as const, findings: found.map((f) => f.id) };
      });
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
    // 3.5.0: os fatos do documento são lidos sempre — também alimentam as pendências (notJudged).
    const facts: PageFacts = await inspectPageStructure(page, request.url);
    if (checks.includes("page")) {
      // 3.6.5: a evidência da ordem de foco é a mesma em todo estado (um diff entre estados não a dá como mudada); o
      // Tab a partir do carregamento só é dado como passo numa receita sem ações — decidido na projeção (interactionOf).
      rawFindings.push(...checkPageStructure({ url: request.url }, facts));
    }

    // 3.5.0 (D-155, 4a): campos de formulário — de onde vem o rótulo. Com seletores, só os do escopo.
    const scoped = normalized.selectors.length > 0;
    // 3.5.0 (revisão, LOW): num scan com seletores, uma leitura só da região serve campos, controles e tabelas.
    const region = scoped ? (await inspectPageComputedStyles(page, request.url, selectors, [], { descendants: true })).elements : [];
    const fieldEvidence = scoped
      ? region.filter((el) => ["input", "textarea", "select"].includes(el.tagName))
      : (await inspectPageComputedStyles(page, request.url, FORM_FIELD_SELECTOR, [])).elements;
    const placeholderChecked = checks.includes("structure") && normalized.components.length === 0;
    // 3.7.2 (D-166): os botões só com ícone que o C01 não acusa por serem parte de outro componente do DS (candidatos).
    let embeddedIconButtons: NonNullable<Parameters<typeof notJudgedFor>[0]["embeddedIconButtons"]> = [];
    let ariaStates: NotJudgedItem[] = [];
    if (placeholderChecked) {
      const labels = checkPlaceholderLabels({ url: request.url }, fieldEvidence);
      rawFindings.push(...labels.findings);
      observations.push(...labels.observations);
      // 3.5.0 (C03): ícone decorativo exposto e title que repete o link.
      const controls = scoped ? region.filter(isControl) : (await inspectPageComputedStyles(page, request.url, CONTROL_SELECTOR, [])).elements;
      const icons = checkDecorativeIcons({ url: request.url }, controls);
      rawFindings.push(...icons.findings);
      observations.push(...icons.observations);
      // 3.7.0 (C01): botão do DS só com ícone fora da variante circular (o rótulo é obrigatório; a exceção é o circular).
      // 3.7.0 (revisão, lacuna B): e os hosts <br-button> do web component do DS, julgados pela API do host.
      const buttonHosts = scoped ? region.filter((el) => el.tagName === "br-button") : (await inspectPageComputedStyles(page, request.url, "br-button", [])).elements;
      const iconOnly = checkIconOnlyButtons({ url: request.url }, [...controls, ...buttonHosts]);
      rawFindings.push(...iconOnly.findings);
      observations.push(...iconOnly.observations);
      embeddedIconButtons = iconOnly.candidates;
      // 3.7.3 A8: atributo de estado ARIA × estado nativo vivo, no estado alcançado (checkers/ariaNativeState.ts).
      const ariaEvidence = scoped
        ? region.filter((el) => el.nativeState !== undefined)
        : (await inspectPageComputedStyles(page, request.url, ARIA_STATE_SELECTOR, [])).elements;
      const aria = checkAriaNativeStates({ url: request.url }, ariaEvidence, { switchRule: kbRule(SWITCH_ARIA_CHECKED) });
      rawFindings.push(...aria.findings);
      observations.push(...aria.observations);
      ariaStates = aria.pending;
    }
    const tableEvidence = scoped ? region.filter((el) => el.tagName === "table") : (await inspectPageComputedStyles(page, request.url, "table", [])).elements;
    const unnamedTables = unnamedTablesOf(tableEvidence, facts, scoped);

    let axe: PageScanResult["coverage"]["axe"];
    let contrastIncomplete: Awaited<ReturnType<typeof runAxeScanOnPage>>["contrastIncomplete"] | undefined;
    if (checks.includes("axe")) {
      const result = await runAxeScanOnPage(
        page,
        request.url,
        normalized.selectors.length ? normalized.selectors.join(", ") : undefined
      );
      rawFindings.push(...result.findings);
      // 3.5.0 (revisão Fable P5): o mesmo controle sem nome visto pelo axe (button-name & cia.) e pela
      // estrutura (só ícone) é um defeito só — fica o do axe; o da estrutura sai do lote.
      const duplicates = await sameElementDuplicates(page, rawFindings);
      // 3.6.1 (item 2): título vazio visto pelo axe (document-title) e pelo check de página é um defeito só — fica o do axe.
      if (result.findings.some((f) => f.rule.id === "document-title")) {
        for (const f of rawFindings) if (f.rule.checker === "ds-page-title") duplicates.add(f);
      }
      if (duplicates.size) {
        const kept = rawFindings.filter((f) => !duplicates.has(f));
        rawFindings.length = 0;
        rawFindings.push(...kept);
      }
      axe = {
        engine: result.engine,
        passes: result.passeCount,
        incomplete: result.incompleteCount,
        ...(result.incompleteRules.length ? { incompleteRules: result.incompleteRules } : {}),
      };
      contrastIncomplete = result.contrastIncomplete;
    }

    // 3.4.0 (B9): foco visível — por último, porque dar foco pode disparar reações da página (abrir um
    // calendário, um menu) e nenhum outro check pode ler o estado depois disso. Não é verificação de
    // componente: com `components` restrito, não roda (e checksRun diz isso).
    if (checks.includes("structure") && normalized.components.length === 0) {
      rawFindings.push(...(await focusIndicatorFindings(page, request.url, normalized.selectors)));
    }

    rawFindings.push(...revisitFindings);
    const deduplicated = deduplicateFindings(rawFindings);
    const fileFields = fieldEvidence.filter((el) => el.tagName === "input" && (el.attributes.type ?? "").toLowerCase() === "file");
    const supportOf = fileFields.length ? await fileInputSupport(page, fileFields.map((el) => el.locator)) : {};
    const fileInputs = fileFields.map((el) => ({
      locator: el.locator,
      accept: /\saccept\s*=\s*"([^"]*)"/i.exec(el.outerHTML.split(">")[0])?.[1]?.trim() || null,
      support: supportOf[el.locator] ?? null,
    }));
    const notJudged = notJudgedFor({
      facts,
      pageWide: !scoped,
      fields: fieldEvidence.map((el) => ({ locator: el.locator, source: labelSourceOf(el) })),
      unnamedTables,
      placeholderChecked,
      axeRan: checks.includes("axe"),
      ...(contrastIncomplete ? { contrastIncomplete } : {}),
      ...(embeddedIconButtons.length ? { embeddedIconButtons } : {}),
      ...(ariaStates.length ? { ariaStates } : {}),
      // 3.7.8 (item 5; N3): campos de arquivo do escopo — o caminho de erro, o arrasto e o texto de apoio ficam como pendência.
      fileInputs,
    });
    const value: CachedScan = {
      status: "scanned",
      url: request.url,
      stateFingerprint,
      findings: pageLevelFirst(deduplicated.findings),
      observations,
      ...(notJudged.length ? { notJudged } : {}),
      ...(specParts ? { specParts: { measured: specParts.measured, skipped: specParts.skipped } } : {}),
      ...(componentLayout ? { componentLayout } : {}),
      document: { title: facts.title ?? "", h1: facts.h1 ?? null, mainHeading: facts.mainHeading ?? null },
      ...(revisited ? { revisited } : {}),
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
          ...("files" in action ? { files: action.files.map((file) => ({ ...file })), method: action.action === "upload" ? "set-input-files" as const : "synthetic-drag-events" as const } : {}),
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
    // 3.6.1 (item 5): contraste que o axe não decidiu, como pendência — só o critério WCAG, nada da base.
    const contrast = contrastPending(result.contrastIncomplete, true);
    // 3.7.3 A8: a mesma medida ARIA × nativo, sem nada da base (sem Switch do DS, cláusula ou autoria do DS): pendências.
    const ariaEvidence = selectors.length
      ? (await inspectPageComputedStyles(page, request.url, selectors, [], { descendants: true })).elements.filter((el) => el.nativeState !== undefined)
      : (await inspectPageComputedStyles(page, request.url, ARIA_STATE_SELECTOR, [])).elements;
    const aria = checkAriaNativeStates({ url: request.url }, ariaEvidence, { knowledgeFree: true });
    const notJudged = [...(contrast ? [contrast] : []), ...aria.pending];
    const value: CachedScan = {
      status: "scanned",
      url: request.url,
      stateFingerprint,
      findings: pageLevelFirst(deduplicated.findings),
      observations: [],
      ...(notJudged.length ? { notJudged } : {}),
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
          ...("files" in action ? { files: action.files.map((file) => ({ ...file })), method: action.action === "upload" ? "set-input-files" as const : "synthetic-drag-events" as const } : {}),
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
