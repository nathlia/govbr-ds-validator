<!--
URL: https://www.gov.br/ds/components/step?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/step/step.md
Status da coleta: ok
-->

# *Steps* (Navegação Passo a Passo)

*Steps* são indicadores de etapas e progresso que auxiliam os usuários durante um fluxo de trabalho, seguindo uma sequência lógica linear, aleatória, numeradas ou não.

## Uso

![Exemplo de Step Complexo](imagens/sample-01.png)
*Exemplo de Step Complexo*

![Exemplo de Steps Simples](imagens/sample-02.png)
*Exemplo de Steps Simples*

Utilize *Steps* quando:

- houver necessidade de construir fluxos de navegação com etapas sequenciais;
- houver necessidade de sinalizar ao usuário uma ideia de progressão durante uma jornada: etapas concluídas, não concluídas e etapas em andamento;
- houver necessidade de sinalizar ao usuário o tamanho do fluxo que este deverá percorrer.

Não utilize *Steps*:

- quando não houver necessidade de sinalizar ao usuário uma sequência de progressão, linear ou não. Neste caso utilize *Menus* ou *Tabs*.
- quando as etapas não possuem relação entre si. É importante que o uso de *Steps* esteja diretamente relacionado com a ideia de se completar um fluxo, tarefa ou jornada.

---

## Anatomia

O *Componente Step* é constituido por:

| ID  | Nome           |                         Referência                          | Uso         |
| --- | -------------- | :---------------------------------------------------------: | ----------- |
| 1   | Indicador      |                             ---                             | Obrigatório |
| 2   | Rótulos        | [Fundamento Tipografia](/ds/fundamentos-visuais/tipografia) | Opcional    |
| 3   | Linha do Tempo |                             ---                             | Obrigatório |

![Anatomia do Step](imagens/anatomy.png)
*Anatomia do Step*

---

### Detalhamento dos Itens

#### 1. Indicador (Obrigatório)

O *Indicador* é o elemento que definirá os estados de cada etapa, além de servir como elemento interativo por onde o usuário poderá navegar. Os *Indicadores* poderão ser utilizados da seguinte forma:

##### A. Representando a Ordem Numérica das Etapas

É a forma mais comum de utilização do *Indicador*. Este modelo provê ao usuário claramente a quantidade de etapas que este deverá seguir e a etapa onde se encontra.

![Indicador Ordem Numérica](imagens/anatomy-step-buttons-numbers.png)
*Indicador Ordem Numérica*

##### B. Representando uma Informação Iconográfica

É um modelo que transmite ao usuário uma informação semântica através dos ícones e deverá ser utilizado com cautela. Abaixo seguem algumas dicas:

- certifique-se de que o ícone utilizado transmita uma ideia bastante clara ao usuário da ação ou etapa que representa;
- não utilize este modelo quando o número de etapas for muito extenso;
- recomenda-se fortemente a utilização de rótulos como apoio à informação transmitida;
- se possível, numere as etapas nos rótulos.

![Indicador Informação Iconográfica](imagens/anatomy-step-buttons-icons.png)
*Indicador Informação Iconográfica*

##### C. Indicador Vazio

Este formato possui uma representação mais simples e pode ser utilizado quando a necessidade for construir um layout mais minimalista. Além disso, é um modelo bastante adequado para interfaces em dispositivos móveis (*Grid de 4 colunas*), pois permite uma economia maior do espaço horizontal. Neste modelo não se utiliza informação numérica ou iconográfica.

![Indicador Vazio - Sem informação numérica ou iconográfica](imagens/anatomy-step-buttons-bullet.png)
*Indicador Vazio - Sem informação numérica ou iconográfica*

Fique atento a algumas boas práticas:

- Utilize este modelo quando tiver certeza que a ausência de ícones ou números, não interferirá no entendimento do usuário durante sua jornada;

- Recomenda-se utilizar poucas etapas neste tipo de formato;

- Recomenda-se utilizar este modelo em interfaces para dispositivos móveis;

