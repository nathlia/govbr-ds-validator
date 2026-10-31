#!/usr/bin/env node
/**
 * Monta a versão literal da base de conhecimento (D-119, passo 3) a partir do corpus coletado em
 * ds-rules/govbr-ds-3.7.0-corpus/ e da versão anterior (versions/3.7.0/), sem tocar nesta.
 *
 * Uso: node scripts/build-kb-literal.mjs <corpusDir> [govbrEvalDir]
 *
 * O que faz, e só isso:
 *  - copia o corpus literal (.md + MANIFEST/COLETA/PROVENIENCIA) para versions/<v>/corpus/;
 *  - copia normalizacao/rules.jsonl para versions/<v>/normalized/rules.jsonl, trocando o id só onde a
 *    força mudou com o mesmo texto (id antigo vira legado `superseded`);
 *  - classifica as 186 regras antigas fora do conjunto novo (a: substituída por regra literal,
 *    b: fonte oficial fora do corpus literal → carried-over.jsonl, sem alteração; c: sem fonte
 *    verificável → legacy-ids.json, resolvível por id mas fora das listagens);
 *  - copia relatórios da normalização/auditoria e os artefatos auxiliares da 3.7.0 que o servidor
 *    lê (conflitos, auditoria do pacote, templates de validação do e-MAG);
 *  - escreve reports/regras-antigas.md e o manifest.json da versão.
 * Ids referenciados por código (src/, e, se informado, govbr-eval) são procurados e relatados.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { applyAmendment, readAmendment } from "./lib/kb-amendments.mjs";

const VERSION = "3.7.0-literal-2026-10-15";
/** Como a versão anterior é nomeada para quem recebe um id legado. */
const FROM_VERSION = "3.7.0 (base parcial de 2026-07)";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE = join(ROOT, "data/knowledge");
const OLD = join(KNOWLEDGE, "versions/3.7.0");
const OUT = join(KNOWLEDGE, "versions", VERSION);

const corpusDir = resolve(process.argv[2] ?? join(ROOT, "../ds-rules/govbr-ds-3.7.0-corpus"));
const evalDir = process.argv[3] ? resolve(process.argv[3]) : null;
const NORM = join(corpusDir, "normalizacao");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const readJsonl = (file) =>
  readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => ({ line: l, rule: JSON.parse(l) }));
const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const copy = (from, to) => {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
};
function walk(dir, skip = new Set()) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, skip));
    else out.push(p);
  }
  return out;
}
const posix = (p) => p.split(sep).join("/");

if (existsSync(OUT)) {
  console.error(`${OUT} já existe — uma versão publicada não é sobrescrita. Apague-a à mão se for refazer.`);
  process.exit(1);
}

// ── 1. corpus literal ──────────────────────────────────────────────────────────────────────────
const corpusFiles = walk(corpusDir, new Set(["normalizacao"]));
for (const f of corpusFiles) copy(f, join(OUT, "corpus", relative(corpusDir, f)));
const manifest = JSON.parse(readFileSync(join(corpusDir, "MANIFEST.json"), "utf8"));
const coleta = JSON.parse(readFileSync(join(corpusDir, "COLETA.json"), "utf8"));
for (const entry of manifest) {
  const file = join(corpusDir, entry.arquivo);
  if (!existsSync(file)) throw new Error(`MANIFEST cita arquivo ausente: ${entry.arquivo}`);
}

