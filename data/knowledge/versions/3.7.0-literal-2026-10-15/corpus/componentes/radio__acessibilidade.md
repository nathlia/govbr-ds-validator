<!--
URL: https://www.gov.br/ds/components/radio?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/radio/radio-access.md
Status da coleta: ok
-->

# *Radio* (Caixa de Opção)

O componente Radio permite selecionar apenas uma opção em uma lista de opções.

# Acessibilidade no Radio

## Navegação e Comportamento

- *Radio buttons* devem ser navegáveis pelo teclado por meio da tecla `Tab` e acionados com a tecla `Space`.

## Recomendações para Estilo e Design

- *Radio button* devem ter rótulos associados que expliquem seu objetivo e esteja claramente vinculado a eles;

- Quando houver mudança de estado, ofereça **sempre** *feedback* de *status* claro e audível para o usuário;

- Esteja atendo às recomendações na diretriz de design quanto ao uso das cores para este elemento, garantindo um contraste de cor suficiente para serem facilmente lidos por pessoas com baixa visão;

- Em caso de agrupamento de *radio buttons* utilize um rótulo para o grupo, tornado claro o propósito do agrupamento e para identificação pelo leitor de tela.

## Recomendações para Código

- Sempre que possível, é recomendável utilizar o elemento `<input>` com o atributo `type="radio"`, para garantir uma boa semântica;

- Em caso de *radio button* selecionado por padrão, utilize o atributo `checked`;

- Para *radio buttons* com opção de seleção obrigatória, utilize o atributo `required`.

## Referências

- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/radio-button/accessibility)
- [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/radio)
