import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { procedureOf } from "../../src/tools/componentChecklist.js";
import { getRuleById } from "../../src/data/knowledge.js";

describe("A4 — procedimento completo com contexto pelo MCP", () => {
  it("checklist pagina o contexto literal sem cortar sujeito, breakpoint ou valor", async () => {
    const server = createServer({ toolProfile: "evaluation", knowledgeLock: "call" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    const client = new Client({ name: "a4-scope", version: "1" });
    await client.connect(a);
    try {
      const received = new Map<string, any>();
      for (const component of ["button", "carousel", "signin", "pagination", "checkbox", "datetimepicker"]) {
        let cursor: number | undefined = 0;
        let pages = 0;
        do {
          const r = await client.callTool({ name: "get_component_spec", arguments: { component, view: "checklist", cursor } });
          expect(r.isError).toBeFalsy();
          const text = (r.content as Array<{ text: string }>)[0].text;
          expect(text.length).toBeLessThanOrEqual(8000);
          const data = JSON.parse(text);
          for (const item of data.items) {
            const proc = procedureOf(getRuleById(item.citeAs)!, component);
            if (!proc?.context || item.measure.automatic) continue;
            expect(item.measure.procedure).toEqual(proc);
            received.set(item.citeAs, item.measure.procedure);
          }
          if (data.nextCursor !== undefined) expect(data.nextCursor).toBeGreaterThan(cursor!);
          cursor = data.nextCursor;
          expect(++pages).toBeLessThan(100);
        } while (cursor !== undefined);
      }
      expect(received.get("govbr-3.7.0-component-signin-ba7b11bddab7").context.text).toMatch(/[áa]rea da imagem/);
      expect(received.get("govbr-3.7.0-component-pagination-7337f527bbbc").expect).toBe("valor resolvido de --font-size-scale-base");
      expect(received.get("govbr-3.7.0-accessibility-button-23e3cfbf49f3").when).toMatch(/ícone decorativo/);
    } finally { await client.close(); }
  });
});
