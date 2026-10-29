/**
 * Verificação contextual delimitada (2.13.0, NAT-85): associações controle↔erro/status (P1),
 * anatomia obrigatória ausente (P2) e foco em transições (P3).
 *
 * Não é um motor semântico. Cada condição é fechada: uma lista de regras que a sustentam (todas
 * obrigatórias ou proibidas na fonte literal, D-124), os dados estruturados que a alegação precisa
 * trazer e uma decisão que lê fatos medidos no estado reproduzido (evidence/context.ts). Fonte do
 * recorte: o catálogo normativo P0 (thesis-workspace/planejamento/atual/catalogo-controles-2026-10-15).
 *
 * Três saídas por sujeito: `verified`, `contradicted` e `undetermined`. A terceira é a resposta
 * honesta quando o predicado roda e os dados não decidem — transição não observada, exceção sem
 * fonte normativa, raiz fechada, Chromium sem a árvore de acessibilidade. Ela vira `unverifiable`.
 *
 * O que fica de fora, de propósito, porque a fonte não sustenta confirmação:
 *   - aria-describedby em todo campo (DS input-2a9e95371c51 é recomendada e condicional);
 *   - vínculo programático puro sob WCAG 1.3.1, e WCAG 1.4.1 (depende de pistas visuais);
 *   - restauração do foco da Message (recomendada), do Menu (sem texto) e com invocador removido;
 *   - a exceção da modal destrutiva (texto do corpus que não virou regra) — por isso foco num botão
 *     secundário da modal fica `undetermined`, nunca `verified`;
 *   - Pagination (tipo contextual não declarado no DOM);
 *   - 2.14.1: erro detectado inferido da aparência do campo (cor, classe), do texto da mensagem ou do
 *     foco — P1 3.3.1 só confirma com sinal programático (S1–S4, ver errorSignals);
 *   - 2.14.2: a única classe aceita é o estado de erro DECLARADO pelo componente DS (S5: br-input →
 *     danger, tabela Estados do Input), só no perfil evaluation; nenhuma outra classe, cor ou alerta;
 *   - 2.14.3: mensagem sem vínculo comprovado com o campo (IDREF exato ou contêiner só do campo) —
 *     proximidade, simultaneidade ou seletor que casa várias mensagens não associam (messageBinding).
 */
import type { Finding } from "../schema/finding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import type { PageAction } from "../scan/actions.js";
import type { AccessibilityFacts, AnatomyFacts, SubjectSnapshot, TraceObservation } from "../evidence/context.js";
import { emagMembership, wcagMembership } from "./registries.js";
import { getDsInputErrorState, type DsErrorStateMapping } from "../data/dsComponentStates.js";

export type ContextOutcomeStatus = "verified" | "contradicted" | "undetermined";

/**
 * 3.4.0 (B2): por que um `undetermined` não decide, quando o motivo tem próximo passo próprio.
 *   rule-not-applicable   a condição da regra não vale neste estado (modal sem invocador, sem botão
 *                         fechar, janela de outro tipo) — inaplicabilidade não é contradição medida;
 *   subject-not-a-dialog  o localizador não é a janela modal (ex.: o invocador): o sujeito de P3 é o diálogo.
 */
export type ContextOutcomeCode = "rule-not-applicable" | "subject-not-a-dialog";

export interface ContextOutcome {
  status: ContextOutcomeStatus;
  detail: string;
  code?: ContextOutcomeCode;
}

export interface ContextEvidence {
  actions: PageAction[];
  trace?: TraceObservation[];
  accessibility?: AccessibilityFacts[];
  anatomy?: AnatomyFacts[];
}

export interface ContextRule {
  source: "wcag" | "emag" | "govbr-ds-kb";
  id: string;
}

export type ContextCheck =
  | "error-item-identified"
  | "error-described-in-text"
  | "status-message"
  | "anatomy-part"
  | "current-crumb-not-link"
  | "focus-restored"
  | "initial-focus"
  | "focus-contained"
  | "focus-on-close";

export interface ContextCondition {
  condition: string;
  check: ContextCheck;
  family: "P1" | "P2" | "P3";
  rules: ContextRule[];
  /** Campos de evidence.data além de expectedCondition. */
  fields: string[];
  needs: { trace?: { message?: boolean; text?: boolean; focus?: boolean }; accessibility?: boolean; anatomy?: boolean };
}

const KB = (suffix: string): ContextRule => ({ source: "govbr-ds-kb", id: `govbr-3.7.0-${suffix}` });
const ERROR_RULES: ContextRule[] = [
  { source: "wcag", id: "3.3.1" },
  { source: "emag", id: "6.6" },
  KB("accessibility-global-271582e4fbe8"),
];

/** Parte de anatomia: componente, parte e as regras literais que a declaram obrigatória. */
export interface AnatomyPart {
  component: "message" | "header" | "breadcrumb" | "modal";
  part: "mensagem" | "titulo" | "titulo-pagina-atual" | "botoes" | "conteudo";
  rules: string[];
  label: string;
}

export const ANATOMY_PARTS: AnatomyPart[] = [
  // 3.4.4 (C13, D4): a cláusula em prosa 829632 ("A mensagem é o elemento essencial e obrigatório") diz o
  // mesmo que a linha de anatomia d0c7ed — as duas acionam o predicado.
  { component: "message", part: "mensagem", rules: ["govbr-3.7.0-component-message-d0c7ed3f91af", "govbr-3.7.0-component-message-829632c90fd3"], label: "Mensagem (texto do Message)" },
  {
    component: "header",
    part: "titulo",
    // e58979706103: "O título é o único elemento obrigatório no Header"; 5d2c6c19d65f (permitida):
    // "é possível utilizar texto ou outro elemento para substituí-lo" — o substituto conta como presente.
    rules: ["govbr-3.7.0-component-header-e58979706103"],
    label: "Título do Header (ou substituto: logo, texto)",
  },
  {
    component: "breadcrumb",
    part: "titulo-pagina-atual",
    rules: ["govbr-3.7.0-component-breadcrumb-478cffdbb111", "govbr-3.7.0-component-breadcrumb-660169599b49"],
    label: "Título da página atual (último item do Breadcrumb)",
  },
  { component: "modal", part: "botoes", rules: ["govbr-3.7.0-component-modal-672bf38f39fb"], label: "Botões da Modal (além do fechar)" },
  { component: "modal", part: "conteudo", rules: ["govbr-3.7.0-component-modal-39edd5c2d5cc"], label: "Conteúdo da Modal" },
];

