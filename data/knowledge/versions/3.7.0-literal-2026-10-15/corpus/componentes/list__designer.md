<!--
URL: https://www.gov.br/ds/components/list?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/list/list.md
Status da coleta: ok
-->

# *List* (Lista)

*Lists* são estruturas compostas por itens em sequência vertical ou horizontal que podem conter imagens, ícones e elementos interativos. Utilize *lists* quando precisar organizar conteúdos semelhantes em forma sequencial.

## Uso

![Exemplo do componente list horizontal e vertical.](imagens/diretriz.png)
*Exemplo dos componentes list vertical e list horizontal*

---

## Anatomia

| ID  | Nome       |                         Referência                          | Uso         |
| --- | ---------- | :---------------------------------------------------------: | ----------- |
| 1   | *Header*   |                             ---                             | Opcional    |
| 2   | Item       |     [Componente Item](/ds/components/item?tab=designer)     | Obrigatório |
| 3   | Rótulo     | [Fundamento Tipografia](/ds/fundamentos-visuais/tipografia) | Opcional    |
| 4   | *Divider*  |  [Componente Divider](/ds/components/divider?tab=designer)  | Opcional    |
| 5   | Superfície | [Fundamento Superfície](/ds/fundamentos-visuais/superficie) | Obrigatório |

![Anatomia do componente list.](imagens/anatomia.png)
*Anatomia do componente list*

---

## Detalhamento dos Itens

### 1. *Header* (Opcional)

*Lists* podem opcionalmente possuir títulos. O *header* possui uma área textual para o título da *list* e outra para conter ações relacionadas a *list* (uso de botões por exemplo).
Apesar de possuir uma altura padrão, seu *container* pode sofrer alteração na altura quando botões são adicionados.

1. **Header** com altura padrão;
2. **Header** com altura alterada pela inserção de botões.

![Exemplo de altura do header alterado pela inserção de botões.](imagens/titulos.png)
*Áreas de títulos da list*

### 2. Item (Obrigatório)

Um item corresponde à unidade de uma *list* que, ao ser repetido, forma uma lista. Consulte o documento do componente item para mais detalhes.

De uma forma geral, um item pode ser criado contendo uma infinidade de componentes mas, como boas práticas, é recomendável mantê-lo o mais organizado e enxuto possível e dividi-lo em áreas lógicas.
São sugeridas três áreas distintas:

1. **Suporte Visual** (*opcional*): exibe os recursos visuais (geralmente ícones, avatares e mídias);
2. **Área Principal**: exibe o conteúdo principal (geralmente textual);
3. **Suporte Complementar** (*opcional*): exibe os metadados, elementos interativos (geralmente botões e *links*) e informações que complementam o conteúdo principal.

Pode-se utilizar as três áreas sugeridas em conjunto ou isoladamente. É permitida ainda a criação de novas áreas ou utilizar qualquer uma delas isoladamente. No entanto, esteja atento em manter a formatação e consistência dentro de uma mesma *list*.

![Anatomia das partes de um item da list.](imagens/item-areas.png)
*Áreas recomendadas para os itens de uma list*

Os itens podem possuir alturas fixas ou flexíveis determinadas pela quantidade de linhas de conteúdo. No entanto, apesar dessa variação, recomendamos que todos os itens de uma *list* deva possuir a mesma altura, independentemente do comportamento aplicado.

Na ilustração seguinte podemos observar diferentes alturas dos itens de acordo com a quantidade de linhas do conteúdo:

![Exemplos de diferentes alturas dos itens de uma list de acordo com a quantidade de linhas.](imagens/alturas.png)
*Exemplos de variação das alturas dos itens de uma list*

**Atenção:** os itens de uma *list* podem apresentar a quantidade de conteúdo que for necessária e consequentemente a altura deve variar de acordo com o conteúdo. Tenha cuidado ao utilizar alturas flexíveis de itens em uma mesma *list*.

![Exemplo do uso com cautela de list com diferentes quantidade de conteúdo.](imagens/alturas-2.png)
*Use diferentes alturas de itens de uma list com cautela*

#### Área Principal

