<!--
URL: https://www.gov.br/ds/components/tag?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/tag/tag.md
Status da coleta: ok
-->

# *Tag* (Etiqueta)

*Tag* é qualquer tipo de sinalizador que pode indicar um *status*, uma quantidade ou uma informação de forma precisa e direta.

## Uso

![Exemplos de tipos de tags.](imagens/diretriz.png)
*Exemplos de tipos do componente tag*

Use *tags* para informar, rotular, chamar atenção ou categorizar itens usando palavras-chave, ícones ou cores.

---

## Tom e voz

Devem ter um relacionamento claro e útil com o conteúdo ou tarefa aos quais estão relacionados. Por serem elementos compactos é recomendado o uso de informações discretas e objetivas:

- No caso de textos, utilize o mínimo de palavras possíveis (de preferência somente uma) e/ou um ícone apenas;

- Utilize apenas uma cor por *tag*.

---

## Anatomia

| ID  | Nome            |                          Referência                           | Uso         |
| --- | --------------- | :-----------------------------------------------------------: | ----------- |
| 1   | Superfície      |  [Fundamento Superfície](/ds/fundamentos-visuais/superficie)  | Obrigatório |
| 2   | Ícone           | [Fundamento Iconografia](/ds/fundamentos-visuais/iconografia) | Opcional    |
| 3   | *Label*         |  [Fundamento Tipografia](/ds/fundamentos-visuais/tipografia)  | Opcional    |
| 4   | Botão Terciário |    [Componente Button](/ds/components/button?tab=designer)    | Opcional    |

![Anatomia dos tipos de tags.](imagens/anatomia.png)
*Anatomia do componente tag*

---

### Detalhamento dos Itens

#### 1. Superfície (Obrigatório)

Todos os elementos da *tag* estão contidos na superfície que pode ter o formato retangular ou circular, conforme o tipo.

![Exemplos de superfície.](imagens/superficie.png)
*Superfícies do tag*

Cuidado com contraste de cores (*superfície* e o *texto/ícone*) nas *tag* que podem ser personalizadas.

**Atenção:** os únicos tipos de *tags* que podem conter bordas são as *tags* de *status* e as *tags* de contagem.

#### 2. Ícone (Opcional)

Os ícones identificam entidades ou categorias. Funcionam como apoio aos *labels* ou podem ser o único conteúdo da *tag*. Nos casos em que o ícone seja o único elemento da *tag* o uso de *tooltip* é necessário.

![Exemplos de ícones com tooltips.](imagens/icone.png)
*Use tooltips para complementar informações em tags de ícone ou de status*

#### 3. *Label* (Opcional)

*Labels* são conteúdos presentes nas *tags* com exceção da *tag* de ícone, o único tipo que não apresenta *label*. Na *tag* de *status* o uso de *label* é opcional.

![Exemplos de tags que utilizam labels.](imagens/label.png)
*Exemplos de tags com uso de labels*

**Atenção:** o *label* da *tag* deve ser um adjetivo ou substantivo, *não use verbos*.

#### 4. Botão Terciário (Opcional)

A *tag* interativa é o único tipo em que é possível incluir um botão terciário para a sua remoção ou exclusão.

Foi criada uma nova densidade para o botão terciário fechar especialmente para o componente *tag* denominada *extra-alta*.

![Exemplo de tags interativas com o uso do botão terciário e uma tag de texto sem botão terciário.](imagens/botao-terciario.png)
*Exemplo do uso de botão terciário em uma tag interativa e uma tag de texto que não possui botão terciário*

O botão terciário deve manter o seu comportamento dentro do componente e funciona da mesma maneira em todos os estados.

---

## Tipos

Encontramos cinco tipos de componentes *tag*:

1. *Tag* de interação;
2. *Tag* de texto;
3. *Tag* de *status*;
4. *Tag* de contagem;
5. *Tag* de ícone.

### 1. *Tag* de Interação

