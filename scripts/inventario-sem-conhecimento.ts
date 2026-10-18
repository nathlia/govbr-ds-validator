/**
 * Inventário das respostas reais do perfil knowledge-free (2.14.0, NAT-61, plano §5.2).
 *
 * Sobe um servidor `knowledge-free` e um `evaluation` (controle positivo) no mesmo processo, com a
 * trava de conhecimento no escopo de cada chamada, roda a mesma sequência nas páginas de
 * desenvolvimento (`controles/a/`, nunca `b/`) e nas telas congeladas A e B, e varre cada resposta com
 * o dicionário gerado do `data/` (scripts/lib/vazamento.ts). Nenhum modelo.
 *
 * Aceite: knowledge-free com 0 ocorrências sem explicação e trava = 0; evaluation COM ocorrências sem
 * explicação (senão o detector estaria quebrado); canários do detector disparando.
 *
 *   npm run inventario:sem-conhecimento -- [--saida dir] [--controles N] [--corpus ..] [--telas ..]
 *
 * Roda sobre o dist/ (rode npm run build antes): é a build que o runner sobe, e o código que vai para
 * page.evaluate não passa pela transformação do tsx (que injeta __name e quebra no navegador).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "../dist/server.js";
import { closeBrowser } from "../dist/evidence/browser.js";
import { knowledgeLockAttempts, runKnowledgeLocked } from "../dist/data/lock.js";
import { PageScanCache, scanPage, type PageScanResult } from "../dist/scan/pageScan.js";
import type { Finding } from "../dist/schema/finding.js";
import { CHECK_GROUNDING, type CheckKind } from "../dist/checkers/grounding.js";
import { pageConstraints } from "../dist/checkers/pageStructure.js";
import { constraintsForComponent, getComponentSpecs } from "../dist/data/load.js";
import { Session, argValue, scanSequence, sha256, startPages, verifyBattery, type Build, type CallRecord } from "./lib/perfis-harness.js";
import { buildDictionary, scanResponse, type Classification, type Dictionary } from "./lib/vazamento.js";

const ROOT = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const corpus = resolve(argValue(args, "--corpus") ?? join(ROOT, "..", "govbr-corpus"));
const telas = resolve(argValue(args, "--telas") ?? join(ROOT, "..", "govbr-telas"));
const controlCount = argValue(args, "--controles") ? Number(argValue(args, "--controles")) : undefined;
const outDir = resolve(argValue(args, "--saida") ?? join(ROOT, "reports", "inventario-sem-conhecimento", new Date().toISOString().replace(/[:.]/g, "-")));
const require = createRequire(import.meta.url);

/** Ids publicados das checagens que aplicam a base (ds-token-*, ds-structure-*, ds-page-*). */
function publishedCheckIds(): string[] {
  const tokenIds = (Object.keys(CHECK_GROUNDING) as CheckKind[]).map((k) => `ds-${k}`);
  const structure = Object.values(getComponentSpecs().components).flatMap((spec) => constraintsForComponent(spec).map((c) => c.id));
  return [...tokenIds, ...structure, ...pageConstraints().map((c) => c.id)];
}

