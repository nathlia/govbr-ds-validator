<!--
URL: https://www.gov.br/ds/components/tag?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/tag/tag-dev.md
Status da coleta: ok
-->

# *Tag* (Etiqueta)

*Tag* é qualquer tipo de sinalizador que pode indicar um *status*, uma quantidade ou uma informação de forma precisa e direta.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão | Descrição               |
| -------- | ------ | ------------ | ----------------------- |
| class    | string | **br-tag**   | container do componente |

### Propriedades adicionais

| Atributo | Tipo   | Valor Padrão                       | Descrição                    |
| -------- | ------ | ---------------------------------- | ---------------------------- |
| class    | string | **interaction**                    | Tag de Interação Dispensável |
| class    | string | **interaction-select**             | Tag de Interação Persistente |
| class    | string | **status**                         | Tag de status                |
| class    | string | **count**                          | Tag de contagem              |
| class    | string | **icon**                           | Tag de ícone                 |
| class    | string | **small**, **medium** ou **large** | Modifica a densidade         |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRTag`, passando os seguintes parâmetros:

- Nome da classe (br-tag)
- Objeto referenciando a raiz do componente DOM

```javascript
const tagList = []
for (const brTag of window.document.querySelectorAll('.br-tag')) {
  tagList.push(new core.BRTag('br-tag', brTag))
}
```

## Informações adicionais

### Cores

Usar Utilitário CSS [Cores](ds/utilities-css/cores) para modificar cores de texto e fundo para o componente.

## Dependências

- [Button](/ds/components/button)