export const CONTEXT_CONDITIONS: ContextCondition[] = [
  {
    condition: EXPECTED_CONDITIONS.errorItemIdentified,
    check: "error-item-identified",
    family: "P1",
    rules: ERROR_RULES,
    fields: ["errorMessage"],
    needs: { trace: { message: true }, accessibility: true },
  },
  {
    condition: EXPECTED_CONDITIONS.errorDescribedInText,
    check: "error-described-in-text",
    family: "P1",
    rules: ERROR_RULES,
    fields: [],
    needs: { trace: { text: true }, accessibility: true },
  },
  {
    condition: EXPECTED_CONDITIONS.statusMessage,
    check: "status-message",
    family: "P1",
    rules: [{ source: "wcag", id: "4.1.3" }],
    fields: [],
    needs: { trace: { focus: true } },
  },
  {
    condition: EXPECTED_CONDITIONS.anatomyPart,
    check: "anatomy-part",
    family: "P2",
    rules: ANATOMY_PARTS.flatMap((p) => p.rules.map((id) => ({ source: "govbr-ds-kb" as const, id }))),
    fields: ["component", "part"],
    needs: { anatomy: true },
  },
  {
    condition: EXPECTED_CONDITIONS.currentCrumbNotLink,
    check: "current-crumb-not-link",
    family: "P2",
    rules: [KB("accessibility-breadcrumb-53db61fa81f9")],
    fields: [],
    needs: { anatomy: true },
  },
  {
    condition: EXPECTED_CONDITIONS.focusRestored,
    check: "focus-restored",
    family: "P3",
    rules: [KB("accessibility-modal-f36c91d7073c")],
    fields: [],
    needs: { trace: { focus: true } },
  },
  {
    condition: EXPECTED_CONDITIONS.initialFocus,
    check: "initial-focus",
    family: "P3",
    rules: [KB("accessibility-modal-e0ce4b474163"), KB("accessibility-modal-6f984d79466a")],
    fields: [],
    needs: { trace: { focus: true } },
  },
  {
    condition: EXPECTED_CONDITIONS.focusContained,
    check: "focus-contained",
    family: "P3",
    rules: [KB("accessibility-modal-744f67e17bec")],
    fields: [],
    needs: { trace: { focus: true } },
  },
  {
    condition: EXPECTED_CONDITIONS.focusOnClose,
    check: "focus-on-close",
    family: "P3",
    rules: [KB("accessibility-message-ad83724b777f"), KB("accessibility-menu-a3be6788bdea")],
    fields: [],
    needs: { trace: { focus: true } },
  },
];

/** A regra citada na forma das listas acima (WCAG/e-MAG normalizados; KB pelo id exato). */
export function contextRuleOf(finding: Finding): ContextRule | null {
  const { source, id } = finding.rule;
  if (source === "wcag") {
    const membership = wcagMembership(wcagMembership(id).status === "malformed" && finding.rule.wcag ? finding.rule.wcag : id);
    return membership.status === "member" ? { source, id: membership.normalizedId } : null;
  }
  if (source === "emag") {
    const membership = emagMembership(id);
    return membership.status === "member" ? { source, id: membership.normalizedId } : null;
  }
  if (source === "govbr-ds-kb") return { source, id };
  return null;
}

export function conditionsForRule(rule: ContextRule, pool: ContextCondition[] = CONTEXT_CONDITIONS): ContextCondition[] {
  return pool.filter((c) => c.rules.some((r) => r.source === rule.source && r.id === rule.id));
}

export function conditionByName(name: unknown, pool: ContextCondition[] = CONTEXT_CONDITIONS): ContextCondition | undefined {
  return pool.find((c) => c.condition === name);
}

/**
 * 2.14.0 (NAT-61, decisões 5 e 6): as condições que o perfil knowledge-free decide — só P1, e só
 * pela fonte WCAG. P1 testa critérios da WCAG (3.3.1, 4.1.3), não regras do DS; as fontes e-MAG e
 * da base saem das listas porque conferi-las é conhecimento curado.
 */
export const KNOWLEDGE_FREE_CONDITIONS: ContextCondition[] = CONTEXT_CONDITIONS.filter((c) => c.family === "P1").map((c) => ({
  ...c,
  rules: c.rules.filter((r) => r.source === "wcag"),
}));

export interface EvaluateContextOptions {
  /** 2.14.0: rótulos sem referência ao e-MAG (perfil knowledge-free). */
  knowledgeFree?: boolean;
}

// ───────────────────────────── utilidades ─────────────────────────────

/** Comparação de texto sem caixa, acento, espaço extra nem pontuação nas pontas. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:!?·–—-]+|[\s.,;:!?·–—-]+$/g, "");
}

function contains(haystack: string, needle: string): boolean {
  const n = normalizeText(needle);
  return n.length > 0 && normalizeText(haystack).includes(n);
}

function combine(outcomes: ContextOutcome[], label: string): ContextOutcome {
  if (outcomes.length === 0) return { status: "undetermined", detail: `Nenhum sujeito de ${label} observado no estado reproduzido.` };
  const contradicted = outcomes.filter((o) => o.status === "contradicted");
  const undetermined = outcomes.filter((o) => o.status === "undetermined");
  const summary = outcomes.map((o, i) => `[${i + 1}] ${o.detail}`).slice(0, 4).join(" ");
  if (contradicted.length > 0) {
    return { status: "contradicted", detail: `${contradicted.length} de ${outcomes.length} sujeito(s) não sustentam a alegação (${label}). ${summary}` };
  }
  if (undetermined.length > 0) {
    const codes = new Set(undetermined.map((o) => o.code));
    const code = codes.size === 1 ? [...codes][0] : undefined;
    return {
      status: "undetermined",
      detail: `${undetermined.length} de ${outcomes.length} sujeito(s) sem decisão possível (${label}). ${summary}`,
      ...(code ? { code } : {}),
    };
  }
  return { status: "verified", detail: `Violação recalculada em ${outcomes.length} de ${outcomes.length} sujeito(s): ${label}. ${summary}` };
}

interface TriggerWindow {
  pre: TraceObservation;
  final: TraceObservation;
}

/**
 * O gatilho é a última ação que age na página (esperas finais não contam): compara o estado antes
 * dela com o estado final, depois das esperas.
 */
function triggerWindow(evidence: ContextEvidence): TriggerWindow | string {
  const n = evidence.actions.length;
  let trigger = n - 1;
  while (trigger >= 0 && evidence.actions[trigger].action === "wait") trigger -= 1;
  if (trigger < 0) return "A receita não tem ação que aja na página: nenhuma reação automática foi observada (sem gatilho).";
  const trace = evidence.trace ?? [];
  const pre = trace.find((o) => o.step === trigger - 1);
  const final = trace.find((o) => o.step === n - 1);
  if (!pre || !final || pre.error || final.error) return "Traço incompleto: faltam as observações antes e depois da última ação.";
  if (pre.documentToken !== final.documentToken) return "A última ação trocou o documento (navegação): outro contexto, nada a comparar.";
  return { pre, final };
}

/** Fatos de acessibilidade do MESMO elemento (pelo número do registro), nunca pela posição. */
function factsFor(evidence: ContextEvidence, ref: number): AccessibilityFacts | undefined {
  return evidence.accessibility?.find((f) => f.ref === ref);
}

