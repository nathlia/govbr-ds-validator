/**
 * 3.7.11 (auditoria externa 2026-11-11, itens conferidos), genérico — nenhuma tela:
 *   V-1 (decisão da 3ª revisão: limitação conhecida): o localizador é o da 3.7.10 — dois elementos podem dividir um
 *        localizador (um achado por localizador); só o data-testid com aspas passa a sair escapado (era seletor inválido);
 *   V-7: completeOmitted depois de um scan com components inclui a estrutura (sem o filtro) junto dos outros checks;
 *   V-3: a O-NN fica entregue só quando a resposta traz a norma ou a condição dela (o id sozinho não); get_finding_details
 *        também entrega;
 *   V-10: o texto do link é normalizado antes do corte (texto de várias linhas ainda é comparado com o title).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as httpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { resetKnowledgeLock } from "../../src/data/lock.js";
import { checksRunFor } from "../../src/responses/scan.js";
import { ScanSession } from "../../src/scan/session.js";
import { observedRequiredItems } from "../../src/scan/notJudged.js";
import type { Observation } from "../../src/schema/finding.js";
import { CHECK_GROUNDING } from "../../src/checkers/grounding.js";

const PAGE = (body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>T</title><style>.off{color:#123456}</style></head><body>${body}</body></html>`;
const deep = (style = "") => `<div class="card"><div><div><div><div><div><button class="off"${style}>Botão</button></div></div></div></div></div></div>`;
const FX: Record<string, string> = {
  // V-1: dois cartões iguais; o botão 6 níveis abaixo, cada um com uma cor fora da paleta
  "/cartoes": `<main><h1>T</h1><div class="wrap">${deep()}${deep(' style="color:#654321"')}</div></main>`,
  // V-1: localizador já único fica como era
  "/raso": `<main id="m"><h1>T</h1><div><button class="off">Único</button></div></main>`,
  // V-1: data-testid repetido não identifica; com aspas, escapado
  "/testid": `<main><h1>T</h1><section><button class="off" data-testid="acao">A</button></section><section><button class="off" data-testid="acao" style="color:#654321">B</button></section><button class="off" data-testid='x"y' style="color:#abcdef">C</button></main>`,
  // V-10: texto do link com uma sequência longa de espaços (texto de várias linhas indentado)
  // V-3: uma O-NN (tamanho de fonte fora da escala)
  "/fonte": `<style>.t{font-size:13px}</style><h2 id="t1" class="t">Seção</h2><p>Texto</p>`,
  "/link": `<main><h1>T</h1><p><a href="#x" title="Solicitar atendimento presencial na unidade">Solicitar${" ".repeat(90)}atendimento presencial na unidade</a></p></main>`,
};

// 2ª revisão (rev3711b/fx): documentos inteiros, servidos como estão
const DOC = (body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>T</title></head><body><header><h1>Teste</h1></header><main>${body}</main></body></html>`;
const RAW: Record<string, string> = {
  // um clique insere, noutro lugar, um bloco de estrutura idêntica à do link (2ª revisão)
  "/loc-dyn": DOC(`<section><div><div><div><div><a href="/a" title="Ver detalhes">Ver detalhes</a></div></div></div></div></section>
<button id="abrir" aria-expanded="false" aria-controls="menu">Mais</button><div id="menu"></div>
<script>document.getElementById('abrir').onclick=function(){this.setAttribute('aria-expanded','true');document.getElementById('menu').innerHTML='<section><div><div><div><div><a href="/b">Outro</a></div></div></div></div></section>';};</script>`),
};

let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    res.writeHead(200, { "content-type": "text/html" }).end(RAW[path] ?? PAGE(FX[path] ?? ""));
  });
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect() {
  const server = createServer({ toolProfile: "evaluation", knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "audit3711-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "audit3711", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return { data: JSON.parse((r.content as Array<{ text: string }>)[0].text), isError: Boolean(r.isError) };
  };
  return { client, call };
}
type F = { id: string; rule: { checker?: string }; element: { locator: string }; evidence: { observed: string; data?: Record<string, unknown> } };
const findingsOf = (d: unknown): F[] => {
  const out: F[] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    const x = o as F;
    if (typeof x.id === "string" && /^F-\d+$/.test(x.id) && x.element?.locator) out.push(x);
    for (const v of Object.values(o)) walk(v);
  };
  walk(d);
  return out;
};
const colors = (fs: F[]) => fs.filter((f) => f.rule.checker === "ds-token-color");

describe("V-1 limitação conhecida (localizador da 3.7.10)", () => {
  it("dois elementos com o mesmo caminho de 5 passos dividem o localizador: um achado (como na 3.7.10)", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/cartoes`, view: "findings", detail: "evidence", maxChars: 50_000 });
      expect([...new Set(colors(findingsOf(s.data)).map((f) => f.element.locator))]).toEqual(["div > div > div > div > button"]);
    } finally { await client.close(); }
  }, 120_000);

  it("data-testid com aspas sai escapado e resolve; os demais localizadores como na 3.7.10", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/testid`, view: "findings", detail: "evidence", maxChars: 50_000 });
      const locs = [...new Set(colors(findingsOf(s.data)).map((f) => f.element.locator))];
      expect(locs).toEqual(expect.arrayContaining(['[data-testid="acao"]', '[data-testid="x\\"y"]']));
      const quoted = colors(findingsOf(s.data)).find((f) => f.element.locator === '[data-testid="x\\"y"]')!;
      const v = await call("verify_finding", { finding: quoted, live: true });
      expect(JSON.stringify(v.data)).not.toMatch(/invalid-locator|locator-ambiguous/);
    } finally { await client.close(); }
  }, 120_000);
});

describe("V-10 texto do link normalizado antes do corte", () => {
  it("title igual ao texto de várias linhas gera o achado", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/link`, view: "findings", detail: "evidence", maxChars: 50_000 });
      const lt = findingsOf(s.data).filter((f) => f.evidence.data?.expectedCondition === "link-title-not-repeating-text");
      expect(lt).toHaveLength(1);
      expect(lt[0].evidence.data?.linkText).toBe("Solicitar atendimento presencial na unidade");
    } finally { await client.close(); }
  }, 60_000);
});

describe("V-7 completeOmitted com a estrutura", () => {
  const coverage = {};
  it("components + outros checks omitidos: a sugestão inclui structure, sem o filtro", () => {
    const r = checksRunFor({ url: "http://h/p", checks: ["structure"], components: ["button"] } as never, coverage, undefined, false);
    expect(r.completeOmitted?.arguments).toMatchObject({ checks: ["tokens", "axe", "page", "structure"] });
    expect(r.completeOmitted?.arguments).not.toHaveProperty("components");
  });
  it("estrutura inteira já medida neste estado: fica de fora (regra da 3.7.10)", () => {
    const r = checksRunFor({ url: "http://h/p", checks: ["structure"], components: ["button"] } as never, coverage, undefined, false, undefined, false, { structure: "S-1" }, "S-2");
    expect(r.completeOmitted?.arguments).toMatchObject({ checks: ["tokens", "axe", "page"] });
  });
  it("só a estrutura falta: a sugestão é só structure (como antes)", () => {
    const r = checksRunFor({ url: "http://h/p", checks: ["structure", "tokens", "axe", "page"], components: ["button"] } as never, coverage, undefined, false);
    expect(r.completeOmitted?.arguments).toMatchObject({ checks: ["structure"] });
  });
});

describe("V-3 entrega da O-NN", () => {
  const obs = (locator: string) => ({ kind: "k-off", element: { locator, page: "http://h/p" }, note: "n", whyNotAFinding: "w", data: { property: "font-size", observed: "13px", relatedRule: { id: "govbr-r1", force: "required" } } }) as Observation;
  const fresh = () => {
    const s = new ScanSession();
    const [e] = s.registerPending("S-1", "http://h/p", observedRequiredItems([obs("#a")]), (i) => i.boundLocators ?? []);
    return { s, e };
  };
  it("o id sozinho (forma de ids) não entrega; a norma lida depois não fecha", () => {
    const { s, e } = fresh();
    expect(s.markObservedDeliveredIn({ pageLevel: { ids: [e.id], count: 1 }, other: "govbr-r1" })).toEqual([]);
    expect(s.noteReadById(["govbr-r1"])).toEqual([]);
    expect(e.status).toBe("open");
  });
  it("a linha com a norma entrega; a leitura por id depois fecha", () => {
    const { s, e } = fresh();
    expect(s.markObservedDeliveredIn({ pageLevel: { notMeasured: [`${e.id}:observed-required:1⇒govbr-r1 @#a · leia`] } })).toEqual([e.id]);
    expect(s.noteReadById(["govbr-r1"])).toEqual([e.id]);
  });
  it("o mapa conditions entrega; o item inteiro (pendingId + norms) entrega", () => {
    const a = fresh();
    expect(a.s.markObservedDeliveredIn({ pageLevel: { ids: [a.e.id], conditions: { [a.e.id]: "alguma-condicao" } } })).toEqual([a.e.id]);
    const b = fresh();
    expect(b.s.markObservedDeliveredIn({ items: [{ pendingId: b.e.id, code: "observed-required", norms: ["govbr-r1"] }] })).toEqual([b.e.id]);
  });

  it("MCP: get_finding_details (observations) entrega a O-NN; sem ela, a leitura por id não fecha", async () => {
    const rule = CHECK_GROUNDING["token-font-size"].relatedRule!.id;
    const openO = (d: { checksRun: { pageLevel: { notMeasured: Array<{ code: string; resolved?: unknown }> } } }) => d.checksRun.pageLevel.notMeasured.find((i) => i.code === "observed-required")!;
    for (const viaDetails of [false, true]) {
      const { client, call } = await connect();
      try {
        // a resposta de erro (teto pequeno demais) não entrega nada; o lote fica no ledger
        const tight = await call("scan_page", { url: `${base}/fonte`, maxChars: 1_500 });
        expect(tight.isError).toBe(true);
        if (viaDetails) {
          const det = await call("get_finding_details", { scanId: tight.data.scanId, view: "observations", maxChars: 100_000 });
          expect(det.isError).toBe(false);
          expect(JSON.stringify(det.data)).toContain("O-01");
          expect(JSON.stringify(det.data)).toContain(rule);
        }
        await call("get_ds_rules", { ids: [rule] });
        const s2 = await call("scan_page", { url: `${base}/fonte`, maxChars: 100_000 });
        if (viaDetails) expect(openO(s2.data)).toMatchObject({ resolved: "rule-read" });
        else expect(openO(s2.data).resolved).toBeUndefined();
      } finally { await client.close(); }
    }
  }, 120_000);
});

describe("2ª/3ª revisão: o que ficou", () => {
  it("o mesmo elemento entre estados: localizador e stateDiff como na 3.7.10", async () => {
    const { client, call } = await connect();
    try {
      const s0 = await call("scan_page", { url: `${base}/loc-dyn`, maxChars: 100_000 });
      const s1 = await call("scan_page", { url: `${base}/loc-dyn`, actions: [{ action: "click", selector: "#abrir" }], arrival: { visible: "#menu a" }, compareToScanId: s0.data.scanId, maxChars: 100_000 });
      const before = findingsOf(s0.data).map((f) => f.element.locator);
      const after = findingsOf(s1.data).map((f) => f.element.locator);
      expect(before).toContain("div > div > div > div > a");
      expect(after).toEqual(before);
      expect(s1.data.stateDiff.findings).toMatchObject({ added: 0, removed: 0 });
    } finally { await client.close(); }
  }, 120_000);

  it("MED 4: completeOmitted com tokenChecks parcial converge (sem laço color ↔ resto)", async () => {
    const { client, call } = await connect();
    try {
      let args: Record<string, unknown> = { url: `${base}/raso`, checks: ["tokens"], tokenChecks: ["color"], maxChars: 100_000 };
      const seen: string[] = [];
      for (let step = 0; step < 4; step += 1) {
        const r = await call("scan_page", args);
        const next = r.data.checksRun?.completeOmitted;
        if (!next) { seen.push("null"); break; }
        const key = JSON.stringify(next.arguments);
        expect(seen).not.toContain(key);
        seen.push(key);
        args = { ...next.arguments, maxChars: 100_000 };
      }
      expect(seen[seen.length - 1]).toBe("null");
      expect(seen.length).toBeLessThanOrEqual(2);
    } finally { await client.close(); }
  }, 120_000);
});
