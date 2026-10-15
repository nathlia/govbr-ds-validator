<!--
URL: https://www.gov.br/ds/components/footer?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/footer/footer.md
Status da coleta: ok
-->

# *Footer* (Rodapé)

Geralmente localizado na parte inferior das páginas, o *footer* (rodapé) pode ser organizado de formas distintas. Normalmente essa organização é definida através da combinação de elementos que reforçam a identidade visual com o conteúdo a ser informado, respeitando os objetivos de negócio e as necessidades do usuário.

## Uso

![Exemplo do componente footer.](imagens/footer-type-standard.png)
*Exemplo do componente footer*

O *footer*, deve ser utilizado como um elemento de "fechamento" de conteúdo de página, ajudando o usuário em sua localização e, em muitos casos, auxiliando-o com serviços úteis e informações complementares.

Seu *layout* pode variar em seu conteúdo, cor e forma dependendo da necessidade do projeto ou do padrão da *grid* ao qual o *footer* deverá se adequar.

---

## Tom e voz

O *footer* deve apresentar um padrão organizacional com *layout* consistente, previsível e facilmente detectável em todas as páginas do projeto.

---

## Anatomia

O *footer* é composto por vários elementos visuais e componentes organizados em espaços determinados. É importante notar que **os elementos se repetem nas versões e variações do footer**, podendo assumir outras formas dependendo do tipo escolhido ou da resolução da tela.

A seguir, apresentamos os elementos e componentes mais utilizados no *footer*:

| ID  | Nome                          |                          Referência                           | Uso         |
| --- | ----------------------------- | :-----------------------------------------------------------: | ----------- |
| 1   | Área de Logo                  |                              ---                              | Opcional    |
| 2   | Área de Mapa do Site          |                              ---                              | Opcional    |
| 3   | Componente *List*             |      [Componente List](/ds/components/list?tab=designer)      | Opcional    |
| 4   | Ícone "expandir"              | [Fundamento Iconografia](/ds/fundamentos-visuais/iconografia) | Opcional    |
| 5   | Ícone "retrair"               | [Fundamento Iconografia](/ds/fundamentos-visuais/iconografia) | Opcional    |
| 6   | Título do Conteúdo Secundário |  [Fundamento Tipografia](/ds/fundamentos-visuais/tipografia)  | Opcional    |
| 7   | Conteúdo Secundário           |                              ---                              | Opcional    |
| 8   | Logo assinatura               |                              ---                              | Opcional    |
| 9   | Área de Informação Legal      |                              ---                              | Opcional    |
| 10  | Conteúdo informação legal     |  [Fundamento Tipografia](/ds/fundamentos-visuais/tipografia)  | Opcional    |
| 11  | Destaque do conteúdo          |  [Fundamento Tipografia](/ds/fundamentos-visuais/tipografia)  | Opcional    |
| 12  | *container* do *footer*       |  [Fundamento Superfície](/ds/fundamentos-visuais/superficie)  | Obrigatório |
| 13  | Componente *divider*          |   [Componente Divider](/ds/components/divider?tab=designer)   | Condicional |

![Anatomia do componente footer em grid de doze colunas.](imagens/footer-anatomy-1.png)
*Anatomia do componente footer em grid de 12 colunas*

![Anatomia do componente footer em grid de oito colunas.](imagens/footer-anatomy-2.png)
*Anatomia do componente footer em grid de 8 colunas*

![Anatomia do componente footer em grid de quatro colunas.](imagens/footer-anatomy-3.png)
*Anatomia do componente footer em grid de 4 colunas*

**Atenção:** em caso de necessidade de inserção de novos componentes, a equipe de design responsável pelo *Design System* deverá ser contactada para a realização de um estudo preliminar.

---

### Detalhamento dos Itens

O *footer* é organizado em quatro grandes áreas compostas por vários elementos. Neste tópico, exploraremos cada uma dessas áreas e seus respectivos elementos com mais detalhes:

![Detalhamento das áreas do componente footer.](imagens/footer-structure.png)
*Detalhamento das áreas do componente footer*

#### 1. Área de Logo

Esta área destina-se à inserção do logo do sistema ou portal, observando as alturas e larguras mínimas e máximas definidas nas Especificações.

![Área logo principal.](imagens/footer-logo.png)
*Área de logo principal*

É permitido o uso de mais de um logo nesta área, desde que sirvam para identificar a solução em uso pelo usuário. Logotipos que não cumpram essa finalidade devem ser aplicados na Área Secundária.

