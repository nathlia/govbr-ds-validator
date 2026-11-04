/**
 * 3.7.0 (C01 da auditoria de mensurabilidade de 2026-10-30; D-155/D-159): botão do DS só com ícone fora da variante
 * circular.
 *
 * O que mede: `<button>` ou `<a>` com a classe `br-button`, exibido e exposto à tecnologia assistiva, cujo conteúdo
 * renderizado é só ícone (`i`, `svg`, `img` com caixa) e nenhum texto VISÍVEL (o texto `sr-only`, recortado, de 1px,
 * com opacidade 0 ou dentro de `svg` não conta: evidence/inspect.ts, `content.iconOnlyVisual`), e que NÃO tem a classe
 * `circle` (nem a forma antiga `is-circle`).
 *
 * Normas servidas (rules.jsonl, base literal 3.7.0): Button "O rótulo é um elemento obrigatório." (`component-button-
 * 7ef75d42ac65`, required) e a linha da tabela de anatomia "Rótulo … Obrigatório" (`component-button-9d77803305c0`).
 * A base literal PERDEU a exceção que o texto anterior trazia — "A exceção ocorre na versão tipo circular uma vez que
 * não existe rótulo." (legado `component-button-4d7b5f978df1`, substituído por 7ef75d42ac65; ver data/lostExceptions.ts)
 * — e `component-button-627dd3089562` diz que no tipo circular a mensagem é transmitida só pelo ícone. Pela letra
 * servida, todo botão circular violaria: por isso o CHECK aplica a exceção do legado (o circular não é acusado) e a
 * exclusão dos hospedeiros abaixo, e o texto do achado diz as duas como regra do check, nunca como letra do DS.
 *
 * Fora, de propósito:
 *   - nome acessível: o botão só com ícone SEM nome é do check `structure-accessible-name` / axe `button-name`/`link-name`
 *     (WCAG 4.1.2). Regra de deduplicação (revisão 3.7.0): no mesmo elemento, o achado de nome fica e o C01 não sai — dar
 *     nome é o 1º conserto, e o scan seguinte acusa o C01 se continuar sem rótulo visível. O predicado do verify_finding
 *     continua decidindo o fato (só ícone, sem circle) também no botão sem nome;
 *   - `<img alt="…">` como único conteúdo conta como ícone (acusa): nenhum exemplo oficial do Button usa `img`, então o
 *     alt não é rótulo visível pelo DS;
 *   - botão que é parte de outro componente do DS, quando os exemplos oficiais desse componente trazem o mesmo botão só
 *     com ícone sem `circle` (o botão de ação do Input, o gatilho do Select, o fechar da Tag…): a anatomia publicada do
 *     componente hospedeiro o admite. A lista sai dos exemplos oficiais (data/component-specs.json), não de mão;
 *   - oculto, `aria-hidden`/inert, `role=none|presentation` (decorativo); internos de web component do DS e terceiros
 *     embutidos viram observação (ownership.ts).
 *
 * 3.7.2 (D-166; rastreio dev-371-b §4): o botão excluído por ser parte de outro componente NÃO some em silêncio — volta
 * como candidato "a investigar" (pendência `icon-only-embedded` do scan, nunca achado nem veredito), com a nota de que a
 * marcação coincide com o exemplo oficial do componente hospedeiro (nome do exemplo, lido de data/component-specs.json).
 * A regra do DS é obrigatória; o exemplo oficial que a contraria não decide pela página: quem decide é o agente.
 */
import type { ElementEvidence } from "../evidence/types.js";
import type { Finding, Observation } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import type { CheckGrounding } from "./grounding.js";
import { demoteToObservations, ownershipOf } from "./ownership.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import { getComponentSpecs } from "../data/load.js";
import { lostExceptionOf } from "../data/lostExceptions.js";
import { resolvedAccessibleName } from "../evidence/accessibleName.js";

export const ICON_ONLY_BUTTON_CONDITION = EXPECTED_CONDITIONS.iconOnlyButtonCircle;

/** "O rótulo é um elemento obrigatório." (Button, required) — a citação do achado. */
export const BUTTON_LABEL_REQUIRED = "govbr-3.7.0-component-button-7ef75d42ac65";
/** Anatomia do Button: "| 2 | Rótulo | … | Obrigatório |". */
export const BUTTON_LABEL_ANATOMY = "govbr-3.7.0-component-button-9d77803305c0";
/** "Nos botões do tipo circular a utilização [do ícone] é obrigatória…" — contexto da exceção. */
export const BUTTON_CIRCLE_ICON = "govbr-3.7.0-component-button-627dd3089562";
/** O legado que trazia a exceção (substituído por 7ef75d42ac65 na base literal). */
export const BUTTON_LABEL_LEGACY = "govbr-3.7.0-component-button-4d7b5f978df1";

