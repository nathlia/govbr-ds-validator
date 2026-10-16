/**
 * Fatos de contexto (2.13.0, NAT-85): o que os predicados de associação (P1), anatomia (P2) e
 * transição de foco (P3) precisam ler na página reproduzida, além do estilo computado.
 *
 * Três coletas, todas no mesmo navegador e no mesmo estado do portão:
 *
 *   traço      antes da 1ª ação e depois de cada ação da receita: foco profundo (atravessa shadow
 *              roots abertos), sujeitos do localizador (exibido? foco dentro? fechar/primária/campos
 *              /focáveis), cores do sujeito, texto visível. Elementos ganham um número estável
 *              enquanto o documento vive (registro no `window`); navegação troca o documento e o
 *              número, e o predicado vê isso como "novo contexto".
 *   AX         no estado final, o que o Chromium expõe de cada sujeito (nome, descrição, invalid) e os
 *              IDREFs de descrição/erro resolvidos na MESMA árvore (documento ou shadow root).
 *   anatomia   no estado final, as partes de cada raiz de componente (Message, Header, Breadcrumb,
 *              Modal) lidas pelas classes do @govbr-ds/core.
 *
 * Nada aqui decide violação: os predicados puros (verify/contextual.ts) decidem sobre estes fatos.
 * O localizador segue o contrato de `inspect.ts`: ` >>> ` atravessa shadow roots um a um; sem ele, a
 * busca percorre o documento e todo shadow root aberto, na mesma ordem.
 */
import type { Page } from "playwright";
import type { PageAction } from "../scan/actions.js";

export interface SubjectSnapshot {
  /** Número do elemento no registro do documento (estável enquanto o documento vive). */
  ref: number;
  shown: boolean;
  /** Texto visível do sujeito (árvore composta), normalizado em espaços, até 500 caracteres. */
  text: string;
  /** Cores de borda, contorno, fundo e sombra — para "o campo mudou de aparência". */
  colors: string;
  focusInside: boolean;
  modal: boolean;
  closeRefs: number[];
  primaryRefs: number[];
  formFieldRefs: number[];
  /** Focáveis visíveis em ordem composta (o último decide o laço do Tab). */
  tabbableRefs: number[];
  /** O sujeito, um ancestral ou um descendente é região viva (role alert/status/log ou aria-live polite/assertive). */
  liveRegion: boolean;
  /** Validação nativa ativa e falhando (o balão do navegador não está no DOM). */
  nativeInvalid?: boolean;
  classes: string[];
}

export interface TraceObservation {
  /** -1 = antes da primeira ação; i = depois da ação i. */
  step: number;
  url: string;
  /** Muda quando o documento muda (navegação). */
  documentToken: string;
  /** Elemento com foco (profundo); null = body/nenhum. */
  active: number | null;
  activeDescription: string | null;
  /** Alvo da próxima ação quando ela tem seletor de exatamente um elemento (o Playwright o foca antes de agir). */
  nextTarget: number | null;
  subjects: SubjectSnapshot[];
  /** Elemento nomeado em `evidence.data.errorMessage`, quando pedido. */
  message: { found: number; shown: boolean; text: string } | null;
  /** Trechos de texto visíveis no documento, quando pedido. */
  visibleText?: string[];
  /** Números registrados que já não estão no documento. */
  disconnected: number[];
  /**
   * O foco ficou parado por `FOCUS_STABILITY.quietMs` antes da leitura. `false`: ainda mudava no teto
   * (um `setTimeout(() => x.focus())` tardio). Ausente quando o predicado não pediu foco.
   */
  focusStable?: boolean;
  error?: string;
}

export interface TraceRequest {
  subject: string;
  message?: string;
  text?: boolean;
  /** Espera o foco ficar parado antes de observar (predicados de foco). */
  focus?: boolean;
}

/** Janela de quietude do foco: sem mudança por quietMs, teto capMs (2.13.0, revisão). */
export const FOCUS_STABILITY = { quietMs: 400, capMs: 2_000, intervalMs: 50 } as const;

