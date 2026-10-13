/**
 * B1 — deterministic component-structure checker. Compares observed DOM
 * elements carrying a `br-*` root class against the canonical component spec
 * extracted from the official @govbr-ds/core examples (A3: automatic
 * comparison implementation × specification).
 */
import type { Finding, Observation } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import type { ComponentSpec } from "../data/load.js";
import { findEmagRule, ownAndBorrowedTags } from "../data/load.js";
import type { ElementEvidence } from "../evidence/types.js";
import { CHECK_GROUNDING, groundingFor } from "./grounding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import { isInteractiveEvidence, resolvedAccessibleName } from "../evidence/accessibleName.js";

/** D-28: <hr> expressa separação temática nativamente; o exemplo <span> não prevalece sobre HTML. */
function isSemanticDividerException(el: ElementEvidence, spec: ComponentSpec): boolean {
  return spec.name === "divider" && el.tagName.toLowerCase() === "hr";
}

/** Um `<a>` que leva a algum lugar: href presente e que não seja `#`, vazio nem `javascript:`. */
function navigates(el: ElementEvidence): boolean {
  const href = el.attributes.href?.trim();
  return !!href && href !== "#" && !/^javascript:/i.test(href);
}

/**
 * A tag é aceita quando está nos exemplos do próprio componente, ou quando está nos exemplos de
 * OUTRO componente e o uso é o mesmo de lá. O único caso emprestado hoje é `<a class="br-button">`:
 * o DS o publica como link com aparência de botão (breadcrumb, footer, menu), então vale quando o
 * link navega — e continua acusado quando é uma âncora fazendo papel de ação (`href="#"`). Antes
 * do D-51 o verificador lia só a pasta do botão e recusava a marcação oficial do breadcrumb.
 */
function tagAccepted(el: ElementEvidence, spec: ComponentSpec): boolean {
  const tag = el.tagName.toLowerCase();
  const { own, borrowed } = ownAndBorrowedTags(spec);
  if (own.includes(tag)) return true;
  return borrowed.includes(tag) && (tag !== "a" || navigates(el));
}

export function checkComponentStructure(
  page: { url: string },
  elements: ElementEvidence[],
  spec: ComponentSpec
): Finding[] {
  const findings: Finding[] = [];

  for (const el of elements) {
    if (!el.classes.includes(spec.rootClass)) continue;

    const base = {
      element: {
        locator: el.locator,
        snippet: el.outerHTML.slice(0, 300),
        page: page.url,
      },
    };

    // 1. Root element tag must match the canonical examples
    const { own, borrowed } = ownAndBorrowedTags(spec);
    const expectedTags = own.length > 0 ? own : spec.tags;
    if (spec.tags.length > 0 && !tagAccepted(el, spec) && !isSemanticDividerException(el, spec)) {
      findings.push({
        id: nextFindingId(),
        rule: {
          id: `ds-structure-${spec.name}-tag`,
          source: "govbr-ds-structure",
          description: `Nos exemplos oficiais do gov.br DS, ${spec.rootClass} é aplicado a <${expectedTags.join(">/<")}>${borrowed.includes("a") ? "; <a> só aparece como link que navega" : ""}.`,
          implements: groundingFor("structure-tag"),
        },
        ...base,
        evidence: {
          observed: `${spec.rootClass} aplicado a <${el.tagName.toLowerCase()}>`,
          expected: `Elemento <${expectedTags.join("> ou <")}>`,
          data: {
            component: spec.name,
            observedTag: el.tagName.toLowerCase(),
            expectedCondition: EXPECTED_CONDITIONS.structureTag,
            canonicalTags: expectedTags,
          },
        },
        severity: "serious",
        nature: "syntactic",
        mode: "interaction",
        pathway: "deterministic",
      });
    }

    // 2. Icon-only interactive element needs an accessible name.
    //    2.8.0 (NAT-33): decide pelo nome acessível — o calculado pelo Chromium quando colhido —, não
    //    pela presença de aria-label. Nome por title, aria-labelledby ou conteúdo é nome. A convenção
    //    dos exemplos do DS (botão circular com aria-label) não é a regra 4.1.2 e não sai aqui (D-27).
    if (isInteractiveEvidence(el) && el.content.hasIconOnly) {
      const accessibleName = resolvedAccessibleName(el);
      if (accessibleName.name === "") {
        const emag = findEmagRule("2.2");
        findings.push({
          id: nextFindingId(),
          rule: {
            id: "emag-2.2",
            source: "emag",
            description:
              emag?.description ??
              "Garantir que os objetos programáveis sejam acessíveis — elementos interativos precisam de nome acessível.",
            wcag: "4.1.2",
            implements: groundingFor("structure-accessible-name"),
          },
          ...base,
          evidence: {
            observed: `Elemento interativo apenas com ícone, sem nome acessível (${spec.rootClass})`,
            expected: "Nome acessível não vazio — por conteúdo, aria-labelledby, aria-label ou title",
            data: {
              component: spec.name,
              hasIconOnly: true,
              accessibleName: "",
              accessibleNameSource: accessibleName.source,
              ariaLabel: el.attributes.ariaLabel ?? null,
            },
          },
          severity: "serious",
          nature: "syntactic",
          mode: "interaction",
          pathway: "deterministic",
        });
      }
    }

    // 3. Classes fora do vocabulário canônico — ver `collectStructureObservations`. NÃO é achado:
    //    nenhuma regra do gov.br DS proíbe classe extra num componente (D-27).
  }

  return findings;
}

