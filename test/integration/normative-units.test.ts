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
      const listed39 = section.section.rules.find((r: any) => r.id === "3.9").normativeContext;
      expect(listed39).toMatchObject({ status: "context-deferred", clauses: emag.normativeContext.clauses.length, next: { tool: "get_emag_rules", arguments: { id: "3.9" } } });
      expect(section.normativeContextNote).toContain("aplicabilidade desconhecida");
      expect((await call(listed39.next.tool, listed39.next.arguments)).normativeContext).toEqual(emag.normativeContext);
      const rule = emag.normativeContext.clauses.find((r: any) => r.force === "required" && r.originalText.includes("resumo"));
      const ds = await call("get_ds_rules", { id: rule.id });
      expect(ds.normativeContext.sourceContext.text).toBe(emag.normativeContext.sourceContext.text);
      const brief = await call("get_ds_rules", { ids: [rule.id] });
      expect(brief.rules[0].normativeContext).toMatchObject({ status: "context-deferred", sourceParagraph: true, next: { arguments: { id: rule.id } } });
      expect(brief.normativeContextNote).toContain("aplicabilidade desconhecida");
      const fullIds = await call("get_ds_rules", { ids: [rule.id], detail: "full" });
      const fullCtx = fullIds.rules[0].normativeContext;
      if (fullCtx.status === "context-deferred") expect(fullCtx.next.arguments.id).toBe(rule.id);
      else expect(fullCtx.sourceContext.text).toContain("tabelas extensas");
      expect(JSON.stringify(fullCtx, null, 2).length).toBeLessThanOrEqual(2500);
      const filtered = await call("get_ds_rules", { standard: "eMAG", query: "Links adjacentes devem", force: "required" });
      const pointer = filtered.rules[0].normativeContext;
      const exact = await call(pointer.next.tool, pointer.next.arguments);
      expect(exact.normativeContext.adjacentClauses).toHaveLength(pointer.adjacentClauses);
      expect(exact.normativeContext.adjacentClauses.some((r: any) => r.force === "permitted")).toBe(true);
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
      // 2.16.1: listings carry pointers, never inline units. Declared caps on the response text
      // (2.16.0 measured 34,706 / 37,109 / 69,927 / 241,400 / 225,739 / 5,937 chars).
      const sized: Array<[Record<string, unknown>, number]> = [
        [{ component: "input", limit: 5 }, 8_000],
        [{ component: "input", limit: 5, detail: "full" }, 8_000],
        [{ query: "upload" }, 12_000],
        [{ query: "tabela" }, 30_000],
        [{ component: "pagination" }, 30_000],
        [{ query: "página atual", component: "pagination" }, 2_000],
      ];
      for (const [args, cap] of sized) {
        const text = (await client.callTool({ name: "get_ds_rules", arguments: args })).content.map((c: any) => c.text).join("\n");
        console.info(`NAT-96 list ${JSON.stringify(args)}: ${text.length} chars`);
        expect(text.length).toBeLessThanOrEqual(cap);
        for (const r of JSON.parse(text).rules) {
          if (r.normativeContext) expect(Object.keys(r.normativeContext).sort()).toEqual(["adjacentClauses", "next", "sourceParagraph", "status"]);
        }
      }
      // The exact-id call still returns the whole unit: every same-section sibling clause.
      const inputs = await call("get_ds_rules", { component: "input", limit: 5 });
      const withSiblings = inputs.rules.find((r: any) => r.normativeContext?.adjacentClauses > 0);
      const single = await call("get_ds_rules", { id: withSiblings.id });
      const kbRule = single.rule;
      expect(single.normativeContext.mainClause.id).toBe(kbRule.id);
      expect(single.normativeContext.adjacentClauses).toHaveLength(withSiblings.normativeContext.adjacentClauses);
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
