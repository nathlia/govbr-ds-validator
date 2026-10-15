<!--
URL: https://www.gov.br/ds/components/signin?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/signin/signin-dev.md
Status da coleta: ok
-->

# *Sign-in* (Autenticação)

*Sign-in* é um botão que envia um ID de *login* do usuário e senha ao servidor para autenticação e é utilizado para direcionar o usuário a uma área de confirmação de acesso que utiliza dados do usuário previamente cadastrados.

## Como usar

### Uso de imagem

```html
<button class="br-button sign-in secondary" type="button">
  Entrar com
  <img src="..." alt="..." />
</button>
```

### Uso de texto

```html
<button class="br-button sign-in primary" type="button">
  Entrar com
  <span class="text-black">gov.br</span>
</button>
```

### Uso no gov.br

```html
<button class="br-button sign-in primary" type="button">
  <i class="fas fa-user" aria-hidden="true"></i>
  Entrar
</button>
```

### Propriedades obrigatórias

| Atributo | Valor padrão | Descrição                |
| -------- | ------------ | ------------------------ |
| class    | br-button    | Container do componente  |
| class    | sign-in      | Estiliza o botão sign-in |
| class    | primary      | Aplica ênfase primária   |
| class    | secondary    | Aplica ênfase secundária |

### Propriedades Adicionais

| Atributo | Valor padrão | Descrição                          |
| -------- | ------------ | ---------------------------------- |
| class    | large        | Aplica densidade baixa             |
| class    | medium       | Aplica densidade média (padrão)    |
| class    | small        | Aplica densidade alta              |
| class    | circle       | Aplica sigin tipo icônico          |
| class    | inverted     | Aplica cor invertida(fundo escuro) |

## Acessibilidade

- Signin do tipo icônico necessita do atributo `aria-label="nome descritivo do assunto a que se refere o ícone"` e do atributo `aria-hidden="true"`

## Dependências

- [Button](/ds/components/button)
