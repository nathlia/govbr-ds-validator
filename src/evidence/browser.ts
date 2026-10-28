/**
 * Shared headless-browser lifecycle. One Chromium instance per server
 * process, lazily launched, reused across tool calls (the PoC relaunched per
 * call — expensive), closed on shutdown.
 *
 * Egress policy. In a measured run the agent chooses the URL, so this browser can open anything
 * the machine reaches — including the evaluation harness and its answer key. Two variables close
 * that path; unset, behavior is unchanged:
 *   GOVBR_VALIDATOR_ALLOWED_ORIGINS  comma-separated origins a tool may open; others fail before
 *                                    the browser starts loading
 *   GOVBR_VALIDATOR_PROXY_SERVER     every browser request (subresources, redirects, fetch, frames,
 *                                    workers) goes through this proxy, loopback included
 * The origin check gives a readable error; the proxy is the boundary.
 *
 * 3.3.0 (S-08): only http(s) URLs open, always (GOVBR_VALIDATOR_ALLOW_FILE_URLS=1 adds file: for
 * local tests). 3.3.0 (S-01, S-22): per-call deadline + client AbortSignal; native dialogs are
 * dismissed and recorded; every Playwright rejection is handled.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface EgressPolicy {
  allowedOrigins: string[] | null;
  proxyServer: string | null;
}

export function egressPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): EgressPolicy {
  const allowedOrigins = (env.GOVBR_VALIDATOR_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
  const proxyServer = env.GOVBR_VALIDATOR_PROXY_SERVER?.trim() || null;
  return { allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : null, proxyServer };
}

/**
 * 3.3.0 (S-08, N-07): erro de navegador/URL tipado. O servidor o devolve no formato de erro do contrato
 * (errorCode, mensagem sem ANSI nem call log, próximo passo), nunca como texto cru do Playwright.
 */
export type BrowserErrorCode =
  | "invalid-url"
  | "unsupported-scheme"
  | "origin-not-allowed"
  | "navigation-timeout"
  | "network-error"
  | "tool-timeout"
  | "aborted";

export class BrowserToolError extends Error {
  constructor(readonly errorCode: BrowserErrorCode, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "BrowserToolError";
  }
}

/** Erros que não dizem nada sobre a página (política, prazo, cancelamento): quem chama não os engole. */
export const POLICY_OR_DEADLINE: ReadonlySet<BrowserErrorCode> = new Set([
  "invalid-url",
  "unsupported-scheme",
  "origin-not-allowed",
  "tool-timeout",
  "aborted",
]);

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]|\[(?:2|22)m/g;

/** Mensagem de erro legível: sem ANSI, sem "Call log", sem pilha, 1ª linha, ≤ 300 caracteres. */
export function sanitizeErrorMessage(message: string): string {
  const clean = message.replace(ANSI, "").split(/\n\s*(?:Call log:|=+ logs =+|at )/)[0];
  const first = clean.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
  const stripped = first.replace(/^(?:page|locator|frame|elementHandle|browserContext)\.[a-zA-Z$]+:\s*/, "");
  return stripped.length > 300 ? `${stripped.slice(0, 299)}…` : stripped;
}

/**
 * Esquemas aceitos. Só http(s) por padrão: file:, data:, javascript:, view-source:, about: e chrome:
 * são recusados antes de o navegador abrir qualquer coisa (S-08, S-22). `GOVBR_VALIDATOR_ALLOW_FILE_URLS=1`
 * libera file: para testes locais; nada libera os outros.
 */
export function allowedSchemes(env: NodeJS.ProcessEnv = process.env): string[] {
  return env.GOVBR_VALIDATOR_ALLOW_FILE_URLS === "1" ? ["http:", "https:", "file:"] : ["http:", "https:"];
}

export function assertUrlAllowed(url: string, policy: EgressPolicy = egressPolicyFromEnv(), env: NodeJS.ProcessEnv = process.env): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BrowserToolError("invalid-url", `URL inválida: '${sanitizeErrorMessage(String(url)).slice(0, 200)}'. Use uma URL http(s) absoluta.`);
  }
  const schemes = allowedSchemes(env);
  if (!schemes.includes(parsed.protocol)) {
    throw new BrowserToolError(
      "unsupported-scheme",
      `Esquema de URL não suportado: '${parsed.protocol}'. Aceitos: ${schemes.join(", ")}. Use uma URL http(s) absoluta da página a validar.`,
      { scheme: parsed.protocol },
    );
  }
  if (!policy.allowedOrigins) return;
  const origin = parsed.origin;
  if (!policy.allowedOrigins.includes(origin)) {
    throw new BrowserToolError(
      "origin-not-allowed",
      `Origem fora da política de navegação desta execução: ${origin}. Permitidas: ${policy.allowedOrigins.join(", ")}`,
      { origin, allowedOrigins: policy.allowedOrigins },
    );
  }
}

