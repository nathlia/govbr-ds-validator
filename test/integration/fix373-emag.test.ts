import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { getEmag } from "../../src/data/load.js";
import { emagUnits } from "../../src/data/normativeUnits.js";
import { emagClausesReply } from "../../src/responses/emagClauses.js";
import { oracleFullyMeasures, oracleMeasuresFor } from "../../src/tools/oracleCoverage.js";
import { CHECK_GROUNDING } from "../../src/checkers/grounding.js";
import { TITLE_IMPLEMENTS } from "../../src/checkers/pageStructure.js";
import { EXPECTED_CONDITIONS } from "../../src/schema/structuredClaims.js";

let client: Client;
beforeAll(async () => {
  const server = createServer({ toolProfile: "evaluation" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  client = new Client({ name: "fix373-a3", version: "1" });
  await client.connect(a);
});
afterAll(async () => { await client.close(); });

async function call(args: Record<string, unknown>) {
  const result = await client.callTool({ name: "get_emag_rules", arguments: args });
  const text = (result.content as Array<{ text: string }>).map((c) => c.text).join("");
  return { isError: Boolean(result.isError), text, data: JSON.parse(text) };
}

describe("3.7.3 A3 — todas as cláusulas e-MAG por continuação", () => {
  it("as 45 recomendações são percorridas até o fim, sem lacuna, repetição ou resposta acima de 8k", async () => {
    const ids = Object.values(getEmag().sections).flatMap((s) => s.rules.map((r) => r.id));
    expect(ids).toHaveLength(45);
    let continuations = 0;
    for (const id of ids) {
      const collected: unknown[] = [];
      let args: Record<string, unknown> = { id };
      const cursors = new Set<string>();
      for (let n = 0; n < 100; n++) {
        const result = await call(args);
        expect(result.isError, `${id}: ${result.text}`).toBe(false);
        expect(result.text.length, id).toBeLessThanOrEqual(8000);
        collected.push(...result.data.normativeContext.clauses);
        const next = result.data.normativeContext.clausesDeferred?.next;
        if (!next) break;
        expect(next.tool).toBe("get_emag_rules");
        expect(cursors.has(next.arguments.clauseCursor)).toBe(false);
        cursors.add(next.arguments.clauseCursor);
        args = next.arguments;
        continuations++;
      }
      // Compara objetos literais completos: texto, força e proveniência permanecem juntos.
      expect(collected, id).toEqual(emagUnits(id).clauses);
    }
    expect(continuations).toBeGreaterThan(0);
  });

  it("1.8: a continuação alcança também as cláusulas além dos dez ids antes expostos", async () => {
    const first = await call({ id: "1.8" });
    const deferred = first.data.normativeContext.clausesDeferred;
    expect(deferred.count).toBeGreaterThan(10);
    const ids = first.data.normativeContext.clauses.map((c: { id: string }) => c.id);
    let next = deferred.next;
    while (next) {
      const page = await call(next.arguments);
      expect(page.isError).toBe(false);
      ids.push(...page.data.normativeContext.clauses.map((c: { id: string }) => c.id));
      next = page.data.normativeContext.clausesDeferred?.next;
    }
    expect(ids).toEqual(emagUnits("1.8").clauses.map((c) => c.id));
  });

  it("cursor é preso ao id e ao conteúdo; parâmetros incompatíveis são recusados com próximo passo", async () => {
    const first = await call({ id: "1.8" });
    const clauseCursor = first.data.normativeContext.clausesDeferred.next.arguments.clauseCursor;
    for (const args of [{ clauseCursor }, { section: 1, clauseCursor }, { id: "3.3", clauseCursor }, { id: "1.8", clauseCursor: "c1.999999.0000000000" }]) {
      const result = await call(args);
      expect(result.isError).toBe(true);
      expect(result.data.next.length).toBeGreaterThan(0);
    }
    const units = emagUnits("1.8");
    const changed = { ...units, knowledgeVersion: units.knowledgeVersion + "-diferente" };
    const stale = emagClausesReply({}, changed, "1.8", clauseCursor);
    expect(stale.isError).toBe(true);
  });
});

describe("3.7.3 A3 — o alcance declarado dos checks não dispensa julgamento", () => {
  it("título aparece como medida parcial (presença e sinal de duplicação), não como adequação integral", () => {
    const id = TITLE_IMPLEMENTS.find((id) => id.startsWith("govbr-"))!;
    expect(oracleMeasuresFor(id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ tool: "scan_page", check: "page", coverage: "partial" }),
      expect.objectContaining({ tool: "verify_finding", expectedCondition: EXPECTED_CONDITIONS.documentTitle, coverage: "partial" }),
    ]));
    expect(oracleFullyMeasures(id)).toBe(false);
  });

  it("a regra geral de tokens registra apenas as medidas implementadas; regras específicas conservam seu alcance", () => {
    const general = CHECK_GROUNDING["token-radius"].implements[0];
    const measures = oracleMeasuresFor(general);
    expect(measures.length).toBeGreaterThan(0);
    expect(measures.every((m) => m.coverage === "partial" && Boolean(m.limitation))).toBe(true);
    expect(measures).toEqual(expect.arrayContaining([
      expect.objectContaining({ tool: "scan_page", check: "tokens" }),
      expect.objectContaining({ tool: "verify_finding", expectedCondition: EXPECTED_CONDITIONS.tokenRadius }),
    ]));
    expect(oracleFullyMeasures(general)).toBe(false);
    expect(oracleFullyMeasures(CHECK_GROUNDING["token-font-family"].implements[0])).toBe(true);
    expect(oracleFullyMeasures("id-inexistente")).toBe(false);
  });
});
