import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as httpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { applyActions, PageActionsSchema, type PageAction } from "../../src/scan/actions.js";
import { fingerprintPage } from "../../src/scan/state.js";
import { scanPage, PageScanCache } from "../../src/scan/pageScan.js";
import { knowledgeLockAttempts, resetKnowledgeLock, runKnowledgeLocked } from "../../src/data/lock.js";

const file = { name: "amostra.txt", mimeType: "text/plain", size: 17 };
const html = `<!doctype html><html lang="pt-BR"><head><title>Documentos</title></head><body><main>
<h1>Documentos</h1><label for="single">Arquivo</label><input id="single" type="file">
<label for="multi">Arquivos</label><input id="multi" type="file" multiple>
<input class="duplicate" type="file"><input class="duplicate" type="file">
<div id="drop">Soltar</div><div id="replace">Trocar</div><div id="ignore">Ignorar</div><div id="reject">Validar</div>
<p id="status" hidden>Recebido</p><open-box></open-box>
<script>
customElements.define('open-box',class extends HTMLElement{connectedCallback(){this.attachShadow({mode:'open'}).innerHTML='<input type="file" id="inside">'}});
window.received=[]; window.events=[];
drop.addEventListener('dragenter', e=>events.push(e.type));
drop.addEventListener('dragover', e=>{events.push(e.type);e.preventDefault()});
drop.addEventListener('drop',async e=>{e.preventDefault();events.push(e.type);window.trusted=e.isTrusted;
 window.received=await Promise.all(Array.from(e.dataTransfer.files,async f=>({name:f.name,type:f.type,size:f.size,lastModified:f.lastModified,zero:Array.from(new Uint8Array(await f.arrayBuffer())).every(x=>x===0)})));
 document.querySelector('#status').hidden=false;});
replace.addEventListener('dragenter',()=>{replace.outerHTML='<div id="replace">A</div><div id="replace">B</div>'});
reject.addEventListener('drop',e=>{if(Array.from(e.dataTransfer.files).every(f=>f.type==='application/pdf'))document.querySelector('#status').hidden=false;});
</script></main></body></html>`;
let server: Server, url: string, browser: Browser, page: Page;
beforeAll(async () => {
  server = httpServer((_req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(html); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});
afterAll(async () => { await browser?.close(); await closeBrowser(); await new Promise<void>((resolve) => server.close(() => resolve())); });
const upload = (selector: string, files = [file]): PageAction => ({ action: "upload", selector, files });
const drop = (selector: string): PageAction => ({ action: "drop", selector, files: [file] });

describe("synthetic file contract", () => {
  it("rejects paths, contents, unknown fields, invalid MIME and invalid sizes/counts", () => {
    const bad = [
      { ...file, name: "../a" }, { ...file, name: "C:\\a" }, { ...file, name: ".." },
      { ...file, mimeType: "Text/Plain" }, { ...file, mimeType: "text/plain\n" },
      { ...file, size: -1 }, { ...file, size: 1.1 }, { ...file, size: 1_048_577 },
      { ...file, path: "secreto" }, { ...file, buffer: "AA==" },
      ...["\r", "\n", "\u2028", "\u2029"].flatMap(end => [{ ...file, name: file.name + end }, { ...file, mimeType: file.mimeType + end }]),
    ];
    for (const f of bad) expect(PageActionsSchema.safeParse([{ action: "upload", selector: "#single", files: [f] }]).success).toBe(false);
    expect(PageActionsSchema.safeParse([{ ...upload("#single"), path: "local" }]).success).toBe(false);
    expect(PageActionsSchema.safeParse([upload("#single", Array(6).fill(file))]).success).toBe(false);
    expect(PageActionsSchema.safeParse([{ action: "drop", selector: "#drop", files: [] }]).success).toBe(false);
    expect(PageActionsSchema.safeParse([upload("#single", [])]).success).toBe(true);
    const five = Array(5).fill({ ...file, size: 1_048_576 });
    expect(PageActionsSchema.safeParse([upload("#multi", five)]).success).toBe(true);
    expect(PageActionsSchema.safeParse([upload("#multi", five), upload("#single")]).success).toBe(false);
  });

  it("uploads bytes and metadata, supports multiple/empty lists and open shadow roots", async () => {
    await page.goto(url);
    const result = await applyActions(page, [upload("#single"), upload("#multi", [file, { ...file, name: "outro.txt", size: 0 }]), upload("open-box #inside")]);
    expect(result.status).toBe("applied");
    expect(result.steps[0]).toMatchObject({ matched: 1, files: [file], method: "set-input-files", limitation: expect.stringContaining("sintéticos") });
    expect(await page.locator("#multi").evaluate((el) => Array.from((el as HTMLInputElement).files!, f => [f.name, f.size, f.type]))).toEqual([[file.name, 17, file.mimeType], ["outro.txt", 0, file.mimeType]]);
    expect(await page.locator("#single").evaluate(async el => Array.from(new Uint8Array(await (el as HTMLInputElement).files![0].arrayBuffer())))).toEqual(Array(17).fill(0));
    expect((await applyActions(page, [upload("#single", [])])).status).toBe("applied");
    expect(await page.locator("#single").evaluate(el => (el as HTMLInputElement).files!.length)).toBe(0);
  });

  it("dispatches ordered untrusted drag events with deterministic files", async () => {
    await page.goto(url);
    const result = await applyActions(page, [drop("#drop"), { action: "wait", selector: "#status" }]);
    expect(result.status).toBe("applied");
    expect(result.steps[0]).toMatchObject({ files: [file], method: "synthetic-drag-events" });
    expect(await page.evaluate(() => ({ events: (window as any).events, files: (window as any).received, trusted: (window as any).trusted }))).toEqual({
      events: ["dragenter", "dragover", "drop"], files: [{ name: file.name, type: file.mimeType, size: 17, lastModified: 0, zero: true }], trusted: false,
    });
  });

  it("refuses ambiguous/missing/invalid targets, wrong input type and multiple files on single input", async () => {
    await page.goto(url);
    for (const action of [upload(".duplicate"), drop(".duplicate")]) {
      expect(await applyActions(page, [action])).toMatchObject({ status: "failed", steps: [], failure: { reason: "ambiguous", matched: 2 } });
    }
    expect(await applyActions(page, [upload("#absent")])).toMatchObject({ status: "failed", failure: { reason: "not-found", matched: 0 } });
    expect(await applyActions(page, [drop("div[[")])).toMatchObject({ status: "failed", failure: { reason: "invalid-selector" } });
    for (const action of [upload("#drop"), upload("#single", [file, file])]) {
      expect(await applyActions(page, [action])).toMatchObject({ status: "failed", steps: [], failure: { reason: "action-failed" } });
    }
    expect(await applyActions(page, [drop("#replace")])).toMatchObject({ status: "failed", steps: [], failure: { reason: "ambiguous", matched: 2 } });
  });

  it("fingerprints metadata absent from HTML/value, preserving empty-input identity", async () => {
    await page.goto(url);
    const empty = await fingerprintPage(page);
    await applyActions(page, [upload("#single")]);
    const first = await fingerprintPage(page);
    await applyActions(page, [upload("#single", [{ ...file, size: 18 }])]);
    expect(await fingerprintPage(page)).not.toBe(first);
    await applyActions(page, [upload("#single")]);
    expect(await fingerprintPage(page)).toBe(first);
    await applyActions(page, [upload("#single", [])]);
    expect(await fingerprintPage(page)).toBe(empty);
  });

  it("replays/cache exactly and does not call an ignored drop an arrived state", async () => {
    const cache = new PageScanCache(5);
    const args = { url, checks: ["axe"] as ["axe"], actions: [upload("#single")] };
    const first = await scanPage(args, cache);
    const second = await scanPage(args, cache);
    expect(first.status).toBe("scanned"); expect(second.status).toBe("scanned");
    if (first.status !== "scanned" || second.status !== "scanned") throw new Error("scan não alcançado");
    expect(second.cacheHit).toBe(true); expect(second.stateFingerprint).toBe(first.stateFingerprint);
    expect(first.coverage.actionsApplied[0]).toMatchObject({ files: [file], method: "set-input-files" });
    const changed = await scanPage({ ...args, actions: [upload("#single", [{ ...file, size: 18 }])] }, cache);
    expect(changed.status).toBe("scanned");
    expect(changed.status === "scanned" && changed.cacheHit).toBe(false);
    expect(changed.stateFingerprint).not.toBe(first.stateFingerprint);
    const ignored = await scanPage({ url, checks: ["axe"], actions: [drop("#ignore")], arrival: { visible: "#status" } }, cache);
    expect(ignored.status).toBe("state-not-reached");
    expect(ignored.state.replay.status).toBe("applied");
    const rejected = await scanPage({ url, checks: ["axe"], actions: [drop("#reject")], arrival: { visible: "#status" } }, cache);
    expect(rejected.status).toBe("state-not-reached");
    expect(rejected.state.replay.status).toBe("applied");
    const accepted = await scanPage({ url, checks: ["axe"], actions: [{ action: "drop", selector: "#reject", files: [{ ...file, mimeType: "application/pdf" }] }], arrival: { visible: "#status" } }, cache);
    expect(accepted.status).toBe("scanned");
  });
});

describe("scan/verify common file recipe and knowledge-free", () => {
  it.each(["evaluation", "knowledge-free"] as const)("%s serves and replays the same recipe without invented verdict", async profile => {
    resetKnowledgeLock();
    const run = async () => {
      const client = new Client({ name: "files-test", version: "1" });
      const service = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "files-")) });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await service.connect(a); await client.connect(b);
      try {
        const listed = await client.listTools();
        for (const name of ["scan_page", "verify_finding"]) {
          const schema = JSON.stringify(listed.tools.find(t => t.name === name)!.inputSchema);
          expect(schema).toContain('"upload"'); expect(schema).toContain('"drop"');
        }
        const call = async (name: string, args: Record<string, unknown>) => {
          const result = await client.callTool({ name, arguments: args });
          expect(result.isError).not.toBe(true);
          return JSON.parse((result.content as any[]).find(c => c.type === "text").text);
        };
        const scan = await call("scan_page", { url, actions: [upload("#single")], ...(profile === "evaluation" ? { checks: ["axe"] } : {}), maxChars: 20000 });
        expect(scan.scanId).toBeTruthy();
        // Página neutra tem inputs sem label: usar evidência emitida, sem conhecimento DS.
        const details = await call("get_finding_details", { scanId: scan.scanId, view: "findings", detail: "full", maxChars: 20000 });
        const findings = details.findings ?? details.items;
        expect(findings?.length).toBeGreaterThan(0);
        const finding = findings[0];
        const verified = await call("verify_finding", { finding, live: true, scanId: scan.scanId });
        expect(verified.verification.binding.state).toMatchObject({ scanId: scan.scanId, reached: true, mismatches: [] });
        const dropped = await call("scan_page", { url, actions: [drop("#drop"), { action: "wait", selector: "#status" }], arrival: { visible: "#status" }, ...(profile === "evaluation" ? { checks: ["axe"] } : {}), maxChars: 20000 });
        const dropDetails = await call("get_finding_details", { scanId: dropped.scanId, view: "findings", detail: "full", maxChars: 20000 });
        const dropVerified = await call("verify_finding", { finding: dropDetails.findings[0], live: true, scanId: dropped.scanId });
        expect(dropVerified.verification.binding.state).toMatchObject({ scanId: dropped.scanId, reached: true, mismatches: [] });
        const invalid = await client.callTool({ name: "scan_page", arguments: { url, actions: [{ ...upload("#single"), path: "local" }] } });
        expect(invalid.isError).toBe(true);
      } finally { await client.close(); await service.close(); }
    };
    if (profile === "knowledge-free") { await runKnowledgeLocked(run); expect(knowledgeLockAttempts()).toEqual({ attempts: 0, loaders: [] }); }
    else await run();
  });
});
