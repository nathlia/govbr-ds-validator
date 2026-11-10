/**
 * 3.7.6-pre.1 (leitura dev-374-a2 §5, itens 1–3), genérico — nenhuma tela, unidade ou spec de referência:
 *   1. a especificação por parte chega ao agente: `specification` no 1º scan (componentes com linhas mensuráveis, desvios
 *      medidos, chamada) e `specification.measure` em get_component_spec; nunca tira família da 1ª página;
 *   2. token por parte: o valor computado da parte (o seletor em que a folha do DS aplica o token da tabela) × o token da
 *      linha de especificação → observação `spec-part-token` com a unidade;
 *   3. observação que traz norma obrigatória vira pendência `O-NN` (fecha por verify no elemento ou pela leitura da norma;
 *      pendingResolved não fecha).
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
import { scanPage, PageScanCache } from "../../src/scan/pageScan.js";
import { comparePartTokens, partSelectors, SPEC_PART_KIND } from "../../src/checkers/specPartTokens.js";
import { measurableSpecRows, typographyRows } from "../../src/data/specParts.js";
import { getTokenRegistry } from "../../src/data/load.js";
import { observedRequiredItems } from "../../src/scan/notJudged.js";
import { ScanSession } from "../../src/scan/session.js";
import { assembleScan, specificationFor, specificationMinimal, specificationShort } from "../../src/responses/scan.js";
import { buildFamilyPage } from "../../src/responses/families.js";
import { textSize } from "../../src/responses/contract.js";
import type { Observation } from "../../src/schema/finding.js";
import { makeElement } from "../helpers/fixtures.js";

// A parte de tipografia de um componente qualquer da base, escolhida pelos dados (não por nome de parte ou unidade):
// o 1º componente cujo seletor de parte aplica um token de tamanho que só UMA linha da tabela tem.
function pickPart() {
  for (const component of ["tab", "button", "tag", "card", "list", "tooltip", "breadcrumb", "header"]) {
    const rows = typographyRows(component);
    for (const sel of partSelectors(component, rows)) {
      const size = sel.pairs.find((p) => p.property === "fontSize");
      if (!size || /[:[]/.test(sel.selector)) continue;
      const owners = rows.filter((r) => r.pairs.some((p) => p.property === "fontSize" && p.token === size.token));
      if (owners.length === 1) return { component, selector: sel.selector, token: size.token, row: owners[0], weight: sel.pairs.find((p) => p.property === "fontWeight")?.token };
    }
  }
  throw new Error("nenhuma parte de tipografia na base");
}
const PART = pickPart();
const ALL = getTokenRegistry().all;
const offScaleValue = () => {
  // um tamanho da escala do DS diferente do token da parte (desvio que a escala global não acusa)
  const target = parseFloat(ALL[PART.token]);
  return ["--font-size-scale-base", "--font-size-scale-up-01", "--font-size-scale-up-03"].find((t) => parseFloat(ALL[t]) !== target)!;
};
const OTHER = offScaleValue();

/** Marcação mínima que o seletor da parte casa: cada classe vira um elemento aninhado; a tag final, o elemento medido. */
function markupFor(selector: string, inner: string, id: string): string {
  const parts = selector.trim().split(/\s+/);
  let html = "";
  let close = "";
  parts.forEach((p, i) => {
    const m = p.match(/^([a-z0-9-]*)((?:\.[\w-]+)*)$/i)!;
    const tag = m[1] || "div";
    const classes = m[2].split(".").filter(Boolean).join(" ");
    const last = i === parts.length - 1;
    html += `<${tag}${classes ? ` class="${classes}"` : ""}${last ? ` id="${id}"` : ""}${tag === "button" ? ' type="button"' : ""}>`;
    close = `</${tag}>${close}`;
    if (last) html += inner;
  });
  return html + close;
}

