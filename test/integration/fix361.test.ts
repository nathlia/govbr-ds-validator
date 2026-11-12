/**
 * 3.6.1 (D-155, trace dev-350-b-01) — a sessão lembra o que o oráculo já disse.
 *
 * Fixtures sintéticas e neutras (agenda de uma clínica): nenhum markup, texto, seletor ou id das telas A/B, do
 * fluxo ou dos controles. Cada fixture reproduz o MECANISMO do trace: pendência que sumia no scan seguinte, o
 * mesmo <title> em rotas distintas, elemento oculto que fica visível num scan só com axe, diff que dava como
 * "removido" o que só não foi medido, contraste que o axe não decidiu, e membros de duas rotas num cartão.
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
import { PageScanCache, scanPage, type PageScanResult } from "../../src/scan/pageScan.js";
import { RESPONSE_BUDGET } from "../../src/responses/contract.js";
import { resetKnowledgeLock } from "../../src/data/lock.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { TITLE_IMPLEMENTS, pageConstraints } from "../../src/checkers/pageStructure.js";
import { EXPECTED_CONDITIONS } from "../../src/schema/structuredClaims.js";
import { ScanSession, citedNorms, routeKeyOf, routeTemplateOf, sessionPendingBlock } from "../../src/scan/session.js";
import { refineDiff } from "../../src/responses/scan.js";
import { serverInstructions } from "../../src/prompts/instructions.js";

function page(title: string, body: string, script = ""): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head>
<body><a href="#conteudo">Ir para o conteúdo</a><header class="br-header"><span class="header-title">Clínica</span></header><main id="conteudo">${body}</main><footer class="br-footer">fim</footer><script>${script}</script></body></html>`;
}

const PAGES: Record<string, string> = {
  "/agenda/consultas": page("Clínica", `<h1>Consultas</h1><table id="horarios"><tr><th>Hora</th></tr><tr><td>9h</td></tr></table>`),
  "/agenda/consulta": page("Clínica", `<h1>Consulta</h1><p>Detalhe.</p>`),
  "/agenda/sobre": page("Sobre a clínica — Clínica", `<h1>Sobre a clínica</h1><p>Texto.</p>`),
  // Mesmo modelo de rota (só o id muda): o mesmo título não é sinal.
  "/agenda/item/101": page("Item — Clínica", `<h1>Retorno de Ana</h1>`),
  "/agenda/item/102": page("Item — Clínica", `<h1>Retorno de Bia</h1>`),
  // Rotas distintas com o mesmo assunto (aliases): também não.
  "/agenda/inicio": page("Painel", `<h1>Agenda do dia</h1>`),
  "/agenda/hoje": page("Painel", `<h1>Agenda do dia</h1>`),
  "/sem-titulo": page("", `<h1>Recepção</h1>`),
  // Menu oculto com um separador de cor fora da paleta; o botão o abre.
  "/menu": page(
    "Menu — Clínica",
    `<h1>Menu</h1><button type="button" id="abrir" aria-expanded="false" aria-controls="painel">Conta</button>
     <div id="painel" hidden><a href="#perfil">Perfil</a><hr id="divisor" style="border:0;border-top:1px solid #bbbbbb"><a href="#sair">Sair</a></div>`,
    `document.getElementById('abrir').addEventListener('click', function () { var p = document.getElementById('painel'); p.hidden = !p.hidden; this.setAttribute('aria-expanded', String(!p.hidden)); });`,
  ),
  // Texto sobre gradiente: o axe não decide o contraste (incomplete) e diz por quê.
  "/contraste": page("Contraste — Clínica", `<h1>Avisos</h1><p id="faixa" style="background-image:linear-gradient(#777,#888);color:#999">Aviso importante</p>`),
};

let http: Server;
let base = "";
beforeAll(async () => {
  http = createHttpServer((req, res) => {
    const body = PAGES[(req.url ?? "/").split("?")[0]];
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

async function scan(path: string, extra: Record<string, unknown> = {}): Promise<PageScanResult> {
  const out = await scanPage({ url: `${base}${path}`, ...extra }, new PageScanCache(4));
  if (out.status !== "scanned") throw new Error(`não varreu ${path}`);
  return out;
}

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const srv = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "govbr-361-")) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fix361", version: "1" });
  await srv.connect(b);
  await client.connect(a);
  // A5: estes casos verificam fatos/estado; teto explícito preserva a projeção completa.
const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: name === "scan_page" && args.maxChars === undefined ? { ...args, maxChars: 100_000 } : args });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    return { text, isError: Boolean(r.isError), data: JSON.parse(text) as Record<string, any> };
  };
  return { client, call };
}

/** Os itens de pageLevel como texto (inteiros ou essenciais), para procurar código/pendingId/cláusula. */
const pageLevelText = (data: Record<string, any>) => JSON.stringify(data.checksRun?.pageLevel ?? {});