/** Sujeitos do traço e fatos AX lidos em momentos diferentes: contagens diferentes não decidem. */
function accessibilityMismatch(evidence: ContextEvidence, final: TraceObservation): ContextOutcome | null {
  const facts = evidence.accessibility ?? [];
  if (facts.length !== final.subjects.length) {
    return {
      status: "undetermined",
      detail: `O traço observou ${final.subjects.length} sujeito(s) e a árvore de acessibilidade ${facts.length}: o estado mudou entre as leituras.`,
    };
  }
  return null;
}

function danglingDetail(facts: AccessibilityFacts | undefined): string {
  const broken = (facts?.idrefs ?? []).filter((r) => r.missing.length > 0);
  return broken.length ? ` IDREF sem alvo na mesma árvore: ${broken.map((r) => `${r.attribute}→${r.missing.join(",")}`).join("; ")}.` : "";
}

// ───────────────────────────── P1 ─────────────────────────────

/**
 * 2.14.1 (NAT-61, revisão Codex 898d2cde): evidência de que a PÁGINA DETECTOU ERRO neste campo,
 * separada da evidência de associação/descrição da mensagem.
 *
 * Até a 2.14.0 o "erro detectado" era inferido: mensagem nova + o campo mudou de aparência (desde a
 * 2.14.0 no mesmo estado de foco). Uma página que aceita qualquer valor, pinta o campo de verde e diz
 * "concluída com sucesso" saía `confirmed` — cor muda por sucesso, preenchimento válido, carregando,
 * desabilitado. Aparência, cor, classe, palavra da mensagem e foco NÃO são mais sinal de detecção.
 *
 * O conjunto fechado (cada sinal precisa ser estabelecido pela ÚLTIMA ação: ausente na observação
 * imediatamente antes do gatilho, presente no estado final; o campo tem de existir antes do gatilho):
 *   S1 `aria-invalid` (≠ ausente/""/"false") passou a valer no próprio campo;
 *   S2 validação de restrições nativa EXECUTADA: o campo recebeu evento `invalid` durante o gatilho
 *      e está com `validity.valid === false` no estado final;
 *   S3 `aria-invalid` passou a valer num ancestral composto que contém só este campo de formulário;
 *   S4 (só item-identified) o `aria-errormessage` do campo aponta, na mesma árvore, para a mensagem
 *      EXATA que a última ação fez aparecer (2.14.3: o próprio elemento ou embrulho/parte com o mesmo
 *      texto; nunca um contêiner genérico) — o autor declarou aquela mensagem como o erro deste campo.
 * S1 também identifica o item para a tecnologia assistiva (o Chromium expõe invalid), por isso em
 * item-identified ele contradiz antes de chegar aqui; serve de detecção em described-in-text.
 */
type ErrorSignal = "S1" | "S2" | "S3" | "S4" | "S5";

const SIGNAL_LABEL: Record<ErrorSignal, string> = {
  S1: "aria-invalid passou a valer no campo",
  S2: "validação nativa executada (evento invalid) e o campo inválido",
  S3: "aria-invalid passou a valer no contêiner só deste campo",
  S4: "aria-errormessage do campo aponta para a mensagem que apareceu",
  S5: "estado de erro declarado pelo componente DS",
};

const NO_DETECTION =
  "nenhum sinal programático de que a página detectou erro neste campo pela última ação (aria-invalid no campo ou no contêiner só dele, evento invalid da validação nativa, aria-errormessage apontando para a mensagem); mudança de aparência, cor ou texto da mensagem não é evidência de erro detectado.";

const NO_DETECTION_DS =
  " Nem estado de erro declarado pelo componente DS (br-input → danger) estabelecido pela última ação neste campo.";

/**
 * 2.14.2 (NAT-61, revisão Codex 8963921e) — S5 "estado de erro declarado pelo componente DS".
 *
 * Prova SÓ a precondição "erro detectado": a página pôs o componente do campo no estado que o DS
 * documenta como "Erro / Entrada de dados com erros". Não prova identificação nem descrição do erro,
 * e sozinho não prova violação de 3.3.1 (a WCAG não exige informação programática; a ausência de
 * aria-invalid/associação não é falha por si) — as contraprovas de identificação textual e descrição
 * continuam valendo, e ambiguidade fica `undetermined`.
 *
 * Regras fechadas:
 *   - mapeamento único `br-input` → `danger` (tabela Estados, input__desenvolvedor.md); nada de outro
 *     componente de campo, `.danger` em ancestral qualquer, `.feedback.danger` ou alerta;
 *   - o contêiner é o `.br-input` MAIS PRÓXIMO do sujeito, com exatamente um campo de formulário na
 *     subárvore; aninhado em outro `.br-input` ou com vários campos = vínculo incerto, sem sinal;
 *   - o MESMO contêiner (número de registro) antes e depois do gatilho: `danger` ausente na observação
 *     imediatamente antes, presente no estado final; erro pré-existente, troca de contêiner ou estado
 *     conflitante (danger junto de success/warning/info) = sem sinal;
 *   - interpretação só no perfil evaluation: o mapeamento é carregado por `getDsInputErrorState`, sob a
 *     trava de conhecimento; o perfil knowledge-free nem o chama.
 */
export interface DsStateReading {
  signal: boolean;
  /** Com sinal: a evidência (componente, classe, transição, fonte). Sem sinal: o motivo, quando havia candidato. */
  detail: string | null;
}

function nearestComponent(snapshot: SubjectSnapshot, componentClass: string) {
  const wrappers = (snapshot.containers ?? []).filter((c) => c.classes.includes(componentClass));
  return { wrappers, nearest: wrappers[0] };
}

