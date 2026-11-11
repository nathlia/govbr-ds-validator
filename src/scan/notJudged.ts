/**
 * 3.5.0 (D-155, item 1): o que o scan NÃO julgou nesta página, derivado do que está nela.
 *
 * No ensaio-trio-b-03 (validator 3.4.4) o agente com o oráculo tomou o silêncio do scan como cobertura:
 * mediu o título "PNIP" e o campo de busca só com placeholder e não os reportou, porque nenhum check
 * falou deles. Este bloco diz, para ESTA página e ESTE estado, o que está nela e nenhum check decidiu —
 * uma pendência para o agente medir, nunca um veredito. Nada é chaveado por tela, seletor ou texto: cada
 * item nasce de um fato genérico do documento (título, campos, tabelas, componentes do DS presentes).
 *
 * As normas citadas são as cláusulas obrigatórias que a base serve para o assunto (lidas das unidades
 * literais do e-MAG em tempo de execução), para o agente ler antes de citar.
 */
import type { PageFacts } from "../evidence/pageFacts.js";
import type { Observation } from "../schema/finding.js";
import type { LabelSource } from "../checkers/formLabels.js";
import { emagUnits } from "../data/normativeUnits.js";
import type { ContrastIncompleteNode } from "../checkers/axe.js";
import { createHash } from "node:crypto";
import { filterRules, getRuleById } from "../data/knowledge.js";
import { USAGE_SUBCATEGORY } from "../tools/usageClauses.js";
import type { DisclosureGroup } from "../evidence/disclosures.js";
import { BUTTON_LABEL_REQUIRED } from "../checkers/iconOnlyButton.js";

/** 3.6.3: o hash de um conjunto de elementos (ordem não importa). */
function setHash(parts: string[]): string {
  return createHash("sha256").update([...new Set(parts)].sort().join("\u0001")).digest("hex").slice(0, 16);
}

export interface NotJudgedItem {
  code: "document-title-adequacy" | "document-title-empty" | "field-name-source" | "table-name" | "lang-adequacy" | "landmark-adequacy" | "contrast-incomplete" | "icon-only-embedded" | "aria-native-mismatch" | "aria-state-unverified" | "usage-unread" | "observed-required" | "upload-paths" | "state-unscanned";
  subject: string;
  count?: number;
  observed?: string;
  examples?: string[];
  todo: string;
  norms?: string[];
  /**
   * 3.6.1 (D-155, item 1): a 1ª cláusula obrigatória de `norms`, com força e texto (curto), para que rejeitar
   * "por falta de norma" exija contrariar um texto visível. Ausente no perfil knowledge-free.
   */
  rule?: { id: string; force: string; text: string };
  /**
   * 3.7.2 (revisão HIGH 1): pendência de ELEMENTOS que só fecha pelo verify_finding num dos próprios elementos — a norma
   * citada é compartilhada com achados de outros elementos (o C01 de um botão fora de hospedeiro não decide o candidato
   * embutido). `boundLocators` = todos os localizadores, inteiros; nunca saem numa resposta.
   */
  elementBound?: true;
  boundLocators?: string[];
  /** 3.6.1 (item 5): o que o axe mediu nos nós de contraste que não decidiu (cores, razão, motivo). */
  measured?: Array<{ locator: string; fg: string | null; bg: string | null; ratio: number | null; reason: string | null }>;
  /**
   * 3.6.1: "low" = pendência de adequação presente em toda página sem nenhum sinal medido (idioma, regiões). No
   * na forma curta do teto e em sessionPending só são contadas (lowSignal); a cláusula vai só com id e força.
   */
  signal?: "low";
  measure: string;
  /**
   * 3.6.3 (revisão HIGH 2): hash do conjunto INTEIRO de elementos da pendência (todos os localizadores, e as medidas
   * quando há), só quando o conjunto inteiro é conhecido. Fica na sessão (junta rotas só com conjuntos iguais); nunca
   * sai numa resposta.
   */
  elementSet?: string;
  /**
   * 3.7.3 A8: os pares ARIA × nativo medidos (checkers/ariaNativeState.ts), um por elemento e estado. Ficam no ledger
   * (get_finding_details view:observations); na resposta do scan só o `observed` curto.
   */
  ariaPairs?: Array<{ locator: string; state: string; native: string; aria: string }>;
  /**
   * 3.7.3 A8 (revisão MED 2): o que um verify_finding precisa para fechar a pendência — verificação viva com o estado
   * alcançado por uma receita com ações e esta condição estruturada. Fica na sessão; nunca sai numa resposta.
   */
  resolveRequires?: { actions: true; expectedCondition: string };
  /**
   * 3.7.6 (item 3): pendência que nasce de uma observação que já traz norma obrigatória/proibitiva (`observed-required`).
   * Espaço de ids próprio (`O-NN`: não desloca os `P-NN`); fecha pelo verify_finding que decide cada elemento citando a
   * norma, ou pela leitura da norma POR ID depois da entrega (pre.2) — nunca por pendingResolved nem busca. Fica na sessão;
   * nunca sai numa resposta.
   */
  resolveByRead?: string[];
  idSpace?: "O";
  /** 3.7.8 (N3): na pendência upload-paths, as cláusulas do Upload que mandam informar o usuário (`id · texto`). */
  inform?: string[];
  /** 3.7.8 (N5): na pendência state-unscanned, a chamada pronta que escaneia o estado aberto. */
  recipe?: { tool: string; arguments: Record<string, unknown> };
  /** Revisão 3.7.8 (MED 6): a condição exata do verify da O-NN — vai para o mapa `conditions` do bloco (todas as formas). */
  condition?: string;
  /** 3.7.8 (N5): estado sem chegada verificável (sem alvo nem aria-expanded): fecha pelo scan que clicou no controle. */
  stateByClick?: true;
}

export interface NotJudgedInput {
  facts: PageFacts;
  /** Campo → de onde vem o rótulo (formLabels.labelSourceOf). */
  fields: Array<{ locator: string; source: LabelSource }>;
  /** Tabelas exibidas sem caption/aria-label/aria-labelledby/title (localizadores). */
  unnamedTables: string[];
  /** O detector de placeholder rodou (check structure sem `components` restrito). */
  placeholderChecked: boolean;
  axeRan: boolean;
  /** Scan da página inteira (sem seletores): só então título, idioma e regiões entram. */
  pageWide: boolean;
  /** 3.6.1 (item 5): nós de color-contrast que o axe deixou incomplete. */
  contrastIncomplete?: { nodes: number; items: ContrastIncompleteNode[] };
  /**
   * 3.7.2 (D-166): botões do DS só com ícone fora do circular que o C01 não acusa por serem parte de outro componente
   * cujo exemplo oficial traz o mesmo botão (checkers/iconOnlyButton.ts) — candidatos a investigar.
   */
  embeddedIconButtons?: Array<{ locator: string; host: string; examples: string[] }>;
  /** 3.7.3 A8: pendências ARIA × estado nativo (checkers/ariaNativeState.ts), depois das demais. */
  ariaStates?: NotJudgedItem[];
  /** 3.7.8 (item 5): campos de arquivo (input type=file) do escopo, com o `accept` da marcação. Depois de todas. */
  fileInputs?: Array<{ locator: string; accept: string | null; support?: string | null }>;
  /** 3.7.8 (N5): estados recolhidos deste estado (evidence/disclosures.ts), casca primeiro, e a url da receita. */
  disclosures?: DisclosureGroup[];
  url?: string;
  /** Revisão HIGH 1: a receita do scan (url + ações) — a do estado recolhido parte dela. */
  stateBase?: StateBase;
}

