/**
 * Predicados contextuais puros (2.13.0, NAT-85): seleção fechada por regra + condição, decisões
 * sobre fatos sintéticos e a fundamentação de cada condição na base literal.
 */
import { describe, it, expect } from "vitest";
import { selectPredicate } from "../../src/verify/predicates.js";
import {
  ANATOMY_PARTS,
  CONTEXT_CONDITIONS,
  decideAnatomyPart,
  decideCurrentCrumbNotLink,
  evaluateContext,
  normalizeText,
} from "../../src/verify/contextual.js";
import { CONTEXT_GROUNDING } from "../../src/checkers/grounding.js";
import { checkAnatomy } from "../../src/checkers/anatomy.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { findEmagRule } from "../../src/data/load.js";
import { EXPECTED_CONDITIONS as C } from "../../src/schema/structuredClaims.js";
import type { Finding } from "../../src/schema/finding.js";
import type { AnatomyFacts, SubjectSnapshot, TraceObservation } from "../../src/evidence/context.js";

function finding(rule: Finding["rule"], data: Record<string, unknown>): Finding {
  return {
    id: "F-1",
    rule,
    element: { locator: "#x", page: "http://localhost/p" },
    evidence: { observed: "o", expected: "e", data },
    severity: "serious",
    nature: "semantic",
    mode: "interaction",
    pathway: "heuristic",
  };
}

const facts = (over: Partial<AnatomyFacts> = {}): AnatomyFacts => ({
  classes: ["br-message"],
  shown: true,
  opaque: false,
  messageText: [],
  header: { titleText: "", logoVisible: false, infoText: "" },
  breadcrumb: { items: [], h1: "Página", title: "Página – Site" },
  modal: { buttons: 0, closeButtons: 1, bodyFound: 1, bodyContent: true },
  ...over,
});

const snap = (over: Partial<SubjectSnapshot> = {}): SubjectSnapshot => ({
  ref: 0,
  shown: false,
  text: "",
  colors: "a",
  focusInside: false,
  modal: true,
  closeRefs: [],
  primaryRefs: [],
  formFieldRefs: [],
  tabbableRefs: [],
  liveRegion: false,
  classes: ["br-modal"],
  ...over,
});

const obs = (step: number, active: number | null, subjects: SubjectSnapshot[], over: Partial<TraceObservation> = {}): TraceObservation => ({
  step,
  url: "http://localhost/p",
  documentToken: "t",
  active,
  activeDescription: active === null ? null : `<el ${active}>`,
  nextTarget: null,
  subjects,
  message: null,
  disconnected: [],
  ...over,
});

describe("seleção das condições contextuais", () => {
  const wcag331 = { id: "3.3.1", source: "wcag" as const, description: "d" };

  it("regra listada + condição exata seleciona; dados obrigatórios ausentes deixam sem predicado", () => {
    expect(selectPredicate(finding(wcag331, { expectedCondition: C.errorItemIdentified, errorMessage: "#m" })).predicate?.id).toBe("context-error-item-identified");
    const semMensagem = selectPredicate(finding(wcag331, { expectedCondition: C.errorItemIdentified }));
    expect(semMensagem.predicate).toBeNull();
    expect(semMensagem.claimStatus).toBe("missing");
    const semCondicao = selectPredicate(finding(wcag331, {}));
    expect(semCondicao.claimStatus).toBe("missing");
  });

  it("norma genérica, recomendada ou de outro defeito não seleciona", () => {
    expect(selectPredicate(finding({ id: "1.3.1", source: "wcag", description: "d" }, { expectedCondition: C.errorItemIdentified, errorMessage: "#m" })).predicate).toBeNull();
    expect(
      selectPredicate(finding({ id: "govbr-3.7.0-accessibility-input-2a9e95371c51", source: "govbr-ds-kb", description: "d" }, { expectedCondition: C.errorItemIdentified, errorMessage: "#m" })).predicate
    ).toBeNull();
    expect(selectPredicate(finding(wcag331, { expectedCondition: C.focusRestored })).predicate).toBeNull();
  });

  it("component/part de outra regra é alegação contradita", () => {
    const s = selectPredicate(finding({ id: "govbr-3.7.0-component-message-d0c7ed3f91af", source: "govbr-ds-kb", description: "d" }, { expectedCondition: C.anatomyPart, component: "modal", part: "botoes" }));
    expect(s.claimStatus).toBe("contradicted");
  });
});

