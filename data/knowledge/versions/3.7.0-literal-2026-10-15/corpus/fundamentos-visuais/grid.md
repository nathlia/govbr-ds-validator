<!--
URL: https://www.gov.br/ds/fundamentos-visuais/grid
Aba: não se aplica
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/fundamentos-visuais/grid/grid.md
Status da coleta: ok
-->

# *Grid*

*Grid* (ou malha) é uma estrutura geométrica constituída por eixos desenvolvida para auxiliar o alinhamento de elementos gráficos e textuais em uma composição visual.

Utilize a *grid* para auxiliar no desenvolvimento de *layouts* organizados e estruturados.

---

## Princípios

### Experiência Única

O sistema de *grid* de 12 colunas possui uma boa flexibilidade para projetos de *layouts*, pois permite uma diagramação de páginas e telas com colunas múltiplas de 12, além de se adequar aos principais *Frameworks* CSS, facilitando a escolha na tecnologia a ser utilizada. Em *Tablets* e *Smartphones* o número de colunas é reduzido ao máximo de 8 e 4 respectivamente, devido à limitação de espaço.

### Eficiência e Clareza

Seguindo o princípio de espaçamentos e dimensões múltiplas de 8, é possível preservar as proporções em resoluções de telas diferenciadas, visto que a maioria tem suas dimensões divisíveis por 8. Essa característica de *Design* Multi-Plataforma fornece ao usuário uma sensação de consistência e clareza no projeto de design em diferentes dispositivos.

### Acessibilidade

As interfaces devem ser adequadas a diferentes tipos de dispositivos. Tendo em vista esse aspecto, o sistema de *grid* fornece alguns *breakpoints* - pontos de quebra onde o *layout* será ajustado para atender diferentes resoluções, sendo assim possível desenvolver interfaces adaptáveis a diversos formatos e tamanhos de telas.

### Reutilização e Colaboração

Porventura, poderá haver alguma adaptação específica no sistema de *grids*, *breakpoints* e padrões de proporção, para atender alguma necessidade em projetos de interface. Sendo assim, faz-se necessário que essas evoluções/adaptações sejam testadas e passem por uma prévia aprovação da equipe de *design* do Design System.

---

## *Breakpoints*

O sistema de *grid* para o *Design System* do Governo Federal adequa-se a cinco *breakpoints* de referência, abrangendo resoluções para *mobile*, *tablet*, *desktop* e resoluções superiores. São elas:

![Visão Geral dos Breakpoints e Resoluções](imagens/breakpoint-statcounter.png)
*Visão geral dos breakpoints e resoluções.*

| *Device*                                   | *Breakpoint Range* (px) | *Breakpoint* (px) |
| ------------------------------------------ | ----------------------- | ----------------- |
| *Smartphone Portrait*                      | 0 - 575                 | 0                 |
| *Smartphone Landscape* / *Tablet Portrait* | 576 - 991               | 576               |
| *Tablet Landscape*                         | 992 - 1279              | 992               |
| *Desktop*                                  | 1280 - 1599             | 1280              |
| TV                                         | 1600 - \*               | 1600              |

---

## Tipos de *Grid*

Existem 3 tipos de *grid*:

- *4 Colunas*;
- *8 Colunas*;
- *12 Colunas*.

Cada uma delas deve ser utilizada em um determinado *breakpoint*.

Pode-se utilizar *qualquer* comportamento de largura em qualquer tipo de *grid*. Porém, um pode ser mais recomendado que outro dependendo da *grid*.

### 1. *Grid* de 4 colunas

O conteúdo deve ser reorganizado em *4 colunas* respeitando a margem de *8px* nas laterais e medianiz de *16px*.

Recomenda-se o uso do comportamento de *grid* fluida. Evite o uso do comportamento fixo para esta *grid*.

| *Property*   | *Value*               |
| ------------ | --------------------- |
| *max-width*  | até 559px             |
| *gutter*     | 16px                  |
| *columns*    | 4                     |
| *margin*     | 8px                   |
| *breakpoint* | *Smartphone Portrait* |

- Para comportamento fluido o valor sempre será 100%;
- Margem mínima no comportamento fixo.

![Grid 4 colunas](imagens/grid-04colunas.png)
*Exemplo de grid de 4 colunas.*

### 2. *Grid* de 8 colunas

O conteúdo é organizado em *8 colunas* se adequando às variações retrato e paisagem. O espaçamento entre as colunas será de *24px* e a margem externa ao conteúdo de *40px*.

