/**
 * 3.1.0: unknown or invalid parameters come back in the contract error shape (isError, errorCode,
 * nearest name, next step), not as the SDK's plain -32602 text. tools/list still publishes
 * additionalProperties:false. Also guards the SDK hook (installContractInputValidation).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { CONTRACT } from "../../src/responses/contract.js";

let client: Client;
beforeAll(async () => {
  const server = createServer({ toolProfile: "evaluation" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "input-contract", version: "1" });
  await server.connect(b);
  await client.connect(a);
});
afterAll(async () => {
  await client.close();
});

const call = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as Array<{ text: string }>)[0].text;
  return { isError: Boolean(r.isError), text, json: JSON.parse(text) };
};

describe("input contract errors (3.1.0)", () => {
  it("unknown top-level parameter: unknown-parameter, nearest name, corrected call in next that resolves", async () => {
    const r = await call("get_ds_rules", { querry: "foco modal" });
    expect(r.isError).toBe(true);
    expect(r.json).toMatchObject({ contract: CONTRACT, kind: "error", errorCode: "unknown-parameter", field: "querry", didYouMean: { querry: "query" } });
    expect(r.json.error).toMatch(/você quis dizer 'query'/);
    expect(r.json.accepted).toContain("query");
    expect(r.json.next[0]).toMatchObject({ tool: "get_ds_rules", arguments: { query: "foco modal" } });
    const again = await client.callTool({ name: r.json.next[0].tool, arguments: r.json.next[0].arguments });
    expect(again.isError).toBeFalsy();
  });

  it("unknown nested parameter and invalid value: contract shape with field and next", async () => {
    const nested = await call("get_ds_rules", { context: { components: ["modal"], bogus: 1 } });
    expect(nested.isError).toBe(true);
    expect(nested.json).toMatchObject({ kind: "error", errorCode: "unknown-parameter", field: "context.bogus" });
    expect(nested.json.next.length).toBeGreaterThanOrEqual(1);
    const invalid = await call("get_ds_rules", { query: "foco", limit: "cinco" });
    expect(invalid.isError).toBe(true);
    expect(invalid.json).toMatchObject({ kind: "error", errorCode: "invalid-argument", field: "limit" });
    expect(invalid.json.next[0]).toMatchObject({ tool: "get_ds_rules" });
  });

  it("tools/list still declares additionalProperties:false", async () => {
    const { tools } = await client.listTools();
    for (const t of tools) expect((t.inputSchema as { additionalProperties?: unknown }).additionalProperties).toBe(false);
  });
});
