<!--
URL: https://www.gov.br/ds/components/step?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/step/step-dev.md
Status da coleta: ok
-->

# *Steps* (Navegação Passo a Passo)

*Steps* são indicadores de etapas e progresso que auxiliam os usuários durante um fluxo de trabalho, seguindo uma sequência lógica linear, aleatória, numeradas ou não.

<!-- [version]: # (1.0.0) -->

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão          | Descrição               |
| -------- | ------ | --------------------- | ----------------------- |
| class    | string | **br-step**           | Container do componente |
| class    | string | **step-progress-btn** | Cada etapa              |

### Propriedades adicionais

| Atributo     | Tipo    | Valor Padrão                                  | Descrição                          |
| ------------ | ------- | --------------------------------------------- | ---------------------------------- |
| data-type    | string  | **void**, **simple** ou **text**              | Define o tipo do componente        |
| data-label   | string  | **left**, **right**,<br>**top** ou **bottom** | Posiciona o rótulo da etapa        |
| data-initial | number  | 1                                             | Número da etapa ativada por padrão |
| data-scroll  | boolean | **false** ou **true**                         | Ativa barra de rolagem nas etapas  |

### Estados

<!-- Propriedades que são relacionadas ao estado do componente devem ficar nessa seção e não nas de cima -->

| Estado     | atributo     | Valores |
| ---------- | ------------ | ------- |
| Desativado | **disabled** |         |
| Ativado    | **active**   |         |

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRStep`, passando os seguintes parâmetros:

- Nome da classe (br-step)
- Objeto referenciando a raiz do componente DOM

```javascript
const stepList = []
for (const brStep of window.document.querySelectorAll('.br-step')) {
  stepList.push(new core.BRStep('br-step', brStep))
}
```

## Informações adicionais

### Rolagem

As etapas ocupam toda a largura/altura disponível do contexto por padrão. Caso precisar definir uma largura ou altura fixa use o atributo `data-scroll` para ativar rolagem.

### Comportamento em celular/tablet

Nos alinhamentos de rótulo à esquerda ou direita apenas o número irá ficar visível para manter a integridade do layout.

## Dependências

- [Button](/ds/components/button)