const EXAMPLES = 3;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A(s) cláusula(s) obrigatória(s) que a base serve para uma recomendação e-MAG, e o id da recomendação. */
function emagNorms(id: string, max = 1): string[] {
  try {
    const required = emagUnits(id).clauses.filter((c) => c.force === "required").slice(0, max).map((c) => c.id);
    return [...required, `emag-${id}`];
  } catch {
    return [`emag-${id}`];
  }
}

const RULE_TEXT_MAX = 100;

/** 3.6.1 (item 1): a 1ª cláusula obrigatória da recomendação e-MAG, com força e texto curto (para a pendência). */
function emagRule(id: string): NotJudgedItem["rule"] {
  try {
    const c = emagUnits(id).clauses.find((x) => x.force === "required") as { id: string; force: string; text?: unknown; originalText?: unknown } | undefined;
    if (!c) return undefined;
    const text = String(c.text ?? c.originalText ?? "").replace(/\s+/g, " ").trim();
    return { id: c.id, force: c.force, text: clip(text, RULE_TEXT_MAX) };
  } catch {
    return undefined;
  }
}

/**
 * 3.6.5 (D-155, item 3b): a norma das pendências de ELEMENTO, num lugar só — o notJudgedFor as usa, e a spec do
 * componente lê daqui o que o oráculo cobra desses elementos em qualquer página (sujeito = o seletor que o scan lê).
 */
export const ELEMENT_PENDING = {
  "table-name": { subject: "table", emag: "3.9", extra: ["wcag-1.3.1"] },
  "field-name-source": { subject: "input:not([type='hidden']), textarea, select", emag: "6.2", extra: ["wcag-3.3.2"] },
} as const;

/** 3.6.5: a cláusula obrigatória que a pendência cita (a mesma de `rule` nos itens), para quem não tem o item. */
export function elementPendingRule(code: keyof typeof ELEMENT_PENDING): NotJudgedItem["rule"] {
  return emagRule(ELEMENT_PENDING[code].emag);
}

/** Norma + cláusula de uma pendência (a cláusula só quando a base a serve). */
function grounded(emagId: string, extra: string[] = []): Pick<NotJudgedItem, "norms" | "rule"> {
  const rule = emagRule(emagId);
  return { norms: [...emagNorms(emagId), ...extra], ...(rule ? { rule } : {}) };
}

/**
 * 3.6.1 (item 5): contraste que o axe não decidiu (`incomplete` de color-contrast) vira pendência explícita, com
 * as cores e a razão que ele mediu. `knowledgeFree`: só o critério WCAG (nenhum texto ou id da base).
 */
export function contrastPending(contrast: { nodes: number; items: ContrastIncompleteNode[] } | undefined, knowledgeFree = false): NotJudgedItem | null {
  if (!contrast?.nodes) return null;
  return {
    code: "contrast-incomplete",
    subject: "contraste que o axe não decidiu",
    count: contrast.nodes,
    examples: contrast.items.slice(0, EXAMPLES).map((n) => n.locator),
    ...(contrast.items.length === contrast.nodes ? { elementSet: setHash(contrast.items.map((n) => `${n.locator}=${n.fgColor ?? ""}/${n.bgColor ?? ""}/${n.contrastRatio ?? ""}`)) } : {}),
    measured: contrast.items.slice(0, 2).map((n) => ({ locator: clip(n.locator, 120), fg: n.fgColor, bg: n.bgColor, ratio: n.contrastRatio, reason: n.reason })),
    todo: "decida o contraste: o axe não concluiu (fundo não sólido, sobreposição, pseudo-elemento ou cor incerta)",
    ...(knowledgeFree ? { norms: ["wcag-1.4.3"] } : grounded("4.1", ["wcag-1.4.3"])),
    measure: "cor do texto × fundo efetivo no navegador; 4,5:1 (3:1 texto grande)",
  };
}

/** 3.7.2: a cláusula da base por id, com força e texto curto (para a pendência). */
export function kbRule(id: string): NotJudgedItem["rule"] {
  try {
    const r = getRuleById(id);
    if (!r) return undefined;
    return { id: r.id, force: r.force, text: clip(String(r.originalText ?? r.title ?? "").replace(/\s+/g, " ").trim(), RULE_TEXT_MAX) };
  } catch {
    return undefined;
  }
}

/** 3.7.6 (item 3): forças que obrigam ou proíbem — a observação com uma delas vira pendência, não só contagem. */
export const OBSERVED_PENDING_FORCES = new Set(["required", "prohibited"]);
export const OBSERVED_TODO = "decida o desvio medido: verify_finding em cada elemento citando a norma, ou leia a norma por id (get_ds_rules{ids}); pendingResolved não fecha";
/**
 * 3.7.7 (teste à mão da 3.7.6, D1): com a condição que a observação carrega (`data.expectedCondition`), a tarefa nomeia o
 * caminho exato — a condição vem nos primeiros caracteres (a forma curta corta em 72).
 */
export const observedTodo = (condition: string | null) => condition
  ? `verify_finding por elemento (expectedCondition ${condition}) citando a norma, ou leia-a por id; pendingResolved não fecha`
  : OBSERVED_TODO;

/** O valor medido de uma observação, em texto curto (`font-size 16px`, mais o passo mais próximo quando há). */
function observedValue(o: Observation): string {
  const d = (o.data ?? {}) as { property?: unknown; observed?: unknown; nearestStepPx?: unknown };
  const value = [d.property, d.observed].filter((x) => typeof x === "string" && x).join(" ");
  const near = typeof d.nearestStepPx === "number" ? ` (passo mais próximo ${d.nearestStepPx}px)` : "";
  return value ? `${value}${near}` : clip(o.note, 60);
}

/**
 * 3.7.6 (leitura dev-374-a2 §3/§5 item 3): a observação que já traz uma norma de força obrigatória ou proibitiva
 * (`data.relatedRule`, a norma que o check cita sem poder afirmar a violação: D-27/D-32) chegava ao agente só como contagem
 * em `observations.byKind` — quem não abria as observações perdia o desvio e a norma. Vira pendência: uma por (tipo de
 * observação, norma) neste estado, com todos os elementos, o valor medido e a cláusula. Genérico: só lê `relatedRule`.
 */
/**
 * 3.7.8 (N1): a chave da pendência O-NN de uma observação, ou null. Observação com `relatedRule` obrigatória/proibitiva:
 * `tipo|norma` (3.7.6). Desvio de estilo autoral em conteúdo OCULTO (`hiddenInState`, a norma em `data.rule`, força da base
 * obrigatória/proibitiva): `oculto|<contêiner>` — uma pendência por contêiner oculto, com todas as normas dele.
 */
export function observedSubjectOf(o: Observation): string | null {
  const d = (o.data ?? {}) as { relatedRule?: { id?: unknown; force?: unknown }; hiddenInState?: unknown; rule?: { id?: unknown }; reveal?: { container?: unknown } };
  const rel = d.relatedRule;
  if (rel && typeof rel.id === "string" && typeof rel.force === "string" && OBSERVED_PENDING_FORCES.has(rel.force)) return `${o.kind}|${rel.id}`;
  if (d.hiddenInState === true && typeof d.rule?.id === "string" && d.rule.id.startsWith("govbr-")) {
    const force = kbRule(d.rule.id)?.force;
    if (force && OBSERVED_PENDING_FORCES.has(force)) return `oculto|${typeof d.reveal?.container === "string" ? d.reveal.container : o.element.locator}`;
  }
  return null;
}

/** 3.7.8 (N1): a tarefa curta da O-NN de conteúdo oculto — a receita que o mostra, quando o oráculo achou o gatilho. */
export const hiddenTodo = (trigger: string | null) => trigger
  ? `abra: actions click ${clip(trigger, 32)}; escaneie aberto e decida`
  : "gatilho desconhecido: ache e abra o conteúdo, escaneie esse estado";