export interface AccessibilityFacts {
  /** Número do elemento no registro do documento — o mesmo das observações do traço. */
  ref: number;
  /** null: o Chromium ignora o elemento na árvore ou não há CDP. */
  ax: { name: string; description: string; invalid: boolean } | null;
  idrefs: Array<{ attribute: string; ids: string[]; missing: string[] }>;
  tag: string;
}

export interface AnatomyFacts {
  classes: string[];
  shown: boolean;
  /** Há descendente custom element opaco (definido, sem shadow root aberto, sem conteúdo claro). */
  opaque: boolean;
  messageText: string[];
  header: { titleText: string; logoVisible: boolean; infoText: string };
  /**
   * `linksToCurrent`: o item é link cujo href resolve para esta mesma página (origem + caminho +
   * query); um `href="#"` sozinho é marcador sem destino e não conta. `h1`: o primeiro h1 visível
   * do conteúdo principal (`main`/`[role=main]`); sem conteúdo principal, o primeiro fora de
   * cabeçalho, diálogo e modal.
   */
  breadcrumb: { items: Array<{ text: string; link: boolean; current: boolean; linksToCurrent: boolean }>; h1: string | null; title: string };
  modal: { buttons: number; closeButtons: number; bodyFound: number; bodyContent: boolean };
}

