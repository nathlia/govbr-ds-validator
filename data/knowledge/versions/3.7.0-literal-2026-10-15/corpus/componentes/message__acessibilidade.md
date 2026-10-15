<!--
URL: https://www.gov.br/ds/components/message?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/message/message-access.md
Status da coleta: ok
-->

# *Message* (Mensagem)

O *Message* (Mensagem) é um Componente de Interface que tem como finalidade proporcionar *feedback* ao usuário sobre o que ocorre no sistema.

# Acessibilidade no Message

## Navegação e Comportamento

- Ao exibir uma mensagem de *feedback* em resposta à ação do usuário, permita que o leitor de tela leia imediatamente a mensagem;

- No momento da exibição da mensagem, o foco do navegador deve estar sobre o botão fechar, quando houver. Isto permite que o usuário possa sair da mensagem e voltar ao fluxo de navegação original;

- É importante que após o fechamento da mensagem, o foco do navegador volte ao local original no fluxo de navegação.

## Recomendações para Estilo e Design

- Use uma linguagem clara e compreensível para seu público. Evite jargões ou textos complexos;

- Use as cores semânticas recomendadas para cada tipo de mensagem: informação, sucesso, alerta e erro. Isto ajuda a garantir os padrões de acessibilidade;

- Lembre-se que o uso de cores semânticas não atende a todos os públicos, sempre forneça uma alternativa para usuários de leitores de tela;

- Ao exibir uma mensagem, pode ser útil disparar um som de alerta característico. Isto ajuda os usuários de tecnologias assistivas a identificar que houve um *feedback* do sistema antes da mensagem ser lida;

- Evite projetar mensagens que desapareçam automaticamente. Uma mensagem que some rapidamente pode passar despercebida pelo usuário;

- Outro ponto de atenção é a frequência de interrupção causada pelas mensagens. Interrupções frequentes podem inibir a usabilidade, principalmente para pessoas com deficiência cognitiva e visual.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)