A área principal suporta o conteúdo principal da *list* que geralmente é representado por textos. Podemos organizar o texto pensando na hierarquia da informação e para isso é recomendado utilizar as sugestões abaixo:

1. **Subtítulo**: texto opcional que possui a maior ênfase entre os textos. Deve ser usado somente quando há necessidade de ter um conteúdo com ênfase maior que o texto principal. É sugerido o uso de letras maiúsculas;
2. **Texto Principal**: texto obrigatório, onde o conteúdo principal da *list* será exibido;
3. **Texto Secundário**: texto opcional que possui a menor ênfase entre os textos.

![Hierarquia dos textos de um item de list.](imagens/item-textos.png)
*Use hierarquia da informação para organizar melhor os textos dentro de uma list*

**Atenção:** é permitida a criação de *layouts* de texto mais específico para determinado produto, porém esteja sempre atento às boas práticas descritas neste documento.

#### Recurso Visual ou Complementar

Recursos visuais ou complementar são representados por ícones, imagens, avatares, botões e elementos interativos em geral. São exibidos nas áreas de suporte (visual/complementar) do item.

![Exemplos de possibilidades de uso de recursos visuais/interativos em uma list.](imagens/recursos-1.png)
*Exemplos de possibilidades de uso dos recursos visuais/interativos em uma list representados em azul*

**Atenção:** mantenha a consistência de uma lista em relação ao posicionamento e tipos de recursos visuais/interativos utilizados.

![Exemplos do que é permitido e não permitido fazer com os recursos visuais/interativos de uma list.](imagens/recursos-2.png)
*Exemplos de possibilidades de uso dos recursos visuais/interativos em uma list representados em azul*

##### Recursos Visuais

Os recursos visuais são definidos por quaisquer elementos que dão apoio visual ao conteúdo. Podem ser ícones, avatares e mídias em geral.

Quando existirem, devem estar localizados na área de *suporte visual*.

![Exemplos de aplicações de recursos visuais.](imagens/recursos-visuais.png)
*Exemplos de recursos visuais localizados na área de suporte*

##### Recursos Complementares

Recursos complementares são quaisquer componentes interativos, metadados ou informações adicionais que podem ser utilizados em conjunto com *lists*. Quando aparecerem, devem estar localizados na área de *suporte complementar* do item.

Reflita sempre se o uso de determinado recurso complementar é necessário e faz sentido dentro de uma *list*.

![Exemplo de uso de recursos complementares dentro do componente list.](imagens/controles.png)
*Exemplo de uso do componente check box dentro do componente list*

##### Metadados

Metadados são informações complementares ao conteúdo principal e têm como objetivo informar-nos sobre eles para tornar mais fácil a sua organização e compreensão.

Quando existir, é recomendado que fique localizado na área de *suporte complementar* do item e alinhado verticalmente ao centro. Pode eventualmente vir acompanhado de um ícone ou botão.

![Exemplos de alinhamentos de metadados.](imagens/metadado.png)
*Exemplos de possibilidades de diagramação do metadados em diferentes itens de list*

### 3. Rótulo (Opcional)

É um item com uma formatação específica com a finalidade de nomear os grupos das lists. Veja o comportamento *Agrupamento* para maiores detalhes.

### 4. *Dividers* e Espaçamento (Opcional)

*Dividers* são recursos opcionais que auxiliam visualmente a percepção do final do item de uma *list* favorecendo a distinção dos seus itens. Quando presentes, devem, estar localizados sempre abaixo da borda inferior de cada item, quando se tratar de uma *list* vertical ou após a borda direita, no caso de *lists* horizontais. *Dividers* podem ser utilizados também como agrupadores.

*Lists* podem ser criadas com diferentes espaçamentos entre seus itens e esta decisão deve ser direcionada pelo *layout* e tomada com equilíbrio e bom senso.

![Exemplos de diferentes espaçamentos nas lists.](imagens/espacamento.png)
*Exemplos de diferentes possibilidades de espaçamentos nas lists*

![Exemplo de list horizontal com dividers verticais.](imagens/separadores-vert.png)
*Exemplo de list horizontal com dividers verticais*

**Atenção:** os espaçamentos devem seguir as orientações especificadas no documento de Fundamentos/Espaçamentos.

#### Boas práticas no uso do *dividers*

