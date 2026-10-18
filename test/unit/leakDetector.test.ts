/**
 * O detector de vazamento (scripts/lib/vazamento.ts) precisa disparar: testes de falha deliberada.
 * Um detector que nunca acha nada não prova ausência de vazamento (Codex #4, NAT-61). 2.14.1: campos
 * declarados por ferramenta e eco só como valor exato (Codex db6d022d). Detector auxiliar, não prova
 * universal: a garantia é a trava de carregamento.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { buildDictionary, scanResponse, DictionaryBuilder, type Dictionary } from "../../scripts/lib/vazamento.js";

const ROOT = join(import.meta.dirname, "..", "..");
const dict: Dictionary = buildDictionary(ROOT, { checkIds: ["ds-page-footer", "ds-token-color"] });
const pick = (source: string, kind: "exact" | "phrase") =>
  [...(kind === "exact" ? dict.exact : dict.phrases).values()].find((t) => t.source === source)!.term;
const AXE = "axe bundle: Images must have alternate text";
const scan = (payload: unknown, args: unknown = {}, page: string | null = null, tool = "verify_finding") =>
  scanResponse(dict, JSON.stringify(payload), { tool, args, page, axe: AXE }).hits;

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

  it("a anotação e-MAG do axe (sufixo na descrição) dispara mesmo num campo declarado da saída do axe", () => {
    const title = pick("emag:title", "phrase");
    const hits = scan({ findings: [{ rule: { id: "image-alt", description: `Images must have alternate text (e-MAG 3.6: ${title})` } }] }, {}, null, "scan_page");
    expect(hits.some((h) => h.class === "sem-explicacao")).toBe(true);
  });

  it("termo da página só é perdoado no campo de página declarado para a ferramenta E se estiver na página", () => {
    const token = pick("tokens:name", "exact");
    const page = `<div style="color: var(${token})"></div>`;
    const snippet = { findings: [{ element: { snippet: `<i style="color: var(${token})">` } }] };
    expect(scan(snippet, {}, page, "scan_page")[0].class).toBe("pagina");
    expect(scan(snippet, {}, "<html></html>", "scan_page")[0].class).toBe("sem-explicacao");
    expect(scan({ note: `use ${token}` }, {}, page, "scan_page")[0].class).toBe("sem-explicacao");
    // 2.14.1: o mesmo caminho em ferramenta que não o declara não perdoa.
    expect(scan(snippet, {}, page, "verify_finding")[0].class).toBe("sem-explicacao");
  });

  it("2.14.1: nome final genérico (detail, name, description, observed) não é campo de página", () => {
    const token = pick("tokens:name", "exact");
    const page = `<div style="color: var(${token})"></div>`;
    for (const payload of [
      { limitation: { detail: `use ${token}` } },
      { verification: { detail: `use ${token}` } },
      { tool: { name: token } },
      { rule: { description: `use ${token}` } },
      { findings: [{ evidence: { observed: `use ${token}` } }] }, // prosa do servidor, não transcrição da página
    ]) {
      for (const tool of ["scan_page", "verify_finding", "get_finding_details"]) {
        expect(scan(payload, {}, page, tool)[0].class, `${tool} ${JSON.stringify(payload)}`).toBe("sem-explicacao");
      }
    }
    // O traço do verify_finding transcreve a página: lá o termo é perdoado.
    expect(scan({ verification: { binding: { context: { trace: [{ subjects: [{ classes: [token] }] }] } } } }, {}, page)[0].class).toBe("pagina");
  });

  it("eco: o id que o chamador enviou não conta como enriquecimento; o mesmo id sem ter sido enviado conta", () => {
    const id = pick("kb:id", "exact");
    const detail = (text: string) => ({ verification: { detail: text } });
    expect(scan(detail(`Nenhum predicado para '${id}'.`), { finding: { rule: { id } } })[0].class).toBe("eco");
    expect(scan(detail(`Nenhum predicado para '${id}'.`), { finding: { rule: { id: "3.3.1" } } })[0].class).toBe("sem-explicacao");
  });

  it("2.14.1: eco só como valor exato, do argumento declarado, no campo declarado; enriquecimento no mesmo campo dispara", () => {
    const ids = [...dict.exact.values()].filter((t) => t.source === "kb:id").map((t) => t.term);
    const [id, outro] = ids;
    const title = pick("kb:title", "phrase");
    const args = { finding: { rule: { id }, evidence: { observed: `o agente escreveu: ${title}; e ${outro}` } } };
    // o id citado no detalhe: eco
    const hits = scan({ verification: { detail: `Nenhum predicado para '${id}'. Veja também ${outro} e ${title}.` } }, args);
    expect(hits.find((h) => h.term === id)!.class).toBe("eco");
    // outro id e o título estão nos argumentos, mas não como o valor de um argumento declarado: enriquecimento
    expect(hits.find((h) => h.term === outro)!.class).toBe("sem-explicacao");
    expect(hits.filter((h) => h.kind === "phrase").every((h) => h.class === "sem-explicacao")).toBe(true);
    expect(hits.some((h) => h.kind === "phrase")).toBe(true);
    // o id citado fora do campo declarado: não é eco
    expect(scan({ verification: { next: { ruleId: id } } }, args)[0].class).toBe("sem-explicacao");
    // o mesmo campo em outra ferramenta: não é eco
    expect(scan({ verification: { detail: id } }, args, null, "scan_page")[0].class).toBe("sem-explicacao");
    // o nome da ferramenta retirada no erro do protocolo é eco do próprio nome; outro nome de ferramenta não
    expect(scanResponse(dict, "error: Tool get_ds_rules not found", { tool: "get_ds_rules", args: {}, page: null, axe: AXE }).hits[0].class).toBe("eco");
    expect(scanResponse(dict, "error: try get_ds_rules", { tool: "scan_page", args: {}, page: null, axe: AXE }).hits[0].class).toBe("sem-explicacao");
  });

  it("exceções nomeadas valem só no caminho declarado", () => {
    const b = new DictionaryBuilder();
    b.addExact("ds-core-random-list-id", "teste");
    const d = b.build();
    const at = (payload: unknown) => scanResponse(d, JSON.stringify(payload), { tool: "scan_page", args: {}, page: null, axe: "" }).hits[0].class;
    expect(at({ state: { normalizations: ["ds-core-random-list-id"] } })).toBe("excecao-nomeada");
    expect(at({ note: "ds-core-random-list-id" })).toBe("sem-explicacao");
  });
});