function hiddenItem(subject: string, obs: Observation[]): NotJudgedItem {
  const data = obs.map((o) => (o.data ?? {}) as { rule?: { id: string; checker?: string }; reveal?: { container: string; trigger: string | null }; expectedCondition?: unknown });
  const ruleIds = [...new Set(data.map((d) => d.rule!.id))];
  const rule = kbRule(ruleIds[0]);
  const reveal = data.find((d) => d.reveal)?.reveal;
  const trigger = data.map((d) => d.reveal?.trigger).find((t): t is string => typeof t === "string") ?? null;
  const container = reveal?.container ?? obs[0].element.locator;
  const checkers = new Map<string, number>();
  for (const d of data) checkers.set(d.rule!.checker ?? d.rule!.id, (checkers.get(d.rule!.checker ?? d.rule!.id) ?? 0) + 1);
  const conditions = [...new Set(data.map((d) => d.expectedCondition).filter((c): c is string => typeof c === "string"))];
  // N5 + revisão MED 3: a receita estruturada (a do estado recolhido do mesmo gatilho: ações do scan + o clique + a chegada)
  // vem pronta da observação; nada de JSON montado em texto (seletor com aspas quebrava).
  const recipe = (data.find((d) => (d.reveal as { recipe?: unknown } | undefined)?.recipe)?.reveal as { recipe?: { tool: string; arguments: Record<string, unknown> } } | undefined)?.recipe;
  const how = recipe
    ? "rode recipe"
    : "o oráculo não achou o controle que mostra este conteúdo (aria-controls, data-target, href ou aria-expanded): ache-o e escaneie o estado aberto (scan_page com a ação + arrival visible)";
  return {
    code: "observed-required",
    subject,
    count: obs.length,
    examples: obs.slice(0, EXAMPLES).map((o) => clip(o.element.locator, 120)),
    elementSet: setHash(obs.map((o) => `${o.element.locator}=${String((o.data as { observed?: unknown }).observed ?? "")}`)),
    elementBound: true,
    boundLocators: obs.map((o) => o.element.locator),
    observed: `oculto em ${clip(container, 40)}: ${[...checkers].map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ""}`).join(", ")}`,
    todo: hiddenTodo(trigger),
    norms: ruleIds,
    ...(rule ? { rule } : {}),
    ...(recipe ? { recipe } : {}),
    // revisão MED 6: a condição exata também na linha (o mapa conditions da forma compacta lê daqui)
    ...(conditions.length ? { condition: conditions.join("|") } : {}),
    measure: `${how}; no estado aberto, verify_finding live por elemento (a mesma receita) citando a norma${conditions.length ? ` (evidence.data.expectedCondition ${conditions.join(" | ")})` : ""}, ou leia a norma por id`,
    resolveByRead: ruleIds,
    idSpace: "O",
  };
}

export function observedRequiredItems(observations: Observation[]): NotJudgedItem[] {
  const groups = new Map<string, { kind: string; ruleId: string; obs: Observation[] }>();
  const hidden = new Map<string, Observation[]>();
  for (const o of observations) {
    const subject = observedSubjectOf(o);
    if (!subject) continue;
    if (subject.startsWith("oculto|")) {
      const list = hidden.get(subject) ?? [];
      if (!list.some((x) => x.element.locator === o.element.locator && JSON.stringify(x.data) === JSON.stringify(o.data))) list.push(o);
      hidden.set(subject, list);
      continue;
    }
    const rel = (o.data as { relatedRule: { id: string } }).relatedRule;
    const g = groups.get(subject) ?? { kind: o.kind, ruleId: rel.id, obs: [] };
    if (!g.obs.some((x) => x.element.locator === o.element.locator)) g.obs.push(o);
    groups.set(subject, g);
  }
  return [...[...groups.values()].map(({ kind, ruleId, obs }) => {
    const rule = kbRule(ruleId);
    const first = obs[0];
    const condition = obs.map((o) => (o.data as { expectedCondition?: unknown } | undefined)?.expectedCondition).find((c): c is string => typeof c === "string") ?? null;
    return {
      code: "observed-required" as const,
      subject: `${kind}|${ruleId}`,
      count: obs.length,
      examples: obs.slice(0, EXAMPLES).map((o) => clip(o.element.locator, 120)),
      elementSet: setHash(obs.map((o) => `${o.element.locator}=${observedValue(o)}`)),
      elementBound: true as const,
      boundLocators: obs.map((o) => o.element.locator),
      observed: `${kind}: ${observedValue(first)}${obs.length > 1 ? ` (+${obs.length - 1})` : ""}`,
      todo: observedTodo(condition),
      ...(condition ? { condition } : {}),
      norms: [ruleId],
      ...(rule ? { rule } : {}),
      measure: condition
        ? `verify_finding live, um elemento por vez: rule {source:"govbr-ds-kb", id:"${ruleId}"}, evidence.data {property, observed, expectedCondition:"${condition}"}`
        : "o valor medido (observação do scan) × a cláusula",
      resolveByRead: [ruleId],
      idSpace: "O" as const,
    };
  }), ...[...hidden].map(([subject, obs]) => hiddenItem(subject, obs))];
}

/**
 * 3.7.2 (D-166; rastreio dev-371-b §4): o botão só com ícone, sem circle, que é parte de outro componente do DS (o de ação
 * do Input, o gatilho do Select) não é acusado pelo C01 porque o exemplo oficial do componente traz a mesma marcação — e a
 * regra do Button ("O rótulo é um elemento obrigatório.") é obrigatória. Candidato a investigar, nunca veredito: a nota diz
 * qual exemplo oficial coincide; quem decide é o agente.
 */
export function embeddedIconButtonPending(candidates: NonNullable<NotJudgedInput["embeddedIconButtons"]>): NotJudgedItem | null {
  if (!candidates.length) return null;
  const hosts = [...new Set(candidates.map((c) => c.host))].slice(0, 3);
  // um exemplo de cada candidato primeiro (o 1º de cada), depois os segundos: nenhum candidato fica sem o seu na nota
  const width = Math.max(0, ...candidates.map((c) => c.examples.length));
  const examples = [...new Set(Array.from({ length: width }, (_, k) => candidates.map((c) => c.examples[k]).filter((e): e is string => Boolean(e))).flat())].slice(0, 4);
  const rule = kbRule(BUTTON_LABEL_REQUIRED);
  return {
    code: "icon-only-embedded",
    subject: "botões do DS só com ícone, sem circle, dentro de outro componente do DS",
    count: candidates.length,
    examples: candidates.slice(0, EXAMPLES).map((c) => clip(c.locator, 120)),
    elementSet: setHash(candidates.map((c) => c.locator)),
    elementBound: true,
    boundLocators: candidates.map((c) => c.locator),
    // 3.7.8 (análise "especificações não achadas", B-09/B-10; D-166): o texto da 3.7.2 punha o exemplo oficial como
    // motivo ("o C01 não acusa (o exemplo oficial traz o mesmo botão sem circle)") e três execuções o usaram para
    // descartar o fato. Agora fato e norma separados, no modelo de força da base: o exemplo é `example` (não é norma); a
    // norma é a cláusula citada. O oráculo não afirma a violação.
    observed: `dentro de ${hosts.join(", ")}; marcação igual a exemplo oficial${examples.length ? ` (${examples.join(", ")})` : ""} — exemplo tem força example, não é norma`,
    todo: "meça texto visível e nome acessível; decida pela cláusula citada",
    // só a cláusula do rótulo: a forma curta da pendência cita a 1ª norma que não está em `rule` (a anatomia tomaria o lugar)
    norms: [BUTTON_LABEL_REQUIRED],
    ...(rule ? { rule } : {}),
    measure: "o check automático do botão só com ícone não cobre botão dentro de outro componente; a norma é a cláusula citada (required), não o exemplo: texto visível no botão × circle × nome acessível",
  };
}

/**
 * 3.7.8 (leitura dev-374-a2 §3/§5 item 5): o campo de arquivo só foi exercido pelo caminho válido — a ação `upload` com um
 * arquivo aceito, e a `drop` nunca. O que a página faz com arquivo que deve recusar (a mensagem, o formato declarado) e no
 * arrasto só aparece exercendo esses caminhos; nenhum check os exerce. Pendência de ELEMENTOS (os campos de arquivo), por
 * rota, com o `accept` lido da marcação. Procedimento genérico: nada de tela, nenhum veredito.
 */
export const UPLOAD_PATHS_TODO = "exerça upload a recusar e drop no campo, cada um com arrival";
export const UPLOAD_PATHS_MEASURE =
  "scan_page actions upload com arquivo de tipo fora do aceito (o arquivo sintético vai até 1 MiB: tamanho só se o limite da página for menor) + arrival (errorVisible ou visible da mensagem); actions drop no alvo + arrival; o drop termina no evento drop: o estado DURANTE o arrasto meça no navegador. Feche: verify_finding no campo ou pendingResolved {id,status,reason}";

/**
 * 3.7.8 (análise "especificações não achadas", N3): as cláusulas do componente Upload que mandam INFORMAR o usuário (a
 * funcionalidade de arrastar na mensagem do campo, o feedback de erro, o alerta de envio único…), lidas da base — força
 * obrigatória/proibitiva, fora das seções de uso/juízo (que a L-NN cobre) e da anatomia, com texto que fala em informar,
 * mensagem ou feedback. Viram itens "a medir contra o texto de apoio visível". Nenhum id fixo: o que a base tiver.
 */
const UPLOAD_INFORM_TEXT = /\binform|mensage|feedback/i;
let uploadInform: Array<{ id: string; text: string }> | undefined;
export function uploadInformClauses(): Array<{ id: string; text: string }> {
  if (uploadInform) return uploadInform;
  try {
    uploadInform = filterRules({ component: "upload", category: "component" })
      .filter((r) => !r.legacy && OBSERVED_PENDING_FORCES.has(r.force) && !USAGE_SUBCATEGORY.test(r.subcategory ?? "") &&
        !/^anatomia/.test(r.subcategory ?? "") && UPLOAD_INFORM_TEXT.test(r.originalText ?? ""))
      .map((r) => ({ id: r.id, text: clip(String(r.originalText).replace(/[*_]/g, "").replace(/\s+/g, " ").trim(), 90) }));
  } catch {
    uploadInform = [];
  }
  return uploadInform;
}

/** 3.7.8 (N3): o texto de apoio existe mas não aparece no estado (pageScan.fileInputSupport). */
export const SUPPORT_HIDDEN = "#oculto-neste-estado";
export const UPLOAD_INFORM_NOTE = "inform: cláusulas do Upload que mandam informar o usuário (o que o apoio deve dizer); dê estado a cada uma";

/**
 * Profile parity (3.7.8): knowledge-free gets the procedural part only — exercise a file the field must reject and a drop,
 * the drag state in the browser, the visible support text as a page fact — with the WCAG criteria; no KB id or text, and the
 * closing path that profile's scan_page has (verify_finding on the field; it has no pendingResolved).
 */
export const UPLOAD_PATHS_MEASURE_KF =
  "scan_page actions upload com arquivo de tipo fora do aceito (o arquivo sintético vai até 1 MiB: tamanho só se o limite da página for menor) + arrival (errorVisible ou visible da mensagem); actions drop no alvo + arrival; o drop termina no evento drop: o estado DURANTE o arrasto meça no navegador. Feche: verify_finding no campo (critério em norms)";

export function uploadPathsPending(inputs: Array<{ locator: string; accept: string | null; support?: string | null }>, knowledgeFree = false): NotJudgedItem | null {
  if (!inputs.length) return null;
  const accepts = [...new Set(inputs.map((i) => (i.accept ? `accept="${clip(i.accept, 40)}"` : "sem accept")))];
  // N3: o texto de apoio visível junto do campo (aria-describedby ou o texto logo depois do componente), medido no estado.
  const support = inputs.map((i) => i.support).find((t): t is string => typeof t === "string") ?? null;
  const inform = knowledgeFree ? [] : uploadInformClauses();
  return {
    code: "upload-paths",
    subject: "campos de arquivo (input type=file)",
    count: inputs.length,
    examples: inputs.slice(0, EXAMPLES).map((i) => clip(i.locator, 120)),
    elementSet: setHash(inputs.map((i) => `${i.locator}=${i.accept ?? ""}`)),
    elementBound: true,
    boundLocators: inputs.map((i) => i.locator),
    observed: `${accepts.join("; ")}; apoio: ${support === SUPPORT_HIDDEN ? "oculto neste estado (meça onde o campo aparece)" : support ? `"${clip(support, 60)}"` : "nenhum texto de apoio associado"}`,
    todo: UPLOAD_PATHS_TODO,
    ...(knowledgeFree ? { norms: ["wcag-3.3.1", "wcag-3.3.2"] } : (() => {
      const g = grounded("6.6", ["wcag-3.3.1", "emag-6.5", "wcag-3.3.2"]);
      return { ...g, norms: [...(g.norms ?? []), ...inform.map((c) => c.id)] };
    })()),
    measure: knowledgeFree ? UPLOAD_PATHS_MEASURE_KF : inform.length ? `${UPLOAD_PATHS_MEASURE}. Meça o apoio visível × ${UPLOAD_INFORM_NOTE}` : UPLOAD_PATHS_MEASURE,
    ...(inform.length ? { inform: inform.map((c) => `${c.id} · ${c.text}`) } : {}),
  };
}

/**
 * 3.7.8 (N5; leitura dev-375-b §3(d)): o scan mede UM estado; o conteúdo atrás de um controle recolhido (menu do cabeçalho,
 * aba, acordeão, diálogo) só é medido num scan com ele aberto — e nenhuma resposta dizia isso (só o código `single-state`
 * dos limites). Cada padrão de gatilho recolhido vira pendência de ELEMENTOS com a receita pronta (scan_page com o clique
 * no seletor único e a chegada que prova o estado aberto). Fecha quando a sessão escaneia esse estado (o controle aberto
 * no estado medido, ou a receita clicou nele) ou por pendingResolved com reason. Casca primeiro; no máximo
 * STATE_PENDING_MAX padrões, o resto contado na última. Nada de base, nada de tela: só a marcação.
 */
export const STATE_PENDING_MAX = 4;
/** A chegada da receita em texto curto: `arrival visible #x`, `arrival expanded (o próprio)`, `arrival dialogOpen`. */
function arrivalText(arrival: DisclosureGroup["arrival"]): string {
  if (!arrival) return "sem arrival: confira o estado no scan";
  if ("visible" in arrival) return `arrival visible ${clip(arrival.visible, 40)}`;
  if ("expanded" in arrival) return "arrival expanded (o próprio @)";
  return "arrival dialogOpen";
}
export const STATE_TODO = "escaneie o estado aberto: recipe (click no @ + arrival); feche assim";
/**
 * Revisão 3.7.8 (HIGH 1): a receita é a do scan que viu o controle (url, ações que alcançaram o estado) + o clique — numa
 * rota profunda (navigate) ou num estado aberto (a aba) a receita só com o clique abria outra página/estado.
 */
