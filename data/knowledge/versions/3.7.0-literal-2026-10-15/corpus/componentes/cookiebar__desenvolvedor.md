<!--
URL: https://www.gov.br/ds/components/cookiebar?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/cookiebar/cookiebar-dev.md
Status da coleta: ok
-->

# *CookieBar*

O *cookieBar* é o componente responsável por fazer a gestão de *cookies* de um determinado produto, ele deve ser utilizado quando houver a necessidade de fazer qualquer tipo de tratamento de dados do usuário por meio de *cookies*. O componente permite que o usuário possa habilitar/desabilitar cada *cookie* de acordo com as definições e regras de negócio do produto, visualizar detalhes sobre cada *cookie*, finalidades, tempo de duração, dados que são coletados, dar consentimento ao tratamento dos dados, entre outros, conforme orientação da LGPD.

## Como usar

Para usar o componente Cookiebar é necessário os seguintes artefatos:

- O **HTML Base** do componente
- O **Arquivo de CSS do Design System GOV.BR**
- O **Arquivo JavaScript** que contém a classe BRCookiebar

```html
<div class="br-cookiebar default d-none" tabindex="-1"></div>
```

> O componente Cookiebar é gerado dinamicamente utilizando um **JSON de Entrada de Dados** e o **HTML Base**.

## JSON de Entrada de Dados

```json
"[
  {
    "lang": "",
    "allOptOut": true,
    "acceptButton": "",
    "optInButton": "",
    "optOutButton": "",
    "infoText": "",
    "mainTitle": "",
    "lastUpdate": "",
    "entryText": "",
    "selectAll": false,
    "allAlertMessage": "",
    "closeLabel": "",
    "lastUpdateLabel": "",
    "cookieGroupsLabel": "",
    "selectAllLabel": "",
    "unselectAllLabel": "",
    "selectAllGroupLabel": "",
    "unselectAllGroupLabel": "",
    "onLabel": "",
    "offLabel": "",
    "alwaysActiveLabel": "",
    "cookieNameLabel": "",
    "expiresLabel": "",
    "domainLabel": "",
    "enterpriseLabel": "",
    "purposeLabel": "",
    "descriptionLabel": "",
    "cookieGroups": [
      {
        "groupId": "",
        "groupName": "",
        "groupOptOut": false,
        "groupSelected": false,
        "groupAlertMessage": "",
        "groupText": "",
        "cookieList": [
          {
            "cookieId": "",
            "cookieOptOut": false,
            "cookieSelected": false,
            "alertMessage": "",
            "cookieName": "",
            "expires": "",
            "domain": "s",
            "entreprise": "",
            "purpose": "",
            "description": ""
          },
        ]
      },
    ],
    "noteTitle": "",
    "noteList": [
      {
        "question": "",
        "answer": ""
      },
    ],
    "links": [
      {
        "name": "",
        "url": "",
        "target": ""
      }
    ]
  }
]"
```

### Propriedades do JSON de Entrada de Dados

O JSON de Entrada de Dados é um array, em que cada elemento é objeto contendo os dados do Cookiebar em uma determinada lingua.

#### `lang`

- **Descrição**: Define a lingua do respectivo conjunto de dados
- **Tipo**: String
- **Uso**: Obrigatório
- **Observação**: Usado para determinar qual item do array inicial do JSON será usado.

> A tradução do cookiebar é manual, ou seja, o valor dos demais parâmetros do JSON de entrada deverão ser informados na lingua usada

#### `allOptOut`

- **Descrição**: Propriedade que define se o Cookiebar é **optIn** (false) ou **optOut** (true)
- **Tipo**: Boolean
- **Uso**: Obrigatório
- **Observação**: Caso seja **false**, seu valor prevalece sobre as propriedades `groupOptOut` e `cookieOptOut` marcando-as como **false** e sobre as propriedades `selectAll`, `groupSelected` e `cookieSelected` marcando-as como **true**

#### `acceptButton`

- **Descrição**: Label do botão primário
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o botão primário terá a label **Aceitar**

#### `optInButton`

- **Descrição**: Label do botão secundário caso a propriedade `allOptOut` seja **false**
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o botão secundário terá a label **Ver Política de Cookies**

#### `optOutButton`

- **Descrição**: Label do botão secundário caso a propriedade `allOptOut` seja **true**
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o botão secundário terá a label **Definir Cookies**

#### `infoText`

- **Descrição**: Texto que aparece quando o Cookiebar está fechado
- **Tipo**: String
- **Uso**: Obrigatório

#### `mainTitle`

- **Descrição**: Título principal
- **Tipo**: String
- **Uso**: Obrigatório

#### `lastUpdate`

- **Descrição**: Informação sobre atualização
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Informar apenas a data no formato string

#### `entryText`

- **Descrição**: Texto introdutório
- **Tipo**: String
- **Uso**: Obrigatório

#### `selectAll`

