/**
 * 3.7.11 (leitura dev-3710-b § 3(d), § 7 item 6; spec B-18): marcação que o HTML não admite no elemento nativo `button`.
 *
 * O que mede (inspect.ts, `buttonMarkup`), só em `<button>` nativo no DOM da página — fora de shadow root e fora de
 * elemento customizado registrado (`customElements.get`: o que um web component desenha não é marcação da página), sem o
 * atributo `is` (built-in customizado):
 *   (i)  atributo que não existe no elemento `button`: só `href`. É atributo de hiperlink (a, area, link, base); no
 *        `button` não navega nem expõe link, e nenhuma biblioteca o usa como atributo de componente. Outros atributos
 *        fora da lista do HTML (`target`, `rel`, atributos de framework) ficam fora: ou têm uso legítimo em bibliotecas
 *        (`routerlink`, `ng-*`, `v-*`, `x-*`), ou não há caso medido que os justifique;
 *  (ii)  conteúdo que não é de fraseado dentro do `button` (o modelo de conteúdo do elemento é "phrasing content"):
 *        lista fechada de elementos que só são de fluxo (parágrafo, divisão, títulos, listas, tabela, formulário,
 *        seções…). Fora de `svg`/`math`/`template`/`select`/`datalist` e de elemento com hífen (o modelo é outro ou o
 *        conteúdo é de outro dono): nada de lista aberta de "fraseado", para não acusar elemento desconhecido.
 * No scan, só o botão exibido neste estado (como os demais checks de controle: o oculto aparece no scan do estado em que
 * é exibido — na tela B, o menu do avatar aberto); o verify_finding mede a marcação também no oculto (o fato não depende
 * do estado). Medido nas telas: com o oculto, o 1º scan da B no knowledge-free descia à forma mínima das pendências.
 *
 * Força: a base não tem cláusula obrigatória sobre isto. A unidade do e-MAG 1.1 "Respeitar os Padrões Web"
 * (`accessibility-global-f12b1bae5784`) é o título da recomendação, força `recommended`; as cláusulas obrigatórias do
 * 1.1 falam de separar camadas, não de modelo de conteúdo; a WCAG 4.1.1 foi removida na 2.2. Por isso: observação (D-27),
 * com a referência HTML e, no perfil com a base, a unidade do e-MAG 1.1 como norma relacionada (recommended) — e uma
 * pendência para o agente decidir (o fato existe; o oráculo não afirma violação). Knowledge-free: só o fato e a
 * referência HTML, sem id nem texto da base.
 */
import type { ElementEvidence } from "../evidence/types.js";
import type { Observation } from "../schema/finding.js";
import type { NotJudgedItem } from "../scan/notJudged.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import { getRuleById } from "../data/knowledge.js";
import { createHash } from "node:crypto";

export const NATIVE_BUTTON_CONDITION = EXPECTED_CONDITIONS.nativeButtonValidHtml;

/** e-MAG 1.1 "Respeitar os Padrões Web" (título da recomendação, força recommended) — norma relacionada, não citação de violação. */
export const EMAG_WEB_STANDARDS = "govbr-3.7.0-accessibility-global-f12b1bae5784";

/** A referência do fato: o elemento button no HTML (WHATWG). */
export const HTML_BUTTON_REFERENCE =
  "HTML (WHATWG), elemento button: modelo de conteúdo = conteúdo de fraseado; atributos = globais + disabled, form, formaction, formenctype, formmethod, formnovalidate, formtarget, name, popovertarget, popovertargetaction, type, value (href não é um deles) — https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element";

/** Atributos medidos (i): só o href (ver o cabeçalho). Lido também em inspect.ts. */
export const BUTTON_INVALID_ATTRIBUTES = ["href"] as const;

/** Elementos só de fluxo (ii) — nunca conteúdo de fraseado. Lido também em inspect.ts. */
export const BUTTON_FLOW_ONLY = [
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "hgroup", "ul", "ol", "li", "dl", "dt", "dd", "menu",
  "table", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "td", "th",
  "form", "fieldset", "legend", "section", "article", "aside", "nav", "header", "footer", "main", "search",
  "address", "blockquote", "figure", "figcaption", "hr", "pre", "details", "summary", "dialog",
] as const;

/** Os candidatos, para uma coleta só deles (knowledge-free): `button[href]` e `button` com descendente só de fluxo. */
export const BUTTON_CANDIDATE_SELECTOR = `button[href], button:has(${BUTTON_FLOW_ONLY.join(", ")})`;

const EXAMPLES = 3;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const setHash = (parts: string[]) => createHash("sha256").update([...new Set(parts)].sort().join("\u0001")).digest("hex").slice(0, 16);

/** O botão é do escopo: nativo, da página (fora de shadow root e de elemento customizado registrado). */
export function nativePageButton(el: ElementEvidence): boolean {
  return el.tagName === "button" && !el.inShadowDom && el.origin === undefined && el.buttonMarkup?.insideCustomElement !== true;
}

/** O fato medido (vazio = nada que o HTML não admita). */
export function buttonMarkupDefects(el: ElementEvidence): { attributes: string[]; nonPhrasing: string[] } {
  if (!nativePageButton(el) || !el.buttonMarkup) return { attributes: [], nonPhrasing: [] };
  return { attributes: [...el.buttonMarkup.attributes], nonPhrasing: [...el.buttonMarkup.nonPhrasing] };
}

