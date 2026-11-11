/**
 * Identidade e chegada de estado (2.10.0, NAT-82).
 *
 * Dois navegadores não compartilham estado: o do agente e o deste servidor só se encontram por uma
 * receita reaplicada desde o carregamento. Repetir ações não prova que se chegou à cena pretendida,
 * então cada reprodução devolve o que pode ser medido nela, sem saber nada de tela alguma:
 *
 *   observed   URL e caminho, janela real (innerWidth/innerHeight/dpr), diálogos abertos, controles
 *              expandidos, erros visíveis (role=alert, aria-invalid), foco — atravessando shadow
 *              roots abertos; hosts cujo interior não é observável ficam listados como desconhecidos
 *   arrival    as condições que quem pediu declarou (ArrivalSchema), cada uma medida e marcada
 *   fingerprint identidade EXATA do estado, sob a política versionada abaixo
 *
 * Política `state-identity-1`. O fingerprint é o SHA-256 de: política, URL, janela, outerHTML do
 * documento, innerHTML de cada shadow root aberto (com o caminho do host), controles de formulário e
 * ARIA de estado em todas as árvores abertas (valor, checked, expanded, selected, open), o caminho do
 * foco e a lista de hosts de raiz fechada. Scanner, cache e portão usam igualdade EXATA deste hash.
 * A8/pre.7 acrescenta nome/tipo/tamanho de arquivos em inputs preenchidos; inputs vazios conservam
 * a representação anterior. Bytes e lastModified não são observados: a igualdade não prova conteúdo
 * ou timestamps de arquivos. Builds anteriores não atestam esse novo observável.
 * A única normalização são duas renomeações consistentes de valores que um framework sorteia a cada
 * carga (STATE_IDENTITY_NORMALIZATIONS, abaixo); qualquer outra exige política nova, testada, que
 * preserve diferenças relevantes. Fingerprints de políticas diferentes nunca são iguais (política e
 * normalizações entram no hash), e os da 2.9.0 (sem shadow roots) não são comparáveis com estes.
 *
 * Shadow DOM fechado: o interior de uma raiz fechada não é alcançável. Se o foco está lá, o documento
 * só mostra o host; isso é registrado como `interior: "unknown"`, nunca como foco no host.
 */
import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { countFailureReason, type Arrival } from "./actions.js";

export const STATE_IDENTITY_POLICY = "state-identity-1" as const;

/**
 * Janela desktop congelada das ferramentas MCP. É o padrão do Playwright desde sempre (1280×720),
 * agora explícito: uma atualização do Playwright não muda a janela do oráculo em silêncio. Só o CLI
 * da linha de base escolhe outra (2.5.2); a superfície do agente não expõe janela.
 */
export const FROZEN_DESKTOP_VIEWPORT = { width: 1280, height: 720 } as const;

/**
 * 2.14.0 (NAT-86 §7.5a): janela das ferramentas MCP declarada pelo HARNESS, por variável de ambiente
 * lida pelo processo (`GOVBR_VALIDATOR_VIEWPORT=1280x900`), fora do esquema MCP — o agente continua sem
 * escolher janela. Ausente: a janela desktop congelada, como até a 2.13.0. Malformada: erro, nunca o
 * padrão em silêncio. A origem vai para a atestação de estado (`viewportSource`).
 */
export function oracleViewport(env: NodeJS.ProcessEnv = process.env): {
  viewport: { width: number; height: number };
  source: "frozen-desktop" | "harness";
} {
  const raw = env.GOVBR_VALIDATOR_VIEWPORT;
  if (raw === undefined || raw === "") return { viewport: { ...FROZEN_DESKTOP_VIEWPORT }, source: "frozen-desktop" };
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(raw.trim());
  const width = match ? Number(match[1]) : NaN;
  const height = match ? Number(match[2]) : NaN;
  if (!match || width < 1 || height < 1) {
    throw new Error(`GOVBR_VALIDATOR_VIEWPORT inválido: '${raw}' (esperado LARGURAxALTURA, ex.: 1280x900).`);
  }
  return { viewport: { width, height }, source: "harness" };
}

