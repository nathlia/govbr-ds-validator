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
 * decide isso mecanicamente; `lang` já é do axe (`html-has-lang`).
 *
 * 3.6.1 (D-155, item 2): o título do documento (`ds-page-title`, e-MAG 3.3 / WCAG 2.4.2) — só o que é medível:
 * vazio/ausente (o axe também acusa: com o axe no mesmo scan, fica o do axe) e, como heurística entre scans da
 * mesma sessão, o mesmo título em rotas de assuntos diferentes que ele não contém (`titleDuplicateFinding`). Se o
 * título "descreve a página" ninguém mede: continua pendência (`document-title-adequacy`).
 */
import type { Finding } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import { getPageRules } from "../data/load.js";
import type { PageFacts, PageRegion } from "../evidence/pageFacts.js";
import { PAGE_REGION_SELECTORS } from "../evidence/pageFacts.js";
import { checkerRule, groundingFor, type CheckKind } from "./grounding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";
import { TAB_FROM_START } from "./interaction.js";

export type PageConstraintKind = "page-region" | "page-skip-link" | "page-focus-order" | "page-title";

export interface PageConstraint {
  /** Id do check, ex.: `ds-page-header` (3.6.0: vai em `rule.checker` — não é citação). */
  id: string;
  /** 3.6.0: a unidade normativa que o achado desta restrição cita em `rule.id` (o 1º id de `implements`). */
  citeAs: string | null;
  kind: PageConstraintKind;
  /** Região do Template Base (`header`, `footer`), `skip-link` ou (3.5.0) `focus-order`. */
  region: PageRegion | "skip-link" | "focus-order" | "title";
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
  // 3.6.0: citeAs = a unidade normativa que o achado cita (rule.id); o id da restrição é o check (rule.checker).
  return pageConstraintList().map(({ id, ...rest }) => ({ id, citeAs: rest.implements[0] ?? null, ...rest }));
}

