/**
 * 3.7.12 (auditoria da cadeia A/A2 na 3.7.11: U-12 elo 4, "Pendência do upload", "Novo, visto agora"), genérico:
 *   1. Um verify que não decide nada (unverifiable sem medida: sem predicado, evidência incompleta…) não fecha pendência
 *      nenhuma — nem a do campo de arquivo, que não é de "fato medido por inteiro". Ela continua aberta na sessão e volta
 *      em pendingUndecided. O pendingResolved do agente e o verify que decide seguem como antes.
 *   2. Conselho único: com cite na pendência, nada de keep-uncertain / "rule: null"; com observed lido pelo scan, nada de
 *      "nada foi medido" — judge-fact com o que o scan leu e a norma a citar.
 *   3. evidence-incomplete com o id de um achado do agente: o passo nomeia as condições aceitas (as do reasons), não um
 *      get_finding_details com um id que o oráculo não tem.
 *   Knowledge-free: nada da base nestas respostas.
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
import { NATIVE_BUTTON_CONDITION, EMAG_WEB_STANDARDS } from "../../src/checkers/buttonMarkup.js";
import type { PendingItem } from "../../src/scan/notJudged.js";

const upload = (id: string, inner: string, describedby: string) =>
  `<div class="br-upload"><label class="upload-label" for="${id}"><span>Envio</span></label><input class="upload-input" id="${id}" type="file" accept=".pdf" aria-describedby="${describedby}">${inner}</div>`;
const PAGES: Record<string, string> = {
  "/apoio": upload("u1", '<p id="h1">Apenas PDF até 5 MB.</p>', "h1"),
  "/alerta": upload("u2", '<p id="e2" role="alert">Arquivo recusado: tipo inválido.</p>', "e2"),
  "/botao": '<button type="button" id="sair" href="#"><p>Sair</p></button>',
  "/outra": "<p>Outra rota.</p>",
};
let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Página ${req.url}</title></head><body><main><h1>Página ${req.url}</h1><form>${PAGES[req.url ?? ""] ?? ""}</form></main></body></html>`,
  ));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix3712-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix3712", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    const text = (r.content as Array<{ text: string }>)[0].text;
    return { data: JSON.parse(text), text, isError: r.isError === true };
  };
  return { client, call };
}
type Item = PendingItem & { pendingId: string; resolved?: unknown };
const itemsOf = (d: { checksRun?: { pageLevel?: { notMeasured?: Array<Item | string> } } }) =>
  (d.checksRun?.pageLevel?.notMeasured ?? []).filter((i): i is Item => typeof i === "object");
const uploadOf = (d: Parameters<typeof itemsOf>[0]) => itemsOf(d).find((i) => i.code === "upload-paths")!;
type Step = { action: string; what: string; tool: string | null; arguments?: Record<string, unknown> };
const finding = (id: string, page: string, locator: string, rule: Record<string, unknown>, observed: string) => ({
  id, rule, element: { locator, page }, evidence: { observed, expected: "o que o campo deve informar" },
  severity: "moderate", nature: "semantic", mode: "display", pathway: "heuristic",
});
/** O conselho de uma resposta sem decisão: nenhum keep-uncertain nem "rule: null" ao lado de uma cite. */
function expectOneAdvice(v: { data: { actions: Step[]; observation: { message: string } }; text: string }) {
  expect(v.data.actions.map((a) => a.action)).not.toContain("keep-uncertain");
  for (const a of v.data.actions) expect(a.what).not.toMatch(/rule: null|Se não houver norma citável/);
  expect(v.data.observation.message).not.toMatch(/nada foi medido/);
  expect(v.text.length).toBeLessThanOrEqual(8000);
}