export function dsDeclaredErrorState(before: SubjectSnapshot, subject: SubjectSnapshot, mapping: DsErrorStateMapping | null): DsStateReading {
  if (!mapping) return { signal: false, detail: null };
  const cls = mapping.componentClass;
  const err = mapping.errorClass;
  const now = nearestComponent(subject, cls);
  if (!now.nearest || !now.nearest.classes.includes(err)) return { signal: false, detail: null };
  const wrapperDesc = `.${cls} [registro ${now.nearest.ref}]`;
  if (now.wrappers.length > 1 || now.nearest.fields !== 1) {
    const nested = now.wrappers.length > 1 ? `, ${now.wrappers.length} .${cls} aninhados` : "";
    return { signal: false, detail: `S5 não estabelecido: ${wrapperDesc} tem '${err}', mas o vínculo com o campo é incerto (${now.nearest.fields} campo(s) no contêiner${nested}).` };
  }
  const conflicting = mapping.otherStateClasses.filter((c) => now.nearest!.classes.includes(c));
  if (conflicting.length > 0) {
    return { signal: false, detail: `S5 não estabelecido: ${wrapperDesc} tem '${err}' junto de ${conflicting.map((c) => `'${c}'`).join(", ")} (estado conflitante).` };
  }
  const then = nearestComponent(before, cls);
  if (!then.nearest || then.nearest.ref !== now.nearest.ref || then.wrappers.length !== 1 || then.nearest.fields !== 1) {
    return { signal: false, detail: `S5 não estabelecido: antes do gatilho o contêiner .${cls} do campo não era o mesmo ${wrapperDesc} (troca de sujeito ou vínculo incerto).` };
  }
  if (then.nearest.classes.includes(err)) {
    return { signal: false, detail: `S5 não estabelecido: ${wrapperDesc} já tinha '${err}' antes da última ação (erro pré-existente).` };
  }
  const src = mapping.source;
  return {
    signal: true,
    detail:
      `[componente ${cls}, classe '${err}' ("${mapping.errorMeaning}"), ${wrapperDesc} com 1 campo, transição ausente→presente pela última ação; ` +
      `fonte ${src.file} §${src.section} "${src.row}" (base ${src.knowledgeVersion}, sha256 ${src.sha256.slice(0, 12)}, core ${src.coreCommit?.slice(0, 8) ?? "?"}); ` +
      `prova só a precondição "erro detectado", não a identificação nem a descrição]`,
  };
}

function errorSignals(
  pre: TraceObservation,
  subject: SubjectSnapshot,
  withMessage: boolean,
  options: EvaluateContextOptions = {}
): { signals: ErrorSignal[]; ds: DsStateReading | null } | undefined {
  const before = pre.subjects.find((x) => x.ref === subject.ref);
  if (!before) return undefined;
  const out: ErrorSignal[] = [];
  if (subject.ariaInvalid === true && before.ariaInvalid === false) out.push("S1");
  if ((subject.invalidEvents ?? 0) > (before.invalidEvents ?? 0) && subject.validityInvalid === true) out.push("S2");
  if (subject.ancestorInvalid === true && before.ancestorInvalid === false) out.push("S3");
  if (withMessage && subject.errorMessageLinked === true) out.push("S4");
  // S5 é conhecimento do DS: o perfil knowledge-free não carrega nem interpreta o mapeamento.
  const ds = options.knowledgeFree ? null : dsDeclaredErrorState(before, subject, getDsInputErrorState());
  if (ds?.signal) out.push("S5");
  return { signals: out, ds };
}

const signalDetail = (signals: ErrorSignal[], ds: DsStateReading | null) =>
  signals.map((x) => (x === "S5" && ds?.detail ? `${x}: ${SIGNAL_LABEL[x]} ${ds.detail}` : `${x}: ${SIGNAL_LABEL[x]}`)).join("; ");

function noDetection(ds: DsStateReading | null, options: EvaluateContextOptions): string {
  if (options.knowledgeFree) return NO_DETECTION;
  return `${NO_DETECTION}${NO_DETECTION_DS}${ds?.detail ? ` ${ds.detail}` : ""}`;
}

/**
 * 2.14.3 (NAT-61, revisão Codex 4d66c40e) — "ESTA mensagem pertence a ESTE campo", separado de (a) o
 * sistema detectou erro (errorSignals) e (c) o item foi identificado/descrito (contraprovas AX/texto).
 * Até a 2.14.2 o seletor da mensagem e os sinais do sujeito eram lidos sem provar que formavam um par:
 * Telefone em erro + a mensagem de OUTRO campo na mesma ação saía `confirmed`.
 *
 * Vínculo aceito (um basta; o par fica registrado no detalhe):
 *   1. referência explícita — IDREF do próprio campo (aria-errormessage / aria-describedby) resolvido na
 *      árvore do campo para a mensagem exata (nunca um ancestral genérico com campos ou outro texto). Apoia
 *      a atribuição; não prova violação: a descrição AX/o texto ainda contradizem antes daqui;
 *   2. contenção estrutural estrita — a mensagem está num contêiner que delimita SÓ este campo (subárvore
 *      sem outro campo, nunca form/main/diálogo), e esse contêiner já era do campo antes do gatilho
 *      (estável). Vale nos dois perfis; nenhuma leitura do DS aqui.
 *   3. "mensagem nova no contêiner pela transição" é o (2) mais a evidência temporal já exigida (a mensagem
 *      apareceu pela última ação), não uma permissão separada.
 * Sem vínculo: mensagem global/externa sem relação explícita, seletor que casa várias mensagens, IDREF para
 * contêiner genérico, contêiner de vários campos, contêiner instável → `undetermined`. Proximidade e
 * simultaneidade (dois campos validados na mesma ação) não são associação.
 */
function messageBinding(pre: TraceObservation, subject: SubjectSnapshot): { bound: true; detail: string } | { bound: false; detail: string } {
  const b = subject.binding;
  if (!b) return { bound: false, detail: "a mensagem alegada não foi vinculada ao campo (nenhum fato de vínculo coletado)." };
  const rejected = b.explicitRejected.length ? ` IDREF sem vínculo: ${b.explicitRejected.join("; ")}.` : "";
  if (b.messageHoldsField) {
    return { bound: false, detail: `o elemento alegado como mensagem (${b.message ?? `registro ${b.messageRef}`}) contém campo de formulário: é contêiner, não a mensagem deste campo.${rejected}` };
  }
  if (b.explicit) {
    const e = b.explicit;
    return {
      bound: true,
      detail: `vínculo explícito: ${e.attribute} do campo [registro ${subject.ref}] → ${e.target ?? `registro ${e.targetRef}`} (${e.relation}) = mensagem ${b.message ?? `registro ${b.messageRef}`}`,
    };
  }
  if (b.structural) {
    const before = pre.subjects.find((x) => x.ref === subject.ref);
    const stable = (before?.containers ?? []).some((c) => c.ref === b.structural!.wrapperRef && c.fields === 1);
    if (!stable) {
      return {
        bound: false,
        detail: `a mensagem está em ${b.structural.wrapper ?? "um contêiner"} [registro ${b.structural.wrapperRef}] só deste campo, mas esse contêiner não era do campo antes do gatilho (instável): vínculo não estabelecido.${rejected}`,
      };
    }
    return {
      bound: true,
      detail: `vínculo estrutural: mensagem ${b.message ?? ""} [registro ${b.messageRef}] dentro de ${b.structural.wrapper ?? "contêiner"} [registro ${b.structural.wrapperRef}] que delimita só o campo [registro ${subject.ref}], estável desde antes do gatilho`,
    };
  }
  return {
    bound: false,
    detail: `a mensagem alegada (${b.message ?? `registro ${b.messageRef}`}) não pertence comprovadamente a este campo: nenhum IDREF do campo aponta para ela e ela não está num contêiner só deste campo (proximidade ou simultaneidade não são associação).${rejected}`,
  };
}