describe("3.6.1 item 1 — pendências com cláusula, id de sessão e repetição até a resolução", () => {
  it("cada pendência traz pendingId e a cláusula obrigatória (força e texto); volta nos scans seguintes até verify_finding ou pendingResolved", async () => {
    const { client, call } = await connect();
    try {
      const first = await call("scan_page", { url: `${base}/agenda/consultas` });
      expect(first.text.length).toBeLessThanOrEqual(100_000);
      const pl = first.data.checksRun.pageLevel;
      const items: Array<Record<string, any>> = pl.notMeasured;
      const table = items.find((i) => (typeof i === "string" ? (i as string).includes("table-name") : i.code === "table-name"));
      expect(table).toBeDefined();
      const text = pageLevelText(first.data);
      expect(text).toMatch(/P-\d\d/);
      expect(text).toContain("govbr-3.7.0-accessibility-global-29bd6bf04fc5");
      expect(text).toMatch(/required/);
      expect(text).toMatch(/CAPTION/);
      expect(getRuleById("govbr-3.7.0-accessibility-global-29bd6bf04fc5")?.force).toBe("required");
      const tableId = /(P-\d\d):table-name/.exec(text)?.[1] ?? (table as { pendingId: string }).pendingId;
      expect(tableId).toMatch(/^P-\d\d$/);

      // Outra rota: a pendência da tabela (da rota anterior) volta em sessionPending, com a cláusula.
      const second = await call("scan_page", { url: `${base}/agenda/sobre` });
      expect(second.text.length).toBeLessThanOrEqual(100_000);
      expect(JSON.stringify(second.data.sessionPending)).toContain(tableId);
      expect(JSON.stringify(second.data.sessionPending)).toContain("table-name");

      // verify_finding com a norma da pendência, na rota e no elemento dela, resolve.
      const verify = await call("verify_finding", {
        finding: {
          id: "F-961",
          rule: { id: "govbr-3.7.0-accessibility-global-29bd6bf04fc5", source: "govbr-ds-kb", description: "tabela sem título" },
          element: { locator: "#horarios", page: `${base}/agenda/consultas` },
          evidence: { observed: "sem caption", expected: "caption" },
          severity: "moderate", nature: "semantic", mode: "display", pathway: "heuristic",
        },
      });
      // 3.7.11 (teste à mão, B-22/A-05): o fato desta pendência já foi medido pelo scan e a cláusula obriga — o verify sem
      // predicado não a fecha (pendingUndecided, com o fato e a cláusula); fecha a decisão do agente (pendingResolved).
      expect(verify.data.pendingResolved ?? []).not.toContain(tableId);
      expect(verify.data.pendingUndecided.map((u: { id: string }) => u.id)).toContain(tableId);
      const decidedScan = await call("scan_page", { url: `${base}/agenda/sobre`, checks: ["axe"], pendingResolved: [{ id: tableId, status: "violada" }] });
      expect(decidedScan.data.pendingResolution.resolved).toContain(tableId);
      const third = await call("scan_page", { url: `${base}/agenda/sobre`, checks: ["axe"] });
      expect(JSON.stringify(third.data.sessionPending ?? {})).not.toContain(tableId);

      // pendingResolved explícito ("não se aplica") fecha outra; id desconhecido é dito.
      const open = JSON.stringify(third.data.sessionPending ?? {}) + pageLevelText(third.data);
      const someId = /P-\d\d/.exec(open)?.[0] as string;
      const fourth = await call("scan_page", { url: `${base}/agenda/sobre`, checks: ["axe"], pendingResolved: [{ id: someId, status: "não se aplica", reason: "página de texto" }, { id: "P-99", status: "conforme" }] });
      expect(fourth.data.pendingResolution).toEqual({ resolved: [someId], unknown: ["P-99"] });
      expect(JSON.stringify(fourth.data.sessionPending ?? {})).not.toContain(`"${someId}"`);

      // revisão M3: "conforme" sem reason não fecha; "violada" fecha e manda registrar o achado com a cláusula.
      const sobre = JSON.stringify(fourth.data.checksRun.pageLevel) + JSON.stringify(fourth.data.sessionPending ?? {});
      const [a, b] = [...new Set(sobre.match(/P-\d\d/g) ?? [])].filter((id) => id !== someId && id !== tableId);
      const fifth = await call("scan_page", { url: `${base}/agenda/sobre`, checks: ["axe"], pendingResolved: [{ id: a, status: "conforme" }, { id: b, status: "violada" }] });
      expect(fifth.data.pendingResolution.needsReason).toEqual([a]);
      expect(fifth.data.pendingResolution.resolved).toEqual([b]);
      expect(fifth.data.pendingResolution.recordAsFinding[0]).toMatchObject({ id: b });
      expect(fifth.data.pendingResolution.recordAsFinding[0].cite).toBeTruthy();
      expect(fifth.data.pendingResolution.recordNote).toMatch(/registre/);
    } finally {
      await client.close();
    }
  });

  it("tools/list: pendingResolved só no scan_page dos perfis com norma; knowledge-free sem a entrada nova", async () => {
    const ev = await connect();
    const kf = await connect("knowledge-free");
    try {
      const evScan = (await ev.client.listTools()).tools.find((t) => t.name === "scan_page")!;
      expect(Object.keys((evScan.inputSchema as { properties: object }).properties)).toContain("pendingResolved");
      const kfScan = (await kf.client.listTools()).tools.find((t) => t.name === "scan_page")!;
      expect(Object.keys((kfScan.inputSchema as { properties: object }).properties)).not.toContain("pendingResolved");
    } finally {
      await ev.client.close();
      await kf.client.close();
    }
  });
});

