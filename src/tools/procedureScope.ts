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
export function procedureScope(rule: KnowledgeRule): Scope {
  const version = getKnowledgeBase().meta.knowledgeDir;
  const key = JSON.stringify([version, rule.source, rule.originalText]);
  const old = memo.get(rule);
  if (old?.key === key) return old.value;
  const value = freeze(computeScope(rule, version));
  memo.set(rule, { key, value });
  return value;
}

function computeScope(rule: KnowledgeRule, version: string) {
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
  if (scope.length > 4000) return null;
  return { kind: "literal-scope" as const, text: scope,
    source: { url: rule.source.url, corpusFile: rule.source.corpusFile, knowledgeVersion: version,
      snapshotSha256: createHash("sha256").update(text).digest("hex"), ranges, coordinates: "UTF-16; LF-normalized; end exclusive" } };
}
