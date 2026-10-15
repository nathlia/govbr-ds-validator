<!--
URL: https://www.gov.br/ds/components/footer?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/footer/footer-dev.md
Status da coleta: ok
-->

# *Footer* (Rodapé)

Geralmente localizado na parte inferior das páginas, o *footer* (rodapé) pode ser organizado de formas distintas. Normalmente essa organização é definida através da combinação de elementos que reforçam a identidade visual com o conteúdo a ser informado, respeitando os objetivos de negócio e as necessidades do usuário.

## Como usar

```html
<footer class="br-footer [inverted]">
  <div class="container-lg">
    <div class="logo">
      <img src="https://url-da-imagem.png" alt="Texto alternativo" />
    </div>
    <div class="br-list" collapsible horizontal two-lines unique data-sub>
      <div class="col">
        <a class="br-item" href="javascript:void(0);" link>
          <div class="content text-down-01 text-bold text-uppercase">Categoria</div>
          <div class="support"><i class="fas fa-angle-up"></i></div
        ></a>
        <div class="br-list">
          <a class="br-item" href="javascript:void(0);" link> <div class="content">Item da Lista</div></a>
        </div>
      </div>
    </div>
    <div class="d-none d-sm-block">
      <div class="row align-items-end justify-content-between py-5">
        <div class="col social-network">
          <p class="text-up-01 text-extra-bold text-uppercase">Redes Sociais</p>
          <a href="" class="mr-3">
            <img src="https://url-da-imagem.png" alt="Texto alternativo" />
          </a>
        </div>
        <div class="col assigns text-right">
          <img class="ml-4" src="https://url-da-imagem.png" alt="Texto alternativo" />
        </div>
      </div>
    </div>
  </div>
  <div class="br-divider my-3"></div>
  <div class="container-lg">
    <div class="info">
      <div class="text-down-01 text-medium pb-3 text-center">
        Texto destinado a exibição de informações relacionadas à
        <strong>licença de uso.</strong>
      </div>
    </div>
  </div>
</footer>
```

### Versão com Largura Fluida

A classe `container-lg` força a **Largura Fixa** no *breakpoint desktop*. Altere essa classe para `container-fluid` para usar a **Largura Fluida**.

### Lista com alinhamento horizontal

Aplicar o atributo **horizontal** na tag do componente.

Surgiu da necessidade do componente footer para criar uma lista agrupada de links. A altura de linha padrão para os textos é de duas linhas. O layout se mantêm horizontal no desktop e os itens expandidos mas, na resolução de tablet e mobile, a lista volta para o formato vertical e pode ser condensada. Cada item de primeiro nível da lista deve ser encapsulados por um container com a classe `col`, podendo ser usadas as varições da Grid para diferentes tamanhos de coluna (ex.: col-2, col-4, col-8)

```html
<div class="br-list horizontal two-lines" data-collapsible data-unique data-sub>
  <div class="col">
    <a class="item" href="javascript:void(0);" data-link="">
      <div class="support"><i class="fas fa-running"></i></div>
      <div class="content">Texto de uma linha Texto de uma linha Texto de uma linha</div>
      <div class="support"><i class="fas fa-angle-down"></i></div>
    </a>
    <div class="br-list">
      <div class="br-item">
        <div class="content">Texto de uma linha Texto de uma linha Texto de uma linha</div>
      </div>
      <div class="br-item">
        <div class="content">Texto de uma linha Texto de uma linha Texto de uma Texto de uma linha</div>
      </div>
      <div class="br-item">
        <div class="content">Texto de uma linha Texto de uma linha Texto de uma linha</div>
      </div>
      <div class="br-item">
        <div class="content">Texto de uma linha Texto de uma linha Texto de uma linha</div>
      </div>
    </div>
  </div>
</div>
```

### Elementos obrigatórios

| Elemento  | Descrição               |
| --------- | ----------------------- |
| br-footer | Container do componente |
| logo      | Container para o logo   |

### Elementos opcionais

| Elemento       | Descrição             |
| -------------- | --------------------- |
| br-list        | lista                 |
| br-item        | item                  |
| social-network | Redes Sociais         |
| assigns        | Assinatura de Governo |
| br-divider     | Separador             |
| info           | Informações Legais    |

### Atributos Opcionais

| Atributo | Descrição      |
| -------- | -------------- |
| inverted | Aplicar tema 2 |

### Configurações obrigatórias

- Buscar os elementos com a classe "br-footer" e inicializar o construtor do componente.

| Atributo    | Descrição                                        |
| ----------- | ------------------------------------------------ |
| data-toggle | Ativa a opcão de colapsar os itens (obrigatório) |
| horizontal  | Versão horizontal da lista (obrigatório)         |

### Informações Adicionais

- A lista de links deve seguir o modelo apresentados nessa página. Cada item de primeiro nível da lista deve ser encapsulados por um container com a classe `col`, podendo ser usadas as varições da Grid para diferentes tamanhos de coluna (ex.: col-2, col-4, col-8).
- Os atributos/classes da `br-list`: `data-toggle`, `horizontal` e `data-unique` devem ser adicionados para correto funcionamento do script.
- A altura de linha padrão para os textos é de duas linhas. O layout se mantêm horizontal no desktop e os itens expandidos mas, na resolução de tablet e mobile, a lista volta para o formato vertical e pode ser condensada.
- Para variação de tema claro aplicar o atributo `inverted` a tag do componente.
- Para variações de alinhamento da logo, aplicar as classes: `text-left`, `text-right` ou `text-center` a `logo`

## Dependências

- [Button](/ds/components/button)
- [Divider](/ds/components/divider)
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

Usar o seguinte código JavaScript para instanciar a classe `BRFooter`, passando os seguintes parâmetros:

- Nome da classe (br-footer)
- Objeto referenciando a raiz do componente DOM

```javascript
const listFooter = []
for (const brFooter of window.document.querySelectorAll('.br-footer')) {
  listFooter.push(new core.BRFooter('br-footer', brFooter))
}
```
