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
import { ABSENCE_NOTE } from "../../src/responses/absence.js";

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

  it("exposes only the compact evaluation tool profile", async () => {
    const evaluationServer = createServer({
      reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")),
      toolProfile: "evaluation",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const evaluationClient = new Client({ name: "evaluation-profile-test", version: "1.0.0" });
    await evaluationServer.connect(serverTransport);
    await evaluationClient.connect(clientTransport);

    try {
      const { tools } = await evaluationClient.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual(
        [
          "get_component_spec",
          "get_design_tokens",
          "get_ds_rules",
          "get_emag_rules",
          "get_finding_details",
          "get_page_rules",
          "scan_page",
          "verify_finding",
        ].sort()
      );
      const fullSurface = (await client.listTools()).tools;
      expect(JSON.stringify(tools).length).toBeLessThan(JSON.stringify(fullSurface).length * 0.75);
    } finally {
      await evaluationClient.close();
    }
  });

  it("get_page_rules publishes the citable page constraints with their norms and source excerpts (2.7.0)", async () => {
    const index = JSON.parse(textOf(await client.callTool({ name: "get_page_rules", arguments: {} })));
    expect(index.constraints.map((c: { id: string }) => c.id)).toEqual(["ds-page-header", "ds-page-footer", "ds-page-focus-order", "ds-page-skip-link"]);
    const footer = index.constraints.find((c: { id: string }) => c.id === "ds-page-footer");
    expect(footer.implements).toEqual(["govbr-3.7.0-template-global-19f93475dc5e"]);
    expect(footer.source.excerpt).toContain("Área de Rodapé (Obrigatório)");
    expect(footer.claim.expectedCondition).toBe("template-base-region-present");
    const structure = JSON.parse(textOf(await client.callTool({ name: "get_page_rules", arguments: { category: "page_structure" } })));
    expect(structure.constraints).toHaveLength(4);
    const forms = JSON.parse(textOf(await client.callTool({ name: "get_page_rules", arguments: { category: "form_patterns" } })));
    expect(forms.constraints).toBeUndefined();
  });

  it.each([
    ["normative", ["get_component_spec", "get_design_tokens", "get_ds_rules", "get_emag_rules", "get_page_rules"]],
    ["deterministic", ["get_finding_details", "scan_page"]],
    ["evidence", ["inspect_computed_styles"]],
  ] as const)("isolates the %s capability profile", async (profile, expected) => {
    const profiledServer = createServer({
      reportsDir: mkdtempSync(join(tmpdir(), "govbr-reports-")),
      toolProfile: profile,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const profiledClient = new Client({ name: `${profile}-profile-test`, version: "1.0.0" });
    await profiledServer.connect(serverTransport);
    await profiledClient.connect(clientTransport);
    try {
      const { tools } = await profiledClient.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([...expected].sort());
    } finally {
      await profiledClient.close();
    }
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
    expect(res.isError).toBe(true);
    const data = JSON.parse(textOf(res));
    expect(data.error).toContain("exatamente um");
  });

  it("save_report refuses missing stored ids instead of silently dropping them", async () => {
    const res = await client.callTool({
      name: "save_report",
      arguments: { url: "http://example.test", finding_ids: ["F-does-not-exist"] },
    });
    expect(res.isError).toBe(true);
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

  it("S-15: in the evaluation profile the prompt names only the tools that profile registers; max_iterations must be an integer", async () => {
    const evaluation = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "govbr-prompt-")), toolProfile: "evaluation" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const evalClient = new Client({ name: "prompt-test", version: "1.0.0" });
    await evaluation.connect(st);
    await evalClient.connect(ct);
    try {
      const registered = new Set((await evalClient.listTools()).tools.map((t) => t.name));
      const prompt = await evalClient.getPrompt({ name: "validate_page", arguments: { url: "http://localhost:3000" } });
      const text = (prompt.messages[0].content as { text: string }).text;
      for (const name of ["save_report", "run_axe_scan", "check_token_compliance", "check_component_structure", "inspect_computed_styles", "list_components"]) {
        expect(registered.has(name)).toBe(false);
        expect(text, name).not.toContain(name);
      }
      for (const name of ["scan_page", "get_finding_details", "verify_finding", "get_ds_rules"]) expect(text).toContain(name);
      await expect(evalClient.getPrompt({ name: "validate_page", arguments: { url: "http://x", max_iterations: "-5" } })).rejects.toThrow();
    } finally {
      await evalClient.close();
    }
  });

  it("application errors are isError with errorCode and a next step (B-08); unknown parameters are rejected (B-01)", async () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["get_ds_rules", { id: "nope" }, "unknown-id"],
      ["get_ds_rules", { id: "x", ids: ["y"] }, "invalid-combination"],
      ["get_ds_rules", { context: {} }, "empty-context"],
      ["get_ds_rules", { context: { components: ["button"] }, component: "button" }, "invalid-combination"],
      ["get_ds_rules", { id: "x", query: "botão" }, "invalid-combination"],
      ["get_ds_rules", { query: "foco", cursor: "c1.5.0123456789" }, "stale-cursor"],
      ["get_emag_rules", { id: "4.10" }, "unknown-id"],
      ["get_component_spec", { component: "Button" }, "unknown-component"],
      ["get_finding_details", {}, "invalid-combination"],
      ["get_finding_details", { scanId: "nope" }, "unknown-scan"],
      ["save_report", { url: "http://x", finding_ids: ["F-0"] }, "missing-finding-ids"],
    ];
    for (const [name, args, code] of cases) {
      const res = await client.callTool({ name, arguments: args });
      expect(res.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
      const data = JSON.parse(textOf(res));
      expect(data).toMatchObject({ contract: "oraculo-resposta/1.0.0", kind: "error", errorCode: code });
      expect(typeof data.error).toBe("string");
      expect(data.next.length, `${name} next`).toBeGreaterThan(0);
      for (const n of data.next) expect(JSON.stringify(n.arguments ?? {})).not.toMatch(/<[^>]+>/);
    }
    for (const [name, args, near] of [
      ["get_ds_rules", { componente: "modal", query: "foco" }, "component"],
      ["get_ds_rules", { q: "foco" }, null],
      ["get_ds_rules", { context: { components: ["modal"], extra: 1 } }, null],
      ["get_component_spec", { component: "modal", includeExamples: true }, "include_examples"],
      ["get_emag_rules", { recommendation: "4.4" }, null],
      ["get_design_tokens", { name: "focus" }, null],
    ] as Array<[string, Record<string, unknown>, string | null]>) {
      const res = await client.callTool({ name, arguments: args });
      expect(res.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
      const text = textOf(res);
      expect(text).toMatch(/unrecognized_keys|campo desconhecido/);
      if (near) expect(text).toContain(`você quis dizer '${near}'`);
    }
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
    // 2.6.0 (D-51): os exemplos oficiais de breadcrumb, footer e menu escrevem <a class="br-button">.
    expect(data.tags).toEqual(["a", "button"]);
    expect(data.tagSources.a).toEqual(["breadcrumb", "footer", "menu"]);
    expect(data.constraints).toContainEqual({
      id: "ds-structure-button-tag",
      // 3.6.0: o id é o check; o achado cita o e-MAG 1.2 (tag raiz semântica).
      citeAs: "govbr-3.7.0-accessibility-global-7c91abad32ce",
      kind: "root-tag",
      description: "br-button deve ser aplicado a <button>. <a> vale quando o link navega (href real), como nos exemplos oficiais de outros componentes.",
      rootClass: "br-button",
      allowedTags: ["a", "button"],
    });
    expect(data.variantClasses).toContain("circle");
    // 3.0.0 (§7.8): um exemplo por chamada.
    expect(data.example.name).toBe(data.availableExamples[0]);
    expect(data.examples).toBeUndefined();
    const second = JSON.parse(textOf(await client.callTool({ name: "get_component_spec", arguments: { component: "button", example: data.availableExamples[1] } })));
    expect(second).toMatchObject({ kind: "component-example", component: "button", example: { name: data.availableExamples[1] } });
  });

  it("get_component_spec gives input root-tag evidence a citable checker id", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "input" } });
    const data = JSON.parse(textOf(res));
    expect(data.constraints).toContainEqual(expect.objectContaining({
      id: "ds-structure-input-tag",
      rootClass: "br-input",
      allowedTags: ["div"],
    }));
  });

  it("get_component_spec omits HTML examples by default; rules by strategy with at most 3 exact next steps", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "button" } });
    const data = JSON.parse(textOf(res));
    expect(data.example).toBeUndefined();
    expect(data.availableExamples.length).toBeGreaterThan(0);
    expect(data.exampleNext).toEqual({ tool: "get_component_spec", arguments: { component: "button", example: data.availableExamples[0] } });
    expect(data.rules.ids).toBeUndefined();
    expect(Object.values(data.rules.byStrategy as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(data.rules.total);
    expect(data.rules.next.length).toBeLessThanOrEqual(3);
    for (const n of data.rules.next) expect(n).toMatchObject({ action: "request-detail", tool: "get_ds_rules", arguments: { context: { components: ["button"] }, limit: 5 } });
    expect(data.gaps[0]).toMatchObject({ kind: "state-not-covered" });
  });

  it("get_component_spec lists alternatives for unknown components (isError + errorCode + next)", async () => {
    const res = await client.callTool({ name: "get_component_spec", arguments: { component: "nope" } });
    expect(res.isError).toBe(true);
    const data = JSON.parse(textOf(res));
    expect(data.error).toBeDefined();
    expect(data.errorCode).toBe("unknown-component");
    expect(data.available).toContain("button");
    expect(data.next.length).toBeGreaterThan(0);
    // B-19: nomes do protótipo de Object não quebram a ferramenta.
    const proto = await client.callTool({ name: "get_component_spec", arguments: { component: "constructor" } });
    expect(proto.isError).toBe(true);
    expect(JSON.parse(textOf(proto)).errorCode).toBe("unknown-component");
  });
});