/** Canários: o detector precisa disparar onde deve e perdoar só onde a proveniência sustenta. */
function canaries(dict: Dictionary, axe: string): Array<{ name: string; ok: boolean; detail: string }> {
  const kbId = [...dict.exact.values()].find((t) => t.source === "kb:id")!.term;
  const kbTitle = [...dict.phrases.values()].find((t) => t.source === "kb:title")!.term;
  const token = [...dict.exact.values()].find((t) => t.source === "tokens:name")!.term;
  const emagTitle = [...dict.phrases.values()].find((t) => t.source === "emag:title")!.term;
  const page = `<html><body><div style="color: var(${token})">x</div></body></html>`;
  // 2.14.1 (revisão Codex db6d022d): casos por ferramenta, campo declarado e eco exato.
  const cases: Array<{ name: string; tool: string; text: string; args: unknown; page: string | null; expect: Classification }> = [
    { name: "título da base numa nota do servidor", tool: "verify_finding", text: JSON.stringify({ note: `Veja ${kbTitle}.` }), args: {}, page, expect: "sem-explicacao" },
    { name: "id da base enriquecido pelo servidor", tool: "verify_finding", text: JSON.stringify({ next: { ruleId: kbId } }), args: {}, page, expect: "sem-explicacao" },
    { name: "título e-MAG anexado à descrição", tool: "scan_page", text: JSON.stringify({ findings: [{ rule: { description: `x (e-MAG 1.1: ${emagTitle})` } }] }), args: {}, page, expect: "sem-explicacao" },
    { name: "token num snippet SEM o token na página", tool: "scan_page", text: JSON.stringify({ findings: [{ element: { snippet: `<i style="color:var(${token})">` } }] }), args: {}, page: "<html></html>", expect: "sem-explicacao" },
    { name: "token num campo do servidor COM o token na página", tool: "scan_page", text: JSON.stringify({ note: `use ${token}` }), args: {}, page, expect: "sem-explicacao" },
    { name: "token num campo genérico 'detail' COM o token na página", tool: "scan_page", text: JSON.stringify({ limitation: { detail: `use ${token}` } }), args: {}, page, expect: "sem-explicacao" },
    { name: "token num snippet COM o token na página", tool: "scan_page", text: JSON.stringify({ findings: [{ element: { snippet: `<div style="color: var(${token})">` } }] }), args: {}, page, expect: "pagina" },
    { name: "id da base ecoado do argumento", tool: "verify_finding", text: JSON.stringify({ verification: { detail: `Nenhum predicado para govbr-ds-kb '${kbId}'.` } }), args: { finding: { rule: { id: kbId } } }, page, expect: "eco" },
    { name: "id citado ecoado FORA do campo declarado", tool: "verify_finding", text: JSON.stringify({ verification: { next: { ruleId: kbId } } }), args: { finding: { rule: { id: kbId } } }, page, expect: "sem-explicacao" },
    { name: "título da base no campo de eco, com o título só dentro de outro argumento", tool: "verify_finding", text: JSON.stringify({ verification: { detail: `Regra: ${kbTitle}.` } }), args: { finding: { rule: { id: kbId }, evidence: { observed: `nota do agente: ${kbTitle}` } } }, page, expect: "sem-explicacao" },
  ];
  return cases.map((c) => {
    const { hits } = scanResponse(dict, c.text, { tool: c.tool, args: c.args, page: c.page, axe });
    const got = hits.map((h) => h.class);
    const ok = got.length > 0 && got.every((g) => g === c.expect);
    return { name: c.name, ok, detail: `esperado ${c.expect}, obtido [${got.join(", ") || "nenhuma ocorrência"}]` };
  });
}

