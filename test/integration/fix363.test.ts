/**
 * 3.6.3 (D-155, rastreio dev-362-b-01) — o que a 3.6.2 perdia entre o oráculo e o agente.
 *
 * Fixtures sintéticas e neutras (catálogo de uma biblioteca): nenhum markup, texto, seletor ou id das telas A/B, do
 * fluxo ou dos controles. Cada teste reproduz o MECANISMO do rastreio, não o caso:
 *   1. a forma curta das pendências guarda localizador, valor medido e tarefa, e só vem depois dos outros cortes;
 *   2. verify_finding recusa evidência de rotas/estados diferentes (`mixed-states`) e devolve a divisão;
 *   3. toda chamada gera exatamente um evento de telemetria, também a recusada pela validação de entrada;
 *   4. a pendência de um elemento que reaparece em outra rota mantém o id.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { knowledgeLockAttempts, resetKnowledgeLock } from "../../src/data/lock.js";
import { assembleScan } from "../../src/responses/scan.js";
import { textSize } from "../../src/responses/contract.js";
import { notJudgedFor, pageLevelBlock, pageLevelCodes, pageLevelMinimal, pageLevelNorm, pageLevelShort, pendingLine, pendingLineMinimal, pendingLineNorm, type PendingItem } from "../../src/scan/notJudged.js";
import { ScanSession, sessionPendingBlock, slotOf } from "../../src/scan/session.js";
import type { PageFacts } from "../../src/evidence/pageFacts.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ToolTelemetryEvent } from "../../src/telemetry.js";

function page(title: string, body: string, script = ""): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head>
<body><a href="#conteudo">Ir para o conteúdo</a><header class="br-header"><span class="header-title">Biblioteca</span>
<p id="aviso" style="background-image:linear-gradient(#777,#888);color:#999">Horário especial</p></header>
<main id="conteudo">${body}</main><footer class="br-footer">fim</footer><script>${script}</script></body></html>`;
}

const PAGES: Record<string, string> = {
  // Estado inicial: campo sem rótulo; depois do clique, o campo some e aparece uma imagem sem texto alternativo.
  "/acervo": page(
    "Acervo — Biblioteca",
    `<h1>Acervo</h1><button type="button" id="trocar">Ver capa</button>
     <section id="busca"><input id="termo" type="text"></section>
     <section id="capa" hidden><img id="foto" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40"></section>`,
    `document.getElementById('trocar').addEventListener('click', function () { document.getElementById('busca').hidden = true; document.getElementById('capa').hidden = false; });`,
  ),
  "/emprestimos": page("Empréstimos — Biblioteca", `<h1>Empréstimos</h1><p>Lista.</p>`),
  "/reservas": page("Reservas — Biblioteca", `<h1>Reservas</h1><p>Lista.</p><img id="selo" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40">`),
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
afterEach(() => resetKnowledgeLock());

type Profile = "full" | "evaluation" | "knowledge-free";

async function connect(profile: Profile = "evaluation", events?: ToolTelemetryEvent[], processLock = false) {
  const srv = createServer({
    toolProfile: profile,
    ...(processLock ? {} : { knowledgeLock: "call" as const }),
    reportsDir: mkdtempSync(join(tmpdir(), "govbr-363-")),
    ...(events ? { telemetry: { onEvent: (e: ToolTelemetryEvent) => events.push(e) } } : {}),
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fix363", version: "1" });
  await srv.connect(b);
  await client.connect(a);
  // A5: estes casos verificam fatos/estado; teto explícito preserva a projeção completa.
const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: name === "scan_page" && args.maxChars === undefined ? { ...args, maxChars: 100_000 } : args });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    let data: Record<string, any> = {};
    try {
      data = JSON.parse(text);
    } catch {
      /* erro do SDK em texto */
    }
    return { text, isError: Boolean(r.isError), data };
  };
  return { client, call };
}

// ── 1. forma curta das pendências ─────────────────────────────────────────────────────────────

