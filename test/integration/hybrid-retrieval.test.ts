/**
 * NAT-107 (3.2.0): busca híbrida (léxica + vetorial local, RRF k=60), opcional — o padrão é léxico (D-149).
 *
 * - padrão léxico = 3.1.0 byte a byte (fixture capturada da a08c90e) e sem carregar o modelo;
 * - determinismo dos vetores; RRF com ordem exata num fixture;
 * - admissão só-vetorial: âncora na base (≥ 1 e ≥ metade dos termos) + cosseno SEM a pista de componente;
 * - vetores ausentes/indisponíveis → léxica com ranking.dense:"unavailable"; falha transitória tenta de novo uma vez;
 * - sem rede; knowledge-free intocado.
 *
 * Testes que precisam do modelo: com GOVBR_RETRIEVAL_REQUIRE_DENSE=1 ou CI, modelo ausente é FALHA;
 * fora disso, o arquivo avisa "SKIPPED: model files missing" e os pula (npm run models:fetch).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { RANKING_VERSION, rankRules } from "../../src/data/retrieval.js";
import { RRF_K, defaultRetrievalMode, kbAnchor, rankForQuery, rrfFuse } from "../../src/data/hybrid.js";
import {
  DENSE_LOAD_ATTEMPTS,
  MODELS_DIR,
  activeModelKey,
  denseLoadCalls,
  denseState,
  embedText,
  embeddingsPaths,
  getModelsManifest,
  resetDenseCache,
  setDenseLoaderForTests,
} from "../../src/data/embeddings.js";
import { activeKnowledgeVersion, availableKnowledgeVersions, getKnowledgeBase, useKnowledgeVersion } from "../../src/data/knowledge.js";
import { runKnowledgeLocked, resetKnowledgeLock } from "../../src/data/lock.js";

const key = activeModelKey();
const model = getModelsManifest().models[key];
const modelPresent = model.files.every((f) => existsSync(join(MODELS_DIR, model.id, f.path)));
const vectorsPresent = existsSync(embeddingsPaths(key, activeKnowledgeVersion()).bin);
const ready = modelPresent && vectorsPresent;
const mustHaveModel = (process.env.GOVBR_RETRIEVAL_REQUIRE_DENSE ?? "").trim() === "1" || Boolean(process.env.CI);
if (!ready && !mustHaveModel) console.warn(`SKIPPED: model files missing (${model.id}; npm run models:fetch) — testes do modelo pulados`);

async function connect(profile: string) {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")), toolProfile: profile as never, knowledgeLock: "call" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: "nat107", version: "0" });
  await client.connect(a);
  return client;
}
const call = async (client: Client, args: Record<string, unknown>) => {
  const r = await client.callTool({ name: "get_ds_rules", arguments: args });
  const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
  return { text, isError: Boolean(r.isError), data: JSON.parse(text) as Record<string, any> };
};

let client: Client;
beforeAll(async () => {
  client = await connect("evaluation");
});
afterAll(async () => {
  await client.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOVBR_RETRIEVAL_MODE;
  setDenseLoaderForTests(undefined);
});

describe("modelo presente quando exigido", () => {
  it.runIf(mustHaveModel)("GOVBR_RETRIEVAL_REQUIRE_DENSE=1 ou CI: arquivos do modelo e vetores existem", () => {
    expect({ modelPresent, vectorsPresent }).toEqual({ modelPresent: true, vectorsPresent: true });
  });
});

describe("padrão léxico (D-149) = 3.1.0 byte a byte", () => {
  it("sem retrieval nem GOVBR_RETRIEVAL_MODE: cada resposta igual à da 3.1.0 (fixture a08c90e), cursores incluídos", async () => {
    const fixture = JSON.parse(readFileSync(new URL("../fixtures/lexical-3.1.0-get-ds-rules.json", import.meta.url), "utf8")) as {
      steps: Array<{ args: Record<string, unknown>; cursorFrom?: number; isError: boolean; sha256: string }>;
    };
    const texts: string[] = [];
    for (const step of fixture.steps) {
      const args = step.cursorFrom !== undefined ? { ...step.args, cursor: JSON.parse(texts[step.cursorFrom]).page.cursor } : step.args;
      const r = await call(client, args);
      texts.push(r.text);
      expect({ args: step.args, isError: r.isError, sha256: createHash("sha256").update(r.text).digest("hex") }).toEqual({
        args: step.args,
        isError: step.isError,
        sha256: step.sha256,
      });
    }
  });

  it("o modelo não carrega no padrão léxico; retrieval:'lexical' explícito não é ecoado", async () => {
    expect(defaultRetrievalMode()).toBe("lexical");
    const before = denseLoadCalls();
    const c = await connect("evaluation");
    const a = await call(c, { query: "foco ao fechar o modal", component: "modal", limit: 2 });
    const b = await call(c, { query: "foco ao fechar o modal", component: "modal", limit: 2, retrieval: "lexical" });
    expect(denseLoadCalls()).toBe(before);
    expect(a.data.kb.ranking).toBe(RANKING_VERSION);
    expect(b.text).toBe(a.text);
    await c.close();
  });

  it("GOVBR_RETRIEVAL_REQUIRE_DENSE=1 só vale com hybrid/dense como padrão", async () => {
    const { startupChecks } = await import("../../src/server.js");
    process.env.GOVBR_RETRIEVAL_EMBEDDING_MODEL = "nao-existe";
    process.env.GOVBR_RETRIEVAL_REQUIRE_DENSE = "1";
    try {
      createServer({ toolProfile: "evaluation" });
      await expect(startupChecks()).resolves.toBeUndefined();
      process.env.GOVBR_RETRIEVAL_MODE = "hybrid";
      createServer({ toolProfile: "evaluation" });
      await expect(startupChecks()).rejects.toThrow(/GOVBR_RETRIEVAL_REQUIRE_DENSE=1.*nao-existe/);
      createServer({ toolProfile: "knowledge-free", knowledgeLock: "call" });
      await expect(startupChecks()).resolves.toBeUndefined();
    } finally {
      delete process.env.GOVBR_RETRIEVAL_EMBEDDING_MODEL;
      delete process.env.GOVBR_RETRIEVAL_REQUIRE_DENSE;
      delete process.env.GOVBR_RETRIEVAL_MODE;
      resetDenseCache();
    }
  });

  it("GOVBR_RETRIEVAL_MODE inválido falha na subida; retrieval sem query é erro de combinação", async () => {
    process.env.GOVBR_RETRIEVAL_MODE = "semantico";
    expect(() => defaultRetrievalMode()).toThrow(/GOVBR_RETRIEVAL_MODE/);
    expect(() => createServer({ toolProfile: "evaluation" })).toThrow(/GOVBR_RETRIEVAL_MODE/);
    delete process.env.GOVBR_RETRIEVAL_MODE;
    const noQuery = await call(client, { component: "button", retrieval: "dense" });
    expect(noQuery).toMatchObject({ isError: true, data: { errorCode: "invalid-combination", field: "retrieval" } });
    const literal = await call(client, { query: "foco", match: "literal", retrieval: "hybrid" });
    expect(literal.isError).toBe(true);
  });
});

describe("RRF (pura)", () => {
  it("ordem fundida exata num fixture: soma de 1/(60+posição), só-vetorial só se admitida, empate pelo desempate", () => {
    const order = ["a", "b", "c", "d", "e", "x", "y"];
    const tiebreak = (p: string, q: string) => order.indexOf(p) - order.indexOf(q);
    // a: 1/61 + 1/64 · b: 1/62 + 1/62 · c: 1/63 · d: 1/61 (admitida) · e: não admitida
    const fused = rrfFuse(["a", "b", "c"], ["d", "b", "e", "a"], (id) => id === "d", tiebreak);
    expect(fused.map((f) => [f.id, f.via])).toEqual([["b", "both"], ["a", "both"], ["d", "dense"], ["c", "lexical"]]);
    expect(fused[0].score).toBeCloseTo(2 / (RRF_K + 2), 12);
    expect(fused[1].score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 4), 12);
    // Empate (1/61 cada): decide o desempate (força → ordem da base no motor real).
    expect(rrfFuse(["y"], ["x"], () => true, tiebreak).map((f) => f.id)).toEqual(["x", "y"]);
  });
});

describe("âncora na base", () => {
  it("≥ 1 e ≥ metade dos termos de conteúdo na base", () => {
    expect(kbAnchor("xyzzy quux")).toMatchObject({ inKb: 0, anchored: false });
    expect(kbAnchor("xyzzy quux componente")).toMatchObject({ terms: 3, inKb: 1, anchored: false });
    expect(kbAnchor("futebol campeonato brasileiro").anchored).toBe(false);
    expect(kbAnchor("xyzzy foco")).toMatchObject({ terms: 2, inKb: 1, anchored: true });
    expect(kbAnchor("leitor de tela não anuncia o erro").anchored).toBe(true);
  });
});

describe.skipIf(!ready)("vetores locais e fusão", () => {
  it("o mesmo texto dá o mesmo vetor (bit a bit), normalizado", async () => {
    const a = await embedText(key, "o foco some ao fechar o modal", "query");
    const b = await embedText(key, "o foco some ao fechar o modal", "query");
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
    expect(a.length).toBe(model.dim);
    expect(Math.abs(a.reduce((s, x) => s + x * x, 0) - 1)).toBeLessThan(1e-4);
  });

  it("o vetor guardado de uma regra é o que o modelo dá para o texto dela (build reproduzível)", async () => {
    const state = await denseState();
    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;
    const { componentDisplayNames, passageText } = await import("../../src/data/embeddings.js");
    const kb = getKnowledgeBase();
    const rule = kb.rules[7];
    const v = await embedText(key, passageText(rule, componentDisplayNames(kb)), "passage");
    expect(Buffer.from(v.buffer).equals(Buffer.from(state.index.vectors.get(rule.id)!.slice().buffer))).toBe(true);
  });

  it("híbrida determinística; toda regra passou o piso léxico ou (âncora e cosseno sem pista ≥ limiar)", async () => {
    const input = { text: "o link da página atual não se distingue dos outros", component: "pagination" };
    const a = await rankForQuery(input, "hybrid");
    const b = await rankForQuery(input, "hybrid");
    expect(a.results.map((s) => [s.rule.id, s.score, s.via])).toEqual(b.results.map((s) => [s.rule.id, s.score, s.via]));
    expect(a.ranking).toMatchObject({ engine: "govbr-hybrid/1.0.0", dense: expect.stringMatching(new RegExp(`^${key}@`)), fusion: `rrf-k${RRF_K}-top50` });
    const lex = new Set(a.lexical.results.map((s) => s.rule.id));
    const qAdmit = await embedText(key, input.text, "query");
    const state = await denseState();
    if (state.status !== "ready") throw new Error("vetores");
    for (const s of a.results) {
      if (lex.has(s.rule.id)) expect(["lexical", "both"]).toContain(s.via);
      else {
        expect(s).toMatchObject({ denseOnly: true, via: "dense" });
        const cos = qAdmit.reduce((t, x, i) => t + x * state.index.vectors.get(s.rule.id)![i], 0);
        expect(cos).toBeGreaterThanOrEqual(model.threshold - 1e-6);
      }
    }
    for (let i = 1; i < a.results.length; i++) expect(a.results[i - 1].score).toBeGreaterThanOrEqual(a.results[i].score);
  });

  it("revisão (MEDIUM): os repros não ganham unidade só-vetorial pela pista de componente", async () => {
    for (const [args, mode] of [
      [{ query: "futebol campeonato brasileiro", component: "header" }, "hybrid"],
      [{ query: "xyzzy uso", component: "modal" }, "hybrid"],
      [{ query: "xyzzy quux componente", component: "modal" }, "dense"],
      [{ query: "xyzzy quux", component: "modal" }, "hybrid"],
    ] as const) {
      const r = await call(client, { ...args, retrieval: mode });
      for (const c of r.data.results) expect(c.why.via, JSON.stringify(args)).not.toBe("dense");
      // Sem só-vetoriais, a resposta é a do motor léxico (mesmas unidades); dense = ausência.
      const lexical = await call(client, args);
      expect(r.data.results.map((c: { citeAs: string }) => c.citeAs)).toEqual(mode === "dense" ? [] : lexical.data.results.map((c: { citeAs: string }) => c.citeAs));
    }
    for (const mode of ["hybrid", "dense"]) {
      const none = await call(client, { query: "xyzzy quux", component: "modal", retrieval: mode });
      expect(none.data).toMatchObject({ status: "no-match", results: [] });
      expect(none.data.absenceNote).toBeDefined();
      const dense = await call(client, { query: "xyzzy quux componente", component: "modal", retrieval: "dense" });
      expect(dense.data).toMatchObject({ status: "no-match", results: [] });
    }
  });

  it("pergunta real ancorada ainda admite unidade só-vetorial (why.via = 'dense')", async () => {
    const r = await call(client, { query: "leitor de tela não anuncia o erro", retrieval: "hybrid", limit: 10 });
    const dense = r.data.results.filter((c: { why: { via: string } }) => c.why.via === "dense");
    expect(dense.length).toBeGreaterThan(0);
    for (const c of dense) expect(c.why.matched.every((m: string) => m.startsWith("semelhança-vetorial:"))).toBe(true);
  });
});

describe("fallback: vetores indisponíveis → léxica, declarado", () => {
  it("base sem vetores: resultado = léxico, ranking.dense 'unavailable' com o motivo", async () => {
    const other = availableKnowledgeVersions().find((v) => v !== activeKnowledgeVersion() && !existsSync(embeddingsPaths(key, v).bin));
    expect(other).toBeDefined();
    useKnowledgeVersion(other!);
    resetDenseCache();
    try {
      const input = { text: "rótulo do campo de texto", component: "input" };
      const r = await rankForQuery(input, "hybrid");
      expect(r.ranking).toMatchObject({ engine: "govbr-hybrid/1.0.0", dense: "unavailable", denseNote: expect.stringContaining("vetores ausentes") });
      expect(r.results.map((s) => s.rule.id)).toEqual(rankRules(input).results.map((s) => s.rule.id));
    } finally {
      useKnowledgeVersion(undefined);
      resetDenseCache();
    }
  });

  it("falha transitória do runtime: unavailable com o aviso, uma nova tentativa na chamada seguinte, depois para", async () => {
    resetDenseCache();
    let calls = 0;
    setDenseLoaderForTests(async () => {
      calls += 1;
      return { status: "unavailable", reason: "falha ao carregar: simulada", model: "e5-small@test", transient: true };
    });
    const first = await denseState();
    expect(first).toMatchObject({ status: "unavailable", reason: expect.stringContaining(`tentativa 1/${DENSE_LOAD_ATTEMPTS}; nova tentativa na próxima chamada`) });
    const second = await denseState();
    expect(second).toMatchObject({ status: "unavailable", reason: expect.stringContaining(`tentativa 2/${DENSE_LOAD_ATTEMPTS}; sem nova tentativa`) });
    await denseState();
    await denseState();
    expect(calls).toBe(DENSE_LOAD_ATTEMPTS);
    const r = await rankForQuery({ text: "foco" }, "hybrid");
    expect(r.ranking).toMatchObject({ dense: "unavailable", denseNote: expect.stringContaining("sem nova tentativa") });
    setDenseLoaderForTests(undefined);
    resetDenseCache();
  });

  it("modelo desconhecido: unavailable, nunca lança", async () => {
    const state = await denseState("nao-existe");
    expect(state).toMatchObject({ status: "unavailable", reason: expect.stringContaining("não existe") });
    resetDenseCache();
  });
});

describe.skipIf(!ready)("sem rede", () => {
  it("carrega o modelo e embute com fetch bloqueado e remote models desligado", async () => {
    resetDenseCache();
    const fetchSpy = vi.fn(() => {
      throw new Error("rede proibida no teste");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const state = await denseState();
    expect(state.status).toBe("ready");
    const r = await rankForQuery({ text: "mensagem de erro do campo" }, "hybrid");
    expect(r.ranking).toMatchObject({ dense: expect.stringMatching(new RegExp(`^${key}@`)) });
    expect(fetchSpy).not.toHaveBeenCalled();
    const tf = await import("@huggingface/transformers");
    expect(tf.env.allowRemoteModels).toBe(false);
  });
});

describe("knowledge-free intocado", () => {
  it("tools/list sem retrieval nem menção a vetores; os vetores não carregam sob a trava", async () => {
    const kf = await connect("knowledge-free");
    const raw = JSON.stringify((await kf.listTools()).tools);
    for (const term of ["retrieval", "hybrid", "embedding", "vetorial", "dense"]) expect(raw).not.toContain(term);
    await kf.close();
    resetDenseCache();
    const state = await runKnowledgeLocked(() => denseState());
    expect(state).toMatchObject({ status: "unavailable", reason: expect.stringContaining("knowledge-free") });
    expect(state.status === "unavailable" && state.transient).toBeFalsy();
    resetDenseCache();
    resetKnowledgeLock();
  });
});
