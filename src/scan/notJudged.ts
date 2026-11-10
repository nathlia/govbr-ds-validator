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
import { getRuleById } from "../data/knowledge.js";
import { BUTTON_LABEL_REQUIRED } from "../checkers/iconOnlyButton.js";

/** 3.6.3: o hash de um conjunto de elementos (ordem não importa). */
function setHash(parts: string[]): string {
  return createHash("sha256").update([...new Set(parts)].sort().join("\u0001")).digest("hex").slice(0, 16);
}

export interface NotJudgedItem {
  code: "document-title-adequacy" | "document-title-empty" | "field-name-source" | "table-name" | "lang-adequacy" | "landmark-adequacy" | "contrast-incomplete" | "icon-only-embedded" | "aria-native-mismatch" | "aria-state-unverified" | "usage-unread" | "observed-required";
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
export function observedRequiredItems(observations: Observation[]): NotJudgedItem[] {
  const groups = new Map<string, { kind: string; ruleId: string; obs: Observation[] }>();
  for (const o of observations) {
    const rel = (o.data as { relatedRule?: { id?: unknown; force?: unknown } } | undefined)?.relatedRule;
    if (!rel || typeof rel.id !== "string" || typeof rel.force !== "string" || !OBSERVED_PENDING_FORCES.has(rel.force)) continue;
    const key = `${o.kind}|${rel.id}`;
    const g = groups.get(key) ?? { kind: o.kind, ruleId: rel.id, obs: [] };
    if (!g.obs.some((x) => x.element.locator === o.element.locator)) g.obs.push(o);
    groups.set(key, g);
  }
  return [...groups.values()].map(({ kind, ruleId, obs }) => {
    const rule = kbRule(ruleId);
    const first = obs[0];
    return {
      code: "observed-required" as const,
      subject: `${kind}|${ruleId}`,
      count: obs.length,
      examples: obs.slice(0, EXAMPLES).map((o) => clip(o.element.locator, 120)),
      elementSet: setHash(obs.map((o) => `${o.element.locator}=${observedValue(o)}`)),
      elementBound: true as const,
      boundLocators: obs.map((o) => o.element.locator),
      observed: `${kind}: ${observedValue(first)}${obs.length > 1 ? ` (+${obs.length - 1})` : ""}`,
      todo: OBSERVED_TODO,
      norms: [ruleId],
      ...(rule ? { rule } : {}),
      measure: "o valor medido (observação do scan) × a cláusula",
      resolveByRead: [ruleId],
      idSpace: "O" as const,
    };
  });
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
    observed: `dentro de ${hosts.join(", ")}: a marcação coincide com o exemplo oficial do DS${examples.length ? ` (${examples.join(", ")})` : ""}`,
    todo: "a investigar: o C01 não acusa (o exemplo oficial traz o mesmo botão sem circle); decida se viola o rótulo obrigatório",
    // só a cláusula do rótulo: a forma curta da pendência cita a 1ª norma que não está em `rule` (a anatomia tomaria o lugar)
    norms: [BUTTON_LABEL_REQUIRED],
    ...(rule ? { rule } : {}),
    measure: "texto visível no botão × classe/atributo circle",
  };
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
export function usageLedgerObservations(open: Array<{ id: string; component: string; calls: unknown[] }>, url: string): Observation[] {
  return open.map((o) => ({
    kind: "not-judged",
    element: { locator: "html", page: url },
    note: `usage-unread ${o.id}: ${o.component}`,
    whyNotAFinding: "Pendência de leitura: nada foi julgado. Fecha quando estas chamadas (ou a listagem do componente pelo cursor) devolvem todas as cláusulas dele.",
    data: { code: "usage-unread", pendingId: o.id, component: o.component, calls: o.calls },
  }) as Observation);
}

const USAGE_LIST_MAX = 160;

/** Na resposta: até 2 exemplos (o item inteiro fica no ledger); 3.6.1: com o id da pendência da sessão. */
function compactItem(item: PendingItem, withText: (code: string) => boolean = () => true) {
  // 3.7.5 (item 6): a pendência de leitura leva todos os componentes (o id de cada um é a posição na faixa de ids).
  if (item.code === "usage-unread") {
    const { subject: _s, ...rest } = item;
    return rest;
  }
  const { examples, subject: _subject, measured, norms, signal, measure, elementSet: _set, elementBound: _bound, boundLocators: _locs, ariaPairs: _pairs, resolveRequires: _req, resolveByRead: _read, idSpace: _space, ...rest } = item;
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
export function notJudgedObservations(items: NotJudgedItem[], url: string): Observation[] {
  return items.map((item) => ({
    kind: "not-judged",
    element: { locator: item.examples?.[0] ?? "html", page: url },
    note: `${item.code}: ${item.observed ?? item.subject}${item.count !== undefined ? ` (${item.count})` : ""}`,
    whyNotAFinding: `Pendência: nenhum check deste scan julgou — ${item.todo}. Meça: ${item.measure}.`,
    data: (({ elementSet: _set, boundLocators: _locs, resolveRequires: _req, resolveByRead: _read, idSpace: _space, ...rest }) => rest)(item),
  }));
}

/**
 * 3.5.0 (D-155 item 1; revisão Fable P8): `checksRun.pageLevel` — o que foi medido no nível da página e o
 * que está nela e nenhum check julgou (pendências, nunca veredito). Só encolhe como último recurso do teto.
 */
export function pageLevelBlock(checks: string[], items: PendingItem[], componentsRestricted = false, withText: (code: string) => boolean = () => true) {
  return {
    measured: pageLevelMeasured(checks, componentsRestricted),
    notMeasured: items.map((i) => compactItem(i, withText)),
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
  return {
    notMeasured: items.map((i) => compactItem(i)),
    note: aria
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
  return `${i.pendingId ? `${i.pendingId}:` : ""}${i.code}${i.count !== undefined ? `:${i.count}` : ""}${norms.length ? `⇒${norms.join(",")}` : ""}${i.resolved !== undefined ? "✓" : ""}${where ? ` @${where}` : ""} · ${clip(i.todo, SHORT_TASK_MAX)}`;
}

/**
 * 3.6.1 (revisão H1): a forma curta das pendências — o piso antes de qualquer família sair da 1ª página. Uma linha
 * por pendência com sinal (3.6.3: `pendingLine`, com o localizador, o valor medido e a tarefa); as sem sinal (idioma,
 * regiões) só contadas. A cláusula inteira está em `full` (get_finding_details) e no scan seguinte (sessionPending)
 * enquanto não foi entregue.
 */
export function pageLevelShort(block: { notMeasured?: Array<PendingItem | string>; full?: unknown }) {
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
  const shortTask = (usage ? task.split(";")[0] : task.split(/[:(;]/)[0]).trim();
  return `${head}${norm ? `⇒${norm}` : ""}${done ? "✓" : ""}${place ? ` @${clip(place, 56)}` : ""}${shortTask ? ` · ${clip(shortTask, usage ? 48 : 32)}` : ""}`;
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
  return line.split(" @")[0].split(" · ")[0];
}

/** 3.6.3: a forma mínima → `código⇒norma`; null se já está nela. */
export function pageLevelNorm<T extends { notMeasured?: Array<unknown> }>(block: T): T | null {
  if (!block.notMeasured?.length || !block.notMeasured.every((i) => typeof i === "string")) return null;
  const next = (block.notMeasured as string[]).map(pendingLineNorm);
  if (next.every((l, i) => l === block.notMeasured![i])) return null;
  return { ...block, notMeasured: next };
}

/** Último recurso do teto: só os códigos das pendências (inteiras no ledger: get_finding_details(scanId)). */
export function pageLevelCodes(block: { measured?: string[]; notMeasured?: Array<NotJudgedItem | string>; full?: unknown }, scanId = "") {
  const codes = (block.notMeasured ?? []).map((i) => {
    if (typeof i === "string") return i.split(/[⇒ ]/)[0];
    const pid = (i as PendingItem).pendingId;
    return `${pid ? `${pid}:` : ""}${i.count !== undefined ? `${i.code}:${i.count}` : i.code}`;
  });
  return {
    notMeasured: codes,
    count: codes.length,
    ...(block.full ? { next: block.full } : scanId ? { next: { tool: "get_finding_details", arguments: { scanId, view: "observations" } } } : {}),
  };
}