export interface ObservedState {
  url: string;
  path: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
  dialogs: Array<{ locator: string; role: string; modal: boolean }>;
  expanded: string[];
  errors: Array<{ locator: string; kind: "role-alert" | "aria-invalid"; text: string }>;
  focus: { locator: string; tag: string; inShadow: boolean; interior: "observed" | "unknown" } | null;
  /**
   * Hosts de shadow root FECHADO (detectados pelo CDP): o interior é desconhecido e não entra no
   * fingerprint. `null` = não foi possível saber se há raízes fechadas (sem CDP).
   */
  unobservableRoots: string[] | null;
  /** 3.3.0 (S-11): status HTTP da navegação principal, só quando não é 2xx/3xx (página de erro). */
  httpStatus?: number;
  /** 3.3.0 (S-19): alert/confirm/prompt nativos que o oráculo descartou (fora do fingerprint). */
  nativeDialogs?: Array<{ type: string; message: string }>;
  /** 3.3.0 (S-10): iframes cujo conteúdo nenhum check mediu (fora do fingerprint). */
  framesNotScanned?: { count: number; urls: string[] };
}

export interface ArrivalCondition {
  condition: keyof Arrival;
  expected: string | boolean;
  observed: string | boolean | number | null;
  satisfied: boolean;
  detail?: string;
}

export interface ArrivalAttestation {
  /** `not-declared`: ninguém disse o que caracteriza o estado; o observado vai junto, sem juízo. */
  status: "reached" | "not-reached" | "not-declared";
  conditions: ArrivalCondition[];
}