As *tags* de interação, como o próprio nome sugere, são interativas, isto é, possuem uma ação ao serem clicadas/tocadas. De acordo com o tipo de interação podemos ter *tags* interativas dispensáveis e persistentes.

#### 1.1. Dispensável

Uma *tag* é considerada dispensável quando apresenta o botão terciário que permite que o usuário possa excluir a *tag*.

![Imagem mostra o comportamento de antes e depois do fechamento de uma tag de interação dispensável ao acionar o botão terciário.](imagens/tag-interacao-fechar.png)
*Ao clicar/tocar no botão fechar, uma tag é excluída de uma amostragem. Neste exemplo, a tag Label 2 foi excluída*

Uma *tag* interativa dispensável pode ser adicionada por meio de diversos componentes de entrada como: *input*, *select*, etc.

#### 1.2. Persistente

Uma *tag* é considerada persistente quando permitir que possa ser selecionada/desselecionada.

![Imagem ilustrando como selecionar uma tag de interação persistente.](imagens/tag-interacao-selecionar.png)
*Exemplo de tag selecionada*

Essa funcionalidade é realizada interagindo em qualquer área do componente para selecionar uma *tag de interação persistente*. Ao se clicar/tocar novamente em uma *tag* já selecionada, ela é desselecionada retornando ao estado original.

Quando se trabalha com grupos de *tags* é possível selecionar quantas *tags* desejar.

![Exemplo de grupo de quatro tags de interação persistente alinhadas horizontalmente e três delas estão selecionadas](imagens/tag-interacao-selecionar-multiplo.png)
*Neste exemplo temos três tags selecionadas*

**Atenção:** as duas variações de *tags* de interação apresentadas (dispensáveis e persistentes) não podem ser utilizadas simultaneamente em um mesmo componente ou grupo de componentes.

### 2. *Tag* de Texto

*Tags* de texto são utilizados quando é necessário identificar ou chamar a atenção de um elemento no *layout*, que de outra forma, poderia ser perdido. A *tag* de texto nunca é interativa.

Muitas vezes, *tags* de texto podem utilizar um ícone para reforçar a sua mensagem. Quando isso ocorrer, o ícone deve vir à esquerda do *label*, como ilustra a figura abaixo:

![Exemplos de tags de texto com e sem a utilização de ícone.](imagens/tag-text.png)
*Exemplo de tag de texto com e sem uso de ícone*

A imagem a seguir ilustra alguns dos mais frequentes usos da *tag* de texto:

![Exemplos de aplicabilidade de tags de texto. No primeiro exemplo há uma lista com tags. No segundo exemplo há uma tabela com tags. No terceiro exemplo há um card com uma tag.](imagens/tag-text-exemples.png)
*Algumas possibilidades comuns de uso da tag de texto*

### 3. *Tag* de *Status*

*Tags* de *status* basicamente informa o *status* de um elemento. É flexível podendo ser utilizado com *label* ou apenas a superfície circular. Neste caso, a informação é transmitida unicamente por meio de cores.

![Exemplos de tag de status com e sem label.](imagens/tag-status.png)
*Exemplo de tag de status com e sem uso de label*

**Atenção:** lembre-se que ao optar pela *tag* de *status* sem *label* é recomendável utilizar *tooltip* para evitar ambiguidade.

### 4. *Tag* de Contagem

*Tags* de contagem têm a função de contabilizar uma determinada informação e apresentar ao usuário. Por exemplo, a quantidade de mensagens não lidas na caixa de entrada.

![Exemplo de tag de contagem.](imagens/tag-counter.png)
*Exemplo de tag de contagem*

As *tags* de contagem podem conter no máximo três dígitos. Qualquer valor acima de 999 deve ser acrescido do sinal de "+" após o número 999.

![Exemplos de tags de contagem com um, dois, três e mais de três dígitos.](imagens/tag-counter-digitos.png)
*Exemplos das possibilidades de quantidade de dígitos nas tag de contagem*

**Atenção:** em caso de números com mais de três dígitos é recomendado o uso de *tooltip* para especificar a quantidade exata do valor.

