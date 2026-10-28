/**
 * 3.4.0 (D-153, A4): roteamento pela intenção da consulta, determinístico. Uma tabela fixa de padrões
 * do TEXTO da consulta → o passo que mede melhor (outra ferramenta ou outra busca). Não lê a base, não
 * afirma norma nem aplicabilidade: só diz qual chamada responde melhor ao que foi perguntado.
 *
 *  - cor em hex/rgb()/hsl()  → get_design_tokens{hex} (o valor contra os tokens) + check_token_compliance
 *  - aria-* / role= / <tag> / atributo HTML → regras globais (component:"global") com o termo + get_component_spec
 *  - posição (esquerda/direita/topo/acima/abaixo/posição) → medir pela geometria, não pela ordem do DOM
 */
import { resolveComponentName } from "../data/applicability.js";
import { foldText } from "../data/retrieval.js";
import { step, type NextStep } from "./contract.js";

export const ROUTING_VERSION = "routing-1.0.0";

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/i;
const FUNC_COLOR = /\b(?:rgba?|hsla?)\(\s*[0-9.,%\s/]+\)/i;
const ARIA = /\baria-[a-z]+/g;
const ROLE = /\brole\s*=\s*["']?([a-z]+)/g;
const TAG = /<\s*\/?\s*([a-z][a-z0-9]*)/g;
/** Atributos HTML que a base cita pelo nome (tabindex, alt, lang, for…) — nome do atributo, não norma. */
const HTML_ATTRS = /\b(tabindex|accesskey|autocomplete|alt|lang|scope|headers|for|title|placeholder|hidden|disabled|required)\s*=/g;
const HTML_ATTR_WORDS = /\b(tabindex|accesskey|autocomplete)\b/g;
const POSITION = /\b(posicao|posicionad[oa]s?|posicionamento|esquerda|direita|topo|acima|abaixo|ao lado|antes de|depois de|ordem visual)\b/;

/** Passos de roteamento para o texto (máx. 2, ordem fixa: cor → marcação → posição). `component` = componente em escopo. */
export function routeSteps(text: string, component: string | null, available: (tool: string) => boolean = () => true): NextStep[] {
  const out: NextStep[] = [];
  const raw = text.slice(0, 500);
  const folded = foldText(raw);
  const color = HEX.exec(raw)?.[0] ?? FUNC_COLOR.exec(raw)?.[0];
  if (color) {
    if (available("get_design_tokens")) {
      out.push(step("measure-condition", "o valor de cor citado contra os tokens do DS (token exato ou o mais próximo); não decide a norma", "get_design_tokens", { hex: color }, { origin: `${ROUTING_VERSION}:cor` }));
    }
    if (available("check_token_compliance")) {
      out.push(step("measure-condition", "a cor medida na página contra os tokens (estado e seletor que você observou)", "check_token_compliance", undefined, { origin: `${ROUTING_VERSION}:cor` }));
    } else if (available("scan_page")) {
      out.push(step("measure-condition", "a cor medida na página contra os tokens: scan_page com o check tokens, no estado observado", "scan_page", undefined, { origin: `${ROUTING_VERSION}:cor` }));
    }
  }
  const terms = new Set<string>();
  for (const m of raw.toLowerCase().matchAll(ARIA)) terms.add(m[0]);
  const roles: string[] = [];
  for (const m of raw.toLowerCase().matchAll(ROLE)) {
    terms.add("role");
    roles.push(m[1]);
  }
  const tags: string[] = [];
  for (const m of raw.toLowerCase().matchAll(TAG)) tags.push(m[1]);
  for (const m of raw.toLowerCase().matchAll(HTML_ATTRS)) terms.add(m[1]);
  for (const m of folded.matchAll(HTML_ATTR_WORDS)) terms.add(m[1]);
  if (terms.size || tags.length) {
    const query = [...terms, ...tags].slice(0, 6).join(" ");
    if (available("get_ds_rules")) {
      out.push(step("request-detail", "regras globais (WAI-ARIA, semântica HTML) que citam o atributo, papel ou elemento da consulta", "get_ds_rules", { component: "global", query }, { origin: `${ROUTING_VERSION}:marcacao` }));
    }
    const target = component ?? [...roles, ...tags].map((n) => resolveComponentName(n)).find((n): n is string => Boolean(n)) ?? null;
    if (target && available("get_component_spec")) {
      out.push(step("request-detail", "atributos, tags e comportamento de implementação do componente", "get_component_spec", { component: target }, { origin: `${ROUTING_VERSION}:marcacao` }));
    }
  }
  if (POSITION.test(folded)) {
    out.push(
      step(
        "measure-condition",
        "posição visual pela geometria (caixas delimitadoras, ex.: getBoundingClientRect, dos elementos envolvidos); a ordem no DOM não é a posição na tela",
        null,
        undefined,
        { origin: `${ROUTING_VERSION}:posicao` },
      ),
    );
  }
  return out.slice(0, 2);
}
