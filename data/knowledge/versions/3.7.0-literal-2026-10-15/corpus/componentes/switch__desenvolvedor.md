<!--
URL: https://www.gov.br/ds/components/switch?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/switch/switch-dev.md
Status da coleta: ok
-->

# *Switch* (Controle Interruptor)

*Switches* são controles usados para alternar rapidamente entre dois estados possíveis. São usados ​​apenas para ações binárias que ocorrem imediatamente após o usuário “girar” o botão de alternância. São comumente usados ​​para interruptores “liga/desliga”.

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor padrão  | Descrição               |
| -------- | ------ | ------------- | ----------------------- |
| class    | string | **br-switch** | Container do componente |

### Propriedades Adicionais

| Atributo | Tipo   | Valor Padrão                        | Descrição                                              |
| -------- | ------ | ----------------------------------- | ------------------------------------------------------ |
| class    | string | **right** ou **top**                | Modifica alinhamento do label                          |
| class    | string | **icon**                            | Adiciona ícone na chave de alternância (switch toggle) |
| class    | string | **small**, **medium**, ou **large** | Modifica densidade do componente                       |

## Estados

| Estado     | atributo | Valores      |
| ---------- | -------- | ------------ |
| Desativado | class    | **disabled** |

## Informações adicionais

### Switch com rótulos adicionais

Para o rótulo adiciona use a classe `switch-data`. Os textos de ligado e desligado devem ficar em atributos data-\*:

- **data-enabled**: é mostrado quando o componente está "ligado"
- **data-disabled**: é mostrado quando o componente está "desligado"
