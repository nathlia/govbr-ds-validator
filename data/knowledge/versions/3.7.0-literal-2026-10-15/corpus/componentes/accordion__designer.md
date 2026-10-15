<!--
URL: https://www.gov.br/ds/components/accordion?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/accordion/accordion.md
Status da coleta: ok
-->

# Accordion

O accordion serve para que o usuário visualize mais informações sobre um conteúdo, já que permite que o item inicialmente exibido na tela em forma de sentença, seja expandindo mostrando o detalhamento daquele item.

## Uso

Seu uso é indicado em conteúdos extensos, especialmente em interfaces de dispositivos móveis, a fim de diminuir a densidade de informações para o usuário.

Recomenda=se evitar o uso de acordeões dentro de outros, pois esse tipo vai contra as melhores práticas de UX. O acordeão do Design System permite que várias seções sejam expandidas simultaneamente. Um ícone de sinal de angle-down ” é utilizado para indicar a ação “expandir e de “angle-up“ para recolher, embora toda a área de um item da lista seja clicável.

O Acordeão do Design System permite que várias seções sejam expandidas simultaneamente. Um ícone de sinal de angle-down ” é utilizado para indicar a ação “expandir e de “angle-up“ para recolher, embora toda a área de um item da lista seja clicável.

## Tipos de Accordion

1 | Accordion Positivo
O accordion positivo pode ser aplicado em sistemas e também no Portal Único. Ele se apresenta sobre background claro e se apresenta da seguinte forma:

![Accordion Positivo](imagens/acordeao-positivo.png)

1 | Accordion Negativo
Ele se apresenta sobre background escuro e se apresenta da seguinte forma:

![Accordion Negativo](imagens/acordeao-negativo.png)

## Estados do Accordion

Os estados dos accordion servem para dar feedback ao usuário sobre a intereção do usuário ao expandir, recolher, ou passar o mouse por cima de um item da lista.

Os estados servem para dar feedback ao usuário sobre a interação do usuário ao expandir, recolher, ou passar o mouse por cima de um item da lista.

O estado inicial do Accordion, como ele é exibido na interface. Acompanhado do ícone de expandir (angle-down) que indica ao usuário que há itens a serem clicados.

**B | Ativo**
Acontece quando o item está ativo/aberto/expandido. Nessa situação o texto fica semibold e assume cor Primary Darken 01. O ícone "angle-down” é substituído pelo de “angle-up“ indicando ao usuário, que o clique nos elementos do item expandido terá a ação de esconder o conteúdo.

**C | Hover**
Quando o cursor do mouse está sobre o item a ser expandido ou recolhido. Nesse caso, o item recebe tratamento gráfico de hover, (um background azul claro aparece embaixo do item) sinalizando ao usuário a interação.

### Positivo

![Accordion Estados Positivo](imagens/acordeao-positivo-estados.png)

### Negativo

Sobre background negativo o hover deve seguir o padrão gráfico sobre fundo escuro.

![Accordion Estados Negativo](imagens/acordeao-negativo-estados.png)

## Anatomia

### Tom de Voz do Accordion

O tom de voz do accordion é, essencialmente, como ele vai comunicar qual assunto se trata, deixando claro para o usuário que assunto ele vai encontrar em cada detalhamento dos itens.

Recomenda-se, sempre que possível, a utilização de uma sentença, clara e sucinta, um resumo que determine de forma objetiva qual conteúdo será exibido. Evitar uso de siglas ou expressões que não são reconhecidas ao público em geral. **Não exceder uma linha de texto.** O detalhe de cada item deve aparecer quando o item for expandido.

### Formatação do Texto

Os textos dos itens foram formatados em letras minúsculas com a primeira letra maiúscula no estilo medium. Ao ser clicado o item passa a se apresentar no estilo semibold para informar ao usuário que aquele item está ativo.

### Alinhamento

Os itens aparecem separados por uma linha de contorno cinza e os ícones de retrair e expandir aparecem alinhados entre si à esquerda, antes do texto.

#### 1 | Accordion Positivo

![Accordion Positivo](imagens/acordeao-positivo-alinhamento.png)

#### 2 | Accordion Negativo

![Accordion Positivo](imagens/acordeao-negativo-alinhamento.png)

### Espaçamentos

Seguem as métricas definidas para os espaçamentos dos acordeões. Todas as medidas foram definidas com valores múltiplos de 4px.

![Accordion Positivo](imagens/acordeao-negativo-espacamento.png)

### Tipografia e Cor

#### 1 | Positivo

A cor da fonte deve seguir a cor do estado ativo, pois é importante criar essa uniformidade com os outros componentes ativos da interface.

![Accordion Positivo](imagens/acordeao-positivo-alinhamento.png)

#### 2 | Negativo

Por questões de acessibilidae, no accordion negativo a cor da fonte passa a ser Secondary 01 (branca), mas os estilos seguem o mesmo padrão adotado no positivo.

![Accordion Positivo](imagens/acordeao-negativo-alinhamento.png)
