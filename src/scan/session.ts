/**
 * 3.6.1 (D-155, trace dev-350-b-01): a memória da sessão MCP entre scans — genérica, sem nada de tela.
 *
 * Na tela B, com a 3.5.0, o agente com o oráculo perdeu fatos que o oráculo já tinha dado:
 *   - pendências de página (título, tabela sem título) apareciam no scan e sumiam no seguinte; a mesma
 *     pendência em três rotas não virou candidato nenhuma vez (item 1);
 *   - o mesmo `<title>` em rotas distintas só era detectável comparando scans, e nenhum check fazia isso
 *     (item 2);
 *   - um elemento oculto num scan (observação `hiddenInState`) ficou visível noutro em que o agente pediu só
 *     `checks:["axe"]`, e nada o mediu (item 3);
 *   - membros de rotas/estados diferentes foram fundidos num cartão (item 6).
 * Este módulo guarda, por sessão: os scans (rota, estado, título), as pendências abertas (com norma e força)
 * e os elementos que estavam ocultos. Nada é chaveado por tela, seletor ou texto de página: a rota é o caminho
 * da URL observada; a pendência é o código genérico do notJudged.
 */
import type { Finding, Observation } from "../schema/finding.js";
import { pendingIdsLabel, type NotJudgedItem } from "./notJudged.js";
import { scanPageKey } from "./state.js";

/**
 * Rota de um scan: caminho da URL observada (sem barra final) + fragmento só quando ele é rota de SPA
 * (`#/…`, `#!/…`). A query não entra (paginação/filtro não é outra página); a origem entra.
 */
export function routeKeyOf(url: string): string {
  try {
    const u = new URL(url);
    const hashRoute = /^#!?\//.test(u.hash) ? u.hash.replace(/[?].*$/, "") : "";
    return `${u.origin}${u.pathname.replace(/\/+$/, "") || "/"}${hashRoute}`;
  } catch {
    return url;
  }
}

/**
 * 3.6.1 (revisão M4): o modelo da rota — segmentos que são só id (número, uuid, hex longo) viram `:id`. Duas rotas
 * do mesmo modelo (`/x/3028`, `/x/3038`) são a mesma página-modelo com outro registro.
 */