export type StateBase = { url: string; actions?: unknown[] };
export function stateRecipe(base: StateBase, selector: string, arrival: DisclosureGroup["arrival"]) {
  return {
    tool: "scan_page",
    arguments: { url: base.url, actions: [...(base.actions ?? []), { action: "click", selector }], ...(arrival ? { arrival } : {}) },
  };
}

/**
 * Todos os padrões viram pendência com id (revisão MED 4: o teto escondia os demais para sempre); quantos aparecem na linha
 * do scan decide capStateItems, no servidor. Padrão repetido (×N, 3 ou mais instâncias de estrutura igual): um scan de uma
 * instância aberta fecha o padrão — dito no texto.
 */
export function statePendings(groups: DisclosureGroup[], base: StateBase | string, knowledgeFree = false): NotJudgedItem[] {
  const b: StateBase = typeof base === "string" ? { url: base } : base;
  return groups.map((g) => {
    const recipe = stateRecipe(b, g.selectors[0], g.arrival);
    return {
      code: "state-unscanned" as const,
      // a chave do padrão vai como hash: o padrão tem classes e tags da página (fica fora das respostas e do ledger)
      subject: `state-unscanned|${setHash([g.pattern])}`,
      count: g.selectors.length,
      examples: g.selectors.slice(0, EXAMPLES).map((s) => clip(s, 120)),
      elementSet: setHash(g.selectors),
      elementBound: true as const,
      boundLocators: [...g.selectors],
      ...(g.arrival ? {} : { stateByClick: true as const }),
      // a chegada vem antes do rótulo: na forma curta (72 caracteres) o rótulo é o que se corta.
      observed: `${g.signal}; ${arrivalText(g.arrival)}${g.region === "shell" ? " (casca)" : ""}${g.label ? ` "${clip(g.label, 30)}"` : ""}`,
      todo: STATE_TODO,
      // a chamada inteira fica em `recipe` (não se repete aqui)
      measure: `rode recipe${g.selectors.length > 1 ? ` (×${g.selectors.length} do mesmo padrão: o scan de uma instância aberta fecha o padrão)` : ""}${knowledgeFree ? "; fecha ao escanear o estado aberto" : "; fecha ao escanear o estado aberto, ou pendingResolved não se aplica com reason"}`,
      recipe,
    };
  });
}