interface RawState {
  observed: ObservedState;
  identity: IdentityInput;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * As únicas normalizações da política `state-identity-1`. Cada uma troca um valor sorteado por um
 * framework a cada carga por um nome canônico na ORDEM DE PRIMEIRA APARIÇÃO (renomeação consistente):
 * dois valores distintos continuam distintos, referências cruzadas continuam apontando para o mesmo
 * nome, e só o valor sorteado em si deixa de contar. Foram medidas, não supostas: nas duas telas
 * congeladas, cargas idênticas davam fingerprints diferentes (já na 2.9.0) por exatamente estas duas
 * fontes, e por nenhuma outra.
 *
 *   ds-core-random-list-id   `list-<0..9999>` (sem zero à esquerda) que o @govbr-ds/core 3.x sorteia
 *                            (`Math.floor(Math.random() * 10000)`) para a lista com autocompletar do
 *                            br-select: só ids de um elemento com o contexto que o DS lhe dá
 *                            (`class` com `br-list` e `role="listbox"`) e as referências a esses ids,
 *                            em valores de atributo de id/referência e em localizadores `#list-N`.
 *                            Um `list-N` escrito pelo autor da página fora desse contexto fica intacto.
 *   angular-emulated-app-id  o APP_ID de 3 letras que o Angular sorteia por bootstrap nos atributos
 *                            `_ngcontent-<app>-c<N>` / `_nghost-<app>-c<N>` (e no CSS que os cita); o
 *                            índice do componente `c<N>` é preservado
 */
export const STATE_IDENTITY_NORMALIZATIONS = ["ds-core-random-list-id", "angular-emulated-app-id"] as const;

/** Forma exata do sorteio do DS: inteiro de 0 a 9999 sem zero à esquerda. */
const DS_LIST_ID = /^list-(?:0|[1-9]\d{0,3})$/;
/** Tag de abertura serializada (valores sempre entre aspas duplas, que podem conter `>`). */
const OPENING_TAG = /<[a-zA-Z][\w-]*(?:\s+[^\s"'>\/=]+(?:="[^"]*")?)+\s*\/?>/g;
const ID_ATTRIBUTE = /\sid="([^"]*)"/;
const DS_LIST_CLASS = /\sclass="(?:[^"]*\s)?br-list(?:\s[^"]*)?"/;
const LISTBOX_ROLE = /\srole="listbox"/;
const ID_ATTRIBUTE_VALUE = /(\s(?:id|for|list|headers|aria-controls|aria-owns|aria-labelledby|aria-describedby|aria-activedescendant|aria-flowto|aria-details|aria-errormessage)=")([^"]*)(")/g;
const LIST_ID_LOCATOR = /#(list-\d{1,4})(?![\w-])/g;

/**
 * Ids que o DS sorteou nesta serialização: só os de uma tag com `class` contendo `br-list` e
 * `role="listbox"` — o contexto que o br-select monta junto com o id.
 */
export function dsDrawnListIds(htmls: string[]): Set<string> {
  const drawn = new Set<string>();
  for (const html of htmls) {
    for (const [tag] of html.matchAll(OPENING_TAG)) {
      const id = ID_ATTRIBUTE.exec(tag)?.[1];
      if (id && DS_LIST_ID.test(id) && DS_LIST_CLASS.test(tag) && LISTBOX_ROLE.test(tag)) drawn.add(id);
    }
  }
  return drawn;
}

const ANGULAR_APP_ID = /_ng(content|host)(-?)([a-z]{3})(-?)c(\d+)/g;

class ConsistentRenamer {
  constructor(private readonly drawn: ReadonlySet<string>) {}
  private readonly lists = new Map<string, string>();
  private readonly apps = new Map<string, string>();

  private list(id: string): string {
    if (!this.lists.has(id)) this.lists.set(id, `list-#${this.lists.size + 1}`);
    return this.lists.get(id) as string;
  }

  /** HTML serializado: só valores de atributos de id/referência e nomes de atributo do Angular. */
  html(value: string): string {
    return this.angular(
      value.replace(ID_ATTRIBUTE_VALUE, (_m, open: string, ids: string, close: string) =>
        `${open}${ids.split(/(\s+)/).map((token) => (this.drawn.has(token) ? this.list(token) : token)).join("")}${close}`
      )
    );
  }

  locator(value: string): string {
    return value.replace(LIST_ID_LOCATOR, (m, id: string) => (this.drawn.has(id) ? `#${this.list(id)}` : m));
  }

  id(value: string | null): string | null {
    return value !== null && this.drawn.has(value) ? this.list(value) : value;
  }

  angular(value: string): string {
    return value.replace(ANGULAR_APP_ID, (_m, kind: string, d1: string, app: string, d2: string, c: string) => {
      if (!this.apps.has(app)) this.apps.set(app, `@${this.apps.size + 1}`);
      return `_ng${kind}${d1}${this.apps.get(app)}${d2}c${c}`;
    });
  }
}

export interface IdentityInput {
  url: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
  html: string;
  shadow: Array<{ host: string | null; html: string }>;
  focus: { path: string[]; interior: "observed" | "unknown" } | null;
  controls: Array<{ at: string; id: string | null } & Record<string, unknown>>;
  /**
   * Hosts de raiz fechada conhecidos. Sempre lista: quando o CDP não pôde ler (depois de novas
   * tentativas), entra `[]` e a incerteza fica em `observed.unobservableRoots = null`, FORA do hash —
   * uma falha pontual de leitura não muda o fingerprint em silêncio.
   */
  unobservableRoots: string[];
}

/** Aplica as normalizações da política, em ordem fixa de campos (a renomeação depende da ordem). */
export function normalizeIdentity(identity: IdentityInput): IdentityInput {
  const r = new ConsistentRenamer(dsDrawnListIds([identity.html, ...identity.shadow.map((s) => s.html)]));
  const html = r.html(identity.html);
  const shadow = identity.shadow.map((s) => ({ host: s.host === null ? null : r.locator(s.host), html: r.html(s.html) }));
  const focus = identity.focus ? { ...identity.focus, path: identity.focus.path.map((p) => r.locator(p)) } : null;
  const controls = identity.controls.map((c) => ({ ...c, at: r.locator(c.at), id: r.id(c.id) }));
  const unobservableRoots = identity.unobservableRoots.map((p) => r.locator(p));
  return { ...identity, html, shadow, focus, controls, unobservableRoots };
}

/** Fingerprint de uma entrada de identidade sob a política (exportado para teste). */
export function identityFingerprint(identity: IdentityInput): string {
  return `sha256:${sha256({ policy: STATE_IDENTITY_POLICY, normalizations: STATE_IDENTITY_NORMALIZATIONS, ...normalizeIdentity(identity) })}`;
}

/** Propriedade JS (não atributo: não aparece no HTML) que marca, por uma leitura, hosts de raiz fechada. */
const CLOSED_MARK = "__govbrValidatorClosedShadowHost";

interface CdpNode {
  nodeType: number;
  backendNodeId: number;
  children?: CdpNode[];
  shadowRoots?: Array<CdpNode & { shadowRootType?: string }>;
  contentDocument?: CdpNode;
}

/**
 * Marca os hosts de shadow root FECHADO. O DOM da página não os distingue de um elemento sem
 * shadow root; o protocolo do Chromium distingue. Devolve quantos marcou, ou null quando não há CDP
 * (outro navegador) ou a leitura falhou — aí a existência de raízes fechadas é desconhecida.
 */
/** Tentativas de leitura do CDP antes de declarar as raízes fechadas desconhecidas. */
const CLOSED_ROOT_READ_ATTEMPTS = 3;

async function markClosedShadowHosts(page: Page): Promise<number | null> {
  for (let attempt = 0; attempt < CLOSED_ROOT_READ_ATTEMPTS; attempt += 1) {
    const marked = await markClosedShadowHostsOnce(page);
    if (marked !== null) return marked;
  }
  return null;
}

async function markClosedShadowHostsOnce(page: Page): Promise<number | null> {
  let session: Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>> | null = null;
  try {
    session = await page.context().newCDPSession(page);
    const { root } = (await session.send("DOM.getDocument", { depth: -1, pierce: true })) as { root: CdpNode };
    const hosts: number[] = [];
    const walk = (node: CdpNode) => {
      for (const shadow of node.shadowRoots ?? []) {
        if (shadow.shadowRootType === "closed") hosts.push(node.backendNodeId);
        walk(shadow);
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(root);
    for (const backendNodeId of hosts) {
      const { object } = (await session.send("DOM.resolveNode", { backendNodeId })) as { object: { objectId?: string } };
      if (!object.objectId) continue;
      await session.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: `function () { this[${JSON.stringify(CLOSED_MARK)}] = true; }`,
      });
    }
    return hosts.length;
  } catch {
    return null;
  } finally {
    await session?.detach().catch(() => undefined);
  }
}

/** Coleta, numa passagem, o observável neutro e a entrada do fingerprint. */
async function collectRawState(page: Page): Promise<RawState> {
  const closedKnown = (await markClosedShadowHosts(page)) !== null;
  return page.evaluate(({ shadowStep, closedMark, closedKnown }) => {
    const isVisible = (el: Element): boolean => {
      const checker = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
      if (checker && !checker.call(el, { visibilityProperty: true })) return false;
      return el.getClientRects().length > 0;
    };

    const withinRoot = (el: Element): string => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.documentElement && parts.length < 8) {
        const parent: Element | null = node.parentElement;
        const tag = node.tagName.toLowerCase();
        const pool = parent ? Array.from(parent.children) : Array.from((node.getRootNode() as ShadowRoot | Document).children ?? []);
        const same = pool.filter((c) => c.tagName === node!.tagName);
        parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
        if (!parent) break;
        if (parent.id) {
          parts.unshift(`#${CSS.escape(parent.id)}`);
          break;
        }
        node = parent;
      }
      return parts.join(" > ");
    };
    const locatorFor = (el: Element): string => {
      const segments: string[] = [];
      let node: Element = el;
      for (let depth = 0; depth < 8; depth += 1) {
        segments.unshift(withinRoot(node));
        const root = node.getRootNode();
        if (root instanceof ShadowRoot) node = root.host;
        else break;
      }
      return segments.join(` ${shadowStep} `);
    };

    // 3.7.11 (2ª revisão MED 3/6): a identidade do estado (fingerprint) usa o localizador de sempre (3.7.10) —
    // ele só entra no hash, nunca é resolvido; o que a resposta MOSTRA (diálogos, alertas, foco, raízes fechadas) usa a
    // forma única (auditoria V-1): a de sempre quando já resolve só o elemento; senão sobe (sem o teto de 8) até ficar
    // única, ou ancora no topo da raiz de sombra (:host >). São poucos elementos: a conferência é por consulta.
    let rootsCache: Array<Document | ShadowRoot> | null = null;
    const allRoots = (): Array<Document | ShadowRoot> => {
      if (rootsCache) return rootsCache;
      const out: Array<Document | ShadowRoot> = [document];
      const walk = (root: Document | ShadowRoot) => {
        for (const e of Array.from(root.querySelectorAll("*"))) {
          if (e.shadowRoot) {
            out.push(e.shadowRoot);
            walk(e.shadowRoot);
          }
        }
      };
      walk(document);
      rootsCache = out;
      return out;
    };
    const onlyIn = (scope: Array<Document | ShadowRoot>, sel: string, el: Element): boolean => {
      let n = 0;
      try {
        for (const r of scope) {
          for (const x of Array.from(r.querySelectorAll(sel))) {
            if (x !== el) return false;
            n += 1;
          }
        }
      } catch {
        return false;
      }
      return n === 1;
    };
    const scopeOf = (node: Element, pierce: boolean): Array<Document | ShadowRoot> => {
      const root = node.getRootNode();
      if (root instanceof ShadowRoot) return [root];
      return pierce ? allRoots() : [document];
    };
    const uniqueWithinRoot = (el: Element, extend = false, pierce = false): string => {
      const scope = scopeOf(el, pierce);
      if (el.id && (!extend || onlyIn(scope, `#${CSS.escape(el.id)}`, el))) return `#${CSS.escape(el.id)}`;
      const testId = el.getAttribute("data-testid");
      // valor entre aspas: escapa só a barra invertida e as aspas
      const testIdSel = testId ? `[data-testid="${testId.replace(/["\\]/g, (m) => `\\${m}`)}"]` : null;
      if (testIdSel && onlyIn(scope, testIdSel, el)) return testIdSel;
      const parts: string[] = [];
      const done = () => extend && onlyIn(scope, parts.join(" > "), el);
      let node: Element | null = el;
      while (node && node !== document.documentElement && (parts.length < 8 || (extend && !done()))) {
        const parent: Element | null = node.parentElement;
        const tag = node.tagName.toLowerCase();
        const pool = parent ? Array.from(parent.children) : Array.from((node.getRootNode() as ShadowRoot | Document).children ?? []);
        const same = pool.filter((c) => c.tagName === node!.tagName);
        parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
        if (!parent) {
          // topo da raiz de sombra ainda ambíguo: ancora nela
          if (extend && !done() && node.getRootNode() instanceof ShadowRoot) parts.unshift(":host");
          break;
        }
        if (parent.id) {
          parts.unshift(`#${CSS.escape(parent.id)}`);
          if (!extend || done()) break;
          parts.shift();
        }
        node = parent;
      }
      return parts.join(" > ");
    };
    const resolvesOnly = (locator: string, el: Element): boolean => {
      if (!locator.includes(shadowStep)) return onlyIn(allRoots(), locator, el);
      const hops = locator.split(shadowStep).map((s) => s.trim()).filter(Boolean);
      let scope: Array<Document | ShadowRoot> = [document];
      let found: Element[] = [];
      try {
        hops.forEach((hop, i) => {
          found = scope.flatMap((root) => Array.from(root.querySelectorAll(hop)));
          if (i < hops.length - 1) scope = found.map((x) => x.shadowRoot).filter((r): r is ShadowRoot => r !== null);
        });
      } catch {
        return false;
      }
      return found.length === 1 && found[0] === el;
    };
    const shownLocatorFor = (el: Element): string => {
      const build = (extend: boolean) => {
        const segments: string[] = [];
        let node: Element = el;
        for (let depth = 0; depth < 8; depth += 1) {
          segments.unshift(uniqueWithinRoot(node, extend, extend && node === el));
          const root = node.getRootNode();
          if (root instanceof ShadowRoot) node = root.host;
          else break;
        }
        return segments.join(` ${shadowStep} `);
      };
      const base = build(false);
      return resolvesOnly(base, el) ? base : build(true);
    };

    // Todas as árvores abertas, em ordem de documento.
    const roots: Array<{ root: Document | ShadowRoot; host: string | null }> = [];
    const closedHosts = new Set<Element>();
    const marked = (el: Element) => Boolean((el as unknown as Record<string, unknown>)[closedMark]);
    const visit = (root: Document | ShadowRoot, host: string | null) => {
      roots.push({ root, host });
      for (const el of Array.from(root.querySelectorAll("*"))) {
        if (el.shadowRoot) visit(el.shadowRoot, locatorFor(el));
        else if (marked(el)) closedHosts.add(el);
      }
    };
    visit(document, null);
    for (const el of closedHosts) delete (el as unknown as Record<string, unknown>)[closedMark];
    const unobservableRoots: string[] | null = closedKnown ? Array.from(closedHosts).map(locatorFor) : null;
    const unobservableShown: string[] | null = closedKnown ? Array.from(closedHosts).map(shownLocatorFor) : null;
    const all = (selector: string): Element[] => roots.flatMap(({ root }) => Array.from(root.querySelectorAll(selector)));

    const dialogs = all("dialog[open], [role='dialog'], [role='alertdialog'], [aria-modal='true']")
      .filter((el) => el.tagName.toLowerCase() !== "dialog" || (el as HTMLDialogElement).open)
      .filter(isVisible)
      .map((el) => ({
        locator: shownLocatorFor(el),
        role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
        modal: el.getAttribute("aria-modal") === "true" || (() => { try { return el.matches(":modal"); } catch { return false; } })(),
      }));
    const expanded = all("[aria-expanded='true']").map(shownLocatorFor);
    const errors = [
      ...all("[role='alert']")
        .filter((el) => isVisible(el) && (el.textContent ?? "").trim().length > 0)
        .map((el) => ({ locator: shownLocatorFor(el), kind: "role-alert" as const, text: (el.textContent ?? "").trim().slice(0, 200) })),
      ...all("[aria-invalid='true']")
        .filter(isVisible)
        .map((el) => ({ locator: shownLocatorFor(el), kind: "aria-invalid" as const, text: "" })),
    ];

    // Foco: desce por shadowRoot.activeElement enquanto a raiz for aberta.
    let active: Element | null = document.activeElement;
    const focusPath: string[] = [];
    let interior: "observed" | "unknown" = "observed";
    while (active && active !== document.body) {
      focusPath.push(withinRoot(active));
      const inner: Element | null = active.shadowRoot ? active.shadowRoot.activeElement : null;
      if (inner) {
        active = inner;
        continue;
      }
      // Foco num host de raiz fechada: o elemento focado de fato está lá dentro, ou é o próprio host —
      // de fora não se distingue. Sem CDP, qualquer host personalizado sem raiz aberta fica assim.
      if (!active.shadowRoot && (closedHosts.has(active) || (!closedKnown && active.tagName.includes("-")))) interior = "unknown";
      break;
    }
    const focus =
      active && active !== document.body
        ? { locator: shownLocatorFor(active), tag: active.tagName.toLowerCase(), inShadow: active.getRootNode() instanceof ShadowRoot, interior }
        : null;

    const controls = all("input, select, textarea, details, dialog, [aria-expanded], [aria-selected], [aria-checked], [aria-pressed]").map((element) => {
      const control = element as HTMLInputElement & { open?: boolean };
      return {
        at: locatorFor(element),
        id: element.id || null,
        name: element.getAttribute("name"),
        value: "value" in control ? control.value : null,
        // Metadados observáveis; timestamps do navegador e bytes não entram no hash.
        ...(control.type === "file" && control.files?.length ? { files: Array.from(control.files, (file) => ({ name: file.name, mimeType: file.type, size: file.size })) } : {}),
        checked: "checked" in control ? control.checked : null,
        open: "open" in control ? Boolean(control.open) : null,
        expanded: element.getAttribute("aria-expanded"),
        selected: element.getAttribute("aria-selected"),
        ariaChecked: element.getAttribute("aria-checked"),
        pressed: element.getAttribute("aria-pressed"),
      };
    });

    const viewport = { width: innerWidth, height: innerHeight, devicePixelRatio };
    return {
      observed: {
        url: location.href,
        path: location.pathname,
        viewport,
        dialogs,
        expanded,
        errors,
        focus,
        unobservableRoots: unobservableShown,
      },
      identity: {
        url: location.href,
        viewport,
        html: document.documentElement.outerHTML,
        shadow: roots.filter((r) => r.host !== null).map((r) => ({ host: r.host, html: (r.root as ShadowRoot).innerHTML })),
        focus: focusPath.length ? { path: focusPath, interior } : null,
        controls,
        unobservableRoots: unobservableRoots ?? [],
      },
    };
  }, { shadowStep: ">>>", closedMark: CLOSED_MARK, closedKnown });
}

