/**
 * 3.6.3 (D-155; rastreio dev-362-b-01 §1, B-23 p03): `verify_finding` recusa um achado cuja evidência afirma UM fato
 * com membros de rotas diferentes, ou de estados diferentes sem uma relação antes/depois declarada. Um achado é de um
 * estado; a evidência de um não vale pelo outro (instructions, item 8).
 *
 * Genérico, sem nada de tela: só referências estruturadas — o `scanId` do pedido, o `finding.id` quando é um achado
 * guardado nesta sessão, a página do elemento e os ids de scan ou de achado desta sessão citados em `evidence.data`
 * (menos os que o próprio oráculo pôs na evidência de um achado da mesma norma, como os scans das outras rotas no título
 * repetido). Texto livre (observed/expected/trace) não é lido.
 *
 * Revisão independente da 3.6.3 (MEDIUM 1, LOW 1):
 *   - rota = `routeKeyOf` (a mesma chave das pendências da sessão: caminho + fragmento de rota de SPA);
 *   - RECUSA só (a) quando as referências do fato (scanId, finding.id, página do elemento, membros em evidence.data)
 *     não cabem numa rota só, ou (b) quando os MEMBROS em evidence.data são de estados diferentes da mesma rota;
 *   - ACEITA, com `stateWarning`, o achado citado de outro estado da mesma rota (re-scan com menos checks ou seletores,
 *     modal cobrindo) e a evidência que declara a relação antes/depois (`evidence.data.before`, `after`, `antes`,
 *     `depois`, `previous`, `baseline`, `from`, `to`…), que um achado de mudança de estado precisa.
 * Dois scans são o mesmo estado quando são da mesma rota e têm o mesmo fingerprint OU a mesma receita (url com query,
 * ações e chegada).
 */
import type { Finding } from "../schema/finding.js";
import { routeKeyOf, routeLabel } from "../scan/session.js";

export interface ScanStateInfo {
  scanId: string;
  url: string;
  /** Rota (routeKeyOf da url observada). */
  page: string;
  fingerprint: string;
  recipeKey: string;
  findings: Finding[];
}

export type StateReferenceKind = "anchor" | "page" | "member" | "relation";

export interface StateReference {
  /** O que o payload citou, para a resposta: `scanId S-page-003`, `finding.id F-089`, `evidence.data.members[1] F-120`. */
  label: string;
  kind: StateReferenceKind;
  scans: string[];
}

export interface MixedStateGroup {
  scanIds: string[];
  url: string;
  route: string;
  fingerprint?: string;
  cited: string[];
}

export interface MixedStateVerdict {
  /** Grupos quando a evidência mistura rotas (ou membros de estados diferentes): recusar. */
  refuse: { reason: "routes" | "member-states"; groups: MixedStateGroup[] } | null;
  /** Grupos quando a evidência cita outros estados da mesma rota de forma aceitável: aceitar, avisando. */
  warning: MixedStateGroup[] | null;
}

const SCAN_ID = /^S-[a-z]+-\d{3,}$/;
const FINDING_ID = /^F-\d{3,}$/;
const MAX_DATA_REFS = 40;
/** Chaves que declaram a relação entre estados (antes/depois, comparação): a referência é contexto, não membro do fato. */
const RELATION_KEY = /(?:^|\.)(?:before|after|antes|depois|prev|previous|anterior|posterior|baseline|from|to|inicial|initial|final|compare\w*)(?:ScanId|Scan|State|Id|Ids)?(?=\[|\.|$)/i;

/** A rota de um scan: a mesma chave da sessão (routeKeyOf). */
export const routeOfUrl = (url: string): string => routeKeyOf(url);

/** Agrupa os scans em estados: mesma rota e (mesmo fingerprint ou mesma receita). */
export function stateClusters(scans: ScanStateInfo[]): ScanStateInfo[][] {
  const clusters: ScanStateInfo[][] = [];
  for (const s of scans) {
    const c = clusters.find((cl) => cl.some((o) => o.page === s.page && (o.fingerprint === s.fingerprint || o.recipeKey === s.recipeKey)));
    if (c) c.push(s);
    else clusters.push([s]);
  }
  return clusters;
}

/** As referências de estado de um payload de verify_finding (só campos estruturados). */
export function stateReferences(
  finding: Finding,
  scanId: string | undefined,
  scans: ScanStateInfo[],
  storedFinding: (id: string) => Finding | undefined,
): StateReference[] {
  const refs: StateReference[] = [];
  const known = new Set(scans.map((s) => s.scanId));
  // 3.6.3 (teste à mão): o id exato manda. Regra + localizador só quando o id não está em scan nenhum — achado de
  // página tem localizador `html` em toda rota, e o casamento frouxo punha F-066 (rota 2) também na rota 1, apagando
  // a mistura de rotas citada só por ids de achado.
  const scansWith = (f: Finding) => {
    const exact = scans.filter((s) => s.findings.some((x) => x.id === f.id)).map((s) => s.scanId);
    if (exact.length) return exact;
    return scans.filter((s) => s.findings.some((x) => x.rule.id === f.rule.id && x.rule.source === f.rule.source && x.element.locator === f.element.locator)).map((s) => s.scanId);
  };
  if (scanId && known.has(scanId)) refs.push({ label: `scanId ${scanId}`, kind: "anchor", scans: [scanId] });
  if (typeof finding.id === "string") {
    const stored = storedFinding(finding.id);
    if (stored) {
      const where = scansWith(stored);
      if (where.length) refs.push({ label: `finding.id ${finding.id}`, kind: "anchor", scans: where });
    }
  }
  if (finding.element?.page) {
    const route = routeOfUrl(finding.element.page);
    const where = scans.filter((s) => s.page === route).map((s) => s.scanId);
    if (where.length) refs.push({ label: "element.page", kind: "page", scans: where });
  }
  // Ids que o PRÓPRIO oráculo pôs na evidência de um achado da mesma norma não são mistura: são o fato medido.
  const oracleCited = new Set<string>();
  const collect = (v: unknown, depth: number) => {
    if (depth > 6) return;
    if (typeof v === "string") oracleCited.add(v.trim());
    else if (Array.isArray(v)) v.slice(0, 100).forEach((x) => collect(x, depth + 1));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, depth + 1));
  };
  for (const s of scans) for (const f of s.findings) if (f.rule.id === finding.rule?.id && f.rule.source === finding.rule?.source) collect(f.evidence?.data, 0);
  let seen = 0;
  const walk = (v: unknown, path: string, depth: number) => {
    if (seen >= MAX_DATA_REFS || depth > 6) return;
    if (typeof v === "string") {
      const t = v.trim();
      if (oracleCited.has(t)) return;
      const kind: StateReferenceKind = RELATION_KEY.test(path) ? "relation" : "member";
      if (SCAN_ID.test(t) && known.has(t)) {
        seen += 1;
        refs.push({ label: `${path} ${t}`, kind, scans: [t] });
      } else if (FINDING_ID.test(t)) {
        const stored = storedFinding(t);
        const where = stored ? scansWith(stored) : [];
        if (where.length) {
          seen += 1;
          refs.push({ label: `${path} ${t}`, kind, scans: where });
        }
      }
      return;
    }
    if (Array.isArray(v)) v.slice(0, 100).forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, depth + 1);
  };
  walk(finding.evidence?.data, "evidence.data", 0);
  return refs;
}