Essa *grid* pode ser utilizada em dois *breakpoints* distintos. Um voltado para *smartphone landscape* e *tablet portrait*, e outro voltado somente para *tablet landscape*. Desta forma gera maior flexibilidade de uso variando apenas comportamentos de responsividade e de largura em cada resolução.

Recomenda-se o uso do comportamento de *grid* fluido. Utilize o comportamento fixo com cautela (geralmente em *tablet landscape*).

| *Property*   | *Value*                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------- |
| *max-width*  | de 496px até 911px (*tablet* e *smartphone landscape*) ou de 912px até 1199px (*tablet landscape*) |
| *gutter*     | 24px                                                                                               |
| *columns*    | 8                                                                                                  |
| *margin*     | 40px                                                                                               |
| *breakpoint* | *Smartphone Landscape / Tablet Portrait ou Tablet Landscape*                                       |

- Para comportamento fluido o valor sempre será 100%;
- Margem mínima no comportamento fixo.

![Grid 8 colunas](imagens/grid-08colunas.png)
*Exemplo de grid de 8 colunas.*

### 3. Grid de 12 Colunas

Utilizam *12 colunas* com espaçamentos de *24 pixels* ou *40 pixels* entre elas (dependendo do *breakpoint*). Esse sistema permite a organização do conteúdo bastante diversificado.

Quando utilizada a *grid* fixa, a margem externa ao conteúdo é variável (com tamanho mínimo de *40 pixels*) se adequando às dimensões da tela.

Essa *grid* pode ser utilizada em dois *breakpoints* distintos. Um voltado para *desktop* e outro para TV. Por causa da grande diferença de espaço útil disponível a configuração da *grid* e os comportamentos recomendados são distintos para cada *breakpoint*.

#### *Desktop*

O espaçamento das colunas é de *24 pixels*.

A recomendação do uso de *grid* fluida ou fixa é variável pois depende do tipo de conteúdo utilizado:

- **Grid fluida**: é recomendada para sistemas ou situações em que é preciso aproveitar a maior parte do espaço útil da tela do dispositivo.
- **Grid fixa**: recomenda-se para portais ou conteúdos informativos (como *sites* de notícia) em que o conteúdo não deve sofrer muita distorção, mantendo a leitura consistente.

| *Property*   | *Value*              |
| ------------ | -------------------- |
| *max-width*  | de 1200px até 1519px |
| *gutter*     | 24px                 |
| *columns*    | 12                   |
| *margin*     | 40px                 |
| *breakpoint* | *Desktop*            |

- Para comportamento fluido o valor sempre será 100%;
- Margem mínima no comportamento fixo.

![Grid 12 colunas](imagens/grid-12colunas.png)
*Exemplo de grid de 12 colunas para desktop.*

#### TV

O espaçamento das colunas é de *40 pixels*.

Recomenda-se o uso da *grid* fixa. Por possuir uma área útil extensa pode causar problemas de legibilidade (nos textos) ou problemas de hierarquia da informação.

Utilize o comportamento fluido com cautela.

| *Property*   | *Value*            |
| ------------ | ------------------ |
| *max-width*  | a partir de 1520px |
| *gutter*     | 40px               |
| *columns*    | 12                 |
| *margin*     | 40px               |
| *breakpoint* | *TV*               |

- Para comportamento fluido o valor sempre será 100%;
- Margem mínima no comportamento fixo.

![Grid 12 colunas](imagens/grid-12colunas.png)
*Exemplo de grid de 12 colunas para TV.*

---

## Comportamentos

### 1. Largura

Existem dois tipos de largura para as *grids*: *Fixa* e *Fluida*.

#### Largura Fixa

As colunas e as medianizes possuem largura fixa. Porém a largura das *margens são variadas* de acordo com a resolução da tela, ou seja, o conteúdo se mantém centralizado da tela em uma largura máxima (`max-width`) fixa.

**Atenção:** mesmo com os valores da margem variando, existe um valor mínimo que deve ser respeitado. Essa margem mínima funciona como uma área de segurança para que o conteúdo não fique totalmente "colado" no limite do dispositivo ou do navegador.

![Grid Fixa 01](imagens/behavior-fixa01.png)
*Grid Fixa - Exemplo 1*

![Grid Fixa 02](imagens/behavior-fixa02.png)
*Grid Fixa - Exemplo 2*