/**
 * Revisão MED 4: na linha do scan, até STATE_PENDING_MAX pendências de estado ABERTAS (as fechadas cedem o lugar); as
 * demais numa linha só com os ids, quantas faltam e onde estão (o ledger, pelo cursor). Todas estão no ledger com id.
 */
export function capStateItems<T extends PendingItem>(items: T[], ledger?: { scanId: string; cursorOf: (pendingId: string) => number | undefined }): PendingItem[] {
  const state = items.filter((i) => i.code === "state-unscanned");
  if (state.length <= STATE_PENDING_MAX) return items;
  const open = state.filter((i) => i.resolved === undefined);
  const shown = new Set([...open, ...state.filter((i) => i.resolved !== undefined)].slice(0, STATE_PENDING_MAX));
  const rest = state.filter((i) => !shown.has(i));
  const restOpen = rest.filter((i) => i.resolved === undefined).length;
  const cursor = ledger ? Math.min(...rest.map((i) => ledger.cursorOf(i.pendingId as string) ?? Infinity)) : Infinity;
  const aggregate: PendingItem = {
    code: "state-unscanned",
    subject: "state-unscanned|+",
    count: rest.length,
    pendingId: pendingIdsLabel(rest.map((i) => i.pendingId as string)),
    observed: `mais ${rest.length} estado(s) recolhido(s), ${restOpen} aberto(s)`,
    todo: Number.isFinite(cursor) && ledger
      ? `receitas: ledger cursor ${cursor} (get_finding_details, view observations)`
      : "receitas no ledger (get_finding_details view observations)",
    measure: "cada um tem id e receita no ledger; fecham como os demais",
  };
  const out: PendingItem[] = [];
  let placed = false;
  for (const i of items) {
    if (i.code !== "state-unscanned" || shown.has(i)) { out.push(i); continue; }
    if (!placed) { out.push(aggregate); placed = true; }
  }
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function notJudgedFor(input: NotJudgedInput): NotJudgedItem[] {
  const items: NotJudgedItem[] = [];
  const { facts } = input;

  const title = input.pageWide ? (facts.title ?? "").trim() : "";
  if (!input.pageWide) {
    /* escopo por seletores: título, idioma e regiões não são do escopo */
  } else if (title) {
    const hints: string[] = [];
    if (facts.siteTitle && fold(facts.siteTitle) === fold(title)) hints.push("igual ao nome do sítio no cabeçalho");
    if (facts.h1 && !fold(title).includes(fold(facts.h1))) hints.push(`não contém o texto do h1 ("${clip(facts.h1, 60)}")`);
    if (!facts.h1) hints.push("a página não tem h1 exibido para comparar");
    items.push({
      code: "document-title-adequacy",
      subject: "<title>",
      observed: `"${clip(title, 80)}"${hints.length ? ` — ${hints.join("; ")}` : ""}`,
      todo: "se descreve o conteúdo principal (axe só exige não vazio)",
      ...grounded("3.3", ["wcag-2.4.2"]),
      measure: "title × assunto (h1)",
    });
  } else if (!input.axeRan) {
    items.push({
      code: "document-title-empty",
      subject: "<title>",
      observed: "vazio ou ausente",
      todo: "axe não rodou: título vazio não virou achado",
      ...grounded("3.3", ["wcag-2.4.2"]),
      measure: "document.title",
    });
  }

  const byKind = (kind: LabelSource["kind"]) => input.fields.filter((f) => f.source.kind === kind);
  const titleOnly = byKind("title-only");
  if (titleOnly.length) {
    items.push({
      code: "field-name-source",
      subject: "campos com nome só pelo title",
      count: titleOnly.length,
      examples: titleOnly.slice(0, EXAMPLES).map((f) => clip(f.locator, 120)),
      elementSet: setHash(titleOnly.map((f) => f.locator)),
      todo: "rótulo associado (o axe aceita o title como nome)",
      ...grounded(ELEMENT_PENDING["field-name-source"].emag, [...ELEMENT_PENDING["field-name-source"].extra]),
      measure: "label/aria-labelledby/aria-label",
    });
  }
  const placeholderOnly = byKind("placeholder-only");
  if (placeholderOnly.length && !input.placeholderChecked) {
    items.push({
      code: "field-name-source",
      subject: "campos com nome só pelo placeholder",
      count: placeholderOnly.length,
      examples: placeholderOnly.slice(0, EXAMPLES).map((f) => clip(f.locator, 120)),
      elementSet: setHash(placeholderOnly.map((f) => f.locator)),
      todo: "rótulo associado (structure não rodou inteiro; o axe aceita o placeholder)",
      ...grounded("6.2", ["wcag-3.3.2"]),
      measure: "label/aria-labelledby/aria-label",
    });
  }
  const unnamed = byKind("unnamed");
  if (unnamed.length && !input.axeRan) {
    items.push({
      code: "field-name-source",
      subject: "campos sem nome acessível",
      count: unnamed.length,
      examples: unnamed.slice(0, EXAMPLES).map((f) => clip(f.locator, 120)),
      elementSet: setHash(unnamed.map((f) => f.locator)),
      todo: "axe não rodou: campo sem nome não virou achado",
      ...grounded("6.2", ["wcag-4.1.2"]),
      measure: "nome acessível do campo",
    });
  }

  if (input.unnamedTables.length) {
    items.push({
      code: "table-name",
      subject: "tabelas sem caption/aria-label/aria-labelledby/title",
      count: input.unnamedTables.length,
      examples: input.unnamedTables.slice(0, EXAMPLES).map((l) => clip(l, 120)),
      elementSet: setHash(input.unnamedTables),
      todo: "título da tabela (o axe não exige caption)",
      ...grounded(ELEMENT_PENDING["table-name"].emag, [...ELEMENT_PENDING["table-name"].extra]),
      measure: "<caption> 1º filho",
    });
  }

  // Idioma e regiões: o axe confere presença/validade; a adequação ao conteúdo nenhum check julga.
  if (input.pageWide && facts.lang) {
    items.push({
      code: "lang-adequacy",
      subject: "idioma da página",
      observed: `lang="${clip(facts.lang, 20)}"`,
      todo: "se corresponde ao conteúdo; trechos em outro idioma",
      ...grounded("3.1", ["emag-3.2"]),
      measure: "lang × idioma do texto",
      signal: "low",
    });
  }
  if (input.pageWide) items.push({
    code: "landmark-adequacy",
    subject: "regiões (main, nav, header, footer)",
    observed: `${facts.mainLandmarks} main`,
    todo: "se as regiões dividem o conteúdo (o axe só pede conteúdo em alguma)",
    ...grounded("1.8"),
    measure: "landmarks × áreas da página",
    signal: "low",
  });
  const contrast = contrastPending(input.contrastIncomplete);
  if (contrast) items.push(contrast);
  const embedded = embeddedIconButtonPending(input.embeddedIconButtons ?? []);
  if (embedded) items.push(embedded);
  items.push(...(input.ariaStates ?? []));
  const upload = uploadPathsPending(input.fileInputs ?? []);
  if (upload) items.push(upload);
  items.push(...statePendings(input.disclosures ?? [], input.stateBase ?? { url: input.url ?? "" }));
  return items;
}

/**
 * 3.7.4 (D2): `remaining` = os elementos ainda sem decisão de uma pendência de elementos que um verify_finding decidiu em
 * parte (`decided` = quantos já foram decididos nesta rota); ela continua aberta com o mesmo pendingId.
 */
export type PendingItem = NotJudgedItem & { pendingId?: string; resolved?: unknown; decided?: number; remaining?: string[] };

/**
 * 3.7.5 (item 6): os ids das pendências em ordem, com as sequências de 3 ou mais em faixa: `P-07..P-13,P-18,P-19,P-32..P-35`.
 * Lido da esquerda para a direita, dá os ids na ordem dos componentes da linha.
 */
export function pendingIdsLabel(ids: string[]): string {
  const n = ids.map((id) => Number(id.slice(2)));
  const out: string[] = [];
  for (let i = 0; i < n.length;) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    if (j - i >= 2) out.push(`${ids[i]}..${ids[j]}`);
    else out.push(...ids.slice(i, j + 1));
    i = j + 1;
  }
  return out.join(",");
}