function errorItemIdentified(evidence: ContextEvidence, finding: Finding, options: EvaluateContextOptions = {}): ContextOutcome {
  const window = triggerWindow(evidence);
  if (typeof window === "string") return { status: "undetermined", detail: window };
  const { pre, final } = window;
  const selector = String((finding.evidence.data as Record<string, unknown>).errorMessage);
  if (!final.message || final.message.found === 0) {
    return { status: "undetermined", detail: `A mensagem de erro '${selector}' não existe no estado reproduzido.` };
  }
  if (!final.message.shown || !final.message.text.trim()) {
    return { status: "undetermined", detail: `A mensagem de erro '${selector}' não está visível com texto no estado reproduzido.` };
  }
  if (final.message.found > 1) {
    return {
      status: "undetermined",
      detail: `O seletor '${selector}' casa ${final.message.found} elementos: a mensagem alegada é ambígua (o texto agregado não é a mensagem de um campo).`,
    };
  }
  if (pre.message?.shown && normalizeText(pre.message.text) === normalizeText(final.message.text)) {
    return { status: "undetermined", detail: `A mensagem '${final.message.text}' já estava visível antes da última ação: a detecção do erro não foi observada.` };
  }
  const messageText = final.message.text;
  const mismatch = accessibilityMismatch(evidence, final);
  if (mismatch) return mismatch;
  const outcomes = final.subjects.map((subject): ContextOutcome => {
    const facts = factsFor(evidence, subject.ref);
    if (!facts?.ax) {
      // 3.4.4 (C14): campo oculto (display:none, d-none) fica fora da árvore — sem decisão, e o porquê.
      if (!subject.shown) {
        return {
          status: "undetermined",
          detail:
            "o campo alegado não está exibido (display:none ou oculto) e por isso fica fora da árvore de acessibilidade: nenhuma mensagem pode ser associada a ele, e quem o usuário opera é outro elemento (o controle visível que aciona este campo). Sem decisão sobre este campo: verifique o controle visível com o seletor dele; se nenhum controle visível for operável por teclado, isso é outro fato (WCAG 2.1.1).",
        };
      }
      return { status: "undetermined", detail: "O Chromium não expôs o campo na árvore de acessibilidade (ou não há CDP)." };
    }
    const { ax } = facts;
    if (contains(ax.description, messageText) || contains(messageText, ax.description)) {
      if (ax.description.trim()) return { status: "contradicted", detail: `a descrição calculada do campo ("${ax.description}") contém a mensagem.` };
    }
    if (contains(ax.name, messageText)) return { status: "contradicted", detail: `o nome calculado do campo ("${ax.name}") contém a mensagem.` };
    // 3.4.4 (C2): aria-invalid sozinho marca o campo como inválido, mas não associa a mensagem: até a
    // 3.4.3 invalid=true desmentia "o erro não está associado" mesmo com descrição vazia e nenhum IDREF
    // para a mensagem. Só desmente com a mensagem ligada por IDREF do próprio campo (aria-errormessage /
    // aria-describedby); sem isso, a associação da mensagem falta e o oráculo não decide se o estado
    // inválido basta para o critério — nunca `contradicted`.
    if (ax.invalid) {
      const explicit = subject.binding?.explicit;
      if (explicit) {
        return {
          status: "contradicted",
          detail: `o campo expõe invalid=true e ${explicit.attribute} aponta a mensagem (${explicit.target ?? `registro ${explicit.targetRef}`}): item identificado e mensagem associada programaticamente.`,
        };
      }
      return {
        status: "undetermined",
        detail: `o campo expõe invalid=true (estado inválido marcado), mas a mensagem "${messageText}" não está associada a ele: descrição ${
          ax.description ? `"${ax.description}"` : "vazia"
        }, o nome não contém a mensagem e nenhum IDREF do campo (aria-errormessage/aria-describedby) aponta para ela.${danglingDetail(facts)} Ambiguidade declarada: a técnica ARIA21 da WCAG aceita aria-invalid como identificação do campo em erro para o 3.3.1, então "item identificado" não é decidível a partir de aria-invalid sozinho; a associação da mensagem ao campo (aria-errormessage/aria-describedby) é outro fato, e ela falta aqui. aria-invalid sozinho não associa a mensagem e não desmente a alegação.`,
      };
    }
    // 3.4.0 (B4, V-03a): citar o nome do campo no texto da mensagem NÃO é associação programática.
    // Até a 3.3.0 isso contradizia a alegação e o agente retirava um defeito real. Agora a associação
    // medida (invalid, descrição, nome) é o que contradiz; sem ela, a citação textual deixa sem decisão
    // (a WCAG admite identificação só textual, e o oráculo não decide se ela basta) — nunca `rejected`.
    const namesField = normalizeText(ax.name).length >= 3 && contains(messageText, ax.name);
    if (namesField) {
      return {
        status: "undetermined",
        detail: `a mensagem cita o campo ("${ax.name}") só em texto; associação programática medida: invalid=false, descrição ${
          ax.description ? `"${ax.description}"` : "vazia"
        }, o nome não contém a mensagem.${danglingDetail(facts)} Citar o nome não é associação programática e não desmente a alegação; se a identificação só textual basta para o critério, o oráculo não decide.`,
      };
    }
    const read = errorSignals(pre, subject, true, options);
    if (read === undefined) return { status: "undetermined", detail: "O campo não existia antes da última ação: a reação dele não foi observada." };
    const { signals, ds } = read;
    if (signals.length === 0) return { status: "undetermined", detail: `a mensagem "${messageText}" apareceu, mas ${noDetection(ds, options)}` };
    const binding = messageBinding(pre, subject);
    if (!binding.bound) return { status: "undetermined", detail: `erro detectado (${signalDetail(signals, ds)}), mas ${binding.detail}` };
    if (subject.nativeInvalid) {
      return {
        status: "undetermined",
        detail: "a validação nativa do navegador está ativa e o campo está inválido: o balão do navegador (fora do DOM) aponta o campo, então a identificação do item não é decidível.",
      };
    }
    return {
      status: "verified",
      detail: `erro detectado (${signalDetail(signals, ds)}); ${binding.detail}; a mensagem "${messageText}" apareceu pela última ação; o Chromium não expõe invalid, a descrição é ${
        ax.description ? `"${ax.description}"` : "vazia"
      } e a mensagem não nomeia o campo ("${ax.name}").${danglingDetail(facts)}`,
    };
  });
  return combine(outcomes, options.knowledgeFree ? "item em erro não identificado (WCAG 3.3.1)" : "item em erro não identificado (WCAG 3.3.1 / e-MAG 6.6)");
}

