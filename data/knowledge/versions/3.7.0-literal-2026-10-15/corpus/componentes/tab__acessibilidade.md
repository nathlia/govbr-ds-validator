<!--
URL: https://www.gov.br/ds/components/tab?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/tab/tab-access.md
Status da coleta: ok
-->

# *Tab* (Abas)

As *Tabs* (Abas) são Componentes de Navegação em Interface que tem a função de organizar o conteúdo da página em categorias ou seções, oferecendo maior usabilidade ao usuário.

# Acessibilidade no Tab

## Navegação e Comportamento

- Certifique-se de que as *tabs* possam ser acessadas e navegadas pelo teclado, sem a ajuda do *mouse*. Isto visa auxiliar usuários de leitores de tela;

- Os usuários devem conseguir navegar pelas abas através do teclado por meio das teclas `Tab` e setas direcionais `left` e `right`;

- Ao acessar o componente *tabs*, o foco inicial deve cair sobre a primeira aba interativa;

- Os itens do componente *tabs* podem ser acionadas por meio das teclas `Enter` ou `Space`;

- Como recursos **opcionais** de navegação por teclado, pode-se utilizar as teclas `Home` e `End` para mover o foco para a primeira e para a última aba respectivamente.

## Recomendações para Estilo e Design

- Certifique-se de que cada aba contenha um rótulo claro e útil, de modo que seja fácil para o usuário entender o conteúdo que se encontra dentro da aba;

- Quando o usuário navegar pelas abas com a tecla `Tab`, o foco do teclado deve ser visível para que fique claro qual aba está selecionada. Por isso, é importante observar as informações sobre os estados das abas na diretriz do componente;

- Forneça um *feedback* visual claro e distinguível para a aba ativa, seguindo as recomendações de estados na diretriz do componente. Se possível, forneça *feedback* sonoro para usuários que usam tecnologias assistivas;

- É importante oferecer aos usuários de dispositivos móveis uma área mínima de toque de `44px`;

- Caso o número de abas não caibam na largura da tela - recorrente em dispositivos móveis - ofereça o recurso de rolagem horizontal. Isto permite que o usuário acesse todo conteúdo disponível.

## Recomendações para Código

- Use marcação semântica adequada, como a propriedade `role = tablist` para a *tag* `<ul>` na raiz do componente;

- Para as seções de conteúdo, podem ser usadas as *tags* `<section>` ou `<div>`, recebendo a propriedade `role = tabpanel`;

- Ao usar a *tag* `<section>` é uma boa prática fazer uso de um título com a *tag* correspondente `<h1>`, `<h2>`, etc. Uma alternativa é usar a *tag* `<div>` caso isso não seja possível;

- Relacione semanticamente o item de aba à seção de conteúdo correspondente: utilize a propriedade `role = tab` nos *links* das abas e um `id` próprio, atribuindo o valor deste `id` à propriedade `aria-labelledby` na seção de conteúdo correspondente;

- Utilize o atributo `aria-selected`com valor `true` para aba ativa e `aria-selected`com valor `false` para abas não ativas;

- Recomenda-se organizar o componente *tab* em uma estrutura de código semântica, contendo *tags* como `<nav>`, `<ul>`, `<li>`, `<a>` ou `<button>`.

Observe o exemplo abaixo:

```html
<nav>
  <ul role="tablist">
    <li>
      <a role="tab" href="#sessao1" id="aba1" aria-selected="true">Aba 1</a>
    </li>
    <li>
      <a role="tab" href="#sessao2" id="aba2" aria-selected="false">Aba 2</a>
    </li>
  </ul>
</nav>
<section role="tabpanel" id="sessao1" aria-labelledby="aba1">
  <h2>Sessão de Conteúdo 1</h2>
  ...
</section>
<section role="tabpanel" id="sessao2" aria-labelledby="aba2" hidden>
  <h2>Sessão de Conteúdo 2</h2>
  ...
</section>
```

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [Carbon Design System](https://carbondesignsystem.com/components/tabs/accessibility)
- [Material Design System](https://m3.material.io/components/tabs/accessibility)
- [Acessibilidade Digital - UFRGS](https://www.ufrgs.br/acessibilidadedigital/abas-tabs-acessiveis/)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