export const ICON_ONLY_BUTTON_GROUNDING: CheckGrounding = {
  implements: [BUTTON_LABEL_REQUIRED, BUTTON_LABEL_ANATOMY],
  basis:
    "Button (required): 'O rótulo é um elemento obrigatório.' e a anatomia 'Rótulo … Obrigatório'. A exceção que a base " +
    "literal perdeu (legado govbr-3.7.0-component-button-4d7b5f978df1: 'A exceção ocorre na versão tipo circular uma vez que não existe rótulo.') é " +
    "aplicada pelo check: só o botão só com ícone SEM a classe circle é acusado.",
};

/** Texto da exceção perdida, lido da base (data/lostExceptions.ts); a frase do legado, se a detecção não a achar. */
export function circleException(): { legacyId: string; text: string } {
  const lost = lostExceptionOf({ id: BUTTON_LABEL_REQUIRED });
  return lost
    ? { legacyId: lost.legacyId, text: lost.text }
    : { legacyId: BUTTON_LABEL_LEGACY, text: "A exceção ocorre na versão tipo circular uma vez que não existe rótulo." };
}

const CIRCLE = new Set(["circle", "is-circle"]);
const DECORATIVE_ROLES = new Set(["none", "presentation"]);

type Tag = { tag: string; classes: string[] };
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/**
 * Componentes do DS cujos exemplos oficiais trazem um `br-button` só com ícone e sem `circle` como parte deles: a classe
 * raiz do componente `br-*` mais próximo que contém o botão no exemplo. Leitura mecânica dos exemplos (tokenizador de
 * tags), sem lista à mão.
 *
 * 3.7.2: cada ocorrência guarda também o componente da spec, o nome do exemplo, as classes `br-*` da cadeia de ancestrais
 * do botão no exemplo e o ícone (classe `fa-*`), para a nota do candidato dizer QUAL exemplo oficial traz a mesma marcação.
 */
export interface EmbeddedIconButtonExample {
  /** O `br-*` mais próximo do botão no exemplo (a chave da exclusão). */
  host: string;
  /** Componente da spec a que o exemplo pertence (`input`, `select`, …). */
  component: string;
  /** Nome do exemplo oficial (`input-highlight`, `select-simples`, …). */
  example: string;
  /** As classes `br-*` dos ancestrais do botão no exemplo, do mais próximo ao mais externo. */
  chain: string[];
  /** O ícone do botão no exemplo (`search`, `angle-down`), sem o prefixo `fa-`; null quando não há classe fa-*. */
  icon: string | null;
}
/**
 * 3.7.2 (revisão BAIXA 11): o nome do ícone Font Awesome (`fa-search` → `search`), pulando as classes de estilo e tamanho
 * (`fa-solid`, `fa-regular`, `fa-brands`, `fa-light`, `fa-thin`, `fa-duotone`, `fa-lg`, `fa-xs`, `fa-sm`, `fa-xl`,
 * `fa-2xs`, `fa-2xl`, `fa-fw`, `fa-2x`…`fa-10x`). null sem nome de ícone.
 */
const FA_MODIFIER = /^(?:solid|regular|brands|light|thin|duotone|lg|xs|sm|xl|2xs|2xl|fw|\d{1,2}x)$/;
export function faIconOf(html: string): string | null {
  for (const m of html.matchAll(/\bfa-([a-z0-9-]+)/g)) if (!FA_MODIFIER.test(m[1])) return m[1];
  return null;
}

let embeddedExamples: EmbeddedIconButtonExample[] | undefined;
export function embeddedIconButtonExamples(): EmbeddedIconButtonExample[] {
  if (embeddedExamples) return embeddedExamples;
  const out: EmbeddedIconButtonExample[] = [];
  for (const [component, spec] of Object.entries(getComponentSpecs().components)) {
    for (const [n, example] of (spec.examples ?? []).entries()) {
      const name = (example as { name?: string }).name ?? `${component}#${n}`;
      const stack: Tag[] = [];
      let open: { host: string | undefined; chain: string[]; classes: string[]; start: number; depth: number } | null = null;
      const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(example.html))) {
        const [whole, closing, rawTag, attrs] = m;
        const tag = rawTag.toLowerCase();
        if (closing) {
          const at = stack.map((t) => t.tag).lastIndexOf(tag);
          if (at < 0) continue;
          if (open && at === open.depth) {
            // fecha o botão aberto: decide pelo conteúdo entre a abertura e o fechamento
            const inner = example.html.slice(open.start, m.index);
            const text = inner.replace(/<svg[\s\S]*?<\/svg>/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
            if (!text && /<(i|svg|img)\b/i.test(inner) && !open.classes.some((c) => CIRCLE.has(c)) && open.host) {
              const icon = faIconOf(inner);
              out.push({ host: open.host, component, example: name, chain: open.chain, icon });
            }
            open = null;
          }
          stack.splice(at);
          continue;
        }
        const classes = /\bclass\s*=\s*"([^"]*)"/.exec(attrs)?.[1].split(/\s+/).filter(Boolean) ?? [];
        if (VOID.has(tag) || /\/\s*$/.test(attrs)) continue;
        if (!open && (tag === "button" || tag === "a") && classes.includes("br-button")) {
          const chain = [...new Set([...stack].reverse().flatMap((t) => t.classes).filter((c) => /^br-[a-z]+$/.test(c) && c !== "br-button"))];
          // o circular pelo atributo (`<button class="br-button" circle>`) conta como a classe
          const circleAttr = /(^|\s)circle(\s|=|$)/.test(attrs.replace(/\bclass\s*=\s*"[^"]*"/, ""));
          open = { host: chain[0], chain, classes: circleAttr ? [...classes, "circle"] : classes, start: m.index + whole.length, depth: stack.length };
        }
        stack.push({ tag, classes });
      }
    }
  }
  embeddedExamples = out;
  return out;
}