/** Instala (uma vez por documento) as funções de leitura no `window` da página. */
function installHelpers(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__govbrCtx) return;
  const SHADOW_STEP = ">>>";
  const els: Element[] = [];
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function ref(el: Element): number {
    const i = els.indexOf(el);
    if (i >= 0) return i;
    els.push(el);
    return els.length - 1;
  }
  function deepQueryAll(selector: string): Element[] {
    if (selector.includes(SHADOW_STEP)) {
      const hops = selector.split(SHADOW_STEP).map((s) => s.trim()).filter(Boolean);
      let roots: (Document | ShadowRoot)[] = [document];
      let found: Element[] = [];
      hops.forEach((hop, i) => {
        found = roots.flatMap((root) => Array.from(root.querySelectorAll(hop)));
        if (i < hops.length - 1) roots = found.map((el) => el.shadowRoot).filter((r): r is ShadowRoot => r !== null);
      });
      return found;
    }
    const out: Element[] = [];
    const visit = (root: Document | ShadowRoot) => {
      out.push(...Array.from(root.querySelectorAll(selector)));
      for (const el of Array.from(root.querySelectorAll("*"))) if (el.shadowRoot) visit(el.shadowRoot);
    };
    visit(document);
    return out;
  }
  function composedElements(root: Element): Element[] {
    const out: Element[] = [];
    const walk = (node: Element | ShadowRoot) => {
      if (node instanceof Element && node.shadowRoot) walk(node.shadowRoot);
      for (const child of Array.from(node.children)) {
        out.push(child);
        walk(child);
      }
    };
    walk(root);
    return out;
  }
  function visible(el: Element): boolean {
    if (!el.isConnected) return false;
    const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
    if (check && !check.call(el, { checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function norm(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }
  function textChunks(root: Element, exclude: (el: Element) => boolean): string[] {
    const out: string[] = [];
    const walk = (node: Node) => {
      if (node instanceof Element) {
        if (exclude(node)) return;
        if (node.shadowRoot) node.shadowRoot.childNodes.forEach(walk);
        node.childNodes.forEach(walk);
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const value = norm(node.textContent ?? "");
        const parent = node.parentElement ?? ((node.parentNode as ShadowRoot | null)?.host ?? null);
        if (value && parent && visible(parent)) out.push(value);
      }
    };
    walk(root);
    return out;
  }
  /**
   * Exibido: renderizado (sem display:none, visibility:hidden, opacity 0 na cadeia) e com algo
   * visível dentro — texto ou descendente com caixa. A raiz pode ter altura 0 (o painel do
   * `.br-menu` é posicionado fora do fluxo), por isso a caixa da raiz não decide.
   */
  function shown(el: Element): boolean {
    if (!el.isConnected) return false;
    const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
    if (check && !check.call(el, { checkOpacity: true, checkVisibilityCSS: true })) return false;
    if (textChunks(el, () => false).length > 0) return true;
    return composedElements(el).some((child) => visible(child));
  }
  function deepActive(): Element | null {
    let a: Element | null = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    if (!a || a === document.body || a === document.documentElement) return null;
    return a;
  }
  function composedParent(el: Element): Element | null {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }
  function inside(container: Element, el: Element | null): boolean {
    let cur: Element | null = el;
    while (cur) {
      if (cur === container) return true;
      cur = composedParent(cur);
    }
    return false;
  }
  function describe(el: Element | null): string | null {
    if (!el) return null;
    const id = el.id ? `#${el.id}` : "";
    const cls = Array.from(el.classList).slice(0, 3).map((c) => `.${c}`).join("");
    const text = norm(el.textContent ?? "").slice(0, 40);
    return `<${el.tagName.toLowerCase()}${id}${cls}>${text ? ` "${text}"` : ""}`;
  }
  function colors(el: Element): string {
    const s = getComputedStyle(el);
    return [s.borderTopColor, s.borderBottomColor, s.borderLeftColor, s.outlineStyle === "none" ? "" : s.outlineColor, s.backgroundColor, s.boxShadow].join("|");
  }
  function isModal(el: Element): boolean {
    const role = el.getAttribute("role");
    return el.classList.contains("br-modal") || role === "dialog" || role === "alertdialog" || el.tagName.toLowerCase() === "dialog" || el.getAttribute("aria-modal") === "true";
  }
  const CONTROL = "button, [role='button'], a[href], input[type='button'], input[type='submit']";
  function isClose(el: Element, root: Element): boolean {
    let cur: Element | null = el;
    while (cur) {
      if (Array.from(cur.classList).some((c) => c === "close" || c.endsWith("-close"))) return true;
      if (cur === root) return false;
      cur = composedParent(cur);
    }
    return false;
  }
  function controls(root: Element): Element[] {
    return composedElements(root).filter((el) => el.matches(CONTROL) && visible(el));
  }
  function closeButtons(root: Element): Element[] {
    return controls(root).filter((el) => isClose(el, root));
  }
  function primaryButtons(root: Element): Element[] {
    return controls(root).filter((el) => el.classList.contains("primary") && !isClose(el, root));
  }
  function formFields(root: Element): Element[] {
    return composedElements(root).filter((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "select" || tag === "textarea") return visible(el);
      if (tag !== "input") return false;
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      return !["hidden", "button", "submit", "reset", "image"].includes(type) && visible(el);
    });
  }
  function tabbables(root: Element): Element[] {
    return composedElements(root).filter((el) => {
      const tabindex = el.getAttribute("tabindex");
      if (tabindex !== null && Number(tabindex) < 0) return false;
      if ((el as HTMLButtonElement).disabled) return false;
      const focusable = el.matches("a[href], button, input:not([type='hidden']), select, textarea, [tabindex]");
      return focusable && visible(el);
    });
  }
  // Regiões vivas explícitas e implícitas: os papéis alert/status/log/timer/marquee (WAI-ARIA, todos
  // papéis de região viva) e <output> (papel implícito status, HTML-AAM).
  const LIVE_ROLES = ["alert", "status", "log", "timer", "marquee"];
  function isLive(el: Element): boolean {
    const role = el.getAttribute("role");
    const live = el.getAttribute("aria-live");
    if (live === "off") return false;
    if (role !== null) return LIVE_ROLES.includes(role) || live === "polite" || live === "assertive";
    return el.tagName.toLowerCase() === "output" || live === "polite" || live === "assertive";
  }
  function liveRegion(el: Element): boolean {
    let cur: Element | null = el;
    while (cur) {
      if (isLive(cur)) return true;
      cur = composedParent(cur);
    }
    return composedElements(el).some(isLive);
  }
  /**
   * Validação nativa do navegador ativa e falhando: o aviso do navegador (balão) não está no DOM,
   * então "nenhum texto descreve o erro" não pode ser decidido pelo que a página renderiza.
   */
  function nativeInvalid(el: Element): boolean {
    const field = el as HTMLInputElement;
    if (!field.validity || field.validity.valid) return false;
    const form = field.form;
    return !(form && form.noValidate) && !field.formNoValidate;
  }
  function snapshot(el: Element): Record<string, unknown> {
    const active = deepActive();
    return {
      ref: ref(el),
      shown: shown(el),
      text: textChunks(el, () => false).join(" ").slice(0, 500),
      colors: colors(el),
      focusInside: active !== null && inside(el, active),
      modal: isModal(el),
      closeRefs: closeButtons(el).map(ref),
      primaryRefs: primaryButtons(el).map(ref),
      formFieldRefs: formFields(el).map(ref),
      tabbableRefs: tabbables(el).map(ref),
      liveRegion: liveRegion(el),
      nativeInvalid: nativeInvalid(el),
      classes: Array.from(el.classList),
    };
  }
  w.__govbrCtx = {
    token, els, ref, deepQueryAll, composedElements, visible, shown, textChunks, deepActive, inside, describe,
    snapshot, isClose, composedParent, norm,
  };
}

type Helpers = {
  token: string;
  els: Element[];
  ref(el: Element): number;
  deepQueryAll(selector: string): Element[];
  composedElements(root: Element): Element[];
  visible(el: Element): boolean;
  shown(el: Element): boolean;
  textChunks(root: Element, exclude: (el: Element) => boolean): string[];
  deepActive(): Element | null;
  inside(container: Element, el: Element | null): boolean;
  describe(el: Element | null): string | null;
  snapshot(el: Element): SubjectSnapshot;
  isClose(el: Element, root: Element): boolean;
  composedParent(el: Element): Element | null;
  norm(text: string): string;
};

/** Espera curta depois de uma ação: dois quadros e as animações finitas em curso (teto 1 s). */
async function settleStep(page: Page): Promise<void> {
  await page
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          const deadline = Date.now() + 1_000;
          const tick = () => {
            const running = document
              .getAnimations()
              .some((a) => a.playState === "running" && Number.isFinite(Number(a.effect?.getComputedTiming().endTime)));
            if (!running || Date.now() > deadline) resolve();
            else setTimeout(tick, 50);
          };
          requestAnimationFrame(() => requestAnimationFrame(tick));
        })
    )
    .catch(() => undefined);
}

