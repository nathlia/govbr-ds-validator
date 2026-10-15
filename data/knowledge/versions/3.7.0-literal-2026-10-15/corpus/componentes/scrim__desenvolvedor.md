<!--
URL: https://www.gov.br/ds/components/scrim?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/scrim/scrim-dev.md
Status da coleta: ok
-->

# Scrim

Scrims são tratamentos temporários que podem ser aplicados às superfícies dos elementos de uma interface com o objetivo de tornar o conteúdo menos proeminente.

## Dependências

Nenhuma dependência.

## Código básico

```html
<div class="br-scrim foco"></div>
```

Ou

```html
<div class="br-scrim legibilidade"></div>
```

Ou

```html
<div class="br-scrim inibicao"></div>
```

---

# Anatomia do componente

Este componente é formado pelos seguintes elementos:

- `br-scrim` (obrigatório): container do componente

A classe `br-scrim` é obrigatória e seu uso deve estar associado com um tipo de scrim:

- `foco` : mudança de foco entre um elemento e outro
- `legibilidade` : quando um texto precisa ser aplicado sobre um superfície e o contraste fundo/texto não é suficiente para gerar contraste acessível
- `inibicao` : simular elementos para o estado de desativado

O uso do componente scrim deve feito através de sua aplicação em uma `<div>` por cima dos demais elementos, ou seja, essa classe envolverá os elementos que passarão a receber o efeito scrim.

---

# Variações de Scrim

## Foco

Usado principalmente quando um novo elemento surge na tela e necessita de uma atenção especial do usuário. Os elementos ou regiões que não requerem atenção do usuário ficam escuros, enquanto o novo elemento ganha atenção total.

Para usar botão fechamento colocar atributo `data-dismiss=id` com id do scrim no elemento que vai fechar o scrim

Exemplo de uso:

```html
<div class="br-scrim foco" onclick="off()" id="exemploscrim">
  <div class="br-modal medium">
    <div class="br-modal-dialog">
      <div class="br-modal-content">
        <div class="br-modal-body">
          <p>Conteúdo</p>
        </div>
        <div class="br-modal-footer justify-content-end">
          <button class="br-button small" type="button" data-dismiss="exemploscrim" secondary>Ação 1</button>
          <button class="br-button small" type="button" primary>Ação 2</button>
        </div>
      </div>
    </div>
  </div>
</div>
```

## Legibilidade

Usados como overlay para melhorar o constraste do texto sobre qualquer superfície, seja ela imagem ou não.

A legibilidade do texto deve ser feita com o uso da classe `scrim-text` , que se encarregará de posicionar o texto corretamente na tela.

Exemplo de uso:

```html
<div class="br-scrim legibilidade">
  <div class="img">
    <div class="scrim-text">Texto</div>
  </div>
</div>
```

## Inibição

Por possuir um comportamento que impede a interação de elemento soprepostos, o scrim pode ser usado para simular o estado desativado de elementos dentro de uma área.

A principal característica neste modo, é que o elemento que recebe o scrim ficará visualmente desativado, simulando transparência em relação ao fundo.

A tag com a classe `br-scrim inibicao` , responsável por realizar o correto posicionamento do scrim inibição, deve encapsular o elemento desejado.

Exemplo de uso:

```html
<div class="br-scrim inibicao">Com Scrim Inibição</div>
```

---

# Estados

O scrim do tipo `foco` por padrão possui seu estado inativo. Para definir que está ativo, usar a classe:

- `active`

**Exemplo**:

```html
scrim = document.getElementsByClassName("foco")[0]; function on() { scrim.classList.add("active"); } function off() {
scrim.classList.remove("active"); }
```

---

# Regras especiais

**Cuidado**: ao utilizar o scrim do tipo `legibilidade` , não criar obstáculos para o usuário realizar uma busca ou utilizar a área de acessibilidade. Deve existir uma boa justificativa para impedir acesso a essas áreas de suporte.

---