// ── 2. regras literais ─────────────────────────────────────────────────────────────────────────
// A normalização reaproveitou o id antigo sempre que o originalText era idêntico. Mesmo texto não é
// mesma regra quando a força mudou (revisão independente de 2026-10-15: 43 das 52): o id antigo só
// fica quando originalText E force são idênticos; senão a regra ganha o id que a normalização daria
// a uma regra nova (sha256(locator + originalText), sufixo -n em colisão) e `supersedes`.
const literalBuf = readFileSync(join(NORM, "rules.jsonl"));
const oldById = new Map(readJsonl(join(OLD, "normalized/rules.jsonl")).map((x) => [x.rule.id, x.rule]));
const literal = readJsonl(join(NORM, "rules.jsonl")).map((x) => x.rule);
const reassigned = new Map(); // id antigo → id novo
{
  const used = new Set(literal.map((r) => r.id));
  for (const r of literal) {
    const prev = oldById.get(r.id);
    if (!prev || (prev.originalText === r.originalText && prev.force === r.force)) continue;
    const h = sha256(Buffer.from(r.source.locator + r.originalText, "utf8")).slice(0, 12);
    let id = `govbr-3.7.0-${r.category}-${r.component ?? "global"}-${h}`;
    for (let n = 2; used.has(id); n++) id = `govbr-3.7.0-${r.category}-${r.component ?? "global"}-${h}-${n}`;
    used.add(id);
    reassigned.set(r.id, { id, from: prev.force, to: r.force });
    r.supersedes = [r.id];
    r.id = id;
  }
}
// 3.6.1 (D-155, NAT-104): a emenda declarada (scripts/kb-amendments/<versão>.json) entra depois das regras da
// normalização — conferida contra o texto arquivado em data/ — e conta como regra literal.
const amendment = readAmendment(VERSION);
const literalOut = applyAmendment(literal.map((r) => JSON.stringify(r)).join("\n") + "\n", amendment);
if (amendment) literal.push(...amendment.units);
write(join(OUT, "normalized/rules.jsonl"), literalOut);
const literalIds = new Set(literal.map((r) => r.id));
const mapNovo = (id) => reassigned.get(id)?.id ?? id;
for (const r of literal) {
  if (r.source.captureType === "literal-archived-page-rules") continue; // emenda: conferida em applyAmendment
  const file = join(corpusDir, r.source.corpusFile ?? "");
  if (!r.source.corpusFile || !readFileSync(file, "utf8").includes(r.originalText)) {
    throw new Error(`originalText não é literal do corpus: ${r.id}`);
  }
}

// ── 3. regras antigas ──────────────────────────────────────────────────────────────────────────
const old = readJsonl(join(OLD, "normalized/rules.jsonl"));
const mapa = new Map(JSON.parse(readFileSync(join(NORM, "mapa-ids.json"), "utf8")).mapa.map((e) => [e.antigo, e]));
const collectedPages = new Set(manifest.map((m) => m.url.replace(/\?.*$/, "").replace(/\/$/, "")));
const pageOf = (url) => url.replace(/\?.*$/, "").replace(/\/$/, "");

const loose = (t) => t.replace(/[‐-―−-]/g, "-").replace(/\s+/g, " ").trim();
const literalByLooseText = new Map();
for (const r of literal) {
  const k = loose(r.originalText);
  literalByLooseText.set(k, [...(literalByLooseText.get(k) ?? []), r.id]);
}
const classes = { same: [], a: [], b: [], c: [] };
for (const { line, rule } of old) {
  const e = mapa.get(rule.id);
  if (!e) throw new Error(`regra antiga sem linha no mapa-ids: ${rule.id}`);
  if (literalIds.has(rule.id)) {
    classes.same.push({ rule, situacao: e.situacao });
    continue;
  }
  let novos = (e.novos ?? []).map(mapNovo);
  let situacao = e.situacao;
  if (reassigned.has(rule.id)) {
    const x = reassigned.get(rule.id);
    novos = [x.id];
    situacao = `texto idêntico, força alterada (${x.from} → ${x.to}): id novo`;
  }
  for (const n of novos) if (!literalIds.has(n)) throw new Error(`mapa-ids aponta id novo inexistente: ${n}`);
  if (!novos.length) {
    // O mapa-ids compara texto exato. Diferença só de traço/espaço (o e-MAG publica "Recomendação
    // 2.1 - …" com hífen; a 3.7.0 guardava travessão) não é regra diferente.
    const twins = literalByLooseText.get(loose(rule.originalText)) ?? [];
    if (twins.length) {
      novos = twins;
      situacao = "mesmo texto a menos de traço/espaço (conferido por este script)";
    }
  }
  if (novos.length) {
    classes.a.push({ rule, situacao, supersededBy: novos });
  } else if (rule.force === "example") {
    classes.b.push({ line, rule, situacao: e.situacao, why: "exemplo canônico extraído do pacote oficial @govbr-ds/core 3.7.0 (evidência, não norma; D-10)" });
  } else if (!collectedPages.has(pageOf(rule.source.url))) {
    const wiki = rule.source.url.includes("govbr-ds-wiki");
    classes.b.push({
      line,
      rule,
      situacao: e.situacao,
      why: wiki
        ? "wiki oficial do gov.br DS (critérios de análise qualitativa), fora do corpus literal"
        : "página oficial do gov.br DS que o corpus literal não coletou",
    });
  } else {
    const descritiva = e.situacao.startsWith("texto antigo presente no corpus, mas");
    classes.c.push({
      rule,
      situacao: e.situacao,
      why: descritiva
        ? "o texto está no corpus, mas a extração o classificou como descritivo (não é regra)"
        : "a página-fonte foi coletada literalmente e o texto antigo não está nela (excerto de índice de busca/paráfrase)",
    });
  }
}

