<!--
URL: https://www.gov.br/ds/components/message?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/message/message-dev.md
Status da coleta: ok
-->

# *Message* (Mensagem)

O *Message* (Mensagem) é um Componente de Interface que tem como finalidade proporcionar *feedback* ao usuário sobre o que ocorre no sistema.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão   | Descrição                      |
| -------- | ------ | -------------- | ------------------------------ |
| class    | string | **br-message** | Container para Tipo Padrão     |
| class    | string | **feedback**   | Container para Tipo Contextual |

### Propriedades adicionais

| Atributo | Tipo   | Valor Padrão | Descrição               |
| -------- | ------ | ------------ | ----------------------- |
| class    | string | **danger**   | Mensagens de Erro       |
| class    | string | **success**  | Mensagens de Sucesso    |
| class    | string | **info**     | Mensagens de Informação |
| class    | string | **warning**  | Mensagens de Alerta     |

## Dependências

- [Button](/ds/components/button)

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

## JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRMessage`, passando os seguintes parâmetros:

- Nome da classe (br-message)
- Objeto referenciando a raiz do componente DOM

```javascript
const alertList = []
for (const brAlert of window.document.querySelectorAll('.br-message')) {
  alertList.push(new core.BRAlert('br-message', brAlert))
}
```
