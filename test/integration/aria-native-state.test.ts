/**
 * 3.7.3 A8 (NAT-111): estado ARIA × estado nativo. Matrizes em HTML neutro (fora das telas que motivaram): nativo com
 * ARIA correto, ARIA estático divergente, ARIA sem nativo, nativo sem ARIA, shadow DOM (host br-* do DS e host neutro),
 * depois de alternar por actions; scan e verify_finding nos perfis evaluation e knowledge-free.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as httpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { scanPage, PageScanCache, type PageScanResult } from "../../src/scan/pageScan.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { ariaNativePairs, ARIA_STATE_CONDITION, SWITCH_ARIA_CHECKED, SWITCH_PREFER_CHECKED, unverifiedAfterInteraction } from "../../src/checkers/ariaNativeState.js";
import { oracleFullyMeasures, oracleMeasuresFor } from "../../src/tools/oracleCoverage.js";
import { knowledgeLockAttempts, resetKnowledgeLock, runKnowledgeLocked } from "../../src/data/lock.js";
import type { ElementEvidence } from "../../src/evidence/types.js";
import type { Finding } from "../../src/schema/finding.js";
import type { NotJudgedItem } from "../../src/scan/notJudged.js";

const matrix = `<!doctype html><html lang="pt-BR"><head><title>Preferências</title></head><body><main><h1>Preferências</h1>
<div class="br-switch" role="presentation"><input id="sw-ok" type="checkbox" role="switch" aria-checked="false"><label for="sw-ok">Sincroniza</label></div>
<div class="br-switch" role="presentation"><input id="sw-stale" type="checkbox" role="switch" aria-checked="false"><label for="sw-stale">Estático</label></div>
<div class="br-switch" role="presentation"><input id="sw-rest" type="checkbox" role="switch" aria-checked="false" checked><label for="sw-rest">Ligado</label></div>
<div class="br-switch" role="presentation"><input id="sw-native" type="checkbox" role="switch"><label for="sw-native">Só nativo</label></div>
<div id="div-switch" role="switch" aria-checked="true" tabindex="0">Só ARIA</div>
<label><input id="cb-stale" type="checkbox" checked aria-checked="false"> Caixa</label>
<label><input id="cb-mixed" type="checkbox" aria-checked="mixed"> Parcial</label>
<label><input id="radio-ok" type="radio" name="r" aria-checked="false"> Opção</label>
<details id="det" open><summary aria-expanded="false">Detalhes</summary><p>Corpo</p></details>
<label for="sel">Lista</label><select id="sel"><option>Um</option><option aria-selected="true">Dois</option></select>
<button id="b-dis" disabled aria-disabled="false">Desabilitado</button>
<button id="b-focusable" aria-disabled="true">Desabilitado focável</button>
<button id="b-pressed" aria-pressed="true">Alternar</button>
<button id="b-exp" aria-expanded="false">Mais</button>
<label for="sel3">Outra</label><select id="sel3"><option>a</option><option hidden aria-selected="true">b</option></select>
<details id="det2"><p>Antes</p><summary>Primeiro</summary><summary aria-expanded="true">Segundo</summary></details>
<div class="br-switch" role="presentation"><input id="sw-mixed" type="checkbox" role="switch" aria-checked="false"><label for="sw-mixed">Indeterminado</label></div>
<label for="req">Nome</label><input id="req" required aria-required="false">
<label for="req2">CPF</label><input id="req2" aria-required="true">
<label for="req3">Mail</label><input id="req3" required aria-required="true">
<div hidden><label><input id="cb-hidden" type="checkbox" aria-checked="true"> Oculta</label></div>
<div hidden><select id="sel-h" aria-label="Oculta"><option>a</option><option aria-selected="true">b</option></select></div>
<br-switch id="wc-switch"></br-switch>
<x-toggle id="xt"></x-toggle>
<script>
document.querySelector('#cb-mixed').indeterminate = true;
document.querySelector('#sw-mixed').indeterminate = true;
document.querySelector('#sw-ok').addEventListener('change', e => e.target.setAttribute('aria-checked', String(e.target.checked)));
customElements.define('br-switch', class extends HTMLElement { connectedCallback() { this.attachShadow({ mode: 'open' }).innerHTML = '<input type="checkbox" role="switch" aria-checked="true" aria-label="Interno">'; } });
customElements.define('x-toggle', class extends HTMLElement { connectedCallback() { this.attachShadow({ mode: 'open' }).innerHTML = '<input type="checkbox" checked aria-checked="false" aria-label="Neutro">'; } });
</script></main></body></html>`;

const clean = `<!doctype html><html lang="pt-BR"><head><title>Limpo</title></head><body><main><h1>Limpo</h1>
<label><input id="plain" type="checkbox"> Sem ARIA</label>
<div role="switch" aria-checked="false" tabindex="0" id="aria-only">Só ARIA</div>
<button aria-disabled="true" id="soft">Soft</button>
<label for="f">Campo</label><input id="f" aria-required="true">
</main></body></html>`;

let server: Server, base: string;
beforeAll(async () => {
  server = httpServer((req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(req.url?.startsWith("/limpo") ? clean : matrix); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await closeBrowser(); await new Promise<void>((resolve) => server.close(() => resolve())); });

const url = () => `${base}/matriz`;
const aria = (r: PageScanResult) => (r.notJudged ?? []).filter((i) => i.code.startsWith("aria-"));
const bound = (i: NotJudgedItem | undefined) => i?.boundLocators ?? [];
const switchFindings = (r: PageScanResult) => r.findings.filter((f) => f.rule.id === SWITCH_ARIA_CHECKED);
async function scanned(...args: Parameters<typeof scanPage>): Promise<PageScanResult> {
  const r = await scanPage(...args);
  if (r.status !== "scanned") throw new Error(`estado não alcançado: ${JSON.stringify(r.limitation)}`);
  return r;
}

const el = (over: Partial<ElementEvidence> & { attributes?: Partial<ElementEvidence["attributes"]> }): ElementEvidence => ({
  locator: "#x", tagName: "input", id: "x", classes: [], content: { textContent: "", hasVisibleText: false, hasIconOnly: false },
  inlineStyle: null, computed: {}, focused: {}, outerHTML: "<input>", inShadowDom: false, rendered: true,
  ...over,
  attributes: { type: "checkbox", role: null, ariaLabel: null, ariaRequired: null, ariaDisabled: null, ariaDescribedby: null, ariaHidden: null, disabled: false, required: false, htmlFor: null, placeholder: null, alt: null, tabindex: null, ...(over.attributes ?? {}) },
} as ElementEvidence);

describe("pares ARIA × nativo (unidade)", () => {
  it("compara só pares com par nativo e tokens válidos; padrão legítimo não é divergência", () => {
    expect(ariaNativePairs(el({ attributes: { ariaChecked: "false" }, nativeState: { checked: true } }))[0]).toMatchObject({ state: "checked", relation: "mismatch", native: "true", aria: "false" });
    expect(ariaNativePairs(el({ attributes: { ariaChecked: " TRUE " }, nativeState: { checked: true } }))[0].relation).toBe("agree");
    expect(ariaNativePairs(el({ attributes: { ariaChecked: "mixed" }, nativeState: { checked: false, indeterminate: true } }))[0].relation).toBe("agree");
    expect(ariaNativePairs(el({ attributes: { ariaChecked: "on" }, nativeState: { checked: true } }))[0].relation).toBe("not-compared");
    expect(ariaNativePairs(el({ attributes: { ariaChecked: "true" } }))).toEqual([]);
    expect(ariaNativePairs(el({ nativeState: { checked: true } }))).toEqual([]);
    const soft = ariaNativePairs(el({ tagName: "button", attributes: { ariaDisabled: "true" }, nativeState: { disabled: false } }))[0];
    expect(soft.relation).toBe("not-compared");
    expect(ariaNativePairs(el({ tagName: "button", attributes: { ariaDisabled: "false" }, nativeState: { disabled: true } }))[0].relation).toBe("mismatch");
    const both = ariaNativePairs(el({ attributes: { ariaRequired: "true" }, nativeState: { required: true } }))[0];
    expect(both.relation).toBe("agree");
    expect(unverifiedAfterInteraction(both)).toBe(false);
    expect(unverifiedAfterInteraction(ariaNativePairs(el({ attributes: { ariaRequired: "false" }, nativeState: { required: false } }))[0])).toBe(true);
  });

  it("a cláusula do Switch fica medida parcialmente (não sai das pendências de inspeção)", () => {
    expect(oracleMeasuresFor(SWITCH_ARIA_CHECKED).map((m) => [m.tool, m.coverage])).toEqual([["scan_page", "partial"], ["verify_finding", "partial"]]);
    expect(oracleFullyMeasures(SWITCH_ARIA_CHECKED)).toBe(false);
    expect(oracleMeasuresFor(SWITCH_PREFER_CHECKED)).toEqual([]);
  });
});

describe("scan_page (evaluation): matriz neutra", () => {
  it("no estado inicial: achado só no switch divergente; pendências medidas, sem falso defeito", async () => {
    const r = await scanned({ url: url(), checks: ["structure"] }, new PageScanCache(2));
    const sw = switchFindings(r);
    expect(sw.map((f) => f.element.locator)).toEqual(["#sw-rest"]);
    expect(sw[0]).toMatchObject({ rule: { source: "govbr-ds-kb", implements: [SWITCH_ARIA_CHECKED] }, mode: "display", evidence: { data: { expectedCondition: ARIA_STATE_CONDITION, state: "checked", observedNative: "true", observedAria: "false", context: SWITCH_PREFER_CHECKED } } });
    expect(sw[0].rule.wcag).toBeUndefined();
    const items = aria(r);
    const mismatch = items.find((i) => i.code === "aria-native-mismatch");
    expect(bound(mismatch).sort()).toEqual(["#b-dis", "#cb-stale", "#det > summary", "#req", "#sel > option:nth-of-type(2)", "#sw-mixed", "#xt >>> input"].sort());
    expect(mismatch).toMatchObject({ norms: ["wcag-4.1.2"], elementBound: true });
    expect(mismatch!.rule).toBeUndefined();
    expect(mismatch!.ariaPairs).toEqual(expect.arrayContaining([{ locator: "#cb-stale", state: "checked", native: "true", aria: "false" }, { locator: "#det > summary", state: "expanded", native: "true", aria: "false" }]));
    const sws = items.find((i) => i.code === "aria-state-unverified" && i.subject.startsWith("switch"));
    expect(bound(sws).sort()).toEqual(["#sw-ok", "#sw-stale"]);
    expect(sws).toMatchObject({ norms: [SWITCH_ARIA_CHECKED, "wcag-4.1.2"], rule: { id: SWITCH_ARIA_CHECKED, force: "required" } });
    const other = items.find((i) => i.code === "aria-state-unverified" && !i.subject.startsWith("switch"));
    expect(bound(other).sort()).toEqual(["#cb-mixed", "#radio-ok"]);
    const everywhere = items.flatMap(bound);
    for (const absent of ["#sw-native", "#div-switch", "#b-focusable", "#b-pressed", "#b-exp", "#det2 > summary:nth-of-type(2)", "#sel3 > option:nth-of-type(2)", "#req2", "#req3", "#cb-hidden", "#sel-h > option:nth-of-type(2)", "#wc-switch >>> input"]) expect(everywhere).not.toContain(absent);
    // Interno de web component do DS: observação de autoria, nunca achado nem pendência.
    const outside = r.observations.filter((o) => o.kind === "outside-page-authorship" && o.element.locator === "#wc-switch >>> input");
    expect(outside).toHaveLength(1);
    expect(r.findings.some((f) => f.element.locator === "#wc-switch >>> input")).toBe(false);
  });

  it("depois de alternar por actions: o ARIA estático vira achado (fato no DOM do estado); o que acompanha, não", async () => {
    const r = await scanned({ url: url(), checks: ["structure"], actions: [{ action: "click", selector: "label[for='sw-stale']" }, { action: "click", selector: "label[for='sw-ok']" }] }, new PageScanCache(2));
    const sw = switchFindings(r);
    expect(sw.map((f) => f.element.locator).sort()).toEqual(["#sw-rest", "#sw-stale"]);
    expect(sw.find((f) => f.element.locator === "#sw-stale")).toMatchObject({ mode: "display", evidence: { data: { observedNative: "true", observedAria: "false" } } });
    const sws = aria(r).find((i) => i.code === "aria-state-unverified" && i.subject.startsWith("switch"));
    expect(bound(sws)).toEqual(["#sw-ok"]);
  });

  it("página só com ARIA correto ou ausente: nenhum achado nem divergência", async () => {
    const r = await scanned({ url: `${base}/limpo`, checks: ["structure"] }, new PageScanCache(2));
    expect(switchFindings(r)).toEqual([]);
    expect(aria(r)).toEqual([]);
  });

  it("com seletores, mede só a região pedida", async () => {
    const r = await scanned({ url: url(), checks: ["structure"], selectors: ["#det"] }, new PageScanCache(2));
    expect(switchFindings(r)).toEqual([]);
    expect(aria(r).flatMap(bound)).toEqual(["#det > summary"]);
  });
});

describe("verify_finding (gate): confirma e desmente com a receita", () => {
  const switchClaim = (locator: string): Finding => ({
    id: "F-x", rule: { id: SWITCH_ARIA_CHECKED, source: "govbr-ds-kb", description: "Switch" }, element: { locator, page: url() },
    evidence: { observed: "aria-checked estático", expected: "acompanha", data: { expectedCondition: ARIA_STATE_CONDITION, state: "checked" } },
    severity: "moderate", nature: "syntactic", mode: "interaction", pathway: "heuristic",
  });
  const candidate = (locator: string, state?: string): Finding => ({
    ...switchClaim(locator), rule: { id: "4.1.2", source: "wcag", description: "Name, Role, Value" },
    evidence: { observed: "diverge", expected: "acompanha", data: { expectedCondition: ARIA_STATE_CONDITION, ...(state ? { state } : {}) } },
  });
  const toggle = [{ action: "click" as const, selector: "label[for='sw-stale']" }];

  it("Switch: confirmado depois de alternar; rejeitado no estado em que concorda; recipe que falha não decide", async () => {
    const after = await verifyFinding({ finding: switchClaim("#sw-stale"), live: true, actions: toggle });
    expect(after).toMatchObject({ verdict: "confirmed", predicate: "aria-native-state", checks: { violation: "verified" } });
    const before = await verifyFinding({ finding: switchClaim("#sw-stale"), live: true });
    expect(before).toMatchObject({ verdict: "rejected", checks: { violation: "contradicted" } });
    const tracks = await verifyFinding({ finding: switchClaim("#sw-ok"), live: true, actions: [{ action: "click", selector: "label[for='sw-ok']" }] });
    expect(tracks.verdict).toBe("rejected");
    const unreached = await verifyFinding({ finding: switchClaim("#sw-stale"), live: true, actions: [{ action: "click", selector: "#nao-existe" }] });
    expect(unreached.verdict).toBe("unverifiable");
    expect(unreached.checks?.violation).toBe("not-checked");
  });

  it("Switch: sem par nativo, fora de switch ou recomendação não confirmam", async () => {
    expect((await verifyFinding({ finding: switchClaim("#div-switch"), live: true })).verdict).toBe("unverifiable");
    const notSwitch = await verifyFinding({ finding: switchClaim("#cb-stale"), live: true });
    expect(notSwitch).toMatchObject({ verdict: "unverifiable", checks: { applicability: "not-applicable" } });
    expect((await verifyFinding({ finding: switchClaim("#sw-native"), live: true, actions: [{ action: "click", selector: "label[for='sw-native']" }] })).verdict).toBe("rejected");
    const recommended = await verifyFinding({ finding: { ...switchClaim("#sw-rest"), rule: { id: SWITCH_PREFER_CHECKED, source: "govbr-ds-kb", description: "x" } }, live: true });
    expect(recommended.predicate).toBeNull();
    expect(recommended.verdict).toBe("unverifiable");
    const noCondition = await verifyFinding({ finding: { ...switchClaim("#sw-rest"), evidence: { observed: "x", expected: "y" } }, live: false });
    expect(noCondition).toMatchObject({ verdict: "unverifiable", issue: "evidence-incomplete", predicate: null });
    expect(noCondition.detail).toContain(ARIA_STATE_CONDITION);
    const mixed = await verifyFinding({ finding: switchClaim("#sw-mixed"), live: true });
    expect(mixed).toMatchObject({ verdict: "unverifiable", checks: { applicability: "not-applicable" } });
    const inside = await verifyFinding({ finding: switchClaim("#wc-switch >>> input"), live: true });
    expect(inside.verdict).toBe("unverifiable");
  });

  it("WCAG 4.1.2 candidata: o fato medido nunca confirma; ausência do fato rejeita", async () => {
    const measured = await verifyFinding({ finding: candidate("#cb-stale", "checked"), live: true });
    expect(measured).toMatchObject({ verdict: "unverifiable", checks: { violation: "undetermined", evidenceConsistent: "pass" } });
    expect(measured.detail).toContain("referência candidata");
    expect((await verifyFinding({ finding: candidate("#radio-ok"), live: true })).verdict).toBe("rejected");
    expect((await verifyFinding({ finding: candidate("#b-focusable", "disabled"), live: true })).verdict).toBe("unverifiable");
    // ARIA sem par nativo (aria-expanded em botão; summary que não é o 1º do details): não comparado, nunca "nada diverge".
    for (const [loc, state] of [["#b-exp", undefined], ["#b-exp", "expanded"], ["#det2 > summary:nth-of-type(2)", "expanded"]] as const) {
      const r = await verifyFinding({ finding: candidate(loc, state), live: true });
      expect(r, `${loc} ${state}`).toMatchObject({ verdict: "unverifiable", checks: { applicability: "not-applicable" } });
    }
    const wrongClaim = await verifyFinding({ finding: { ...candidate("#cb-stale", "checked"), evidence: { observed: "x", expected: "y", data: { expectedCondition: ARIA_STATE_CONDITION, state: "checked", observedAria: "true" } } }, live: true });
    expect(wrongClaim.verdict).toBe("rejected");
    const badState = await verifyFinding({ finding: candidate("#cb-stale", "pressed"), live: true });
    expect(badState).toMatchObject({ verdict: "unverifiable", issue: "evidence-inconsistent" });
  });
});

describe("knowledge-free: a medida existe, sem nada da base", () => {
  it("scan devolve só pendências (sem Switch do DS, cláusula ou autoria) e o verify mede sem confirmar; lock zero", async () => {
    resetKnowledgeLock();
    await runKnowledgeLocked(async () => {
      const r = await scanned({ url: url() }, new PageScanCache(2), { knowledgeFree: true });
      expect(r.findings.every((f) => f.rule.source === "axe-core")).toBe(true);
      const items = aria(r);
      expect(items.every((i) => i.rule === undefined && JSON.stringify(i.norms) === '["wcag-4.1.2"]')).toBe(true);
      expect(JSON.stringify(items)).not.toContain("govbr-");
      const mismatch = items.find((i) => i.code === "aria-native-mismatch");
      expect(bound(mismatch)).toEqual(expect.arrayContaining(["#sw-rest", "#cb-stale", "#wc-switch >>> input", "#xt >>> input"]));
      expect(bound(items.find((i) => i.code === "aria-state-unverified"))).toEqual(expect.arrayContaining(["#sw-ok", "#sw-stale", "#radio-ok"]));
      const verdict = await verifyFinding({
        finding: { id: "F-k", rule: { id: "4.1.2", source: "wcag", description: "x" }, element: { locator: "#sw-stale", page: url() }, evidence: { observed: "x", expected: "y", data: { expectedCondition: ARIA_STATE_CONDITION, state: "checked" } }, severity: "moderate", nature: "syntactic", mode: "interaction", pathway: "heuristic" },
        live: true, actions: [{ action: "click", selector: "label[for='sw-stale']" }], knowledgeFree: true,
      });
      expect(verdict).toMatchObject({ verdict: "unverifiable", predicate: "aria-native-state", checks: { violation: "undetermined" } });
    });
    expect(knowledgeLockAttempts()).toEqual({ attempts: 0, loaders: [] });
  });
});

describe("MCP: pendência registrada e fechada pelo verify_finding com a mesma receita", () => {
  it.each(["evaluation", "knowledge-free"] as const)("%s", async (profile) => {
    resetKnowledgeLock();
    const run = async () => {
      const client = new Client({ name: "aria-test", version: "1" });
      const service = createServer({ toolProfile: profile, knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "aria-")) });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await service.connect(a); await client.connect(b);
      try {
        const call = async (name: string, args: Record<string, unknown>) => {
          const result = await client.callTool({ name, arguments: args });
          expect(result.isError).not.toBe(true);
          return JSON.parse((result.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")!.text);
        };
        const scan = await call("scan_page", { url: url(), maxChars: 30000, ...(profile === "evaluation" ? { checks: ["structure"] } : {}) });
        const notMeasured = scan.checksRun.pageLevel.notMeasured as Array<Record<string, unknown>>;
        const unverified = notMeasured.filter((i) => i.code === "aria-state-unverified");
        expect(unverified.length).toBeGreaterThan(0);
        expect(notMeasured.some((i) => i.code === "aria-native-mismatch")).toBe(true);
        for (const i of notMeasured) expect(i).not.toHaveProperty("ariaPairs");
        if (profile === "knowledge-free") {
          expect(JSON.stringify(scan.checksRun)).not.toContain("govbr-");
          expect(scan.checksRun.executed.map((e: { check: string }) => e.check)).toEqual(["axe", "aria-native-state"]);
        } else expect(scan.checksRun.pageLevel.measured).toContain("aria-native-state");
        const target = profile === "evaluation" ? unverified.find((i) => (i.rule as { id?: string } | undefined)?.id === SWITCH_ARIA_CHECKED) : unverified[0];
        expect(target).toBeDefined();
        const finding = {
          id: "F-agent", element: { locator: "#sw-stale", page: url() }, severity: "moderate", nature: "syntactic", mode: "interaction", pathway: "heuristic",
          rule: profile === "evaluation" ? { id: SWITCH_ARIA_CHECKED, source: "govbr-ds-kb", description: "Switch" } : { id: "4.1.2", source: "wcag", description: "Name, Role, Value" },
          evidence: { observed: "aria-checked estático", expected: "acompanha", data: { expectedCondition: ARIA_STATE_CONDITION, state: "checked", observedAria: "false" } },
        };
        // Revisão MED 2: verify no estado não alternado (ou sem a condição) não fecha "não verificado depois de alternar".
        const untoggled = await call("verify_finding", { finding, live: true });
        expect(untoggled.pendingResolved ?? []).not.toContain(target!.pendingId);
        const other = await call("verify_finding", { finding: { ...finding, evidence: { observed: "x", expected: "y" } }, live: true, actions: [{ action: "click", selector: "label[for='sw-stale']" }] });
        expect(other.pendingResolved ?? []).not.toContain(target!.pendingId);
        const verified = await call("verify_finding", { finding, live: true, actions: [{ action: "click", selector: "label[for='sw-stale']" }] });
        expect(verified.verification.verdict).toBe(profile === "evaluation" ? "confirmed" : "unverifiable");
        // 3.7.4 (D2): a pendência cobre vários elementos (evaluation: os dois switches; knowledge-free: todos os não
        // verificados) — decidir um deixa os outros abertos, com o mesmo pendingId; o último fecha.
        expect(verified.pendingResolved ?? []).not.toContain(target!.pendingId);
        // 3.7.12 (auditoria da cadeia 3.7.11): no knowledge-free o verify não decide (unverifiable) — não decide elemento nem
        // fecha a pendência; ela volta em pendingUndecided e segue aberta (o perfil a encerra em limitations).
        if (profile === "knowledge-free") {
          expect(verified).not.toHaveProperty("pendingPartial");
          expect((verified.pendingUndecided as Array<{ id: string }>).map((u) => u.id)).toContain(target!.pendingId);
          return;
        }
        expect(verified.pendingPartial).toEqual([expect.objectContaining({ id: target!.pendingId, decided: ["#sw-stale"] })]);
        const remaining = verified.pendingPartial[0].remaining as string[];
        expect(remaining).toContain("#sw-ok");
        if (profile === "evaluation") expect(remaining).toEqual(["#sw-ok"]);
        let last: Record<string, unknown> = verified;
        for (const locator of remaining) {
          last = await call("verify_finding", { finding: { ...finding, id: `F-${locator}`, element: { ...finding.element, locator } }, live: true, actions: [{ action: "click", selector: locator }] });
        }
        expect(last.pendingResolved).toContain(target!.pendingId);
        expect(last).not.toHaveProperty("pendingPartial");
      } finally { await client.close(); await service.close(); }
    };
    if (profile === "knowledge-free") { await runKnowledgeLocked(run); expect(knowledgeLockAttempts()).toEqual({ attempts: 0, loaders: [] }); }
    else await run();
  });
});