let embedded: Set<string> | undefined;
export function embeddedIconButtonHosts(): Set<string> {
  if (!embedded) embedded = new Set(embeddedIconButtonExamples().map((e) => e.host));
  return embedded;
}

/** Host `<br-button>` do web component do DS (@govbr-ds/webcomponents): avaliado pela API do host (inspect.ts). */
export const isButtonHost = (el: Pick<ElementEvidence, "tagName">) => el.tagName === "br-button";

/**
 * 3.7.2: o FATO do C01 — botão do DS só com ícone, exibido e exposto, fora da variante circular — sem a exclusão dos
 * hospedeiros (o hospedeiro decide só se o check acusa ou aponta como candidato).
 */
export function iconOnlyNonCircleFact(el: ElementEvidence): boolean {
  // Circular pela classe (circle, is-circle) ou pelo atributo: a folha do DS desenha os três (.br-button.circle, .is-circle,
  // [circle]); no host, o atributo `circle` da API (ou a classe circle no botão que ele desenha).
  if (el.classes.some((c) => CIRCLE.has(c)) || el.content.circleAttribute) return false;
  if (!isButtonHost(el) && ((el.tagName !== "button" && el.tagName !== "a") || !el.classes.includes("br-button"))) return false;
  if (el.content.iconOnlyVisual !== true) return false;
  if (el.rendered === false || el.axHidden || el.attributes.ariaHidden === "true") return false;
  if (DECORATIVE_ROLES.has((el.attributes.role ?? "").trim().toLowerCase())) return false;
  return true;
}

/**
 * Parte de outro componente cujo exemplo oficial traz o mesmo botão: a anatomia do hospedeiro o admite. Vale qualquer
 * hospedeiro da cadeia que esteja no conjunto (br-list dentro de br-input), não só o br-* mais próximo.
 *
 * 3.7.2: devolve o hospedeiro e até 2 exemplos oficiais com a mesma marcação — os do componente cuja raiz `br-*` está na
 * cadeia do elemento (o mais externo primeiro: o Select contém o Input), preferindo o mesmo ícone; null quando o botão não
 * é parte de um hospedeiro.
 */
export function embeddedHostOf(el: Pick<ElementEvidence, "hostComponents" | "outerHTML">): { host: string; examples: string[] } | null {
  const chain = el.hostComponents ?? [];
  const hosts = embeddedIconButtonHosts();
  const host = chain.find((h) => hosts.has(h));
  if (!host) return null;
  const icon = faIconOf(el.outerHTML) ?? /\sicon="(?:fa[srb]? )?(?:fa-)?([a-z0-9-]+)"/.exec(el.outerHTML)?.[1] ?? null;
  const inChain = new Set(chain);
  const candidates = embeddedIconButtonExamples().filter((e) => inChain.has(e.host));
  // a raiz do componente do exemplo (`br-select`) presente na cadeia do elemento; senão, qualquer exemplo do hospedeiro
  const own = candidates.filter((e) => inChain.has(`br-${e.component}`));
  const pool = own.length ? own : candidates;
  const depth = (e: EmbeddedIconButtonExample) => chain.indexOf(`br-${e.component}`);
  const outer = pool.length ? Math.max(...pool.map(depth)) : -1;
  const top = pool.filter((e) => depth(e) === outer);
  const sameIcon = top.filter((e) => icon !== null && e.icon === icon);
  const examples = [...new Set((sameIcon.length ? sameIcon : top).map((e) => e.example))].slice(0, 2);
  return { host, examples };
}

/** O controle é um botão do DS (`<button>`/`<a>` com `br-button`, ou o host `<br-button>`) só com ícone, fora da variante circular. */
export function iconOnlyNonCircleButton(el: ElementEvidence): boolean {
  return iconOnlyNonCircleFact(el) && embeddedHostOf(el) === null;
}

