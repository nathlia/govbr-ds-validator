# NAT-111 · A4 · procedimentos e escopo literal (3.7.3-pre.3)

Ampliação da derivação de procedimentos da norma, sem novos detectores,
sem alteração de modalidade/base e sem veredito de conformidade.

## Contrato

- Atributos explicitamente exigidos/proibidos, valores literais e relação de
  igualdade entre atributos nos sujeitos respectivos. Menção, proibição de
  repetir texto e proibição de mudar um atributo não implicam ausência.
  Proibir um valor não torna esse valor esperado.
- Propriedade tipográfica e token citado: medir o valor resolvido no contexto
  do sujeito. A grafia com travessão do prefixo CSS tem normalização declarada
  em `provenance`; token não resolvido continua não medido.
- Dimensões em px, mínimo/máximo, múltiplos e parâmetros explícitos de grid.
  Nenhum valor inferido de uma tela ou de sua referência.
- Ordem de filhos com pai, filho e posição identificados. Ordem de foco ou
  leitura lógica sem critério determinístico não vira geometria.

Somente `required`/`prohibited`; especificações descritivas, recomendações e
código-fonte não observável ficam fora da derivação nova.

## Sujeito, condições e orçamento

`Procedure.context` contém introduções dos ancestrais e a seção literal da
fonte versionada, incluindo condições herdadas e tabelas posteriores. O hash
é do snapshot LF e as faixas usam UTF-16/end exclusive. Isso conserva a área
da imagem do signin e o breakpoint do grid, sem interpretar o texto como uma
decisão de aplicabilidade. Se não houver localização inequívoca ou o contexto
integral superar 4k, a derivação nova recusa; a cláusula continua julgamento.

O contexto é imutável e memoizado por identidade da regra, versão, fonte e
texto. Nenhuma mudança no armazenamento ou na modalidade da base.

O checklist de componente/global transporta `measure.procedure` completo,
com contexto, medida, expectativa e condição. Procedimentos contextuais não
são abreviados para uma expectativa solta no `investigate`: o texto curto
manda ler o checklist do componente. Globais servidas inline conservam o
contexto integral ou cedem ao ponteiro global já existente. Isso não promete
uma quantidade mínima de cláusulas inline (A5).

## Evidência e limites

Auditoria contra `6e024d7`: 1.253 cláusulas fortes não-título; procedimentos
138 → 155 (17 novos). Julgamento 918 → 902, teclado 92 → 91, DOM/CSS 5 → 22;
demais classes preservadas. Não são indicadores de recall de tela.

Revisão independente corrigiu três MED: condição/valor perdidos no compacto,
contexto herdado da fonte ausente e valor proibido invertido. Conferência
independente dos 17 contextos: hashes/faixas/cláusulas sem divergência.
Testes verificam múltiplos atributos, relações, condicionais, modalidades,
valores proibidos, ambiguidades, escopo e a resposta MCP paginada sob 8k.

Guarda de 72 consultas sem erros e sem mudança de métricas por consulta frente
à 3.7.2. A fixture léxica de 30 respostas muda somente `componentClauses` no
passo 10 (+23 caracteres); recompor esse suplemento pelo módulo de `6e024d7`
restaura os 30 hashes anteriores. Ranking, cartões, cursores e qrels preservados.

Árvore final: typecheck/build aprovados; `vitest run --maxWorkers=3`, 931/931
em 72 arquivos, 305,62 s. Controles de desenvolvimento GO, zero bloqueantes e
falhas de aceite; fatos iniciais fluxo/A/B preservados.

Artefatos em `thesis-workspace/planejamento/atual/evidencias-a4-2026-11-07/`.
Não há bateria, smoke, modelo de avaliação, sorteio, reserva ou mudança de
crédito. MCP vivo da versão integrada, imagens/locks e ensaio permanecem
gates separados; o stdio do build não comprova reconexão da conversa.
