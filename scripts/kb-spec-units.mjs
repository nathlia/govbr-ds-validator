#!/usr/bin/env node
/**
 * 3.7.3 (D-167): emenda-2 da base literal 3.7.0 — unidades de especificação extraídas mecanicamente das páginas de
 * designer e de desenvolvedor dos 36 componentes (regras em scripts/lib/kb-spec-extract.mjs, RULES).
 *
 * Uso:
 *   node scripts/kb-spec-units.mjs           escreve a emenda declarada e aplica-a à versão publicada em data/
 *   node scripts/kb-spec-units.mjs --check   refaz tudo em memória e falha se algum arquivo em disco diferir
 *
 * Escreve (e só isso):
 *  - scripts/kb-amendments/<versão>+emenda-2.json — a entrada declarada: regras, gerador, sha256 das unidades, contagens
 *    (sem as unidades: elas são reproduzidas pelo gerador e conferidas contra o sha256 e o texto do corpus);
 *  - data/knowledge/versions/<versão>/normalized/rules.jsonl — o rules.jsonl da emenda-1, byte a byte, + as unidades;
 *  - …/normalized/spec-tables.json — as tabelas por linha (parte → propriedade → token/valor), com o id de cada linha;
 *  - …/reports/emenda-2/extracao.{md,json} — regras, contagens por componente, o que cada regra deixou de fora;
 *  - …/manifest.json — contagens, sha256 dos arquivos e a emenda-2 em `amendments`.
 * Idempotente: as unidades de especificação já presentes no rules.jsonl são retiradas antes (a base é a da emenda-1).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AMENDMENTS_DIR, applyAmendment } from "./lib/kb-amendments.mjs";
import { CAPTURE_TYPE, EXTRACTOR_VERSION, RULES, SPEC_FORCE, extractSpecUnits, specCounts, unitsSha256 } from "./lib/kb-spec-extract.mjs";

const VERSION = "3.7.0-literal-2026-10-15";
const LABEL = "emenda-2";
/** rules.jsonl servido com a emenda-1 (3.6.1, dataSha ffe79da7): a base desta emenda. */
const PREVIOUS_RULES_SHA256 = "c8c4327d3b4c9eea173f96ce2ee72d0eeddbb534f5da6409627c921d30879a0f";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data/knowledge/versions", VERSION);
const CHECK = process.argv.includes("--check");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const posix = (p) => p.split(sep).join("/");
const pending = new Map(); // caminho absoluto → conteúdo

