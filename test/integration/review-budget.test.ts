/**
 * 3.0.0, revisão independente (28/10): orçamento de 8.000 em TODA resposta inicial (todas as
 * ferramentas, todos os perfis), estrito também nos objetos aninhados, leitura do verify em about:none
 * e em id legado substituído, orientação com basis e escopo, fim de resultados e query vazia.
 *
 * Fixture sintética e neutra: 300 elementos br-* com classes fora do DS, cores e fontes soltas
 * (o mesmo desenho do big.html da revisão, gerado aqui).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { ABSENCE_NOTE } from "../../src/responses/absence.js";
import { MESSAGES, PREDICATE_NOT_RUN, RESPONSE_BUDGET } from "../../src/responses/contract.js";
import { resetKnowledgeLock } from "../../src/data/lock.js";
import { getGuidance, validateGuidance } from "../../src/data/guidance.js";

const COMPS = ["button", "input", "select", "checkbox", "radio", "modal", "header", "footer", "menu", "table", "pagination", "tab", "tag", "card", "list", "breadcrumb", "message", "notification", "avatar", "divider"];
let BIG = "";
for (let i = 0; i < 300; i++) {
  const c = COMPS[i % COMPS.length];
  BIG += `<div class="br-${c} br-unknown-${i}-x weird-${i}" style="color:#${(100000 + i * 37).toString(16).slice(0, 6)};background:#${(200000 + i * 91).toString(16).slice(0, 6)};border-radius:${i % 9}px;padding:${i % 13}px;font-family:Arial${i}"><span>item ${i} ${"texto ".repeat(i % 7)}</span><img src="x${i}.png"><a href="#" aria-controls="nope-${i}"></a><input id="f${i}"><button class="br-button" style="color:#${(300000 + i).toString(16)}"></button></div>\n`;
}
const PAGES: Record<string, string> = {
  "/big": `<!doctype html><html><head><title>big</title></head><body>${BIG}</body></html>`,
  "/ok": `<!doctype html><html lang="pt-BR"><head><title>ok</title></head><body><header>h</header><main><a href="#main">Ir</a><p id="main">conteudo</p></main><footer>f</footer></body></html>`,
};

let http: Server;
let base = "";
beforeAll(async () => {
  http = createHttpServer((req, res) => {
    const body = PAGES[new URL(req.url ?? "/", "http://x").pathname];
    if (!body) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  resetKnowledgeLock();
  await closeBrowser();
  await new Promise((r) => http.close(() => r(undefined)));
});

async function connect(profile: "full" | "evaluation" | "knowledge-free") {
  const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "govbr-rev-")) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: `rev-${profile}`, version: "1" });
  await srv.connect(b);
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { text, data, isError: Boolean(r.isError) };
  };
  return { client, call };
}

function within(label: string, text: string) {
  expect(text.length, `${label}: ${text.length}`).toBeLessThanOrEqual(RESPONSE_BUDGET);
}

describe("revisão: toda resposta inicial no teto de 8.000, em todos os perfis", () => {
  it("full: scanners, detalhes, diff, observações, conhecimento", async () => {
    const { client, call } = await connect("full");
    try {
      const url = `${base}/big`;
      const scan = await call("scan_page", { url });
      within("scan_page", scan.text);
      const compare = await call("scan_page", { url, checks: ["tokens"], tokenChecks: ["color"], compareToScanId: scan.data.scanId });
      within("scan_page compare", compare.text);
      // A5: o piso pode diferir o diff inteiro para preservar a cláusula integral.
      if (!compare.data.stateDiff?.findings) {
        const diff = await call("get_finding_details", { scanId: compare.data.scanId, view: "diff" });
        within("diff diferido", diff.text);
        expect(diff.isError).toBe(false);
        expect(diff.data).toMatchObject({ kind: "finding-diff", scanId: compare.data.scanId, previousScanId: scan.data.scanId });
        let seen = diff.data.count;
        let next = diff.data.next?.arguments;
        for (let guard = 0; next && guard < 200; guard++) {
          const more = await call("get_finding_details", next);
          within("diff diferido continuação", more.text);
          expect(more.isError).toBe(false);
          seen += more.data.count;
          next = more.data.next?.arguments;
        }
        expect(next).toBeUndefined();
        expect(seen).toBe(diff.data.total);
      } else {
      expect(compare.data.stateDiff.findings).toMatchObject({ added: expect.any(Number), removed: expect.any(Number) });
      // 3.6.1: no aperto da 1ª página os ids do diff podem ir para a continuação (view:diff), antes das pendências.
      expect(compare.data.stateDiff.findings.addedIds?.length ?? 0).toBeLessThanOrEqual(10);
      if (compare.data.stateDiff.findings.next) {
        let args = compare.data.stateDiff.findings.next.arguments;
        let seen = 0;
        for (let guard = 0; args && guard < 200; guard++) {
          const page = await call("get_finding_details", args);
          within("diff page", page.text);
          seen += page.data.count;
          args = page.data.next?.arguments;
        }
        // 3.6.1 (item 4): as linhas "not-remeasured" (check que não rodou neste scan) também paginam.
        expect(seen).toBe(compare.data.stateDiff.findings.added + compare.data.stateDiff.findings.removed + compare.data.stateDiff.findings.evidenceChanged + (compare.data.stateDiff.findings.notRemeasured ?? 0));
      }
      }
      for (const [name, args] of [
        ["check_component_structure", { url }],
        ["check_token_compliance", { url }],
        ["run_axe_scan", { url }],
        ["get_finding_details", { scanId: scan.data.scanId }],
        ["get_finding_details", { scanId: scan.data.scanId, view: "findings", detail: "full" }],
        ["get_finding_details", { scanId: scan.data.scanId, view: "observations" }],
        ["inspect_computed_styles", { url, selectors: ["div", "span", "img", "a", "input", "button"] }], // era 2,17 MB
        ["get_design_tokens", {}],
        ["get_design_tokens", { query: "-" }],
        ["get_page_rules", {}],
        ["list_components", {}],
        ["get_emag_rules", {}],
      ] as Array<[string, Record<string, unknown>]>) {
        const r = await call(name, args);
        expect(r.isError, `${name} ${JSON.stringify(args)}`).toBe(false);
        within(`${name} ${JSON.stringify(args)}`, r.text);
      }
      const inspected = await call("inspect_computed_styles", { url, selectors: ["button"], properties: ["color"] });
      let seenElements = inspected.data.returned;
      let nextArgs = inspected.data.next?.arguments;
      for (let guard = 0; nextArgs && guard < 50; guard++) {
        const page = await call("inspect_computed_styles", nextArgs);
        within("inspect cont", page.text);
        seenElements += page.data.returned;
        nextArgs = page.data.next?.arguments;
      }
      expect(seenElements).toBe(inspected.data.count);
      const structure = await call("check_component_structure", { url });
      expect(structure.data.observations.total).toBeGreaterThan(structure.data.observations.returned);
      expect(structure.data.observations.next.arguments.view).toBe("observations");
      for (const category of ["page_structure", "form_patterns", "navigation_patterns", "help_communication", "empty_states", "states", "grid", "writing_principles", "microcopy", "html_best_practices", "html_accessibility", "wai_aria", "minimum_standard"]) {
        let r = await call("get_page_rules", { category });
        within(`get_page_rules ${category}`, r.text);
        for (let guard = 0; r.data.page.cursor && guard < 20; guard++) {
          r = await call("get_page_rules", { category, cursor: r.data.page.cursor });
          within(`get_page_rules ${category} cont`, r.text);
        }
        expect(r.data.page.cursor).toBeNull();
      }
      let tokens = await call("get_design_tokens", {});
      const hexes = new Set(Object.keys(tokens.data.hexLookup));
      for (let guard = 0; tokens.data.page.cursor && guard < 30; guard++) {
        tokens = await call("get_design_tokens", { cursor: tokens.data.page.cursor });
        for (const k of Object.keys(tokens.data.hexLookup)) hexes.add(k);
      }
      expect(hexes.size).toBe(tokens.data.page.total);
      const hex = await call("get_design_tokens", { hex: "1351B4" });
      expect(hex.data.tokens).toContain("--color-primary-default");
      // Checkers isolados com zero achados também levam a nota de ausência.
      const empty = await call("check_component_structure", { url: `${base}/ok` });
      expect(empty.data.summary.total).toBe(0);
      expect(empty.data.absenceNote).toBe(ABSENCE_NOTE);
    } finally {
      await client.close();
    }
  }, 240_000);

  it("evaluation e knowledge-free: scan, compare, detalhes", async () => {
    for (const profile of ["evaluation", "knowledge-free"] as const) {
      const { client, call } = await connect(profile);
      try {
        const url = `${base}/big`;
        const scan = await call("scan_page", { url });
        within(`${profile} scan`, scan.text);
        within(`${profile} compare`, (await call("scan_page", { url, compareToScanId: scan.data.scanId })).text);
        within(`${profile} details`, (await call("get_finding_details", { scanId: scan.data.scanId })).text);
        within(`${profile} details full`, (await call("get_finding_details", { scanId: scan.data.scanId, view: "findings", detail: "full" })).text);
      } finally {
        await client.close();
      }
    }
  }, 120_000);
});

describe("revisão: entrada estrita também nos objetos aninhados (B-01)", () => {
  it("campo desconhecido dentro de finding é recusado com o nome mais próximo", async () => {
    const { client, call } = await connect("evaluation");
    try {
      const finding = {
        id: "F-1", rule: { source: "wcag", id: "1.1.1", description: "x" },
        element: { page: `${base}/ok`, locator: "main" },
        severity: "minor", nature: "semantic", mode: "display", pathway: "heuristic",
        evidence: { observed: "o", expected: "e", data: { livre: 1 } },
      };
      expect((await call("verify_finding", { finding })).isError).toBe(false); // evidence.data continua aberto
      const bogus = await call("verify_finding", { finding: { ...finding, bogus: 1 } });
      expect(bogus.isError).toBe(true);
      expect(bogus.text).toContain("verify_finding.finding");
      const typo = await call("verify_finding", { finding: { ...finding, rule: { ...finding.rule, implement: ["x"] } } });
      expect(typo.isError).toBe(true);
      expect(typo.text).toContain("você quis dizer 'implements'");
      const action = await call("scan_page", { url: `${base}/ok`, actions: [{ action: "click", selector: "main", sellector: "x" }] });
      expect(action.isError).toBe(true);
    } finally {
      await client.close();
    }
  });
});

describe("revisão: leitura do verify_finding", () => {
  it("about:none (predicado não rodou) não diz que o veredito é sobre a citação; id legado substituído segue a sucessora", async () => {
    const { client, call } = await connect("evaluation");
    try {
      const scan = await call("scan_page", { url: `${base}/big`, checks: ["structure"], view: "findings", detail: "full", limit: 50, maxChars: 100_000 });
      const own = scan.data.findings.find((f: { rule: { id: string; checker?: string } }) => f.rule.checker === "ds-structure-button-tag");
      const notRun = await call("verify_finding", { finding: own });
      expect(notRun.data.reasons[0].code).toBe("predicate-not-run");
      expect(notRun.data.about).toBe("none");
      expect(notRun.data.observation).toEqual({ status: "not-evaluated", message: PREDICATE_NOT_RUN });
      const legacy = await call("verify_finding", {
        finding: {
          id: "F-3", rule: { source: "govbr-ds-kb", id: "govbr-3.7.0-accessibility-modal-65446caf1efc", description: "x" },
          element: { page: `${base}/ok`, locator: "main" },
          severity: "serious", nature: "semantic", mode: "display", pathway: "heuristic",
          evidence: { observed: "o", expected: "e" },
        },
      });
      expect(legacy.data.reasons[0].code).toBe("citation-legacy-superseded");
      expect(legacy.data.about).toBe("citation");
      // A sucessora não tem predicado: nada foi medido — "não avaliado" (3.3.0, S-05; segue a sucessora, §11).
      expect(legacy.data.observation.status).toBe("not-evaluated");
      expect(legacy.data.actions[0]).toMatchObject({ action: "correct-citation", tool: "get_ds_rules" });
    } finally {
      await client.close();
    }
  });
});

describe("revisão: orientação, fim de resultados, query vazia", () => {
  it("investigation.toVerify leva basis; o conceito só dispara no componente do escopo; basis inválido falha na carga", async () => {
    const previous = process.env.GOVBR_RETRIEVAL_GUIDANCE;
    process.env.GOVBR_RETRIEVAL_GUIDANCE = "pending";
    const { client, call } = await connect("evaluation");
    try {
      const on = await call("get_ds_rules", { query: "página selecionada só muda de cor", component: "pagination" });
      for (const p of on.data.investigation.toVerify) expect(p).toEqual({ text: expect.any(String), basis: expect.stringMatching(/^(govbr-3\.7\.0-|componentProvenance:)/) });
      const other = await call("get_ds_rules", { query: "item atual ativo", component: "menu" });
      expect(other.data.investigation).toBeUndefined();
      const none = await call("get_ds_rules", { query: "item atual ativo" });
      expect(none.data.investigation).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.GOVBR_RETRIEVAL_GUIDANCE;
      else process.env.GOVBR_RETRIEVAL_GUIDANCE = previous;
      await client.close();
    }
    const g = structuredClone(getGuidance());
    g.concepts[0].toVerify[0].basis = "govbr-3.7.0-inventado-000000000000";
    expect(() => validateGuidance(g)).toThrow(/sem basis válido/);
    g.concepts[0].toVerify[0].basis = "";
    expect(() => validateGuidance(g)).toThrow();
  });

  it("offset além do fim → fim explícito; query vazia → no-content-terms", async () => {
    const { client, call } = await connect("evaluation");
    try {
      const past = await call("get_ds_rules", { query: "foco", component: "modal", offset: 999 });
      expect(past.data).toMatchObject({ status: "end-of-results", results: [], page: { stop: "end", cursor: null, note: MESSAGES["results-end"] } });
      expect(past.data.next[0]).toMatchObject({ tool: "get_ds_rules", arguments: { query: "foco", component: "modal" } });
      for (const query of ["", "   "]) {
        const r = await call("get_ds_rules", { query });
        expect(r.isError).toBe(true);
        expect(r.data.errorCode).toBe("no-content-terms");
      }
    } finally {
      await client.close();
    }
  });
});

describe("revisão 3.1.0: continuação de achados nunca esvazia a página nem repete o cursor", () => {
  it("get_finding_details{scanId, view:findings, detail:evidence, maxChars:1000} anda até o fim; ids mode não emite scanId vazio", async () => {
    const { client, call } = await connect("evaluation");
    try {
      const scan = await call("scan_page", { url: `${base}/big`, checks: ["structure"], view: "findings", limit: 1 });
      const total = (scan.data.totalFindings ?? scan.data.total ?? scan.data.summary?.total) as number;
      expect(total).toBeGreaterThan(1);
      const seen = new Set<string>();
      let cursor: number | undefined = 0;
      for (let i = 0; i <= total + 2 && cursor !== undefined; i++) {
        const page = await call("get_finding_details", { scanId: scan.data.scanId, view: "findings", detail: "evidence", maxChars: 1_000, cursor });
        expect(page.data.findings.length).toBeGreaterThanOrEqual(1);
        for (const f of page.data.findings) seen.add(f.id);
        if (page.data.nextCursor !== undefined) expect(page.data.nextCursor).toBeGreaterThan(cursor!);
        cursor = page.data.nextCursor;
      }
      expect(cursor).toBeUndefined();
      expect(seen.size).toBe(total);
      const ids = [...seen].slice(0, 2);
      const byIds = await call("get_finding_details", { ids, detail: "evidence", maxChars: 1_000 });
      expect(byIds.data.findings.length).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(byIds.data)).not.toMatch(/"scanId":""/);
    } finally {
      await client.close();
    }
  });
});
