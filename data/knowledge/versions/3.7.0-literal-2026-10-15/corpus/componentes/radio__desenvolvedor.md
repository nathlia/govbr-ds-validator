<!--
URL: https://www.gov.br/ds/components/radio?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/radio/radio-dev.md
Status da coleta: ok
-->

# *Radio* (Caixa de Opção)

O componente Radio permite selecionar apenas uma opção em uma lista de opções.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão | Descrição               |
| -------- | ------ | ------------ | ----------------------- |
| class    | string | **br-radio** | Container do componente |

## Estados

| Estado     | atributo | Valores      |
| ---------- | -------- | ------------ |
| Desativado | class    | **disabled** |
| Inválido   | class    | **invalid**  |
| Válido     | class    | **valid**    |

## Informações adicionais

### Listagem horizontal

Usar Utilitários CSS [Display](utilitarios/css/display) e [Espaçamento](utilitarios/css/espacamento) para modificar o componente.

### Radio desativado

Além de adicionar a classe "disabled" ao componente, adicione também o atributo "disabled" na tag html `<input>`.
