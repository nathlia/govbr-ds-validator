/**
 * Estrutura de página (2.7.0): o Template Base e o Padrão Mínimo lidos como restrições citáveis.
 *
 * Até a 2.6.0 as diretrizes de página só existiam como prosa em `get_page_rules`: o agente podia
 * lê-las, mas um achado baseado nelas não tinha id que o portão reconhecesse, e nas seis execuções
 * com oráculo das baterias de 18/09 nenhuma pediu o Template Base ou o Padrão Mínimo. Aqui a
 * anatomia obrigatória do Template Base vira restrição com id, do mesmo jeito que a tag raiz de um
 * componente virou `ds-structure-<componente>-tag` no D-29: publicada em `get_page_rules`,
 * verificada no `scan_page`, reconhecida pelo portão e recalculável por predicado.
 *
 * A fonte é o texto integral da página oficial do Template Base (`data/ds-page-rules.json`,
 * `page_structure`), que nomeia cada área e diz se é obrigatória: "1. Área de Cabeçalho
 * (Obrigatório)", "5. Área de Rodapé (Obrigatório)". O D-29 tinha vetado inferir rodapé
 * obrigatório do excerto truncado "Template Base como ponto de partida"; o veto era sobre a fonte
 * truncada, e o texto integral resolve a inferência — o trecho citado sai do próprio arquivo de
 * dados, e o teste falha se ele sumir de lá. O salto para o conteúdo vem do e-MAG 1.5, que é
 * explícito: o primeiro link da página.
 *
 * Regiões contam pela classe raiz do core ou pelo web component (`<br-header>`), no DOM claro ou em
 * shadow roots abertos — ver `evidence/pageFacts.ts`.
 *
 * O que fica fora, de propósito: Área de Localização e de Navegação são opcionais; "breadcrumb
 * primeiro na área de conteúdo" depende de saber onde a área de conteúdo começa, e o oráculo não
 * decide isso mecanicamente; título e `lang` já são do axe (`document-title`, `html-has-lang`).
 */
import type { Finding } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import { getPageRules } from "../data/load.js";
import type { PageFacts, PageRegion } from "../evidence/pageFacts.js";
import { PAGE_REGION_SELECTORS } from "../evidence/pageFacts.js";
import { groundingFor, type CheckKind } from "./grounding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";

export type PageConstraintKind = "page-region" | "page-skip-link";

export interface PageConstraint {
  /** Id citável, ex.: `ds-page-header`. */
  id: string;
  kind: PageConstraintKind;
  /** Região do Template Base (`header`, `footer`) ou `skip-link`. */
  region: PageRegion | "skip-link";
  selector: string | null;
  description: string;
  force: "required";
  /** Ids normativos que sustentam a restrição (D-27). */
  implements: string[];
  /** O que uma alegação verificável precisa trazer em `evidence.data`. */
  claim: { expectedCondition: string; fields: string[] };
  source: { url: string; scrapedAt: string; excerpt: string | null };
}

const REGION_CHECKS: Array<{ region: "header" | "footer"; kind: CheckKind; heading: string; component: string }> = [
  { region: "header", kind: "page-header", heading: "Área de Cabeçalho (Obrigatório)", component: "Header" },
  { region: "footer", kind: "page-footer", heading: "Área de Rodapé (Obrigatório)", component: "Footer" },
];

