<!--
URL: https://www.gov.br/ds/guias/acessibilidade-html
Aba: não se aplica
Data de acesso: 2026-10-15
Fonte oficial congelada: site-content
Commit: 953ea2f3bc1c7c849915317e523cd2fc499e3db1
Caminho-fonte: guias/acessibilidade-html/acessibilidade-html.md
Status da coleta: ok
-->

Esse documento tem o objetivo de definir boas práticas de construção do código HTML seguindo as diretrizes do [Modelo de Acessibilidade em Governo Eletrônico - eMAG][1].

## Modelo de Acessibilidade em Governo Eletrônico - eMAG

O [Modelo de Acessibilidade em Governo Eletrônico -eMAG][1] tem o compromisso de ser o norteador no desenvolvimento e na adaptação de conteúdos digitais do governo federal, garantindo o acesso a todos.

As recomendações do [eMAG][1] permitem que a implementação da acessibilidade digital seja conduzida de forma padronizada, de fácil implementação, coerente com as necessidades brasileiras e em conformidade com os padrões internacionais.

O eMAG define o processo para desenvolver um site acessível em três passos:

1. Seguir os padrões Web
1. Seguir as diretrizes ou recomendações de acessibilidade
1. Realizar a avaliação de acessibilidade

### Padrões Web

Segundo o eMAG, para se criar um ambiente online efetivamente acessível é necessário, primeiramente, que o código esteja dentro dos padrões Web internacionais definidos pelo [World Wide Web Consortium - W3C][2].

Os padrões de desenvolvimento Web do W3C, ou Web Standards, são um conjunto de recomendações que visam padronizar o conteúdo Web, possibilitando melhores práticas no desenvolvimento de páginas da Web.

Dessa forma, um código HTML escrito de acordo com os padrões de desenvolvimento Web, deve seguir as normas HTML definidas pelo W3C, seguindo as regras de formatação sintática.

É importante, também, que o código seja semanticamente correto, ou seja, cada elemento deve ser utilizado de acordo com seu significado apropriado, valor e propósito.

### Recomendações de Acessibilidade

Segundo o eMAG, as diretrizes ou recomendações de acessibilidade explicam como tornar o conteúdo Web acessível a todas as pessoas, destinando-se aos criadores de conteúdo Web (autores de páginas e criadores de sites) e aos programadores de ferramentas para criação de conteúdo.

O eMAG se baseia nas recomendações contidas no documento [Web Content Accessibility Guidelines - WCAG][3], atualmente em sua versão 2.1, desenvolvida pelo consórcio W3C a partir da criação do [Web Accessibility Initiative - WAI][4], contendo as recomendações de acessibilidade para conteúdo Web.

O WAI ainda desenvolveu especificações para aplicações Web Rica chamado [Accessible Rich Internet Applications - ARIA][5], atualmente na versão 1.1, que provê um framework para melhorar a acessibilidade e a interoperabilidade de conteúdos web e aplicações.

### Avaliação de Acessibilidade

O eMAG trás a necessidade de se avaliar a construção do ambiente online de acordo com os padrões Web e as diretrizes de acessibilidade.

No caso dos padrões Web, há validadores automáticos. No que diz respeito às diretrizes de acessibilidade, é necessário realizar, inicialmente, uma validação automática, que é realizada através de softwares ou serviços online que ajudam a determinar se um site respeitou ou não as recomendações de acessibilidade, gerando um relatório de erros.

É preciso salientar que, apesar de tornarem a avaliação de acessibilidade mais rápida e menos trabalhosa, os validadores automáticos por si só não determinam se um site está ou não acessível. Para uma avaliação efetiva, é necessária uma posterior validação manual.

A validação manual é necessária porque nem todos os problemas de acessibilidade em um site são detectados mecanicamente pelos validadores. Para a validação manual, são utilizados checklists de validação humana.

## Boas Práticas de Construção do HTML seguindo o eMAG

### Use **HTML válido**

> HTML Válido segue a gramática, vocabulário e sintaxe da linguagem HTML.

#### Benefícios de um HTML válido

- Melhor comunicação e menos chance de má interpretação
- É mais provável que seja exibido de maneira correta e previsível, independentemente do navegador ou do tipo de dispositivo
- É mais provável que seja funcional para usuários com problemas de acessibilidade
- Reduz possíveis interpretações erradas por mecanismos de pesquisa (de dados estruturados, metadados, idioma, codificação, etc.)
- É mais provável que seja renderizado mais rapidamente em alguns cenários (o usuário pode ver a página mais rapidamente)

### Use **HTML semântico**

Use os elementos HTML **pelo o que eles são** e não pela forma de que vão aparecer no navegador. Isso é conhecido como [HTML Semântico][7].

> HTML Semântico ou marcação semântica é HTML que introduz significado para a página da Web em vez de apenas apresentação. Por exemplo, uma tag `<p>` indica que o texto em anexo é um parágrafo. Isso é semântico e de apresentação, porque as pessoas sabem quais são os parágrafos e os navegadores sabem como exibi-los.

### Organize o código HTML de **forma lógica e semântica**

Os elementos devem ser apresentados usando uma ordem compreensível e correspondendo ao conteúdo desejado, ou seja, cada elemento HTML deve ser utilizado para o fim que ele foi criado.

A [Especificação HTML5 do W3C][8] trás a semântica dos elementos da linguagem HTML5. Como o eMAG se baseia nessa especificação, a semântica utilizada é a que está definida nessa especificação.

É interessante que o desenvolvedor tenha familiaridade com essa especificação a fim de compreender a semântica dos elementos HTML e, assim, facilitar a sua utilização.

