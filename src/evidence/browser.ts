/**
 * Shared headless-browser lifecycle. One Chromium instance per server
 * process, lazily launched, reused across tool calls (the PoC relaunched per
 * call — expensive), closed on shutdown.
 */
import { chromium, type Browser, type Page } from "playwright";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

/** Run `fn` with a fresh page; the page is always closed afterwards. */
export async function withPage<T>(url: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const b = await getBrowser();
  const page = await b.newPage();
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
