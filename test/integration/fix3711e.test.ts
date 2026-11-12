/**
 * 3.7.11 — revisão independente de d6e2edb (RELEASE BLOCKER), genérico:
 *   HIGH 1: a leitura por id respeita o teto em TODAS as unidades (a nota de força e o antecedente entram antes do
 *      orçamento; o parágrafo literal longo é cortado com marca). O knowledge-free não tem get_ds_rules.
 *   MED 2: antecedente só quando a unidade anterior é adjacente no corpus (só espaço/marcação entre as duas); também na
 *      leitura de um id só.
 *   MED 3: "erro exibido" só com texto em role=alert / aria-live=assertive / alvo de aria-errormessage, ou feedback de erro
 *      do DS (danger/error/invalid); feedback success/info e região viva vazia não são erro.
 *   MED 4: o mapa pageLevel.uploads tem teto e cede antes dos ids das pendências, das famílias e do estado das cláusulas.
 *   LOW: nota do pendingUndecided no knowledge-free sem pendingResolved.
 *   Blocos do 1º scan das telas A, A2, B iguais aos do pai (d8fae86) — só quando o corpus está no ar (GOVBR_CORPUS_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as httpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { resetKnowledgeLock } from "../../src/data/lock.js";
import { getKnowledgeBase, getRuleById, isSpecification } from "../../src/data/knowledge.js";
import { antecedentOf } from "../../src/data/antecedent.js";
import { pageLevelBlock, pageLevelShort, uploadPathsPending, type PendingItem } from "../../src/scan/notJudged.js";
import { pageLevelUploadsOut } from "../../src/responses/scan.js";

const upload = (id: string, inner: string, describedby: string) =>
  `<div class="br-upload"><label class="upload-label" for="${id}"><span>Envio</span></label><input class="upload-input" id="${id}" type="file" accept=".pdf" aria-describedby="${describedby}">${inner}</div>`;
const MANY = Array.from({ length: 40 }, (_, i) =>
  `<div class="br-upload"><label class="upload-label" for="f${i}">Arquivo ${i}</label><input class="upload-input" id="f${i}" type="file" accept=".tipo${i}a,.tipo${i}b,application/x-tipo-${i}-muito-longo" aria-describedby="h${i}"><p id="h${i}">Texto de apoio número ${i}: envie um arquivo do tipo ${i}, sem senha e legível, conforme as regras do edital.</p></div>`).join("");
const PAGES: Record<string, string> = {
  "/apoio": upload("u1", '<p id="h1">Apenas PDF até 5 MB.</p>', "h1"),
  "/alerta": upload("u2", '<p id="e2" role="alert">Arquivo recusado: tipo inválido.</p>', "e2"),
  "/sucesso": upload("u3", '<span id="s3" class="feedback success">Arquivo enviado com sucesso.</span>', "s3"),
  "/erro-oculto": upload("u9", '<p id="h9">Até 3 MB.<span role="alert" hidden>Arquivo recusado.</span></p>', "h9"),
  "/viva-vazia": upload("u4", '<div id="h4">Formatos aceitos: PDF ou PNG. <span role="alert"></span></div>', "h4"),
  "/info": upload("u5", '<p id="h5">Até 2 MB.</p><span id="i5" class="feedback info">Dica: você pode arrastar.</span>', "h5 i5"),
  "/erro-ds": upload("u6", '<p id="h6" style="display:none">Apenas PDF.</p><span id="e6" class="feedback danger">O arquivo deve estar em PDF.</span>', "h6 e6"),
  "/muitos": MANY,
  "/tabela": "<table><tr><th>Nome</th></tr><tr><td>A</td></tr></table>",
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
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix3711e-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix3711e", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    const text = (r.content as Array<{ text: string }>)[0].text;
    return { data: JSON.parse(text), text, isError: r.isError === true };
  };
  return { client, call };
}
type Item = PendingItem & { pendingId: string };
const itemsOf = (d: { checksRun?: { pageLevel?: { notMeasured?: Array<Item | string> } } }) =>
  (d.checksRun?.pageLevel?.notMeasured ?? []).filter((i): i is Item => typeof i === "object");

describe("HIGH 1 — leitura por id dentro do teto em todas as unidades", () => {
  it("evaluation: toda unidade por id (e cada página do clauseCursor) ≤ 8.000; nota e antecedente dentro", async () => {
    const { client, call } = await connect();
    try {
      let max = 0;
      let notes = 0;
      let antecedents = 0;
      for (const rule of getKnowledgeBase().rules) {
        let args: Record<string, unknown> | null = { id: rule.id };
        for (let k = 0; k < 40 && args; k++) {
          const r = await call("get_ds_rules", args);
          expect(r.isError, rule.id).toBe(false);
          expect(r.text.length, `${rule.id} ${JSON.stringify(args)}`).toBeLessThanOrEqual(8000);
          max = Math.max(max, r.text.length);
          if (r.data.forceNote) notes++;
          if (r.data.antecedent) antecedents++;
          const n = r.data.nextClauseCursor ?? r.data.normativeContext?.nextClauseCursor;
          args = n !== null && n !== undefined ? { id: rule.id, clauseCursor: n } : null;
        }
      }
      expect(notes).toBe(getKnowledgeBase().rules.filter((r) => isSpecification(r) && !r.legacy).length);
      expect(antecedents).toBe(getKnowledgeBase().rules.filter((r) => !r.legacy && antecedentOf(r, true)).length);
      expect(max).toBeLessThanOrEqual(8000);
    } finally { await client.close(); }
  }, 600_000);

  it("parágrafo literal cortado diz que foi cortado e o tamanho inteiro; knowledge-free não tem leitura por id", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("get_ds_rules", { id: "govbr-3.7.0-component-table-2e481647d604" });
      const ctx = r.data.normativeContext.sourceContext;
      expect(ctx).toMatchObject({ textComplete: false, textChars: expect.any(Number) });
      expect(ctx.text.endsWith("…")).toBe(true);
      expect(ctx.textChars).toBeGreaterThan(ctx.text.length);
    } finally { await client.close(); }
    const kf = await connect("knowledge-free");
    try {
      expect((await kf.client.listTools()).tools.map((t) => t.name)).not.toContain("get_ds_rules");
    } finally { await kf.client.close(); resetKnowledgeLock(); }
  }, 60_000);
});

describe("MED 2 — antecedente só com a unidade anterior adjacente no corpus", () => {
  it("texto no meio = sem antecedente; adjacente = com; a leitura de um id só também o leva", async () => {
    // "Nesse caso" = vídeo SEM áudio; a unidade anterior da base (legendas de vídeo COM áudio) não é adjacente
    expect(antecedentOf(getRuleById("govbr-3.7.0-accessibility-global-53f4aeeb8e48")!, true)).toBeUndefined();
    for (const id of ["govbr-3.7.0-component-card-086bc8c9c107", "govbr-3.7.0-component-card-c922818eee5b"]) expect(antecedentOf(getRuleById(id)!, true), id).toBeUndefined();
    const drag = antecedentOf(getRuleById("govbr-3.7.0-component-upload-a54eed419af5")!, true);
    expect(drag).toEqual({ id: "govbr-3.7.0-component-upload-f0d98f9e5880", text: "O componente upload deve disponibilizar o recurso de arrastar arquivos." });
    const kept = getKnowledgeBase().rules.filter((r) => antecedentOf(r, true));
    expect(kept.length).toBe(163) // 167 adjacentes menos os 4 tirados na revisão à mão (ANTECEDENT_REVIEWED_OUT);
    const { client, call } = await connect();
    try {
      const one = await call("get_ds_rules", { id: "govbr-3.7.0-component-upload-a54eed419af5" });
      expect(one.data.antecedent).toEqual(drag);
      expect((await call("get_ds_rules", { id: "govbr-3.7.0-accessibility-global-53f4aeeb8e48" })).data.antecedent).toBeUndefined();
    } finally { await client.close(); }
  }, 60_000);
});

describe("MED 3 — apoio × erro exibido no campo de arquivo", () => {
  const expected: Record<string, { evaluation: string; "knowledge-free": string }> = {
    "/apoio": { evaluation: 'accept=".pdf" × apoio "Apenas PDF até 5 MB."', "knowledge-free": 'accept=".pdf" × apoio "Apenas PDF até 5 MB."' },
    "/alerta": { evaluation: 'accept=".pdf" × nenhum texto de apoio associado; erro exibido "Arquivo recusado: tipo inválido."', "knowledge-free": 'accept=".pdf" × nenhum texto de apoio associado; erro exibido "Arquivo recusado: tipo inválido."' },
    "/erro-oculto": { evaluation: 'accept=".pdf" × apoio "Até 3 MB."', "knowledge-free": 'accept=".pdf" × apoio "Até 3 MB."' },
    "/sucesso": { evaluation: 'accept=".pdf" × apoio "Arquivo enviado com sucesso."', "knowledge-free": 'accept=".pdf" × apoio "Arquivo enviado com sucesso."' },
    "/viva-vazia": { evaluation: 'accept=".pdf" × apoio "Formatos aceitos: PDF ou PNG."', "knowledge-free": 'accept=".pdf" × apoio "Formatos aceitos: PDF ou PNG."' },
    "/info": { evaluation: 'accept=".pdf" × apoio "Até 2 MB. | Dica: você pode arrastar."', "knowledge-free": 'accept=".pdf" × apoio "Até 2 MB. | Dica: você pode arrastar."' },
    // feedback de erro do DS só é erro com a pista do DS; sem ela (knowledge-free) é texto descrito pelo campo
    "/erro-ds": { evaluation: 'accept=".pdf" × apoio oculto neste estado (meça onde o campo aparece); erro exibido "O arquivo deve estar em PDF."', "knowledge-free": 'accept=".pdf" × apoio "O arquivo deve estar em PDF."' },
  };
  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`${profile}: success/info e região viva vazia são apoio; alerta com texto e feedback danger são erro`, async () => {
      const { client, call } = await connect(profile);
      try {
        for (const [path, want] of Object.entries(expected)) {
          const r = await call("scan_page", { url: `${base}${path}`, maxChars: 100000 });
          const up = itemsOf(r.data).find((i) => i.code === "upload-paths")!;
          expect(up.observed, `${profile} ${path}`).toBe(want[profile]);
          expect(r.data.checksRun.pageLevel.uploads[up.pendingId]).toBe(want[profile]);
        }
      } finally { await client.close(); resetKnowledgeLock(); }
    }, 180_000);
  }
});

describe("MED 4 — mapa uploads com teto, cedendo antes de ids, famílias e cláusulas", () => {
  it("unidade: 40 restrições distintas → até 3 + N, entrada ≤ 240; o mapa ≤ 480; o degrau tira só o mapa", () => {
    const inputs = Array.from({ length: 40 }, (_, i) => ({ locator: `#f${i}`, accept: `.tipo${i}a,.tipo${i}b,application/x-tipo-${i}-muito-longo`, support: `Texto de apoio ${i} `.repeat(8) }));
    const item = uploadPathsPending(inputs)!;
    expect(item.uploadFacts!.length).toBeLessThanOrEqual(240);
    expect(item.uploadFacts).toMatch(/; \+37 × apoio/);
    const many = Array.from({ length: 6 }, (_, i) => ({ ...item, pendingId: `P-0${i + 1}` }));
    const block = pageLevelBlock(["structure"], many);
    expect(JSON.stringify(block.uploads).length).toBeLessThanOrEqual(480 + 20);
    expect(Object.keys(block.uploads!)[0]).toBe("P-01");
    const r = { checksRun: { pageLevel: { ids: ["P-01:upload-paths@#f0"], uploads: block.uploads, next: { tool: "x" } } } };
    expect(pageLevelUploadsOut(r)).toEqual({ checksRun: { pageLevel: { ids: ["P-01:upload-paths@#f0"], next: { tool: "x" } } } });
    expect(pageLevelShort(block as never).uploads).toEqual(block.uploads);
  });

  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`${profile}: 40 campos — o mapa tem teto; em 2–4 mil os ids das pendências ficam (o mapa sai antes)`, async () => {
      const { client, call } = await connect(profile);
      try {
        const full = await call("scan_page", { url: `${base}/muitos`, maxChars: 100000 });
        expect(JSON.stringify(full.data.checksRun.pageLevel.uploads).length).toBeLessThanOrEqual(500);
        for (const maxChars of [8000, 4000, 3000, 2000]) {
          const r = await call("scan_page", { url: `${base}/muitos`, maxChars });
          expect(r.text.length, String(maxChars)).toBeLessThanOrEqual(maxChars);
          if (r.isError) continue;
          const pl = r.data.checksRun.pageLevel;
          const ids = JSON.stringify(pl.ids ?? pl.notMeasured ?? []);
          expect(ids, `${profile} ${maxChars}`).toMatch(/upload-paths/);
        }
      } finally { await client.close(); resetKnowledgeLock(); }
    }, 240_000);
  }
});

describe("LOW — nota do verify que não decidiu no knowledge-free", () => {
  it("knowledge-free não cita pendingResolved violada (o perfil não tem pendingResolved); evaluation segue citando", async () => {
    for (const profile of ["knowledge-free", "evaluation"] as const) {
      const { client, call } = await connect(profile);
      try {
        const s = await call("scan_page", { url: `${base}/apoio`, maxChars: 100000 });
        const up = itemsOf(s.data).find((i) => i.code === "upload-paths")!;
        const v = await call("verify_finding", { live: true, scanId: s.data.scanId, finding: {
          id: "F-x", rule: { id: "wcag-3.3.1", source: "wcag", description: "erro de entrada" }, element: { locator: "#u1", page: `${base}/apoio` },
          evidence: { observed: "campo de arquivo", expected: "erro identificado" }, severity: "serious", nature: "semantic", mode: "interaction", pathway: "heuristic",
        } });
        // 3.7.12: wcag 3.3.1 sem expectedCondition é recusa do payload (evidence-incomplete) — não fecha em nenhum perfil; a
        // pendência do upload volta em pendingUndecided e continua aberta
        expect(v.data.reasons.map((r: { code: string }) => r.code), profile).toContain("evidence-incomplete");
        expect(v.data.pendingResolved, profile).toBeUndefined();
        expect(v.data.pendingUndecided.map((u: { id: string }) => u.id), profile).toContain(up.pendingId);
        expect(v.data.pendingUndecidedNote, profile).toMatch(/^Nada foi decidido/);
        if (profile === "knowledge-free") {
          expect(v.data.pendingUndecidedNote).not.toMatch(/pendingResolved violada/);
          expect(v.text).not.toMatch(/govbr-3\.7\.0-/);
        } else expect(v.data.pendingUndecidedNote).toMatch(/pendingResolved violada/);
      } finally { await client.close(); resetKnowledgeLock(); }
    }
  }, 120_000);
});

// Blocos do 1º scan das telas de desenvolvimento, comparados aos do pai (d8fae86). Só com o corpus no ar.
const CORPUS = process.env.GOVBR_CORPUS_URL;
const PARENT = JSON.parse(readFileSync(join(__dirname, "../fixtures/first-scan-blocks-d8fae86.json"), "utf8")) as Record<string, { top: string[]; pageLevel: string[]; families: number; clauses: boolean }>;
describe.skipIf(!CORPUS)("MED 4 — 1º scan de A, A2, B: os blocos do pai continuam (GOVBR_CORPUS_URL)", () => {
  // a mesma ordem da medida do pai (A, B, A2 numa sessão): sessionPending depende dos scans anteriores
  const SCREENS: Record<string, string> = { A: "/solicitacao.html", B: "/pnip/portal-mpa/vistorias?mock-perfil=mpa", A2: "/acompanhamento.html" };
  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`${profile}: cada bloco do pai está no novo; famílias iguais; clauses quando o pai tinha`, async () => {
      const { client, call } = await connect(profile);
      try {
        for (const [screen, path] of Object.entries(SCREENS)) {
          const r = await call("scan_page", { url: `${CORPUS}${path}` });
          const parent = PARENT[`${profile}|${screen}`];
          expect(r.text.length).toBeLessThanOrEqual(8000);
          for (const k of parent.top) expect(Object.keys(r.data), `${profile} ${screen} ${k}`).toContain(k);
          for (const k of parent.pageLevel) expect(Object.keys(r.data.checksRun?.pageLevel ?? {}), `${profile} ${screen} pageLevel.${k}`).toContain(k);
          expect((r.data.families ?? []).length, `${profile} ${screen}`).toBe(parent.families);
          if (parent.clauses) expect(r.data.clauses, `${profile} ${screen} clauses`).toBeDefined();
        }
      } finally { await client.close(); resetKnowledgeLock(); }
    }, 300_000);
  }
});

// 3.7.11 (teste à mão do coordenador, B-22/A-05): verify sem decisão numa pendência de fato já medido com cláusula que obriga.
describe("teste à mão — fato medido pelo scan + verify que não decide: a pendência não fecha e a resposta diz o que decidir", () => {
  const finding = (locator: string, rule: Record<string, unknown>) => ({
    id: "H-1", rule, element: { locator, page: `${base}/tabela` },
    evidence: { observed: "tabela sem caption, aria-label, aria-labelledby ou title", expected: "caption" },
    severity: "serious", nature: "semantic", mode: "display", pathway: "heuristic",
  });
  it("evaluation: nem pendingResolved nem keep-uncertain/rule: null; judge-fact com o observed e o cite; segue aberta e fecha por pendingResolved", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/tabela`, maxChars: 100000 });
      const t = itemsOf(s.data).find((i) => i.code === "table-name")!;
      const cite = t.rule!.id;
      const v = await call("verify_finding", { scanId: s.data.scanId, finding: finding(t.examples![0], { id: cite, source: "govbr-ds-kb", description: "caption" }) });
      expect(v.data.verdict).toBe("unverifiable");
      expect(v.data.pendingResolved ?? []).not.toContain(t.pendingId);
      expect(v.data.pendingUndecided).toEqual([{ id: t.pendingId, code: "table-name", cite, norms: expect.arrayContaining(["wcag-1.3.1"]), observed: t.observed }]);
      expect(v.data.pendingUndecidedNote).toMatch(/continuam abertas/);
      expect(v.data.pendingUndecidedNote).not.toMatch(/fecharam/);
      expect(v.data.actions).toHaveLength(1);
      expect(v.data.actions[0]).toMatchObject({ action: "judge-fact", tool: null });
      expect(v.data.actions[0].what).toContain(t.observed!);
      expect(v.data.actions[0].what).toContain(cite);
      expect(v.data.actions[0].what).not.toMatch(/rule: null|é (uma )?viola|confirm/);
      expect(v.data.observation.message).toMatch(/^Este verify não mediu o fato/);
      expect(v.data.observation.message).toContain(t.observed!);
      expect(v.text.length).toBeLessThanOrEqual(8000);
      // segue aberta no scan seguinte; pendingResolved violada fecha e devolve a mesma cláusula
      const again = await call("scan_page", { url: `${base}/tabela`, maxChars: 100000 });
      expect(itemsOf(again.data).find((i) => i.code === "table-name")?.pendingId).toBe(t.pendingId);
      const d = await call("scan_page", { url: `${base}/tabela`, maxChars: 100000, pendingResolved: [{ id: t.pendingId, status: "violada" }] });
      expect(d.data.pendingResolution.recordAsFinding[0]).toMatchObject({ id: t.pendingId, cite });
    } finally { await client.close(); resetKnowledgeLock(); }
  }, 120_000);

  it("controles: sem pendência medida o keep-uncertain continua; knowledge-free não tem pendência de fato medido (só axe) e não muda", async () => {
    const { client, call } = await connect();
    try {
      // a mesma cláusula sem predicado, numa página sem pendência de fato medido: o keep-uncertain de sempre
      const s = await call("scan_page", { url: `${base}/apoio`, maxChars: 100000 });
      const v = await call("verify_finding", { scanId: s.data.scanId, finding: { ...finding("#u1", { id: "govbr-3.7.0-accessibility-global-29bd6bf04fc5", source: "govbr-ds-kb", description: "caption" }), element: { locator: "#u1", page: `${base}/apoio` } } });
      expect(v.data.verdict).toBe("unverifiable");
      expect(v.data.actions.map((a: { action: string }) => a.action)).toContain("keep-uncertain");
      expect(v.data.pendingUndecided).toBeUndefined();
    } finally { await client.close(); resetKnowledgeLock(); }
    const kf = await connect("knowledge-free");
    try {
      const s = await kf.call("scan_page", { url: `${base}/tabela`, maxChars: 100000 });
      expect(itemsOf(s.data).some((i) => i.code === "table-name")).toBe(false);
      const v = await kf.call("verify_finding", { scanId: s.data.scanId, finding: finding("table", { id: "wcag-1.3.1", source: "wcag", description: "tabela" }) });
      expect(v.data.pendingUndecided).toBeUndefined();
      expect(v.text).not.toMatch(/govbr-3\.7\.0-/);
    } finally { await kf.client.close(); resetKnowledgeLock(); }
  }, 120_000);
});

describe("teste à mão — forceNote também no lote por ids, uma vez por resposta", () => {
  it("lote com unidade de especificação leva forceNote no topo (não por item), ≤ 8.000; lote só normativo não", async () => {
    const specs = getKnowledgeBase().rules.filter((r) => isSpecification(r) && !r.legacy).slice(0, 8).map((r) => r.id);
    const { client, call } = await connect();
    try {
      for (const detail of [undefined, "index", "full"] as const) {
        const r = await call("get_ds_rules", { ids: specs, ...(detail ? { detail } : {}) });
        expect(r.isError).toBe(false);
        expect(typeof r.data.forceNote, String(detail)).toBe("string");
        expect((r.text.match(/"forceNote"/g) ?? []).length).toBe(1);
        expect(r.text.length).toBeLessThanOrEqual(8000);
        const one = await call("get_ds_rules", { id: specs[0] });
        expect(r.data.forceNote).toBe(one.data.forceNote);
      }
      const plain = await call("get_ds_rules", { ids: ["govbr-3.7.0-accessibility-global-29bd6bf04fc5"] });
      expect(plain.data.forceNote).toBeUndefined();
    } finally { await client.close(); resetKnowledgeLock(); }
  }, 60_000);
});
