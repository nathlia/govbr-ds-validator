<!--
URL: https://www.gov.br/ds/components/breadcrumb?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/breadcrumb/breadcrumb-dev.md
Status da coleta: ok
-->

# *Breadcrumb* (Migalhas de Pão)

*Breadcrumb*, *Breadcrumb Navigation* ou *Breadcrumb Trail* (literalmente, navegação por migalhas de pão ou trilha de migalhas de pão, em alusão à história de João e Maria) é um sistema de navegação estrutural usado para proporcionar ao usuário um meio de localização dentro da estrutura de navegação do site ou sistema.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão      | Descrição                |
| -------- | ------ | ----------------- | ------------------------ |
| class    | string | **br-breadcrumb** | Container do componente. |
| class    | string | **crumb-list**    | Lista interna de links.  |
| class    | string | **crumb**         | Cada item da lista.      |
| class    | string | **home**          | Primeiro link da lista.  |
| class    | string | **icon**          | Cada separador da lista. |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

## JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRBreadcrumb`, passando os seguintes parâmetros:

- Nome da classe (br-breadcrumb)
- Objeto referenciando a raiz do componente DOM

```javascript
const breadcrumbList = []
for (const brBreadcrumb of window.document.querySelectorAll('.br-breadcrumb')) {
  breadcrumbList.push(new core.BRBreadcrumb('br-breadcrumb', brBreadcrumb))
}
```

## Dependências

- [Button](/ds/components/button)
- [Card](/ds/components/card)
- [Item](/ds/components/item)
- [Tooltip](/ds/util/tooltip)