write(join(OUT, "normalized/carried-over.jsonl"), classes.b.map((x) => x.line).join("\n") + "\n");
const legacy = {
  note:
    "Ids da versão 3.7.0 (186 regras) que não estão nesta versão. Continuam resolvíveis por id " +
    "(get_ds_rules id/ids, verify_finding) com o campo `legacy`, para que achados e referências " +
    "antigos não percam a âncora, mas nunca entram em listagens nem no contexto normativo.",
  entries: [
    ...classes.a.map((x) => ({
      id: x.rule.id,
      class: "superseded",
      fromVersion: FROM_VERSION,
      supersededBy: x.supersededBy,
      reason: `substituída por regra literal (${x.situacao})`,
      record: x.rule,
    })),
    ...classes.c.map((x) => ({ id: x.rule.id, class: "dropped", fromVersion: FROM_VERSION, supersededBy: [], reason: x.why, record: x.rule })),
  ],
};
write(join(OUT, "normalized/legacy-ids.json"), JSON.stringify(legacy, null, 1) + "\n");

// ── 4. artefatos auxiliares herdados da 3.7.0 ─────────────────────────────────────────────────
const inherited = [
  "normalized/accessibility/emag-validation-templates.json",
  "reports/conflicts.json",
  "reports/official-package-audit.json",
];
for (const f of inherited) copy(join(OLD, f), join(OUT, f));

// ── 5. relatórios da normalização e da auditoria ───────────────────────────────────────────────
const reportCopies = {
  "reports/normalizacao/resumo.md": "resumo.md",
  "reports/normalizacao/cobertura.md": "cobertura.md",
  "reports/normalizacao/cobertura.json": "cobertura.json",
  "reports/normalizacao/mapa-ids.json": "mapa-ids.json",
  "reports/normalizacao/mapa-correcoes.json": "mapa-correcoes.json",
  "reports/normalizacao/correcoes-auditoria.md": "correcoes-auditoria.md",
  "reports/auditoria/relatorio.md": "auditoria/relatorio.md",
  "reports/auditoria/amostra.json": "auditoria/amostra.json",
  "reports/auditoria/vereditos.jsonl": "auditoria/vereditos.jsonl",
};
for (const [to, from] of Object.entries(reportCopies)) copy(join(NORM, from), join(OUT, to));