const tokensCss = `:root{${Object.entries(ALL).filter(([k]) => /^--font-(size|weight)-/.test(k)).map(([k, v]) => `${k}:${v}`).join(";")}}`;
// cópia literal da declaração da folha oficial (seletor e valor iguais ao índice: conta como do DS)
const dsCss = `${PART.selector}{font-size:var(${PART.token})${PART.weight ? `;font-weight:var(${PART.weight})` : ""}}`;
const PAGES: Record<string, string> = {
  "/desvio": `<style>${tokensCss}${dsCss} #p1{font-size:var(${OTHER})}</style>${markupFor(PART.selector, "Rótulo", "p1")}${markupFor(PART.selector, "Outro", "p2")}`,
  "/conforme": `<style>${tokensCss}${dsCss}</style>${markupFor(PART.selector, "Rótulo", "p1")}`,
  "/fonte": `<style>.t{font-size:13px}</style><h2 id="t1" class="t">Seção</h2><p>Texto</p>`,
};
let http: Server;
let base: string;
beforeAll(async () => {
  http = httpServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end(
    `<!doctype html><html lang="pt-BR"><head><title>Página ${req.url}</title></head><body><main><h1>Página ${req.url}</h1>${PAGES[req.url ?? ""] ?? ""}</main></body></html>`,
  ));
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((done) => http.close(() => done())); resetKnowledgeLock(); });

async function connect(profile: "evaluation" | "knowledge-free" = "evaluation") {
  const server = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "fix376-")) });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: "fix376", version: "1" }); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>)[0].text;
    return { data: JSON.parse(text), text, isError: Boolean(r.isError) };
  };
  return { client, call };
}

describe("3.7.6 item 2 — token por parte × tabela de especificação", () => {
  it("o seletor da parte vem da folha oficial dentro de .br-<componente>, sem pseudo-elemento nem estado", () => {
    const sels = partSelectors(PART.component);
    expect(sels.length).toBeGreaterThan(0);
    for (const s of sels) {
      expect(s.selector).toMatch(new RegExp(`\\.br-${PART.component}(?![\\w-])`));
      expect(s.selector).not.toMatch(/::|:hover|:focus|:active/);
    }
  });

  const el = (over: Record<string, unknown>) => makeElement({ locator: "#p", classes: [], ...over } as never);
  it("desvio autoral: observação com a unidade da linha, o token e o valor; desempate pelos pares do mesmo elemento", () => {
    const r = comparePartTokens("http://x/", PART.component, [el({
      computed: { fontSize: ALL[OTHER], fontWeight: PART.weight ? ALL[PART.weight] : "400" },
      dsShipped: { fontSize: ["100%", `var(${PART.token})`], ...(PART.weight ? { fontWeight: [`var(${PART.weight})`] } : {}) },
      authored: { fontSize: [`var(${OTHER})`] },
    })]);
    expect(r.observations).toHaveLength(1);
    const o = r.observations[0];
    expect(o.kind).toBe(SPEC_PART_KIND);
    expect(o.data).toMatchObject({ component: PART.component, property: "font-size", token: PART.token, expected: ALL[PART.token], unitIds: [PART.row.id], specUnit: { id: PART.row.id, force: "especificacao" } });
    expect(o.note).toContain(PART.row.id);
  });

  it("sem declaração da página, valor de variante do DS, valor que a página não decidiu, fora da autoria: nada", () => {
    const cases = [
      { computed: { fontSize: ALL[OTHER] }, dsShipped: { fontSize: [`var(${PART.token})`] }, authored: {} },
      { computed: { fontSize: ALL[OTHER] }, dsShipped: { fontSize: [`var(${PART.token})`, `var(${OTHER})`] }, authored: { fontSize: [`var(${OTHER})`] } },
      { computed: { fontSize: "13px" }, dsShipped: { fontSize: [`var(${PART.token})`] }, authored: { fontSize: ["2em"] } },
      { computed: { fontSize: ALL[OTHER] }, dsShipped: { fontSize: [`var(${PART.token})`] }, authored: { fontSize: [`var(${OTHER})`] }, origin: "ds-web-component" },
      { computed: { fontSize: ALL[OTHER] }, dsShipped: { fontSize: [`var(${PART.token})`] }, authored: { fontSize: [`var(${OTHER})`] }, rendered: false },
    ];
    for (const c of cases) expect(comparePartTokens("http://x/", PART.component, [el(c)]).observations, JSON.stringify(c)).toEqual([]);
  });

  it("na página viva: o elemento com desvio vira observação; o conforme e o escopo por seletores, não", async () => {
    const desvio = await scanPage({ url: `${base}/desvio` }, new PageScanCache(1));
    if (desvio.status !== "scanned") throw new Error("estado");
    const obs = desvio.observations.filter((o) => o.kind === SPEC_PART_KIND);
    expect(obs.map((o) => o.element.locator)).toEqual(["#p1"]);
    expect(desvio.specParts?.measured).toBeGreaterThanOrEqual(2);
    expect(desvio.findings.some((f) => f.rule.checker?.includes("spec"))).toBe(false);
    const conforme = await scanPage({ url: `${base}/conforme` }, new PageScanCache(1));
    if (conforme.status !== "scanned") throw new Error("estado");
    expect(conforme.observations.filter((o) => o.kind === SPEC_PART_KIND)).toEqual([]);
    const escopo = await scanPage({ url: `${base}/desvio`, selectors: ["main"] }, new PageScanCache(1));
    if (escopo.status !== "scanned") throw new Error("estado");
    expect(escopo.observations.filter((o) => o.kind === SPEC_PART_KIND)).toEqual([]);
  }, 60_000);
});

