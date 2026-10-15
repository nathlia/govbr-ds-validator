<!--
URL: https://www.gov.br/ds/components/select?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/select/select.md
Status da coleta: ok
-->

# *Select* (Campo de Seleção)

O componente *select* permite selecionar itens em uma lista de opções.

## Uso

![Exemplo Componente Select](imagens/select-sample.png)
*Exemplo do componente select*

A função do componente *select* é coletar informações fornecidas pelo usuário em uma lista de opções. Utilize o componente *select* quando um usuário precisar escolher uma ou mais opções em uma lista.

---

## Tom e voz

- Ordene os itens de forma lógica para facilitar a visualização das opções pelo usuário (Ex: ordem alfabética, cronológica, etc.).
- Se possível torne padrão a opção mais escolhida pelos usuários.

---

## Anatomia

| ID  | Nome                |                     Referência                     | Uso         |
| --- | ------------------- | :------------------------------------------------: | ----------- |
| 1   | Componente *input*  |     [Input](/ds/components/input?tab=designer)     | Obrigatório |
| 2   | Componente *button* |    [Button](/ds/components/button?tab=designer)    | Obrigatório |
| 3   | Componente *list*   |      [List](/ds/components/list?tab=designer)      | Obrigatório |
| 4   | Modos de seleção    |     [Estados](/ds/fundamentos-visuais/estados)     | Obrigatório |
| 5   | Ícone *search*      | [Iconografia](/ds/fundamentos-visuais/iconografia) | Opcional    |

![Anatomia](imagens/select-anatomy.png)
*Anatomia do componente select.*

---

## Detalhamento dos Itens

### 1. Componente *Input* (Obrigatório)

É o campo de entrada de texto onde o usuário poderá digitar o texto do item escolhido ou selecionar através do *mouse*. Ao clicar no componente *input*, este assumirá seu estado foco e o cursor ficará ativo em seu interior habilitando a funcionalidade de filtro de pesquisa por *autocomplete*.

![Detalhamento do input do componente select.](imagens/select-input.png)
*Detalhamento da seleção pelo input do filtro de pesquisa por autocomplete.*

### 2. Componente *Button* (Obrigatório)

É um botão terciário que tem a função de acionar a exibição ou ocultação da lista *dropdown*, apresentando um *feedback* visual através da alternância em seu ícone interno, através de um comportamento de *toggle*. Este botão deve estar posicionado na extremidade direita ao componente *input*. Para maiores informações consultar o documento Padrão *Dropdown*.

![Detalhe botão terciário.](imagens/select-button-circle.png)
*Detalhe do uso do botão terciário para abrir/fechar a lista dropdown.*

### 3. Componente *List* (Obrigatório)

O componente *list* deve apresentar os itens a serem escolhidos pelo usuário. No tipo *multiselect*, o usuário poderá incluir ou remover mais de um item por meio do *checkbox*. Cada item selecionado assumirá o estado selecionado.

![Exemplos de componente select padrão e multiselect.](imagens/select-sample.png)
*Exemplos de componente select padrão e multiselect.*

#### Sombra no componente *list*

O componente *list* será apresentado flutuando sobre a tela e uma sombra deve ser utilizada para proporcionar contraste entre o componente e o conteúdo de tela ao fundo. Para maiores informações consultar o fundamento visual Elevação.

![Detalhe do uso de sombra no componente list.](imagens/select-behavior-shadow.png)
*Detalhe do uso de sombra no componente list.*

### 4. Modos de Seleção (Obrigatório)

Existem três formas de realizar a seleção no componente *Multiselect*. São elas:

#### Seleção total

Permite ao usuário fazer, com um único acionamento, a seleção de todos os itens da lista do *multiselect*.

#### Seleção intermediária

Funciona como um *feedback* visual, sendo exibido quando existir, tanto item(ns) selecionado(s), quanto não selecionados.

#### Sem seleção

Permite ao usuário fazer a desseleção de todos os itens da lista previamente selecionados.

![Exemplo do modo de seleção do multiselect](imagens/select-multiselect.png)
*À esquerda, exemplo do componente multiselect com todos os itens selecionados, ao centro com alguns itens selecionados e à direita com todos os itens desselecionados.*

### 5. Ícone *Search* (Opcional)

O uso do ícone *search* é por padrão exibido nos componentes *select* e *multiselect*, no entanto o seu uso *não é obrigatório*. Em determinadas situações, onde as informações textuais são muito reduzidas, por exemplo, o ícone *search* poderá ser retirado.