export async function observeStep(page: Page, step: number, next: PageAction | undefined, request: TraceRequest): Promise<TraceObservation> {
  await settleStep(page);
  await page.evaluate(installHelpers);
  const focusStable = request.focus
    ? await page
        .evaluate(
          ({ quietMs, capMs, intervalMs }) =>
            new Promise<boolean>((resolve) => {
              const h = (window as unknown as { __govbrCtx: Helpers }).__govbrCtx;
              const start = Date.now();
              let last = h.deepActive();
              let since = Date.now();
              const tick = () => {
                const now = Date.now();
                const current = h.deepActive();
                if (current !== last) {
                  last = current;
                  since = now;
                }
                if (now - since >= quietMs) return resolve(true);
                if (now - start >= capMs) return resolve(false);
                setTimeout(tick, intervalMs);
              };
              setTimeout(tick, intervalMs);
            }),
          FOCUS_STABILITY
        )
        .catch(() => false)
    : undefined;
  const observation = (await page.evaluate(
    ({ step, subject, message, text }) => {
      const h = (window as unknown as { __govbrCtx: Helpers }).__govbrCtx;
      const active = h.deepActive();
      const subjects = h.deepQueryAll(subject).map((el) => h.snapshot(el));
      let messageInfo: { found: number; shown: boolean; text: string } | null = null;
      if (message) {
        const found = h.deepQueryAll(message);
        const shownOnes = found.filter((el) => h.shown(el));
        messageInfo = {
          found: found.length,
          shown: shownOnes.length > 0,
          text: shownOnes.map((el) => h.textChunks(el, () => false).join(" ")).join(" ").slice(0, 500),
        };
      }
      const visibleText = text ? h.textChunks(document.body, () => false) : undefined;
      return {
        step,
        url: location.href,
        documentToken: h.token,
        active: active ? h.ref(active) : null,
        activeDescription: h.describe(active),
        nextTarget: null,
        subjects,
        message: messageInfo,
        ...(visibleText ? { visibleText } : {}),
        disconnected: h.els.map((el, i) => (el.isConnected ? -1 : i)).filter((i) => i >= 0),
      };
    },
    { step, subject: request.subject, message: request.message ?? null, text: request.text ?? false }
  )) as TraceObservation;
  if (focusStable !== undefined) observation.focusStable = focusStable;
  if (next && "selector" in next && next.selector && next.action !== "wait") {
    try {
      const target = page.locator(next.selector);
      if ((await target.count()) === 1) {
        const handle = await target.elementHandle({ timeout: 1_000 });
        if (handle) {
          observation.nextTarget = await handle.evaluate((el) => (window as unknown as { __govbrCtx: Helpers }).__govbrCtx.ref(el));
          await handle.dispose();
        }
      }
    } catch {
      // sem alvo único: o invocador será o foco observado
    }
  }
  return observation;
}

