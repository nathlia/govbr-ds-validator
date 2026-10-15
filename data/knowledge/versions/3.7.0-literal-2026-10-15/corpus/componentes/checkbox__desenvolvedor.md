<!--
URL: https://www.gov.br/ds/components/checkbox?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/checkbox/checkbox-dev.md
Status da coleta: ok
-->

# *Checkbox* (Caixa de Seleção)

O componente *checkbox* permite selecionar uma ou mais opções em uma lista de opções.

### Propriedades obrigatórias

| Atributo | Tipo   | Valor Padrão    | Descrição               |
| -------- | ------ | --------------- | ----------------------- |
| class    | string | **br-checkbox** | Container do componente |

### Propriedades Adicionais

| Atributo | Tipo   | Valor Padrão     | Descrição              |
| -------- | ------ | ---------------- | ---------------------- |
| class    | string | **hidden-label** | Esconde texto do label |

## Estados

| Estado     | atributo | Valores      |
| ---------- | -------- | ------------ |
| Desativado | class    | **disabled** |
| Inválido   | class    | **invalid**  |
| Válido     | class    | **valid**    |

## Informações adicionais

### Listagem horizontal

Usar Utilitários CSS [Display](ds/utilitarios/css/display) e [Espaçamento](ds/utilitarios/css/espacamento) para modificar o componente.

### Checkbox desativado

Além de adicionar a classe "disabled" ao componente, adicione também o atributo "disabled" na tag html `<input>`.

### Estado intermediário

Para usar o checkbox com o estado intermediário é necessário que os checkboxes estejam em grupo.

O grupo de checkboxes é composto por um checkbox "pai" e vários checkboxes "filhos", de tal forma que o checkbox "pai" controla a marcação dos checkboxes "filhos" e reflete o estado atual do grupo de checkboxes da seguinte forma:

- Se **todos** os checkboxes "filhos" estiverem *desmarcados*, o checkbox "pai" estará *desmarcado* também.
- Se **todos** os checkboxes "filhos" estiverem *marcados*, o checkbox "pai" estará *marcado* também,
- Se **alguns** checkboxes "filhos" estiverem *marcados* e outros *desmarcados* o checkbox "pai" estará no *estado intermediário*
- Se o checkbox "pai" for *marcado*, **todos** os checkboxes "filhos" serão marcados.
- Se o checkbox "pai" for *desmarcado*, **todos** os checkboxex "filhos" serão desmarcados.
- Se o checkbox "pai" estiver no *estado intermediário* e for selecionado, ele passa a ficar *marcado* e os checkboxex "filhos" também ficarão \*marcados"

#### Configuração do estado intermediário

Para indicar que um checkbox é "pai", deve-se incluir o atributo `data-parent` no `<input type="checkbox">, com um valor que será o nome de "amarração" do grupo.

Nos checkboxes "filhos" deve-se incluir o atributo `data-child` no `<input type="checkbox">`, com o mesmo valor passado ao atributo `data-parent`do checkbox "pai". Dessa forma os checkboxes "pai" e "filho" estarão ligados.

```html
<input type="checkbox" data-parent="check-01" />
<input type="checkbox" data-child="check-01" />
<input type="checkbox" data-child="check-01" />
<input type="checkbox" data-child="check-01" />
```

> É necessário, também, instanciar a classe BRCheckbox, para que o comportamento funcione

### JavaScript

Usar o seguinte código JavaScript para instanciar a classe BRCheckbox, passando os seguintes parãmetros:

- Nome da classe (br-checkbox)
- Objeto referenciando a raiz do componente DOM

```javascript
const checkboxList = []
for (const brCheckbox of window.document.querySelectorAll('.br-checkbox')) {
  checkboxList.push(new core.BRCheckbox('br-checkbox', brCheckbox))
}
```

### Dependências

Mais detalhes sobre o estado intermediário, pode ser obtido consultando o Utilitário JS [Checkgroup](utilitarios/js/checkgroup).