let browser: Browser | null = null;
let launchedProxy: string | null = null;

export async function getBrowser(): Promise<Browser> {
  const { proxyServer } = egressPolicyFromEnv();
  if (browser && browser.isConnected() && launchedProxy !== proxyServer) await closeBrowser();
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true, ...(proxyServer ? { proxy: { server: proxyServer } } : {}) });
    launchedProxy = proxyServer;
  }
  return browser;
}

// ── Prazo por chamada e cancelamento (S-01) ──────────────────────────────────────────────────

/** Prazo total de uma chamada que abre página (navegação + avaliação + checks), abaixo dos 60 s do SDK. */
export const DEFAULT_TOOL_DEADLINE_MS = 50_000;

export function toolDeadlineMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.GOVBR_VALIDATOR_TOOL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1_000 ? Math.min(raw, 600_000) : DEFAULT_TOOL_DEADLINE_MS;
}

interface CallContext {
  tool: string;
  signal?: AbortSignal;
  startedAt: number;
  deadline: number;
}

const callContext = new AsyncLocalStorage<CallContext>();

/** Contexto da chamada MCP (nome, AbortSignal do cliente, prazo), lido por withPage. */
export function runWithCallContext<T>(tool: string, signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  return callContext.run({ tool, signal, startedAt, deadline: startedAt + toolDeadlineMs() }, fn);
}

/** Diálogo nativo (alert/confirm/prompt/beforeunload) descartado pelo oráculo — registrado, nunca aceito. */
export interface NativeDialog {
  type: string;
  message: string;
}

interface PageRecord {
  dialogs: NativeDialog[];
  httpStatus: number | null;
  phase: "navigation" | "evaluation";
}

const pageRecords = new WeakMap<Page, PageRecord>();

/** Diálogos nativos descartados nesta página até agora (S-19). */
export function nativeDialogsOf(page: Page): NativeDialog[] {
  return [...(pageRecords.get(page)?.dialogs ?? [])];
}

/** Status HTTP da navegação principal (S-11); null se não houve resposta. */
export function httpStatusOf(page: Page): number | null {
  return pageRecords.get(page)?.httpStatus ?? null;
}

function navigationError(error: unknown, url: string, timeoutMs: number): BrowserToolError {
  const raw = error instanceof Error ? error.message : String(error);
  const message = sanitizeErrorMessage(raw);
  if ((error as { name?: string })?.name === "TimeoutError" || /Timeout \d+ms exceeded/.test(raw)) {
    return new BrowserToolError("navigation-timeout", `A página não terminou de carregar em ${timeoutMs} ms (${url}).`, { url, timeoutMs });
  }
  if (/invalid URL/i.test(raw)) {
    return new BrowserToolError("invalid-url", `URL inválida para navegação: ${url}.`, { url });
  }
  return new BrowserToolError("network-error", `Falha de rede ao abrir ${url}: ${message}`, { url, cause: message });
}

/**
 * Fecha o contexto; se o renderer não responder (laço infinito), fecha o navegador inteiro — nenhum
 * renderer órfão sobrevive a uma chamada que estourou o prazo ou foi cancelada.
 */
