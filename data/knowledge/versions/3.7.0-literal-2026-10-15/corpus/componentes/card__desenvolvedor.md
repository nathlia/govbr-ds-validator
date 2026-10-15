<!--
URL: https://www.gov.br/ds/components/card?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/card/card-dev.md
Status da coleta: ok
-->

# *Card*

*Cards* são cartões (ou superfícies) que contêm conteúdo e ações diversas sobre um único assunto (ou tópico).

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão     | Descrição               |
| -------- | ------ | ---------------- | ----------------------- |
| class    | string | **br-card**      | Container do componente |
| class    | string | **card-content** | Conteúdo do Card        |

### Propriedades Adicionais

| Atributo | Tipo   | Valor Padrão    | Descrição                                     |
| -------- | ------ | --------------- | --------------------------------------------- |
| class    | string | **card-header** | Área de cabeçalho                             |
| class    | string | **card-footer** | Área de rodapé                                |
| class    | string | **hover**       | Habilita o estado hover                       |
| class    | string | **h-fixed**     | Habilita altura fixa e ativa barra de rolagem |

## Estados

| Estado     | atributo   | Valores |
| ---------- | ---------- | ------- |
| Desativado | `disabled` |         |

## Informações adicionais

### Card desativado

Para manter a acessibilidade do componente adicione o atributo `aria-disabled="true"` ao componente.

### Card com collapse

Veja exemplo de instanciação do collapse na aba "JavaScript" na sessão **Código compartilhado entre exemplos**.

### Card com altura fixa

A altura do conteúdo do card é controlado pelo token `--card-height-fixed` no CSS.