describe("3.6.1 item 2 — título do documento (ds-page-title)", () => {
  it("é restrição de página publicada, cita a cláusula obrigatória do e-MAG 3.3 e WCAG 2.4.2", () => {
    const c = pageConstraints().find((x) => x.id === "ds-page-title")!;
    expect(c.citeAs).toBe(TITLE_IMPLEMENTS[0]);
    expect(getRuleById(TITLE_IMPLEMENTS[0])?.force).toBe("required");
    expect(c.claim.expectedCondition).toBe(EXPECTED_CONDITIONS.documentTitle);
  });

  it("vazio: achado do check de página quando o axe não roda; com o axe no mesmo scan fica só o document-title do axe", async () => {
    const pageOnly = await scan("/sem-titulo", { checks: ["page"] });
    const f = pageOnly.findings.find((x) => x.rule.checker === "ds-page-title")!;
    expect(f.rule).toMatchObject({ id: TITLE_IMPLEMENTS[0], source: "govbr-ds-kb", wcag: "2.4.2" });
    const all = await scan("/sem-titulo");
    expect(all.findings.some((x) => x.rule.checker === "ds-page-title")).toBe(false);
    expect(all.findings.some((x) => x.rule.id === "document-title")).toBe(true);
    const { verifyFinding } = await import("../../src/verify/gate.js");
    const v = await verifyFinding({ finding: f, live: true });
    expect(v.verdict).toBe("confirmed");
    expect(v.predicate).toBe("page-title");
  });

  it("o mesmo <title> em duas rotas da sessão vira achado no scan da 2ª rota; mesma rota em outro estado não; o verify não o desmente", async () => {
    const { client, call } = await connect();
    try {
      const a = await call("scan_page", { url: `${base}/agenda/consultas` });
      expect(JSON.stringify(a.data)).not.toContain("ds-page-title");
      const again = await call("scan_page", { url: `${base}/agenda/consultas`, checks: ["page"] });
      expect(again.data.summary.total ?? 0).toBe(0);
      const b = await call("scan_page", { url: `${base}/agenda/consulta`, view: "findings", detail: "full" });
      const dup = (b.data.findings as Array<Record<string, any>>).find((f) => f.rule.checker === "ds-page-title");
      expect(dup).toBeDefined();
      expect(dup!.rule.id).toBe(TITLE_IMPLEMENTS[0]);
      expect(dup!.evidence.observed).toMatch(/\/agenda\/consultas/);
      expect(dup!.evidence.data.sameTitleScans).toContain(a.data.scanId);
      // a pendência semântica continua, com a referência ao achado
      expect(pageLevelText(b.data)).toMatch(/document-title-adequacy/);
      const v = await call("verify_finding", { finding: dup, live: true, scanId: b.data.scanId });
      expect(v.data.verdict).toBe("unverifiable");
      expect(v.data.verification.checks.violation).toBe("undetermined");
      // título distinto: nada
      expect(dup!.pathway).toBe("heuristic");
      expect(dup!.severity).toBe("moderate");
      expect(dup!.evidence.expected).toMatch(/representar o conteúdo principal da página/);
      const c = await call("scan_page", { url: `${base}/agenda/sobre`, view: "findings", detail: "full" });
      expect((c.data.findings as Array<Record<string, any>>).some((f) => f.rule.checker === "ds-page-title")).toBe(false);
      // revisão M4: só um segmento de id muda, ou o assunto é o mesmo (alias): não dispara
      for (const pair of [["/agenda/item/101", "/agenda/item/102"], ["/agenda/inicio", "/agenda/hoje"]]) {
        await call("scan_page", { url: `${base}${pair[0]}`, checks: ["page"] });
        const second = await call("scan_page", { url: `${base}${pair[1]}`, checks: ["page"], view: "findings", detail: "full" });
        expect((second.data.findings as Array<Record<string, any>>).some((f) => f.rule.checker === "ds-page-title"), pair.join(" × ")).toBe(false);
      }
      // revisão M5: título não vazio numa rota só não é desmentido (adequação não é medida)
      const single = await call("verify_finding", {
        finding: {
          id: "F-963",
          rule: { id: TITLE_IMPLEMENTS[0], source: "govbr-ds-kb", checker: "ds-page-title", description: "título" },
          element: { locator: "html", page: `${base}/agenda/sobre` },
          evidence: { observed: "título genérico", expected: "descritivo", data: { region: "title", observedTitle: "Sobre a clínica — Clínica", expectedCondition: EXPECTED_CONDITIONS.documentTitle } },
          severity: "moderate", nature: "semantic", mode: "display", pathway: "heuristic",
        },
        live: true,
      });
      expect(single.data.verdict).toBe("unverifiable");
      expect(single.data.verification.checks.violation).toBe("undetermined");
    } finally {
      await client.close();
    }
  });
});

