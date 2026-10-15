<!--
URL: https://www.gov.br/ds/components/table?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/table/table-access.md
Status da coleta: ok
-->

# *Table* (Tabela)

A *Table* (Tabela) é um conjunto de dados organizados em linhas e colunas.

# Acessibilidade no Table

## Navegação e Comportamento

- A navegação deve seguir de célula em célula do componente *table*, começando pela primeira célula na coluna à esquerda e na linha do topo, e seguindo para a próxima célula à direita até alcançar a última célula na coluna à direita. Em seguida, deve passar para a próxima linha e repetir o mesmo processo;

- Quando houver controles interativos dentro das células do *table*, garanta que entrem no fluxo de navegação seguindo a ordem da tabulação;

- Para percorrer a navegação no *table* via teclado, utilize a tecla `Tab`;

- Quando houver caixas de seleção com foco dentro das células do *table*, a navegação pode ser feita por meio das teclas direcionais no teclado `arrow keys` (para cima ou para baixo);

- Os controles interativos devem ser acionados a partir das teclas `Enter` ou `Space`.

## Recomendações para Estilo e Design

- É importante que os *tables* sejam projetados de forma acessível, o que significa que devem possuir cabeçalho de linha e colunas claramente identificáveis, rótulos de célula claros e navegação por teclado consistente;

- Evite o uso de colunas com células vazias;

- Utilize o ícone com a indicação `sort` nas colunas que tenham controle de ordenação. Se a coluna já foi ordenada, utilize os ícones com as indicações correspondentes à ordem em que ela se encontra (`sort-up` ou `sort-down`);

- Sempre que uma ordenação for realizada, apresente a coluna selecionada com o estado ativo e com ícone visível.

## Recomendações para Código

- **Sempre** utilize a estrutura de *tags* semânticas para o *table* (`<table>`, `<thead>`, `<tbody>`, `<th>`, `<tr>`, `<td>`). Isso auxilia na identificação das informações pelos leitores de tela;

- Forneça informações suficientes sobre os controles interativos, por meio dos atributos `title` ou `aria-label`, para que os usuários de leitores de tela possam entender e interagir com eles;

- Utilize o atributo `aria-sort` nos controles de ordenação de colunas.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/data-table/accessibility)
