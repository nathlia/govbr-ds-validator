<!--
URL: https://www.gov.br/ds/components/tooltip?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/tooltip/tooltip-access.md
Status da coleta: ok
-->

# *Tooltip* (Alertas Flutuantes)

São alertas flutuantes que proporcionam ao usuário um *feedback* do sistema, informando sobre algum aspecto da interface que mereça maior atenção.

# Acessibilidade no Tooltip

## Navegação e Comportamento

- Durante a navegação por teclado, *tooltips* aparecem automaticamente quando um elemento gatilho receber foco;

- *Tooltips* não devem receber foco durante a navegação por teclado, pois seu conteúdo será lido pelas tecnologias assistivas no elemento gatilho;

- *Tooltips* desaparecem quando o usuário pressionar a tecla `Esc` ou quando o foco for removido de seu elemento gatilho.

## Recomendações para Estilo e Design

- Use textos claros e objetivos. O objetivo do *tooltip* é trazer uma orientação de ajuda rápida e útil para o usuário;

- O texto de conteúdo do *tooltip* também deve estar presente em seu elemento gatilho para ser lido pelos leitores de tela;

- Recomenda-se colocar *tooltips* apenas em elementos HTML que são focáveis com teclado ou interativos, como *hyperlinks* e campos de formulário;

- Não dependa só do evento `hover` como acionador para seu *tooltip*, isso impossibilitará de serem acionados por usuários de teclado ou usuários mobile.

## Recomendações para Código

- Utilize `aria-labelledby` no elemento gatilho do *tooltip* para fornecer a descrição de ajuda.

## Referências

- [Carbon Design System](https://carbondesignsystem.com/components/tooltip/accessibility/)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
