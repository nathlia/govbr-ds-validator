<!--
URL: https://www.gov.br/ds/components/table?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/table/table-dev.md
Status da coleta: ok
-->

# *Table* (Tabela)

A *Table* (Tabela) é um conjunto de dados organizados em linhas e colunas.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão | Descrição               |
| -------- | ------ | ------------ | ----------------------- |
| class    | string | **br-table** | Container do componente |

### Propriedades adicionais

| Atributo       | Tipo    | Valor Padrão                       | Descrição                         |
| -------------- | ------- | ---------------------------------- | --------------------------------- |
| class          | string  | **small**, **medium** ou **large** | Modifica a densidade              |
| data-search    | boolean |                                    | Necessário para busca             |
| data-selection | boolean |                                    | Necessário para seleção de linhas |
| data-toogle    | boolean |                                    | Necessário para expansão de linha |
| class          | string  | **no-hover**                       | Desativa no hover de linha        |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

## JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRTable`, passando os seguintes parâmetros:

- Nome da classe (br-table)
- Objeto referenciando a raiz do componente DOM

```javascript
const tableList = []
for (const [index, brTable] of window.document.querySelectorAll('.br-table').entries()) {
  tableList.push(new core.BRTable('br-table', brTable, index))
}
```

## Informações adicionais

> **Atenção!** Mantenha a tabela de dados acessível. Para mais dicas visite [Criação de Tabelas de Dados Acessíveis](http://www.acessibilidadelegal.com/13-tabelas-acessiveis.php).

As colunas do *Header* da Table não possuem bordas separadoras por padrão. Para tabelas irregulares use as classes `border-top`, `border-right`, `border-top` ou `border-left` manualmente em cada coluna para facilitar a leitura. Veja nos exemplos de **Tabelas Irregulares**.

## Dependências

- [Button](/ds/components/button)
- [Checkbox](/ds/components/checkbox)
- [Divider](/ds/components/divider)
- [Input](/ds/components/input)
- [Item](/ds/components/item)
- [List](/ds/components/list)
- [Pagination](/ds/components/pagination)
- [Radio](/ds/components/radio)
- [Select](/ds/components/select)
