<!--
URL: https://www.gov.br/ds/components/checkbox?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/checkbox/checkbox-access.md
Status da coleta: ok
-->

# *Checkbox* (Caixa de Seleção)

O componente *checkbox* permite selecionar uma ou mais opções em uma lista de opções.

# Acessibilidade no Checkbox

## Navegação e Comportamento

- O *checkboxes* devem ser navegáveis pelo teclado através da tecla `Tab` e acionados com a tecla `Space`;

- Para agrupamento de *checkboxes*, utilize, quando possível, uma ordem de tabulação significativa para o usuário. Por exemplo: Segunda, Terça, Quarta, etc.

## Recomendações para Estilo e Design

- O *checkbox* deve ter um rótulo associado que explique seu objetivo e esteja claramente vinculado a ele;

- Quando houver mudança de estado no *checkbox*, ofereça **sempre** *feedback* de *status* claro e audível para o usuário;

- Esteja atendo às recomendações na diretriz de design quanto ao uso das cores para este elemento, garantindo um contraste de cor suficiente para serem facilmente lidos por pessoas com dificuldade de visão;

- Em caso de agrupamento de *checkboxes* utilize um rótulo para o grupo, tornado claro o propósito do agrupamento e para identificação pelo leitor de tela.

## Recomendações para Código

- Sempre que possível, recomenda-se utilizar o elemento `<input>` com o atributo `type="checkbox"`, para garantir uma boa semântica;

- Caso contrário, recomenda-se usar os recursos do `aria-checked` com os valores `true`, `false` ou `mixed` para definir os estados do *checkbox*.

## Referências

- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/checkbox/accessibility/)
- [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-checked)
