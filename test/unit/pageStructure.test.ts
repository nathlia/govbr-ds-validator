/**
 * Estrutura de página (2.7.0): as regiões obrigatórias do Template Base e o salto para o conteúdo
 * viram restrições citáveis, verificadas sobre fatos do documento.
 */
import { describe, it, expect } from "vitest";
import { checkPageStructure, pageConstraints, templateBaseExcerpt } from "../../src/checkers/pageStructure.js";
import type { PageFacts } from "../../src/evidence/pageFacts.js";
import { getRuleById } from "../../src/data/knowledge.js";
import { findEmagRule } from "../../src/data/load.js";
import { EXPECTED_CONDITIONS } from "../../src/schema/structuredClaims.js";

const page = { url: "http://localhost/pagina" };

function facts(overrides: Partial<PageFacts> = {}): PageFacts {
  return {
    url: page.url,
    lang: "pt-br",
    title: "Página",
    regions: { header: 1, footer: 1, breadcrumb: 0, cookiebar: 0, menu: 0 },
    mainLandmarks: 1,
    linkCount: 3,
    firstLink: { href: "#main", text: "Ir para o conteúdo", targetId: "main", targetExists: true, skipsToContent: true },
    ...overrides,
  };
}

describe("pageConstraints — o que get_page_rules publica", () => {
  it("publica cabeçalho, rodapé e salto para o conteúdo, cada um com norma existente (D-27)", () => {
    const constraints = pageConstraints();
    expect(constraints.map((c) => c.id)).toEqual(["ds-page-header", "ds-page-footer", "ds-page-skip-link"]);
    for (const constraint of constraints) {
      expect(constraint.implements.length).toBeGreaterThan(0);
      for (const id of constraint.implements) {
        const exists = id.startsWith("emag-") ? !!findEmagRule(id.replace(/^emag-/, "")) : !!getRuleById(id);
        expect(exists, `${constraint.id} implementa '${id}', que não existe`).toBe(true);
      }
    }
  });

  it("cita o trecho integral do Template Base que declara a área obrigatória — a fonte é o arquivo de dados", () => {
    expect(templateBaseExcerpt("Área de Cabeçalho (Obrigatório)")).toMatch(/^Área de Cabeçalho \(Obrigatório\) — Esta é uma área essencial e obrigatória/);
    expect(templateBaseExcerpt("Área de Rodapé (Obrigatório)")).toMatch(/^Área de Rodapé \(Obrigatório\) — Esta é uma área essencial do template base/);
    expect(templateBaseExcerpt("Área de Localização (Obrigatório)")).toBeNull();
    const byId = Object.fromEntries(pageConstraints().map((c) => [c.id, c]));
    expect(byId["ds-page-header"].source.url).toBe("https://www.gov.br/ds/templates/base");
    expect(byId["ds-page-footer"].source.excerpt).toContain("Rodapé (Obrigatório)");
  });
});

describe("checkPageStructure", () => {
  it("não acusa nada numa página com cabeçalho, rodapé e salto para o conteúdo", () => {
    expect(checkPageStructure(page, facts())).toEqual([]);
  });

  it("acusa a ausência de cabeçalho e de rodapé com a alegação estruturada que o predicado exige", () => {
    const findings = checkPageStructure(page, facts({ regions: { header: 0, footer: 0, breadcrumb: 0, cookiebar: 0, menu: 0 } }));
    expect(findings.map((f) => f.rule.id)).toEqual(["ds-page-header", "ds-page-footer"]);
    for (const finding of findings) {
      expect(finding.rule.source).toBe("govbr-ds-page");
      expect(finding.pathway).toBe("deterministic");
      expect(finding.element.locator).toBe("html");
      expect(finding.rule.implements).toContain("govbr-3.7.0-template-global-19f93475dc5e");
      expect(finding.evidence.data).toMatchObject({ observedCount: 0, expectedCondition: EXPECTED_CONDITIONS.pageRegion });
    }
  });

  it("acusa quando o primeiro link não é âncora interna, ou aponta para alvo inexistente", () => {
    const externo = checkPageStructure(page, facts({ firstLink: { href: "/inicio", text: "Início", targetId: null, targetExists: false, skipsToContent: false } }));
    expect(externo.map((f) => f.rule.id)).toEqual(["ds-page-skip-link"]);
    expect(externo[0].rule.implements).toEqual(["govbr-3.7.0-accessibility-global-7d2b85f81c52", "emag-1.5"]);
    expect(externo[0].evidence.data).toMatchObject({ region: "skip-link", firstLinkHref: "/inicio", expectedCondition: EXPECTED_CONDITIONS.skipLink });

    const quebrado = checkPageStructure(page, facts({ firstLink: { href: "#conteudo", text: "Pular", targetId: "conteudo", targetExists: false, skipsToContent: false } }));
    expect(quebrado.map((f) => f.rule.id)).toEqual(["ds-page-skip-link"]);
    expect(quebrado[0].evidence.observed).toContain("#conteudo");
  });

  it("não cobra salto para o conteúdo de uma página sem nenhum link", () => {
    expect(checkPageStructure(page, facts({ linkCount: 0, firstLink: null }))).toEqual([]);
  });
});