/** Os hospedeiros excluídos, por nome (para o texto do achado). */
const hostList = () => [...embeddedIconButtonHosts()].sort().join(", ");

/**
 * A frase do achado: a obrigação (letra do DS) e, como REGRA DO CHECK, a exceção do legado e a exclusão dos hospedeiros —
 * nunca como letra do DS (a base literal não as traz).
 */
export function iconOnlyButtonDescription(): string {
  const exception = circleException();
  return (
    "Button: 'O rótulo é um elemento obrigatório.' (required). O check aplica a exceção do texto anterior da cláusula " +
    `(legado ${exception.legacyId}): "${exception.text}" — botão com a classe circle não é acusado; nem o que é parte de ` +
    `componente do DS cujo exemplo oficial o traz só com ícone (${hostList()}).`
  );
}

/** Sem nome acessível: o defeito é do check de nome (WCAG 4.1.2), que fica com o elemento (regra de deduplicação). */
function nameless(el: ElementEvidence): boolean {
  return resolvedAccessibleName(el).name.trim() === "";
}

/** 3.7.2 (D-166): botão só com ícone fora do circular, parte de outro componente do DS — candidato a investigar. */
export interface EmbeddedIconButtonCandidate {
  locator: string;
  host: string;
  /** Exemplos oficiais com a mesma marcação (data/component-specs.json). */
  examples: string[];
}

export function checkIconOnlyButtons(page: { url: string }, elements: ElementEvidence[]): { findings: Finding[]; observations: Observation[]; candidates: EmbeddedIconButtonCandidate[] } {
  const all: Finding[] = [];
  const candidates: EmbeddedIconButtonCandidate[] = [];
  for (const el of elements) {
    // O botão desenhado no shadow root de um host `<br-button>` é do DS: quem é julgado é o host (a escolha do autor).
    if (el.origin === "ds-web-component" && el.originHost === "br-button") continue;
    if (!iconOnlyNonCircleFact(el) || nameless(el)) continue;
    // 3.7.2 (D-166): parte de outro componente cujo exemplo oficial traz o mesmo botão — candidato, nunca achado. Fora da
    // autoria da página (interno de web component do DS, terceiro embutido) não entra.
    const embeddedHost = embeddedHostOf(el);
    if (embeddedHost) {
      const own = ownershipOf(el);
      if (own !== "ds-web-component" && own !== "ds-third-party" && !candidates.some((c) => c.locator === el.locator)) {
        candidates.push({ locator: el.locator, host: embeddedHost.host, examples: embeddedHost.examples });
      }
      continue;
    }
    const name = resolvedAccessibleName(el).name.trim() || null;
    const iconName = isButtonHost(el) ? (/\sicon="([^"]*)"/.exec(el.outerHTML)?.[1] ?? "").slice(0, 30) : "";
    all.push({
      id: nextFindingId(),
      rule: {
        id: BUTTON_LABEL_REQUIRED,
        source: "govbr-ds-kb",
        description: iconOnlyButtonDescription(),
        implements: [...ICON_ONLY_BUTTON_GROUNDING.implements],
      },
      element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: page.url },
      evidence: {
        observed: isButtonHost(el)
          ? `<br-button> só com ícone${iconName ? ` (ícone ${iconName})` : ""}, sem label nem texto visível no slot e sem o atributo circle${name ? `; nome acessível "${name.slice(0, 60)}" não é rótulo visível` : ""}`
          : `br-button só com ícone, sem texto visível e sem a classe circle (classes: ${el.classes.join(" ")})${name ? `; nome acessível "${name.slice(0, 60)}" não é rótulo visível` : ""}`,
        expected: "Rótulo visível no botão (o check não acusa a variante circular, classe circle, pela exceção do legado citado na descrição)",
        data: {
          expectedCondition: ICON_ONLY_BUTTON_CONDITION,
          component: "button",
          ...(isButtonHost(el) ? { webComponent: "br-button" } : {}),
          iconOnly: true,
          circle: false,
          classes: el.classes.slice(0, 12),
          ...(name !== null ? { accessibleName: name.slice(0, 120) } : {}),
          exception: { legacyId: circleException().legacyId, context: BUTTON_CIRCLE_ICON },
        },
      },
      severity: "moderate",
      nature: "syntactic",
      mode: "display",
      pathway: "deterministic",
    });
  }
  const byLocator = new Map(elements.map((el) => [el.locator, el]));
  const outside = (f: Finding) => {
    const el = byLocator.get(f.element.locator);
    return !!el && (ownershipOf(el) === "ds-web-component" || ownershipOf(el) === "ds-third-party");
  };
  return { findings: all.filter((f) => !outside(f)), observations: demoteToObservations(all.filter(outside), elements), candidates };
}