const contrastItem: PendingItem = {
  code: "contrast-incomplete",
  subject: "contraste que o axe não decidiu",
  count: 1,
  examples: [".selo"],
  measured: [{ locator: ".selo", fg: "#ffffff", bg: "#ff8c00", ratio: 2.33, reason: "shortTextContent" }],
  todo: "decida o contraste: o axe não concluiu (fundo não sólido, sobreposição, pseudo-elemento ou cor incerta)",
  norms: ["govbr-3.7.0-x-000000000001", "emag-4.1", "wcag-1.4.3"],
  rule: { id: "govbr-3.7.0-x-000000000001", force: "required", text: "Texto da cláusula." },
  measure: "cor do texto × fundo efetivo no navegador; 4,5:1 (3:1 texto grande)",
  pendingId: "P-05",
};
const fieldItem: PendingItem = {
  code: "field-name-source",
  subject: "campos com nome só pelo title",
  count: 2,
  examples: ["#a", "#b", "#c"],
  todo: "rótulo associado (o axe aceita o title como nome)",
  norms: ["emag-6.2", "wcag-3.3.2"],
  measure: "label/aria-labelledby/aria-label",
  pendingId: "P-06",
};
const lowItem: PendingItem = { code: "lang-adequacy", subject: "idioma", observed: 'lang="pt-BR"', todo: "se corresponde", norms: ["emag-3.1"], measure: "lang", signal: "low", pendingId: "P-07" };

