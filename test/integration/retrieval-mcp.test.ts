/**
 * NAT-97 (2.17.0) → NAT-99 (3.0.0) through MCP: get_ds_rules{query} ranks by relevance (engine
 * unchanged) and answers in the `oraculo-resposta/1.0.0` envelope; match:"literal" keeps 2.16.1,
 * component goes through the name resolver (B-05), evidence obeys the engine and limit (B-07), the
 * floor and the engine version are declared.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { ABSENCE_NOTE } from "../../src/responses/absence.js";
import { RANKING_VERSION } from "../../src/data/retrieval.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

let client: Client;
const raw = async (args: Record<string, unknown>) => {
  const r = await client.callTool({ name: "get_ds_rules", arguments: args });
  return { text: (r.content as Array<{ text: string }>).map((c) => c.text).join(""), isError: Boolean(r.isError) };
};
const call = async (args: Record<string, unknown>) => JSON.parse((await raw(args)).text) as Record<string, any>;

beforeAll(async () => {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")), toolProfile: "evaluation" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  client = new Client({ name: "nat97", version: "0" });
  await client.connect(a);
});
afterAll(async () => {
  await client.close();
});

describe("get_ds_rules{query} — relevance (2.17.0 engine, 3.0.0 envelope)", () => {
  it("answers in the retrieval envelope and declares engine, vocabulary and the hint", async () => {
    const r = await call({ query: "foco ao fechar o modal", component: "modal", limit: 3 });
    expect(r).toMatchObject({ contract: "oraculo-resposta/1.0.0", kind: "retrieval" });
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.length).toBeLessThanOrEqual(3);
    expect(r.results[0]).toEqual(expect.objectContaining({ ids: expect.any(Array), citeAs: expect.any(String), force: expect.any(String), status: "investigate", applicability: "unknown" }));
    expect(r.kb).toMatchObject({ ranking: RANKING_VERSION, vocabulary: "vocab-1.1.0" });
    expect(r.query).toMatchObject({ componentHint: "modal", globalsAllowed: true });
    expect(r.page.matched).toBeGreaterThanOrEqual(r.page.returned);
    expect(JSON.stringify(r)).not.toMatch(/"(applicable|verified|conforme|violation)"/);
  });

  it("is stable for the same input + version + cursor, and the cursor walks without repeats or jumps", async () => {
    const a = await call({ query: "foco", component: "modal", limit: 4 });
    const b = await call({ query: "foco", component: "modal", limit: 4 });
    expect(a).toEqual(b);
    expect(a.page.cursor).toMatch(/^c1\./);
    expect(a.page.stop).toBe("limit");
    const next = await call({ query: "foco", component: "modal", limit: 4, cursor: a.page.cursor });
    const seen = new Set(a.results.flatMap((x: { ids: string[] }) => x.ids));
    expect(next.results.some((x: { ids: string[] }) => x.ids.some((id) => seen.has(id)))).toBe(false);
    expect(next.results[0].rank).toBe(a.results.length + 1);
    // The cursor is bound to the query: reused elsewhere it is stale, never silently reinterpreted.
    const stale = await raw({ query: "foco", cursor: a.page.cursor });
    expect(stale.isError).toBe(true);
    expect(JSON.parse(stale.text)).toMatchObject({ errorCode: "stale-cursor", next: [expect.objectContaining({ tool: "get_ds_rules", arguments: { query: "foco" } })] });
    // Legacy offset is accepted until 4.0.0, with a deprecation notice; with a cursor it is ignored.
    const legacy = await call({ query: "foco", component: "modal", limit: 4, offset: 4 });
    expect(legacy.results.map((x: { citeAs: string }) => x.citeAs)).toEqual(next.results.map((x: { citeAs: string }) => x.citeAs));
    expect(legacy.deprecation).toContain("4.0.0");
  });

  it("stops at the declared floor and answers an unknown question honestly with next steps", async () => {
    const all = await call({ query: "foco ao fechar o modal", component: "modal", limit: 10 });
    expect(["relevance-floor", "limit", "budget"]).toContain(all.page.stop);
    const none = await call({ query: "xyzzy quux", component: "modal" });
    expect(none).toMatchObject({ status: "no-match", results: [], absenceNote: ABSENCE_NOTE });
    expect(none.page).toMatchObject({ stop: "no-match", cursor: null, returned: 0 });
    expect(none.query.unmatchedTerms).toEqual(["quux", "xyzzy"]);
    expect(none.gaps).toEqual([expect.objectContaining({ kind: "unmatched-terms" })]);
    expect(none.next).toEqual(expect.arrayContaining([expect.objectContaining({ tool: "get_component_spec", arguments: { component: "modal" } })]));
    expect(none.next.length).toBeLessThanOrEqual(3);
  });

  it("vocabulary:false switches the expansions off and says so", async () => {
    const on = await call({ query: "label" });
    const off = await call({ query: "label", vocabulary: false });
    expect(on.query.expansions.length).toBeGreaterThan(0);
    expect(off.query.expansions).toEqual([]);
    expect(off.kb.vocabulary).toBe("off");
    expect(off.kb.guidance).toBe("off");
  });

  it("match:'literal' keeps the 2.16.1 semantics (whole-phrase substring, accent-sensitive, exact component)", async () => {
    expect((await call({ query: "navegacao  por teclado", match: "literal" })).total).toBe(0);
    expect((await call({ query: "navegacao  por teclado" })).page.matched).toBeGreaterThan(0);
    const lit = await call({ query: "aria-current", component: "pagination", match: "literal" });
    expect(lit.total).toBe(0);
    expect(lit.retrieval).toBeUndefined();
    expect((await call({ query: "aria-current", component: "pagination" })).page.matched).toBeGreaterThan(0);
    // literal is the 2.x path: no cursor there.
    expect((await raw({ query: "foco", match: "literal", cursor: "c1.0.0123456789" })).isError).toBe(true);
  });

  it("B-05: component variants resolve as in context; an unknown name is an input error with suggestions", async () => {
    const a = await call({ query: "foco", component: "Modal" });
    const b = await call({ query: "foco", component: "br-modal" });
    const c = await call({ query: "foco", component: "modal" });
    expect(a.results).toEqual(c.results);
    expect(b.results).toEqual(c.results);
    const bad = await raw({ query: "foco", component: "tooltipp" });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.text)).toMatchObject({ errorCode: "unknown-component", didYouMean: ["tooltip"] });
    // 3.3.0 (B-11): o nome em português da própria página oficial resolve.
    const pt = await call({ query: "foco", component: "Paginação" });
    expect(pt.query.componentHint).toBe("pagination");
  });

  it("component:'global' filters rules without a component", async () => {
    const g = await call({ query: "foco", component: "global" });
    expect(g.query).toMatchObject({ componentFilter: "global", componentHint: null });
    expect(g.status).not.toBe("ambiguous");
    expect(g.results.length).toBeGreaterThan(0);
    for (const card of g.results) expect(card.why.relation).toBe("global");
  });

  it("B-07: include_evidence follows the same engine, hint and limit", async () => {
    const r = await call({ include_evidence: true, query: "foco", component: "modal", limit: 1 });
    expect(r.evidence.count).toBeLessThanOrEqual(1);
    const byComponent = await call({ include_evidence: true, query: "botão", component: "button", limit: 3 });
    expect(byComponent.evidence.items.every((e: { component: string }) => e.component === "button")).toBe(true);
    expect(byComponent.evidence.count).toBeLessThanOrEqual(3);
  });

  it("match:'literal' with context is the 2.16.1 context path byte for byte (snapshot from bbc9d56)", async () => {
    const snapshot = JSON.parse(readFileSync(new URL("../fixtures/legacy-context-2.16.1.json", import.meta.url), "utf8"));
    expect(snapshot.shapes.length).toBeGreaterThanOrEqual(7);
    for (const shape of snapshot.shapes) {
      const r = await client.callTool({ name: "get_ds_rules", arguments: { ...shape.args, match: "literal" } });
      const text = (r.content as Array<{ text: string }>).map((c) => c.text).join(String.fromCharCode(10));
      expect(createHash("sha256").update(text).digest("hex"), JSON.stringify(shape.args)).toBe(shape.sha256);
    }
    // Without literal, the same shapes go through the engine and the 3.0.0 envelope.
    const ranked = await call(snapshot.shapes[1].args);
    expect(ranked).toMatchObject({ kind: "retrieval", kb: { ranking: RANKING_VERSION } });
  });

  it("a query is bounded and must carry content words (actionable input errors)", async () => {
    const long = await raw({ query: "foco ".repeat(200) });
    expect(long.isError).toBe(true);
    expect(JSON.parse(long.text)).toMatchObject({ errorCode: "query-too-long", field: "query", maxChars: 500 });
    expect(JSON.parse(long.text).next.length).toBeGreaterThan(0);
    for (const query of ["a de que", "não", "?!"]) {
      const r = await call({ query });
      expect(r).toMatchObject({ errorCode: "no-content-terms", field: "query" });
      expect(r.absenceNote).toBeUndefined();
    }
    const bad = await call({ component: "" });
    expect(bad.errorCode).toBe("unknown-component");
  });
});
