<!--
URL: https://www.gov.br/ds/components/upload?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/upload/upload-access.md
Status da coleta: ok
-->

# *Upload* (Envio de Arquivos)

*Upload* é um componente que permite ao usuário selecionar um ou mais arquivos e os enviar por meio de um servidor de aplicação.

# Acessibilidade no Upload

## Navegação e Comportamento

- *Uploads* podem ser acessados via navegação por teclado, por meio da tecla `Tab`, e acionados por meio das teclas `Enter` ou `Space`;

- Quando exibir a lista dos arquivos carregados, o usuário poderá acessá-la por meio da tecla `Tab` ou setas direcionais `arrowUp` e `arrowDown`;

- Na lista de arquivos carregados o usuário também pode acessar via tecla `Tab`, o botão excluir presente em cada item, e acioná-los com a tecla `Enter` ou `Space`.

## Recomendações para Estilo e Design

- Utilize rótulos (*labels*) claros e descritivos para que o usuário compreenda o propósito do campo de texto;

- Identifique as mensagens de *feedback* (informação, sucesso, alerta e erro) associadas ao *upload* e exibidas pelas tecnologias assistivas.

## Recomendações para Código

- Utilize a *tag* semântica `<input type="file"/>` para construção do componente *upload*;

- É importante associar - por meio do código - o botão excluir ao nome do arquivo carregado, para que o usuário entenda qual arquivo será removido.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/file-uploader/accessibility)