Por padrão, o logo está alinhado à esquerda, mas é possível configurar outros tipos de alinhamento.

#### 2, 3, 4, e 5. Área de Mapa do *Site*

O mapa do *site* é formado pela junção de vários componentes *list*. Cada *list* deverá se adaptar a todos os tipos de *grid*, respeitando as definições de espaçamento e alinhamento propostos, mantendo uma melhor organização quanto à responsividade.

**Atenção:** caso o mapa do *site* apresentado esteja muito extenso, correndo o risco de se tornar pesado e difícil de usar, será necessária a criação de um mapa completo do *site* em uma página separada e vinculá-lo ao *footer*, que é geralmente onde os usuários esperam encontrar essa informação.

![Exemplo de list usada de duas em duas colunas.](imagens/footer-sitemap.png)
*Exemplo de list usada de 2 em 2 colunas*

**Atenção:** o componente *list*, em todos os itens que o compõe, possui a altura definida como comportamento de densidade.

##### Mapa do *Site* - adição de novas *Lists*

Sempre que houver a necessidade de adicionar novas *lists*, estas deverão ser organizadas abaixo mantendo as especificações de colunas e de espaçamento já definidas nos *tokens*.

![Exemplo de adição de novas lists no footer.](imagens/footer-add-sitemap.png)
*Exemplo de adição de novas lists no footer*

##### Comportamento de expansão de *list*

O mapa do *site* quando utilizados em *layouts* com 4 e 8 colunas deve ser apresentado como *lists* no "comportamento *list* expandir", devida à limitação de espaço.

Para o *footer* o "comportamento *list* expandir" transforma as categorias das *lists* expansíveis com ação [*collapse*](/ds/padroes/design/collapse). Cada categoria da *list*, quando acionada, apresentará em seu interior os itens da *list* que a compõe.

Por definição, só deve ser apresentada uma *list* por vez, ou seja, quando uma categoria com seus itens estiver aberta, automaticamente as outras deverão permanecer fechadas.

![Exemplo do comportamento expandir footer em grid de quatro e oito colunas.](imagens/footer-expand-list.png)
*Exemplo do comportamento expandir em footer de 4 e 8 colunas*

#### 6, 7 e 8. Área de Informações Secundárias

É formada pela junção das informações referentes às redes sociais e às marcas utilizadas como assinaturas.

![Exemplo de áreas secundárias.](imagens/footer-second_inform.png)
*Exemplos de áreas secundárias*

##### Redes Sociais

Esta área fornece botões secundários de acesso rápido às redes sociais.

##### Logo Assinatura

Área destinada à apresentação de logos ou siglas que integrem uma empresa ou marcas parceiras que patrocinam ou endossam um evento ou projeto específico.

#### 9, 10 e 11. Área de Informação Legal

Esta área apresenta informações indispensáveis ao sistema ou portal e deve ser utilizado sempre que for necessário.

![Exemplo de áreas de informação legal.](imagens/footer-legal_info.png)
*Exemplos de áreas de informação legal*

*Atenção:* o componente *list* possui documentação com suas próprias especificações, no entanto, houve a necessidade de ajustes de cor para se adequar ao *layout* do componente *footer*. Ver mais detalhes na área de *token*.

#### 13. Componente *Divider*

Os *Dividers* devem ser utilizados para separar o *Footer* do restante do conteudo de uma página e a área de "Logo + Mapa do Site + Secundária" da área de Informação Legal.

Caso essas áreas não estejam sendo utilizadas na interface, esses dividers não precisam ser exibidos.

---

## Comportamentos

### 1. Responsividade

O componente *footer* deve se comportar de forma fluida em relação à resolução de tela utilizada. A tabela a seguir resume as dimensões de *footer* utilizadas referentes à quantidade de *grids*:

Seguem exemplos de *footers* para cada *grid* disponível:

![Exemplo de rodapé simples em grid de doze colunas.](imagens/footer-behavior-responsive-simple-grid-12col.png)
*Rodapé simples em grid de 12 colunas*

![Exemplo de rodapé simples em grid de oito colunas.](imagens/footer-behavior-responsive-simple-grid-8col.png)
*Rodapé simples em grid de 8 colunas*

![Exemplo de rodapé simples em grid de quatro colunas.](imagens/footer-behavior-responsive-simple-grid-4col.png)
*Rodapé simples em grid de 4 colunas*

