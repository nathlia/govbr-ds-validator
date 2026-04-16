/**
 * Axe-core baseline runner
 *
 * Runs axe-core against each test page and maps violations back to
 * test case IDs (via data-testid on the containing <section>).
 *
 * Usage:
 *   1. Start the dev server: cd app && npm run dev
 *   2. node scripts/run-axe.js
 *   3. Results written to results/axe-results.json
 *
 * Dependencies: npm install --save-dev @axe-core/playwright playwright
 */

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const PAGES = [
  { name: "buttons", url: APP_URL, tab: "buttons" },
  { name: "forms",   url: APP_URL, tab: "form"    },
];

// Map an axe violation node's target selector back to its data-testid ancestor.
// axe returns targets like ["#some-id"] or ["section[data-testid='TC-B-02'] button"]
// We use playwright to evaluate the closest data-testid ancestor of each node.
async function findTestCaseId(page, target) {
  const selector = Array.isArray(target) ? target[target.length - 1] : target;
  try {
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const section = el.closest("[data-testid]");
      return section ? section.getAttribute("data-testid") : null;
    }, selector);
  } catch {
    return null;
  }
}

async function runPage({ name, url, tab }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "networkidle" });

  // Click the nav tab to activate the right page
  const tabButton = page.locator("nav button", { hasText: tab === "buttons" ? "Botões" : "Formulário" });
  if (await tabButton.count() > 0) {
    await tabButton.click();
    await page.waitForTimeout(300);
  }

  const results = await new AxeBuilder({ page }).analyze();

  // Enrich each violation with the test case ID
  const enriched = await Promise.all(
    results.violations.map(async (v) => {
      const enrichedNodes = await Promise.all(
        v.nodes.map(async (n) => {
          const caseId = await findTestCaseId(page, n.target);
          return { ...n, testCaseId: caseId };
        })
      );
      return { ...v, nodes: enrichedNodes };
    })
  );

  await browser.close();
  return { page: name, url, violations: enriched, passes: results.passes.length };
}

async function main() {
  console.log("Running axe-core baseline...\n");

  const allResults = {};

  for (const pageConfig of PAGES) {
    console.log(`  → ${pageConfig.name}`);
    const result = await runPage(pageConfig);

    // Build a flat summary keyed by test case ID
    const byCaseId = {};
    for (const violation of result.violations) {
      for (const node of violation.nodes) {
        const id = node.testCaseId;
        if (!id) continue;
        if (!byCaseId[id]) byCaseId[id] = [];
        byCaseId[id].push({
          rule: violation.id,
          impact: violation.impact,
          description: violation.description,
          helpUrl: violation.helpUrl,
        });
      }
    }
    allResults[pageConfig.name] = {
      passes: result.passes,
      violationCount: result.violations.length,
      byCaseId,
      raw: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({ target: n.target, testCaseId: n.testCaseId })),
      })),
    };

    const detected = Object.keys(byCaseId);
    console.log(`     Violations: ${result.violations.length} rules fired`);
    console.log(`     Test cases with violations: ${detected.join(", ") || "none"}\n`);
  }

  const output = {
    timestamp: new Date().toISOString(),
    tool: "axe-core via @axe-core/playwright",
    appUrl: APP_URL,
    results: allResults,
  };

  const json = JSON.stringify(output, null, 2);
  const outPath = join(ROOT, "results", "axe-results.json");
  const publicPath = join(ROOT, "app", "public", "axe-results.json");
  writeFileSync(outPath, json);
  writeFileSync(publicPath, json);
  console.log(`Results written to results/axe-results.json and app/public/axe-results.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
