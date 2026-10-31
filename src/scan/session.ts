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
import type { NotJudgedItem } from "./notJudged.js";
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

export interface PendingRule {
  id: string;
  force: string;
  text: string;
}

export interface PendingEntry {
  id: string;
  key: string;
  code: string;
  subject: string;
  route: string;
  scans: string[];
  norms: string[];
  rule?: PendingRule;
  /** Elementos citados pela pendência (campos, tabelas, nós); vazio = pendência do documento. */
  locators: string[];
  /** 3.6.1 (revisão M1): pendência sem sinal medido (idioma, regiões) — em sessionPending só como contagem. */
  low: boolean;
  status: "open" | "resolved";
  resolution?: { by: "verify_finding" | "pendingResolved"; status?: string; ref?: string; reason?: string };
}

export interface SessionScan {
  scanId: string;
  route: string;
  fingerprint: string;
  title: string | null;
  /** 3.6.1 (revisão M4): o assunto principal exibido (h1; sem h1, o 1º título em main). */
  heading?: string | null;
  checks: string[];
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
  private readonly pending = new Map<string, PendingEntry>();
  private readonly byId = new Map<string, PendingEntry>();
  private readonly hidden = new Map<string, HiddenEntry>();
  private counter = 0;
  /** 3.6.1 (revisão H1): códigos cuja cláusula (texto) já saiu numa resposta desta sessão; repetições só com o id. */
  private readonly delivered = new Set<string>();