#### Largura Fluida

Tanto as margens como as medianizes possuem largura fixa, porém a largura das **colunas variam**, dimensionando também o conteúdo. Neste caso, a *grid* ocupa todo o espaço disponível da tela (`max-width` de 100%).

![Grid Fluida 01](imagens/behavior-fluida01.png)
*Grid Fluida - Exemplo 1*

![Grid Fluida 02](imagens/behavior-fluida02.png)
*Grid Fluida - Exemplo 2*

#### *Max-Width*

`Max-width` mede a distância entre o início da primeira coluna da *grid* até o final da última coluna. Em outras palavras, é o tamanho da largura da *grid* sem os elementos de margem.

![Max-Width](imagens/maxwidth.png)
*Max-width* é o local onde está localizado todo o conteúdo principal da interface.\*

### 2. Sangria na *Grid* (*Bleed*)

As margens são o espaço de segurança entre o conteúdo e as bordas direita e esquerda de uma tela. Por padrão, os elementos dentro da *grid* nunca devem ultrapassar as margens. Porém, alguns componentes podem ter elementos que quebram essa regra e ocupam o espaço da margem, é o que chamamos de sangria na *grid*.

Quando a sangria na *grid* acontece, a largura do *box/container* do elemento deve ocupar todo o espaço da margem enquanto o conteúdo informativo permanece dentro das colunas.

**Atenção:** somente elementos com funções visuais podem utilizar a sangria (como um *container/background*, por exemplo). **Os conteúdos informativos devem respeitar as margens da grid**.

**Observação:** objetos podem "sangrar" invadindo espaços de outros elementos. Neste caso, veja as regras em *Fundamento > Espaçamento*. As regras de sangria de *grid* só funcionam em *grids* e em elementos que estão inseridos nela. Elementos flutuantes, por exemplo, não utilizam a *grid*.

![Com sangria](imagens/sangria.png)
*Exemplo de grid contendo elementos com sangria.*

![Sem sangria](imagens/semsangria.png)
*Exemplo de grid sem elementos com sangria.*

### 3. Responsividade

Responsividade é a forma como se estrutura a interface em diferentes resoluções de tela. O Design System define diferentes *grids* e *breakpoints* para facilitar a aplicação deste conceito de forma prática. Porém, posicionar os elementos dentro de um *grid* não significa que o seu *layout* esteja responsivo. Entender como os elementos interagem com a *grid* responsiva é uma etapa muito importante para promover uma experiência adequada ao usuário em diferentes dispositivos ou situações.

Pontos importantes quando tratamos de responsividade:

1. **Breakpoint Vs Dispositivo**: apesar de ser uma correlação, o uso de uma determinada resolução não significa que o usuário esteja com o dispositivo X ou Y. Eventualmente pode ter sido alterado o espaço útil do navegador em um *desktop* ou apenas o modo paisagem/retrato em um *tablet* (girando o dispositivo). A interface deve funcionar independentemente do dispositivo; principalmente os elementos interativos (seja por toque ou clique).
2. **Navegação**: a navegação deve ser revista em cada *breakpoint* utilizado. Baixas resoluções muitas vezes requerem uma área de interação ou textos maiores. Componentes voltados à navegação devem ser sempre validados.
3. **Clique Vs Toque**: em resoluções mais baixas o uso de interação por toque é mais comum e o contrário também é verdade. Trabalhe melhor essa questão quando adaptar o *layout* a diferentes *grids*. Utilize o ponto forte de cada interação, como uso de "gestos" para criar interfaces voltadas ao toque, por exemplo. Não esqueça que focar em um modo de interação não significa esquecer o outro.
4. **Testar**: a melhor maneira de garantir uma boa experiência é testando a interface na maior quantidade possível de cenários diferentes. Realize uma bateria de testes considerando todos os cenários levantados anteriormente. Valide sua interface a cada *breakpoint*.

#### Entendendo uma *grid* responsiva

Antes de entender os elementos dentro da *grid*, é importante definir o tipo de comportamento utilizado na sua largura: *grid* fixa ou *grid* fluida?

Em uma *grid* fixa é mais simples de trabalhar, pois os elementos não sofrem alterações com a resolução da tela. A única preocupação será com os *breakpoints*.

![Grid Fixa](imagens/gridres-fixa.png)
*Não há alteração nos elementos dos exemplos 1 e 2 na mudança de resolução de uma grid fixa.*