describe("3.7.6 item 1 — a especificação por parte chega ao agente", () => {
  it("get_component_spec traz specification.measure (tipografia e cor primeiro), com a unidade e o valor do token", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("get_component_spec", { component: PART.component });
      const spec = r.data.rules.specification;
      expect(spec.measure.length).toBeGreaterThan(0);
      expect(spec.measure[0]).toMatch(/^govbr-\S+ · .+ · .+=/);
      expect(spec.measure.some((l: string) => l.startsWith(`${PART.row.id} · `) && l.includes(`${PART.token}=${ALL[PART.token]}`))).toBe(true);
      const kinds = measurableSpecRows(PART.component).slice(0, spec.measure.length).map((x) => x.kind);
      expect([...kinds].sort((a, b) => ["typography", "color", "other"].indexOf(a) - ["typography", "color", "other"].indexOf(b))).toEqual(kinds);
      expect(r.text.length).toBeLessThanOrEqual(8000);
    } finally { await client.close(); }
  });

  it("scan_page: bloco specification com o desvio medido (unidade) e a chamada do componente dele primeiro", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/desvio`, maxChars: 100000 });
      const sp = s.data.specification;
      expect(sp.components[0]).toBe(PART.component);
      expect(sp.off).toHaveLength(1);
      expect(sp.off[0]).toContain(PART.row.id);
      expect(sp.off[0]).toContain(`${ALL[OTHER]}≠${PART.token}`);
      expect(sp.next).toEqual({ tool: "get_component_spec", arguments: { component: PART.component } });
      expect(s.data.observations.byKind[SPEC_PART_KIND]).toBe(1);
    } finally { await client.close(); }
  }, 60_000);

  it("knowledge-free: sem bloco de especificação nem observação de parte", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      const s = await call("scan_page", { url: `${base}/desvio`, maxChars: 100000 });
      expect(s.data.specification).toBeUndefined();
      expect(s.text).not.toContain(SPEC_PART_KIND);
    } finally { await client.close(); }
  }, 60_000);

  it("formas curta e mínima: a chamada e os desvios ficam; nunca some", () => {
    const obs = [{ kind: SPEC_PART_KIND, element: { locator: "#a", page: "p" }, note: "", whyNotAFinding: "", data: { component: "c1", property: "font-size", observed: "14px", token: "--t", expected: "20px", unitIds: ["govbr-u1"] } }] as Observation[];
    const block = specificationFor(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"], (c) => (c === "c3" ? 0 : 2), obs)!;
    expect(block.components).toEqual(["c1", "c0", "c2", "c4", "c5", "c6", "c7"]);
    const short = specificationShort({ specification: block })!.specification as Record<string, unknown>;
    expect(short.note).toBeUndefined();
    expect(short.components).toBe("c1,c0,c2,c4,c5,c6 +1");
    expect(short.off).toEqual(block.off);
    const min = specificationMinimal({ specification: short })!.specification as Record<string, unknown>;
    expect(min).toEqual({ components: "c1,c0,c2 +4", off: ["govbr-u1 font-size 14px≠--t"], next: 'get_component_spec{component:"c1"} → specification.measure' });
    expect(specificationMinimal({ specification: min })).toBeNull();
    expect(specificationFor(["c3"], () => 0, [])).toBeUndefined();
  });

  it("nunca tira família da 1ª página: replays com o bloco no cabeçalho trazem as mesmas famílias, no teto", () => {
    const DIR = join(import.meta.dirname, "../fixtures/replay-3.6.1");
    const big = { note: "x".repeat(200), components: Array.from({ length: 12 }, (_, i) => `componente${i}`), more: 9, off: ["govbr-3.7.0-component-x-000000000000 font-size 14px≠--font-size-scale-up-02 (20.16px) ×2 @#um-localizador-longo"], next: { tool: "get_component_spec", arguments: { component: "componente0" } } };
    for (const name of ["a-p03-21", "b-p02-11", "b-p02-13"]) {
      for (const max of [3_000, 6_000, 8_000, 12_000]) {
        const d = JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8"));
        const run = (head: Record<string, unknown>) => assembleScan(head, d.observations, d.scanId, max, (budget) =>
          buildFamilyPage(d.findings, { ...d.args, maxChars: budget, stateFingerprint: d.stateFingerprint, verificationFor: () => undefined }), { firstScanPage: true });
        const without = run(d.head);
        const withSpec = run({ ...d.head, specification: big });
        const n = (r: Record<string, unknown>) => (Array.isArray(r.families) ? r.families.length : 0);
        expect(n(withSpec), `${name} @${max}`).toBeGreaterThanOrEqual(n(without));
        expect(textSize(withSpec), `${name} @${max}`).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe("3.7.6 item 3 — observação com norma obrigatória vira pendência O-NN", () => {
  const obs = (locator: string, force: string, id = "govbr-r1", kind = "k-off") => ({ kind, element: { locator, page: "http://h/p" }, note: "n", whyNotAFinding: "w", data: { property: "font-size", observed: "13px", relatedRule: { id, force } } }) as Observation;

  it("agrupa por (tipo, norma), só força que obriga/proíbe; espaço de ids próprio; os P-NN não mudam", () => {
    const items = observedRequiredItems([obs("#a", "required"), obs("#b", "required"), obs("#c", "recommended"), obs("#d", "prohibited", "govbr-r2"), { ...obs("#e", "required"), data: {} } as Observation]);
    expect(items.map((i) => [i.subject, i.count])).toEqual([["k-off|govbr-r1", 2], ["k-off|govbr-r2", 1]]);
    expect(items[0]).toMatchObject({ code: "observed-required", elementBound: true, boundLocators: ["#a", "#b"], norms: ["govbr-r1"], idSpace: "O" });
    const s = new ScanSession();
    const regular = { code: "table-name", subject: "t", todo: "t", measure: "m", norms: ["emag-3.9"] } as never;
    const [p] = s.registerPending("S-1", "http://h/p", [regular], () => ["#t"]);
    const o = s.registerPending("S-1", "http://h/p", items, (i) => i.boundLocators ?? []);
    const [p2] = s.registerPending("S-2", "http://h/q", [{ ...(regular as object), subject: "t2" } as never], () => ["#t2"]);
    expect([p.id, ...o.map((e) => e.id), p2.id]).toEqual(["P-01", "O-01", "O-02", "P-02"]);
  });

  it("fecha pelo verify em CADA elemento citando a norma; pendingResolved não fecha; a leitura da norma fecha", () => {
    const s = new ScanSession();
    const [e] = s.registerPending("S-1", "http://h/p", observedRequiredItems([obs("#a", "required"), obs("#b", "required")]), (i) => i.boundLocators ?? []);
    const f = (locator: string) => ({ id: "F", rule: { id: "govbr-r1", source: "govbr-ds" }, element: { page: "http://h/p", locator }, evidence: {} }) as never;
    expect(s.resolveByVerifyDetailed(f("#a"), "V-1", "unverifiable")).toMatchObject({ resolved: [], partial: [{ id: e.id, remaining: ["#b"] }] });
    const declared = s.resolveExplicit([{ id: e.id, status: "violada" }], "http://h/p");
    expect(declared.resolved).toEqual([]);
    expect(declared.readOrVerify).toEqual([e.id]);
    expect(e.status).toBe("open");
    expect(s.resolveByVerify(f("#b"), "V-2", "confirmed")).toEqual([e.id]);
    expect(e.status).toBe("resolved");
    const s2 = new ScanSession();
    const [e2] = s2.registerPending("S-1", "http://h/p", observedRequiredItems([obs("#a", "required")]), (i) => i.boundLocators ?? []);
    expect(s2.noteRead(["govbr-outra"])).toEqual([]);
    expect(s2.noteRead(["govbr-r1"])).toEqual([e2.id]);
    expect(e2.resolution).toMatchObject({ by: "rule-read" });
  });

  it("MCP: o 1º scan traz O-NN com o elemento, o valor e a cláusula; ler a norma fecha; o P-NN não muda", async () => {
    const { client, call } = await connect();
    try {
      const s1 = await call("scan_page", { url: `${base}/fonte`, maxChars: 100000 });
      const items = s1.data.checksRun.pageLevel.notMeasured as Array<{ code: string; pendingId: string; observed?: string; rule?: { id: string; force: string; text?: string }; examples?: string[] }>;
      const o = items.find((i) => i.code === "observed-required")!;
      expect(o.pendingId).toBe("O-01");
      expect(o.examples).toEqual(["#t1"]);
      expect(o.observed).toContain("13px");
      expect(o.rule).toMatchObject({ force: "required", text: expect.any(String) });
      expect(items.filter((i) => i.pendingId?.startsWith("P-")).map((i) => i.pendingId)).toEqual(items.filter((i) => i.pendingId?.startsWith("P-")).map((_, k) => `P-${String(k + 1).padStart(2, "0")}`));
      // a observação continua no ledger, com a mesma norma
      expect(s1.data.observations.byKind["token-font-size-off-scale"]).toBe(1);
      const declared = await call("scan_page", { url: `${base}/fonte`, maxChars: 100000, pendingResolved: [{ id: "O-01", status: "conforme", reason: "medi" }] });
      expect(declared.data.pendingResolution.readOrVerify).toEqual(["O-01"]);
      const read = await call("get_ds_rules", { ids: [o.rule!.id] });
      expect(read.isError).toBe(false);
      const s3 = await call("scan_page", { url: `${base}/fonte`, maxChars: 100000 });
      const again = (s3.data.checksRun.pageLevel.notMeasured as Array<{ code: string; pendingId: string; resolved?: unknown }>).find((i) => i.code === "observed-required")!;
      expect(again).toMatchObject({ pendingId: "O-01", resolved: "rule-read" });
    } finally { await client.close(); }
  }, 60_000);

  it("na forma de ids do teto, O-NN fica entre os ids da página", async () => {
    const { client, call } = await connect();
    try {
      for (const max of [5_000, 6_000]) {
        const s = await call("scan_page", { url: `${base}/fonte`, maxChars: max });
        expect(s.text.length).toBeLessThanOrEqual(max);
        expect(s.text).toContain("O-01");
      }
    } finally { await client.close(); }
  }, 60_000);
});
