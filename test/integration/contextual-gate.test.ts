/**
 * Verificação contextual delimitada (2.13.0, NAT-85) contra páginas vivas.
 *
 * Fixtures sintéticas e neutras (nenhum markup, texto ou seletor das telas A/B nem dos controles):
 * cada família tem par defeituoso/conforme com a mesma estrutura-base, opcional/não aplicável,
 * exceção legítima, dado faltante, alegação contradita, múltiplos sujeitos com um conforme e estado
 * diferente. O veredito esperado de cada uma é conhecido por construção.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { closeBrowser } from "../../src/evidence/browser.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { PageScanCache, scanPage, type PageScanResult } from "../../src/scan/pageScan.js";
import { EXPECTED_CONDITIONS as C } from "../../src/schema/structuredClaims.js";
import type { Finding } from "../../src/schema/finding.js";
import type { PageAction } from "../../src/scan/actions.js";

const STYLE = `<style>
  .campo input { border: 1px solid rgb(136, 136, 136); }
  .campo.erro input { border-color: rgb(200, 0, 0); }
  .fundo { display: none; }
  .fundo.ativo { display: block; }
  .br-menu { position: relative; height: 0; }
  .br-menu .painel { display: none; position: fixed; top: 0; left: 0; width: 300px; height: 300px; background: #fff; }
  .br-menu.ativo .painel { display: block; }
  [hidden] { display: none !important; }
</style>`;

function page(body: string, script = ""): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cadastro de visitas – Museu</title>${STYLE}</head>
<body><main><h1>Cadastro de visitas</h1>${body}</main><a href="#fim">Rodapé</a><p id="fim">fim</p><script>${script}</script></body></html>`;
}

// ───────────── P1 ─────────────
const FORM = (extra = "") => `<form id="f" novalidate>
  <div class="campo" id="caixa-codigo"><label for="codigo">Código da visita</label><input id="codigo" type="text"${extra}></div>
  <button id="enviar" type="submit">Enviar</button></form><div id="resumo"></div>`;
// 2.14.1: o erro detectado exige sinal programático. Padrão das fixtures: S3 (aria-invalid no
// contêiner só do campo); SINAL "" deixa só a mudança de aparência (classe 'erro'), que não basta.
const S3 = "caixa.setAttribute('aria-invalid','true');";
const VALIDA = (onError: string, sinal = S3) => `
  const f = document.getElementById('f'); const c = document.getElementById('codigo'); const caixa = document.getElementById('caixa-codigo');
  f.addEventListener('submit', (e) => { e.preventDefault(); const old = document.getElementById('codigo-msg'); if (old) old.remove();
    if (!/^\\d{6}$/.test(c.value)) { caixa.classList.add('erro'); ${sinal} ${onError} } });`;
const MSG = (text: string) => `const m = document.createElement('span'); m.id = 'codigo-msg'; m.textContent = '${text}'; caixa.appendChild(m);`;

const PAGES: Record<string, string> = {
  "/p1-defeito": page(FORM(), VALIDA(MSG("Valor inválido."))),
  // 2.14.1 — conjunto de sinais de erro detectado (S1..S4) e o que não é sinal.
  "/p1-so-aparencia": page(FORM(), VALIDA(MSG("Valor inválido."), "")),
  "/p1-errormessage": page(FORM(), VALIDA(MSG("Valor inválido.") + " c.setAttribute('aria-errormessage','codigo-msg');", "")),
  "/p1-checkvalidity": page(
    FORM(" required"),
    `const f = document.getElementById('f'); const c = document.getElementById('codigo'); const caixa = document.getElementById('caixa-codigo');
     f.addEventListener('submit', (e) => { e.preventDefault(); if (!f.checkValidity()) { ${MSG("Valor inválido.")} } });`
  ),
  "/p1-checkvalidity-valido": page(
    FORM(" required"),
    `const f = document.getElementById('f'); const c = document.getElementById('codigo'); const caixa = document.getElementById('caixa-codigo');
     f.addEventListener('submit', (e) => { e.preventDefault(); f.checkValidity(); ${MSG("Recebido.")} });`
  ),
  "/p1-grupo-invalido": page(
    `<form id="f" novalidate><fieldset id="grupo"><legend>Visita</legend><div class="campo" id="caixa-codigo"><label for="codigo">Código da visita</label><input id="codigo"></div>
     <label for="data">Data</label><input id="data"></fieldset><button id="enviar" type="submit">Enviar</button></form>`,
    `const caixa = document.getElementById('caixa-codigo'); document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault();
       document.getElementById('grupo').setAttribute('aria-invalid','true'); ${MSG("Valor inválido.")} });`
  ),
  "/p1-invalido-antes": page(
    FORM(),
    `const c = document.getElementById('codigo'); const caixa = document.getElementById('caixa-codigo');
     c.addEventListener('input', () => caixa.setAttribute('aria-invalid','true'));
     document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); ${MSG("Valor inválido.")} });`
  ),
  "/p1-aparencia-antes": page(
    FORM(),
    `const c = document.getElementById('codigo'); const caixa = document.getElementById('caixa-codigo');
     c.addEventListener('input', () => caixa.classList.add('erro'));
     document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); ${MSG("Valor inválido.")} });`
  ),
  "/p1-conforme": page(FORM(), VALIDA(MSG("Valor inválido.") + " c.setAttribute('aria-invalid','true'); c.setAttribute('aria-describedby','codigo-msg');")),
  "/p1-idref-quebrado": page(FORM(), VALIDA(MSG("Valor inválido.") + " c.setAttribute('aria-describedby','codigo-msgs');")),
  "/p1-nomeia-campo": page(FORM(), VALIDA(MSG("Código da visita: use 6 dígitos."))),
  "/p1-so-cor": page(FORM(), VALIDA("")),
  "/p1-so-cor-conforme": page(FORM(), VALIDA(MSG("Código da visita: use 6 dígitos.") + " c.setAttribute('aria-describedby','codigo-msg');")),
  "/p1-sem-validacao": page(FORM(), "document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); document.getElementById('resumo').textContent = 'Visita registrada.'; });"),
  "/p1-shadow": page(
    `<form id="f" novalidate><campo-visita id="cv"></campo-visita><button id="enviar" type="submit">Enviar</button></form><span id="cv-msg" hidden>Valor inválido.</span>`,
    `customElements.define('campo-visita', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'open' });
      r.innerHTML = '<style>input{border:1px solid rgb(136,136,136)} input.erro{border-color:rgb(200,0,0)}</style><label for="i">Código da visita</label><input id="i" aria-describedby="cv-msg">'; } });
     document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); const i = document.getElementById('cv').shadowRoot.getElementById('i'); i.classList.add('erro'); document.getElementById('cv').setAttribute('aria-invalid','true'); document.getElementById('cv-msg').hidden = false; });`
  ),
  // 2.14.3: o mesmo, com a mensagem dentro de um contêiner que delimita só o campo (o host + a mensagem)
  "/p1-shadow-grupo": page(
    `<form id="f" novalidate><div id="grupo"><campo-visita id="cv"></campo-visita><span id="cv-msg" hidden>Valor inválido.</span></div><button id="enviar" type="submit">Enviar</button></form>`,
    `customElements.define('campo-visita', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'open' });
      r.innerHTML = '<style>input{border:1px solid rgb(136,136,136)} input.erro{border-color:rgb(200,0,0)}</style><label for="i">Código da visita</label><input id="i" aria-describedby="cv-msg">'; } });
     document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); const i = document.getElementById('cv').shadowRoot.getElementById('i'); i.classList.add('erro'); document.getElementById('cv').setAttribute('aria-invalid','true'); document.getElementById('cv-msg').hidden = false; });`
  ),
  "/p1-shadow-conforme": page(
    `<form id="f" novalidate><campo-visita id="cv"></campo-visita><button id="enviar" type="submit">Enviar</button></form>`,
    `customElements.define('campo-visita', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'open' });
      r.innerHTML = '<style>input{border:1px solid rgb(136,136,136)} input.erro{border-color:rgb(200,0,0)}</style><label for="i">Código da visita</label><input id="i" aria-describedby="m"><span id="m" hidden>Valor inválido.</span>'; } });
     document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); const r = document.getElementById('cv').shadowRoot; r.getElementById('i').classList.add('erro'); r.getElementById('m').hidden = false; });`
  ),
  "/p1-dois-campos": page(
    `<form id="f" novalidate><div class="campo" id="ca"><label for="a">Nome</label><input id="a"></div><div class="campo" id="cb"><label for="b">Telefone</label><input id="b"></div><button id="enviar" type="submit">Enviar</button></form>`,
    `document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); for (const [id, box] of [['a','ca'],['b','cb']]) {
       document.getElementById(box).classList.add('erro'); document.getElementById(box).setAttribute('aria-invalid','true'); const m = document.createElement('span'); m.id = id + '-msg'; m.textContent = 'Valor inválido.'; document.getElementById(box).appendChild(m); }
       const a = document.getElementById('a'); a.setAttribute('aria-invalid','true'); a.setAttribute('aria-describedby','a-msg'); });`
  ),
  "/p1-status": page(FORM(), VALIDA("document.getElementById('resumo').textContent = '1 campo precisa de correção.';")),
  "/p1-status-alert": page(FORM().replace('<div id="resumo">', '<div id="resumo" role="alert">'), VALIDA("document.getElementById('resumo').textContent = '1 campo precisa de correção.';")),
  "/p1-status-output": page(FORM().replace('<div id="resumo"></div>', '<output id="resumo"></output>'), VALIDA("document.getElementById('resumo').textContent = '1 campo precisa de correção.';")),
  "/p1-nativa": page(
    `<form id="f"><div class="campo" id="caixa-codigo"><label for="codigo">Código da visita</label><input id="codigo" type="text" required pattern="\\d{6}"></div><button id="enviar" type="submit">Enviar</button></form>`,
    "const c = document.getElementById('codigo'); c.addEventListener('invalid', () => document.getElementById('caixa-codigo').classList.add('erro')); document.getElementById('f').addEventListener('submit', (e) => e.preventDefault());"
  ),
  "/p1-status-foco": page(FORM().replace('<div id="resumo">', '<div id="resumo" tabindex="-1">'), VALIDA("const r = document.getElementById('resumo'); r.textContent = '1 campo precisa de correção.'; r.focus();")),

  // ───────────── P2 ─────────────
  "/p2-message": page(`<div class="br-message" id="m1"><div class="icon"><i>!</i></div><div class="content"><span class="message-body">Inscrições abertas.</span></div></div>
    <div class="br-message" id="m2"><div class="icon"><i>!</i></div><div class="content"><span class="message-title">Atenção</span><span class="message-body"></span></div><div class="close"><button aria-label="Fechar">x</button></div></div>`),
  "/p2-message-fechada": page(`<div class="br-message" id="mf"><div class="icon"><i>!</i></div><div class="content"><texto-fechado></texto-fechado></div></div>`,
    "customElements.define('texto-fechado', class extends HTMLElement { constructor() { super(); this.attachShadow({ mode: 'closed' }).innerHTML = '<span>Aviso dentro de raiz fechada.</span>'; } });"),
  "/p2-header-vazio": page(`<header class="br-header" id="h"><div class="header-actions"><button aria-label="Menu">≡</button></div></header>`),
  "/p2-header-logo": page(`<header class="br-header" id="h"><div class="header-logo"><img alt="Museu" width="40" height="40" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'/%3E"></div></header>`),
  "/p2-breadcrumb-falta": page(`<nav class="br-breadcrumb"><ol class="crumb-list"><li class="crumb"><a href="/">Início</a></li><li class="crumb"><a href="/visitas">Visitas</a></li></ol></nav>`),
  "/p2-breadcrumb-link": page(`<nav class="br-breadcrumb"><ol class="crumb-list"><li class="crumb"><a href="/">Início</a></li><li class="crumb"><a href="#">Cadastro de visitas</a></li></ol></nav>`),
  "/p2-breadcrumb-atual": page(`<nav class="br-breadcrumb"><ol class="crumb-list"><li class="crumb"><a href="/">Início</a></li><li class="crumb"><a href="/p2-breadcrumb-atual">Cadastro</a></li></ol></nav>`),
  "/p2-breadcrumb-ok": page(`<nav class="br-breadcrumb"><ol class="crumb-list"><li class="crumb"><a href="/">Início</a></li><li class="crumb"><span aria-current="page">Cadastro de visitas</span></li></ol></nav>`),
  "/p2-modal": page(`<button id="abrir">Ver horários</button><div class="fundo" id="fundo"><div class="br-modal" id="janela" role="dialog" aria-modal="true">
      <div class="br-modal-header">Horários<button class="close" aria-label="Fechar">x</button></div><div class="br-modal-body">Terça a domingo.</div></div></div>`,
    "document.getElementById('abrir').addEventListener('click', () => document.getElementById('fundo').classList.add('ativo'));"),
  "/p2-modal-ok": page(`<button id="abrir">Ver horários</button><div class="fundo" id="fundo"><div class="br-modal" id="janela" role="dialog" aria-modal="true">
      <div class="br-modal-header">Horários<button class="close" aria-label="Fechar">x</button></div><div class="br-modal-body">Terça a domingo.</div>
      <div class="br-modal-footer"><button class="br-button primary">Entendi</button></div></div></div>`,
    "document.getElementById('abrir').addEventListener('click', () => document.getElementById('fundo').classList.add('ativo'));"),
};

// ───────────── P3 ─────────────
function modalPage(opts: { delayed?: boolean; restore?: boolean; initial?: "close" | "primary" | "secondary" | "field" | "none"; trap?: boolean; field?: boolean; removeInvoker?: boolean; openOnLoad?: boolean }) {
  const field = opts.field ? `<input id="data" type="text" aria-label="Data">` : "";
  const focus = { close: "j.querySelector('.close').focus();", primary: "j.querySelector('.primary').focus();", secondary: "j.querySelector('.secondary').focus();", field: "j.querySelector('#data').focus();", none: "" }[opts.initial ?? "close"];
  return page(
    `<ul><li id="item"><button id="abrir">Abrir janela</button></li></ul><a href="#outro" id="atras">Link atrás</a>
     <div class="fundo${opts.openOnLoad ? " ativo" : ""}" id="fundo"><div class="br-modal" id="janela" role="dialog" aria-modal="true">
       <div class="br-modal-header">Confirmar<button class="close" aria-label="Fechar">x</button></div>
       <div class="br-modal-body">Deseja continuar?${field}</div>
       <div class="br-modal-footer"><button class="br-button secondary">Cancelar</button><button class="br-button primary">Confirmar</button></div></div></div>`,
    `const fundo = document.getElementById('fundo'); const j = document.getElementById('janela'); const abrir = document.getElementById('abrir'); let origem = null;
     abrir.addEventListener('click', () => { origem = document.activeElement; fundo.classList.add('ativo'); ${opts.delayed ? `setTimeout(() => { ${focus} }, 150);` : focus} });
     j.addEventListener('keydown', (e) => {
       if (e.key === 'Escape') { fundo.classList.remove('ativo'); ${opts.removeInvoker ? "document.getElementById('item').remove();" : ""} ${opts.restore ? (opts.delayed ? "setTimeout(() => { if (origem && origem.isConnected) origem.focus(); }, 150);" : "if (origem && origem.isConnected) origem.focus();") : ""} }
       ${opts.trap ? "if (e.key === 'Tab') { const l = Array.from(j.querySelectorAll('button')); if (!e.shiftKey && document.activeElement === l[l.length-1]) { e.preventDefault(); l[0].focus(); } }" : ""}
     });`
  );
}
Object.assign(PAGES, {
  "/p3-restaura": modalPage({ restore: true }),
  "/p3-nao-restaura": modalPage({ restore: false }),
  "/p3-restaura-tarde": modalPage({ restore: true, delayed: true }),
  "/p3-nao-restaura-tarde": modalPage({ restore: false, delayed: true }),
  "/p3-foco-primaria-tarde": modalPage({ initial: "primary", delayed: true }),
  "/p3-invocador-removido": modalPage({ restore: false, removeInvoker: true }),
  "/p3-ao-carregar": modalPage({ restore: false, openOnLoad: true }),
  "/p3-foco-fora": modalPage({ initial: "none" }),
  "/p3-foco-primaria": modalPage({ initial: "primary" }),
  "/p3-foco-secundaria": modalPage({ initial: "secondary" }),
  "/p3-foco-campo": modalPage({ initial: "field", field: true }),
  "/p3-sem-laco": modalPage({ initial: "primary" }),
  "/p3-laco": modalPage({ initial: "primary", trap: true }),
  "/p3-duas": page(
    `<button id="abrir-a">A</button><button id="abrir-b">B</button>
     <div class="fundo" id="fa"><div class="br-modal" id="ja" role="dialog"><div class="br-modal-body">A</div><button class="close" aria-label="Fechar">x</button></div></div>
     <div class="fundo" id="fb"><div class="br-modal" id="jb" role="dialog"><div class="br-modal-body">B</div><button class="close" aria-label="Fechar">x</button></div></div>`,
    `for (const [b, f, restore] of [['abrir-a','fa',true],['abrir-b','fb',false]]) { const inv = document.getElementById(b); const fundo = document.getElementById(f);
       inv.addEventListener('click', () => { fundo.classList.add('ativo'); fundo.querySelector('.close').focus(); });
       fundo.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fundo.classList.remove('ativo'); if (restore) inv.focus(); } }); }`
  ),
  "/p3-message": page(
    `<button id="salvar">Salvar</button><div class="br-message" id="aviso" hidden><div class="content">Salvo.</div><div class="close"><button aria-label="Fechar">x</button></div></div>`,
    "document.getElementById('salvar').addEventListener('click', () => { document.getElementById('aviso').hidden = false; });"
  ),
  "/p3-message-ok": page(
    `<button id="salvar">Salvar</button><div class="br-message" id="aviso" hidden><div class="content">Salvo.</div><div class="close"><button aria-label="Fechar">x</button></div></div>`,
    "document.getElementById('salvar').addEventListener('click', () => { const a = document.getElementById('aviso'); a.hidden = false; a.querySelector('.close button').focus(); });"
  ),
  "/p3-message-sem-fechar": page(
    `<button id="salvar">Salvar</button><div class="br-message" id="aviso" hidden><div class="content">Salvo.</div></div>`,
    "document.getElementById('salvar').addEventListener('click', () => { document.getElementById('aviso').hidden = false; });"
  ),
  "/p3-menu": page(
    `<button id="abrir-menu">Menu</button><div class="br-menu" id="menu"><div class="painel"><div class="menu-close"><button aria-label="Fechar menu">x</button></div><a href="#a">Acervo</a></div></div>`,
    "document.getElementById('abrir-menu').addEventListener('click', () => document.getElementById('menu').classList.add('ativo'));"
  ),
});

let server: Server;
let base: string;

beforeAll(async () => {
  server = createHttpServer((req, res) => {
    const html = PAGES[(req.url ?? "/").split("?")[0]];
    if (!html) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await closeBrowser();
  await new Promise<void>((r) => server.close(() => r()));
});

const KB = (s: string) => `govbr-3.7.0-${s}`;

function claim(path: string, locator: string, rule: { id: string; source: Finding["rule"]["source"] }, data: Record<string, unknown>): Finding {
  return {
    id: "F-850",
    rule: { ...rule, description: "alegação contextual" },
    element: { locator, page: `${base}${path}` },
    evidence: { observed: "observado", expected: "esperado", data },
    severity: "serious",
    nature: "semantic",
    mode: "interaction",
    pathway: "heuristic",
  };
}

const SUBMIT: PageAction[] = [{ action: "fill", selector: "#codigo", value: "12" }, { action: "click", selector: "#enviar" }];
const WCAG331 = { id: "3.3.1", source: "wcag" as const };
const EMAG66 = { id: "6.6", source: "emag" as const };
const identified = (msg = "#codigo-msg") => ({ expectedCondition: C.errorItemIdentified, errorMessage: msg });

async function verdict(finding: Finding, actions: PageAction[] = [], extra: Record<string, unknown> = {}) {
  return verifyFinding({ finding, live: true, actions, ...extra });
}

describe("P1 — associação controle↔erro (WCAG 3.3.1 / e-MAG 6.6)", () => {
  it("par: mensagem genérica sem associação confirma; a mesma página com invalid + descrição rejeita", async () => {
    const d = await verdict(claim("/p1-defeito", "#codigo", WCAG331, identified()), SUBMIT);
    expect(d.verdict).toBe("confirmed");
    expect(d.predicate).toBe("context-error-item-identified");
    expect((d.binding?.context as { accessibility: unknown[] }).accessibility).toHaveLength(1);
    const c = await verdict(claim("/p1-conforme", "#codigo", EMAG66, identified()), SUBMIT);
    expect(c.verdict).toBe("rejected");
    expect(c.checks?.violation).toBe("contradicted");
  });

  it("2.14.1: erro detectado só por sinal programático estabelecido pela última ação (S2, S3, S4); aparência sozinha não confirma", async () => {
    const s3 = await verdict(claim("/p1-defeito", "#codigo", WCAG331, identified()), SUBMIT);
    expect(s3.detail).toContain("S3");
    const s4 = await verdict(claim("/p1-errormessage", "#codigo", WCAG331, identified()), SUBMIT);
    expect(s4.verdict).toBe("confirmed");
    expect(s4.detail).toContain("S4");
    const VAZIO: PageAction[] = [{ action: "fill", selector: "#codigo", value: "" }, { action: "click", selector: "#enviar" }];
    const s2 = await verdict(claim("/p1-checkvalidity", "#codigo", WCAG331, identified()), VAZIO);
    expect(s2.verdict).toBe("confirmed");
    expect(s2.detail).toContain("S2");
    // Sem sinal: undetermined → unverifiable, nunca confirmed.
    for (const [path, actions] of [
      ["/p1-so-aparencia", SUBMIT], // mensagem + mudança de aparência (o mecanismo da 2.14.0)
      ["/p1-aparencia-antes", SUBMIT], // aparência mudou antes do gatilho
      ["/p1-invalido-antes", SUBMIT], // aria-invalid no contêiner já valia antes do gatilho: não é estabelecido por ela
      ["/p1-grupo-invalido", SUBMIT], // aria-invalid num grupo com outro campo: não aponta este campo
      ["/p1-checkvalidity-valido", SUBMIT], // validação nativa executada, mas o campo é válido (nenhum evento invalid)
    ] as const) {
      const v = await verdict(claim(path, "#codigo", WCAG331, identified()), [...actions]);
      expect(v.verdict, path).toBe("unverifiable");
      expect(v.checks?.violation, path).toBe("undetermined");
    }
    const soAparencia = await verdict(claim("/p1-so-aparencia", "#codigo", WCAG331, identified()), SUBMIT);
    expect(soAparencia.detail).toContain("nenhum sinal programático");
    const soCor = await verdict(claim("/p1-so-aparencia", "#codigo", WCAG331, { expectedCondition: C.errorDescribedInText }), SUBMIT);
    expect(soCor.verdict).toBe("unverifiable");
  });

  it("IDREF quebrado: a relação calculada decide, e o alvo ausente aparece no detalhe", async () => {
    const v = await verdict(claim("/p1-idref-quebrado", "#codigo", WCAG331, identified()), SUBMIT);
    expect(v.verdict).toBe("confirmed");
    expect(v.detail).toContain("aria-describedby→codigo-msgs");
  });

  it("alternativa válida: mensagem que nomeia o campo, sem ARIA nenhum, é conforme", async () => {
    const v = await verdict(claim("/p1-nomeia-campo", "#codigo", WCAG331, identified()), SUBMIT);
    expect(v.verdict).toBe("rejected");
  });

  it("shadow root aberto: IDREF que não atravessa a fronteira não vincula (2.14.3); contêiner só do campo confirma; mensagem na mesma raiz rejeita", async () => {
    // 2.14.3 (revisão Codex 4d66c40e): a mensagem fora do campo, com IDREF que não resolve na árvore dele, é global/externa sem vínculo
    const d = await verdict(claim("/p1-shadow", "campo-visita >>> input", WCAG331, identified("#cv-msg")), [{ action: "click", selector: "#enviar" }]);
    expect(d.verdict).toBe("unverifiable");
    const g = await verdict(claim("/p1-shadow-grupo", "campo-visita >>> input", WCAG331, identified("#cv-msg")), [{ action: "click", selector: "#enviar" }]);
    expect(g.verdict).toBe("confirmed");
    const c = await verdict(claim("/p1-shadow-conforme", "campo-visita >>> input", WCAG331, identified("campo-visita >>> #m")), [{ action: "click", selector: "#enviar" }]);
    expect(c.verdict).toBe("rejected");
  });

  it("erro só por cor: sem texto confirma; com texto associado rejeita", async () => {
    const data = { expectedCondition: C.errorDescribedInText };
    expect((await verdict(claim("/p1-so-cor", "#codigo", WCAG331, data), SUBMIT)).verdict).toBe("confirmed");
    expect((await verdict(claim("/p1-so-cor-conforme", "#codigo", WCAG331, data), SUBMIT)).verdict).toBe("rejected");
  });

  it("não aplicável: página sem detecção de erro nunca confirma", async () => {
    const v = await verdict(claim("/p1-sem-validacao", "#codigo", WCAG331, { expectedCondition: C.errorDescribedInText }), SUBMIT);
    expect(v.verdict).toBe("unverifiable");
    expect(v.checks?.violation).toBe("undetermined");
  });

  it("dado faltante: sem gatilho, sem errorMessage ou sem live fica unverifiable", async () => {
    expect((await verdict(claim("/p1-defeito", "#codigo", WCAG331, identified()), [])).verdict).toBe("unverifiable");
    const semMensagem = await verdict(claim("/p1-defeito", "#codigo", WCAG331, { expectedCondition: C.errorItemIdentified }), SUBMIT);
    expect(semMensagem.verdict).toBe("unverifiable");
    expect(semMensagem.predicate).toBeNull();
    const naoVivo = await verifyFinding({ finding: claim("/p1-defeito", "#codigo", WCAG331, identified()), live: false });
    expect(naoVivo.verdict).toBe("unverifiable");
  });

  it("múltiplos sujeitos com um conforme: a alegação sobre os dois é contradita; sobre o defeituoso, confirmada", async () => {
    const both = await verdict(claim("/p1-dois-campos", "#a, #b", WCAG331, identified("#b-msg")), [{ action: "click", selector: "#enviar" }]);
    expect(both.verdict).toBe("rejected");
    const only = await verdict(claim("/p1-dois-campos", "#b", WCAG331, identified("#b-msg")), [{ action: "click", selector: "#enviar" }]);
    expect(only.verdict).toBe("confirmed");
  });

  it("estado diferente: fingerprint de outro estado deixa a alegação sem verificação, nunca rejeitada", async () => {
    const inicial = (await scanPage({ url: `${base}/p1-defeito`, checks: ["page"] }, new PageScanCache(1))) as PageScanResult;
    const v = await verdict(claim("/p1-defeito", "#codigo", WCAG331, identified()), SUBMIT, { stateFingerprint: inicial.stateFingerprint });
    expect(v.verdict).toBe("unverifiable");
  });

  it("norma genérica ou recomendada não seleciona predicado; aria-describedby nunca é exigido", async () => {
    const generica = await verdict(claim("/p1-defeito", "#codigo", { id: "1.3.1", source: "wcag" }, identified()), SUBMIT);
    expect(generica.verdict).toBe("unverifiable");
    expect(generica.checks?.violation).toBe("no-predicate");
    const recomendada = await verdict(claim("/p1-defeito", "#codigo", { id: KB("accessibility-input-2a9e95371c51"), source: "govbr-ds-kb" }, identified()), SUBMIT);
    expect(recomendada.verdict).toBe("unverifiable");
  });

  it("WCAG 4.1.3: <output> é região viva implícita (conforme, nunca confirma); receita que termina em espera usa a ação anterior como gatilho", async () => {
    const data = { expectedCondition: C.statusMessage };
    const r = { id: "4.1.3", source: "wcag" as const };
    expect((await verdict(claim("/p1-status-output", "#resumo", r, data), SUBMIT)).verdict).toBe("rejected");
    const comEspera: PageAction[] = [...SUBMIT, { action: "wait", ms: 100 }];
    expect((await verdict(claim("/p1-status", "#resumo", r, data), comEspera)).verdict).toBe("confirmed");
  });

  it("validação nativa do navegador: o balão não está no DOM, então 'sem texto' não é decidível", async () => {
    const v = await verdict(claim("/p1-nativa", "#codigo", WCAG331, { expectedCondition: C.errorDescribedInText }), SUBMIT);
    expect(v.verdict).toBe("unverifiable");
    expect(v.detail).toContain("validação nativa");
  });

  it("WCAG 4.1.3: resumo sem papel confirma; role=alert rejeita; foco movido ao resumo é a exceção (rejeita)", async () => {
    const data = { expectedCondition: C.statusMessage };
    const r = { id: "4.1.3", source: "wcag" as const };
    expect((await verdict(claim("/p1-status", "#resumo", r, data), SUBMIT)).verdict).toBe("confirmed");
    expect((await verdict(claim("/p1-status-alert", "#resumo", r, data), SUBMIT)).verdict).toBe("rejected");
    expect((await verdict(claim("/p1-status-foco", "#resumo", r, data), SUBMIT)).verdict).toBe("rejected");
  });
});

describe("P2 — anatomia obrigatória ausente", () => {
  const MENSAGEM = { id: KB("component-message-d0c7ed3f91af"), source: "govbr-ds-kb" as const };
  const anatomy = (component: string, part: string) => ({ expectedCondition: C.anatomyPart, component, part });

  it("par e múltiplas raízes: Message sem texto confirma, com texto rejeita, as duas juntas rejeitam", async () => {
    expect((await verdict(claim("/p2-message", "#m2", MENSAGEM, anatomy("message", "mensagem")))).verdict).toBe("confirmed");
    expect((await verdict(claim("/p2-message", "#m1", MENSAGEM, anatomy("message", "mensagem")))).verdict).toBe("rejected");
    expect((await verdict(claim("/p2-message", ".br-message", MENSAGEM, anatomy("message", "mensagem")))).verdict).toBe("rejected");
  });

  it("parte opcional (título do Message) não tem predicado", async () => {
    const v = await verdict(claim("/p2-message", "#m1", { id: KB("component-message-0e441e3af975"), source: "govbr-ds-kb" }, anatomy("message", "mensagem")));
    expect(v.verdict).toBe("unverifiable");
    expect(v.checks?.violation).toBe("no-predicate");
  });

  it("escopo inacessível: texto dentro de raiz fechada fica unverifiable", async () => {
    const v = await verdict(claim("/p2-message-fechada", "#mf", MENSAGEM, anatomy("message", "mensagem")));
    expect(v.verdict).toBe("unverifiable");
    expect(v.checks?.violation).toBe("undetermined");
  });

  it("Header: sem título confirma; logo no lugar do título é alternativa válida", async () => {
    const r = { id: KB("component-header-e58979706103"), source: "govbr-ds-kb" as const };
    expect((await verdict(claim("/p2-header-vazio", "#h", r, anatomy("header", "titulo")))).verdict).toBe("confirmed");
    expect((await verdict(claim("/p2-header-logo", "#h", r, anatomy("header", "titulo")))).verdict).toBe("rejected");
  });

  it("Breadcrumb: último item é link abreviado para esta mesma página — título não decide, proibição confirma; o scanner não emite os dois na mesma raiz", async () => {
    const titulo = { id: KB("component-breadcrumb-478cffdbb111"), source: "govbr-ds-kb" as const };
    const link = { id: KB("accessibility-breadcrumb-53db61fa81f9"), source: "govbr-ds-kb" as const };
    const t = await verdict(claim("/p2-breadcrumb-atual", ".br-breadcrumb", titulo, anatomy("breadcrumb", "titulo-pagina-atual")));
    expect(t.verdict).toBe("unverifiable");
    expect((await verdict(claim("/p2-breadcrumb-atual", ".br-breadcrumb", link, { expectedCondition: C.currentCrumbNotLink }))).verdict).toBe("confirmed");
    const ids = async (path: string) =>
      ((await scanPage({ url: `${base}${path}`, checks: ["structure"] }, new PageScanCache(1))) as PageScanResult).findings
        .filter((f) => f.rule.source === "govbr-ds-kb")
        .map((f) => f.rule.id);
    expect(await ids("/p2-breadcrumb-atual")).toEqual([link.id]);
    expect(await ids("/p2-breadcrumb-falta")).toEqual([titulo.id]);
  });

  it("Breadcrumb: título da página atual ausente, último item link (proibição) e conforme", async () => {
    const titulo = { id: KB("component-breadcrumb-478cffdbb111"), source: "govbr-ds-kb" as const };
    const link = { id: KB("accessibility-breadcrumb-53db61fa81f9"), source: "govbr-ds-kb" as const };
    expect((await verdict(claim("/p2-breadcrumb-falta", ".br-breadcrumb", titulo, anatomy("breadcrumb", "titulo-pagina-atual")))).verdict).toBe("confirmed");
    expect((await verdict(claim("/p2-breadcrumb-link", ".br-breadcrumb", titulo, anatomy("breadcrumb", "titulo-pagina-atual")))).verdict).toBe("rejected");
    expect((await verdict(claim("/p2-breadcrumb-link", ".br-breadcrumb", link, { expectedCondition: C.currentCrumbNotLink }))).verdict).toBe("confirmed");
    expect((await verdict(claim("/p2-breadcrumb-ok", ".br-breadcrumb", link, { expectedCondition: C.currentCrumbNotLink }))).verdict).toBe("rejected");
  });

  it("Modal sem botões: confirma aberta, rejeita com 'Entendi', e não decide fechada (estado diferente)", async () => {
    const r = { id: KB("component-modal-672bf38f39fb"), source: "govbr-ds-kb" as const };
    const abrir: PageAction[] = [{ action: "click", selector: "#abrir" }];
    expect((await verdict(claim("/p2-modal", "#janela", r, anatomy("modal", "botoes")), abrir)).verdict).toBe("confirmed");
    expect((await verdict(claim("/p2-modal-ok", "#janela", r, anatomy("modal", "botoes")), abrir)).verdict).toBe("rejected");
    const fechada = await verdict(claim("/p2-modal", "#janela", r, anatomy("modal", "botoes")));
    expect(fechada.verdict).toBe("unverifiable");
    const inexistente = await verdict(claim("/p2-modal", "#nao-existe", r, anatomy("modal", "botoes")), abrir);
    expect(inexistente.verdict).toBe("unverifiable");
  });

  it("alegação incoerente: component/part que não são da regra citada não decidem (3.3.0, S-04: unverifiable, corrigir evidence.data)", async () => {
    const v = await verdict(claim("/p2-message", "#m2", MENSAGEM, anatomy("modal", "botoes")));
    expect(v.verdict).toBe("unverifiable");
    expect((v as { issue?: string }).issue).toBe("evidence-inconsistent");
  });

  it("scan_page emite o candidato com âncora de ausência só na raiz defeituosa, e o portão o reconfirma", async () => {
    const result = (await scanPage({ url: `${base}/p2-message`, checks: ["structure"] }, new PageScanCache(1))) as PageScanResult;
    const anatomia = result.findings.filter((f) => f.rule.id === MENSAGEM.id);
    expect(anatomia.map((f) => f.element.locator)).toEqual(["#m2"]);
    expect(anatomia[0].evidence.data).toMatchObject({ component: "message", part: "mensagem", expectedCondition: C.anatomyPart });
    expect((await verifyFinding({ finding: anatomia[0], live: true })).verdict).toBe("confirmed");
    const fechada = (await scanPage({ url: `${base}/p2-modal`, checks: ["structure"] }, new PageScanCache(1))) as PageScanResult;
    expect(fechada.findings.filter((f) => f.rule.source === "govbr-ds-kb")).toEqual([]);
  });
});

describe("P3 — foco em transições", () => {
  const RESTORE = { id: KB("accessibility-modal-f36c91d7073c"), source: "govbr-ds-kb" as const };
  const ACAO = { id: KB("accessibility-modal-6f984d79466a"), source: "govbr-ds-kb" as const };
  const INFO = { id: KB("accessibility-modal-e0ce4b474163"), source: "govbr-ds-kb" as const };
  const OPEN_CLOSE: PageAction[] = [{ action: "press", selector: "#abrir", key: "Enter" }, { action: "press", key: "Escape" }];
  const OPEN: PageAction[] = [{ action: "press", selector: "#abrir", key: "Enter" }];

  it("restauração: par defeituoso/conforme", async () => {
    const d = await verdict(claim("/p3-nao-restaura", "#janela", RESTORE, { expectedCondition: C.focusRestored }), OPEN_CLOSE);
    expect(d.verdict).toBe("confirmed");
    expect((d.binding?.context as { trace: unknown[] }).trace).toHaveLength(3);
    expect((await verdict(claim("/p3-restaura", "#janela", RESTORE, { expectedCondition: C.focusRestored }), OPEN_CLOSE)).verdict).toBe("rejected");
  });

  it("foco tardio (setTimeout): só o valor estável decide — conforme tardio nunca confirma, defeituoso tardio confirma", async () => {
    expect((await verdict(claim("/p3-restaura-tarde", "#janela", RESTORE, { expectedCondition: C.focusRestored }), OPEN_CLOSE)).verdict).toBe("rejected");
    expect((await verdict(claim("/p3-nao-restaura-tarde", "#janela", RESTORE, { expectedCondition: C.focusRestored }), OPEN_CLOSE)).verdict).toBe("confirmed");
    expect((await verdict(claim("/p3-foco-primaria-tarde", "#janela", ACAO, { expectedCondition: C.initialFocus }), OPEN)).verdict).toBe("rejected");
  });

  it("exceções: sem invocador (aberta ao carregar) rejeita; invocador removido fica sem fonte (unverifiable)", async () => {
    const aoCarregar = await verdict(claim("/p3-ao-carregar", "#janela", RESTORE, { expectedCondition: C.focusRestored }), [{ action: "press", selector: "#janela .close", key: "Escape" }]);
    expect(aoCarregar.verdict).not.toBe("confirmed");
    const removido = await verdict(claim("/p3-invocador-removido", "#janela", RESTORE, { expectedCondition: C.focusRestored }), OPEN_CLOSE);
    expect(removido.verdict).toBe("unverifiable");
    expect(removido.detail).toContain("invocador saiu do documento");
  });

  it("dado faltante e estado diferente: sem abertura no traço, ou fingerprint de outro estado → unverifiable", async () => {
    expect((await verdict(claim("/p3-nao-restaura", "#janela", RESTORE, { expectedCondition: C.focusRestored }), [{ action: "press", key: "Escape" }])).verdict).toBe("unverifiable");
    // outro estado: a modal aberta (abrir e fechar volta ao DOM inicial, que é o mesmo estado)
    const outro = (await scanPage({ url: `${base}/p3-nao-restaura`, checks: ["page"], actions: OPEN }, new PageScanCache(1))) as PageScanResult;
    const v = await verdict(claim("/p3-nao-restaura", "#janela", RESTORE, { expectedCondition: C.focusRestored }), OPEN_CLOSE, { stateFingerprint: outro.stateFingerprint });
    expect(v.verdict).toBe("unverifiable");
  });

  it("múltiplos sujeitos: duas modais, uma restaura — juntas rejeitam, a outra sozinha confirma", async () => {
    const actions: PageAction[] = [
      { action: "press", selector: "#abrir-a", key: "Enter" }, { action: "press", key: "Escape" },
      { action: "press", selector: "#abrir-b", key: "Enter" }, { action: "press", key: "Escape" },
    ];
    expect((await verdict(claim("/p3-duas", "#ja, #jb", RESTORE, { expectedCondition: C.focusRestored }), actions)).verdict).toBe("rejected");
    expect((await verdict(claim("/p3-duas", "#jb", RESTORE, { expectedCondition: C.focusRestored }), actions)).verdict).toBe("confirmed");
  });

  it("foco inicial: fora da modal confirma; primária rejeita; secundária (exceção destrutiva) não decide; campo confirma (Q3 a)", async () => {
    const data = { expectedCondition: C.initialFocus };
    expect((await verdict(claim("/p3-foco-fora", "#janela", ACAO, data), OPEN)).verdict).toBe("confirmed");
    expect((await verdict(claim("/p3-foco-primaria", "#janela", ACAO, data), OPEN)).verdict).toBe("rejected");
    expect((await verdict(claim("/p3-foco-secundaria", "#janela", ACAO, data), OPEN)).verdict).toBe("unverifiable");
    expect((await verdict(claim("/p3-foco-campo", "#janela", ACAO, data), OPEN)).verdict).toBe("confirmed");
  });

  it("foco inicial informativa: no fechar rejeita; fora confirma; com campo a regra não se aplica", async () => {
    const data = { expectedCondition: C.initialFocus };
    expect((await verdict(claim("/p3-restaura", "#janela", INFO, data), OPEN)).verdict).toBe("rejected");
    expect((await verdict(claim("/p3-foco-fora", "#janela", INFO, data), OPEN)).verdict).toBe("confirmed");
    expect((await verdict(claim("/p3-foco-campo", "#janela", INFO, data), OPEN)).verdict).toBe("rejected");
  });

  it("confinamento do Tab: sai da modal confirma; laço a partir do último rejeita", async () => {
    const r = { id: KB("accessibility-modal-744f67e17bec"), source: "govbr-ds-kb" as const };
    const actions: PageAction[] = [...OPEN, { action: "press", selector: "#janela .primary", key: "Tab" }];
    const data = { expectedCondition: C.focusContained };
    expect((await verdict(claim("/p3-sem-laco", "#janela", r, data), actions)).verdict).toBe("confirmed");
    expect((await verdict(claim("/p3-laco", "#janela", r, data), actions)).verdict).toBe("rejected");
  });

  it("Message e Menu: foco no fechar ao exibir — defeito, conforme, sem fechar (não se aplica) e painel com raiz de altura 0", async () => {
    const msg = { id: KB("accessibility-message-ad83724b777f"), source: "govbr-ds-kb" as const };
    const data = { expectedCondition: C.focusOnClose };
    const salvar: PageAction[] = [{ action: "click", selector: "#salvar" }];
    expect((await verdict(claim("/p3-message", "#aviso", msg, data), salvar)).verdict).toBe("confirmed");
    expect((await verdict(claim("/p3-message-ok", "#aviso", msg, data), salvar)).verdict).toBe("rejected");
    expect((await verdict(claim("/p3-message-sem-fechar", "#aviso", msg, data), salvar)).verdict).toBe("rejected");
    const menu = { id: KB("accessibility-menu-a3be6788bdea"), source: "govbr-ds-kb" as const };
    expect((await verdict(claim("/p3-menu", "#menu", menu, data), [{ action: "click", selector: "#abrir-menu" }])).verdict).toBe("confirmed");
  });

  it("sem fonte específica: WCAG 2.4.3 para restauração e a recomendação da Message não confirmam", async () => {
    const v = await verdict(claim("/p3-nao-restaura", "#janela", { id: "2.4.3", source: "wcag" }, { expectedCondition: C.focusRestored }), OPEN_CLOSE);
    expect(v.verdict).toBe("unverifiable");
    const rec = await verdict(claim("/p3-message", "#aviso", { id: KB("accessibility-message-18a75fe5583a"), source: "govbr-ds-kb" }, { expectedCondition: C.focusRestored }), [{ action: "click", selector: "#salvar" }]);
    expect(rec.verdict).toBe("unverifiable");
  });
});
