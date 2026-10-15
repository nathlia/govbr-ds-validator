<!--
URL: https://www.gov.br/ds/components/carousel?tab=desenvolvedor
Aba: desenvolvedor
Data de acesso: 2026-10-15
Fonte oficial congelada: core
Commit: 20173bf222dbdc54de2b1c1df278c7b6f1935384
Caminho-fonte: docs/components/carousel/carousel-dev.md
Status da coleta: ok
-->

# *Carousel* (Carrossel)

*Carousel* é um componente que permite que vários conteúdos ocupem um único espaço na tela e que o usuário navegue por eles de forma sequencial e controlada.

<!-- [version]: # (1.0.0) -->

## Como usar

```html
<div class="br-carousel">
  <div class="carousel-button">
    <button
      class="br-button carousel-btn-prev terciary circle"
      type="button"
      aria-label="Anterior"
      aria-controls="null"
      disabled
    >
      <i class="fas fa-chevron-left" aria-hidden="true"> </i>
    </button>
  </div>
  <div class="carousel-stage">
    <div class="carousel-page" active>...</div>
  </div>
  <div class="carousel-button">
    <button class="br-button carousel-btn-next terciary circle" type="button" aria-label="Próximo" aria-controls="null">
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </div>
  <div class="carousel-step">
    <div class="br-step" data-initial="1" data-type="simple">...</div>
  </div>
</div>
```

### Propriedades obrigatórias

| Atributo                                      | Tipo             | Valor Padrão | Descrição                                     |
| --------------------------------------------- | ---------------- | ------------ | --------------------------------------------- |
| `br-carousel`                                 | classe           |              | container do componente                       |
| `carousel-button`                             | classe           |              | container dos botões de navegação             |
| `br-button carousel-btn-prev terciary circle` | classe           |              | aplicado ao componente button - botão voltar  |
| `br-button carousel-btn-next terciary circle` | classe           |              | aplicado ao componente button - botão avançar |
| `carousel-stage`                              | classe           |              | container do palco                            |
| `carousel-page`                               | classe           |              | container das páginas                         |
| `carousel-step`                               | classe           |              | container do component step                   |
| `br-step`                                     | classe           |              | componente step                               |
| `data-type`                                   | atributo(string) | simple       | modificador do step (*simple, text*)          |

### Propriedades Adicionais

| Atributo          | Tipo               | Valor Padrão | Descrição                                                                                                   |
| ----------------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `data-mobile-nav` | atributo (boolean) | \**omitido*  | aplicada ao container do componente, define se os botões de navegação serão visualidos no breakpoint mobile |
| `data-stage`      | atributo(string)   | \**omitido*  | aplicada ao container do componente, define as variantes do palco (*in, out, hibw, hibh*)                   |
| `data-circular`   | atributo (boolean) | true         | habilita o carousel do tipo circular                                                                        |

## Estados

| Elemento   | Tipo     | Descrição                                                                                                |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `active`   | atributo | estado da página atual ("carousel-page") do palco                                                        |
| `disabled` | atributo | visual do botão de navegação ("br-buton") quando chega aos limites do palco (desabilita a ação do botão) |

Esses estados podem ser aplicados unicamente nos elementos internos do componente, e são modificados pelo script do componente mediante sua navegação.

## Regras especiais

- Ao navegar até os limites do palco o botão de navegação correspondente, anterior ou próximo, é desabilitado
- No layout móvel por padrão os botões de navegação são ocultados, para ativá-los é necessário usar o atributo *data-mobile-nav*
- Na necesidade de se destacar melhor os botões de naveção pode ser usada a classe *secondary* ao invés da *terciary* (padrão)
- O carousel vem configurado com uma altura mínima de 400px por padrão. Para alterar essa altura modifique o valor da seguinte variável/token CSS: *--carousel-min-height*

## Próximos Passos

| Nome                  | Documentação de Design | Desenvolvimento |
| --------------------- | ---------------------- | --------------- |
| Reprodução Automática | Feito                  | Fazendo         |
| Múltiplas Páginas     | Feito                  | Fazendo         |

LEGENDA:

- Não planejado: A necessidade foi identificada, mas ainda não tem data para ser satisfeita.
- Fazendo: A equipe está trabalhando na necessidade.
- Feito: Necessidade já é satisfeita.

## Dependências

- [Button](/ds/components/button)
- [Step](/ds/components/step)

## Instanciação do Componente

### HTML

Incluir o arquivo `core.min.js` no html.

```html
<script src="node_modules/@govbr-ds/core/dist/core.min.js"></script>
```

> O arquivo core.min.js expõe um objeto chamado `core` contendo as referências para todas as classes exportadas.

## JavaScript

Usar o seguinte código JavaScript para instanciar a classe `BRCarousel`, passando os seguintes parâmetros:

- Nome da classe (br-carousel)
- Objeto referenciando a raiz do componente DOM

```javascript
const carouselList = []
for (const brCarousel of window.document.querySelectorAll('.br-carousel')) {
  carouselList.push(new core.BRCarousel('br-carousel', brCarousel))
}
```
