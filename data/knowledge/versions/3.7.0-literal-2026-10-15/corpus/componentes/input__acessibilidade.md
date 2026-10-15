<!--
URL: https://www.gov.br/ds/components/input?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/input/input-access.md
Status da coleta: ok
-->

# *Input* (Campo de Entrada de Texto)

Componente que permite a entrada de dados textuais por parte do usuário.

# Acessibilidade no Input

## Navegação e Comportamento

- Os *inputs* ou *input Text* devem ser acessíveis por meio de navegação via teclado, por meio da tecla `Tab`, onde cada *input* deve ser um ponto de foco na ordem da tabulação;

- Utilize a marcação correta para o estado de foco, previsto na diretriz de estados, quando o foco estiver ativo no *input*;

- Após o *input* receber o foco, permita que o usuário possa digitar o texto na sequência, sem necessidade de qualquer outro passo anterior;

- Permita que os controles internos ao *input* também possam ser acessados por teclado, via tecla `Tab` e acionados via tecla `Space`. Por exemplo: botões de busca, botões para visualização de senha, etc;

- Siga uma ordem lógica para tabulação, focando primeiramente o rótulo associado ao *input*. Depois, ícones/botões de informação associados ao rótulo. Por fim, *input* e seus controles internos;

- Por padrão, o usuário deve conseguir navegar entre as palavras do texto digitado, com o uso das teclas `Ctrl + left/right` no Windows ou `Option + left/right` no Mac.

## Recomendações para Estilo e Design

- Utilize rótulos (*labels*) claros e descritivos para que o usuário compreenda o propósito do campo de texto;

- Adicione ajuda contextual, fornecendo informações adicionais ou instruções para os usuários entenderem detalhes a respeito do preenchimento do *input*. Pode-se utilizar um texto auxiliar logo abaixo do *input* ou um ícone de informação ao lado do rótulo para exibir a ajuda;

- Para validação em campos de texto, é importante fornecer *feedback* visual imediato quando o usuário preencher o *input*. Marque o *input* com a cor correspondente ao estado de sucesso, se o usuário preencher corretamente, ou cor correspondente ao estado de erro, se houver algum problema no preenchimento do campo.

## Recomendações para Código

- Utilize a marcação semântica correta no código HTML, com a tag `<input>` e o valor do atributo `type` correspondente a sua função. Por exemplo: `type = "text"`, `type = "date"`, `type = "email"`, `type = "password"`, etc; Veja mais detalhes em [MDN Web Docs - Input Element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input);

- Associe o *input* ao rótulo usando o atributo `for` na tag `<label>` e um `id` com mesmo valor na tag `<input>`;

- Caso seja necessário, use o atributo `aria-describedby` para vincular a um elemento de ajuda ou instrução e fornecer informações adicionais aos usuários que podem precisar de mais contexto.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/text-input/accessibility)
- [MDN Web Docs](https://developer.mozilla.org/pt-BR/docs/Web/HTML/Element/input)
