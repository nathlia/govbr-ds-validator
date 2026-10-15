<!--
URL: https://www.gov.br/ds/components/input?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/input/input-dev.md
Status da coleta: ok
-->

# *Input* (Campo de Entrada de Texto)

Componente que permite a entrada de dados textuais por parte do usuário.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão | Descrição                |
| -------- | ------ | ------------ | ------------------------ |
| class    | string | **br-input** | Container do componente. |

### Propriedades adicionais

| Atributo | Tipo   | Valor Padrão           | Descrição                           |
| -------- | ------ | ---------------------- | ----------------------------------- |
| class    | string | **input-button**       | Ajusta espaçamento interno do input |
| class    | string | **input-inline**       | Usado na versão com rótulo lateral  |
| class    | string | **input-highlight**    | Aplica versão em destaque           |
| class    | string | **small** ou **large** | Modifica a densidade                |

## Estados

| Estado     | atributo     | Valores                                           |
| ---------- | ------------ | ------------------------------------------------- |
| Sucesso    | **success**  | Entrada de dados com sucesso                      |
| Erro       | **danger**   | Entrada de dados com erros                        |
| Alerta     | **warning**  | Entrada de dados com alerta                       |
| Aviso      | **info**     | Entrada de dados com informação                   |
| Desativado | **disabled** | Desativa o componente (**usar no input interno**) |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRInput`, passando os seguintes parâmetros:

- Nome da classe (br-input)
- Objeto referenciando a raiz do componente DOM

```javascript
const inputList = []
for (const brInput of window.document.querySelectorAll('.br-input')) {
  inputList.push(new core.BRInput('br-input', brInput))
}
```

## Dependências

- [Button](/ds/components/button)
- [Message](/ds/components/message)
