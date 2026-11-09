/** Contexto literal de escopo: introduções ancestrais + seção, sem interpretar aplicabilidade. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getKnowledgeBase, type KnowledgeRule } from "../data/knowledge.js";
import { locateLiteralParagraph } from "../data/normativeUnits.js";

type Scope = ReturnType<typeof computeScope>;
const memo = new WeakMap<KnowledgeRule, { key: string; value: Scope }>();
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};
export function procedureScope(rule: KnowledgeRule, maxChars = 4000): Scope {
  const version = getKnowledgeBase().meta.knowledgeDir;
  const key = JSON.stringify([version, rule.source, rule.originalText, maxChars]);
  const old = memo.get(rule);
  if (old?.key === key) return old.value;
  const value = freeze(computeScope(rule, version, maxChars));
  memo.set(rule, { key, value });
  return value;
}

function computeScope(rule: KnowledgeRule, version: string, maxChars = 4000) {
  if (typeof rule.source.corpusFile !== "string") return null;
  const base = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/knowledge/versions", version, "corpus");
  const path = resolve(base, rule.source.corpusFile);
  if (!path.startsWith(base + sep) || !existsSync(path)) return null;
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  if (!locateLiteralParagraph(text, rule)) return null;
  const headings = [...text.matchAll(/^(#{1,6})[ \t]+(.+)$/gm)];
  const target = typeof rule.source.sectionPath === "string" ? rule.source.sectionPath.replace(/[*_`]/g, "").trim() : "";
  const stack: Array<{ index: number; level: number; title: string; start: number }> = [];
  let found: typeof stack | undefined;
  for (const [index, h] of headings.entries()) {
    while (stack.length && stack[stack.length - 1].level >= h[1].length) stack.pop();
    stack.push({ index, level: h[1].length, title: h[2].replace(/[*_`]/g, "").trim(), start: h.index! });
    const end = headings.slice(index + 1).find(n => n[1].length <= h[1].length)?.index ?? text.length;
    if (stack.map(s => s.title).join(" > ") === target && text.slice(h.index, end).includes(rule.originalText)) found = [...stack];
  }
  if (!found?.length) return null;
  const ranges = found.map((h, i) => ({ start: h.start,
    end: i === found!.length - 1 ? headings.slice(h.index + 1).find(n => n[1].length <= h.level)?.index ?? text.length
      : headings[h.index + 1]?.index ?? text.length }));
  const scope = ranges.map(r => text.slice(r.start, r.end).trim()).filter(Boolean).join("\n\n");
  // Sem contexto integral transportável, não derivar uma expectativa isolada.
  if (scope.length > maxChars) return null;
  return { kind: "literal-scope" as const, text: scope,
    source: { url: rule.source.url, corpusFile: rule.source.corpusFile, knowledgeVersion: version,
      snapshotSha256: createHash("sha256").update(text).digest("hex"), ranges, coordinates: "UTF-16; LF-normalized; end exclusive" } };
}

type Range = { start: number; end: number };
const snapshots = new Map<string, { text: string; sha256: string }>();
function snapshotText(corpusFile: string, version: string): { text: string; sha256: string } | null {
  const base = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/knowledge/versions", version, "corpus");
  const path = resolve(base, corpusFile);
  if (!path.startsWith(base + sep) || !existsSync(path)) return null;
  let snap = snapshots.get(path);
  if (!snap) {
    const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    snapshots.set(path, (snap = { text, sha256: createHash("sha256").update(text).digest("hex") }));
  }
  return snap;
}

/** Marca entre trechos não contíguos de uma janela literal (não é texto da fonte). */
export const WINDOW_GAP = "\n[…]\n";

/**
 * 3.7.4 (D1): janela literal da cláusula dentro do seu escopo A4 — os títulos da cadeia, a(s) linha(s) da cláusula
 * (numa tabela, também o cabeçalho da tabela) e as linhas vizinhas da própria seção até `maxChars`. Nunca corta a
 * cláusula; cada trecho é uma faixa literal declarada do mesmo snapshot. `null`: o mínimo não cabe, a cláusula não se
 * localiza ou a janela seria o escopo inteiro (use o escopo).
 */