![Exemplo do uso de tooltip na tag de contagem com mais de três dígitos](imagens/tag-counter-4digitos.png)
*Exemplos do uso de uma tag de contagem com mais de três dígitos*

A imagem a seguir ilustra alguns dos mais frequentes usos da *tag* de contagem:

![Exemplos comuns do uso de tags de contagem. No primeiro exemplo há um avatar com uma tag de contagem. No segundo exemplo há o componente tabs com tag de contagem em cada uma das abas.](imagens/tag-counter-exemples.png)
*Algumas possibilidades comuns de uso da tag de contagem*

### 5. *Tag* de Ícone

*Tags* de ícone funcionam exatamente da mesma forma que as *tags* de texto, porém utilizam ícones em vez de textos para transmitir a informação.

![Exemplos de tags de ícone, cada uma delas com um ícone diferente.](imagens/tag-icone.png)
*Algumas possibilidades comuns de uso da tag de ícone*

Por ser visual, a *tag* de ícone é mais sintética e direta. Por isso, escolha ícones que sejam de fácil assimilação pelo usuário e de preferência aqueles que já sejam popularmente conhecidos pela audiência. Lembre-se que é recomendado a utilização de *tooltip* para evitar ambiguidade.

**Atenção:** somente as *tags* de *status*, de ícone e de contagem possuem bordas. Isso se deve ao fato de usualmente elas sobreporem outros elementos. Porém, por serem opcionais as bordas podem ser omitidas quando desnecessárias.

---

## Comportamentos

### 1. Classificação

Geralmente é utilizada a cor azul padrão para o *background* da superfície do componente *tag de interação* porque esta é a cor que indica que um elemento é interativo. Para os demais tipos de *tags* sugerimos utilizar a paleta de cores de apoio do *Design System*. Esteja sempre atento para garantir legibilidade e coerência semântica na escolha das cores.

**Atenção:** não exagere na variedade de cores pois isso pode desviar a atenção do usuário do foco principal da tela.

### 2. Estados

Somente a *tag* de interação possui estados que devem seguir o padrão dos demais componentes do DS, porém há algumas peculiaridades:

- Quando houver botão terciário os estados de *hover*, pressionado e foco devem ocorrer no próprio botão;

- Os demais estados ocorrem na *tag* por completo.

![A imagem mostra exemplo de estados das tags. Há uma imagem para o estado padrão, para o hover, para o pressionado, para o foco, para o selecionado, para o desabilitado e para o arrastado.](imagens/estados.png)
*Exemplo dos estados possíveis para tags*

**Atenção:** quando *tag* é arrastada de uma posição para a outra, além de assumir o estado arrastado enquanto é realizada a ação, as demais *tags* à sua direita devem se deslocar para a esquerda e ao ser posicionado na nova posição os componentes a sua direita devem se deslocar para a direita.

![Esta imagem representa o comportamento de dragging em um grupo de tags. Há três etapas. Antes: a primeira tag é pressionada. Durante: a tag é arrastada. Depois: a tag ocupa agora a terceira posição no grupo de tags.](imagens/tag-interacao-dragging.png)
*Exemplo do comportamento de dragging com tags*

### 3. Densidade

O ajuste da densidade consiste em aumentar ou reduzir os espaçamentos internos dos elementos com intuito de possibilitar *tags* mais compactas ou mais expandidas em seu formato. Este recurso permite uma maior flexibilidade de uso das *tags*.

![Imagem em forma de tabela mostrando a densidade alta, média e baixa para cada um dos cinco tipos de tag.](imagens/densidade.png)
*Exemplo das possíveis densidades para tags*

### 4. Dimensões

O componente *tag* possui uma altura fixa e por isso não é permitida mais de uma linha de texto ou ícone no mesmo componente.

![Imagem ilustrando como fazer uma tag com uma única linha e mostrando que não se deve fazer uma tag com duas linhas.](imagens/tag-linha.png)
*Só é permitida uma única linha de texto/ícone nas tags*