function groupsBy(refs: StateReference[], scans: ScanStateInfo[], unitOf: (s: ScanStateInfo) => string, withFingerprint: boolean): MixedStateGroup[] {
  const byId = new Map(scans.map((s) => [s.scanId, s]));
  const groups = new Map<string, { scans: Set<string>; first: ScanStateInfo; cited: string[] }>();
  for (const r of refs) {
    const s = r.scans.map((id) => byId.get(id)).find(Boolean);
    if (!s) continue;
    const u = unitOf(s);
    const g = groups.get(u) ?? { scans: new Set<string>(), first: s, cited: [] };
    for (const id of r.scans) if (byId.get(id) && unitOf(byId.get(id)!) === u) g.scans.add(id);
    g.cited.push(r.label);
    groups.set(u, g);
  }
  return [...groups.values()]
    .filter((g) => g.cited.some((l) => l !== "element.page"))
    .map((g) => ({
      scanIds: [...g.scans].slice(0, 5),
      url: g.first.url,
      route: routeLabel(g.first.page),
      ...(withFingerprint ? { fingerprint: g.first.fingerprint.slice(0, 19) } : {}),
      cited: g.cited.slice(0, 10),
    }));
}

/** O que fazer com as referências: recusar (rotas misturadas, ou membros de estados diferentes), avisar ou nada. */
export function mixedStateVerdict(refs: StateReference[], scans: ScanStateInfo[]): MixedStateVerdict {
  const byId = new Map(scans.map((s) => [s.scanId, s]));
  const routesOf = (r: StateReference) => new Set(r.scans.map((id) => byId.get(id)?.page).filter((x): x is string => Boolean(x)));
  const fact = refs.filter((r) => r.kind !== "relation");
  // (a) o fato numa rota só: alguma rota contém todas as referências do fato (scanId, finding.id, página, membros).
  if (fact.filter((r) => r.kind !== "page").length >= 1 && fact.length >= 2) {
    const candidates = [...new Set(fact.flatMap((r) => [...routesOf(r)]))];
    if (!candidates.some((route) => fact.every((r) => routesOf(r).has(route)))) {
      const groups = groupsBy(fact.filter((r) => r.kind !== "page"), scans, (s) => s.page, false);
      if (groups.length >= 2) return { refuse: { reason: "routes", groups }, warning: null };
    }
  }
  // (b) os membros declarados em evidence.data num estado só.
  const clusters = stateClusters(scans);
  const clusterOf = (id: string) => clusters.findIndex((c) => c.some((s) => s.scanId === id));
  const members = refs.filter((r) => r.kind === "member");
  if (members.length >= 2) {
    const inAll = clusters.some((_, i) => members.every((r) => r.scans.some((id) => clusterOf(id) === i)));
    if (!inAll) {
      const groups = groupsBy(members, scans, (s) => String(clusterOf(s.scanId)), true);
      if (groups.length >= 2) return { refuse: { reason: "member-states", groups }, warning: null };
    }
  }
  // Aviso: o resto cita mais de um estado (achado de outro estado da mesma rota; relação antes/depois declarada).
  const cited = refs.filter((r) => r.kind !== "page");
  if (cited.length >= 2 && !clusters.some((_, i) => cited.every((r) => r.scans.some((id) => clusterOf(id) === i)))) {
    const groups = groupsBy(cited, scans, (s) => String(clusterOf(s.scanId)), true);
    if (groups.length >= 2) return { refuse: null, warning: groups };
  }
  return { refuse: null, warning: null };
}