![Exemplo de rodapé complexo em grid de doze colunas (seis lists).](imagens/footer-behavior-responsive-complex-grid-12col-6lists.png)
*Rodapé complexo em grid de 12 colunas (6 lists)*

![Exemplo de rodapé complexo em grid de doze colunas (doze lists)](imagens/footer-behavior-responsive-complex-grid-12col-12lists.png)
*Rodapé complexo em grid de 12 colunas (12 lists)*

![Exemplo de rodapé complexo em grid de oito colunas.](imagens/footer-behavior-responsive-complex-grid-8col.png)
*Rodapé complexo em grid de 8 colunas*

![Exemplo de rodapé complexo em grid de quatro colunas.](imagens/footer-behavior-responsive-complex-grid-4col.png)
*Rodapé complexo em grid de 12 colunas (4 lists)*

![Exemplo de barra de informação em grid de doze colunas.](imagens/footer-behavior-responsive-simple-info-grid-12col.png)
*Rodapé simples - barra de informação em grid de 12 colunas*

![Exemplo de barra de informação em grid de oito colunas.](imagens/footer-behavior-responsive-simple-info-grid-8col.png)
*Rodapé simples - barra de informação em grid de 8 colunas*

![Exemplo de barra de informação em grid de quatro colunas.](imagens/footer-behavior-responsive-simple-info-grid-4col.png)
*Rodapé simples - barra de informação em grid de 4 colunas*

![Exemplo de barra de informação em grid de doze colunas (seis lists)](imagens/footer-behavior-responsive-complex-info-grid-12col-6lists.png)
*Rodapé complexo - barra de informação em grid de 12 colunas (6 lists)*

![Exemplo de barra de informação em grid de doze colunas (doze lists)](imagens/footer-behavior-responsive-complex-info-grid-12col-12lists.png)
*Rodapé complexo - barra de informação em grid de 12 colunas (12 lists)*

![Exemplo barra de informação em grid de oito colunas.](imagens/footer-behavior-responsive-complex-info-grid-8col.png)
*Rodapé complexo - barra de informação em grid de 8 colunas*

![Exemplo barra de informação em grid de quatro colunas.](imagens/footer-behavior-responsive-complex-info-grid-4col.png)
*Rodapé complexo - barra de informação em grid de 4 colunas*

**Atenção:** mesmo existindo variação na quantidade de *lists* apresentadas para o *footer*, estes deverão se ajustar à disposição de sua respectiva *grid*.

### 2. Fundo Claro e Fundo Escuro

O *footer* pode ser utilizado com dois tipos de superfícies distintas: *Fundo Claro* e *Fundo Escuro*.

![Exemplo de footer utilizando o tema 1.](imagens/footer-behavior-theme1.png)
*Exemplo de footer utilizando o fundo escuro*

![Exemplo de footer utilizando o tema 2.](imagens/footer-behavior-theme2.png)
*Exemplo de footer utilizando o fundo claro*

### 3. *Layout* Fluido

Em alguns casos, conforme a necessidade do projeto ou das regras de negócio, os elementos do *footer* podem apresentar mudanças de alinhamento, afetando desta forma seu *layout*.
Esta organização e composição final deverá sempre respeitar o alinhamento na sua respectiva *grid*.

![Exemplos do comportamento fluido do footer.](imagens/footer-fluidlayout.png)
*Exemplos do comportamento fluido do footer*

---

## Especificações

### Tipografia

| Name                                | Size                        | Weight                     | Outros                      |
| ----------------------------------- | --------------------------- | -------------------------- | --------------------------- |
| Título Redes Sociais                | `-–font-size-scale-up-01`   | `-–font-weight-bold`       | -                           |
| Texto Informações Legais            | `-–font-size-scale-down-01` | `-–font-weight-medium`     | -                           |
| Texto Informações Legais - Destaque | `-–font-size-scale-down-01` | `-–font-weight-extra-bold` | -                           |
| Texto componente list (categoria)   | `-–font-size-scale-down-02` | `--font-weight-semi-bold`  | `text-transform:uppercase;` |
| Texto componente list (itens)       | `--font-size-scale-base`    | `--font-weight-regular`    | -                           |

### Cores

#### *Footer* Fundo Escuro