- Quando o *Rótulo* não for utilizado, faça uso do *Componente Tooltip* para auxiliar o usuário no seu entendimento;

![Uso do Tooltip no Indicador Vazio](imagens/anatomy-step-buttons-bullet-tooltip.png)
*Uso do Tooltip no Indicador Vazio*

**Atenção:** Caso também seja necessário utilizar o *Tooltip* para indicar algum erro ou alerta, em situações onde não existe *Rótulo*, utilize o nome do *Rótulo* dentro do *Tooltip* que indica o erro ou alerta, juntamente com o detalhamento do erro ou alerta. Veja abaixo:

![Uso do Tooltip sem Rótulo com alertas](imagens/behaviour-nolabel-tooltip.png)
*Uso do Tooltip sem Rótulo com alertas*

#### 2. Rótulos (Opcional)

O *Rótulo* é a informação textual que acompanha o *Indicador*, sua utilização não é obrigatória, mas é recomendada. O *Rótulo* deverá transmitir a informação, clara, direta e objetiva ao usuário da ação ou etapa que representa. Pode ser utilizado da seguinte forma:

- Centralizado abaixo do *Indicador*. É a forma mais utilizada e por tanto o modelo de posicionamento padrão para o *Rótulo*. O texto do *Rótulo* deve possuir alinhamento centralizado;

![Rótulo Centralizado abaixo do Indicador](imagens/behaviour-position-label-01.png)
*Rótulo Centralizado abaixo do Indicador (Padrão)*

- Centralizado acima do *Indicador*, como posicionamento alternativo. O texto do *Rótulo* deve possuir alinhamento centralizado;

![Rótulo Centralizado acima do Indicador](imagens/behaviour-position-label-03.png)
*Rótulo Centralizado acima do Indicador (Alternativo)*

- À direita do *Indicador*, como forma de posicionamento alternativo. Neste caso, o texto do *Rótulo* deve possuir alinhamento à esquerda;

![Rótulo à direita do Indicador](imagens/behaviour-position-label-02.png)
*Rótulo à direita do Indicador (Alternativo)*

- À esquerda do *Indicador*, como posicionamento alternativo. Neste caso, o texto do *Rótulo* deve possuir alinhamento à direita.

![Rótulo à esquerda do Indicador](imagens/behaviour-position-label-04.png)
*Rótulo à esquerda do Indicador (Alternativo)*

É importante estar atendo a algumas boas práticas:

- o ideal é que se utilize apenas uma palavra no rótulo;
- caso haja necessidade, utilize duas ou três palavras, no máximo;
- use um texto claro, direto e objetivo;
- mantenha a consistência optando por apenas um dos modelos em seu projeto, não utilize mais de um tipo;
- no caso do posicionamento do *Rótulo* à direita ou à esquerda do *Indicador*, fique atento às restrições de espaço. Estes tipos de posicionamento necessitam de mais espaço horizontal e são mais adequados em resoluções *Desktop* (*Grid* de 12 colunas);
- na ausência do *Rótulo*, recomenda-se utilizar o *Componente Tooltip* para auxiliar o usuário em seu entendimento.

##### Rótulo no Tipo *Step Textual*

O *Rótulo* também é utilizado no modelo tipo *Step Textual*. Veja mais detalhes em *Tipos*.

![Rótulo no Tipo Step Textual](imagens/anatomy-step-simple-text-step.png)
*Rótulo no Tipo Step Textual*

#### 3. Linha do Tempo (Obrigatório)

A linha do tempo servirá para dar sentido semântico ao fluxo que deve ser seguido pelo usuário através das etapas. Esta se posiciona entre os *Indicadores* e acompanha o espaçamento entre eles.

![Exemplo de Linha do Tempo](imagens/anatomy-time-line-01.png)
*Exemplo de Linha do Tempo*

##### Linha do Tempo com *Indicadores* Ocultos

A linha do tempo também tem a função de indicar se existem mais *Indicadores* ocultos. Quando isto ocorrer, a linha do tempo deverá "sangrar" até os limites da tela, indicando que há mais etapas antes ou depois das etapas visíveis na tela. Além disto, deve-se utilizar sombras nas laterais do *Painel de Etapas*, nos lados onde houver etapas ocultas. Observe o exemplo abaixo:

