<!--
URL: https://www.gov.br/ds/components/menu?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/menu/menu-access.md
Status da coleta: ok
-->

# Menu de Navegação

Os menus de navegação (ou simplesmente menus) são listas de categorias de conteúdo ou recursos, normalmente apresentados como um conjunto de *links* ou ícones agrupados com um estilo visual diferente do resto do *design*.

# Acessibilidade no Menu

## Navegação e Comportamento

- O componente menu pode ser acionado pelo elemento gatilho utilizando a tecla `Enter` ou `Space`;

- Para fechar o menu, utilize a tecla `Esc`;

- O usuário deve conseguir navegar pelos itens do menu usando as teclas `Tab` e `Shift + Tab` para retroceder a navegação ou, como alternativa, também podem ser utilizadas as teclas direcionais `arrowUp` e `arrowDown`;

- Após abertura do menu, o foco deve cair imediatamente sobre o botão fechar, se houver. Isso auxilia o usuário, caso ele queira desistir da navegação pelos itens do menu;

- Os itens interativos ou agrupadores com itens filhos, podem ser acionados pelas teclas `Enter` ou `Space`.

## Recomendações para Estilo e Design

- Utilize rótulos claros e objetivos para os textos nos itens do menu. Evite textos longos e jargões técnicos. O objetivo é trazer um entendimento fácil e de forma rápida para o usuário sobre os tópicos abordados;

- Utilize o padrão de cores corretamente, conforme especificado na diretriz do componente. Isto garante o contraste adequado para leitura com acessibilidade dentro do padrão;

- Certifique-se de consultar a diretriz de estados e usá-los corretamente nos itens do menu. Como por exemplo: `hover`, `ativo`, `foco`, entre outros. O feedback visual é muito importante para todos os usuários durante a interação com o menu.

## Recomendações para Código

- Para a construção do menu, é recomendável utilizar a tag semântica `<nav>`, e as tags de lista `<ul>`, `<li>` para os itens internos.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/overflow-menu/accessibility)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)
