/**
 * A6 — the validation procedure shipped as an MCP prompt primitive. Any MCP
 * client that invokes this prompt runs the same standardized procedure
 * (suh2025feeda11y: structured procedure beats loose prompting; less
 * run-to-run variance, no client improvisation).
 *
 * Deliberate design constraints:
 *  - Procedure ONLY. Domain knowledge (rules, tokens, specs) stays in the
 *    tools/resources (A1) — the prompt tells the agent where to fetch it.
 *  - No few-shot violation examples (suh2025feeda11y: few-shot was the worst
 *    configuration).
 *  - Two-phase split: evidence gathering, then judgment (rosenbach2025gerallt
 *    controller/evaluator split, C5).
 *  - Dual pathway with the verification gate (wang2025sgcr, C3).
 *  - Iteration cap (suh2025feeda11y converges ~2.4 iterations; oyelayo2026:
 *    +52% cost, no gain beyond that).
 */

export interface ValidatePageArgs {
  url: string;
  /** Optional comma-separated component names to focus on (e.g. "button,input"). */
  scope?: string;
  /** Max reasoning iterations after the first pass. Default "2". */
  max_iterations?: string;
}

export function buildValidatePagePrompt({ url, scope, max_iterations }: ValidatePageArgs): string {
  const cap = max_iterations ?? "2";
  const scopeLine = scope
    ? `Escopo: valide apenas os componentes [${scope}] e as regras de página aplicáveis.`
    : "Escopo: todos os componentes gov.br DS presentes na página e as regras de página aplicáveis.";

  return `Você conduzirá uma validação de interface contra o gov.br Design System (Padrão Digital de Governo) e o e-MAG 3.1, na página: ${url}

${scopeLine}

Siga o procedimento à risca. Não invente regras: toda regra citada deve vir das ferramentas deste servidor.

## Fase 1 — Coleta de evidências (não julgue ainda)

1. Execute as verificações determinísticas — elas NÃO passam pelo seu julgamento:
   - check_token_compliance(url) → violações sintáticas de tokens (cores, fontes, raios, espaçamentos)
   - run_axe_scan(url) → violações de acessibilidade detectáveis por axe-core
   - check_component_structure(url) para cada componente br-* presente
2. Colete evidência para o julgamento semântico:
   - inspect_computed_styles(url) → estilos computados + estados de foco + atributos ARIA
   - Se houver um cliente Playwright MCP disponível, use browser_snapshot para a árvore de acessibilidade (modo snapshot/texto; não use modo visual)
3. Identifique quais componentes br-* aparecem e busque o conhecimento correspondente:
   - get_component_spec(<componente>) para cada um
   - get_emag_rules() das seções pertinentes ao conteúdo observado
   - get_design_tokens() para os tokens semânticos
   - get_page_rules(<categoria>) quando a página tiver formulários/navegação/estrutura relevante

## Fase 2 — Julgamento (apenas questões semânticas/contextuais)

Você julga SOMENTE o que código determinístico não decide:
- O token certo PARA O CONTEXTO (ex.: cor de sucesso usada em ação destrutiva; cor primária correta mas em ênfase errada)
- ARIA correto PARA O PAPEL do elemento no fluxo (não a mera presença do atributo)
- Composição de componentes e coerência do padrão de página
- Texto de rótulos/instruções adequado ao propósito (e-MAG seções 3 e 6)

NUNCA re-julgue comparações de valor exato (hex × token, escala tipográfica) — isso já foi decidido na Fase 1.

Duas vias para achados:
- **Via explícita:** violação de uma regra que você buscou nas ferramentas → cite o id da regra retornado.
- **Via heurística:** algo que você considera violação por iniciativa própria → OBRIGATORIAMENTE submeta a verify_finding antes de incluir no relatório. Achados heurísticos sem verificação confirmada serão recusados pelo relatório.

Limite de iterações: no máximo ${cap} rodadas adicionais de coleta→julgamento após a primeira. Ao atingir o limite, feche o relatório com o que está confirmado.

## Fase 3 — Relatório

Monte cada achado no esquema Finding (veja o recurso govbr://schema/finding ou a descrição de save_report):
- rule {id, source, description, wcag?} — id vindo das ferramentas, nunca inventado
- element {locator, snippet, page}
- evidence {observed, expected, data?}
- severity (critical|serious|moderate|minor), nature (syntactic|semantic|layout), mode (display|interaction)
- pathway (deterministic|explicit|heuristic) + verification quando heurística
- trace: registre sucintamente POR QUE julgou violação (auditabilidade)

Inclua os achados determinísticos da Fase 1 como vieram (pathway "deterministic").
Finalize chamando save_report(url, findings, notes?). O relatório é uma primeira triagem para revisão humana — não um veredito final.`;
}