Quanto à largura, a quantidade máxima permitida é de *cem caracteres*. Se um texto com mais de cem caracteres for inevitável deve-se truncar o conteúdo com o uso de reticências (...) a partir do centésimo caractere. Desta forma é indicado ao usuário que o texto tem continuidade.

![Esta imagem mostra o exemplo de uma tag com o limite de cem caracteres e o texto truncado. Há um tooltip detalhando o texto truncado por completo.](imagens/tag-dimensao.png)
*Exemplo com a quantidade máxima de caracteres aceita pela tag*

**Atenção:** uma boa prática nesses casos é a utilização de *tooltip* para mostrar a informação completa.

### 5. Distribuição

*Tags* podem estar agrupadas tanto horizontal quanto verticalmente mantendo a consistência nos espaços entre as *tags*.

![Imagem mostra grupos de tags distribuídos horizontalmente e verticalmente.](imagens/distribuicao.png)
*Exemplos de possibilidades de distribuição de tag na tela*

**Atenção:** tenha em mente que *tags* também podem estar contidas em outros componentes como: modais, *cards*, *tables*, etc. e devem respeitar as orientações desses componentes.

### 6. Entrada de *tags*

Quando for necessário o cadastro de *tags* pelo usuário sugerimos a utilização de componentes de entrada de dados, como: o *input* ou o *select*.

O componente *input* é mais indicado para a entrada de *tags* criadas aleatoriamente pelo usuário por meio de digitação. Já o componente *select* funciona melhor para apresentar as *tags* sugeridas pelo sistema para que o usuário faça suas escolhas.

#### Entrada de *tags* com o componente *input*

![Exemplo de entrada de tags por meio do componente input.](imagens/tags-entrada.png)
*Exemplo dos passos para a criação de uma tag por meio do componente de entrada input*

**Atenção:** o recurso de *auto complete* pode ser interessante em determinados casos.

#### Entrada de *tags* com o componente *select*

![Exemplo de entrada de tags por meio do componente select.](imagens/tags-entrada-2.png)
*Exemplo dos passos para a criação de uma tag por meio do componente de entrada select*

**Atenção:** quando a entrada de *tags* for por meio de um componente de entrada como *input* ou *select* a *tag* deve ser do tipo *interação dispensável*.

As *tags* adicionadas devem ser disponibilizadas lado a lado até preencher o espaço horizontal disponível. Caso seja necessário, outras linhas de *tags* poderão ser criadas.

![Exemplo de entrada de tags.](imagens/tags-entrada-3.png)
*Para concluir a inserção de uma tag utilizando campos de input basta clicar no botão "+", "Enter" ou clicar fora da área do componente input após digitar o nome da tag*

---

## Melhores Práticas

- *Tags* são elementos de apoio e geralmente acompanham outros elementos. A exceção é a *tag* de interação, que pode funcionar como um componente isolado.

- Evite utilizar *tags* de interação próximas a botões, pois podem causar confusão. Na dúvida, conduza testes de usabilidade para certificar-se de que sua implementação não esteja causando frustração.

- Não misture *tags* de interação com *tags* estáticas. Depois de estabelecer um padrão de como as *tags* se comportam em seu *site*, os usuários sempre esperam esse comportamento.

- Não exagere. As *tags* são mais úteis quando utilizadas com cautela, caso contrário seu significado pode ser diminuído. Lembre-se: se tudo em uma página for considerado importante, nada atrairá atenção exclusiva.

- Mantenha a consistência dos *labels* ao realizar a entrada de *tags*.

---

## Especificações

### Alinhamento [*tag* de Interação]

| Name                       |         Spacing Token         |
| -------------------------- | :---------------------------: |
| Label/Icon/Terciary-button |  `--spacing-vertical-center`  |
| Label                      | `--spacing-horizontal-center` |
| Icon                       |  `--spacing-horizontal-left`  |
| Tertiary-button            | `--spacing-horizontal-right`  |

