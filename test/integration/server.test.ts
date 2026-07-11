/**
 * Integration tests — a real MCP client talking to the real server over the
 * SDK's in-memory transport (exactly what an agent client does, minus the
 * network).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

let client: Client;

function textOf(result: { content?: unknown }): string {
  const content = result.content as { type: string; text: string }[];
  return content.map((c) => c.text).join("\n");
}

beforeAll(async () => {
  const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-harness", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

describe("surface", () => {
  it("exposes the full tool set", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "check_component_structure",
        "check_token_compliance",
        "get_component_spec",
        "get_design_tokens",
        "get_emag_rules",
        "get_page_rules",
        "inspect_computed_styles",
        "list_components",
        "run_axe_scan",
        "save_report",
        "verify_finding",
      ].sort()
    );
  });

  it("exposes resources including the finding schema", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("govbr://schema/finding");
    expect(uris).toContain("govbr://tokens");
    expect(uris.some((u) => u.startsWith("govbr://emag/"))).toBe(true);
    expect(uris.some((u) => u.startsWith("govbr://components/"))).toBe(true);
  });

  it("serves the validate_page prompt with the procedural skeleton", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("validate_page");

    const prompt = await client.getPrompt({
      name: "validate_page",
      arguments: { url: "http://localhost:3000", scope: "button", max_iterations: "3" },
    });
    const text = (prompt.messages[0].content as { text: string }).text;
    expect(text).toContain("http://localhost:3000");
    expect(text).toContain("Fase 1");
    expect(text).toContain("verify_finding");
    expect(text).toContain("máximo 3");
    expect(text).toContain("check_token_compliance");
    // Procedure only — no few-shot violation examples
    expect(text).not.toMatch(/exemplo de violação/i);
  });
});

describe("oracle knowledge tools", () => {
  it("get_design_tokens returns semantic highlights and hex index by default", async () => {
    const res = await client.callTool({ name: "get_design_tokens", arguments: {} });
    const data = JSON.parse(textOf(res));
    expect(data.semantic["primary-color"].value).toBe("#1351b4");
    expect(data.hexLookup["#1351b4"]).toContain("--color-primary-default");
  });

  it("get_design_tokens filters by query", async () => {
    const res = await client.callTool({ name: "get_design_tokens", arguments: { query: "focus" } });
    const data = JSON.parse(textOf(res));
    expect(data.count).toBeGreaterThan(0);
    expect(Object.keys(data.tokens).every((k) => k.includes("focus"))).toBe(true);
  });

  it("get_emag_rules fetches a single rule by id", async () => {
    const res = await client.callTool({ name: "get_emag_rules", arguments: { id: "6.2" } });
    const data = JSON.parse(textOf(res));
    expect(data.title).toContain("etiquetas");
    expect(data.section).toBe("6");
  });

  it("get_component_spec returns the canonical button contract", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "button" } });
    const data = JSON.parse(textOf(res));
    expect(data.rootClass).toBe("br-button");
    expect(data.tags).toEqual(["button"]);
    expect(data.variantClasses).toContain("circle");
    expect(data.examples.length).toBeGreaterThan(0);
  });

  it("get_component_spec lists alternatives for unknown components", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "nope" } });
    const data = JSON.parse(textOf(res));
    expect(data.error).toBeDefined();
    expect(data.available).toContain("button");
  });
});

describe("verification gate + report round-trip", () => {
  it("confirms grounded findings and rejects hallucinated rules via MCP", async () => {
    const grounded = {
      id: "F-900",
      rule: { id: "emag-4.1", source: "emag", description: "Contraste mínimo" },
      element: { locator: "#x", page: "http://localhost:3000" },
      evidence: { observed: "contraste 2.1:1", expected: "≥ 4.5:1" },
      severity: "serious",
      nature: "semantic",
      mode: "display",
      pathway: "heuristic",
    };
    const ok = JSON.parse(
      textOf(await client.callTool({ name: "verify_finding", arguments: { finding: grounded } }))
    );
    expect(ok.verification.verdict).toBe("confirmed");

    const hallucinated = { ...grounded, id: "F-901", rule: { ...grounded.rule, id: "emag-7.3" } };
    const bad = JSON.parse(
      textOf(await client.callTool({ name: "verify_finding", arguments: { finding: hallucinated } }))
    );
    expect(bad.verification.verdict).toBe("rejected");
  });

  it("save_report enforces the gate and persists dual formats", async () => {
    const deterministic = {
      id: "F-910",
      rule: { id: "ds-token-color", source: "govbr-ds-token", description: "Cores devem usar tokens" },
      element: { locator: "#y", page: "http://localhost:3000" },
      evidence: { observed: "#ff0000", expected: "token DS" },
      severity: "moderate",
      nature: "syntactic",
      mode: "display",
      pathway: "deterministic",
    };
    const unverifiedHeuristic = { ...deterministic, id: "F-911", pathway: "heuristic" };

    const res = JSON.parse(
      textOf(
        await client.callTool({
          name: "save_report",
          arguments: { url: "http://localhost:3000", findings: [deterministic, unverifiedHeuristic] },
        })
      )
    );
    expect(res.accepted).toBe(1);
    expect(res.rejected).toHaveLength(1);
    expect(res.rejected[0].errors[0]).toContain("verify_finding");
    expect(res.jsonPath).toMatch(/\.json$/);
    expect(res.markdownPath).toMatch(/\.md$/);
  });
});

describe("resources", () => {
  it("reads the finding JSON schema", async () => {
    const res = await client.readResource({ uri: "govbr://schema/finding" });
    const schema = JSON.parse((res.contents[0] as { text: string }).text);
    expect(JSON.stringify(schema)).toContain("severity");
  });

  it("reads an e-MAG section by URI", async () => {
    const res = await client.readResource({ uri: "govbr://emag/4" });
    const data = JSON.parse((res.contents[0] as { text: string }).text);
    expect(data.title).toContain("Apresentação");
    expect(data.rules.some((r: { id: string }) => r.id === "4.1")).toBe(true);
  });
});
