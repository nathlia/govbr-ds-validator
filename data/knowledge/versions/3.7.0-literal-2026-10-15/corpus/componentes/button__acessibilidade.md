<!--
URL: https://www.gov.br/ds/components/button?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/button/button-access.md
Status da coleta: ok
-->

# *Button* (Botão)

Os botões são elementos interativos da interface, que permitem que os usuários acessem funcionalidades, executem ações ou naveguem pela interface.

# Acessibilidade no Button

## Navegação e Comportamento

- É recomendado que os botões possam ser acessados via navegação por teclado através da tecla `Tab` e possam ser acionados por meio da tecla `Space` ou `Enter`.

## Recomendações para Estilo e Design

- Verifique o uso das cores em `cor de superfície` e `cor de leitura` no botão se correspondem às recomendadas na diretriz de design, garantindo um contraste adequado para uma boa acessibilidade;

- Quando utilizar botões com apenas ícones, certifique-se de exibir a informação do rótulo através do *tooltip* ao passar o mouse ou focar no botão;

- Em dispositivos mobile utilize ícones fortemente semânticos, aqueles que tragam um entendimento imediato aos usuários. Como estes dispositivos não possuem o recurso de *tooltip* com uso do `hover`, o uso de ícones mais conhecidos pode amenizar esta limitação. Veja algumas recomendações de ícones no [Fundamento Iconografia](/ds/fundamentos-visuais/iconografia);

- Em dispositivos mobile, certifique-se de projetar a interface com elementos interativos que possuam área mínima de toque de `44px`.

## Recomendações para Código

- Recomenda-se utilizar a tag `<button>` como marcação semântica para construção do componente, apesar de existirem alternativas como `<a>` ou `<input type="button">`;

- Mantenha **sempre** habilitado o estado foco na configuração do navegador, para os elementos focados exibirem os recursos visuais próprios do estado;

- Caso seja utilizado um ícone decorativo, aquele que é usado como apoio ao lado do rótulo do botão, utilize `aria-hidden=true` e não utilize atributo `title`, evitando que os leitores de tela leiam duas vezes a mesma informação;

- Ao utilizar botões com apenas ícones, certifique-se de usar os atributos `title` ou `aria-label`;

- Caso sejam utilizados links `<a>` com formato de botão, recomenda-se configurá-los para aceitar a tecla `Space` como acionadora, visto que os links são ativados por padrão pela tecla `Enter`;

- Para botões com ações de alternância, utilize `aria-pressed` alternando seu valor entre `true` e `false` ou alternância de rótulo com texto que seja significativo para o entendimento do usuário (por exemplo: Expandir / Retrair).

## Referências

- [Guia WCAG](https://guia-wcag.com/)
- [Mayflower Design System](https://mayflower.digital.mass.gov/core/index.html?path=/docs/elements-buttons--button-primary)
- [Carbon Design System](https://carbondesignsystem.com/components/button/accessibility)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
