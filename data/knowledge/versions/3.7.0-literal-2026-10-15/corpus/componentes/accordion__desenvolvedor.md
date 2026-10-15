<!--
URL: https://www.gov.br/ds/components/accordion?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/accordion/accordion-dev.md
Status da coleta: ok
-->

# Accordion

O accordion serve para que o usuário visualize mais informações sobre um conteúdo, já que permite que o item inicialmente exibido na tela em forma de sentença, seja expandindo mostrando o detalhamento daquele item.

## Dependências

- script `accordion.js`

## Código básico

```html
<div class="br-accordion">
  <div class="item" active>
    <button class="header" type="button">
      <span class="icon"><i class="fas fa-angle-up"></i></span>
      <span class="title">Título</span>
    </button>
  </div>
  <div class="content">Conteúdo</div>
  ...
</div>
```

## Detalhamento

O componente é composto dos seguintes elementos:

- `br-accordion` : container do componente;
- `item` : agrupa o item icone(icon) e título(title);
- `header` : área do cabeçalho;
- `icon` : ícone do cabeçalho;
- `title` : título do cabeçalho;
- `content` : área do conteúdo.

### `br-accordion`

Identifica a raiz do componente. Todos os **itens** do accordion estão dentro do `br-accordion`.

Exemplo de uso:

```html
<div class="br-accordion">
  <div class="item">...</div>
</div>
```

### `item`

Cada item do accordion é identificado pela classe `item`. Quando o item está ativo ele contém o atributo `active`

Exemplo de uso:

```html
<div class="br-accordion">
  <div class="item" active>...</div>
  <div class="item">...</div>
  <div class="item">...</div>
</div>
```

### `header`, `icon` e `title`

O `header` DEVE ser aplicado em uma tag `button`.

O título do item DEVE ficar em `title` , o ícone em `icon`.

Exemplo de uso:

```html
<div class="item" active>
  <button class="header" type="button">
    <span class="icon"><i class="fas fa-angle-up"></i></span>
    <span class="title">Título</span>
  </button>
</div>
```

## `content`

O conteúdo de cada item do accordion é colocado em uma **div** com a classe `content`. Essa **div** é colocada logo abaixo do item correspondente.

Exempo de uso:

```html
<div class="br-accordion">
  <div class="item">...</div>
  <div class="content">Conteúdo</div>
  <div class="item">...</div>
  <div class="content">Conteúdo</div>
</div>
```

## Accordion Negativo

Para o accordion negativo, utiliza-se o atributo `negative` na mesma tag do `br-accordion`.

Exemplo de uso:

```html
<div class="br-accordion" negative>
  <div class="item">...</div>
  <div class="content">...</div>
</div>
```

## Comportamento

Por default, o accordion permite abrir vários itens de uma vez.

Para que o accordion abra apenas um item por vez, basta adicionar o atributo `sigle` na tag do `br-accordion`

Exenplo de uso:

```html
<div class="br-accordion" single>
  <div class="item">...</div>
</div>
```

## Regras especiais

O script `accordion.js` irá fazer a troca automática dos ícones nas situações de item aberto ou fechado.

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

## JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRAccordion`, passando os seguintes parâmetros:

- Nome da classe (br-accordion)
- Objeto referenciando a raiz do componente DOM

```javascript
const accordionList = []
for (const brAccordion of window.document.querySelectorAll('.br-accordion')) {
  accordionList.push(Object.create(new core.BRAccordion('br-accordion', brAccordion)))
}
```
