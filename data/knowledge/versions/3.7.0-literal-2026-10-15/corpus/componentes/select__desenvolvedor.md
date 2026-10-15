<!--
URL: https://www.gov.br/ds/components/select?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/select/select-dev.md
Status da coleta: ok
-->

# *Select* (Campo de Seleção)

O componente *select* permite selecionar itens em uma lista de opções.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão    | Descrição                                                       |
| -------- | ------ | --------------- | --------------------------------------------------------------- |
| class    | string | **br-select**   | Container do componente Select                                  |
| class    | string | **br-input**    | Container do componente Input                                   |
| class    | string | **br-button**   | Container do componente Button                                  |
| class    | string | **br-list**     | Container do componente List                                    |
| class    | string | **br-item**     | Container do componente Item                                    |
| class    | string | **br-checkbox** | Container do componente br-checkbox (apenas no Select Múltiplo) |
| class    | string | **highlighted** | Aplica o estado destacado                                       |
| class    | string | **circle**      | Aplica o Tipo Circular.                                         |
| class    | string | **small**       | Aplica a Densidade Alta                                         |
| atributo | string | **trigger**     | Configura o button como gatilho de abertura da lista de itens   |
| atributo | string | **all**         | Seta a opção Selecionar todos                                   |
| atributo | string | **name**        | Deve ser inseridos nos inputs radio e checkbox                  |
| atributo | string | **value**       | Deve ser inseridos nos inputs radio e checkbox                  |

### Propriedades Adicionais

| Atributo | Tipo   | Valor Padrão | Descrição                                     |
| -------- | ------ | ------------ | --------------------------------------------- |
| classs   | string | **divider**  | Aplica Separador nos Itens do Select Múltiplo |
| classs   | string | **feedback** | Mensagem auxiliar de feedback                 |

## Estados

| Estado           | atributo   | Valores |
| ---------------- | ---------- | ------- |
| Select Múltiplo  | `checked`  |         |
| Select expandido | `expanded` |         |

## Dependências

- [Button](/ds/components/button)
- [Checkbox](/ds/components/checkbox)
- [Input](/ds/components/input)
- [Item](/ds/components/item)
- [List](/ds/components/list)

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

## JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRSelect`, passando os seguintes parâmetros:

- Nome da classe (br-select)
- Objeto referenciando a raiz do componente DOM
- (Opcional) String contendo código HTML para dar o feedback de busca não encontrada. Caso não seja passada, será usado um código padrão.

> **Importante!** A tag wrapper do "elemento not-found" precisa conter as classe `br-item` e `not-found`

```javascript
const selectList = []
const notFoundElement = `
 <div class="br-item not-found">
  <div class="container">
   <div class="row">
    <div class="col">
     <p><strong>Ops!</strong> Não encontramos o que você está procurando!</p>
    </div>
   </div>
  </div>
 </div>
`
for (const brSelect of window.document.querySelectorAll('.br-select')) {
  const brselect = new core.BRSelect('br-select', brSelect, notFoundElement)
  //Exemplo de uso de listener do select
  brSelect.addEventListener('onChange', function (e) {})
  selectList.push(brselect)
}
```

## Informações adicionais

Os inputs do tipo **checkbox** e **radio**, que nesse componente são utilizados para selecionar os itens, seguem o padrão de formulário do w3c.

### Para Obter as Opções Selecionadas

A classe BRSelect oferece duas propriedades para se obter as opções selecionadas:

- `selected` - Obtém-se os valores selecionados relativos às `labels` das opções do select
- `selectedValue` - Obtém-se os valores selecionados relativos ao atributo `value` dos `inputs` das opções do select

Ambas as propriedades retoram:

- **Select Simples**: Um único valor selecionado (`string`) ou `undefined` se nenhuma opção foi selecionada
- **Select Múltiplo**: Um array contendo os valores selecionados (`string`) ou um array vazio se nenhuma opção foi selecionada

### Para Reiniciar a Configuração do Componente

A classe BRSelect oferece um método para reiniciar a configuração do componente:

- `resetOptionsList()` - Reconfigura o objeto instanciado. Usado quando as opções do select foram atualizadas em tempo de execução.

### Para Carregar um Item Selecionado

Existe duas formas de carregar um item selecionado:

- Usando a classe `selected` na tag correspondente ao item, ou seja a a tag que contém a classe `.br-item`

  ```html
  <div class="br-item selected">...</div>
  ```

- Usando o atributo `checked` no input correspondente ao item, para ambos os tipos: `checkbox` e `radio`

  ```html
  <div class="br-item">
    <div class="br-checkbox">
      <input type="checkbox" checked />
      ...
    </div>
  </div>
  ```

### Evento

O seguinte evento é emitido pelo componente:

- `onChange` - Emitido quando um item é selecionado. A propriedade `detail` do objeto `Event` contém o elemento raiz (DOM) do componente.