export function routeTemplateOf(route: string): string {
  return route.replace(/\/(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,})(?=\/|$|#)/gi, "/:id");
}

/**
 * 3.7.2 (revisão MÉDIA 4): marca do item de alsoIn — true quando a outra ocorrência é de OUTRA rota (rota inteira), false
 * quando é outro estado da mesma rota. Chave símbolo: acompanha o objeto na montagem da resposta e não sai no JSON.
 */
export const CROSS_ROUTE: unique symbol = Symbol("alsoIn.crossRoute");

/** A rota para leitura: só o caminho (+ fragmento de rota); a origem é a mesma em quase toda sessão. */
export function routeLabel(route: string): string {
  try {
    const u = new URL(route.replace(/#.*$/, ""));
    const hash = route.includes("#") ? route.slice(route.indexOf("#")) : "";
    return `${u.pathname}${hash}`;
  } catch {
    return route;
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A rota curta para respostas: segmentos longos (uuid, hash) viram `…abcd`; até 48 caracteres. */
export function shortRoute(route: string): string {
  return clip(routeLabel(route).replace(/[^/]{13,}/g, (seg) => `…${seg.slice(-4)}`), 48);
}

export interface PendingRule {
  id: string;
  force: string;
  text: string;
}

export type PendingResolution = { by: "verify_finding" | "pendingResolved" | "usage-read" | "rule-read" | "state-scanned"; status?: string; ref?: string; reason?: string };

/** 3.7.8 (N5): código da pendência de estado recolhido não escaneado. */
export const STATE_CODE = "state-unscanned";

/**
 * 3.7.5 (item 6): pendência de LEITURA das cláusulas de uso/juízo de um componente do DS encontrado na página. Uma por
 * componente na sessão (todas as rotas); fecha só quando o servidor viu, nesta sessão, respostas que devolveram todas
 * essas cláusulas (ScanSession.noteRead); pendingResolved e verify_finding não a fecham. Não julga nada.
 */
export const USAGE_CODE = "usage-unread";

/**
 * 3.6.3 (revisão HIGH 1): o estado da pendência em UMA rota. O id e o rótulo podem ser compartilhados entre rotas (o mesmo
 * conjunto de elementos), mas a resolução é por rota: o que foi medido numa rota não fecha a mesma pendência noutra.
 */
export interface PendingSlot {
  route: string;
  status: "open" | "resolved";
  resolution?: PendingResolution;
  /** Elementos citados nesta rota. */
  locators: string[];
  scans: string[];
  /**
   * 3.7.4 (D2): pendência de elementos (`elementBound`) — os elementos já decididos por verify_finding nesta rota. A rota só
   * fecha quando todos os `locators` foram decididos; até lá fica aberta (mesmo pendingId) com os que faltam.
   */
  decided?: string[];
}

/** 3.7.4 (D2): os elementos de uma rota da pendência ainda sem decisão (pendência de elementos parcialmente verificada). */
export function slotRemaining(slot: PendingSlot): string[] {
  return slot.decided?.length ? slot.locators.filter((l) => !slot.decided!.includes(l)) : slot.locators;
}

/** 3.7.4 (D2): verify que decidiu só parte dos elementos de uma pendência (ela continua aberta com o resto). */
export type PendingPartial = { id: string; decided: string[]; remaining: string[] };

export interface PendingEntry {
  id: string;
  key: string;
  code: string;
  subject: string;
  /** A rota em que a pendência abriu. */
  route: string;
  /** 3.6.3: todas as rotas em que a mesma pendência (mesmo código + conjunto de elementos) apareceu. */
  routes: string[];
  /** 3.6.3: o estado por rota (a resolução é por rota). */
  slots: PendingSlot[];
  scans: string[];
  norms: string[];
  rule?: PendingRule;
  /** Elementos citados pela pendência (campos, tabelas, nós); vazio = pendência do documento. */
  locators: string[];
  /** 3.6.1 (revisão M1): pendência sem sinal medido (idioma, regiões) — em sessionPending só como contagem. */
  low: boolean;
  /** 3.7.2 (revisão HIGH 1): só o verify_finding num dos elementos da pendência a fecha (NotJudgedItem.elementBound). */
  elementBound?: boolean;
  /** 3.7.3 A8 (revisão MED 2): o verify_finding que fecha precisa ser vivo, com ações na receita e esta condição. */
  requires?: { actions: true; expectedCondition: string };
  /** 3.7.5 (item 6): pendência de leitura — o componente e as cláusulas de uso/juízo que precisam ser devolvidas. */
  usage?: { component: string; ids: string[] };
  /**
   * 3.7.6 (item 3; pre.2, revisão MED): pendência de observação com norma obrigatória (`O-NN`). Fecha SÓ por verify_finding
   * com decisão (confirmed/rejected) em cada elemento, ou pela leitura destas normas POR ID (get_ds_rules ids/id) depois
   * que a pendência foi entregue nesta sessão (`deliveredTick`). Leitura anterior, resultado de busca e pendingResolved não
   * a fecham.
   */
  readIds?: string[];
  /** 3.7.6-pre.2: o instante (relógio lógico da sessão) da 1ª resposta de scan que entregou a pendência `O-NN`. */
  deliveredTick?: number;
  /** 3.7.8 (N5): estado sem chegada verificável — fecha pelo scan cuja receita clicou no controle. */
  stateByClick?: boolean;
  /** 3.7.9 (D3): os checks do scan que abriu a pendência de estado — o scan que a fecha roda pelo menos estes. */
  stateChecks?: string[];
  /** Derivado das rotas: "open" enquanto alguma rota estiver aberta. */
  status: "open" | "resolved";
  /** A última resolução (de qualquer rota). */
  resolution?: PendingResolution;
}

/** 3.6.3: o estado da pendência nesta rota. */
export function slotOf(entry: PendingEntry, route: string): PendingSlot | undefined {
  return entry.slots.find((x) => x.route === route);
}

/** Rótulo de uma rota da pendência: o id sozinho quando ela é de uma rota só; `P-NN@/caminho` quando é de várias. */
export function slotLabel(entry: PendingEntry, route: string): string {
  return entry.slots.length > 1 ? `${entry.id}@${routeLabel(route)}` : entry.id;
}

function resolveSlot(entry: PendingEntry, slot: PendingSlot, resolution: PendingResolution): void {
  slot.status = "resolved";
  slot.resolution = resolution;
  entry.resolution = resolution;
  entry.status = entry.slots.some((x) => x.status === "open") ? "open" : "resolved";
}

export interface SessionScan {
  scanId: string;
  route: string;
  fingerprint: string;
  title: string | null;
  /** 3.6.1 (revisão M4): o assunto principal exibido (h1; sem h1, o 1º título em main). */
  heading?: string | null;
  checks: string[];
  /** 3.6.5 (item 5): componentes do DS encontrados neste scan (coverage.componentsFound). */
  components?: string[];
}

/** 3.6.5 (item 4): onde uma família (pela assinatura de evidência) foi vista nesta sessão. */
export interface FamilySighting {
  scanId: string;
  route: string;
  fingerprint: string;
  familyId: string;
  locators: string[];
}

export interface HiddenEntry {
  scanId: string;
  n: number;
  pageKey: string;
  locator: string;
  checker: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Normas que uma alegação cita, na forma das `norms` das pendências (id KB, `emag-n.n`, `wcag-n.n.n`). */
export function citedNorms(rule: Finding["rule"]): Set<string> {
  const out = new Set<string>();
  const strip = (v: string) => v.replace(/^(emag|wcag)[\s:-]*/i, "").trim();
  const add = (source: string, id: string) => {
    if (!id) return;
    if (source === "emag" || /^emag[\s:-]/i.test(id)) out.add(`emag-${strip(id)}`);
    else if (source === "wcag" || /^wcag[\s:-]/i.test(id)) out.add(`wcag-${strip(id)}`);
    else out.add(id);
  };
  add(rule.source, rule.id);
  if (typeof rule.wcag === "string" && rule.wcag) out.add(`wcag-${strip(rule.wcag)}`);
  const impl = (rule as { implements?: unknown }).implements;
  if (Array.isArray(impl)) for (const id of impl) if (typeof id === "string") add(id.startsWith("emag-") ? "emag" : id.startsWith("wcag-") ? "wcag" : "kb", id);
  return out;
}

export class ScanSession {
  private readonly scans: SessionScan[] = [];
  /** Índice chave → pendência (3.6.3: a mesma entrada sob a chave da rota e a do elemento). */
  private readonly pending = new Map<string, PendingEntry>();
  private readonly byId = new Map<string, PendingEntry>();
  private readonly hidden = new Map<string, HiddenEntry>();
  private counter = 0;
  /** Revisão M4: as pendências de leitura têm espaço de ids próprio (`L-NN`): não deslocam a numeração `P-NN`. */
  private usageCounter = 0;
  /** 3.7.6 (item 3): as pendências de observação com norma obrigatória têm espaço próprio (`O-NN`). */
  private observedCounter = 0;
  /** 3.7.6-pre.2: relógio lógico da sessão (entrega de `O-NN` × leitura por id) e o último instante de cada leitura por id. */
  private tick = 0;
  private readonly readByIdAt = new Map<string, number>();
  /** 3.6.1 (revisão H1): códigos cuja cláusula (texto) já saiu numa resposta desta sessão; repetições só com o id. */
  private readonly delivered = new Set<string>();
  /** 3.7.4 (D1): contextos da reserva de cláusulas entregues nesta sessão (chave do escopo → 1ª entrega e faixas). */
  private readonly contexts = new Map<string, { scanId: string; full: boolean; ranges: Array<{ start: number; end: number }> }>();
  /** 3.7.5 (item 6): ids da base devolvidos por get_ds_rules/get_component_spec/get_page_rules nesta sessão. */
  private readonly readIds = new Set<string>();
  /** 3.7.5 (R2): cláusulas da reserva cujo texto inteiro já saiu nesta sessão (id → scan da 1ª entrega). */
  private readonly reserveClauses = new Map<string, string>();
  /** 3.6.5 (item 4): assinatura de evidência → onde a família foi vista (scan, rota, estado). */
  private readonly sightings = new Map<string, FamilySighting[]>();
  /**
   * 3.6.6 (revisão da 3.6.6, BAIXA 2): cláusulas mensuráveis SERVIDAS no checklist sem pendingId à vista (não viraram
   * pendência, opção a) — por componente; saem quando forem registradas.
   */
  private readonly unregistered = new Map<string, Set<string>>();

  /** 3.6.5 (item 4): guarda as famílias de um scan (todas, não só as da página devolvida). */
  recordFamilies(scanId: string, route: string, fingerprint: string, families: Array<{ signature: string; familyId: string; locators: string[] }>): void {
    for (const f of families) {
      const list = this.sightings.get(f.signature) ?? [];
      if (!list.some((x) => x.scanId === scanId && x.familyId === f.familyId)) list.push({ scanId, route, fingerprint, familyId: f.familyId, locators: [...new Set(f.locators)] });
      this.sightings.set(f.signature, list);
    }
  }

  /**
   * 3.6.5 (D-155, item 4; rastreio dev-364 §1, B-23 p02): a mesma assinatura de evidência vista em OUTRA rota com outros
   * elementos (o conjunto de localizadores difere), ou na mesma rota noutro estado com outros elementos (nenhum em comum).
   * O mesmo conjunto de elementos noutra rota (layout compartilhado) e o mesmo elemento noutro estado da rota são o mesmo
   * fato (não entram). Um item por rota/estado, na ordem em que foram vistos.
   */
  alsoIn(signature: string, scanId: string, route: string, fingerprint: string, locators: string[], max = 2): { items: Array<{ route: string; scanId: string; familyId: string; [CROSS_ROUTE]: boolean }>; more: number } {
    const mine = new Set(locators);
    const seen = new Set<string>();
    const out: Array<{ route: string; scanId: string; familyId: string; [CROSS_ROUTE]: boolean }> = [];
    for (const x of this.sightings.get(signature) ?? []) {
      if (x.scanId === scanId) continue;
      // Revisão (MÉDIA 2): noutra rota, o MESMO conjunto de elementos (layout compartilhado: cabeçalho, regiões) é o
      // mesmo elemento — como a pendência da 3.6.3 — e não entra; só entra quando os elementos diferem.
      const sameSet = x.locators.length === mine.size && x.locators.every((l) => mine.has(l));
      const other = (x.route !== route && !sameSet) || (x.route === route && x.fingerprint !== fingerprint && !x.locators.some((l) => mine.has(l)));
      if (!other) continue;
      const key = `${x.route}|${x.fingerprint}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // 3.7.2 (revisão MÉDIA 4): outra rota pela rota INTEIRA (o rótulo curto pode colidir); marca fora do JSON (símbolo).
      out.push({ route: shortRoute(x.route), scanId: x.scanId, familyId: x.familyId, [CROSS_ROUTE]: x.route !== route });
    }
    return { items: out.slice(0, max), more: Math.max(0, out.length - max) };
  }

  textDelivered(code: string): boolean {
    return this.delivered.has(code);
  }

  /**
   * 3.7.4 (D1): contexto literal da reserva já entregue nesta sessão MCP — inteiro, ou as faixas pedidas cobertas pelas
   * janelas já entregues. Devolve o scanId da 1ª entrega (a referência que volta no lugar do texto).
   */
  contextDelivered(key: string, ranges?: Array<{ start: number; end: number }>): string | undefined {
    const seen = this.contexts.get(key);
    if (!seen) return undefined;
    if (seen.full) return seen.scanId;
    if (!ranges?.length) return undefined;
    return ranges.every((r) => seen.ranges.some((d) => d.start <= r.start && r.end <= d.end)) ? seen.scanId : undefined;
  }

  markContextDelivered(key: string, scanId: string, ranges: "full" | Array<{ start: number; end: number }>): void {
    const seen = this.contexts.get(key) ?? { scanId, full: false, ranges: [] };
    if (ranges === "full") seen.full = true;
    else seen.ranges.push(...ranges.map((r) => ({ start: r.start, end: r.end })));
    this.contexts.set(key, seen);
  }

  /** 3.7.5 (R2): o scan em que a cláusula da reserva saiu inteira nesta sessão; undefined = não saiu. */
  clauseDelivered(id: string): string | undefined {
    return this.reserveClauses.get(id);
  }

  markClauseDelivered(id: string, scanId: string): void {
    if (!this.reserveClauses.has(id)) this.reserveClauses.set(id, scanId);
  }

  markDelivered(code: string): void {
    this.delivered.add(code);
  }

  /** Scans anteriores (antes do registro do atual). */
  previousScans(): readonly SessionScan[] {
    return this.scans;
  }

  recordScan(scan: SessionScan): void {
    this.scans.push(scan);
  }

  /**
   * Outras rotas desta sessão com o MESMO `<title>` (comparação sem caixa, acento e espaço repetido).
   * Só scans em que o título foi lido (scan da página inteira).
   */
  sameTitleElsewhere(route: string, title: string, heading?: string | null): SessionScan[] {
    const t = fold(title);
    if (!t) return [];
    // 3.6.1 (revisão M4): só rotas de OUTRO modelo, com assunto principal exibido diferente do desta, e o título sem
    // nenhum dos dois assuntos. Sem assunto exibido numa das rotas, nada se compara.
    if (heading !== undefined) {
      const h = fold(heading ?? "");
      if (!h || t.includes(h)) return [];
    }
    const seen = new Set<string>();
    return this.scans.filter((s) => {
      if (s.route === route || s.title === null || fold(s.title) !== t || seen.has(s.route)) return false;
      if (heading !== undefined) {
        if (routeTemplateOf(s.route) === routeTemplateOf(route)) return false;
        const other = fold(s.heading ?? "");
        if (!other || other === fold(heading ?? "") || t.includes(other)) return false;
      }
      seen.add(s.route);
      return true;
    });
  }

  /** Quantas rotas e estados distintos a sessão já viu, contando o scan atual. */
  units(route: string, fingerprint: string): { routes: string[]; states: number } {
    const routes = [...new Set([...this.scans.map((s) => s.route), route])];
    const states = new Set([...this.scans.map((s) => s.fingerprint), fingerprint]).size;
    return { routes, states };
  }

  /**
   * Abre (ou reencontra) uma pendência. Uma pendência já resolvida não reabre: volta com o id e a resolução.
   *
   * 3.6.3 (D-155; rastreio dev-362-b-01 §4): a pendência de um ELEMENTO é chaveada por código + assunto + o(s)
   * localizador(es) que ela cita (+ o que já foi medido neles, quando há) — não pela rota. O mesmo componente que
   * reaparece em outra rota (o menu do avatar no cabeçalho, reaberto a cada rota) é a mesma pendência, com o mesmo id
   * (na 3.6.2 cada rota abria um id novo: P-05/P-10/P-14/P-18). A pendência do DOCUMENTO (sem localizador: título,
   * idioma, regiões) continua por rota — o título de cada rota é um item próprio. A rota nova entra em `routes`.
   * Na mesma rota, a chave de sempre (código + assunto + rota) continua valendo: o mesmo código com outros exemplos
   * depois de uma ação não abre id novo (reexecução 3.6.3: sem isso as sessões ganhavam ids, não perdiam).
   */
  registerPending(scanId: string, route: string, items: NotJudgedItem[], locatorsOf: (item: NotJudgedItem) => string[]): PendingEntry[] {
    return items.map((item) => {
      const locators = locatorsOf(item);
      const routeKey = `${item.code}|${item.subject}|${route}`;
      // 3.6.3 (revisão HIGH 2): só o conjunto INTEIRO de elementos (hash de todos os localizadores e medidas) com a mesma
      // contagem junta rotas; sem o conjunto inteiro conhecido (`elementSet` ausente), a pendência fica por rota.
      const elemKey = item.elementSet && locators.length ? `${item.code}|${item.subject}|#${item.count ?? ""}|${item.elementSet}` : null;
      const key = elemKey ?? routeKey;
      // A chave da rota primeiro (na mesma rota, o mesmo código é a mesma pendência, como na 3.6.2); depois o conjunto.
      let entry = this.pending.get(routeKey) ?? (elemKey ? this.pending.get(elemKey) : undefined);
      // 3.6.3 (revisão LOW 2): achada por qualquer chave, a entrada passa a responder pelas duas nesta rota.
      if (entry) {
        if (elemKey && !this.pending.has(elemKey)) this.pending.set(elemKey, entry);
        if (!this.pending.has(routeKey)) this.pending.set(routeKey, entry);
      }
      if (!entry) {
        // 3.7.6 (item 3): `O-NN` em espaço próprio — os `P-NN` de sempre não mudam.
        const id = item.idSpace === "O"
          ? `O-${String(++this.observedCounter).padStart(2, "0")}`
          : `P-${String(++this.counter).padStart(2, "0")}`;
        entry = {
          id,
          key,
          code: item.code,
          subject: item.subject,
          route,
          routes: [],
          slots: [],
          scans: [],
          norms: [...(item.norms ?? [])],
          ...(item.rule ? { rule: item.rule } : {}),
          locators: [],
          low: item.signal === "low",
          ...(item.elementBound ? { elementBound: true } : {}),
          ...(item.resolveRequires ? { requires: item.resolveRequires } : {}),
          ...(item.resolveByRead?.length ? { readIds: [...item.resolveByRead] } : {}),
          ...(item.stateByClick ? { stateByClick: true } : {}),
          status: "open",
        };
        this.pending.set(routeKey, entry);
        if (elemKey) this.pending.set(elemKey, entry);
        this.byId.set(entry.id, entry);
      }
      if (!entry.routes.includes(route)) entry.routes.push(route);
      let slot = slotOf(entry, route);
      if (!slot) {
        // Rota nova: abre aberta, mesmo que outra rota da mesma pendência já esteja resolvida.
        slot = { route, status: "open", locators: [], scans: [] };
        entry.slots.push(slot);
        entry.status = "open";
      }
      if (!slot.scans.includes(scanId)) slot.scans.push(scanId);
      if (!entry.scans.includes(scanId)) entry.scans.push(scanId);
      for (const l of locators) {
        if (!slot.locators.includes(l)) slot.locators.push(l);
        if (!entry.locators.includes(l)) entry.locators.push(l);
      }
      return entry;
    });
  }

  /**
   * 3.6.5 (D-155, item 5; rastreio dev-364 §2, A-11 p01): cláusulas obrigatórias e mensuráveis de um componente,
   * lidas na lista de verificação, que nenhum check mede — viram pendências da sessão, uma por cláusula, nas rotas em
   * que o componente foi encontrado, com a mesma mecânica das outras (verify_finding citando a cláusula, ou
   * pendingResolved). Código `checklist:<componente>`: o sessionPending as põe no sub-bloco `checklist`, por componente
   * (contagem e ids; o texto está na página do checklist que as serviu). Revisão: só entram as cláusulas SERVIDAS numa
   * página do checklist (quem chama decide), e nada marca o código como "texto entregue". Uma cláusula já aberta só ganha
   * as rotas novas. Devolve cláusula → id.
   */
  registerClauses(component: string, routes: string[], clauses: Array<{ id: string; force: string; text: string }>): Record<string, string> {
    const code = `${CHECKLIST_CODE_PREFIX}${component}`;
    const out: Record<string, string> = {};
    for (const clause of clauses) {
      const key = `clause|${component}|${clause.id}`;
      let entry = this.pending.get(key);
      if (!entry) {
        this.counter += 1;
        entry = {
          id: `P-${String(this.counter).padStart(2, "0")}`,
          key,
          code,
          subject: clause.id,
          route: routes[0],
          routes: [],
          slots: [],
          scans: [],
          norms: [clause.id],
          rule: { id: clause.id, force: clause.force, text: clause.text },
          locators: [],
          low: false,
          status: "open",
        };
        this.pending.set(key, entry);
        this.byId.set(entry.id, entry);
      }
      for (const route of routes) {
        if (!entry.routes.includes(route)) entry.routes.push(route);
        if (!slotOf(entry, route)) {
          entry.slots.push({ route, status: "open", locators: [], scans: [] });
          entry.status = "open";
        }
      }
      out[clause.id] = entry.id;
    }
    return out;
  }

  /**
   * 3.7.5 (item 6): abre (ou reencontra) a pendência de leitura das cláusulas de uso/juízo do componente — uma por
   * componente na sessão, com a rota nova acrescentada. A leitura vale para a sessão inteira: rota nova de uma pendência já
   * lida entra resolvida; leitura feita antes do scan fecha na hora.
   */
  registerUsage(component: string, route: string, scanId: string, ids: string[]): PendingEntry {
    const key = `usage|${component}`;
    let entry = this.pending.get(key);
    if (!entry) {
      this.usageCounter += 1;
      entry = {
        id: `L-${String(this.usageCounter).padStart(2, "0")}`,
        key,
        code: USAGE_CODE,
        subject: component,
        route,
        routes: [],
        slots: [],
        scans: [],
        norms: [],
        locators: [],
        low: false,
        usage: { component, ids: [...ids] },
        status: "open",
      };
      this.pending.set(key, entry);
      this.byId.set(entry.id, entry);
    }
    if (!entry.routes.includes(route)) entry.routes.push(route);
    let slot = slotOf(entry, route);
    if (!slot) {
      slot = entry.status === "resolved" && entry.resolution
        ? { route, status: "resolved", resolution: entry.resolution, locators: [], scans: [] }
        : { route, status: "open", locators: [], scans: [] };
      entry.slots.push(slot);
    }
    if (!slot.scans.includes(scanId)) slot.scans.push(scanId);
    if (!entry.scans.includes(scanId)) entry.scans.push(scanId);
    this.closeRead(entry);
    return entry;
  }

  /** 3.7.5 (item 6): todas as cláusulas de uso do componente já foram devolvidas por uma ferramenta nesta sessão. */
  usageRead(entry: PendingEntry): boolean {
    return Boolean(entry.usage) && entry.usage!.ids.every((id) => this.readIds.has(id));
  }

  private closeRead(entry: PendingEntry): boolean {
    if (!entry.usage || entry.status !== "open" || !this.usageRead(entry)) return false;
    const resolution: PendingResolution = { by: "usage-read" };
    for (const slot of entry.slots) if (slot.status === "open") resolveSlot(entry, slot, resolution);
    return true;
  }

  /**
   * 3.7.5 (item 6): os ids da base que uma resposta de leitura (get_ds_rules, get_component_spec, get_page_rules) devolveu;
   * fecha as pendências de leitura cujo conjunto inteiro já foi visto. Devolve os ids das pendências fechadas.
   */
  noteRead(ids: Iterable<string>): string[] {
    for (const id of ids) this.readIds.add(id);
    const closed: string[] = [];
    for (const entry of this.byId.values()) if (this.closeRead(entry)) closed.push(entry.id);
    return closed;
  }

  /**
   * 3.7.6-pre.2 (revisão MED): as pendências `O-NN` que uma resposta de scan entregou (o id aparece nela) ganham o instante
   * da entrega — só uma leitura POR ID posterior a ele as fecha.
   */
  markObservedDelivered(ids: Iterable<string>): void {
    const shown = new Set(ids);
    for (const entry of this.byId.values()) {
      if (!entry.readIds?.length || entry.deliveredTick !== undefined || !shown.has(entry.id)) continue;
      entry.deliveredTick = ++this.tick;
    }
  }

  /** 3.7.6-pre.2: as pendências `O-NN` abertas desta sessão (ids), para conferir quais uma resposta entregou. */
  observedIds(): string[] {
    return [...this.byId.values()].filter((e) => e.readIds?.length).map((e) => e.id);
  }

  /**
   * 3.7.6-pre.2 (revisão MED): normas devolvidas por uma leitura POR ID (get_ds_rules ids/id). Fecha as pendências `O-NN`
   * entregues ANTES desta leitura cujas normas foram todas lidas por id depois da entrega. Busca (query) não entra aqui.
   */
  noteReadById(ids: Iterable<string>): string[] {
    const at = ++this.tick;
    for (const id of ids) this.readByIdAt.set(id, at);
    const closed: string[] = [];
    const resolution: PendingResolution = { by: "rule-read" };
    for (const entry of this.byId.values()) {
      if (!entry.readIds?.length || entry.status !== "open" || entry.deliveredTick === undefined) continue;
      if (!entry.readIds.every((id) => (this.readByIdAt.get(id) ?? -1) > entry.deliveredTick!)) continue;
      for (const slot of entry.slots) if (slot.status === "open") resolveSlot(entry, slot, resolution);
      closed.push(entry.id);
    }
    return closed;
  }

  /** 3.6.6: guarda as cláusulas servidas sem pendingId (as já registradas não contam). */
  noteUnregistered(component: string, clauseIds: string[]): void {
    const registered = this.clauseIds(component);
    const set = this.unregistered.get(component) ?? new Set<string>();
    for (const id of clauseIds) if (!registered[id]) set.add(id);
    if (set.size) this.unregistered.set(component, set);
  }

  /** 3.6.6: quantas cláusulas servidas sem pendingId cada componente tem (as registradas depois saem). */
  unregisteredCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [component, set] of this.unregistered) {
      const registered = this.clauseIds(component);
      const n = [...set].filter((id) => !registered[id]).length;
      if (n) out[component] = n;
    }
    return out;
  }

  /** 3.6.5 (revisão): as cláusulas já registradas de um componente (citeAs → id). */
  clauseIds(component: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.byId.values()) if (e.code === `${CHECKLIST_CODE_PREFIX}${component}`) out[e.subject] = e.id;
    return out;
  }

  /**
   * 3.6.5 (revisão): ids para montar a página antes de registrar — os já registrados, e um provisório da largura do maior
   * id que o registro poderia dar (o pendingId conta no orçamento da página).
   */
  clauseIdsPreview(component: string, clauseIds: string[]): Record<string, string> {
    const known = this.clauseIds(component);
    const fresh = clauseIds.filter((id) => !known[id]);
    const widest = `P-${String(this.counter + fresh.length).padStart(2, "0")}`;
    return { ...Object.fromEntries(fresh.map((id) => [id, widest])), ...known };
  }

  open(): PendingEntry[] {
    // 3.6.3: `pending` indexa a mesma entrada por rota e por elemento; a lista sai de byId (uma vez cada, na ordem dos ids).
    return [...this.byId.values()].filter((e) => e.status === "open");
  }

  /**
   * verify_finding sobre uma norma da pendência resolve a pendência — qualquer veredito: o agente mediu e decidiu.
   * 3.6.1 (revisão M2): vale na mesma rota (qualquer elemento: o localizador do axe e o do agente raramente
   * coincidem) ou, em outra rota, no mesmo elemento (o mesmo cabeçalho em todas as rotas).
   * 3.6.3 (revisão HIGH 1): resolve só a ROTA do achado — a mesma pendência noutra rota continua aberta. Fora das rotas
   * dela, só fecha a rota cuja pendência é exatamente esse elemento (um localizador só, o mesmo). Devolve rótulos
   * (`P-NN` ou `P-NN@/rota`).
   */
  resolveByVerify(finding: Finding, verificationId: string, verdict: string, measured?: { live: boolean; reached: boolean; actions: number }): string[] {
    return this.resolveByVerifyDetailed(finding, verificationId, verdict, measured).resolved;
  }

  /**
   * 3.7.4 (D2; teste à mão da 3.7.3): a pendência de elementos (`elementBound`) presa a N elementos só fecha a rota quando
   * cada um deles foi decidido por um verify_finding; o verify de um só registra a decisão dele e devolve o item em
   * `partial` (mesmo pendingId, com os elementos que faltam). As demais pendências seguem como antes (qualquer verify
   * na rota com a norma fecha).
   */
  resolveByVerifyDetailed(finding: Finding, verificationId: string, verdict: string, measured?: { live: boolean; reached: boolean; actions: number; decision?: string | null }): { resolved: string[]; partial: PendingPartial[] } {
    const partial: PendingPartial[] = [];
    const route = routeKeyOf(finding.element.page);
    const cited = citedNorms(finding.rule);
    const resolved: string[] = [];
    const resolution: PendingResolution = { by: "verify_finding", ref: verificationId, status: verdict };
    for (const entry of this.open()) {
      if (!entry.norms.some((n) => cited.has(n))) continue;
      // 3.7.6-pre.2 (revisão MED): a pendência de observação só fecha por verify que DECIDE o elemento (confirmed/rejected);
      // 3.7.7 (D-32): ou que o MEDE (`measured`, a escala: o oráculo mede e o agente julga).
      // 3.7.7 (revisão MED-3): a decisão vem de quem chama (o predicado decidiu ou mediu); sem ela, vale o veredito.
      const decision = measured && "decision" in measured ? measured.decision : verdict;
      if (entry.readIds?.length && decision !== "confirmed" && decision !== "rejected" && decision !== "measured") continue;
      // 3.7.3 A8 (revisão MED 2): "não verificado depois de alternar" não fecha por verify no estado não alternado.
      if (entry.requires) {
        const condition = (finding.evidence.data as Record<string, unknown> | undefined)?.expectedCondition;
        if (!measured?.live || !measured.reached || measured.actions < 1 || condition !== entry.requires.expectedCondition) continue;
      }
      const here = slotOf(entry, route);
      // 3.7.2 (revisão HIGH 1): pendência de elementos que compartilha a norma com achados de outros elementos — só o verify
      // num dos elementos dela a fecha (nesta rota; noutra, o slot que tem esse mesmo elemento).
      const targets = entry.elementBound
        ? (here ? [here] : entry.slots).filter((x) => x.status === "open" && x.locators.includes(finding.element.locator))
        : here
          ? here.status === "open" ? [here] : []
          : entry.slots.filter((x) => x.status === "open" && x.locators.length === 1 && x.locators[0] === finding.element.locator);
      for (const slot of targets) {
        if (entry.elementBound) {
          slot.decided = [...new Set([...(slot.decided ?? []), finding.element.locator])];
          const remaining = slotRemaining(slot);
          if (remaining.length) {
            partial.push({ id: slotLabel(entry, slot.route), decided: [...slot.decided], remaining });
            continue;
          }
        }
        // 3.7.7: na O-NN, o estado da resolução é a decisão (confirmed/rejected/measured), não o veredito do envelope.
        resolveSlot(entry, slot, entry.readIds?.length && decision ? { ...resolution, status: decision } : resolution);
        resolved.push(slotLabel(entry, slot.route));
      }
    }
    return { resolved, partial };
  }

  /**
   * 3.7.8 (N5): a pendência `state-unscanned` desta rota fecha quando um scan da sessão mediu o estado aberto — o controle
   * aparece aberto no estado escaneado (aria-expanded=true, aba selecionada, details aberto, conteúdo controlado visível)
   * ou a receita alcançada clicou nele. Uma instância basta para o padrão. Devolve os ids fechados.
   */
  /**
   * 3.7.9 (teste à mão da 3.7.8, D2/D3): por rota, os controles vistos ABERTOS num scan e com quais checks esse scan rodou.
   * Um estado já escaneado não vira pendência nova (nasce fechado), e só fecha o scan que rodou pelo menos os checks do scan
   * que abriu a pendência.
   */
  private readonly openSeen = new Map<string, Map<string, Set<string>>>();
  /**
   * 3.7.10 (D5): por rota + estado (fingerprint), os checks já rodados com escopo INTEIRO nesta sessão (check → o 1º scan
   * que o rodou assim). Só conta o equivalente: página inteira (sem selectors), structure sem components restritos, tokens
   * com o conjunto inteiro de tokenChecks — na dúvida, não conta.
   */
  private readonly checksOnState = new Map<string, Map<string, string>>();

  /** Acumula os checks de escopo inteiro deste scan no estado e devolve a união da sessão (check → scanId). */
  checksRunOnState(route: string, fingerprint: string, scanId: string, fullScopeChecks: string[]): Record<string, string> {
    const key = `${route}|${fingerprint}`;
    const map = this.checksOnState.get(key) ?? new Map<string, string>();
    for (const c of fullScopeChecks) if (!map.has(c)) map.set(c, scanId);
    this.checksOnState.set(key, map);
    return Object.fromEntries(map);
  }

  resolveStatesSeen(route: string, opened: string[], scanId: string, clicked: string[] = [], checks: string[] = []): { closed: string[]; incomplete: Array<{ id: string; missing: string[] }> } {
    // revisão MED 5a: fecha o que o estado ESCANEADO mostra aberto (o conteúdo aparece); o clique só vale para o estado
    // sem chegada verificável (sem alvo nem aria-expanded) — clicar duas vezes (fechar de novo) não fecha nada.
    const ran = new Set(checks);
    const seenHere = this.openSeen.get(route) ?? new Map<string, Set<string>>();
    for (const sel of opened) seenHere.set(sel, new Set([...(seenHere.get(sel) ?? []), ...ran]));
    this.openSeen.set(route, seenHere);
    const seen = new Set(opened);
    const byClick = new Set(clicked);
    const closed: string[] = [];
    const incomplete: Array<{ id: string; missing: string[] }> = [];
    if (!seen.size && !byClick.size) return { closed, incomplete };
    for (const entry of this.open()) {
      if (entry.code !== STATE_CODE) continue;
      const slot = slotOf(entry, route);
      if (!slot || slot.status !== "open") continue;
      if (!slot.locators.some((l) => seen.has(l) || (entry.stateByClick && byClick.has(l)))) continue;
      // D3: o scan parcial (checks a menos que o do scan que abriu a pendência) não fecha: diz o que falta
      const missing = (entry.stateChecks ?? []).filter((c) => !ran.has(c));
      if (missing.length) {
        incomplete.push({ id: slotLabel(entry, route), missing });
        continue;
      }
      resolveSlot(entry, slot, { by: "state-scanned", ref: scanId });
      closed.push(slotLabel(entry, route));
    }
    return { closed, incomplete };
  }

  /**
   * 3.7.9 (D2): depois do registro, a pendência de estado cujo controle já foi visto ABERTO nesta rota (por um scan com pelo
   * menos os checks dela) nasce fechada. Também guarda, uma vez, os checks do scan que abriu a pendência (D3).
   */
  settleStates(route: string, ids: string[], checks: string[], scanId: string): string[] {
    const seenHere = this.openSeen.get(route);
    const closed: string[] = [];
    for (const id of ids) {
      const entry = this.byId.get(id);
      if (!entry || entry.code !== STATE_CODE) continue;
      if (!entry.stateChecks) entry.stateChecks = [...checks];
      const slot = slotOf(entry, route);
      if (!seenHere || !slot || slot.status !== "open") continue;
      const covered = slot.locators.some((l) => {
        const ran = seenHere.get(l);
        return ran && (entry.stateChecks ?? []).every((c) => ran.has(c));
      });
      if (!covered) continue;
      resolveSlot(entry, slot, { by: "state-scanned", ref: scanId });
      closed.push(entry.id);
    }
    return closed;
  }

  /** 3.6.3: as rotas ainda abertas das pendências citadas (rótulos `P-NN@/rota`). */
  stillOpen(labels: string[]): string[] {
    const ids = new Set(labels.map((l) => l.split("@")[0]));
    return [...ids].flatMap((id) => {
      const entry = this.byId.get(id);
      return entry ? entry.slots.filter((x) => x.status === "open").map((x) => `${entry.id}@${routeLabel(x.route)}`) : [];
    });
  }

  /**
   * Resolução declarada pelo agente (pendingResolved do scan_page). 3.6.1 (revisão M3): "conforme" e "não se aplica"
   * exigem `reason` (sem ela a pendência continua aberta); "violada" fecha a pendência e volta como instrução de
   * registrar o achado, com a cláusula a citar — nunca em silêncio.
   */
  resolveExplicit(list: Array<{ id: string; status: string; reason?: string }>, currentRoute?: string) {
    const resolved: string[] = [];
    const unknown: string[] = [];
    const needsReason: string[] = [];
    const recordAsFinding: Array<{ id: string; code: string; route: string; cite: string | null; norms: string[] }> = [];
    const partialVerify: Array<{ id: string; verified: string[]; verifiedCount: number; declared: string[]; declaredCount: number }> = [];
    const usageUnread: string[] = [];
    const readOrVerify: string[] = [];
    const stateScanOnly: string[] = [];
    for (const r of list) {
      const entry = this.byId.get(r.id);
      if (!entry) {
        unknown.push(r.id.slice(0, 20));
        continue;
      }
      // 3.7.5 (item 6): a pendência de leitura fecha só pela leitura que passa pelo servidor, nunca por declaração.
      if (entry.usage) {
        if (entry.status === "open") usageUnread.push(`${entry.id}:${entry.usage.component}`);
        continue;
      }
      // revisão 3.7.8 (MED 5c): estado recolhido não "viola" nem é "conforme" — fecha escaneando o estado, ou "não se aplica"
      // com reason.
      if (entry.code === STATE_CODE && r.status !== "não se aplica") {
        if (entry.status === "open") stateScanOnly.push(entry.id);
        continue;
      }
      // 3.7.6 (item 3): a pendência de observação com norma obrigatória fecha medindo (verify) ou lendo a norma.
      if (entry.readIds?.length) {
        if (entry.status === "open") readOrVerify.push(entry.id);
        continue;
      }
      if (r.status !== "violada" && !r.reason?.trim()) {
        needsReason.push(entry.id);
        continue;
      }
      // 3.6.3 (revisão HIGH 1): na rota deste scan, só ela; o id de outra rota (sessionPending), as rotas abertas dele.
      const resolution: PendingResolution = { by: "pendingResolved", status: r.status, ...(r.reason ? { reason: r.reason.slice(0, 200) } : {}) };
      const here = currentRoute ? slotOf(entry, currentRoute) : undefined;
      const targets = here ? [here] : entry.slots.filter((x) => x.status === "open");
      for (const slot of targets) {
        // 3.7.4 (D2): a declaração vale para o item inteiro; se um verify decidiu só parte dos elementos, diz qual parte.
        if (slot.status === "open" && slot.decided?.length) {
          const declared = slotRemaining(slot);
          partialVerify.push({ id: slotLabel(entry, slot.route), verified: slot.decided.slice(0, 3).map((l) => clip(l, 120)), verifiedCount: slot.decided.length,
            declared: declared.slice(0, 3).map((l) => clip(l, 120)), declaredCount: declared.length });
        }
        resolveSlot(entry, slot, resolution);
        resolved.push(slotLabel(entry, slot.route));
      }
      if (r.status === "violada") {
        recordAsFinding.push({ id: entry.id, code: entry.code, route: routeLabel(entry.route), cite: entry.rule?.id ?? entry.norms[0] ?? null, norms: entry.norms.slice(0, 3) });
      }
    }
    const open = this.stillOpen(resolved);
    return {
      resolved,
      ...(open.length ? { stillOpen: open, stillOpenNote: "A mesma pendência continua aberta nestas rotas: cada rota se resolve medindo nela." } : {}),
      ...(unknown.length ? { unknown } : {}),
      ...(needsReason.length ? { needsReason, needsReasonNote: "'conforme' e 'não se aplica' exigem reason (o que você mediu): estas continuam abertas." } : {}),
      ...(recordAsFinding.length
        ? { recordAsFinding, recordNote: "Violada: registre cada uma como achado na sua inspeção, citando cite (cláusula obrigatória), e submeta-o a verify_finding." }
        : {}),
      ...(partialVerify.length
        ? { partialVerify, partialVerifyNote: "verify_finding decidiu só os elementos em verified; os de declared fecharam pela sua declaração (status/reason), não por medida." }
        : {}),
      ...(readOrVerify.length
        ? { readOrVerify, readOrVerifyNote: "Pendência de observação com norma obrigatória: não fecha por declaração. Fecha com verify_finding que decide cada elemento citando a norma, ou lendo a norma por id (get_ds_rules{ids}) depois de recebê-la." }
        : {}),
      ...(stateScanOnly.length
        ? { stateScanOnly, stateScanOnlyNote: "state-unscanned fecha escaneando o estado aberto (recipe) ou com status 'não se aplica' e reason; 'violada'/'conforme' não se aplicam a um estado." }
        : {}),
      ...(usageUnread.length
        ? { usageUnread, usageUnreadNote: "usage-unread não fecha por declaração: continua aberta até o servidor ver devolvidas todas as cláusulas do componente (get_ds_rules{ids} da observação de leitura do scan)." }
        : {}),
    };
  }

  /** Guarda os elementos de estilo autoral que estavam ocultos neste scan (observações `hiddenInState` de tokens). */
  recordHidden(scanId: string, url: string, observations: Observation[]): void {
    const pageKey = scanPageKey(url);
    if (!pageKey) return;
    observations.forEach((o, i) => {
      const data = (o.data ?? {}) as { hiddenInState?: boolean; rule?: { checker?: string; id?: string } };
      const checker = data.rule?.checker ?? data.rule?.id ?? "";
      if (o.kind !== "outside-page-authorship" || data.hiddenInState !== true || !checker.startsWith("ds-token-")) return;
      const key = `${pageKey}|${o.element.locator}|${checker}`;
      if (!this.hidden.has(key)) this.hidden.set(key, { scanId, n: i + 1, pageKey, locator: o.element.locator, checker });
    });
  }

  /** Elementos ocultos em scans anteriores desta página (mesma origem + caminho + query). */
  hiddenFor(url: string, limit = 20): HiddenEntry[] {
    const pageKey = scanPageKey(url);
    return [...this.hidden.values()].filter((h) => h.pageKey === pageKey).slice(0, limit);
  }

  /** O elemento foi medido visível: sai da lista (a medida dele está no scan que o mediu). */
  forgetHidden(entry: HiddenEntry): void {
    this.hidden.delete(`${entry.pageKey}|${entry.locator}|${entry.checker}`);
  }
}

/** 3.6.1 (item 6): texto genérico da separação por rota/estado. */
export const UNITS_NOTE =
  "Rotas/estados diferentes = achados separados: um cartão por rota/estado, com o scanId do seu; não junte membros de rotas/estados diferentes.";


/**
 * Bloco `sessionPending`: as pendências abertas da sessão que NÃO estão no `checksRun.pageLevel` deste scan.
 * 3.6.1 (revisão M1/H1): uma entrada por código (rotas contadas, até 3 ids); a cláusula com texto só enquanto o
 * código não teve o texto entregue nesta sessão (depois, só o id); as sem sinal medido (idioma, regiões) só contadas.
 */
export function sessionPendingBlock(
  open: PendingEntry[],
  currentIds: Set<string>,
  delivered: (code: string) => boolean,
  withText: boolean,
  currentRoute?: string,
  /** 3.6.6 (BAIXA 2): cláusulas servidas no checklist sem pendingId, por componente (ScanSession.unregisteredCounts). */
  unregistered: Record<string, number> = {},
  /** 3.7.5-pre.2: onde estão os ids das pendências de leitura (a observação de leitura deste scan, no ledger). */
  usageNext?: unknown,
) {
  // 3.6.3 (revisão HIGH 1): por rota — a pendência deste scan conta aqui só pelas OUTRAS rotas em que segue aberta.
  // 3.7.5 (item 6): a pendência de leitura é da sessão, não da rota — se está nesta página, não volta como de outra rota.
  const openSlots = (e: PendingEntry) => e.usage && currentIds.has(e.id) ? []
    : e.slots.filter((x) => x.status === "open" && !(currentIds.has(e.id) && (currentRoute === undefined || x.route === currentRoute)));
  const others = open.filter((e) => openSlots(e).length > 0);
  const unregisteredComponents = Object.keys(unregistered).filter((c) => unregistered[c] > 0);
  if (!others.length && !unregisteredComponents.length) return undefined;
  // 3.6.3 (revisão HIGH 1, custo): o id sozinho quando a pendência segue aberta em todas as suas rotas e não é desta página;
  // senão `P-NN×n` = aberta em n outras rotas (quais: `openOn`, que sai primeiro no teto). Rótulos de rota inteiros
  // custavam ~80 caracteres cada (caminhos com uuid) e tiravam famílias da 1ª página.
  const label = (e: PendingEntry) => {
    const slots = openSlots(e);
    return slots.length === e.slots.length && !currentIds.has(e.id) ? e.id : `${e.id}×${slots.length}`;
  };
  const low = others.filter((e) => e.low).length;
  // 3.6.5 (revisão, item 5/BAIXA 7): as cláusulas lidas no checklist ficam num sub-bloco próprio, por componente (contagem
  // e ids), sem a cláusula da 1ª fingindo ser de todas; encolhe à contagem pela escada (sessionPendingChecklistCount).
  const isClause = (e: PendingEntry) => e.code.startsWith(CHECKLIST_CODE_PREFIX);
  const clauses = others.filter((e) => !e.low && isClause(e));
  const byComponent = new Map<string, PendingEntry[]>();
  for (const e of clauses) {
    const component = e.code.slice(CHECKLIST_CODE_PREFIX.length);
    byComponent.set(component, [...(byComponent.get(component) ?? []), e]);
  }
  // 3.6.6 (BAIXA 2): o componente com cláusulas servidas sem pendingId entra com `unregistered` (mesmo sem pendência aberta).
  for (const component of unregisteredComponents) if (!byComponent.has(component)) byComponent.set(component, []);
  const checklist = byComponent.size
    ? {
        note:
          "Cláusulas obrigatórias lidas em get_component_spec (checklist), ainda sem estado: verify_finding citando a cláusula, ou scan_page pendingResolved [{id, status, reason}]." +
          (unregisteredComponents.length ? " unregistered = servidas sem pendingId (não são pendência): dê estado a cada uma no relatório." : ""),
        count: clauses.length,
        components: [...byComponent.entries()].map(([component, entries]) => {
          const labels = entries.map(label);
          return {
            component,
            count: entries.length,
            ids: labels.slice(0, 3),
            ...(labels.length > 3 ? { more: labels.length - 3 } : {}),
            ...(unregistered[component] ? { unregistered: unregistered[component] } : {}),
          };
        }),
      }
    : undefined;
  const byCode = new Map<string, PendingEntry[]>();
  for (const e of others.filter((x) => !x.low && !isClause(x))) byCode.set(e.code, [...(byCode.get(e.code) ?? []), e]);
  const items = [...byCode.entries()].map(([code, entries]) => {
    // Revisão M3: as pendências de leitura são UMA entrada — os ids em faixa (como a linha compacta) e os componentes na
    // mesma ordem, e onde ler os ids.
    if (code === USAGE_CODE) {
      const sorted = [...entries].sort((x, y) => Number(x.id.slice(2)) - Number(y.id.slice(2)));
      return { code, ids: [pendingIdsLabel(sorted.map((e) => e.id))], components: sorted.map((e) => e.subject), ...(usageNext ? { next: usageNext } : {}) };
    }
    const rule = entries[0].rule;
    // 3.7.9 (D1): estado recolhido e campo de arquivo levam o 1º seletor no rótulo (`P-07@#gatilho`).
    const located = code === STATE_CODE || code === "upload-paths";
    const labels = entries.map((e) => (located && e.locators[0] ? `${label(e)}@${clip(e.locators[0], 60)}` : label(e)));
    const partial = entries.filter((e) => label(e).includes("×")).slice(0, 3);
    const halfDone = entries.flatMap((e) => openSlots(e).filter((x) => x.decided?.length).map((x) => [label(e), slotRemaining(x).slice(0, 3).map((l) => clip(l, 60))] as const));
    return {
      code,
      routes: new Set(entries.flatMap((e) => openSlots(e).map((x) => x.route))).size,
      ids: labels.slice(0, 3),
      ...(labels.length > 3 ? { more: labels.length - 3 } : {}),
      ...(partial.length ? { openOn: Object.fromEntries(partial.map((e) => [e.id, openSlots(e).slice(0, 3).map((x) => shortRoute(x.route))])) } : {}),
      // 3.7.4 (D2): verificada em parte — os elementos que faltam decidir (até 3 por pendência).
      ...(halfDone.length ? { remaining: Object.fromEntries(halfDone.slice(0, 3)) } : {}),
      ...(rule ? { rule: withText && !delivered(code) ? { id: rule.id, force: rule.force, text: clip(rule.text, 100) } : { id: rule.id } } : { norms: entries[0].norms.slice(0, 2) }),
    };
  });
  return {
    ...(items.length || low
      ? {
          note: withText
            ? "Pendências abertas de outras rotas/estados (cada id é um item próprio): resolva medindo (verify_finding com uma das normas) ou em scan_page pendingResolved [{id, status, reason}]."
            : "Pendências abertas de outras rotas/estados (cada id é um item próprio): resolva medindo (verify_finding com o critério em norms).",
        }
      : {}),
    // Revisão M3: as pendências de leitura contam como a UMA entrada que são aqui.
    count: others.filter((e) => e.code !== USAGE_CODE).length + (others.some((e) => e.code === USAGE_CODE) ? 1 : 0),
    items,
    ...(low ? { lowSignal: low } : {}),
    ...(checklist ? { checklist } : {}),
  };
}

/** 3.6.5: código das pendências de cláusula lida no checklist (`checklist:<componente>`). */
export const CHECKLIST_CODE_PREFIX = "checklist:";

/**
 * O sub-bloco `checklist` de sessionPending nas três formas da escada: inteiro (`components` com contagem e ids), ids
 * (`byComponent` + `ids`) e contagem (o total, um número).
 */
type ChecklistBlock = {
  count?: number;
  components?: Array<{ component: string; count: number; ids?: string[]; unregistered?: number }>;
  byComponent?: Record<string, number>;
  ids?: string[];
  unregistered?: Record<string, number>;
};

/** 3.6.6 (BAIXA 2): o contador `unregistered` por componente, em qualquer forma do sub-bloco. */
function unregisteredOf(block: ChecklistBlock): Record<string, number> {
  if (isFull(block)) return Object.fromEntries(block.components!.filter((c) => c.unregistered).map((c) => [c.component, c.unregistered!]));
  return block.unregistered ?? {};
}

const isFull = (b: ChecklistBlock) => Array.isArray(b.components);
const isIds = (b: ChecklistBlock) => !isFull(b) && Array.isArray(b.ids);

/** 3.6.5 (revisão): o sub-bloco de checklist → contagem por componente + os ids (sem textos nem notas). */
function checklistIds(block: ChecklistBlock | undefined): ChecklistBlock | Record<string, number> | undefined {
  if (!block || !isFull(block)) return block;
  const components = block.components!;
  const unregistered = unregisteredOf(block);
  return {
    byComponent: Object.fromEntries(components.map((c) => [c.component, c.count])),
    ids: components.flatMap((c) => (c.ids ?? []).map((id) => `${id}:${c.component}`)),
    ...(Object.keys(unregistered).length ? { unregistered } : {}),
  };
}

/** 3.6.5 (revisão; reexecução): o sub-bloco de checklist → a contagem total (o que ele tem, pelo checklist de cada componente). */
export function sessionPendingChecklistCount<T extends { checklist?: unknown }>(block: T): T | null {
  const c = block.checklist as ChecklistBlock | undefined;
  if (!c || typeof c !== "object" || (!isFull(c) && !isIds(c))) return null;
  const total = isFull(c) ? c.components!.reduce((n, x) => n + x.count, 0) : Object.values(c.byComponent ?? {}).reduce((n, x) => n + x, 0);
  // 3.6.6 (BAIXA 2): na forma de contagem, o contador sem id fica ao lado, por componente (sai com o sub-bloco, na escada dos extras).
  const unregistered = unregisteredOf(c);
  return { ...block, checklist: total, ...(Object.keys(unregistered).length ? { checklistUnregistered: unregistered } : {}) };
}

/** Encolhimento do teto: sem textos; depois só ids. */
export function sessionPendingCodes(block: { items?: Array<{ code: string; ids: string[]; remaining?: Record<string, readonly string[]> }>; count?: number; lowSignal?: number; checklist?: ChecklistBlock }) {
  const checklist = checklistIds(block.checklist);
  // 3.7.9 (D1): `P-07:state-unscanned@#gatilho` (o seletor depois do código)
  const ids = (block.items ?? []).flatMap((i) => i.ids.map((id) => (id.includes("@") ? `${id.slice(0, id.indexOf("@"))}:${i.code}${id.slice(id.indexOf("@"))}` : `${id}:${i.code}`)));
  // 3.7.4 (D2): verificada em parte — os elementos que faltam ficam também na forma de ids.
  const remaining = Object.assign({}, ...(block.items ?? []).map((i) => i.remaining ?? {})) as Record<string, readonly string[]>;
  return {
    count: block.count ?? 0,
    ...(ids.length || !checklist ? { ids } : {}),
    ...(Object.keys(remaining).length ? { remaining } : {}),
    ...(block.lowSignal ? { lowSignal: block.lowSignal } : {}),
    ...(checklist ? { checklist } : {}),
  };
}
