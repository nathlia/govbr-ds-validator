/**
 * 2.14.2 — S5 "estado de erro declarado pelo componente DS" (NAT-61, revisão Codex 8963921e), no
 * navegador, pelo mesmo portão `verifyFinding` dos dois perfis.
 *
 * Fixtures sintéticas e neutras (não são os controles do portão): um formulário com o contêiner
 * `.br-input` do DS e variações do que a página faz no envio. O positivo é o mecanismo que a tabela
 * Estados do Input documenta (br-input → danger); os negativos são os limites da aprovação.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { closeBrowser } from "../../src/evidence/browser.js";
import { verifyFinding } from "../../src/verify/gate.js";
import { knowledgeLockAttempts, runKnowledgeLocked, resetKnowledgeLock } from "../../src/data/lock.js";
import { EXPECTED_CONDITIONS as C } from "../../src/schema/structuredClaims.js";
import type { Finding } from "../../src/schema/finding.js";
import type { PageAction } from "../../src/scan/actions.js";

const FIELD = `<div class="br-input mb-3" id="w"><label for="codigo">Código da turma</label><input id="codigo" type="text"></div>`;
const OTHER = `<div class="br-input mb-3" id="w2"><label for="email">E-mail</label><input id="email" type="email"></div>`;
const page = (body: string, script: string, initial = "") => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Inscrição – Oficina</title></head>
<body><main><h1>Inscrição</h1><form id="f" novalidate>${body}<button id="enviar" type="submit">Inscrever</button></form><p id="retorno"></p></main><script>
const f = document.getElementById('f'); const c = document.getElementById('codigo'); const w = document.getElementById('w'); const r = document.getElementById('retorno');
${initial}
function msg(parent, text) { const m = document.createElement('span'); m.className = 'feedback danger'; m.id = 'codigo-msg'; m.textContent = text; parent.appendChild(m); }
f.addEventListener('submit', (e) => { e.preventDefault(); ${script} });</script></body></html>`;

const PAGES: Record<string, string> = {
  // positivo DS: o .br-input do campo ganha danger e a mensagem genérica aparece, sem associação
  "/ds-erro": page(FIELD, "w.classList.remove('danger'); w.classList.add('danger'); msg(w, 'Valor inválido.');"),
  // contraprova de identificação textual: a mensagem nomeia o campo
  "/ds-erro-nomeia": page(FIELD, "w.classList.add('danger'); msg(w, 'Código da turma: use 6 dígitos.');"),
  // negativos: os outros estados da tabela
  "/ds-success": page(FIELD, "w.classList.add('success'); r.textContent = 'Inscrição concluída com sucesso.'; r.id = 'retorno';"),
  "/ds-warning": page(FIELD, "w.classList.add('warning'); msg(w, 'Valor inválido.');"),
  "/ds-info": page(FIELD, "w.classList.add('info'); msg(w, 'Valor inválido.');"),
  // danger fora do componente: no form, na mensagem (.feedback.danger) e no próprio campo
  "/ds-danger-fora": page(FIELD, "f.classList.add('danger'); c.classList.add('danger'); msg(w, 'Valor inválido.');"),
  // danger no .br-input de OUTRO campo
  "/ds-outro-campo": page(FIELD + OTHER, "document.getElementById('w2').classList.add('danger'); msg(w, 'Valor inválido.');"),
  // um .br-input com dois campos: vínculo ambíguo
  "/ds-varios-campos": page(
    `<div class="br-input mb-3" id="w"><label for="codigo">Código da turma</label><input id="codigo" type="text"><label for="ano">Ano</label><input id="ano" type="text"></div>`,
    "w.classList.add('danger'); msg(w, 'Valor inválido.');"
  ),
  // danger pré-existente: já estava ao carregar
  "/ds-preexistente": page(FIELD, "msg(w, 'Valor inválido.');", "w.classList.add('danger');"),
  // estado conflitante
  "/ds-conflito": page(FIELD, "w.classList.add('danger'); w.classList.add('success'); msg(w, 'Valor inválido.');"),
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
afterEach(() => {
  resetKnowledgeLock();
  delete process.env.GOVBR_VALIDATOR_VIEWPORT;
});

const SUBMIT: PageAction[] = [{ action: "fill", selector: "#codigo", value: "12" }, { action: "click", selector: "#enviar" }];
function claim(path: string, source: "wcag" | "emag", id: string, data: Record<string, unknown>): Finding {
  return {
    id: "F-920",
    rule: { id, source, description: "alegação de teste" },
    element: { locator: "#codigo", page: `${base}${path}` },
    evidence: { observed: "observado", expected: "esperado", data },
    severity: "serious",
    nature: "semantic",
    mode: "interaction",
    pathway: "heuristic",
  };
}
const ITEM = { expectedCondition: C.errorItemIdentified, errorMessage: "#codigo-msg" };
const evaluation = (f: Finding) => verifyFinding({ finding: f, live: true, actions: SUBMIT });
const knowledgeFree = (f: Finding) => runKnowledgeLocked(() => verifyFinding({ finding: f, live: true, actions: SUBMIT, knowledgeFree: true }));

describe("P1 2.14.2: S5 — estado de erro declarado pelo componente DS", () => {
  it("positivo DS: br-input ganha danger pela última ação → confirmed no evaluation (wcag 3.3.1 e emag 6.6), com a fonte na evidência", async () => {
    for (const [source, id] of [["wcag", "3.3.1"], ["emag", "6.6"]] as const) {
      const v = await evaluation(claim("/ds-erro", source, id, ITEM));
      expect(v.verdict, `${source}`).toBe("confirmed");
      expect(v.detail).toContain("S5: estado de erro declarado pelo componente DS");
      expect(v.detail).toContain("input__desenvolvedor.md");
      expect(v.detail).toContain("classe 'danger'");
    }
  });

  it("knowledge-free: o mapeamento não é interpretado nem carregado — só S5 sustentaria a detecção → unverifiable, sem tentativa na trava", async () => {
    const before = knowledgeLockAttempts().attempts;
    const v = await knowledgeFree(claim("/ds-erro", "wcag", "3.3.1", ITEM));
    expect(v.verdict).toBe("unverifiable");
    expect(v.checks?.violation).toBe("undetermined");
    expect(String(v.detail)).not.toContain("br-input");
    expect(knowledgeLockAttempts().attempts).toBe(before);
  });

  it("contraprova de identificação textual continua: mensagem que nomeia o campo rejeita, mesmo com S5", async () => {
    const v = await evaluation(claim("/ds-erro-nomeia", "wcag", "3.3.1", ITEM));
    expect(v.verdict).toBe("rejected");
  });

  const NEGATIVOS: Array<[string, string | null]> = [
    ["/ds-success", null],
    ["/ds-warning", null],
    ["/ds-info", null],
    ["/ds-danger-fora", null],
    ["/ds-outro-campo", null],
    ["/ds-varios-campos", "vínculo com o campo é incerto"],
    ["/ds-preexistente", "pré-existente"],
    ["/ds-conflito", "estado conflitante"],
  ];
  it.each(NEGATIVOS)("negativo %s: nunca confirmed (evaluation wcag/emag, knowledge-free, descrição)", async (path, motivo) => {
    const data = path === "/ds-success" ? { expectedCondition: C.errorItemIdentified, errorMessage: "#retorno" } : ITEM;
    const ev = await evaluation(claim(path, "wcag", "3.3.1", data));
    expect(ev.verdict, `${path} evaluation`).toBe("unverifiable");
    if (motivo) expect(ev.detail).toContain(motivo);
    expect((await evaluation(claim(path, "emag", "6.6", data))).verdict, `${path} emag`).not.toBe("confirmed");
    expect((await knowledgeFree(claim(path, "wcag", "3.3.1", data))).verdict, `${path} knowledge-free`).not.toBe("confirmed");
    expect((await evaluation(claim(path, "wcag", "3.3.1", { expectedCondition: C.errorDescribedInText }))).verdict, `${path} described`).not.toBe("confirmed");
  }, 60_000);

  it("controle verde do Codex no DS: success no br-input + 'concluída com sucesso' nunca confirma, nos dois perfis e nas duas janelas", async () => {
    const data = { expectedCondition: C.errorItemIdentified, errorMessage: "#retorno" };
    for (const janela of [undefined, "1280x900"]) {
      if (janela) process.env.GOVBR_VALIDATOR_VIEWPORT = janela;
      expect((await evaluation(claim("/ds-success", "wcag", "3.3.1", data))).verdict, `ev ${janela}`).toBe("unverifiable");
      expect((await knowledgeFree(claim("/ds-success", "wcag", "3.3.1", data))).verdict, `kf ${janela}`).toBe("unverifiable");
    }
  });
});
