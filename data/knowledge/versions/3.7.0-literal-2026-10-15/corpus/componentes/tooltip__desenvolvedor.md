<!--
URL: https://www.gov.br/ds/components/tooltip?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/tooltip/tooltip-dev.md
Status da coleta: ok
-->

# *Tooltip* (Alertas Flutuantes)

São alertas flutuantes que proporcionam ao usuário um *feedback* do sistema, informando sobre algum aspecto da interface que mereça maior atenção.

## Como usar

O tooltip fica vinculado ao elemento (tag) declarado na linha/bloco anterior (parente, ou sibling, da árvore html) do código html. Assim, no exemplo abaixo, aparecerá sobre o texto da tag `<span>`

### Tooltip Simples

```html
<div>
  <span class="h3">Tooltip com Texto Simples</span>
  <div class="br-tooltip" place="bottom">
    <span class="text">Texto de Informação</span>
  </div>
  <div></div>
</div>
```

### Popover

```html
<div class="br-tooltip" popover success>
  <div class="popover-header">
    <span class="text">Cadastro Concluído!</span>
  </div>
  <div class="popover-body">
    <span class="subtext">Para verificar mais detalhes a respeito do seu acesso, clique no link abaixo.</span>
  </div>
  <div class="popover-footer">
    <a class="link" href="javascript:void(0);">Clique aqui</a>
  </div>
</div>
```

### PopOver com Ícone e Botão

- Os ícones devem ser inseridos dentro do container `popover-icon` .
- Os botões e links devem ser inseridos dentro do container `popover-footer` , caso não sejam necessários esse container pode ser omitido.

```html
<div class="br-tooltip" role="tooltip" error="error" popover="popover" place="left">
  <div class="popover-icon"><i class="fas fa-ban fa-3x" aria-hidden="true"></i>
  </div>
  <div >
    <div class="popover-body"><span class="subtext">É recomendado que o cadastro seja atualizado antes de prosseguir.</span>
    </div>
    <div class="popover-footer">
        <button class="br-button" type="button" primary><span>Atualizar</span>
    </div>
  </div>
</div>

```

### PopOver com Imagem

```html
<div class="br-tooltip" info popover place="bottom">
  <div class="popover-image">
    <img src="" alt="Avatar" />
  </div>
  <div class="popover-header">
    <span class="text">Fulano de Tal da Silva</span>
  </div>
  <div class="popover-body">
    <span class="subtext">Diretor Presidente</span>
  </div>
</div>
```

### Configurações obrigatórias

| Elemento      | Tipo   | Descrição                     |
| ------------- | ------ | ----------------------------- |
| `.br-tooltip` | classe | Container do componente       |
| `.text`       | classe | Texto principal a ser exibido |

### Configurações obrigatórias (Popover)

| Elemento        | Tipo   | Descrição                        |
| --------------- | ------ | -------------------------------- |
| `.popover`      | classe | Define tooltip para tipo PopOver |
| `.popover-body` | classe | Container para texto principal   |

### Configurações Adicionais

| Elemento | Tipo      | Descrição                                                                       |
| -------- | --------- | ------------------------------------------------------------------------------- |
| `place`  | attributo | Define o posicionamento do tooltip (top, bottom, left, right)                   |
| `timer`  | attributo | determina após quantos milisegundos o tooltip deve ser automaticamente ocultado |

### Configurações Adicionais (Popover)

| Elemento          | Tipo   | Descrição                        |
| ----------------- | ------ | -------------------------------- |
| `.popover-header` | classe | Container para header do popover |
| `.popover-footer` | classe | Container para footer do popover |
| `.popover-image`  | classe | Container para image do popover  |
| `.popover-icon`   | classe | Container para icon do popover   |

## Estados

| Estado   | Tipo      | Descrição                                                                                       |
| -------- | --------- | ----------------------------------------------------------------------------------------------- |
| `active` | attributo | atributo que pode ser definido quando se deseja que o tooltip apareça no inicio do carregamento |

## Dependências

- [Popper.js](https://popper.js.org/)

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRTooltip`, passando os seguintes parâmetros:

- Nome da classe (br-tooltip)
- Objeto referenciando a raiz do componente DOM

```javascript
const tooltipList = []
for (const brTooltip of window.document.querySelectorAll('.br-tooltip:not(.utilities)')) {
  tooltipList.push(new core.BRTooltip('br-tooltip', brTooltip))
}
```
