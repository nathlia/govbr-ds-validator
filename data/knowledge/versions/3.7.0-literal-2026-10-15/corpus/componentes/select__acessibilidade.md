<!--
URL: https://www.gov.br/ds/components/select?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/select/select-access.md
Status da coleta: ok
-->

# *Select* (Campo de Seleção)

O componente *select* permite selecionar itens em uma lista de opções.

# Acessibilidade no Select

## Navegação e Comportamento

- O componente *select* deve ser acessado via navegação por teclado por meio da tecla `Tab`;

- Quando o foco estiver sobre o *select*, o mesmo deve ser acionado e exibir a lista de itens;

- Após aberta a lista de itens, o usuário deve conseguir navegar através dela por meio das teclas de seta `Up` e `Down`;

- Os usuários poderão filtrar a lista de opções digitando a letra inicial da palavra buscada, e navegar da mesma forma através da lista filtrada por meio das teclas de seta `Up` e `Down`;

- Após encontrar o item desejado, o usuário pode selecioná-lo por meio da tecla `Space` ou `Enter`, recolhendo o componente *select* com a opção desejada;

- O *select* pode ser recolhido por meio da tecla `Esc`, sem selecionar qualquer item de opção.

## Recomendações para Estilo e Design

- Disponibilize um rótulo claro e intuitivo para o usuário, permitindo que compreendam o propósito do controle;

- Certifique-se de seguir as recomendações de `cores` e `estados` na diretriz do componente, garantindo a qualidade de contraste e legibilidade para usuários com baixa visão.

## Recomendações para Código

- Associe o *select* a uma *tag* `<label>`. Isso ajuda a garantir que os usuários com leitores de tela possam entender o objetivo deste componente;

- Caso não haja um rótulo visual associado ao *select*, use o atributo `aria-label` para fornecer um nome descritivo com a explicação do propósito;

- O *select* pode ser marcado como obrigatório através do `aria-required="true"`;

- Recomenda-se utilizar um nome acessível na lista de opções, diferente de seu valor, para os usuários de tecnologia assistiva;

- Caso seja necessário, use o atributo `aria-describedby` para vincular a um elemento de ajuda ou instrução e fornecer informações adicionais aos usuários que podem precisar de mais contexto.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/select/accessibility)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
