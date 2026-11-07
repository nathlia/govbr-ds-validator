# NAT-111 · A7 · referências e-MAG por tópico (3.7.3-pre.4)

As referências secundárias das famílias só best-practice do axe são candidatas
a ler. Não declaram equivalência de obrigação, aplicabilidade ou veredito.

O pool continua restrito às cláusulas fortes da mesma recomendação e-MAG.
Antes de usar o motor léxico existente, o builder filtra o assunto literal por
uma tabela versionada do identificador do check. A consulta curta em português
descreve esse assunto; não altera pesos, vocabulário ou ranking geral de
`get_ds_rules`. Até duas candidatas acima do piso. Tópico/help desconhecido,
ausência de âncora literal ou de candidata acima do piso: só `emag-N.N`.

Cabeçalho vazio não é agrupamento de linhas de tabela. Na base servida, 3.10
tem cláusulas fortes sobre THEAD/TBODY/TFOOT e associação de células em tabelas
complexas, sem obrigação literal sobre texto vazio. `empty-table-header`
agora retorna só `emag-3.10`, mesmo se o help também mencionar THEAD.

Outras mudanças de assunto: `heading-order` → hierarquia H1–H6;
`page-has-heading-one` → H1/conteúdo principal; `region` deixa de citar rodapé
específico e aponta divisão significativa de conteúdo; `skip-link` aponta
âncoras/alvo na mesma página; `tabindex` deixa de citar fragmento genérico de
fluxo. `region → SECTION` é pertinência para leitura, não equivalência entre
SECTION e landmark nem prova de que todo conteúdo exige essa marcação.

Regra, fato, força e mapeamento da recomendação do axe permanecem os mesmos.
Knowledge-free não chama o builder normativo e não recebe essas referências.
O cache inclui a versão da tabela de tópicos; referência pode ser omitida
pela compactação antes de custar família, como no contrato existente.

## Evidência

Tabela de dez regras catalogadas pelo axe instalado (inclui regra experimental,
não afirma que todas rodaram no scan), com mapeamento, forças e texto literal,
em `thesis-workspace/planejamento/atual/evidencias-a7-2026-11-07/`.
O módulo anterior lido do commit `f73fe8c` reproduziu toda a tabela capturada;
seis regras mudam suas referências. Nenhuma cláusula nova foi inventada.

21/21 focados, incluindo API MCP, knowledge-free e orçamento; revisão
independente da tabela e do delta sem HIGH/MED. Typecheck/build aprovados.
Suíte integral final: 935/935 em 73 arquivos, 307,51 s. A guarda final de
72 consultas não teve erros nem mudanças nas métricas por consulta frente
à 3.7.2; isso não afirma identidade da prosa. Scans iniciais fluxo/A/B
preservam os fatos (17/7/76); controles de desenvolvimento GO, zero falhas
de aceite/bloqueantes. Stdio 1k/2k/8k/20k dentro do teto, famílias 6/6/4
aos 8k. Decisão de implementação D-178; não muda política de crédito.
Os testes cobrem separação de tópico, força, ausência, help desconhecido e
tentativa de recuperar THEAD por palavras acrescentadas ao help.

Sem modelo de avaliação, bateria, smoke, sorteio ou reserva. MCP vivo do build
integrado, imagens/locks e ensaio continuam gates separados.
