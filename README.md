# govbr-ds-validator — MCP server (TCC 2 artifact)

The validation **oracle** of the thesis *"Um Framework de Validação de Interfaces Baseado em
Agentes de IA e Protocolo MCP"* (UFSM). It exposes gov.br Design System (Padrão Digital de
Governo) and e-MAG 3.1 knowledge as queryable MCP tools/resources, runs the deterministic
("syntactic") half of the hybrid validation architecture itself, and ships the standardized
validation procedure as an MCP prompt.

Supersedes the TCC 1 proof of concept (archived in `../poc-tcc1`).

Since **2.16.0 (NAT-96)**, `get_ds_rules` adds derived `normativeContext` for literal
KB clauses: section title, the main clause, adjacent clauses with independent forces and
citations, and a coherent literal paragraph. Empty extracted conditions/exceptions are not
proof that the source is unconditional. Force filters select the main rule while retaining
context alternatives; query/context filtering and ranking are unchanged. The frozen KB files
and the historical `3.7.0` `get_ds_rules` projections remain unchanged. Snapshot coordinates refer to UTF-16
offsets in the LF-normalized frozen file, separately from upstream `source.charRange`.
Context pages keep the existing 12,000-character budget. A large unit is explicitly marked
`context-deferred`, with unknown applicability, honest deferred-clause counts and an exact-id
continuation; that follow-up returns the complete unit. Deferred context must be read before
making a normative judgment. This preserves page ordering and component interleaving.

`get_emag_rules` shares these literal clauses and keeps the extensive-table condition in
recommendation 3.9. Legacy IDs are historical pointers with exact (literal equality), partial
(different text in the existing map), or absent successors; this is not a semantic-equivalence
adjudication. `get_component_spec.implementationEvidence` separates static HTML and versioned,
hashed core source-code evidence from normative clauses and actual page observations. The
official core 3.7.0 pagination example is tested before initialization, after initialization,
and after a page click; its ARIA technique is not promoted to a universal requirement.

Since **2.16.1 (NAT-96 review)**, list responses no longer inline units: `get_ds_rules`
listings (brief/full) and `ids` brief carry only a `context-deferred` pointer per rule
(`adjacentClauses` count, `sourceParagraph`, `next` = exact-id call) plus one
`normativeContextNote` per response; `ids` with `detail: "full"` inline a unit only up to
2,500 characters, otherwise the same deferral. The single-rule `id` call still returns the
complete unit. `get_emag_rules` section listings likewise point to the exact-id call (the 3.9
contextual description is kept). Measured on `component: "input", limit: 5`: 34,706 → 4,627
characters; `query: "tabela"` (40 rules): 241,400 → 29,407. Units are memoized per KB object
and rule id (no rereading of the corpus per call); ranking, membership, forces and KB data are
unchanged.

Desde a **2.17.0 (NAT-97)**, `get_ds_rules{query}` e o modo `context` usam um único motor de
relevância (`src/data/retrieval.ts`, `meta.ranking.engine = "govbr-lexical/1.0.0"`): pontuação
lexical determinística (saturação BM25 por campo — texto da cláusula, referências WCAG/e-MAG,
condições/exceções, evidência esperada, nome documentado do componente, seção), cobertura dos
termos, identificador/número exato e pares de palavras adjacentes. Normaliza caixa, acentos,
marcadores markdown e alvos de link, preservando `aria-current`, `for`/`id`/`alt`/`tabindex`,
`e-MAG 3.9`, `1.3.1`; os termos se combinam (a frase inteira não é exigida). `component` é pista:
as regras dele ganham peso, as globais continuam elegíveis, as de outros componentes saem; o nome
passa pelo mesmo resolvedor do `context` (`Modal`, `br-modal`), e nome desconhecido é erro
`unknown-component` com `didYouMean`/`available`, não "0 regras". Ordem: pontuação → faixa de
força (só desempate) → ordem da base; linha de tabela de API/anatomia pesa 0,6 e, no `context`, fica
depois da prosa de mesma relevância. Piso declarado em `meta.ranking.floor` (cobertura ≥ 0,1;
pontuação ≥ 4 ou todos os termos; ≥ 0,6 da melhor; pergunta com 4+ termos conhecidos exige 2): abaixo
dele nada entra (`retrieval.stop: "relevance-floor"`), sem completar com ruído; pergunta sem base
volta vazia com `absenceNote`, `unmatchedTerms` e `next`. A pontuação não depende da ordem das palavras
(pares de termos contam por adjacência na regra, em qualquer ordem), e as frequências de documento vêm do
conjunto ordenado (normativas por padrão; a evidência canônica, quando é ela). `query` tem até 500
caracteres (`query-too-long`) e precisa de palavra de conteúdo (`no-content-terms`); `component` vazio ou
desconhecido é erro também sem `query`. No `context`, cada termo é uma observação independente: é
pontuado sozinho pelo mesmo motor (piso absoluto, sem o corte relativo, porque ali os componentes
observados já definem o escopo) e a relevância da regra é a soma dos termos que ela passa; um termo
nunca derruba outro. Relevância
não é aplicabilidade: nada é afirmado como conformidade. `include_evidence` com `query` segue o mesmo
motor e o `limit`. O vocabulário `data/retrieval/vocab-1.0.0.json` (28 grupos de sinônimos PT/EN e nomes
HTML/WAI-ARIA, cada um com proveniência) é desligável por `vocabulary:false` ou
`GOVBR_RETRIEVAL_VOCAB=off`. `match:"literal"` mantém a semântica da 2.16.1 byte a byte, também no `context`
(substring da frase, sensível a acento, `component` id exato; snapshot de bbc9d56 nos testes). O grupo
`estado-atual` (atual↔current) e os testes de regressão de paginação vêm do diagnóstico da tela A
(`origem: "diagnostico-tela-a"` no vocabulário): ganho atribuído a eles é orientação ajustada a uma tela
de desenvolvimento e deve ser reportado à parte. O formato da resposta é o mesmo da listagem, mais
`retrieval` e `relevance` por regra; o redesenho em cartões é a NAT-99. O `tools/list` do perfil
evaluation muda (novos parâmetros `match` e `vocabulary`). Benchmark de desenvolvimento
`benchmark-1.0.0` (qrels 1.0.2), respondíveis com unidade relevante no top 5: 0% (2.16.1) → 75,0%
(vocabulário ligado) / 67,9% (desligado); P@5 médio 40,3% / 37,7% — metas de 90% e 70% ainda não
atingidas. Autorrecuperação por título sem acento: 15,5% → 98,4%.

Desde a **2.17.1 (NAT-106)**, perfil de ferramentas desconhecido é erro, não volta para `full` em
silêncio (um `knowledge_free` digitado errado daria ao braço sem conhecimento a base inteira):
`createServer({toolProfile})` lança `UnknownToolProfileError` (`code: "unknown-tool-profile"`) e o
processo stdio sai com código 2 e uma linha no stderr com o valor recebido e a lista válida (`full`,
`evaluation`, `normative`, `deterministic`, `evidence`, `knowledge-free`), sem nada no stdout. Vazio ou
ausente continua `full`. O perfil efetivo aparece no `serverInfo` do `initialize`
(`description: "toolProfile=<perfil>"`); o `tools/list` de todos os perfis fica igual.

## 3.7.3-pre.1 — checklist global/página (NAT-111, A2)

`get_page_rules {view:"checklist"}` lista as 415 cláusulas globais obrigatórias/proibidas não-título,
incluindo e-MAG, por mensurabilidade e cobertura parcial explícita. Continue pelo cursor publicado;
cada resposta cabe em 8k. A lista não decide aplicabilidade nem registra pendência de sessão.
Índice/categorias anteriores preservados; knowledge-free continua sem essa ferramenta e com o
mesmo contrato. Ver [contrato e verificações](docs/nat111-a2-checklist-global-2026-11-06.md).
O inline global no `investigate`/`next` ainda não faz parte desta fatia.

## 3.7.3-pre — emenda-2 da base: unidades de especificação (D-167)

Integração da emenda-2 autorizada pela autora na NAT-115 ("ampliar"). O extrator mecânico torna citáveis tabelas de
Especificações e frases descritivas das páginas oficiais dos componentes, preservando texto literal e proveniência.

- Base `3.7.0-literal-2026-10-15+emenda-2`: **2.449 unidades** com `force:"especificacao"`, dos 36 componentes:
  1.152 linhas de 227 tabelas e 1.297 frases (S1: 1.151; S2: 146). Designer: 2.300; desenvolvedor: 149.
  Total servido: 5.490 registros; as 3.007 regras normativas e os 34 exemplos continuam separados.
- Texto, arquivo, linha, intervalo e hash são conferidos pelo gerador. A base anterior à emenda permanece byte a byte
  (sha256 `c8c4327d…`); unidades geradas: `322ad1e6…`; rules.jsonl emendado: `ca8f428a…`.
  Reprodução: `node scripts/kb-spec-units.mjs --check`. Definição T1/S1/S2/X1/ID e relatório em
  `data/knowledge/versions/3.7.0-literal-2026-10-15/reports/emenda-2/`. S2 usa exclusões auditadas
  `info`, `definicao` ou `usuario`; o extrator não reclassifica essas frases como obrigação.
- Especificações não entram no pool, estatísticas, contagens, contexto ou checklist de normas. Podem ser listadas por
  `get_ds_rules {force:"especificacao"}`; a busca livre as apresenta em bloco separado, quando cabe, sem tirar ou
  reordenar normas. Um cartão agrupa apenas linhas da **mesma tabela**, identificada pelo arquivo e linha do cabeçalho.
  `get_component_spec` mostra contagens por faceta e o caminho de listagem; o verify avisa que especificação não obriga.
- Contratos integrados com A3/A6, conferidos em 06/11: evaluation `590c6f70…`, full `dd6c7795…`, normative
  `6289e719…`, knowledge-free `c51bf1a3…`. Imagens e locks de campanha precisam fixar os contratos da versão final.
- **A1 parcial:** cabeçalhos de coluna entram no índice das novas especificações; elas usam pool próprio, sem penalidade
  de linha de tabela. As linhas normativas antigas mantêm o ranking anterior; a emenda não encerra a perda histórica de
  auto-recuperação dessas linhas. Não há check de token por parte do componente nesta fatia.
- **Verificação desta integração e limites:** ver [registro de 06/11](docs/nat111-emenda2-2026-11-06.md).
  Guarda completa da busca, ensaio MCP vivo, imagens/locks e demais itens da 3.7.3 continuam gates separados.

## 3.7.2 — candidato embutido, alsoIn de outra rota, componente novo primeiro, cláusulas do componente, força nas best-practice (D-155/D-166)

Motivo: lista única de correções de 04/11, seção A (`planejamento/atual/lista-unica-correcoes-3.7.2-2026-11-04.md`), sobre
os rastreios da rodada 3.7.1 (`mecanismo-oraculo-dev-371-b-2026-11-04.md` §2–§4/§7, `mecanismo-oraculo-dev-371-a-2026-11-04.md`
§4/§7). Tudo genérico (por exemplo oficial, regra axe, rota, sessão); nada por tela, seletor ou spec. O `tools/list` e as
instruções do `initialize` não mudam em nenhum dos seis perfis (sha256 conferidos antes e depois; evaluation `3807ad95…`,
knowledge-free `f358152a…`, full `575634a0…`, normative `4ad616d8…`, deterministic `af7f8264…`, evidence `4b4f8249…`;
instructions evaluation `ace27ba8…`, knowledge-free `1a10c763…`). Só respostas mudam.

- **A1 — o botão embutido vira candidato, nunca achado** (`checkers/iconOnlyButton.ts`, D-166). O botão do DS só com ícone e
  sem `circle` que o C01 pula por ser parte de outro componente cujo exemplo oficial traz o mesmo botão (hospedeiros lidos
  de `data/component-specs.json`: `br-input`, `br-tag`) não some mais em silêncio: volta como pendência do scan
  `icon-only-embedded` (`checksRun.pageLevel.notMeasured`, com `pendingId`, `rule` = Button `…7ef75d42ac65` required),
  `observed` = "dentro de br-input: a marcação coincide com o exemplo oficial do DS (<exemplos>)" e `todo` "a investigar: …
  decida". Os exemplos citados saem mecanicamente: os do componente cuja raiz `br-*` está na cadeia do elemento (o mais
  externo primeiro: o Select contém o Input; a Pagination contém o Select), preferindo o mesmo ícone (`fa-*`, sem as classes
  de estilo/tamanho do Font Awesome: `fa-solid`, `fa-lg`, `fa-fw`, `fa-2x`…), um de cada candidato primeiro, até 4. Fora: sem
  nome (fica o `button-name`), oculto/decorativo, interno de web component do DS ou terceiro. A pendência é **de elementos**
  (`elementBound`): o `verify_finding` só a fecha num dos próprios botões (um C01 confirmado noutro botão, com a mesma norma,
  não a fecha). O `verify_finding` (predicado `icon-only-button`) num botão embutido não rejeita: `undetermined` com a nota (o
  fato existe; o oráculo não decide). Knowledge-free: nada (o scan do perfil é só o axe).
- **A2 — o alsoIn de outra rota não sai pelo orçamento** (`responses/scan.ts`, `scan/session.ts`). "Outra rota" é decidido
  pela rota INTEIRA na sessão (`session.alsoIn` marca cada item com a chave símbolo `CROSS_ROUTE`, que não sai no JSON) —
  nunca pelo rótulo curto, que colide entre rotas longas (`…/detal…`) e entre UUIDs com os mesmos 4 últimos dígitos. Na 1ª
  página, `extras:alsoIn → curto` guarda a rota no item de outra rota (`{route, scanId, familyId}`; o de outro estado da mesma
  rota fica `{scanId, familyId}`), e `extras:alsoIn → fora` só tira o da mesma rota; com alsoIn de outra rota, a nota fica na
  forma curta ("alsoIn: outro fato, cartão próprio"). Quando todos os acréscimos que saem já saíram e um alsoIn de outra rota
  ficou, `compacted` diz `extras:alsoIn-kept` (não `extras`, que quer dizer "todos fora"). Consequência declarada: o alsoIn
  de outra rota pode custar família num teto apertado (a família e ele ficam juntos) — medido: até 1 família com 1 em 3
  famílias com alsoIn (fix366), até 2 quando TODAS as 30 têm (fix365, caso extremo); passos, normas e força continuam
  saindo antes de qualquer família. O `get_finding_details` por `ids` de scans de rotas diferentes (outra página, ou o mesmo
  modelo com outro registro) traz `routesWarning` só na 1ª página (sem cursor): até 5 `routes[]` (rota, scanIds, ids) + `more`,
  e `note` "ids de N rotas: N cartões, um por rota … mixed-states".
- **A3 — o componente novo no estado vem primeiro** (`responses/scan.ts` `investigateFor`, `server.ts`). Os componentes deste
  estado que não estavam no estado anterior vão à frente da ordem por obrigações sem medida: nos itens (`newInState: true`),
  em `newInState` do bloco, nas formas compactas (`clauses` e `components`), no `investigateNote`, no `next.hint` e no `next`.
  O estado anterior é o `compareToScanId`, quando dado; sem ele, o scan mais recente **do mesmo modelo de rota**
  (`routeTemplateOf`: `/x/3025` e `/x/3038` são o mesmo modelo). Nos dois casos só vale um scan com inventário de componentes:
  página inteira (sem seletores) e com `tokens` ou `structure` — o scan só do axe, só de página ou por seletores não conta, e
  `compareToScanId` apontando para um deles não dá "novo" nenhum. (A 1ª versão desta 3.7.2 usava o scan de página inteira
  mais recente de qualquer rota: a chegada de uma página depois de outra punha à frente os componentes que a outra não tinha;
  revisto.) O 1º scan de cada modelo de rota não muda. A forma de itens leva em `more.clauses` a forma compacta dos
  componentes de `more`: um orçamento maior nunca mostra cláusula de menos componentes que a forma compacta.
- **A4 — `get_ds_rules` com `component` aponta o resto do componente** (`tools/componentChecklist.ts`
  `otherMeasurableClausesLine`, `responses/retrieval.ts`). Na 1ª página da busca, `componentClauses` (≤ 320 car., dentro do
  orçamento de 8.000): quantas cláusulas mensuráveis do componente nenhum check mede e a resposta não mostrou (em nenhuma parte
  dela: cartões, `related`, `investigation`, lacunas, evidência), até 2 com id e procedimento curto, e
  `get_component_spec{component, view:"checklist"}`. Só com `component` explícito e com `get_component_spec` no perfil.
  Ranking, cartões e cursores não mudam: a fixture léxica 3.4.0 mudou só nas 8 consultas com `component`, e cada uma, sem a
  linha, é a resposta de antes byte a byte (conferido; sha256 e chars regenerados, nota na fixture).
- **A5 — norma do e-MAG nas famílias best-practice do axe** (`checkers/axe.ts` `bestPracticeReferences`,
  `responses/families.ts`). A família de regra só best-practice (sem critério WCAG) com recomendação e-MAG do mesmo assunto
  (`AXE_TO_EMAG`, mais `empty-table-header` ↔ 3.10) traz `rule.references`: as cláusulas obrigatórias/proibidas da
  recomendação (`emagUnits`) ranqueadas contra o texto da regra do axe (`help`) pelo mesmo motor do `get_ds_rules`
  (`rankRules`, com o piso dele) — até 2 acima do piso, com a força — e sempre o id `emag-N.N`; sem cláusula acima do piso, só
  `emag-N.N`. Só na projeção da família (assinatura de evidência e `familyId` não mudam; inteiras em
  `get_finding_details(scanId)`); no aperto saem antes da força (`extras:normas`, família a família, só quando ganha família).
  Knowledge-free: nada. O resultado nas regras best-practice com par:

  | regra axe | `help` | `references` (ids sem o prefixo `govbr-3.7.0-`; a letra cortada em 70) |
  |---|---|---|
  | empty-table-header | Table header text should not be empty | accessibility-global-00290bc67eb5 (required: "Para incrementar a acessibilidade, deve-se utilizar os elementos THEAD"); emag-3.10 |
  | page-has-heading-one | Page should contain a level-one heading | emag-1.3 |
  | region | All page content should be contained by landmarks | accessibility-global-b524f2350f1a (required: "O primeiro é para o rodapé geral da página que deve receber o valor co"); emag-1.8 |
  | landmark-one-main | Document should have one main landmark | emag-1.8 |
  | heading-order | Heading levels should only increase by one | emag-1.3 |
  | empty-heading | Headings should not be empty | emag-1.3 |
  | skip-link | The skip-link target should exist and be focusable | accessibility-global-538e57855252 (required: "É importante ressaltar que o primeiro link da página deve ser o de "); emag-1.5 |
  | tabindex | Elements should not have tabindex greater than zero | accessibility-global-742fd4c4f54b (required: "No entanto, se houver a necessidade de utilizar o tabindex, o mesmo de"); accessibility-global-bd6ce6757c97 (required: "ser verificado manualmente se o fluxo fornecido é realmente o desejado"); emag-1.4 |
- **Medido sem modelo** (`scanPage`, estado inicial, todos os checks, 1280×720; fluxo, A, B e as 80 páginas de `controles/a`):
  fluxo 17→17, A 7→7, B 76→76 (46 da 3.6.x + os 30 do C01 da 3.7.0), controles 18→18 —
  os mesmos fatos (checker, norma, localizador, observado, esperado, severidade) e as mesmas observações em cada uma das 83
  páginas, contra a 3.7.1 (`.tmp-eval/validator-371`, = HEAD `a0038a9`). Candidatos `icon-only-embedded`: A 2 (os gatilhos
  dos dois Select: select-multiplo, select-simples), B 3 (a lupa do Buscar: input-buttons, input-highlight; os gatilhos
  "Exibir" e "Página" do `br-select` dentro de `br-pagination`: pagination-contextual, pagination-dark), controles `a/` 0.
- **Portão NAT-86** (`npm run portao:oraculo -- --divisao desenvolvimento`): **GO**, matriz d35b33f5, 171 linhas: 165 idênticas à 3.7.1 e 6
  só no hash de estado do texto da limitação (F1-09-A/B, F2-09-V, F3-12-B; como nas versões anteriores); D2 TN 116 · TP 7 · FP 0.
- **Guarda da busca** (`benchmark:oraculo`, benchmark-1.0.0, qrels 1.0.4): idêntica à 3.7.1 em todas as métricas e por consulta (fora latência e
  tamanho): respondíveis 78,6% / P@5 45,7% / 9 enganosas; tamanho médio da resposta 6.573 → 6.792 caracteres (a linha
  `componentClauses` das consultas com `component`).