export function clauseWindow(rule: KnowledgeRule, scope: NonNullable<Scope>, maxChars: number) {
  const ranges = scope.source.ranges;
  const snap = snapshotText(scope.source.corpusFile as string, scope.source.knowledgeVersion);
  if (!snap || !ranges.length || snap.sha256 !== scope.source.snapshotSha256) return null;
  const text = snap.text;
  const own = ranges[ranges.length - 1];
  const at = text.indexOf(rule.originalText, own.start);
  if (at < 0 || at + rule.originalText.length > own.end) return null;
  // Linhas da própria seção (faixas sem a quebra final).
  const lines: Range[] = [];
  for (let s = own.start; s < own.end;) {
    const nl = text.indexOf("\n", s);
    const e = nl < 0 || nl > own.end ? own.end : nl;
    lines.push({ start: s, end: e });
    s = e + 1;
  }
  const lineAt = (pos: number) => lines.findIndex((l) => pos >= l.start && pos <= l.end);
  const first = lineAt(at);
  const last = lineAt(at + rule.originalText.length - 1);
  if (first < 0 || last < first) return null;
  const chosen = new Set<number>([0]);
  for (let i = first; i <= last; i++) chosen.add(i);
  // Linha de tabela: o cabeçalho e o separador da mesma tabela dão sentido à célula.
  const isRow = (i: number) => text.slice(lines[i].start, lines[i].end).trimStart().startsWith("|");
  if (isRow(first)) {
    let top = first;
    while (top > 0 && isRow(top - 1)) top -= 1;
    if (top < first) chosen.add(top);
    if (top + 1 < first) chosen.add(top + 1);
  }
  // Títulos das faixas ancestrais (a 1ª linha de cada uma).
  const heads: Range[] = ranges.slice(0, -1).map((r) => {
    const nl = text.indexOf("\n", r.start);
    return { start: r.start, end: nl < 0 || nl > r.end ? r.end : nl };
  });
  const pieces = (): Range[] => {
    const out: Range[] = [...heads];
    for (const i of [...chosen].sort((a, b) => a - b)) {
      const prev = out[out.length - 1];
      if (prev && prev.end + 1 === lines[i].start && prev.start >= own.start) prev.end = lines[i].end;
      else out.push({ ...lines[i] });
    }
    return out.filter((p) => text.slice(p.start, p.end).trim()).map((p) => ({ ...p }));
  };
  const render = (ps: Range[]) => ps.map((p) => text.slice(p.start, p.end)).join(WINDOW_GAP);
  const size = () => pieces().reduce((n, p) => n + (p.end - p.start), 0);
  if (size() > maxChars) return null;
  // Expande linha a linha, alternando antes/depois, dentro da própria seção.
  let up = first - 1;
  let down = last + 1;
  let upOpen = true;
  let downOpen = true;
  const grow = (i: number) => {
    if (chosen.has(i)) return true;
    chosen.add(i);
    if (size() <= maxChars) return true;
    chosen.delete(i);
    return false;
  };
  while (upOpen || downOpen) {
    if (upOpen) upOpen = up > 0 && grow(up--);
    if (downOpen) downOpen = down < lines.length && grow(down++);
  }
  const ps = pieces();
  // A janela é o escopo inteiro: nada a recortar.
  if (ps.length === ranges.length && ps.every((p, i) => text.slice(p.start, p.end).trim() === text.slice(ranges[i].start, ranges[i].end).trim())) return null;
  if (ps.some((p) => !scope.text.includes(text.slice(p.start, p.end).trim()))) return null;
  return {
    kind: "literal-window" as const,
    complete: false as const,
    text: render(ps),
    parts: ps.map((p) => text.slice(p.start, p.end)),
    source: { corpusFile: scope.source.corpusFile, knowledgeVersion: scope.source.knowledgeVersion, snapshotSha256: scope.source.snapshotSha256,
      ranges: ps, coordinates: scope.source.coordinates },
  };
}
