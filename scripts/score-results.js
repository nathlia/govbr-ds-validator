/**
 * Evaluation scorer
 *
 * Computes precision, recall, and F1 for each tool by comparing
 * actual detection results against ground-truth.
 *
 * Tools evaluated:
 *   - axe-core      : from results/axe-results.json   (actual run)
 *   - eslint-a11y   : from ground-truth detection field (no runtime runner)
 *   - agent         : from results/agent-results.json  (actual run)
 *
 * Usage:
 *   node scripts/score-results.js
 *   node scripts/score-results.js --verbose    (show per-case breakdown)
 *   node scripts/score-results.js --json       (output raw JSON metrics)
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const VERBOSE = process.argv.includes("--verbose");
const JSON_OUT = process.argv.includes("--json");

// ── Load files ────────────────────────────────────────────────────────────────

function loadJson(relPath) {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) return null;
  return JSON.parse(readFileSync(abs, "utf8"));
}

const gt          = loadJson("results/ground-truth.json");
const axeRaw      = loadJson("results/axe-results.json");
const agentRaw    = loadJson("results/agent-results.json");

if (!gt) {
  console.error("Missing results/ground-truth.json");
  process.exit(1);
}

const cases = gt.cases;

// ── Build axe actual detection map ───────────────────────────────────────────
// axe-results.json: { results: { buttons: { byCaseId: { "TC-B-02": [...] } } } }

function buildAxeActual() {
  if (!axeRaw?.results) return null;
  const map = {};
  for (const pageData of Object.values(axeRaw.results)) {
    for (const [id] of Object.entries(cases)) {
      // Default to false (no violation detected) for pages that were run
      const page = cases[id].page === "buttons" ? "buttons" : "forms";
      if (axeRaw.results[page]) {
        map[id] = map[id] ?? false;
      }
    }
    for (const [caseId, viols] of Object.entries(pageData.byCaseId ?? {})) {
      if (viols.length > 0) map[caseId] = true;
    }
  }
  return map;
}

// ── Build agent actual detection map ─────────────────────────────────────────
// agent-results.json: { verdicts: { "TC-B-02": { detected: true, ... } } }

function buildAgentActual() {
  if (!agentRaw?.verdicts || agentRaw._empty) return null;
  const map = {};
  for (const [id, v] of Object.entries(agentRaw.verdicts)) {
    map[id] = v.detected === true;
  }
  return map;
}

// ── Compute metrics for one tool ──────────────────────────────────────────────
// ground-truth.detection[tool] values:
//   true  → expected to detect
//   false → expected to miss
//   null  → reference case, skip from scoring

function computeMetrics(toolKey, actualMap) {
  const rows = [];
  let TP = 0, FP = 0, FN = 0, TN = 0, missing = 0;

  for (const [id, c] of Object.entries(cases)) {
    const expected = c.detection[toolKey];
    if (expected === null) continue;          // reference case, skip

    const hasViolation = c.violations.length > 0;  // ground-truth truth
    const actual = actualMap?.[id];

    if (actual === undefined) {
      missing++;
      rows.push({ id, truth: hasViolation, actual: "?", outcome: "missing" });
      continue;
    }

    let outcome;
    if (hasViolation && actual)   { TP++; outcome = "TP"; }
    else if (!hasViolation && actual) { FP++; outcome = "FP"; }
    else if (hasViolation && !actual) { FN++; outcome = "FN"; }
    else                              { TN++; outcome = "TN"; }

    rows.push({ id, truth: hasViolation, actual, outcome });
  }

  const precision = TP + FP === 0 ? null : TP / (TP + FP);
  const recall    = TP + FN === 0 ? null : TP / (TP + FN);
  const f1 = precision !== null && recall !== null && (precision + recall) > 0
    ? 2 * precision * recall / (precision + recall)
    : null;

  return { TP, FP, FN, TN, missing, precision, recall, f1, rows };
}

// ── Format helpers ────────────────────────────────────────────────────────────

function pct(v) {
  if (v === null) return "  —   ";
  return (v * 100).toFixed(1).padStart(5) + "%";
}

function pad(s, n) {
  return String(s).padEnd(n);
}

function outcomeSymbol(o) {
  return { TP: "✓", FP: "!", FN: "✗", TN: "·", missing: "?" }[o] ?? o;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const axeActual   = buildAxeActual();
const agentActual = buildAgentActual();

const tools = [
  { key: "axe",        label: "axe-core",    actual: axeActual,   source: axeRaw   ? `run ${axeRaw.timestamp?.slice(0,16)}` : "not run" },
  { key: "eslint_a11y",label: "eslint-a11y", actual: null,        source: "expected values only (no runtime runner)" },
  { key: "agent",      label: "Agent",       actual: agentActual, source: agentActual ? `run ${agentRaw.timestamp?.slice(0,16)} — ${agentRaw.model}` : "not run — execute /evaluate-all first" },
];

// For eslint_a11y we use the expected values from ground-truth as the "actual"
// (since there is no runtime eslint runner in this suite)
const eslintExpected = {};
for (const [id, c] of Object.entries(cases)) {
  if (c.detection.eslint_a11y !== null) {
    eslintExpected[id] = c.detection.eslint_a11y === true;
  }
}
tools[1].actual = eslintExpected;
tools[1].note   = "(expected — not yet measured empirically)";

const metrics = tools.map(t => ({ ...t, ...computeMetrics(t.key, t.actual) }));

if (JSON_OUT) {
  const out = {};
  for (const m of metrics) {
    out[m.key] = { TP: m.TP, FP: m.FP, FN: m.FN, TN: m.TN,
      precision: m.precision, recall: m.recall, f1: m.f1, source: m.source };
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// Count violation cases in ground-truth
const violationCases = Object.values(cases).filter(c => c.violations.length > 0).length;
const referenceCases = Object.values(cases).filter(c => c.violations.length === 0).length;
const totalCases     = Object.keys(cases).length;

console.log("\n=== govbr-ds Validator — Evaluation Results ===\n");
console.log(`Ground-truth: ${totalCases} cases  (${violationCases} violations, ${referenceCases} reference)`);
console.log();

// Summary table
console.log(
  pad("Tool", 14) +
  pad("TP",  5) + pad("FP",  5) + pad("FN",  5) + pad("TN",  5) +
  pad("Precision", 12) + pad("Recall",  10) + pad("F1",  10) +
  "Source"
);
console.log("─".repeat(90));

for (const m of metrics) {
  console.log(
    pad(m.label, 14) +
    pad(m.TP,  5) + pad(m.FP,  5) + pad(m.FN,  5) + pad(m.TN,  5) +
    pad(pct(m.precision), 12) + pad(pct(m.recall), 10) + pad(pct(m.f1), 10) +
    m.source + (m.note ? `  ${m.note}` : "")
  );
}

console.log();

// Agent-only highlight
const agentOnlyCases = Object.entries(cases).filter(([, c]) =>
  c.violations.length > 0 &&
  c.detection.axe === false &&
  c.detection.eslint_a11y === false &&
  c.detection.agent === true
);
console.log(`Agent-only detections (expected): ${agentOnlyCases.length} / ${violationCases} violation cases`);
console.log(`  → ${agentOnlyCases.map(([id]) => id).join(", ")}`);

if (agentActual) {
  const actualAgentOnly = agentOnlyCases.filter(([id]) => agentActual[id] === true);
  console.log(`Agent-only detections (actual):   ${actualAgentOnly.length} / ${agentOnlyCases.length} correctly found`);
}

console.log();

// Per-case breakdown (--verbose)
if (VERBOSE) {
  console.log("=== Per-case breakdown ===\n");

  const axeCol   = metrics[0];
  const eslintCol= metrics[1];
  const agentCol = metrics[2];

  console.log(
    pad("Case", 10) +
    pad("Category", 20) +
    pad("Truth",  8) +
    pad("axe",    8) +
    pad("eslint", 8) +
    pad("Agent",  8) +
    "Description"
  );
  console.log("─".repeat(100));

  for (const [id, c] of Object.entries(cases)) {
    const truth = c.violations.length > 0 ? "FAIL" : "pass";
    const cats  = c.categories.join("+") || "—";

    const axeOut   = axeCol.rows.find(r => r.id === id);
    const agentOut = agentCol.rows.find(r => r.id === id);

    const axeSym   = axeOut   ? outcomeSymbol(axeOut.outcome)   : (c.detection.axe === null ? "—" : "?");
    const agentSym = agentOut ? outcomeSymbol(agentOut.outcome)  : (c.detection.agent === null ? "—" : "?");

    // eslint: use expected
    let eslintSym = "—";
    if (c.detection.eslint_a11y !== null) {
      const exp = c.detection.eslint_a11y;
      eslintSym = exp ? "✓" : "✗";
    }

    console.log(
      pad(id,   10) +
      pad(cats.slice(0, 18), 20) +
      pad(truth,  8) +
      pad(axeSym,   8) +
      pad(eslintSym, 8) +
      pad(agentSym,  8) +
      c.description
    );
  }

  console.log();
  console.log("Legend: ✓=correct detection  ✗=missed  !=false positive  ·=correct clean  ?=not run  —=reference");
}

// Data quality warnings
const warnings = [];
if (!axeRaw)   warnings.push("axe-results.json not found — run '▶ Executar axe-core' in the app");
if (!agentRaw) warnings.push("agent-results.json not found — run '/evaluate-all' first");
if (warnings.length) {
  console.log("⚠  Warnings:");
  warnings.forEach(w => console.log(`   • ${w}`));
  console.log();
}
