<!--
URL: https://www.gov.br/ds/components/magicbutton?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/magicbutton/magicbutton-dev.md
Status da coleta: ok
-->

# *Magic Button* (Botão Destaque)

O componente *Magic Button* é um botão com grande apelo visual.

## Como usar

### Uso de texto

```html
<div class="br-magic-button">
  <button class="br-button" type="button">Label</button>
</div>
```

### Uso de ícone

```html
<div class="br-magic-button">
  <button class="br-button circle" type="button" aria-label="Adicionar">
    <i class="fas fa-cart-plus" aria-hidden="true"></i>
  </button>
</div>
```

### Propriedades obrigatórias

| Atributo | Valor padrão    | Descrição               |
| -------- | --------------- | ----------------------- |
| class    | br-magic-button | Container do componente |

### Propriedades Adicionais

| Atributo | Valor padrão | Descrição                       |
| -------- | ------------ | ------------------------------- |
| class    | large        | Aplica densidade baixa          |
| class    | medium       | Aplica densidade média (padrão) |
| class    | small        | Aplica densidade alta           |

## Acessibilidade

- Use `aria-label="descrição da ação"` nos botões que tenham somente ícone como conteúdo.

## Dependências

- [Button](/ds/components/button)
