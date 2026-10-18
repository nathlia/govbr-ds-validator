/**
 * 2.14.3 — vínculo ESTA mensagem ↔ ESTE campo no P1 item-identified (NAT-61, revisão Codex 4d66c40e),
 * no navegador, pelo mesmo portão `verifyFinding` dos dois perfis.
 *
 * Achado do Codex: Telefone em erro (S3 e, no evaluation, S5); a mensagem dele diz "Telefone invalido.";
 * a mensagem de OUTRO campo ("Numero recusado.") aparece na mesma ação. Com sujeito #target, a alegação
 * com errorMessage=#wrong saía `confirmed` nos dois perfis. Contrato: (a) erro detectado, (b) a mensagem
 * pertence ao campo (IDREF exato do campo, ou contenção num contêiner só dele, estável), (c) item
 * identificado/descrito (contraprovas AX e textuais). Fixtures sintéticas, não são os controles do portão.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { closeBrowser } from "../../src/evidence/browser.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { runKnowledgeLocked, resetKnowledgeLock } from "../../src/data/lock.js";
import { EXPECTED_CONDITIONS as C } from "../../src/schema/structuredClaims.js";
import type { Finding } from "../../src/schema/finding.js";
import type { PageAction } from "../../src/scan/actions.js";

const page = (body: string, script: string) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contato – Biblioteca</title></head>
<body><main><h1>Contato</h1><form id="f" novalidate>${body}<button id="submit" type="submit">Enviar</button></form><div id="fora"></div></main><script>
const f = document.getElementById('f'); const $ = (s) => document.querySelector(s);
function span(parent, id, text, cls) { const m = document.createElement('span'); m.id = id; if (cls) m.className = cls; m.textContent = text; parent.appendChild(m); return m; }
f.addEventListener('submit', (e) => { e.preventDefault(); ${script} });</script></body></html>`;

// o par do Codex: dois contêineres de um campo cada; S3 (aria-invalid no contêiner do alvo) + S5 (danger) no alvo
const PAR = `<div id="target-group" class="br-input"><label for="target">Telefone</label><input id="target"><span id="right"></span></div>
<div id="other-group"><label for="other">Cartao</label><input id="other"><span id="wrong"></span></div>`;
const ERRO_ALVO = "$('#target-group').classList.add('danger'); $('#target-group').setAttribute('aria-invalid','true');";

const PAGES: Record<string, string> = {
  // literal do repro do Codex (a mensagem certa nomeia o campo)
  "/par": page(PAR, `${ERRO_ALVO} $('#right').textContent='Telefone invalido.'; $('#wrong').textContent='Numero recusado.';`),
  // mesma estrutura, mensagem certa genérica (não nomeia o campo)
  "/par-generico": page(PAR, `${ERRO_ALVO} $('#right').textContent='Valor invalido.'; $('#wrong').textContent='Numero recusado.';`),
  // seletor que casa várias mensagens (.msg no alvo e no outro)
  "/varias": page(PAR, `${ERRO_ALVO} $('#right').className='msg'; $('#right').textContent='Valor invalido.'; $('#wrong').className='msg'; $('#wrong').textContent='Numero recusado.';`),
  // IDREF para um contêiner genérico (resumo com as mensagens de dois campos); o alvo não expõe invalid
  "/idref-generico": page(
    PAR,
    `${ERRO_ALVO} const r = $('#fora'); r.id = 'resumo'; span(r, 'm1', 'Valor invalido.'); span(r, 'm2', 'Numero recusado.'); $('#target').setAttribute('aria-errormessage','resumo');`
  ),
  // mensagem externa (fora do contêiner) explicitamente vinculada pelo aria-errormessage do campo
  "/externa-vinculada": page(PAR, `${ERRO_ALVO} span($('#fora'), 'm-ext', 'Valor invalido.'); $('#target').setAttribute('aria-errormessage','m-ext');`),
  // a mesma, pelo aria-describedby: a descrição calculada contém a mensagem → contraprova (rejeita)
  "/externa-describedby": page(PAR, `${ERRO_ALVO} span($('#fora'), 'm-ext', 'Valor invalido.'); $('#target').setAttribute('aria-describedby','m-ext');`),
  // mensagem externa sem relação explícita (global): não associa
  "/externa-solta": page(PAR, `${ERRO_ALVO} span($('#fora'), 'm-ext', 'Valor invalido.');`),
  // contêiner de vários campos: S2 (validação nativa executada) no alvo, mensagem no contêiner comum
  "/wrapper-multi": page(
    `<div id="g"><label for="target">Telefone</label><input id="target" required><label for="other">Cartao</label><input id="other"></div>`,
    "f.checkValidity(); span($('#g'), 'm', 'Valor invalido.');"
  ),
  // contêiner só do campo: S2 no alvo, mensagem no contêiner dele
  "/wrapper-unico": page(
    `<div id="g"><div id="wt"><label for="target">Telefone</label><input id="target" required></div><label for="other">Cartao</label><input id="other"></div>`,
    "f.checkValidity(); span($('#wt'), 'm', 'Valor invalido.');"
  ),
};

let server: Server;
let base = "";
beforeAll(async () => {
  server = createHttpServer((req, res) => {
    const body = PAGES[new URL(req.url ?? "/", "http://x").pathname];
    if (!body) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await closeBrowser();
  await new Promise((r) => server.close(() => r(undefined)));
});
afterEach(() => resetKnowledgeLock());

const CLICK: PageAction[] = [{ action: "click", selector: "#submit" }];
function claim(path: string, errorMessage: string): Finding {
  return {
    id: "F-901",
    rule: { id: "3.3.1", source: "wcag", description: "Binding diagnostic" },
    element: { locator: "#target", page: `${base}${path}` },
    evidence: { observed: "Unassociated feedback", expected: "Identify field", data: { expectedCondition: C.errorItemIdentified, errorMessage } },
    severity: "serious",
    nature: "semantic",
    mode: "interaction",
    pathway: "heuristic",
  };
}
const both = async (path: string, message: string) => ({
  evaluation: await verifyFinding({ finding: claim(path, message), live: true, actions: CLICK }),
  knowledgeFree: await runKnowledgeLocked(() => verifyFinding({ finding: claim(path, message), live: true, actions: CLICK, knowledgeFree: true })),
});

describe("P1 2.14.3: a mensagem alegada tem de pertencer ao campo (revisão Codex 4d66c40e)", () => {
  it("par do Codex: a mensagem certa nomeia o campo → rejected; a mensagem do outro campo → nunca confirmed (os dois perfis)", async () => {
    const right = await both("/par", "#right");
    expect(right.evaluation.verdict).toBe("rejected");
    expect(right.knowledgeFree.verdict).toBe("rejected");
    const wrong = await both("/par", "#wrong");
    expect(wrong.evaluation.verdict).toBe("unverifiable");
    expect(wrong.knowledgeFree.verdict).toBe("unverifiable");
    expect(wrong.evaluation.detail).toContain("não pertence comprovadamente a este campo");
  });

  it("mesma ação, mensagem certa genérica → confirmed pelo contêiner só do campo; a do outro campo → unverifiable", async () => {
    const right = await both("/par-generico", "#right");
    expect(right.evaluation.verdict).toBe("confirmed");
    expect(right.knowledgeFree.verdict).toBe("confirmed");
    expect(right.evaluation.detail).toContain("vínculo estrutural");
    expect(right.knowledgeFree.detail).not.toContain("br-input");
    const wrong = await both("/par-generico", "#wrong");
    expect(wrong.evaluation.verdict).toBe("unverifiable");
    expect(wrong.knowledgeFree.verdict).toBe("unverifiable");
  });

  it("seletor que casa várias mensagens → unverifiable (ambíguo)", async () => {
    const v = await both("/varias", ".msg");
    expect(v.evaluation.verdict).toBe("unverifiable");
    expect(v.knowledgeFree.verdict).toBe("unverifiable");
    expect(v.evaluation.detail).toContain("casa 2 elementos");
  });

  it("IDREF do campo para um contêiner genérico (resumo de dois campos) não vincula a mensagem de dentro", async () => {
    const v = await both("/idref-generico", "#m1");
    expect(v.evaluation.verdict).toBe("unverifiable");
    expect(v.knowledgeFree.verdict).toBe("unverifiable");
    expect(v.evaluation.detail).toContain("contêiner genérico");
  });

  it("mensagem externa explicitamente vinculada: aria-errormessage → confirmed; aria-describedby → a descrição contradiz; solta → unverifiable", async () => {
    const linked = await both("/externa-vinculada", "#m-ext");
    expect(linked.evaluation.verdict).toBe("confirmed");
    expect(linked.knowledgeFree.verdict).toBe("confirmed");
    expect(linked.evaluation.detail).toContain("vínculo explícito: aria-errormessage");
    const described = await both("/externa-describedby", "#m-ext");
    expect(described.evaluation.verdict).toBe("rejected");
    expect(described.knowledgeFree.verdict).toBe("rejected");
    const loose = await both("/externa-solta", "#m-ext");
    expect(loose.evaluation.verdict).toBe("unverifiable");
    expect(loose.knowledgeFree.verdict).toBe("unverifiable");
  });

  it("contêiner de um campo vincula; contêiner de vários campos não (mesmo sinal S2)", async () => {
    const unico = await both("/wrapper-unico", "#m");
    expect(unico.evaluation.verdict).toBe("confirmed");
    expect(unico.knowledgeFree.verdict).toBe("confirmed");
    const multi = await both("/wrapper-multi", "#m");
    expect(multi.evaluation.verdict).toBe("unverifiable");
    expect(multi.knowledgeFree.verdict).toBe("unverifiable");
  });
});