/** Observador para `reproduceState`: guarda uma observação por passo em `into`. */
export function traceObserver(request: TraceRequest, into: TraceObservation[]) {
  return async (page: Page, afterStep: number, next: PageAction | undefined): Promise<void> => {
    try {
      into.push(await observeStep(page, afterStep, next, request));
    } catch (error) {
      into.push({
        step: afterStep,
        url: page.url(),
        documentToken: "",
        active: null,
        activeDescription: null,
        nextTarget: null,
        subjects: [],
        message: null,
        disconnected: [],
        error: error instanceof Error ? error.message.split("\n")[0] : String(error),
      });
    }
  };
}

const AX_PROBE_KEY = "__govbrContextAxProbe";

/** Nome, descrição e invalid que o Chromium expõe para cada sujeito, mais os IDREFs na mesma árvore. */
export async function collectAccessibility(page: Page, locator: string): Promise<AccessibilityFacts[]> {
  await page.evaluate(installHelpers);
  const dom = (await page.evaluate(
    ({ locator, key }) => {
      const h = (window as unknown as { __govbrCtx: Helpers }).__govbrCtx;
      const subjects = h.deepQueryAll(locator);
      (window as unknown as Record<string, unknown>)[key] = subjects;
      return subjects.map((el) => {
        const root = el.getRootNode() as Document | ShadowRoot;
        const idrefs = ["aria-describedby", "aria-errormessage", "aria-labelledby"]
          .filter((attribute) => el.hasAttribute(attribute))
          .map((attribute) => {
            const ids = (el.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean);
            return { attribute, ids, missing: ids.filter((id) => !root.getElementById(id)) };
          });
        return { ref: h.ref(el), idrefs, tag: el.tagName.toLowerCase() };
      });
    },
    { locator, key: AX_PROBE_KEY }
  )) as Array<{ ref: number; idrefs: AccessibilityFacts["idrefs"]; tag: string }>;

  const ax: Array<AccessibilityFacts["ax"]> = dom.map(() => null);
  let session: Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>> | null = null;
  const objectGroup = "govbr-context-ax";
  try {
    session = await page.context().newCDPSession(page);
    const { result: list } = await session.send("Runtime.evaluate", { expression: `window[${JSON.stringify(AX_PROBE_KEY)}]`, objectGroup });
    if (list.objectId) {
      for (let i = 0; i < dom.length; i += 1) {
        const { result: item } = await session.send("Runtime.callFunctionOn", {
          objectId: list.objectId,
          functionDeclaration: "function (i) { return this[i]; }",
          arguments: [{ value: i }],
          objectGroup,
        });
        if (!item.objectId) continue;
        const { node } = await session.send("DOM.describeNode", { objectId: item.objectId });
        const { nodes } = await session.send("Accessibility.getPartialAXTree", { backendNodeId: node.backendNodeId, fetchRelatives: false });
        const found = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
        if (!found || found.ignored) continue;
        const invalid = (found.properties ?? []).find((p) => p.name === "invalid");
        const invalidValue = invalid?.value?.value;
        ax[i] = {
          name: typeof found.name?.value === "string" ? found.name.value : "",
          description: typeof found.description?.value === "string" ? found.description.value : "",
          invalid: invalidValue !== undefined && invalidValue !== "false" && invalidValue !== false,
        };
      }
    }
  } catch {
    // sem CDP: os fatos AX ficam null e o predicado não decide
  } finally {
    if (session) {
      await session.send("Runtime.releaseObjectGroup", { objectGroup }).catch(() => undefined);
      await session.detach().catch(() => undefined);
    }
    await page
      .evaluate((key) => {
        delete (window as unknown as Record<string, unknown>)[key];
      }, AX_PROBE_KEY)
      .catch(() => undefined);
  }
  return dom.map((facts, i) => ({ ...facts, ax: ax[i] }));
}

