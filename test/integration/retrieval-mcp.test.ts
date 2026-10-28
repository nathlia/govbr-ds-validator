/**
 * NAT-97 (2.17.0) through MCP: get_ds_rules{query} ranks by relevance with the same listing shape,
 * match:"literal" keeps 2.16.1, component goes through the name resolver (B-05), evidence obeys the
 * engine and limit (B-07), the floor and the engine version are declared.
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
const call = async (args: Record<string, unknown>) => {
  const r = await client.callTool({ name: "get_ds_rules", arguments: args });
  return JSON.parse((r.content as Array<{ text: string }>).map((c) => c.text).join("")) as Record<string, any>;
};

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

describe("get_ds_rules{query} — relevance (2.17.0)", () => {
  it("keeps the listing shape and declares engine, weights, floor and vocabulary", async () => {
    const r = await call({ query: "foco ao fechar o modal", component: "modal", limit: 3 });
    expect(r.rules.length).toBeGreaterThan(0);
    expect(r.rules.length).toBeLessThanOrEqual(3);
    expect(r.rules[0]).toEqual(expect.objectContaining({ id: expect.any(String), force: expect.any(String), relevance: expect.any(Object) }));
    expect(r.meta.ranking).toMatchObject({ engine: RANKING_VERSION, vocabulary: "vocab-1.0.0", floor: expect.any(Object), weights: expect.any(Object) });
    expect(r.retrieval).toMatchObject({ mode: "relevance", componentHint: "modal", globalsAllowed: true });
    expect(r.total).toBeGreaterThanOrEqual(r.count);
    expect(JSON.stringify(r)).not.toMatch(/"(applicable|verified|conforme|violation)"/);
  });

  it("is stable for the same input + version + cursor, and the cursor walks without repeats", async () => {
    const a = await call({ query: "rótulo associado ao campo", limit: 4 });
    const b = await call({ query: "rótulo associado ao campo", limit: 4 });
    expect(a).toEqual(b);
    if (a.more) {
      const next = await call({ query: "rótulo associado ao campo", limit: 4, offset: a.more.nextOffset });
      const seen = new Set(a.rules.map((x: { id: string }) => x.id));
      expect(next.rules.some((x: { id: string }) => seen.has(x.id))).toBe(false);
      expect(a.retrieval.stop).toBe("limit");
    }
  });

  it("stops at the declared floor and answers an unknown question honestly with next steps", async () => {
    const all = await call({ query: "foco ao fechar o modal", component: "modal", limit: 50 });
    expect(all.retrieval.stop).toBe("relevance-floor");
    expect(all.retrieval.belowFloor).toBeGreaterThan(0);
    const none = await call({ query: "xyzzy quux", component: "modal" });
    expect(none).toMatchObject({ total: 0, rules: [], absenceNote: ABSENCE_NOTE });
    expect(none.retrieval).toMatchObject({ stop: "no-match", unmatchedTerms: ["quux", "xyzzy"] });
    expect(none.next).toEqual(expect.arrayContaining([{ tool: "get_component_spec", arguments: { component: "modal" } }]));
  });

  it("vocabulary:false switches the expansions off and says so", async () => {
    const on = await call({ query: "label" });
    const off = await call({ query: "label", vocabulary: false });
    expect(on.retrieval.expansions.length).toBeGreaterThan(0);
    expect(off.retrieval.expansions).toEqual([]);
    expect(off.meta.ranking.vocabulary).toBe("off");
  });

  it("match:'literal' keeps the 2.16.1 semantics (whole-phrase substring, accent-sensitive, exact component)", async () => {
    expect((await call({ query: "navegacao  por teclado", match: "literal" })).total).toBe(0);
    expect((await call({ query: "navegacao  por teclado" })).total).toBeGreaterThan(0);
    const lit = await call({ query: "aria-current", component: "pagination", match: "literal" });
    expect(lit.total).toBe(0);
    expect(lit.retrieval).toBeUndefined();
    expect((await call({ query: "aria-current", component: "pagination" })).total).toBeGreaterThan(0);
  });

  it("B-05: component variants resolve as in context; an unknown name is an input error with suggestions", async () => {
    const a = await call({ query: "foco", component: "Modal" });
    const b = await call({ query: "foco", component: "br-modal" });
    const c = await call({ query: "foco", component: "modal" });
    expect(a.rules).toEqual(c.rules);
    expect(b.rules).toEqual(c.rules);
    const bad = await call({ query: "foco", component: "tooltipp" });
    expect(bad).toMatchObject({ errorCode: "unknown-component", didYouMean: ["tooltip"] });
    expect(bad.total).toBeUndefined();
    const pt = await call({ query: "foco", component: "Paginação" });
    expect(pt.didYouMean).toEqual(["pagination"]);
  });

  it("B-07: include_evidence follows the same engine, hint and limit", async () => {
    const r = await call({ include_evidence: true, query: "foco", limit: 1 });
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
    // Without literal, the same shapes go through the engine and say so.
    const ranked = await call(snapshot.shapes[1].args);
    expect(ranked.meta.ranking).toMatchObject({ engine: RANKING_VERSION, match: "relevance" });
  });

  it("a query is bounded and must carry content words (actionable input errors)", async () => {
    const long = await call({ query: "foco ".repeat(200) });
    expect(long).toMatchObject({ errorCode: "query-too-long", field: "query", maxChars: 500 });
    expect(long.next.length).toBeGreaterThan(0);
    for (const query of ["a de que", "não", "?!"]) {
      const r = await call({ query });
      expect(r).toMatchObject({ errorCode: "no-content-terms", field: "query" });
      expect(r.absenceNote).toBeUndefined();
    }
    const bad = await call({ component: "" });
    expect(bad.errorCode).toBe("unknown-component");
  });
});
