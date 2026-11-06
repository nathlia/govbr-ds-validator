# Emenda-2 da base 3.7.0-literal-2026-10-15 — unidades de especificação (D-167)

Gerado por `scripts/kb-spec-units.mjs` (kb-spec-extract/1.1.0). Nenhuma unidade escrita à mão: as regras abaixo, aplicadas ao
corpus literal da versão (`corpus/componentes/*__designer.md` e `*__desenvolvedor.md`), são a definição inteira.
Força `especificacao`: o texto descreve o componente (tabela de especificação, frase de comportamento ou anatomia);
não obriga nem proíbe, não entra em listagens nem contagens de obrigações; a busca o serve como candidata a investigar.

## Regras (literais)

- **T1** (linha de tabela de especificação): Em componentes/<componente>__designer.md ou __desenvolvedor.md, cada linha de corpo (nem a de cabeçalho nem a delimitadora) de uma tabela Markdown (linhas contíguas iniciadas por '|', a 2ª sendo a delimitadora '|---|') que está na região de Especificações: sob o título de nível 2 'Especificações', ou sob um título de nível 2 posterior a ele, no mesmo arquivo, cujo texto (sem acento, caixa e o que vem entre parênteses/colchetes) é uma faceta de especificação (tipografia, iconografia, cor, cores, espacamento, espacamentos, dimensao, dimensoes, sombra, borda, arredondamento, alinhamento, alinhamentos, elevacao, opacidade, movimento, superficie, densidade, escala, estado) — a região acaba no primeiro título de nível 2 que não é faceta. originalText = a linha, do primeiro ao último '|'. A 1ª coluna é a parte do componente; cada outra coluna não vazia é uma entrada {coluna, propriedade, valor, tokens}: propriedade = o valor da coluna 'Property'/'Propriedade' da linha, quando a tabela tem essa coluna, senão o nome da coluna; tokens = os nomes '--…' do valor. Linha sem nenhum valor fora da 1ª coluna e da coluna Property não vira unidade.
- **S1** (frase descritiva sem palavra de força): Em componentes/<componente>__designer.md ou __desenvolvedor.md, cada sentença (segmentação da normalização: blocos de parágrafo e de item de lista, cortados em sentenças) sob um título de nível 2 (sentença sem título de nível 2 — a introdução da página — fica fora), sem nenhum título no caminho (nível 2 ou mais fundo) igual a, ou começando por, um de: uso, uso alternativo, melhores praticas, tom e voz, tom de voz, dependencias, proximos passos, referencias, instanciacao do componente, codigo basico (sem acento/caixa), que NÃO tem gatilho de força da tabela da normalização (D-119: classificar() e os gatilhos de cobertura deve/devem/evite/recomenda-se/é importante/utilize/prefira/obrigatório e variantes, imperativos inclusos) nem palavra de obrigação solta (necessário/a, obrig…), e tem a forma de declaração: ao menos 5 palavras; não termina em '?' nem em ':' (pergunta, introdução de lista); não é legenda (sentença inteira entre * ou _ com menos de 8 palavras); a 1ª palavra — depois de um rótulo inicial '<Palavra>:' (ex.: 'OBS:', 'Importante:') e de um 'Não', se houver — não é 'Exemplo…', nem um remetimento (veja, consulte, consultar, confira, conferir, acesse, acessar, saiba, clique, clicar, leia, ler, conheca, visite, seguem, segue), nem uma instrução no infinitivo (usar, utilizar, incluir, informar, exceder, atentar, atentarse, adicionar, inserir, definir, aplicar, colocar, manter, seguir, evitar, preencher, verificar, observar, garantir, instanciar, importar, chamar, declarar, configurar, passar, criar, ver); e não contém um remetimento (para saber mais, para mais informacoes, para mais detalhes, a seguir, abaixo seguem, abaixo segue).
- **S2** (frase com gatilho que a normalização julgou descritiva): Mesmos arquivos, seções e forma de S1, para a sentença que TEM gatilho de força mas que a normalização excluiu com motivo 'info' ou 'definicao' ou 'usuario' (reports/normalizacao/cobertura.json, excluidas[].motivo): texto descritivo (info, definicao) ou o que o usuário faz com o componente (usuario), sem obrigação/recomendação de projeto, pelo julgamento já registrado e auditado da normalização. A palavra de obrigação solta não exclui aqui (o gatilho já foi julgado).
- **X1** (sem duplicar a base): Fica fora o trecho que se sobrepõe (charRange no mesmo arquivo) a uma unidade que já está no rules.jsonl servido: aquele texto já é citável com a força que a normalização lhe deu.
- **ID** (id e campos): id = govbr-3.7.0-<categoria>-<componente>-<12 hex de sha256(Caminho-fonte + originalText)>, sufixo -n em colisão (o esquema da normalização); categoria = component (designer) ou development (desenvolvedor); force = especificacao; normalizedRule = o trecho sem marcação Markdown (limpar() da normalização, não é paráfrase); title = o começo dele; validationStrategy/automatable pela mesma heurística de palavras-chave (automationConfidence: low); relatedTokens = os nomes '--…' do trecho.

