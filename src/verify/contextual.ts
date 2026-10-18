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
 *   - Pagination (tipo contextual não declarado no DOM).
 */
import type { Finding } from "../schema/finding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import type { PageAction } from "../scan/actions.js";
import type { AccessibilityFacts, AnatomyFacts, SubjectSnapshot, TraceObservation } from "../evidence/context.js";
import { emagMembership, wcagMembership } from "./registries.js";

export type ContextOutcomeStatus = "verified" | "contradicted" | "undetermined";

export interface ContextOutcome {
  status: ContextOutcomeStatus;
  detail: string;
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
  { component: "message", part: "mensagem", rules: ["govbr-3.7.0-component-message-d0c7ed3f91af"], label: "Mensagem (texto do Message)" },
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
    return { status: "undetermined", detail: `${undetermined.length} de ${outcomes.length} sujeito(s) sem decisão possível (${label}). ${summary}` };
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
 * 2.14.0 (NAT-86 §7.3): o "segundo sinal" de erro (o campo mudou de aparência) só vale comparado no
 * MESMO estado de foco. Até a 2.13.0 comparava-se o campo logo antes do gatilho (focado, depois do
 * preenchimento) com o estado final (desfocado pelo clique no botão): a perda do anel de foco virava
 * "erro detectado", e uma página que aceita o valor e mostra mensagem de sucesso saía `confirmed`
 * (controle F1-10-N, falso positivo). Agora a referência é a observação mais recente antes do gatilho,
 * no mesmo documento, em que o campo tinha o mesmo foco que tem no estado final.
 */
function sameFocusBaseline(evidence: ContextEvidence, pre: TraceObservation, subject: SubjectSnapshot): SubjectSnapshot | null | undefined {
  const earlier = (evidence.trace ?? [])
    .filter((o) => !o.error && o.step <= pre.step && o.documentToken === pre.documentToken)
    .sort((a, b) => b.step - a.step);
  let seen = false;
  for (const o of earlier) {
    const snap = o.subjects.find((x) => x.ref === subject.ref);
    if (!snap) continue;
    seen = true;
    if (snap.focusInside === subject.focusInside) return snap;
  }
  // undefined: o campo não existia antes do gatilho; null: existia, mas nunca no mesmo estado de foco.
  return seen ? null : undefined;
}

const SAME_FOCUS_UNKNOWN =
  "o campo nunca foi observado antes da última ação no mesmo estado de foco que tem agora: mudança de aparência por foco não é sinal de erro, e não há com o que comparar.";

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
  if (pre.message?.shown && normalizeText(pre.message.text) === normalizeText(final.message.text)) {
    return { status: "undetermined", detail: `A mensagem '${final.message.text}' já estava visível antes da última ação: a detecção do erro não foi observada.` };
  }
  const messageText = final.message.text;
  const mismatch = accessibilityMismatch(evidence, final);
  if (mismatch) return mismatch;
  const outcomes = final.subjects.map((subject): ContextOutcome => {
    const facts = factsFor(evidence, subject.ref);
    if (!facts?.ax) return { status: "undetermined", detail: "O Chromium não expôs o campo na árvore de acessibilidade (ou não há CDP)." };
    const { ax } = facts;
    if (ax.invalid) return { status: "contradicted", detail: "o campo expõe invalid=true (item identificado programaticamente)." };
    if (contains(ax.description, messageText) || contains(messageText, ax.description)) {
      if (ax.description.trim()) return { status: "contradicted", detail: `a descrição calculada do campo ("${ax.description}") contém a mensagem.` };
    }
    if (contains(ax.name, messageText)) return { status: "contradicted", detail: `o nome calculado do campo ("${ax.name}") contém a mensagem.` };
    if (normalizeText(ax.name).length >= 3 && contains(messageText, ax.name)) {
      return { status: "contradicted", detail: `a mensagem nomeia o campo ("${ax.name}") em texto.` };
    }
    const before = sameFocusBaseline(evidence, pre, subject);
    if (before === undefined) return { status: "undetermined", detail: "O campo não existia antes da última ação: a reação dele não foi observada." };
    if (before === null) return { status: "undetermined", detail: SAME_FOCUS_UNKNOWN };
    if (before.colors === subject.colors) {
      return {
        status: "undetermined",
        detail:
          "a mensagem apareceu, mas o campo não mudou de aparência (comparado no mesmo estado de foco): falta um segundo sinal de que a página detectou erro neste campo.",
      };
    }
    return {
      status: "verified",
      detail: `erro detectado (mensagem "${messageText}" apareceu e o campo mudou de aparência no mesmo estado de foco); o Chromium não expõe invalid, a descrição é ${
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
    const before = sameFocusBaseline(evidence, pre, subject);
    const changed = before !== undefined && before !== null && before.colors !== subject.colors;
    if (!changed && !facts.ax.invalid) {
      return {
        status: "undetermined",
        detail:
          before === null
            ? `nenhum sinal de erro decidível: invalid ausente e ${SAME_FOCUS_UNKNOWN}`
            : "nenhum sinal de erro detectado no campo (aparência igual no mesmo estado de foco, invalid ausente).",
      };
    }
    const associated = appeared.filter((chunk) => contains(facts.ax!.description, chunk) || contains(facts.ax!.name, chunk));
    if (associated.length > 0) return { status: "contradicted", detail: `texto novo associado ao campo: "${associated.join(" ")}".` };
    if (facts.ax.description.trim()) {
      return { status: "undetermined", detail: `o campo tem descrição ("${facts.ax.description}"); o oráculo não decide se ela descreve o erro.` };
    }
    if (appeared.length > 0) {
      return { status: "undetermined", detail: `apareceu texto novo ("${appeared.slice(0, 3).join(" | ")}") que o oráculo não descarta como descrição do erro.` };
    }
    return { status: "verified", detail: `erro detectado (${changed ? "o campo mudou de aparência" : "invalid=true"}) e nenhum texto novo apareceu; descrição vazia.${danglingDetail(facts)}` };
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
    const first = t.points[0];
    if (first && shownAt(first)) {
      return first.obs.active === null
        ? { status: "contradicted", detail: "a modal já estava aberta ao carregar e nada tinha foco: não há 'último elemento focado' (a regra não se aplica)." }
        : { status: "undetermined", detail: "a modal já estava aberta ao carregar: a abertura não foi observada." };
    }
    const k = openingIndex(t);
    if (k < 0) return { status: "undetermined", detail: "a abertura da modal não foi observada na receita." };
    if (!t.points[k].snap?.modal) return { status: "undetermined", detail: "o sujeito não é uma janela modal (.br-modal, role=dialog/alertdialog, <dialog>, aria-modal)." };
    const before = t.points[k - 1].obs;
    const invoker = before.nextTarget ?? before.active;
    if (invoker === null) {
      return { status: "contradicted", detail: "nada tinha foco antes de abrir: não há 'último elemento focado' (a regra não se aplica)." };
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
    if (!snap?.modal) return { status: "undetermined", detail: "o sujeito não é uma janela modal." };
    const active = obs.active;
    const outside = active === null || !snap.focusInside;
    const where = obs.activeDescription ?? "o documento (body)";
    if (informative) {
      if (snap.formFieldRefs.length > 0) return { status: "contradicted", detail: "a modal tem campo de formulário: é janela de ação, não 'apenas com conteúdo informativo'." };
      if (snap.closeRefs.length === 0) return { status: "contradicted", detail: "a modal não tem botão fechar: a regra do foco no fechar não se aplica." };
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
    if (snap.closeRefs.length === 0) return { status: "contradicted", detail: "o componente não tem botão fechar: a regra vale 'quando houver'/'se houver'." };
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
