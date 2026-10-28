import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

describe("NAT-96 MCP and core execution provenance", () => {
  it("shares contextual eMAG3.9 description and preserves alternatives under main force filtering", async () => {
    const server = createServer({ reportsDir: mkdtempSync(join(tmpdir(), "nat96-")), toolProfile: "evaluation" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "nat96", version: "1" });
    await server.connect(st); await client.connect(ct);
    const call = async (name: string, args: Record<string, unknown>) => JSON.parse((await client.callTool({ name, arguments: args })).content.map((c: any) => c.text).join("\n"));
    try {
      const emag = await call("get_emag_rules", { id: "3.9" });
      expect(emag.contract).toBe("oraculo-resposta/1.0.0");
      expect(emag.description).toContain("tabelas extensas");
      expect(emag.normativeContext.contextCompleteness).toContain("não exaustivos");
      // 3.3.0 (B-09): o template aponta a cláusula CORRENTE que obriga; o id histórico fica em from/historicalRuleId.
      expect(emag.validationTemplate.citation).toMatchObject({ kind: "current", basis: "emag-unit-obligation", from: { kind: "historical", legacyResolution: { status: "mapped" } } });
      expect(emag.validationTemplate.ruleId).toBe(emag.validationTemplate.citation.id);
      expect(emag.normativeContext.clauses.map((c: any) => c.id)).toContain(emag.validationTemplate.ruleId);
      expect(["required", "prohibited"]).toContain(emag.normativeContext.clauses.find((c: any) => c.id === emag.validationTemplate.ruleId).force);
      expect((await call("get_ds_rules", { id: emag.validationTemplate.historicalRuleId })).kind).toBe("historical");
      expect((await call("get_ds_rules", { id: emag.validationTemplate.ruleId })).kind).toBe("normative");
      const section = await call("get_emag_rules", { section: 3 });
      expect(section.section.rules.find((r: any) => r.id === "3.9").description).toBe(emag.description);
      // 3.0.0 (§8): a listagem da seção leva `more` (contagem + chamada por id), não o ponteiro normativeContext.
      const listed39 = section.section.rules.find((r: any) => r.id === "3.9").more;
      expect(listed39).toMatchObject({ clauses: emag.normativeContext.clauses.length, next: { tool: "get_emag_rules", arguments: { id: "3.9" } } });
      expect(section.note).toContain("Aplicabilidade desconhecida");
      expect((await call(listed39.next.tool, listed39.next.arguments)).normativeContext).toEqual(emag.normativeContext);
      const rule = emag.normativeContext.clauses.find((r: any) => r.force === "required" && r.originalText.includes("resumo"));
      const ds = await call("get_ds_rules", { id: rule.id });
      expect(ds.normativeContext.sourceContext.text).toBe(emag.normativeContext.sourceContext.text);
      // §7.7: por id, sem duplicar rule.source nem o texto da regra.
      expect(ds.normativeContext.mainClause).toEqual({ id: rule.id, ref: "rule", applicability: "unknown" });
      const brief = await call("get_ds_rules", { ids: [rule.id] });
      expect(brief.results[0].more).toMatchObject({ next: { arguments: { id: rule.id } } });
      expect(brief.results[0].applicability).toBe("unknown");
      const fullIds = await call("get_ds_rules", { ids: [rule.id], detail: "full" });
      expect(fullIds.results[0].normativeContext).toMatchObject({ status: "context-deferred", next: { arguments: { id: rule.id } } });
      const filtered = await call("get_ds_rules", { standard: "eMAG", query: "Links adjacentes devem", force: "required" });
      const pointer = filtered.results[0].more;
      const exact = await call(pointer.next.tool, pointer.next.arguments);
      expect(exact.normativeContext.adjacentClauses).toHaveLength(pointer.adjacentClauses);
      expect(exact.normativeContext.adjacentClauses.some((r: any) => r.force === "permitted")).toBe(true);
      for (const id of ["3.9", "4.4"]) {
        const text = (await client.callTool({ name: "get_emag_rules", arguments: { id } })).content.map((c: any) => c.text).join("\n");
        console.info(`NAT-99 eMAG${id}: ${text.length} chars`);
        expect(text.length).toBeLessThanOrEqual(8_000);
      }
      for (const terms of [["CAPTION"], ["foco"], ["placeholder"]]) {
        const text = (await client.callTool({ name: "get_ds_rules", arguments: { context: { terms }, limit: 5 } })).content.map((c: any) => c.text).join("\n");
        expect(text.length).toBeLessThanOrEqual(8_000);
      }
      const large = await call("get_ds_rules", { context: { components: ["cookiebar"] }, query: "abertura/fechamento da classe" });
      expect(large.results.length).toBeGreaterThan(0);
      const followUp = await call(large.results[0].more.next.tool, large.results[0].more.next.arguments);
      expect(followUp.normativeContext.totalAdjacent).toBe(large.results[0].more.adjacentClauses);
      // 3.0.0: toda resposta inicial no teto de 8.000 caracteres (2.16.1: 34,7k / 37,1k / 69,9k / 241k / 226k).
      const sized: Array<Record<string, unknown>> = [
        { component: "input", limit: 5 },
        { component: "input", limit: 5, detail: "full" },
        { query: "upload" },
        { query: "tabela" },
        { component: "pagination" },
        { query: "página atual", component: "pagination" },
      ];
      for (const args of sized) {
        const text = (await client.callTool({ name: "get_ds_rules", arguments: args })).content.map((c: any) => c.text).join("\n");
        console.info(`NAT-99 ${JSON.stringify(args)}: ${text.length} chars`);
        expect(text.length).toBeLessThanOrEqual(8_000);
      }
      // The exact-id call still returns the whole unit: every same-section sibling clause.
      const inputs = await call("get_ds_rules", { query: "rótulo", component: "input" });
      const withSiblings = inputs.results.find((r: any) => r.more.adjacentClauses > 0);
      const single = await call("get_ds_rules", { id: withSiblings.citeAs });
      expect(single.normativeContext.mainClause.id).toBe(single.rule.id);
      expect(single.normativeContext.adjacentClauses).toHaveLength(withSiblings.more.adjacentClauses);
      expect(single.normativeContext.sourceContext).not.toBeNull();
      const spec = await call("get_component_spec", { component: "pagination" });
      expect(spec.implementationEvidence.staticExample.state).toBe("static-html-before-initialization");
      expect(spec.implementationEvidence.runtimeSource).toMatchObject({ version: "3.7.0", observedRuntime: false });
    } finally { await client.close(); await server.close(); }
  });

  it("official core3.7 pagination adds aria-current on init and moves it on interaction", async () => {
    const root = join(import.meta.dirname, "../../node_modules/@govbr-ds/core/dist/components/pagination");
    const html = readFileSync(join(root, "examples/pagination-default.html"), "utf8");
    const js = readFileSync(join(root, "pagination.js"), "utf8").replace("export default BRPagination", "window.BRPagination = BRPagination");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html);
      expect(await page.locator('[aria-current="page"]').count()).toBe(0);
      await page.addScriptTag({ content: js });
      await page.evaluate(() => { new (window as any).BRPagination("pagination", document.querySelector(".br-pagination")); });
      expect(await page.locator('[aria-current="page"]').allTextContents()).toEqual(["1"]);
      await page.locator(".page").filter({ hasText: /^2$/ }).click();
      expect(await page.locator('[aria-current="page"]').allTextContents()).toEqual(["2"]);
    } finally { await browser.close(); }
  });
});
