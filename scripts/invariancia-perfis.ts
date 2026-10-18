/**
 * Prova de invariância dos perfis existentes entre duas builds (2.14.0, NAT-61, plano §7.1).
 *
 * Carrega o `createServer` de duas árvores compiladas (a base, ex. 2.13.0, e esta), roda a mesma
 * sequência de chamadas nos mesmos perfis e páginas, e compara as respostas INTEIRAS. Só os campos
 * voláteis declarados abaixo são normalizados (o que varia entre duas execuções da MESMA build:
 * conferido com a prova A/A, --nova = cópia da base); nada de contagens ou snapshots parciais.
 *
 * Uso (sem modelo):
 *   npx tsx scripts/invariancia-perfis.ts --base <árvore 2.13.0 com dist/> [--saida dir]
 *     [--nova <árvore nova, padrão esta>] [--corpus ../govbr-corpus] [--telas ../govbr-telas] [--controles N]
 *
 * Prova A/A (descobre os voláteis): --base <árvore X> --nova <cópia da árvore X>. Os módulos têm de
 * ser cópias distintas — a mesma árvore importada duas vezes compartilha contadores de id.
 *
 * Páginas: controles de desenvolvimento `controles/a/` (nunca `b/`) e telas congeladas A e B.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  Session,
  argValue,
  loadBuild,
  scanSequence,
  sha256,
  startPages,
  verifyBattery,
  type Build,
  type CallRecord,
  type Pages,
} from "./lib/perfis-harness.js";

const ROOT = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const baseRoot = argValue(args, "--base");
if (!baseRoot) {
  console.error("Uso: invariancia-perfis.ts --base <árvore da versão anterior, compilada>");
  process.exit(2);
}
const headRoot = resolve(argValue(args, "--nova") ?? ROOT);
const corpus = resolve(argValue(args, "--corpus") ?? join(ROOT, "..", "govbr-corpus"));
const telas = resolve(argValue(args, "--telas") ?? join(ROOT, "..", "govbr-telas"));
const controlCount = argValue(args, "--controles") ? Number(argValue(args, "--controles")) : undefined;
const outDir = resolve(argValue(args, "--saida") ?? join(ROOT, "reports", "invariancia", new Date().toISOString().replace(/[:.]/g, "-")));

/**
 * Voláteis declarados — o que variou entre duas execuções da MESMA build 2.13.0 (prova A/A, cópia
 * contra cópia), e só isso:
 *   1. tempos (`elapsedMs`, `durationMs`, `waitedMs`, `startedAt`);
 *   2. ids que a PÁGINA sorteia a cada carga, dentro de textos (snippet, outerHTML, locator): o app id
 *      da emulação do Angular (`_ngcontent-<app>-c<N>`, `_nghost-…`, também na forma sem hífens que o
 *      snippet guarda) e o `list-<N>` do @govbr-ds/core — as mesmas duas normalizações nomeadas da
 *      política de fingerprint;
 *   3. hashes do estado renderizado (`stateFingerprint`, `previousFingerprint`, `currentFingerprint`,
 *      `familyId`, que inclui o fingerprint): mudam quando a página muda entre cargas. A igualdade crua
 *      deles é contada à parte no resumo, e `src/scan/state.ts` não muda entre as versões.
 * `version` do serverInfo muda por definição (2.13.0 → 2.14.0).
 */
const VOLATILE_KEYS = new Set(["elapsedMs", "durationMs", "waitedMs", "startedAt"]);
const STATE_HASH_KEYS = new Set(["stateFingerprint", "previousFingerprint", "currentFingerprint", "familyId"]);
const PAGE_RANDOM_IDS: Array<[RegExp, string]> = [
  [/_ng(content|host)-[a-z0-9]+-c\d+/g, "_ng$1-<app>-c<n>"],
  [/_ng(content|host)[a-z0-9]{3}c\d+/g, "_ng$1<app>c<n>"],
  [/\blist-\d{1,4}\b/g, "list-<n>"],
];