function errorDescribedInText(evidence: ContextEvidence, options: EvaluateContextOptions = {}): ContextOutcome {
  const window = triggerWindow(evidence);
  if (typeof window === "string") return { status: "undetermined", detail: window };
  const { pre, final } = window;
  const remaining = [...(pre.visibleText ?? [])];
  const appeared: string[] = [];
  for (const chunk of final.visibleText ?? []) {
    const i = remaining.indexOf(chunk);
    if (i >= 0) remaining.splice(i, 1);
    else appeared.push(chunk);
  }
  const mismatch = accessibilityMismatch(evidence, final);
  if (mismatch) return mismatch;
  const outcomes = final.subjects.map((subject): ContextOutcome => {
    const facts = factsFor(evidence, subject.ref);
    if (!facts?.ax) return { status: "undetermined", detail: "O Chromium não expôs o campo na árvore de acessibilidade (ou não há CDP)." };
    if (subject.nativeInvalid) {
      return {
        status: "undetermined",
        detail: "o campo usa validação nativa do navegador e está inválido: o aviso do navegador não está no DOM, então o texto não é decidível.",
      };
    }
    const read = errorSignals(pre, subject, false, options);
    if (read === undefined) return { status: "undetermined", detail: "O campo não existia antes da última ação: a reação dele não foi observada." };
    const { signals, ds } = read;
    if (signals.length === 0) return { status: "undetermined", detail: noDetection(ds, options) };
    const associated = appeared.filter((chunk) => contains(facts.ax!.description, chunk) || contains(facts.ax!.name, chunk));
    if (associated.length > 0) return { status: "contradicted", detail: `texto novo associado ao campo: "${associated.join(" ")}".` };
    if (facts.ax.description.trim()) {
      return { status: "undetermined", detail: `o campo tem descrição ("${facts.ax.description}"); o oráculo não decide se ela descreve o erro.` };
    }
    if (appeared.length > 0) {
      return { status: "undetermined", detail: `apareceu texto novo ("${appeared.slice(0, 3).join(" | ")}") que o oráculo não descarta como descrição do erro.` };
    }
    return { status: "verified", detail: `erro detectado (${signalDetail(signals, ds)}) e nenhum texto novo apareceu; descrição vazia.${danglingDetail(facts)}` };
  });
  return combine(outcomes, options.knowledgeFree ? "erro não descrito em texto (WCAG 3.3.1)" : "erro não descrito em texto (WCAG 3.3.1 / e-MAG 6.6)");
}

function statusMessage(evidence: ContextEvidence): ContextOutcome {
  const window = triggerWindow(evidence);
  if (typeof window === "string") return { status: "undetermined", detail: window };
  const { pre, final } = window;
  const outcomes = final.subjects.map((subject): ContextOutcome => {
    const before = pre.subjects.find((s) => s.ref === subject.ref);
    const beforeText = before?.shown ? before.text : "";
    if (!subject.shown || !subject.text.trim() || normalizeText(subject.text) === normalizeText(beforeText)) {
      return { status: "undetermined", detail: "o contêiner não ganhou texto com a última ação: nenhuma mensagem de status observada." };
    }
    if (final.focusStable === false) {
      return { status: "undetermined", detail: "o foco ainda mudava no teto de espera: a exceção do foco movido não é decidível." };
    }
    if (subject.focusInside) {
      return { status: "contradicted", detail: "o foco foi movido para a mensagem: pela definição da WCAG não é mensagem de status (4.1.3 não se aplica)." };
    }
    if (subject.liveRegion) return { status: "contradicted", detail: "a mensagem está em região viva (role alert/status/log ou aria-live)." };
    return { status: "verified", detail: `"${subject.text.slice(0, 80)}" apareceu sem foco e sem role alert/status/log nem aria-live no contêiner, ancestrais ou descendentes.` };
  });
  return combine(outcomes, "mensagem de status não determinável programaticamente (WCAG 4.1.3)");
}

// ───────────────────────────── P2 ─────────────────────────────

export function anatomyPartFor(ruleId: string, component: unknown, part: unknown): AnatomyPart | undefined {
  return ANATOMY_PARTS.find((p) => p.rules.includes(ruleId) && p.component === component && p.part === part);
}

function currentTitle(facts: AnatomyFacts): string | null {
  if (facts.breadcrumb.h1 && facts.breadcrumb.h1.trim()) return facts.breadcrumb.h1;
  const head = facts.breadcrumb.title.split(/\s+[–—|-]\s+/)[0]?.trim();
  return head ? head : null;
}

/** Decide uma parte de anatomia numa raiz. Exportada para o scanner (checkers/anatomy.ts). */
export function decideAnatomyPart(part: AnatomyPart, facts: AnatomyFacts): ContextOutcome {
  if (!facts.classes.includes(`br-${part.component}`)) {
    return { status: "undetermined", detail: `o sujeito não é raiz .br-${part.component}: a anatomia não se aplica a ele.` };
  }
  if (!facts.shown) return { status: "undetermined", detail: `a raiz .br-${part.component} não está exibida neste estado.` };
  switch (part.part) {
    case "mensagem":
      if (facts.messageText.length > 0) return { status: "contradicted", detail: `há texto da mensagem: "${facts.messageText.join(" ").slice(0, 80)}".` };
      if (facts.opaque) return { status: "undetermined", detail: "há componente com raiz fechada dentro do Message: o texto pode estar lá e não é legível (escopo não inspecionado por inteiro)." };
      return { status: "verified", detail: "nenhum texto visível no Message fora do título, ícone e fechar." };
    case "titulo":
      if (facts.header.titleText || facts.header.logoVisible || facts.header.infoText) {
        return { status: "contradicted", detail: `título ou substituto presente (${facts.header.titleText ? `título "${facts.header.titleText}"` : facts.header.logoVisible ? "logo" : `texto "${facts.header.infoText}"`}).` };
      }
      if (facts.opaque) return { status: "undetermined", detail: "há componente com raiz fechada dentro do Header (escopo não inspecionado por inteiro)." };
      return { status: "verified", detail: "nenhum .header-title com texto, nenhum logo nem texto substituto no Header." };
    case "titulo-pagina-atual": {
      const title = currentTitle(facts);
      if (!title) return { status: "undetermined", detail: "a página não tem h1 nem título: não há como saber qual é a página atual." };
      const last = facts.breadcrumb.items[facts.breadcrumb.items.length - 1];
      if (last && normalizeText(last.text) === normalizeText(title)) return { status: "contradicted", detail: `o último item é a página atual ("${last.text}").` };
      if (!last) return { status: "verified", detail: "o Breadcrumb não tem itens." };
      if (last.link && last.linksToCurrent) {
        return {
          status: "undetermined",
          detail: `o último item ("${last.text}") é link para esta mesma página: pode ser o título abreviado da página atual (o link em si é a proibição 53db61fa81f9).`,
        };
      }
      if (last.link && !last.current) {
        return { status: "verified", detail: `o último item ("${last.text}") é link para outra página e não é "${title}" (título da página atual ausente).` };
      }
      return { status: "undetermined", detail: `o último item ("${last.text}") não é link mas difere de "${title}": pode ser forma abreviada do título.` };
    }
    case "botoes":
      if (facts.modal.buttons > 0) return { status: "contradicted", detail: `${facts.modal.buttons} botão(ões) de ação visível(is) além do fechar.` };
      return { status: "verified", detail: `nenhum botão de ação visível; ${facts.modal.closeButtons} botão fechar (opcional, não substitui 'Botões').` };
    case "conteudo":
      if (facts.modal.bodyContent) return { status: "contradicted", detail: "há conteúdo visível em .br-modal-body." };
      if (facts.modal.bodyFound === 0) return { status: "undetermined", detail: "sem .br-modal-body: o conteúdo pode estar em outra área." };
      return { status: "verified", detail: ".br-modal-body sem texto nem elemento visível." };
  }
}

