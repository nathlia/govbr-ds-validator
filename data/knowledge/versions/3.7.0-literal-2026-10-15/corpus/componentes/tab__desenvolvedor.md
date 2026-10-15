<!--
URL: https://www.gov.br/ds/components/tab?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/tab/tab-dev.md
Status da coleta: ok
-->

# *Tab* (Abas)

As *Tabs* (Abas) são Componentes de Navegação em Interface que tem a função de organizar o conteúdo da página em categorias ou seções, oferecendo maior usabilidade ao usuário.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor padrão    | Descrição               |
| -------- | ------ | --------------- | ----------------------- |
| class    | string | **br-tab**      | Container do componente |
| class    | string | **tab-nav**     | Container das abas      |
| class    | string | **tab-item**    | Rótulo de cada aba      |
| class    | string | **tab-content** | Container dos conteúdos |
| class    | string | **tab-panel**   | Conteúdo de cada aba    |

### Propriedades Adicionais

| Atributo     | Tipo    | Valor padrão           | Descrição                        |
| ------------ | ------- | ---------------------- | -------------------------------- |
| data-counter | boolean | **true**               | Versão com contadores            |
| class        | string  | **small** ou **large** | Modifica a densidade             |
| class        | string  | **dark-mode**          | Aplica cores para fundos escuros |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRTab`, passando os seguintes parâmetros:

- Nome da classe (br-tab)
- Objeto referenciando a raiz do componente DOM

```javascript
const abasList = []
for (const brTab of window.document.querySelectorAll('.br-tab')) {
  abasList.push(new core.BRTab('br-tab', brTab))
}
```