function normalize(value: unknown): unknown {
  if (typeof value === "string") return PAGE_RANDOM_IDS.reduce((text, [re, to]) => text.replace(re, to), value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        VOLATILE_KEYS.has(k) ? "<volátil>" : STATE_HASH_KEYS.has(k) && typeof v === "string" ? "<hash-de-estado>" : normalize(v),
      ])
    );
  }
  return value;
}

/** Valores crus de hash de estado numa resposta, para contar a igualdade sem normalização. */
function stateHashes(text: string): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (STATE_HASH_KEYS.has(k) && typeof x === "string") out.push(x);
        else walk(x);
      }
    }
  };
  try {
    walk(JSON.parse(text));
  } catch {
    /* não-JSON */
  }
  return out;
}

function normalizedText(record: CallRecord): string {
  if (record.label === "serverInfo") {
    const info = JSON.parse(record.text) as Record<string, unknown>;
    return JSON.stringify({ ...info, version: "<versão>" });
  }
  try {
    return JSON.stringify(normalize(JSON.parse(record.text)));
  } catch {
    return record.text;
  }
}

/** Caminhos JSON que diferem (até 20), para o relatório. */
function diffPaths(a: unknown, b: unknown, path = "$", out: string[] = []): string[] {
  if (out.length >= 20) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || a === null || b === null || typeof a !== "object") {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 120)} ≠ ${JSON.stringify(b)?.slice(0, 120)}`);
    return out;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
  return out;
}

async function runPlan(build: Build, pages: Pages): Promise<CallRecord[]> {
  const records: CallRecord[] = [];
  const allPages = [...pages.controls, pages.screens.a, pages.screens.b];
  const verifyPages = [pages.screens.a, pages.screens.b, ...pages.controls.slice(0, 3)];

  // evaluation: superfície, consultas à base, recursos, prompt e a sequência inteira por página.
  const evaluation = await Session.open(build, "evaluation");
  await evaluation.surface();
  for (const [label, a] of [
    ["get_ds_rules índice", {}],
    ["get_ds_rules id", { id: "govbr-3.7.0-accessibility-global-271582e4fbe8" }],
    ["get_ds_rules context", { context: { components: ["input", "button"] } }],
    ["get_ds_rules filtro", { component: "button", detail: "full", limit: 5 }],
  ] as const) await evaluation.tool(null, label, "get_ds_rules", a);
  await evaluation.tool(null, "get_design_tokens", "get_design_tokens", {});
  await evaluation.tool(null, "get_design_tokens query", "get_design_tokens", { query: "primary" });
  await evaluation.tool(null, "get_emag_rules", "get_emag_rules", {});
  await evaluation.tool(null, "get_emag_rules id", "get_emag_rules", { id: "6.6" });
  await evaluation.tool(null, "get_page_rules", "get_page_rules", {});
  await evaluation.tool(null, "get_component_spec", "get_component_spec", { component: "input" });
  for (const uri of ["govbr://schema/finding", "govbr://tokens", "govbr://knowledge/conflicts", "govbr://emag/6", "govbr://components/button"]) {
    await evaluation.resource(uri);
  }
  await evaluation.prompt("validate_page", { url: pages.screens.a });
  for (const url of allPages) {
    const { scanId, locator } = await scanSequence(evaluation, url);
    if (verifyPages.includes(url)) await verifyBattery(evaluation, url, scanId, locator);
    process.stderr.write(".");
  }
  records.push(...evaluation.records);
  await evaluation.close();

  // full: superfície + os verificadores individuais (caminho padrão do axe com e-MAG) em A e 3 controles.
  const full = await Session.open(build, "full");
  await full.surface();
  for (const url of [pages.screens.a, ...pages.controls.slice(0, 3)]) {
    await full.tool(url, "run_axe_scan", "run_axe_scan", { url, view: "findings", detail: "full" });
    await full.tool(url, "check_token_compliance", "check_token_compliance", { url, view: "findings", detail: "full" });
    await full.tool(url, "check_component_structure", "check_component_structure", { url, view: "findings", detail: "full" });
    await full.tool(url, "scan_page", "scan_page", { url });
  }
  records.push(...full.records);
  await full.close();

  for (const profile of ["normative", "deterministic", "evidence"]) {
    const s = await Session.open(build, profile);
    await s.surface();
    if (profile === "deterministic") await s.tool(pages.screens.a, "scan_page", "scan_page", { url: pages.screens.a });
    if (profile === "evidence") {
      await s.tool(pages.screens.a, "inspect_computed_styles", "inspect_computed_styles", { url: pages.screens.a, selectors: ["button", "input"] });
    }
    records.push(...s.records);
    await s.close();
  }
  await build.closeBrowser();
  return records;
}

function cli(root: string, url: string): string {
  const request = Buffer.from(JSON.stringify({ url, viewport: { width: 1280, height: 720 } })).toString("base64");
  const out = spawnSync(process.execPath, [join(root, "dist", "cli", "scan-page.js"), request], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return out.stdout;
}

const pages = await startPages({ corpus, telas, controls: controlCount });
try {
  const base = await loadBuild(resolve(baseRoot));
  const head = await loadBuild(headRoot);
  console.error(`base ${base.root} · nova ${head.root}`);
  const baseRecords = await runPlan(base, pages);
  console.error(`\nbase: ${baseRecords.length} respostas`);
  const headRecords = await runPlan(head, pages);
  console.error(`\nnova: ${headRecords.length} respostas`);
  if (baseRecords.length !== headRecords.length) throw new Error(`sequências de tamanhos diferentes: ${baseRecords.length} × ${headRecords.length}`);

  const rows = baseRecords.map((b, i) => {
    const h = headRecords[i];
    const nb = normalizedText(b);
    const nh = normalizedText(h);
    const identical = nb === nh && b.label === h.label;
    let differences: string[] = [];
    if (!identical) {
      try {
        differences = diffPaths(JSON.parse(nb), JSON.parse(nh));
      } catch {
        differences = ["texto não-JSON difere"];
      }
    }
    return {
      i,
      page: b.page,
      label: b.label,
      rawIdentical: b.text === h.text,
      stateHashesEqual: JSON.stringify(stateHashes(b.text)) === JSON.stringify(stateHashes(h.text)),
      identical,
      baseSha256: b.sha256,
      headSha256: h.sha256,
      normalizedSha256: sha256(nb),
      ...(differences.length ? { differences } : {}),
    };
  });

  const cliRows = [pages.screens.a, pages.screens.b].map((url) => {
    const b = cli(resolve(baseRoot), url);
    const h = cli(headRoot, url);
    const count = (t: string) => (JSON.parse(t) as { findings: unknown[] }).findings.length;
    const nb = JSON.stringify(normalize(JSON.parse(b)));
    const nh = JSON.stringify(normalize(JSON.parse(h)));
    return { url, baseFindings: count(b), headFindings: count(h), identical: nb === nh, baseSha256: sha256(b), headSha256: sha256(h), normalizedSha256: sha256(nb) };
  });

  const differing = rows.filter((r) => !r.identical);
  const summary = {
    generatedAt: new Date().toISOString(),
    base: resolve(baseRoot),
    head: headRoot,
    volatileKeys: [...VOLATILE_KEYS],
    stateHashKeys: [...STATE_HASH_KEYS],
    pageRandomIds: PAGE_RANDOM_IDS.map(([re]) => String(re)),
    responsesWithEqualRawStateHashes: rows.filter((r) => r.stateHashesEqual).length,
    pages: { controls: pages.controls.length, screens: 2 },
    responses: rows.length,
    rawIdentical: rows.filter((r) => r.rawIdentical).length,
    identicalAfterNormalization: rows.length - differing.length,
    differing: differing.length,
    allResponsesSha256: sha256(rows.map((r) => r.normalizedSha256).join("\n")),
    cli: cliRows,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "resumo.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, "respostas.json"), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify({ ...summary, firstDifferences: differing.slice(0, 10) }, null, 2));
  process.exitCode = differing.length === 0 && cliRows.every((c) => c.identical) ? 0 : 1;
} finally {
  await pages.close();
}
