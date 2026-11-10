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
import { CHECK_GROUNDING } from "../../src/checkers/grounding.js";
import { resolvePage } from "../../src/checkers/specPartTokens.js";

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
/** A norma que o check de tamanho de fonte cita (lida do próprio dado do check, não escrita aqui). */
function observedRuleId(): string {
  const id = CHECK_GROUNDING["token-font-size"].relatedRule?.id;
  if (!id) throw new Error("sem norma relacionada ao tamanho de fonte");
  return id;
}

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
  "/rem": `<style>${tokensCss}${dsCss} #r1{font-size:${parseFloat(ALL[OTHER]) / 16}rem} #r2{font-size:${parseFloat(ALL[PART.token]) / 16}rem}</style>${markupFor(PART.selector, "Rótulo", "r1")}${markupFor(PART.selector, "Outro", "r2")}`,
  "/fonte": `<style>.t{font-size:13px}</style><h2 id="t1" class="t">Seção</h2><p>Texto</p>`,
  "/escala": `<style>#off{font-size:13px} #on{font-size:16.8px}</style><h2 id="off">Fora</h2><h2 id="on">Num passo</h2>`,
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

  it("pre.2: valor da página em rem/em/%/inherit resolve pela raiz/pai; variável da página segue sem resolver", () => {
    const ctx = { rootPx: 16, parentPx: 20 };
    expect(resolvePage("0.875rem", "fontSize", ALL, ctx)).toBeCloseTo(14);
    expect(resolvePage("0.7em", "fontSize", ALL, ctx)).toBeCloseTo(14);
    expect(resolvePage("70%", "fontSize", ALL, ctx)).toBeCloseTo(14);
    expect(resolvePage("inherit", "fontSize", ALL, ctx)).toBe(20);
    expect(resolvePage("var(--minha-fonte)", "fontSize", ALL, ctx)).toBeNull();
    expect(resolvePage("1rem", "fontSize", ALL)).toBeNull();
    const target = parseFloat(ALL[OTHER]);
    const r = comparePartTokens("http://x/", PART.component, [el({
      computed: { fontSize: `${target}px` },
      dsShipped: { fontSize: [`var(${PART.token})`] },
      authored: { fontSize: [`${target / 16}rem`] },
    })], undefined, new Map([["#p", { rootPx: 16, parentPx: 16 }]]));
    expect(r.observations).toHaveLength(1);
    // o mesmo valor do token escrito em rem não é desvio (dentro de 0,5px)
    const ok = comparePartTokens("http://x/", PART.component, [el({
      computed: { fontSize: ALL[PART.token] },
      dsShipped: { fontSize: [`var(${PART.token})`] },
      authored: { fontSize: [`${parseFloat(ALL[PART.token]) / 16}rem`] },
    })], undefined, new Map([["#p", { rootPx: 16, parentPx: 16 }]]));
    expect(ok.observations).toEqual([]);
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
    // pre.2: o desvio escrito em rem também conta; o valor do token escrito em rem, não
    const rem = await scanPage({ url: `${base}/rem` }, new PageScanCache(1));
    if (rem.status !== "scanned") throw new Error("estado");
    expect(rem.observations.filter((o) => o.kind === SPEC_PART_KIND).map((o) => o.element.locator)).toEqual(["#r1"]);
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
    // 3.7.7 (D1): a condição do verify fica até a forma mínima
    expect(min).toEqual({ components: "c1,c0,c2 +4", off: ["govbr-u1 font-size 14px≠--t"], offVerify: "expectedCondition part-value-matches-spec-token", next: 'get_component_spec{component:"c1"} → specification.measure' });
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

  it("pre.2: fecha só pelo verify que DECIDE cada elemento; unverifiable e pendingResolved não fecham", () => {
    const s = new ScanSession();
    const [e] = s.registerPending("S-1", "http://h/p", observedRequiredItems([obs("#a", "required"), obs("#b", "required")]), (i) => i.boundLocators ?? []);
    const f = (locator: string) => ({ id: "F", rule: { id: "govbr-r1", source: "govbr-ds" }, element: { page: "http://h/p", locator }, evidence: {} }) as never;
    // unverifiable não decide o elemento
    expect(s.resolveByVerifyDetailed(f("#a"), "V-0", "unverifiable")).toEqual({ resolved: [], partial: [] });
    expect(s.resolveByVerifyDetailed(f("#a"), "V-1", "rejected")).toMatchObject({ resolved: [], partial: [{ id: e.id, remaining: ["#b"] }] });
    const declared = s.resolveExplicit([{ id: e.id, status: "violada" }], "http://h/p");
    expect(declared.resolved).toEqual([]);
    expect(declared.readOrVerify).toEqual([e.id]);
    expect(e.status).toBe("open");
    expect(s.resolveByVerify(f("#b"), "V-2", "confirmed")).toEqual([e.id]);
    expect(e.status).toBe("resolved");
  });

  it("pre.2: a leitura por id fecha só DEPOIS da entrega; leitura anterior e leitura geral (busca) não fecham", () => {
    const s = new ScanSession();
    // leitura por id ANTES de a pendência existir/ser entregue
    expect(s.noteReadById(["govbr-r1"])).toEqual([]);
    s.noteRead(["govbr-r1"]); // leitura de busca/listagem (o caminho do L-NN): não toca a O-NN
    const [e] = s.registerPending("S-1", "http://h/p", observedRequiredItems([obs("#a", "required")]), (i) => i.boundLocators ?? []);
    expect(e.status).toBe("open");
    // registrada mas ainda não entregue: a leitura por id não fecha
    expect(s.noteReadById(["govbr-r1"])).toEqual([]);
    s.markObservedDelivered([e.id]);
    expect(s.noteReadById(["govbr-outra"])).toEqual([]);
    s.noteRead(["govbr-r1"]);
    expect(e.status).toBe("open");
    expect(s.noteReadById(["govbr-r1"])).toEqual([e.id]);
    expect(e.resolution).toMatchObject({ by: "rule-read" });
    // outra O-NN (outro elemento) nasce aberta mesmo com a norma já lida por id
    const [e2] = s.registerPending("S-2", "http://h/q", observedRequiredItems([obs("#z", "required")]), (i) => i.boundLocators ?? []);
    expect(e2.id).not.toBe(e.id);
    expect(e2.status).toBe("open");
  });

  it("pre.2 MCP (repro da revisão): busca que devolve a norma antes do scan não fecha; ler por id depois da entrega fecha", async () => {
    const { client, call } = await connect();
    try {
      const rule = observedRuleId();
      // busca e leitura por id ANTES do scan
      const search = await call("get_ds_rules", { query: "font-size 16px fora da escala" });
      expect(search.text).toContain(rule); // a busca devolve a norma (o caso da revisão)
      await call("get_ds_rules", { ids: [rule] });
      const s1 = await call("scan_page", { url: `${base}/fonte`, maxChars: 100000 });
      const o = (s1.data.checksRun.pageLevel.notMeasured as Array<{ code: string; pendingId: string; resolved?: unknown }>).find((i) => i.code === "observed-required")!;
      expect(o.pendingId).toBe("O-01");
      expect(o.resolved).toBeUndefined();
      // busca DEPOIS da entrega também não fecha
      await call("get_ds_rules", { query: "font-size 16px fora da escala" });
      const s2 = await call("scan_page", { url: `${base}/fonte`, maxChars: 100000 });
      expect((s2.data.checksRun.pageLevel.notMeasured as Array<{ code: string; resolved?: unknown }>).find((i) => i.code === "observed-required")!.resolved).toBeUndefined();
      await call("get_ds_rules", { ids: [rule] });
      const s3 = await call("scan_page", { url: `${base}/fonte`, maxChars: 100000 });
      expect((s3.data.checksRun.pageLevel.notMeasured as Array<{ code: string; resolved?: unknown }>).find((i) => i.code === "observed-required")).toMatchObject({ resolved: "rule-read" });
    } finally { await client.close(); }
  }, 60_000);

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

describe("3.7.7 (teste à mão da 3.7.6, D1) — o verify decide a escala e o token por parte", () => {
  const SCALE = "font-size-on-ds-scale";
  const PART_COND = "part-value-matches-spec-token";
  const finding = (url: string, locator: string, rule: { source: string; id: string }, data: Record<string, unknown>) => ({
    id: "F-agent", element: { locator, page: url }, severity: "minor", nature: "syntactic", mode: "display", pathway: "heuristic",
    rule: { ...rule, description: "x" }, evidence: { observed: "medido", expected: "esperado", data },
  });

  it("escala: fora do passo → confirmed e fecha a O-NN; num passo → rejected; sem elemento → unverifiable", async () => {
    const { client, call } = await connect();
    try {
      const rule = observedRuleId();
      const scan = await call("scan_page", { url: `${base}/escala`, maxChars: 100000 });
      const o = (scan.data.checksRun.pageLevel.notMeasured as Array<{ code: string; pendingId: string; todo: string; measure: string }>).find((i) => i.code === "observed-required")!;
      // a condição exata está na tarefa (nos 72 primeiros caracteres) e no measure
      expect(o.todo.slice(0, 72)).toContain(`expectedCondition ${SCALE}`);
      expect(o.measure).toContain(SCALE);
      const kb = { source: "govbr-ds-kb", id: rule };
      const off = await call("verify_finding", { finding: finding(`${base}/escala`, "#off", kb, { property: "font-size", observed: "13px", expectedCondition: SCALE }), live: true, scanId: scan.data.scanId });
      expect(off.data.verdict).toBe("confirmed");
      expect(off.data.verification.predicate).toBe("font-size-scale");
      expect(off.data.verification.pendingResolved ?? off.data.pendingResolved).toEqual([o.pendingId]);
      const on = await call("verify_finding", { finding: finding(`${base}/escala`, "#on", kb, { property: "font-size", expectedCondition: SCALE }), live: true, scanId: scan.data.scanId });
      expect(on.data.verdict).toBe("rejected");
      const none = await call("verify_finding", { finding: finding(`${base}/escala`, "#nao-existe", kb, { property: "font-size", expectedCondition: SCALE }), live: true, scanId: scan.data.scanId });
      expect(none.data.verdict).toBe("unverifiable");
      // sem a condição: o próximo passo nomeia a condição e mantém a norma — nunca "rule: null"
      const bare = await call("verify_finding", { finding: finding(`${base}/escala`, "#off", kb, { property: "font-size", observed: "13px" }), live: true, scanId: scan.data.scanId });
      expect(bare.data.verdict).toBe("unverifiable");
      const actions = JSON.stringify(bare.data.actions);
      expect(actions).toContain(SCALE);
      expect(actions).not.toContain("rule: null");
      // outra norma com a condição não seleciona o predicado
      const other = await call("verify_finding", { finding: finding(`${base}/escala`, "#off", { source: "wcag", id: "1.4.4" }, { property: "font-size", expectedCondition: SCALE }), live: true, scanId: scan.data.scanId });
      expect(other.data.verification.predicate).toBeNull();
    } finally { await client.close(); }
  }, 90_000);

  it("token por parte: difere → confirmed (com o aviso de força); igual → rejected; elemento que não é a parte → unverifiable", async () => {
    const { client, call } = await connect();
    try {
      const unit = { source: "govbr-ds-kb", id: PART.row.id };
      const scan = await call("scan_page", { url: `${base}/desvio`, maxChars: 100000 });
      expect(scan.data.specification.offVerify).toContain(PART_COND);
      const obs = await call("get_finding_details", { scanId: scan.data.scanId, view: "observations", cursor: 0, maxChars: 100000 });
      const part = (obs.data.observations as Array<{ kind: string; data: Record<string, unknown> }>).find((x) => x.kind === SPEC_PART_KIND)!;
      expect(part.data.expectedCondition).toBe(PART_COND);
      const off = await call("verify_finding", { finding: finding(`${base}/desvio`, "#p1", unit, { property: "font-size", observed: ALL[OTHER], expectedCondition: PART_COND }), live: true, scanId: scan.data.scanId });
      expect(off.data.verdict).toBe("confirmed");
      expect(off.data.verification.predicate).toBe("spec-part-token");
      expect(off.data.citationForce).toMatchObject({ force: "especificacao" });
      const eq = await call("verify_finding", { finding: finding(`${base}/desvio`, "#p2", unit, { property: "font-size", expectedCondition: PART_COND }), live: true, scanId: scan.data.scanId });
      expect(eq.data.verdict).toBe("rejected");
      const notPart = await call("verify_finding", { finding: finding(`${base}/desvio`, "main > h1", unit, { property: "font-size", expectedCondition: PART_COND }), live: true, scanId: scan.data.scanId });
      expect(notPart.data.verdict).toBe("unverifiable");
      expect(notPart.data.verification.checks.applicability).toBe("not-applicable");
      const bare = await call("verify_finding", { finding: finding(`${base}/desvio`, "#p1", unit, { property: "font-size", observed: ALL[OTHER] }), live: true, scanId: scan.data.scanId });
      expect(JSON.stringify(bare.data.actions)).toContain(PART_COND);
      expect(JSON.stringify(bare.data.actions)).not.toContain("rule: null");
    } finally { await client.close(); }
  }, 90_000);

  it("knowledge-free: as condições novas não selecionam predicado nem vazam texto da base", async () => {
    const { client, call } = await connect("knowledge-free");
    try {
      for (const [cond, id] of [[SCALE, observedRuleId()], [PART_COND, PART.row.id]] as const) {
        const r = await call("verify_finding", { finding: finding(`${base}/escala`, "#off", { source: "govbr-ds-kb", id }, { property: "font-size", expectedCondition: cond }), live: true });
        expect(r.data.verdict).not.toBe("confirmed");
        expect(r.text).not.toMatch(/Minor Third|especificacao|font-size-scale-up|nenhuma fonte deve/);
      }
    } finally { await client.close(); }
  }, 90_000);
});