/** O trecho da página oficial que nomeia a área e a declara obrigatória — provado presente pelos testes. */
export function templateBaseExcerpt(heading: string): string | null {
  const text = getPageRules().categories.page_structure?.sections?.["visao-geral"];
  if (typeof text !== "string") return null;
  const start = text.indexOf(heading);
  if (start < 0) return null;
  const body = text.slice(start);
  const firstSentence = body.slice(heading.length).split(/(?<=\.)\s/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  return `${heading} — ${firstSentence}`;
}

function pageSource(): { url: string; scrapedAt: string } {
  const rules = getPageRules();
  return { url: rules.categories.page_structure?.url ?? "https://www.gov.br/ds/templates/base", scrapedAt: rules.meta.scrapedAt };
}

/** As restrições de página publicadas por `get_page_rules` — as mesmas que o scanner e o portão usam. */
export function pageConstraints(): PageConstraint[] {
  const source = pageSource();
  const regions: PageConstraint[] = REGION_CHECKS.map(({ region, kind, heading, component }) => ({
    id: `ds-page-${region}`,
    kind: "page-region",
    region,
    selector: PAGE_REGION_SELECTORS[region],
    description:
      `O Template Base tem uma ${heading.replace(/ \(Obrigatório\)$/, "")} obrigatória, ocupada pelo componente ${component} ` +
      `(${PAGE_REGION_SELECTORS[region]} do core ou o web component <br-${region}>). Uma página sem nenhum dos dois não a preenche.`,
    force: "required",
    implements: groundingFor(kind),
    claim: { expectedCondition: EXPECTED_CONDITIONS.pageRegion, fields: ["region", "observedCount", "expectedCondition"] },
    source: { ...source, excerpt: templateBaseExcerpt(heading) },
  }));
  return [
    ...regions,
    {
      id: "ds-page-skip-link",
      kind: "page-skip-link",
      region: "skip-link",
      selector: "a[href]",
      description:
        "O primeiro link da página deve ser o salto para o conteúdo: uma âncora interna (href=\"#id\") cujo alvo existe " +
        "no documento (e-MAG 1.5). Página sem nenhum link não é cobrada.",
      force: "required",
      implements: groundingFor("page-skip-link"),
      claim: { expectedCondition: EXPECTED_CONDITIONS.skipLink, fields: ["region", "firstLinkHref", "expectedCondition"] },
      source: { url: "https://emag.governoeletronico.gov.br/", scrapedAt: source.scrapedAt, excerpt: "Recomendação 1.5 – Fornecer âncoras para ir direto a um bloco de conteúdo: É importante ressaltar que o primeiro link da página deve ser o de ir para o conteúdo." },
    },
  ];
}

export function checkPageStructure(page: { url: string }, facts: PageFacts): Finding[] {
  const findings: Finding[] = [];
  const element = { locator: "html", page: page.url };

  for (const constraint of pageConstraints()) {
    if (constraint.kind === "page-region") {
      const region = constraint.region as "header" | "footer";
      const count = facts.regions[region];
      if (count > 0 || constraint.implements.length === 0) continue;
      findings.push({
        id: nextFindingId(),
        rule: { id: constraint.id, source: "govbr-ds-page", description: constraint.description, implements: constraint.implements },
        element,
        evidence: {
          observed: `Nenhum elemento ${constraint.selector} nem web component <br-${region}> no documento (DOM claro e shadow roots abertos).`,
          expected: `Uma ${region === "header" ? "Área de Cabeçalho com o componente Header" : "Área de Rodapé com o componente Footer"} (${constraint.selector} ou <br-${region}>), como o Template Base exige.`,
          data: { region, selector: constraint.selector, observedCount: count, expectedCondition: EXPECTED_CONDITIONS.pageRegion },
        },
        severity: "serious",
        nature: "syntactic",
        mode: "display",
        pathway: "deterministic",
      });
      continue;
    }

    // page-skip-link
    if (constraint.implements.length === 0 || facts.linkCount === 0 || !facts.firstLink) continue;
    const first = facts.firstLink;
    // 3.4.4 (C12): o salto existe e é o 1º link, mas um tabindex positivo recebe o foco antes dele — a
    // cláusula é sobre o primeiro a receber o foco, não sobre o primeiro link do DOM.
    const before = facts.positiveTabindexFirst;
    if (first.skipsToContent && before && !before.isFirstLink) {
      findings.push({
        id: nextFindingId(),
        rule: { id: constraint.id, source: "govbr-ds-page", description: constraint.description, implements: constraint.implements },
        element,
        evidence: {
          observed: `O salto para o conteúdo (href="${first.href}") é o primeiro link, mas não o primeiro a receber foco: <${before.tag}${before.id ? ` id="${before.id}"` : ""}> com tabindex=${before.tabindex}${before.text ? ` ("${before.text}")` : ""} vem antes na ordem do Tab.`,
          expected: "O salto para o conteúdo é o primeiro elemento a receber o foco (e-MAG 1.5); tabindex positivo põe outro elemento antes dele.",
          data: {
            region: "skip-link",
            firstLinkHref: first.href,
            targetExists: first.targetExists,
            expectedCondition: EXPECTED_CONDITIONS.skipLink,
            focusedBefore: { tag: before.tag, tabindex: before.tabindex, id: before.id },
          },
        },
        severity: "serious",
        nature: "syntactic",
        mode: "interaction",
        pathway: "deterministic",
      });
      continue;
    }
    if (first.skipsToContent) continue;
    findings.push({
      id: nextFindingId(),
      rule: { id: constraint.id, source: "govbr-ds-page", description: constraint.description, implements: constraint.implements },
      element,
      evidence: {
        observed: first.targetId === null
          ? `O primeiro link da página (href="${first.href}"${first.text ? `, "${first.text}"` : ""}) não é uma âncora interna.`
          : `O primeiro link da página aponta para "#${first.targetId}", que não existe no documento.`,
        expected: "O primeiro link da página é o salto para o conteúdo: âncora interna cujo alvo existe (e-MAG 1.5).",
        data: { region: "skip-link", firstLinkHref: first.href, targetExists: first.targetExists, expectedCondition: EXPECTED_CONDITIONS.skipLink },
      },
      severity: "serious",
      nature: "syntactic",
      mode: "display",
      pathway: "deterministic",
    });
  }
  return findings;
}
