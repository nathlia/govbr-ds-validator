/**
 * Famílias num navegador de verdade (2.11.0, NAT-84): um calendário com 40 dias idênticos e um
 * dia divergente, e uma tabela com botões só-ícone por linha — a forma das telas reais que
 * inundavam as respostas. Regressão: o JSON de scanPage (o que o CLI de linha de base imprime)
 * não muda com a projeção; os dois perfis com scan_page recebem o mesmo conteúdo.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, type ServerOptions } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { PageScanCache, scanPage } from "../../src/scan/pageScan.js";
import { buildFamilyPage } from "../../src/responses/families.js";
import { summarize } from "../../src/report/report.js";

const days = Array.from({ length: 40 }, (_, i) => `<button class="br-button dia" type="button">${i + 1}</button>`).join("");
const rows = Array.from(
  { length: 10 },
  (_, i) => `<tr><td>Vistoria ${i + 1}</td><td><button class="br-button circle" type="button"><svg width="16" height="16"><rect width="16" height="16"/></svg></button></td></tr>`
).join("");

const FIXTURE = `<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8"><title>Agenda</title>
<style>
  body { font-family: Rawline, sans-serif; }
  .br-button { border: 0; background: #1351b4; color: #fff; font-family: Rawline, sans-serif; font-size: 16.8px; padding: 0 24px; height: 40px; border-radius: 100em; }
  .dia { border-radius: 6px; }
  .dia.divergente { border-radius: 3px; }
  .circle { width: 40px; padding: 0; }
</style></head>
<body><main><h1>Agenda</h1>
<div class="calendario">${days}<button class="br-button dia divergente" type="button">41</button></div>
<table><thead><tr><th>Item</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table>
</main></body></html>`;

let httpServer: Server;
let url = "";

function textOf(result: { content?: unknown }): string {
  return (result.content as { text: string }[]).map((c) => c.text).join("\n");
}

async function connect(profile: ServerOptions["toolProfile"]) {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")), toolProfile: profile });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: `families-${profile}`, version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  return JSON.parse(textOf(await client.callTool({ name, arguments: args })));
}

const SCAN = { checks: ["tokens", "structure", "axe"], tokenChecks: ["radius"], components: ["button"] } as const;

beforeAll(async () => {
  httpServer = createHttpServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(FIXTURE);
  });
  await new Promise<void>((done) => httpServer.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}/agenda`;
});

afterAll(async () => {
  await closeBrowser();
  await new Promise((done) => httpServer.close(done));
});

describe("finding families on calendar and table fixtures", () => {
  it("the baseline scanPage JSON is unchanged by the family projection", async () => {
    const result = await scanPage({ url, ...SCAN, checks: [...SCAN.checks], tokenChecks: [...SCAN.tokenChecks], components: [...SCAN.components] }, new PageScanCache(1));
    if (result.status !== "scanned") throw new Error("estado não alcançado");
    // os campos que o CLI de linha de base imprime — nenhum novo, nenhum a menos. 3.5.0: `notJudged` (pendências
    // do scan, D-155) fica no resultado para o ledger do MCP, mas o CLI de linha de base não o imprime.
    const { notJudged: _pending, ...printed } = result;
    expect(Object.keys(printed).sort()).toEqual(
      ["cacheHit", "cacheMissReason", "coverage", "deduplication", "findings", "observations", "stateFingerprint", "state", "status", "url"].sort()
    );
    expect(Object.keys(result.findings[0]).sort()).toEqual(["element", "evidence", "id", "mode", "nature", "pathway", "rule", "severity"]);
    const before = JSON.stringify(result);
    const summary = summarize(result.findings);

    const families = buildFamilyPage(result.findings, { stateFingerprint: result.stateFingerprint, memberLimit: 500, limit: 200 });
    expect(JSON.stringify(result)).toBe(before);
    expect(summarize(result.findings)).toEqual(summary);
    const listed = families.families as { count: number; memberIds: string[]; rule: { id: string }; value: string }[];
    expect(listed.flatMap((f) => f.memberIds).sort()).toEqual(result.findings.map((f) => f.id).sort());

    const radius = listed.filter((f) => f.rule.id === "ds-token-radius");
    expect(radius.map((f) => [f.count, f.value])).toEqual([[40, "border-radius: 6px"], [1, "border-radius: 3px"]]);
    // 3.5.0 (revisão Fable P5): os 10 botões só com ícone que o axe reprova por button-name saem da estrutura
    // (mesmo elemento × mesma condição): fica uma família só, a do axe.
    const iconOnly = listed.filter((f) => f.rule.id === "emag-1.1");
    expect(iconOnly).toEqual([]);
    expect(listed.filter((f) => f.rule.id === "button-name").map((f) => f.count)).toEqual([10]);
  });

  it("both profiles with scan_page get identical family content, and the cursor walks every id", async () => {
    const evaluation = await connect("evaluation");
    const deterministic = await connect("deterministic");
    try {
      const responses = [];
      for (const client of [evaluation, deterministic]) {
        // 3.0.0: o orçamento padrão (8.000) vale para a resposta inteira e o cabeçalho difere por perfil
        // (investigate só com normas); aqui se compara o conteúdo das famílias, com orçamento folgado.
        const scan = await call(client, "scan_page", { url, ...SCAN, memberLimit: 5, maxChars: 100_000 });
        expect(scan.view).toBe("families"); // padrão
        expect(scan.truncated).toBe(true); // telemetria lê este campo
        expect(scan.summary.total).toBe(scan.totalFindings);
        expect(scan.deduplication.output).toBe(scan.totalFindings);
        const big = scan.families.find((f: { count: number }) => f.count === 40);
        expect(big.memberIds).toHaveLength(5);
        expect(big.nextMemberCursor).toBe(5);
        expect(big.nextMemberCall).toBe(`get_finding_details(scanId, familyId="${big.familyId}", cursor=5)`);
        expect(scan.familyHint).toContain("get_finding_details(scanId, familyId, cursor=nextMemberCursor)");
        expect(scan.partial).toMatchObject({ reasons: ["member-limit"] });

        const walked: string[] = [];
        let cursor: number | undefined = big.nextMemberCursor;
        walked.push(...big.memberIds);
        while (cursor !== undefined) {
          const page = await call(client, "get_finding_details", { scanId: scan.scanId, familyId: big.familyId, cursor, limit: 9 });
          walked.push(...page.members.map((m: { id: string }) => m.id));
          cursor = page.nextCursor;
        }
        expect(walked).toHaveLength(40);
        expect(new Set(walked).size).toBe(40);

        // a visão plana continua disponível, sem mudança, e ganha o índice de famílias
        const flat = await call(client, "get_finding_details", { scanId: scan.scanId, view: "findings", limit: 200 });
        expect(flat.total).toBe(scan.totalFindings);
        expect(flat.familyIndex).toMatchObject({ totalFamilies: scan.totalFamilies, largestFamily: 40 });
        expect(flat.responseCharsEstimate).toBeGreaterThan(
          flat.findings.reduce((sum: number, f: unknown) => sum + JSON.stringify(f).length, 0) + JSON.stringify(flat.familyIndex).length - 1
        );

        const familiesAgain = await call(client, "get_finding_details", { scanId: scan.scanId, memberLimit: 5 });
        expect(familiesAgain.families).toEqual(scan.families);
        responses.push(scan);
      }
      // Finding ids vêm de um contador do processo; o resto do conteúdo tem de ser idêntico.
      const normalize = (value: unknown) => {
        const { scanId: _scanId, normativeContext: _n, ...rest } = value as Record<string, unknown>;
        return JSON.stringify(rest).replace(/F-\d{3,}/g, "F-x");
      };
      expect(normalize(responses[0].families)).toBe(normalize(responses[1].families));
      expect(responses[0].totalFamilies).toBe(responses[1].totalFamilies);
    } finally {
      await evaluation.close();
      await deterministic.close();
    }
  });
});