describe("fundamentação das condições", () => {
  it("toda regra que seleciona predicado existe e é obrigatória ou proibida (WCAG/e-MAG pelo registro)", () => {
    for (const condition of CONTEXT_CONDITIONS) {
      for (const rule of condition.rules) {
        if (rule.source === "govbr-ds-kb") expect(["required", "prohibited"], `${rule.id}`).toContain(getRuleById(rule.id)?.force);
        if (rule.source === "emag") expect(findEmagRule(rule.id)).toBeTruthy();
      }
    }
  });

  it("CONTEXT_GROUNDING só cita ids existentes, nunca exemplo", () => {
    for (const [kind, g] of Object.entries(CONTEXT_GROUNDING)) {
      for (const id of g.implements) {
        const ok = id.startsWith("emag-") ? !!findEmagRule(id.slice(5)) : getRuleById(id)?.force !== undefined && getRuleById(id)?.force !== "example";
        expect(ok, `${kind}: ${id}`).toBe(true);
      }
      expect(g.basis.length).toBeGreaterThan(40);
    }
  });

  it("partes opcionais não estão na tabela de anatomia", () => {
    const ids = ANATOMY_PARTS.flatMap((p) => p.rules);
    expect(ids).not.toContain("govbr-3.7.0-component-message-0e441e3af975");
    expect(ids).not.toContain("govbr-3.7.0-component-modal-f687cfe21f32");
  });
});

describe("decisões de anatomia", () => {
  const mensagem = ANATOMY_PARTS.find((p) => p.part === "mensagem")!;
  it("vazio confirma, texto contradiz, raiz fechada e raiz oculta não decidem, outra raiz não se aplica", () => {
    expect(decideAnatomyPart(mensagem, facts()).status).toBe("verified");
    expect(decideAnatomyPart(mensagem, facts({ messageText: ["Ok"] })).status).toBe("contradicted");
    expect(decideAnatomyPart(mensagem, facts({ opaque: true })).status).toBe("undetermined");
    expect(decideAnatomyPart(mensagem, facts({ shown: false })).status).toBe("undetermined");
    expect(decideAnatomyPart(mensagem, facts({ classes: ["aviso"] })).status).toBe("undetermined");
  });

  it("breadcrumb: último link que não é a página atual confirma; texto diferente sem link não decide; sem h1 nem título não decide", () => {
    const titulo = ANATOMY_PARTS.find((p) => p.part === "titulo-pagina-atual")!;
    const bc = (items: AnatomyFacts["breadcrumb"]["items"], h1: string | null = "Página", title = "Página – Site") =>
      facts({ classes: ["br-breadcrumb"], breadcrumb: { items, h1, title } });
    const item = (text: string, link: boolean, current = false, linksToCurrent = false) => ({ text, link, current, linksToCurrent });
    expect(decideAnatomyPart(titulo, bc([item("Início", true)])).status).toBe("verified");
    expect(decideAnatomyPart(titulo, bc([item("página", false, true)])).status).toBe("contradicted");
    expect(decideAnatomyPart(titulo, bc([item("Pág.", false)])).status).toBe("undetermined");
    expect(decideAnatomyPart(titulo, bc([item("Pág.", true, false, true)])).status).toBe("undetermined");
    expect(decideAnatomyPart(titulo, bc([item("Início", true)], null, "")).status).toBe("undetermined");
    expect(decideCurrentCrumbNotLink(bc([item("Página", true)])).status).toBe("verified");
  });

  it("o scanner só emite o que a decisão confirma", () => {
    const out = checkAnatomy({ url: "http://localhost/p" }, [
      { locator: "#a", facts: facts() },
      { locator: "#b", facts: facts({ messageText: ["Ok"] }) },
      { locator: "#c", facts: facts({ classes: ["br-modal"], shown: false, modal: { buttons: 0, closeButtons: 1, bodyFound: 1, bodyContent: true } }) },
    ]);
    expect(out.map((f) => f.element.locator)).toEqual(["#a"]);
    expect(out[0].pathway).toBe("deterministic");
  });
});

