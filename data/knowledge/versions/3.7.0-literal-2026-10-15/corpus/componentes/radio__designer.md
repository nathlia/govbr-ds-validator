<!--
URL: https://www.gov.br/ds/components/radio?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/radio/radio.md
Status da coleta: ok
-->

# *Radio* (Caixa de Opção)

O componente Radio permite selecionar apenas uma opção em uma lista de opções.

## Uso

![Exemplo Componente](imagens/radio-exemplo.png)
*Componente Radio*

O componente Radio deve ser utilizado para permitir que o usuário selecione uma ou mais opções em uma lista de opções.

Quando a lista de opções exigir a seleção de apenas um item deve-se utilizar o componente radiobutton.

Quando a lista de opções for muito extensa, deve ser avaliada a possibilidade de uso do componente select.

Cada opção pode ser acompanhada de um texto que a descreva.

O componente pode ser utilizado sem o texto descritivo, como em uma tabela, por exemplo; e deverá continuar mantendo suas diretrizes de alinhamento e espaçamento.

É fundamental que antes de uma lista de opções múltiplas apareça um rótulo e uma breve descrição, orientando ao usuário sobre o que se trata as opções e que podem ser selecionadas mais de uma opção.

---

## Tom e voz

Deve-se utilizar o componente para opções em que a resposta seja sim ou não (Ex.: Lembrar senha?), quando a resposta for ligado ou desligado (Ex.: Componente habilitado.) pode-se utilizar o componente switch como alternativa.

Recomenda-se, que o texto do rótulo e o texto descritivo sejam breves, claros e diretos. Utilizar os verbos sempre na terceira pessoa do imperativo afirmativo. Ex.: Selecione os estados contidos no projeto.

Dar preferência ao uso do componente em uma coluna, porém pode-se dispor de mais de uma coluna se houver extrema necessidade. Nesse caso, é recomendado manter a mesma largura em todos os itens da mesma coluna e a mesma altura dos itens da mesma linha da lista.

Deve-se manter uma coerência entre as larguras dos itens evitando uma largura de linha com mais de 10 palavras ou 56 caracteres em média.

---

## Anatomia

O *Radio* é constituído por:

| ID  | Nome                              |                    Referência                    | Uso         |
| --- | --------------------------------- | :----------------------------------------------: | ----------- |
| 1   | Caixa de opção                    |                       ---                        | Obrigatório |
| 2   | Item de opção                     |     [Item](/ds/components/item?tab=designer)     | Obrigatório |
| 3   | Cabeçalho de opções               | [Tipografia](/ds/fundamentos-visuais/tipografia) | Opcional    |
| 4   | Lista de opções                   |     [List](/ds/components/list?tab=designer)     | Obrigatório |
| 5   | Mensagem de *feedback* contextual |  [Message](/ds/components/message?tab=designer)  | Opcional    |

![Exemplo Estrutura](imagens/radio-estrutura.png)
*Anatomia do componente Radio*

---

## Detalhamento dos Itens

### 1. Caixa de Opção (Obrigatório)

A caixa de opção é composta pelo container (A) e pelo ícone de suporte visual interativo (B) que indicará o estado do componente como selecionado ou válido. Pode ser utilizado de forma independente como em células de tabelas, por exemplo.

![Exemplo caixa opção](imagens/radio-caixa-opcao.png)
*Caixa de opção do componente Radio*

#### A. Container

O container do *Radio* parte de um círculo opaco que deverá conter o ícone de suporte interativo.

#### B. Ícone de suporte visual interativo

- O Ícone de suporte visual é um elemento que ficará dentro da área do container e deve ser utilizado para identificar o estado do item radio como selecionado ou não selecionado a depender do seu estado.
- Deve estar dentro da área do container

### 2. Item de opção (Obrigatório)

É composto pela caixa de opção (A) à esquerda e o texto descritivo (B) sempre à sua direita. Este item deve ter uma largura mínima e máxima (ver design tokens).

![Exemplo item opção](imagens/radio-item-opcao.png)
*Item de opção do componente Radio*

#### A. Caixa de opção

O container do *Radio* no estado selecionado.

#### B. Texto descritivo

- Para proporcionar um maior conforto visual ao usuário, o texto descritivo deve se posicionar sempre à direita do container respeitando o espaçamento lateral da caixa de opção.
- Texto que descreve a opção a ser selecionada. Pode ser suprimido dependendo da aplicação, como por exemplo em tabelas.
- Deve-se manter uma coerência entre as larguras dos itens evitando um texto descritivo com mais de sete palavras.
- Os textos descritivos deverão ser escritos com sua primeira letra em maiúsculo e o restante em minúsculo. Ex.: Selecione a opção 01.
- Evitar escrever com todas as letras em maiúsculo (ALL CAPS) ou com todas as primeiras letras das palavras em maiúsculo (Camel Case).

### 3. Cabeçalho de opções (Opcional)

