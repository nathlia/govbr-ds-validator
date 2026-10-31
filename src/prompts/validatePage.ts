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
 *  - 3.0.0 (S-15): profile-aware — the procedure only names tools the profile registers.
 */

export interface ValidatePageArgs {
  url: string;
  /** Optional comma-separated component names to focus on (e.g. "button,input"). */
  scope?: string;
  /** Max reasoning iterations after the first pass. Default "2". */
  max_iterations?: string;
  /**
   * 3.0.0 (S-15): ferramentas registradas no perfil. No perfil evaluation o prompt citava
   * save_report, run_axe_scan, check_token_compliance, check_component_structure e
   * inspect_computed_styles, que não existem ali. Omitido = superfície completa.
   */
  tools?: ReadonlySet<string>;
}

const FULL_SURFACE: ReadonlySet<string> = new Set([
  "get_ds_rules", "get_design_tokens", "get_emag_rules", "get_page_rules", "list_components", "get_component_spec",
  "inspect_computed_styles", "scan_page", "check_token_compliance", "check_component_structure", "run_axe_scan",
  "get_finding_details", "verify_finding", "save_report",
]);

const join = (items: Array<string | false>) => items.filter((x): x is string => typeof x === "string").join("\n");

export function buildValidatePagePrompt({ url, scope, max_iterations, tools = FULL_SURFACE }: ValidatePageArgs): string {
  const has = (name: string) => tools.has(name);
  const cap = max_iterations ?? "2";
  const scopeLine = scope
    ? `Escopo: valide apenas os componentes [${scope}] e as regras de página aplicáveis.`
    : "Escopo: todos os componentes gov.br DS presentes na página e as regras de página aplicáveis.";
  const isolated = ["check_token_compliance", "run_axe_scan", "check_component_structure"].filter(has);

  const fase1 = join([
    "1. Execute scan_page(url) para rodar tokens, estrutura e axe na mesma carga e no mesmo estado.",
    isolated.length
      ? `   Use ${isolated.join(", ")} isoladamente apenas para\n   uma investigação direcionada que a varredura agregada não resolveu.`
      : false,
    "   Guarde scanId, fingerprint e ids; continue nextCursor com get_finding_details(scanId, cursor) sem repetir o scanner.",
    "   O resultado vem agrupado em famílias: instâncias idênticas aparecem uma vez, com contagem, um exemplo e ids.",
    "   Os demais ids de uma família vêm de get_finding_details(scanId, familyId, cursor=nextMemberCursor). Busque",
    "   evidência por ids somente para candidatos relevantes; não peça todos os objetos completos.",
    "   checksRun diz o que rodou, o que não rodou e o que nenhum check mede; zero achados não é conformidade.",
    "   Para um estado interativo, reproduza as ações em scan_page.actions e passe compareToScanId para",
    "   receber o diff contra o estado anterior; outro servidor MCP não compartilha esta página.",
    "2. Colete evidência para o julgamento semântico:",
    has("inspect_computed_styles")
      ? "   - inspect_computed_styles(url, selectors, properties) → agrupe alvos e peça somente os estilos necessários + atributos ARIA"
      : false,
    "   - Se houver um cliente Playwright MCP disponível, use browser_snapshot para a árvore de acessibilidade (modo snapshot/texto; não use modo visual)",
    "3. Identifique quais componentes br-* aparecem e busque o conhecimento correspondente:",
    has("get_component_spec")
      ? "   - get_component_spec(<componente>) para cada um (scan_page.investigate traz a chamada pronta, na ordem do DOM)"
      : false,
    has("get_emag_rules") ? "   - get_emag_rules() para o índice e depois as seções pertinentes ao conteúdo observado" : false,
    has("get_ds_rules")
      ? "   - get_ds_rules(query: <o que você mediu>, component?) ou get_ds_rules(context: { components, regions?, terms? }): candidatas a investigar, com o que medir (toVerify) e aplicabilidade desconhecida — candidata não é defeito; continue uma resposta cortada pela continuação que ela indicar (cursor ou id)"
      : false,
    has("get_ds_rules") ? "   - get_ds_rules(ids) quando várias regras candidatas já estiverem identificadas" : false,
    has("get_design_tokens") ? "   - get_design_tokens() para os tokens semânticos" : false,
    has("get_page_rules")
      ? '   - get_page_rules() sem categoria para as restrições de página (checks ds-page-header, ds-page-footer, ds-page-skip-link, ds-page-focus-order, ds-page-title — regiões obrigatórias do Template Base, salto para o conteúdo e título do documento), cada uma com a norma a citar (citeAs); o scan_page já as verifica quando checks inclui "page" (padrão)'
      : false,
    has("get_page_rules")
      ? '   - get_page_rules("page_structure") e get_page_rules("minimum_standard") quando a página for uma página completa (cabeçalho, conteúdo, rodapé), e get_page_rules(<categoria>) quando tiver formulários/navegação/estrutura relevante'
      : false,
  ]);

  const fase3 = has("save_report")
    ? `Passe os ids dos achados determinísticos em save_report.finding_ids. Envie em save_report.findings
somente os achados explícitos/heurísticos que você próprio montou; não recupere e reenvie objetos
determinísticos completos.
Finalize chamando save_report(url, finding_ids, findings, notes?). O relatório é uma primeira triagem para revisão humana — não um veredito final.`
    : `Este perfil não persiste relatório: entregue os achados no formato pedido por quem conduz a avaliação,
citando os ids dos achados determinísticos (scanId e ids) em vez de reenviar objetos completos.
O relatório é uma primeira triagem para revisão humana — não um veredito final.`;

  return `Você conduzirá uma validação de interface contra o gov.br Design System (Padrão Digital de Governo) e o e-MAG 3.1, na página: ${url}

${scopeLine}

Siga o procedimento à risca. Não invente regras: toda regra citada deve vir das ferramentas deste servidor.

## Fase 1 — Coleta de evidências (não julgue ainda)

${fase1}

## Fase 2 — Julgamento (apenas questões semânticas/contextuais)

Você julga SOMENTE o que código determinístico não decide:
- O token certo PARA O CONTEXTO (ex.: cor de sucesso usada em ação destrutiva; cor primária correta mas em ênfase errada)
- ARIA correto PARA O PAPEL do elemento no fluxo (não a mera presença do atributo)
- Composição de componentes e coerência do padrão de página
- Texto de rótulos/instruções adequado ao propósito (e-MAG seções 3 e 6)

NUNCA re-julgue comparações de valor exato (hex × token, escala tipográfica) — isso já foi decidido na Fase 1.

Duas vias para achados:
- **Via explícita:** violação de uma regra que você buscou nas ferramentas → cite o id da regra retornado. Sem verificação guardada, ela permanece como item de revisão e não entra no total de achados confirmados.
- **Via heurística:** algo que você considera violação por iniciativa própria → OBRIGATORIAMENTE submeta a verify_finding, com o payload final, antes de incluir no relatório. O relatório usa o resultado guardado pelo servidor: rejected é recusado, unverifiable entra como item de revisão, confirmed entra como achado.
Se uma ferramenta indicar uma ação (corrigir citação, reproduzir estado, medir condição), ela é uma sugestão de próximo passo, não uma conclusão sobre o fato.

Limite de iterações: no máximo ${cap} rodadas adicionais de coleta→julgamento após a primeira. Ao atingir o limite, feche o relatório com o que está confirmado.

## Fase 3 — Relatório

Monte cada achado no esquema Finding (veja o recurso govbr://schema/finding${has("save_report") ? " ou a descrição de save_report" : ""}):
- rule {id, source, description, wcag?} — id vindo das ferramentas, nunca inventado
- element {locator, snippet, page}
- evidence {observed, expected, data?}
- severity (critical|serious|moderate|minor), nature (syntactic|semantic|layout), mode (display|interaction)
- pathway (deterministic|explicit|heuristic); não preencha verification — o relatório usa a verificação guardada pelo servidor; explicit sem verificação fica em revisão
- trace: registre sucintamente POR QUE julgou violação (auditabilidade)

${fase3}`;
}