export interface PageStateSnapshot {
  policy: typeof STATE_IDENTITY_POLICY;
  fingerprint: string;
  observed: ObservedState;
}

/** Fingerprint exato + observável, numa só leitura do DOM. */
export async function snapshotPageState(page: Page): Promise<PageStateSnapshot> {
  const raw = await collectRawState(page);
  return {
    policy: STATE_IDENTITY_POLICY,
    fingerprint: identityFingerprint(raw.identity),
    observed: raw.observed,
  };
}

export async function fingerprintPage(page: Page): Promise<string> {
  return (await snapshotPageState(page)).fingerprint;
}

/**
 * Espera de assentamento antes do fingerprint (2.10.0). Uma ação pode disparar mudanças adiadas — um
 * diálogo cujo `.show` chega por setTimeout, uma transição CSS. Sem esperar, o scan e a reprodução
 * fotografariam o mesmo estado em pontos diferentes da transição. Scanner e portão chamam a MESMA
 * função (via reproduceState), com a mesma política:
 *
 *   1. rede ociosa (`networkidle`, no máximo `networkIdleMs`);
 *   2. amostras do DOM (outerHTML do documento + innerHTML de cada shadow root aberto) a cada
 *      `intervalMs`; o estado assentou quando `stableSamples` amostras seguidas são idênticas E
 *      nenhuma animação/transição finita está rodando (`document.getAnimations()`; animações
 *      infinitas, como spinners, não contam) — ou seja, `(stableSamples - 1) × intervalMs` de silêncio;
 *   3. teto `capMs` para a etapa 2. Sem assentar, segue com `settled: false`, registrado FORA do hash;
 *      numa reprodução, uma divergência de estado é limitação de qualquer forma, nunca rejeição.
 *
 * Mudanças adiadas por mais que a janela de silêncio (300 ms) não são esperadas: quem precisa delas
 * declara um `wait` com seletor na receita.
 */