describe("P1: fatos de acessibilidade pareados pelo número do elemento", () => {
  const cond = CONTEXT_CONDITIONS.find((c) => c.check === "error-item-identified")!;
  const f = finding({ id: "3.3.1", source: "wcag", description: "d" }, { expectedCondition: C.errorItemIdentified, errorMessage: "#m" });
  const actions = [{ action: "fill" as const, selector: "#a", value: "1" }, { action: "click" as const, selector: "#ok" }];
  const field = (ref: number, colors: string) => snap({ ref, shown: true, colors, modal: false, classes: [] });
  const trace = [
    obs(0, null, [field(1, "cinza"), field(2, "cinza")], { message: { found: 1, shown: false, text: "" } }),
    obs(1, null, [field(1, "vermelho"), field(2, "vermelho")], { message: { found: 1, shown: true, text: "Valor inválido." } }),
  ];
  const ax = (ref: number, invalid: boolean) => ({ ref, tag: "input", idrefs: [], ax: { name: `Campo ${ref}`, description: "", invalid } });

  it("ordem diferente da do traço não troca os fatos de sujeito", () => {
    // o sujeito 2 é o identificado; os fatos chegam em ordem invertida
    expect(evaluateContext(cond, f, { actions, trace, accessibility: [ax(2, true), ax(1, false)] }).status).toBe("contradicted");
    const soUm = finding({ id: "3.3.1", source: "wcag", description: "d" }, { expectedCondition: C.errorItemIdentified, errorMessage: "#m" });
    const traceUm = trace.map((o) => ({ ...o, subjects: o.subjects.filter((s) => s.ref === 1) }));
    expect(evaluateContext(cond, soUm, { actions, trace: traceUm, accessibility: [ax(1, false)] }).status).toBe("verified");
  });

  it("contagens diferentes entre traço e árvore de acessibilidade não decidem", () => {
    expect(evaluateContext(cond, f, { actions, trace, accessibility: [ax(1, false)] }).status).toBe("undetermined");
  });
});

describe("decisões de foco (traço sintético)", () => {
  const restore = CONTEXT_CONDITIONS.find((c) => c.check === "focus-restored")!;
  const rule = { id: "govbr-3.7.0-accessibility-modal-f36c91d7073c", source: "govbr-ds-kb" as const, description: "d" };
  const f = finding(rule, { expectedCondition: C.focusRestored });
  const actions = [{ action: "press" as const, selector: "#abrir", key: "Enter" }, { action: "press" as const, key: "Escape" }];
  const trace = (closedActive: number | null, over: Partial<TraceObservation> = {}) => [
    obs(-1, null, [snap()], { nextTarget: 7 }),
    obs(0, 1, [snap({ shown: true, focusInside: true })]),
    obs(1, closedActive, [snap()], over),
  ];

  it("invocador (alvo da ação) recebe o foco → contradita; body → confirma", () => {
    expect(evaluateContext(restore, f, { actions, trace: trace(7) }).status).toBe("contradicted");
    expect(evaluateContext(restore, f, { actions, trace: trace(null) }).status).toBe("verified");
  });

  it("invocador removido, novo documento ou fechamento não observado não decidem", () => {
    expect(evaluateContext(restore, f, { actions, trace: trace(null, { disconnected: [7] }) }).status).toBe("undetermined");
    expect(evaluateContext(restore, f, { actions, trace: trace(null, { documentToken: "u" }) }).status).toBe("undetermined");
    expect(evaluateContext(restore, f, { actions, trace: trace(null).slice(0, 2) }).status).toBe("undetermined");
  });

  it("foco instável no fechamento não decide", () => {
    expect(evaluateContext(restore, f, { actions, trace: trace(null, { focusStable: false }) }).status).toBe("undetermined");
  });

  it("o texto normalizado ignora caixa, acento e pontuação nas pontas", () => {
    expect(normalizeText("  Número do Cartão: ")).toBe("numero do cartao");
  });
});
