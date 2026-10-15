<!--
URL: https://www.gov.br/ds/components/avatar?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/avatar/avatar-dev.md
Status da coleta: ok
-->

# Avatar

Componente utilizado para representar graficamente um usuário em ambientes virtuais. Pode apresentar-se como ilustração vetorial (**avatar icônico**), texto (**avatar letra**) e fotografia (**avatar fotográfico**).

## Como usar

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão  | Descrição                                                         |
| -------- | ------ | ------------- | ----------------------------------------------------------------- |
| class    | string | **br-avatar** | Container do componente.                                          |
| class    | string | **content**   | Aplicado no conteúdo interno. Pode conter imagem, ícone ou letra. |

### Propriedades adicionais

| Atributo | Tipo   | Valor Padrão            | Descrição                                   |
| -------- | ------ | ----------------------- | ------------------------------------------- |
| title    | string |                         | Informa nome do usuário ao apontar o cursor |
| class    | string | **medium** ou **large** | Modifica o tamanho do componente            |

## Informações adicionais

### Tipo Letra

Usar [Utilitários CSS > Cores](/ds/utilitarios/css/cores) para alterar cor de fundo e texto.

### Versão com dropdown

Veja exemplo de instanciação do dropdown na aba "JavaScript" na sessão **Código compartilhado entre exemplos**.