![Exemplo de Linha do Tempo com Indicadores Ocultos](imagens/anatomy-time-line-02.png)
*Exemplo de Linha do Tempo com Indicadores Ocultos*

---

## Tipos

### 1. Step Complexo

Este tipo é bastante utilizado em *Wizard (Assistentes)* e auxiliam o usuário durante o fluxo ou jornada de alguma tarefa específica.

![Exemplo de Step Complexo](imagens/sample-01.png)
*Exemplo de Step Complexo*

### 2. Step Simples

É um modelo bastante resumido e otimizado para utilização dentro de outros componentes. É mais comumente utilizado em *Carrosséis de Imagens*, *Cards*, *Janelas Modais*, entre outros. Este modelo geralmente é utilizado juntamente com outros controles de navegação, como por exemplo, botão para avançar e recuar. O funcionamento destes controles de navegação dependem do componente que contém os *Steps*. Observe o exemplo abaixo.

![Exemplo de Step Simples](imagens/sample-02.png)
*Exemplo de Utilização do Step Simples - Os controles de navegação fazem parte do Carrossel no exemplo*

- Evite utilizar um número elevado de etapas no *Step Simples*, pois resulta em problemas de diagramação e usabilidade.
- recomenda-se utilizar de 4 a 5 etapas neste caso;
- caso necessite de mais etapas, utilize o *Step Textual*.

![Uso do Step Simples](imagens/type-simple-step-samples.png)
*Uso do Step Simples*

### 3. Step Textual

O *Step Textual* possui a mesma finalidade do *Step Simples*, e pode ser utilizado dentro de outros componentes, a diferença é que este apresenta a progressão das etapas de forma textual. Sendo formatado da seguinte maneira: "Etapa Atual" / "Total de Etapas". Este modelo oferece a possibilidade de exibir um número de etapas maior que o permitido no *Step Simples*, devido ao formato compacto da representação numérica.

Observe o exemplo abaixo:

![Exemplo de Step Textual](imagens/sample-03.png)
*Exemplo de Step Textual*

- Utilize o *Step Textual* quando houver necessidade de um número elevado de etapas;

![Uso do Step Textual](imagens/type-simple-text-step-samples.png)
*Uso do Step Textual*

---

## Comportamentos

### 1. Progressão Linear x Não Linear

A progressão definirá se o usuário deverá obedecer uma ordem sequencial ou não. Sendo assim, dependendo da regra de negócio em cada projeto, a progressão das etapas pode ser linear ou não linear.

#### Linear

Na progressão linear o acesso a cada etapa depende da conclusão da etapa anterior. Logo, as etapas não visitadas deverão permanecer no estado desabilitado. Este comportamento é bastante utilizado quando há a necessidade de enviar formulários subsequentes ou na execução de tarefas que tenha interdependência.

- A - As etapas não visitadas deverão permanecer em estado desabilitado até a conclusão da etapa anterior;

- B - As etapas concluídas devem ser apresentadas no estado concluído.

![Exemplo de Steps com Progressão Linear](imagens/behaviour-linear.png)
*Exemplo de Steps com Progressão Linear*

#### Não Linear

Na progressão não linear, o usuário poderá acessar todas as etapas livremente. Este comportamento é bastante utilizado quando a conclusão de uma etapa não depende da conclusão de outra.

- A - as etapas não concluídas deverão permanecer no estado interativo e o usuário poderá navegar livremente por elas;

- B - as etapas concluídas deverão permanecer com o estado concluído.

![Exemplo de Steps com Progressão Não Linear](imagens/behaviour-no-linear.png)
*Exemplo de Steps com Progressão Não Linear*

### 2. Orientação Vertical x Horizontal

O *Step Complexo* possui orientação horizontal e vertical e pode ser utilizado a depender da estrutura de layout em cada projeto.

#### Orientação Horizontal

