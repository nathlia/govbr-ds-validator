<!--
URL: https://www.gov.br/ds/components/magicbutton?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/magicbutton/magicbutton-access.md
Status da coleta: ok
-->

# *Magic Button* (Botão Destaque)

O componente *Magic Button* é um botão com grande apelo visual.

# Acessibilidade no Magic Button

## Navegação e Comportamento

- O *magic button* deve ser acessado via navegação por teclado por meio da tecla `Tab` e acionado por meio da tecla `Space` ou `Enter`.

## Recomendações para Estilo e Design

- Verifique se o uso das cores em `cor de superfície` e `cor de leitura` no *magic button* correspondem às recomendadas na diretriz de design, garantindo um contraste adequado para uma boa acessibilidade;

- Quando utilizar o *magic button* com apenas ícones, certifique-se de exibir a informação do rótulo através de um `Tooltip` ao passar o mouse ou focar no botão;

- Em dispositivos móveis utilize ícones fortemente semânticos, isto é, que tragam um entendimento imediato para os usuários. Como estes dispositivos não possuem o recurso de `Tooltip` com uso do `hover`, a escolha de ícones conhecidos pode amenizar esta limitação;

- Em dispositivos mobile certifique-se de projetar a interface com elementos interativos que possuam área mínima de toque de `44px`.

## Recomendações para Código

- É recomendável utilizar a tag `<button>` como marcação semântica para construção do componente, apesar de existirem alternativas como `<a>` ou `<input type="button">`;

- Mantenha **sempre** habilitado o estado foco na configuração do navegador, para os elementos focados exibirem os recursos visuais próprios do estado;

- Caso haja ícone decorativo - aquele que funciona como apoio ao lado rótulo do botão - utilize `aria-hidden = true` e não utilize atributo `title`, para evitar que os leitores de tela leiam duas vezes a mesma informação;

- Ao utilizar o *magic button* com apenas ícones, certifique-se de usar os atributos `title` ou `aria-label`;

- Caso seja utilizado link com formato do *magic button*, recomenda-se configurá-lo para aceitar a tecla `Space` como acionadora, visto que os links são ativados por padrão pela tecla `Enter`;

- Para o *magic button* com ação de alternância, utilize `aria-pressed` alternando seu valor entre `true` e `false` ou alternância de rótulo com texto que seja significativo para o entendimento do usuário (por exemplo: Expandir / Retrair).

## Referências

- [Guia WCAG](https://guia-wcag.com/)
- [Mayflower Design System](https://mayflower.digital.mass.gov/core/index.html?path=/docs/elements-buttons--button-primary)
- [Carbon Design System](https://carbondesignsystem.com/components/button/accessibility)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
