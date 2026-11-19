import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFindings, buildReport, renderMarkdown, persistReport } from "../../src/report/report.js";
import { VerificationStore } from "../../src/verify/store.js";
import type { Finding, Verification } from "../../src/schema/finding.js";
import { knowledgeLockAttempts, runKnowledgeLocked } from "../../src/data/lock.js";

const valid: Finding = {
  id: "F-001",
  rule: { id: "ds-token-color", source: "govbr-ds-token", description: "Cores devem usar tokens do DS." },
  element: { locator: "#btn", snippet: "<button>x</button>", page: "http://localhost:3000" },
  evidence: { observed: "background #ff0000", expected: "token do DS", data: { observedHex: "#ff0000" } },
  severity: "moderate",
  nature: "syntactic",
  mode: "display",
  pathway: "deterministic",
};

const heuristic: Finding = { ...valid, id: "F-003", pathway: "heuristic" };
const explicit: Finding = { ...valid, id: "F-004", pathway: "explicit" };

function serverVerdict(verdict: Verification["verdict"]): Verification {
  return { verdict, verifiedBy: `servidor-${verdict}`, detail: `resultado ${verdict}` };
}

describe("validateFindings", () => {
  it("accepts deterministic findings the server produced", () => {
    const { accepted, rejected } = validateFindings([], { serverFindings: [valid] });
    expect(accepted).toHaveLength(1);
    expect(rejected).toEqual([]);
  });

  it("refuses a deterministic finding submitted by the client", () => {
    const { accepted, rejected } = validateFindings([valid]);
    expect(accepted).toEqual([]);
    expect(rejected[0].errors[0]).toContain("finding_ids");
  });

  it("rejects invalid findings with actionable field errors", () => {
    const { accepted, rejected } = validateFindings([{ id: "F-002", rule: { id: "x" } }]);
    expect(accepted).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errors.join(" ")).toMatch(/rule\.source|element/);
  });

  it("rejects heuristic findings the server never verified (C3 gate)", () => {
    const { rejected } = validateFindings([heuristic]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errors[0]).toContain("verify_finding");
  });

  it("ignores a caller-invented verification: confirmed without a server record is refused", () => {
    const invented = { ...heuristic, verification: { verdict: "confirmed", verifiedBy: "eu mesmo" } };
    const store = new VerificationStore();
    const { accepted, rejected } = validateFindings([invented], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(rejected[0].errors[0]).toContain("não corresponde");
  });

  it("uses the server-held verification and discards the submitted one", () => {
    const store = new VerificationStore();
    store.record(heuristic, serverVerdict("confirmed"));
    const submitted = { ...heuristic, verification: { verdict: "rejected", verifiedBy: "texto do agente" } };
    const { accepted } = validateFindings([submitted], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].verification?.verifiedBy).toBe("servidor-confirmed");
  });

  it("refuses a payload changed after verification", () => {
    const store = new VerificationStore();
    store.record(heuristic, serverVerdict("confirmed"));
    const changed = { ...heuristic, evidence: { ...heuristic.evidence, observed: "outra coisa" }, verification: serverVerdict("confirmed") };
    const { accepted, rejected } = validateFindings([changed], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(rejected[0].errors[0]).toContain("alterado");
  });

  it("keeps unverifiable heuristic findings as labeled review items, neither promoted nor dropped", () => {
    const store = new VerificationStore();
    store.record(heuristic, serverVerdict("unverifiable"));
    const { accepted, reviewItems, rejected } = validateFindings([heuristic], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([]);
    expect(reviewItems).toHaveLength(1);
    expect(reviewItems[0].verification?.verdict).toBe("unverifiable");
  });

  it("refuses heuristic findings the gate rejected, with the gate's reason", () => {
    const store = new VerificationStore();
    store.record(heuristic, serverVerdict("rejected"));
    const { rejected } = validateFindings([heuristic], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(rejected[0].errors[0]).toContain("resultado rejected");
  });

  it("accepts an explicit finding only when the server verdict is confirmed", () => {
    const store = new VerificationStore();
    store.record(explicit, serverVerdict("confirmed"));
    const { accepted, reviewItems, rejected } = validateFindings([explicit], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].verification?.verdict).toBe("confirmed");
    expect(reviewItems).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it("routes an explicit finding with an unverifiable server verdict to review", () => {
    const store = new VerificationStore();
    store.record(explicit, serverVerdict("unverifiable"));
    const { accepted, reviewItems, rejected } = validateFindings([explicit], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(reviewItems[0].verification?.verdict).toBe("unverifiable");
    expect(rejected).toEqual([]);
  });

  it("refuses an explicit finding the server rejected", () => {
    const store = new VerificationStore();
    store.record(explicit, serverVerdict("rejected"));
    const { accepted, reviewItems, rejected } = validateFindings([explicit], { verificationFor: (f) => store.lookup(f)?.verification });
    expect(accepted).toEqual([]);
    expect(reviewItems).toEqual([]);
    expect(rejected[0].errors[0]).toContain("resultado rejected");
  });

  it("keeps an unverified explicit finding in review without inventing a gate verdict", () => {
    const submitted = { ...explicit, verification: serverVerdict("confirmed") };
    const { accepted, reviewItems, rejected } = validateFindings([submitted]);
    expect(accepted).toEqual([]);
    expect(reviewItems).toEqual([explicit]);
    expect(reviewItems[0].verification).toBeUndefined();
    expect(rejected).toEqual([]);
  });
});

describe("report rendering and persistence", () => {
  it("renders human-readable Markdown with evidence triple and disclaimer", () => {
    const report = buildReport("http://localhost:3000", [valid], "nota de teste");
    const md = renderMarkdown(report);
    expect(md).toContain("# Relatório de validação");
    expect(md).toContain("**O que foi encontrado:** background #ff0000");
    expect(md).toContain("**O que se espera:** token do DS");
    expect(md).toContain("triagem para revisão humana");
    expect(md).toContain("nota de teste");
  });

  it("renders review items in their own section, outside the finding total", () => {
    const review = {
      ...heuristic,
      verification: {
        ...serverVerdict("unverifiable"),
        checks: { ruleExists: "pass", applicability: "pass", evidenceConsistent: "pass", violation: "no-predicate" },
      } as Verification,
    };
    const report = buildReport("http://localhost:3000", [valid], undefined, [review]);
    expect(report.summary.total).toBe(1);
    expect(report.summary.reviewItems).toBe(1);
    const md = renderMarkdown(report);
    expect(md).toContain("## Itens para revisão — verificação inconclusiva");
    expect(md).toContain("violação — sem predicado no oráculo (não recalculada)");
  });

  it("persists machine JSON + human Markdown side by side", () => {
    const dir = mkdtempSync(join(tmpdir(), "govbr-report-"));
    const report = buildReport("http://localhost:3000/page", [valid]);
    const { jsonPath, markdownPath } = persistReport(report, dir);
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(markdownPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(parsed.summary.total).toBe(1);
    expect(parsed.findings[0].id).toBe("F-001");
    expect(parsed.reviewItems).toEqual([]);
  });
});

// ── 3.8.0: o relatório Markdown legível (só apresentação; o JSON não muda) ──

const PAGE = "http://localhost:3000/vistorias";

function axeFinding(id: string, n: number, over: Partial<Finding> = {}, rule = "button-name"): Finding {
  return {
    id,
    rule: { id: rule, source: "axe-core", description: "Buttons must have discernible text (e-MAG 1.1: Respeitar os padrões web)", wcag: "4.1.2" },
    element: { locator: `tr:nth-child(${n}) > td > button`, snippet: "<button class=\"br-button\"></button>", page: PAGE },
    evidence: {
      observed: "Fix any of the following:\n  Element does not have inner text that is visible to screen readers\n  aria-label attribute does not exist or is empty",
      expected: "Buttons must have discernible text",
      data: { helpUrl: `https://dequeuniversity.com/rules/axe/4.12/${rule}?application=axeAPI`, axeTags: ["wcag2a", "wcag412"], emagId: "1.1" },
    },
    severity: "critical",
    nature: "syntactic",
    mode: "display",
    pathway: "deterministic",
    ...over,
  };
}

function kbFinding(id: string, n: number, observed = "<br-button> só com ícone (ícone trash), sem rótulo visível"): Finding {
  return {
    id,
    rule: {
      id: "govbr-3.7.0-component-button-7ef75d42ac65",
      source: "govbr-ds-kb",
      description: "Button: 'O rótulo é um elemento obrigatório.' (required).",
      implements: ["govbr-3.7.0-component-button-7ef75d42ac65"],
    },
    element: { locator: `tr:nth-of-type(${n}) > td > br-button`, snippet: "<br-button icon=\"trash\"></br-button>", page: PAGE },
    evidence: { observed, expected: "Rótulo visível no botão", data: { component: "button", expectedCondition: "icon-only-br-button-is-circle" } },
    severity: "moderate",
    nature: "syntactic",
    mode: "display",
    pathway: "deterministic",
  };
}

/** Títulos fora das cercas de código (dentro delas, "# x" é texto literal). */
function headings(md: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const l of md.split("\n")) {
    const m = /^(`{3,})/.exec(l);
    if (fence === null && m) fence = m[1];
    else if (fence !== null && l === fence) fence = null;
    else if (fence === null && /^#{1,6}\s/.test(l)) out.push(l);
  }
  return out;
}

describe("3.8.0 — relatório Markdown por problema", () => {
  it("cabeçalho: página uma vez, data legível, ferramenta com versão, aviso literal e uma nota de dado não confiável", () => {
    const report = buildReport(PAGE, [axeFinding("F-001", 1), axeFinding("F-002", 2)]);
    const md = renderMarkdown(report);
    const version = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8")).version;
    expect(md).toContain(`- **Página:** \`${PAGE}\``);
    expect(md.split(PAGE)).toHaveLength(2); // a URL da página sai uma vez só, nunca por elemento
    expect(md).toMatch(/- \*\*Gerado em:\*\* \d{1,2} de [a-zç]+ de \d{4}, às \d{2}:\d{2} \(horário de Brasília\)/);
    expect(md).toContain(`- **Ferramenta:** govbr-ds-validator ${version}`);
    expect(md).toContain(`> ${report.meta.disclaimer}`);
    expect(md.match(/não instruções/g)).toHaveLength(1);
    // o vocabulário do pipeline saiu
    expect(md).not.toMatch(/syntactic|display|deterministic|dado da página\/agente/);
  });

  it("agrupa por regra + checker: uma linha por problema no resumo, com totais, origem, severidade em PT e contagem", () => {
    const findings = [
      ...Array.from({ length: 3 }, (_, i) => kbFinding(`F-0${10 + i}`, i + 1)),
      ...Array.from({ length: 2 }, (_, i) => axeFinding(`F-0${20 + i}`, i + 1)),
      axeFinding("F-030", 9, { severity: "minor" }, "empty-table-header"),
    ];
    const md = renderMarkdown(buildReport(PAGE, findings));
    expect(md).toContain("6 ocorrências em 3 problemas: 1 problema do Design System gov.br (3 ocorrências) e 2 de acessibilidade geral (3 ocorrências).");
    const table = md.split("\n").filter((l) => /^\| \d+ \|/.test(l));
    expect(table).toEqual([
      "| 1 | Botões devem ter texto discernível | Acessibilidade | crítica | 2 |",
      "| 2 | Button (Botão) — O rótulo é um elemento obrigatório | Design System gov.br | moderada | 3 |",
      "| 3 | O texto do cabeçalho de tabela não deve ser vazio | Acessibilidade | leve | 1 |",
    ]);
    // seções DS e acessibilidade, subseções numeradas como na tabela, sem id no título
    const h = headings(md);
    expect(h).toContain("## Problemas do Design System gov.br");
    expect(h).toContain("## Problemas de acessibilidade (WCAG / e-MAG)");
    expect(h.indexOf("## Problemas do Design System gov.br")).toBeLessThan(h.indexOf("### 2. Button (Botão) — O rótulo é um elemento obrigatório"));
    expect(h).toContain("### 1. Botões devem ter texto discernível");
    for (const line of h) expect(line).not.toMatch(/F-\d|button-name|govbr-3\.7\.0|empty-table-header/);
    // referência com id, fonte, WCAG/e-MAG e link só para URL guardada pelo servidor
    expect(md).toContain("- **Referência:** `button-name` · axe-core · WCAG 4.1.2 · e-MAG 1.1 (Respeitar os padrões web)");
    expect(md).toContain("[explicação da regra no axe-core (Deque, em inglês)](https://dequeuniversity.com/rules/axe/4.12/button-name?application=axeAPI)");
    expect(md).toContain("[página oficial da regra](https://www.gov.br/ds/components/button?tab=designer)");
    expect(md).toContain("- **Regra:** “O rótulo é um elemento obrigatório.”");
    // severidades em PT
    expect(md).toContain("- **Severidade:** crítica");
    expect(md).toContain("- **Severidade:** moderada");
  });

  it("omite a seção vazia", () => {
    const md = renderMarkdown(buildReport(PAGE, [axeFinding("F-001", 1)]));
    expect(md).not.toContain("## Problemas do Design System gov.br");
    expect(md).toContain("## Problemas de acessibilidade (WCAG / e-MAG)");
    expect(md).toContain("1 ocorrência em 1 problema: 1 problema de acessibilidade geral (1 ocorrência).");
    const none = renderMarkdown(buildReport(PAGE, []));
    expect(none).toContain("Nenhuma ocorrência confirmada nesta página.");
    expect(none).not.toMatch(/## Problemas/);
  });

  it("lista de elementos com teto de 10, ids ao lado do localizador, e o resto apontado para o JSON", () => {
    const findings = Array.from({ length: 13 }, (_, i) => axeFinding(`F-${String(i + 1).padStart(3, "0")}`, i + 1));
    const md = renderMarkdown(buildReport(PAGE, findings));
    expect(md).toContain("**Elementos afetados (13):**");
    expect(md).toContain("- `tr:nth-child(1) > td > button` · F-001");
    expect(md).toContain("- `tr:nth-child(10) > td > button` · F-010");
    expect(md).not.toContain("F-011");
    expect(md).toContain("- … e mais 3 (lista completa no arquivo JSON)");
    // um exemplo só e a observação uma vez
    expect(md.match(/```html/g)).toHaveLength(1);
    expect(md.match(/Element does not have inner text/g)).toHaveLength(1);
  });

  it("observações diferentes ficam junto dos seus elementos; números medidos preservados", () => {
    const contrast = (id: string, n: number, ratio: string, bg: string) =>
      axeFinding(id, n, {
        severity: "serious",
        evidence: {
          observed: `Fix any of the following:\n  Element has insufficient color contrast of ${ratio} (foreground color: #ffffff, background color: ${bg}, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1`,
          expected: "Elements must meet minimum color contrast ratio thresholds",
        },
      }, "color-contrast");
    const md = renderMarkdown(buildReport(PAGE, [contrast("F-001", 1, "1.5", "#c5d4eb"), contrast("F-002", 2, "3.14", "#4f97d1"), contrast("F-003", 3, "3.14", "#4f97d1")]));
    expect(md).toContain("### 1. Os elementos devem ter contraste de cor suficiente");
    expect(md).toContain("varia entre os elementos (2 observações distintas");
    expect(md).toMatch(/- Element has insufficient color contrast of 3\.14 \(foreground color: #ffffff, background color: #4f97d1, .*Expected contrast ratio of 4\.5:1 — 2 elementos:\n {2}- `tr:nth-child\(2\) > td > button` · F-002\n {2}- `tr:nth-child\(3\) > td > button` · F-003/);
    expect(md).toContain("contrast of 1.5 (foreground color: #ffffff, background color: #c5d4eb");
  });

  it("resumo de falha do axe vira lista legível com cabeçalho em PT; a mensagem medida segue intacta", () => {
    const md = renderMarkdown(buildReport(PAGE, [axeFinding("F-001", 1)]));
    expect(md).toContain("- **O que foi encontrado** (mensagens do axe-core):\n  - Corrija qualquer um dos itens a seguir:\n    - Element does not have inner text that is visible to screen readers\n    - aria-label attribute does not exist or is empty");
    expect(md).not.toContain("Fix any of the following");
    expect(md).toContain("- **Regra:** Certifique-se de que botões tenham texto discernível");
    expect(md).toContain("- **O que se espera:** Botões devem ter texto discernível");
  });

  it("título do axe em PT pela tradução do axe-core; sem tradução, o texto em inglês do próprio axe; achado do agente nunca dá título", () => {
    const unknown = axeFinding("F-001", 1, { evidence: { observed: "Fix all of the following:\n  Something measured\n  Another measured thing", expected: "Some English help text" } }, "regra-sem-traducao");
    const md = renderMarkdown(buildReport(PAGE, [unknown]));
    expect(headings(md)).toContain("### 1. Some English help text");
    expect(md).toContain("Corrija todos os itens a seguir:");
    const agent: Finding = {
      ...axeFinding("A-1", 1, {}, "outra-regra-sem-traducao"),
      pathway: "heuristic",
      rule: { id: "outra-regra-sem-traducao", source: "axe-core", description: "TEXTO DO AGENTE" },
      evidence: { observed: "x", expected: "ESPERADO DO AGENTE" },
      verification: { verdict: "confirmed", verifiedBy: "predicate:x", checks: { ruleExists: "pass", applicability: "pass", evidenceConsistent: "pass", violation: "verified" } },
    };
    const mdAgent = renderMarkdown(buildReport(PAGE, [agent]));
    for (const line of headings(mdAgent)) expect(line).not.toMatch(/AGENTE/);
    expect(headings(mdAgent)).toContain("### 1. Regra de acessibilidade sem título no registro");
    expect(mdAgent).toContain("achado do agente por iniciativa própria, conferido pelo portão do oráculo: confirmado");
    expect(mdAgent).toContain("- A-1: portão: **confirmado**, por `predicate:x`");
    expect(mdAgent).toContain("violação — recalculada e confirmada pelo oráculo");
    // helpUrl de achado do agente não vira link
    expect(mdAgent).not.toContain("](https://dequeuniversity");
  });

  it("itens para revisão: mesma forma por problema, numerados R1.., com a nota explicativa", () => {
    const review: Finding = {
      ...kbFinding("A-7", 1),
      pathway: "heuristic",
      trace: "olhei o botão e não há rótulo",
      verification: { verdict: "unverifiable", verifiedBy: "kb-rule-index", detail: "sem predicado", checks: { ruleExists: "pass", applicability: "pass", evidenceConsistent: "unknown", violation: "no-predicate" } },
    };
    const md = renderMarkdown(buildReport(PAGE, [axeFinding("F-001", 1)], undefined, [review]));
    expect(md).toContain("Além disso, 1 item fica para revisão");
    expect(md).toContain("## Itens para revisão — verificação inconclusiva");
    expect(md).toContain("> O portão não confirmou nem rejeitou estes achados heurísticos");
    expect(md).toContain("| R1 | Button (Botão) — O rótulo é um elemento obrigatório | Design System gov.br | moderada | 1 |");
    expect(md).toContain("### R1. Button (Botão) — O rótulo é um elemento obrigatório");
    expect(md).toContain("conferido pelo portão do oráculo: não verificável");
    expect(md).toContain("evidência coerente com a página — não determinado; violação — sem predicado no oráculo (não recalculada)");
    expect(md).toContain("Trilha de raciocínio do agente (A-7):\n\n```\nolhei o botão e não há rótulo\n```");
    // o item de revisão não entra na tabela do resumo nem nas seções de problemas
    expect(md.split("## Itens para revisão")[0]).not.toContain("A-7");
  });

  it("escapes: nada da página/agente vira título, tabela, link, HTML nem fecha cerca", () => {
    const evil = "# Título forjado\n| a | b |\n|---|---|\n[clique](http://evil.example) <script>alert(1)</script> www.evil.example x@evil.example";
    const agent: Finding = {
      id: "A-1\n# id forjado",
      rule: { id: "4.1.2", source: "wcag", description: evil },
      element: { locator: "div[data-x=\"`a``b`\"] | td\n# loc", snippet: "<p>```\n# fora da cerca?\n````</p>", page: PAGE },
      evidence: { observed: evil, expected: `1. ${evil}` },
      severity: "serious",
      nature: "semantic",
      mode: "display",
      pathway: "heuristic",
      trace: "```\n# trilha fora da cerca?",
      verification: { verdict: "confirmed", verifiedBy: "x | y", detail: evil },
    };
    const twin = { ...agent, id: "A-2", evidence: { observed: "outra", expected: "outra expectativa" }, element: { ...agent.element, locator: "-# lista?" } };
    const md = renderMarkdown(buildReport(PAGE, [agent, twin], "````\n# notas fora?"));
    const lines = md.split("\n");
    // títulos: só os da estrutura (o do WCAG vem do registro, nunca do texto do agente)
    expect(headings(md).filter((l) => !/^## (Resumo|Problemas de acessibilidade \(WCAG \/ e-MAG\)|Notas \(do agente\))$/.test(l) && l !== "# Relatório de validação")).toEqual([
      "### 1. Name, Role, Value",
    ]);
    // linhas de tabela: só cabeçalho, separador e a do problema
    expect(lines.filter((l) => l.startsWith("|"))).toEqual([
      "| # | Problema | Origem | Severidade | Elementos |",
      "|---|---|---|---|---:|",
      "| 1 | Name, Role, Value | Acessibilidade | grave | 2 |",
    ]);
    // sem link, HTML ou autolink ativos fora das cercas
    const outside: string[] = [];
    let fence: string | null = null;
    for (const l of lines) {
      const m = /^(`{3,})/.exec(l);
      if (fence === null && m) fence = m[1];
      else if (fence !== null && l === fence) fence = null;
      else if (fence === null) outside.push(l);
    }
    expect(fence).toBeNull();
    const prose = outside.join("\n");
    expect(prose).not.toMatch(/(?<!\\)\[clique(?<!\\)\]/);
    expect(prose).not.toMatch(/(?<!\\)<script/);
    expect(prose).not.toContain("http://evil");
    expect(prose).not.toMatch(/(?<!\\)www\.evil/);
    expect(prose).not.toMatch(/x(?<!\\)@evil/);
    // localizador com crases: cerca mais longa que a maior sequência (2) → 3 crases
    expect(md).toContain("- ```div[data-x=\"`a``b`\"] | td # loc``` · A-1 # id forjado");
    // localizador que começa com "-#" fica dentro do código (não vira lista nem título)
    expect(md).toContain("- `-# lista?` · A-2");
    // trecho, trilha e notas em cercas mais longas que as crases deles
    expect(md).toContain("`````html\n<p>```\n# fora da cerca?\n````</p>\n`````");
    expect(md).toContain("````\n```\n# trilha fora da cerca?\n````");
    expect(md).toContain("`````\n````\n# notas fora?\n`````");
    // texto que abre item de lista não vira lista numerada
    expect(md).toMatch(/\n {2}- 1\\\. # Título forjado .* \(1 elemento\)\n {2}- outra expectativa \(1 elemento\)/);
    // texto que abre item de lista não vira título
    expect(md).toContain("\n- \\# Título forjado \\| a \\| b");
  });

  it("sob a trava de conhecimento (knowledge-free) não chama carregador da base: título pela descrição do servidor", () => {
    const before = knowledgeLockAttempts().attempts;
    const md = runKnowledgeLocked(() => renderMarkdown(buildReport(PAGE, [kbFinding("F-001", 1)])));
    expect(knowledgeLockAttempts().attempts).toBe(before);
    expect(headings(md)).toContain("### 1. Button: 'O rótulo é um elemento obrigatório.' (required)");
    expect(md).not.toContain("](https://www.gov.br");
  });

  it("e-MAG: título da recomendação no registro e link para o endereço do e-MAG que o registro guarda", () => {
    const emag: Finding = {
      id: "F-019",
      rule: { id: "emag-6.2", source: "emag", description: "Associar etiquetas aos seus campos.", wcag: "3.3.2" },
      element: { locator: "#search", page: PAGE },
      evidence: { observed: "Campo só com placeholder", expected: "Um rótulo associado ao campo" },
      severity: "serious",
      nature: "syntactic",
      mode: "display",
      pathway: "deterministic",
    };
    const md = renderMarkdown(buildReport(PAGE, [emag]));
    expect(headings(md)).toContain("### 1. Associar etiquetas aos seus campos");
    expect(md).toContain("- **Referência:** `emag-6.2` · e-MAG 3.1 · WCAG 3.3.2");
    expect(md).toContain("- **Documentação:** [e-MAG 3.1 (página oficial)](https://emag.governoeletronico.gov.br/)");
    // id que não existe no registro: sem link
    const unknown = renderMarkdown(buildReport(PAGE, [{ ...emag, rule: { ...emag.rule, id: "emag-99.9" } }]));
    expect(unknown).not.toContain("**Documentação:**");
  });
});