## Contagens

| | unidades |
|---|---:|
| total | 2449 |
| linhas de tabela (T1) | 1152 (de 227 tabelas) |
| frases S1 (sem palavra de força) | 1151 |
| frases S2 (gatilho julgado descritivo) | 146 |
| aba designer / desenvolvedor | 2300 / 149 |

O que cada regra deixou de fora: tabelas — 26 linhas sem valor, 0 já unidade; frases —
100 sem título de nível 2 (introdução), 704 em seção excluída, 1020 com palavra de força
(regra da normalização ou excluída por outro motivo), 1175 fora da forma (legenda, pergunta, introdução de lista, remetimento,
menos de 5 palavras), 40 já unidade.

## Por componente

| componente | tabelas | linhas de tabela | frases | total |
|---|---:|---:|---:|---:|
| accordion | 0 | 0 | 27 | 27 |
| avatar | 3 | 13 | 15 | 28 |
| breadcrumb | 6 | 13 | 11 | 24 |
| button | 6 | 25 | 51 | 76 |
| card | 4 | 7 | 29 | 36 |
| carousel | 4 | 13 | 48 | 61 |
| checkbox | 6 | 35 | 35 | 70 |
| cookiebar | 5 | 34 | 102 | 136 |
| datetimepicker | 7 | 44 | 35 | 79 |
| divider | 2 | 4 | 7 | 11 |
| footer | 5 | 35 | 32 | 67 |
| header | 11 | 78 | 73 | 151 |
| input | 4 | 39 | 42 | 81 |
| item | 1 | 1 | 15 | 16 |
| list | 5 | 21 | 47 | 68 |
| loading | 5 | 25 | 33 | 58 |
| magicbutton | 10 | 33 | 19 | 52 |
| menu | 15 | 56 | 51 | 107 |
| message | 8 | 64 | 32 | 96 |
| modal | 5 | 11 | 33 | 44 |
| notification | 3 | 6 | 27 | 33 |
| pagination | 8 | 84 | 50 | 134 |
| radio | 5 | 30 | 21 | 51 |
| scrim | 0 | 0 | 14 | 14 |
| select | 6 | 14 | 68 | 82 |
| signin | 10 | 31 | 17 | 48 |
| skiplink | 7 | 17 | 15 | 32 |
| step | 9 | 55 | 71 | 126 |
| switch | 6 | 42 | 14 | 56 |
| tab | 4 | 32 | 23 | 55 |
| table | 7 | 76 | 63 | 139 |
| tag | 26 | 69 | 36 | 105 |
| textarea | 4 | 31 | 39 | 70 |
| tooltip | 10 | 44 | 35 | 79 |
| upload | 6 | 21 | 19 | 40 |
| wizard | 4 | 49 | 48 | 97 |

## Exemplos

- T1:
  - `govbr-3.7.0-component-avatar-a1b132959bb3` (componentes/avatar__designer.md:136) Superfície small | width/height | 40px.
  - `govbr-3.7.0-component-avatar-ef06d2847146` (componentes/avatar__designer.md:137) Superfície medium | width/height | 100px.
  - `govbr-3.7.0-component-avatar-787add1aec09` (componentes/avatar__designer.md:138) Superfície Large | width/height | 160px.
- S1:
  - `govbr-3.7.0-development-accordion-64e78cc219f5` (componentes/accordion__desenvolvedor.md:39) Item : agrupa o item icone(icon) e título(title)
  - `govbr-3.7.0-development-accordion-f49192890679` (componentes/accordion__desenvolvedor.md:47) Identifica a raiz do componente.
  - `govbr-3.7.0-development-accordion-e7850d004faa` (componentes/accordion__desenvolvedor.md:47) Todos os itens do accordion estão dentro do br-accordion.
- S2:
  - `govbr-3.7.0-component-avatar-d4ec08316656` (componentes/avatar__designer.md:41) A dimensão da superfície pode variar em uma escala de três dimensões que será melhor detalhado adiante.
  - `govbr-3.7.0-component-avatar-64080805c15f` (componentes/avatar__designer.md:67) A qualquer momento o usuário poderá alterar este avatar por qualquer um dos demais tipos.
  - `govbr-3.7.0-component-avatar-64080805c15f-2` (componentes/avatar__designer.md:76) A qualquer momento o usuário poderá alterar este avatar por qualquer um dos demais tipos.