export const hasButtonMarkupDefect = (el: ElementEvidence) => {
  const d = buttonMarkupDefects(el);
  return d.attributes.length > 0 || d.nonPhrasing.length > 0;
};

/** `href="javascript:void(0)"; <p>` — o fato curto de um botão. */
export function defectText(el: ElementEvidence): string {
  const d = buttonMarkupDefects(el);
  return [
    ...d.attributes.map((a) => (a === "href" && el.attributes.href !== undefined && el.attributes.href !== null ? `href="${clip(el.attributes.href, 24)}"` : a)),
    ...(d.nonPhrasing.length ? [d.nonPhrasing.map((t) => `<${t}>`).join("")] : []),
  ].join("; ");
}

export const BUTTON_HTML_TODO = `decida: marcação que o HTML não admite em button (verify_finding expectedCondition ${NATIVE_BUTTON_CONDITION})`;
export const BUTTON_HTML_TODO_KF = "decida: HTML do button (referência em measure)";

/** `href; <p>` — o fato em poucas letras, para a linha compacta. */
export function shortDefect(el: ElementEvidence): string {
  const d = buttonMarkupDefects(el);
  return [...d.attributes, ...(d.nonPhrasing.length ? [d.nonPhrasing.map((t) => `<${t}>`).join("")] : [])].join("; ");
}

/**
 * Observações (perfil com a base) e a pendência (os dois perfis) dos botões nativos da página com marcação que o HTML não
 * admite. Nada é achado: a base não tem cláusula obrigatória (ver o cabeçalho).
 */
export function checkNativeButtonMarkup(page: { url: string }, elements: ElementEvidence[], options: { knowledgeFree?: boolean } = {}): { observations: Observation[]; pending: NotJudgedItem | null } {
  const kf = options.knowledgeFree === true;
  const seen = new Set<string>();
  const hits = elements.filter((el) => {
    if (seen.has(el.locator) || el.rendered === false || !hasButtonMarkupDefect(el)) return false;
    seen.add(el.locator);
    return true;
  });
  if (!hits.length) return { observations: [], pending: null };
  const related = kf ? undefined : (() => {
    try {
      const r = getRuleById(EMAG_WEB_STANDARDS);
      return r ? { id: r.id, force: r.force, text: clip(String(r.originalText ?? r.title ?? "").replace(/\s+/g, " ").trim(), 100) } : undefined;
    } catch {
      return undefined;
    }
  })();
  const observations: Observation[] = kf ? [] : hits.map((el) => {
    const d = buttonMarkupDefects(el);
    return {
      kind: "structure-native-button-html",
      element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: page.url },
      note: `<button> nativo com marcação que o HTML não admite: ${defectText(el)}${d.attributes.length ? " (href não é atributo de button)" : ""}${d.nonPhrasing.length ? " (conteúdo que não é de fraseado)" : ""}.`,
      whyNotAFinding:
        "Fato da marcação, medido; a base não tem cláusula obrigatória sobre ele: a referência é o HTML (WHATWG) e a unidade do e-MAG 1.1 " +
        `'Respeitar os Padrões Web' (${EMAG_WEB_STANDARDS}) tem força recommended. O oráculo não afirma violação.`,
      data: {
        element: "button",
        invalidAttributes: d.attributes,
        nonPhrasing: d.nonPhrasing,
        reference: HTML_BUTTON_REFERENCE,
        ...(related ? { relatedRule: related } : {}),
        expectedCondition: NATIVE_BUTTON_CONDITION,
      },
    };
  });
  const pending: NotJudgedItem = {
    code: "button-html",
    subject: "button nativo com marcação que o HTML não admite",
    count: hits.length,
    examples: hits.slice(0, EXAMPLES).map((el) => clip(el.locator, 120)),
    elementSet: setHash(hits.map((el) => `${el.locator}=${defectText(el)}`)),
    elementBound: true,
    boundLocators: hits.map((el) => el.locator),
    // curto (a linha compacta do scan corta em 72): só os nomes; o valor do atributo fica na observação e no verify
    observed: hits.slice(0, 2).map((el) => shortDefect(el)).join(" | "),
    todo: kf ? BUTTON_HTML_TODO_KF : BUTTON_HTML_TODO,
    ...(kf ? {} : { norms: [EMAG_WEB_STANDARDS] }),
    measure: kf
      ? `${HTML_BUTTON_REFERENCE}. Fato da marcação; sem critério WCAG 2.2 que o decida (a 4.1.1 foi removida): relate com a referência HTML, ou registre em limitations (id + medida)`
      : `${HTML_BUTTON_REFERENCE}. Norma relacionada da base: ${EMAG_WEB_STANDARDS} (e-MAG 1.1, recommended: não obriga). verify_finding live por elemento: rule {source:"govbr-ds-kb", id:"${EMAG_WEB_STANDARDS}"}, evidence.data {expectedCondition:"${NATIVE_BUTTON_CONDITION}"}`,
  };
  return { observations, pending };
}