![Exemplo da extração do ícone search nos componentes select e multiselect](imagens/select-removed-icon.png)
*Exemplo da retirada do ícone search em um componente select para uma melhor adequação de espaço.*

---

## Tipos

O componente pode ser do tipo:

- *Select*;
- *Multiselect*.

### 1. Tipo *select*

O tipo *select* é utilizado para as opções de seleção única. O item selecionado será apresentado no "Campo de Entrada de Texto" seguindo as diretrizes do componente *input*.

![Exemplo de uso do select.](imagens/select-type-select.png)
*Exemplo de uso do componente select.*

### 2. Tipo *multiselect*

Caso seja necessário oferecer múltiplas seleções, deve-se utilizar o tipo *multiselect*. As opções selecionadas serão apresentadas no "Campo de Entrada de Texto", seguindo as diretrizes de exibição do componente *input*.

![Exemplo multiselect](imagens/select-type-multiselect.png)
*Exemplo de uso do componente multiselect.*

---

## Comportamentos

### 1. Seleção dos itens

Ao selecionar os itens no componente *select* e *multiselect*, o usuário terá essa informação visível no campo campo de entrada, conforme a sequência de cada tipo abaixo:

#### Seleção de itens no *select*

1. O *placeholder* exibe a informação inicial;
2. O usuário seleciona o item;
3. O campo de entrada exibe a opção selecionada.

![Exemplo do comportamento de seleção de um item do select.](imagens/select-placeholder.png)
*Exemplo do comportamento de seleção de um item do select.*

#### Seleção de itens no *multiselect*

1. O *placeholder* exibe a informação inicial;
2. O usuário seleciona os itens;
3. O campo de entrada exibe as opções selecionadas em tempo real;
4. O campo de entrada exibe as opções escolhidas.

![Exemplo do comportamento de seleção de vários itens do multiselect.](imagens/select-placeholder-multiselect.png)
*Exemplo do comportamento de seleção de vários itens do multiselect.*

**Importante:** observe que no passo 3 e 4 o campo de entrada só exibe quantos itens couberem dentro do campo *input* e o restante será acrescentado em forma de quantidade ao final do texto.

#### Seleção de todos os itens no *multiselect*

O usuário poderá selecionar ou desselecionar todos os itens da lista ao mesmo tempo. Esta opção é disponível no primeiro item da lista de forma destacada.

Ao clicar no *checkbox* deste primeiro item, todos os itens da lista serão selecionados. Caso o usuário desmarque o *checkbox* do primeiro item, todos os itens da lista serão desselecionados.

O rótulo deste item alternará entre "Selecionar Todos" e "Desselecionar Todos" conforme o usuário marque ou desmarque o primeiro item da lista. Observe o exemplo abaixo:

1. Os itens estão todos desselecionados;
2. A lista foi totalmente selecionada através do primeiro item da lista.

![Exemplo do comportamento de seleção de todos os itens no multiselect.](imagens/select-behaviour-selected-all.png)
*Exemplo do comportamento de seleção de todos os itens no tipo multiselect.*

### 2. Abertura do *select* e *multiselect*

Para abrir o componente *select* ou *multiselect* o usuário poderá clicar em toda a extensão no campo *input*. Observe abaixo:

![Exemplo de abertura dos itens do select.](imagens/select-behaviour-select-click-open.png)
*Exemplo do comportamento de abertura dos itens do select nos estados interativo à esquerda, estado hover no centro e estado pressionado à direita.*

![Exemplo de abertura dos itens do multiselect.](imagens/select-behaviour-multiselect-click-open.png)
*Exemplo do comportamento de abertura dos itens do multiselect nos estados interativo à esquerda, estado hover no centro e estado pressionado à direita.*

**Importante:** Não havendo espaço disponível para visualizar a abertura devido aos limites da tela, os itens do "Componente *list*" deverão ser reposicionado em uma outra direção, garantindo uma melhor adequação ao layout apresentado. Para maiores informações consultar o tópico *"Posicionamento"* no documento Padrão [*Dropdown*](/ds/padroes/design/dropdown).

### 3. Responsividade

Nas *grids* de 12 e 8 colunas o tamanho do *select* e *multiselect* será ajustado conforme o seu conteúdo interno, respeitando os tamanhos mínimos e máximos.

#### *Grid* de 12 colunas

![Responsividade do componente select em grid de 12 colunas](imagens/select-behavior-responsive-grid-12-col.png)
*Responsividade do componente select em grid de 12 colunas*

#### *Grid* de 8 Colunas

![Responsividade do componente select em grid de 8 colunas](imagens/select-behavior-responsive-grid-8-col.png)
*Responsividade do componente select em grid de 8 colunas*

