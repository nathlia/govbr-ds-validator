/**
 * Política de identidade de estado `state-identity-1` (2.10.0, NAT-82): as duas renomeações
 * consistentes são estreitas e preservam diferenças relevantes. Igualdade continua exata depois delas.
 */
import { describe, it, expect } from "vitest";
import type { Page } from "playwright";
import {
  STATE_IDENTITY_NORMALIZATIONS,
  compareStates,
  dsDrawnListIds,
  identityFingerprint,
  normalizeIdentity,
  sameScanPage,
  type IdentityInput,
} from "../../src/scan/state.js";
import { ArrivalSchema, applyActions, countFailureReason } from "../../src/scan/actions.js";

function identity(html: string, extra: Partial<IdentityInput> = {}): IdentityInput {
  return {
    url: "http://exemplo.invalid/",
    viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
    html,
    shadow: [],
    focus: null,
    controls: [],
    unobservableRoots: [],
    ...extra,
  };
}

/** O contexto que o br-select do DS monta junto com o id sorteado. */
const dsList = (id: string) => `<ul class="br-list" id="${id}" role="listbox" tabindex="-1" aria-label="Lista de Opções"></ul>`;
const combobox = (list: string) =>
  `<div role="combobox" aria-controls="${list}"><input></div>${dsList(list)}`;

describe("ds-core-random-list-id", () => {
  it("two loads that differ only in the drawn list id are the same state", () => {
    expect(identityFingerprint(identity(combobox("list-8556")))).toBe(identityFingerprint(identity(combobox("list-7774"))));
  });

  it("keeps distinct ids distinct and references consistent", () => {
    const twoLists = identity(`<div aria-controls="list-1"></div>${dsList("list-1")}<div aria-controls="list-2"></div>${dsList("list-2")}`);
    const crossed = identity(`<div aria-controls="list-1"></div>${dsList("list-2")}<div aria-controls="list-2"></div>${dsList("list-1")}`);
    const shared = identity(`<div aria-controls="list-1"></div>${dsList("list-1")}<div aria-controls="list-1"></div>${dsList("list-1")}`);
    expect(identityFingerprint(twoLists)).not.toBe(identityFingerprint(crossed));
    expect(identityFingerprint(twoLists)).not.toBe(identityFingerprint(shared));
    expect(normalizeIdentity(twoLists).html).toBe(
      `<div aria-controls="list-#1"></div>${dsList("list-#1")}<div aria-controls="list-#2"></div>${dsList("list-#2")}`
    );
  });

  it("touches only id/reference attribute values and #list-N locators — never text, classes or other ids", () => {
    const html = `<p class="list-12">list-12 itens</p>${dsList("list-12345")}<ul id="lista-1"></ul><a href="#list-3">x</a>`;
    expect(normalizeIdentity(identity(html)).html).toBe(html);
    expect(identityFingerprint(identity(`<p>list-12</p>`))).not.toBe(identityFingerprint(identity(`<p>list-13</p>`)));
    const located = normalizeIdentity(
      identity(dsList("list-42"), { controls: [{ at: "#list-42 > li:nth-of-type(2)", id: "list-42" }], focus: { path: ["#list-42"], interior: "observed" } })
    );
    expect(located.controls[0]).toEqual({ at: "#list-#1 > li:nth-of-type(2)", id: "list-#1" });
    expect(located.focus?.path).toEqual(["#list-#1"]);
  });

  it("leaves a list-N the page author wrote alone: only the DS draw shape inside the DS listbox context is renamed", () => {
    const authored = (n: string) => `<ul id="${n}"></ul><nav aria-controls="${n}"></nav>`;
    expect(normalizeIdentity(identity(authored("list-7"))).html).toBe(authored("list-7"));
    expect(identityFingerprint(identity(authored("list-7")))).not.toBe(identityFingerprint(identity(authored("list-8"))));
    // DS class without the listbox role, the role without the DS class, a leading zero, a lookalike class: not the DS draw.
    const lookalikes = [
      `<ul class="br-list" id="list-7"></ul>`,
      `<ul role="listbox" id="list-7"></ul>`,
      `<ul class="br-list" role="listbox" id="list-07"></ul>`,
      `<ul class="br-listing" role="listbox" id="list-7"></ul>`,
    ];
    for (const html of lookalikes) expect(dsDrawnListIds([html]).size, html).toBe(0);
    expect([...dsDrawnListIds([dsList("list-0"), `<ul data-x="a>b" class="x br-list" role="listbox" id="list-9999">`])]).toEqual(["list-0", "list-9999"]);
    // An authored list-N next to a DS one: only the DS one is renamed.
    const mixed = identity(`${dsList("list-5")}<ul id="list-6"></ul><b aria-controls="list-5 list-6"></b>`);
    expect(normalizeIdentity(mixed).html).toBe(`${dsList("list-#1")}<ul id="list-6"></ul><b aria-controls="list-#1 list-6"></b>`);
  });
});

