/**
 * 3.3.0 (NAT-109, B-18): `instructions` do initialize — só o PROCEDIMENTO de uso das ferramentas que o
 * perfil expõe, nenhum conhecimento do DS (nem regra, nem componente, nem token, nem id). Montado a
 * partir das ferramentas presentes, então o knowledge-free não ganha nenhuma menção às de conhecimento.
 */
export function serverInstructions(tools: ReadonlySet<string>): string {
  const has = (name: string) => tools.has(name);
  const steps: string[] = [];
  if (has("scan_page")) steps.push("meça a página com scan_page (estado, cobertura e achados); não repita o scan no mesmo estado");
  // 3.5.0 (D-155; revisão Fable P1/P8/P9): o silêncio do scan não é cobertura.
  if (has("scan_page") && has("get_component_spec")) {
    // 3.6.1 (D-155, item 1): a pendência tem id de sessão e volta em todo scan até ser resolvida.
    steps.push("trate checksRun.pageLevel.notMeasured e sessionPending como pendências suas (o que nenhum check julgou não é conformidade): cada pendingId volta até você resolvê-lo com verify_finding ou pendingResolved");
  } else if (has("scan_page")) {
    steps.push("trate checksRun.pageLevel.notMeasured e sessionPending como pendências suas (o que o axe não decidiu não é conformidade): cada pendingId volta até você resolvê-lo com verify_finding");
  }
  if (has("inspect_computed_styles")) steps.push("meça valores com inspect_computed_styles quando precisar do número exato");
  if (has("get_ds_rules")) {
    steps.push("para cada fato medido, procure a norma com get_ds_rules (query = o que você mediu; component quando souber): são candidatas a investigar, não veredito");
    steps.push("leia a unidade por id antes de citar e cite só ids devolvidos por uma ferramenta");
  }
  if (has("get_ds_rules")) {
    // 3.5.0 (revisão Fable P7)
    steps.push("antes de rejeitar ou deixar incerto um candidato por falta de norma, pergunte uma vez ao get_ds_rules com o fato");
  }
  if (has("get_finding_details")) steps.push("recupere achados e páginas de um lote com get_finding_details (ids ou scanId), sem varrer de novo");
  // 3.6.1 (D-155, item 6): um achado por rota/estado (trace dev-350-b-01: membros de duas rotas num cartão só).
  if (has("scan_page")) steps.push("um achado por rota/estado: não junte num achado membros de scans de rotas ou estados diferentes — a evidência de um não vale pelo outro");
  if (has("verify_finding")) {
    steps.push(
      has("get_ds_rules")
        ? "submeta cada achado a verify_finding antes de afirmá-lo; cite como violada uma norma que obriga ou proíbe, não uma recomendação"
        : "submeta cada achado a verify_finding antes de afirmá-lo",
    );
  }
  if (has("scan_page") && has("get_component_spec")) {
    // 3.5.0 (revisão Fable P1/P9): critério de parada.
    steps.push("antes de encerrar, para cada componente em investigate, leia get_component_spec com view checklist e dê a cada cláusula obrigatória um estado: medida, violada ou não se aplica");
  }
  steps.push(
    has("get_ds_rules")
      ? "sem norma na base, mantenha o fato com a referência que você justifica, ou rule: null"
      : "cite a referência que você justifica, ou rule: null",
  );
  return [
    `Procedimento: ${steps.map((s, i) => `(${i + 1}) ${s}`).join("; ")}.`,
    "Toda resposta tem até 8.000 caracteres: continue pelo cursor ou pelo next devolvido. Erros vêm com isError, errorCode e next; parâmetro desconhecido é recusado.",
  ].join(" ");
}