const rulesPath = join(DIR, "normalized/rules.jsonl");
const served = readFileSync(rulesPath, "utf8");
const base = served.split("\n").filter((l) => l.trim() && JSON.parse(l).source?.captureType !== CAPTURE_TYPE).join("\n") + "\n";
if (sha256(Buffer.from(base, "utf8")) !== PREVIOUS_RULES_SHA256) {
  throw new Error(`o rules.jsonl sem as unidades de especificação não é o da emenda-1 (${PREVIOUS_RULES_SHA256.slice(0, 12)}…)`);
}
const baseRules = base.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const coveragePath = join(DIR, "reports/normalizacao/cobertura.json");
const coverage = JSON.parse(readFileSync(coveragePath, "utf8"));
const corpusDir = join(DIR, "corpus");
const { units, tables, skipped } = extractSpecUnits({ corpusDir, rules: baseRules, coverage });
const counts = specCounts(units, tables);
const manifestPath = join(DIR, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// ── 1. a emenda declarada ──────────────────────────────────────────────────────────────────────
const declaration = {
  version: VERSION,
  label: LABEL,
  validator: "3.7.3",
  decision: "D-167 (NAT-115, 'ampliar'): tabelas de especificação e frases descritivas como unidades de especificação",
  what:
    `${counts.units} unidades de especificação (force: "${SPEC_FORCE}") das páginas de designer e de desenvolvedor dos ${counts.components} ` +
    `componentes: ${counts.tableRows} linhas de ${counts.tables} tabelas da região de Especificações (T1) e ${counts.sentences} frases ` +
    "descritivas de comportamento e anatomia (S1 sem palavra de força, S2 com gatilho que a normalização julgou descritivo). " +
    "Texto literal, nunca reescrito como obrigação; candidatas a investigar, fora de toda contagem de obrigações.",
  provenance:
    `texto literal de data/knowledge/versions/${VERSION}/corpus/componentes/*__{designer,desenvolvedor}.md (o corpus da versão, ` +
    `MANIFEST sha256 ${manifest.corpus.manifestSha256.slice(0, 12)}…, acesso 2026-10-15); source.captureType = ${CAPTURE_TYPE}, ` +
    "corpusFile + line + charRange + contentHash (sha256 do arquivo), locator = Caminho-fonte do arquivo, commit da fonte oficial.",
  generator: {
    script: "scripts/kb-spec-units.mjs",
    extractor: EXTRACTOR_VERSION,
    library: ["scripts/lib/kb-spec-extract.mjs", "scripts/lib/kb-segment.mjs"],
    segmentation:
      "porta em JS de normalizacao/tools/segmentar.py (D-119); conferida a cada execução contra reports/normalizacao/cobertura.json " +
      "(toda frase da cobertura = o segmento de mesmo k)",
    inputs: {
      corpusManifestSha256: manifest.corpus.manifestSha256,
      rulesBaseSha256: PREVIOUS_RULES_SHA256,
      coverageSha256: sha256(readFileSync(coveragePath)),
    },
  },
  rules: RULES,
  counts,
  unitsSha256: unitsSha256(units),
  previousRulesSha256: PREVIOUS_RULES_SHA256,
  reproduce:
    "node scripts/kb-spec-units.mjs (--check confere sem escrever); scripts/lib/kb-amendments.mjs (applyAmendment) reproduz as unidades " +
    "pelo gerador, confere o sha256 declarado e o texto literal de cada uma no corpus, e as acrescenta ao rules.jsonl da emenda-1.",
};
const declarationPath = join(AMENDMENTS_DIR, `${VERSION}+${LABEL}.json`);
pending.set(declarationPath, JSON.stringify(declaration, null, 2) + "\n");

// ── 2. rules.jsonl ─────────────────────────────────────────────────────────────────────────────
const rulesOut = applyAmendment(base, declaration, ROOT, { corpusDir, coveragePath });
pending.set(rulesPath, rulesOut);

// ── 3. tabelas ─────────────────────────────────────────────────────────────────────────────────
const specTables = {
  version: `${VERSION}+${LABEL}`,
  generatedBy: `scripts/kb-spec-units.mjs (${EXTRACTOR_VERSION})`,
  note:
    "Tabelas da região de Especificações das páginas de designer, uma linha por unidade de especificação (unitId, force " +
    `"${SPEC_FORCE}"): part = 1ª coluna; entries = as outras colunas não vazias {column, property, value, tokens}. Para medir ` +
    "'token por parte do componente': filtre por component e part, compare tokens/valor com o valor computado. Descreve o " +
    "componente; não é obrigação.",
  count: tables.length,
  tables,
};
pending.set(join(DIR, "normalized/spec-tables.json"), JSON.stringify(specTables, null, 1) + "\n");

// ── 4. relatório ───────────────────────────────────────────────────────────────────────────────
const report = { version: `${VERSION}+${LABEL}`, extractor: EXTRACTOR_VERSION, rules: RULES, counts, skipped, unitsSha256: declaration.unitsSha256 };
pending.set(join(DIR, "reports/emenda-2/extracao.json"), JSON.stringify(report, null, 2) + "\n");
const examples = (pick) => units.filter(pick).slice(0, 3).map((u) => `  - \`${u.id}\` (${u.source.corpusFile}:${u.source.line}) ${u.normalizedRule.slice(0, 140)}`).join("\n");
let md = `# Emenda-2 da base ${VERSION} — unidades de especificação (D-167)

Gerado por \`scripts/kb-spec-units.mjs\` (${EXTRACTOR_VERSION}). Nenhuma unidade escrita à mão: as regras abaixo, aplicadas ao
corpus literal da versão (\`corpus/componentes/*__designer.md\` e \`*__desenvolvedor.md\`), são a definição inteira.
Força \`${SPEC_FORCE}\`: o texto descreve o componente (tabela de especificação, frase de comportamento ou anatomia);
não obriga nem proíbe, não entra em listagens nem contagens de obrigações; a busca o serve como candidata a investigar.

## Regras (literais)

${RULES.map((r) => `- **${r.id}** (${r.what}): ${r.text}`).join("\n")}

## Contagens

| | unidades |
|---|---:|
| total | ${counts.units} |
| linhas de tabela (T1) | ${counts.tableRows} (de ${counts.tables} tabelas) |
| frases S1 (sem palavra de força) | ${counts.byRule.S1 ?? 0} |
| frases S2 (gatilho julgado descritivo) | ${counts.byRule.S2 ?? 0} |
| aba designer / desenvolvedor | ${counts.byTab.designer ?? 0} / ${counts.byTab.desenvolvedor ?? 0} |

O que cada regra deixou de fora: tabelas — ${skipped.T1.empty} linhas sem valor, ${skipped.T1.overlap} já unidade; frases —
${skipped.S.noH2} sem título de nível 2 (introdução), ${skipped.S.section} em seção excluída, ${skipped.S.force} com palavra de força
(regra da normalização ou excluída por outro motivo), ${skipped.S.shape} fora da forma (legenda, pergunta, introdução de lista, remetimento,
menos de 5 palavras), ${skipped.S.overlap} já unidade.

## Por componente

| componente | tabelas | linhas de tabela | frases | total |
|---|---:|---:|---:|---:|
${Object.entries(counts.byComponent).map(([c, x]) => `| ${c} | ${x.tables} | ${x.tableRows} | ${x.sentences} | ${x.tableRows + x.sentences} |`).join("\n")}

## Exemplos

- T1:
${examples((u) => u.specification.rule === "T1")}
- S1:
${examples((u) => u.specification.rule === "S1")}
- S2:
${examples((u) => u.specification.rule === "S2")}
`;
pending.set(join(DIR, "reports/emenda-2/extracao.md"), md);

// ── 5. manifest ────────────────────────────────────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const fileHashes = {};
const onDiskAfter = new Set([...walk(DIR), ...[...pending.keys()].filter((p) => p.startsWith(DIR))]);
for (const f of [...onDiskAfter].sort()) {
  const rel = posix(relative(DIR, f));
  if (rel === "manifest.json") continue;
  fileHashes[rel] = sha256(pending.has(f) ? Buffer.from(pending.get(f), "utf8") : readFileSync(f));
}
const sorted = Object.fromEntries(Object.keys(fileHashes).sort().map((k) => [k, fileHashes[k]]));
const totalBefore = manifest.counts.literalRules + manifest.counts.carriedOverRecords;
const nextManifest = {
  ...manifest,
  ruleFiles: manifest.ruleFiles,
  specificationTables: "normalized/spec-tables.json",
  counts: {
    ...manifest.counts,
    totalRecords: totalBefore + units.length,
    literalRulesSha256: sha256(Buffer.from(rulesOut, "utf8")),
    specification: {
      note: `unidades force "${SPEC_FORCE}" (emenda-2, D-167) — fora de literalRules, normativeRecords e literalByForce, que continuam contando só as regras`,
      units: counts.units,
      tables: counts.tables,
      tableRows: counts.tableRows,
      sentences: counts.sentences,
      byRule: counts.byRule,
      byTab: counts.byTab,
      components: counts.components,
    },
  },
  files: sorted,
  amendments: [
    manifest.amendments[0],
    {
      label: LABEL,
      validator: declaration.validator,
      decision: declaration.decision,
      added: units.map((u) => u.id),
      what: declaration.what,
      provenance: declaration.provenance,
      previousRulesSha256: PREVIOUS_RULES_SHA256,
      unitsSha256: declaration.unitsSha256,
      reproduce: declaration.reproduce,
    },
  ],
};
if (manifest.amendments[0]?.label !== "emenda-1") throw new Error("manifest sem a emenda-1 na 1ª posição");
pending.set(manifestPath, JSON.stringify(nextManifest, null, 2) + "\n");

// ── escrever ou conferir ─────────────────────────────────────────────────────────────────────────
const diffs = [];
for (const [path, content] of pending) {
  const now = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (now !== content) diffs.push(posix(relative(ROOT, path)));
  if (!CHECK && now !== content) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}
console.log(JSON.stringify({ mode: CHECK ? "check" : "write", version: `${VERSION}+${LABEL}`, ...counts, byComponent: undefined, skipped, unitsSha256: declaration.unitsSha256, rulesSha256: nextManifest.counts.literalRulesSha256, changed: diffs }, null, 1));
if (CHECK && diffs.length) process.exit(1);
