/**
 * Integration tests — a real MCP client talking to the real server over the
 * SDK's in-memory transport (exactly what an agent client does, minus the
 * network).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import type { ToolTelemetryEvent } from "../../src/telemetry.js";

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
  it("records call telemetry without adding it to the tool response", async () => {
    const events: ToolTelemetryEvent[] = [];
    const telemetryFile = join(mkdtempSync(join(tmpdir(), "govbr-telemetry-")), "calls.ndjson");
    const telemetryServer = createServer({
      reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")),
      telemetry: { runId: "test-run", file: telemetryFile, onEvent: (event) => events.push(event) },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const telemetryClient = new Client({ name: "telemetry-test", version: "1.0.0" });
    await telemetryServer.connect(serverTransport);
    await telemetryClient.connect(clientTransport);

    try {
      const result = await telemetryClient.callTool({
        name: "get_ds_rules",
        arguments: { component: "button", limit: 2 },
      });
      expect(textOf(result)).not.toContain("requestBytes");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        runId: "test-run",
        tool: "get_ds_rules",
        status: "ok",
        outputRecords: 2,
      });
      expect(events[0].requestBytes).toBeGreaterThan(0);
      expect(events[0].responseBytes).toBeGreaterThan(0);
      expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
      const persisted = readFileSync(telemetryFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({ runId: "test-run", tool: "get_ds_rules", status: "ok" });
    } finally {
      await telemetryClient.close();
    }
  });

  it("exposes the full tool set", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "check_component_structure",
        "check_token_compliance",
        "get_component_spec",
        "get_design_tokens",
        "get_ds_rules",
        "get_emag_rules",
        "get_finding_details",
        "get_page_rules",
        "inspect_computed_styles",
        "list_components",
        "run_axe_scan",
        "scan_page",
        "save_report",
        "verify_finding",
      ].sort()
    );
  });

  it("get_finding_details reports ids that are absent from the current MCP session", async () => {
    const res = await client.callTool({
      name: "get_finding_details",
      arguments: { ids: ["F-does-not-exist"] },
    });
    const data = JSON.parse(textOf(res));
    expect(data).toMatchObject({ requested: 1, missing: ["F-does-not-exist"], count: 0, detail: "evidence" });
  });

  it("get_finding_details requires exactly one retrieval mode", async () => {
    const res = await client.callTool({ name: "get_finding_details", arguments: {} });
    const data = JSON.parse(textOf(res));
    expect(data.error).toContain("exatamente um");
  });

  it("save_report refuses missing stored ids instead of silently dropping them", async () => {
    const res = await client.callTool({
      name: "save_report",
      arguments: { url: "http://example.test", finding_ids: ["F-does-not-exist"] },
    });
    const data = JSON.parse(textOf(res));
    expect(data.error).toContain("não existem");
    expect(data.missingFindingIds).toEqual(["F-does-not-exist"]);
    expect(data.jsonPath).toBeUndefined();
  });

  it("exposes resources including the finding schema", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("govbr://schema/finding");
    expect(uris).toContain("govbr://tokens");
    expect(uris).toContain("govbr://knowledge/conflicts");
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

  it("get_emag_rules returns a compact section index when called without filters", async () => {
    const res = await client.callTool({ name: "get_emag_rules", arguments: {} });
    const data = JSON.parse(textOf(res));
    expect(data.sections).toHaveLength(6);
    expect(data.sections[0]).toEqual(expect.objectContaining({ id: "1", ruleCount: expect.any(Number) }));
    expect(data.sections[0].rules).toBeUndefined();
  });

  it("get_component_spec returns the canonical button contract", async () => {
    const res = await client.callTool({
      name: "get_component_spec",
      arguments: { component: "button", include_examples: true },
    });
    const data = JSON.parse(textOf(res));
    expect(data.rootClass).toBe("br-button");
    expect(data.tags).toEqual(["button"]);
    expect(data.variantClasses).toContain("circle");
    expect(data.examples.length).toBeGreaterThan(0);
  });

  it("get_component_spec omits HTML examples by default", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "button" } });
    const data = JSON.parse(textOf(res));
    expect(data.examples).toEqual([]);
    expect(data.availableExamples.length).toBeGreaterThan(0);
  });

  it("get_component_spec lists alternatives for unknown components", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "nope" } });
    const data = JSON.parse(textOf(res));
    expect(data.error).toBeDefined();
    expect(data.available).toContain("button");
  });
});

describe("get_ds_rules — the KB rule store (D-11)", () => {
  it("force=required returns the 107 required rules", async () => {
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: { force: "required", limit: 200 },
    });
    const data = JSON.parse(textOf(res));
    expect(data.count).toBe(107);
    expect(data.rules.every((r: { force: string }) => r.force === "required")).toBe(true);
  });

  it("component=button returns only button rules with the full projection", async () => {
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: { component: "button", detail: "full" },
    });
    const data = JSON.parse(textOf(res));
    expect(data.count).toBeGreaterThan(0);
    for (const r of data.rules) {
      expect(r.component).toBe("button");
      expect(r.id).toMatch(/^govbr-3\.7\.0-/);
      expect(r.normalizedRule.length).toBeGreaterThan(0);
      expect(r).toHaveProperty("validationStrategy");
      expect(r).toHaveProperty("expectedEvidence");
      expect(r).toHaveProperty("wcagReferences");
      expect(r).toHaveProperty("emagReferences");
      expect(r).toHaveProperty("sourceUrl");
    }
  });

  it("filters compose: the D-12 candidate set (required + automatable + high)", async () => {
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: {
        force: "required",
        automatable: true,
        automationConfidence: "high",
        detail: "full",
        limit: 200,
      },
    });
    const data = JSON.parse(textOf(res));
    expect(data.count).toBeGreaterThan(0);
    expect(
      data.rules.every(
        (r: { automatable: boolean; automationConfidence: string }) =>
          r.automatable && r.automationConfidence === "high"
      )
    ).toBe(true);
  });

  it("returns a normative facet index instead of the whole KB when called without filters", async () => {
    const res = await client.callTool({ name: "get_ds_rules", arguments: {} });
    const data = JSON.parse(textOf(res));
    expect(data.meta.totalNormative).toBe(152);
    expect(data.rules).toBeUndefined();
    expect(data.facets.force.example).toBeUndefined();
    expect(data.note).toContain("Índice, não listagem");
  });

  it("serves evidence only through the separate 'evidence' channel", async () => {
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: { component: "accordion", include_evidence: true },
    });
    const data = JSON.parse(textOf(res));
    expect(data.rules.some((r: { force: string }) => r.force === "example")).toBe(false);
    expect(data.evidence.items.length).toBeGreaterThan(0);
    expect(data.evidence.items.every((r: { force: string }) => r.force === "example")).toBe(true);
    expect(data.evidence.note).toContain("NÃO normas");
  });

  it("fetches a full rule record by exact id", async () => {
    const list = JSON.parse(
      textOf(await client.callTool({ name: "get_ds_rules", arguments: { force: "prohibited" } }))
    );
    const id = list.rules[0].id;
    const res = await client.callTool({ name: "get_ds_rules", arguments: { id } });
    const data = JSON.parse(textOf(res));
    expect(data.kind).toBe("normative");
    expect(data.rule.id).toBe(id);
    expect(data.rule.originalText.length).toBeGreaterThan(0);
    expect(data.rule.source.url).toMatch(/^https?:/);
  });

  it("fetches multiple exact rule ids in one compact call", async () => {
    const seed = JSON.parse(
      textOf(await client.callTool({
        name: "get_ds_rules",
        arguments: { force: "prohibited", limit: 2 },
      }))
    );
    const ids = seed.rules.map((rule: { id: string }) => rule.id);
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: { ids: [...ids, "govbr-3.7.0-missing"] },
    });
    const data = JSON.parse(textOf(res));
    expect(data.count).toBe(ids.length);
    expect(data.rules.map((rule: { id: string }) => rule.id)).toEqual(ids);
    expect(data.rules.every((rule: { kind: string }) => rule.kind === "normative")).toBe(true);
    expect(data.rules[0]).not.toHaveProperty("expectedEvidence");
    expect(data.missing).toEqual(["govbr-3.7.0-missing"]);
  });
});

describe("defect awareness (D-10 bucket 3 / Phase 2.4)", () => {
  it("get_component_spec warns about the card examples' missing alt", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "card" } });
    const data = JSON.parse(textOf(res));
    expect(data.warnings).toHaveLength(4);
    expect(data.warnings.every((w: { type: string }) => w.type === "image-missing-alt")).toBe(true);
  });

  it("get_component_spec warns about the wizard examples' broken aria-labelledby", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "wizard" } });
    const data = JSON.parse(textOf(res));
    expect(data.warnings).toHaveLength(2);
  });

  it("clean components carry no warnings", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "button" } });
    const data = JSON.parse(textOf(res));
    expect(data.warnings).toEqual([]);
  });

  it("serves the conflicts resource with the 6 package anomalies", async () => {
    const res = await client.readResource({ uri: "govbr://knowledge/conflicts" });
    const data = JSON.parse((res.contents[0] as { text: string }).text);
    expect(data.packageAudit.accessibilityFindings).toHaveLength(6);
  });
});

describe("get_emag_rules — KB enrichment (Phase 2.6)", () => {
  it("attaches the KB validation template to a rule lookup", async () => {
    const res = await client.callTool({ name: "get_emag_rules", arguments: { id: "6.2" } });
    const data = JSON.parse(textOf(res));
    expect(data.title).toContain("etiquetas");
    expect(data.validationTemplate).toBeDefined();
    expect(data.validationTemplate.recommendation).toBe("6.2");
    expect(Array.isArray(data.validationTemplate.checks)).toBe(true);
  });

  it("serves the recommendations previously missing from the oracle (5.5, 6.7, 6.8)", async () => {
    for (const id of ["5.5", "6.7", "6.8"]) {
      const res = await client.callTool({ name: "get_emag_rules", arguments: { id } });
      const data = JSON.parse(textOf(res));
      expect(data.error).toBeUndefined();
      expect(data.id).toBe(id);
      expect(data.validationTemplate.recommendation).toBe(id);
    }
  });
});

describe("verification gate — KB rule ids (D-11 exact-id matching)", () => {
  const baseFinding = {
    element: { locator: "#x", page: "http://localhost:3000" },
    evidence: { observed: "algo", expected: "outra coisa" },
    severity: "moderate",
    nature: "semantic",
    mode: "display",
    pathway: "heuristic",
  };

  it("confirms a finding citing a real normative KB rule id", async () => {
    const list = JSON.parse(
      textOf(await client.callTool({ name: "get_ds_rules", arguments: { force: "required" } }))
    );
    const rule = list.rules[0];
    const res = JSON.parse(
      textOf(
        await client.callTool({
          name: "verify_finding",
          arguments: {
            finding: {
              ...baseFinding,
              id: "F-920",
              rule: { id: rule.id, source: "govbr-ds-kb", description: rule.normalizedRule },
            },
          },
        })
      )
    );
    expect(res.verification.verdict).toBe("confirmed");
  });

  it("rejects a hallucinated KB rule id", async () => {
    const res = JSON.parse(
      textOf(
        await client.callTool({
          name: "verify_finding",
          arguments: {
            finding: {
              ...baseFinding,
              id: "F-921",
              rule: { id: "govbr-3.7.0-component-fake-000000000000", source: "govbr-ds-kb", description: "inventada" },
            },
          },
        })
      )
    );
    expect(res.verification.verdict).toBe("rejected");
  });

  it("rejects a finding that cites evidence (force=example) as the violated rule", async () => {
    const evidence = JSON.parse(
      textOf(
        await client.callTool({ name: "get_ds_rules", arguments: { component: "accordion", include_evidence: true } })
      )
    ).evidence.items[0];
    const res = JSON.parse(
      textOf(
        await client.callTool({
          name: "verify_finding",
          arguments: {
            finding: {
              ...baseFinding,
              id: "F-922",
              rule: { id: evidence.id, source: "govbr-ds-kb", description: evidence.title },
            },
          },
        })
      )
    );
    expect(res.verification.verdict).toBe("rejected");
    expect(res.verification.detail).toContain("evidência");
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