/** 3.7.5-pre.2: onde estão os ids a ler (a observação de leitura do scan, no ledger). */
export type UsageLedger = { scanId: string; cursor: number };
const usageTodo = (ledger: UsageLedger) =>
  `get_ds_rules{ids,detail:"index"} por componente; ids: get_finding_details{scanId:"${ledger.scanId}",view:"observations",cursor:${ledger.cursor}}, uma por componente`;

/**
 * 3.7.5 (item 6): UMA linha agrega as pendências de leitura (`usage-unread`) dos componentes desta página ainda não lidos:
 * ids na ordem dos componentes e onde estão os ids das cláusulas a ler (a observação do ledger, com a chamada
 * get_ds_rules{ids} de cada componente). Nada é julgado: só garante a leitura.
 */
export function usageUnreadItem(open: Array<{ id: string; component: string }>, ledger: UsageLedger): PendingItem | undefined {
  if (!open.length) return undefined;
  // Em ordem de id (o rótulo em faixas acompanha a ordem dos componentes).
  open = [...open].sort((x, y) => Number(x.id.slice(2)) - Number(y.id.slice(2)));
  return {
    code: "usage-unread",
    subject: "cláusulas de uso e juízo (uso, melhores práticas, tom e voz) que obrigam, proíbem ou desaconselham",
    count: open.length,
    pendingId: pendingIdsLabel(open.map((o) => o.id)),
    examples: open.map((o) => o.component),
    todo: usageTodo(ledger),
    measure: "leitura, sem veredito: um id por componente, na ordem; fecha quando o servidor vê devolvidas todas as cláusulas do componente (pendingResolved não fecha)",
  };
}

/**
 * 3.7.5-pre.2; revisão H2: as observações de leitura no ledger — UMA por pendência de leitura aberta na sessão (em ordem de
 * id), com o componente, os ids e as chamadas get_ds_rules{ids, detail:"index"} (até 20 ids cada) que os devolvem. Uma
 * observação só, com todas, passava de 8.000 caracteres com 26 componentes.
 */
export function usageLedgerObservations(open: Array<{ id: string; component: string; calls: unknown[]; route?: string; scanId?: string }>, url: string): Observation[] {
  // 3.7.8 (H2): a pendência aberta só noutra rota leva a rota e o scan de origem (element.page = a rota dela), não esta página.
  return open.map((o) => ({
    kind: "not-judged",
    element: { locator: "html", page: o.route ?? url },
    note: `usage-unread ${o.id}: ${o.component}${o.route ? ` (outra rota: ${routePath(o.route)}${o.scanId ? `, ${o.scanId}` : ""})` : ""}`,
    whyNotAFinding: "Pendência de leitura: nada foi julgado. Fecha quando estas chamadas (ou a listagem do componente pelo cursor) devolvem todas as cláusulas dele.",
    data: { code: "usage-unread", pendingId: o.id, component: o.component, ...(o.route ? { otherRoute: routePath(o.route), ...(o.scanId ? { fromScan: o.scanId } : {}) } : {}), calls: o.calls },
  }) as Observation);
}

