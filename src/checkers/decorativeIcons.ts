/**
 * 3.5.0 (C03 da auditoria de mensurabilidade de 2026-10-30): ícone decorativo exposto e `title` que repete o link.
 *
 * (a) Ícone de apoio ao lado do rótulo, dentro de controle (button, a, role=button/link) cujo nome vem do
 *     conteúdo e que tem texto próprio, sem `aria-hidden="true"` (nem role none/presentation) e sem nome próprio.
 *     Normas servidas (rules.jsonl): Iconografia "Se os ícones são puramente decorativos é necessário adicionar
 *     manualmente um atributo aria-hidden a cada um deles" (`foundation-global-e0e913d352f3`, required) e Button
 *     "Caso seja utilizado um ícone decorativo, aquele que é usado como apoio ao lado do rótulo do botão, utilize
 *     aria-hidden=true…" (`accessibility-button-23e3cfbf49f3`, a frase da cláusula).
 * (b) Link cujo `title` repete o texto do link (normalizado) — e-MAG 3.5, "jamais repita o conteúdo do link no
 *     atributo title" (`accessibility-global-3f41d7ddc85a`, prohibited).
 *
 * Fora, de propósito: ícone sozinho (sem texto) é o caso do nome acessível (e-MAG 1.1 / 4.1.2), não de ícone
 * decorativo; controle nomeado por aria-label (o conteúdo não entra no nome); `title` em botão (a cláusula
 * proíbe title no ÍCONE decorativo, e o "rótulo obrigatório" do Button perdeu a exceção do botão circular na
 * base literal — nada aqui se apoia em `component-button-7ef75d42ac65`). Internos de web component do DS e
 * terceiros embutidos viram observação (ownership.ts).
 */
import type { ElementEvidence } from "../evidence/types.js";
import type { Finding, Observation } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import type { CheckGrounding } from "./grounding.js";
import { demoteToObservations, ownershipOf } from "./ownership.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";

export const DECORATIVE_ICON_CONDITION = EXPECTED_CONDITIONS.decorativeIconHidden;
export const LINK_TITLE_CONDITION = EXPECTED_CONDITIONS.linkTitleNotRepeated;

export const DECORATIVE_ICON_GROUNDING: CheckGrounding = {
  // Só a cláusula cujo texto descreve o medido (teste por tabela): a do Button (23e3cfbf49f3) ficou na base só com a
  // metade "não utilize atributo title", sem o aria-hidden da mesma frase — é citada na descrição, não em implements.
  implements: ["govbr-3.7.0-foundation-global-e0e913d352f3"],
  basis:
    "Iconografia (required): ícone puramente decorativo leva aria-hidden; Button: o ícone de apoio ao lado do rótulo " +
    "usa aria-hidden=true. A verificação lê só isto: ícone sem texto, sem nome próprio e não escondido, dentro de " +
    "controle cujo nome vem do conteúdo e que tem texto próprio.",
};

export const LINK_TITLE_GROUNDING: CheckGrounding = {
  implements: ["govbr-3.7.0-accessibility-global-3f41d7ddc85a", "emag-3.5"],
  basis: "e-MAG 3.5, frase literal (prohibited): 'jamais repita o conteúdo do link no atributo title'.",
};

export const CONTROL_ROLES = ["button", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "option", "switch", "treeitem"];
export const CONTROL_SELECTOR = ["a", "button", ...CONTROL_ROLES.map((r) => `[role='${r}']`)].join(", ");

/** Controle cujo conteúdo pode ter ícone de apoio (tag nativa ou papel ARIA interativo). */
export function isControl(el: ElementEvidence): boolean {
  return el.tagName === "a" || el.tagName === "button" || CONTROL_ROLES.includes((el.attributes.role ?? "").toLowerCase());
}

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** Ícones decorativos expostos (0 = nada a dizer). */
export function exposedDecorativeIcons(el: ElementEvidence): number {
  if (el.rendered === false || el.axHidden) return 0;
  return el.content.exposedIcons ?? 0;
}

/** O `title` do link repete o texto dele (ambos conhecidos por inteiro). */
export function linkTitleRepeatsText(el: ElementEvidence): boolean {
  if (el.tagName !== "a" && el.attributes.role !== "link") return false;
  if (el.rendered === false || el.axHidden) return false;
  const title = norm(el.attributes.title);
  const text = norm(el.content.textContent);
  // textContent vem cortado em 100 caracteres: só decide quando o texto cabe inteiro.
  return title !== "" && text !== "" && text.length < 100 && title === text;
}

export function checkDecorativeIcons(page: { url: string }, elements: ElementEvidence[]): { findings: Finding[]; observations: Observation[] } {
  const all: Finding[] = [];
  for (const el of elements) {
    const icons = exposedDecorativeIcons(el);
    const base = { element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: page.url } };
    if (icons > 0) {
      all.push({
        id: nextFindingId(),
        rule: {
          id: "govbr-3.7.0-foundation-global-e0e913d352f3",
          source: "govbr-ds-kb",
          description: "Ícone puramente decorativo leva aria-hidden (Iconografia; Button: ícone de apoio ao lado do rótulo com aria-hidden=true).",
          wcag: "1.1.1",
          implements: [...DECORATIVE_ICON_GROUNDING.implements],
        },
        ...base,
        evidence: {
          observed: `${icons} ícone(s) sem texto ao lado do rótulo "${el.content.textContent.slice(0, 60)}" exposto(s) à tecnologia assistiva (sem aria-hidden="true", sem nome próprio)`,
          expected: 'aria-hidden="true" no ícone decorativo',
          data: { expectedCondition: DECORATIVE_ICON_CONDITION, exposedIcons: icons, controlText: el.content.textContent.slice(0, 100) },
        },
        severity: "minor",
        nature: "syntactic",
        mode: "display",
        pathway: "deterministic",
      });
    }
    if (linkTitleRepeatsText(el)) {
      all.push({
        id: nextFindingId(),
        rule: {
          id: "govbr-3.7.0-accessibility-global-3f41d7ddc85a",
          source: "govbr-ds-kb",
          // sem critério WCAG: title redundante não reprova a 2.4.4 (revisão 3.5.0)
          description: "jamais repita o conteúdo do link no atributo title (e-MAG 3.5).",
          implements: [...LINK_TITLE_GROUNDING.implements],
        },
        ...base,
        evidence: {
          observed: `O title do link ("${(el.attributes.title ?? "").slice(0, 60)}") repete o texto do link`,
          expected: "Link sem title, ou com title que acrescenta informação",
          data: { expectedCondition: LINK_TITLE_CONDITION, title: (el.attributes.title ?? "").slice(0, 120), linkText: el.content.textContent.slice(0, 100) },
        },
        severity: "minor",
        nature: "syntactic",
        mode: "display",
        pathway: "deterministic",
      });
    }
  }
  const byLocator = new Map(elements.map((el) => [el.locator, el]));
  const outside = (f: Finding) => {
    const el = byLocator.get(f.element.locator);
    return !!el && (ownershipOf(el) === "ds-web-component" || ownershipOf(el) === "ds-third-party");
  };
  return { findings: all.filter((f) => !outside(f)), observations: demoteToObservations(all.filter(outside), elements) };
}
