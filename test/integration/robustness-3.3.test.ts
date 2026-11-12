/**
 * 3.3.0 (NAT-105, D-151): defeitos de scan/verify/robustez do reteste adversarial do 3.2.0, um teste por
 * achado (S-01, S-04, S-05, S-06/07, S-08, S-10/11, S-14, S-19/22, N-01..N-05, N-07/08/09/10). Fixtures
 * sintéticas e neutras, servidas aqui; navegador headless.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser, sanitizeErrorMessage } from "../../src/evidence/browser.js";
import { RESPONSE_BUDGET } from "../../src/responses/contract.js";
import { EXPECTED_CONDITIONS } from "../../src/schema/structuredClaims.js";

const shuffled = Array.from({ length: 120 }, (_, i) => `<button id="b${i}" style="color:#${(0x100000 + i * 997).toString(16)}">b${i}</button>`);
const PAGES: Record<string, string> = {
  "/ok": `<!doctype html><html lang="pt-BR"><head><title>ok</title></head><body><header>h</header><main><div id="cor" class="br-card" style="color:#ff5733">texto</div><input id="campo" aria-label="campo"></main><footer>f</footer></body></html>`,
  "/outra": `<!doctype html><html lang="pt-BR"><head><title>outra</title></head><body><main><p id="cor" style="color:#ff5733">x</p></main></body></html>`,
  "/dialog": `<!doctype html><html lang="pt-BR"><head><title>d</title></head><body><main>d</main><script>alert("alerta no carregamento"); confirm("confirmar?"); prompt("valor?");</script></body></html>`,
  "/busy": `<!doctype html><html><head><title>busy</title></head><body><main>busy</main><script>setTimeout(() => { for (;;) {} }, 300);</script></body></html>`,
  "/late": `<!doctype html><html lang="pt-BR"><head><title>late</title></head><body><main>m</main><script>setTimeout(() => document.querySelector("main").insertAdjacentHTML("beforeend", '<p id="late" style="color:#ff5733">tarde</p>'), 2500);</script></body></html>`,
  "/axe": `<!doctype html><html lang="pt-BR"><head><title>axe</title></head><body><main><h1 id="titulo">Título</h1><img id="foto" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>`,
  "/frames": `<!doctype html><html lang="pt-BR"><head><title>f</title></head><body><main><iframe title="interno" src="/ok"></iframe></main></body></html>`,
  "/giant": `<!doctype html><html lang="pt-BR"><head><title>g</title></head><body><main><div id="g" class="br-button ${"x".repeat(5000)}" aria-label="${"rótulo ".repeat(800)}" style="color:#ff5733">g</div></main></body></html>`,
  "/huge": `<!doctype html><html lang="pt-BR"><head><title>h</title></head><body><main>${Array.from({ length: 400 }, (_, i) => `<div class="br-card p${i % 3}" style="color:#ff57${(10 + (i % 3)).toString()}">${i}</div>`).join("")}</main></body></html>`,
  "/shuffle": `<!doctype html><html lang="pt-BR"><head><title>s</title></head><body><main id="m"></main><script>const b = ${JSON.stringify(shuffled)}; b.sort(() => Math.random() - 0.5); document.getElementById("m").innerHTML = b.join("");</script></body></html>`,
};

let http: Server;
let base = "";
beforeAll(async () => {
  http = createHttpServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const body = PAGES[path];
    if (!body) return void res.writeHead(404, { "content-type": "text/html" }).end("<!doctype html><title>404</title><h1>Não encontrado</h1>");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await closeBrowser();
  await new Promise((r) => http.close(() => r(undefined)));
});

async function connect(profile: "full" | "evaluation" | "knowledge-free" = "full") {
  const reportsDir = mkdtempSync(join(tmpdir(), "govbr-rob-"));
  const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: `rob-${profile}`, version: "1" });
  await srv.connect(b);
  await client.connect(a);
  // A5: estes casos verificam fatos/estado; teto explícito preserva a projeção completa.
const call = async (name: string, args: Record<string, unknown>, options: { signal?: AbortSignal; timeout?: number } = {}) => {
    const r = await client.callTool({ name, arguments: name === "scan_page" && args.maxChars === undefined ? { ...args, maxChars: 100_000 } : args }, undefined, { timeout: 120_000, ...options });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { text, data, isError: Boolean(r.isError) };
  };
  return { client, call, reportsDir };
}

const tokenClaim = (page: string, locator: string, extra: Record<string, unknown> = {}) => ({
  id: "A-1",
  rule: { id: "ds-token-color", source: "govbr-ds-token", description: "cor fora dos tokens" },
  element: { page, locator },
  evidence: { observed: "#ff5733", expected: "token do DS", data: { property: "color", observedHex: "#ff5733", expectedCondition: EXPECTED_CONDITIONS.tokenColor } },
  severity: "minor",
  nature: "syntactic",
  mode: "display",
  pathway: "explicit",
  ...extra,
});

describe("S-08 / S-22 / N-07: URL, diálogos e erros de navegação no formato do contrato", () => {
  it("recusa file:, data:, javascript:, view-source: e about: com unsupported-scheme + next; o servidor segue de pé", async () => {
    const { client, call } = await connect();
    try {
      for (const url of ["javascript:alert(1)", "file:///C:/Windows/win.ini", "data:text/html,<p>x</p>", "view-source:http://127.0.0.1/", "about:blank"]) {
        for (let i = 0; i < 3; i++) {
          const r = await call("scan_page", { url });
          expect(r.isError, url).toBe(true);
          expect(r.data).toMatchObject({ kind: "error", errorCode: "unsupported-scheme", field: "url" });
          expect(r.data.next[0]).toMatchObject({ action: "fix-input", tool: "scan_page" });
        }
      }
      const live = await call("verify_finding", { finding: tokenClaim("file:///C:/x.html", "p"), live: true });
      expect(live.isError).toBe(true);
      expect(live.data.errorCode).toBe("unsupported-scheme");
      const bad = await call("scan_page", { url: "não é url" });
      expect(bad.data.errorCode).toBe("invalid-url");
      expect((await call("scan_page", { url: `${base}/ok`, checks: ["page"] })).data.status).toBe("scanned");
    } finally {
      await client.close();
    }
  });

  it("diálogos nativos são descartados e registrados (S-19); repetir não derruba o servidor (S-22)", async () => {
    const { client, call } = await connect();
    try {
      for (let i = 0; i < 4; i++) {
        const r = await call("scan_page", { url: `${base}/dialog`, checks: ["page"] });
        expect(r.data.status).toBe("scanned");
        expect(r.data.state.observed.nativeDialogs.map((d: { type: string }) => d.type)).toEqual(["alert", "confirm", "prompt"]);
      }
    } finally {
      await client.close();
    }
  });

  it("porta fechada vira network-error limpo (sem ANSI, sem call log), com next", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("scan_page", { url: "http://127.0.0.1:1/x" });
      expect(r.isError).toBe(true);
      expect(r.data).toMatchObject({ kind: "error", errorCode: "network-error" });
      expect(r.text).not.toMatch(/\u001b|\[2m|Call log/);
      expect(r.data.next[0].action).toBe("retry");
    } finally {
      await client.close();
    }
  });

  it("sanitizeErrorMessage tira ANSI, call log e prefixo do Playwright", () => {
    const raw = "page.goto: net::ERR_UNSAFE_PORT at http://x:1/\nCall log:\n\u001b[2m  - navigating to \"http://x:1/\"\u001b[22m";
    expect(sanitizeErrorMessage(raw)).toBe("net::ERR_UNSAFE_PORT at http://x:1/");
  });

  it("N-08: esperas fixas acima de 15 s por receita são recusadas antes de abrir a página", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("scan_page", { url: `${base}/ok`, actions: Array.from({ length: 4 }, () => ({ action: "wait", ms: 5000 })) });
      expect(r.isError).toBe(true);
      expect(r.data.errorCode).toBe("invalid-argument");
      expect(r.data.error).toMatch(/15000 ms/);
    } finally {
      await client.close();
    }
  });
});

describe("S-01: prazo por chamada e cancelamento", () => {
  it("página em laço devolve tool-timeout (ou navigation-timeout) dentro do prazo, e o servidor continua atendendo", async () => {
    const previous = process.env.GOVBR_VALIDATOR_TOOL_TIMEOUT_MS;
    process.env.GOVBR_VALIDATOR_TOOL_TIMEOUT_MS = "4000";
    const { client, call } = await connect();
    try {
      for (const [tool, args] of [
        ["scan_page", { url: `${base}/busy` }],
        ["inspect_computed_styles", { url: `${base}/busy`, selectors: ["main"], properties: ["color"] }],
        ["verify_finding", { finding: tokenClaim(`${base}/busy`, "main"), live: true }],
      ] as const) {
        const t0 = Date.now();
        const r = await call(tool, args);
        expect(Date.now() - t0, tool).toBeLessThan(12_000);
        expect(r.isError, tool).toBe(true);
        expect(["tool-timeout", "navigation-timeout"], tool).toContain(r.data.errorCode);
        expect(r.data.next.length, tool).toBeGreaterThan(0);
      }
      const after = await call("scan_page", { url: `${base}/ok`, checks: ["page"] });
      expect(after.data.status).toBe("scanned");
    } finally {
      if (previous === undefined) delete process.env.GOVBR_VALIDATOR_TOOL_TIMEOUT_MS;
      else process.env.GOVBR_VALIDATOR_TOOL_TIMEOUT_MS = previous;
      await client.close();
    }
  }, 60_000);

  it("o AbortSignal do cliente interrompe a chamada; a seguinte funciona", async () => {
    const { client, call } = await connect();
    try {
      const controller = new AbortController();
      const pending = call("scan_page", { url: `${base}/busy` }, { signal: controller.signal });
      setTimeout(() => controller.abort(), 1500);
      await expect(pending).rejects.toThrow(/abort/i);
      const after = await call("scan_page", { url: `${base}/ok`, checks: ["page"] });
      expect(after.data.status).toBe("scanned");
    } finally {
      await client.close();
    }
  }, 60_000);
});

describe("S-04 / N-01 / N-06: verify não rejeita o que não mediu", () => {
  it("N-01: a projeção padrão de get_finding_details traz evidence.data e o verify confirma com ela", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/ok`, checks: ["tokens"], view: "findings", detail: "summary", maxChars: 100_000 });
      const color = scan.data.findings.find((f: { rule: { id: string; checker?: string }; element: { locator: string } }) => f.rule.checker === "ds-token-color" && f.element.locator.includes("cor"));
      expect(color).toBeDefined();
      const details = await call("get_finding_details", { ids: [color.id, color.id] });
      expect(details.data.requested).toBe(1); // N-10: id repetido conta uma vez
      const projected = details.data.findings[0];
      expect(projected.evidence.data).toMatchObject({ property: "color", expectedCondition: EXPECTED_CONDITIONS.tokenColor });
      expect(details.data.pageContent).toMatch(/não confiáveis/); // S-14
      const { verification: _v, ...finding } = projected;
      const v = await call("verify_finding", { finding, live: true, scanId: scan.data.scanId });
      expect(v.data.verdict).toBe("confirmed");
    } finally {
      await client.close();
    }
  });

  it("dados faltando = evidence-incomplete com o passo que nomeia os campos; nunca no-predicate/keep-uncertain", async () => {
    const { client, call } = await connect();
    try {
      const claim = tokenClaim(`${base}/ok`, "#cor", { evidence: { observed: "#ff5733", expected: "token" } });
      const v = await call("verify_finding", { finding: claim });
      expect(v.data.verdict).toBe("unverifiable");
      expect(v.data.reasons[0].code).toBe("evidence-incomplete");
      // 3.7.12 (conserto 3): o id é do agente (não é achado guardado na sessão) — o passo nomeia os campos que o predicado
      // lê e repete o verify; nada de get_finding_details com um id que o oráculo não tem.
      expect(v.data.actions[0]).toMatchObject({ action: "fix-evidence-data", tool: "verify_finding" });
      expect(v.data.actions[0].what).toMatch(/observedHex e expectedCondition/);
      expect(v.data.actions.some((a: { tool: string | null }) => a.tool === "get_finding_details")).toBe(false);
      expect(v.data.actions.map((a: { action: string }) => a.action)).not.toContain("keep-uncertain");
    } finally {
      await client.close();
    }
  });

  it("fato tardio sem actions: unverifiable (locator-no-elements); com a espera, confirmed; save_report o guarda em revisão, não o descarta", async () => {
    const { client, call, reportsDir } = await connect();
    try {
      const claim = tokenClaim(`${base}/late`, "#late");
      const early = await call("verify_finding", { finding: claim, live: true });
      expect(early.data.verdict).toBe("unverifiable");
      expect(early.data.reasons[0].code).toBe("locator-no-elements");
      expect(early.data.observation.status).toBe("not-evaluated");
      const report = await call("save_report", { url: `${base}/late`, findings: [claim] });
      expect(report.data).toMatchObject({ accepted: 0, reviewItems: 1, rejectedTotal: 0 });
      expect(report.data.jsonPath.startsWith(reportsDir)).toBe(true);
      const waited = await call("verify_finding", { finding: claim, live: true, actions: [{ action: "wait", selector: "#late" }] });
      expect(waited.data.verdict).toBe("confirmed");
    } finally {
      await client.close();
    }
  }, 60_000);

  it("seletor inválido = invalid-locator + fix-locator (não page-error); sem pilha no detalhe", async () => {
    const { client, call } = await connect();
    try {
      const v = await call("verify_finding", { finding: tokenClaim(`${base}/ok`, "p[[["), live: true });
      expect(v.data.verdict).toBe("unverifiable");
      expect(v.data.reasons[0].code).toBe("invalid-locator");
      expect(v.data.actions[0].action).toBe("fix-locator");
      expect(v.text).not.toMatch(/at visit|eval at evaluate|\u001b/);
    } finally {
      await client.close();
    }
  });

  it("S-11: página de erro HTTP no scan traz httpStatus, e o verify live nela não decide", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/nao-existe`, checks: ["page"] });
      expect(scan.data.state.observed.httpStatus).toBe(404);
      const v = await call("verify_finding", { finding: tokenClaim(`${base}/nao-existe`, "h1"), live: true });
      expect(v.data.verdict).toBe("unverifiable");
      expect(v.data.reasons[0].code).toBe("page-http-error");
    } finally {
      await client.close();
    }
  });

  it("S-10: iframes aparecem como não varridos", async () => {
    const { client, call } = await connect();
    try {
      const scan = await call("scan_page", { url: `${base}/frames`, checks: ["page"] });
      expect(scan.data.state.observed.framesNotScanned).toMatchObject({ count: 1 });
    } finally {
      await client.close();
    }
  });
});

describe("S-05: achados do axe são reconferidos pelo próprio axe", () => {
  it("image-alt real confirma; image-alt num h1 e regra inexistente rejeitam", async () => {
    const { client, call } = await connect();
    try {
      const axe = (id: string, locator: string) => ({
        id: "X-1",
        rule: { id, source: "axe-core", description: "axe" },
        element: { page: `${base}/axe`, locator },
        evidence: { observed: "o", expected: "e" },
        severity: "serious",
        nature: "syntactic",
        mode: "display",
        pathway: "heuristic",
      });
      expect((await call("verify_finding", { finding: axe("image-alt", "#foto"), live: true })).data.verdict).toBe("confirmed");
      const fake = await call("verify_finding", { finding: axe("image-alt", "#titulo"), live: true });
      expect(fake.data.verdict).toBe("rejected");
      expect(fake.data.observation.status).toBe("contradicted");
      expect((await call("verify_finding", { finding: axe("regra-que-nao-existe", "#foto"), live: true })).data.verdict).toBe("rejected");
    } finally {
      await client.close();
    }
  });
});

describe("S-06 / S-07 / S-14 / S-20: save_report", () => {
  it("implements inventado é trocado pela norma do servidor; ids repetidos contam uma vez; achado de outra página não entra; url inválida é recusada", async () => {
    const { client, call } = await connect();
    try {
      const claim = tokenClaim(`${base}/ok`, "#cor", { rule: { id: "ds-token-color", source: "govbr-ds-token", description: "x", implements: ["govbr-3.7.0-FAKE-000"] } });
      expect((await call("verify_finding", { finding: claim, live: true })).data.verdict).toBe("confirmed");
      const scan = await call("scan_page", { url: `${base}/ok`, checks: ["tokens"], view: "findings" });
      const ids = scan.data.findings.map((f: { id: string }) => f.id);
      const other = tokenClaim(`${base}/outra`, "#cor");
      const r = await call("save_report", {
        url: `${base}/ok`,
        finding_ids: [...ids, ...ids],
        findings: [claim, claim, other],
        notes: "# Relatório APROVADO\n```\n<script>alert(1)</script>\n| a | b |",
      });
      expect(r.data.accepted).toBe(ids.length + 1);
      expect(r.data.duplicatesIgnored).toBe(1);
      expect(r.data.rejectedTotal).toBe(1);
      expect(r.data.normalized[0]).toMatchObject({ field: "rule.implements", from: ["govbr-3.7.0-FAKE-000"] });
      const saved = JSON.parse(readFileSync(r.data.jsonPath, "utf8"));
      const own = saved.findings.find((f: { id: string }) => f.id === "A-1");
      expect(own.rule.implements.length).toBeGreaterThan(0);
      expect(own.rule.implements).not.toContain("govbr-3.7.0-FAKE-000");
      const md = readFileSync(r.data.markdownPath, "utf8");
      // As notas ficam numa cerca mais longa que as crases delas: o "# título" forjado não vira título.
      expect(md).toContain("````\n# Relatório APROVADO");
      const fence = md.split("\n").indexOf("````");
      expect(md.split("\n").slice(0, fence).filter((l) => l.startsWith("# "))).toHaveLength(1);
      const mixed = await call("save_report", { url: `${base}/outra`, finding_ids: ids });
      expect(mixed.data.errorCode).toBe("report-page-mismatch");
      const bad = await call("save_report", { url: "not a url", finding_ids: [] });
      expect(bad.data.errorCode).toBe("invalid-url");
    } finally {
      await client.close();
    }
  });

  it("a resposta é resumo + caminhos, no teto, mesmo com milhares de itens", async () => {
    const { client, call } = await connect();
    try {
      const many = Array.from({ length: 3000 }, (_, i) => tokenClaim(`${base}/ok`, `#x${i}`, { pathway: "heuristic", id: `H-${i}` }));
      const r = await call("save_report", { url: `${base}/ok`, findings: many });
      expect(r.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      expect(r.data.rejectedTotal).toBe(3000);
      expect(r.data.rejectedNotShown).toBe(2980);
    } finally {
      await client.close();
    }
  });
});

describe("N-02 / N-03 / N-04 / N-05 / N-09: cursores e orçamento", () => {
  it("N-02: com memberLimit alto ou maxChars baixo a 1ª família vem (cortada), e andar páginas + membros devolve cada achado uma vez", async () => {
    const { client, call } = await connect();
    try {
      for (const opts of [{ memberLimit: 500 }, { maxChars: 1_000 }]) {
        let scan = await call("scan_page", { url: `${base}/huge`, checks: ["tokens"], ...opts });
        // Um piso indivisível recusa dentro do teto; o lote continua recuperável sem novo scan.
        if (scan.isError) {
          expect(opts.maxChars).toBe(1000);
          expect(scan.text.length).toBeLessThanOrEqual(1000);
          expect(scan.data).toMatchObject({ errorCode: "item-too-large", field: "maxChars", scanId: expect.any(String) });
          const next = scan.data.next.find((n: { tool: string }) => n.tool === "get_finding_details");
          scan = await call(next.tool, next.arguments);
          expect(scan.isError).toBeFalsy();
        }
        const scanId = scan.data.scanId;
        const total = scan.data.totalFindings ?? scan.data.summary.total;
        // Um único cursor coerente: o de partial é o do topo, e o que não veio não conta como devolvido.
        if (scan.data.partial) expect(scan.data.partial.nextCursor).toBe(scan.data.nextCursor);
        if (opts.memberLimit) expect(scan.data.families.length).toBeGreaterThan(0); // a 1ª família vem, cortada nos ids
        if (scan.data.families.length === 0) {
          expect(scan.data.partial).toMatchObject({ nextCursor: 0, familiesNotReturned: scan.data.totalFamilies, membersNotReturned: total });
        }
        const seen: string[] = [];
        const walkFamily = async (family: { familyId: string; memberIds: string[]; nextMemberCursor?: number }) => {
          seen.push(...family.memberIds);
          let cursor = family.nextMemberCursor;
          while (cursor !== undefined) {
            const page = await call("get_finding_details", { scanId, familyId: family.familyId, cursor });
            seen.push(...page.data.members.map((m: { id: string }) => m.id));
            cursor = page.data.nextCursor;
          }
        };
        for (const f of scan.data.families) await walkFamily(f);
        let cursor = scan.data.nextCursor;
        while (cursor !== undefined) {
          const page = await call("get_finding_details", { scanId, cursor, ...opts });
          for (const f of page.data.families) await walkFamily(f);
          cursor = page.data.nextCursor;
        }
        expect(new Set(seen).size, JSON.stringify(opts)).toBe(seen.length);
        expect(seen.length, JSON.stringify(opts)).toBe(total);
      }
    } finally {
      await client.close();
    }
  }, 120_000);

  it("N-03: eco de fill, observação gigante e inspect de um elemento gigante ficam no teto; maxChars baixo é respeitado", async () => {
    const { client, call } = await connect();
    try {
      const fill = await call("scan_page", { url: `${base}/ok`, maxChars: 8000, actions: [{ action: "fill", selector: "#campo", value: "v".repeat(2000) }] });
      expect(fill.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      const giant = await call("scan_page", { url: `${base}/giant`, maxChars: 8000 });
      expect(giant.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      const obs = await call("get_finding_details", { scanId: giant.data.scanId, view: "observations" });
      expect(obs.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      const inspect = await call("inspect_computed_styles", { url: `${base}/giant`, selectors: ["#g"] });
      expect(inspect.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      expect(inspect.data.pageContent).toMatch(/não confiáveis/);
      const small = await call("scan_page", { url: `${base}/huge`, maxChars: 3_000 });
      expect(small.text.length).toBeLessThanOrEqual(3_000);
    } finally {
      await client.close();
    }
  }, 60_000);

  it("N-04: o cursor do inspect pagina a mesma coleta (página embaralhada: cada botão uma vez)", async () => {
    const { client, call } = await connect();
    try {
      const ids: string[] = [];
      let cursor: number | undefined = 0;
      let snapshotId: string | undefined;
      for (let i = 0; cursor !== undefined && i < 60; i++) {
        const r = await call("inspect_computed_styles", { url: `${base}/shuffle`, selectors: ["button"], properties: ["color"], ...(cursor ? { cursor } : {}) });
        snapshotId ??= r.data.snapshotId;
        expect(r.data.snapshotId).toBe(snapshotId);
        ids.push(...r.data.elements.map((e: { attributes?: { id?: string }; locator: string }) => e.attributes?.id ?? e.locator));
        cursor = r.data.nextCursor;
      }
      expect(ids.length).toBe(120);
      expect(new Set(ids).size).toBe(120);
    } finally {
      await client.close();
    }
  }, 60_000);

  it("A5: com investigate cheio, a reserva fica íntegra e as famílias continuam pelo lote", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("scan_page", { url: `${base}/huge`, maxChars: 8000 });
      expect(r.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      if (r.isError) expect(r.data.errorCode).toBe("item-too-large");
      else expect(r.data.clauseReserve.clauses.length).toBeGreaterThan(0);
      const facts = await call("get_finding_details", { scanId: r.data.scanId });
      expect(facts.data.families.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });

  it("N-09: compareToScanId de outra página avisa urlChanged", async () => {
    const { client, call } = await connect();
    try {
      const first = await call("scan_page", { url: `${base}/outra`, checks: ["page"] });
      const second = await call("scan_page", { url: `${base}/ok`, checks: ["page"], compareToScanId: first.data.scanId });
      expect(second.data.stateDiff).toMatchObject({ urlChanged: true, previousUrl: `${base}/outra` });
    } finally {
      await client.close();
    }
  });
});
