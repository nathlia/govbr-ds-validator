/**
 * 3.3.0 (NAT-109, D-152): guarda byte a byte do get_ds_rules léxico (o único motor desde a remoção da busca
 * híbrida/vetorial), cursores incluídos. Mudou de propósito? Regere a fixture e declare a mudança.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { RANKING_VERSION } from "../../src/data/retrieval.js";

let client: Client;
beforeAll(async () => {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")), toolProfile: "evaluation", knowledgeLock: "call" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  client = new Client({ name: "lexical-fixture", version: "0" });
  await client.connect(a);
});
afterAll(async () => client.close());

describe("get_ds_rules léxico = fixture 3.4.0 byte a byte", () => {
  it("cada resposta igual à fixture, cursores incluídos", async () => {
    const fixture = JSON.parse(readFileSync(new URL("../fixtures/lexical-3.4.0-get-ds-rules.json", import.meta.url), "utf8")) as {
      steps: Array<{ args: Record<string, unknown>; cursorFrom?: number; isError: boolean; sha256: string }>;
    };
    const texts: string[] = [];
    for (const step of fixture.steps) {
      const args = step.cursorFrom !== undefined ? { ...step.args, cursor: JSON.parse(texts[step.cursorFrom]).page.cursor } : step.args;
      const r = await client.callTool({ name: "get_ds_rules", arguments: args });
      const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
      texts.push(text);
      expect({ args: step.args, isError: Boolean(r.isError), sha256: createHash("sha256").update(text).digest("hex") }).toEqual({
        args: step.args,
        isError: step.isError,
        sha256: step.sha256,
      });
    }
    expect(JSON.parse(texts[0]).kb.ranking).toBe(RANKING_VERSION);
  });
});