describe("3.6.1 itens 3 e 4 — elemento antes oculto e o diff sem falso 'removido'", () => {
  it("o separador oculto no 1º scan é medido quando o menu abre, mesmo com checks:['axe']; o diff não dá como removido o que não foi medido", async () => {
    const { client, call } = await connect();
    try {
      const closed = await call("scan_page", { url: `${base}/menu` });
      const obs = await call("get_finding_details", { scanId: closed.data.scanId, view: "observations" });
      const hidden = (obs.data.observations as Array<Record<string, any>>).find((o) => o.element.locator.includes("divisor") && o.data?.hiddenInState);
      expect(hidden).toBeDefined();
      const tokenFindings = closed.data.summary.total;
      const open = await call("scan_page", {
        url: `${base}/menu`,
        actions: [{ action: "click", selector: "#abrir" }],
        arrival: { expanded: "#abrir" },
        checks: ["axe"],
        compareToScanId: closed.data.scanId,
        view: "findings",
        detail: "full",
      });
      expect(open.text.length).toBeLessThanOrEqual(100_000);
      // O bloco pode ceder espaço às famílias; a medida permanece recuperável pelo lote.
      let f: Record<string, any>;
      if (open.data.revisited.items) {
        expect(open.data.revisited.items[0].locator).toContain("divisor");
        const ids = open.data.revisited.items[0].now;
        expect(Array.isArray(ids)).toBe(true);
        f = (open.data.findings as Array<Record<string, any>>).find((x) => x.id === ids[0])!;
      } else {
        expect(open.data.revisited.count).toBeGreaterThan(0);
        const details = await call("get_finding_details", { scanId: open.data.scanId, view: "findings", detail: "full", maxChars: 20000 });
        expect(details.isError).toBeFalsy();
        f = details.data.findings.find((x: Record<string, any>) => x.element.locator.includes("divisor"));
      }
      expect(f.rule.checker).toBe("ds-token-color");
      expect(open.data.checksRun.omittedNote).toMatch(/Omitido ≠ conforme/);
      // item 4: os achados de tokens/estrutura/página do 1º scan não "sumiram": não foram medidos de novo
      const diff = open.data.stateDiff.findings;
      expect(diff.removed).toBe(0);
      if (tokenFindings > 0) expect(diff.notRemeasured).toBeGreaterThanOrEqual(0);
      const page = await call("get_finding_details", { scanId: open.data.scanId, view: "diff" });
      for (const row of page.data.changes as Array<Record<string, any>>) expect(row.change).not.toBe("removed");
    } finally {
      await client.close();
    }
  });

  it("refineDiff: check que não rodou → notRemeasured; seletores diferentes → scope; o que foi medido e sumiu continua removed", () => {
    const f = (id: string, source: string, checker?: string) => ({ id, rule: { id: "x", source, ...(checker ? { checker } : {}) } }) as never;
    const previous = [f("F-1", "govbr-ds-kb", "ds-token-color"), f("F-2", "axe-core"), f("F-3", "govbr-ds-kb", "ds-page-footer")];
    const diff = { added: [], removed: ["F-1", "F-2", "F-3"], unchanged: 0, evidenceChanged: [] };
    const out = refineDiff(diff, previous, ["axe"], false);
    expect(out.removed).toEqual(["F-2"]);
    expect(out.notRemeasured.map((n) => [n.id, n.reason, n.check])).toEqual([["F-1", "check-not-run", "tokens"], ["F-3", "check-not-run", "page"]]);
    const scoped = refineDiff(diff, previous, ["axe", "tokens", "page"], true);
    expect(scoped.removed).toEqual([]);
    expect(scoped.notRemeasured.every((n) => n.reason === "scope")).toBe(true);
  });
});