Muito utilizada em resoluções para *Desktop* *(Grid de 12 ou 8 colunas)*.
![Steps Orientação Horizontal](imagens/behaviour-orientation-horizontal.png)
*Step Complexo - Orientação Horizontal*

#### Orientação Vertical

Apesar de não ser uma obrigatoriedade, geralmente a orientação vertical é mais adequada em dispositivos móveis *(Grid de 4 colunas)*, onde a navegação vertical é mais presente.

Neste modelo, os *Steps* posicionam-se à esquerda, a *Linha do Tempo* fica disposta na direção vertical e o conteúdo da etapa atual será apresentado abaixo do *Indicador* e do *Rótulo*. Observe o modelo abaixo:

![Steps Orientação Vertical](imagens/behaviour-orientation-vertical.png)
*Step Complexo - Orientação Vertical*

##### Conteúdo x Orientação Vertical

Na orientação vertical o conteúdo poderá ser posicionado entre as etapas ou ao lado delas. Observe abaixo:

![Steps Orientação Vertical - Conteúdo entre as Etapas](imagens/behaviour-orientation-vertical-01.png)
*Steps Orientação Vertical - Conteúdo entre as Etapas*

![Steps Orientação Vertical - Conteúdo ao lado das Etapas](imagens/behaviour-orientation-vertical-02.png)
*Steps Orientação Vertical - Conteúdo ao lado das Etapas*

### 3. Responsividade

#### *Grid* de 12 Colunas

Nas *Grids* de 12 colunas é possível utilizar os dois tipos de orientação para o *Steps*, horizontal e vertical. A escolha pode ser feita por razões de adequação à diagramação de interface ou questões estéticas.

![Step Complexo - Grid de 12 Colunas](imagens/behaviour-responsive-grid-12-cols.png)
*Step Complexo - Grid de 12 Colunas - Orientação Horizontal*

![Step Complexo - Grid de 12 Colunas](imagens/behaviour-responsive-grid-12-cols-vertical.png)
*Step Complexo - Grid de 12 Colunas - Orientação Vertical*

#### *Grid* de 8 e 4 Colunas

Já nas *Grids* de 8 e 4 colunas, recomenda-se utilizar a orientação vertical, pois este modelo adequa-se melhor a dispositivos móveis. Veja os exemplos abaixo:

![Step Complexo - Grid de 8 Colunas](imagens/behaviour-responsive-grid-8-cols.png)
*Step Complexo - Grid de 8 Colunas - Orientação Vertical*

![Step Complexo - Grid de 4 Colunas](imagens/behaviour-responsive-grid-4-cols.png)
*Step Complexo - Grid de 4 Colunas - Orientação Vertical*

**Importante:** Caso seja necessário utilizar a orientação horizontal em *Grids* de 8 e 4 colunas, é fortemente recomendado que sejam exibidos no máximo 4 *Etapas* na área visível da tela. As demais etapas deverão permanecer ocultas e só serão exibidas caso o usuário realize o movimento de rolagem horizontal. Veja mais detalhes sobre o comportamento de rolagem na *Seção > Comportamento > Espaçamento entre Etapas > Espaçamento com Scroll*

![Número Máximo de Etapas em Grids de 4 e 8 colunas](imagens/behavior-steps-number.png)
*Número Máximo de Etapas em Grids de 4 e 8 colunas*

#### Responsividade do *Step Simples* e *Step Textual*

Estes dois tipos de *Steps*, tendo em vista sua forma compactada, não são influenciados pela resolução da tela, logo não possuem características responsivas. Geralmente estão localizados dentro de outros componentes. Neste caso, apenas os componentes que os contém é que possuem suas próprias características responsivas. Neste caso, o *Step Simples* e *Step Textual* devem se manter centralizados ao componente que fazem parte. Veja os exemplos abaixo:

![Carrossel com Step Simples e Step Textual - Grid de 12 Colunas](imagens/behaviour-simple-step-grid-12-cols.png)
*Carrossel com Step Simples e Step Textual - Grid de 12 Colunas*