// ── 6. ids referenciados ───────────────────────────────────────────────────────────────────────
const ID = /govbr-3\.7\.0-[a-z]+-[a-z0-9]+-[0-9a-f]{12}(?:-\d+)?(?![0-9a-z])/g;
function scanRefs(dir, skip) {
  const refs = new Map();
  for (const f of walk(dir, skip)) {
    if (!/\.(ts|mts|mjs|js|json|jsonl|csv)$/.test(f) || statSync(f).size > 20e6) continue;
    for (const id of new Set(readFileSync(f, "utf8").match(ID) ?? [])) {
      if (!refs.has(id)) refs.set(id, new Set());
      refs.get(id).add(posix(relative(dirname(dir), f)));
    }
  }
  return refs;
}
const refs = new Map();
const merge = (m) => {
  for (const [id, files] of m) {
    if (!refs.has(id)) refs.set(id, new Set());
    for (const f of files) refs.get(id).add(f);
  }
};
merge(scanRefs(join(ROOT, "src"), new Set()));
if (evalDir) {
  // Insumos do scorer e da construção das referências; logs, resultados, painel e docs ficam fora.
  merge(scanRefs(evalDir, new Set(["node_modules", ".git", "results", "dashboard", "logs", "campanhas", "docs", "reports"])));
}
const oldIds = new Set(old.map((x) => x.rule.id));
const classOf = new Map([
  ...classes.same.map((x) => [x.rule.id, "mesmo id"]),
  ...classes.a.map((x) => [x.rule.id, "a"]),
  ...classes.b.map((x) => [x.rule.id, "b"]),
  ...classes.c.map((x) => [x.rule.id, "c"]),
]);
const unknownRefs = [...refs.keys()].filter((id) => !oldIds.has(id) && !literalIds.has(id));
const srcRefs = [...refs].filter(([, files]) => [...files].some((f) => f.startsWith("src/"))).map(([id]) => id).sort();

// ── 7. regras-antigas.md ───────────────────────────────────────────────────────────────────────
const refNote = (id) => {
  const files = [...(refs.get(id) ?? [])];
  if (!files.length) return "";
  // Só referências do próprio validator por id: quais regras o govbr-eval usa (gabaritos) não
  // entra neste repositório (CLAUDE.md — o oráculo não carrega a chave de respostas).
  const src = files.filter((f) => f.startsWith("src/"));
  return src.length ? ` — **referenciada em ${src.join(", ")}**` : "";
};
const short = (t) => t.replace(/\s+/g, " ").slice(0, 110) + (t.length > 110 ? "…" : "");
let md = `# Regras da versão 3.7.0 na versão ${VERSION}

Gerado por \`scripts/build-kb-literal.mjs\`. A versão 3.7.0 tinha **186** regras (152 normativas + 34 exemplos).
Nada foi perdido em silêncio: cada uma está em exatamente uma das classes abaixo.

| classe | o que acontece | regras |
|---|---|---:|
| mesmo id | originalText **e** força idênticos aos da 3.7.0; a regra nova reaproveita o id | ${classes.same.length} |
| (a) substituída | o texto virou regra(s) literal(is) com outro recorte, ou o texto é o mesmo e a força mudou (${reassigned.size}: id novo com \`supersedes\`) → \`legacy-ids.json\` (\`superseded\`, com os ids novos) | ${classes.a.length} |
| (b) outra fonte oficial | fonte oficial fora do corpus literal → \`normalized/carried-over.jsonl\`, registro inalterado, proveniência original | ${classes.b.length} |
| (c) sem fonte verificável | descartada das listagens → \`legacy-ids.json\` (\`dropped\`), ainda resolvível por id | ${classes.c.length} |

Os ids de (a) e (c) continuam resolvíveis por \`get_ds_rules\` (id/ids) e pelo portão de \`verify_finding\`,
com o campo \`legacy\` dizendo a classe e os ids novos; não entram em listagens, contagens, facetas nem
no contexto normativo.

## Ids referenciados

Varredura por \`govbr-3.7.0-…\` em \`src/\` do validator${evalDir ? " e nos insumos do govbr-eval (gabaritos, aliases, adjudicações, decisões de referência, scripts; sem logs, resultados, painel e docs)" : ""}:
**${refs.size}** ids distintos. Por id, este relatório só nomeia as referências do próprio validator; as do
govbr-eval aparecem só agregadas (o oráculo não carrega a chave de respostas).

- Em \`src/\` (verificadores determinísticos, \`CHECK_GROUNDING\`): ${srcRefs.map((id) => `\`${id}\` (${classOf.get(id) ?? (literalIds.has(id) ? "regra literal nova" : "?")})`).join(", ")}.
- Todos os referenciados, por classe: ${["mesmo id", "a", "b", "c"].map((k) => `${k} ${[...refs.keys()].filter((id) => classOf.get(id) === k).length}`).join(" · ")}; ids novos: ${[...refs.keys()].filter((id) => literalIds.has(id) && !oldIds.has(id)).length}.
- Ids referenciados que não existem em nenhuma das duas versões: ${unknownRefs.length ? unknownRefs.map((id) => `\`${id}\``).join(", ") : "nenhum"}.