/** Partes de anatomia de cada raiz do localizador, pelas classes do @govbr-ds/core. */
export async function collectAnatomy(page: Page, locator: string): Promise<AnatomyFacts[]> {
  await page.evaluate(installHelpers);
  return (await page.evaluate((locator) => {
    const h = (window as unknown as { __govbrCtx: Helpers }).__govbrCtx;
    const within = (root: Element, selector: string) => h.composedElements(root).filter((el) => el.matches(selector));
    const ancestorMatches = (el: Element, selector: string) => {
      let cur: Element | null = h.composedParent(el);
      while (cur) {
        if (cur.matches(selector)) return true;
        cur = h.composedParent(cur);
      }
      return false;
    };
    const h1s = h.deepQueryAll("h1").filter((el) => h.visible(el));
    const hasMain = h.deepQueryAll("main, [role='main']").length > 0;
    const firstH1 =
      (hasMain
        ? h1s.find((el) => ancestorMatches(el, "main, [role='main']"))
        : h1s.find((el) => !ancestorMatches(el, "header, .br-header, [role='banner'], dialog, [role='dialog'], [role='alertdialog'], .br-modal"))) ?? null;
    const here = new URL(location.href);
    const linksToCurrent = (item: Element) =>
      h.composedElements(item).concat(item).some((el) => {
        if (!el.matches("a[href]")) return false;
        const raw = (el.getAttribute("href") ?? "").trim();
        if (raw === "" || raw === "#") return false;
        try {
          const target = new URL(raw, location.href);
          return target.origin === here.origin && target.pathname === here.pathname && target.search === here.search;
        } catch {
          return false;
        }
      });
    return h.deepQueryAll(locator).map((root) => {
      const descendants = h.composedElements(root);
      const opaque = descendants.some((el) => {
        const name = el.tagName.toLowerCase();
        return name.includes("-") && !!customElements.get(name) && el.shadowRoot === null && el.childNodes.length === 0;
      });
      const messageText = h.textChunks(root, (el) =>
        el !== root && (el.classList.contains("message-title") || el.classList.contains("icon") || h.isClose(el, root) || el.matches("button, [role='button']") || el.getAttribute("aria-hidden") === "true")
      );
      const text = (selector: string) => within(root, selector).flatMap((el) => h.textChunks(el, () => false)).join(" ");
      const logoVisible = within(root, ".header-logo").some(
        (logo) => h.textChunks(logo, () => false).length > 0 || h.composedElements(logo).some((el) => el.matches("img, svg") && h.visible(el))
      );
      const crumbs = within(root, ".crumb");
      const items = (crumbs.length ? crumbs : within(root, "li")).map((item) => ({
        text: h.textChunks(item, (el) => el.getAttribute("aria-hidden") === "true").join(" "),
        link: h.composedElements(item).some((el) => el.matches("a[href]")) || item.matches("a[href]"),
        current: item.hasAttribute("aria-current") || h.composedElements(item).some((el) => el.hasAttribute("aria-current")),
        linksToCurrent: linksToCurrent(item),
      }));
      const buttons = descendants.filter((el) => el.matches("button, [role='button'], a.br-button, input[type='button'], input[type='submit']") && h.visible(el));
      const closeButtons = buttons.filter((el) => h.isClose(el, root));
      const body = within(root, ".br-modal-body");
      return {
        classes: Array.from(root.classList),
        shown: h.shown(root),
        opaque,
        messageText,
        header: { titleText: text(".header-title"), logoVisible, infoText: text(".header-info") },
        breadcrumb: { items, h1: firstH1 ? h.textChunks(firstH1, () => false).join(" ") : null, title: document.title },
        modal: {
          buttons: buttons.length - closeButtons.length,
          closeButtons: closeButtons.length,
          bodyFound: body.length,
          bodyContent: body.some((b) => h.visible(b) && (h.textChunks(b, () => false).length > 0 || h.composedElements(b).some((el) => h.visible(el)))),
        },
      };
    });
  }, locator)) as AnatomyFacts[];
}
