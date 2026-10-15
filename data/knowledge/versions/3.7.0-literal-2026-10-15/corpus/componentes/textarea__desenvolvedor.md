<!--
URL: https://www.gov.br/ds/components/textarea?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/textarea/textarea-dev.md
Status da coleta: ok
-->

# *Textarea* (Campo de Texto Multilinhas)

O *Textarea* é um campo de entrada de texto que permite que seu aplicativo aceite um valor de texto potencialmente longo do usuário.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor padrão    | Descrição               |
| -------- | ------ | --------------- | ----------------------- |
| class    | string | **br-textarea** | Container do componente |

### Propriedades Adicionais

| Atributo | Tipo   | Valor padrão           | Descrição                         |
| -------- | ------ | ---------------------- | --------------------------------- |
| class    | string | **small** ou **large** | Modifica a densidade.             |
| class    | string | **dark-mode**          | Aplica cores para fundos escuros. |

## Estados

| Estado     | atributo | Valores |
| ---------- | -------- | ------- |
| Desativado | disabled |         |
| Erro       | class    | danger  |
| Sucesso    | class    | success |
| Alerta     | class    | warning |
| Informação | class    | info    |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe `brTextArea`, passando os seguintes parâmetros:

- Nome da classe (br-textarea)
- Objeto referenciando a raiz do componente DOM

```javascript
const textareaList = []
for (const brTextArea of window.document.querySelectorAll('.br-textarea')) {
  textareaList.push(new core.BRTextArea('br-textarea', brTextArea))
}
```