| Name                                | Property         | Color Token            |
| ----------------------------------- | ---------------- | ---------------------- |
| Logo Principal                      | color            | `--pure-0`             |
| Texto Componente Lista              | color            | `--blue-warm-20`       |
| Container Componente Lista          | background color | `--blue-warm-vivid-90` |
| Ícone Expandir                      | color            | `--blue-warm-20`       |
| Ícone Retrair                       | color            | `--blue-warm-20`       |
| Título Redes Sociais                | color            | `--pure-0`             |
| Container Informações Legais        | background color | `--blue-warm-vivid-90` |
| Logo Assinatura                     | color            | `--pure-0`             |
| Texto Informações Legais            | color            | `--pure-0`             |
| Texto Informações Legais - Destaque | color            | `--pure-0`             |
| Container *Footer*                  | background color | `--blue-warm-vivid-90` |

#### *Footer* Fundo Claro

| Name                                | Property         | Color Token            |
| ----------------------------------- | ---------------- | ---------------------- |
| Logo Principal                      | color            | `--gray-80`            |
| Texto Componente Lista              | color            | `--blue-warm-vivid-70` |
| Container Componente Lista          | background color | `--pure-0`             |
| Ícone Expandir                      | color            | `--blue-warm-vivid-70` |
| Ícone Retrair                       | color            | `--blue-warm-vivid-70` |
| Título Redes Sociais                | color            | `--gray-80`            |
| Container Informações Legais        | background color | `--pure-0`             |
| Logo Assinatura                     | color            | `--gray-80`            |
| Texto Informações Legais            | color            | `--gray-80`            |
| Texto Informações Legais - Destaque | color            | `--gray-80`            |
| Container *Footer*                  | background color | `--pure-0`             |

### Espaçamentos

#### Áreas de Logo, Mapa do Site e Secundária

| Name                          | Padding - Property             |
| ----------------------------- | ------------------------------ |
| Componente Divider            | `0px` / `0px` / `48px` / `0px` |
| Área de Logo                  | `0px` / `0px` / `48px` / `0px` |
| Área de Mapa do Site          | `0px` / `0px` / `48px` / `0px` |
| Área Secundária               | `0px` / `0px` / `48px` / `0px` |
| Título do Conteúdo Secundário | `0px` / `0px` / `0px` / `24px` |
| Conteúdo Secundário           | `16px` entre os elementos      |

#### Área Informação Legal

| Name                     | Padding - Property            |
| ------------------------ | ----------------------------- |
| Componente Divider       | `0px` / `0px` / `0px` / `0px` |
| Texto Informações Legais | alinhamento `centralizado`    |

### Dimensão

#### Dimensões - Sem Informação Legal

| Name                                      | Property                         |
| ----------------------------------------- | -------------------------------- |
| *4 Colunas*                               | *width* / *height*               |
| Componente Divider                        | `480px` /`1px`                   |
| Logo Principal e Assinatura - Tam. Mínimo | `102px` / `variável`             |
| Logo Principal e Assinatura - Tam. Máximo | `180px` / `variável`             |
| Container *Footer*                        | `480px` / `133px`                |
| *8 Colunas*                               | *width* / *height*               |
| Componente Divider                        | `768px` / `1px`                  |
| Logo Principal e Assinatura - Tam. Mínimo | `102px` / `variável`             |
| Logo Principal e Assinatura - Tam. Máximo | `180px` / `variável`             |
| Container Redes Sociais                   | `688px` / `96px`                 |
| Container *Footer*                        | `768px` / `variável (conteúdo)`  |
| *12 Colunas*                              | *width* / *height*               |
| Componente Divider                        | `1280px` / `1px`                 |
| Logo Principal e Assinatura - Tam. Mínimo | `102px` / `variável`             |
| Logo Principal e Assinatura - Tam. Máximo | `180px` / `variável`             |
| Container Redes Sociais                   | `1200px` / `96px`                |
| Container *Footer*                        | `1280px` / `variável (conteúdo)` |

#### Dimensões - Área Informação Legal

| Name                         | Property           |
| ---------------------------- | ------------------ |
| *4 Colunas*                  | *width* / *height* |
| Componente divider           | `480px` / `1px`    |
| Container Informações Legais | `480px` / `48px`   |
| *8 Colunas*                  | *width* / *height* |
| Componente Divider           | `768px` / `1px`    |
| Container Informações Legais | `788px` / `48px`   |
| *12 Colunas*                 | *width* / *height* |
| Componente Divider           | `1280px` / `1px`   |
| Container Informações Legais | `1280px` / `48px`  |
