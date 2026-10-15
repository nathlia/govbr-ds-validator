<!--
URL: https://www.gov.br/ds/components/wizard?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/wizard/wizard-access.md
Status da coleta: ok
-->

# *Wizard* (Assistente)

*Wizard* é um processo passo a passo que permite ao usuário inserir informações em uma ordem prescrita e na qual as etapas subsequentes podem depender das informações inseridas nas etapas anteriores.

# Acessibilidade no Wizard

## Navegação e Comportamento

- Torne o componente *wizard* acessível pelo teclado. Os usuários de tecnologias assistivas devem poder navegar por meio das teclas `Tab` e `Shift + Tab`, para avançar e retroceder na navegação;

- Os controles interativos, como *steps* ou botões de avançar, cancelar e voltar podem ser acionados a partir das teclas `Enter` ou `Space`;

- Forneça dicas de foco quando o usuário estiver interagindo com *wizard* pelo teclado, indicando qual etapa está sendo focada no momento. Isso auxiliará os usuários com deficiências visuais a compreender o fluxo de navegação pelas etapas.

## Recomendações para Estilo e Design

- Garanta que os formulários utilizados no *wizard* sejam acessíveis. Utilize rótulos claros e faça associação entre rótulos e campos de texto. Veja mais informações sobre boas práticas na [Diretriz de Formulários](https://www.gov.br/ds/padroes/design/formulario);

- Forneça *feedback* sonoro e visual informando quando uma etapa for concluída com sucesso ou quando ocorrer um erro. Isso ajuda os usuários com baixa visão a entender o progresso da tarefa.

## Recomendações para Código

- Caso utilize imagens ou ícones no conteúdo do *wizard*, ofereça alternativas de textos de descrição com o atributo `alt`.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
