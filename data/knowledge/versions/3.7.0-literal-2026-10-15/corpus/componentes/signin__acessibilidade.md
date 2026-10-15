<!--
URL: https://www.gov.br/ds/components/signin?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/signin/signin-access.md
Status da coleta: ok
-->

# *Sign-in* (Autenticação)

*Sign-in* é um botão que envia um ID de *login* do usuário e senha ao servidor para autenticação e é utilizado para direcionar o usuário a uma área de confirmação de acesso que utiliza dados do usuário previamente cadastrados.

# Acessibilidade no Sign-In

## Navegação e Comportamento

- É recomendado que os botões *sign-in* possam ser acessados via navegação por teclado através da tecla `Tab` e possam ser acionados por meio da tecla `Space` ou `Enter`.

## Recomendações para Estilo e Design

- Verifique o uso das cores em `cor de superfície` e `cor de leitura` no botão *sign-in* se correspondem às recomendadas na diretriz de design, garantindo um contraste de cores adequado para uma boa acessibilidade;

- Quando utilizar botões *sign-in* com apenas ícones, certifique-se de exibir a informação do rótulo através de um *tooltip*, ao passar o mouse ou focar nele;

- Em dispositivos mobile utilize ícones fortemente semânticos, aqueles que tragam um entendimento imediato aos usuários. Como estes dispositivos não possuem o recurso de *tooltip* com uso do *hover*, o uso de ícones mais conhecidos pode amenizar esta limitação;

- Em dispositivos mobile certifique-se de projetar a interface com elementos interativos que possuam área mínima de toque de `44px`.

## Recomendações para Código

- Recomenda-se utilizar a *tag* `<button>` como marcação semântica para construção do componente *sign-in*, apesar de existirem alternativas como `<a>` ou `<input type="button">`;

- Mantenha **sempre** habilitado o estado foco na configuração do navegador para os elementos focados exibirem os recursos visuais próprios do estado;

- Caso seja utilizado um ícone decorativo, aquele que é usado como apoio ao lado rótulo do botão *sign-in*, utilize `aria-hidden=true` e não utilize atributo `title`, evitando que os leitores de tela leiam duas vezes a mesma informação;

- Ao utilizar botões *sign-in* com apenas ícones, certifique-se de usar os atributos `title` ou `aria-label`;

- Caso sejam utilizados *links* `<a>` com formato de botão, recomenda-se configurá-los para aceitar a tecla `Space` como acionadora, visto que os *links* são ativados por padrão pela tecla `Enter`.

## Referências

- [Guia WCAG](https://guia-wcag.com/)
- [Mayflower Design System](https://mayflower.digital.mass.gov/core/index.html?path=/docs/elements-buttons--button-primary)
- [Carbon Design System](https://carbondesignsystem.com/components/button/accessibility)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
