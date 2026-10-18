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
  dsDeclaredErrorState,
  evaluateContext,
  normalizeText,
} from "../../src/verify/contextual.js";
import { CONTEXT_GROUNDING } from "../../src/checkers/grounding.js";
import { checkAnatomy } from "../../src/checkers/anatomy.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { findEmagRule } from "../../src/data/load.js";
import { getDsInputErrorState } from "../../src/data/dsComponentStates.js";
import { KnowledgeLockedError, resetKnowledgeLock, runKnowledgeLocked } from "../../src/data/lock.js";
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
  // 2.14.1: o sinal de erro detectado é programático (S3: aria-invalid no contêiner só do campo).
  // 2.14.3: a mensagem está no contêiner só do campo (registro 50+ref), estável desde antes do gatilho.
  const field = (ref: number, colors: string, ancestorInvalid = colors === "vermelho") =>
    snap({
      ref, shown: true, colors, modal: false, classes: [], ariaInvalid: false, ancestorInvalid, invalidEvents: 0, validityInvalid: false, errorMessageLinked: false,
      containers: [{ ref: 50 + ref, classes: [], fields: 1 }],
      binding: { messageRef: 90, message: "<span#m>", messageHoldsField: false, explicit: null, explicitRejected: [], structural: { wrapperRef: 50 + ref, wrapper: "<div>" } },
    });
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

  it("2.14.1: só sinal programático novo decide o erro detectado; aparência, sinal antigo ou evento sem invalidez não", () => {
    const um = (before: Partial<SubjectSnapshot>, after: Partial<SubjectSnapshot>) => [
      obs(0, null, [{ ...field(1, "cinza", false), ...before }], { message: { found: 1, shown: false, text: "" } }),
      obs(1, null, [{ ...field(1, "verde", false), ...after }], { message: { found: 1, shown: true, text: "Valor inválido." } }),
    ];
    const run = (t: TraceObservation[]) => evaluateContext(cond, f, { actions, trace: t, accessibility: [ax(1, false)] }).status;
    expect(run(um({}, {}))).toBe("undetermined"); // só a aparência mudou
    expect(run(um({ ancestorInvalid: true }, { ancestorInvalid: true }))).toBe("undetermined"); // S3 já valia antes
    expect(run(um({}, { ancestorInvalid: true }))).toBe("verified"); // S3
    expect(run(um({ invalidEvents: 1 }, { invalidEvents: 1, validityInvalid: true }))).toBe("undetermined"); // nenhum evento no gatilho
    expect(run(um({}, { invalidEvents: 1, validityInvalid: false }))).toBe("undetermined"); // evento, mas o campo é válido agora
    expect(run(um({}, { invalidEvents: 1, validityInvalid: true }))).toBe("verified"); // S2
    expect(run(um({}, { invalidEvents: 1, validityInvalid: true, nativeInvalid: true }))).toBe("undetermined"); // balão nativo
    expect(run(um({}, { errorMessageLinked: true }))).toBe("verified"); // S4
    const described = CONTEXT_CONDITIONS.find((c) => c.check === "error-described-in-text")!;
    const fd = finding({ id: "3.3.1", source: "wcag", description: "d" }, { expectedCondition: C.errorDescribedInText });
    const runD = (t: TraceObservation[]) => evaluateContext(described, fd, { actions, trace: t, accessibility: [ax(1, false)] }).status;
    expect(runD(um({}, { errorMessageLinked: true }))).toBe("undetermined"); // S4 não vale sem mensagem pedida
    expect(runD(um({}, { ariaInvalid: true }))).toBe("verified"); // S1
    expect(runD(um({ ariaInvalid: true }, { ariaInvalid: true }))).toBe("undetermined");
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

describe("P1 2.14.2: S5 — estado de erro declarado pelo componente DS (revisão Codex 8963921e)", () => {
  const cond = CONTEXT_CONDITIONS.find((c) => c.check === "error-item-identified")!;
  const described = CONTEXT_CONDITIONS.find((c) => c.check === "error-described-in-text")!;
  const f = finding({ id: "3.3.1", source: "wcag", description: "d" }, { expectedCondition: C.errorItemIdentified, errorMessage: "#m" });
  const fd = finding({ id: "3.3.1", source: "wcag", description: "d" }, { expectedCondition: C.errorDescribedInText });
  const actions = [{ action: "fill" as const, selector: "#a", value: "1" }, { action: "click" as const, selector: "#ok" }];
  type C = NonNullable<SubjectSnapshot["containers"]>;
  const field = (containers: C) =>
    snap({
      ref: 1, shown: true, modal: false, classes: [], ariaInvalid: false, ancestorInvalid: false, invalidEvents: 0, validityInvalid: false, errorMessageLinked: false, containers,
      binding: { messageRef: 90, message: "<span#m>", messageHoldsField: false, explicit: null, explicitRejected: [], structural: containers[0] ? { wrapperRef: containers[0].ref, wrapper: "<div.br-input>" } : null },
    });
  const wrap = (classes: string[], ref = 10, fields = 1) => ({ ref, classes: ["br-input", "mb-3", ...classes], fields });
  const trace = (before: C, after: C, text = "Valor inválido.") => [
    obs(0, null, [field(before)], { message: { found: 1, shown: false, text: "" }, visibleText: ["Cartão"] }),
    obs(1, null, [field(after)], { message: { found: 1, shown: true, text }, visibleText: ["Cartão"] }),
  ];
  const ax = { ref: 1, tag: "input", idrefs: [], ax: { name: "Número do cartão", description: "", invalid: false } };
  const run = (t: TraceObservation[], kf = false) => evaluateContext(cond, f, { actions, trace: t, accessibility: [ax] }, kf ? { knowledgeFree: true } : {});

  it("mapeamento lido do corpus literal: br-input → danger, com a identidade da fonte", () => {
    const m = getDsInputErrorState()!;
    expect(m).not.toBeNull();
    expect(m.componentClass).toBe("br-input");
    expect(m.errorClass).toBe("danger");
    expect(m.errorMeaning).toBe("Entrada de dados com erros");
    expect(m.otherStateClasses.sort()).toEqual(["info", "success", "warning"]);
    expect(m.source.file).toBe("corpus/componentes/input__desenvolvedor.md");
    expect(m.source.coreCommit).toMatch(/^20173bf2/);
    expect(m.source.sha256).toMatch(/^cfabfcba8464/);
  });

  it("positivo: o mesmo .br-input de um campo ganha danger pela última ação → erro detectado (só no evaluation)", () => {
    const r = run(trace([wrap([])], [wrap(["danger"])]));
    expect(r.status).toBe("verified");
    expect(r.detail).toContain("S5: estado de erro declarado pelo componente DS");
    expect(r.detail).toContain("input__desenvolvedor.md");
    expect(r.detail).toContain("ausente→presente");
    // knowledge-free: o mapeamento não é interpretado; só S5 sustentaria a detecção → undetermined
    const kf = run(trace([wrap([])], [wrap(["danger"])]), true);
    expect(kf.status).toBe("undetermined");
    expect(kf.detail).not.toContain("br-input");
    expect(kf.detail).not.toContain("danger");
  });

  it("negativos: success/warning/info, danger fora do componente, em outro campo, contêiner com vários campos, pré-existente, conflito, troca de contêiner", () => {
    for (const s of ["success", "warning", "info"]) expect(run(trace([wrap([])], [wrap([s])])).status, s).toBe("undetermined");
    // danger num ancestral que não é .br-input (ou .feedback.danger): sem generalização
    expect(run(trace([{ ref: 9, classes: ["grupo"], fields: 1 }], [{ ref: 9, classes: ["grupo", "danger"], fields: 1 }])).status).toBe("undetermined");
    // danger no .br-input de OUTRO campo: o contêiner do sujeito é o primeiro com outro campo (para ali)
    expect(run(trace([wrap([]), { ref: 20, classes: ["form"], fields: 2 }], [wrap([]), { ref: 20, classes: ["form"], fields: 2 }])).status).toBe("undetermined");
    // .br-input com vários campos: vínculo ambíguo
    const amb = run(trace([wrap([], 10, 2)], [wrap(["danger"], 10, 2)]));
    expect(amb.status).toBe("undetermined");
    expect(amb.detail).toContain("vínculo com o campo é incerto");
    // .br-input aninhado em outro .br-input: ambíguo
    expect(run(trace([wrap([]), wrap([], 11)], [wrap(["danger"]), wrap([], 11)])).status).toBe("undetermined");
    // danger já estava antes do gatilho
    const pre = run(trace([wrap(["danger"])], [wrap(["danger"])]));
    expect(pre.status).toBe("undetermined");
    expect(pre.detail).toContain("pré-existente");
    // estado conflitante
    expect(run(trace([wrap([])], [wrap(["danger", "success"])])).detail).toContain("estado conflitante");
    // outro contêiner (número de registro) depois do gatilho: troca de sujeito
    expect(run(trace([wrap([], 10)], [wrap(["danger"], 12)])).status).toBe("undetermined");
    // sem contêiner capturado antes
    expect(run(trace([], [wrap(["danger"])])).status).toBe("undetermined");
  });

  it("S5 é só a precondição: as contraprovas de identificação textual e de descrição continuam valendo", () => {
    // a mensagem nomeia o campo: identificado em texto → contradicted, mesmo com S5
    expect(run(trace([wrap([])], [wrap(["danger"])], "Número do cartão: use 8 dígitos.")).status).toBe("contradicted");
    // descrição: texto novo que o oráculo não descarta → undetermined, nunca verified
    const t = trace([wrap([])], [wrap(["danger"])]);
    t[1].visibleText = ["Cartão", "Valor inválido."];
    expect(evaluateContext(described, fd, { actions, trace: t, accessibility: [ax] }).status).toBe("undetermined");
    // sem texto novo e descrição vazia: erro só por cor com o estado declarado → verified no evaluation, undetermined no knowledge-free
    const sem = trace([wrap([])], [wrap(["danger"])]);
    expect(evaluateContext(described, fd, { actions, trace: sem, accessibility: [ax] }).status).toBe("verified");
    expect(evaluateContext(described, fd, { actions, trace: sem, accessibility: [ax] }, { knowledgeFree: true }).status).toBe("undetermined");
  });

  it("dsDeclaredErrorState sem mapeamento (fonte divergente) não inventa sinal", () => {
    expect(dsDeclaredErrorState(field([wrap([])]), field([wrap(["danger"])]), null)).toEqual({ signal: false, detail: null });
  });

  it("o mapeamento é conhecimento: lança sob a trava do perfil knowledge-free", () => {
    expect(() => runKnowledgeLocked(() => getDsInputErrorState())).toThrow(KnowledgeLockedError);
    resetKnowledgeLock();
  });
});

describe("P1 2.14.3: vínculo ESTA mensagem ↔ ESTE campo (revisão Codex 4d66c40e)", () => {
  const cond = CONTEXT_CONDITIONS.find((c) => c.check === "error-item-identified")!;
  const f = finding({ id: "3.3.1", source: "wcag", description: "d" }, { expectedCondition: C.errorItemIdentified, errorMessage: "#m" });
  const actions = [{ action: "click" as const, selector: "#ok" }];
  type B = NonNullable<SubjectSnapshot["binding"]>;
  const binding = (over: Partial<B> = {}): B => ({ messageRef: 90, message: "<span#m>", messageHoldsField: false, explicit: null, explicitRejected: [], structural: null, ...over });
  // detecção por S3 (independe do perfil); containers antes do gatilho: o contêiner 50 só deste campo
  const field = (over: Partial<SubjectSnapshot>, ancestorInvalid: boolean) =>
    snap({ ref: 1, shown: true, modal: false, classes: [], ariaInvalid: false, ancestorInvalid, invalidEvents: 0, validityInvalid: false, containers: [{ ref: 50, classes: [], fields: 1 }], ...over });
  const trace = (after: Partial<SubjectSnapshot>, msg: Partial<NonNullable<TraceObservation["message"]>> = {}, before: Partial<SubjectSnapshot> = {}) => [
    obs(-1, null, [field(before, false)], { message: { found: 1, shown: false, text: "" } }),
    obs(0, null, [field(after, true)], { message: { found: 1, shown: true, text: "Valor inválido.", ...msg } }),
  ];
  const ax = { ref: 1, tag: "input", idrefs: [], ax: { name: "Telefone", description: "", invalid: false } };
  const run = (t: TraceObservation[], kf = false) => evaluateContext(cond, f, { actions, trace: t, accessibility: [ax] }, kf ? { knowledgeFree: true } : {});

  it("contenção estrita e estável vincula, nos dois perfis; o par fica registrado", () => {
    for (const kf of [false, true]) {
      const r = run(trace({ binding: binding({ structural: { wrapperRef: 50, wrapper: "<div#grupo>" } }) }), kf);
      expect(r.status).toBe("verified");
      expect(r.detail).toContain("vínculo estrutural");
      expect(r.detail).toContain("[registro 50]");
    }
  });

  it("referência explícita exata (ou embrulho/parte com o mesmo texto) vincula", () => {
    const r = run(trace({ binding: binding({ explicit: { attribute: "aria-errormessage", targetRef: 90, target: "<span#m>", relation: "exata" } }) }));
    expect(r.status).toBe("verified");
    expect(r.detail).toContain("vínculo explícito: aria-errormessage");
  });

  it("sem vínculo: mensagem de outro campo/global, IDREF para contêiner genérico, contêiner instável ou de vários campos → undetermined", () => {
    expect(run(trace({ binding: binding() })).status).toBe("undetermined"); // nenhum vínculo
    const gen = run(trace({ binding: binding({ explicitRejected: ["aria-describedby→#resumo <div#resumo> (contêiner genérico ou texto diferente da mensagem)"] }) }));
    expect(gen.status).toBe("undetermined");
    expect(gen.detail).toContain("contêiner genérico");
    // contêiner criado pela própria ação (não era do campo antes do gatilho)
    expect(run(trace({ binding: binding({ structural: { wrapperRef: 77, wrapper: "<div>" } }) })).detail).toContain("instável");
    // antes do gatilho o contêiner tinha outro campo
    expect(run(trace({ binding: binding({ structural: { wrapperRef: 50, wrapper: "<div>" } }) }, {}, { containers: [{ ref: 50, classes: [], fields: 2 }] })).status).toBe("undetermined");
    // o elemento "mensagem" contém um campo: é contêiner
    expect(run(trace({ binding: binding({ messageHoldsField: true, structural: { wrapperRef: 50, wrapper: "<div>" } }) })).status).toBe("undetermined");
    // nenhum fato de vínculo (seletor com várias mensagens exibidas no navegador não gera binding)
    expect(run(trace({})).status).toBe("undetermined");
  });

  it("seletor que casa vários elementos → undetermined antes de qualquer sujeito", () => {
    const r = run(trace({ binding: binding({ structural: { wrapperRef: 50, wrapper: "<div>" } }) }, { found: 2 }));
    expect(r.status).toBe("undetermined");
    expect(r.detail).toContain("casa 2 elementos");
  });

  it("o vínculo não é prova automática: a mensagem certa que nomeia o campo contradiz; invalid exposto contradiz", () => {
    const bound = { binding: binding({ structural: { wrapperRef: 50, wrapper: "<div>" } }) };
    expect(run(trace(bound, { text: "Telefone inválido." })).status).toBe("contradicted");
    const t = trace(bound);
    expect(evaluateContext(cond, f, { actions, trace: t, accessibility: [{ ...ax, ax: { ...ax.ax, invalid: true } }] }).status).toBe("contradicted");
  });

  it("vínculo sem erro detectado continua undetermined (simultaneidade não é detecção)", () => {
    const t = trace({ ancestorInvalid: false, binding: binding({ structural: { wrapperRef: 50, wrapper: "<div>" } }) });
    t[1].subjects[0].ancestorInvalid = false;
    expect(run(t).status).toBe("undetermined");
  });
});