async function disposeContext(context: BrowserContext, forced: boolean): Promise<void> {
  const closing = context.close().then(
    () => true,
    () => true,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const closed = await Promise.race([closing, new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), forced ? 3_000 : 15_000)))]);
  if (timer) clearTimeout(timer);
  if (!closed) await closeBrowser().catch(() => {});
}

/**
 * Run `fn` with a fresh page (its own context); the context is always closed afterwards. `viewport` is
 * only set by the deterministic baseline CLI, so that it observes the window the reference declares;
 * without it the page keeps Playwright's default (the MCP tools never pass one).
 *
 * 3.3.0 (S-01, S-22): prazo total por chamada (GOVBR_VALIDATOR_TOOL_TIMEOUT_MS, padrão 50 s) e o
 * AbortSignal do cliente valem para navegação + avaliação; estourado ou cancelado, o contexto é fechado
 * e a chamada devolve `tool-timeout`/`aborted` com a fase alcançada. Diálogos nativos são descartados
 * e registrados (nativeDialogsOf), com toda rejeição tratada.
 */
export async function withPage<T>(
  url: string,
  fn: (page: Page) => Promise<T>,
  options: { viewport?: { width: number; height: number } } = {}
): Promise<T> {
  assertUrlAllowed(url);
  const ctx = callContext.getStore();
  const startedAt = ctx?.startedAt ?? Date.now();
  const deadline = ctx?.deadline ?? Date.now() + toolDeadlineMs();
  const signal = ctx?.signal;
  if (signal?.aborted) throw new BrowserToolError("aborted", "A chamada foi cancelada pelo cliente antes de abrir a página.", { phase: "before-navigation" });

  const record: PageRecord = { dialogs: [], httpStatus: null, phase: "navigation" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  let interrupted = false;
  const guard = new Promise<never>((_, reject) => {
    const fire = (error: BrowserToolError) => {
      interrupted = true;
      reject(error);
    };
    timer = setTimeout(
      () =>
        fire(
          new BrowserToolError(
            "tool-timeout",
            `A chamada passou do prazo de ${deadline - startedAt} ms na fase '${record.phase}' e foi interrompida; a página foi fechada.`,
            {
              phase: record.phase,
              elapsedMs: Date.now() - startedAt,
              deadlineMs: deadline - startedAt,
              url,
              ...(record.httpStatus !== null ? { httpStatus: record.httpStatus } : {}),
              ...(record.dialogs.length ? { nativeDialogs: record.dialogs } : {}),
            },
          ),
        ),
      Math.max(0, deadline - Date.now()),
    );
    onAbort = () =>
      fire(new BrowserToolError("aborted", `A chamada foi cancelada pelo cliente na fase '${record.phase}'; a página foi fechada.`, { phase: record.phase, elapsedMs: Date.now() - startedAt }));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  guard.catch(() => {});

  let context: BrowserContext | null = null;
  const work = (async () => {
    const b = await getBrowser();
    const created = await b.newContext(options.viewport ? { viewport: options.viewport } : {});
    context = created;
    if (interrupted) throw new Error("interrupted");
    const page = await created.newPage();
    pageRecords.set(page, record);
    page.on("dialog", (dialog) => {
      if (record.dialogs.length < 20) {
        const message = dialog.message();
        record.dialogs.push({ type: dialog.type(), message: message.length > 200 ? `${message.slice(0, 199)}…` : message });
      }
      dialog.dismiss().catch(() => {});
    });
    const timeoutMs = Math.max(1_000, Math.min(30_000, deadline - Date.now()));
    let response;
    try {
      response = await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
    } catch (error) {
      throw navigationError(error, url, timeoutMs);
    }
    record.httpStatus = response?.status() ?? null;
    record.phase = "evaluation";
    return await fn(page);
  })();
  work.catch(() => {});

  let failed = false;
  try {
    return await Promise.race([work, guard]);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    if (interrupted) {
      // O contexto pode ainda estar sendo criado: espere-o (pouco) e feche à força.
      await Promise.race([work.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
    const opened = context as BrowserContext | null;
    if (opened) await disposeContext(opened, interrupted || failed);
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    const closing = browser;
    browser = null;
    await closing.close();
  }
}