describe("angular-emulated-app-id", () => {
  it("abstracts the per-bootstrap app id but keeps the component index", () => {
    const load = (app: string, c = 16) => identity(`<style>.x[_ngcontent-${app}-c${c}]{}</style><header _ngcontent-${app}-c${c}="" _nghost-${app}-c3=""></header>`);
    expect(identityFingerprint(load("wig"))).toBe(identityFingerprint(load("bbk")));
    expect(identityFingerprint(load("wig", 16))).not.toBe(identityFingerprint(load("wig", 17)));
    expect(normalizeIdentity(load("wig")).html).toBe(`<style>.x[_ngcontent-@1-c16]{}</style><header _ngcontent-@1-c16="" _nghost-@1-c3=""></header>`);
  });

  it("covers the form serialized inside shadow roots and keeps two app ids apart", () => {
    const shadow = (a: string, b: string) => identity("<x-a></x-a>", { shadow: [{ host: "x-a", html: `<p _ngcontent${a}c1=""></p><p _ngcontent${b}c1=""></p>` }] });
    expect(identityFingerprint(shadow("abc", "def"))).toBe(identityFingerprint(shadow("xyz", "uvw")));
    expect(identityFingerprint(shadow("abc", "def"))).not.toBe(identityFingerprint(shadow("abc", "abc")));
  });
});

describe("exact equality otherwise", () => {
  it("any other difference — text, control value, focus, viewport, URL, shadow content — changes the fingerprint", () => {
    const base = identity("<p>a</p>", { controls: [{ at: "#c", id: "c", value: "1" }], focus: { path: ["#c"], interior: "observed" } });
    const variants: IdentityInput[] = [
      { ...base, html: "<p>b</p>" },
      { ...base, controls: [{ at: "#c", id: "c", value: "2" }] },
      { ...base, focus: { path: ["#c"], interior: "unknown" } },
      { ...base, focus: null },
      { ...base, viewport: { ...base.viewport, width: 1024 } },
      { ...base, url: "http://exemplo.invalid/?a=1" },
      { ...base, shadow: [{ host: "x-a", html: "<span>1</span>" }] },
      { ...base, unobservableRoots: ["#fechado"] },
    ];
    const reference = identityFingerprint(base);
    for (const variant of variants) expect(identityFingerprint(variant)).not.toBe(reference);
  });

  it("names its normalizations; comparison reports each mismatched dimension", () => {
    expect(STATE_IDENTITY_NORMALIZATIONS).toEqual(["ds-core-random-list-id", "angular-emulated-app-id"]);
    const s = { url: "u", viewport: { width: 1280, height: 720 }, fingerprint: "f" };
    expect(compareStates(s, s)).toEqual([]);
    expect(compareStates(s, { url: "v", viewport: { width: 375, height: 812 }, fingerprint: "g" })).toEqual(["url", "viewport", "fingerprint"]);
  });
});

describe("arrival schema", () => {
  it("is strict: no window, no unknown condition", () => {
    expect(ArrivalSchema.safeParse({ dialogOpen: true }).success).toBe(true);
    expect(ArrivalSchema.safeParse({ viewport: { width: 375, height: 812 } }).success).toBe(false);
    expect(ArrivalSchema.safeParse({ modalOpen: true }).success).toBe(false);
  });
});

describe("scanId page matching", () => {
  it("ignores a trailing slash and the fragment, keeps origin, path and query", () => {
    expect(sameScanPage("http://h:1/tela", "http://h:1/tela/")).toBe(true);
    expect(sameScanPage("http://h:1/tela/#secao", "http://h:1/tela")).toBe(true);
    expect(sameScanPage("http://h:1", "http://h:1/")).toBe(true);
    expect(sameScanPage("http://h:1/tela", "http://h:1/outra")).toBe(false);
    expect(sameScanPage("http://h:1/tela?a=1", "http://h:1/tela")).toBe(false);
    expect(sameScanPage("http://h:2/tela", "http://h:1/tela")).toBe(false);
    expect(sameScanPage("nao é url", "nao é url")).toBe(false);
  });
});

/** Página falsa mínima para os caminhos de erro de applyActions que um navegador não produz sob demanda. */
function fakePage(behavior: { count?: () => Promise<number>; click?: () => Promise<void> }): Page {
  const locator = {
    count: behavior.count ?? (async () => 1),
    click: behavior.click ?? (async () => undefined),
  };
  return { waitForSelector: async () => null, locator: () => locator } as unknown as Page;
}

describe("replay failure typing", () => {
  it("a count that fails because the page navigated is page-changed, not invalid-selector", async () => {
    const page = fakePage({
      count: async () => {
        throw new Error("locator.count: Execution context was destroyed, most likely because of a navigation");
      },
    });
    const result = await applyActions(page, [{ action: "click", selector: "#ok" }]);
    expect(result).toEqual(expect.objectContaining({ status: "failed", failure: expect.objectContaining({ reason: "page-changed", matched: null }) }));
    expect(countFailureReason(new Error("Target page, context or browser has been closed"))).toBe("page-changed");
    expect(countFailureReason(new Error('locator.count: Unexpected token "[" while parsing css selector "button[[".'))).toBe("invalid-selector");
    expect(countFailureReason(new Error("something else"))).toBe("action-failed");
  });

  it("a target that stops being unique between counting and acting is ambiguous, with the new count", async () => {
    const page = fakePage({
      click: async () => {
        throw new Error("locator.click: Error: strict mode violation: locator('.x') resolved to 3 elements:\n    1) <button>");
      },
    });
    const result = await applyActions(page, [{ action: "click", selector: ".x" }]);
    expect(result).toEqual(expect.objectContaining({ status: "failed", failure: expect.objectContaining({ reason: "ambiguous", matched: 3 }) }));
  });
});
