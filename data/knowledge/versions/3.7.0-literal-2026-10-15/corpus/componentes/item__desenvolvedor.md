<!--
URL: https://www.gov.br/ds/components/item?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/item/item-dev.md
Status da coleta: ok
-->

# Item

Itens são blocos compactos e altamente flexível diagramados para exibir uma ampla variedade de conteúdo de forma repetida.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor padrão | Descrição                |
| -------- | ------ | ------------ | ------------------------ |
| class    | string | **br-item**  | Container do componente. |

### Propriedades Adicionais

| Atributo | Tipo   | Valor padrão | Descrição                                  |
| -------- | ------ | ------------ | ------------------------------------------ |
| class    | string | **divider**  | Aplica separador na borda inferior do Item |

## Estados

| Estado      | propriedade  | Valores                   |
| ----------- | ------------ | ------------------------- |
| Ativo       | **active**   | Aplica estilo ativo       |
| Selecionado | **selected** | Aplica estilo selecionado |
| Desativado  | **disabled** | Aplica estilo desativado  |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRItem`, passando os seguintes parâmetros:

- Nome da classe (br-item)
- Objeto referenciando a raiz do componente DOM

```javascript
const itemList = []
for (const brItem of window.document.querySelectorAll('.br-item')) {
  itemList.push(new core.BRItem('br-item', brItem))
}
```
