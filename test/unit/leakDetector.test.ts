/**
 * O detector de vazamento (scripts/lib/vazamento.ts) precisa disparar: testes de falha deliberada.
 * Um detector que nunca acha nada não prova ausência de vazamento (Codex #4, NAT-61).
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { buildDictionary, scanResponse, DictionaryBuilder, type Dictionary } from "../../scripts/lib/vazamento.js";

const ROOT = join(import.meta.dirname, "..", "..");
const dict: Dictionary = buildDictionary(ROOT, { checkIds: ["ds-page-footer", "ds-token-color"] });
const pick = (source: string, kind: "exact" | "phrase") =>
  [...(kind === "exact" ? dict.exact : dict.phrases).values()].find((t) => t.source === source)!.term;
const scan = (payload: unknown, args: unknown = {}, page: string | null = null) =>
  scanResponse(dict, JSON.stringify(payload), { args: JSON.stringify(args), page, axe: "axe bundle: Images must have alternate text" }).hits;

describe("dicionário gerado do data/", () => {
  it("cobre ids, títulos e trechos da base, tokens, classes, e-MAG, conflitos e termos fixos", () => {
    for (const source of ["kb:id", "kb:title", "kb:normalizedRule", "kb:originalText", "tokens:name", "specs:rootClass", "emag:title", "emag:description", "kb:conflicts", "checks:id", "tools:retired", "fixed"]) {
      expect(dict.counts[source] ?? 0, source).toBeGreaterThan(0);
    }
    expect(dict.exact.size).toBeGreaterThan(3000);
  });
});

describe("falhas deliberadas", () => {
  it("título da base, id da base, trecho de regra, nome de token e título e-MAG num campo do servidor disparam", () => {
    const samples = [
      pick("kb:title", "phrase"),
      pick("kb:id", "exact"),
      pick("kb:normalizedRule", "phrase"),
      pick("tokens:name", "exact"),
      pick("emag:title", "phrase"),
      "Template Base",
      "get_ds_rules",
    ];
    for (const sample of samples) {
      const hits = scan({ note: `texto do servidor: ${sample}.` });
      expect(hits.length, sample).toBeGreaterThan(0);
      expect(hits.every((h) => h.class === "sem-explicacao"), sample).toBe(true);
    }
  });

  it("a anotação e-MAG do axe (sufixo na descrição) dispara mesmo num campo da saída do axe", () => {
    const title = pick("emag:title", "phrase");
    const hits = scan({ rule: { id: "image-alt", description: `Images must have alternate text (e-MAG 3.6: ${title})` } });
    expect(hits.some((h) => h.class === "sem-explicacao")).toBe(true);
  });

  it("termo da página só é perdoado em campo de página E se estiver na página", () => {
    const token = pick("tokens:name", "exact");
    const page = `<div style="color: var(${token})"></div>`;
    expect(scan({ element: { snippet: `<i style="color: var(${token})">` } }, {}, page)[0].class).toBe("pagina");
    expect(scan({ element: { snippet: `<i style="color: var(${token})">` } }, {}, "<html></html>")[0].class).toBe("sem-explicacao");
    expect(scan({ note: `use ${token}` }, {}, page)[0].class).toBe("sem-explicacao");
  });

  it("eco: o id que o chamador enviou não conta como enriquecimento; o mesmo id sem ter sido enviado conta", () => {
    const id = pick("kb:id", "exact");
    expect(scan({ detail: `Nenhum predicado para '${id}'.` }, { finding: { rule: { id } } })[0].class).toBe("eco");
    expect(scan({ detail: `Nenhum predicado para '${id}'.` }, { finding: { rule: { id: "3.3.1" } } })[0].class).toBe("sem-explicacao");
  });

  it("exceções nomeadas valem só no caminho declarado", () => {
    const b = new DictionaryBuilder();
    b.addExact("ds-core-random-list-id", "teste");
    const d = b.build();
    const at = (payload: unknown) => scanResponse(d, JSON.stringify(payload), { args: "{}", page: null, axe: "" }).hits[0].class;
    expect(at({ state: { normalizations: ["ds-core-random-list-id"] } })).toBe("excecao-nomeada");
    expect(at({ note: "ds-core-random-list-id" })).toBe("sem-explicacao");
  });
});