- Não é permitido variar o espaçamento dos itens dentro de uma mesma *list*.

![Exemplo do correto uso de espaçamento nas lists.](imagens/espacamento-2.png)
*Exemplo do correto uso de espaçamentos nas lists*

- A leitura de uma *list* com grande quantidade de conteúdo pode ficar confusa. *Dividers* podem auxiliar a separação dos itens e tornar a *list* mais estruturada. Tenha sempre bom senso no uso dos *dividers*.

![Exemplo do bom uso de dividers em uma lista. Use-os com cautela.](imagens/separadores-boaspraticas.png)
*Use dividers em lists com moderação e bom senso*

---

## Tipos

### 1. Vertical

São as mais utilizadas quando o objetivo for listar itens de forma ordenada. Os itens podem estar dispostos em ordem alfabética, conceitual, cronológica ou por qualquer outro critério lógico.

![Exemplo de list do tipo vertical.](imagens/tipo-vertical.png)
*Exemplo de list vertical*

### 2. Horizontal

*Lists* horizontais são menos comuns que as verticais. Podem ser utilizadas quando se quer aproveitar o espaço horizontal da tela. Tem função semelhante às abas e menus horizontais.

![Exemplo de list do tipo horizontal.](imagens/tipo-horizontal.png)
*Exemplo de list horizontal*

---

## Comportamentos

### 1. Densidades e Alturas

A densidade de uma *list* é definida de acordo com o *padding-top-bottom* (espaçamento interno) de seu conteúdo e desta forma determina-se a altura dos itens da *list*. O texto principal é o elemento base para definir o *padding*.

Os itens de uma *list* podem ter densidades *alta*, *média* ou *baixa*.

![Exemplos de densidade alta, média e baixa de uma list.](imagens/densidades-itens.png)
*Densidades fixas possíveis para lists: alta, média e baixa*

Já as alturas dos itens podem ser *fixas* ou *flexíveis*. Na altura fixa a altura é determinada por um valor fixo em pixels. Quando utilizar altura flexível a quantidade de conteúdo irá determinar a altura do item.

**Atenção:** para resoluções abaixo de 4 colunas evite a utilização de densidade alta.

### 2. Agrupamento

Algumas *lists* podem conter muitos itens. Um recurso para torná-las mais organizadas é agrupar os itens por afinidades. Os agrupamentos podem ser feitos de três maneiras:

**1. Com rótulos:**
Sub-itens são agrupados por agrupadores que funcionam como títulos de um grupo.

**2. Com separadores:**
Sub-itens são agrupados por afinidades e cada grupo é destacado por *dividers*.

**3. Com expansão:**
Sub-itens são agrupados e ocultados pelo recurso de expansão. Podem ser acessados por meio do clique no item desejado. Esse comportamento será explicado com mais detalhes neste documento.

![Possibilidades de agrupamento dos itens da list.](imagens/agrupamento.png)
*Possibilidades de agrupamento dos itens da list*

**Atenção:** os exemplos acima podem ser combinados entre si para dar mais ênfase aos agrupamentos.

Os rótulos nada mais são que itens utilizados como títulos de agrupamentos. Por isso devem utilizar a mesma regra de densidade explicada acima.

Referimo-nos a sub-itens quando temos itens agrupados de alguma maneira. Podemos afirmar que sub-itens são itens agrupados, conforme é visualizado na imagem anterior. Evite criar *lists* com mais de um sub-nível.

### 3. Responsividade

Quando uma tela é redimensionada, a largura da área principal de um item sofre alteração de acordo com a nova resolução adotada pelo dispositivo, enquanto as demais áreas (suporte visual e suporte interativo) continuam fixas.

![Comportamento de um item de list conforme a resolução é alterada.](imagens/responsividade.png)
*Comportamento de um item de list conforme a resolução é alterada*

### 4. Expansão

Os itens podem exibir ou esconder conteúdos de diversos tipos, empurrando ou puxando verticalmente os demais conteúdos da *list*. Esta é uma boa maneira de organizar hierarquicamente conteúdos, deixando oculto o que é menos importante.

1. Rótulo expandido;
2. Itens de sub-nível;
3. Botão de acionamento do recurso de expansão.

