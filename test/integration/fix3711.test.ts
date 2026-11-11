/**
 * 3.7.11 (leituras dev-3710 A2/A), genérico — nenhuma tela:
 *   R1: o estado aberto com o conteúdo ainda em transição (aria-expanded="true", alvo sem caixa no instante da leitura)
 *       fecha a pendência — pela leitura do controle e pela receita da própria pendência (clique + chegada alcançada); a
 *       sequência exata do rastro: checks sem page, depois só page;
 *   R2: upload sem erro do campo no estado → a recusa pode vir no envio: submitRecipe com o controle de envio do formulário;
 *   R3: as linhas inform levam o referente literal da base (seção; a frase anterior quando a cláusula abre com anafórico);
 *   R4: a receita de arrasto vai no elemento que tem o ouvinte de drop e roda; sem ouvinte, "zona desconhecida";
 *   R5: o aviso de força 'especificacao' não manda trocar nem largar a norma e não fala em violação;
 *   R6: knowledge-free diz como encerrar a pendência (limitations), em todas as formas.
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
import { KF_END_NOTE, pageLevelShort, uploadInformClauses, type PendingItem } from "../../src/scan/notJudged.js";
import type { Finding } from "../../src/schema/finding.js";
import { filterRules } from "../../src/data/knowledge.js";

// R1: o conteúdo controlado só aparece 4 s depois do clique (o scan lê antes); aria-expanded vira true na hora.
const SLOW = `<header><button type="button" id="conta" aria-expanded="false" aria-controls="menu-conta">Conta</button><div id="menu-conta" hidden><a href="/sair">Sair</a></div></header>
<main><h1>Lento</h1></main>
<script>document.getElementById("conta").addEventListener("click",function(){this.setAttribute("aria-expanded","true");setTimeout(function(){document.getElementById("menu-conta").hidden=false;},4000);});</script>`;
// R2/R4: campo de arquivo num formulário com envio; o ouvinte de drop está num botão irmão (não no input oculto).
const UPLOAD = (withDrop: boolean, withError: boolean) => `<main><h1>Envio</h1><form id="f" onsubmit="event.preventDefault();document.getElementById('erro').hidden=false;">
<div class="campo"><input type="file" id="arquivo" style="display:none" aria-describedby="apoio"><button type="button" class="zona">Selecionar arquivo</button></div>
<p id="apoio">Apoio do campo.</p><p id="erro" role="alert" ${withError ? "" : "hidden"}>Formato não aceito.</p>
<button type="submit" id="enviar">Enviar</button></form></main>
${withDrop ? `<script>var z=document.querySelector(".zona");z.addEventListener("dragover",function(e){e.preventDefault();});z.addEventListener("drop",function(e){e.preventDefault();});</script>` : ""}`;

let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => {
    const body = req.url === "/lento" ? SLOW : req.url === "/upload" ? UPLOAD(true, false) : req.url === "/upload-sem-drop" ? UPLOAD(false, false) : req.url === "/upload-com-erro" ? UPLOAD(true, true) : "";
    res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html lang="pt-BR"><head><title>T</title></head><body>${body}</body></html>`);
  });
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
type Item = PendingItem & { recipe?: { tool: string; arguments: Record<string, unknown> }; dropRecipe?: { tool: string; arguments: Record<string, unknown> }; submitRecipe?: { tool: string; arguments: Record<string, unknown> } };
const itemOf = (d: { checksRun: { pageLevel: { notMeasured: Array<PendingItem | string> } } }, code: string) =>
  d.checksRun.pageLevel.notMeasured.find((i) => typeof i !== "string" && i.code === code) as Item | undefined;

describe("3.7.11 R1 — estado aberto em transição fecha a pendência (sequência do rastro)", () => {
  it("checks sem page, depois só page: a soma fecha mesmo com o conteúdo ainda sem caixa", async () => {
    const { client, call } = await connect();
    try {
      const p = itemOf(await call("scan_page", { url: `${base}/lento`, maxChars: 60000 }), "state-unscanned")!;
      expect(p.recipe!.arguments.arrival).toEqual({ visible: "#menu-conta, #menu-conta *" });
      const args = { ...p.recipe!.arguments, arrival: { expanded: "#conta" } };
      const step1 = await call("scan_page", { ...args, checks: ["axe", "structure", "tokens"] });
      expect(step1.statesIncomplete).toEqual([{ id: p.pendingId, missing: ["page"] }]);
      const step2 = await call("scan_page", { ...args, checks: ["page"] });
      expect(step2.statesScanned).toContain(p.pendingId);
    } finally { await client.close(); }
  });
});

describe("3.7.11 R2/R4 — envio e alvo do arrasto do campo de arquivo", () => {
  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`drop no elemento com ouvinte (a receita roda); upload sem erro do campo → submitRecipe (${profile})`, async () => {
      const { client, call } = await connect(profile);
      try {
        const url = `${base}/upload`;
        const u = itemOf(await call("scan_page", { url, maxChars: 60000 }), "upload-paths")!;
        expect(u.dropRecipe!.arguments.actions).toEqual([{ action: "drop", selector: "#f > div > button", files: [{ name: "exemplo.pdf", mimeType: "application/pdf", size: 1024 }] }]);
        expect((await call("scan_page", { ...u.dropRecipe!.arguments })).status).toBe("scanned");
        expect(u.measure).toMatch(/depois do upload, envie \(clique em #enviar\)/);
        const up = await call("scan_page", { url, actions: [{ action: "upload", selector: "#arquivo", files: [{ name: "programa.exe", mimeType: "application/x-msdownload", size: 2048 }] }], maxChars: 60000 });
        const u2 = itemOf(up, "upload-paths")!;
        expect(u2.observed).toMatch(/^upload sem erro visível: a recusa pode vir no envio/);
        expect(u2.submitRecipe!.arguments).toEqual({ url, actions: [{ action: "upload", selector: "#arquivo", files: [{ name: "programa.exe", mimeType: "application/x-msdownload", size: 2048 }] }, { action: "click", selector: "#enviar" }], arrival: { errorVisible: true } });
        const sent = await call("scan_page", { ...u2.submitRecipe!.arguments });
        expect(sent.status).toBe("scanned");
      } finally { await client.close(); }
    });
  }

  it("sem ouvinte de drop: zona desconhecida e nenhuma receita; com erro do campo visível: sem submitRecipe", async () => {
    const { client, call } = await connect();
    try {
      const none = itemOf(await call("scan_page", { url: `${base}/upload-sem-drop`, maxChars: 60000 }), "upload-paths")!;
      expect(none.dropRecipe).toBeUndefined();
      expect(none.measure).toMatch(/zona de soltar desconhecida/);
      const withError = itemOf(await call("scan_page", { url: `${base}/upload-com-erro`, actions: [{ action: "upload", selector: "#arquivo", files: [{ name: "a.exe", mimeType: "application/x-msdownload", size: 10 }] }], maxChars: 60000 }), "upload-paths")!;
      expect(withError.submitRecipe).toBeUndefined();
      expect(withError.observed).not.toMatch(/recusa pode vir no envio/);
    } finally { await client.close(); }
  });
});

describe("3.7.11 R3 — inform com o referente literal da base", () => {
  it("cada cláusula leva a seção; a que abre com anafórico leva a frase anterior da mesma seção", () => {
    const inform = uploadInformClauses();
    expect(inform.length).toBeGreaterThan(0);
    for (const c of inform) expect(c.section).toBeTruthy();
    const anaphoric = inform.filter((c) => /^(est|ess|isso|isto|nest|ness|dest|dess)/i.test(c.text));
    for (const c of anaphoric) expect(c.before, c.id).toBeTruthy();
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
  it("endNote no bloco e nas formas compactas", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      const scan = await call("scan_page", { url: `${base}/upload`, maxChars: 60000 });
      expect(scan.checksRun.pageLevel.endNote).toBe(KF_END_NOTE);
      expect(pageLevelShort(scan.checksRun.pageLevel).endNote).toBe(KF_END_NOTE);
    } finally { await client.close(); }
  });
});