describe("3.6.1 item 5 — contraste que o axe não decidiu vira pendência", () => {
  it("com as cores e o motivo medidos pelo axe; evaluation com a cláusula, knowledge-free só com WCAG 1.4.3 e nada da base", async () => {
    const r = await scan("/contraste");
    const item = r.notJudged?.find((i) => i.code === "contrast-incomplete");
    expect(item).toBeDefined();
    expect(item!.examples?.[0]).toContain("faixa");
    expect(item!.measured?.[0].reason).toBeTruthy();
    expect(item!.norms).toContain("wcag-1.4.3");
    expect(item!.rule?.force).toBe("required");
    const kf = await connect("knowledge-free");
    try {
      const s = await kf.call("scan_page", { url: `${base}/contraste` });
      const text = pageLevelText(s.data);
      expect(text).toContain("contrast-incomplete");
      expect(text).toContain("wcag-1.4.3");
      expect(s.text).not.toMatch(/govbr-3\.7\.0|emag-/);
      const pid = /P-\d\d/.exec(text)![0];
      const v = await kf.call("verify_finding", {
        finding: {
          id: "F-962",
          rule: { id: "1.4.3", source: "wcag", description: "contraste" },
          element: { locator: item!.examples![0], page: `${base}/contraste` },
          evidence: { observed: "baixo contraste", expected: "4,5:1" },
          severity: "serious", nature: "syntactic", mode: "display", pathway: "heuristic",
        },
      });
      expect(v.data.pendingResolved).toContain(pid);
    } finally {
      await kf.client.close();
    }
  });
});

