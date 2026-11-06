# NAT-111 · 3.7.3-pre · A6: continuação das pendências no perfil sem conhecimento

## Problema e comportamento

O scan compacto podia sugerir `get_finding_details` com `view: "observations"`, mas o esquema do
perfil `knowledge-free` recusava esse valor. O perfil agora aceita a chamada e recupera as
pendências do axe registradas no próprio lote, sem repetir a varredura. Cada observação conserva
o `pendingId`, o critério WCAG, as medidas e o motivo da indeterminação. Não constitui achado nem
recebe cláusulas do DS ou e-MAG. Um lote sem pendências devolve uma página vazia.

As observações são armazenadas por sessão e scan. A recuperação exige um scan existente;
`ids + view`, enum inválido e lote desconhecido continuam recusados. Quando o primeiro item
inteiro não cabe em `maxChars`, a resposta é um erro estruturado dentro do teto, com continuação
para o mesmo scan/cursor e orçamento suficiente. Não se corta evidência para fazê-la caber.

## Contrato e integração

O `tools/list` de `knowledge-free` muda intencionalmente pelo enum e pela descrição:

- anterior: `f358152ab77b8b6930687c1b12206f3821170600d52c0fda0a3dde8d0774bf44`;
- A6: `c51bf1a3fc1bfc2d333c589656d48106418c8bf0b4865868d569893997bb48bd`.

As instruções do initialize não mudam. A6 não altera os esquemas nem a recuperação de
observações dos demais perfis. O teste de superfície de evaluation continua aprovado no lote
atual. Imagens/manifestos de campanhas novas precisam fixar o contrato novo; não alterar os
locks de campanhas existentes. Esta fatia permanece em pré-versão e não libera campanha.

## Verificação em 06/11/2026

- Node 25.2.1; `npm run typecheck` e `npm run build` aprovados.
- `npm test -- --maxWorkers=1 test/integration/fix373-observations.test.ts`: 5/5, incluindo
  trava de conhecimento de processo, orçamento de 1.000 caracteres e recuperação pelo próximo
  passo sugerido. Os eventos das chamadas válidas têm zero tentativas de carregar conhecimento.
- Regressão focada anterior à correção do teto: 41/41 nos arquivos `knowledge-free`, `fix361`,
  `fix373` e `fix373-observations`. A regressão nova do teto passou posteriormente.
- Suíte completa: `npm test -- --maxWorkers=1`, **898/898 testes em 65 arquivos**, saída 0.
  Executada sobre a árvore integrada de trabalho (inclui a emenda-2 preexistente), não sobre
  uma release publicada. A fatia A6 tem revisão independente própria.
- Nova medição determinística sem modelo, dist compilado, 1280 × 720: fluxo **17**, A **7**,
  B **76** achados, iguais às contagens históricas declaradas na pré-versão. Isso verifica
  contagens, não identidade de todos os achados; não representa bateria de agente.
- Revisão independente: um MED (item inteiro ultrapassando teto de 1.000) corrigido e relido;
  sem novos HIGH/MED na A6. A revisão não certifica o lote da emenda-2 nem as demais mudanças 3.7.3.

## Limites e continuação

Não foram executados bateria, smoke, chamada de modelo, alteração de referência ou acesso à
reserva. A autora ainda configura o token GitLab. A emenda-2 e demais arquivos já alterados
na retomada são um lote separado, preservado. O gate MCP à mão e a atualização de imagens/locks
continuam pendentes antes de qualquer campanha da versão integrada.
