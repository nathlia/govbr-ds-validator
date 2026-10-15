<!--
URL: https://www.gov.br/ds/components/loading?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/loading/loading-dev.md
Status da coleta: ok
-->

# *Loading*

São indicadores de progresso que expressam um tempo de espera não especificado ou exibem a duração de um processo.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão   | Descrição               |
| -------- | ------ | -------------- | ----------------------- |
| class    | string | **br-loading** | Container do componente |

### Propriedades adicionais

| Atributo      | Tipo   | Valor Padrão | Descrição                    |
| ------------- | ------ | ------------ | ---------------------------- |
| data-progress | number |              | Porcentagem de carregamento. |
| class         | string | **medium**   | Modifica a densidade.        |

## Informações adicionais

- O tamanho padrão do loading é o menor, mas pode ser modificado para médio;
- Utilizar o atributo "data-progress" configura o loading para o tamanho maior, permitindo que a informação seja exibida sem quebra de layout;
- O formato "indeterminado" não possui elementos internos, enquanto o formato "determinado" inclui elementos internos em sua composição.