![Carrossel com Step Simples e Step Textual - Grid de 8 Colunas](imagens/behaviour-simple-step-grid-8-cols.png)
*Carrossel com Step Simples e Step Textual - Grid de 8 Colunas*

![Carrossel com Step Simples e Step Textual - Grid de 4 Colunas](imagens/behaviour-simple-step-grid-4-cols.png)
*Carrossel com Step Simples e Step Textual - Grid de 4 Colunas*

### 4. Espaçamento entre as Etapas

Os *Rótulos* e *Indicadores* das etapas podem ser distribuídos na tela de duas formas: com espaçamento dinâmico ou com o espaçamento fixo com *scroll*.

#### Espaçamento Dinâmico

No espaçamento dinâmico, os *Rótulos* e *Indicadores* são distribuídos de forma linear e equidistantes por toda largura ou altura disponível na área visível da tela. Não importa o número de etapas, estas serão distribuídas pela largura ou altura útil da tela. Observe abaixo:

![Espaçamento Dinâmico entre as Etapas - Horizontal](imagens/behaviour-space-horizontal-01.png)
*Espaçamento Dinâmico entre as Etapas - Horizontal*

![Espaçamento Dinâmico entre as Etapas - Horizontal](imagens/behaviour-space-horizontal-02.png)
*Espaçamento Dinâmico entre as Etapas - Horizontal*

![Espaçamento Dinâmico entre as Etapas - Vertical](imagens/behaviour-space-vertical-01.png)
*Espaçamento Dinâmico entre as Etapas - Vertical*

![Espaçamento Dinâmico entre as Etapas - Vertical](imagens/behaviour-space-vertical-02.png)
*Espaçamento Dinâmico entre as Etapas - Vertical*

#### Espaçamento Fixo com *Scroll*

No espaçamento fixo com *Scroll*, a distância entre as etapas são determinadas por parâmetro e caso o número de etapas ultrapasse a área visível da tela, o usuário poderá navegar pelas etapas ocultas com *Scroll*.

A - O espaçamento fixo é determinado por parâmetro;
B - Caso o número de etapas ultrapasse a área visível da tela, é utilizado o *Scroll* para acessar as etapas ocultas;
C - Área visível da tela.

![Espaçamento Fixo com Scroll](imagens/behavior-space-fix-01.png)
*Espaçamento Fixo com Scroll*

##### Comportamento do Scroll

*A -* O usuário poderá posicionar o dedo ou o mouse sobre qualquer uma das etapas visíveis e;

*B -* poderá deslizar horizontalmente para esquerda ou direita, exibindo as etapas ocultas.

![Espaçamento Fixo com Scroll](imagens/behavior-scroll-02.png)
*Espaçamento Fixo com Scroll - Grid de 12 colunas*

![Espaçamento Fixo com Scroll](imagens/behavior-scroll-01.png)
*Espaçamento Fixo com Scroll - Grid de 4 colunas*

### 5. Densidade

#### Densidade Alta

Utilize densidade alta quando houver necessidade de economizar espaço em tela, ou quando esta densidade se adequar melhor ao projeto de layout. Para o *Step Simples*, não há necessidade de se utilizar a alta densidade, visto que este componente já possui uma compactação muito elevada.

![Densidade Alta](imagens/behaviour-density-hight.png)
*Densidade Alta*

#### Densidade Média (Padrão)

A densidade média ou padrão é forma comum do *Step Complexo* e do *Step Simples*.

![Densidade Média (Padrão)](imagens/behaviour-density-default.png)
*Densidade Média (Padrão) do Step Complexo*

![Step Simples - Densidade Média (Padrão)](imagens/behavior-simple-density-default.png)
*Densidade Média (Padrão) do Step Simples*

#### Densidade Baixa

Utilize a densidade baixa quando houver necessidade de uma área maior de clique ou um destaque maior para as etapas.

![Densidade Baixa](imagens/behaviour-density-low.png)
*Densidade Baixa do Step Complexo*

![Step Simples - Densidade Baixa)](imagens/behavior-simple-density-low.png)
*Densidade Baixa do Step Simples*

