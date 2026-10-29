/**
 * 3.4.4 — correções da lista única (C1–C14) vistas em uso real pelos auditores de 2026-10-29.
 *
 * Fixtures sintéticas e neutras: nenhum markup, texto, seletor ou id das telas A/B, do fluxo ou dos
 * controles. Cada fixture reproduz o MECANISMO do defeito (web component <br-*> com internos, elemento
 * oculto, calendário embutido, borda de erro que some no foco, input invisível, tabindex positivo antes
 * do salto, achado do scan reverificado como veio).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { closeBrowser } from "../../src/evidence/browser.js";
import { PageScanCache, scanPage, type PageScanResult } from "../../src/scan/pageScan.js";
import { RESPONSE_BUDGET } from "../../src/responses/contract.js";
import { resetKnowledgeLock } from "../../src/data/lock.js";
import { isBestPracticeOnly, relationOnlyAriaValue } from "../../src/checkers/axe.js";

function page(body: string, style = "", script = ""): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Agenda de oficinas</title><style>${style}</style></head>
<body><a href="#conteudo">Ir para o conteúdo</a><header class="br-header">Agenda</header><main id="conteudo"><h1>Agenda de oficinas</h1>${body}</main><footer class="br-footer">fim</footer><script>${script}</script></body></html>`;
}

// Web component <br-*> de mentira: o shadow root dele é "código do componente".
const WEB_COMPONENTS = `
  customElements.define('br-trilha', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = '<div class="br-breadcrumb"><ul><li><a href="#x" style="padding: 0 6px">Início</a></li></ul></div>'; } });
  customElements.define('br-acao', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = '<button class="br-button" type="button"><i class="icone-olho"></i></button>'; } });`;

const FOCUS_STYLE = `
  .campo input { border: 1px solid rgb(136, 136, 136); outline: none; }
  .campo.erro input { border-color: rgb(229, 34, 7); }
  .campo.erro input:focus { border-color: rgb(136, 136, 136); }
  #bom:focus { border-color: rgb(19, 81, 180); }
  .cb { position: absolute; opacity: 0; }
  .cb:focus { outline: 2px solid rgb(0, 0, 0); }
  .cb + label::before { content: ""; display: inline-block; width: 10px; height: 10px; }
  #cb2:focus + label::before { box-shadow: 0 0 0 3px rgb(194, 133, 12); }`;

const PAGES: Record<string, string> = {
  "/origem": page(
    `<br-trilha></br-trilha><br-acao></br-acao>
     <div id="menu" hidden><button class="br-button" type="button" style="border-radius: 20px">Sair</button></div>
     <button class="br-button" type="button" style="border-radius: 20px">Confirmar</button>
     <div class="flatpickr-calendar"><span class="flatpickr-prev-month"><button class="br-button" type="button"><i class="seta"></i></button></span></div>`,
    "",
    WEB_COMPONENTS,
  ),
  "/foco": page(
    `<div class="campo erro"><label for="ruim">Nome</label><input id="ruim"></div>
     <div class="campo"><label for="bom">Cidade</label><input id="bom"></div>
     <input type="checkbox" class="cb" id="cb1"><label for="cb1">Aceito A</label>
     <input type="checkbox" class="cb" id="cb2"><label for="cb2">Aceito B</label>`,
    FOCUS_STYLE,
  ),
  "/tabindex": page(`<p>Texto.</p><button type="button" tabindex="1">Ajuda</button>`),
  "/sem-tabindex": page(`<p>Texto.</p><button type="button">Ajuda</button>`),
  "/incompleto": page(`<p style="background-image: linear-gradient(rgb(200,0,0), rgb(0,0,200)); color: rgb(119,119,119)">texto sobre gradiente</p>`),
  // Muitas famílias: cada elemento com uma cor fora da paleta e um raio fora da escala diferentes.
  "/familias": page(
    Array.from({ length: 14 }, (_, i) =>
      `<button class="br-button" type="button" style="color: rgb(${10 + i * 9}, 77, 33); border-radius: ${3 + i}px">Ação ${i}</button>`,
    ).join(""),
  ),
};

let http: Server;
let base = "";
beforeAll(async () => {
  http = createHttpServer((req, res) => {
    const body = PAGES[(req.url ?? "/").split("?")[0]];
    if (!body) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  resetKnowledgeLock();
  await closeBrowser();
  await new Promise((r) => http.close(() => r(undefined)));
});

async function scan(path: string, checks?: Array<"tokens" | "structure" | "axe" | "page">): Promise<PageScanResult> {
  const out = await scanPage({ url: `${base}${path}`, ...(checks ? { checks } : {}) }, new PageScanCache(4));
  if (out.status !== "scanned") throw new Error(`não varreu ${path}`);
  return out;
}

async function connect() {
  const srv = createServer({ toolProfile: "full", knowledgeLock: "call", reportsDir: mkdtempSync(join(tmpdir(), "govbr-344-")) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fix344", version: "1" });
  await srv.connect(b);
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>).map((c) => c.text).join("");
    return { text, data: JSON.parse(text) as Record<string, any> };
  };
  return { client, call };
}

describe("3.4.4 C3/C4/C5 — o que não é autoria da página vira observação, com o motivo", () => {
  it("internos de web component <br-*>, elemento oculto e calendário embutido saem dos achados; o nome do botão dentro do componente fica", async () => {
    const r = await scan("/origem", ["tokens", "structure"]);
    const locs = r.findings.map((f) => `${f.rule.id} ${f.element.locator}`);
    // C3: tag e espaçamento DENTRO do shadow do componente do DS não são achado de página (a anatomia,
    // que depende do conteúdo que a página passa, continua com o check de anatomia)
    expect(locs.some((l) => /^ds-(structure|token)-/.test(l) && l.includes("br-trilha >>>"))).toBe(false);
    // C4: o raio do botão no menu oculto não é achado; o mesmo raio visível é
    const radius = r.findings.filter((f) => f.rule.id === "ds-token-radius");
    expect(radius.map((f) => f.element.locator).some((l) => l.includes("#menu"))).toBe(false);
    expect(radius.length).toBe(1);
    // C5: botão só ícone do calendário embutido não é achado
    expect(locs.some((l) => l.startsWith("emag-2.2") && !l.includes(">>>"))).toBe(false);
    // o nome acessível vem do que a página passa ao host: <br-acao> sem rótulo continua achado
    expect(r.findings.some((f) => f.rule.id === "emag-2.2" && f.element.locator.includes("br-acao >>> button"))).toBe(true);

    const outside = r.observations.filter((o) => o.kind === "outside-page-authorship");
    const reasons = new Set(outside.map((o) => o.data?.reason));
    expect(reasons).toEqual(new Set(["ds-web-component", "not-rendered", "ds-third-party"]));
    const tag = outside.find((o) => (o.data?.rule as { id: string }).id === "ds-structure-breadcrumb-tag");
    expect(tag?.data?.host).toBe("br-trilha");
    expect(tag?.whyNotAFinding).toMatch(/shadow root de um web component do próprio DS/);
    expect(outside.some((o) => o.data?.reason === "ds-web-component" && (o.data?.rule as { id: string }).id === "ds-token-spacing")).toBe(true);
  });
});

describe("3.4.4 C6 — foco visível: perda de cor e elemento invisível não indicam foco", () => {
  it("borda de erro que volta ao cinza no foco e outline de input opacity:0 sem marca no rótulo são achados; borda que ganha contraste e rótulo marcado não", async () => {
    const r = await scan("/foco", ["structure"]);
    const focus = r.findings.filter((f) => f.rule.id === "emag-4.4").map((f) => f.element.locator);
    expect(focus).toContain("#ruim");
    expect(focus).toContain("#cb1");
    expect(focus).not.toContain("#bom");
    expect(focus).not.toContain("#cb2");
    const ruim = r.findings.find((f) => f.rule.id === "emag-4.4" && f.element.locator === "#ruim")!;
    expect(ruim.evidence.observed).toMatch(/perde contraste/);
    expect((ruim.evidence.data?.discountedOnFocus as string[]).join(" ")).toMatch(/rgb\(229, 34, 7\) → rgb\(136, 136, 136\)/);
    const cb1 = r.findings.find((f) => f.rule.id === "emag-4.4" && f.element.locator === "#cb1")!;
    expect(cb1.evidence.observed).toMatch(/elemento invisível/);
  });
});

describe("3.4.4 C12 — o salto tem de ser o primeiro a receber foco", () => {
  it("tabindex positivo antes do salto é achado; sem ele, nada", async () => {
    const com = (await scan("/tabindex", ["page"])).findings.filter((f) => f.rule.id === "ds-page-skip-link");
    expect(com).toHaveLength(1);
    expect(com[0].evidence.observed).toMatch(/tabindex=1/);
    expect(com[0].evidence.data?.focusedBefore).toEqual({ tag: "button", tabindex: 1, id: null });
    expect((await scan("/sem-tabindex", ["page"])).findings.filter((f) => f.rule.id === "ds-page-skip-link")).toHaveLength(0);
  });
});

describe("3.4.4 C11 — incompletos do axe com regra, contagem e exemplo", () => {
  it("coverage.axe.incompleteRules diz qual regra o axe não decidiu", async () => {
    const r = await scan("/incompleto", ["axe"]);
    expect(r.coverage.axe?.incomplete).toBeGreaterThan(0);
    const rules = r.coverage.axe?.incompleteRules ?? [];
    expect(rules.some((x) => x.rule === "color-contrast" && x.nodes >= 1 && typeof x.example === "string")).toBe(true);
  });
});

describe("3.4.4 C10 — best-practice do axe e aria-controls quebrado não reprovam critério", () => {
  it("regra só best-practice não tem critério; aria-valid-attr-value só por aria-controls é relação, não 4.1.2 reprovado", () => {
    expect(isBestPracticeOnly(["cat.keyboard", "best-practice"])).toBe(true);
    expect(isBestPracticeOnly(["cat.forms", "wcag2a", "wcag412"])).toBe(false);
    expect(relationOnlyAriaValue("aria-valid-attr-value", 'Fix all of the following:\n  Invalid ARIA attribute value: aria-controls="painel-x"')).toBe(true);
    expect(relationOnlyAriaValue("aria-valid-attr-value", 'Fix all of the following:\n  Invalid ARIA attribute value: aria-expanded="talvez"')).toBe(false);
    expect(relationOnlyAriaValue("aria-valid-attr-value", 'Invalid ARIA attribute values: aria-controls="a", aria-checked="x"')).toBe(false);
    expect(relationOnlyAriaValue("button-name", 'aria-controls="a"')).toBe(false);
  });
});

describe("3.4.4 C1/C9 — resposta do scan e achado do scan reverificado como veio", () => {
  it("C1: a 1ª página enche o teto com famílias; responseCharsEstimate é a resposta inteira; família sem estado nem norma repetidos", async () => {
    const { client, call } = await connect();
    try {
      const r = await call("scan_page", { url: `${base}/familias`, checks: ["tokens"] });
      expect(r.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      expect(r.data.responseCharsEstimate).toBe(r.text.length);
      expect(typeof r.data.itemsChars).toBe("number");
      expect(r.data.totalFamilies).toBeGreaterThan(3);
      // antes parava na meta de 3 com ~70% do teto no cabeçalho
      expect(r.data.families.length).toBeGreaterThan(3);
      expect(r.text.length).toBeGreaterThan(RESPONSE_BUDGET * 0.8);
      for (const f of r.data.families) {
        expect(f).not.toHaveProperty("stateFingerprint");
        expect(f.example).not.toHaveProperty("rule");
      }
      expect(r.data.stateFingerprint).toMatch(/^sha256:/);
      // 3.4.3 (D-154): a janela da receita sobrevive ao cabeçalho encolhido
      if (r.data.state?.full) expect(r.data.state.recipe?.viewportSource).toBeDefined();
    } finally {
      await client.close();
    }
  });

  it("C9: verify_finding com o id do achado do scan herda evidence.data (expectedCondition) e decide", async () => {
    const { client, call } = await connect();
    try {
      const s = await call("scan_page", { url: `${base}/foco`, checks: ["structure"], view: "findings" });
      const f = (s.data.findings as Array<Record<string, any>>).find((x) => x.rule.id === "emag-4.4" && x.element.locator === "#ruim");
      expect(f).toBeDefined();
      const v = await call("verify_finding", {
        finding: {
          id: f!.id,
          rule: { id: "emag-4.4", source: "emag", description: "foco visível" },
          element: { locator: "#ruim", page: `${base}/foco` },
          evidence: { observed: "sem indicador de foco", expected: "indicador visível" },
          severity: "serious",
          nature: "syntactic",
          mode: "interaction",
          pathway: "deterministic",
        },
        live: true,
      });
      expect(v.data.inheritedFromLedger?.fields).toContain("expectedCondition");
      expect(v.data.verification.predicate).toBe("focus-indicator");
      expect(v.data.verdict).toBe("confirmed");
      // id de outro achado (norma diferente): nada é herdado
      const other = await call("verify_finding", {
        finding: {
          id: f!.id,
          rule: { id: "emag-6.6", source: "emag", description: "x" },
          element: { locator: "#ruim", page: `${base}/foco` },
          evidence: { observed: "x", expected: "y" },
          severity: "serious",
          nature: "syntactic",
          mode: "interaction",
          pathway: "deterministic",
        },
      });
      expect(other.data.inheritedFromLedger).toBeUndefined();
    } finally {
      await client.close();
    }
  });
});

describe("3.4.4 C7 — a norma citada pela observação de tipografia existe na base", () => {
  it("relatedRule de token-font-size é uma unidade required da base", async () => {
    const { getRuleById } = await import("../../src/data/knowledge.js");
    const { CHECK_GROUNDING } = await import("../../src/checkers/grounding.js");
    const related = CHECK_GROUNDING["token-font-size"].relatedRule!;
    const rule = getRuleById(related.id);
    expect(rule?.force).toBe(related.force);
    expect(rule?.normalizedRule).toBe(related.text);
    expect(CHECK_GROUNDING["token-font-size"].implements).toEqual([]);
  });
});

describe("3.4.4 C13 — anatomia do Message: a cláusula em prosa aciona o predicado; partes aceitas documentadas", () => {
  it("829632 seleciona o predicado de anatomia com part 'mensagem'; get_component_spec lista as partes", async () => {
    const { selectPredicate } = await import("../../src/verify/predicates.js");
    const sel = selectPredicate({
      id: "F-900",
      rule: { id: "govbr-3.7.0-component-message-829632c90fd3", source: "govbr-ds-kb", description: "x" },
      element: { locator: ".br-message", page: "http://127.0.0.1/x" },
      evidence: { observed: "x", expected: "y", data: { expectedCondition: "required-anatomy-part-present", component: "message", part: "mensagem" } },
      severity: "serious", nature: "semantic", mode: "display", pathway: "heuristic",
    } as never);
    expect(sel.predicate).not.toBeNull();
    const { client, call } = await connect();
    try {
      const spec = await call("get_component_spec", { component: "message" });
      expect(spec.text.length).toBeLessThanOrEqual(RESPONSE_BUDGET);
      const parts = spec.data.verifiableAnatomy?.parts as Array<{ part: string; rules: string[] }>;
      expect(parts.find((p) => p.part === "mensagem")?.rules).toContain("govbr-3.7.0-component-message-829632c90fd3");
    } finally {
      await client.close();
    }
  });
});
