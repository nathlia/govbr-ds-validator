/** A4: procedimentos de inspeção derivados da letra, sem declarar medida automática. */
import type { KnowledgeRule } from "../data/knowledge.js";
import { getRuleById } from "../data/knowledge.js";
import type { Procedure } from "./componentChecklist.js";
import { procedureScope } from "./procedureScope.js";

const plain = (s: string) => s.replace(/[`*_](?=[\p{L}\d])/gu, " ").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
const ATTR = /^(?:aria-[a-z-]+|data-[a-z-]+|role|title|alt|tabindex|lang|for|id|href|scope|type|name|value|disabled|checked|required)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"']+))?$/i;
const NAME = "(?:(?:aria|data)-[a-z-]+|role|title|alt|tabindex|lang|for|id|href|scope|type|name|value)";

/**
 * O `when` conserva a cláusula inteira e condições herdadas. O seletor não presume que
 * todos os descendentes do componente sejam sujeitos da obrigação. Não é um detector.
 */
export function literalProcedure(rule: KnowledgeRule, root: string): Procedure | null {
  if (!["required", "prohibited"].includes(rule.force) || rule.validationStrategy === "source-code") return null;
  const raw = rule.originalText ?? "";
  const text = plain(raw);
  const when = [...(rule.conditions ?? []), text].filter(Boolean).join("; ");
  const out = (measure: string, expected: string): Procedure | null => {
    const context = getRuleById(rule.id) === rule ? procedureScope(rule) : null;
    if (getRuleById(rule.id) === rule && !context) return null;
    return {
    select: root === "o elemento citado" ? "sujeitos da cláusula" : `sujeitos da cláusula (${root})`,
    measure, expect: expected, when, ...(context ? { context } : {}),
  }; };

  // Relação entre atributos: a presença isolada de qualquer um não decide a igualdade.
  const sameValue = /mesmo valor|valores? (?:deve[m]? ser )?igua(?:l|is)/i.test(text);
  const attributes = [...raw.matchAll(/`([^`]+)`/g)].map(m => m[1].trim()).filter(a => ATTR.test(a));
  const proseAttrs = [...text.matchAll(new RegExp(`\\batributos?\\s+(${NAME}(?:\\s*(?:,|e)\\s+${NAME})*)\\b`, "gi"))]
    .flatMap(m => m[1].split(/\s*(?:,|\be\b)\s*/i));
  const byName = new Map<string, string>();
  for (const attr of [...attributes, ...proseAttrs]) {
    const name = attr.split("=")[0].trim().toLowerCase();
    if (!byName.has(name)) byName.set(name, attr);
  }
  const attrs = [...byName.values()];
  const presence = /(?:incluir|inclu[ií]d[oa]|inserid[oa]s?|adicionar|fornecid[oa]|deve(?:m)? conter|identificad[oa]|necessita|necess[áa]rio (?:usar|utilizar)|deve(?:m)? (?:ser )?utilizad[oa]s?)/i.test(text);
  const absence = /n[ãa]o (?:utilize|usar|utilizar|inclua|incluir)|n[ãa]o deve(?:m)? (?:ser utilizad[oa]s?|conter)/i.test(text);
  if (attrs.length && !/\|/.test(raw) && (presence || absence)) {
    if (presence && absence) return null;
    if (sameValue && attrs.length >= 2 && rule.force === "required") {
      return out("getAttribute() nos sujeitos respectivos", `${attrs.map(a => a.split("=")[0].trim()).join(" = ")}; não basta presença`);
    }
    // Proibir repetir conteúdo ou mudar um atributo não equivale a proibir o atributo.
    if (rule.force === "prohibited" && !absence) return null;
    if (rule.force === "required" && absence) return null;
    // A cláusula cita outro atributo como referência: não impor ambos ao mesmo nó.
    if (attrs.length > 1 && /(?:valor passado|correspondent|associad|referenci)/i.test(text)) return null;
    const literals = attrs.map(attr => {
      const equal = /^([^=]+)=\s*["']?([^"']*)["']?$/.exec(attr);
      if (!equal) return `${attr}: ${rule.force === "prohibited" ? "ausente" : /descri[çc][ãõ]/i.test(text) ? "descrição textual; adequação requer julgamento" : "presente"}`;
      if (!/^[\w-]{1,24}$/.test(equal[2])) return null;
      return rule.force === "prohibited" ? `${equal[1].trim()}: diferente de ${equal[2]} ou ausente` : `${equal[1].trim()}: ${equal[2]}`;
    });
    if (literals.some(x => x === null)) return null;
    return out("getAttribute() em cada sujeito", literals.join("; "));
  }

  if (rule.force !== "required") return null;
  // Token explicitamente associado a uma propriedade: sem inventar a unidade resolvida.
  const token = /(?:--|–)(font-size-[a-z0-9-]+|font-weight-[a-z0-9-]+|spacing-[a-z0-9-]+|surface-rounder-[a-z0-9-]+)/i.exec(text);
  if (token && !/\||n[ãa]o|evit|exemplo|\bpode\b|recomend/i.test(raw)) {
    const name = `--${token[1]}`;
    const property = token[1].startsWith("font-size-") ? "font-size" : token[1].startsWith("font-weight-") ? "font-weight" : null;
    if (property && /dever[áa]|deve|precisa|obrigat[óo]rio/i.test(text)) {
      const derived = out(`getComputedStyle(): ${property}; resolver token`, `valor resolvido de ${name}`);
      if (!derived) return null;
      return { ...derived,
        ...(token[0].startsWith("–") ? { provenance: `A grafia literal ${token[0]} usa travessão; ${name} normaliza só o prefixo CSS. Token não resolvido é não medido.` } : {}) };
    }
  }

  const multiple = /\b(largura|altura)\b.*?\bm[úu]ltiplo\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*px\s+e\s+(\d+(?:[.,]\d+)?)\s*px/i.exec(text);
  if (multiple) return out(`getBoundingClientRect(): ${multiple[1].toLowerCase()}`, `múltiplo de ${multiple[2]}px e ${multiple[3]}px, como declarado`);
  const grid = /(\d+)\s+colunas.*?margem\s+(?:de\s+)?(\d+)\s*px\s+nas laterais.*?medianiz\s+(?:de\s+)?(\d+)\s*px/i.exec(text);
  if (grid) return out("colunas, margens laterais e medianiz", `${grid[1]} colunas; laterais ${grid[2]}px; medianiz ${grid[3]}px`);
  const dimension = /\b(largura|altura|raio)\b.*?\b(?:deve(?:r[áa])?|precisa)\b.*?\b(m[íi]nim[oa]|m[áa]xim[oa]|igual a|de)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*px\b/i.exec(text);
  if (dimension && !/\b(?:ou|entre)\b|\d+\s*px.*\d+\s*px/i.test(text)) {
    const relation = /^m[íi]nim/i.test(dimension[2]) ? "≥" : /^m[áa]xim/i.test(dimension[2]) ? "≤" : "=";
    const property = dimension[1].toLowerCase() === "raio" ? "getComputedStyle(): border-radius" : `getBoundingClientRect(): ${dimension[1].toLowerCase()}`;
    return out(property, `${relation} ${dimension[3]}px`);
  }

  // Pai/filho e posição devem estar expressos; foco, leitura e ordem lógica não entram.
  const child = /\b([A-Z][A-Z0-9-]+)\b.*?\b(primeiro ou o [úu]ltimo|primeiro|[úu]ltimo) filho do elemento ([A-Z][A-Z0-9-]+)\b/.exec(text);
  const orderAt = child ? text.indexOf(child[2], child.index) : -1;
  const subjects = new Set(orderAt >= 0 ? text.slice(0, orderAt).match(/\b[A-Z][A-Z0-9-]+\b/g) ?? [] : []);
  if (child && subjects.size === 1 && !/foco|teclado|tabula|ordem l[óo]gica/i.test(text)) {
    const one = /s[óo] um |apenas um |somente um /i.test(text);
    return out(`filhos diretos de ${child[3]}: posição/quantidade`, `${child[1]}: ${child[2]} filho de ${child[3]}${one ? "; só um" : ""}`);
  }
  return null;
}