  textDelivered(code: string): boolean {
    return this.delivered.has(code);
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
   * Abre (ou reencontra) uma pendência por código + assunto + rota. Uma pendência já resolvida não reabre:
   * a mesma rota volta com o id e a resolução.
   */
  registerPending(scanId: string, route: string, items: NotJudgedItem[], locatorsOf: (item: NotJudgedItem) => string[]): PendingEntry[] {
    return items.map((item) => {
      const key = `${item.code}|${item.subject}|${route}`;
      let entry = this.pending.get(key);
      if (!entry) {
        this.counter += 1;
        entry = {
          id: `P-${String(this.counter).padStart(2, "0")}`,
          key,
          code: item.code,
          subject: item.subject,
          route,
          scans: [],
          norms: [...(item.norms ?? [])],
          ...(item.rule ? { rule: item.rule } : {}),
          locators: [],
          low: item.signal === "low",
          status: "open",
        };
        this.pending.set(key, entry);
        this.byId.set(entry.id, entry);
      }
      if (!entry.scans.includes(scanId)) entry.scans.push(scanId);
      for (const l of locatorsOf(item)) if (!entry.locators.includes(l)) entry.locators.push(l);
      return entry;
    });
  }

  open(): PendingEntry[] {
    return [...this.pending.values()].filter((e) => e.status === "open");
  }

  /**
   * verify_finding sobre uma norma da pendência resolve a pendência — qualquer veredito: o agente mediu e decidiu.
   * 3.6.1 (revisão M2): vale na mesma rota (qualquer elemento: o localizador do axe e o do agente raramente
   * coincidem) ou, em outra rota, no mesmo elemento (o mesmo cabeçalho em todas as rotas).
   */
  resolveByVerify(finding: Finding, verificationId: string, verdict: string): string[] {
    const route = routeKeyOf(finding.element.page);
    const cited = citedNorms(finding.rule);
    const resolved: string[] = [];
    for (const entry of this.open()) {
      if (!entry.norms.some((n) => cited.has(n))) continue;
      if (entry.route !== route && !entry.locators.includes(finding.element.locator)) continue;
      entry.status = "resolved";
      entry.resolution = { by: "verify_finding", ref: verificationId, status: verdict };
      resolved.push(entry.id);
    }
    return resolved;
  }

  /**
   * Resolução declarada pelo agente (pendingResolved do scan_page). 3.6.1 (revisão M3): "conforme" e "não se aplica"
   * exigem `reason` (sem ela a pendência continua aberta); "violada" fecha a pendência e volta como instrução de
   * registrar o achado, com a cláusula a citar — nunca em silêncio.
   */
  resolveExplicit(list: Array<{ id: string; status: string; reason?: string }>) {
    const resolved: string[] = [];
    const unknown: string[] = [];
    const needsReason: string[] = [];
    const recordAsFinding: Array<{ id: string; code: string; route: string; cite: string | null; norms: string[] }> = [];
    for (const r of list) {
      const entry = this.byId.get(r.id);
      if (!entry) {
        unknown.push(r.id.slice(0, 20));
        continue;
      }
      if (r.status !== "violada" && !r.reason?.trim()) {
        needsReason.push(entry.id);
        continue;
      }
      entry.status = "resolved";
      entry.resolution = { by: "pendingResolved", status: r.status, ...(r.reason ? { reason: r.reason.slice(0, 200) } : {}) };
      resolved.push(entry.id);
      if (r.status === "violada") {
        recordAsFinding.push({ id: entry.id, code: entry.code, route: routeLabel(entry.route), cite: entry.rule?.id ?? entry.norms[0] ?? null, norms: entry.norms.slice(0, 3) });
      }
    }
    return {
      resolved,
      ...(unknown.length ? { unknown } : {}),
      ...(needsReason.length ? { needsReason, needsReasonNote: "'conforme' e 'não se aplica' exigem reason (o que você mediu): estas continuam abertas." } : {}),
      ...(recordAsFinding.length
        ? { recordAsFinding, recordNote: "Violada: registre cada uma como achado na sua inspeção, citando cite (cláusula obrigatória), e submeta-o a verify_finding." }
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

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Bloco `sessionPending`: as pendências abertas da sessão que NÃO estão no `checksRun.pageLevel` deste scan.
 * 3.6.1 (revisão M1/H1): uma entrada por código (rotas contadas, até 3 ids); a cláusula com texto só enquanto o
 * código não teve o texto entregue nesta sessão (depois, só o id); as sem sinal medido (idioma, regiões) só contadas.
 */
export function sessionPendingBlock(open: PendingEntry[], currentIds: Set<string>, delivered: (code: string) => boolean, withText: boolean) {
  const others = open.filter((e) => !currentIds.has(e.id));
  if (!others.length) return undefined;
  const low = others.filter((e) => e.low).length;
  const byCode = new Map<string, PendingEntry[]>();
  for (const e of others.filter((x) => !x.low)) byCode.set(e.code, [...(byCode.get(e.code) ?? []), e]);
  const items = [...byCode.entries()].map(([code, entries]) => {
    const rule = entries[0].rule;
    return {
      code,
      routes: new Set(entries.map((e) => e.route)).size,
      ids: entries.slice(0, 3).map((e) => e.id),
      ...(entries.length > 3 ? { more: entries.length - 3 } : {}),
      ...(rule ? { rule: withText && !delivered(code) ? { id: rule.id, force: rule.force, text: clip(rule.text, 100) } : { id: rule.id } } : { norms: entries[0].norms.slice(0, 2) }),
    };
  });
  return {
    note: withText
      ? "Pendências abertas de outras rotas/estados (cada id é um item próprio): resolva medindo (verify_finding com uma das normas) ou em scan_page pendingResolved [{id, status, reason}]."
      : "Pendências abertas de outras rotas/estados (cada id é um item próprio): resolva medindo (verify_finding com o critério em norms).",
    count: others.length,
    items,
    ...(low ? { lowSignal: low } : {}),
  };
}

/** Encolhimento do teto: sem textos; depois só ids. */
export function sessionPendingCodes(block: { items?: Array<{ code: string; ids: string[] }>; count?: number; lowSignal?: number }) {
  return {
    count: block.count ?? 0,
    ids: (block.items ?? []).flatMap((i) => i.ids.map((id) => `${id}:${i.code}`)),
    ...(block.lowSignal ? { lowSignal: block.lowSignal } : {}),
  };
}