function anatomyPart(evidence: ContextEvidence, finding: Finding): ContextOutcome {
  const data = finding.evidence.data as Record<string, unknown>;
  const part = anatomyPartFor(finding.rule.id, data.component, data.part)!;
  const outcomes = (evidence.anatomy ?? []).map((facts) => decideAnatomyPart(part, facts));
  return combine(outcomes, `parte obrigatória ausente: ${part.label}`);
}

export function decideCurrentCrumbNotLink(facts: AnatomyFacts): ContextOutcome {
  if (!facts.classes.includes("br-breadcrumb")) return { status: "undetermined", detail: "o sujeito não é raiz .br-breadcrumb." };
  if (!facts.shown) return { status: "undetermined", detail: "o Breadcrumb não está exibido neste estado." };
  const last = facts.breadcrumb.items[facts.breadcrumb.items.length - 1];
  if (!last) return { status: "undetermined", detail: "o Breadcrumb não tem itens." };
  return last.link
    ? { status: "verified", detail: `o último item ("${last.text}") é link.` }
    : { status: "contradicted", detail: `o último item ("${last.text}") não é link.` };
}

function currentCrumbNotLink(evidence: ContextEvidence): ContextOutcome {
  return combine((evidence.anatomy ?? []).map(decideCurrentCrumbNotLink), "último item do Breadcrumb é link (proibido)");
}

// ───────────────────────────── P3 ─────────────────────────────

interface SubjectTimeline {
  ref: number;
  /** Observações em ordem; `snap` null quando o sujeito não estava no documento. */
  points: Array<{ obs: TraceObservation; snap: SubjectSnapshot | null }>;
}

function timelines(trace: TraceObservation[]): SubjectTimeline[] {
  const ordered = [...trace].filter((o) => !o.error).sort((a, b) => a.step - b.step);
  const refs = [...new Set(ordered.flatMap((o) => o.subjects.map((s) => s.ref)))];
  return refs.map((ref) => ({ ref, points: ordered.map((obs) => ({ obs, snap: obs.subjects.find((s) => s.ref === ref) ?? null })) }));
}

const shownAt = (p: { snap: SubjectSnapshot | null }) => p.snap?.shown === true;

/** Índice (em `points`) da primeira observação em que o sujeito passa de oculto/ausente a exibido. */
function openingIndex(t: SubjectTimeline): number {
  for (let k = 1; k < t.points.length; k += 1) if (shownAt(t.points[k]) && !shownAt(t.points[k - 1])) return k;
  return -1;
}

function forEachSubject(evidence: ContextEvidence, label: string, decide: (t: SubjectTimeline) => ContextOutcome): ContextOutcome {
  const trace = evidence.trace ?? [];
  if (trace.length === 0) return { status: "undetermined", detail: "Sem traço de foco da reprodução." };
  return combine(timelines(trace).map(decide), label);
}

function focusRestored(evidence: ContextEvidence): ContextOutcome {
  return forEachSubject(evidence, "foco não volta ao invocador ao fechar a modal", (t) => {
    // 3.4.0 (B2, A-01): o sujeito é a janela, não o invocador. Até a 3.3.0 um localizador do botão
    // que abre a modal (visível ao carregar, nada focado) saía "a modal já estava aberta ao carregar"
    // como contradição — sobre um sujeito que nem era modal.
    if (!t.points.some((p) => p.snap?.modal)) {
      return {
        status: "undetermined",
        code: "subject-not-a-dialog",
        detail:
          "o sujeito não é uma janela modal (.br-modal, role=dialog/alertdialog, <dialog>, aria-modal) em nenhum passo: em focus-returns-to-invoker-on-close, element.locator é o diálogo, não o invocador.",
      };
    }
    const first = t.points[0];
    if (first && shownAt(first)) {
      return first.obs.active === null
        ? { status: "undetermined", code: "rule-not-applicable", detail: "a modal já estava aberta ao carregar e nada tinha foco: não há 'último elemento focado' — a regra não se aplica a este estado (não é contradição)." }
        : { status: "undetermined", detail: "a modal já estava aberta ao carregar: a abertura não foi observada." };
    }
    const k = openingIndex(t);
    if (k < 0) return { status: "undetermined", detail: "a abertura da modal não foi observada na receita." };
    if (!t.points[k].snap?.modal) return { status: "undetermined", code: "subject-not-a-dialog", detail: "o sujeito não é uma janela modal (.br-modal, role=dialog/alertdialog, <dialog>, aria-modal)." };
    const before = t.points[k - 1].obs;
    const invoker = before.nextTarget ?? before.active;
    if (invoker === null) {
      return { status: "undetermined", code: "rule-not-applicable", detail: "nada tinha foco antes de abrir: não há 'último elemento focado' — a regra não se aplica a este estado (não é contradição)." };
    }
    let j = -1;
    for (let m = k + 1; m < t.points.length; m += 1) if (!shownAt(t.points[m])) { j = m; break; }
    if (j < 0) return { status: "undetermined", detail: "o fechamento da modal não foi observado na receita." };
    const after = t.points[j].obs;
    if (after.focusStable === false || before.focusStable === false) {
      return { status: "undetermined", detail: "o foco ainda mudava no teto de espera depois de abrir ou fechar: só o valor estável decide." };
    }
    if (after.documentToken !== before.documentToken) return { status: "undetermined", detail: "o documento mudou entre abrir e fechar (novo contexto)." };
    if (after.disconnected.includes(invoker)) {
      return { status: "undetermined", detail: "o invocador saiu do documento ao fechar: nenhuma fonte diz para onde o foco deve ir (coleta/revisão)." };
    }
    if (after.active === invoker) return { status: "contradicted", detail: "o foco voltou ao invocador ao fechar." };
    return {
      status: "verified",
      detail: `ao fechar (passo ${after.step}), o foco foi para ${after.activeDescription ?? "o documento (body)"}, não para o invocador.`,
    };
  });
}

