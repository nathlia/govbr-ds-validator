<!--
URL: https://www.gov.br/ds/components/switch?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/switch/switch-access.md
Status da coleta: ok
-->

# *Switch* (Controle Interruptor)

*Switches* são controles usados para alternar rapidamente entre dois estados possíveis. São usados ​​apenas para ações binárias que ocorrem imediatamente após o usuário “girar” o botão de alternância. São comumente usados ​​para interruptores “liga/desliga”.

# Acessibilidade no Switch

## Navegação e Comportamento

- Os usuários devem poder acessar o *switch* por meio da tecla `Tab` e alternar seu estado (ligado/desligado) por meio das teclas `Space` ou `Enter`;

- Para que usuários com deficiência visual possam entender completamente a opção selecionada, os leitores de tela devem anunciar o rótulo descritivo e o estado atual do *switch*.

## Recomendações para Estilo e Design

- O *switch* deve ter um rótulo claro e de fácil entendimento, que explica seu propósito;

- Forneça indicação visual de foco conforme a recomendação na diretriz de estados. Isto ajuda os usuários que navegam com o teclado perceber claramente o *switch* selecionado;

- Forneça *feedback* visual e/ou auditivo indicando qual é o estado atual da opção selecionada. Observe as indicações de cores de estado na diretriz do componente;

- Ofereça uma área ampla o suficiente para que os usuários possam clicar ou tocar facilmente, mesmo para aqueles com deficiência motora.

## Recomendações para Código

- Utilize o atributo `aria-label` ou forneça um rótulo associado através da *tag* `<label>` e o atributo `for`;

- Quando ativado, o elemento *switch* deve ter o atributo `aria-checked` definido como `true` e quando desativado, o atributo `aria-checked` definido como `false`;

- Se o *switch* for um elemento HTML do tipo `<input type="checkbox">` ou `<input type="radio">`, recomenda-se usar o atributo `checked` em vez da propriedade `aria-checked`.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/toggle/accessibility)
- [Material Design System](https://m3.material.io/components/switch/accessibility)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/switch/)