### 6. Uso de Alertas, Erros e Concluído

No *Step Complexo*, é possível sinalizar ao usuário erros ou pendências ocorridas nas etapas, além de sinalizar se a etapa foi concluída. Isto é feito com a utilização do *Componente Tag*, do tipo *Ícone*. Esta *Tag* é posicionada no topo e à direita do *Indicador*, e pode representar os *Estados Alert*, *Error* e *Concluído*.

- Quando ocorrer alguma pendência referente à tarefa realizada em alguma etapa do fluxo, comunique através da *Tag* no *Estado Alert* no *Indicador* e *Rótulo*.

![Estado Alert](imagens/behaviour-alert.png)
*Estado Alert*

- Da mesma forma, caso ocorra algum erro ou impedimento na tarefa executada em alguma etapa, comunique ao usuário através da *Tag* no *Estado Error* no *Indicador* e *Rótulo*;

![Estado Error](imagens/behaviour-error.png)
*Estado Error*

- Quando a tarefa é finalizada em uma determinada etapa, utilize a *Tag* com o estado concluído no *Indicador* e *Rótulo*.

![Estado Concluído](imagens/behaviour-concluded.png)
*Estado Concluído*

- Recomenda-se utilizar também o *Componente Tooltip* para exibir o detalhamento da pendência. Utilize o *Tooltip* com a interação `mouseover` e detalhe em poucas palavras qual erro ou pendência precisa ser sanada pelo usuário. Observe os exemplos abaixo:

![Uso do Tooltip com Estado Alert](imagens/behaviour-alert-01.png)
*Uso do Tooltip com Estado Alert*

![Uso do Tooltip com Estado Error](imagens/behaviour-error-01.png)
*Uso do Tooltip com Estado Error*

#### Alertas e Erros com o *Indicador Vazio*

Nesta situação, a utilização da *Tag* de *Erro* ou *Alerta* substituirá o *Indicador*, dando ênfase à etapa com pendências.

![Erros com o Indicador Vazio](imagens/behaviour-error-bullet.png)
*Erros com o Indicador Vazio*

![Alertas com o Indicador Vazio](imagens/behaviour-alert-bullet.png)
*Alertas com o Indicador Vazio*

**Atenção:** Quando a etapa com erro, alerta ou concluído for a etapa em que o usuário se encontra, ou seja, quando for a etapa ativa, a *Tag* de erro, alerta ou concluído deve ser circulada por uma borda representando a cor do estado ativo. Veja as diferenças abaixo:

![Erro com o Indicador Numérico no Estado Ativo](imagens/behaviour-error-active.png)
*Erro com o Indicador Numérico no Estado Ativo*

![Erro com o Indicador Vazio no Estado Ativo](imagens/behaviour-error-bullet-active.png)
*Erro com o Indicador Vazio no Estado Ativo*

![Alerta com o Indicador Numérico no Estado Ativo](imagens/behaviour-alert-active.png)
*Alerta com o Indicador Numérico no Estado Ativo*

![Alerta com o Indicador Vazio no Estado Ativo](imagens/behaviour-alert-bullet-active.png)
*Alerta com o Indicador Vazio no Estado Ativo*

![Concluído com o Indicador Numérico no Estado Ativo](imagens/behaviour-concluded-active.png)
*Concluído com o Indicador Numérico no Estado Ativo*

![Concluído com o Indicador Vazio no Estado Ativo](imagens/behaviour-concluded-bullet-active.png)
*Concluído com o Indicador Vazio no Estado Ativo*

### 7. Estados

#### Estado Interativo

Utilize o estado interativo sobre os elementos nos quais o usuário irá interagir, nesse caso sobre o Indicador e o Rótulo.

![Estado Interativo](imagens/behaviour-state-interative.png)
*Estado Interativo*

- Durante a progressão não linear, as etapas não visitadas podem apresentar-se no estado interativo, pois o acesso a essas etapas não dependem da conclusão das anteriores.

  ![Etapas Não Visitadas - Estado Interativo](imagens/anatomy-step-buttons-no-visited-interactive.png)
  *Etapas Não Visitadas - Estado Interativo*

