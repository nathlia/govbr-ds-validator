# NAT-111 · A2 · checklist global/página (3.7.3-pre.1)

Primeira fatia da A2, sob D-155/D-171. O checklist de página passa a ser
acessível por `get_page_rules {"view":"checklist"}`. Inclui obrigações e
proibições globais do DS e e-MAG; não decide se são aplicáveis à página.

## Contrato e limites

- 415 cláusulas fortes não-título; os 422 registros históricos incluem sete
  títulos. Exemplos e especificações descritivas permanecem fora da lista.
- Ordem: mensurabilidade, cobertura não integral primeiro dentro da classe,
  e ordem estável do catálogo. `automatic:false` inclui medidas parciais;
  o alcance e as limitações dos checks continuam no item.
- `citeAs`, força, resumo e fonte por item; leia a cláusula completa pelo id.
  Procedimentos vêm do mesmo derivador do checklist de componente; o restante
  exige inspeção, sem valor esperado inventado.
- Resposta dentro de 8.000 caracteres, continuação em `page.cursor` e `next`.
  O cursor vincula ferramenta, modo, versão do checklist, versão da base e
  registros completos. Mudança de conteúdo com os mesmos ids invalida o cursor.
- Item indivisível acima do teto gera `isError`, código `item-too-large`,
  leitura por `get_ds_rules(id)` e continuação após o item. Não é cortado para
  caber nem perdido silenciosamente.
- `category` e `view:"checklist"` são mutuamente exclusivos. Cursor exige
  categoria ou checklist; tipo/enum/campo desconhecido são recusados.
- Índice e categorias antigos preservam seus payloads. O perfil knowledge-free
  não publica a ferramenta nem carrega a base ao recusar uma chamada dela.

Esta lista **não registra pendingId nem pendência de sessão**: é catálogo de
candidatas. Atribuir estado a cada cláusula no relatório continua sendo tarefa
do agente. Cláusulas globais inline no `investigate`/`next` ficam para a fatia
seguinte; esta entrega não encerra A2 nem a versão 3.7.3.

Continuação na 3.7.3-pre.2: [cláusulas globais no scan](nat111-a2-inline-2026-11-06.md).
O relato e os números abaixo continuam sendo evidência da pre.1.

## Verificação

Seis testes unitários e quatro MCP: união exata sem duplicata, e-MAG incluído,
ordenação estável, cobertura parcial, cursor malformado/cruzado e alteração de
conteúdo, item grande, compatibilidade do índice/categoria e uma telemetria por
chamada (inclusive entradas inválidas). Knowledge-free sem ferramenta e lock 0.
Revisão independente encontrou um MED de cursor sem conteúdo; corrigido e
reverificado. Nenhum HIGH/MED restante na revisão final.

Probe independente: 30 páginas, 415 ids distintos, maior resposta 7.987
caracteres. Typecheck/build e 10/10 testes focados aprovados. Suíte integral da
árvore final: **915/915 em 68 arquivos**, `npm test -- --maxWorkers=3`, 299,92 s.
Nova medição de scans iniciais fluxo/A/B: 17/7/76, mesmos fatos comparados à
3.7.2. Prova stdio do build: 30 páginas/415 ids/máximo 7.987 caracteres e
14 payloads antigos comparados idênticos (índice e primeiras páginas das
categorias). Artefatos no thesis-workspace, em
`planejamento/atual/evidencias-a2-checklist-2026-11-06/`.

`npm audit` consultado nesta sessão: 16 alertas (quatro moderados, nove altos,
três críticos). As entradas de dependências do lock permanecem byte a byte;
só a identificação da pré-versão mudou. São alertas do conjunto preexistente,
registrados para manutenção separada; nenhuma atualização automática foi feita.

## tools/list do build integrado

| Perfil | SHA-256 |
|---|---|
| evaluation | `6282fa971868378d10f0daf4b878fdca1230491f716ece3acd6863feb077aad6` |
| full | `bb26bb0f2bca12550b44946b65d68b54b214a166c4bbf4ea233312a140dddb1b` |
| normative | `57b5e9bc7dedfa6a89a823e8d8d6a5edc385ab37286a21b2b26cd11cbdb43bd6` |
| deterministic | `af7f8264d063cce3f5eda0604cff5e7dfb200de3f9d848fc797e210dafebb656` |
| evidence | `4b4f82499cfe923b26f178c9dff3f5dcf233512ddbee6128b5a6bd0cc7a81ba7` |
| knowledge-free | `c51bf1a3fc1bfc2d333c589656d48106418c8bf0b4865868d569893997bb48bd` |

Somente os perfis normativos mudam o esquema. Imagens/locks históricos não foram
alterados. Teste MCP vivo da sessão, imagens e ensaio integrado continuam gates
separados antes de campanha. Sem bateria, smoke, modelo de avaliação ou reserva.
