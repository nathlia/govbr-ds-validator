/**
 * Anatomia obrigatória ausente (2.13.0, NAT-85 P2) no `scan_page`, dentro do check `structure`.
 *
 * A fonte é a tabela "Anatomia" da aba Designer de cada componente, na base literal (D-124): uma
 * linha marcada "Obrigatório" é parte exigida. A raiz é a classe da aba Desenvolvedor
 * (`.br-message`, `.br-header`, `.br-breadcrumb`, `.br-modal`). O scanner só emite achado quando a
 * decisão do predicado do portão daria `verified` na raiz — a mesma função decide nos dois lados
 * (verify/contextual.ts), e o portão reconfirma o achado ao vivo pelos mesmos dados estruturados.
 *
 * Âncora de ausência: o achado aponta para a RAIZ (a parte não existe para ser apontada) e diz em
 * `evidence.data` qual parte falta. Raiz oculta, raiz fechada, parte opcional ou variante que o DOM
 * não declara não geram achado.
 */
import type { Finding } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import { getRuleById } from "../data/knowledge.js";
import type { AnatomyFacts } from "../evidence/context.js";
import { ANATOMY_PARTS, decideAnatomyPart, decideCurrentCrumbNotLink } from "../verify/contextual.js";

/** Raízes de componente que têm parte obrigatória com predicado. */
export const ANATOMY_ROOT_SELECTOR = ".br-message, .br-header, .br-breadcrumb, .br-modal";

export interface AnatomyRoot {
  locator: string;
  snippet?: string;
  facts: AnatomyFacts;
}

const CRUMB_RULE = "govbr-3.7.0-accessibility-breadcrumb-53db61fa81f9";

function ruleText(id: string): string {
  return getRuleById(id)?.originalText.replace(/\s+/g, " ").trim() ?? id;
}

export function checkAnatomy(page: { url: string }, roots: AnatomyRoot[], components?: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const root of roots) {
    let titleMissing = false;
    for (const part of ANATOMY_PARTS) {
      if (components && !components.includes(part.component)) continue;
      if (!root.facts.classes.includes(`br-${part.component}`)) continue;
      const outcome = decideAnatomyPart(part, root.facts);
      if (outcome.status !== "verified") continue;
      if (part.part === "titulo-pagina-atual") titleMissing = true;
      const [id] = part.rules;
      findings.push({
        id: nextFindingId(),
        rule: { id, source: "govbr-ds-kb", description: ruleText(id), implements: part.rules },
        element: { locator: root.locator, page: page.url, ...(root.snippet ? { snippet: root.snippet } : {}) },
        evidence: {
          observed: `Parte obrigatória ausente na raiz .br-${part.component}: ${outcome.detail}`,
          expected: `${part.label} presente, como a tabela de anatomia do componente exige.`,
          data: { component: part.component, part: part.part, expectedCondition: EXPECTED_CONDITIONS.anatomyPart },
        },
        severity: "moderate",
        nature: "syntactic",
        mode: "display",
        pathway: "deterministic",
      });
    }
    // "Título da página atual ausente" e "a página atual é link" na mesma raiz se contradizem: quando o
    // título falta, o último item não é a página atual, e só o primeiro achado sai.
    if (!titleMissing && (!components || components.includes("breadcrumb")) && root.facts.classes.includes("br-breadcrumb")) {
      const outcome = decideCurrentCrumbNotLink(root.facts);
      if (outcome.status === "verified") {
        findings.push({
          id: nextFindingId(),
          rule: { id: CRUMB_RULE, source: "govbr-ds-kb", description: ruleText(CRUMB_RULE), implements: [CRUMB_RULE] },
          element: { locator: root.locator, page: page.url, ...(root.snippet ? { snippet: root.snippet } : {}) },
          evidence: {
            observed: `Breadcrumb: ${outcome.detail}`,
            expected: "A página atual (último item) não é link.",
            data: { component: "breadcrumb", expectedCondition: EXPECTED_CONDITIONS.currentCrumbNotLink },
          },
          severity: "moderate",
          nature: "syntactic",
          mode: "display",
          pathway: "deterministic",
        });
      }
    }
  }
  return findings;
}
