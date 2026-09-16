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
 */
import { chromium, type Browser, type Page } from "playwright";

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

export function assertUrlAllowed(url: string, policy: EgressPolicy = egressPolicyFromEnv()): void {
  if (!policy.allowedOrigins) return;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error(`URL inválida: ${url}`);
  }
  if (!policy.allowedOrigins.includes(origin)) {
    throw new Error(
      `Origem fora da política de navegação desta execução: ${origin}. Permitidas: ${policy.allowedOrigins.join(", ")}`
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

/**
 * Run `fn` with a fresh page; the page is always closed afterwards. `viewport` is only set by the
 * deterministic baseline CLI, so that it observes the window the reference declares; without it the
 * page keeps Playwright's default (the MCP tools never pass one).
 */
export async function withPage<T>(
  url: string,
  fn: (page: Page) => Promise<T>,
  options: { viewport?: { width: number; height: number } } = {}
): Promise<T> {
  assertUrlAllowed(url);
  const b = await getBrowser();
  const page = await b.newPage(options.viewport ? { viewport: options.viewport } : {});
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    return await fn(page);
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
