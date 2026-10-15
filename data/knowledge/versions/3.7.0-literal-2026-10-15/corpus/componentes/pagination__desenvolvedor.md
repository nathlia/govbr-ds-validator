<!--
URL: https://www.gov.br/ds/components/pagination?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/pagination/pagination-dev.md
Status da coleta: ok
-->

# *Pagination* (Paginação)

O *Pagination* é um *Componente* de interface que tem a função de organizar conteúdo de dados em páginas sequenciais, trazendo maior usabilidade durante o consumo da informação pelo usuário.

## Como usar

> **Atenção!** Use as classes de utilitários para organizar os módulos da páginação contextual

### Propriedades obrigatórias

| Atributo | Tipo   | Valor padrão           | Descrição                   |
| -------- | ------ | ---------------------- | --------------------------- |
| class    | string | **br-pagination**      | Container do componente     |
| class    | string | **data-total**         | Total de páginas            |
| class    | string | **data-current**       | Página ativa                |
| class    | string | **data-previous-page** | Navega para página anterior |
| class    | string | **data-next-page**     | Navega para página seguinte |

### Propriedades Adicionais

| Atributo | Tipo   | Valor padrão           | Descrição              |
| -------- | ------ | ---------------------- | ---------------------- |
| class    | string | **small** ou **large** | Modifica a densidade   |
| class    | string | **dark-mode**          | Usar em fundos escuros |

## Dependências

- [Button](/ds/components/button)
- [Divider](/ds/components/divider)
- [Input](/ds/components/input)
- [Item](/ds/components/item)
- [List](/ds/components/list)
- [Radio](/ds/components/radio)
- [Select](/ds/components/select)

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

## JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRPagination`, passando os seguintes parâmetros:

- Nome da classe (br-pagination)
- Objeto referenciando a raiz do componente DOM

```javascript
const paginationList = []
for (const brPagination of window.document.querySelectorAll('.br-pagination')) {
  paginationList.push(new core.BRPagination('br-pagination', brPagination))
}
```
