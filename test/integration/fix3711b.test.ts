/**
 * 3.7.11 (leitura dev-3710-b-01, § 3(e) e § 7 itens 1 e 4), genérico — nenhuma tela:
 *   S1: o scan com `selectors` não lê os estados abertos e não fecha a pendência state-unscanned (regra de 3.7.9/3.7.10,
 *       mantida), mas não cala: `statesPartial` nomeia a pendência que continua aberta e `statesPartialNote` diz que o
 *       scan foi parcial e o que a fecha (o scan do estado sem selectors) — nos dois perfis, com o mesmo texto, e também no
 *       teto apertado (o aviso nunca vira id solto);
 *   F1: foco visível medido com as transições assentadas — o botão que já estava focado (o de confirmação que um diálogo
 *       foca ao abrir) com `transition` de box-shadow não vira "nenhuma propriedade visual muda", nem no check do scan nem
 *       no predicado do verify; o botão sem indicador continua acusado e confirmado.
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
import { STATES_PARTIAL_NOTE } from "../../src/scan/session.js";
import { scanPage, PageScanCache, type PageScanResult } from "../../src/scan/pageScan.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { FOCUS_INDICATOR_CONDITION } from "../../src/checkers/focusIndicator.js";
import type { PendingItem } from "../../src/scan/notJudged.js";
import type { Finding } from "../../src/schema/finding.js";

const TOGGLE = `<script>document.addEventListener("click",function(e){var b=e.target.closest("[aria-controls]");if(!b)return;
var t=document.getElementById(b.getAttribute("aria-controls"));t.hidden=!t.hidden;b.setAttribute("aria-expanded",String(!t.hidden));});</script>`;
const MENU = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Menu</title></head><body>
<header><button type="button" id="conta" aria-expanded="false" aria-controls="menu-conta">Conta</button><div id="menu-conta" hidden><a href="/sair">Sair</a></div></header>
<main><h1>Menu</h1><p>Conteúdo.</p></main>${TOGGLE}</body></html>`;
// F1: um diálogo aberto que foca o botão de confirmação ao abrir; o foco aparece por box-shadow com transição de 0,1 s.
// O botão "fechar" não tem indicador nenhum (o controle que continua acusado).
const DIALOG = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Diálogo</title><style>
.confirmar{border:0;outline:none;box-shadow:0 0 0 3px transparent;transition:box-shadow .1s}
.confirmar:focus{outline:none}.confirmar:focus-visible{box-shadow:0 0 0 3px rgba(112,102,224,.5)}
.fechar,.fechar:focus,.fechar:focus-visible{border:0;outline:none;box-shadow:none}
</style></head><body><main><h1>Diálogo</h1>
<div role="dialog" aria-modal="true" aria-label="Aviso"><p>Salvo.</p><button type="button" class="confirmar" id="ok">OK</button>
<button type="button" class="fechar" id="fechar">Fechar</button></div></main>
<script>document.getElementById("ok").focus();</script></body></html>`;

let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(req.url === "/dialogo" ? DIALOG : MENU));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix3711b-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix3711b", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    const text = (r.content as Array<{ text: string }>)[0].text;
    return { data: JSON.parse(text), text };
  };
  return { client, call };
}
type StateItem = PendingItem & { recipe: { arguments: Record<string, unknown> } };
const contaState = (d: { checksRun: { pageLevel: { notMeasured: Array<PendingItem | string> } } }) =>
  (d.checksRun.pageLevel.notMeasured.filter((i) => typeof i !== "string" && i.code === "state-unscanned") as StateItem[])
    .find((i) => (i.recipe.arguments.actions as Array<{ selector?: string }>).some((a) => a.selector === "#conta"))!;

describe("3.7.11 S1 — o scan com selectors não fecha o estado e diz por quê", () => {
  for (const profile of ["evaluation", "knowledge-free"] as const) {
    it(`receita + selectors: statesPartial com o aviso; a receita sem selectors fecha (${profile})`, async () => {
      const { client, call } = await connect(profile);
      try {
        const first = await call("scan_page", { url: base, maxChars: 60000 });
        const conta = contaState(first.data);
        expect(conta.pendingId).toBeTruthy();
        // controle: o scan sem selectors e sem a receita não traz o aviso
        expect(first.data.statesPartial).toBeUndefined();
        const scoped = await call("scan_page", { ...conta.recipe.arguments, selectors: ["#menu-conta"] });
        expect(scoped.data.status).toBe("scanned");
        expect(scoped.data.statesScanned).toBeUndefined();
        expect(scoped.data.statesPartial).toEqual([conta.pendingId]);
        expect(scoped.data.statesPartialNote).toBe(STATES_PARTIAL_NOTE);
        expect(scoped.text.length).toBeLessThanOrEqual(8_000);
        const full = await call("scan_page", { ...conta.recipe.arguments });
        expect(full.data.statesScanned).toContain(conta.pendingId);
        expect(full.data.statesPartial).toBeUndefined();
        // fechada a pendência, o scan com selectors não avisa mais nada
        const after = await call("scan_page", { ...conta.recipe.arguments, selectors: ["#menu-conta"] });
        expect(after.data.statesPartial).toBeUndefined();
      } finally { await client.close(); }
    });
  }

  it("selectors sem a receita (o estado inicial): o aviso nomeia as pendências de estado abertas desta rota", async () => {
    const { client, call } = await connect();
    try {
      const first = await call("scan_page", { url: base, maxChars: 60000 });
      const conta = contaState(first.data);
      const scoped = await call("scan_page", { url: base, selectors: ["main"] });
      expect(scoped.data.statesPartial).toEqual([conta.pendingId]);
      expect(scoped.data.statesPartialNote).toBe(STATES_PARTIAL_NOTE);
    } finally { await client.close(); }
  });

  // evaluation: 6.000 é o menor teto desta página que a reserva de cláusulas aceita, e já força a escada de compactação;
  // knowledge-free: o piso do contrato (1.000).
  for (const [profile, maxChars] of [["evaluation", 6_000], ["knowledge-free", 1_000]] as const) {
    it(`no teto apertado o aviso fica com o texto, nunca id solto (${profile}, ${maxChars})`, async () => {
      const { client, call } = await connect(profile);
      try {
        const first = await call("scan_page", { url: base, maxChars: 60000 });
        const conta = contaState(first.data);
        const scoped = await call("scan_page", { ...conta.recipe.arguments, selectors: ["#menu-conta"], maxChars });
        expect(scoped.data.kind).toBe("scan");
        expect(scoped.data.compacted ?? scoped.data.squeezed).toBeTruthy(); // a escada de compactação rodou
        expect(scoped.text.length).toBeLessThanOrEqual(maxChars);
        expect(scoped.data.statesPartial).toEqual([conta.pendingId]);
        expect(scoped.data.statesPartialNote).toBe(STATES_PARTIAL_NOTE);
      } finally { await client.close(); }
    });
  }

  it("o aviso é só procedimento: nenhum id ou termo da base no texto", () => {
    expect(STATES_PARTIAL_NOTE).not.toMatch(/govbr-|emag|wcag|br-[a-z]/i);
    expect(STATES_PARTIAL_NOTE).toContain("selectors");
    expect(STATES_PARTIAL_NOTE).toContain("continua aberta");
  });
});

const focusRule = { id: "emag-4.4", source: "emag" as const, description: "foco visível" };
const claim = (locator: string): Finding => ({
  id: "L-1",
  rule: focusRule,
  element: { page: `${base}/dialogo`, locator, snippet: "" },
  evidence: { observed: "alegado", expected: "esperado", data: { expectedCondition: FOCUS_INDICATOR_CONDITION } },
  severity: "serious",
  nature: "syntactic",
  mode: "interaction",
  pathway: "explicit",
});

describe("3.7.11 F1 — foco visível medido depois da transição", () => {
  it("scan: o botão já focado com transição de box-shadow não é acusado; o sem indicador é", async () => {
    const r = (await scanPage({ url: `${base}/dialogo`, viewport: { width: 1280, height: 900 }, checks: ["structure"] }, new PageScanCache(1))) as PageScanResult;
    expect(r.findings.filter((f) => f.rule.id === "emag-4.4").map((f) => f.element.locator)).toEqual(["#fechar"]);
  });

  it("verify: o predicado desmente o 'sem indicador' do botão com transição e confirma o do botão sem indicador", async () => {
    expect((await verifyFinding({ finding: claim("#ok"), live: true })).verdict).toBe("rejected");
    expect((await verifyFinding({ finding: claim("#fechar"), live: true })).verdict).toBe("confirmed");
  });
});
