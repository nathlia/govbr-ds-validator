<!--
URL: https://www.gov.br/ds/components/datetimepicker?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/datetimepicker/datetimepicker-access.md
Status da coleta: ok
-->

# *DateTimePicker* (Calendário e Horas)

*DateTimePicker* é um componente que auxilia o usuário na seleção de uma data a partir de um calendário e/ou uma hora a partir de um seletor de horas.

# Acessibilidade no DateTimePicker

## Navegação e Comportamento

- O *dateTimePicker* deve ser operável com teclado, permitindo que os usuários selecionem uma data sem precisar usar o *mouse*;

- A navegação por teclado deve ser fácil e intuitiva, se possível utilize atalhos para selecionar uma data específica ou avançar e retroceder pelos meses e anos;

- A caixa seletora de data deve ser acionada por meio da tecla `Enter` e recolhida por meio da tecla `Esc`;

- Os elementos interativos devem ser acessados por meio da tecla `Tab`, seguindo uma ordem de tabulação que faça sentido para o usuário;

- Forneça *feedback* aos usuários que navegam pelo teclado de forma que saibam o que está acontecendo.

## Recomendações para Estilo e Design

- Disponibilize um rótulo claro e descritivo para o *dateTimePicker*, permitindo que os usuários entendam o propósito do controle;

- Certifique-se de seguir as recomendações de cores na diretriz do componente, garantindo a qualidade de contraste e legibilidade para usuários com baixa visão;

- Em dispositivos móveis, certifique-se de usar uma área mínima de toque de `44px` para os elementos interativos.

## Recomendações para Código

- Recomenda-se utilizar a *tag* semântica `<input type="date">` ou `<input type="text">` como alternativa;

- A rotulagem no código deve oferecer uma verbalização completa da data para os usuários que utilizam leitores de tela. Por exemplo: `Sábado, 5 de agosto de 2023`, ao invés de apenas `5`;

- É importante configurar corretamente o *dateTimePicker* com o formato padrão de data coerente à localidade dos usuários, oferecendo um contexto claro e evitando confusões.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Material Design](https://m3.material.io/components/date-pickers/accessibility)
- [Carbon Design System](https://carbondesignsystem.com/components/date-picker/accessibility)
