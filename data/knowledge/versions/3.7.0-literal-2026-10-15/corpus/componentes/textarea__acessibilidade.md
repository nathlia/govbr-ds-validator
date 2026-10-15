<!--
URL: https://www.gov.br/ds/components/textarea?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/textarea/textarea-access.md
Status da coleta: ok
-->

# *Textarea* (Campo de Texto Multilinhas)

O *Textarea* é um campo de entrada de texto que permite que seu aplicativo aceite um valor de texto potencialmente longo do usuário.

# Acessibilidade no Textarea

## Navegação e Comportamento

- *Textareas* devem ser acessíveis por meio de navegação via teclado, por meio da tecla `Tab`;

- Utilize a marcação correta para o estado de foco previsto na diretriz de estados quando o foco estiver ativo no *textarea*;

- Após o *textarea* receber o foco, permita que o usuário possa digitar imediatamente o texto sem necessidade de qualquer outro passo anterior;

- Siga uma ordem lógica para tabulação, focalizando primeiramente o rótulo associado ao *textarea*, depois ícones/botões de informação associados ao rótulo e o *textarea*;

- Por padrão, o usuário deve conseguir navegar entre as palavras do texto digitado com o uso das teclas `Ctrl + left/right` no Windows ou `Option + left/right` no Mac.

## Recomendações para Estilo e Design

- Utilize rótulos (*labels*) claros e descritivos para que o usuário compreenda o propósito do campo de texto;

- Adicione ajuda contextual, fornecendo informações adicionais ou instruções para os usuários entenderem detalhes a respeito do preenchimento do *textarea*. Utilize um texto auxiliar abaixo do *textarea* ou um ícone de informação ao lado do rótulo;

- Para validação em campos de texto, é importante fornecer *feedback* visual imediato quando o usuário preencher o *textarea*. Marque o *textarea* com a cor correspondente ao estado de sucesso, se o usuário preencher corretamente, ou cor correspondente ao estado de erro, se houver erro no preenchimento do campo.

## Recomendações para Código

- Utilize a marcação semântica correta no código `HTML`, com a *tag* `<textarea>`;

- Associe o *textarea* ao rótulo usando o atributo `for` na *tag* `<label>` e um `id` com mesmo valor na *tag*s `<textarea>`;

- Caso seja necessário, use o atributo `aria-describedby` para vincular a um elemento de ajuda ou instrução e fornecer informações adicionais aos usuários que podem precisar de mais contexto.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/text-input/accessibility)
- [MDN Web Docs](https://developer.mozilla.org/pt-BR/docs/Web/HTML/Element/textarea)
