<!--
URL: https://www.gov.br/ds/components/breadcrumb?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/breadcrumb/breadcrumb-access.md
Status da coleta: ok
-->

# *Breadcrumb* (Migalhas de Pão)

*Breadcrumb*, *Breadcrumb Navigation* ou *Breadcrumb Trail* (literalmente, navegação por migalhas de pão ou trilha de migalhas de pão, em alusão à história de João e Maria) é um sistema de navegação estrutural usado para proporcionar ao usuário um meio de localização dentro da estrutura de navegação do site ou sistema.

# Acessibilidade no Breadcrumb

## Navegação e Comportamento

- Os elementos interativos do *breadcrumb* devem ser acessados via navegação por teclado. Utilize a tecla `Tab` para avançar na navegação, a tecla `Shift + Tab` para retroceder na navegação e a tecla `Enter` para acionar os itens interativos;

- A navegação por teclado deve percorrer todos os elementos interativos do *breadcrumb*, sejam links ou botões. O último elemento é o texto da página atual e não há navegação nele;

- A navegação por teclado **não** deve percorrer os ícones decorativos `chevron-right`;

- Quando houver truncamento do *breadcrumb*, com o uso do botão `folder-plus`, este deve seguir a ordem do fluxo de tabulação;

- Deixe claro para o usuário que existe a opção de abrir o menu flutuante quando a navegação passar pelo botão `folder-plus`;

- Quando o menu flutuante for acionado por meio da tecla `Enter`, o fluxo de navegação deve percorrer os itens do menu e retornar ao fluxo principal dos elementos do *breadcrumb*.

## Recomendações para Estilo e Design

- O uso do *breadcrumb* atende a um princípio importante da acessibilidade que é a localização, portanto este deve estar visível e bem posicionado no topo da página de forma que possa ser facilmente utilizado por qualquer pessoa;

- A página atual ou último elemento do *breadcrumb*, não deve ser considerado um link, portanto deve possuir a formatação visual correspondente a um texto comum;

- Para textos muito longos utilize o recurso de truncamento, adicionando reticências ao final do texto e o auxílio de um *tooltip* para visualização do texto completo;

- Também utilize o *tooltip* no caso de uso do botão `folder-plus`, responsável por abrir o menu flutuante;

- Em dispositivos mobile, certifique-se de projetar a interface com elementos interativos que possuam área mínima de toque de 44px.

## Recomendações para Código

- Recomenda-se implementar os elementos interativos do *breadcrumb* como itens de lista não ordenada - `<ul>` e `<li>` - para que os leitores de tela possam fornecer mais contexto;

- Utilize o recurso de `aria-label` para identificar os botões `home` e `folder-plus` respectivamente como `Página Inicial` e `Abrir menu flutuante`.

## Referências

- [Carbon Design System](https://carbondesignsystem.com/components/breadcrumb/accessibility)
- [Guia WCAG](https://guia-wcag.com/)