describe("3.6.3 item 1 — a forma curta da pendência guarda a medida e a tarefa", () => {
  it("uma linha: código, WCAG antes do e-MAG, localizador com o valor medido e a tarefa", () => {
    const line = pendingLine(contrastItem);
    expect(line.startsWith("P-05:contrast-incomplete:1⇒wcag-1.4.3,emag-4.1")).toBe(true);
    expect(line).toContain("@.selo fg #ffffff bg #ff8c00 ratio 2.33");
    expect(line).toContain("· decida o contraste");
    expect(line.length).toBeLessThanOrEqual(200);
    // sem medida: os localizadores (até 2) e a tarefa
    const f = pendingLine(fieldItem);
    expect(f).toMatch(/^P-06:field-name-source:2⇒wcag-3\.3\.2,emag-6\.2 @#a; #b · rótulo associado/);
    expect(f).not.toContain("#c");
  });

  it("a forma curta conta as pendências sem sinal e os códigos ainda saem da linha", () => {
    const short = pageLevelShort({ notMeasured: [contrastItem, fieldItem, lowItem], full: { tool: "get_finding_details" } });
    expect(short.notMeasured).toHaveLength(2);
    expect(short.lowSignal).toBe(1);
    expect(pageLevelCodes(short).notMeasured).toEqual(["P-05:contrast-incomplete:1", "P-06:field-name-source:2"]);
  });

  it("o degrau mínimo guarda uma norma, o lugar com o valor medido e a tarefa curta; os códigos ainda saem dele", () => {
    expect(pendingLineMinimal(pendingLine(contrastItem))).toBe("P-05:contrast-incomplete:1⇒wcag-1.4.3 @.selo #ffffff/#ff8c00 2.33:1 · decida o contraste");
    expect(pendingLineMinimal(pendingLine({ ...fieldItem, resolved: "conforme" }))).toBe("P-06:field-name-source:2⇒wcag-3.3.2✓ @#a · rótulo associado");
    const min = pageLevelMinimal(pageLevelShort({ notMeasured: [contrastItem, fieldItem] }))!;
    expect(pageLevelCodes(min).notMeasured).toEqual(["P-05:contrast-incomplete:1", "P-06:field-name-source:2"]);
    expect(pageLevelMinimal(min)).toBeNull();
  });

  it("revisão MEDIUM 2: entre a mínima e o código, o degrau código⇒norma (~35 caracteres); depois os códigos", () => {
    const min = pendingLineMinimal(pendingLine(contrastItem));
    expect(pendingLineNorm(min)).toBe("P-05:contrast-incomplete:1⇒wcag-1.4.3");
    expect(pendingLineNorm(pendingLineMinimal(pendingLine({ ...fieldItem, resolved: "conforme" })))).toBe("P-06:field-name-source:2⇒wcag-3.3.2✓");
    const norm = pageLevelNorm(pageLevelMinimal(pageLevelShort({ notMeasured: [contrastItem, fieldItem] }))!)!;
    expect(norm.notMeasured).toEqual(["P-05:contrast-incomplete:1⇒wcag-1.4.3", "P-06:field-name-source:2⇒wcag-3.3.2"]);
    expect(pageLevelNorm(norm)).toBeNull();
    expect(pageLevelCodes(norm).notMeasured).toEqual(["P-05:contrast-incomplete:1", "P-06:field-name-source:2"]);
  });

  it("revisão MEDIUM 2: com uma família a mais esperando, as pendências não descem abaixo dos códigos (ids) na 1ª página", () => {
    const head = {
      contract: "c", kind: "scan", scanId: "S-page-001",
      checksRun: { executed: [{ check: "axe" }], limits: [{ code: "single-state", text: "Mediu só o estado inicial." }], pageLevel: { ...pageLevelBlock(["axe"], [contrastItem, fieldItem]), full: { tool: "get_finding_details" } } },
      absenceNote: "n",
    };
    const fam = (i: number) => ({ familyId: `fam-${i}`, rule: { id: `r${i}`, checker: `c${i}` }, count: 1, example: { element: { locator: `#x${i}`, snippet: "y".repeat(300) } }, memberIds: [`F-00${i}`] });
    const pager = (budget: number) => {
      const all = [fam(1), fam(2), fam(3), fam(4)];
      const out: unknown[] = [];
      let used = 0;
      for (const f of all) {
        const n = JSON.stringify(f).length;
        if (out.length && used + n > budget) break;
        out.push(f);
        used += n;
      }
      return { totalFindings: 4, totalFamilies: 4, families: out, count: out.length, complete: out.length === 4, ...(out.length < 4 ? { nextCursor: out.length } : {}) };
    };
    let checked = 0;
    for (let max = 1_200; max <= 3_000; max += 25) {
      const r = assembleScan(head, null, "S-page-001", max, pager, { firstScanPage: true });
      const pl = (r.checksRun as { pageLevel?: { notMeasured?: unknown[]; ids?: string[]; count?: number } }).pageLevel!;
      if (Array.isArray(r.families) && r.families.length > 0) {
        checked += 1;
        const ids = pl.ids ?? (pl.notMeasured as string[] | undefined)?.map((i) => (typeof i === "string" ? i.split(":")[0] : (i as { pendingId: string }).pendingId));
        expect(ids, `max ${max}: ids na 1ª página`).toEqual(["P-05", "P-06"]);
      }
    }
    expect(checked).toBeGreaterThan(0);
    // sem pendência com sinal (lista vazia): não há id a guardar — o bloco desce à contagem antes de uma família sair
    const empty = { ...head, checksRun: { ...head.checksRun, pageLevel: { ...pageLevelBlock(["axe"], []), full: { tool: "get_finding_details" } } } };
    const forms: string[] = [];
    for (let max = 1_200; max <= 3_000; max += 25) {
      const r = assembleScan(empty, null, "S-page-001", max, pager, { firstScanPage: true });
      forms.push(JSON.stringify((r.checksRun as { pageLevel?: unknown }).pageLevel));
    }
    expect(forms).toContain(JSON.stringify({ count: 0, next: { tool: "get_finding_details" } }));
  });

  it("na 1ª página, pageLevel só encolhe depois de observações, cobertura e estado; e encolhendo guarda o 2,33", () => {
    const head = {
      contract: "c",
      kind: "scan",
      scanId: "S-page-001",
      state: { reached: true, replay: { status: "ok", detail: "x".repeat(600) }, settle: { settled: true, log: "y".repeat(400) }, recipe: { viewport: { width: 1, height: 1 }, viewportSource: "harness", actions: [] }, observed: { url: "u", path: "/", viewport: { width: 1, height: 1 }, extra: "z".repeat(400) } },
      coverage: { checks: ["axe"], elementsInspected: 10, componentsFound: Array.from({ length: 40 }, (_, i) => `componente-${i}`), actionsApplied: [] },
      checksRun: { executed: [{ check: "axe" }], limits: [{ code: "single-state", text: "Mediu só o estado inicial." }], pageLevel: { ...pageLevelBlock(["axe"], [contrastItem, fieldItem]), full: { tool: "get_finding_details" } } },
      absenceNote: "n",
    };
    const family = { familyId: "fam-1", rule: { id: "r", checker: "c" }, count: 1, example: { element: { locator: "#x" } }, memberIds: ["F-001"] };
    const pager = () => ({ totalFindings: 1, totalFamilies: 1, families: [family], count: 1, complete: true });
    const sizes: Array<{ max: number; pl: unknown; coverageCompact: boolean; stateFull: boolean }> = [];
    for (let max = 1_200; max <= 4_000; max += 50) {
      const r = assembleScan(head, null, "S-page-001", max, pager, { firstScanPage: true });
      expect(textSize(r)).toBeLessThanOrEqual(max);
      const pl = (r.checksRun as { pageLevel?: { notMeasured?: unknown[] } }).pageLevel;
      sizes.push({ max, pl: pl?.notMeasured?.[0], coverageCompact: Boolean((r.coverage as { compact?: boolean }).compact), stateFull: Boolean((r.state as { full?: unknown }).full) });
      if (Array.isArray(r.families) && r.families.length && typeof pl?.notMeasured?.[0] === "string") {
        // forma curta: os cortes de cobertura e estado já aconteceram
        expect(sizes.at(-1)!.coverageCompact && sizes.at(-1)!.stateFull, `max ${max}`).toBe(true);
        if ((pl.notMeasured![0] as string).includes("@")) expect(pl.notMeasured![0]).toMatch(/ratio 2.33|2.33:1/);
      }
    }
    // há um teto em que cobertura e estado já encolheram e a pendência ainda vem inteira (a ordem nova)
    expect(sizes.some((s) => s.coverageCompact && s.stateFull && typeof s.pl === "object")).toBe(true);
    // e um em que ela vem curta com a medida
    expect(sizes.some((s) => typeof s.pl === "string" && (s.pl as string).includes("ratio 2.33"))).toBe(true);
  });
});

// ── 2. verify_finding: um achado por rota/estado ─────────────────────────────────────────────

describe("3.6.3 item 3 — verify_finding recusa o fato com membros de rotas/estados diferentes", () => {
  it("revisão MEDIUM 1: aceita o achado de outro estado da mesma rota e a relação antes/depois (com aviso); recusa membros de dois estados e o fato em duas rotas", async () => {
    const { client, call } = await connect();
    try {
      const url = `${base}/acervo`;
      const s1 = await call("scan_page", { url, checks: ["axe"], view: "findings", detail: "full", maxChars: 100_000 });
      const actions = [{ action: "click", selector: "#trocar" }];
      const s2 = await call("scan_page", { url, checks: ["axe"], actions, view: "findings", detail: "full", maxChars: 100_000 });
      const inS1 = (s1.data.findings as Array<Record<string, any>>).find((f) => f.element.locator.includes("termo"));
      const inS2 = (s2.data.findings as Array<Record<string, any>>).find((f) => f.element.locator.includes("foto"));
      expect(inS1, "campo sem rótulo no estado inicial").toBeDefined();
      expect(inS2, "imagem sem alt depois do clique").toBeDefined();

      // (a) o achado citado não está no lote do estado citado (outro estado da mesma rota): aceito, com aviso
      const other = await call("verify_finding", { finding: inS1, scanId: s2.data.scanId, live: true });
      expect(other.data.kind).toBe("verification");
      expect(other.data.stateWarning?.groups).toHaveLength(2);
      // (a') re-scan do mesmo estado com menos checks (o achado não está no lote novo): mesmo estado, sem aviso
      const s3 = await call("scan_page", { url, checks: ["page"] });
      const again = await call("verify_finding", { finding: inS1, scanId: s3.data.scanId, live: true });
      expect(again.data.kind).toBe("verification");
      expect(again.data.stateWarning).toBeUndefined();
      // (b) relação antes/depois declarada em evidence.data: aceita, com aviso
      const change = { ...inS2, id: "C-3", evidence: { ...inS2!.evidence, data: { ...inS2!.evidence.data, before: s1.data.scanId, after: s2.data.scanId } } };
      const rel = await call("verify_finding", { finding: change, scanId: s2.data.scanId, live: true });
      expect(rel.data.kind).toBe("verification");
      expect(rel.data.stateWarning).toBeDefined();

      // membros de dois estados em evidence.data, sem relação declarada: recusado
      const merged = { ...inS2, id: "C-1", evidence: { ...inS2!.evidence, data: { ...inS2!.evidence.data, members: [inS2!.id, inS1!.id] } } };
      const mixed = await call("verify_finding", { finding: merged, scanId: s2.data.scanId, live: true });
      expect(mixed.isError).toBe(true);
      expect(mixed.data.errorCode).toBe("mixed-states");
      expect(mixed.data.groups.map((g: { scanIds: string[] }) => g.scanIds[0]).sort()).toEqual([s1.data.scanId, s2.data.scanId].sort());
      expect(mixed.data.next).toHaveLength(2);
      expect(mixed.data.next[0]).toMatchObject({ tool: "verify_finding", arguments: { scanId: expect.stringMatching(/^S-page-/) } });

      // o fato com membros de duas rotas: recusado, com um grupo por rota
      const r = await call("scan_page", { url: `${base}/reservas`, checks: ["axe"], view: "findings", detail: "full", maxChars: 100_000 });
      const elsewhere = (r.data.findings as Array<Record<string, any>>).find((f) => f.element.locator.includes("selo"));
      expect(elsewhere, "imagem sem alt em /reservas").toBeDefined();
      const twoRoutes = { ...inS2, id: "C-4", evidence: { ...inS2!.evidence, data: { ...inS2!.evidence.data, members: [inS2!.id, elsewhere!.id] } } };
      const cross = await call("verify_finding", { finding: twoRoutes, scanId: s2.data.scanId, live: true });
      expect(cross.data.errorCode).toBe("mixed-states");
      expect(cross.data.groups.map((g: { route: string }) => g.route).sort()).toEqual(["/acervo", "/reservas"]);
      // nem a relação declarada junta rotas quando o fato (scanId/finding.id) é de outra rota
      const crossId = await call("verify_finding", { finding: elsewhere, scanId: s2.data.scanId, live: true });
      expect(crossId.data.errorCode).toBe("scan-page-mismatch");

      // teste à mão (3.6.3): achado de página tem localizador `html` em toda rota; citado só pelos ids, o de outra rota
      // não pode casar por regra + localizador com o desta (era aceito como "confirmed")
      const pa = await call("scan_page", { url, view: "findings", detail: "full", maxChars: 100_000, limit: 200 });
      const pb = await call("scan_page", { url: `${base}/reservas`, view: "findings", detail: "full", maxChars: 100_000, limit: 200 });
      const fa = pa.data.findings as Array<Record<string, any>>, fb = pb.data.findings as Array<Record<string, any>>;
      const htmlA = fa.find((f) => fb.some((g) => g.rule.id === f.rule.id && g.element.locator === f.element.locator));
      const htmlB = htmlA && fb.find((g) => g.rule.id === htmlA.rule.id && g.element.locator === htmlA.element.locator);
      expect(htmlA, "achado com a mesma regra e o mesmo localizador em /acervo e /reservas").toBeDefined();
      expect(htmlB!.id).not.toBe(htmlA!.id);
      const pageMerged = { ...htmlA, id: "C-5", evidence: { ...htmlA!.evidence, data: { ...htmlA!.evidence.data, members: [htmlA!.id, htmlB!.id] } } };
      const pageCross = await call("verify_finding", { finding: pageMerged, scanId: pa.data.scanId, live: true });
      expect(pageCross.data.errorCode).toBe("mixed-states");
      const byRoute = Object.fromEntries((pageCross.data.groups as Array<{ route: string; cited: string[] }>).map((g) => [g.route, g.cited.join(" ")]));
      expect(byRoute["/reservas"]).toContain(htmlB!.id);
      expect(byRoute["/acervo"]).not.toContain(htmlB!.id);

      // o mesmo estado: segue para o portão, sem aviso
      const same = await call("verify_finding", { finding: inS2, scanId: s2.data.scanId, live: true });
      expect(same.isError).toBe(false);
      expect(same.data.stateWarning).toBeUndefined();
      // sem scanId e sem ids de sessão: nada a recusar
      const free = await call("verify_finding", { finding: { ...inS2, id: "C-2" } });
      expect(free.data.kind).toBe("verification");
    } finally {
      await client.close();
    }
  });
});

// ── 3. telemetria: um evento por chamada, também na recusa ──────────────────────────────────

type JsonSchema = { type?: string | string[]; enum?: unknown[]; properties?: Record<string, JsonSchema>; items?: JsonSchema };

function wrongType(s: JsonSchema): unknown {
  const t = Array.isArray(s.type) ? s.type[0] : s.type;
  if (t === "string") return 42;
  if (t === "number" || t === "integer" || t === "boolean" || t === "array" || t === "object") return "x";
  return undefined;
}

/** Entradas inválidas derivadas do inputSchema publicado: enum errado, tipo errado, campo desconhecido, `constructor`. */
function badInputs(schema: JsonSchema): Array<[string, Record<string, unknown>]> {
  const props = schema.properties ?? {};
  const out: Array<[string, Record<string, unknown>]> = [];
  const enumProp = Object.entries(props).find(([, p]) => Array.isArray(p.enum));
  if (enumProp) out.push(["bad enum", { [enumProp[0]]: "__nao-existe__" }]);
  else {
    // enum aninhado (um nível): ex. objeto com um campo enum
    for (const [k, p] of Object.entries(props)) {
      const inner = Object.entries(p.properties ?? {}).find(([, q]) => Array.isArray(q.enum));
      if (inner) {
        out.push(["bad enum", { [k]: { [inner[0]]: "__nao-existe__" } }]);
        break;
      }
    }
  }
  const typed = Object.entries(props).find(([, p]) => wrongType(p) !== undefined);
  if (typed) out.push(["bad type", { [typed[0]]: wrongType(typed[1]) }]);
  out.push(["unknown key", { campoQueNaoExiste: 1 }]);
  out.push(["constructor", JSON.parse('{"constructor": 1}')]);
  return out;
}

describe("3.6.3 item 4 — toda chamada gera exatamente um evento de telemetria, também a recusada", () => {
  for (const profile of ["full", "evaluation", "knowledge-free"] as const) {
    it(`${profile}: ferramenta × {enum, tipo, campo desconhecido, constructor} → eventos = chamadas, status rejected`, async () => {
      const events: ToolTelemetryEvent[] = [];
      // knowledge-free com a trava de PROCESSO: qualquer carga da base durante a recusa seria contada.
      const { client } = await connect(profile, events, profile === "knowledge-free");
      try {
        const tools = (await client.listTools()).tools;
        expect(tools.length).toBeGreaterThan(0);
        let calls = 0;
        const perTool = new Map<string, number>();
        for (const t of tools) {
          for (const [label, args] of badInputs(t.inputSchema as JsonSchema)) {
            const before = events.length;
            const r = await client.callTool({ name: t.name, arguments: args });
            calls += 1;
            expect(r.isError, `${t.name} ${label}`).toBe(true);
            expect(events.length - before, `${t.name} ${label}: um evento`).toBe(1);
            const e = events.at(-1)!;
            expect(e.tool, `${t.name} ${label}`).toBe(t.name);
            expect(e.status, `${t.name} ${label}`).toBe("rejected");
            expect(e.error, `${t.name} ${label}`).toMatch(/invalid-argument|unknown-parameter/);
            if (profile === "knowledge-free") expect(e.knowledgeLockAttempts, `${t.name} ${label}`).toBe(0);
            else expect(e).not.toHaveProperty("knowledgeLockAttempts");
            perTool.set(t.name, (perTool.get(t.name) ?? 0) + 1);
          }
        }
        expect(events).toHaveLength(calls);
        for (const t of tools) expect(perTool.get(t.name), t.name).toBeGreaterThanOrEqual(2);
        // ferramenta inexistente neste perfil: o SDK recusa; o evento também sai
        const missing = await client.callTool({ name: "ferramenta_que_nao_existe", arguments: {} });
        expect(missing.isError).toBe(true);
        expect(events).toHaveLength(calls + 1);
        expect(events.at(-1)).toMatchObject({ tool: "ferramenta_que_nao_existe", status: "rejected", error: "unknown-tool" });
        if (profile === "knowledge-free") expect(knowledgeLockAttempts().attempts).toBe(0);
        // uma chamada válida continua com um evento só (status ok)
        // revisão LOW 3: argumentos que não são objeto — o SDK recusa no protocolo (-32602); o evento sai assim mesmo
        await expect(client.request({ method: "tools/call", params: { name: tools[0].name, arguments: [1] as never } }, CallToolResultSchema)).rejects.toThrow();
        expect(events).toHaveLength(calls + 2);
        expect(events.at(-1)).toMatchObject({ tool: tools[0].name, status: "rejected", error: "invalid-arguments" });
        calls += 1;
        const okCall = await client.callTool({ name: "get_finding_details", arguments: { ids: ["F-999"] } });
        expect(okCall.isError).toBeFalsy();
        expect(events).toHaveLength(calls + 2);
        expect(events.at(-1)!.status).toBe("ok");
      } finally {
        await client.close();
      }
    });
  }
});

// ── 4. pendências da sessão por código + elemento ───────────────────────────────────────────

describe("3.6.3 item 5 — a pendência de um elemento que reaparece em outra rota mantém o id", () => {
  it("unidade: o mesmo conjunto inteiro de elementos em duas rotas = um id; documento é por rota; outro conjunto é outro id; na mesma rota o código não abre id novo", () => {
    const s = new ScanSession();
    const loc = (i: { examples?: string[] }) => (i.examples ?? []).slice();
    const set = { ...contrastItem, elementSet: "set-selo" };
    const title = { code: "document-title-adequacy" as const, subject: "<title>", todo: "t", measure: "m", norms: ["emag-3.3"] };
    const a = s.registerPending("S-page-001", "http://h/a", [set, title], loc);
    const b = s.registerPending("S-page-002", "http://h/b", [set, title], loc);
    expect(b[0].id).toBe(a[0].id);
    expect(b[0].routes).toEqual(["http://h/a", "http://h/b"]);
    expect(b[1].id).not.toBe(a[1].id);
    // sem o conjunto inteiro conhecido (elementSet ausente): por rota
    const noSet = s.registerPending("S-page-003", "http://h/c", [{ ...contrastItem, code: "table-name" as const, subject: "tabelas" }], loc);
    const noSet2 = s.registerPending("S-page-004", "http://h/d", [{ ...contrastItem, code: "table-name" as const, subject: "tabelas" }], loc);
    expect(noSet2[0].id).not.toBe(noSet[0].id);
    // outro conjunto (ou outra contagem) do mesmo código noutra rota: outro id
    const other = s.registerPending("S-page-005", "http://h/e", [{ ...set, elementSet: "set-outro" }], loc);
    expect(other[0].id).not.toBe(a[0].id);
    const moreNodes = s.registerPending("S-page-006", "http://h/f", [{ ...set, count: 9 }], loc);
    expect(moreNodes[0].id).not.toBe(a[0].id);
    // na mesma rota, o mesmo código com outro conjunto (depois de uma ação) mantém o id da rota (como na 3.6.2)
    const wider = s.registerPending("S-page-007", "http://h/a", [{ ...set, count: 2, elementSet: "set-maior", examples: [".selo", "#outro"] }], loc);
    expect(wider[0].id).toBe(a[0].id);
    // revisão LOW 2: a rota que entrou pelo conjunto ganha a chave dela — outra ação lá não abre id novo
    const bAfter = s.registerPending("S-page-008", "http://h/b", [{ ...set, elementSet: "set-depois", examples: [".selo", "#x"] }], loc);
    expect(bAfter[0].id).toBe(a[0].id);
    expect(s.open().map((x) => x.id)).toEqual([...new Set(s.open().map((x) => x.id))]);
  });

  it("revisão HIGH 1: resolver numa rota não fecha a mesma pendência noutra; a resposta diz quais rotas seguem abertas", () => {
    const s = new ScanSession();
    const loc = (i: { examples?: string[] }) => (i.examples ?? []).slice();
    const item = { ...contrastItem, count: 2, examples: [".content", "#corpo"], elementSet: "set-1", measured: [contrastItem.measured![0], { locator: "#corpo", fg: "#000", bg: "#111", ratio: 1.1, reason: null }] };
    const [onA] = s.registerPending("S-page-001", "http://h/a", [item], loc);
    const [onB] = s.registerPending("S-page-002", "http://h/b", [item], loc);
    expect(onB.id).toBe(onA.id);
    // verify em /b, num elemento qualquer, citando a norma: fecha só /b
    const f = { id: "C", rule: { id: "1.4.3", source: "wcag" }, element: { page: "http://h/b", locator: "#qualquer" } } as never;
    const resolved = s.resolveByVerify(f, "V-1", "unverifiable");
    expect(resolved).toEqual([`${onA.id}@/b`]);
    expect(slotOf(onA, "http://h/b")?.status).toBe("resolved");
    expect(slotOf(onA, "http://h/a")?.status).toBe("open");
    expect(onA.status).toBe("open");
    expect(s.stillOpen(resolved)).toEqual([`${onA.id}@/a`]);
    // num scan de /b, sessionPending mostra a de /a ainda aberta
    const block = sessionPendingBlock(s.open(), new Set([onA.id]), () => true, false, "http://h/b")!;
    expect(block.items[0].ids).toEqual([`${onA.id}×1`]);
    expect(block.items[0].openOn).toEqual({ [onA.id]: ["/a"] });
    // pendingResolved explícito no scan de /a fecha /a
    const exp = s.resolveExplicit([{ id: onA.id, status: "conforme", reason: "medi 7:1" }], "http://h/a");
    expect(exp.resolved).toEqual([`${onA.id}@/a`]);
    expect(exp).not.toHaveProperty("stillOpen");
    expect(onA.status).toBe("resolved");
    // uma rota nova da mesma pendência abre aberta
    s.registerPending("S-page-003", "http://h/c", [item], loc);
    expect(slotOf(onA, "http://h/c")?.status).toBe("open");
    expect(onA.status).toBe("open");
  });

  it("revisão HIGH 2: o conjunto é o inteiro (não só os 3 exemplos) — 3 campos em /a e 9 em /b com os mesmos 3 primeiros são pendências distintas", () => {
    const facts = { url: "x", lang: null, title: "", regions: {}, mainLandmarks: 1, linkCount: 0, firstLink: null } as unknown as PageFacts;
    const fields = (n: number) => Array.from({ length: n }, (_, i) => ({ locator: `#campo-${i}`, source: { kind: "title-only" } as never }));
    const on = (n: number) => notJudgedFor({ facts, fields: fields(n), unnamedTables: [], placeholderChecked: true, axeRan: true, pageWide: false }).filter((i) => i.code === "field-name-source");
    const [three] = on(3);
    const [nine] = on(9);
    expect(three.examples).toEqual(nine.examples);
    expect(three.elementSet).toBeDefined();
    expect(three.elementSet).not.toBe(nine.elementSet);
    const s = new ScanSession();
    const loc = (i: { examples?: string[] }) => (i.examples ?? []).slice();
    const [a] = s.registerPending("S-page-001", "http://h/a", [three], loc);
    const [b] = s.registerPending("S-page-002", "http://h/b", [nine], loc);
    expect(b.id).not.toBe(a.id);
    // o hash nunca sai numa resposta
    expect(JSON.stringify(pageLevelBlock(["axe"], [{ ...three, pendingId: a.id }]))).not.toContain(three.elementSet!);
  });

  it("integração: o aviso do cabeçalho com contraste não decidido tem o mesmo pendingId nas duas rotas e não volta em sessionPending", async () => {
    const { client, call } = await connect();
    try {
      const ids = (data: Record<string, any>, code: string) =>
        ((data.checksRun?.pageLevel?.notMeasured ?? []) as Array<string | { code: string; pendingId?: string }>).flatMap((i) =>
          typeof i === "string" ? (i.includes(`:${code}`) ? [i.split(":")[0]] : []) : i.code === code && i.pendingId ? [i.pendingId] : [],
        );
      const pid = (data: Record<string, any>) => ids(data, "contrast-incomplete")[0];
      // A identidade é conferida na forma completa; o orçamento padrão pode compactar items em ids.
      const a = await call("scan_page", { url: `${base}/emprestimos`, checks: ["axe"], maxChars: 100000 });
      const b = await call("scan_page", { url: `${base}/reservas`, checks: ["axe"], maxChars: 100000 });
      expect(pid(a.data)).toBeDefined();
      expect(pid(b.data)).toBe(pid(a.data));
      // o título é do documento: um id por rota
      expect(ids(b.data, "document-title-adequacy")[0]).not.toBe(ids(a.data, "document-title-adequacy")[0]);
      // revisão HIGH 1: a de /emprestimos segue aberta (resolução por rota) — em sessionPending como `P-NN×1`, não como id solto
      const sp = (b.data.sessionPending?.items ?? []) as Array<{ code: string; ids: string[]; openOn?: Record<string, string[]> }>;
      const contrast = sp.find((i) => i.code === "contrast-incomplete")!;
      expect(contrast.ids).toEqual([`${pid(a.data)}×1`]);
      expect(contrast.openOn?.[pid(a.data)!]).toEqual(["/emprestimos"]);
    } finally {
      await client.close();
    }
  });
});