#### *Grid* de 4 Colunas

Na *grid* de 4 colunas, os componentes *select* e *Multiselect* ocuparão toda largura da tela, respeitando as margens laterais da *grid*.

![Responsividade do componente select em grid de 4 colunas](imagens/select-behavior-responsive-grid-4-col.png)
*Responsividade do componente select em grid de 4 colunas*

### 4. Estados

Os componentes *select* e *multiselect* seguirão o padrão de diretrizes para estados, conforme observado abaixo:

#### Estado Padrão

No estado padrão o campo *input* e os itens da *list* apresentam-se em suas formas naturais.

![Exemplo de estado interativo.](imagens/select-behaviour-state-interative.png)
*Exemplo de estado interativo no select.*

#### Estado Foco

O estado foco ocorre sobre o campo *input* quando o usuário clicar sobre ele ou sobre o botão terciário.

![Exemplo de estado foco.](imagens/select-behaviour-state-foco.png)
*Exemplo de estado foco no select.*

#### Estado *Hover*

O estado *hover* ocorre sobre o item da *list* quando o usuário direcionar o *mouse* sobre ele.

![Exemplo de estado hover.](imagens/select-behaviour-state-hover.png)
*Exemplo de estado hover no select.*

#### Estado Selecionado

O estado selecionado ocorre quando algum(ns) item(ns) da *list* estiver(em) selecionado(s).

![Exemplo de estado selecionado.](imagens/select-behaviour-state-intermediary.png)
*Exemplo de estado selecionado no select.*

**OBS:** Se todos os itens não estiverem selecionados, o componente *select* também poderá se enquadrar no estado intermediário.

### 5. Dimensões mínimas e máximas

#### Larguras do *select* e *multiselect*

Os componentes *select* e *multiselect* têm as larguras ajustadas conforme o conteúdo interno dos seus itens. Porém, devem ser respeitadas as larguras mínimas e máximas para estes elementos. Observe a seguir:

![Exemplo de larguras do componente select.](imagens/select-behavior-size.png)
*Exemplo de largura do componente select.*

#### Largura Mínima

Sempre que possível, deve-se evitar que a largura do *select* seja muito reduzida, dificultando a leitura e entendimento das informações. Recomendamos que a largura mínima não seja inferior a 64px.

![Exemplos de larguras mínimas recomendáveis e não recomendáveis.](imagens/select-behavior-size-1.png)
*Exemplos de larguras mínimas recomendáveis à esquerda, onde os textos estão bem ajustados e à direita exemplos selects com parte dos seus textos ocultados.*

**OBS:** Em situações onde os textos do input ou dos itens do select forem muito extensos, estes deverão ser diagramados como informado no tópico **"Comportamento"**, seção **"Ajustes textuais no select"**.

#### Largura Máxima

Não há obrigatoriedade para definição de uma largura máxima. Recomendamos que a largura escolhida, respeite as especificações da *grid* do dispositivo, onde o layout de tela esteja sendo apresentado. Para maiores informações consultar a documentação do sistema de *grid*.

#### Altura Máxima

A altura máxima para o *select* e *multiselect* é correspondente à quantidade de itens em cada um:

- *Select*: dez itens;
- *Multiselect*: nove itens.

Quando a quantidade de itens for superior, deverá ser utilizada uma barra de rolagem para visualização dos demais itens. Por exemplo, se o *select* possuir cem itens, ficarão visíveis apenas dez, e o restante será visível apenas por meio de rolagem.

![Exemplo de altura máxima do componente select.](imagens/select-behaviour-max-height.png)
*Exemplo de altura máxima do componente select.*

### 6. Ajustes textuais no *select*

#### Ajustes textuais na área do input

Sempre que a largura da área do campo de entrada for menor que o texto principal do item selecionado, deve-se seguir as seguintes recomendações:

1. Quando o item selecionado tiver um texto extenso e maior que a largura da área do campo de entrada do input, as últimas letras ou palavras poderão ser ocultadas, exibindo no final do campo o símbolo de *"reticências" (...)*, indicando que existe mais palavras excedentes. **OBS:** O texto completo poderá ser exibido através do uso de *tooltip*.
   ![Exemplos de ajustes textuais no campo de entrada do input.](imagens/select-behavior-text-size01.png)
   *Exemplos de ajustes textuais no campo de entrada do input.*

2. Quando houver mais de um item selecionado, as informações apresentadas no campo de entrada deverá conter o texto do primeiro item selecionado, o sinal de *"mais" (+)* acrescido do *"somatório dos itens restantes entre parênteses ( )"*. Ex.: texto do primeiro item + (nº de itens restantes).
   ![Exemplos de ajustes textuais no campo de entrada do input.](imagens/select-behavior-text-size02.png)
   *Exemplos de ajustes textuais no campo de entrada do input.*

