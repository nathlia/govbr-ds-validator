<!--
URL: https://www.gov.br/ds/components/notification?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/notification/notification-dev.md
Status da coleta: ok
-->

# *Notification* (Notificação)

*Notification* (notificação) são mensagens enviadas por aplicativos ou *sites* que fornecem informações curtas, oportunas e relevantes ao usuário.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor padrão        | Descrição               |
| -------- | ------ | ------------------- | ----------------------- |
| class    | string | **br-notification** | Container do componente |

### Propriedades adicionais

| Atributo | Tipo   | Valor Padrão            | Descrição                |
| -------- | ------ | ----------------------- | ------------------------ |
| class    | string | **notification-header** | Cabeçalho da notificação |

## Dependências

- [Button](/ds/components/button)
- [Item](/ds/components/item)
- [List](/ds/components/list)
- [Tab](/ds/components/tab)
- [Tag](/ds/components/tag)

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

## JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRNotification`, passando os seguintes parâmetros:

- Nome da classe (br-notification)
- Objeto referenciando a raiz do componente DOM

```javascript

const notificationList = []
for (const govbr-dsNotification of window.document.querySelectorAll(
  '.br-notification'
)) {
  notificationList.push(new core.BRNotification('br-notification', brNotification))
}
```