Como exemplo pode-se citar:

1. Usar cabeçalhos de acordo com sua hierarquia

   Os níveis de cabeçalho (elementos HTML H1 a H6) devem ser utilizados de forma hierárquica, pois organizam a ordem de importância e subordinação dos conteúdos, facilitando a leitura e compreensão.

   Conceitualmente, existem seis níveis de títulos, sendo o H1 o mais alto, ou seja, deverá corresponder ao conteúdo principal da página, assim é recomendável que toda página tenha apenas um H1. Já os níveis do H2 ao H6 poderão ser utilizados mais de uma vez na página, mas sem excesso e com lógica textual, obedecendo uma hierarquia.

   ```html
   <h1>1º nível</h1>
   <h2>2º nível</h2>
   <h3>3º nível</h3>
   <h4>4º nível</h4>
   <h5>5º nível</h5>
   <h6>6º nível</h6>
   ```

2. Usar listas de acordo com sua finalidade

   O elemento HTML `ul` (ou elemento HTML de Lista desordenada) representa uma lista de itens sem ordem rígida, isto é, uma coleção de itens que não trazem uma ordenação numérica e as suas posições, nessa lista, são irrelevantes.

   O Elemento HTML `ol` (ou Elemento HTML de lista ordenada) representa uma lista de itens ordenados. De forma característica esses itens ordenados em uma lista são mostrados com uma contagem que os precede, que pode ser de qualquer tipo, como numerais, letras, algarismos romanos, ou simples símbolos.

   ```html
   <!-- Lista desordenada -->
   <ul>
     <li>primeiro item</li>
     <li>segundo item</li>
     <li>terceiro item</li>
   </ul>

   <!-- Lista ordenada -->
   <ol>
     <li>primeiro item</li>
     <li>segundo item</li>
     <li>terceiro item</li>
   </ol>
   ```

### NÃO utilizar tabelas para diagramação

As tabelas devem ser utilizadas apenas para dados tabulares e não para efeitos de disposição dos elementos na página. Para este fim, utilize as folhas de estilo.

```html
<html>
  <head> </head>

  <body>
    <div id="topo" role="”banner”">
      <div>
        <!--barra de acessibilidade-->
      </div>
      <h1>Exemplo sem tabelas!</h1>
    </div>
    <div id="menu" role="”navigation”">
      <ul>
        <li><a href="menu1.html">Menu 1</a></li>
        <li><a href="menu2.html">Menu 2</a></li>
        <li><a href="menu3.html">Menu 3</a></li>
        <li><a href="menu4.html">Menu 4</a></li>
      </ul>
    </div>
    <div id="conteudo" role="main">
      <!--conteúdo principal da página-->
      <div id="lateral">
        <!--conteúdo da lateral da página-->
      </div>
      <div id="rodape" role="contentinfo">
        <!--direitos autorais-->
        <address>
          <!--e-mail de contato-->
        </address>
      </div>
    </div>
  </body>
</html>
```

### Identificar o idioma principal da página

Deve-se identificar o principal idioma utilizado nos documentos. A identificação é feita por meio do **atributo lang** do HTML. Ele deve ser declarado em **todas as páginas**, pois além de auxiliar na acessibilidade do conteúdo, também permite melhor indexação pelos motores de busca.

### Informar mudança de idioma no conteúdo

Se algum elemento de uma página possuir conteúdo em um idioma diferente do principal, este deverá estar identificado pelo **atributo lang**. Essa recomendação não se aplica para nomes próprios ou termos técnicos que sejam compreendidos no contexto.

/*spell-checker: disable*/

```html
<p lang="de">
  Da dachte der Herr daran, ihn aus dem Futter zu schaffen, aber der Esel merkte, daß kein guter Wind wehte, lief fort
  und machte sich auf den Weg nach Bremen: dort, meinte er, könnte er ja Stadtmusikant werden.
</p>
```

/*spellchecker: enable*/

### Fornecer alternativa em texto para as imagens do site

Deve ser fornecida uma descrição para as imagens da página, utilizando-se, para tanto o **atributo alt**.

```html
<img src="foto-porto-alegre.jpg" alt="Foto de uma bicicleta de carga verde com caixas laranjas encostada numa parede" />

<a href="http://www.dominiopublico.gov.br/">
  <img src="guia.png" alt="Guia de Serviços – Consulte serviços públicos de forma fácil" />
</a>
```

### Associar etiquetas aos campos do formulário

Labels de formulários DEVEM ser usados. Os leitores de tela usam os labels para informar ao usuário sobre o campo do formulário.

```html
<label for="nome">Nome: </label>
<input type="text" name="nome" id="nome" />

<label for="msg">Mensagem: </label>
<textarea name="msg" id="msg">Digite sua mensagem</textarea>

<label for="receber">Deseja receber nossa newsletter?</label>
<input type="checkbox" id="receber" name="receber" />
```

## Referências

- [Modelo de Acessibilidade em Governo Eletrônico - eMAG][1]
- [World Wide Web Consortium - W3C][2]
- [Web Content Accessibility Guidelines - WCAG][3]
- [Web Accessibility Initiative - WAI][4]
- [Accessible Rich Internet Applications - ARIA][5]
- [HTML Semântico][7]
- [Especificação HTML5 do W3C][8]

[1]: http://emag.governoeletronico.gov.br/
[2]: https://www.w3.org/
[3]: https://www.w3.org/TR/WCAG21/
[4]: https://www.w3.org/WAI/
[5]: https://www.w3.org/TR/wai-aria/
[7]: https://www.thoughtco.com/why-use-semantic-html-3468271
[8]: https://www.w3.org/TR/html52/