describe("3.6.1 revisão M1/M2/H1 — sessionPending limitado, resolução por rota/elemento, texto uma vez", () => {
  it("uma entrada por código (rotas contadas, até 3 ids), sem sinal só contadas; texto só enquanto não entregue", () => {
    const s = new ScanSession();
    const item = (code: string, low = false) => ({ code, subject: code, todo: "t", measure: "m", norms: [`govbr-${code}`, code === "table-name" ? "emag-3.9" : "emag-3.1"], rule: { id: `govbr-${code}`, force: "required", text: "texto da cláusula" }, ...(low ? { signal: "low" as const } : {}) }) as never;
    for (let i = 0; i < 6; i++) s.registerPending(`S-${i}`, `http://h/r${i}`, [item("table-name"), item("lang-adequacy", true)], () => [`#t${i}`]);
    const block = sessionPendingBlock(s.open(), new Set(), (c) => s.textDelivered(c), true)!;
    expect(block.items).toHaveLength(1);
    expect(block.items[0]).toMatchObject({ code: "table-name", routes: 6, more: 3 });
    expect(block.items[0].ids).toHaveLength(3);
    expect(block.lowSignal).toBe(6);
    expect(JSON.stringify(block)).toContain("texto da cláusula");
    s.markDelivered("table-name");
    expect(JSON.stringify(sessionPendingBlock(s.open(), new Set(), (c) => s.textDelivered(c), true))).not.toContain("texto da cláusula");
    // M2: verify na mesma rota (outro localizador) resolve; noutra rota, só no mesmo elemento
    const f = (page: string, locator: string) => ({ id: "F", rule: { id: "3.9", source: "emag" }, element: { page, locator } }) as never;
    // 3.7.12: o verify que não decide (unverifiable) não resolve nada; a mecânica de rota/elemento vale para o que decide
    expect(s.resolveByVerify(f("http://h/r0", "#outro"), "V-0", "unverifiable")).toHaveLength(0);
    expect(s.resolveByVerify(f("http://h/r0", "#outro"), "V-1", "confirmed")).toHaveLength(1);
    expect(s.resolveByVerify(f("http://h/zz", "#t3"), "V-2", "confirmed")).toHaveLength(1);
    expect(s.resolveByVerify(f("http://h/zz", "#nada"), "V-3", "confirmed")).toHaveLength(0);
  });
});

