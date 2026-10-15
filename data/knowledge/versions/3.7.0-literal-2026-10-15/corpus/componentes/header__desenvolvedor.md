<!--
URL: https://www.gov.br/ds/components/header?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/header/header-dev.md
Status da coleta: ok
-->

# *Header* (Cabeçalho)

O componente *Header* é o principal elemento de uma página, onde podem ser agrupados componentes predefinidos que tem como finalidade auxiliar o usuário no acesso ou mesmo execução das funcionalidades principais site/sistema.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão      | Descrição                                                 |
| -------- | ------ | ----------------- | --------------------------------------------------------- |
| class    | string | **br-header**     | Container do componente                                   |
| class    | string | **header-bottom** | Agrupador de menu, título, subtítulo e busca              |
| class    | string | **header-menu**   | Container acionador do menu principal, título e subtítulo |
| class    | string | **header-title**  | Título                                                    |

### Propriedades adicionais

| Atributo    | Tipo    | Valor Padrão                       | Descrição                                                         |
| ----------- | ------- | ---------------------------------- | ----------------------------------------------------------------- |
| class       | string  | **header-top**                     | Agrupador de logo, links, funcionalidades e login                 |
| class       | string  | **header-logo**                    | Container do logo                                                 |
| class       | string  | **header-sign**                    | Assinatura                                                        |
| class       | string  | **header-actions**                 | Container para links, funcionalidades, acionador de busca e login |
| class       | string  | **header-links**                   | Lista de links                                                    |
| class       | string  | **header-functions**               | Lista de funcionalidades                                          |
| class       | string  | **header-search-trigger**          | Acionador de busca (breakpoints menores e modo sticky)            |
| class       | string  | **header-login**                   | Container para botão sign-in e avatar                             |
| class       | string  | **header-sign-in**                 | Container para botão **Sign-in**                                  |
| class       | string  | **header-avatar**                  | Container para **Avatar**                                         |
| class       | string  | **header-menu-trigger**            | Container para **Menu**                                           |
| class       | string  | **header-subtitle**                | Subtítulo                                                         |
| class       | string  | **header-search**                  | Container para busca                                              |
| class       | string  | **large**, **medium** ou **small** | Modifica densidade                                                |
| class       | string  | **compact**                        | Aplica modo compacto                                              |
| data-sticky | boolean |                                    | Aplica modo sticky                                                |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRHeader`, passando os seguintes parâmetros:

- Nome da classe (br-header)
- Objeto referenciando a raiz do componente DOM

```javascript
const headerList = []
for (const brHeader of window.document.querySelectorAll('.br-header')) {
  headerList.push(new core.BRHeader('br-header', brHeader))
}
```

## Informações adicionais

### Versão com Largura Fluida

A classe `container-lg` força a **Largura Fixa** no *breakpoint desktop*. Altere essa classe para `container-fluid` para usar a **Largura Fluida**.

## Dependências

- [Button](/ds/components/button)
- [Input](/ds/components/input)