function initialFocus(evidence: ContextEvidence, finding: Finding): ContextOutcome {
  const informative = finding.rule.id.endsWith("e0ce4b474163");
  return forEachSubject(evidence, informative ? "foco inicial da modal informativa fora do fechar" : "foco inicial da modal de ação fora da primária", (t) => {
    const k = openingIndex(t);
    if (k < 0) return { status: "undetermined", detail: "a abertura da modal não foi observada na receita." };
    const { obs, snap } = t.points[k];
    if (obs.focusStable === false) return { status: "undetermined", detail: "o foco ainda mudava no teto de espera depois de abrir: só o valor estável decide." };
    if (!snap?.modal) return { status: "undetermined", code: "subject-not-a-dialog", detail: "o sujeito não é uma janela modal: element.locator deve ser o diálogo, não o invocador." };
    const active = obs.active;
    const outside = active === null || !snap.focusInside;
    const where = obs.activeDescription ?? "o documento (body)";
    if (informative) {
      // 3.4.0 (B2, V-025): inaplicabilidade não é contradição medida — fica sem decisão, com o motivo.
      if (snap.formFieldRefs.length > 0) return { status: "undetermined", code: "rule-not-applicable", detail: "a modal tem campo de formulário: é janela de ação, não 'apenas com conteúdo informativo' — a regra da modal informativa não se aplica (cite a da modal com ação)." };
      if (snap.closeRefs.length === 0) return { status: "undetermined", code: "rule-not-applicable", detail: "a modal não tem botão fechar: a regra do foco no fechar não se aplica a ela (não é contradição)." };
      if (active !== null && snap.closeRefs.includes(active)) return { status: "contradicted", detail: "o foco inicial está no botão fechar." };
      if (outside) return { status: "verified", detail: `ao abrir, o foco ficou fora da modal (${where}) — fora de qualquer alvo que a regra admita.` };
      return { status: "undetermined", detail: `o foco inicial está dentro da modal (${where}), fora do fechar; o tipo da janela não é decidível pelo DOM.` };
    }
    if (active !== null && snap.primaryRefs.includes(active)) return { status: "contradicted", detail: "o foco inicial está no botão de ação primária." };
    if (snap.primaryRefs.length === 0) return { status: "undetermined", detail: "a modal não tem botão de ação primária visível (.br-button.primary): o tipo 'ação' não é decidível." };
    if (outside) return { status: "verified", detail: `ao abrir, o foco ficou fora da modal (${where}).` };
    if (active !== null && snap.formFieldRefs.includes(active)) {
      return { status: "verified", detail: `o foco inicial está num campo (${where}), não no botão de ação primária (leitura literal, Q3 a).` };
    }
    return {
      status: "undetermined",
      detail: `o foco inicial está em outro controle da modal (${where}); pode ser a exceção da ação destrutiva, que não está na base normativa.`,
    };
  });
}

function focusContained(evidence: ContextEvidence): ContextOutcome {
  const trace = (evidence.trace ?? []).filter((o) => !o.error);
  return forEachSubject(evidence, "Tab sai da modal aberta", (t) => {
    let wrapped = false;
    let toDocument = false;
    let unstable = false;
    for (const [index, action] of evidence.actions.entries()) {
      if (action.action !== "press" || !/^(shift\+)?tab$/i.test(action.key)) continue;
      const before = trace.find((o) => o.step === index - 1);
      const after = trace.find((o) => o.step === index);
      const snapBefore = before?.subjects.find((s) => s.ref === t.ref);
      const snapAfter = after?.subjects.find((s) => s.ref === t.ref);
      if (!before || !after || !snapBefore?.shown || !snapAfter?.shown || !snapBefore.modal) continue;
      const focusBefore = before.nextTarget ?? before.active;
      const insideBefore = before.nextTarget !== null ? snapBefore.tabbableRefs.includes(before.nextTarget) : snapBefore.focusInside;
      if (!insideBefore || focusBefore === null) continue;
      if (after.focusStable === false || before.focusStable === false) {
        unstable = true;
        continue;
      }
      if (after.active === null) {
        toDocument = true;
        continue;
      }
      if (!snapAfter.focusInside) {
        return { status: "verified", detail: `com a modal aberta, ${action.key} (passo ${index}) levou o foco para fora dela: ${after.activeDescription}.` };
      }
      const backwards = /^shift\+/i.test(action.key);
      const edge = backwards ? snapBefore.tabbableRefs[0] : snapBefore.tabbableRefs[snapBefore.tabbableRefs.length - 1];
      if (focusBefore === edge) wrapped = true;
    }
    if (wrapped) return { status: "contradicted", detail: "o Tab a partir do último focável da modal ficou dentro dela." };
    if (unstable) return { status: "undetermined", detail: "o foco ainda mudava no teto de espera depois do Tab: só o valor estável decide." };
    if (toDocument) return { status: "undetermined", detail: "o Tab levou o foco ao documento (fora da página): o oráculo não decide se saiu do fluxo da modal." };
    return { status: "undetermined", detail: "nenhum Tab a partir do último focável da modal aberta foi observado." };
  });
}

function focusOnClose(evidence: ContextEvidence, finding: Finding): ContextOutcome {
  const component = finding.rule.id.includes("-menu-") ? "menu" : "message";
  return forEachSubject(evidence, `foco não vai ao fechar ao exibir o ${component === "menu" ? "Menu" : "Message"}`, (t) => {
    const k = openingIndex(t);
    if (k < 0) return { status: "undetermined", detail: "a exibição do componente não foi observada na receita." };
    const { obs, snap } = t.points[k];
    if (obs.focusStable === false) return { status: "undetermined", detail: "o foco ainda mudava no teto de espera depois de abrir: só o valor estável decide." };
    if (!snap || !snap.classes.includes(`br-${component}`)) return { status: "undetermined", detail: `o sujeito não é raiz .br-${component}.` };
    if (snap.closeRefs.length === 0) return { status: "undetermined", code: "rule-not-applicable", detail: "o componente não tem botão fechar: a regra vale 'quando houver'/'se houver' e não se aplica aqui (não é contradição)." };
    if (obs.active !== null && snap.closeRefs.includes(obs.active)) return { status: "contradicted", detail: "ao exibir, o foco está no botão fechar." };
    return { status: "verified", detail: `ao exibir (passo ${obs.step}), o foco está em ${obs.activeDescription ?? "o documento (body)"}, não no botão fechar.` };
  });
}

export function evaluateContext(
  condition: ContextCondition,
  finding: Finding,
  evidence: ContextEvidence,
  options: EvaluateContextOptions = {}
): ContextOutcome {
  switch (condition.check) {
    case "error-item-identified":
      return errorItemIdentified(evidence, finding, options);
    case "error-described-in-text":
      return errorDescribedInText(evidence, options);
    case "status-message":
      return statusMessage(evidence);
    case "anatomy-part":
      return anatomyPart(evidence, finding);
    case "current-crumb-not-link":
      return currentCrumbNotLink(evidence);
    case "focus-restored":
      return focusRestored(evidence);
    case "initial-focus":
      return initialFocus(evidence, finding);
    case "focus-contained":
      return focusContained(evidence);
    case "focus-on-close":
      return focusOnClose(evidence, finding);
  }
}
