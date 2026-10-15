<!--
URL: https://www.gov.br/ds/components/skiplink?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/skiplink/skiplink-access.md
Status da coleta: ok
-->

# *Skip Link* (Atalhos Acessíveis)

O componente *skip link* consiste em uma lista de itens que auxiliam os usuários a navegarem por uma página com o auxílio do teclado, sendo extremamente útil ou até mesmo indispensável para aqueles que dependem do teclado para a navegação.

# Acessibilidade no Skip Link

## Navegação e Comportamento

- *Skip link* é fundamental para os usuários que não utilizam o *mouse* para a navegação, portanto, certifique-se de testar seu funcionamento pelo teclado e se os *links* de atalhos estão levando aos destinos corretos;

- O *skip link* deve ser o primeiro elemento a receber o foco na navegação por teclado e deve ser exibido imediatamente para o usuário;

- Por meio da tecla `Tab` o usuário poderá acionar a exibição do *skip link*, assim como navegar pelas suas opções de atalho;

- Para acionar os *links* de atalho, o usuário pode utilizar as teclas `Enter` ou `Space`;

- Utilize a tecla `Esc` para recolher o *skip link*;

- Ao criar teclas de atalho, é importante estar atento ao padrão de combinação de teclas utilizadas nativamente em cada tipo ou versão de navegador.

## Recomendações para Estilo e Design

- O *skip link* deve estar posicionado no topo da página. Esta prática facilita o acesso para usuários de leitores de tela ou teclado e agiliza o fluxo de navegação na busca pelo conteúdo;

- Use uma linguagem descritiva e clara. Evite textos longos ou jargões técnicos. O objetivo é fornecer ao usuário um entendimento rápido e fácil do conteúdo de atalho. Por exemplo: "Pular para o conteúdo principal";

- O *skip link* também precisa estar visível para usuários que navegam com *mouse*, pois pode ser útil para os atalhos de navegação.

## Recomendações para Código

- Os *skip links* são âncoras de navegação que auxiliam os usuários a acessarem diretamente um conteúdo específico na página. Sendo assim, é importante lembrar que toda estrutura da página `HTML` deve ser pensada de forma semântica, usando as marcações recomendadas nas regiões de referência, que serão alvos para os *skip links*. Por exemplo:

  - Use `<header>` para marcação do cabeçalho da página;
  - Use `<nav>` para marcação da seção de navegação principal da página;
  - Use `<main>` para marcação da seção principal do conteúdo da página;
  - Use`<footer>` para marcação do rodapé da página;
  - Para os links do *skip Link* use a *tag* `<a>`, podendo estruturar um conjunto deles em listas de navegação, com *tags* `<nav>`, `<ul>` e `<li>`, por exemplo.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Acessibilidade Digital - UFRGS](https://www.ufrgs.br/acessibilidadedigital/pular-links/)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/)
