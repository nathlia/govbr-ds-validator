<!--
URL: https://www.gov.br/ds/components/loading?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/loading/loading-access.md
Status da coleta: ok
-->

# *Loading*

São indicadores de progresso que expressam um tempo de espera não especificado ou exibem a duração de um processo.

# Acessibilidade no Loading

## Recomendações para Estilo e Design

- Forneça um texto alternativo descritivo para explicar o que está acontecendo na página durante a exibição do *loading*. Esta prática auxilia os usuários que possuem alguma deficiência visual;

- Outra alternativa é fornecer *feedback* sonoro para atender usuários com deficiência visual. Neste caso, é recomendado também manter a alternativa descritiva textual para atender usuários com deficiência auditiva;

- É importante deixar claro para os usuários a indicação do progresso do *loading*, seja de forma visual, textual ou sonora. A indicação pode exibir uma informação referente ao percentual, etapas ou passos do progresso;

- Evite tempos de espera excessivos. Caso o *loading* apresente um tempo de espera muito longo, forneça ao usuário opções para cancelar o processamento e retornar à tarefa anterior;

- Evite utilizar animações com variações intensas de cores ou flashes durante o uso do *loading*. Isso pode prejudicar usuários que possuem alguma sensibilidade a esses estímulos, causando problemas de epilepsia, por exemplo;

- Forneça aos usuários, por meio de tecnologias assistivas, a informação sobre a conclusão do processamento do *loading*.

## Recomendações para Código

- Utilize o atributo `title` no ícone `<svg>` do *loading*, fornecendo sua descrição. Por exemplo: "Carregando";

- Caso utilize imagens (gif, jpg, ...) para o ícone de *loading*, use o atributo `alt` para descrição, podendo acrescentar o atributo `title` com um texto de ajuda adicional para a imagem;

- É possível utilizar `aria-live` com valor `assertive` para fornecer o status de carregamento para tecnologias assistivas;

- Uma mensagem de status, como “carregamento completo”, pode ser colocada na seção `aria-live` ou por meio do atributo `role = "status"`.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/loading/accessibility)
- [Material Design System](https://m3.material.io/components/progress-indicators/accessibility)