export const SETTLE_POLICY = { networkIdleMs: 2_000, intervalMs: 100, stableSamples: 4, capMs: 3_000 } as const;

export interface SettleReport {
  /** true: DOM idêntico em `stableSamples` amostras seguidas, sem animação finita rodando. */
  settled: boolean;
}

export async function settlePage(page: Page): Promise<SettleReport> {
  await page.waitForLoadState("networkidle", { timeout: SETTLE_POLICY.networkIdleMs }).catch(() => undefined);
  const started = Date.now();
  let previous: string | null = null;
  let identical = 0;
  for (;;) {
    const sample = await page
      .evaluate(() => {
        const parts: string[] = [document.documentElement.outerHTML];
        const visit = (root: Document | ShadowRoot) => {
          for (const el of Array.from(root.querySelectorAll("*"))) {
            if (el.shadowRoot) {
              parts.push(el.shadowRoot.innerHTML);
              visit(el.shadowRoot);
            }
          }
        };
        visit(document);
        const animating = document.getAnimations().filter((animation) => {
          if (animation.playState !== "running") return false;
          const end = animation.effect?.getComputedTiming().endTime;
          return typeof end === "number" && Number.isFinite(end);
        }).length;
        return { dom: parts, animating };
      })
      .catch(() => null);
    const dom = sample ? JSON.stringify(sample.dom) : null;
    if (sample && sample.animating === 0) identical = dom === previous ? identical + 1 : 1;
    else identical = 0;
    previous = dom;
    if (identical >= SETTLE_POLICY.stableSamples) return { settled: true };
    if (Date.now() - started >= SETTLE_POLICY.capMs) return { settled: false };
    await page.waitForTimeout(SETTLE_POLICY.intervalMs);
  }
}