O cabeçalho de opções é composto pelo rótulo (A) e caso necessário, texto auxiliar (B). Deve ser o item mais ao topo da lista de opções. Não há restrição de largura ou altura para este item.

![Exemplo Cabeçalho Opções](imagens/radio-cabecalho-opcoes.png)
*Exemplo Cabeçalho de Opções*

#### A. Rótulo

- Quando o componente é apresentado em uma lista e opções devem ser precedidos de um rótulo que descreva a informação que o usuário deve selecionar.
- O rótulo deve se posicionar no topo do componente alinhado à esquerda.
- Deverá ser escrito com sua primeira letra em maiúsculo e o restante em minúsculo. Ex.: Selecione a opção 01.
- Evitar escrever com todas as letras em maiúsculo (ALL CAPS) ou com todas as primeiras letras das palavras em maiúsculo (Camel Case).

#### B. Informações Adicionais

- É possível adicionar um texto auxiliar ao rótulo para facilitar o seu entendimento.
- Este texto deve se posicionar logo abaixo do componente rótulo, sem espaçamentos e alinhado à esquerda.
- Deverá ser escrito com sua primeira letra em maiúsculo e o restante em minúsculo. Ex.: Selecione a opção 01.
- Evitar escrever com todas as letras em maiúsculo (ALL CAPS) ou com todas as primeiras letras das palavras em maiúsculo (Camel Case).

### 4. Lista de opções (Obrigatório)

A lista de opções é o conjunto formado por itens de opções (A).
Quando esta lista possuir mais de um item é recomendado que seja precedida de um cabeçalho de opções.

![Exemplo lista de opção](imagens/radio-lista-opcoes.png)
*Lista de Opções*

### 5. Mensagens de feedback contextual (Opcional)

O componente mensagem pode ser utilizado para enviar mensagens informativas, de alerta, de erro (A) ou validação (feedback contextual) devem ser o mais sucintas possível, de preferência não ultrapassando uma linha da mesma largura do campo de texto além de seguir suas diretrizes de componente.
Deve se posicionar abaixo do último item da lista de opções, alinhado à esquerda e respeitando uma margem superior de acordo com suas diretrizes.

![Exemplo item opção](imagens/radio-mensagem.png)
*Mensagem de feedback contextual*

---

## Comportamentos

### 1. Estados

#### Não selecionado (Estado padrão)

Estado padrão do componente. Indica que o usuário não respondeu ou não optou pela opção da lista.

![Default](imagens/radio-estado-default.png)
*Estado Default*

#### Hover

Estado que indica quando o usuário posiciona o ponteiro do mouse sobre a área do componente (1). Pode não fazer sentido em dispositivos em que não se utiliza o mouse como recurso.

![Estado hover](imagens/radio-estado-hover.png)
*Estado Hover*

#### Selected

Estado que indica que o usuário selecionou um item. Pode ser acionado pressionando a tecla espaço quando o foco está no componente, pelo clique do mouse ou toque na tela na região do componente (incluindo seu texto descritivo, quando houver), ou outra ação que corresponda ao item desejado pelo usuário com a fala, por exemplo.

![Estado selecionado](imagens/radio-estado-selected.png)
*Estado Selecionado*

#### Focused

Estado que indica que o item da lista de opções está destacado, usando um método de entrada como a tecla "Tab" do teclado, por exemplo. Este estado é de extrema importância para garantir a acessibilidade do componente na interface.

![Estado focused](imagens/radio-estado-focused.png)
*Estado Foco*

#### Invalid

Estado indicativo de que a opção não é válida. Pode ser aplicado quando a opção selecionada em um questionário está incorreta, ou o preenchimento de ao menos uma opção é obrigatório.

![Estado invalido](imagens/radio-estado-invalid.png)
*Estado Inválido*

#### Valid

Estado indicativo de que a opção é válida. Pode ser aplicado quando a opção selecionada em um questionário está correta, por exemplo.

![Estado valido](imagens/radio-estado-valid.png)
*Estado Válido*

#### Disabled

Estado que indica que a opção não está disponível para ser selecionada.

![Estado disabled](imagens/radio-estado-disabled.png)
*Estado Desabilitado*

### 2. Espaçamento e Alinhamento

#### Caixa de opção

A caixa de opção do item do Radio deve manter uma distância superior e inferior (1) e um espaçamento lateral direito (2) de qualquer outro elemento.

#### Texto descritivo

O texto descritivo deve se posicionar sempre à direita a (2) da caixa de opção como indicado acima. Deve manter um espaçamento inferior dos elementos abaixo (3).

![Espaçamento caixa](imagens/radio-caixa-opcao-espacamento.png)
*Espaçamento da caixa de opção e texto descritivo*

#### Item de opção

Cada item do Radio, composto pela caixa de opção à esquerda e seu texto descritivo à direita, deve manter uma distância à direita (4), abaixo (3) e acima (1) entre este e o próximo componente.

