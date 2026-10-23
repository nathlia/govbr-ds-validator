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
      expect(emag.description).toContain("tabelas extensas");
      expect(emag.normativeContext.contextCompleteness).toContain("não exaustivos");
      expect(emag.validationTemplate.citation).toMatchObject({ kind: "historical", legacyResolution: { status: "mapped" } });
      expect((await call("get_ds_rules", { id: emag.validationTemplate.ruleId })).kind).toBe("historical");
      const section = await call("get_emag_rules", { section: 3 });
      expect(section.section.rules.find((r: any) => r.id === "3.9").description).toBe(emag.description);
      expect(section.section.rules.find((r: any) => r.id === "3.9").normativeContext.contextCompleteness).toBe(emag.normativeContext.contextCompleteness);
      const rule = emag.normativeContext.clauses.find((r: any) => r.force === "required" && r.originalText.includes("resumo"));
      const ds = await call("get_ds_rules", { id: rule.id });
      expect(ds.normativeContext.sourceContext.text).toBe(emag.normativeContext.sourceContext.text);
      const brief = await call("get_ds_rules", { ids: [rule.id] });
      expect(brief.rules[0].normativeContext.sourceContext.text).toContain("tabelas extensas");
      expect(brief.rules[0].normativeContext.contextCompleteness).toContain("não exaustivos");
      const filtered = await call("get_ds_rules", { standard: "eMAG", query: "Links adjacentes devem", force: "required" });
      expect(filtered.rules[0].normativeContext.adjacentClauses.some((r: any) => r.force === "permitted")).toBe(true);
      for (const id of ["3.9", "4.4"]) {
        const response = await call("get_emag_rules", { id });
        console.info(`NAT-96 eMAG${id}: ${JSON.stringify(response).length} chars`);
      }
      for (const terms of [["CAPTION"], ["foco"], ["placeholder"]]) {
        const response = await call("get_ds_rules", { context: { terms }, limit: 5 });
        expect(JSON.stringify(response, null, 2).length).toBeLessThanOrEqual(12_000);
      }
      for (const detail of ["summary", "brief", "full"]) {
        const large = await call("get_ds_rules", { context: { components: ["cookiebar"] }, query: "abertura/fechamento da classe", detail });
        expect(large.count).toBeGreaterThan(0);
        expect(JSON.stringify(large, null, 2).length).toBeLessThanOrEqual(12_000);
        const deferred = large.candidates[0].normativeContext;
        expect(deferred.status).toBe("context-deferred");
        expect(deferred.applicability).toBe("unknown");
        const followUp = await call(deferred.next.tool, deferred.next.arguments);
        expect(followUp.normativeContext.adjacentClauses).toHaveLength(deferred.deferred.adjacentClauses);
        expect(followUp.normativeContext.sourceContext).not.toBeNull();
      }
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