3. Em situações em que, além da extensão dos textos, houver mais de um item selecionado, as informações exibidas na área do campo do input agrupará as boas práticas descritas no tópico 1 e 2. Ver exemplo abaixo:
   ![Exemplos de ajustes textuais no campo de entrada do input.](imagens/select-behavior-text-size03.png)
   *Exemplos de ajustes textuais no campo de entrada do input.*

#### Ajustes nos itens do *select*

Quando o texto dos itens for maior que a largura do componente, poderá ocorrer a quebra de linha . Porém recomenda-se evitar sempre que possível esta situação. Observe o modelo abaixo:

1. Texto excedendo a largura do item.

![Exemplos de largura máxima do select e do multiselect.](imagens/select-behavior-size-2.png)
*Exemplos de largura máxima do select e do multiselect.*

**Atenção:** de modo geral, deve-se prezar pelo uso de textos curtos e objetivos no *select* e no *multiselect*. Quando for de extrema necessidade, utiliza-se a quebra de linha dentro o item.

### 7. *Feedback* após pesquisa

Quando o usuário optar por utilizar a função de pesquisa e não for localizado o item procurado, o componente *input* deverá exibir, logo abaixo, uma mensagem de *feedback* do tipo "Empty State", onde será apresentada uma sugestão ou resposta visual para a informação pesquisada.
![Exemplo de mensagem de feedback do tipo empty state](imagens/select-feedback-search.png)
*Exemplo de mensagem de feedback do tipo empty state.*

### 8. Filtro no *select* e *multiselect*

Para facilitar o processo de encontrar os itens na lista, tanto o *select* quanto o *multiselect* possuem a função de filtro, permitindo que o usuário digite o texto no campo *input* e, de forma dinâmica, atualizando a lista *dropdown* apenas com os itens que possuem os mesmo caracteres que estão sendo digitados naquele momento. Observe o exemplo abaixo:

1. A lista contém diversas palavras;
2. O usuário digita o início de uma palavra à sua escolha e a lista será atualizada conforme o texto digitado.

![Exemplo de comportamento de filtragem de itens em um select.](imagens/select-behaviour-filter1.png)
*Exemplo de comportamento de filtragem de itens em um select.*

![Exemplo de comportamento de filtragem de itens em um multiselect.](imagens/select-behaviour-filter2.png)
*Exemplo de comportamento de filtragem de itens em um multiselect.*

---

## Especificações

### Iconografia

| Name                        | Estado  | Ícone                             | Class (Font Awesome) |
| --------------------------- | ------- | --------------------------------- | :------------------: |
| Ícone - componente *button* | Fechado | <i class="fas fa-caret-down"></i> |   `fa-caret-down`    |
| Ícone - componente *button* | Aberto  | <i class="fas fa-caret-up"></i>   |    `fa-caret-up`     |
| Ícone - *Search*            | -       | <i class="fas fa-search"></i>     |     `fa-search`      |

### Opacidade

| Name             | Cor                   |     Opacity Value      |
| ---------------- | --------------------- | :--------------------: |
| Selecionar Todos | `--red-warm-vivid-50` | `--surface-opacity-xs` |

### Espaçamento

| Name               | Property      |           Token           |
| ------------------ | ------------- | :-----------------------: |
| Componente *Input* | margin-bottom |  `--spacing-scale-base`   |
| Selecionar Todos   | margin-top    |  `--spacing-scale-base`   |
| Componente *List*  | margin-top    | `--spacing-scale-default` |

### Tipografia

| Name              |        Font-Weight        |
| ----------------- | :-----------------------: |
| Componente *List* |  `--font-weight-regular`  |
| Selecionar Todos  | `--font-weight-semi-bold` |

### Dimensões

| Name                               | Width      | Max-Width | Min-Width | Height |
| ---------------------------------- | ---------- | --------- | --------- | :----: |
| Componente *Input* - *Select*      | `variável` | `400px`   | `100px`   | `40px` |
| Componente *Input* - *Multiselect* | `variável` | `400px`   | `200px`   | `40px` |
| Item *List* - *Select*             | `variável` | `400px`   | `100px`   | `56px` |
| Item *List* - *Multiselect*        | `variável` | `400px`   | `200px`   | `56px` |

### Sombra

| Name       |        Shadow         |
| ---------- | :-------------------: |
| Superfície | `--surface-shadow-md` |