#### Estado Hover

O estado hover ocorre sobre o *Indicador* quando o usuário passar o mouse sobre o Indicador ou o Rótulo.

![Estado Hover](imagens/behaviour-state-hover.png)
*Estado Hover*

#### Estado Ativo

O estado ativo ocorre sobre o Indicador que representa a etapa que o usuário se encontra.

![Estado Ativo](imagens/behaviour-state-active.png)
*Estado Ativo*

#### Estado Desabilitado

O estado desabilitado ocorre nas etapas não visitadas ou inoperantes.

![Estado Desabilitado](imagens/behaviour-state-dissabled.png)
*Estado Desabilitado*

- quando o acesso a etapas não visitadas depender da conclusão das anteriores, ou seja na progressão linear, utilize o estado desabilitado.

![Indicador Etapa Não Visitada](imagens/anatomy-step-buttons-no-visited-disabled.png)
*Indicador de Etapa Não Visitada Desabilitado - depende da conclusão das etapas anteriores*

#### Estado Pressionado

O estado pressionado ocorre quando o usuário clica sobre o Indicador.

![Estado Pressionado](imagens/behaviour-state-pressed.png)
*Estado Pressionado*

#### Estado Foco

O estado foco ocorre quando o Indicador recebe o foco do navegador através de uma navegação via tecla `Tab`.

![Estado Foco](imagens/behaviour-state-foco.png)
*Estado Foco*

#### Estado Concluído

Este formato tem a finalidade exclusiva de representar as etapas concluídas. Ou seja, a tarefa referente àquela etapa precisa estar finalizada. Por exemplo, um envio de um formulário ou a leitura de um texto com consentimento.

![Indicador Etapa Concluída](imagens/anatomy-step-buttons-visited.png)
*Indicador Etapa Concluída*

![Estado Concluído](imagens/behaviour-state-visited.png)
*Estado Concluído*

#### Estado Alert

O estado alert ocorre sobre o Indicador quando há a necessidade de informar alguma pendência referente à tarefa de alguma etapa.

![Estado Alert](imagens/behaviour-state-alert.png)
*Estado Alert*

#### Estado Error

O estado error ocorre sobre o Indicador quando há a necessidade de informar algum erro ou impedimento referente à tarefa de alguma etapa.

![Estado Error](imagens/behaviour-state-error.png)
*Estado Error*

---

## Especificações

### Cores

#### Cores do Estado Interativo

| Name                             | Property     | Token/Value            |
| -------------------------------- | ------------ | ---------------------- |
| Rótulos                          | color        | `--blue-warm-vivid-70` |
| Rótulos (Fundo Escuro)           | color        | `--blue-warm-20`       |
| Indicador                        | color        | `--blue-warm-vivid-70` |
| Indicador                        | border-color | `--blue-warm-vivid-70` |
| Indicador                        | border-style | `solid`                |
| Indicador                        | border-width | `--surface-width-sm`   |
| Indicador (Fundo Escuro)         | color        | `--blue-warm-20`       |
| Indicador (Fundo Escuro)         | border-color | `--blue-warm-20`       |
| Indicador (Fundo Escuro)         | border-style | `solid`                |
| Indicador (Fundo Escuro)         | border-width | `--surface-width-sm`   |
| Indicador Simples                | background   | `--gray-20`            |
| Indicador Simples (Fundo Escuro) | border-color | `--pure-0`             |
| Indicador Simples (Fundo Escuro) | border-style | `solid`                |
| Indicador Simples (Fundo Escuro) | border-width | `--surface-width-sm`   |
| Linha do Tempo                   | border-color | `--blue-warm-vivid-70` |
| Linha do Tempo (Fundo Escuro)    | border-color | `--pure-0`             |
| Linha do Tempo                   | border-style | `solid`                |
| Linha do Tempo                   | border-width | `--surface-width-sm`   |

#### Cores do Estado Ativo

