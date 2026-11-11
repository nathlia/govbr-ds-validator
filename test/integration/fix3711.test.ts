/**
 * 3.7.11 (leituras dev-3710 A2/A; revisão independente de 569cea5), genérico — nenhuma tela:
 *   R1 (revisão H1–H3): aberto = o conteúdo controlado aparece (a regra da 3.7.10). Um controle que vira expanded e não abre
 *       nada não fecha a pendência; aria-expanded="true" estático com conteúdo oculto continua pendente; a chegada de um
 *       diálogo com id é o próprio diálogo (outro diálogo não chega). Conteúdo que aparece depois de um instante: a leitura
 *       espera a página assentar e lê de novo — fecha (a sequência do rastro: checks sem page, depois só page);
 *   R2 (decisão da 3ª revisão): o oráculo não examina o envio — com arquivo a recusar aplicado, uma frase neutra manda o
 *       agente incluir o próprio envio e medir o campo; a relação arquivo × accept (sem presumir recusa);
 *   R3: inform com o referente literal (seção; frase anterior quando a cláusula tem demonstrativo em qualquer posição); o
 *       texto não é cortado antes do verbo;
 *   R4: o arrasto vai no elemento com ouvinte de drop no campo ou no contêiner dele; acima disso, zona desconhecida;
 *   R5: aviso de força 'especificacao' neutro;
 *   R6: knowledge-free diz como encerrar a pendência (endNote na forma inteira).
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
import { citationForceWarning } from "../../src/responses/verify.js";
import { acceptRelation, KF_END_NOTE, UPLOAD_SUBMIT_NOTE, uploadInformClauses, type PendingItem } from "../../src/scan/notJudged.js";
import type { Finding } from "../../src/schema/finding.js";
import { filterRules } from "../../src/data/knowledge.js";

const PAGE = (body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>T</title></head><body>${body}</body></html>`;
const FX: Record<string, string> = {
  // R1: o conteúdo aparece 700 ms depois do clique (a leitura espera a página assentar)
  "/lento": `<header><button type="button" id="conta" aria-expanded="false" aria-controls="menu-conta">Conta</button><div id="menu-conta" hidden><a href="/sair">Sair</a></div></header>
<main><h1>Lento</h1></main>
<script>document.getElementById("conta").addEventListener("click",function(){this.setAttribute("aria-expanded","true");setTimeout(function(){document.getElementById("menu-conta").hidden=false;},700);});</script>`,
  // H1: o clique muda aria-expanded e não abre nada
  "/noopen": `<main><h1>T</h1><button id="m" aria-expanded="false" aria-controls="painel">Mais</button><div id="painel" hidden><a href="/x">Item</a></div>
<script>document.getElementById('m').onclick=function(){this.setAttribute('aria-expanded',this.getAttribute('aria-expanded')==='true'?'false':'true');};</script></main>`,
  // H2: aria-expanded="true" estático com o conteúdo oculto
  "/static": `<main><h1>T</h1><button id="s" aria-expanded="true" aria-controls="p2">Filtros</button><div id="p2" hidden><a href="/y">A</a></div></main>`,
  // H3: o gatilho abre OUTRO diálogo
  "/wrongdlg": `<main><h1>T</h1><button id="d" aria-haspopup="dialog" aria-controls="dlgA">Ajuda</button>
<div id="dlgA" role="dialog" aria-label="Ajuda" hidden><p>Ajuda</p></div><div id="dlgB" role="dialog" aria-label="Outro" hidden><p>Outro</p></div>
<script>document.getElementById('d').onclick=function(){document.getElementById('dlgB').hidden=false;};</script></main>`,
  // R2/R4: um campo num formulário com UM envio; o ouvinte de drop num botão do contêiner do campo
  "/upload": `<main><h1>Envio</h1><form id="f" onsubmit="event.preventDefault();var e=document.getElementById('erro');e.hidden=false;document.getElementById('arquivo').setAttribute('aria-invalid','true');">
<div class="campo"><input type="file" id="arquivo" accept=".pdf" style="display:none" aria-describedby="apoio erro"><button type="button" class="zona">Selecionar arquivo</button></div>
<p id="apoio">Apoio do campo.</p><p id="erro" role="alert" hidden>Formato não aceito.</p>
<button type="submit" id="enviar">Enviar</button></form></main>
<script>var z=document.querySelector(".zona");z.addEventListener("dragover",function(e){e.preventDefault();});z.addEventListener("drop",function(e){e.preventDefault();});</script>`,
  // R2: dois botões sem type=submit explícito (nenhum envio determinável); R4: o ouvinte só no main (acima do contêiner)
  "/ambiguo": `<main><h1>Envio</h1><form id="g"><div class="campo"><input type="file" id="arq2" accept=".pdf"></div>
<button id="limpar">Limpar</button><button type="button" id="env">Enviar</button></form></main>
<script>document.querySelector("main").addEventListener("drop",function(e){e.preventDefault();});</script>`,
};

let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end(PAGE(FX[req.url ?? ""] ?? "")));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix3711-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix3711", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return JSON.parse((r.content as Array<{ text: string }>)[0].text);
  };
  return { client, call };
}
type Recipe = { tool: string; arguments: Record<string, unknown> };
type Item = PendingItem & { recipe?: Recipe; dropRecipe?: Recipe };
const itemOf = (d: { checksRun: { pageLevel: { notMeasured: Array<PendingItem | string> } } }, code: string) =>
  d.checksRun.pageLevel.notMeasured.find((i) => typeof i !== "string" && i.code === code) as Item | undefined;

describe("3.7.11 R1 — aberto = o conteúdo aparece (revisão H1–H3)", () => {
  it("conteúdo que aparece depois de um instante: a leitura espera assentar e fecha (checks sem page, depois só page)", async () => {
    const { client, call } = await connect();
    try {
      const p = itemOf(await call("scan_page", { url: `${base}/lento`, maxChars: 60000 }), "state-unscanned")!;
      // a chegada do rastro (expanded no próprio controle): o conteúdo ainda não tem caixa quando o scan lê
      const args = { ...p.recipe!.arguments, arrival: { expanded: "#conta" } };
      const step1 = await call("scan_page", { ...args, checks: ["axe", "structure", "tokens"] });
      expect(step1.status).toBe("scanned");
      expect(step1.statesIncomplete).toEqual([{ id: p.pendingId, missing: ["page"] }]);
      const step2 = await call("scan_page", { ...args, checks: ["page"] });
      expect(step2.statesScanned).toContain(p.pendingId);
    } finally { await client.close(); }
  });

  it("H1: o clique muda aria-expanded e não abre nada → a pendência não fecha", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/noopen`;
      const p = itemOf(await call("scan_page", { url, maxChars: 60000 }), "state-unscanned")!;
      const run = await call("scan_page", { url, actions: [{ action: "click", selector: "#m" }], arrival: { expanded: "#m" } });
      expect(run.statesScanned).toBeUndefined();
      expect(itemOf(await call("scan_page", { url, maxChars: 60000 }), "state-unscanned")!.resolved).toBeUndefined();
      expect(p.pendingId).toMatch(/^P-/);
    } finally { await client.close(); }
  });

  it("H2: aria-expanded=\"true\" estático com o conteúdo oculto continua pendente", async () => {
    const { client, call } = await connect();
    try {
      const p = itemOf(await call("scan_page", { url: `${base}/static`, maxChars: 60000 }), "state-unscanned")!;
      expect(p.observed).toMatch(/aria-controls→#p2 oculto/);
    } finally { await client.close(); }
  });

  it("H3: a chegada é o próprio diálogo (com id); outro diálogo não chega e nada fecha", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/wrongdlg`;
      const p = itemOf(await call("scan_page", { url, maxChars: 60000 }), "state-unscanned")!;
      expect(p.recipe!.arguments.arrival).toEqual({ visible: "#dlgA, #dlgA *" });
      const run = await call("scan_page", { ...p.recipe!.arguments });
      expect(run.status).toBe("state-not-reached");
      const open = await call("scan_page", { url, actions: [{ action: "click", selector: "#d" }] });
      expect(open.statesScanned).toBeUndefined();
    } finally { await client.close(); }
  });
});

describe("3.7.11 R2/R4 — arrasto do campo de arquivo; o envio fica com o agente (decisão da 3ª revisão)", () => {
  it("relação arquivo × accept, sem presumir recusa", () => {
    expect(acceptRelation(".pdf", { name: "a.exe", mimeType: "application/x-msdownload" })).toBe("fora do accept");
    expect(acceptRelation(".pdf,image/*", { name: "a.png", mimeType: "image/png" })).toBe("dentro do accept");
    expect(acceptRelation(null, { name: "a.exe", mimeType: "application/x-msdownload" })).toBe("campo sem accept");
  });

  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`drop no ouvinte do contêiner; arquivo a recusar: só a frase neutra do envio, sem receita nem fatos do envio (${profile})`, async () => {
      const { client, call } = await connect(profile);
      try {
        const url = `${base}/upload`;
        const u = itemOf(await call("scan_page", { url, maxChars: 60000 }), "upload-paths")!;
        expect(u.dropRecipe!.arguments.actions).toEqual([{ action: "drop", selector: "#f > div > button", files: [{ name: "exemplo.pdf", mimeType: "application/pdf", size: 1024 }] }]);
        expect((await call("scan_page", { ...u.dropRecipe!.arguments })).status).toBe("scanned");
        expect(u.measure).not.toContain(UPLOAD_SUBMIT_NOTE);
        const exe = [{ action: "upload", selector: "#arquivo", files: [{ name: "programa.exe", mimeType: "application/x-msdownload", size: 2048 }] }];
        const u2 = itemOf(await call("scan_page", { url, actions: exe, maxChars: 60000 }), "upload-paths")!;
        expect(u2.observed).toMatch(/^upload de programa\.exe \(fora do accept\); accept="\.pdf"/);
        expect(u2.measure).toContain(UPLOAD_SUBMIT_NOTE);
        expect(u2).not.toHaveProperty("submitRecipe");
        expect(u2).not.toHaveProperty("fieldNow");
        // a receita de arrasto constrói sobre a receita deste scan (o upload), sem empilhar drop
        expect(u2.dropRecipe!.arguments.actions.map((x) => (x as { action: string }).action)).toEqual(["upload", "drop"]);
        // arquivo dentro do accept: nenhuma frase de envio, nada de recusa
        const pdf = itemOf(await call("scan_page", { url, actions: [{ action: "upload", selector: "#arquivo", files: [{ name: "doc.pdf", mimeType: "application/pdf", size: 10 }] }], maxChars: 60000 }), "upload-paths")!;
        expect(pdf.observed).toMatch(/\(dentro do accept\)/);
        expect(`${pdf.observed} ${pdf.measure}`).not.toMatch(/recusa/);
      } finally { await client.close(); }
    });
  }

  it("ouvinte de drop só acima do contêiner: zona desconhecida, sem receita", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/ambiguo`;
      const u = itemOf(await call("scan_page", { url, actions: [{ action: "upload", selector: "#arq2", files: [{ name: "a.txt", mimeType: "text/plain", size: 10 }] }], maxChars: 60000 }), "upload-paths")!;
      expect(u.dropRecipe).toBeUndefined();
      expect(u.measure).toMatch(/zona de soltar desconhecida/);
      expect(u.measure).toContain(UPLOAD_SUBMIT_NOTE);
    } finally { await client.close(); }
  });
});

describe("3.7.11 R3 — inform com o referente literal da base", () => {
  it("toda cláusula leva a seção; com demonstrativo (em qualquer posição), a frase anterior; texto inteiro", () => {
    const inform = uploadInformClauses();
    expect(inform.length).toBeGreaterThan(0);
    for (const c of inform) {
      expect(c.section).toBeTruthy();
      if (/(^|[^\p{L}])(est[ae]s?|ess[ae]s?|isso|isto|tal|tais)(?![\p{L}])/iu.test(c.text)) expect(c.before, c.id).toBeTruthy();
      expect(c.text.endsWith("…")).toBe(false);
    }
  });
});

describe("3.7.11 R5 — aviso de força 'especificacao' neutro", () => {
  it("diz que é especificação e que o desvio medido é fato a relatar; não manda trocar nem largar a norma; não fala em violação", () => {
    const spec = filterRules({ force: "especificacao" })[0];
    const w = citationForceWarning({ rule: { source: "govbr-ds-kb", id: spec.id } } as unknown as Finding)!;
    expect(w).toMatchObject({ citedId: spec.id, force: "especificacao" });
    const text = `${w.warning} ${w.next}`;
    expect(text).toMatch(/não é uma obrigação/);
    expect(text).toMatch(/fato a relatar/);
    expect(text).not.toMatch(/troque|recomendação não atendida|violação|rule: null/);
  });
});

describe("3.7.11 R6 — knowledge-free diz como encerrar a pendência", () => {
  it("endNote na forma inteira do bloco", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      const scan = await call("scan_page", { url: `${base}/upload`, maxChars: 60000 });
      expect(scan.checksRun.pageLevel.endNote).toBe(KF_END_NOTE);
    } finally { await client.close(); }
  });
});