describe("3.7.12 (a) — verify sem predicado na pendência do upload (sem fato medido por inteiro)", () => {
  it("evaluation: não entra em pendingResolved, segue aberta no rescan e no sessionPending de outra rota; judge-fact com o que o scan leu", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/apoio`, maxChars: 100000 });
      const up = uploadOf(s.data);
      expect(up.observed).toContain("Apenas PDF até 5 MB.");
      const v = await call("verify_finding", { live: true, scanId: s.data.scanId, finding: finding("U1", `${base}/apoio`, "#u1",
        { id: "3.3.2", source: "wcag", description: "Labels or Instructions" }, "apoio não diz que se pode arrastar") });
      expect(v.isError).toBe(false);
      expect(v.data.verdict).toBe("unverifiable");
      expect(v.data.reasons[0].code).toBe("no-predicate");
      expect(v.data.pendingResolved).toBeUndefined();
      expect(v.data.pendingStillOpen).toBeUndefined();
      const u = v.data.pendingUndecided.find((x: { id: string }) => x.id === up.pendingId);
      expect(u).toMatchObject({ code: "upload-paths", cite: up.rule!.id });
      expect(u.observed).toContain("Apenas PDF até 5 MB.");
      expect(v.data.pendingUndecidedNote).toMatch(/continuam abertas/);
      expect(v.data.pendingUndecidedNote).not.toMatch(/fecharam/);
      expectOneAdvice(v);
      expect(v.data.actions[0]).toMatchObject({ action: "judge-fact", tool: null });
      expect(v.data.actions[0].what).toContain(up.rule!.id);
      expect(v.data.actions[0].what).toContain("Apenas PDF até 5 MB.");
      expect(v.data.actions[0].what).toMatch(/segue aberta/);
      // continua aberta: o mesmo id, sem `resolved`, no rescan; e no sessionPending do scan de outra rota
      const again = await call("scan_page", { url: `${base}/apoio`, maxChars: 100000 });
      expect(uploadOf(again.data)).toMatchObject({ pendingId: up.pendingId });
      expect(uploadOf(again.data).resolved).toBeUndefined();
      const other = await call("scan_page", { url: `${base}/outra`, maxChars: 100000 });
      expect(JSON.stringify(other.data.sessionPending ?? {})).toContain(up.pendingId);
    } finally { await client.close(); resetKnowledgeLock(); }
  }, 180_000);
});

describe("3.7.12 (b) — estado de erro exibido + verify com a cláusula citada e sem expectedCondition", () => {
  it("evidence-incomplete: a pendência segue aberta; o passo nomeia as condições aceitas, não o id do agente", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/alerta`, maxChars: 100000 });
      const up = uploadOf(s.data);
      expect(up.observed).toMatch(/erro exibido "Arquivo recusado: tipo inválido\."/);
      const cite = up.rule!.id;
      const v = await call("verify_finding", { live: true, scanId: s.data.scanId, finding: finding("E2", `${base}/alerta`, "#u2",
        { id: cite, source: "govbr-ds-kb", description: "erro identificado e descrito por texto" }, "erro exibido 'Arquivo recusado: tipo inválido.'") });
      expect(v.isError).toBe(false);
      expect(v.data.verdict).toBe("unverifiable");
      expect(v.data.reasons.map((r: { code: string }) => r.code)).toContain("evidence-incomplete");
      const conditions = [...String(v.data.reasons[0].detail).matchAll(/'(input-[a-z-]+)'/g)].map((m) => m[1]);
      expect(conditions.length).toBeGreaterThan(0);
      // fix 1: nada fecha
      expect(v.data.pendingResolved).toBeUndefined();
      expect(v.data.pendingUndecided.map((x: { id: string }) => x.id)).toContain(up.pendingId);
      expect(v.data.pendingUndecided[0].observed).toMatch(/erro exibido/);
      // fix 2: um conselho só, sem "nada foi medido"
      expectOneAdvice(v);
      expect(v.data.actions[0]).toMatchObject({ action: "judge-fact" });
      // fix 3: o passo de evidência nomeia as condições aceitas e não aponta o id do agente
      const fix = (v.data.actions as Step[]).find((a) => a.action === "fix-evidence-data")!;
      expect(fix).toBeDefined();
      expect(fix.tool).toBe("verify_finding");
      for (const c of conditions) expect(fix.what).toContain(c);
      expect((v.data.actions as Step[]).some((a) => a.tool === "get_finding_details")).toBe(false);
      expect(JSON.stringify(v.data.actions)).not.toContain('"E2"');
      // continua aberta no rescan do mesmo estado
      const again = await call("scan_page", { url: `${base}/alerta`, maxChars: 100000 });
      expect(uploadOf(again.data)).toMatchObject({ pendingId: up.pendingId });
      expect(uploadOf(again.data).resolved).toBeUndefined();
      // (c) a decisão do agente com motivo fecha
      const d = await call("scan_page", { url: `${base}/alerta`, maxChars: 100000, pendingResolved: [{ id: up.pendingId, status: "não se aplica", reason: "o erro descreve o tipo aceito" }] });
      expect(d.data.pendingResolution.resolved).toContain(up.pendingId);
      const after = await call("scan_page", { url: `${base}/alerta`, maxChars: 100000 });
      expect(uploadOf(after.data).resolved).toBe("não se aplica");
    } finally { await client.close(); resetKnowledgeLock(); }
  }, 180_000);
});