Todos os referenciados continuam resolvíveis por id (mesmo id, carried-over ou legacy-ids).

`;
const section = (title, list, extra) => {
  md += `## ${title} (${list.length})\n\n`;
  for (const x of list) md += `- \`${x.rule.id}\` [${x.rule.force}] ${short(x.rule.originalText)}${extra(x)}${refNote(x.rule.id)}\n`;
  md += "\n";
};
section("(a) Substituídas por regra literal", classes.a, (x) => ` → ${x.supersededBy.map((n) => `\`${n}\``).join(", ")}`);
section("(b) Fonte oficial fora do corpus literal — mantidas sem alteração", classes.b, (x) => ` — ${x.why}; \`${x.rule.source.url}\``);
section("(c) Sem fonte verificável — fora das listagens", classes.c, (x) => ` — ${x.why}; \`${x.rule.source.url}\``);
write(join(OUT, "reports/regras-antigas.md"), md);

// ── 8. manifest da versão ──────────────────────────────────────────────────────────────────────
const count = (list, pick) => {
  const out = {};
  for (const r of list) out[pick(r)] = (out[pick(r)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((x, y) => y[1] - x[1]));
};
const carried = classes.b.map((x) => x.rule);
const all = [...literal, ...carried];
const absent = manifest.filter((m) => m.status !== "ok");
const componentTabs = manifest.filter((m) => m.arquivo.startsWith("componentes/"));
const notCollected = [...new Set(carried.filter((r) => r.force !== "example").map((r) => pageOf(r.source.url)))].sort();

const files = {};
for (const f of walk(OUT)) files[posix(relative(OUT, f))] = sha256(readFileSync(f));

const versionManifest = {
  version: VERSION,
  designSystemVersion: "3.7.0",
  documentationStatus: "stable",
  extractionTimestamp: "2026-10-15T00:00:00-03:00",
  previousVersion: "3.7.0",
  decision: "D-119 (plano thesis-workspace/planejamento/atual/plano-base-ds-literal-2026-10-15.md)",
  complete: false,
  completeNote:
    "Completo só o que foi coletado: as 3 abas dos 36 componentes (exceto 2 ausentes na fonte), 17 páginas adicionais " +
    "do gov.br DS e a página do e-MAG. Templates, 'como começar', vários guias e padrões NÃO foram coletados; as " +
    "regras antigas dessas páginas ficam em carried-over.jsonl com a proveniência original (excerto, não literal).",
  howToCite:
    "texto publicado em gov.br/ds (DS 3.7.0), fontes oficiais nos commits abaixo, acesso em 15/10/2026 — não é 'a tag 3.7.0'",
  sources: {
    core: {
      gitlabProject: 34516385,
      commit: coleta.refs.core,
      relationToRelease: "tag v3.7.0 + 11 commits, só de documentação (último em 2026-01-05)",
    },
    design: {
      gitlabProject: 35215527,
      commit: coleta.refs.design,
      relationToRelease: "tag v3.6.1 + 10 commits de correção de links (último em 2026-09-30); o repositório não tem tag 3.7.x",
    },
    siteContent: { gitlabProject: 45285709, commit: coleta.refs.site_content, date: "2026-09-30" },
    emag: { url: "https://emag.governoeletronico.gov.br/", version: "3.1" },
  },
  corpus: {
    path: "corpus/",
    accessDate: coleta.data_acesso,
    manifestSha256: sha256(readFileSync(join(corpusDir, "MANIFEST.json"))),
    markdownFiles: manifest.length,
    ok: manifest.filter((m) => m.status === "ok").length,
    absentAtSource: absent.map((m) => ({ file: m.arquivo, url: m.url, status: m.status })),
    componentTabs: {
      expected: coleta.componentes * coleta.abas_por_componente,
      collected: componentTabs.filter((m) => m.status === "ok").length,
      complete: false,
    },
    additionalGovbrDsPages: { collected: coleta.paginas_adicionais_govbr_ds },
    emagPages: { collected: coleta.paginas_emag, complete: true },
    pagesNotCollectedButCitedByCarriedRules: notCollected,
    provenance: "corpus/PROVENIENCIA.md",
  },
  ruleFiles: ["normalized/rules.jsonl", "normalized/carried-over.jsonl"],
  legacyIds: "normalized/legacy-ids.json",
  counts: {
    totalRecords: all.length,
    literalRules: literal.length,
    literalRulesSha256: sha256(Buffer.from(literalOut, "utf8")),
    normalizationOutputSha256: sha256(literalBuf),
    idsReassigned: reassigned.size,
    carriedOverRecords: carried.length,
    carriedOverNormative: carried.filter((r) => r.force !== "example").length,
    carriedOverExamples: carried.filter((r) => r.force === "example").length,
    normativeRecords: all.filter((r) => r.force !== "example").length,
    evidenceRecords: all.filter((r) => r.force === "example").length,
    literalByForce: count(literal, (r) => r.force),
    literalByCategory: count(literal, (r) => r.category),
    literalByStandard: count(literal, (r) => r.standard ?? "(none)"),
    literalByTab: count(literal, (r) => r.source.tab ?? "(página sem aba)"),
    literalComponents: Object.keys(count(literal.filter((r) => r.component), (r) => r.component)).length,
    oldRules: {
      total: old.length,
      sameId: classes.same.length,
      superseded: classes.a.length,
      carriedOver: classes.b.length,
      dropped: classes.c.length,
    },
    referencedIds: refs.size,
    unclearRules: literal.filter((r) => r.force === "unclear").length,
  },
  audit: {
    report: "reports/auditoria/relatorio.md",
    corrections: "reports/normalizacao/correcoes-auditoria.md",
    method: "amostra estratificada (~10%) + todas as unclear, por agente independente; desacordos altos corrigidos antes da integração",
  },
  inheritedFrom3_7_0: {
    files: inherited,
    note: "Artefatos auxiliares lidos pelo servidor (conflitos, auditoria do pacote oficial, templates de validação do e-MAG), copiados sem alteração da versão 3.7.0.",
  },
  knownLimitations: [
    "Texto publicado em gov.br/ds na data de acesso, não a tag 3.7.0 (ver sources).",
    "Abas de acessibilidade do accordion e do scrim ausentes na fonte: esses dois componentes não têm regras de acessibilidade próprias.",
    "validationStrategy/automatable vêm de heurística por palavras-chave (automationConfidence: low) e não foram revisados um a um.",
    "Regras em carried-over.jsonl não são literais: são excertos/derivações da versão 3.7.0, mantidos por virem de fonte oficial fora do corpus.",
    "15 regras 'unclear', com a força proposta na nota.",
  ],
  files,
};
if (amendment) {
  const { units, version: _v, ...meta } = amendment;
  versionManifest.amendments = [{ ...meta, added: units.map((u) => u.id) }];
}
write(join(OUT, "manifest.json"), JSON.stringify(versionManifest, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      version: VERSION,
      literal: literal.length,
      carried: carried.length,
      same: classes.same.length,
      a: classes.a.length,
      b: classes.b.length,
      c: classes.c.length,
      refs: refs.size,
      srcRefs: srcRefs.map((id) => `${id}:${classOf.get(id)}`),
      unknownRefs,
    },
    null,
    1,
  ),
);