![Anatomia do comportamento de expansão de list.](imagens/collapse.png)
*Podemos encontrar o recurso de expansão em itens e rótulos, como mostra a imagem acima*

Em *list* horizontais o comportamento de expansão funciona da mesma forma. O exemplo a seguir ilustra esse caso:

![Exemplo do comportamento de expansão em lists horizontais.](imagens/collapse-2.png)
*Exemplo de expansão em uma list horizontal*

**Atenção:** Quando necessário, utilize *dividers* ou elementos visuais (como sombra) para destacar os rótulos ou itens expansíveis. A superfície do conteúdo expandido pode opcionalmente assumir uma cor distinta para diferenciar da *list* principal, mas tenha atenção de não utilizar uma cor já definida para os estados, pois isso pode gerar confusão semântica. Respeite a usabilidade garantindo a taxa mínima de contraste entre a cor do texto e a cor do fundo.

### 5. Ordenação

*Lists* podem oferecer recursos de reordenação pelo usuário, ou até deslocamentos de itens de *lists* diferentes. Quando este recurso estiver ativado deve-se utilizar as definições do estado arrastado (ver documento de Fundamentos/Estados).

![Exemplo de reordenação de itens de uma list.](imagens/ordenacao-1.png)
*Exemplo de reordenação de itens dentro de uma mesma list*

Itens também podem ser deslocados entre diferentes *lists*. A sequência de imagens abaixo ilustra os passos desse comportamento:

1. Item escolhido para ser removido da *list*;
2. *List* que receberá um novo item deslocado da primeira lista;
3. A primeira *list* tem um item removido;
4. Item sendo arrastado;
5. Primeira *list* sem seu item de origem;
6. Segunda *list* com um item inserido.

![Passo 1: escolha do item a ser movido para outra list.](imagens/ordenacao-2.png)
*Exemplo de troca de item entre lists*

![Passo 2: item sendo removido entre as lists.](imagens/ordenacao-3.png)
*Exemplo de troca de item entre listas*

![Passo 3: Item adicionado em uma nova list.](imagens/ordenacao-4.png)
*Exemplo de troca de item entre lists*

---

## Especificações

### Espaçamento

#### Alinhamento

| Name   |        Spacing Token        |
| ------ | :-------------------------: |
| Textos | `--spacing-vertical-center` |
| Textos | `--spacing-horizontal-left` |

#### Spacing

| Name                   |         Token          |
| ---------------------- | :--------------------: |
| Item - densidade alta  | `--spacing-scale-base` |
| Item - densidade média |  `--spacing-scale-2x`  |
| Item - densidade baixa |  `--spacing-scale-3x`  |

### Cor

| Name             | Property   | Color Token  |
| ---------------- | ---------- | :----------: |
| Superfície       | background |  `--pure-0`  |
| Textos           | text       | `--pure-100` |
| Texto secundário | text       | `--gray-70`  |
| Rótulo           | text       | `--pure-100` |

### Tipografia

| Name             | Property    |         Token/Value         |
| ---------------- | ----------- | :-------------------------: |
| Título           | size        |  `--font-size-scale-base`   |
| Item             | size        | `--font-size-scale-down-01` |
| Texto principal  | size        |  `--font-size-scale-base`   |
| Texto secundário | size        | `--font-size-scale-down-01` |
| Rótulo           | size        | `--font-size-scale-down-01` |
| Título           | font-weight |    `--font-weight-bold`     |
| Item             | font-weight |  `--font-weight-semi-bold`  |
| Texto principal  | font-weight |   `--font-weight-regular`   |
| Texto secundário | font-weight |   `--font-weight-regular`   |
| Rótulo           | font-weight |  `--font-weight-semi-bold`  |

### Iconografia

| Name           | Estado | Ícone                               | Size               | Class (Font Awesome) |
| -------------- | ------ | ----------------------------------- | ------------------ | -------------------- |
| Ícone Expandir | --     | <i class="fas fa-chevron-down"></i> | `--icon-size-base` | `.fa-chevron-down`   |
| Ícone Retrair  | --     | <i class="fas fa-chevron-up"></i>   | `--icon-size-base` | `.fa-chevron-up`     |