describe("3.7.12 (c) — o pendingResolved do agente segue fechando", () => {
  it("violada depois de um verify sem decisão: recordAsFinding com a cite e a pendência fechada", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/apoio`, maxChars: 100000 });
      const up = uploadOf(s.data);
      const v = await call("verify_finding", { live: true, scanId: s.data.scanId, finding: finding("U1", `${base}/apoio`, "#u1",
        { id: "3.3.2", source: "wcag", description: "Labels or Instructions" }, "apoio sem arrastar") });
      expect(v.data.pendingResolved).toBeUndefined();
      const d = await call("scan_page", { url: `${base}/apoio`, maxChars: 100000, pendingResolved: [{ id: up.pendingId, status: "violada" }] });
      expect(d.data.pendingResolution.recordAsFinding[0]).toMatchObject({ id: up.pendingId, cite: up.rule!.id });
      const after = await call("scan_page", { url: `${base}/apoio`, maxChars: 100000 });
      expect(uploadOf(after.data).resolved).toBe("violada");
    } finally { await client.close(); resetKnowledgeLock(); }
  }, 180_000);
});

describe("3.7.12 (d) — o verify que decide segue fechando", () => {
  it("button-html: sem condição não fecha (pendingUndecided); com a condição, confirmed fecha como antes", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/botao`, maxChars: 100000 });
      const item = itemsOf(s.data).find((i) => i.code === "button-html")!;
      expect(item).toBeDefined();
      const f = (data?: Record<string, unknown>) => ({
        id: "F-agent", rule: { id: EMAG_WEB_STANDARDS, source: "govbr-ds-kb", description: "e-MAG 1.1" }, element: { locator: "#sair", page: `${base}/botao` },
        evidence: { observed: "marcação", expected: "HTML admitido", ...(data ? { data } : {}) },
        severity: "moderate", nature: "syntactic", mode: "display", pathway: "heuristic",
      });
      const undecided = await call("verify_finding", { live: true, scanId: s.data.scanId, finding: f() });
      expect(undecided.data.verdict).toBe("unverifiable");
      expect(undecided.data.pendingResolved).toBeUndefined();
      expect(undecided.data.pendingUndecided.map((x: { id: string }) => x.id)).toContain(item.pendingId);
      const v = await call("verify_finding", { live: true, scanId: s.data.scanId, finding: f({ expectedCondition: NATIVE_BUTTON_CONDITION }) });
      expect(v.data.verdict).toBe("confirmed");
      expect(v.data.pendingResolved).toContain(item.pendingId);
      expect(v.data.pendingUndecided).toBeUndefined();
      const after = await call("scan_page", { url: `${base}/botao`, maxChars: 100000 });
      expect(itemsOf(after.data).find((i) => i.code === "button-html")?.resolved).toBeTruthy();
    } finally { await client.close(); resetKnowledgeLock(); }
  }, 180_000);
});

describe("3.7.12 (e) — knowledge-free", () => {
  it("o mesmo comportamento sem nada da base: não fecha, conselho único, nenhum id nem texto da base", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      for (const [path, locator] of [["/apoio", "#u1"], ["/alerta", "#u2"]] as const) {
        const s = await call("scan_page", { url: `${base}${path}`, maxChars: 100000 });
        const up = uploadOf(s.data);
        const v = await call("verify_finding", { live: true, scanId: s.data.scanId, finding: finding("K1", `${base}${path}`, locator,
          { id: "3.3.1", source: "wcag", description: "erro de entrada" }, "campo de arquivo") });
        expect(v.isError, path).toBe(false);
        expect(v.data.verdict, path).toBe("unverifiable");
        expect(v.data.pendingResolved, path).toBeUndefined();
        expect(v.data.pendingUndecided.map((x: { id: string }) => x.id), path).toContain(up.pendingId);
        expect(v.data.pendingUndecidedNote, path).toMatch(/continuam abertas/);
        expect(v.data.pendingUndecidedNote, path).not.toMatch(/pendingResolved/);
        expectOneAdvice(v);
        for (const a of v.data.actions as Step[]) expect(a.what, path).not.toMatch(/pendingResolved/);
        expect(v.text, path).not.toMatch(/govbr-3\.7\.0-|emag-\d/);
        expect(JSON.stringify(v.data.actions), path).not.toContain('"K1"');
        const again = await call("scan_page", { url: `${base}${path}`, maxChars: 100000 });
        expect(uploadOf(again.data).resolved, path).toBeUndefined();
      }
    } finally { await client.close(); resetKnowledgeLock(); }
  }, 180_000);
});
