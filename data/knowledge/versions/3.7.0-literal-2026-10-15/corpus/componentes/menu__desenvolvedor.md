<!--
URL: https://www.gov.br/ds/components/menu?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/menu/menu-dev.md
Status da coleta: ok
-->

# Menu de Navegação

Os menus de navegação (ou simplesmente menus) são listas de categorias de conteúdo ou recursos, normalmente apresentados como um conjunto de *links* ou ícones agrupados com um estilo visual diferente do resto do *design*.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão       | Descrição                           |
| -------- | ------ | ------------------ | ----------------------------------- |
| class    | string | **br-menu**        | Container do componente             |
| class    | string | **menu-container** | Agrupa scrim e painel               |
| class    | string | **menu-scrim**     | Aplica o efeito de scrim            |
| class    | string | **menu-panel**     | Agrupa cabeçalho, corpo e rodapé    |
| class    | string | **menu-header**    | Agrupa o botão de fechar e título   |
| class    | string | **menu-close**     | Container para botão de fechar menu |
| class    | string | **menu-title**     | Container para título               |
| class    | string | **menu-body**      | Agrupa pastas de itens de menu      |
| class    | string | **menu-folder**    | Pasta com itens de menu             |
| class    | string | **menu-item**      | Item de menu                        |

### Propriedades Adicionais

| Atributo         | Tipo   | Valor Padrão    | Descrição                                         |
| ---------------- | ------ | --------------- | ------------------------------------------------- |
| class            | string | **push**        | Ativa modo "empurra"                              |
| class            | string | **menu-footer** | Container para rodapé do componente               |
| data-breakpoints | string |                 | Modifica breakpoint do componente                 |
| data-visible     | string | **false**       | Valor **true** exibe o header/footer no menu push |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRMenu`, passando os seguintes parâmetros:

- Nome da classe (br-menu)
- Objeto referenciando a raiz do componente DOM

```javascript
const menuList = []
for (const brMenu of window.document.querySelectorAll('.br-menu')) {
  menuList.push(new core.BRMenu('br-menu', brMenu))
}
```

## Informações adicionais

### Acionador do Menu Principal

O Menu Principal precisa de um **acionador externo** para abrir. Geralmente esse acionador fica dentro do componente Header.

```html
<button
  class="br-button circle"
  type="button"
  aria-label="Menu principal"
  data-toggle="menu"
  data-target="#identificador-do-menu"
>
  <i class="fas fa-bars" aria-hidden="true"></i>
</button>
```

### Menu Contextual

O acionador do Menu Contextual deve ser incluído no elemento `.menu-trigger`, portanto não é necessário adicionar um id ao componente.

```html
<div class="br-menu contextual">
  <div class="menu-trigger">
    <button class="br-button primary block" type="button" data-toggle="contextual">
      <span class="mr-1">Menu Contextual</span>
      <i class="fas fa-angle-up ml-5" aria-hidden="true"></i>
    </button>
  </div>
  <div class="menu-container">
    <div class="menu-panel">
      <nav class="menu-body">
        <div class="menu-folder">
          <div class="menu-item">...</div>
          ...
        </div>
      </nav>
    </div>
  </div>
</div>
```

### Menu item

A lista de itens de menu deve ser organizada usando `<ul>` e `<li>`

1. O item de menu suporta uso de ícones ilustrativos. Coloque-o dentro do elemento `.icon` **Este elemento é opcional!**
2. Os ícones de seta são incluídos automaticamente pelo script do menu
3. Para indicar que o menu item da lista está ativo use a classe `.active`

```html
<div class="menu-item">
  <!-- Ícone opcional -->
  <span class="icon">
    <i class="fas fa-check" aria-hidden="true"></i>
  </span>
  <span class="content">Texto do item de menu</span>
</div>
```

### Uso do Divider

No momento este componente não está compatível com o uso de Divider. Há duas maneiras de usar bordas separadoras:

1. Agrupar itens dentro de um `menu-folder`
2. Incluir manualmente a classe `divider` ao `menu-item` que esteja no primeiro nível de navegação

### breakpoints

Por padrão serão aplicadas as classes de breakpoint `col-sm-4` e `col-lg-3` no componente, mas podem ser modificados usando o atributo `data-breakpoints`. Exemplo:

```html
<div class="br-menu" id="identificador" data-breakpoints="col-sm-4 col-lg-3">...</div>
```

## Dependências

- [Button](/ds/components/button)
