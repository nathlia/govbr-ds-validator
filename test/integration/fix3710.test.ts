/**
 * 3.7.10 (teste à mão da 3.7.9, D5), genérico: os checks se somam entre scans do MESMO estado (rota + fingerprint) na
 * sessão — a pendência de estado fecha quando a união cobre os checks do scan que a abriu, `missing` diz só o que a união
 * ainda não tem, e completeOmitted nunca sugere de novo um check já rodado nesse estado (o laço page ↔ resto).
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
import type { PendingItem } from "../../src/scan/notJudged.js";

const BODY = `<header><button type="button" id="conta" aria-expanded="false" aria-controls="menu-conta">Conta</button><div id="menu-conta" hidden><a href="/sair">Sair</a></div></header>
<main><h1>Página</h1><p>Conteúdo</p></main>
<script>document.getElementById("conta").addEventListener("click",function(){var t=document.getElementById("menu-conta");t.hidden=!t.hidden;this.setAttribute("aria-expanded",String(!t.hidden));});</script>`;

let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html lang="pt-BR"><head><title>Página</title></head><body>${BODY}</body></html>`));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix3710-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix3710", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return JSON.parse((r.content as Array<{ text: string }>)[0].text);
  };
  return { client, call };
}
type StateItem = PendingItem & { recipe: { arguments: Record<string, unknown> } };
const pending = (d: { checksRun: { pageLevel: { notMeasured: Array<PendingItem | string> } } }) =>
  d.checksRun.pageLevel.notMeasured.find((i) => typeof i !== "string" && i.code === "state-unscanned") as StateItem;

describe("3.7.10 D5 — checks somados no mesmo estado fecham a pendência; completeOmitted sem laço", () => {
  for (const [first, rest] of [[["page"], ["tokens", "structure", "axe"]], [["tokens", "structure", "axe"], ["page"]]] as const) {
    it(`${first.join("+")} e depois o que completeOmitted pede: fecha (statesScanned)`, async () => {
      const { client, call } = await connect();
      try {
        const p = pending(await call("scan_page", { url: base, maxChars: 60000 }));
        const step1 = await call("scan_page", { ...p.recipe.arguments, checks: [...first] });
        expect(step1.statesIncomplete).toEqual([{ id: p.pendingId, missing: [...rest] }]);
        expect(step1.checksRun.completeOmitted.arguments.checks).toEqual([...rest]);
        const step2 = await call(step1.checksRun.completeOmitted.tool, step1.checksRun.completeOmitted.arguments);
        expect(step2.stateFingerprint).toBe(step1.stateFingerprint);
        expect(step2.statesIncomplete).toBeUndefined();
        expect(step2.statesScanned).toContain(p.pendingId);
        // o que a sessão já mediu neste estado não volta como sugestão
        expect(step2.checksRun.completeOmitted).toBeNull();
      } finally { await client.close(); }
    });
  }

  it("knowledge-free: um check só (axe); a receita fecha num passo e não há completeOmitted", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      const p = pending(await call("scan_page", { url: base, maxChars: 60000 }));
      const run = await call("scan_page", { ...p.recipe.arguments });
      expect(run.statesScanned).toContain(p.pendingId);
      expect(run.checksRun.completeOmitted).toBeNull();
    } finally { await client.close(); }
  });
});