### Alinhamento [*tag* de Texto]

| Name       |        Spacing Token         |
| ---------- | :--------------------------: |
| Label/Icon | `--spacing-vertical-center`  |
| Label      | `--spacing-horizontal-right` |
| Icon       | `--spacing-horizontal-left`  |

### Alinhamento [*tag* de Status]

| Name       |         Spacing Token         |
| ---------- | :---------------------------: |
| Label      |  `--spacing-vertical-center`  |
| Label      | `--spacing-horizontal-center` |
| Superfície |  `--spacing-vertical-center`  |
| Superfície | `--spacing-horizontal-center` |

### Alinhamento [*tag* de Ícone]

| Name |         Spacing Token         |
| ---- | :---------------------------: |
| Icon |  `--spacing-vertical-center`  |
| Icon | `--spacing-horizontal-center` |

### Alinhamento [*tag* de Contagem]

| Name  |         Spacing Token         |
| ----- | :---------------------------: |
| Label |  `--spacing-vertical-center`  |
| Label | `--spacing-horizontal-center` |

### Espaçamento [*Tag* de Interação]

| Name            | Property                 |        Token/Value        |
| --------------- | ------------------------ | :-----------------------: |
| Label           | margin-right/margin-left |  `--spacing-scale-baseh`  |
| Icon            | margin-left              |  `--spacing-scale-base`   |
| Tertiary-button | margin-right             | `--spacing-scale-default` |

### Espaçamento [*Tag* de Texto]

| Name  | Property                 |       Token/Value       |
| ----- | ------------------------ | :---------------------: |
| Label | margin-right/margin-left | `--spacing-scale-baseh` |
| Icon  | margin-left              | `--spacing-scale-baseh` |

### Espaçamento [*Tag* de Status]

| Name  | Property    |      Token/Value       |
| ----- | ----------- | :--------------------: |
| Label | margin-left | `--spacing-scale-base` |

### Espaçamento [*Tag* de Entrada]

| Name           | Property                |      Token/Value       |
| -------------- | ----------------------- | :--------------------: |
| Tag de Entrada | margin-right/margin-top | `--spacing-scale-base` |

### Tipografia [*Tag* de Interação]

| Name  | Property    |        Token/Value        |
| ----- | ----------- | :-----------------------: |
| Label | family      |   `–-font-family-base`    |
| Label | font-weight |  `--font-weight-medium`   |
| Label | size        | `--font-size-scale-up-01` |

### Tipografia [*Tag* de Texto]

| Name  | Property    |       Token/Value        |
| ----- | ----------- | :----------------------: |
| Label | family      |   `–-font-family-base`   |
| Label | font-weight |  `--font-weight-medium`  |
| Label | size        | `--font-size-scale-base` |

### Tipografia [*Tag* de Status]

| Name  | Property    |       Token/Value        |
| ----- | ----------- | :----------------------: |
| Label | family      |   `–-font-family-base`   |
| Label | font-weight | `--font-weight-regular`  |
| Label | size        | `--font-size-scale-base` |

### Tipografia [*Tag* de Contagem]

| Name  | Property    |       Token/Value        |
| ----- | ----------- | :----------------------: |
| Label | family      |   `–-font-family-base`   |
| Label | font-weight |  `--font-weight-medium`  |
| Label | size        | `--font-size-scale-base` |

### Iconografia

| Name             | Property |    Token/Value     |
| ---------------- | -------- | :----------------: |
| tag de interação | size     | `--icon-size-base` |
| tag de texto     | size     | `--icon-size-base` |
| tag de ícone     | size     | `--icon-size-base` |

### Cores [*Tag* de Interação]

| Name       | Property |      Token/Value       |
| ---------- | -------- | :--------------------: |
| Label      | color    |       `--pure-0`       |
| Superfície | color    | `--blue-warm-vivid-70` |

### Cores [*Tag* de Texto]

