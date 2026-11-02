/**
 * 3.6.5 (D-155, item 2; rastreio dev-364 §2, B-15 p03): a força da norma que uma família cita.
 *
 * A família mostrava `severity` (o impacto que o check atribui) e não a força da unidade normativa que ela cita;
 * o agente leu "moderate" e largou como "impacto mínimo" um fato cuja norma é obrigatória. Aqui a força vem da
 * mesma fonte que get_ds_rules e verify_finding usam (`getRuleById(...).force`). Id que a base não tem (e-MAG por
 * número, WCAG, regra do axe) não ganha força inventada.
 *
 * Reexecução da 3.6.5: uma força só (uma palavra), a da unidade que a família manda citar (`rule.id`); sem ela na base,
 * a mais forte das que o check implementa. O mapa `{id: força}` custava até 124 caracteres por família.
 */
import type { Finding } from "../schema/finding.js";
import { getRuleById } from "../data/knowledge.js";

const ORDER = ["prohibited", "required", "recommended", "discouraged", "permitted", "informative", "example", "unclear"];

export function unitForceOf(rule: Finding["rule"]): string | undefined {
  const own = getRuleById(rule.id);
  if (own && typeof own.force === "string" && own.force) return own.force;
  const forces = (rule.implements ?? [])
    .map((id) => String(getRuleById(id)?.force ?? ""))
    .filter((f) => f.length > 0);
  if (!forces.length) return undefined;
  const rank = (f: string) => (ORDER.includes(f) ? ORDER.indexOf(f) : ORDER.length);
  return [...forces].sort((a, b) => rank(a) - rank(b))[0];
}