/** Classes que não são variante canônica nem utilitária conhecida nem outro componente `br-*`. */
function unknownClasses(el: ElementEvidence, spec: ComponentSpec): string[] {
  return el.classes.filter(
    (c) =>
      c !== spec.rootClass &&
      c.startsWith(`${spec.rootClass}-`) === false &&
      !spec.variantClasses.includes(c) &&
      !/^(?:[mp][trblxy]?-(?:n?\d+|auto)|bg-[\w-]+|text-[\w-]+|d-[\w-]+|col(?:-[\w-]+)?|row)$/.test(c) &&
      !c.startsWith("br-") // other DS components composed on the same element
  );
}

/**
 * Sinais de revisão da estrutura (D-27) — informação para quem olha a página, fora da pontuação.
 *
 * A classe fora do vocabulário canônico costumava sair como achado de severidade `minor`. Ela não
 * tem norma que a sustente, e o custo de fingir que tem era alto: numa tela realista virava a maior
 * fonte isolada de falso positivo, concentrada justamente nos elementos que o D-24 tornou
 * conformes — isto é, penalizando o braço COM oráculo por uma decisão do corpus.
 */
export function collectStructureObservations(
  page: { url: string },
  elements: ElementEvidence[],
  spec: ComponentSpec
): Observation[] {
  const observations: Observation[] = [];

  for (const el of elements) {
    if (!el.classes.includes(spec.rootClass)) continue;
    if (isSemanticDividerException(el, spec)) {
      observations.push({
        kind: "structure-semantic-native-tag",
        element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: page.url },
        note: "br-divider aplicado a <hr>: diverge do exemplo canônico em <span>, mas preserva a semântica nativa de separação temática do HTML.",
        whyNotAFinding: "A anatomia do exemplo oficial não justifica rebaixar um elemento HTML semanticamente correto; caso de conflito especificação × semântica registrado no D-28.",
        data: { component: spec.name, observedTag: "hr", canonicalTags: spec.tags },
      });
    }
    const unknown = unknownClasses(el, spec);
    if (unknown.length === 0) continue;

    observations.push({
      kind: "structure-unknown-classes",
      element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: page.url },
      note: `Classes fora do vocabulário canônico em ${spec.rootClass}: ${unknown.join(", ")}. Variantes documentadas: ${spec.variantClasses.join(", ") || "(nenhuma)"}.`,
      whyNotAFinding: CHECK_GROUNDING["structure-unknown-classes"].basis,
      data: { component: spec.name, unknownClasses: unknown, canonicalVariants: spec.variantClasses },
    });
  }

  return observations;
}