/**
 * Chave de página para casar um achado com o scan citado: origem + caminho (sem barra final) + query.
 * O fragmento (`#...`) não muda o documento servido e é ignorado. URL inválida não casa com nada.
 */
export function scanPageKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return null;
  }
}

export function sameScanPage(a: string, b: string): boolean {
  const key = scanPageKey(a);
  return key !== null && key === scanPageKey(b);
}

async function countSelector(page: Page, selector: string): Promise<number | CountFailure> {
  try {
    return await page.locator(selector).count();
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)).split("\n")[0], reason: countFailureReason(error) };
  }
}

interface CountFailure {
  error: string;
  reason: ReturnType<typeof countFailureReason>;
}

function countFailureDetail(failure: CountFailure): string {
  const what =
    failure.reason === "invalid-selector" ? "Seletor inválido" : failure.reason === "page-changed" ? "A página mudou ao contar" : "Falha ao contar";
  return `${what} (${failure.reason}): ${failure.error}`;
}

/** Mede cada condição declarada no estado atual da página. */
export async function evaluateArrival(page: Page, observed: ObservedState, arrival: Arrival | undefined): Promise<ArrivalAttestation> {
  if (!arrival || Object.keys(arrival).length === 0) return { status: "not-declared", conditions: [] };
  const conditions: ArrivalCondition[] = [];

  if (arrival.path !== undefined) {
    conditions.push({ condition: "path", expected: arrival.path, observed: observed.path, satisfied: observed.path === arrival.path });
  }
  if (arrival.dialogOpen !== undefined) {
    const open = observed.dialogs.length > 0;
    conditions.push({ condition: "dialogOpen", expected: arrival.dialogOpen, observed: open, satisfied: open === arrival.dialogOpen });
  }
  if (arrival.errorVisible !== undefined) {
    const visible = observed.errors.length > 0;
    conditions.push({ condition: "errorVisible", expected: arrival.errorVisible, observed: visible, satisfied: visible === arrival.errorVisible });
  }

  const single = async (condition: "expanded" | "focused", selector: string, test: (count: number) => Promise<{ ok: boolean; observed: string | boolean | number | null; detail?: string }>) => {
    const count = await countSelector(page, selector);
    if (typeof count !== "number") {
      conditions.push({ condition, expected: selector, observed: null, satisfied: false, detail: countFailureDetail(count) });
    } else if (count !== 1) {
      conditions.push({
        condition,
        expected: selector,
        observed: count,
        satisfied: false,
        detail: count === 0 ? "Nenhum elemento para o seletor." : `O seletor resolveu ${count} elementos; a condição exige exatamente um.`,
      });
    } else {
      const outcome = await test(count);
      conditions.push({ condition, expected: selector, observed: outcome.observed, satisfied: outcome.ok, ...(outcome.detail ? { detail: outcome.detail } : {}) });
    }
  };

  if (arrival.expanded !== undefined) {
    await single("expanded", arrival.expanded, async () => {
      const value = await page.locator(arrival.expanded as string).getAttribute("aria-expanded");
      return { ok: value === "true", observed: value, ...(value === "true" ? {} : { detail: `aria-expanded=${value ?? "ausente"}` }) };
    });
  }
  if (arrival.focused !== undefined) {
    await single("focused", arrival.focused, async () => {
      const holds = await page.locator(arrival.focused as string).evaluate((el) => {
        let active: Element | null = document.activeElement;
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
        return active === el;
      });
      return { ok: holds, observed: holds, ...(holds ? {} : { detail: `Foco observado em ${observed.focus?.locator ?? "nenhum elemento"}.` }) };
    });
  }
  if (arrival.visible !== undefined) {
    const total = await countSelector(page, arrival.visible);
    if (typeof total !== "number") {
      conditions.push({ condition: "visible", expected: arrival.visible, observed: null, satisfied: false, detail: countFailureDetail(total) });
    } else {
      const visible = await page.locator(arrival.visible).filter({ visible: true }).count();
      conditions.push({
        condition: "visible",
        expected: arrival.visible,
        observed: visible,
        satisfied: visible > 0,
        ...(visible > 0 ? {} : { detail: `${total} elemento(s) para o seletor, nenhum visível.` }),
      });
    }
  }

  return { status: conditions.every((c) => c.satisfied) ? "reached" : "not-reached", conditions };
}

/** Diferenças entre o estado registrado num scan e o reproduzido agora, por dimensão. */
export type StateMismatch = "url" | "viewport" | "fingerprint";

export function compareStates(
  claimed: { url: string; viewport: { width: number; height: number }; fingerprint: string },
  reproduced: { url: string; viewport: { width: number; height: number }; fingerprint: string }
): StateMismatch[] {
  const mismatches: StateMismatch[] = [];
  if (claimed.url !== reproduced.url) mismatches.push("url");
  if (claimed.viewport.width !== reproduced.viewport.width || claimed.viewport.height !== reproduced.viewport.height) mismatches.push("viewport");
  if (claimed.fingerprint !== reproduced.fingerprint) mismatches.push("fingerprint");
  return mismatches;
}