/** O caminho de uma chave de rota (origem + caminho), para leitura. */
function routePath(route: string): string {
  try {
    const u = new URL(route.replace(/#.*$/, ""));
    return `${u.pathname}${route.includes("#") ? route.slice(route.indexOf("#")) : ""}`;
  } catch {
    return route;
  }
}

const USAGE_LIST_MAX = 160;

/** Na resposta: até 2 exemplos (o item inteiro fica no ledger); 3.6.1: com o id da pendência da sessão. */
function compactItem(item: PendingItem, withText: (code: string) => boolean = () => true) {
  // 3.7.5 (item 6): a pendência de leitura leva todos os componentes (o id de cada um é a posição na faixa de ids).
  if (item.code === "usage-unread") {
    const { subject: _s, ...rest } = item;
    return rest;
  }
  const { examples, subject: _subject, measured, norms, signal, measure, elementSet: _set, elementBound: _bound, boundLocators: _locs, ariaPairs: _pairs, resolveRequires: _req, resolveByRead: _read, idSpace: _space, stateByClick: _click, condition: _cond, ...rest } = item;
  // 3.6.1: a cláusula em `rule` não se repete em `norms` (fica o resto: e-MAG, WCAG).
  const others = norms && rest.rule ? norms.filter((n) => n !== rest.rule!.id) : norms;
  // Pendência sem sinal medido (idioma, regiões): a cláusula vai só com id e força; `measure` fica no ledger.
  // 3.6.1 (revisão H1): o texto da cláusula só na 1ª vez que o código aparece na sessão; depois, só id e força.
  const low = signal === "low";
  const rule = rest.rule && (low || !withText(item.code)) ? { id: rest.rule.id, force: rest.rule.force } : rest.rule;
  return {
    ...rest,
    ...(low ? { signal } : { measure }),
    ...(rule ? { rule } : {}),
    // 3.7.6: a pendência de observação cita só a norma de `rule` — sem `norms: []` vazio.
    ...(others && (others.length || item.code !== "observed-required") ? { norms: others } : {}),
    ...(examples && !measured ? { examples: examples.slice(0, 2) } : {}),
    ...(measured ? { measured } : {}),
  };
}

/**
 * O que os checks executados medem no nível da página (para o agente não tomar o resto como coberto). Com
 * `components` restrito, os detectores de página do check structure (rótulo, ícone, title, foco) não rodam.
 */
export function pageLevelMeasured(checks: string[], componentsRestricted = false): string[] {
  const out: string[] = [];
  if (checks.includes("page")) out.push("header/footer", "skip-link", "focus-order");
  if (checks.includes("axe")) out.push("title-present", "lang-valid", "h1", "regions (axe)");
  if (checks.includes("structure")) out.push(...(componentsRestricted ? ["component-structure"] : ["component-structure", "placeholder-label", "decorative-icon", "icon-only-button", "link-title", "focus-visible", "aria-native-state"]));
  return out;
}

/** 3.5.0 (revisão, MED): os itens inteiros paginam como observações `not-judged` (nunca achado). */
export function notJudgedObservations(items: NotJudgedItem[], url: string, short = false): Observation[] {
  return items.map((item) => ({
    kind: "not-judged",
    element: { locator: item.examples?.[0] ?? "html", page: url },
    note: `${item.code}: ${item.observed ?? item.subject}${item.count !== undefined ? ` (${item.count})` : ""}`,
    // 3.7.8 (H1): no perfil com a base (short), a tarefa e a medida ficam só em data (todo, measure) — repetidas aqui, a
    // página do `next` da forma compacta não cabia todas as pendências que a forma lista. O knowledge-free fica como era.
    whyNotAFinding: short
      ? "Pendência: nenhum check deste scan julgou — a tarefa em data.todo, como medir em data.measure."
      : `Pendência: nenhum check deste scan julgou — ${item.todo}. Meça: ${item.measure}.`,
    data: (({ elementSet: _set, boundLocators: _locs, resolveRequires: _req, resolveByRead: _read, idSpace: _space, stateByClick: _click, ...rest }) => rest)(item),
  }));
}

/**
 * 3.5.0 (D-155 item 1; revisão Fable P8): `checksRun.pageLevel` — o que foi medido no nível da página e o
 * que está nela e nenhum check julgou (pendências, nunca veredito). Só encolhe como último recurso do teto.
 */
export function pageLevelBlock(checks: string[], items: PendingItem[], componentsRestricted = false, withText: (code: string) => boolean = () => true) {
  // revisão MED 6: por id de O-NN, a condição exata do verify — sobrevive a toda compactação (forma de ids inclusive).
  const conditions = Object.fromEntries(items.filter((i) => i.condition && i.pendingId).map((i) => [i.pendingId as string, i.condition as string]));
  return {
    measured: pageLevelMeasured(checks, componentsRestricted),
    notMeasured: items.map((i) => compactItem(i, withText)),
    ...(Object.keys(conditions).length ? { conditions } : {}),
    note: "notMeasured: pendências suas (nenhum check julgou; não é conformidade); cada pendingId volta até verify_finding ou pendingResolved; rule = a cláusula obrigatória.",
  };
}

/**
 * 3.6.1 (item 5): pendências do perfil knowledge-free — só o que o axe mediu e não decidiu, com o critério WCAG
 * (nenhum texto, id ou força da base de conhecimento).
 */
export function pageLevelBlockKnowledgeFree(items: PendingItem[]) {
  // 3.7.3 A8: com pendências ARIA × nativo, a nota não atribui a medida só ao axe.
  const aria = items.some((i) => i.code.startsWith("aria-"));
  // 3.7.8 (paridade): estado recolhido e caminho do campo de arquivo não são medida do axe — a nota diz o que são.
  const procedural = items.some((i) => i.code === "state-unscanned" || i.code === "upload-paths");
  return {
    notMeasured: items.map((i) => compactItem(i)),
    note: procedural
      ? "notMeasured: pendências suas — o oráculo mediu e não decidiu, ou um estado/caminho da página que este scan não exerceu (recipe, measure); não é conformidade. Cada pendingId volta em todo scan até você resolvê-lo: verify_finding (critério em norms) ou o scan do estado."
      : aria
      ? "notMeasured: pendências suas — o oráculo mediu e não decidiu (axe; estado ARIA × nativo); não é conformidade. Cada pendingId volta em todo scan até você resolvê-lo com verify_finding (critério candidato em norms)."
      : "notMeasured: pendências suas — o axe mediu e não decidiu; não é conformidade. Cada pendingId volta em todo scan até você resolvê-lo com verify_finding (critério em norms).",
  };
}

/**
 * 3.7.4 (D3): a cláusula de COMPONENTE do DS que a pendência cita — um id da base que não é cláusula e-MAG (as e-MAG da
 * base aparecem pelo identificador `emag-x.y`). Só ids `govbr-…` são consultados na base (o perfil sem conhecimento só tem
 * `wcag-…`: a trava não é tocada).
 */
function dsComponentNorm(all: string[]): string | undefined {
  return all.find((n) => {
    if (!n.startsWith("govbr-")) return false;
    try {
      const r = getRuleById(n);
      return Boolean(r) && r!.standard !== "eMAG";
    } catch {
      return false;
    }
  });
}

/**
 * As normas curtas de uma pendência. 3.6.3: o critério WCAG antes do e-MAG quando os dois existem (o WCAG é o que o
 * agente consegue medir e citar nos dois perfis); senão a 1ª da lista.
 * 3.7.4 (D3; teste à mão da 3.7.3, P-06 do Switch): com uma cláusula de componente do DS (`rule` ou `norms`), ela vem
 * PRIMEIRO e a segunda é o WCAG (ou, sem WCAG, o e-MAG) — a linha compacta é a que o agente lê primeiro e deve mostrar a
 * cláusula citável do componente, como a do Button. Sem ela, como antes: WCAG, e-MAG; senão a 1ª da lista.
 */
function shortNorms(norms: string[] | undefined, rule?: { id: string }): string[] {
  const all = [...(rule ? [rule.id] : []), ...(norms ?? [])];
  const ds = dsComponentNorm(all);
  const wcag = all.find((n) => n.startsWith("wcag-"));
  const emag = all.find((n) => n.startsWith("emag-"));
  const out = (ds ? [ds, wcag ?? emag] : [wcag, emag]).filter((n): n is string => Boolean(n));
  return out.length ? out : [...(norms ?? []), ...(rule ? [rule.id] : [])].slice(0, 1);
}

const SHORT_TASK_MAX = 72;
const SHORT_LOCATOR_MAX = 60;

/** Um valor medido, em texto curto: `.x fg #fff bg #ff8c00 ratio 2.33`. */
function measuredText(m: NonNullable<NotJudgedItem["measured"]>[number]): string {
  return [clip(m.locator, SHORT_LOCATOR_MAX), m.fg ? `fg ${m.fg}` : "", m.bg ? `bg ${m.bg}` : "", m.ratio !== null && m.ratio !== undefined ? `ratio ${m.ratio}` : ""].filter(Boolean).join(" ");
}

/**
 * 3.6.3 (D-155; rastreio dev-362-b-01 §1): uma pendência numa linha que ainda serve para agir — código, localizador(es),
 * o valor que o oráculo JÁ mediu e a tarefa. Na 3.6.2 a forma curta era `P-05:contrast-incomplete:1⇒emag-4.1`: sem a
 * tarefa e sem o 2,33:1 já medido, o agente que só a recebeu não resolveu a pendência (as três que receberam a forma
 * inteira resolveram). Formato: `P-NN:código[:n]⇒wcag-x,emag-y @onde-e-quanto · tarefa`.
 */
export function pendingLine(i: PendingItem): string {
  // 3.7.5 (item 6): `P-09..P-11:usage-unread:3 @accordion,avatar,table · get_ds_rules{…} até o fim; fecha ao ler`.
  if (i.code === "usage-unread") {
    return `${i.pendingId}:usage-unread:${i.count} @${clip((i.examples ?? []).join(","), USAGE_LIST_MAX)} · ${i.todo}`;
  }
  const norms = shortNorms(i.norms, i.rule);
  const where = i.measured?.length
    ? i.measured.slice(0, 2).map(measuredText).join("; ")
    : [
        // 3.7.4 (D2): verificada em parte — a linha mostra os elementos que faltam.
        ...(i.remaining?.length ? [`falta ${i.remaining.slice(0, 2).map((l) => clip(l, SHORT_LOCATOR_MAX)).join(", ")}`] : (i.examples ?? []).slice(0, 2).map((l) => clip(l, SHORT_LOCATOR_MAX))),
        ...(i.observed ? [clip(i.observed, SHORT_TASK_MAX)] : []),
      ].join("; ");
  return `${i.pendingId ? `${i.pendingId}:` : ""}${i.code}${i.count !== undefined ? `:${i.count}` : ""}${norms.length ? `⇒${norms.join(",")}` : ""}${i.resolved !== undefined ? "✓" : ""}${where ? ` @${where}` : ""} · ${shortTodo(i.todo)}`;
}

/** 3.7.8 (H3): a tarefa curta nunca corta a condição exata do verify no meio. */
function shortTodo(todo: string): string {
  const short = clip(todo, SHORT_TASK_MAX);
  const condition = conditionOf(todo);
  return condition && !short.includes(condition) ? `verify_finding expectedCondition ${condition}` : short;
}

/**
 * 3.6.1 (revisão H1): a forma curta das pendências — o piso antes de qualquer família sair da 1ª página. Uma linha
 * por pendência com sinal (3.6.3: `pendingLine`, com o localizador, o valor medido e a tarefa); as sem sinal (idioma,
 * regiões) só contadas. A cláusula inteira está em `full` (get_finding_details) e no scan seguinte (sessionPending)
 * enquanto não foi entregue.
 */
export function pageLevelShort(block: { notMeasured?: Array<PendingItem | string>; full?: unknown; conditions?: Record<string, string> }) {
  let low = 0;
  const items: string[] = [];
  for (const i of block.notMeasured ?? []) {
    if (typeof i === "string") {
      items.push(i);
      continue;
    }
    if (i.signal === "low") {
      low += 1;
      continue;
    }
    items.push(pendingLine(i));
  }
  return {
    notMeasured: items,
    ...(low ? { lowSignal: low } : {}),
    ...(block.conditions ? { conditions: block.conditions } : {}),
    ...(block.full ? { full: block.full } : {}),
  };
}

const splitOnce = (s: string, sep: string): [string, string] => {
  const i = s.indexOf(sep);
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + sep.length)];
};

