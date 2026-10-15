<!--
URL: https://www.gov.br/ds/components/modal?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/modal/modal-access.md
Status da coleta: ok
-->

# *Modal* (Janela de Exibição)

Modal é uma janela que exibe um conteúdo adicional em uma camada acima da página atual, com uma sobreposição de superfície (*overlay*) cobrindo a página e tornando-a temporariamente inacessível.

# Acessibilidade no Modal

## Navegação e Comportamento

- Ao acionar uma janela *modal* ou de diálogo, informe os usuários de leitores de tela qual o propósito da mesma;

- Os usuários devem ser capazes de navegar facilmente pela janela *modal*, por meio da tecla `Tab` ou `Shift + Tab` para retroceder na navegação;

- Após aberta, o fluxo de navegação deve percorrer apenas os elementos da janela *modal*, não passando por outros elementos da tela até que a *modal* seja fechada;

- O foco inicial na *modal* depende do tipo: se for uma janela apenas com conteúdo informativo o foco deve ir inicialmente no `botão fechar`. Caso seja uma janela em que haja uma ação do usuário, o foco deve estar no `botão de ação primária`. Caso seja uma janela com uma ação destrutiva, o `botão de ação secundária` assume o foco inicial (cancelar, por exemplo);

- A janela *modal* pode ser fechada após o usuário finalizar seu propósito, utilizando as teclas `Enter` ou `Space` nos controles interativos (como por exemplo: cancelar ou salvar), ou através da tecla `Esc`;

- É importante oferecer ao usuário a opção do botão `Fechar` e o fluxo de navegação deve passar por ele;

- Ao fechar a janela *modal*, o foco deve retornar ao último elemento focado na tela. Esta prática auxilia o usuário seguir o fluxo de navegação que vinha percorrendo, evitando se perder.

## Recomendações para Estilo e Design

- Identifique claramente a janela *modal* por meio de um título ou descrição;

- O conteúdo dentro da janela *modal* também deve ser acessível, incluindo rótulos claros, descrições de ajuda para os elementos interativos além de descrições informativas para imagens;

- As janelas *modais* devem ser usadas ​​com moderação, fornecendo apenas informações críticas. Outras informações menos críticas devem ser apresentadas na tela. Esta prática evita poluir o fluxo de navegação do usuário, com vários impedimentos para abertura de janelas de diálogo;

- Utilize o recurso de *overlay* por trás da janela *modal*, quando o objetivo for restringir o acesso do usuário apenas ao conteúdo da janela.

## Recomendações para Código

- A janela *modal* pode ser rotulada pelo atributo `aria-label`, usando a mesma *string* do título;

- Ao utilizar o recurso de `arial-modal` como `true`, pode impedir que os usuários de tecnologias assistivas sejam impedidos de acessar o conteúdo de fora da *modal*, quando esta estiver aberta. Portanto, faça isso apenas quando o objetivo for realmente este e a experiência seja a mesma para todos os tipos de usuários.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Material Design](https://m3.material.io/components/date-pickers/accessibility)
- [Carbon Design System](https://carbondesignsystem.com/components/date-picker/accessibility)
- [Acessibilidade Digital - UFRGS](https://www.ufrgs.br/acessibilidadedigital/modais-com-acessibilidade/)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