| Name       | Property |            Token/Value            |
| ---------- | -------- | :-------------------------------: |
| Label      | color    |     `--pure-0` ou `--gray-80`     |
| Superfície | color    | `Qualquer cor da paleta de apoio` |

### Cores [*Tag* de Status]

| Name       | Property |                     Token/Value                      |
| ---------- | -------- | :--------------------------------------------------: |
| Label      | color    |                     `--gray-80`                      |
| Superfície | color    | `Qualquer cor da paleta de apoio ou paleta de aviso` |

### Cores [*Tag* de Ícone]

| Name       | Property |                     Token/Value                      |
| ---------- | -------- | :--------------------------------------------------: |
| Ícone      | color    |              `--pure-0` ou `--gray-80`               |
| Superfície | color    | `Qualquer cor da paleta de apoio ou paleta de aviso` |

### Cores [*Tag* de Contagem]

| Name       | Property |                     Token/Value                      |
| ---------- | -------- | :--------------------------------------------------: |
| Label      | color    |              `--pure-0` ou `--gray-80`               |
| Superfície | color    | `Qualquer cor da paleta de apoio ou paleta de aviso` |

### Arredondamento [*Tag* de Interação]

| Name       | Property              |         Value          |
| ---------- | --------------------- | :--------------------: |
| Superfície | top-left-bottom-right | `--surface-rounder-sm` |

### Arredondamento [*Tag* de Texto]

| Name       | Property              |         Value          |
| ---------- | --------------------- | :--------------------: |
| Superfície | top-left-bottom-right | `--surface-rounder-sm` |

### Arredondamento [*Tag* de Ícone]

| Name       | Property              |          Value           |
| ---------- | --------------------- | :----------------------: |
| Superfície | top-left-bottom-right | `--surface-rounder-pill` |

### Arredondamento [*Tag* de Contagem]

| Name       | Property              |          Value           |
| ---------- | --------------------- | :----------------------: |
| Superfície | top-left-bottom-right | `--surface-rounder-pill` |

### Tertiary Button [Tag de Interação]

| Name                 | Property |      Token/Value      |
| -------------------- | -------- | :-------------------: |
| Densidade extra-alta | height   | `--spacing-scale-3xh` |

### Densidade

| Name                           | Property |       Token/Value       |
| ------------------------------ | -------- | :---------------------: |
| Tag de interação (dens. alta)  | height   |  `--spacing-scale-4x`   |
| Tag de interação (dens. media) | height   |  `--spacing-scale-5x`   |
| Tag de interação (dens. baixa) | height   |  `--spacing-scale-5xh`  |
| Tag de texto (dens. alta)      | height   |  `--spacing-scale-2xh`  |
| Tag de texto (dens. media)     | height   |  `--spacing-scale-3xh`  |
| Tag de texto (dens. baixa)     | height   |  `--spacing-scale-4xh`  |
| Tag de status (dens. alta)     | height   | `--spacing-scale-baseh` |
| Tag de status (dens. media)    | height   |  `--spacing-scale-2x`   |
| Tag de status (dens. baixa)    | height   |  `--spacing-scale-3x`   |
| Tag de contagem (dens. alta)   | height   |  `--spacing-scale-2xh`  |
| Tag de contagem (dens. media)  | height   |  `--spacing-scale-3x`   |
| Tag de contagem (dens. baixa)  | height   |  `--spacing-scale-3xh`  |
| Tag de ícone (dens. alta)      | height   |  `--spacing-scale-3xh`  |
| Tag de ícone (dens. media)     | height   |  `--spacing-scale-4x`   |
| Tag de ícone (dens. baixa)     | height   |  `--spacing-scale-5xh`  |

### Border

| Name            | Surface Border Token        | Style | Width                | Color      |
| --------------- | --------------------------- | ----- | -------------------- | ---------- |
| Tag de status   | `--surface-border-solid-sm` | solid | `--surface-width-sm` | `--pure-0` |
| Tag de contagem | `--surface-border-solid-sm` | solid | `--surface-width-sm` | `--pure-0` |