function pageConstraintList(): Array<Omit<PageConstraint, "citeAs">> {
  const source = pageSource();
  const regions: Array<Omit<PageConstraint, "citeAs">> = REGION_CHECKS.map(({ region, kind, heading, component }) => ({
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
    titleConstraint(),
    {
      id: "ds-page-focus-order",
      kind: "page-focus-order",
      region: "focus-order",
      selector: "[tabindex]",
      description:
        "O salto para o conteúdo deve ser o primeiro elemento a receber o foco pelo teclado: nenhum elemento com " +
        "tabindex positivo pode recebê-lo antes (Skip Link; e-MAG 1.4 / WCAG 2.4.3). Só se aplica quando o salto existe.",
      force: "required",
      implements: [...FOCUS_ORDER_IMPLEMENTS],
      claim: { expectedCondition: EXPECTED_CONDITIONS.skipLinkFirstFocus, fields: ["region", "firstLinkHref", "expectedCondition"] },
      source: {
        url: "https://www.gov.br/ds/components/skiplink?tab=acessibilidade",
        scrapedAt: source.scrapedAt,
        excerpt: "O skip link deve ser o primeiro elemento a receber o foco na navegação por teclado",
      },
    },
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

/**
 * 3.5.0 (revisão Fable P2): o salto existe e é o 1º link, mas um tabindex positivo recebe o foco antes dele.
 * A frase do e-MAG 1.5 ("o primeiro link da página deve ser o de ir para o conteúdo") é CUMPRIDA nesse caso;
 * o que falha é "o skip link deve ser o primeiro elemento a receber o foco" (Skip Link, obrigatória) e a ordem
 * de tabulação (e-MAG 1.4 / WCAG 2.4.3). Até a 3.4.4 este caso saía como ds-page-skip-link e um juiz o lia,
 * com razão, como norma não violada. Fica fora de CHECK_GROUNDING (como o foco visível): sem tipo novo no
 * gerador de aliases do eval.
 */
export const FOCUS_ORDER_IMPLEMENTS = [
  // 3.6.0 (D-155, trios da tela A; revisão independente): o que o check MEDE decide a citação. Ele só dispara
  // quando o 1º link É o salto válido e um elemento com tabindex positivo recebe o foco antes dele; o predicado
  // (verify/predicates.ts, page-focus-order) dá rule-not-applicable sem salto e contradicted sem esse tabindex. Isto
  // é exatamente "o 1º a receber o foco pelo Tab não é o salto" — a cláusula obrigatória do Skip Link "O skip link
  // deve ser o primeiro elemento a receber o foco na navegação por teclado", que vem primeiro e é a citação
  // (rule.id). O check NÃO mede tabindex positivo nem ordem DOM × foco em geral (sem salto fica calado), então a
  // cláusula geral do e-MAG 1.4 ("sequência lógica de leitura para percorrer links, controles…"; WCAG 1.3.2/2.4.3)
  // fica como contexto, com wcag 2.4.3 na referência cruzada, e não há o que dividir. Saiu "logo após a tag body"
  // (…02c2e513d936): posição no DOM não é medida. Até a 3.5.0 o achado citava o id do check (ds-page-focus-order),
  // que nenhuma base resolve, e o juiz cego via "texto não localizado".
  "govbr-3.7.0-accessibility-skiplink-b0641993618f",
  "govbr-3.7.0-accessibility-global-fb9dfcacbb34",
  "emag-1.4",
];

/**
 * 3.6.1 (D-155, item 2): a cláusula obrigatória do e-MAG 3.3 — "O título da página deve ser descritivo e
 * informativo, devendo representar o conteúdo principal da página" — é a citação (rule.id); o e-MAG 3.3 vem
 * junto, WCAG 2.4.2 na referência cruzada. Fora de CHECK_GROUNDING (como o foco): sem tipo novo no gerador de
 * aliases do eval.
 */
export const TITLE_IMPLEMENTS = ["govbr-3.7.0-accessibility-global-9a6edd7d551e", "emag-3.3"];
export const TITLE_WCAG = "2.4.2";

function titleConstraint(): Omit<PageConstraint, "citeAs"> {
  return {
    id: "ds-page-title",
    kind: "page-title",
    region: "title",
    selector: "title",
    description:
      "O título do documento (<title>) deve existir, não ser vazio e representar o conteúdo principal da página (e-MAG 3.3 / WCAG 2.4.2). " +
      "Medido: título vazio ou ausente. Heurístico (sessão): o mesmo título em rotas de modelos diferentes cujos assuntos principais diferem e não estão nele. Se descreve a página é pendência do agente.",
    force: "required",
    implements: [...TITLE_IMPLEMENTS],
    claim: { expectedCondition: EXPECTED_CONDITIONS.documentTitle, fields: ["region", "observedTitle", "expectedCondition"] },
    source: {
      url: "https://emag.governoeletronico.gov.br/",
      scrapedAt: pageSource().scrapedAt,
      excerpt: "Recomendação 3.3 – Oferecer um título descritivo e informativo à página",
    },
  };
}

/**
 * 3.6.1 (item 2; revisão M4): a cláusula do e-MAG 3.3 diz que o título deve representar o conteúdo principal da
 * página — não que títulos sejam distintos. O sinal só dispara quando o MESMO `<title>` está em duas rotas de
 * modelos diferentes (não só um segmento de id: `/x/3028` e `/x/3038` são a mesma página-modelo), os assuntos
 * principais exibidos (h1; sem h1, o 1º título em main) das duas DIFEREM, e o título não contém nenhum deles:
 * então ele não representa o conteúdo de pelo menos uma. É inferência (heurística), não medida exata.
 */
export function titleDuplicateFinding(
  page: { url: string; route: string; heading: string },
  title: string,
  others: Array<{ route: string; scanId: string; heading: string }>,
): Finding {
  const constraint = titleConstraint();
  const clipH = (h: string) => `"${h.slice(0, 50)}"`;
  return {
    id: nextFindingId(),
    rule: { ...checkerRule(constraint.id, constraint.implements, TITLE_WCAG), description: constraint.description },
    element: { locator: "html", page: page.url },
    evidence: {
      observed: `<title> "${title.slice(0, 80)}" é o mesmo nesta rota (${page.route}, assunto ${clipH(page.heading)}) e em ${others
        .slice(0, 3)
        .map((o) => `${o.route} (${o.scanId}, assunto ${clipH(o.heading)})`)
        .join(", ")}; os assuntos diferem e o título não contém nenhum deles.`,
      expected: "O título da página deve ser descritivo e informativo, devendo representar o conteúdo principal da página (e-MAG 3.3; WCAG 2.4.2).",
      data: {
        region: "title",
        observedTitle: title,
        route: page.route,
        mainHeading: page.heading,
        sameTitleRoutes: others.slice(0, 5).map((o) => o.route),
        sameTitleScans: others.slice(0, 5).map((o) => o.scanId),
        expectedCondition: EXPECTED_CONDITIONS.documentTitle,
      },
    },
    severity: "moderate",
    nature: "semantic",
    mode: "display",
    pathway: "heuristic",
  };
}

export function checkPageStructure(page: { url: string }, facts: PageFacts): Finding[] {
  const findings: Finding[] = [];
  const element = { locator: "html", page: page.url };

  for (const constraint of pageConstraints()) {
    if (constraint.kind === "page-title") {
      // 3.6.1 (item 2): vazio ou ausente. (Duplicado entre rotas é da sessão: titleDuplicateFinding.)
      if ((facts.title ?? "").trim() !== "") continue;
      findings.push({
        id: nextFindingId(),
        rule: { ...checkerRule(constraint.id, constraint.implements, TITLE_WCAG), description: constraint.description },
        element: { locator: "html", page: page.url },
        evidence: {
          observed: "O documento não tem <title> ou o título é vazio.",
          expected: "Um <title> não vazio que represente o conteúdo principal da página (e-MAG 3.3; WCAG 2.4.2).",
          data: { region: "title", observedTitle: "", expectedCondition: EXPECTED_CONDITIONS.documentTitle },
        },
        severity: "serious",
        nature: "syntactic",
        mode: "display",
        pathway: "deterministic",
      });
      continue;
    }
    if (constraint.kind === "page-region") {
      const region = constraint.region as "header" | "footer";
      const count = facts.regions[region];
      if (count > 0 || constraint.implements.length === 0) continue;
      findings.push({
        id: nextFindingId(),
        rule: { ...checkerRule(constraint.id, constraint.implements), description: constraint.description },
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

    // page-skip-link / page-focus-order
    if (constraint.implements.length === 0 || facts.linkCount === 0 || !facts.firstLink) continue;
    const first = facts.firstLink;
    // 3.4.4 (C12): o salto existe e é o 1º link, mas um tabindex positivo recebe o foco antes dele — a
    // cláusula é sobre o primeiro a receber o foco, não sobre o primeiro link do DOM. 3.5.0 (P2): vira
    // ds-page-focus-order, com as cláusulas de "primeiro a receber o foco".
    const before = facts.positiveTabindexFirst;
    if (constraint.kind === "page-focus-order") {
      if (!(first.skipsToContent && before && !before.isFirstLink)) continue;
      findings.push({
        id: nextFindingId(),
        rule: { ...checkerRule(constraint.id, constraint.implements, "2.4.3"), description: constraint.description },
        element,
        evidence: {
          observed: `O salto para o conteúdo (href="${first.href}") é o primeiro link, mas não o primeiro a receber foco: <${before.tag}${before.id ? ` id="${before.id}"` : ""}> com tabindex=${before.tabindex}${before.text ? ` ("${before.text}")` : ""} vem antes na ordem do Tab.`,
          expected: "O salto para o conteúdo é o primeiro elemento a receber o foco (Skip Link; e-MAG 1.4 / WCAG 2.4.3); tabindex positivo põe outro elemento antes dele.",
          data: {
            region: "focus-order",
            firstLinkHref: first.href,
            targetExists: first.targetExists,
            expectedCondition: EXPECTED_CONDITIONS.skipLinkFirstFocus,
            focusedBefore: { tag: before.tag, tabindex: before.tabindex, id: before.id },
            // 3.6.5 (D-155, item 1): o fato é quem recebe o 1º Tab a partir do carregamento.
            interaction: { ...TAB_FROM_START },
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
      rule: { ...checkerRule(constraint.id, constraint.implements), description: constraint.description },
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
