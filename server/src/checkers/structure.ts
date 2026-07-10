/**
 * B1 — deterministic component-structure checker. Compares observed DOM
 * elements carrying a `br-*` root class against the canonical component spec
 * extracted from the official @govbr-ds/core examples (A3: automatic
 * comparison implementation × specification).
 */
import type { Finding } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import type { ComponentSpec } from "../data/load.js";
import { findEmagRule } from "../data/load.js";
import type { ElementEvidence } from "../evidence/types.js";

const INTERACTIVE_TAGS = new Set(["button", "a", "input", "select", "textarea"]);

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
    if (spec.tags.length > 0 && !spec.tags.includes(el.tagName.toLowerCase())) {
      findings.push({
        id: nextFindingId(),
        rule: {
          id: `ds-structure-${spec.name}-tag`,
          source: "govbr-ds-structure",
          description: `Nos exemplos oficiais do gov.br DS, ${spec.rootClass} é aplicado a <${spec.tags.join(">/<")}>.`,
        },
        ...base,
        evidence: {
          observed: `${spec.rootClass} aplicado a <${el.tagName.toLowerCase()}>`,
          expected: `Elemento <${spec.tags.join("> ou <")}>`,
          data: { component: spec.name, observedTag: el.tagName.toLowerCase(), canonicalTags: spec.tags },
        },
        severity: "serious",
        nature: "syntactic",
        mode: "interaction",
        pathway: "deterministic",
      });
    }

    // 2. Icon-only interactive element needs an accessible name
    const isInteractive = INTERACTIVE_TAGS.has(el.tagName.toLowerCase()) || el.attributes.role === "button";
    if (isInteractive && el.content.hasIconOnly && !el.attributes.ariaLabel && !el.attributes.alt) {
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
        },
        ...base,
        evidence: {
          observed: `Elemento interativo apenas com ícone, sem aria-label (${spec.rootClass})`,
          expected: "aria-label descritivo (os exemplos oficiais de botão circular sempre trazem aria-label)",
          data: { component: spec.name, hasIconOnly: true, ariaLabel: null },
        },
        severity: "serious",
        nature: "syntactic",
        mode: "interaction",
        pathway: "deterministic",
      });
    }

    // 3. Variant classes not present in any canonical example — review signal
    const unknown = el.classes.filter(
      (c) =>
        c !== spec.rootClass &&
        c.startsWith(`${spec.rootClass}-`) === false &&
        !spec.variantClasses.includes(c) &&
        !/^(?:[mp][trblxy]?-(?:n?\d+|auto)|bg-[\w-]+|text-[\w-]+|d-[\w-]+|col(?:-[\w-]+)?|row)$/.test(c) &&
        !c.startsWith("br-") // other DS components composed on the same element
    );
    if (unknown.length > 0) {
      findings.push({
        id: nextFindingId(),
        rule: {
          id: `ds-structure-${spec.name}-variant`,
          source: "govbr-ds-structure",
          description: `Classes de variação de ${spec.rootClass} devem ser as documentadas nos exemplos e na folha de estilo oficiais (${spec.variantClasses.join(", ")}).`,
        },
        ...base,
        evidence: {
          observed: `Classes não canônicas em ${spec.rootClass}: ${unknown.join(", ")}`,
          expected: `Variantes documentadas: ${spec.variantClasses.join(", ")}`,
          data: { component: spec.name, unknownClasses: unknown, canonicalVariants: spec.variantClasses },
        },
        severity: "minor",
        nature: "syntactic",
        mode: "display",
        pathway: "deterministic",
      });
    }
  }

  return findings;
}