A *grid* fluida é mais complexa, pois, além dos *breakpoints*, deve-se entender como os elementos interagem com as colunas da *grid* (se é *adaptativo* ou *estável*).

![Grid Fluida](imagens/gridres-fluida.png)
*Na grid fluida os elementos tiveram seu posicionamento e dimensões alterados com a mudança de resolução.*

**Observação:** na *grid* fixa ainda existe o conceito adaptativo e estável porém, como a largura das suas colunas são fixas, o controle é muito mais simples.

##### Elemento Adaptativo e Estável

Assim como a *grid*, as dimensões dos elementos seguem um comportamento bem parecido.

*Largura adaptativa (ou fluida)*: a largura do elemento está atrelada às colunas da *grid*. Ou seja, se a coluna mudar de tamanho, os elementos também terão a dimensão alterada.

![Largura Adaptativa](imagens/gridres-adaptativa.png)
*Alguns elementos estão atrelados a 4 colunas da grid e outras a 2 colunas.*

**Largura estável (ou fixa):** o elemento está apenas alinhado a *grid*. Independentemente do tamanho da coluna, ele não terá sua dimensão alterada. Porém, pode ser que o elemento não consiga se manter na mesma linha e precise "quebrar a linha" (passado para a linha subsequente. Podendo empilhar e empurrar os demais conteúdos abaixo dele).

![Largura Estável](imagens/gridres-estavel.png)
*No exemplo, os elementos estão apenas alinhados (à esquerda) dentro de uma área de 4 colunas. Caso haja mudança na resolução a largura dos elementos não sofrerá nenhuma alteração.*

As informações acima foram focadas na largura por ser um elemento que pode ser influenciado diretamente pela *grid* responsiva do Design System. Porém, tanto a largura quanto a altura podem ser influenciadas também pelos elementos internos de um componente (utilizando-se dos mesmos conceitos).

Por isso, sempre que criar um componente, tente responder a seguinte pergunta: "Ela interage com a *grid* responsiva e/ou com seus elementos internos ou ela é totalmente fixa?"

É importante entender como funcionam todas as dimensões do componente, tanto a largura como a altura, para repassar ao desenvolvedor.

![Elementos adaptativos e estáveis](imagens/gridres-adaptativofluido.png)
*Um card pode ter altura adaptativa ao conteúdo interno, mas a largura é adaptativa a grid (exemplo 1). É possível também criar um card com dimensões totalmente estáveis (exemplo 2) que não variam nem com conteúdo interno e nem com a grid (independentemente se ela for fluida ou fixa).*

Pode-se haver componentes que possuem comportamentos distintos dependendo da *grid* utilizada.

![Comportamentos do elemento botão](imagens/gridres-button.png)
*Um botão pode ter altura estável e a largura adaptativa ao conteúdo interno em uma grid de 12 colunas (exemplo 1). Porém em uma grid de 4 colunas ele passa a ter sua largura adaptativa a grid (exemplo 2).*

Tenha em mente que, em uma mesma interface, pode existir grupos de elementos estáveis e grupos de elementos adaptativos.

![Exemplo de interface com comportamentos adaptativos e estáveis](imagens/gridres-interface.png)
*Interface com elementos adaptativos e estáveis.*

### 4. Objetos Temporários

Objetos temporários são elementos ou regiões que surgem temporariamente. Podem ser ocultados ou visualizados ao interagir com um item da interface. Podem ser categorizados em *flutuantes* ou *persistentes*.

**Observação**: é importante que o elemento temporário esteja localizado próxima da área de conteúdo (`Max-width`) ou no limite do tamanho mínimo da margem da *grid* principalmente quando utilizadas *grids* fixas que podem possuir margens muito extensas.

#### Flutuantes

Não influenciam ou são influenciados diretamente pela *grid* (independente do comportamento, não sofrem alteração). Porém, para cada tipo de *grid* é importante rever como o elemento flutuante será apresentado na interface.

![Elemento Flutuante](imagens/temp-flutuante.png)
*Quando visível, o menu de navegação flutuante não afeta a grid e nem os conteúdos da interface.*

#### Persistentes

São regiões que "empurram" ou "puxam" o conteúdo e/ou a *grid* quando aparecem ou desaparecem respectivamente.

![Elemento Persistente](imagens/temp-persistente.png)
*Quando visível, o menu de navegação persistente comprime a grid (e seu conteúdo).*