describe("get_ds_rules — the KB rule store (D-11)", () => {
  it("warns that a truncated template excerpt cannot entail a mandatory footer", async () => {
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: { ids: ["govbr-3.7.0-template-global-19f93475dc5e"], detail: "full" },
    });
    const data = JSON.parse(textOf(res));
    expect(data.results[0].caveats).toContainEqual(expect.stringMatching(/não derive obrigatoriedade/i));
  });

  it("force=required lists the 1102 required rules (2.12.0, literal version), within the budget, by cursor", async () => {
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: { force: "required", limit: 200 },
    });
    const text = textOf(res);
    expect(text.length).toBeLessThanOrEqual(8_000);
    const data = JSON.parse(text);
    expect(data.kind).toBe("listing");
    expect(data.total).toBe(1102);
    expect(data.page.limit).toEqual({ requested: 200, applied: 50, ceiling: 50 });
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.every((r: { force: string }) => r.force === "required")).toBe(true);
    expect(data.page.cursor).toMatch(/^c1\./);
  });

  it("component=button returns only button rules with the full projection", async () => {
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: { component: "button", detail: "full" },
    });
    const data = JSON.parse(textOf(res));
    expect(data.items.length).toBeGreaterThan(0);
    for (const r of data.items) {
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
    expect(data.items.length).toBeGreaterThan(0);
    expect(
      data.items.every(
        (r: { automatable: boolean; automationConfidence: string }) =>
          r.automatable && r.automationConfidence === "high"
      )
    ).toBe(true);
  });

  it("returns a normative facet index instead of the whole KB when called without filters", async () => {
    const res = await client.callTool({ name: "get_ds_rules", arguments: {} });
    const data = JSON.parse(textOf(res));
    expect(data.kind).toBe("index");
    expect(data.kb.totalNormative).toBe(3004);
    expect(data.items).toBeUndefined();
    expect(data.facets.force.example).toBeUndefined();
    expect(data.note).toContain("Índice, não listagem");
  });

  it("explicit limit with no other filter pages the whole normative base by cursor, without loops (2.9.0 fix)", async () => {
    const first = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: { limit: 50 } })));
    expect(first.facets).toBeDefined();
    expect(first.total).toBe(3004);
    expect(first.page.offset).toBe(0);
    const ids: string[] = first.items.map((r: { id: string }) => r.id);
    let cursor = first.page.cursor;
    let pages = 1;
    while (cursor) {
      const page = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: { limit: 50, cursor } })));
      expect(page.facets).toBeUndefined(); // a continuação não repete o cabeçalho
      expect(page.page.offset).toBe(ids.length);
      ids.push(...page.items.map((r: { id: string }) => r.id));
      expect(page.page.cursor).not.toBe(cursor);
      cursor = page.page.cursor;
      pages += 1;
      expect(pages).toBeLessThan(200);
    }
    expect(ids).toHaveLength(3004);
    expect(new Set(ids).size).toBe(3004);
    // Só offset (legado) também é pedido de listagem, com aviso de depreciação.
    const tail = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: { offset: 2990 } })));
    expect(tail.items.map((r: { id: string }) => r.id)).toEqual(ids.slice(2990));
    expect(tail.page.cursor).toBeNull();
    expect(tail.deprecation).toContain("4.0.0");
  });

  it("serves evidence only through the separate 'evidence' channel", async () => {
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: { component: "accordion", include_evidence: true },
    });
    const data = JSON.parse(textOf(res));
    expect(data.items.some((r: { force: string }) => r.force === "example")).toBe(false);
    expect(data.evidence.items.length).toBeGreaterThan(0);
    expect(data.evidence.items.every((r: { component: string }) => r.component === "accordion")).toBe(true);
    expect(data.evidence.note).toContain("NÃO normas");
  });

  it("fetches a full rule record by exact id", async () => {
    const list = JSON.parse(
      textOf(await client.callTool({ name: "get_ds_rules", arguments: { force: "prohibited" } }))
    );
    const id = list.items[0].id;
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
    const ids = seed.items.map((rule: { id: string }) => rule.id);
    const res = await client.callTool({
      name: "get_ds_rules",
      arguments: { ids: [...ids, "govbr-3.7.0-missing", ids[0]] },
    });
    const data = JSON.parse(textOf(res));
    expect(data.kind).toBe("lookup");
    expect(data.requested).toBe(ids.length + 1); // duplicatas contam uma vez (B-22)
    expect(data.results.map((rule: { citeAs: string }) => rule.citeAs)).toEqual(ids);
    expect(data.results.every((rule: { kind: string }) => rule.kind === "normative")).toBe(true);
    expect(data.results[0]).not.toHaveProperty("why");
    expect(data.results[0].toVerify.length).toBeGreaterThan(0);
    expect(data.missing).toEqual(["govbr-3.7.0-missing"]);
    expect(data.absenceNote).toBe(ABSENCE_NOTE);
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

describe("get_ds_rules on the literal knowledge version (2.12.0, D-119)", () => {
  it("Input brings 'feedback visual imediato' and 'ajuda contextual' from its accessibility tab", async () => {
    const data = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: { component: "input", limit: 200, detail: "brief" } })));
    expect(data.total).toBe(64);
    const texts: string[] = [];
    let page = data;
    for (let i = 0; i < 20; i++) {
      texts.push(...page.items.map((r: { normalizedRule: string }) => r.normalizedRule));
      if (!page.page.cursor) break;
      page = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: { component: "input", limit: 200, detail: "brief", cursor: page.page.cursor } })));
    }
    expect(texts).toHaveLength(64);
    expect(texts.join(" ")).toContain("feedback visual imediato");
    expect(texts.join(" ")).toContain("ajuda contextual");
  });

  it("context for input returns the literal rules as candidates", async () => {
    const data = JSON.parse(
      textOf(await client.callTool({ name: "get_ds_rules", arguments: { context: { components: ["input"] }, limit: 200 } }))
    );
    expect(data.kind).toBe("retrieval");
    expect(data.page.matched).toBeGreaterThan(0);
    expect(data.page.limit).toEqual({ requested: 200, applied: 10, ceiling: 10 });
    expect(data.results.every((c: { force: string }) => c.force !== "example")).toBe(true);
    expect(data.results.every((c: { status: string; applicability: string }) => c.status === "investigate" && c.applicability === "unknown")).toBe(true);
  });

  it("kb names the served knowledge version", async () => {
    const data = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: {} })));
    expect(data.kb).toMatchObject({ dsVersion: "3.7.0", knowledgeVersion: "3.7.0-literal-2026-10-15" });
  });

  it("context page 1 interleaves the observed components; the continuation does not repeat the header", async () => {
    const form = ["input", "datetimepicker", "upload", "button"];
    const data = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: { context: { components: form } } })));
    // 3.4.0 (A12): kb-relations liga a e-MAG 1.2 (global) ao Button → a global relacionada abre a alternância.
    const firstGroups = new Set(data.results.slice(0, 5).map((c: { why: { matched: string[] } }) => c.why.matched[0]));
    // 3.5.0 (kb-relations-1.2.0, P6): o Input (1º observado) agora tem ligações (placeholder × rótulo) e abre a
    // alternância das globais relacionadas antes do Button.
    expect([...firstGroups].sort()).toEqual([...form.map((c) => `componente:${c}`), "relacionado:input@kb-relations-1.2.0"].sort());
    expect(data.groups).toBeUndefined();
    expect(data.page.cursor).toMatch(/^c1\./);
    const page2 = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: { context: { components: form }, cursor: data.page.cursor } })));
    expect(page2.kb).toBeUndefined();
    expect(page2.reading).toBeUndefined();
    expect(page2.results[0].rank).toBe(data.results.length + 1);
  });

  it("global rules matched by terms (e-MAG, form patterns) share page 1 with the components", async () => {
    const context = { components: ["input", "datetimepicker", "upload", "button"], terms: ["formulario", "erro", "obrigatorio"] };
    const data = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: { context } })));
    // Interleave unchanged (global first, then each component once, A→Z) — read across the cursor.
    const next = JSON.parse(textOf(await client.callTool({ name: "get_ds_rules", arguments: { context, cursor: data.page.cursor } })));
    const rows = [...data.results, ...next.results].slice(0, 5);
    const groups = rows.map((c: { why: { matched: string[] }; source: unknown; ids: string[] }) =>
      c.why.matched.find((m) => m.startsWith("componente:"))?.slice("componente:".length) ?? "(global)");
    // 3.3.0 (A-12): linhas de tabela (API/anatomia) vão para depois da prosa; a alternância vale entre as de prosa.
    expect(groups[0]).toBe("(global)");
    expect(new Set(groups.slice(1, 3)).size).toBe(2);
    const isRow = (c: { note?: { code?: string } }) => c.note?.code === "table-row";
    const firstRow = rows.findIndex(isRow);
    if (firstRow >= 0) expect(rows.slice(firstRow).every(isRow)).toBe(true);
  });

  it("a superseded 3.7.0 id still resolves, flagged as legacy with its replacement", async () => {
    const data = JSON.parse(
      textOf(await client.callTool({ name: "get_ds_rules", arguments: { id: "govbr-3.7.0-accessibility-global-e6fd5e1247de" } }))
    );
    expect(data.rule.legacy).toMatchObject({ class: "superseded", supersededBy: ["govbr-3.7.0-accessibility-global-cba01678f54a"] });
    const batch = JSON.parse(
      textOf(await client.callTool({ name: "get_ds_rules", arguments: { ids: ["govbr-3.7.0-accessibility-global-e6fd5e1247de"] } }))
    );
    expect(batch.missing).toEqual([]);
    expect(batch.results[0].kind).toBe("historical");
    expect(batch.results[0].legacyResolution.status).toBe("mapped");
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

  it("grounds a finding citing a real normative KB rule id without confirming it (no predicate)", async () => {
    const list = JSON.parse(
      textOf(await client.callTool({ name: "get_ds_rules", arguments: { force: "required", detail: "brief" } }))
    );
    const rule = list.items[0];
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
    expect(res.verification.verdict).toBe("unverifiable");
    expect(res.verification.checks).toMatchObject({ ruleExists: "pass", applicability: "pass", violation: "no-predicate" });
  });

  it("2.12.0: a dropped legacy id exists but does not ground a finding; a superseded one goes through its successor", async () => {
    const verify = async (id: string, fid: string) =>
      JSON.parse(
        textOf(
          await client.callTool({
            name: "verify_finding",
            arguments: { finding: { ...baseFinding, id: fid, rule: { id, source: "govbr-ds-kb", description: "x" } } },
          })
        )
      ).verification;
    const dropped = await verify("govbr-3.7.0-accessibility-breadcrumb-992f162ca821", "F-930");
    expect(dropped.checks).toMatchObject({ ruleExists: "pass", applicability: "unknown" });
    expect(JSON.stringify(dropped)).toContain("regra sem texto na fonte oficial coletada");
    const superseded = await verify("govbr-3.7.0-accessibility-global-7d2b85f81c52", "F-931");
    expect(superseded.checks).toMatchObject({ ruleExists: "pass", applicability: "pass" });
    expect(JSON.stringify(superseded)).toContain("substituído por");
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
  it("grounds real rules without confirming them, and rejects hallucinated rules via MCP", async () => {
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
    expect(ok.verification.verdict).toBe("unverifiable");
    expect(ok.verification.checks.ruleExists).toBe("pass");

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
    expect(res.accepted).toBe(0);
    expect(res.rejected).toHaveLength(2);
    expect(res.rejected[0].errors[0]).toContain("finding_ids");
    expect(res.rejected[1].errors[0]).toContain("verify_finding");
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