- **Descrição**: Informa se o checkbox de seleção geral está **true** ou **false**
- **Tipo**: Boolean
- **Uso**: Obrigatório
- **Observação**: Sua seleção afeta as propriedades `groupSelected` e `cookieSelected` marcando-as com o mesmo valor.

> O checkbox de seleção geral pode assumir o estado intermediário, dependendo da seleção dos checkboxes e switches dependentes. Nesse caso, seu valor é **true** e possui o atributo **indeterminate**

#### `allAlertMessage`

- **Descrição**: Mensagem de alerta para todo o cookiebar
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Se estiver presente, o cookiebar apresenta a mensagem quando o checkbox de seleção geral estiver **false** ou **indeterminate**

#### `closeLabel`

- **Descrição**: Nome usado no atributo aria-label do botão de fechar o cookiebar
- **Tipo**: String
- **Uso**: Optativo
- **Observação** Caso não seja utilizado, o atributo aria-label do botão de fechar usará o valor **fechar**

#### `lastUpdateLabel`

- **Descrição**: Label para o campo de que informa a data de atualização
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Última atualização**

#### `cookieGroupsLabel`

- **Descrição**: Label da área das classes de cookies
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Classes de cookies**

#### `selectAllLabel`

- **Descrição**: Label para o checkbox de seleção geral, caso esteja **true** ou contenha o atributo **indeterminate**
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Selecionar tudo**

#### `unselectAllLabel`

- **Descrição**: Label para o checkbox de seleção geral, caso esteja **false**
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Desselecionar tudo**

#### `selectAllGroupLabel`

- **Descrição**: Label para o checkbox de seleção da classe (grupo) de cookies, caso esteja **true** ou contenha o atributo **indeterminate**
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Selecionar toda classe**

#### `unselectAllGroupLabel`

- **Descrição**: Label para o checkbox de seleção da classe (grupo) de cookies, caso esteja **false**
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Desselecionar toda classe**

#### `onLabel`

- **Descrição**: Label para o switch de seleção do cookie, caso esteja **true**
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Ligado**

#### `offLabel`

- **Descrição**: Label para o swtich de seleção do cookie, caso esjeta **false**
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Desligado**

#### `alwaysActiveLabel`

- **Descrição**: Label usado caso a classe (grupo) de cookies seja optIn
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Sempre ativo**

#### `cookieNameLabel`

- **Descrição**: Label para a propriedade *nome do cookie*
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Cookies**

#### `expiresLabel`

- **Descrição**: Label para a propriedade *Vencimento*
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Vencimento**

#### `domainLabel`

- **Descrição**: Label para a propriedade *Domínio*
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Domínio**

#### `enterpriseLabel`

- **Descrição**: Label para a propriedade *Empresa*
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Empresa**

#### `purposeLabel`

- **Descrição**: Label para a propriedade *Finalidade*
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Finalidade**

#### `descriptionLabel`

- **Descrição**: Label para a propriedade *Descrição*
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **Descrição**

#### `cookieGroups`

- **Descrição**: Array contendo objetos que agrupam informações sobre uma classe de cookies específica
- **Tipo**: Array
- **Uso**: Obrigatório
- **Observação**: Necessário haver pelo menos um grupo de cookies

#### `groupId`

- **Descrição**: Identificado do grupo de cookies
- **Tipo**: String
- **Uso**: Obrigatório
- **Observação**: Necessário informa o Id do grupo. O cookiebar **não** gera automaticamente

#### `groupName`

- **Descrição**: Nome da classe do cookie
- **Tipo**: String
- **Uso**: Obrigatório
- **Observação**: A quantidade de cookies no grupo e quantidade de cookies selecionados são calculados e informados pelo cookiebar

#### `groupOptOut`

- **Descrição**: Propriedade que define se a classe de cookies é **optIn** (false) ou **optOut** (true)
- **Tipo**: Boolean
- **Uso**: Obrigatório
- **Observação**: Caso seja **false**, seu valor prevalece sobre a propriedade e `cookieOptOut` marcando-a como **false** e sobre as propriedades `groupSelected` e `cookieSelected` marcando-as como **true**

#### `groupSelected`

- **Descrição**: Informa se o checkbox de seleção da classe de cookies está **true** ou **false**
- **Tipo**: Boolean
- **Uso**: Obrigatório
- **Observação**: Sua seleção afeta a propriedade `cookieSelected` marcando-a com o mesmo valor.

> O checkbox de seleção da classe de cookies pode assumir o estado intermediário, dependendo da seleção dos switches dependentes. Nesse caso, seu valor é **true** e possui o atributo **indeterminate**

#### `groupText`

- **Descrição**: Descrição da classe de cookies
- **Tipo**: String
- **Uso**: Obrigatório

#### `cookieList`

- **Descrição**: Array contendo objetos que agrupam informações sobre um cookie específico
- **Tipo**: Array
- **Uso**: Obrigatório
- **Observação**: Necessário haver pelo menos um cookie

#### `cookieId`

- **Descrição**: Identificado do cookie
- **Tipo**: String
- **Uso**: Obrigatório
- **Observação**: Necessário informa o Id do cookie. O cookiebar **não** gera automaticamente