/** Bytes servidos (respostas de texto) + DOM renderizado de cada página. */
async function pageCorpora(urls: string[]): Promise<Map<string, string>> {
  const browser = await chromium.launch();
  const out = new Map<string, string>();
  try {
    for (const url of urls) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      const parts: string[] = [];
      page.on("response", async (response) => {
        const type = response.headers()["content-type"] ?? "";
        if (/text|javascript|json|svg|css/.test(type)) {
          try {
            parts.push(await response.text());
          } catch {
            /* corpo indisponível */
          }
        }
      });
      await page.goto(url, { waitUntil: "load" });
      await page.waitForTimeout(1500);
      parts.push(await page.content());
      out.set(url, parts.join("\n"));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}

const thisBuild: Build = {
  root: ROOT,
  createServer: createServer as unknown as Build["createServer"],
  closeBrowser,
};

const dict = buildDictionary(ROOT, { checkIds: publishedCheckIds() });
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const canaryResults = canaries(dict, axe);
console.error(`dicionário: ${dict.exact.size} termos exatos, ${dict.phrases.size} frases · canários ${canaryResults.filter((c) => c.ok).length}/${canaryResults.length}`);

const pages = await startPages({ corpus, telas, controls: controlCount });
try {
  const allPages = [...pages.controls, pages.screens.a, pages.screens.b];
  const verifyPages = [pages.screens.a, pages.screens.b, ...pages.controls.slice(0, 3)];
  const corpora = await pageCorpora(allPages);

  const profiles: Record<string, CallRecord[]> = {};
  for (const profile of ["knowledge-free", "evaluation"]) {
    const s = await Session.open(thisBuild, profile, { knowledgeLock: "call" });
    await s.surface();
    if (profile === "knowledge-free") await s.tool(null, "ferramenta retirada", "get_ds_rules", {});
    for (const url of allPages) {
      const { scanId, locator } = await scanSequence(s, url);
      if (verifyPages.includes(url)) await verifyBattery(s, url, scanId, locator);
      process.stderr.write(".");
    }
    profiles[profile] = s.records;
    await s.close();
    console.error(`\n${profile}: ${s.records.length} respostas`);
  }
  // Paridade do axe (plano §7.1): por página, os achados do axe no knowledge-free são os do
  // evaluation sem a anotação e-MAG (sufixo da descrição e evidence.data.emagId), e nada mais.
  const strip = (f: Finding) => {
    const { emagId: _emag, ...data } = (f.evidence.data ?? {}) as Record<string, unknown>;
    const { id: _id, ...rest } = f;
    // Ids que a página sorteia a cada carga (app id do Angular, list-N do DS) não são do oráculo.
    return pageRandom(JSON.stringify({ ...rest, rule: { ...f.rule, description: f.rule.description.replace(/ \(e-MAG [^)]*\)$/, "") }, evidence: { ...f.evidence, data } }));
  };
  const pageRandom = (text: string) =>
    text.replace(/_ng(content|host)-[a-z0-9]+-c\d+/g, "_ng$1-<app>").replace(/_ng(content|host)[a-z0-9]{3}c\d+/g, "_ng$1<app>").replace(/\blist-\d{1,4}\b/g, "list-<n>");
  const axeParity = [];
  for (const url of allPages) {
    const ev = (await scanPage({ url, checks: ["axe"] }, new PageScanCache(1))) as PageScanResult;
    const kfScan = (await runKnowledgeLocked(() => scanPage({ url }, new PageScanCache(1), { knowledgeFree: true }))) as PageScanResult;
    const a = ev.findings.map(strip);
    const b = kfScan.findings.map(strip);
    const kfRaw = JSON.stringify(kfScan.findings);
    axeParity.push({
      url,
      evaluationAxeFindings: a.length,
      knowledgeFreeFindings: b.length,
      equalWithoutEmag: JSON.stringify(a) === JSON.stringify(b),
      knowledgeFreeHasEmag: /e-MAG|emagId/.test(kfRaw),
      sameFingerprint: ev.stateFingerprint === kfScan.stateFingerprint,
    });
  }
  await closeBrowser();
  const lock = knowledgeLockAttempts();

  const report: Record<string, unknown> = {};
  const verdicts: Record<string, { unexplained: number; total: number }> = {};
  for (const [profile, records] of Object.entries(profiles)) {
    const byClass: Record<string, number> = {};
    const exempt = new Map<string, { class: string; why: string; term: string; source: string; path: string; label: string; count: number }>();
    const unexplained = new Map<string, { term: string; source: string; path: string; label: string; page: string | null; count: number }>();
    const responses = records.map((r) => {
      // Proveniência por ferramenta (2.14.1): o eco vale só como valor exato no campo declarado; o nome
      // da ferramenta pode voltar no texto de erro (ex.: "get_ds_rules not found").
      const { hits } = scanResponse(dict, r.text, { tool: r.name, args: r.args ?? {}, page: r.page ? corpora.get(r.page) ?? null : null, axe });
      for (const h of hits) {
        byClass[h.class] = (byClass[h.class] ?? 0) + 1;
        const key = `${h.class}|${h.term}|${h.path}|${r.label}`;
        if (h.class === "sem-explicacao") {
          const u = unexplained.get(key) ?? { term: h.term, source: h.source, path: h.path, label: r.label, page: r.page, count: 0 };
          u.count += 1;
          unexplained.set(key, u);
        } else {
          const e = exempt.get(key) ?? { class: h.class, why: h.why, term: h.term, source: h.source, path: h.path, label: r.label, count: 0 };
          e.count += 1;
          exempt.set(key, e);
        }
      }
      return { page: r.page, label: r.label, name: r.name, isError: r.isError, sha256: r.sha256, hits: hits.length, unexplained: hits.filter((h) => h.class === "sem-explicacao").length };
    });
    const toolsList = records.find((r) => r.label === "tools/list")!;
    const tools = JSON.parse(toolsList.text) as Array<{ name: string }>;
    report[profile] = {
      responses: records.length,
      tools: tools.map((t) => t.name),
      toolsListSha256: sha256(toolsList.text),
      surface: Object.fromEntries(records.filter((r) => r.kind === "list").map((r) => [r.label, r.isError ? r.text : sha256(r.text)])),
      hitsByClass: byClass,
      unexplained: [...unexplained.values()],
      exempted: [...exempt.values()],
      responsesDetail: responses,
      allResponsesSha256: sha256(records.map((r) => r.sha256).join("\n")),
    };
    verdicts[profile] = { unexplained: [...unexplained.values()].reduce((n, u) => n + u.count, 0), total: Object.values(byClass).reduce((a, b) => a + b, 0) };
  }

  const kf = verdicts["knowledge-free"];
  const ev = verdicts.evaluation;
  const parityOk = axeParity.every((p) => p.equalWithoutEmag && !p.knowledgeFreeHasEmag);
  const accepted = kf.unexplained === 0 && ev.unexplained > 0 && lock.attempts === 0 && canaryResults.every((c) => c.ok) && parityOk;
  const summary = {
    generatedAt: new Date().toISOString(),
    validatorRoot: ROOT,
    pages: { controls: pages.controls.length, controlsWing: "a (desenvolvimento; b/ nunca servida)", screens: ["A solicitacao", "B vistorias"] },
    dictionary: { exact: dict.exact.size, phrases: dict.phrases.size, bySource: dict.counts },
    canaries: canaryResults,
    knowledgeLock: lock,
    verdicts,
    axeParity: {
      pages: axeParity.length,
      equalWithoutEmag: axeParity.filter((p) => p.equalWithoutEmag).length,
      knowledgeFreeWithEmag: axeParity.filter((p) => p.knowledgeFreeHasEmag).length,
      sameFingerprint: axeParity.filter((p) => p.sameFingerprint).length,
      findings: { evaluation: axeParity.reduce((n, p) => n + p.evaluationAxeFindings, 0), knowledgeFree: axeParity.reduce((n, p) => n + p.knowledgeFreeFindings, 0) },
      differing: axeParity.filter((p) => !p.equalWithoutEmag),
    },
    accepted,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "resumo.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, "relatorio.json"), JSON.stringify(report, null, 2));
  for (const [profile, records] of Object.entries(profiles)) {
    writeFileSync(join(outDir, `respostas-${profile}.json`), JSON.stringify(records, null, 1));
  }
  const brief = (p: string) => {
    const r = report[p] as { tools: string[]; toolsListSha256: string; hitsByClass: unknown; unexplained: unknown[] };
    return { tools: r.tools, toolsListSha256: r.toolsListSha256, hitsByClass: r.hitsByClass, unexplainedSample: r.unexplained.slice(0, 8) };
  };
  console.log(JSON.stringify({ ...summary, "knowledge-free": brief("knowledge-free"), evaluation: brief("evaluation"), outDir }, null, 2));
  process.exitCode = accepted ? 0 : 1;
} finally {
  await pages.close();
}