/**
 * 3.6.3 (reexecução): o degrau entre a linha e o código — a mesma pendência com uma norma, um localizador com o valor
 * medido e a tarefa em poucas palavras: `P-05:contrast-incomplete:1⇒wcag-1.4.3 @.content #ffffff/#ff8c00 2.33:1 ·
 * decida o contraste`. Sem ele, num teto apertado a linha inteira caía direto para o código e a medida sumia.
 */
export function pendingLineMinimal(line: string): string {
  const [left, task] = splitOnce(line, " · ");
  const [headNorms, where] = splitOnce(left, " @");
  const [head, norms] = splitOnce(headNorms, "⇒");
  const done = norms.endsWith("✓");
  const norm = norms.replace(/✓$/, "").split(",")[0];
  const place = where
    .split("; ")[0]
    .replace(/ fg (\S+) bg (\S+)/, " $1/$2")
    .replace(/ ratio (\S+)/, " $1:1");
  // 3.7.5-pre.3: a tarefa da linha de leitura é uma chamada (`get_ds_rules{ids,detail:"index"} por componente`): corta no ";".
  const usage = head.includes(":usage-unread:");
  // 3.7.8 (teste à mão da 3.7.7, H3): a condição exata do verify é a única coisa que não pode sumir na compactação (sem
  // ela o verify responde no-predicate) — a tarefa mínima vira `verify_finding expectedCondition <condição>`.
  const condition = conditionOf(task);
  const shortTask = condition ? `verify_finding expectedCondition ${condition}` : (usage ? task.split(";")[0] : task.split(/[:(;]/)[0]).trim();
  return `${head}${norm ? `⇒${norm}` : ""}${done ? "✓" : ""}${place ? ` @${clip(place, 56)}` : ""}${shortTask ? ` · ${condition ? shortTask : clip(shortTask, usage ? 48 : 32)}` : ""}`;
}

/** 3.7.8 (H3): a condição estruturada do verify citada numa tarefa (`expectedCondition x-y-z`), ou null. */
export function conditionOf(task: string): string | null {
  return /expectedCondition[\s:"]+([a-z][a-z0-9-]*)/.exec(task)?.[1] ?? null;
}

/** 3.6.3: a forma curta → a mínima (uma norma, um lugar, a tarefa em poucas palavras); null se já é mínima. */
export function pageLevelMinimal<T extends { notMeasured?: Array<unknown> }>(block: T): T | null {
  if (!block.notMeasured?.length || !block.notMeasured.every((i) => typeof i === "string")) return null;
  const next = (block.notMeasured as string[]).map(pendingLineMinimal);
  if (next.every((l, i) => l === block.notMeasured![i])) return null;
  return { ...block, notMeasured: next };
}

/**
 * 3.6.3 (revisão MEDIUM 2): o degrau entre a mínima e o código — `P-NN:código[:n]⇒norma` (~35 caracteres, a forma
 * curta da 3.6.2), para que num teto apertado a norma não suma antes do código.
 */
export function pendingLineNorm(line: string): string {
  // 3.7.8 (H3): a condição exata do verify sobrevive também neste degrau.
  const condition = conditionOf(splitOnce(line, " · ")[1]);
  return `${line.split(" @")[0].split(" · ")[0]}${condition ? ` · expectedCondition ${condition}` : ""}`;
}

/** 3.6.3: a forma mínima → `código⇒norma`; null se já está nela. */
export function pageLevelNorm<T extends { notMeasured?: Array<unknown> }>(block: T): T | null {
  if (!block.notMeasured?.length || !block.notMeasured.every((i) => typeof i === "string")) return null;
  const next = (block.notMeasured as string[]).map(pendingLineNorm);
  if (next.every((l, i) => l === block.notMeasured![i])) return null;
  return { ...block, notMeasured: next };
}

/** Último recurso do teto: só os códigos das pendências (inteiras no ledger: get_finding_details(scanId)). */
export function pageLevelCodes(block: { measured?: string[]; notMeasured?: Array<NotJudgedItem | string>; full?: unknown; conditions?: Record<string, string> }, scanId = "") {
  const codes = (block.notMeasured ?? []).map((i) => {
    if (typeof i === "string") return i.split(/[⇒ ]/)[0];
    const pid = (i as PendingItem).pendingId;
    return `${pid ? `${pid}:` : ""}${i.count !== undefined ? `${i.code}:${i.count}` : i.code}`;
  });
  return {
    notMeasured: codes,
    count: codes.length,
    ...(block.conditions ? { conditions: block.conditions } : {}),
    ...(block.full ? { next: block.full } : scanId ? { next: { tool: "get_finding_details", arguments: { scanId, view: "observations" } } } : {}),
  };
}