- **Reexecução das chamadas reais da rodada 3.7.1** (136 chamadas do com: `dev-371-b-01` e `dev-371-a-01` p01–p03, site
  congelado `81fb2847…`, `replay.mjs` da reexecução 3.7.0 com os caminhos absolutos): 3.7.1 × 3.7.2:
  1 `isError` nas duas (o mesmo `invalid-combination` do original), os mesmos vereditos nos 44 `verify_finding`. Nos 5 scans do
  estado de erro da tela A, `message` passa de 11º a 1º (`newInState`, `next` e aviso com ele); nos 3 do diálogo, `modal` de 3º a
  1º. Na B p01 #10 (aba Agendar, `maxChars` 9.000, o caso B-23 do rastreio) a família de contraste agora traz
  `alsoIn` → `/…/3025` (S-page-003) e a nota curta, que a 3.7.1 cortava (`extras:alsoIn`); o custo é a família `listitem`
  (2 membros) ir para a página do cursor — a única família a menos nos 41 scans. Depois da revisão: as chegadas da lista da B depois de um detalhe (p01 #17, p03 #14) não
  marcam mais `newInState` (o anterior é o scan do mesmo modelo de rota; a ordem é a mesma: list, item…); o detalhe
  (`agendar-vistoria/<uuid>`, p01 #4, p03 #4) segue breadcrumb, header, list, button, input, sem `newInState` (1º scan do modelo).
  `icon-only-embedded` nas chegadas de A (2) e B (3); `references` nas famílias `page-has-heading-one` (só `emag-1.3`) e
  `empty-table-header` (`…00290bc67eb5` + `emag-3.10`) da B — mais curtas, a B p01 #10 deixa de cortar acréscimos (`extras:alsoIn`,
  `extras:normas`); `componentClauses` nas 7 consultas com
  `component` (message, modal, pagination, tab). Nenhuma chamada real pede ids de rotas diferentes no `get_finding_details`
  (o `routesWarning` não aparece; está nos testes). Nada novo acima do `maxChars` (os 2 `get_finding_details` com 4.000 que
  passam, passam igual na 3.7.1).
- Testes: 882 (os 865 de antes + 17). `test/integration/fix372.test.ts` (17: A1 exemplo mecânico, pendência e
  verify, knowledge-free; A2 formas curta/fora, colisão de rotas em shortRoute, todo teto, routesWarning; A3 ordem, itens ≥
  compacta, sessão com ação; A4 linha; A5 ranqueadas, aperto, scan e knowledge-free; revisão: verify noutro botão não fecha o
  candidato, scan só do axe não inventaria, outra rota não faz "novo"). Ajustes: fix365/fix366 (a base da comparação passa a ter o alsoIn de outra
  rota, que não sai mais; custo medido contra a página sem acréscimo: ≤ 1 família no fix366, ≤ 2 no fix365, em que as 30
  famílias têm alsoIn; no fix366 também a forma curta exata, o item da mesma rota que sai e o rótulo `extras:alsoIn-kept`), response-contract (chave `componentClauses` nos exemplos 01/02), fixture léxica 3.4.0 (8 sha e chars, nota).

## 3.7.1 — a dica das cláusulas no `next` do investigate (D-155/D-159)

Motivo: no teste à mão da 3.7.0, no teto padrão (8.000) a chegada de A e de B trazia só os nomes no `investigate` (nem
cláusula nem `investigateNote`). Quando alguma cláusula mensurável foi tirada pela escada, o `next` — que nunca sai — leva
`hint` (≤ 100 car.: até 3 componentes cujas cláusulas não couberam, "+N", e o que fazer: este next por componente ou
`maxChars` maior). Conta no orçamento e é o último degrau da 1ª página (depois do cabeçalho e dos acréscimos das famílias);
depois dele, só nomes + `next`, e só quando isso ganha família. O resto da escada e o `tools/list` não mudam.

## 3.7.0 — o scan empurra as cláusulas mensuráveis; botão só com ícone fora do circular (D-155/D-159)

Motivo (decisão da autora de 2026-11-01, sobre os rastreios `mecanismo-oraculo-dev-364-2026-11-02.md`,
`revisao-fable-melhorias-oraculo-2026-10-30.md` e `auditoria-mensurabilidade-kb-2026-10-30.md` §5/C01/C20): na tela B o
braço com o oráculo não chamou `get_component_spec` em nenhum dos 3 trios e na A seguiu 1 de 15 `investigate` — a lista
de verificação existe, mas não é PUXADA; o botão só com ícone sem `circle` e a área de toque 48×48 nunca foram achados.
Tudo genérico (por regra da base, estratégia declarada, exemplo oficial do DS); nada por tela. O `tools/list` e as
instruções do `initialize` não mudam (sha256 conferidos nos perfis evaluation e knowledge-free).

- **C01 — `br-button` só com ícone fora da variante circular** (`src/checkers/iconOnlyButton.ts`, check `structure`):
  `<button>`/`<a>` com `br-button`, exibido e exposto, cujo conteúdo renderizado é só ícone (`i`/`svg`/`img`/`span.fa-*`) e
  nenhum texto VISÍVEL (o texto precisa ter caixa própria — vale dentro de `display: contents`; `sr-only`/recortado, caixa de
  1px com overflow escondido, opacidade 0 ou dentro de `svg` não contam: evidência nova `content.iconOnlyVisual`, colhida só
  em `.br-button` e fora do knowledge-free), sem `circle` (nem `is-circle`, nem o atributo `[circle]`). `<img alt="…">`
  sozinho conta como ícone (nenhum exemplo oficial do Button usa `img`). Cita `govbr-3.7.0-component-button-7ef75d42ac65`
  ("O rótulo é um elemento obrigatório.", required; `implements` + a anatomia `…9d77803305c0`); o texto do achado diz,
  como REGRA DO CHECK e não como letra do DS, a exceção do legado (`govbr-3.7.0-component-button-4d7b5f978df1`: "A
  exceção ocorre na versão tipo circular…") e a exclusão dos hospedeiros. Hospedeiros: botão dentro de componente cujos
  exemplos oficiais trazem o mesmo botão (lido de `data/component-specs.json`: `br-input`, `br-tag`), em qualquer ponto
  da cadeia de ancestrais (`br-list` dentro de `br-input` conta). Deduplicação: botão só com ícone SEM nome fica com o
  achado de nome (WCAG 4.1.2 / axe `button-name`), sem o C01 no mesmo elemento; o `verify_finding`
  (`expectedCondition: "icon-only-br-button-is-circle"`, predicado `icon-only-button`) decide o fato também nele. Oculto,
  `aria-hidden`, `role=none|presentation` ficam de fora; interno de web component do DS vira observação. Falso negativo
  conhecido: ícone por `background-image` ou caractere (`&times;`).
  Revisão da reexecução (lacuna B): o host `<br-button>` do `@govbr-ds/webcomponents` (o da tela B) é julgado pela API
  dele — rótulo pelo atributo `label` ou pelo texto do slot, ícone pelo atributo `icon` ou pelo render, circular pelo
  atributo `circle` — e o achado sai no localizador do host; o `button.br-button` no shadow root (do DS) não gera achado
  nem observação. Na chegada da Vistorias: 30 achados C01 (as ações com `title` das 10 linhas); as 10 sem nome ficam com
  o `button-name` do axe (deduplicação). As páginas de controle não carregam o pacote de web components (só existe
  embutido no build do pnip): testado com um elemento próprio de mesma API no `fix370`.
- **`scan_page.investigate` empurra as cláusulas**: cada item traz até 2 `clauses` (`citeAs`, letra curta, `how` = o que
  selecionar → o que medir → `espera:` o valor) e `clausesMore`; `clausesNote` diz o que fazer. Revisão da 3.7.0 (ALTA):
  só entra a cláusula cujo TEXTO dá o procedimento — parte obrigatória da tabela de anatomia, área mínima em px, atributo
  citado entre crases (valor literal curto ou "não vazio"; a força dá presente/ausente) ou lugar nomeado ("à esquerda",
  "no topo"; não "acima de duas linhas", nem ordem de navegação) — e nunca a condicional ("Quando…", "Caso…", "do tipo…").
  Nos 36 componentes, 62 cláusulas empurradas (51 de anatomia, 10 de posição, 1 de atributo), nenhuma com o genérico
  "espera: presente" da 1ª versão (72, 29 genéricas). Na 1ª página o investigate cede depois do que tem continuação no
  ledger (observações, ids do diff, deduplicação) e antes da cobertura, do estado e das pendências, em degraus marcados em
  `compacted` (`investigate.clauses` → só id + procedimento → a 1ª por componente → `investigate` nomes + next). Nunca
  some e nunca tira família (teste em todo teto de 3k a 16k).
  Revisão da reexecução (lacuna A): degraus compactos — nomes + `clauses` por componente como `id · procedimento curto`
  (2, depois 1 por componente, depois 1 em 3 componentes); cobertura e estado cedem antes da última cláusula (1 componente);
  depois nomes + `investigateNote` (≤ 160 car.: os componentes cujas cláusulas não couberam + a chamada que as traz), que
  fica até as pendências estarem no piso de ids; só então nomes + next (famílias e pendências nunca saem por ele). Nas 136
  chamadas reais (`.tmp-eval/fix370-budget/`): dos 22 scans só com nomes, 6 passam a ter cláusula, 8 o aviso, 8 só nomes + next.
- **Lista de verificação por mensurabilidade** (`get_component_spec` view `checklist`): itens em ordem de posto (dom-css,
  geometry, anatomy, keyboard, viewport, visual, judgement, source; no mesmo posto, o que nenhum check mede primeiro). Com
  procedimento derivável, `measure.how` é ele (`when` quando só vale em toque/móvel: a de 48×48 `…1c0146e93d2e`); sem ele,
  a cláusula é julgamento (`measurability: "judgement"`, `how` sem valor esperado; teclado, largura e captura mantêm a
  instrução da estratégia). O rótulo do Button (agora medido pelo C01) traz `measure.procedure` com a exceção como
  PROCEDIMENTO DO ORÁCULO e a proveniência dita (id legado inteiro); a letra e a `condition` lost-exception são as da base.
- **C20 (48×48) não entra como detector.** Ligar o `target-size` do axe (WCAG 2.5.8, 24×24, desligado por padrão no
  4.12) foi medido nos controles `a/`: 30 achados em 10 páginas, todos nos links de texto da lista do esqueleto
  (`li > a`, 19 px de altura), também nos gêmeos `-C` e fora das células do catálogo — não é "zero falso positivo"
  demonstrável, então a regra continua desligada. A cláusula 48×48 (`foundation-global-1c0146e93d2e`) é expressa como
  procedimento quando servida (`espera: ≥ 48×48px`, `when`: toque/móvel; a de 24×24, `…5f213b4dbcb5`, `≥ 24×24px`); um
  detector exigiria emulação móvel no scan (janela congelada 1280×900) — não feito.
- **Controles (sem modelo):** portão NAT-86 `a/` (`npm run portao:oraculo -- --divisao desenvolvimento`, matriz
  d35b33f5) **GO**, 171 linhas: 165 idênticas à 3.6.6 e 6 só no hash de estado (como 3.6.5 × 3.6.6). Varredura das 80
  páginas `a/` em cada receita: **0 achados C01**. Extensão de desenvolvimento F5-06 (govbr-eval
  `controles/extensao-370/`, ala `c/` do corpus; fora do catálogo e da matriz congelados, reserva intocada): medição
  independente 5/5 gêmeos, 17/17 fatos, axe padrão limpo; C01 + `verify_finding` confirmam só os dois defeituosos (só
  ícone com aria-label; só ícone com texto recortado) e nada nos três conformes (circular, rótulo visível, botão do Input);
  fora do C01, os achados de cada par são idênticos.
- Testes: 860 (850 da 3.6.6 + 10). `test/integration/fix370.test.ts` (10 testes: C01 na página e no verify, hospedeiros, knowledge-free,
  investigate com cláusulas e a escada do teto, checklist ordenado e procedimentos). Ajustes de fixture em três testes 3.6.x pela ordem nova (a
  cobertura encolhe depois do investigate; a 2ª página do checklist de `table` não tem mais cláusula mensurável →
  `tab`; `checkbox`/`tab` agora mostram todos os `pendingId` → `radio` e `table` entram).

## 3.6.6 — revisão independente do delta da 3.6.5 (D-155)

Motivo: uma revisão independente da 3.6.5 (sondas em `.tmp-eval/rev365b/`, sobre a reexecução rc2 das 136 chamadas
reais) achou um defeito alto, três médios e um baixo; a revisão da 1ª versão da 3.6.6 achou mais dois (um médio, um
baixo), incorporados abaixo. Todas as correções são genéricas (por regra de decisão, degrau de
compactação ou registro de pendência; nada por tela, seletor ou componente nomeado). O `tools/list` não muda em nenhum
dos seis perfis (sha256 conferido antes e depois). O perfil knowledge-free não ganha nada da base. Teste:
`test/integration/fix366.test.ts` (7 testes: os 5 dos achados da 3.6.5 falham na 3.6.5; os 2 da revisão da 3.6.6
falham na 1ª versão da 3.6.6; todos passam na final); três testes do `fix365` ficaram
mais fortes (nenhum afrouxado).

- **ALTA — "sem passo" só quando o predicado decidiu** (`server.ts`, bloco `interaction` do `verify_finding`). A 3.6.5
  dava `needed:false` ("as ações da receita são o passo") a toda condição contextual com ações, mesmo quando a receita
  não levava ao fato: foco restaurado com receita que só abre a modal, `tab-stays-within-modal` sem Tab, receita
  quebrada (caso real `dev-364-b-01__p03#20`, fill not-found). Agora `needed:false` só sai com a violação **verificada
  ou contradita** no estado da receita (`checks.violation`). Estado não alcançado, predicado sem decisão ou sem
  predicado → `needed:"unknown"` com `missing` = a nota que impediu a decisão (o detalhe do predicado — "o fechamento
  da modal não foi observado na receita" — ou a limitação do estado — "Passo 0 (fill) da receita falhou: not-found"),
  e `stateSteps` = as ações da receita. A nota sai de `decisiveNoteOf(verification)` (`verify/gate.ts`, fora do objeto
  da verificação, que é guardado e devolvido inteiro como antes).
  Revisão da 3.6.6 (MÉDIA): esse `unknown` aparecia em 23 das 44 chamadas reais, e em 20 a receita alcançava o estado e
  o predicado não decidia por outro motivo (sujeito que não é o da condição — o invocador no lugar do diálogo, a raiz
  que não é `.br-message` —, norma sem predicado — "localizar não confirma" —, ambiguidade com o fato no DOM): o pedido
  "complete a receita" e a nota "sem o passo, o fato não aparece" eram falsos. Agora o pedido de passo
  (`needed:"unknown"`, `stateSteps`, nota) só sai quando a falta é da RECEITA, pelo motivo **estruturado** do gate ou do
  predicado, não pelo texto: estado não alcançado ou não reproduzido (inclusive sem `live`), alvo ausente no estado
  (`issue: "locator-no-elements"`), ou o predicado contextual marca `recipeGap` (novo campo de `ContextOutcome`, não
  muda o `issue`) — abrir/fechar/exibir não observado na receita, nenhum Tab, a mensagem já visível ou o campo
  inexistente antes da última ação, nenhuma ação que aja (janela do gatilho), sujeito não exibido ou ausente no estado.
  Os motivos de sujeito/norma/ambiguidade não tinham código (só `rule-not-applicable` e `subject-not-a-dialog`): o
  `recipeGap` foi posto em cada retorno de falta da receita, e o que não o tem é tratado como "a receita alcançou o
  estado". Nos demais, `needed:false` com `text` neutro ("a receita alcança o estado; o predicado não decidiu por outro
  motivo") e `missing` = o motivo, sem `stateSteps` nem nota.
- **MÉDIA — os acréscimos saem em degraus marcados** (`responses/scan.ts`, 1ª página do scan). A 3.6.5 trocava para a
  forma sem acréscimos de uma vez e sem rótulo: no 1º scan da tela A, no teto padrão, saíam todas as forças e todos os
  passos. Agora, depois de todo o cabeçalho no piso da 3.6.4, nesta ordem e cada degrau só se tirar algo: notas curtas
  → alsoIn curto → notas fora (com o sub-bloco checklist do sessionPending e o detalhe da revisita) → alsoIn fora →
  passos família a família, da última para a primeira (primeiro a família que ainda não coube) → força família a
  família. Cada parte entra em `compacted` (`extras:notas`, `extras:alsoIn`, `extras:passos`, `extras:força`; tudo fora
  → um rótulo só, `extras`). A regra continua: a página só troca para uma forma com menos acréscimo quando ela ganha
  família (empate: fica a com mais acréscimo), então nenhuma família sai antes dos acréscimos. Último recurso: com tudo
  fora, o próprio rótulo `extras` sai se for ele a diferença de uma família (a família vence).
- **MÉDIA — `get_finding_details(ids)` concorda com a família e o verify** (`responses/findings.ts`). A projeção por ids
  chamava `interactionOf` sem as ações da receita e dizia "a partir do carregamento, 1 Tab" num scan com
  `[click #mais]`. Agora cada achado leva as ações da receita do lote mais recente que o contém
  (`FindingStore.batchIdOf`); a lista plana do lote (`view:"findings"`) também.
- **MÉDIA — nenhuma pendência registrada sem id à vista** (`tools/componentChecklist.ts`, `server.ts`). A 3.6.5
  registrava toda cláusula servida, mas o id só aparecia nos primeiros itens que coubessem, e o `sessionPending` mostra
  até 3 por componente: pendência que o agente não tinha como fechar. Escolha: **(a) só a cláusula cujo `pendingId` a
  página mostrou vira pendência** — a opção (b), todo id registrado à vista no `sessionPending`, gastaria espaço na 1ª
  página do scan, que é das famílias. A página é montada com ids provisórios, registra as mostradas e é montada de novo
  (a nota depende só do que a página mostra, então o rascunho e a final medem igual). A cláusula servida sem id fica com
  a nota "sem pendingId: dê estado no relatório"; volta a registrar quando for mostrada. Revisão da 3.6.6 (BAIXA): ela
  fica contada — `sessionPending.checklist.components[].unregistered` (o componente entra mesmo sem pendência aberta, e
  a nota do sub-bloco explica o campo); na forma de ids, `unregistered: {componente: n}`; na de contagem,
  `sessionPending.checklistUnregistered` ao lado do total. Na 1ª página do scan ele desce e sai junto com o sub-bloco
  checklist, na escada dos extras (`extras:notas`): não custa família. A escada do checklist nunca
  desce abaixo da nota curta de pendência: o número de ids vem antes da nota geral inteira (para cada k, do maior ao
  menor, a nota geral inteira e depois a curta), e o último degrau é nota geral curta + nota de pendência curta (a
  página da 3.6.4 cabia com a nota geral inteira, que é maior que as duas juntas). Os itens da página continuam os da
  3.6.4.
- **BAIXA — alsoIn curto com scanId** (`responses/scan.ts`). A forma curta guardava só o `familyId`; o
  `get_finding_details` pede `scanId` + `familyId`. Agora `{scanId, familyId}` (sem a rota).
- **Testes.** `fix365`: "só a página servida registra" exige `pendingId` à vista nas duas páginas e a contagem igual
  aos ids mostrados; "1ª página do scan" exige a força na página em mais da metade dos tetos que cortam família, o passo
  em algum, e rótulo `extras*` quando a força sai; "checklist" exige a nota de pendência em toda página com pendências,
  `pendingId` à vista em toda página com candidata e as obrigações dos elementos na 1ª página. `fix366`: os cinco itens
  acima e os dois da revisão da 3.6.6 (sujeito errado com a receita completa → sem pedido de passo; `unregistered`
  igual às cláusulas servidas sem id em checkbox e tab, e nenhuma família a menos com ele no cabeçalho).
- **Reexecução das 136 chamadas reais** (`thesis-workspace/planejamento/atual/reexecucao-3.6.5-2026-11-02`,
  `out/replay-3.6.6-all.json`): **0 de 53 chamadas perdem família na 1ª página** frente à 3.6.4; **0 itens de
  checklist perdidos** (5 listas; nota de pendência nas 5; 18 `pendingId` à vista, todos registrados); 0 erros; acima
  do teto pedido só `b-p03#19` (igual à 3.6.4). Os quatro casos da revisão: `a-p01#0` e `a-p03#0` — 6/6 famílias, força
  em 4, passo em 1 das 3 de interação (rc2: força 0, passo 0), `compacted` + `extras:notas`, `extras:passos`;
  `a-p01#18` e `a-p03#26` — 5/6 famílias (as mesmas da 3.6.4), força 0 e passo 0, `compacted` + `extras`: a página da
  3.6.4 já estava a 26 caracteres do teto e uma força custa 19 (com o rótulo, 16 sobram). 1ªs páginas de scan com
  famílias (39): força em todas 3, em parte 23, em nenhuma 13 (rc2: tudo ou nada). `verify_finding` com bloco
  `interaction` (37 de 44): 12 `needed:false` decidido no estado da receita, 2 `needed:true` (foco visível), 3
  `needed:"unknown"` com pedido de passo — os três de receita: `b-p03#20` (passo 0 not-found), `b-p02#16` (mensagem
  visível antes da última ação), `b-p01#10` (alvo ausente no estado) — e 20 neutros (`needed:false` + `missing`:
  sujeito, norma ou ambiguidade); rc2: 35/2/0, 1ª versão da 3.6.6: 12/2/23. Mediana 3.022,5 → 3.092 car. (máx 4.883).
- 850 testes (843 da 3.6.5 + os 7 do `fix366`).


Motivo: o rastreio das perdas do com nas telas de desenvolvimento com a 3.6.4 (`dev-364-b-01`, `dev-364-a-01`,
`thesis-workspace/planejamento/atual/mecanismo-oraculo-dev-364-2026-11-02.md`) achou seis causas no oráculo; uma
revisão independente da 1ª versão destas correções achou mais oito pontos, já incorporados abaixo. Todas as correções
são genéricas (por check, pendência ou regra da base; nada por tela, seletor ou componente nomeado). O `tools/list` não
muda em nenhum perfil (esquemas de entrada e descrições iguais; sha256 conferidos nos seis perfis). O perfil
knowledge-free não ganha nada novo. Teste: `test/integration/fix365.test.ts` (15 testes: os das correções falham na 3.6.4; dois são guardas — o knowledge-free sem extras e a 1ª página com
os mesmos números de famílias com e sem acréscimos — que passam nela e falham se a 3.6.5 vazar extras ou cortar família).

- **Achado de interação traz o passo que leva ao estado** (`checkers/interaction.ts`). O foco visível (A-04 p03) dizia
  "ao receber foco…" ligado ao estado inicial; o agente copiou o estado do scan como receita e o juiz não reproduziu o
  fato. Agora o check grava o que fez em `evidence.data.interaction` (foco visível `{action:"focus", via:"keyboard"}`;
  ordem de foco `{action:"tab-from-start", presses:1}` numa receita sem ações, `{action:"markup"}` depois de ações) e
  todo achado `mode:"interaction"` projeta o passo mínimo na forma das `actions`, nesta ordem: o que o check gravou; sem
  gravação (o agente reescreveu a evidência), a `expectedCondition` do predicado (foco visível → focar o elemento; salto
  como 1º foco → Tab a partir do carregamento, só sem ações na receita); check que decide pela marcação (axe, estrutura
  do componente) → nenhum passo (`needed:false`); nada disso → `needed:"unknown"`, nunca "nenhum passo" por omissão.
  Foco → `{action:"press", selector:<localizador>, key:"Shift"}` (o Playwright foca o elemento sem editar); ordem de
  foco → `{action:"press", key:"Tab"}`. Onde aparece: na família (`interaction: {needed, steps}` + `interactionNote` uma
  vez por página; famílias sem passo não crescem), no achado de `get_finding_details` (com o texto) e no
  `verify_finding` (`interaction.stateSteps` = ações da receita do estado + o passo). A gravação muda o `evidence.data`
  dos achados de foco visível e de ordem de foco (logo a assinatura de evidência e o JSON do CLI de linha de base
  desses dois checks).
- **Família traz a força da norma** (`responses/normForce.ts`). B-15 p03: a família mostrava `severity:"moderate"` e
  não que a norma é obrigatória; o agente largou o fato "por impacto". `rule.force` vem de `getRuleById(id).force` (a
  fonte do get_ds_rules e do verify): uma palavra, a da unidade que a família manda citar (`rule.id`); sem ela na base,
  a mais forte das que o check implementa; id que a base não tem (e-MAG por número, WCAG, regra do axe) fica sem força.
- **Spec do componente não contradiz as pendências do oráculo** (`tools/exampleAudit.ts`). A-05 p03: o scan pedia o
  CAPTION como obrigatório e `get_component_spec table` serviu o exemplo canônico sem caption com `warnings: []`. (a)
  Cada exemplo passa pelos MESMOS detectores do scan (pendências de elemento do notJudged, rótulo por placeholder, ícone
  decorativo exposto) numa página isolada, sem rede e sem a folha do DS (`withHtmlPage`, toda requisição recusada); o
  que o exemplo servido não cumpre volta em `warnings` (`type: "oracle-pending" | "oracle-finding"`, código, elemento,
  cláusula) com `warningsNote`. Nos 172 exemplos dos 36 componentes: 2 com alerta (`table-irregular-1` e `-2`,
  `table-name`, sem `<caption>`). (b) A spec traz `elementObligations`: cada pendência ou check de ELEMENTO do oráculo
  (sujeito = o seletor que o scan lê; cláusula = a da fundamentação do check) cujo sujeito aparece na marcação do
  componente — `<table>` → CAPTION (e-MAG 3.9), campos → rótulo associado (e-MAG 6.2), campos de texto → placeholder,
  focáveis → foco visível. Os sujeitos e as normas saem de `ELEMENT_PENDING` (notJudged, que o próprio scan usa) e das
  tabelas de fundamentação dos checks; nenhuma lista nova. A lista de verificação traz a forma curta (sujeito, id,
  força; o texto por get_ds_rules), para não tirar itens do componente da 1ª página. No teto da spec, as obrigações
  encolhem para sujeito + id + força antes de o exemplo ser adiado. Conferência em cache por processo; falha do
  navegador vira `exampleAudit: {status:"unavailable"}`, nunca erro.
- **Mesma assinatura em outra rota** (`session.recordFamilies`/`alsoIn`). B-23 p02: o contraste do detalhe tinha a
  mesma `evidenceSignature` da família de outra rota e não virou cartão. A família ganha `alsoIn: [{route, scanId,
  familyId}]` (até 2, `alsoInMore`) quando a mesma assinatura foi vista em outra rota com OUTROS elementos (o conjunto
  de localizadores difere), ou na mesma rota noutro estado sem elemento em comum. O mesmo conjunto de elementos noutra
  rota (layout compartilhado: cabeçalho, regiões) é o mesmo elemento — como a pendência da 3.6.3 — e não entra; o
  mesmo elemento noutro estado da rota também não. Nota única `alsoInNote`: outro fato, cartão próprio por rota/estado
  (coerente com a recusa `mixed-states`).
- **Cláusula servida no checklist vira pendência da sessão** (`session.registerClauses`). A-11 p01: as cláusulas de
  posição da Message vieram no checklist e nunca mais voltaram. Cada obrigação/proibição que nenhum check mede e que se
  mede na página (estratégia dom, computed-style, accessibility-tree, keyboard-interaction ou responsive-viewport; ou
  posição/ordem visual) vira pendência `P-NN` quando é SERVIDA numa página da lista (a página seguinte registra quando o
  cursor é pedido; a página é montada com ids provisórios da largura final e montada de novo com os reais), nas rotas
  em que um scan encontrou o componente. Componente que nenhum scan encontrou não registra nada, e o perfil sem
  scan_page também não — `pendingNote` diz qual dos dois. O item traz `pendingId`; em `sessionPending` elas ficam no
  sub-bloco `checklist` (por componente: contagem e até 3 ids, com nota própria), que desce pela escada do teto:
  inteiro → ids (`byComponent` + ids) → contagem (`{componente: n}`); na 1ª página do scan, direto à contagem junto com
  as outras pendências → ids. Fecham como as outras: `verify_finding` citando a cláusula na rota, ou `pendingResolved`.
  Nos 36 componentes, 301 das 838 obrigações/proibições podem virar pendência. Posição/ordem visual (esquerda, direita,
  topo, acima, abaixo, embaixo, centralizado; "ordem" que não é de tabulação, foco ou leitura), fora das estratégias de
  teclado e código-fonte, ganha `measure.geometry` (getBoundingClientRect relativo à raiz e ordem no DOM) ALÉM da medida
  da estratégia (61 cláusulas). Medido pela revisão (página com header, input, button e table; checklist dos quatro;
  scan noutra rota): pendências 42 → 35 (todas lidas; antes 9 nunca lidas), `sessionPending` 347 → 122 caracteres,
  famílias na 1ª página 4 → 6 (as mesmas 6 de sem checklist), itens na 1ª página do checklist header 20, table 14 →
  17, button 17 → 19, input 13 → 15 (3.6.4: button 20, input 17).
- **`checksRun` declara a revisita** (menor). B-15 p03: o achado de token veio da revisita de um elemento antes oculto
  e `checksRun.omitted` dizia "tokens não foram medidos". Agora `executed` traz `{check:"tokens (revisita)",
  tokenChecks, findings}` e o omitido de tokens diz que só os elementos antes ocultos foram medidos.
- **Reexecução das 136 chamadas reais do com (`dev-364-b-01`, `dev-364-a-01`; 3.6.4 × 3.6.5,
  `thesis-workspace/planejamento/atual/reexecucao-3.6.5-2026-11-02`), correções:** (1) os acréscimos nunca tiram
  família da 1ª página do scan: duas etapas novas no FIM da escada da 1ª página, depois de todo o cabeçalho no piso da
  3.6.4 — encurtar (alsoIn → só os familyIds; notas curtas) e, se ainda faltar espaço, tirar para o detalhe (força,
  passo de interação, alsoIn e notas das famílias; o sub-bloco checklist do sessionPending, cuja contagem já está em
  `count`; a revisita no `checksRun` só com o nome); a página só troca para a forma sem acréscimo quando ela ganha
  família (empate: fica a com acréscimo); sem rótulo em `compacted`. A forma de contagem do sub-bloco checklist é o
  total (um número). A evidência da ordem de foco é a mesma em todo estado (o Tab só sem ações é decidido na
  projeção): gravá-la por estado fazia o `stateDiff` acusar evidência mudada. (2) `verify_finding` só traz o bloco
  `interaction` para achado `mode:"interaction"` que precisa de passo ou cujo passo o oráculo não sabe; fato da marcação
  não ganha bloco; "unknown" com o fato confirmado pelo predicado no estado da receita, ou com condição contextual
  (decidida sobre as ações da receita) e ações enviadas, vira `needed:false` (só o texto; a receita basta). Na
  reexecução: 37 de 44 verify com bloco, todos `mode:"interaction"` — 35 `needed:false`, 2 `needed:true`, 0 `unknown`.
  Resultado da reexecução rc2: 0 de 53 chamadas perdem família na 1ª página; 0 itens de checklist perdidos. (3) Lista de verificação: o limite da página é o da 3.6.4 (itens sem acréscimo); os acréscimos entram e
  encolhem até caber — obrigações dos elementos inteiras → ponteiro → fora da 1ª página (vão para a última, depois dos
  itens); nota curta; geometria → marca → fora; `pendingId` só nos primeiros itens que couberem → nenhum (as
  pendências seguem registradas). A spec também traz as obrigações na forma curta (sujeito, id, força).
- Nenhum teste antigo alterado. 843 testes (828 da 3.6.4 + os 15 do `fix365`).

## 3.6.4 — mistura de rotas citada só por ids de achado (teste à mão, D-155)

No teste ao vivo da 3.6.3 na tela B, um achado de rodapé ausente com `evidence.data.members` = [F-017 (lista), F-066 (agendamento)] foi **confirmado**: achados de página têm localizador `html` em toda rota, e o `verify_finding` localizava cada id citado também pelo casamento regra + localizador, pondo F-066 nas duas rotas. Agora o id exato manda; regra + localizador só vale quando o id não está em scan nenhum. Teste: `fix363.test.ts` (falha na 3.6.3, passa na 3.6.4).

## 3.6.3 — pendência curta que ainda serve, um achado por estado, telemetria na recusa (D-155)

Motivo: o rastreio das perdas do com na tela B com a 3.6.2 (`dev-362-b-01`,
`thesis-workspace/planejamento/atual/mecanismo-oraculo-tela-b-dev-362-b-01-2026-10-31.md`). O `tools/list` não muda
em nenhum perfil (sha256 fixados nos testes).

- **Forma curta da pendência guarda a medida e a tarefa** (`notJudged.pendingLine`): `P-NN:código[:n]⇒wcag-x,emag-y
  @localizador fg … bg … ratio … · tarefa` (WCAG antes do e-MAG; sem medida, até 2 localizadores e o valor observado).
  Na 3.6.2 era `P-05:contrast-incomplete:1⇒emag-4.1`: o agente que só recebeu isso não resolveu a pendência, e as três
  execuções que receberam a forma inteira resolveram. Na 1ª página, `pageLevel → curto` vem agora DEPOIS de
  investigate, observações, chaves, cobertura, estado, ids do diff e deduplicação (antes era a 3ª etapa). Escada das
  pendências: inteira → linha → mínima (`pendingLineMinimal`: uma norma, um lugar com o valor, a tarefa em poucas
  palavras — `P-05:contrast-incomplete:1⇒wcag-1.4.3 @.content #ffffff/#ff8c00 2.33:1 · decida o contraste`) →
  `código⇒norma` (a forma curta da 3.6.2) → códigos → só os ids (`{ids:["P-05",…], count, next}`). Revisão: os ids são
  o piso da 1ª página enquanto uma família puder sair no lugar — a etapa "pendências → contagem" saiu da escada (só o
  teto rígido, sem família nenhuma, desce à contagem, e antes dos textos de limits). Os textos de `checksRun.limits`
  continuam fora das etapas (D-154).
- Reexecução sem modelo das 198 chamadas reais do com (3.6.2 × 3.6.3, `reexecucao-3.6.3-2026-10-31`, inclui
  `dev-362-b-01` p01–p03; final no README da pasta): 0 de 72 chamadas com famílias perdem família da 1ª página; 0
  acima do teto; erros iguais (1 `invalid-combination` original); 0 recusas `mixed-states` em 63 verificações. Forma
  das pendências na 1ª página (63 scans): 3.6.2 código⇒norma 40, contagem 10; 3.6.3 inteira 23, linha/mínima 19, ids 9,
  contagem 1 (bloco sem pendência). No `dev-362-b-01` p02 o 1º scan traz a de contraste inteira (2,33:1 e a tarefa).
- **`verify_finding` recusa o fato com membros de rotas/estados diferentes** (`errorCode: "mixed-states"`,
  `verify/mixedStates.ts`). Referências só estruturadas: `scanId`, o `finding.id` de um achado guardado, a página do
  elemento, ids de scan/achado desta sessão em `evidence.data` (menos os que o próprio oráculo pôs na evidência de um
  achado da mesma norma, como os scans das outras rotas no título repetido). Recusa quando o fato não cabe numa rota só
  (`routeKeyOf`, a mesma chave das pendências), ou quando os membros em `evidence.data` são de estados diferentes da
  mesma rota sem relação declarada; a resposta traz `groups` (scanIds, url, rota, o que foi citado) e um `next` por
  grupo. Aceita, com `stateWarning`, o achado citado de outro estado da mesma rota (re-scan com menos checks/seletores,
  modal cobrindo) e a relação antes/depois declarada (`evidence.data.before`/`after`/`antes`/`depois`/`previous`/
  `baseline`/`from`/`to`…). Mesmo estado = mesma rota e mesmo fingerprint ou mesma receita (url com query, ações,
  chegada). Texto livre não é lido. Não há caminho de verificação em lote.
- **Telemetria na recusa de entrada:** enum ou tipo errado, campo desconhecido, a chave `constructor`, ferramenta
  inexistente e argumentos que não são objeto (recusados pelo protocolo do SDK, -32602) geram exatamente um evento
  (`status: "rejected"`, `error` = errorCode; no knowledge-free com o contador da trava, sem carregar nada). Antes a
  recusa respondia sem passar pelo handler instrumentado (20 eventos para 21 chamadas no p01-ferramentas de
  `dev-362-b-01`: falso positivo do isolamento). Argumentos não-objeto não chegam pela ponte do runner (o `tool_use` do
  agente é sempre objeto), mas um cliente MCP qualquer pode mandá-los.
- **Pendências da sessão por código + conjunto de elementos, resolução por rota:** só o conjunto INTEIRO de elementos
  (hash de todos os localizadores e medidas, `elementSet`, nunca na resposta) com a mesma contagem junta rotas num id
  só; sem o conjunto inteiro conhecido (ex.: o axe devolveu só 5 de 9 nós), por rota. Na mesma rota a chave de sempre
  vale (outros exemplos depois de uma ação não abrem id novo), e a rota que entrou pelo conjunto ganha a dela. A
  resolução é por ROTA: `verify_finding` fecha só a rota do achado (`pendingResolved: ["P-05@/b"]`,
  `pendingStillOpen: ["P-05@/a"]`), `pendingResolved` do scan só a rota do scan (`stillOpen` diz o resto), rota nova
  abre aberta; em `sessionPending`, `P-NN×n` = aberta em n outras rotas (quais: `openOn`). Pendências do documento
  (título, idioma, regiões) seguem por rota.
- **Não entrou:** promover a achado o contraste `incomplete` com fundo sólido medido. Nos 80 controles `a/` e nos
  estados iniciais do fluxo, da A e da B, o axe deixa um único nó incomplete — o próprio caso motivador (motivo
  `shortTextContent`, dúvida sobre ser texto, não sobre o fundo). Sem nenhum caso fora dele, a regra não teria validação.

## 3.6.2 — a 1ª página de todo scan monta por prioridade: famílias primeiro, teto garantido (D-155)

Motivo: a reexecução sem modelo de 128 chamadas reais do braço com (3.5.0 × 3.6.0 × 3.6.1,
`thesis-workspace/planejamento/atual/reexecucao-3.6.1-2026-10-31`) mostrou que as correções da 3.6.1 funcionam (o `hr`
revisitado, a pendência do título, o contraste não decidido), mas em 9 scans POSTERIORES ao 1º uma família de achados
saía da 1ª página frente à 3.6.0 — a busca gulosa da 1ª página guardava a 1ª tentativa que ganhava família e deixava
`state`/`coverage`/`revisited` inteiros (tela A p03 #21: a ordem de foco e a família da cor; tela B p02 #11:
aria-required-children) — e um scan com `maxChars` 3000 voltava com 3.191 caracteres.

- **Montagem por prioridade (`assembleFirstScanPage`).** As famílias são fatos medidos e vencem: o cabeçalho encolhe
  por etapas, cada uma até o seu piso (o inteiro fica no ledger), e só quando tudo está no piso uma família sai da 1ª
  página. Ordem: pendências de outras rotas → ids; `revisited` → contagem + seletores; pendências desta página →
  forma curta; investigate → nomes; observações → contagem; chaves constantes; cobertura → contagens; estado →
  essencial (`state.recipe` {viewport, viewportSource} fica — o runner do govbr-eval lê); ids do diff; deduplicação;
  pendências de outras rotas → contagem; `units` → código; textos de limits → códigos; pendências → códigos →
  contagem. Vale para o 1º scan e os posteriores; continuações seguem como antes. Ficam FORA dessas etapas (revisão):
  os textos de `checksRun.limits` (D-154: a orientação de honestidade cede por último, como na 3.4.2), a separação por
  rota/estado (`units`) e os ids das pendências de outras rotas (`sessionPending` não desce abaixo de `P-NN:código`);
  `revisited` fica com contagem + seletores. O orçamento das famílias é achado por busca binária sobre a resposta
  inteira, e `compacted` lista só as partes encolhidas.
- **Teto garantido:** a 1ª página de um `scan_page` nunca passa de `maxChars` (nem de 8.000): sem família que caiba,
  a página começa na continuação (cursor 0) e cada bloco desce ao mínimo (código, contagem ou `next`; os limits por
  último, a códigos), até o envelope mínimo — que mantém pendências (ids), revisitados, investigate e a separação por
  rota. No mínimo do esquema (1.000) o envelope pode não caber: volta assim mesmo, com `exceedsMaxChars`.
- **Achados da revisita** (elementos antes ocultos) entram depois dos achados dos checks pedidos: são extra e não
  deslocam famílias.
- **Teste novo** `test/unit/firstPageReplay.test.ts`: as entradas reais do assembleScan das chamadas A p03 #21 e
  B p02 #11/#13 (`test/fixtures/replay-3.6.1/`) — famílias da 1ª página ⊇ as da 3.6.0 e tamanho ≤ maxChars.
- **Medido:** reexecução das 128 chamadas reais neste build: perdas de família na 1ª página frente à 3.6.0 = 0 (8
  ganhos), nenhuma resposta acima do `maxChars` pedido; as linhas honest-gap de A-11/A-12 iguais às da 3.6.0 (os
  textos de limits ficam); o `hr` revisitado (B-15) em 7 respostas da tela B, a pendência do título (B-25) e o
  contraste não decidido (B-14) em 20 cada — iguais à 3.6.1. Duas verificações de A p02 (#18/#19) que citam o
  excerto herdado `…19f93475dc5e` com `ds-page-header` ficam `unverifiable` com a nota "cite …c21ff1c7eefc" (já na
  3.6.1: a citação do check mudou para a unidade literal). `tools/list` e instructions iguais à 3.6.1. 814 testes; CLI de linha de base fluxo/A/B/controles a/ 17/7/46/18 (os mesmos fatos da 3.6.0);
  guarda da busca 78,6% / 45,7% / 9 / 28; portão NAT-86 GO (D2 TN 116 · TP 7); knowledge-free 0 ocorrências.

## 3.6.1 — a sessão lembra o que o oráculo já disse (D-155, trace dev-350-b-01 da tela B em 3.5.0)

Motivo: no trace da campanha dev-350-b-01 (`thesis-workspace/planejamento/atual/mecanismo-oraculo-tela-b-dev-350-b-01-2026-10-31.md`)
o braço com oráculo perdeu fatos que o oráculo já tinha entregado — o sinal era opcional (pendência em texto que
sumia no scan seguinte, observação de estado oculto, `incomplete` do axe só em `coverage`) ou o agente fundiu
estados num cartão. Correções genéricas, nada por tela (seção "candidatos genéricos" do trace, itens 1–6):

- **Pendências com cláusula e id de sessão (item 1).** Cada item de `checksRun.pageLevel.notMeasured` traz `pendingId`
  (`P-NN`, por código + assunto + rota) e `rule` = a 1ª cláusula obrigatória (id, força; o texto ≤ 100 só na 1ª vez
  que o código sai numa resposta da sessão — depois, só o id). As abertas de outras rotas/estados voltam em todo scan
  em `sessionPending`: uma entrada por código (rotas contadas, até 3 ids), as sem sinal medido (idioma, regiões) só
  como `lowSignal`. Resolução: `verify_finding` com uma das normas da pendência na mesma rota (qualquer elemento) ou
  no mesmo elemento noutra rota — qualquer veredito; a resposta traz `pendingResolved` — ou a entrada nova do
  `scan_page` `pendingResolved: [{id, status, reason}]`: `conforme`/`não se aplica` exigem `reason` (sem ela fica
  aberta, `needsReason`); `violada` fecha e volta em `recordAsFinding` com a cláusula a citar (registre o achado e
  verifique). Na 1ª página as **famílias vencem**: as pendências cedem logo para a forma curta
  (`P-NN:código[:n]⇒emag-x.y`, a cláusula em `full`) e, só se ainda faltar família, para contagem + next.
- **Título do documento, `ds-page-title` (item 2).** Restrição de página nova (e-MAG 3.3, cita
  `…accessibility-global-9a6edd7d551e` "O título da página deve ser descritivo e informativo, devendo representar o
  conteúdo principal da página", WCAG 2.4.2; fora de CHECK_GROUNDING, como o foco). Medido: título vazio/ausente (com
  o axe no mesmo scan fica só o `document-title` dele; o predicado confirma). Heurístico (`pathway: heuristic`,
  `moderate`), entre scans da sessão: o mesmo `<title>` em rotas de outro modelo (segmento só de id não conta: `/x/1` =
  `/x/2`) cujos assuntos principais exibidos (h1; sem h1, o 1º título em main) diferem e não estão no título — ele não
  representa o conteúdo de pelo menos uma; o predicado não o refaz (sem decisão). Título presente numa rota só: o
  predicado não decide (adequação não é medida). "Descreve a página" segue pendência (`document-title-adequacy`).
- **Elemento antes oculto (item 3).** Observação `hiddenInState` de tokens num scan fica na sessão; no próximo scan da
  mesma página, se o elemento está renderizado, o subcheck que o marcou é medido nele mesmo com `checks` sem tokens
  (bloco `revisited`, achados no lote). Com `checks` restrito, `checksRun.omittedNote`: omitido ≠ conforme.
- **`stateDiff` sem falso "removido" (item 4).** Achado anterior cujo check não rodou (ou, com seletores diferentes,
  que pode estar fora do escopo) vai para `notRemeasured` (ids, motivo); `view:"diff"` pagina as linhas `not-remeasured`.
- **Contraste que o axe não decidiu (item 5).** `incomplete` de `color-contrast` vira pendência `contrast-incomplete`
  com o que o axe mediu (cores, razão, motivo). Knowledge-free: só `wcag-1.4.3`, nenhum texto/id da base.
- **Um achado por rota/estado (item 6).** Com a sessão já tendo visto outra rota ou outro estado, o scan traz `units`
  (rotas, estados, a regra); as instruções ganham o passo "um achado por rota/estado" (os dois perfis).
- **Tratamento do braço ferramentas (knowledge-free) muda** sem o `tools/list` mudar: instruções com dois passos novos
  (pendências do axe; um achado por rota/estado) e, nas respostas do `scan_page`, `checksRun.pageLevel` (só
  `contrast-incomplete`, `wcag-1.4.3`), `sessionPending` e `units`; `verify_finding` traz `pendingResolved`. Para fixar:
  `instructionsSha256(perfil)` (exportado de `src/server.ts`) — knowledge-free `a8f6db52…` → `1a10c763…`, evaluation
  `fbe55223…` → `ace27ba8…`.
- **Superfície:** `tools/list` evaluation `cbfffb0d…` → `3807ad95…`, full `c9848723…` → `575634a0…`, deterministic
  `145b51e4…` → `af7f8264…` (entrada `pendingResolved`; descrição de `get_page_rules` com `ds-page-title`), normative
  `0a0c7626…` → `4ad616d8…` (só a descrição); knowledge-free `f358152a…` e evidence `4b4f8249…` iguais. O contexto do
  `get_ds_rules` (lista `pageConstraints.ids`) fica sem `ds-page-title` (não é região do Template Base): byte a byte.
  O CLI de linha de base não imprime `document`/`revisited`.
- **Medido sem modelo:** CLI de linha de base fluxo 17→17, A 7→7, B 46→46, controles `controles/a` (80) 18→18, os
  mesmos achados. 1ª página do 1º scan (evaluation): famílias fluxo 6, A 5, B 5 — iguais à 3.6.0, com as pendências na
  forma curta. Na tela B, menu do avatar aberto com `checks:["axe"]`: o `hr` antes oculto sai medido
  (`ds-token-color`) e os 5 achados de page/tokens/structure vão para `notRemeasured` (antes: `removed`). Guarda da
  busca (qrels 1.0.4) idêntica à 3.6.0 (fora latência): 78,6% / P@5 45,7% / 9 enganosas. Portão NAT-86
  (`--divisao desenvolvimento`): D1/D2 iguais à 3.6.0 (D2 TN 116 · TP 7), GO. Inventário knowledge-free: 0
  ocorrências sem explicação, trava 0 (a paridade do axe acusa 5 páginas também na 3.6.0: o `strip` do script não
  remove a anotação best-practice da 3.4.4). 808 testes (13 novos em `test/integration/fix361.test.ts`, 3 em `test/unit/kbAmendments.test.ts`, 4 em `test/unit/blindResolverIds.test.ts`; fixtures de busca `changed361`: rótulos de versão e motor, cursores, totais e as 3 unidades novas nos contextos header/obrigatório; nenhuma ordem de resultado muda).
- **Base: áreas obrigatórias do Template Base (NAT-104, "texto truncado").** `ds-page-header`/`ds-page-footer` citavam
  `…template-global-19f93475dc5e`, excerto herdado ("Template Base como ponto de partida") que não diz que as áreas são
  obrigatórias — o juiz cego as marcava incertas. A versão literal ganha 3 unidades (`manifest.amendments`), com o texto
  literal de `data/ds-page-rules.json` (`page_structure`, `visao-geral`; `source.captureType`
  `literal-archived-page-rules`, `archivedPath`, `charRange`), uma por área marcada "(Obrigatório)", força `required`:
  `…c21ff1c7eefc` "1. Área de Cabeçalho (Obrigatório)", `…10b091d3e7d1` "2. Área de Conteúdo (Obrigatório)",
  `…79cf9ea963ee` "5. Área de Rodapé (Obrigatório)" (id = sha256(locator + texto), como os demais). Cabeçalho e rodapé
  citam essas unidades; o excerto fica como contexto em `implements`. Registros 3038 → 3041 (required 1102 → 1105);
  O resolvedor da 1ª passada cega (`normasDaCampanha`) serve título + texto inteiro da obrigação, força obrigatório.
  `checker-aliases.json` do govbr-eval (gerado de CHECK_GROUNDING) precisa ser regerado para os ids novos. A unidade
  da Área de Conteúdo (`…10b091d3e7d1`) é descritiva (força só pelo rótulo do título): fica na base, literal, e nenhum
  check a cita. A versão servida passa a se chamar `3.7.0-literal-2026-10-15+emenda-1` (`meta.knowledgeVersion`;
  `meta.knowledgeDir` = a pasta; `meta.amendments` declara a emenda); orientação e relações, escritas para a pasta,
  continuam valendo (a emenda só acrescenta). A emenda é entrada declarada (`scripts/kb-amendments/<versão>.json`,
  conferida por `scripts/lib/kb-amendments.mjs`): `build-kb-literal.mjs` a aplica depois do rules.jsonl da
  normalização, e o teste `test/unit/kbAmendments.test.ts` reproduz o rules.jsonl servido byte a byte.
- **Busca, motor `govbr-lexical/1.3.1`:** o rótulo de força no fim de um título de seção ("(Obrigatório)", "(Opcional)",
  "(Recomendado)") é metadado, não palavra do assunto: sai do índice do título e da seção (antes, `{query:"obrigatório",
  component:"input"}` punha as 3 unidades do Template Base em 2º–4º). Guarda (qrels 1.0.4) 78,6% / P@5 45,7% / 9
  enganosas / 28 nos estratos sem resposta, iguais; nDCG@5 médio 0,4246 → 0,4252 (uma consulta sobe); nenhum rótulo
  novo a julgar (0 sem julgamento).
- **`rule.id` resolve como veio no resolvedor da passada cega.** O agente copia `rule.id` para o cartão; as formas
  emitidas são id KB nu (`govbr-3.7.0-…`), `emag-N.N`, `wcag:N.N.N` e o id da regra do axe sem prefixo — todas na
  gramática de `normasDaCampanha` (govbr-eval, `scripts/reanalise-nat74/e14-fila.ts`), espelhada em
  `test/unit/blindResolverIds.test.ts`, que percorre cada produtor de achado. O `verify_finding` aceita `wcag:N.N.N`
  e `N.N.N`.
- **Nome acessível de botão só com ícone:** cita `wcag:4.1.2` (`source: wcag`, resolvida pelo registro WCAG); a cláusula
  do Button "botões com apenas ícones… title ou aria-label" (`…button-6b76377297eb`, recomendada) fica como contexto.
  Sai o `emag-1.1` (as cláusulas literais do e-MAG 1.1 tratam de separar camadas, não de nome).
- `data/` sha256 da árvore (o `dataSha256` da campanha): 3.6.0 `abfd2b0a…` → 3.6.1 `ffe79da7…`.
- **Limites conhecidos (citação fraca, como o resolvedor serve):** `ds-token-radius`/`ds-token-spacing` →
  "Consumo correto dos tokens" (genérica); anatomia do Message `…d0c7ed3f91af` → linha de tabela.

## 3.6.0 — o achado de um check cita a norma, não o check (D-155, trios da tela A em 3.5.0)

Motivo: em 3 trios na tela A com a 3.5.0 o braço com oráculo achou dois fatos verdadeiros e o juiz cego não
pôde creditá-los por causa da citação que o oráculo entregou. `ds-page-focus-order` (tabindex positivo antes do
salto) saía com `rule.id` = id do check, que nenhuma base resolve ("texto não localizado"; o braço sem oráculo
citou `wcag 2.4.3` e levou o crédito); a tag raiz de `<div role="button">` no lugar de `<button>` citava a
anatomia do componente, que os juízes recusaram para a semântica do elemento raiz. Genérico: nada por tela.

- **`rule.id` = unidade normativa; `rule.checker` = o check.** Todo achado dos checks de token, estrutura e página
  cita em `rule.id` (o campo que o agente copia) a 1ª norma de `implements` (`source` `govbr-ds-kb`); o id do check
  (`ds-token-color`, `ds-structure-button-tag`, `ds-page-focus-order`…) vai no campo novo `rule.checker`, que só
  escolhe o predicado do `verify_finding`. Check sem norma não produz achado (D-27; `checkerRule` falha alto).
  Os demais checks já citavam a norma (anatomia, ícone decorativo, title, foco visível, placeholder, nome
  acessível `emag-1.1`); axe segue `axe-core`.

  | check (era `rule.id`) | cita agora (`rule.id`) | cláusula da base |
  |---|---|---|
  | `ds-page-focus-order` | `…accessibility-skiplink-b0641993618f` + wcag 2.4.3 | Skip Link (required): "O skip link deve ser o primeiro elemento a receber o foco na navegação por teclado" |
  | `ds-structure-<c>-tag`, exemplo semântico (`button`, `breadcrumb`, `pagination`, `skiplink`, `step`, `header`, `footer`) | `…accessibility-global-7c91abad32ce` + wcag 1.3.1 | e-MAG 1.2 (required): "Cada elemento HTML deve ser utilizado para o fim que ele foi criado" (era a anatomia) |
  | `ds-structure-<c>-tag`, exemplo genérico (`<div>`/`<span>`) | `…component-global-e30aab6e9a68` | "A anatomia do componente segue exatamente o que está previsto na diretriz de Design" (required) |
  | `ds-token-color` | `…foundation-global-21b1a2733f7b` | "Interfaces digitais do governo devem utilizar sempre as cores pré-definidas" (required) |
  | `ds-token-font-family` | `…development-global-406774b1cb87` | "A fonte oficial utilizada pelo Governo Federal é a Rawline" (required) |
  | `ds-token-radius`, `ds-token-spacing` | `…development-global-137c50bea6ca` | "Consumo correto dos tokens" (required; a base não tem regra de raio nem de escala de espaçamento) |
  | `ds-page-header`, `ds-page-footer` | `…template-global-19f93475dc5e` | "Template Base como ponto de partida" (required), lido com o texto integral da página |
  | `ds-page-skip-link` | `…accessibility-global-538e57855252` | e-MAG 1.5 (required): "o primeiro link da página deve ser o de ir para o conteúdo" |

- **Ordem de foco: o que o check mede decide a citação.** `ds-page-focus-order` só dispara quando o 1º link é o salto
  válido e um tabindex positivo recebe o foco antes dele (o predicado dá `rule-not-applicable` sem salto e
  `contradicted` sem esse tabindex): é "o 1º a receber o foco não é o salto", a cláusula do Skip Link. Não mede
  tabindex positivo nem ordem DOM × foco em geral (sem salto fica calado), então o e-MAG 1.4 "sequência lógica"
  (`…fb9dfcacbb34`) fica como contexto em `implements` e não há o que dividir; "logo após a tag body"
  (`…02c2e513d936`, posição no DOM, não medida) saiu de `implements`.
- **Portão:** `verify_finding` confere a citação como veio (KB/e-MAG/WCAG) e acha o check por `rule.checker`, pelo
  id antigo (forma até a 3.5.0, continua aceita, com nota dizendo o que citar) ou pela `expectedCondition` exata
  (+ `component`/`region`) quando o agente copiou só a norma — e só a citação do check (`citeAs`, 1º id de
  `implements`) ou o critério WCAG que ele declara escolhem o predicado: outro id de `implements` é contexto
  (sem predicado, `unverifiable`, nota "cite citeAs") e norma de fora é ignorada com nota; WCAG 2.4.3 com
  `skip-link-first-to-receive-focus` e WCAG 1.3.1 com a tag raiz semântica escolhem o predicado do check. O
  achado do ledger herda `rule.checker` como herda `evidence.data`. `normResolution`, `save_report`
  (`implements` resolvido pelo check; achado na forma antiga entra com `rule.id` = citação do check e o check em
  `rule.checker`, registrado em `normalized` como `rule.id`) e o relatório markdown (`(verificação ds-…)`) leem o
  mesmo campo.
- **Limites conhecidos:** `ds-page-header`/`ds-page-footer` citam o "Template Base como ponto de partida" (registro
  herdado com texto truncado; a obrigação das áreas está no texto integral da página, em `data/ds-page-rules.json`,
  sem unidade própria na base) e `ds-token-radius`/`ds-token-spacing` citam a regra geral "Consumo correto dos
  tokens" — encaixes fracos, mas não há unidade melhor em `data/`.
- **Superfície:** `get_page_rules` e `get_component_spec` trazem `citeAs` em cada restrição; as projeções
  (`scan_page`, `get_finding_details`, famílias) trazem `checker` e só repetem `implements` quando ele diz algo além
  de `rule.id` (o mesmo orçamento: famílias na 1ª página fluxo 6, A 5, B 5, iguais à 3.5.0). Identidade e chave de
  família incluem `rule.checker`. `tools/list` evaluation `61177aa7…` → `cbfffb0d…` (esquema `rule.checker`,
  descrições de `rule.id`/`evidence.data` e `get_page_rules`); knowledge-free igual (`f358152a…`, o campo fica fora
  do esquema do perfil). Fixture do contexto literal 2.16.1: só a nota das restrições de página muda (`changed36`).
- **Teste novo** (`test/unit/checkerCitation.test.ts`): fixtures fazem cada check do scan emitir achado (tokens, a
  tag raiz de todo componente com exemplo, nome acessível, regiões, salto, ordem de foco, foco visível,
  placeholder, ícone, title) e nenhum `rule.id` pode falhar a resolução (KB não legado e obrigatório/proibido,
  e-MAG ou WCAG 2.2, sem `ds-`), com `checker` coerente com a norma.
- **Medido sem modelo** (CLI de linha de base, todos os checks, estado inicial): fluxo 17→17, A 7→7, B 46→46,
  controles `controles/a` (80 páginas) 18→18 — mesmos fatos, mesmos elementos; só a citação muda. Guarda da busca
  (qrels 1.0.4) igual: 78,6% / P@5 45,7% / 9 enganosas / 28 nos estratos sem resposta. Portão NAT-86
  (`portao:oraculo -- --divisao desenvolvimento`): D1 e D2 iguais à 3.5.0 (D2 TN 116 · TP 7 · FP 0), GO.

## 3.5.0 — o silêncio do scan não é cobertura (D-155 + revisão Fable de 2026-10-30)

Motivo: no `ensaio-trio-b-03` (3.4.4) o braço com oráculo mediu e descartou fatos que nenhum check julgou
(título "PNIP", campo de busca só com placeholder), citou uma cláusula de força "recomendação" como norma
violada, e nunca leu a regra dos componentes encontrados (`mecanismo-oraculo-tela-b-ensaio-b-03-2026-10-30.md`,
`revisao-fable-melhorias-oraculo-2026-10-30.md`). Tudo genérico: nada é chaveado por tela, seletor ou texto.

- **Pendências do scan (D-155 item 1; P8):** `scan_page` traz `checksRun.pageLevel {measured, notMeasured}`.
  `notMeasured` nasce do que está na página e nenhum check julga: adequação do `<title>` (com o título, o nome
  do sítio no cabeçalho e o h1 para comparar), campo com nome só pelo `title`, tabela sem
  caption/aria-label/aria-labelledby/title, adequação do `lang` e das regiões — cada uma com a cláusula
  obrigatória que a base serve (lida das unidades literais do e-MAG) e o que medir. Escrito como pendência,
  nunca veredito. Só encolhe como último recurso do teto (fica a lista de códigos); inteiro no ledger
  (`get_finding_details(scanId)` → `ledger.notJudged`). O perfil knowledge-free não muda.
- **Placeholder no lugar do rótulo (item 4a; P6):** detector determinístico no check `structure`: campo
  exibido, exposto à árvore de acessibilidade e habilitado com `placeholder` e nenhum rótulo associado
  (`<label>` com texto, `aria-labelledby` que resolve, `aria-label`) → achado `emag-6.2` (wcag 3.3.2),
  `implements` = cláusula obrigatória do e-MAG 6.2 (`…25887e6e360f`) + proibição do padrão Formulário
  (`…aabbc9b63402`). Nome só pelo `title` não é achado (H65) e vira pendência. Dentro de `<br-*>` do DS: host
  sem nome da página → achado; host nomeado → observação (é do componente); flatpickr → observação.
  `verify_finding` decide com `expectedCondition: form-field-label-not-placeholder-only` (predicado
  `placeholder-label`). Camada de relações **kb-relations-1.2.0** (R-05..R-07): Input/Textarea → as duas
  cláusulas "placeholder não substitui rótulo" e a do e-MAG 6.2, que agora aparecem em `related` na busca
  natural (q033 da NAT-97). O título pobre (item 4b) **não** virou detector: "genérico" não se mede sem
  julgamento, e ficou como pendência.
- **Ícone decorativo e title que repete o link (C03 da auditoria de mensurabilidade):** no check `structure`,
  (a) ícone com glifo (`::before`/`::after` ou `svg`), sem texto, sem nome próprio e sem `aria-hidden="true"`/role
  none, ao lado do texto de um controle nomeado pelo conteúdo → achado `…foundation-global-e0e913d352f3`
  (Iconografia, required; wcag 1.1.1); (b) `title` de link igual ao texto do link → `…global-3f41d7ddc85a`
  (e-MAG 3.5, prohibited). Invólucros (`<span class="icon"><i aria-hidden>`) não contam. Nenhum check novo se
  apoia na cláusula do Button "o rótulo é obrigatório" (`…7ef75d42ac65`), que perdeu na base literal a exceção
  do botão circular (teste negativo). Nas telas e nos 80 controles: zero disparo.
- **Lista de verificação por componente (item 2; P1/P9):** `get_component_spec{component, view:"checklist",
  cursor}` lista as obrigações e proibições do componente na base (id citável, força, texto), cada uma com
  `measure`: `automatic:true` + o check do `scan_page` ou a `expectedCondition` do `verify_finding` que a mede,
  ou `automatic:false` + o que medir no navegador pela estratégia da base (propriedades CSS citadas no texto,
  teclado, árvore de acessibilidade…); `related` traz as obrigações de fora ligadas pela camada de relações.
  O `investigate` do scan lista **todos** os componentes encontrados, ordenados pelas obrigações sem medida
  automática (`requiredUnmeasured`), com o passo da checklist; nunca encolhe abaixo da lista de nomes + `next`.
- **Força da norma citada (item 3; P11):** `verify_finding` com regra da base de força recomendação,
  desaconselhado, permissão, informativa ou indefinida traz `citationForce` (aviso + `requiredNorms`: a
  cláusula obrigatória da mesma recomendação e-MAG, os critérios WCAG/e-MAG que a regra cita e o registro WCAG
  ligado aos termos `aria-*`/`role` da cláusula). Não muda o veredito nem recusa.
- **Citações dos checks (P2/P5):** o tabindex positivo antes do salto (C12) virou a restrição
  `ds-page-focus-order` (Skip Link "primeiro elemento a receber o foco" `…b0641993618f`, `…02c2e513d936`,
  e-MAG 1.4, wcag 2.4.3); `ds-page-skip-link` ("primeiro link", e-MAG 1.5) para esse caso fica
  `rule-not-applicable` apontando a restrição nova. Botão só com ícone sem nome: `emag-1.1` / wcag 4.1.2 (era
  e-MAG 2.2, que trata de scripts; 10 vereditos de erro normativo); quando o axe já reprova o mesmo elemento por
  regra de nome (`button-name` e afins), fica só o achado do axe; `button-name` anota e-MAG 1.1. Teste novo
  confere, por tabela, que o texto de cada cláusula em `implements` descreve a condição medida.
- **Teto: achados primeiro.** Na 1ª página do scan, os blocos novos cedem antes de qualquer outra parte: o
  `investigate` vira lista de nomes com contagens + `next`, e o `pageLevel` vira códigos + contagem + `next`
  (inteiros no ledger). Só depois vem a ordem antiga, agora com os ids do diff e a deduplicação também cedendo.
  Famílias na 1ª página (padrão 8.000): fluxo 5→6, A 5→5, B 5→5. Na reexecução das 50 chamadas reais de
  29/10: 8 melhores, 42 iguais, 0 piores.
- **Revisão independente (mesma versão):** o predicado de placeholder só decide e-MAG 6.2, WCAG 3.3.2 e as cláusulas
  do DS sobre placeholder (4.1.2/1.3.1 aceitam o placeholder como nome → `unverifiable` com o porquê); o de title que
  repete o link só a cláusula do e-MAG 3.5 (não a WCAG 2.4.4); ícone com localizador no próprio ícone, interno de
  `<br-*>` ou flatpickr → sem decisão (como no scan); papéis ARIA interativos contam como controle. **Exceção perdida**
  (`data/lostExceptions.ts`, detecção genérica no legado substituído): `…button-7ef75d42ac65` ("O rótulo é um
  elemento obrigatório.") sai com `condition` = a exceção do botão circular do legado `…4d7b5f978df1` na checklist,
  na spec, nos cartões/listagens e na leitura por id do `get_ds_rules`. As pendências saem do cabeçalho do ledger
  (só códigos + contagem) e paginam inteiras como observações `not-judged` (`get_finding_details` view observations,
  cursor). `aria-labelledby` para elemento só com `aria-label` nomeia; placeholder + title é pendência (o title é
  fonte de nome); `pageLevel.measured` com `components` restrito lista só o que rodou. 777 testes.
- **instructions (P1/P7/P9):** pendências do `pageLevel`; "antes de descartar por falta de norma, pergunte uma
  vez ao get_ds_rules"; norma de violação tem de obrigar ou proibir; antes de encerrar, checklist de cada
  componente com estado medida/violada/não se aplica.
- **Superfície:** `tools/list` do perfil evaluation `adc42661…` → `61177aa7…` (`get_component_spec` ganha
  `view`/`cursor`; descrições de `verify_finding` e `get_page_rules`); knowledge-free igual (`f358152a…`). O CLI
  de linha de base imprime os mesmos campos (as pendências ficam fora; `GOVBR_SCAN_CLI_NOT_JUDGED=1` as mostra).
- **Medido sem modelo** (todos os checks, estado inicial, 1280×720): fluxo 17→17; A 7→7 (o mesmo fato do
  tabindex passa de `ds-page-skip-link` a `ds-page-focus-order`); B 55→46 (+1 `emag-6.2` no campo de busca
  só com placeholder, −10 `emag-2.2` duplicados do `button-name` do axe nos mesmos botões). Controles
  `controles/a` (80 páginas): +1 achado, `emag-6.2` no gêmeo defeituoso F5-03-D (esperado), −1 duplicado
  (`emag-2.2` = `button-name` em T-01); zero achado novo em gêmeo conforme. Guarda da busca (qrels 1.0.4)
  igual à 3.4.4/3.2.0: 78,6% / P@5 45,7% / 9 enganosas / 28 nos estratos sem resposta. Portão NAT-86 (`npm run
  portao:oraculo -- --divisao desenvolvimento`, arquivado em `govbr-eval/portao-nat86/medicoes/2026-10-30T06-37-25Z`
  = 3.4.4 e `…T06-45-20Z` = 3.5.0): D2 idêntico, TN 116 · TP 7 · FP 0, GO. Linha de base sem modelo
  (`baselines:fluxo:dev`, pares julgados de `linha-de-base-por-versao-2026-10-30.md`): A [4, 6] → [4, 7] de 14
  specs (A-02 pendente via `ds-page-focus-order`; 1 cartão em par recusado → 0); B [2, 7] → [2, 11] de 29 (B-04 via
  `emag-6.2` e os botões via `emag-1.1` pendentes; 10 cartões `emag-2.2` recusados → 0); fluxo sem par julgado
  (0 aceitos, 10 pendentes nas duas). A-04 (foco visível) não sai na linha de base da A porque a única cena do
  plano abre o diálogo de descarte e os selects ficam atrás dele (o scan no estado inicial acha os dois). 773 testes.

## 3.4.4 — correções da auditoria com agente de 2026-10-29 (lista única C1–C14)

- **C1 (scan_page):** a 1ª página enche o teto com famílias (o cabeçalho encolhe só o que tem continuação no
  ledger enquanto isso traz famílias; os textos de `checksRun.limits` nunca). Família sem `stateFingerprint`
  repetido (sai uma vez no topo) e exemplo sem a norma repetida. `responseCharsEstimate` passa a ser a
  resposta inteira (era só a lista de famílias, ~30% do teto, e parecia corte precoce); `itemsChars` = só a
  lista. Medido (padrão 8.000): fluxo 3→5 de 8 famílias, A 4→5 de 6, B 3→5 de 12; `maxChars` 6.000: 1→2.
- **C2 (verify_finding P1):** `aria-invalid=true` sozinho não desmente "erro não associado": sem IDREF do campo
  para a mensagem, `undetermined` com o porquê; com IDREF explícito, `contradicted`.
- **C3/C4/C5:** internos de shadow root de web component `<br-*>`, terceiros embutidos pelo DS (flatpickr) e,
  para tokens, elementos não renderizados viram observação `outside-page-authorship` (com motivo, norma e
  valor). O nome acessível de botão dentro de `<br-*>` continua achado (vem do que a página passa ao host).
- **C6 (foco visível):** borda que perde contraste sem ganhar espessura e mudança no próprio elemento
  invisível (opacidade efetiva 0, sem área) não contam como indicador (`discounted`).
- **C7:** a observação de escala tipográfica cita a norma da base (`…foundation-global-21fb08664799`,
  required) e a distância ao passo; `verify_finding` diz que há norma, que o oráculo não decide por máquina.
- **C8:** regra inaplicável sai com `checks.applicability: "not-applicable"`.
- **C9:** `verify_finding` com o id de um achado do ledger (mesma norma e localizador) herda o `evidence.data`
  que falta (`inheritedFromLedger`).
- **C10:** regra só `best-practice` do axe declara a ponte e-MAG como temática; `aria-valid-attr-value` só por
  `aria-controls` vira relação com 4.1.2 (não critério reprovado) e severidade moderate.
- **C11:** `coverage.axe.incompleteRules` (regra, nº de elementos, exemplo). **C12:** tabindex positivo antes do
  salto é achado `ds-page-skip-link`. **C13:** a cláusula em prosa da Message (829632) aciona o predicado de
  anatomia; `get_component_spec` lista as partes aceitas (`verifiableAnatomy`). Busca não mudou.
  **C14:** campo oculto fica `undetermined` dizendo por quê. Registro contextual 1.5.0 (knowledge-free 1.4.0).

### 3.4.4 — revisão independente (mesma versão)

- **C6:** perda de contraste deixou de ser critério (escuro → azul e preto → amarelo são indicadores). Só o campo
  em estado de erro cuja borda vermelha volta a cinza neutro no foco tem a mudança posta em dúvida, e a medição
  fica incompleta (undetermined), nunca achado. Mudança em elemento invisível continua descartada.
- **C4:** estilo autoral em estado oculto sai como observação com `hiddenInState: true` e `next` (medir no estado
  em que aparece); `display:contents` não conta como oculto. Texto fora da autoria também vira observação.
- **C3:** só host com tag de componente do catálogo (`br-<componente>`) é DS; filhos projetados por slot são da página.
- **C2:** o detalhe nomeia a ambiguidade (ARIA21 aceita aria-invalid para 3.3.1). **C10a:** regras só
  best-practice do axe continuam achados (o conjunto da 3.4.3), marcados com `data.bestPractice: true` e sem critério WCAG.
- `responseCharsEstimate` nunca fica com o tamanho só da lista: sem espaço para o valor certo, o campo sai.

## 3.4.3 — atestação da janela no estado encolhido (D-154)

Com o estado reduzido ao essencial pelo teto (3.4.2), fica também `state.recipe: {viewport, viewportSource}`
(a janela declarada e a fonte dela). É a atestação de janela que o harness do `govbr-eval` confere nas
respostas que o agente recebeu; sem ela, a checagem `janela-do-oraculo` ficava "não exercitada".

## 3.4.2 — ordem do teto da resposta (D-154, revisão pós-reexecução)

Na reexecução das chamadas reais, o primeiro `scan_page` de `solicitacao.html` (sem `maxChars`, 8 achados)
passava do teto, e o primeiro corte de `enforceCeiling` (`src/responses/scan.ts`) reduzia `checksRun.limits`
aos códigos: o agente perdia "Nenhum check deste scan mede estado atual/selecionado, ordem de foco ou posição
visual; zero achados não diz nada sobre eles." enquanto estado e cobertura, recuperáveis por outro caminho,
seguiam inteiros. Nova ordem: estado → essencial (inteiro no ledger, `get_finding_details(scanId)`), cobertura
→ contagens, `investigate` removido, dicas/chaves de família removidas e, só como último recurso, `checksRun`
→ códigos (textos de limits e `coverageNote`). `squeezed` lista os passos nessa ordem. Nenhum checker muda.

## 3.4.0 — lista única, lado A (D-153): busca, conhecimento e orientação

Fonte: `thesis-workspace/planejamento/atual/lista-unica-correcoes-3.4.0-2026-10-28.md` (A1–A12), com as
reexecuções das chamadas reais e os auditores com agente. Nada chama modelo; nenhum texto da base muda.

**Ranking `govbr-lexical/1.3.0`, vocabulário `vocab-1.2.0`.** Gerais, nenhuma por consulta:
- *A3*: o sucessor auditado de um id histórico (`legacy-ids.json`) é indexado também com o título e as
  referências WCAG/e-MAG do registro histórico (campo `legacy`, peso 0,4); o termo que só casou ali não
  entra em `why.matched`. "título" volta a trazer a e-MAG 3.3 (WCAG 2.4.2 no registro antigo).
- *A7*: palavra (≥ 5 letras) que não casa nada, nem por radical nem por vocabulário, ganha UMA alternativa
  por distância de edição (≤ 1 até 7 letras, ≤ 2 a partir de 8, com transposição), peso 0,6, dita em
  `query.approximated` e em `why.matched` como `rotlo→≈rotulo`.
- *A8*: com componente em escopo (`component`, o único nomeado no texto, ou os observados no `context`) e
  sem palavra de marcação na consulta (tag, html, atributo, identificador, `<`, `=`), diretriz global de
  codificação HTML (categoria `development`) pesa 0,5: "fechar" da mensagem não é "fechar tags". No
  `context`, o grupo cuja melhor candidata é mais relevante abre a alternância (empate: global primeiro,
  como antes); `match:"literal"` não muda.
- *A9*: `vocab-1.2.0` = 1.1.0 + flexão de gênero mínimo/mínima e máximo/máxima (origem
  `auditoria-com-agente-2026-10-28`, reportada à parte). tabindex→tabulação continua rejeitado (revisão de
  28/10); o caso tabindex vai pelo roteamento.

Guarda D-152 (benchmark 1.0.0, qrels 1.0.4, estrato respondível, léxica), cada mudança desligada sobre as demais:

| configuração | hit@5 | P@5 | nDCG@5 | enganosas | resultados sem-resposta/fora/neg. difícil | sem julgamento (Hole@5) | caracteres (média) |
|---|---|---|---|---|---|---|---|
| 3.3.0 | 78,6 | 45,1 | 38,8 | 9 | 29 | 0 | 5.862 |
| **3.4.0** | **78,6** | **45,7** | **39,2** | **9** | **28** | **0** | 6.293 |
| sem `legacy` (A3) | 78,6 | 45,7 | 38,7 | 9 | 29 | 0 | 6.311 |
| sem aproximação (A7) | 78,6 | 45,1 | 39,4 | 9 | 28 | 0 | 6.299 |
| sem peso menor de codificação (A8) | 78,6 | 45,7 | 39,2 | 9 | 28 | 0 | 6.293 |
| `vocab-1.1.0` (A9) | 78,6 | 45,7 | 39,2 | 9 | 28 | 0 | 6.293 |

Os caracteres sobem pelos blocos novos (abaixo), não pelo ranking.

**Orientação na resposta (não muda o ranking):**
- *A1/A11*: listagem de catálogo em faixas fixas — prosa que obriga/proíbe, depois a outra prosa, depois
  linhas de tabela; ordem da base em cada faixa (`listing-reading` diz isso). Linha de tabela sai como
  `kind:"implementation-property"`, `force:null` em toda listagem (index/brief/full) e no lote `ids`; o
  registro por id mantém a força. `{component:"message"}` traz as regras de posição ícone/fechar na 1ª página.
- *A1/A10*: `get_component_spec.rules.clauses` = texto literal das 5 primeiras cláusulas de prosa do
  componente na mesma ordem (citáveis, cortadas em 240). Para caber com o exemplo: `tokensUsed` é adiado
  (contagem + `next`), as cláusulas caem para 3 e, se o exemplo implícito (`include_examples`) ainda não
  couber, vem o primeiro que cabe (`exampleChoice`); só então o exemplo é adiado, como antes.
- *A4*: `routing-1.0.1` (`src/responses/routing.ts`): tabela fixa de padrões do texto → até 2 passos no
  início de `next`, com `origin`: cor em hex/rgb/hsl → `get_design_tokens{hex}` + `check_token_compliance`
  (ou `scan_page`, conforme o perfil); `aria-*`/`role=`/`<tag>`/atributo HTML → `get_ds_rules{component:"global",
  query}` + `get_component_spec`; posição/esquerda/direita → medir pela geometria. Só diz qual chamada mede
  melhor; nunca afirma norma. Só sugere ferramentas registradas no perfil.
- *A5*: 1ª página só com permissão ou regra de outro componente (quando há componente em escopo) → lacuna
  `only-permission-or-other-component` + `absenceNote`.
- *A6*: termo `aria-*`/`role` sem correspondência → a lacuna `unmatched-terms` traz `registryRefs` (WCAG 2.2
  4.1.2, 1.3.1), com o aviso fixo "texto não servido", na busca e no `context`.

**Camada `kb-relations-1.1.0` (A12, NAT-104)** — `data/knowledge/relations/kb-relations-1.1.0.json`,
`src/data/relations.ts`. Ligações curadas entre regras já servidas, para a base `3.7.0-literal-2026-10-15`;
`rules.jsonl` não muda. Cada ligação cita as cláusulas da base que a sustentam com trecho literal, conferido na
carga (trecho ausente = o servidor não sobe). R-01 paginação → estados WAI-ARIA (`5817ddd685a6`, apoio:
"Página ativa" de `ea455e768955`); R-02 button → e-MAG 1.2 HTML semântico; R-03 consulta de marcação sobre
botão → "utilizar a tag `<button>`" (`d8448a18814b`); R-04 consulta sobre cor → "devem utilizar sempre as
cores pré-definidas" (`21b1a2733f7b`). `relatedComponents` derivado entra no `context` como relação
(`relacionado:<c>@kb-relations-1.1.0`) e as ligações vêm no bloco `related` (busca com resultados, listagem por
componente, `get_component_spec.rules.related`), que nunca tira um cartão: entra inteiro, compacto ou não
entra. `registryRoutes` alimenta o A6. Desligável: `GOVBR_KB_RELATIONS=off`.

Fixture byte a byte: `test/fixtures/lexical-3.4.0-get-ds-rules.json` (24 das 30 respostas mudaram).

## 3.3.0 — busca e contrato (NAT-109, D-151, D-152): defeitos do reteste adversarial da 3.2.0

Busca híbrida medida e descartada no 3.2.0 (D-149/D-152); ver histórico do git. O único motor é o léxico
(`govbr-lexical/1.2.0`); o parâmetro `retrieval`, `GOVBR_RETRIEVAL_MODE`/`GOVBR_RETRIEVAL_REQUIRE_DENSE`, o
modelo, os vetores e a dependência `@huggingface/transformers` (onnxruntime) saíram. `match:"literal"` fica.

**Ranking = o léxico da 3.2.0, salvo o que passou a guarda (D-152).** Guarda, no desenvolvimento (benchmark
1.0.0, qrels 1.0.4, estrato respondível, léxica; a reserva já foi gasta — D-151): P@5 até 1 ponto abaixo da
3.2.0 e nem mais enganosas nem mais respostas nos estratos sem resposta. Cada mudança medida uma vez,
desligando-a sobre as demais:

| configuração | hit@5 | P@5 | nDCG@5 | enganosas | resultados sem-resposta/fora/neg. difícil | caracteres (média) |
|---|---|---|---|---|---|---|
| 3.2.0 (tudo desligado = 3.2.0 reproduzida) | 78,6 | 45,7 | 39,5 | 9 | 29 | 5.848 |
| 1ª versão do ramo (plural nos dois lados + pista isenta do piso relativo) | 78,6 | 31,9 | 41,5 | 13 | 44 | 7.199 |
| — pista sem isenção do piso, plural nos dois lados | 76,8 | 45,1 | 38,3 | 10 | 29 | 5.870 |
| plural só na consulta + pista só reordena + nomes PT (antes das linhas de tabela) | 78,6 | 44,8 | 38,4 | 9 | 29 | 5.866 |
| — sem o plural da consulta | 78,6 | 45,7 | 39,4 | 9 | 29 | 5.846 |
| — sem a pista que reordena | 78,6 | 45,1 | 38,8 | 9 | 29 | 5.862 |
| — sem os nomes PT da página | 78,6 | 44,8 | 38,4 | 9 | 29 | 5.866 |
| **final** (+ linhas de tabela depois da prosa) | **78,6** | **45,1** | **38,8** | **9** | **29** | **5.862** |

Mudanças que ficaram:
- *Plural da consulta (N-04, alta).* O plural nos dois lados (índice e consulta) aumentava as enganosas; a forma
  que ficou dobra **só a consulta** (`tokenizeQuery`: `campos` pergunta o mesmo que `campo`, que já casava as
  duas formas pelo radical). O índice e as perguntas no singular são os da 3.2.0, e o pool de candidatas não cresce.
- *Pista de componente (N-06).* Só reordena (`promoteHinted`: a 1ª/2ª regra do componente sobem até a 2ª/4ª
  posição). O piso é o da 3.2.0: isentar as regras do componente do corte relativo era a principal fonte de ruído.
- *Nome PT da própria página oficial (B-11)* para `component`/`context.components`: efeito nulo na medida.
- *Paráfrase (N-05).* A pontuação é a da 3.2.0; só o campo **informado** muda: termo achado só no
  `normalizedRule` sai em `why.matchedInParaphrase`/`field:"normalizedRule"`, fora de `why.matched`.
- *NFKC + `\p{Cf}` (N-14)*, só para entradas com esses caracteres.
- *Linhas de tabela de API/anatomia (A-12)* não aparecem mais como obrigação: no cartão vêm como
  `kind:"implementation-property"`, `force:null`, `modality:"propriedade da implementação"`, mantêm a nota
  `table-row` e ficam depois de toda cláusula de prosa da resposta (o registro por id mantém a força da base).
- *`context.terms` com várias palavras (A-12)* casa como frase (palavras adjacentes, dobradas, em um campo da regra):
  `"página atual"` não traz mais "família tipográfica atual" nem "janela atual". Sem efeito no benchmark
  (o benchmark não usa `context`).

**Contrato (sem efeito no ranking).**
- *Eco da entrada no orçamento (N-01).* Todo valor ecoado num erro tem teto (`clip`, 120 caracteres +
  `…(truncado, N caracteres)`); `fail()` corta strings e listas se a resposta passar de 8.000; campo
  desconhecido lista até 5 chaves; `maxLength` em `get_ds_rules.id`/`ids[]` (200), `component` (60), `query`
  (2.000; acima de 500 continua `query-too-long`). `get_finding_details.missing` ≤ 20 ids de ≤ 80 (esquema
  igual: o `tools/list` do knowledge-free não muda).
- *Chave `constructor` (N-11)* → `unknown-parameter` do contrato (antes: -32603 do SDK).
- *Listagem e busca nunca passam do teto (N-02):* a prova de orçamento usa o rótulo de parada mais longo.
- *Ambiguidade (N-07, N-16).* Com argumentos longos (> 200 caracteres), a chamada vai uma vez em
  `ambiguity.baseCall` e cada grupo leva `{arguments:{component}, extends:"ambiguity.baseCall"}`; o grupo
  "outros" também traz `next` (o 1º membro).
- *Context (N-17, B-10, B-11).* `unmatchedTerms` (também no topo da resposta) traz o termo sem candidata ou a
  parte que a base não tem (`aria-current`). Nome não resolvido traz `unresolvedDidYouMean`. Se todos os nomes
  ficam sem resolver → `unknown-component` com sugestões.
- *Cor (N-03, N-13, N-20, B-02).* `get_design_tokens.hex` aceita `#rgb`, `#rrggbb`, `rrggbb`, `#rrggbbff`,
  `rgb()`/`rgba(…, 1)`; o que não é cor → `invalid-argument`; alfa < 1 → `invalid-argument`; `hex`+`query` →
  `invalid-combination`; `query` com valor de cor é resolvida como `hex`. `get_page_rules{cursor}` sem
  `category` → `invalid-combination`.
- *Ids históricos (B-15, N-19).* `get_ds_rules{id}` de um id histórico traz `citeAs:null`, `absenceNote` e
  `current`, nesta ordem de preferência:
  - a sucessora auditada que não é título;
  - se a sucessora é o título, a cláusula da mesma seção que obriga;
  - sem sucessora (`dropped`), a regra corrente de texto mais próximo (`basis:"closest-text-lexical"`, ponteiro
    de leitura, não equivalência).
  `wcagFallback` vem quando o registro tem WCAG. No lote `ids`, o cartão histórico sai `status:"historical"`,
  `citeAs:null`.
- *e-MAG (B-09, N-15).* `validationTemplate.ruleId`/`citation` apontam a cláusula **corrente** da recomendação
  que obriga (`basis:"emag-unit-obligation"`); o id histórico fica em `historicalRuleId`/`citation.from`.
  `description`/`wcag`/`meta.note` vêm marcados `descriptionKind:"project-paraphrase"` + `paraphraseNote`.
- *`instructions` do initialize (B-18):* só o procedimento das ferramentas do perfil (sem conhecimento do DS;
  no knowledge-free, sem ferramenta de conhecimento). Descrições do `get_ds_rules`/`get_design_tokens` mais
  curtas. Os exemplos de `rule.id` do `verify_finding` agora são ids publicados (`ds-token-color`,
  `ds-structure-button-tag`, N-12).

**`tools/list` por perfil** (3.2.0 → 3.3.0, sha256): `full` `418d6054…` → `6389df23…` (34.205 → 33.084
caracteres), `evaluation` `f1529268…` → `c4066eab…`, `normative` `1642af4b…` → `bb51f701…`; `knowledge-free`
`8bdb5e35…`, `deterministic` `7e3feff3…` e `evidence` `9a7ec0b3…` **iguais**.

## 3.1.0 (NAT-97, segunda passada da busca + defeitos do roteiro sem modelo)

**Busca (`meta.ranking.engine = "govbr-lexical/1.1.0"`, vocabulário `vocab-1.1.0`).** Só correções
gerais, nenhuma regra por consulta, já com a revisão independente de 28/10: (1) plurais regulares do
português dobram para o singular (`-res/-zes`, `-ens/-uns`, `-ais/-ois/-uis`, `-veis`, `-eis` → `-il`,
`-éis` → `-el`, `-eses`/`-íses`; o singular oxítono em -s — mês, país, português — guarda o s, lido da
forma acentuada) e palavras da consulta com o mesmo radical são um conceito só; três famílias que o
prefixo de 6 letras juntaria por acaso ficam separadas (`STEM_EXCEPTIONS`: contraste/contrário,
internet/interno, principal/princípio); casar expansões pelo plural foi medido, custou uma consulta e
ficou de fora; (2) componente nomeado no texto livre (`componentsNamedIn`, critério estrito: classe
`br-*`, nome oficial de várias palavras exato, ou nome de uma palavra fora de `NAMED_IN_TEXT_EXCLUDED` —
botão, item, menu, lista, mensagem, card, etiqueta e outras palavras comuns/elementos HTML) só vale
quando a chamada não traz `component`, e então dá o peso de pista a esse componente, sem excluir nada;
com `component`, nada é acrescentado; (3) linha de tabela (API/anatomia) não ganha bônus de
identificador exato e não fixa o corte relativo (0,6 × topo) da prosa; (4) `tab → aba` virou mão
única (`aba/abas → tab`): "Tab" numa observação é a tecla; "tabs" não ganha o sentido de tecla;
(5) grupos **observação → regra** (`origem: "observacao→regra"`, 4 grupos: tecla Tab → teclado/tabulação,
mouse → teclado, verde → cor, apenas/somente → único), cada um com `clausulas` cujo corpo traz os dois
termos como palavras inteiras (teste confere). Em `rejeitados`: pontes sem cláusula (clique, vermelho,
demais, conteúdo → mensagem, diz → anunciar, aponta → âncora, token → cor) e, pela revisão,
grande → excessivo, selecionado → atual e tabindex → tabulação ("ajustado ao benchmark"). Desligáveis
à parte da base: `GOVBR_RETRIEVAL_VOCAB_OBS=off` (rótulo `vocab-1.1.0-sem-observacao`). Números do
benchmark de desenvolvimento: ver o registro da NAT-97; o ganho dos grupos observação → regra é de
conjunto de desenvolvimento e só conta na reserva.

**Defeitos do roteiro sem modelo da 3.0.0.** `scan_page` com `actions`+`arrival` (+`compareToScanId`)
passava de 8.000 caracteres (8.126 / 8.565): o cabeçalho agora conta no orçamento e, se preciso, encolhe
as partes que têm continuação e itens, na ordem (justificativas das observações → `get_finding_details`
view observations; itens de `investigate` → `investigate.more`; ids do `stateDiff` → view diff), listando
em `compacted` o que encolheu. Só na 1ª página do `scan_page`, como último recurso, a página de achados
começa vazia no cursor 0; em continuações, `get_finding_details` e checkers isolados fica sempre ≥ 1
item (o cursor anda) e a resposta diz `exceedsMaxChars`. Parâmetro desconhecido ou inválido volta no
formato de erro do contrato (`isError`, `errorCode: "unknown-parameter"` ou `"invalid-argument"`,
`field`, `didYouMean`, `accepted`, `next` com a chamada corrigida) em vez do texto -32602 do SDK; o
`tools/list` de todos os perfis fica byte a byte igual. Isso usa a validação interna do `McpServer`:
o SDK fica fixado em `~1.29.0`, e **toda atualização do `@modelcontextprotocol/sdk` precisa rodar de novo
`test/integration/input-contract.test.ts`** (o servidor falha na subida se os pontos de gancho sumirem).
`get_component_spec` → `rules.next` agora é `get_ds_rules{context:{components:[c]}, validationStrategy,
limit:5}`, que devolve cartões com `citeAs`: componente → cláusula citável em 2 chamadas (eram 3).

## 3.0.0 (NAT-99): contrato de resposta `oraculo-resposta/1.0.0`

O formato das respostas muda; o motor de busca, os pesos, o piso, os checkers, os predicados e a
lógica do portão **não** mudam (scan de regressão fluxo/A/B: 9/6/58 achados, assinatura igual à
2.17.x). Fonte: `thesis-workspace/planejamento/atual/contrato-resposta-oraculo-RASCUNHO-2026-10-28.md`
(com as decisões do §15) e os achados B-01, B-04, B-08, S-03, S-09 e S-15 do teste adversarial de 28/10.

### Mudanças incompatíveis

- **JSON compacto** em todas as ferramentas (sem indentação) e `contract: "oraculo-resposta/1.0.0"`
  em toda resposta. O caminho `get_ds_rules{match:"literal"}` continua o da 2.17.1, byte a byte
  (indentado, formato antigo).
- **Orçamento de 8.000 caracteres** no texto de toda resposta inicial (`content[0].text.length`).
  O que não cabe vai por continuação explícita: `page.cursor` (busca, listagem, lote), `clauseCursor`
  (unidade por id), `get_finding_details` (famílias e observações do scan).
- **`get_ds_rules{query|context}`**: envelope `kind:"retrieval"` com `status`
  (`candidates|partial-match|no-match|ambiguous`), `reading`, `messages`, `kb`, `query`, `results`
  (cartões), `investigation?`, `gaps`, `page {returned, matched, cursor, stop, note}`, `next` (≤ 3) e
  `absenceNote` quando há lacuna. Antes: `rules`/`candidates`, `total`, `more.nextOffset`, `retrieval`,
  `meta`. Padrão de 5 unidades (era 10 com `query` e 20 com `context`), teto 10; 5 é teto, não meta: o
  que não couber vai para o cursor com `page.stop:"budget"`. Fontes diferentes com texto parecido
  continuam dois cartões.
- **Unidade (cartão)**: só se fundem num cartão (a) o registro de título de uma recomendação/seção com o
  corpo dela (a primeira cláusula de prosa da seção na lista) e (b) as linhas da mesma tabela
  (API/anatomia). Cláusulas de prosa distintas da mesma seção são cartões separados, cada uma com seu
  `citeAs`; `citeAs` é sempre a cláusula que carrega a obrigação, nunca o título. (Revisão da NAT-99: a
  regra do contrato §5.2, "mesmo `corpusFile + sectionPath`", fundia até 27 cláusulas independentes.) `groups`, `pageConstraints` e `notRetrieved` saíram do topo do `context`;
  defeitos de exemplo e conflitos de página-fonte vão em `warnings` (1ª página).
- **Ambígua** (sem `component`): resultados em ≥ 3 grupos (componentes; `global` conta) e nenhum com a
  maioria → `status:"ambiguous"` e `ambiguity.groups[].next` com a chamada exata de cada grupo. É sinal
  e orientação, não outro conjunto: os cartões são as mesmas unidades, na mesma ordem do ranking, com
  cursor. Regra fixa, não calibrada no benchmark.
- **Orçamento e cartões**: antes de cortar uma busca abaixo de 5 cartões, todos passam a levar 1
  `toVerify` e 1 `evidence` (o texto da cláusula fica); só então vale `page.stop:"budget"`.
- **`component:"global"`** filtra só as regras sem componente.
- **Listagem sem `query`**: `kind:"listing"`, projeção `index` (`n, id, force, title ≤ 110,
  titleComplete, category`), padrão 20, teto 50; `detail:"brief"|"full"` continuam, no orçamento.
  Antes: 40 em `brief`, sem teto de caracteres (B-04: `{limit:200, detail:"full"}` = 246 KB).
- **`get_ds_rules{ids}`**: `kind:"lookup"`, `results` em cartões sem `why`; teto de 10 ids (20 com
  `detail:"index"`); ids repetidos contam uma vez. **`{id}`**: sem duplicar `rule.source` em
  `unitSource` nem o texto da regra em `mainClause`; cláusulas adjacentes acima do teto por `clauseCursor`.
- **`offset`** está obsoleto: aceito até a 4.0.0 com `deprecation`; com `cursor`, é ignorado. Cursor de
  outra consulta, versão ou ranking = erro `stale-cursor`.
- **`get_component_spec`**: `rules.ids` (lista de todos os ids) virou `rules {total, byStrategy,
  next ≤ 3}`; um exemplo por chamada (`example: <nome>`; `include_examples` traz o primeiro), `examples[]`
  saiu; acrescenta `runtime` (comportamento da implementação, texto fixo `implementation`) e `gaps`.
- **`scan_page`**: `checksOmitted` virou `checksRun {executed, omitted, limits, coverageNote,
  completeOmitted}`, sempre presente; `normativeContext` (ponteiro para centenas de candidatas) virou
  `investigate` (≤ 5 componentes na ordem do DOM, um passo cada, `doNotRepeat`); `observations` virou
  bloco limitado (`total`, `byKind`, `whyNotAFinding`, itens compactos sem HTML, continuação por
  `get_finding_details{scanId, view:"observations", cursor}`), S-03: tela B 144 KB → 8 KB; `maxChars`
  vale para a resposta inteira (padrão 8.000, era 12.000 só para as famílias); `absenceNote` sempre (S-09).
- **`verify_finding`**: campos de leitura ao lado do objeto `verification` (inalterado): `verdict`,
  `about`, `observation {status, message}`, `normResolution` (checks do próprio oráculo), `reasons[]`,
  `actions` (≤ 3, vocabulário fixo). Veredito sobre citação/aplicabilidade/estado nunca põe
  `observation.status:"contradicted"`. Com `about:"none"` (predicado existe, sem `live`) a mensagem diz
  que nada foi avaliado; id legado substituído tem `about:"citation"` e o estado da sucessora. Além da
  tabela do §11 do contrato, três códigos mecânicos:

  | `code` | Quando | `about` | `observation.status` | Ação |
  |---|---|---|---|---|
  | `locator-no-elements` | `evidenceConsistent: fail` com `live` e 0 elementos no estado reproduzido | state | not-evaluated | reproduzir estado (scanId ou actions do estado em que o elemento existe) |
  | `evidence-contradicted` | `evidenceConsistent: fail` com `live` e elementos medidos que desmentem o valor alegado | evidence | contradicted | medir condição de novo no estado certo |
  | `evidence-inconsistent` | `evidenceConsistent: fail` sem medição (dados estruturados contraditórios, ex. `expectedCondition` inválida) | evidence | not-evaluated | corrigir `evidence.data` e repetir |
- **Todas as ferramentas no teto** (revisão de 28/10): `check_component_structure`,
  `check_token_compliance` e `run_axe_scan` seguem o orçamento da resposta inteira do `scan_page`
  (observações em bloco com continuação, `absenceNote` sempre); `get_finding_details` conta o `ledger`
  (só na 1ª página) e o padrão é 8.000; `scan_page{compareToScanId}` leva em `stateDiff.findings` só
  contagens e até 10 ids por tipo, e o diff completo vem por `get_finding_details{scanId, view:"diff",
  cursor}`; `get_design_tokens` pagina `hexLookup` e a lista filtrada com `cursor` e ganha `hex` (índice
  reverso direto); `get_page_rules{category}` devolve `parts` (seções cortadas por parágrafo, ≤ 3.000,
  inteiras) com `cursor`.
- **Fim e entrada vazia**: `offset`/cursor além da última unidade → `status:"end-of-results"`,
  `page.stop:"end"`; `query:""` (ou só espaços) é erro `no-content-terms`, não listagem do catálogo.
- **Erros**: todo erro de aplicação sai com `isError: true`, `kind:"error"`, `error` (texto, como antes),
  `errorCode` e ≥ 1 `next` exato (B-08). Parâmetro desconhecido é recusado com o nome mais próximo
  (`zod .strict()`, B-01), em vez de descartado em silêncio — também nos objetos aninhados
  (`finding.rule.implement` → "você quis dizer 'implements'"); registros abertos (`evidence.data`) seguem
  abertos.
- **Prompt `validate_page`** só cita as ferramentas do perfil (S-15) e `max_iterations` precisa ser
  inteiro de 0 a 99.
- **`tools/list` muda** em todos os perfis (descrições e parâmetros novos `cursor`, `clauseCursor`,
  `example`, `hex`, `detail:"index"`, `view:"observations"|"diff"`; `inspect_computed_styles` ganha
  `cursor` e devolve os elementos no orçamento, em ordem do DOM). Campanhas novas fixam os sha da 3.0.0
  (`test/integration/knowledge-free.test.ts`).

Orientação curada (`data/retrieval/guidance-1.0.0.json`, §15.6): `investigation`, lacunas auditadas
`no-clause-in-kb` (com `registryRefs` WCAG rotulados "referência de registro, texto não servido pela
base; não sustenta sozinha uma exigência específica") e notas por cartão. Não muda ranking nem piso;
cada frase aponta para uma cláusula da base ou para `componentProvenance`; desligável com
`vocabulary:false` ou `GOVBR_RETRIEVAL_GUIDANCE=off`. **Por padrão só conceitos auditados são
servidos**; o único conceito (`estado-atual-de-item`, do exemplo 01) está `audit.status:"pending"` e
só sai com `GOVBR_RETRIEVAL_GUIDANCE=pending`, até a entrada de lote D-xx com revisão do Codex. Cada
frase de `investigation.toVerify` sai com seu `basis`; o conceito vale só para os `components` do seu
escopo (aqui `pagination`) e só para a versão da base em que foi escrito; frase sem `basis` válido
(id da base ou `componentProvenance:<componente>` com fonte de implementação) derruba a subida.

Benchmark de desenvolvimento `benchmark-1.0.0` (respondíveis, top 5, vocabulário ligado, orientação
desligada): hit 75,0% → 75,0%, P@5 40,3% → 40,5% (nenhuma consulta ganha ou perde acerto), caracteres
da 1ª chamada 6.287 → 5.879, por consulta 12.821 → 9.933; texto da 1ª chamada ≤ 7.911. Medido com uma cópia do avaliador que lê `results` (o avaliador do govbr-eval não lê o
envelope novo; ver nota de migração).

### Nota de migração: skill comum do govbr-eval e avaliador

`govbr-eval/skills/avaliar-tela/SKILL.md` (só procedimento, sem norma):
1. Passo 5: trocar "Continue uma resposta truncada pelo identificador recebido" por "Continue uma
   resposta cortada pela continuação que ela indicar (cursor ou id), sem repetir a verificação."
2. Passo 6: acrescentar "Se a ferramenta indicar uma ação (corrigir citação, reproduzir estado, medir
   condição), ela é uma sugestão de próximo passo, não uma conclusão sobre o fato." Vale nos três braços
   (o `verify_finding` do knowledge-free também devolve `actions`).
3. Onde a skill citar `scan_page.normativeContext`, `checksOmitted`, `rules`/`candidates`, `more.nextOffset`
   ou `offset`, trocar por `investigate`, `checksRun`, `results`, `page.cursor`/`cursor`.
4. Nada sobre aria-current, data-current, paginação ou qualquer norma: isso fica no oráculo.

`govbr-eval/scripts/benchmark-oraculo.ts` (não editado aqui): `units()` procura `units|rules|candidates|items`
e falha com "Unrecognized retrieval response" em todas as 72 consultas — precisa ler `results`;
`candidates` deve vir de `page.matched` (não há `total`); erros agora são `isError:true`. A regra de unidade
foi estreitada para não fundir cláusulas independentes (o avaliador pontua o cartão pelo `citeAs`). Campanhas
fixam os sha novos do `tools/list`.

## Related repositories

| Repo | Role |
|---|---|
| `../govbr-corpus` | React app under test (`@govbr-ds/core`) — carries **no** answer key |
| `../govbr-eval` | Ground truth, axe-core baseline, P/R/F1 scoring, results dashboard |

## Requirement traceability (tcc2-requirements.md)

| Req | What | Where |
|-----|------|-------|
| A1 | Rules as queryable tools/resources, never prompt text | `get_ds_rules` over the KB (`data/knowledge/`; since 2.12.0 the literal version, 2,971 literal rules + 67 carried-over records — D-11, D-119) + all tools + `govbr://` resources |
| A2 | e-MAG 3.1 alongside WCAG checks | `get_emag_rules`, axe→e-MAG cross-refs |
| A3 | Canonical component examples/specs | `get_component_spec`, `data/component-specs.json` |
| A4 | Token registry + hex→token reverse index | `get_design_tokens`, `data/tokens.json` |
| A5 | Responses as structured feedback signals | Bounded summary/evidence/full pages, Finding detail store, per-field errors on `save_report` |
| A6 | Procedure as MCP prompt primitive | `validate_page` prompt (procedure only) |
| B1 | Deterministic token/structure checks | `check_token_compliance`, `check_component_structure` |
| B2 | axe-core deterministic pass (+ F2 baseline) | `run_axe_scan` |
| C3 | Anti-hallucination gate for heuristic findings | `verify_finding` (separate checks, predicates, server-held results) + enforcement in `save_report` |
| C5 | Evidence gathering separated from judgment | `inspect_computed_styles` (collect-only) |
| D2 | Finding schema: evidence + rule + expected (+ severity, locator, taxonomy) | `src/schema/finding.ts`, resource `govbr://schema/finding` |
| D3 | Human + machine report formats | `save_report` → `.md` + `.json` |
| D4 | Auditable reasoning traces per finding | `trace` field, persisted in both formats |

## Tools

**Oracle knowledge** (read-only):
- `get_ds_rules (id?, ids?, context?, component?, category?, force?, validationStrategy?, automatable?, automationConfidence?, severitySuggestion?, standard?, query?, match?, vocabulary?, include_evidence?, detail?, limit?, cursor?, clauseCursor?, offset? [obsoleto])` — authoritative KB store; exact ids can be fetched in one batch; `query`/`context` return up to 5 candidate units as cards (3.0.0 contract, ≤ 8,000 characters, `page.cursor` continuation)
- `get_design_tokens (query?)` — semantic highlights + hex→token reverse index, or filtered token list
- `get_emag_rules (section?, id?)` — complete e-MAG 3.1 (45/45 recommendations) + KB validation template per rule
- `get_page_rules (category?)` — gov.br DS page-level guidelines; without a category, also the citable page constraints `ds-page-header`, `ds-page-footer`, `ds-page-skip-link` (2.7.0)
- `list_components ()` / `get_component_spec (component, include_examples?, example?, view?, cursor?)` — canonical structure contracts (3.5.0: `view:"checklist"` = obrigações/proibições do componente com como medir cada uma, por cursor); HTML examples are opt-in, one per call (3.0.0). Every constraint carries a **stable id** — `get_component_spec("input")` returns `ds-structure-input-tag`, the same id the deterministic checker reports (D-29); since 3.6.0 that id is the check (`rule.checker`) and the constraint also carries `citeAs`, the KB clause a finding cites in `rule.id`. Before this, an agent that described a structural violation correctly had no id to cite and borrowed a generic governance rule, which the scorer then charged as a false positive on top of a false negative.

**Evidence (C5 phase 1)**:
- `inspect_computed_styles (url, selector?, selectors?, properties?)` — batches selectors and returns only requested computed/focus properties plus structural evidence

**Deterministic checkers (no LLM)** — bounded pages, compact by default:
- `scan_page (url, selectors?, checks?, tokenChecks?, components?, actions?, arrival?, compareToScanId?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?)` — one-load aggregate fast path (`tokens`, `structure`, `axe`, `page`) with bounded setup actions, measured state arrival (2.10.0), state/finding diffs, exact cache and evidence ledger
- `check_token_compliance (url, selector?, selectors?, checks?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?)` — batched colors/fonts/radii/spacing vs. token registry
- `check_component_structure (url, component?, selectors?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?)` — batched DOM vs. canonical spec
- `run_axe_scan (url, selector?, selectors?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?)` — batched axe-core with e-MAG cross-references
- `get_finding_details (ids? | scanId?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?, familyId?)` — retrieves selected evidence or continues a stored scan without rerunning it; with `scanId` + `familyId` pages every member of a finding family (2.11.0)

All three scanners default to `detail="summary"`, return explicit `truncated`/`nextCursor`, and
respect an approximate 12,000-character budget for findings; since 3.0.0 `scan_page`'s `maxChars`
(default 8,000) bounds the whole response. Use `detail="evidence"` for adjudication and
`get_finding_details(..., detail="full")` only when a complete Finding is required.
Scanner output also reports deterministic deduplication counts and the exact merge key.
`scan_page` is the preferred first pass: its LRU cache is process-local and keyed by the rendered
state SHA-256 plus normalized scope. A changed DOM, route, viewport, focus, control state, selector
or check set cannot reuse an earlier scan. The MCP process is fresh per battery run, so evidence
does not cross experimental executions.
Interactive states must be reproduced through `scan_page.actions`; the validator cannot inherit the
state of another MCP server's browser. Supported actions are bounded click, fill, key press and wait;
since 2.10.0 a targeted step needs exactly one element (see *Replayable states* below).

**Gate + report**:
- `verify_finding (finding, live?, actions?, stateFingerprint?, arrival?, scanId?)` — separate checks (rule exists · applicable · evidence consistent · violation verified); `confirmed` only when a predicate verified the violation on every asserted element in the reproduced state (see *Verification gate* below)
- `save_report (url, finding_ids?, findings?, notes?)` — stored deterministic ids + agent-created Findings; the server-held verdict of the identical payload always wins, and inconclusive or unverified explicit findings remain in a separate review channel

**Prompt**: `validate_page (url, scope?, max_iterations?)` — the standardized two-phase procedure with dual pathway and iteration cap.

**Resources**: `govbr://schema/finding`, `govbr://tokens`, `govbr://emag/{1–6}`, `govbr://components/{name}`, `govbr://knowledge/conflicts` (the 6 accessibility anomalies in the official package's own examples + legacy-CDN and documentation defects — why example evidence is not the oracle).

## Development

```bash
npm install
npx playwright install chromium   # once
npm run build:data                # regenerate data/ after upgrading @govbr-ds/core
npm test                          # unit + in-memory MCP integration + live browser e2e
npm run build                     # tsc → dist/
```

Register with Claude Code (already done via `F:/Dev Nath/TCC/.mcp.json`):

```bash
claude mcp add govbr-ds-validator -- node <abs-path>/dist/index.js
```

Reports land in `reports/` by default; the thesis setup points `GOVBR_VALIDATOR_REPORTS_DIR` at
`../govbr-eval/reports` so all evaluation artifacts live in the harness.

### The gate grounds the oracle's own checks; silence is not conformance (2.15.0)

From the screen-A diagnosis (2026-10-22, no model run): the agent rewrote `scan_page` findings
without `rule.implements` — a field the `summary`/`evidence` projections did not show — and
`verify_finding` rejected measured facts (A-06, P-01, P-02) by a schema slip. Same predicates,
no new findings:

- **D-27 decided server-side.** For `govbr-ds-token`, `govbr-ds-structure` and `govbr-ds-page` the
  normative ids come from the check id (`CHECK_GROUNDING`, published structure/page constraints),
  never from the payload; a differing payload `implements` is ignored and said so in `detail`. A
  published check that names no rule (`ds-token-font-size`, D-32) is `unverifiable` with a `next`
  hint (never `rejected`, never `confirmed`). `rejected` stays for contradictory data, a nonexistent
  rule id, or a live counter-fact. `implements` is now in every finding projection (and in the family row).
- **Fixed absence note.** `get_ds_rules` with 0 results / missing ids / unknown id, `get_emag_rules`
  with unknown id or section, `get_component_spec` (always — the spec comes from static examples),
  and every `verify_finding` `unverifiable` carry `absenceNote`: "Ausência nesta base ou nesta
  especificação não é evidência de conformidade; o fato medido continua valendo pela WCAG/e-MAG."
  `contradicted` still only comes from a live predicate measurement.
- **`scan_page.checksOmitted`** (profiles with `checks`): which checks, token subchecks or
  components did not run in this state, one line each on what was left unmeasured. Absent when
  nothing was omitted; the knowledge-free `scan_page` has no `checks` and is unchanged.

### P1: the claimed message must belong to the claimed field (2.14.3, all profiles)

Codex review of NAT-61 (comment 4d66c40e, repro `testing/nat61-message-binding-review.mts`): field
*Telefone* enters an error state (S3, and S5 in `evaluation`); its own message says "Telefone invalido.";
another field's message says "Numero recusado." in the same action. With subject `#target`,
`errorMessage=#right` was rejected (the message names the field — correct), but `errorMessage=#wrong`
came out **`confirmed` in both profiles**: `input-error-item-identified` read the selector's (aggregated)
text and the subject's signals without proving they were the same pair.

2.14.3 keeps three questions apart: **(a)** the page detected an error on this field (S1–S5, unchanged);
**(b)** *this* message belongs to *this* field; **(c)** the item is identified/described to the user
(the AX and textual counter-proofs, unchanged). (b) holds through one of:

| Binding | What is read (`src/evidence/context.ts`, `SubjectSnapshot.binding`) |
|---|---|
| explicit reference | the field's own `aria-errormessage` / `aria-describedby` resolved **in the field's tree** to the exact message element (or a wrapper/part of it with the same text and no form field). An IDREF to a generic ancestor — one holding a field, or text beyond the message (e.g. a summary with several fields' messages) — does not bind and is listed in the detail. The link supports attribution only: the computed description/name still contradicts (an `aria-describedby` to the message puts it in the description → `contradicted`), and the link is never automatic proof of a violation |
| strict structural containment | the message is inside a composed ancestor of the field whose subtree holds **no other form field** (the same wrapper criterion as S3/S5), walking up only until the first ancestor with another field and never into `form`/`main`/dialogs; that wrapper must already have been the field's wrapper before the trigger (same registry number, one field). Neutral facts (tag, id, text, registry numbers — no class names), so it works in both profiles; the DS reading of the wrapper (S5) stays `evaluation`-only |

"A new message in the same wrapper through the transition" is the structural binding **plus** the
temporal evidence already required (the message appeared through the last action), not a separate
permission. Simultaneity of two fields validated together is not association. **`undetermined`**: a
global/external message with no explicit relation, a selector matching more than one element
(`found > 1`: the aggregated text is not one field's message), an IDREF to a generic container, a message
in a multi-field wrapper, a wrapper created by the action itself, an element claimed as "message" that
contains a form field. ARIA is **not** the only way to attribute — the structural cases are the ones the
gate measures (DS feedback appended inside the field's `.br-input`). A confirmed verdict's detail records
the pair (attribute → target, or message ↔ wrapper ↔ field registry numbers).

Condition registries: `contextual-1.3.0` (evaluation), `contextual-1.2.0` (knowledge-free).

**Tests.** `test/integration/p1-vinculo-mensagem.test.ts` (live browser, both profiles): Codex's pair
(`#right` naming the field → `rejected`, `#wrong` → `unverifiable`); the same with a generic right
message → `confirmed` via the single-field wrapper, wrong one `unverifiable`; a selector matching two
messages; an IDREF to a summary holding two fields' messages; an external message linked by
`aria-errormessage` (`confirmed`), by `aria-describedby` (`rejected` by the description) and unlinked
(`unverifiable`); single-field vs multi-field wrapper under the same S2 signal.
`test/unit/contextual.test.ts`: every binding rule on synthetic facts (stable/unstable wrapper, wrapper
with two fields before the trigger, message holding a field, no binding facts, `found > 1`, binding is
not proof: naming message and exposed `invalid` still contradict, binding without detection stays
`undetermined`). `contextual-gate.test.ts`: the open-shadow-root case whose message sits outside the
custom element with an IDREF that cannot cross the boundary is now `unverifiable` (global message, no
relation); the same message inside a wrapper holding only the host confirms. All earlier regressions
(S1–S5, success-green, the S5 negatives) unchanged.

**Gate impact (NAT-86 development division, 1280×900, matrix d35b33f5…, run `2026-10-18T-nat61-2143`).**
`evaluation`: **GO**, row totals identical to 2.14.2 (D1 per row TP 23, TN 98, preserved 15, out of
scope 25, not exercised 10; blocking 0, acceptance failures 0). The only change is at claim level, in
F1-08-D subject 2 (`#telefone`): the claims citing the *other* fields' messages (`#cartao-erro`,
`#email-erro`, for WCAG 3.3.1 and e-MAG 6.6) went `confirmed` → `unverifiable` ("não pertence
comprovadamente a este campo"); the claim with its own `#telefone-erro` (appended inside the field's
`.br-input`) still confirms through the structural binding, so the row stays TP. `knowledge-free`
(capacity 1.1.0): **GO**, no verdict changed (TP 1, TN 41, TN-por-desenho 79, preserved 15, out of scope
25, not exercised 10; blocking 0, lock attempts 0, acceptance failures 0) — in this profile those rows
already rested on S5 alone and stay `unverifiable` by design.

### S5: error state declared by the DS component (2.14.2, evaluation profile only)

Approved by Codex on NAT-61 (comment 8963921e) with binding limits. 2.14.1 left the gov.br DS error
pattern — the error is a state class on the component wrapper plus a feedback text, with no
`aria-invalid`, no `aria-errormessage` and no native validation — as `undetermined`. 2.14.2 adds one
more way to establish the **precondition "the page detected an error on this field"**, and nothing
else:

| Signal | What is read |
|---|---|
| S5 — *estado de erro declarado pelo componente DS* | the nearest `.br-input` ancestor of the field, holding exactly one form field, gained `danger` through the last action (absent in the observation right before the trigger, present in the final state), same wrapper (registry number) before and after, no `success`/`warning`/`info` alongside |

- **Source (DS knowledge, recorded in the evidence).** The *Estados* table of the Input developer tab
  in the frozen literal corpus, `data/knowledge/versions/3.7.0-literal-2026-10-15/corpus/componentes/input__desenvolvedor.md`
  (official source `core` at `20173bf2…`, `docs/components/input/input-dev.md`, sha256 `cfabfcba8464…`
  checked against the version manifest): `Erro | danger | Entrada de dados com erros`, next to
  `success`, `warning` and `info`. The mapping is **read from that file** by `src/data/dsComponentStates.ts`
  (`getDsInputErrorState`) — if the hash or the table row does not match, the signal is unavailable, never
  assumed. A confirmed verdict's detail names the component, the class, the wrapper, the transition and
  the source (file, section, row, KB version, sha256, core commit).
- **Closed mapping.** Only `br-input` → `danger`. No generalisation to other field components, to
  `.danger` on any ancestor, to `.feedback.danger`, to `danger` on the field itself, or to alerts. A
  `.br-input` with several fields, nested `.br-input`s, a different wrapper before/after, `danger`
  already present before the trigger, or `danger` together with another state class → no signal (the
  outcome stays `undetermined` unless S1–S4 hold).
- **What it proves.** Only that an error was detected. It does **not** prove identification or
  description, and alone it does not prove a 3.3.1 violation: WCAG 3.3.1 does not require programmatic
  information, so the absence of `aria-invalid`/an AX association is not by itself a failure. The
  textual-identification and description counter-proofs run exactly as before (a message that names the
  field → `contradicted`; a field description or new text the oracle cannot rule out → `undetermined`).
- **Profiles.** The mapping is DS knowledge: `getDsInputErrorState` calls `guardKnowledge`, so it is
  under the same lock as the package, and the `knowledge-free` profile never calls it
  (`verify/contextual.ts` skips S5 there). The trace keeps a *neutral* capture in both profiles
  (`SubjectSnapshot.containers`: ancestors up to the first one holding another field, with their classes
  and field counts — no DS names). In `knowledge-free`, a row whose detection rests only on S5 stays
  `undetermined` → `unverifiable`; S1–S4 still confirm there.
- Condition registry `contextual-1.2.0` (evaluation); the `knowledge-free` registry is unchanged
  (`contextual-1.1.0`).

**Tests.** `test/integration/p1-estado-ds.test.ts` (live browser, both profiles): DS positive (WCAG
3.3.1 and e-MAG 6.6, source in the detail), knowledge-free stays `unverifiable` with zero lock attempts,
the naming-message counter-proof still rejects, negatives `success`/`warning`/`info`, `danger` outside
the component (form, field, `.feedback.danger`), `danger` on another field's wrapper, a wrapper with two
fields, pre-existing `danger`, `danger`+`success`; the Codex green-success control on a DS wrapper in both
profiles and both windows. `test/unit/contextual.test.ts`: the mapping read from the corpus, every
binding/transition rule, counter-proofs, no mapping → no signal, the loader throws under the lock.
`test/integration/knowledge-free.test.ts`: `getDsInputErrorState` is in the lock list. All 2.14.1
regressions (`/sucesso-verde`, `/erro-so-aparencia`, S1–S4) unchanged.

**Gate impact (NAT-86 development division, 1280×900, matrix d35b33f5…, run `2026-10-18T-nat61-2142`).**
`evaluation`: **GO** — the four P1 3.3.1 positives (F1-01-D, F1-03-D, F1-08-D subject 2 `#telefone`,
F1-11-D) confirm again, all through S5 alone (their pages set only `.br-input.danger`); D1 per row TP 23,
TN 98, preserved 15, out of scope 25, not exercised 10; blocking 0, acceptance failures 0.
`knowledge-free`: with the matrix-derived expectation (capacity 1.0.0) the same four WCAG rows are FN
(NO-GO by 4 acceptance failures, 0 blocking), because only S5 supports their detection. govbr-eval
versions the profile's capacity separately (`portao-nat86/capacidade-knowledge-free.json`, 1.1.0): those
four rows are *não-confirmável por desenho* in this profile (a `confirmed` there would still be a
blocking FP). The matrix was not edited and the defect is not turned into conformance. With capacity
1.1.0 the `knowledge-free` gate is **GO**: TP 1 (F1-12-D, 4.1.3), TN 41, TN-por-desenho 79 (the four
rows included, all `unverifiable`), preserved 15, out of scope 25, not exercised 10; blocking 0, lock
attempts 0, acceptance failures 0.

### P1 needs programmatic evidence that the page detected an error (2.14.1, all profiles)

Codex review of NAT-61 (comment 898d2cde) reproduced a false positive that the 2.14.0 focus fix left
open: a page that accepts **any** value, paints the field green and says "Inscrição concluída com
sucesso." came out `confirmed` for WCAG 3.3.1 (`input-error-item-identified`) in both profiles, also at
1280×900. "A message appeared + the field changed appearance (under the same focus state)" is an
inference, not evidence of error detection: colour changes for success, valid input, loading, disabled.

2.14.1 separates **(a) evidence that the page detected an error on this field** from **(b) evidence
about the message's association/description**. `input-error-item-identified` and
`input-error-described-in-text` decide (b) only after (a) holds through one of a closed set of
programmatic signals, each **established by the last action** (absent in the observation right before
the trigger, present in the final state; the field must exist before the trigger):

| Signal | What is read (`src/evidence/context.ts`) |
|---|---|
| S1 | `aria-invalid` (any value other than absent/""/"false") newly set on the field itself |
| S2 | native constraint validation actually **run**: the field received an `invalid` event during the trigger (`checkValidity`/`reportValidity`/submit) and has `validity.valid === false` in the final state |
| S3 | `aria-invalid` newly set on a composed ancestor whose subtree holds no other form field (the field's own wrapper; a fieldset/group with other fields does not count) |
| S4 | *item-identified only*: the field's `aria-errormessage` resolves (same tree) to the message the last action made appear, or to its ancestor/descendant (2.14.3: only the exact message, or a wrapper/part with the same text and no form field — never a generic container) |

Never evidence of detection: field appearance (colours, classes), the wording of the message
("sucesso", "erro"…), focus, the message's role. Without a signal the outcome is `undetermined` →
`unverifiable`, never `confirmed`. Side effects that follow from the rules already in place: S1 also
exposes `invalid` to assistive technology, so for item-identified it **contradicts** the claim (as
before); S2 with the browser's interactive validation active (no `novalidate`) stays `undetermined` (the
bubble, outside the DOM, points at the field); the `invalid` event is heard by a capture listener on the
document, so a field inside a shadow root never yields S2 (the event is not composed).

**Scope reduction (declared).** Every P1 3.3.1 confirmation that rested only on the appearance change is
now `unverifiable` — in particular the gov.br DS pattern where the error state is a class on the wrapper
(`.danger`-style colour) and a feedback text, with no `aria-invalid`, no `aria-errormessage` and no native
validation. WCAG 4.1.3 (`status-message-programmatically-determined`) is unchanged: it never used the
appearance inference and a success message is also a status message. Which declared positives of the
NAT-86 development gate still confirm and which became `undetermined` is recorded in the gate run below
(*Gate impact*). Condition registry: `contextual-1.1.0`. Regressions: the Codex repro
(`/sucesso-verde`) and a real error shown only by appearance (`/erro-so-aparencia`) in
`test/integration/p1-foco-e-janela.test.ts` (both profiles, both windows); S2/S3/S4 positives, appearance
changed before the trigger, `aria-invalid` already set before the trigger, `aria-invalid` on a group with
another field, native validation run on a valid field in `test/integration/contextual-gate.test.ts`;
pure decisions in `test/unit/contextual.test.ts`. Fixtures that confirmed through appearance alone were
given an explicit S3 (`aria-invalid` on the field's wrapper) so they keep exercising the (b) half; the
earlier F1-10-N focus regression (`/sucesso`) still never confirms, now for the stricter reason.

**Gate impact (NAT-86 development division, 1280×900, matrix d35b33f5…, run `2026-10-18T-nat61-2141`).**
None of the four declared P1 3.3.1 positives of D-127 carries any of S1–S4, so **all four become
`undetermined`** (TP → FN): F1-01-D, F1-03-D, F1-08-D (subject 2, `#telefone`) and F1-11-D
(`input-error-described-in-text`) — 8 rows in `evaluation` (WCAG 3.3.1 + e-MAG 6.6), 4 in
`knowledge-free` (WCAG 3.3.1). No P1 3.3.1 positive still confirms; F1-12-D (WCAG 4.1.3) still does.
No other row changed, no false positive appeared (blocking = 0 in both profiles); the gate is therefore
**NO-GO by acceptance failures** (8 and 4). The matrix was not edited: whether those positives are
re-declared, re-built with a programmatic signal or kept as known FNs is the author's decision.

### Leak detector: per-tool fields, exact echo only (2.14.1, auxiliary)

Codex review (comment db6d022d): `classify` forgave a term found **anywhere** in the call arguments,
and the page-field allowlist keyed on generic last names (`detail`, `name`, `description`…). Now
(`scripts/lib/vazamento.ts`, `TOOL_FIELDS`): page and axe fields are declared **per tool by full leaf
path** (locators, snippets, URLs, trace texts and accessible name of the replay; axe rule/help/tags/
failure summary); server prose (`detail`, `observed`) is never a page field. An echo is forgiven only
when the term **is the whole value** of a declared argument (e.g. `finding.rule.id`) in the leaf
declared to echo it (e.g. `verify_finding` `$.verification.detail`), or the tool's own name in a protocol
error text. Any other dictionary term in that same leaf — enrichment — still counts, and every forgiven
hit is still reported with tool, path and argument path. Canaries and unit tests cover enrichment in the
echo field, echo outside the declared field, a term carried inside another argument, and page terms in
generic fields. This remains an **auxiliary** detector, not a universal proof: it only sees dictionary
terms (paraphrases pass); the guarantee is the load lock. The eval copy
(`govbr-eval/scripts/vazamento/nucleo.ts`) is byte-identical (drift guard).

### Two fixes from the NAT-86 no-model gate (2.14.0, all profiles)

- **P1: field appearance is compared under the same focus state.** Up to 2.13.0,
  `input-error-item-identified` and `input-error-described-in-text` compared the field right before the
  trigger (focused, after `fill`) with the final state (unfocused by the click on the submit button): the
  loss of the focus ring counted as "error detected", and a page that accepts the value and shows a success
  message came out `confirmed` (development control F1-10-N, a blocking false positive in the gate). The
  reference is now the most recent observation before the trigger, in the same document, where the field
  had the same focus state as in the final state; with none, the predicate answers `undetermined`. The
  message alone is never the error signal: the field's own appearance (or `invalid`) must change *(superseded
  in 2.14.1: appearance is no longer a signal at all; see above)*. This is a
  deliberate change of `evaluation` relative to 2.13.0 (P1 verdicts only); the regression is
  `test/integration/p1-foco-e-janela.test.ts` (synthetic, same mechanism).
- **Oracle window from the harness.** `GOVBR_VALIDATOR_VIEWPORT=WIDTHxHEIGHT` (read by the process, not in
  any MCP schema — the agent still cannot choose a window) replaces the frozen 1280×720 for `scan_page` and
  `verify_finding`; the state proof records `viewportSource: "harness"`. Unset: 1280×720 `frozen-desktop`,
  as before. Malformed: error, never a silent default. The baseline CLI's own `viewport` still wins.

### Knowledge-free profile: the third arm (2.14.0, NAT-61)

`GOVBR_VALIDATOR_TOOL_PROFILE=knowledge-free` serves the arm *ferramentas* (D-132, plan
`plano-nat61-braco-ferramentas-2026-10-18.md`). Same image, same server name, same tool names as
`evaluation`; only the profile changes. The comparison *ferramentas → com* estimates the incremental
contribution of the **DS + e-MAG package served and applied by the oracle** (rule lookups, normative
context, checks that apply the base). It does **not** isolate "normative knowledge" in general: WCAG
2.2 (public registry) and axe-core's own output stay in both arms, and the model keeps what it learned
in training.

| Tool | In `knowledge-free` |
|---|---|
| `get_ds_rules`, `get_design_tokens`, `get_emag_rules`, `get_page_rules`, `get_component_spec` | not registered |
| `scan_page` | axe-core only, in the reproduced state (load, recipe, arrival, fingerprint, `scanId`, diff, cache unchanged). No `checks`/`tokenChecks`/`components` in the schema, no e-MAG annotation (`rule.description` suffix, `evidence.data.emagId`), no `coverage.componentsRequested`/`componentsFound`/`evidenceSelectors`, no `observations`, no `normativeContext` |
| `get_finding_details` | unchanged (inherits the stripped batch) |
| `verify_finding` | state replay as in `evaluation`; WCAG rules checked against the WCAG 2.2 registry; `axe-core` as before; `govbr-ds-*` and `emag` sources → `ruleExists: unknown`, fixed note "Fonte não conferida neste perfil." (never `confirmed`, never rejected for the missing registry); only the three P1 conditions cited with source `wcag` select a predicate (3.3.1 ×2, 4.1.3), with labels that do not cite the e-MAG; no token-registry claim check; `registries` = `wcag` + `contextual`; `Finding` schema with neutral descriptions (the `RuleSource` enum values stay, decision 8) |
| resources, prompt `validate_page` | not registered |

**Proof that nothing leaks, three locks:**

1. **By construction** (`src/data/lock.ts`). Every knowledge loader of `data/load.ts` and
   `data/knowledge.ts` (`getKnowledgeBase`, `getRuleById`, `filterRules`, `getEvidence`, `getTokenRegistry`,
   `getComponentSpecs`, `getEmag`, `findEmagRule`, `getPageRules`, `getDsStylesheet`, `getKnowledgeConflicts`,
   `getComponentDefects`, `getEmagValidationTemplate`) calls `guardKnowledge()`; under the lock it counts and
   throws. `createServer` locks the whole process by default (`knowledgeLock: "call"` scopes it to each
   tool call, for tests and the inventory). Every telemetry event of the profile carries
   `knowledgeLockAttempts`; `> 0` = isolation failed. The WCAG registry and the axe bundle stay readable.
2. **By observation** (`npm run inventario:sem-conhecimento`). Real responses of `knowledge-free` and
   `evaluation` on the development controls (`govbr-corpus/public/controles/a/`, never `b/`) and the frozen
   screens A and B (`govbr-telas`), scanned with a dictionary generated from `data/` (KB ids, titles and
   6-word shingles of every version, legacy ids, token names, compound spec classes, published check ids,
   e-MAG titles/paraphrases, conflicts and package audit, page-rule prose, retired tool names, fixed terms).
   No global subtraction: a hit is forgiven only as an **echo** of the caller's own arguments (2.14.1: the
   whole value of a declared argument in the leaf declared for it), in a **page field** (2.14.1: declared
   per tool by full path) when the term is in that page's served/rendered bytes, in an **axe field** when the term
   is in the axe bundle, or as a **named exception** (`RuleSource` enum values; fingerprint normalization
   labels). Everything else is "sem explicação". Acceptance: 0 in `knowledge-free`, > 0 in `evaluation`
   (positive control), canaries firing, lock = 0, and axe parity per page (the `knowledge-free` axe findings
   equal the `evaluation` ones minus the e-MAG fields). The detector is auxiliary; lock 1 is the guarantee.
3. **Per run.** `tools/list` of the profile has a pinned sha256 (`test/integration/knowledge-free.test.ts`);
   the runner checks the exposed inventory and hash (eval side, after NAT-86).

**Invariance.** Apart from the two gate fixes above (P1 under equal focus; the window only when the harness sets it), `evaluation` (and `full`, `normative`, `deterministic`, `evidence`) are unchanged — measured on the knowledge-free commit, before the fixes:
`npm run invariancia:perfis -- --base <2.13.0 tree, built>` compares full payloads of both builds (all
calls of the inventory plus lookups, resources, prompt, the `full` checkers and the CLI on screens A/B),
normalizing only what varied between two runs of the same 2.13.0 build (A/A): timings, ids the page draws
on each load (Angular app id, DS `list-N`) and state hashes derived from them. The `evaluation`
`tools/list` sha256 is pinned to the 2.13.0 value in the test above.

### Contextual verification: associations, anatomy, focus transitions (2.13.0, NAT-85)

Until 2.12.0 the gate had predicates only for token values, the component root tag and the page
regions; every relation between elements, every required part and every focus transition stayed
`unverifiable`. 2.13.0 adds **nine closed conditions** in three families (`src/verify/contextual.ts`),
cut from the normative control catalogue P0 (`catalogo-controles-1.0.0`) and grounded in the literal
KB (D-124). A condition selects its predicate only when the cited rule is in its list **and**
`evidence.data.expectedCondition` is exactly the condition; a generic norm (WCAG 1.3.1, 2.4.3, 2.1.2),
a recommended or permitted rule, or a condition cited with another rule selects nothing.

| Family | `expectedCondition` | Rules | Decides on |
|---|---|---|---|
| P1 | `input-error-item-identified` (+ `errorMessage`) | WCAG 3.3.1 · e-MAG 6.6 · `…global-271582e4fbe8` | error text appeared with the last action and (2.14.1) a programmatic error signal S2–S5 was established by it (until 2.14.0: "the field changed appearance"); (2.14.3) the message is bound to **this** field — the field's own IDREF to the exact message, or a stable wrapper holding only this field; Chromium exposes no `invalid`, the message is not in the computed description/name, and it does not name the field |
| P1 | `input-error-described-in-text` | same | (2.14.1) error signal S1–S3 established by the last action (until 2.14.0: appearance or `invalid`) and no new text appeared |
| P1 | `status-message-programmatically-determined` | WCAG 4.1.3 | container gained text without focus and without alert/status/log/aria-live (self, ancestors, descendants); focus moved into it = exception |
| P2 | `required-anatomy-part-present` (+ `component`, `part`) | Message *Mensagem*, Header *Título* (logo/text substitute allowed), Breadcrumb *Título da página atual*, Modal *Botões* / *Conteúdo* | parts read through the `@govbr-ds/core` classes, open shadow roots included; hidden root, closed shadow root, optional part → no decision |
| P2 | `current-page-crumb-not-link` | `…breadcrumb-53db61fa81f9` (prohibited) | last breadcrumb item contains `a[href]` |
| P3 | `focus-returns-to-invoker-on-close` | `…modal-f36c91d7073c` | focus after closing ≠ invoker; no invoker → not applicable (rejected); invoker removed or new document → no decision |
| P3 | `initial-focus-on-required-control` | `…modal-e0ce4b474163`, `…modal-6f984d79466a` | focus outside the dialog violates every reading; on the rule's target → rejected; a field in an action dialog → verified (Q3 a); another control (possible destructive exception, not in the KB) → no decision |
| P3 | `tab-stays-within-modal` | `…modal-744f67e17bec` | a Tab with the dialog open moves focus outside it; Tab from the last focusable that wraps → rejected |
| P3 | `focus-on-close-button-when-shown` | `…message-ad83724b777f`, `…menu-a3be6788bdea` | focus on the close button when the component is shown; no close button → not applicable (rejected) |

- **New predicate outcome `undetermined`** → `checks.violation: "undetermined"` → `unverifiable`: the
  predicate ran in the reproduced state, but the data do not decide. A contextual target that does not
  exist in the state is `undetermined` too (unknown target is a limitation, not counter-evidence); the
  older predicates keep their behaviour.
- **Transition trace.** Predicates that need it get an observation before the first action and after
  each one (deep focus across open shadow roots, subject shown / focus inside / close, primary, field and
  tabbable controls, colours, visible text), with a short settle (two frames + finite animations, cap
  1 s). The *trigger* is the last action; the invoker of an action with a selector is its target.
  Without a contextual predicate the replay is the 2.12.0 one (no observer, no extra waits).
- **Only stable focus decides.** Every focus-trace observation waits until the deep active element has not
  changed for 400 ms (cap 2 s) and records `focusStable`; a P3 decision (and the 4.1.3 moved-focus exception)
  on an unstable reading is `undetermined`, so a late `setTimeout(() => x.focus())` cannot produce `verified`.
  The trigger is the last action that acts on the page (trailing `wait`s are skipped). Accessibility facts are
  paired with trace subjects by element number, never by position. Implicit live regions (`<output>`,
  timer/marquee) count for 4.1.3; a field failing native browser validation leaves "no text" undecided (the
  browser bubble is not in the DOM). A last breadcrumb link to this same page leaves "current-page title
  missing" undecided (a bare `href="#"` is a placeholder, not a link to the page); the current-page `h1` comes
  from `main`.
- **Evidence exported** with the verdict in `binding.context` (trace per step, accessibility facts,
  anatomy facts); `registries.contextual` names the condition registry version.
- **`scan_page`**: P2 runs inside the `structure` check and emits a finding (cited KB id, anchor = the
  component root, `data.component/part`) only where the gate predicate would answer `verified`.
- **Out, on purpose:** `aria-describedby` on every field (DS rule is recommended), WCAG 1.4.1 (depends
  on visual cues the oracle does not measure), restoring focus for Message (recommended) and Menu (no
  text), the destructive-modal exception (corpus text not in the KB), Pagination (type not declared in
  the DOM). Grounding: `CONTEXT_GROUNDING` in `src/checkers/grounding.ts`, kept outside
  `CHECK_GROUNDING` because these findings cite normative ids directly (no alias to generate).

### Knowledge versions: the literal base is served, 3.7.0 stays readable (2.12.0)

Until 2.11.0 the oracle served `data/knowledge/versions/3.7.0/` — 186 rules (152 normative + 34
canonical examples) whose gov.br DS texts were mostly search-index excerpts, with a manifest that
said `complete: true` after verifying 8 component pages. 2.12.0 serves
**`versions/3.7.0-literal-2026-10-15/`** (D-119), built by `scripts/build-kb-literal.mjs` from the
literal corpus in `../ds-rules/govbr-ds-3.7.0-corpus/` (126 Markdown files of the text published at
gov.br/ds and the e-MAG page, accessed 2026-10-15):

| file | what it is |
|---|---|
| `normalized/rules.jsonl` | **2,971** literal rules from the normalization output (audited, corrections applied), with one change: an old 3.7.0 id is kept only when `originalText` **and** `force` are identical (9 rules); the 43 with the same text but a different force get a new id and `supersedes: [oldId]`. Every `originalText` is a substring of `corpus/<source.corpusFile>` — checked in tests. Force from the text: 1,082 required · 154 prohibited · 1,112 recommended · 112 discouraged · 496 permitted · 15 unclear |
| `normalized/carried-over.jsonl` | **67** unchanged 3.7.0 records whose source is official but outside the literal corpus: 34 canonical examples from the `@govbr-ds/core` package, 33 rules from pages the corpus did not collect (templates, "como começar", some guides/patterns, the DS wiki) |
| `normalized/legacy-ids.json` | **110** 3.7.0 ids no longer listed: 63 superseded (20 by a differently cut literal rule or a dash-only text difference, 43 same text with a changed force), 47 with no verifiable source |
| `corpus/` | the literal `.md` corpus + `MANIFEST.json` (sha256 `f211b83f…`), `COLETA.json`, `PROVENIENCIA.md` |
| `reports/` | `regras-antigas.md` (what happened to each of the 186), normalization summary/coverage/id maps, the independent audit and its corrections; `conflicts.json`/`official-package-audit.json` inherited from 3.7.0 |
| `manifest.json` | the honest account: `complete: false`; component tabs 106/108 (accordion and scrim have no accessibility tab at the source); sources are core = tag v3.7.0 + 11 doc commits, design = tag v3.6.1 + 10 link-fix commits — cite as "text published at gov.br/ds (DS 3.7.0)", not "the 3.7.0 tag" |

- **Relations layer (3.4.0):** `data/knowledge/relations/kb-relations-1.1.0.json` (written for
  `3.7.0-literal-2026-10-15`, served only on that version; `GOVBR_KB_RELATIONS=off` turns it off) adds
  curated links between served rules, each backed by a literal quote of a KB clause checked at load. The
  KB files are not rewritten; `relatedComponents` is extended only in the loaded copy. See the 3.4.0 section.
- **Which version is served** is explicit: `activeVersion` in `data/knowledge/manifest.json`
  (`GOVBR_KB_VERSION=3.7.0` serves the old one again, e.g. to reproduce a past campaign). The
  old lexicographic pick is gone — adding a folder no longer changes the oracle.
- **No id is lost.** All 186 ids of 3.7.0 resolve through `get_ds_rules` (`id`/`ids`) and the
  `verify_finding` gate: 9 kept the same id (same text and force), 67 are carried over, and the 110
  in `legacy-ids.json` come back with a `legacy` field (`superseded` + replacements, or `dropped`;
  `fromVersion: "3.7.0 (base parcial de 2026-07)"`) but never appear in listings, facets, counts or
  the normative context. In the gate a `dropped` id exists but leaves applicability `unknown`
  ("regra sem texto na fonte oficial coletada"); a `superseded` id is judged through its successor.
- **Scanners.** The six KB ids the deterministic checkers implement (`CHECK_GROUNDING`) are listed
  rules. One changed: the skip-link check cited the e-MAG 1.5 *heading* (`…7d2b85f81c52`, which is
  `recommended` in the literal base and is now a legacy id); it now cites the literal required
  sentence `…538e57855252` ("o primeiro link da página deve ser o de ir para o conteúdo"). The
  checks themselves are unchanged: the CLI on screens A and B gives 6 and 58 findings, identical to
  2.11.0 except that cited id/excerpt (after normalizing `_ngcontent` ids).
- **API shape unchanged.** The loaded copy is canonicalized (`notes` list → string, `standard`
  `"e-MAG"` → `"eMAG"`); the files stay as produced. Component name variants also accept the
  literal page title before its parenthesis ("Magic Button", "Menu de Navegação"), never the
  Portuguese gloss.
- **What the agent sees changes**: `get_ds_rules` for a component now returns its three tabs
  (e.g. input 2 → 64 rules, footer 0 → 51, datetimepicker 0 → 36), and the 2.9.0 normative context
  grows accordingly. So the context **order** changed: candidates are grouped by observed component
  plus one global group, ordered inside each group by force (required/prohibited → recommended/
  discouraged → the rest), and the groups alternate (global first, components A→Z). Page 1 of a
  form {button, datetimepicker, input, upload} now holds required rules of all four (until 2.11.0
  pages 1–4 were all button); page 1 also lists `groups` (count per group + the call that pages
  one group alone), and `scan_page`'s `normativeContext` carries `byComponent`. `meta` of
  `get_ds_rules` names `knowledgeVersion`. The literal rules carry no `relatedComponents`/`expectedEvidence`, so context
  retrieval is by the observed component and by terms in title/rule text; `validationStrategy` and
  `automatable` are keyword heuristics (`automationConfidence: "low"`).
- The 2.9.0 context contract tests and the 2.8.0 byte-identity snapshot run pinned to 3.7.0 (their
  cases use that version's data; the snapshot ignores only the added `meta.knowledgeVersion`); the
  literal version has its own tests. Pinned to 3.7.0, the skip-link grounding id does not exist —
  the gate reports it as missing there.

### Finding families: grouped presentation, every member recoverable (2.11.0)

On real screens dozens of identical instances (calendar days, one icon-only button per table row,
fifty `.br-button`s) flooded the responses (NAT-84). The scanners and `get_finding_details(scanId)`
now answer with **families by default** (`view="families"`); the flat page stays available with
`view="findings"`, and its first page carries a small `familyIndex` (`totalFamilies`, `largestFamily`,
counted in `responseCharsEstimate`). Grouping is **presentation only**: the stored batch, `summary`,
`deduplication`, `total` and the JSON printed by `node dist/cli/scan-page.js` (which calls `scanPage`
directly) are unchanged, and nothing depends on the tool profile. Families are grouped by the full
key; a 12-hex `familyId` collision between two keys throws instead of mixing families.

- **Family key** — `rule.source + rule.id + rule.implements + rule.wcag + nature + mode + pathway +
  severity + element.page + the batch's stateFingerprint + evidence.data.property + evidenceSignature`,
  where `evidenceSignature = sha256(canonical{observed, expected, data})`. Locator, snippet, id and
  trace are not in the key; different states, norms, causes or values never share a family.
  `familyId = FAM-` + 12 hex of the key, stable for the same batch.
- **Summary per family** — `count`, one `example`, `value`, `gate` (tally of individual verdicts),
  up to `memberLimit` ids (default 25) with `membersNotReturned`, `nextMemberCursor` and a ready
  `nextMemberCall` — the rest comes from `get_finding_details`, never from rerunning the scanner.
- **Members** — `get_finding_details(scanId, familyId, cursor?, limit?, detail?)` returns each
  member's `id`, `locator`, `value`, `evidenceSignature`, `identity` and its own `status`;
  `nextCursor` walks all ids. `detail="evidence"|"full"` adds the evidence or the complete Finding.
- **No inherited verdict** — `status` keeps three separate fields: `acceptedByAgent` (always `null`
  here: the validator never sees the agent's final decision; the evaluation ledger in govbr-eval
  fills it), `ruleApplicable` (the gate's applicability check, `not-checked` without a stored
  verification) and `confirmedByGate` (`true` only with a stored `confirmed`; plus `gateVerdict`).
  A family has no verdict of its own.
- **Changed evidence** — an identity (rule + page + locator + property) that reappears with other
  evidence becomes another signature/family and is listed in `identityVersions`;
  `stateDiff.findings.evidenceChanged` reports the same between two scans (`unchanged` keeps its old meaning).
- **Known limit** — a token finding does not carry the stylesheet/selector that declared the value,
  so two CSS rules with the same off-scale value share a family; adding the cause to the key would
  require writing it into `evidence.data`, which would change the baseline CLI JSON.
- **Partial results** — a family or member page that stops early says so: `truncated: true` (read by
  telemetry), `complete: false` and
  `partial: { reasons: ["limit" | "char-budget" | "member-limit" | "time-limit"], familiesNotReturned?,
  membersNotReturned, nextCursor? }`. The flat findings page also gains `partial: { reasons, notReturned }`.
- **No unsupported certainty** — the compact finding projection no longer emits `confidence: 1`.
  A deterministic checker reproduces the same result for the same DOM and state; that is not a
  probability that the finding is correct. `pathway` already names the origin.

### Replayable states: one target, measured arrival, versioned identity (2.10.0)

Two browsers share no state: the agent's and this server's meet only through a recipe replayed from
a clean load, and repeating actions does not prove the intended scene was reached (NAT-82). Up to
2.9.0 every step acted on `locator(...).first()`, so a selector with two targets silently acted on
the first and the result looked like the requested state.

- **One target per step.** `click`, `fill` and `press` with a selector count the matches (after up to
  5 s for asynchronous rendering) and act only when there is exactly one. Otherwise the recipe stops
  with `state.replay = { status: "failed", steps, failure: { index, action, selector, reason, matched,
  detail } }`, `reason` ∈ `not-found` · `ambiguous` · `invalid-selector` · `page-changed` ·
  `action-failed`. `invalid-selector` is only a real selector syntax error; a count that fails because
  the document went away (execution context destroyed by navigation, frame detached, page closed) is
  `page-changed`; anything else is `action-failed`. If the single target stops being single between
  counting and acting (Playwright strict mode), the step is `ambiguous` with the new count. A `wait`
  with a selector is a condition, not a target: one visible match is enough and the count is recorded.
  Nothing picks an index; there is no `nth` option (see the compatibility note below).
- **Settle before the fingerprint.** An action can trigger deferred changes — a dialog whose `.show`
  class arrives by `setTimeout`, a CSS transition. After the last step, scanner and gate run the
  **same** wait (`settlePage`, `SETTLE_POLICY` in `src/scan/state.ts`): network idle (at most 2 s),
  then DOM samples (document `outerHTML` + every open shadow root) every 100 ms until 4 consecutive
  samples are identical **and** no finite animation/transition is running (`document.getAnimations()`;
  infinite ones such as spinners are ignored), capped at 3 s. The outcome is `state.settle =
  { settled }`, outside the hash. Changes deferred by more than the 300 ms quiet window are not waited
  for; a recipe that needs them declares a `wait` with a selector. Arrival is measured after the settle.
- **Arrival is measured, not assumed.** `arrival: { path?, dialogOpen?, errorVisible?, expanded?,
  focused?, visible? }` (strict; all neutral — pathname, open `dialog`/`role=dialog|alertdialog`/
  `aria-modal`, visible `role=alert` or `aria-invalid=true`, `aria-expanded=true` on exactly one
  control, focus on exactly one element across open shadow roots, at least one visible match). Every
  scan returns `state: { policy, normalizations, recipe: { url, viewport, viewportSource, actions
  (fill values kept), arrival? }, replay, settle, observed: { url, path, viewport (measured, with dpr),
  dialogs, expanded, errors, focus, unobservableRoots }, arrival: { status, conditions[] }, reached }`,
  stored with the `scanId` (also returned by `get_finding_details({ scanId }).ledger.state`).
- **Unreached is a limitation, not a result.** A failed step or an unmet condition returns
  `{ status: "state-not-reached", scanId: null, stateFingerprint: null, limitation: { kind:
  "action-error" | "arrival-not-met", detail }, state }` — no findings, no coverage, not a tool error.
  Zero findings there would read as "no defect" in a state nobody saw. The baseline CLI prints the
  same JSON and exits with code 3.
- **`verify_finding` against a recorded state.** `scanId` replays the scan's own recipe (and refuses
  `actions`/`arrival`/`stateFingerprint` alongside it). The finding's `element.page` must be the scan's
  page, compared by origin + path + query — a trailing slash and the `#fragment` do not count; another
  page is caller misuse and gets the same typed refusal (`{ error }`, no verdict) as the other scanId
  misuses. URL, measured viewport and fingerprint must all match the scan; if they do not, the state
  was **not reproduced**, which is a limitation, not evidence against the finding: `unverifiable`
  with `verifiedBy: "state-fingerprint"`, `binding.state.mismatches` ⊆ `url` · `viewport` ·
  `fingerprint`, `binding.state.limitation.kind = "state-not-reproduced"` and `binding.state.settled`.
  The same holds for a `stateFingerprint` sent without `scanId`. A recipe or arrival failure also
  leaves the claim `unverifiable` (`verifiedBy: "state-replay"`, `violation: "not-checked"`,
  `binding.state.limitation`). None of these is ever `rejected` as if there were no defect.
- **State identity `state-identity-1`.** SHA-256 of policy, URL, viewport, document `outerHTML`, the
  `innerHTML` of every open shadow root (with its host path), form/ARIA state controls in every open
  tree (value, checked, open, aria-expanded, aria-selected, aria-checked, aria-pressed), the deep focus path and the
  closed-root hosts. Scanner, cache and gate compare it **exactly**. The only normalizations are two
  consistent renamings (by first appearance, so distinct values stay distinct and references stay
  linked) of values a framework draws on every load: `ds-core-random-list-id` (`list-<0..9999>`
  with no leading zero, drawn by `@govbr-ds/core` 3.x `br-select` for its autocomplete list — only an
  id on an element that carries the DS context, `class` containing `br-list` and `role="listbox"`,
  and references to that id, in id/reference attribute values and `#list-N` locators; a `list-N` the
  page author wrote elsewhere is left as is) and `angular-emulated-app-id` (the per-bootstrap app id in
  `_ngcontent-<app>-c<N>`/`_nghost-…`; the component index is kept). They were measured, not
  assumed: on both frozen screens identical loads gave different 2.9.0 fingerprints because of exactly
  these two sources, so the cache never hit there and a `stateFingerprint` sent to `verify_finding`
  was always rejected. Fingerprints are not comparable with 2.9.0's.
- **Shadow roots.** Open roots are part of identity and observation; locators cross them with ` >>> `
  as in `inspect_computed_styles`. Closed roots are detected through CDP and listed in
  `unobservableRoots`; focus inside one is reported as the host with `interior: "unknown"`, never as
  focus on the host. The CDP read is retried (3 attempts); if it still fails, `observed.unobservableRoots`
  is `null` (unknown) while the hashed identity carries `[]`, so a one-off read failure on a page
  without closed roots does not change the fingerprint silently.
- **Window.** MCP tools run in the frozen desktop window, now explicit (`1280×720`, Playwright's
  default until now — an upgrade cannot change it silently). The viewport remains CLI-only;
  `arrival` cannot carry one.

**Compatibility.** No existing test or fixture relied on `.first()` (all their action selectors are
unique). On the frozen screens the harness probes (`.acao-enviar`, `#AGENDAR`, ids, `text=` with a
unique label) replay as before; class/tag-level selectors (`.br-button`, `button`, `.tab-item`,
`[aria-expanded]`) are ambiguous there and now fail with `ambiguous` instead of acting on the first.
No recorded baseline request carried actions.

Frozen campaigns ran on 2.7.0 and are not changed by this release.

### Normative context for what was observed (2.9.0)

In the Sonnet campaign 7 of the 10 runs with the oracle never queried the knowledge base directly:
the knowledge was there, but going from "this page has a `br-tag` and a `br-modal`" to "these are
the rules to investigate" was left entirely to the agent (NAT-83). 2.9.0 makes that link a
retrieval the oracle does itself, on the existing endpoints — no new tool, so the evaluation
profile's tool list is unchanged.

- **`get_ds_rules({ context: { components?, regions?, terms? } })`.** Returns **candidates**, each
  with `ruleId`, `force` and `obligation` (`mandatory` / `advisory` / `permissive` / `informative` —
  a recommendation stays a recommendation), `reasons` (`component-observed`, `region-observed`,
  `related-component-observed` via the KB's `relatedComponents`, or `term` with the fields it matched),
  `applicability`, `expectedEvidence` and `neededState` (derived from the rule's `validationStrategy`).
  `detail:"summary"` is the default; `brief`/`full` reuse the existing projections and add rule text,
  conditions, exceptions, `source` (url, standard) and `version`.
- **What is selected.** Rules of the observed components; global rules only through a documented
  relation (`relatedComponents`) or a caller term found in `conditions`, `exceptions`,
  `expectedEvidence`, title or normalized rule (word-start match, case/accent-insensitive). Rules of
  components not observed are never returned, and `force:"example"` records never are — examples are
  evidence, not norms. The KB publishes no other component → global-rule link, so none is invented.
- **What is not decided.** `applicability.status` is `in-scope` (own component observed, no declared
  condition or exception) or `unknown`; never `applicable`/`verified`. Conditions and exceptions are listed in
  `applicability.unevaluated`, missing relations and global-by-relation/term in `unknowns`. Pertinence
  is not verification: a finding citing a candidate without a predicate stays in review at the gate.
- **Labels kept.** Documentation conflicts (`conflicts.json`) attach to a rule only when the conflict
  names it by exact title; a conflict that only shares a candidate's source page is listed in
  `sourcePageNotes` with no rule association (a page carries several rules); components whose official examples carry known defects come back in `exampleWarnings`;
  truncated-source caveats travel with the rule. Terms also point to the `get_page_rules` categories
  whose text contains them; the page constraints (`ds-page-*`) are listed once, on the first page.
- **Determinism and budget.** Names resolve through documented variants only (id, `br-<id>`, the
  official page name: `"Cookie Bar"` → `cookiebar`); anything else is returned in
  `context.unresolved`. Order depends only on the normalized context and the KB order, so the same
  context returns byte-identical text to any client, arm or model. Pages respect `limit` (default 20)
  and a ~12,000-character budget for the whole response; `more.nextOffset` continues without loss or
  repetition. Typical sizes (pretty JSON, ÷3.5 ≈ tokens): context with button+input+modal, summary
  7.2k chars (9 candidates); 15 components, first page 11.4k.
- **Elsewhere.** `get_component_spec` gains `rules: { retrieval:"automatic", ids, next }` (+~0.5–0.6k
  chars); its `component` stays the exact id. `scan_page`, in profiles that carry norms
  (`full`/`evaluation`), adds `normativeContext: { retrieval:"automatic", components, candidates,
  byReason, next }` built from `coverage.componentsFound`, on the first page only (no `cursor` or
  `cursor: 0`); `deterministic`/`evidence` profiles get nothing new. `retrieval:"automatic"` vs `"direct"` separates pushed from requested knowledge in the
  analysis; no number of calls is a success criterion.
- **Fixes.** `get_ds_rules({ limit, offset })` with no other filter returned the facet index although
  the note promised pagination — `limit`/`offset` were stripped from the filter before the
  "no filter" test. Explicit `limit` or `offset` now lists; a call with nothing still returns the
  facets. Every other legacy call shape (`id`, `ids`, `component`, `category`, `query`, …) returns
  byte-identical text to 2.8.0 — checked against a 2.8.0 snapshot in
  `test/fixtures/legacy-get-ds-rules-2.8.0.json`. Accent-insensitive matching, the extra fields and
  name variants exist only inside `context`.

Frozen campaigns ran on 2.7.0 (`validator_sha` `b0713083f1823691c516825220b529e420b91cb3`) and are not
changed by this release.

### Accessible name is what the browser computes, not `aria-label` (2.8.0)

Up to 2.7.0 the structure checker reported `emag-2.2` / WCAG 4.1.2 for every interactive icon-only
element without `aria-label` or `alt`. That is a different question from the rule's: an external
review (NAT-33) showed Chromium exposing `button "Visualizar registro"` for a button named by
`title` or by `aria-labelledby` while the checker still fired. On screen B (Vistorias) the
`br-button` web components pass the host's `title` to the inner `<button>` with `aria-label=""`,
which produced about 30 false alarms per baseline run.

- **Evidence.** For interactive icon-only elements only, `inspect_computed_styles`/`scan_page` now
  read the accessible name Chromium computes (accessibility tree via CDP, `Accessibility.getPartialAXTree`)
  and attach it as `accessibleName: { name, source: "chromium" }`. This is the name a screen reader
  receives, inside open shadow roots too: a `title` on a web component's host does **not** name the
  inner `<button>` unless the component passes it on, and the checker follows the browser on that.
  Without CDP, and per element when Chromium ignores the node (display:none, visibility:hidden,
  inside `aria-hidden`) and so computes no name, the name is approximated in accname order —
  `aria-labelledby` (ids resolved in the element's own tree; broken or empty references do not
  count) > `aria-label` (trimmed, non-empty) > `<label>` > `alt`, descendant `<img alt>`, text
  content > `title` — with `source: "atributos"`. The evidence also carries `title`,
  `ariaLabelledby`, `content.labelledbyText`, `content.descendantAlt` and `content.labelText`.
- **Finding.** `emag-2.2` fires only when that name is empty. The old `expected` text mixed the WCAG
  claim with a DS convention ("official circular-button examples always carry aria-label"); the
  convention is not the 4.1.2 rule and is no longer emitted, neither as a finding nor as an
  observation (D-27: no finding without a rule that forbids it). `evidence.data` now carries
  `accessibleName: ""` and `accessibleNameSource`.
- **Out of scope.** The DS CSS findings inside shadow roots also listed in NAT-33 wait for a scope
  policy; nothing in the scorer or the evaluation changed.

Frozen campaigns ran on 2.7.0 (`validator_sha` `b0713083f1823691c516825220b529e420b91cb3`) and are not
changed by this release; a run on 2.8.0 does not compare with 2.7.0 on `emag-2.2`.

### Page-level constraints: Template Base and skip to content (2.7.0)

Until 2.6.0 the page-level guidelines existed only as prose behind `get_page_rules`. An agent could
read them, but a finding based on them had no id the gate recognised, so it could never leave
`unverifiable`; and in the six oracle-arm runs of the 2026-09-18 batteries no agent fetched the
Template Base or the Padrão Mínimo at all. 2.7.0 turns the mandatory anatomy of the Template Base
into citable constraints, the way D-29 turned a component's root tag into `ds-structure-<c>-tag`:

| Constraint | Checks | Norm (`implements`) |
|---|---|---|
| `ds-page-header` | at least one `.br-header` (core) or `<br-header>` (web component) in the document, open shadow roots included | `govbr-3.7.0-template-global-19f93475dc5e` |
| `ds-page-footer` | at least one `.br-footer` or `<br-footer>`, likewise | `govbr-3.7.0-template-global-19f93475dc5e` |
| `ds-page-skip-link` | the first `<a href>` in composed order (shadow roots included) is an in-page anchor whose target exists | `govbr-3.7.0-accessibility-global-538e57855252`, `emag-1.5` |

The source for the two regions is the full text of the official Template Base page held in
`data/ds-page-rules.json` (`page_structure`), which names each area and marks it "(Obrigatório)"
or "(Opcional)"; the constraint carries the excerpt, and a test fails if the excerpt disappears from
the data. D-29 had refused to infer a mandatory footer from the truncated search excerpt "Template
Base como ponto de partida"; the refusal was about the truncated source. `get_page_rules()` publishes
the constraints; `scan_page` runs them under the new `page` check (on by default); `verify_finding`
recognises the ids (`page-constraint-index`) and recomputes them on the document with the
`page-region` and `page-skip-link` predicates. Structured claims: `region` + `observedCount` +
`expectedCondition: "template-base-region-present"` for the regions, `region: "skip-link"` +
`firstLinkHref` + `expectedCondition: "first-link-skips-to-content"` for the skip link; the locator
is `html`. Page prose without an id (breadcrumb first in the content area, menu placement) stays
anchored to a category and `unverifiable`, as before.

Limits: a page with no link at all is not charged for the skip link; the Localização and Navegação
areas are optional and not checked; `title` and `lang` remain axe's (`document-title`,
`html-has-lang`); closed shadow roots are invisible, as everywhere else in the validator. The check applies to every page it
scans, including component test pages that were built without a header or footer — on those the
finding is true to the rule and outside the frozen reference, which is a scope statement of the
reference, not of the checker. Runs under 2.7.0 do not compare with 2.6.0 or earlier.

### What the DS itself ships is not the page's defect (2.6.0)

Measured on a held-out screen built only from official markup (decision log D-51), the unguided
validator had 22% precision: 7 of 11 claims were false, and all 7 came from three causes fixed here.

- **Token checkers charged the page for the DS's own stylesheet.** `core.css` arrives bundled in the
  same file as the page's CSS, so the stylesheet's origin cannot tell the two apart — the content
  can. `npm run build:data` now writes `data/ds-stylesheet.json`: every declaration of the official
  stylesheet for the inspected properties, read through the CSSOM of the same browser that measures
  pages. A declaration whose selector, property and value all match it lands in the element's
  `dsShipped` evidence instead of `authored`, and the checkers only judge `authored`
  (`src/evidence/cssProvenance.ts`). A page value on an official selector, a page rule riding on an
  official selector, and inline style all stay the page's.
- **`ds-token-spacing` judged declarations that lost the cascade.** An authored off-scale px part now
  counts only if it appears in the computed value.
- **`ds-structure-button-tag` refused `<a class="br-button">`**, which the breadcrumb, footer and
  menu examples publish. Component tags are now read from the examples of every component, with
  `tagSources` recording where each comes from. A tag borrowed from another component is accepted
  only in the same use: `<a>` when the link navigates. An anchor doing a button's job
  (`href="#"`, `javascript:`, no href) is still flagged. Element evidence gains `attributes.href`.

The index is tied to the installed `@govbr-ds/core` version (3.7.0): a page on another DS version
is filtered only where its declarations coincide.

### Baseline viewport (2.5.2)

The deterministic baseline CLI (`dist/cli/scan-page.js`) accepts an optional `viewport` in its
request, so the unguided whole-page baseline observes the window the reference declares instead of
Playwright's default 1280×720. The MCP `scan_page` schema does not expose it: the agent-facing
surface is unchanged, but the compiled artifact differs, so batteries record its hash.

### Verification gate (2.5.1)

Compared with 2.5.0, confirmation requires a supported structured assertion, including the expected
condition, and agreement with every live element. Explicit findings no longer bypass server
verdicts. These fixes can change tool answers and report totals: retain the validator version and
compiled-artifact identity when comparing runs; do not relabel historical results as 2.5.1.

`verify_finding` used to answer `confirmed` when the cited rule existed or, with `live`, when the
locator found an element — so rule existence and element presence confirmed arbitrary semantic
claims, and the WCAG branch accepted any `X.Y.Z` (`wcag-9.9.9` passed). Each check is now separate:

| Check | Pass condition |
|---|---|
| `ruleExists` | the id is a member of a versioned registry: KB (`data/knowledge`), e-MAG 3.1 (`data/emag.json`), WCAG 2.2 (`data/wcag-2.2.json`, generated by `npm run build:wcag` from `https://www.w3.org/WAI/WCAG22/wcag.json` with retrieval date and source SHA-256; 86 criteria, 4.1.1 marked obsolete), published checker ids |
| `applicability` | the rule can support a finding — not implementation evidence (D-10), not a check without a norm (D-27/D-32) |
| `evidenceConsistent` | machine-readable claims agree with the token registry; with `live`, the locator resolves in the reproduced state (`actions`, optional `stateFingerprint`, or `scanId`) and the claimed property plus observed value/tag match every element; a claimed state that is not reproduced leaves it `unknown` (limitation, 2.10.0) |
| `violation` | `verified` / `contradicted` by an implemented predicate on **every** asserted element; otherwise `no-predicate`, `not-checked` (`live=false`) or `error` |

| Verdict | Condition |
|---|---|
| `confirmed` | `ruleExists: pass` and `violation: verified` |
| `rejected` | any check `fail`, or `violation: contradicted` |
| `unverifiable` | everything else — a real rule, uncontradicted evidence, a violation this oracle cannot decide |

Predicates exist only where the oracle has a deterministic decision to reuse. Their minimum
structured claims are: `ds-token-color` (`property` + `observedHex` + `expectedCondition:
"registered-govbr-ds-color-token"`), `ds-token-font-family` (`property: "font-family"` + `observed` +
`expectedCondition: "rawline-or-raleway"`), `ds-token-radius` (`property: "border-radius"` +
`observed` + `expectedCondition: "govbr-ds-radius-scale"`), `ds-token-spacing` (`property:
"padding"|"margin"` + `observed` + `expectedCondition: "govbr-ds-spacing-scale"`), and
`ds-structure-<component>-tag` (`component` + `observedTag` + `expectedCondition:
"canonical-component-tag"`), and since 2.7.0 `ds-page-header`/`ds-page-footer` (`region` +
`observedCount` + `expectedCondition: "template-base-region-present"`) and `ds-page-skip-link`
(`region: "skip-link"` + `firstLinkHref` + `expectedCondition: "first-link-skips-to-content"`),
decided on the document rather than on the located element. The deterministic scanners emit these exact fields. Missing structured data leaves the
claim `unverifiable`; an unsupported field or a value/tag that contradicts any live element is
`rejected`. Only after this binding do predicates re-run the same checker on each element. Limits:
no predicate for relations between elements, focus, order, text,
accessible names or dynamic behavior; a state exists only if `actions` reproduce it on a fresh page;
authorship rules apply (an inherited or browser-default value is not the page's). A broad WCAG, e-MAG
or KB citation selects no predicate and stays `unverifiable`. `evidence.observed` and
`evidence.expected` are human-readable explanations; confirmation concerns the structured assertion
and never attempts to infer semantics from this prose.

The server records every result by the SHA-256 of the verified payload (everything except
`verification`). `save_report` ignores the `verification` a caller submits for both agent pathways:
the stored result for the identical payload decides — `confirmed` as findings, `unverifiable` as
labeled `reviewItems` outside the total, and `rejected` refused. An explicit finding with no stored
verification also stays in `reviewItems`, without a fabricated verdict; a heuristic finding never
verified (including a payload changed after verification) is refused. Deterministic findings enter
only by `finding_ids`.

`verify_finding`'s `confirmed` is the oracle's own check. An evaluation harness must not count it
as independent ground truth.

### Egress policy (2.4.0)

The browser-backed tools open whatever URL the client passes. In a measured run that client is the
agent under evaluation, so two variables confine the server's own Chromium:

| Variable | Effect |
|---|---|
| `GOVBR_VALIDATOR_ALLOWED_ORIGINS` | comma-separated origins a tool may open; any other URL fails before loading |
| `GOVBR_VALIDATOR_PROXY_SERVER` | every browser request — subresources, redirects, fetch, frames, workers, loopback included — goes through this proxy |

Unset, behavior is unchanged. The origin check gives a readable error; the proxy is the boundary.
`test/integration/egress-policy.test.ts` pins both, with a no-policy control that does reach the
decoy server.

### Capability profiles (D-28)

`GOVBR_VALIDATOR_TOOL_PROFILE` separates the causal contribution of the server. The profile is
part of the run configuration and must not be pooled across measurements:

| Profile | Exposed capability |
|---|---|
| `normative` | DS/e-MAG rules, tokens, page rules and component specifications |
| `deterministic` | `scan_page` plus retrieval of scanner findings |
| `evidence` | raw authored/computed-style inspection, without rules or scanner verdicts |
| `evaluation` | compatibility profile combining the three pathways plus the verification gate |
| `full` | authoring/development surface, including individual checkers and report persistence |
| `knowledge-free` | 2.14.0: the measurement tools of `evaluation` without the DS + e-MAG package the oracle serves and applies — `scan_page` (axe-core only), `get_finding_details`, `verify_finding` (state replay, WCAG 2.2 registry, P1 predicates). WCAG and axe-core remain; see *Knowledge-free profile* below |

The deterministic profile exposes no normative resources, and the normative profile exposes no
scanner. This makes norms-only, scanner-only and evidence-only arms mechanically distinct instead
of treating “the oracle” as one indivisible package.

## Architecture notes

- The **agent is integrated, not implemented** (N+M): any MCP client LLM drives the tools; this
  package contains no LLM calls.
- One shared headless Chromium per server process (the PoC relaunched per call).
- All data assets are generated from the *installed* `@govbr-ds/core` (v3.7.0) — upgrade the
  package, re-run `build:data`, and the oracle follows the DS version.
- The **knowledge base** (`data/knowledge/` — see its README) is versioned separately: the server
  warns at startup when the installed `@govbr-ds/core` diverges from the KB `dsVersion`. The DS
  has **36** components (tarball-verified — see `docs/README.md` and the KB conflicts report).
- Three-way epistemic separation (D-10): normative rules ≠ implementation evidence ≠ observed
  defects. Enforced in code: `get_ds_rules` listings never mix `force=example` records into
  normative results, and `verify_finding` rejects findings that cite evidence as the violated rule.
- A deterministic checker that cannot name the norm it implements **produces no finding** (D-27).
  Each checker declares its rule via `implements`, and reports that id; the gate checks the id
  *exists* in the oracle, not merely that it is well-formed. Non-canonical class variants
  (`ds-structure-*-variant`) left the Findings channel entirely — a class the DS does not publish
  is an observation, not a violation.
- Rules derived from a **truncated source** carry an explicit inference caveat (D-29): the Template
  Base being a starting point does not imply a mandatory footer or any other region the source
  never declares. The caveat travels with the rule so an agent cannot quietly infer subcomponents.
- `relatedSelectors[]` lets a rule name the other participants of a **relational** requirement (a
  form, its field, and the dynamic message that announces the error), so scoring stops being
  sensitive to which of the three nodes an agent chose to narrate the same failure from.