#### `cookieOptOut`

- **Descrição**: Propriedade que define se o cookie é **optIn** (false) ou **optOut** (true)
- **Tipo**: Boolean
- **Uso**: Obrigatório

#### `cookieSelected`

- **Descrição**: Informa se o switch de seleção do cookie está **true** ou **false**
- **Tipo**: Boolean
- **Uso**: Obrigatório
- **Observação**: Se `cookieOptOut` for **false**, seu valor será o mesmo de `groupSelected`

#### `alertMessage`

- **Descrição**: Mensagem de alerta para um cookie específico
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Se estiver presente, o cookiebar apresenta a mesagem quando o switch do cookie estiver **false**

#### `cookieName`

- **Descrição**: Nome do cookie
- **Tipo**: String
- **Uso**: Obrigatório

#### `expires`

- **Descrição**: Período de expiração do cookie
- **Tipo**: String
- **Uso**: Obrigatótio

#### `domain`

- **Descrição**: Domínio relacionado ao cookie
- **Tipo**: String
- **Uso**: Obrigatório

#### `entreprise`

- **Descrição**: Nome da empresa
- **Tipo**: String
- **Uso**: Obrigatório

#### `purpose`

- **Descrição**: Finalidade do cookie
- **Tipo**: String
- **Uso**: Obrigatório

#### `description`

- **Descrição**: Descrição do cookie
- **Tipo**: String
- **Uso**: Obrigatório

#### `noteTitle`

- **Descrição**: Nome do bloco de **aviso sobre os cookies**
- **Tipo**: String
- **Uso**: Optativo

#### `noteList`

- **Descrição**: Array contendo objetos que agrupam informações sobre os avisos do cookie
- **Tipo**: String
- **Uso**: Optativo

#### `question`

- **Description**: Pergunta
- **Tipo**: String
- **Uso**: Obrigatório caso tenha a propriedade `noteList`

#### `answer`

- **Descrição**: Resposta
- **Tipo**: String
- **Uso**: Obrigatório caso tenha a propriedade `noteList`

#### `links`

- **Description**: Array contendo links para mais informações
- **Tipo**: String
- **Uso**: Optativo

#### `name`

- **Descrição**: Rótulo do link
- **Tipo**: String
- **Uso**: Obrigatório caso tenha a propriedade `links`

#### `url`

- **Descrição**: URL do link
- **Tipo**: String
- **Uso**: Obrigatóro caso tenha a propriedade `links`

#### `target`

- **Descrição**: Tipo de alvo do link para a propriedade 'target'
- **Tipo**: String
- **Uso**: Optativo
- **Observação**: Caso não seja informado, o valor usado será **_self**

> Como saída, é gerado um JSON de Saída ao clicar no botão de aceite. O JSON de Saída é usado na função de callback.

## JSON de Saída de Dados

```json
{
  "selectAll":[true|false|'indeterminated'],
  "cookieGroups":[
    {
      "groupId": "",
      "groupSelected":[true|false|'indeterminated'],
      "cookieList":[
        {
          "cookieId": "",
          "cookieSelected":[true|false]
        }
      ]
    }
  ]
}
```

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

### JavaScript

Usar s seguinte código JavaScript para instanciar a classe `BRCookiebar`, passando um objeto com as seguintes propriedades:

- `name` - Nome do componente em minúsculo (br-cookiebar)
- `component` - Objeto referenciando a raiz do componente DOM
- `json`- JSON de entrada com dados do cookiebar no formato string
- `lang` - Lingua para filtrar o JSON de entrada
- `mode` - Mode de renderização do cookibar ('default' | 'open')
- `callback` - Função de callback chamada no aceite do cookiebar tendo o JSON de saída como argumento

```javascript
const cookiebarList = []

// É necessário informar o json de entrada no formato string e, também, uma funçao de callback.

for (const brCookiebar of window.document.querySelectorAll('.br-cookiebar')) {
  const params = {
    name: 'br-cookiebar',
    component: brCookiebar,
    json: json,
    lang: 'pt-br',
    mode: 'default',
    callback: callback,
  }
  cookiebarList.push(new core.BRCookiebar(params))
}

```

## Função de callback

A função de callback é chamada ao clicar no botão de aceite e recebe como parâmetro o **JSON de Saída**. Ela é responsável por tratar a regra de negócio do cookiebar.

```javascript
function callback(jsonSaida) {
  // Implementar o tratamento dos cookeis segundo as regras de negócio.
  console.log(jsonSaida)
}
```

## Uso Alternativo

O Cookiebar pode ser instancia do usando-se o método estático `createCookiebar`, **sem a necessidade do HTML base**

```javascript
BRCookiebar.createCookiebar(json, callback)
```

## Dependências

- [Button](/ds/components/button)
- [Card](/ds/components/card)
- [Item](/ds/components/item)
- [List](/ds/components/list)
- [Message](/ds/components/message)
- [Modal](/ds/components/radio)
- [Switch](/ds/components/switch)