| Name                                        | Property     | Token/Value            |
| ------------------------------------------- | ------------ | ---------------------- |
| Rótulos                                     | color        | `--blue-warm-vivid-80` |
| Rótulos (Fundo Escuro)                      | color        | `--blue-warm-20`       |
| Indicador                                   | color        | `--pure-0`             |
| Indicador                                   | border-color | `--pure-0`             |
| Indicador                                   | border-style | `solid`                |
| Indicador                                   | border-width | `--surface-width-sm`   |
| Indicador Simples                           | background   | `--blue-warm-vivid-80` |
| Indicador Simples (Fundo Escuro)            | background   | `--pure-0`             |
| Indicador Vazio (Error, Alerta e concluído) | border-color | `--blue-warm-vivid-80` |
| Indicador Vazio (Error, Alerta e concluído) | border-style | `solid`                |
| Indicador Vazio (Error, Alerta e concluído) | border-width | `--surface-width-lg`   |

#### Cores do Estado Concluído

| Name                   | Property | Token/Value             |
| ---------------------- | -------- | ----------------------- |
| Rótulos                | color    | `--green-cool-vivid-50` |
| Rótulos (Fundo Escuro) | color    | `--blue-warm-20`        |

#### Cores do Estado Alerta

| Name                   | Property | Token/Value      |
| ---------------------- | -------- | ---------------- |
| Rótulos                | color    | `--gray-80`      |
| Rótulos (Fundo Escuro) | color    | `--blue-warm-20` |

#### Cores do Estado Error

| Name                   | Property | Token/Value      |
| ---------------------- | -------- | ---------------- |
| Rótulos                | color    | `--red-vivid-50` |
| Rótulos (Fundo Escuro) | color    | `--blue-warm-20` |

### Tipografia

| Name         | Token Size               | Token Weight            |
| ------------ | ------------------------ | ----------------------- |
| Rótulos      | `-font-size-scale-up-01` | `--font-weight-medium`  |
| Step Textual | `--font-size-scale-base` | `--font-weight-regular` |

### Iconografia

| Name                   | Estado | Ícone                                       | Token Size         | Class (Font Awesome)       |
| ---------------------- | ------ | ------------------------------------------- | ------------------ | -------------------------- |
| Indicador Simples      | --     | <i class="fas fa-circle"></i>               | `--icon-size-xs`   | `.fa-circle`               |
| Ícone Estado Concluído | --     | <i class="fas fa-check"></i>                | `--icon-size-base` | `.fa-check`                |
| Ícone Estado Alert     | --     | <i class="fas fa-exclamation-triangle"></i> | `--icon-size-base` | `.fa-exclamation-triangle` |
| Ícone Estado Error     | --     | <i class="fas fa-times"></i>                | `--icon-size-base` | `.fa-times`                |

### Espaçamentos

| Name                            | Property      |      Token/Value       |
| ------------------------------- | ------------- | :--------------------: |
| Indicador                       | margin-right  |  `--spacing-scale-2x`  |
| Indicador                       | margin-botton |  `--spacing-scale-2x`  |
| Indicador (Orientação Vertical) | margin-botton |  `--spacing-scale-3x`  |
| Indicador Simples               | margin-right  | `--spacing-scale-base` |

### Dimensões

| Name                                 | Property | Token/Value |
| ------------------------------------ | -------- | :---------: |
| Indicador (Densidade Padrão)         | width    |   `40px`    |
| Indicador (Densidade Padrão)         | height   |   `40px`    |
| Indicador Simples (Densidade Padrão) | width    |    `8px`    |
| Indicador Simples (Densidade Padrão) | height   |    `8px`    |
| Indicador (Densidade Baixa)          | width    |   `48px`    |
| Indicador (Densidade Baixa)          | height   |   `48px`    |
| Indicador Simples (Densidade Baixa)  | width    |   `12px`    |
| Indicador Simples (Densidade Baixa)  | height   |   `12px`    |
| Indicador (Densidade Alta)           | width    |   `32px`    |
| Indicador (Densidade Alta)           | height   |   `32px`    |