describe("3.6.1 revisão — busca sem contaminação pelo rótulo de força das áreas do Template Base", () => {
  it("get_ds_rules {query:'obrigatório', component:'input'}: as unidades de formulário à frente, nenhuma do Template Base no top 3", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("get_ds_rules", { query: "obrigatório", component: "input" });
      const top = (r.data.results as Array<{ citeAs?: string; id?: string }>).slice(0, 3).map((x) => x.citeAs ?? x.id ?? "");
      expect(top.some((id) => id.startsWith("govbr-3.7.0-template-global-"))).toBe(false);
      expect(top[0]).toMatch(/-input-/);
      // 3.7.3 (D-167): motor 1.3.2 (unidades de especificação fora do pool padrão); a ordem das normas é a mesma.
      expect(r.data.kb.ranking).toBe("govbr-lexical/1.3.2");
    } finally {
      await client.close();
    }
  });
});

describe("3.6.1 item 6 — rotas/estados diferentes são achados separados", () => {
  it("a resposta lembra a separação quando a sessão já viu outra rota/estado; as instruções têm o passo nos dois perfis", async () => {
    const { client, call } = await connect();
    try {
      const a = await call("scan_page", { url: `${base}/agenda/consultas`, checks: ["axe"] });
      expect(a.data.units).toBeUndefined();
      const b = await call("scan_page", { url: `${base}/agenda/consulta`, checks: ["axe"] });
      expect(b.data.units).toMatchObject({ routes: 2 });
      expect(b.data.units.note).toMatch(/um cartão por rota\/estado/);
    } finally {
      await client.close();
    }
    for (const tools of [new Set(["scan_page", "get_finding_details", "verify_finding", "get_ds_rules", "get_component_spec"]), new Set(["scan_page", "get_finding_details", "verify_finding"])]) {
      expect(serverInstructions(tools)).toMatch(/um achado por rota\/estado/);
      expect(serverInstructions(tools)).toMatch(/sessionPending/);
    }
  });

  it("revisão L2: sha das instructions por perfil exposto (o tools/list do knowledge-free não muda, as instructions sim)", async () => {
    const { instructionsSha256, instructionsForProfile } = await import("../../src/server.js");
    expect(instructionsSha256("knowledge-free")).toBe("1a10c7635ce54b0e30873f14acd9340ec9b4e8896d2faa198bf500e84fd225c5");
    expect(instructionsSha256("evaluation")).toBe("ace27ba89970bed0f4da247dd8c49e319edc8614d6e6cdfddcaf97b49f3f90e9");
    expect(instructionsForProfile("knowledge-free")).not.toMatch(/get_ds_rules|pendingResolved/);
  });

  it("ScanSession: rota = caminho (+ fragmento de rota), sem query; normas citadas normalizadas", () => {
    expect(routeKeyOf("http://h/a/b/?x=1")).toBe(routeKeyOf("http://h/a/b?y=2"));
    expect(routeKeyOf("http://h/app#/detalhe/3")).not.toBe(routeKeyOf("http://h/app#/lista"));
    expect(routeKeyOf("http://h/a#secao")).toBe(routeKeyOf("http://h/a"));
    expect([...citedNorms({ id: "3.3", source: "emag", description: "", wcag: "2.4.2" } as never)].sort()).toEqual(["emag-3.3", "wcag-2.4.2"]);
    const s = new ScanSession();
    s.recordScan({ scanId: "S-1", route: "http://h/a", fingerprint: "f1", title: "Início", heading: "Lista", checks: [] });
    expect(s.sameTitleElsewhere("http://h/b", "  início ", "Detalhe").map((x) => x.scanId)).toEqual(["S-1"]);
    expect(s.sameTitleElsewhere("http://h/a", "Início", "Detalhe")).toEqual([]);
    expect(s.sameTitleElsewhere("http://h/b", "Início", "Lista")).toEqual([]);
    expect(s.sameTitleElsewhere("http://h/b", "Início", null)).toEqual([]);
    expect(routeTemplateOf("http://h/x/3028")).toBe(routeTemplateOf("http://h/x/3038"));
    expect(routeTemplateOf("http://h/x/lista")).not.toBe(routeTemplateOf("http://h/x/detalhe"));
  });
});
