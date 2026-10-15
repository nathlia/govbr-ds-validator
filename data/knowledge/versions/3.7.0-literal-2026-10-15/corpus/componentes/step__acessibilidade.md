<!--
URL: https://www.gov.br/ds/components/step?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/step/step-access.md
Status da coleta: ok
-->

# *Steps* (Navegação Passo a Passo)

*Steps* são indicadores de etapas e progresso que auxiliam os usuários durante um fluxo de trabalho, seguindo uma sequência lógica linear, aleatória, numeradas ou não.

# Acessibilidade no Step

## Navegação e Comportamento

- Torne o componente *step* acessível pelo teclado. Os usuários de tecnologias assistivas devem conseguir navegar por meio das teclas `Tab` e `Shift + Tab`, para avançar e retroceder na navegação;

- Os controles interativos do componente *step*, podem ser acionados a partir das teclas `Enter` ou `Space`;

- Forneça dicas de foco quando o usuário estiver interagindo com *step* pelo teclado, indicando qual etapa está sendo focada no momento. Isso auxiliará os usuários com deficiências visuais a compreender o fluxo de navegação pelas etapas.

## Recomendações para Estilo e Design

- Forneça *feedback* sonoro e visual informando quando uma etapa for concluída com sucesso ou quando ocorrer um erro. Isso ajuda os usuários com baixa visão a entender o progresso das etapas;

- Use rótulos com descrições claras e objetivas. Isso permite que os usuários entendam o que precisa ser feito em cada passo;

- É importante que as etapas sejam apresentadas em uma ordem lógica, evitando confundir os usuários durante o fluxo das tarefas;

- Certifique-se de seguir as recomendações de cores e contrastes indicados na diretriz do componente *step*. Isso garante a leitura com acessibilidade aceitável pelos padrões da WCAG;

- Evite utilizar o indicador simples como a única de forma interativa de navegação. Sua forma reduzida dificulta a interação do usuário através do *mouse* ou *touch*; Se for o caso, utilize-o apenas como um elemento de apoio para navegação, acompanhado de um elemento de navegação principal;

- Ofereça controles de navegação ao usuário sempre que utilizar o *step simples* e o *step textual*. Estes controles devem fazer parte do componente que os contém e seu funcionamento depende exclusivamente da característica deste componente. Por exemplo: botões para avançar ou voltar na navegação;

- Em caso de *steps* que funcionem em *loop* automático, ofereça ao usuário controles de interação que permitam pausar ou retomar a animação. Por exemplo: botões para *pause* e *play*.

## Recomendações para Código

- Para os *steps* interativos, recomenda-se utilizar a *tag* `<button>`;

- Quando utilizar indicadores sem rótulo, utilize sempre recursos de `aria-labels` no código HTML, trazendo a informação da ação e permitindo a possibilidade de leitores de tela.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