![Espaçamento item](imagens/radio-item-opcao-espacamento.png)
*Espaçamento da caixa de opção e texto descritivo*

#### Cabeçalho de opções

O Rótulo e o texto auxiliar devem estar ao topo do agrupamento, devem se posicionar um logo abaixo do outro não havendo espaçamento além do já previsto em suas diretrizes e um espaçamento inferior a partir do último dos dois elementos (Rótulo ou texto auxiliar).

#### Mensagens de feedback contextual

- Deve ser o elemento mais abaixo na lista de opções do componente.
- Deve manter o espaçamento superior do último item da lista de opções (2).
- Deverá haver apenas uma mensagem para todo o conjunto da lista de opções.

![Espaçamento Cabeçalho Mensagem ](imagens/radio-lista-opcao-espacamento.png)
*Espaçamento do cabeçalho e das mensagens*

#### Disposição vertical

- No caso de listas verticais com textos descritivos de alturas diferentes ou que ultrapassem um linha de conteúdo deve-se manter o espaçamento inferior (3) para garantir a distinção dos itens pelo usuário.

- Não há limite de altura ou linhas de texto para os itens de opção.

- Para itens de opção com larguras diferentes a lista de opções deve seguir as dimensões do maior item.

![Lista vertical](imagens/radio-lista-opcao-vertical.png)
*Espaçamento dos itens em lista vertical*

#### Disposição horizontal

- Para listas horizontais com mais de um item, deve-se manter a largura máxima (1) e mínima (2) (ver design tokens).

- No caso de listas horizontais com itens de opção com larguras diferentes, deve-se manter o espaçamento lateral direito de segurança entre os itens (2).

- No caso de o item de opção ultrapassar o limite de largura (1), o texto descritivo deverá continuar em uma outra linha mantendo o alinhamento ao texto.

![Lista horizontal](imagens/radio-lista-opcao-horizontal.png)
*Espaçamento dos itens em lista horizontal*

- Não há limite de linhas de texto ou altura de linha para os itens do componente.

- Para itens de opção com alturas diferentes a lista de opções deve seguir as dimensões do maior item.

---

## Especificações

### Dimensões

| Nome           | Property      | Value |
| -------------- | ------------- | ----- |
| Caixa de opção | width         | 24px  |
| Caixa de opção | height        | 24px  |
| Caixa de opção | border-radius | 12px  |
| Caixa de opção | border-width  | 1px   |

### Espaçamento

| Name                | Property       | Value                     |
| ------------------- | -------------- | ------------------------- |
| Caixa de opção      | padding-right  | `--spacing-scale-base`    |
| Caixa de opção      | padding-left   | `--spacing-scale-default` |
| Caixa de opção      | padding-top    | `--spacing-scale-half`    |
| Caixa de opção      | padding-bottom | `--spacing-scale-half`    |
| Texto descritivo    | padding-right  | `--spacing-scale-4x`      |
| Texto descritivo    | padding-left   | `--spacing-scale-default` |
| Texto descritivo    | padding-bottom | `--spacing-scale-2x`      |
| Texto descritivo    | padding-top    | `--spacing-scale-half`    |
| Rótulo              | padding        | `--spacing-scale-default` |
| Texto auxiliar      | padding        | `--spacing-scale-default` |
| Cabeçalho de opções | padding        | `--spacing-scale-default` |
| Cabeçalho de opções | padding-bottom | `--spacing-scale-2x`      |
| Lista de opções     | padding-top    | `--spacing-scale-default` |
| Lista de opções     | margin-bottom  | `--spacing-scale-2x`      |
| Lista de opções     | padding-left   | `--spacing-scale-default` |
| Lista de opções     | padding-right  | `--spacing-scale-5x`      |

### Tipografia

| Name             | family-type          | font-size                   | font-weight               |
| ---------------- | -------------------- | --------------------------- | ------------------------- |
| Rótulo           | `–-font-family-base` | `--font-size-scale-base`    | `--font-weight-semi-bold` |
| Texto auxiliar   | `-–font-family-base` | `--font-size-scale-down-01` | `--font-weight-medium`    |
| Texto descritivo | `-–font-family-base` | `--font-size-scale-base`    | `--font-weight-medium`    |

### Cores

| Name                               | Property   | Color Token            |
| ---------------------------------- | ---------- | ---------------------- |
| Caixa de opção                     | background | `--pure-0`             |
| Caixa de opção                     | border     | `--gray-20`            |
| Ícone de suporte visual interativo | background | `--blue-warm-vivid-50` |
| Texto descritivo                   | color      | `--gray-80`            |
| Rótulo                             | color      | `--gray-80`            |
| Informações adicionais             | color      | `--gray-80`            |

### Iconografia

| Name             | Estado | Ícone                         | Size             | Class (Font Awesome) |
| ---------------- | ------ | ----------------------------- | ---------------- | -------------------- |
| Ícone interativo | --     | <i class="fas fa-circle"></i> | `.icon.size--sm` | `.fa-circle`         |
