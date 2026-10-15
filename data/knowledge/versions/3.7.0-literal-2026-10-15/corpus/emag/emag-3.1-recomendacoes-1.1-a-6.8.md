<!--
URL: https://emag.governoeletronico.gov.br/
Aba: não se aplica
Data de acesso: 2026-10-15
Status da coleta: ok
-->

#### Recomendação 1.1 – Respeitar os Padrões Web

*[Ver
WCAG 2.0 Critérios de Sucesso 4.1.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/ensure-compat-parses.html) e [Ver WCAG 2.0 Critérios de Sucesso4.1.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/ensure-compat-rsv.html)*

Os Padrões Web são recomendações do W3C (World Wide Web Consortium), as quais são destinadas a
orientar os desenvolvedores para o uso de boas práticas que tornam a web acessível para todos,
permitindo assim que os desenvolvedores criem experiências ricas, alimentadas por um vasto
armazenamento de dados, os quais estão disponíveis para qualquer dispositivo e compatíveis com
atuais e futuros agentes de usuário (ex: navegadores).

Quando tratamos de acessibilidade as principais recomendações são as de Web Design e Aplicações (<http://www.w3c.br/Padroes/WebDesignAplicacoes>), que referem-se aos padrões para o
desenvolvimento de páginas Web, incluindo HTML5 CSS, SVG, Ajax, e outras tecnologias para Aplicações
Web (WebApps), assim como o padrão internacional de acessibilidade WCAG, internacionalização e
dispositivos móveis.

Outro ponto importante no respeito aos Padrões Web é a separação de camadas. As camadas lógicas
deverão ser separadas, de acordo com o objetivo para o qual elas foram desenvolvidas. Assim, para a
camada de conteúdo devem ser utilizadas as linguagens de marcação, como HTML e xHTML. Para a camada
de apresentação visual do conteúdo, utilizam-se as folhas de estilo css em qualquer uma de suas
versões. Já para a camada que modifica o comportamento dos elementos, são utilizadas linguagens
javascript e modelos de objeto (dom).






![Camadas de um documento Web](imagens/exemplos/camadas.png)
Camadas de um documento Web



Para mais detalhes a respeito dos padrões de desenvolvimento web, ver a Cartilha de Codificação
Padrões Web e-GOV do padrão e-PWG, disponível em:
<http://www.governoeletronico.gov.br/eixos-de-atuacao/governo/epwg-padroes-web-em-governo-eletronico/cartilha-de-codificacao>.








[Voltar ao sumário](#sumario)

#### Recomendação 1.2 – Organizar o código HTML de forma lógica e semântica

*[Ver
WCAG 2.0 Critério de Sucesso 1.3.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-programmatic.html)*

O código HTML deve ser organizado de forma lógica e semântica, ou seja, apresentando os elementos em
uma ordem compreensível e correspondendo ao conteúdo desejado. Cada elemento HTML deve ser utilizado
para o fim que ele foi criado.

Assim, marcação semântica adequada deve ser utilizada para designar os cabeçalhos (h1, h2, h3), as
listas (ul, ol, dl), texto enfatizado (strong), marcação de código (code), marcação de abreviaturas
(abbr), marcação de citações longas (blockquote), etc. Dessa forma, as páginas poderão ser
apresentadas e compreendidas sem recursos de estilização, tal como as folhas de estilo. Além disso,
o código semanticamente correto é muito importante para usuários com deficiência visual, pois os
leitores de tela descrevem primeiro o tipo de elemento e depois realizam a leitura do conteúdo que
está dentro desse elemento.

Exemplo correto
<h1>Padrões Web</h1>
<ul>
<li><a href='menu1.html'>Menu 1</a></li>
<li><a href='menu2.html'>Menu 2</a></li>
</ul>
<h2>Web Semântica</h2>
<blockquote>
O poder da web está em sua universalidade.
Ser acessada por todos, independente de deficiência, é um aspecto essencial.
</blockquote>
<cite xml:lang='en'>Tim Berners Lee</cite>
Exemplo Incorreto
<h1>Padrões Web</h1>
<p><a href='menu1.html'>Menu 1</a></p>
<p><a href='menu2.html'>Menu 2</a></p>
<h2>Web Semântica</h2>
<p>
O poder da web está em sua universalidade.
Ser acessada por todos, independente de deficiência, é um aspecto essencial.
</p>
<p>Tim Berners Lee</p>
Exemplo correto em HTML5 (utilizando ARIA)
<header role='banner'>
<h1>Padrões Web</h1>
</header>
<ul>
<li><a href='menu1.html'>Menu 1</a></li>
<li><a href='menu2.html'>Menu 2</a></li>
</ul>
<h2>Web Semântica</h2>
<blockquote>
O poder da web está em sua universalidade.
Ser acessada por todos, independente de deficiência, é um aspecto essencial.
</blockquote>
<cite xml:lang='en'>Tim Berners Lee</cite>

[Ir ao exemplo navegável Recomendação 1.2](recomendacao-002.php "Ir ao exemplo navegável 1.2")



[Voltar ao sumário](#sumario)

#### Recomendação 1.3 – Utilizar corretamente os níveis de cabeçalho

*[Ver
WCAG 2.0 Critérios de Sucesso 1.3.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-programmatic.html) e [Ver WCAG 2.0 Critérios de Sucesso 2.4.10](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-headings.html)*

Os níveis de cabeçalho (elementos HTML H1 a H6) devem ser utilizados de forma hierárquica, pois
organizam a ordem de importância e subordinação dos conteúdos, facilitando a leitura e compreensão.
Além disso, muitos leitores de tela utilizam a hierarquia de cabeçalhos como uma forma de navegação
na página, pulando de um para outro, agilizando, assim, a navegação. Conceitualmente, existem seis
níveis de títulos, sendo o H1 o mais alto, ou seja, deverá corresponder ao conteúdo principal da
página, assim é recomendável que toda página tenha apenas um H1. Já os níveis do H2 ao H6 poderão
ser utilizados mais de uma vez na página, mas sem excesso e com lógica textual, obedecendo uma
hierarquia. Para compreender melhor os níveis de título pode-se tomar como exemplo um sítio de um
livro, onde o nome do livro é o H1, os capítulos são H2, os subcapítulos são H3 e assim por diante.

Exemplo
<h1>Técnicas culinárias</h1>
<p>A seguir os segredos que facilitam a vida na cozinha.</p>
<h2>Legumes, folhas e vegetais</h2>
<h3>Baba do quiabo</h3>
<p>Para eliminar a baba do quiabo, lave-o ainda inteiro, seque-o e coloque-o numa tigela com um pouco de suco de limão, deixando repousar durante 15 minutos. Depois lave ligeiramente, corte e cozinhe.</p>
<h3>Feijão</h3>
<p>1 xícara de feijão cru serve trás pessoas depois de pronto.</p>
<h3>Cenouras e aipos</h3>
<p>Para resolver o problema de cenouras e aipos meio murchos, mergulhe-os em água gelada misturada com uma colher de chá de mel por uma hora. Escorra e seque levemente depois.</p>
<h2>Congelamento e descongelamento</h2>
<h3>Carne em pedaços</h3>
<p>Para descongelar carne em pedaços inteiros coloque–a embrulhada, numa vasilha com água. Coloque sal na água e no pacote e tampe por uma hora.</p>
<h3>Carne moída</h3>
<p>Para apressar o descongelamento da carne moída, salgue a quantidade que irá usar. O sal apressa o descongelamento.</p>

[Ir ao exemplo navegável Recomendação 1.3](recomendacao-003.php "Ir ao exemplo navegável 1.3")





  

Exemplo de marcação adequada de cabeçalhos

![Portal Brasil - Ordem de cabeçahos e outros elementos semânticos](imagens/show_img.jpg)
Portal Brasil - Ordem de cabeçahos e outros elementos semânticos.

[Voltar ao sumário](#sumario)



#### Recomendação 1.4 – Ordenar de forma lógica e intuitiva a leitura e tabulação

*[Ver
WCAG 2.0 Critérios de Sucesso 1.3.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-sequence.html) e [Ver WCAG 2.0 Critérios de Sucesso  2.4.3](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-focus-order.html)*

Deve-se criar o código HTML com uma sequência lógica de leitura para percorrer links, controles de
formulários e objetos. Essa sequência é determinada pela ordem que se encontra no código HTML.

É recomendável disponibilizar o bloco do conteúdo principal da página antes do bloco de menu. Isso
facilita o acesso por quem navega via teclado, permitindo um acesso mais ágil, sem a necessidade de
navegar por todos os itens de menu antes de chegar ao conteúdo. Apesar de atalhos (como links e
teclas) auxiliarem nesse sentido, alguns usuários não sabem e podem ser de difícil utilização para
pessoas com deficiência motora. Algumas das formas não funcionam em interfaces mais simples, como o
WebVox do DOSVOX. Lembrando que ao utilizar CSS, visualmente, os blocos de menu e conteúdo podem ser
dispostos em qualquer local da página.

Exemplo: bloco de conteúdo antes do bloco de menu
<body>
<div id=”cabecalho”>
...
<div id=”conteudo”>
<div id=”menu”>
<div id=”rodape”>
</body>

**OBS:** Em alguns casos, pode-se forçar a navegação via atributo tabindex. No entanto,
se houver a necessidade de utilizar o tabindex, o mesmo deverá ser utilizado com a semântica correta
e ser verificado manualmente se o fluxo fornecido é realmente o desejado. O uso do tabindex pode
resultar em uma ordem e tabulação inconsistente.



[Voltar ao sumário](#sumario)

#### Recomendação 1.5 – Fornecer âncoras para ir direto a um bloco de conteúdo

*[Ver
WCAG 2.0 Critério de Sucesso 2.4.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-skip.html)*

Devem ser fornecidas âncoras, disponíveis na barra de acessibilidade, que apontem para links
relevantes presentes na mesma página. Assim, é possível ir ao bloco de conteúdo desejado. Os links
devem ser colocados em lugares estratégicos da página, como no início e fim do conteúdo e início de
fim do menu. ***É importante ressaltar que o primeiro link da página deve ser o de ir para
o conteúdo***.

Para facilitar a utilização das âncoras, podem ser disponibilizados atalhos por teclado, utilizando o
atributo accesskey nos links relevantes. Não pode haver repetição do mesmo accesskey em uma página.
Para o governo federal são recomendados atalhos para o menu principal, para o conteúdo e para a
caixa de pesquisa. Maiores detalhes a esse respeito podem ser encontrados no *capítulo 3 –
Elementos de acessibilidade nas páginas do Governo Federal.*

Devem ser utilizados ambos os atributos name e id para que as âncoras funcionem em todos os
navegadores e tecnologias assistivas, tanto textuais quanto gráficos, já que há os que suportam
ambos os atributos e os que suportam apenas um deles.

Os links indicadores de início e fim de conteúdo e início e fim de menu podem estar ocultos na página
utilizando folhas de estilo. No entanto, é necessário tomar o cuidado de ocultá-los de forma que
eles continuem acessíveis aos leitores de tela. Os mecanismos para ocultar elementos e seus efeitos
na acessibilidade são os seguintes:

Atributos em CSS para ocultar elementos de acessibilidade

| CSS | Efeito na Tela | Efeito na Acessibilidade |
| visibility:hidden; | O elemento fica oculto, mas continua a ocupar o espaço que normalmente ocuparia | O conteúdo é ignorado pelos leitores de tela |
| display:none; | O elemento fica oculto e não ocupa espaço | O conteúdo é ignorado pelos leitores de tela |
| height: 0; width: 0; overflow: hidden; | O elemento fica oculto e não ocupa espaço | O conteúdo é ignorado pelos leitores de tela |
| text-indent: -999em; | O conteúdo é movido para “fora da tela”, não sendo mais visível, mas links podem ser focalizados de maneira imprevisível | Os leitores de tela acessam o conteúdo, mas somente texto e elementos inline |
| position: absolute; left: -999em; | O conteúdo é removido de sua posição, não ocupando espaço e é movido para “fora da tela”, ficando oculto | Os leitores de tela acessam o conteúdo |

Tabela 1: Atributos em CSS para ocultar elementos de acessibilidade

Exemplo

Topo da Página (na barra de acessibilidade)
<ul id="atalhos">
<li><a href="#irconteudo" accesskey="1">Ir Conteudo[1]</a></li>
<li><a href="#irmenu" accesskey="2">Ir para menu principal[2]</a></li>
<li><a href="#irbusca">Ir para busca [3]</a></li>
</ul>
Conteúdo da Página
<div>
<a href="#" id="irconteudo" class="oculto">Início do conteúdo</a>
<!-- Conteúdo →
</div>
Menu Principal da Página
<div>
<a href="#" id="irmenu" class="oculto">Início do menu</a>
<!--itens de menu -->
</div>
Formulário
<form action="#"method="post">
<fieldset>
<legend>Buscar</legend>
<label for="busca">Pesquise aqui</label>
<input type="text" href="#" id="irbusca" value="Pesquise aqui" />
<input type="submit" value="Buscar" class="buscar" name="buscar" />
</fieldset>
</form>

[Ir ao exemplo navegável Recomendação 1.5](recomendacao-006.php "Ir ao exemplo navegável 1.5")



[Voltar ao sumário](#sumario)

#### Recomendação 1.6 – Não utilizar tabelas para diagramação

*[Ver
WCAG 2.0 Critério de Sucesso 1.3.1 (Técnica H51)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-programmatic.html)*

As tabelas devem ser utilizadas apenas para dados tabulares e não para efeitos de disposição dos
elementos na página. Para este fim, utilize as folhas de estilo.

Exemplo correto – Utilização de tableless para diagramação
</head>
<body>
<div id="topo" role=”banner”>
<div>
<!--barra de acessibilidade-->
</div>
<h1>Exemplo sem tabelas!</h1>
</div>
<div id="menu" role=”navigation”>
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
</div></div>
</body>
</html>

Exemplo incorreto - Utilização de tabela para leiaute
</head>
<body>
<table border="1">
<tr id="topo">
<td colspan="2">
<!--barra de acessibilidade-->
</td>
<td colspan="3">
<h1>Exemplo com tabela</h1>
</td>
</tr>
<tr id="menu">
<td><a href="menu1.html">Menu 1</a></td>
<td><a href="menu2.html">Menu 2</a></td>
<td><a href="menu3.html">Menu 3</a></td>
<td><a href="menu4.html">Menu 4</a></td>
</tr>
<tr id="conteudo">
<td colspan="4" id="central">
<!--conteúdo principal da página-->
</td>
<td id="lateral">
<!--conteúdo da lateral da página-->
</td>
</tr>
<tr id="rodape">
<td colspan="2">
<!--direitos autorais-->
</td>
<td colspan="3">
<!--e-mail de contato-->
</td>
</tr>
</table>
</body>

[Voltar ao sumário](#sumario)

#### Recomendação 1.7 – Separar links adjacentes

*[Ver
WCAG 2.0 Critério de Sucesso 1.3.1 (Técnica H48)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-programmatic.html)*

Links adjacentes devem ser separados por mais do que simples espaços, para que não fiquem confusos,
em especial para usuários que utilizam leitor de tela. Para isso, é recomendado o uso de listas,
onde cada elemento dentro da lista é um link. As listas podem ser estilizadas visualmente com CSS
para que os itens sejam mostrados da maneira desejada, como um ao lado do outro.

Caso os links estejam no meio de um parágrafo de conteúdo texto, pode-se utilizar vírgulas,
parênteses, colchetes, pipe, entre outros, para fazer a separação.

Exemplo correto
<ul id="menu">
<li> <a href="home.html">Home</a></li>
<li> <a href="pesquisa.html">Pesquisa</a></li>
<li> <a href="mapasite.html">Mapa do Site</a></li>
</ul>
<!-- Conteudo do Site -->

Exemplo incorreto
<p id="menu">
<a href="#menu">Pular o menu</a><br>
<a href="home.html">Home</a><br>
<a href="pesquisa.html">Pesquisa</a><br>
<a href="mapasite.html">Mapa do Site</a>
</p>

Em HTML5 e ARIA
<div id="menu" role="menu">  
<div  role="menuitem"> <a href="home.html">Home</a></div>     
<div  role="menuitem"> <a href="pesquisa.html">Pesquisa</a></div>     
<div  role="menuitem"> <a href="mapasite.html">Mapa do Site</a></div>  
</div>

[Ir ao exemplo navegável Recomendação 1.7](recomendacao-008.php "Ir ao exemplo navegável 1.7")

  

Existem três roles da especificação ARIA que podem ser utilizados para as listas: o role navigation,
que indica o menu principal do site (esse role possui a mesma função que a elemento NAV do HTML5). O
segundo e o terceiro roles são muito semelhantes, o role menu e o role menubar. Os dois possuem a
função de indicar menus que não são o principal da página. A diferença entre os dois é que o role
menu possui um sentindo mais geral enquanto o menubar é ideal para criações de menu na horizontal.
Um exemplo de uso de menu pode ser a utilização de sub-menus dentro do menu principal. Os roles menu
e menubar podem possuir filhos com role menuitem para indicar que se trata de um item daquele menu.

Exemplo:
</head>  
<body>  
<header id="topo" role="banner">  
        <div>  
            <!--barra de acessibilidade-->  
        </div>  
        <h1>Exemplo com tabela</h1>  
    </header>  
    <nav id="menu" role="navigation">  
<ul>
         <li><a href="menu1.html">Menu 1</a></li>  
         <li><a href="menu2.html">Menu 2</a></li>  
         <li><a href="menu3.html">Menu 3</a></li>  
         <li><a href="menu4.html">Menu 4</a></li>  
         <li><a href="menu5.html">Menu 5</a></li>  
<ul>
    </nav>  
    <div role="main">  
        <div id="central">  
            <!--conteúdo principal da página-->  
        </div>  
        <div id="lateral">  
            <!--conteúdo da lateral da página-->  
        </div>  
    </div>    
    <footer id="rodape" role="contentinfo">  
        <p><!--direitos autorais--></p>  
        <p><!--e-mail de contato--></p>  
    </footer>    
</body>  
</html>



[Voltar ao sumário](#sumario)

#### Recomendação 1.8 – Dividir as áreas de informação

*[Ver
WCAG 2.0 Critério de Sucesso 3.2.3 (Técnica G61)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/consistent-behavior-consistent-locations.html)*

Áreas de informação devem ser divididas em grupos fáceis de gerenciar. As divisões mais comuns são
“topo”, “conteúdo”, “menu” e “rodapé”. Nas páginas internas deve-se manter uma mesma divisão para
que o usuário se familiarize mais rapidamente com a estrutura do sítio. É importante destacar,
entretanto, que a página inicial pode ter uma divisão diferente das páginas internas, pois
normalmente ela contém mais elementos. O exemplo a seguir mostra a divisão da página inicial de um
sítio contendo os blocos “topo”, “menu”, “conteúdo” e “rodapé”, além da barra de acessibilidade
contendo os atalhos.

![Exemplo de divisão de blocos de conteúdo](imagens/areas.png)
Exemplo de divisão de blocos de conteúdo.

Exemplo
<div id="topo">
<a href="#inicioTopo" id="inicioTopo">Topo</a>
<h1>NOME DA INSTITUIÇÃO</h1>
<div id="barraAcessibilidade">
<p>Barra de Acessibilidade</p>
<ul>
<li><a href="#inicioConteudo">Ir para conteúdo [1]</a></li>
<li><a href="#inicioMenu">Ir para menu principal [2]</a></li>
<li><a href="#busca">Ir para Busca [3]</a></li>
</ul>
</div>
</div>
<div id="menu">
<a href="#inicioMenu" id="inicioMenu" accesskey="2">Menu</a>
<ul>
<li>Itens de menu</li>
<li>...</li>
</ul>
</div>
<div id="conteudo">
<a href="#inicioConteudo" id="inicioConteudo" accesskey="1">Conteúdo</a>
<form action="#" method="post">
<fieldset>
<legend>Buscar</legend>
<label for="busca">Pesquise aqui</label>
<input type="text" id="busca" name="busca" accesskey="3" value="Pesquise aqui" />
<input type="submit" value="Buscar" class="buscar" name="buscar" />
</fieldset>
</form>
<h2>BEM VINDO</h2>
<p>Seja bem vindo ao nosso site.</p>
</div>
<div id="rodape">
<a href="#inicioRodape" id="inicioRodape">Rodapé</a>
<address> Rua XXX</address>
</div>

A divisão em blocos de conteúdo representa a base para a utilização dos atalhos, permitindo que o
usuário tenha rápido acesso à área desejada. Para mais detalhes sobre a barra de acessibilidade e os
atalhos, ver capítulo 4 – Elementos padronizados de acessibilidade digital no Governo Federal.

É importante que as diversas páginas de um sítio possuam um estilo de apresentação coerente e
sistemático, mantendo-se um padrão de estrutura. Assim, elementos principais de navegação deverão
ser mantidos na mesma posição em todas as páginas, com exceção da página inicial que, muitas vezes,
apresenta uma estrutura diferenciada.

**Exemplo**

Um sítio possui um logotipo, um título, um formulário de pesquisa e uma barra de navegação. Esses
elementos aparecem na mesma ordem relativa em cada página do sítio em que se repetem. Em uma das
páginas, não há o formulário de pesquisa, mas o restante dos itens continua na mesma ordem.

**Em HTML5 e ARIA**

As elementos estruturais do HTML HEADER, NAV, SECTION, ARTICLE, ASIDE e FOOTER já são interpretadas
pela maioria dos leitores de tela. No entanto, é importante utilizar os landmarks roles de ARIA
associados a elas, para garantir que todos os recursos de tecnologia assistiva realizem a
interpretação da informação. Apesar de a informação ficar duplicada, os leitores de tela que
reconhecem o HTML5 darão preferência ao HTML e, dessa forma, não irão ler duas vezes a mesma
informação.

Exemplos de elementos estruturais no HTML5:

- <header>

  Contém informações introdutórias para uma página ou para uma seção dela.
- <nav>

  É utilizada para seções da página que contenham links para outras páginas ou seções, como
  o menu principal, por exemplo.
- <section>

  Representa uma seção genérica ou uma seção que contém uma aplicação. Funciona de maneira
  parecida com a elemento <div>,
  separando seções do documento.
- <article>

  Representa uma seção da página independente, como uma postagem em um blog, um comentário
  em um fórum, entre outros.
- <aside>

  Contém conteúdo relacionado à área principal do documento.
- <footer>

  É utilizada para demarcar o rodapé da página ou de uma seção do conteúdo.

Exemplos de *landmark* roles em ARIA:

- Banner

  Contém informações voltadas ao site como um todo e não somente à página. Representa as
  informações normalmente contidas no topo das páginas, como o título e o logo do site e a
  barra de acessibilidade.
- Complementary

  Conteúdo adicional ou complementar ao conteúdo principal.
- Contentinfo

  Contém informações gerais do site como um todo, que normalmente aparecem no rodapé, como
  copyright, contato, etc.
- Main

  Contém o conteúdo principal da página.
- Navigation

  Contém os links para navegar pelas partes do site ou da página, como é o caso do menu.
- Search

  Esta seção contém o formulário de busca do site.

O elemento HEADER pode ser utilizado várias vezes em uma mesma página sem problemas de semântica,
pois ele possui duas funções diferentes. A primeira é a de conter as informações do topo da página
e, para isso, deverá ser utilizado o role banner. A segunda função é para indicar um cabeçalho de
seção e pode ser utilizada várias vezes no documento. Neste caso, deve ser utilizado o role heading
e, preferencialmente, deverá conter algum nível de título.

O conteúdo principal do site não possui um elemento específico no HTML5 como os demais, então a sua
identificação é feita com o valor main no role.

O elemento FOOTER, assim como o HEADER, pode ser utilizado mais que uma vez na mesma página, pois ele
pode ser utilizado para dois objetivos. O primeiro é para o rodapé geral da página que deve receber
o valor contentinfo para o role. O segundo é para indicar rodapé em seções e, nesse caso, deve ser
utilizado o role complementary.

O elemento SECTION do HTML5 é indicado para separar seções dentro do documento, podendo ser utilizado
quantas vezes forem necessárias na mesma página. O ARIA role que contém o mesmo papel do elemento
possui o valor section.

Abaixo, temos um exemplo de estrutura de uma página utilizando as elementos estruturais do HTML5 e
ARIA roles. Além dos landmarks, também foram utilizados outros roles, como é o caso do heading
(utilizado para identificar títulos) e do article (identifica conteúdo que faz sentido isolado, que
é independente, como uma postagem em um blog).

![Estrutura com HTML5 e ARIA](imagens/estrutura_html5.png)
Estrutura com HTML5 e ARIA.

Como podemos ver, o HTML5 ampliou consideravelmente a quantidade de elementos, os quais, aliados aos
roles do WAI ARIA, vêm facilitar a aplicação de semântica em áreas estruturais. Porém, mesmo com a
aplicação dessas novas ferramentas ainda devem ser fornecidas âncoras para as áreas relevantes da
página (ver Recomendação 6), pois a marcação semântica ainda não é suficiente para garantir que os
leitores de tela ou outros agentes de usuário que possuem funcionalidades específicas para navegação
pelo teclado, consigam listar esses novos elementos.

Toda divisão de conteúdo que possua um significado importante deve ser feita utilizando o elemento
SECTION no lugar do elemento DIV, pois o DIV no HTML5 possui a função de apenas agrupar elementos
que precisam ser agrupados, mas não possuem uma separação semântica dos demais elementos.

Exemplo de código utilizando HTML5 e ARIA roles para as diferentes áreas de
informação, além de manter os atalhos para conteúdo, menu e busca:
<header role="banner">  
<a href="#inicioTopo" id="inicioTopo">Topo</a>        
   <h1>NOME DA INSTITUIÇÃO</h1>  
     
    <div id="barraAcessibilidade">        
        <p>Barra de Acessibilidade</p>        
        <ul>        
            <li><a href="#inicioConteudo">Ir para conteúdo [1]</a></li>        
            <li><a href="#inicioMenu">Ir para menu principal [2]</a></li>     
            <li><a href="#busca">Ir para Busca [3]</a></li>        
        </ul>       
    </div>        
</header>  
<nav role="navigation">  
    <a href="#inicioMenu" id="inicioMenu" accesskey="2">Menu</a>        
    <ul>        
        <li>Itens de menu</li>        
        <li>...</li>        
    </ul>       
</nav>  
<div id="conteudo" role="main">      
    <a href="#inicioConteudo" id="inicioConteudo" accesskey="1">Conteúdo</a>     
    <section role="section" aria-label="Formulário de busca">  
        <form action="#" method="post">        
           <fieldset>        
               <legend>Buscar</legend>        
               <label for="busca">Pesquise aqui</label>        
               <input type="text" id="busca" name="busca" accesskey="3" 
value="Pesquise aqui" />        
               <input type="submit" value="Buscar" class="buscar" name="buscar" />        
             </fieldset>        
        </form>        
    </section>     
    <section role="section" aria-label="Conteúdo Principal">  
        <header role="heading">  
           <h2>BEM VINDO</h2>  
        </header>  
        <p>Seja bem vindo ao nosso site.</p>        
    </section>  
</div>        
<footer role="contentinfo">  
    <a href="#inicioRodape" id="inicioRodape">Rodapé</a>       
    <address> Rua XXX</address>    
</footer>



[Voltar ao sumário](#sumario)

#### Recomendação 1.9 – Não abrir novas instâncias sem a solicitação do usuário

*[Ver
WCAG 2.0 Critério de Sucesso 3.2.5](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/consistent-behavior-no-extreme-changes-context.html)*

A decisão de utilizar-se de novas instâncias – por exemplo abas ou janelas - para acesso a páginas e
serviços ou qualquer informação deve ser de escolha do usuário. Assim, não devem ser utilizados:

- Pop-ups;
- A abertura de novas abas ou janelas;
- O uso do atributo target=“\_blank”;
- Mudanças no controle do foco do teclado;
- Entre outros elementos, que não tenham sido solicitadas pelo usuário.

É muito importante que os links abram na guia ou janela atual de navegação, pois os usuários com
deficiência visual podem ter dificuldade em identificar que uma nova janela foi aberta. Além disso,
estando em uma nova janela, não conseguirão retornar à página anterior utilizando a opção voltar do
navegador. Quando for realmente necessária a abertura de um link em nova janela, é recomendado que
tal ação seja informada ao usuário no próprio texto do link. Isso permite ao usuário decidir se quer
ou não sair da janela ou aba em que se encontra e, caso decida acessar o link, ele saberá que se
trata de uma nova aba ou janela.

Exemplo
<a href=“universal.html”> Desenho Universal (abre em nova janela) </a>

As janelas modais, como as lightbox, fazem com que o foco do teclado permaneça “atrás” da janela, ou
seja, o usuário navegando pelo teclado não tem acesso ao conteúdo dessas janelas. Além disso, as
janelas modais, em geral, não apresentam um bom nível de acessibilidade em dispositivos móveis.
Assim, se houver real necessidade de utilizar esse tipo de elemento, é preciso garantir que o foco
seja remetido para o início do conteúdo da janela modal, que o conteúdo dentro da mesma seja
acessível e que seja possível retornar facilmente para o site navegando pelo teclado.

**Exemplo**

Um exemplo simples para criação de uma janela modal foi colocado abaixo contendo apenas HTML e CSS3.

![Exemplo de janela modal](imagens/modal.png)
Exemplo de janela modal

HTML
<div id="conteudo" role="main">      
     <a href="#openModal">Abrir Janela Modal</a>  
    <div id="openModal" class="modalDialog">  
        <div>  
           <a href="#close" class="close">Fechar</a>  
            <h2>Janela Modal</h2>  
            <p>
Esta é uma janela modal acessível e foi criada utilizando apenas HTML e CSS3.
</p>  
<p>É importante disponibilizar o link abaixo para sinalizar o final da janela modal.</p> 
 <a href="#close">Fim do conteúdo modal, clique aqui para retornar</a>
        </div>  
    </div>  
</div>     
CSS3
.modalDialog {   
    position: fixed;   
    font-family: Arial, Helvetica, sans-serif;   
    top: 0;   
    right: 0;   
    bottom: 0;   
    left: 0;   
    background: rgba(0,0,0,0.8);   
    z-index: 99999;    
    display:none;   
    -webkit-transition: opacity 400ms ease-in;   
    -moz-transition: opacity 400ms ease-in;   
    transition: opacity 400ms ease-in;   
    pointer-events: none;   
}   
.modalDialog:target {   
    display: block;   
    pointer-events: auto;   
}   
.modalDialog > div {   
    width: 400px;   
    position: relative;   
    margin: 10% auto;   
    padding: 5px 20px 13px 20px;   
    border-radius: 10px;   
    background: #fff;   
    background: -moz-linear-gradient(#fff, #999);   
    background: -webkit-linear-gradient(#fff, #999);   
    background: -o-linear-gradient(#fff, #999);   
}   
.close {   
    background: #606061;   
    color: #FFFFFF;   
    line-height: 25px;   
    position: absolute;   
    right: -12px;   
    text-align: center;   
    top: -10px;   
    width: 104px;   
    text-decoration: none;   
    font-weight: bold;   
    -webkit-border-radius: 12px;   
    -moz-border-radius: 12px;   
    border-radius: 12px;   
    -moz-box-shadow: 1px 1px 3px #000;   
    -webkit-box-shadow: 1px 1px 3px #000;   
    box-shadow: 1px 1px 3px #000;   
}

### 3.2 Comportamento (Document Object Model – DOM)

#### Recomendação 2.1 - Disponibilizar todas as funções da página via teclado

*[Ver
WCAG 2.0 Critérios de Sucesso 2.1.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/keyboard-operation-keyboard-operable.html) e [Ver WCAG 2.0 Critérios de Sucesso 2.1.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/keyboard-operation-trapping.html)*

Todas as funções da página desenvolvidas utilizando-se linguagens de script (javascript) devem ser
programadas, primeiramente, para o uso com teclado. O foco não deverá estar bloqueado ou fixado em
um elemento da página, para que o usuário possa mover-se pelo teclado por todos os elementos.

Algumas funções específicas do mouse possuem uma função lógica correspondente via teclado, conforme
mostrado na tabela a seguir:

Eventos de teclado e seus correspondentes aos de mouse

| Evento do teclado | Evento correspondente do mouse |
| onkeydown | onmousedown |
| onkeyup | onmouseup |
| onkeypress | onclick\* |
| onfocus\* | onmouseover |
| onblur\* | onmouseout |

Tabela 2: Eventos de teclado e seus correspondentes aos de mouse.

OBS: \* Alguns manipuladores de eventos são dispositivos-independentes, ou seja, se aplicam a
qualquer dispositivo (mouse, teclado ou outro), como é o caso de: onFocus, onBlur, onSelect,
onChange, e onClick (quando o onClick for utilizado em um link ou elemento de formulário).

Quando forem utilizados múltiplos manipuladores de eventos para uma ação, de maneira que ela funcione
tanto pelo mouse como pelo teclado, é importante testar o resultado final em diferentes navegadores
e utilizando diferentes recursos de tecnologia assistiva, para garantir que o evento seja, de fato,
acessível.

Dê preferência por utilizar o onclick/onkeypress em vez de onmousedown/onkeydown e onmouseup/onkeyup,
pois estes últimos fazem com que o evento seja disparado automaticamente através do teclado. Se
houver real necessidade de utilização destes eventos, deverá ser feito um controle sobre qual tecla
deverá ser acionada para que o evento ocorra, conforme o exemplo a seguir:

Exemplo HTML
<script src="js/exemplo.js" type="text/javascript"></script>
<noscript>Seu navegador não tem suporte a JavaScript ou está desativado!</noscript>
...
<p><a href="#"id="link">Portal Brasil</a></p>
Arquivo JavaScript (exemplo.js)
varx=document.getElementById('link')
x.onkeydown=function(e){
varpressedkey
if(typeofevent!='undefined'){ //navegador Internet Explorer
pressedkey=window.event.keyCode
}else{//outros navegadores
pressedkey=e.keyCode//identifica tecla pressionada
}
if(pressedkey=='13'){ //teste se a tecla é o 'enter'
window.open('http://www.brasil.gov.br/') //abre a URL
}
}

Existem funções do mouse que não possuem uma função correspondente via teclado, como é o caso de
duplo clique (dblclick). Nesses casos, é necessário implementar a função de maneira alternativa,
como, por exemplo, incluindo botões que executem, pelo teclado, a função de forma equivalente. O
evento onclick já funciona pelo teclado (tecla ENTER) na maioria dos navegadores. Os menus do tipo
dropdown e outros que contiverem subitens devem ser acessíveis pelo teclado.

**Em HTML5 e ARIA**

Menus suspensos são ótimos para organizar sites muito grandes, porém esses menus podem acarretar
problemas na acessibilidade, especialmente no que diz respeito ao acesso aos subitens. Esses menus,
em muitos casos, são desenvolvidos de forma que funcionam apenas com eventos do mouse, o que se
torna um grande problema de acessibilidade. Abaixo, é apresentado um exemplo que utiliza HTML5 e
ARIA, além de implementação de javascript, pensando-se na acessibilidade nos subitens.

HTML 5
<nav role='navigation' aria-label='Menu principal' class='topnav' id='menu'><ul>  
<li><a href='index.php'>Página inicial</a></li>  
<li><a href='noticias.php'>Notícias</a></li>  
<li><a href='eventos.php'>Eventos</a></li>  
<li>  
<a href='acessibilidade-web.php'>Acessibilidade Web</a>  
<p><a href='#' class='expandir'>Expandir menu Acessibilidade Web</a></p>  
<ul class='subnav'  role='menu'>
<li role='menuitem'><a href='#'>Projetos acessibilidade web</a></li>
<li role='menuitem'><a href='#'>Notícias acessibilidade web</a></li>
<li role='menuitem'><a href='#'>Dicas acessibilidade web</a></li>
<li role='menuitem'><a href='#'>Manuais acessibilidade web</a></li>
</ul>    
</li>  
</ul> 
</nav>  
CSS
/\* utilizado para o menu ficar na verticaL \*/  
#menu li{   
    display: inline-block;   
}   
  
/\*utilizado para o link ficar no mesmo tamanho que a li \*/  
#menu li a{   
    display: block;   
    padding:15px; /\* apenas para apresentação visual, não influencia conteudo \*/  
}   
  
/\* bloco de codigos utilizado apenas para apresentação visual do link expandir/ocultar \*/  
#menu li .expandir{   
    float: right;   
    width: 13px;   
    height: 13px;   
    text-indent: -5000px;   
    margin-top: -48px;   
    padding: 0;   
    background-color:#000;   
}   
/\* cria a caixa de sub-menu com posição absoluta sobre os demais elementos do site \*/  
.topnav li .subnav {   
    position:absolute;   
    width: 230px;   
    display: none;   
}

**Javascript:**

O Javascript abaixo adiciona as funções do link mostrar/ocultar, porém deve ser utilizado junto com a
biblioteca do jQuery (http://jquery.com/).

javascript para mostrar/ocultar submenu
$(document).ready(function(){     
    $(".leitor-de-telas div, .eventos .lista, .dicas .myhide").hide();   
  
    $(".expandir").click(function() {   
        $(this).parent().next().slideToggle("slow");   
  
        var text = $(this).text();   
  
        if( text.search("Expandir") != -1 ){ // -1 é quando não encontra a string   
            $(this).text(text.replace("Expandir", "Ocultar"));   
        }else{   
            $(this).text(text.replace("Ocultar", "Expandir"));   
        }   
  
        return false;   
    });   
});



[Voltar ao sumário](#sumario)

#### Recomendação 2.2 – Garantir que os objetos programáveis sejam acessíveis

*[Ver
WCAG 2.0 Critérios de Sucesso 2.1.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/keyboard-operation-keyboard-operable.html) e [Ver WCAG 2.0 Critérios de Sucesso 2.1.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/keyboard-operation-trapping.html)*

Deve-se garantir que scripts e conteúdos dinâmicos e outros elementos programáveis sejam acessíveis e
que seja possível sua execução via navegação. Além de proporcionar o uso por teclado, estratégias
devem ser adotadas para proporcionar o acesso a todos independente de seu dispositivo. A
funcionalidade drag-an-drop pode ter como alternativa o uso dos atalhos de recortar e colar.

Exemplo correto

Página HTML
<a href="cadastro.html" id="cadastro">Cadastre-se agora!</a>
Página JavaScript (.js)
function pop() {
alert("Você vai fazer um novo cadastro!");
}
var element = document.getElementById("cadastro");
element.onclick = pop;

Exemplo incorreto

Página HTML
<a href="javascript:pop()">Cadastre-se agora!</a>
Página JavaScript (.js)
function pop() {
alert("Você vai fazer um novo cadastro!");
}

Nesse caso, se o navegador não tiver suporte a scripts, o usuário ficará impossibilitado de acessar o
link.

**OBS:** A função “alert” do javascript não gera um pop-up e sim uma mensagem que é
lida por todos os leitores de tela.

Quando não for possível que o elemento programável seja diretamente acessível, deve ser fornecida uma
alternativa em HTML para o conteúdo.

Quando o script for utilizado em uma página da Web, uma forma de fornecer uma alternativa para ele é
através do elemento NOSCRIPT. Este elemento pode ser utilizado para mostrar conteúdos em navegadores
que não suportam scripts ou que tenham o script desabilitado. No entanto, se o navegador tiver
suporte a scripts e estes estiverem habilitados, o elemento NOSCRIPT será ignorado. Dessa forma, a
utilização do elemento NOSCRIPT para um script inacessível não garante que o objeto seja acessível.
Assim, a recomendação é que o próprio script seja desenvolvido tomando-se o cuidado para que ele
seja acessível, e o elemento NOSCRIPT deve ser utilizado para abranger os casos em que scripts não
são suportados.



[Voltar ao sumário](#sumario)

#### Recomendação 2.3 - Não criar páginas com atualização automática periódica

*[Ver
WCAG 2.0 Critério de Sucesso 3.2.5 (Técnicas SVR1 e H76)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/consistent-behavior-no-extreme-changes-context.html)*

A atualização automática periódica – muito utilizada por canais de notícias - é comumente realizada
através do uso do o atributo http-equiv com conteúdo “refresh” da elemento meta no HEAD do documento
(ex: <'meta http-equiv="refresh" content="30" /'>, onde a página seria recarregada a cada 30
segundos). O problema dessa atualização é que ela tira do usuário sua autonomia em relação à
escolha (semelhante a abertura de novas instâncias em navegadores) e podem confundir e
desorientar os usuários, especialmente usuários que utilizam leitores de tela.

Como exemplo de uma boa prática, em uma interface Web para e-mail (Webmail), um desenvolvedor pode
fornecer um botão ou link para buscar novos e-mails recebidos em vez de atualizar automaticamente.
Em páginas onde o limite de tempo é absolutamente necessário, o usuário deverá ser informado que a
página é atualizada automaticamente.

![O Webmail Expresso possui um botão de atualizar para carregamento de novas mensagens](imagens/email.png)
O Webmail Expresso possui um botão de atualizar para carregamento de novas mensagens



[Voltar ao sumário](#sumario)

#### Recomendação 2.4 – Não utilizar redirecionamento automático de páginas

*[Ver
WCAG 2.0 Critério de Sucesso 3.2.5 (Técnicas SVR1 e H76)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/consistent-behavior-no-extreme-changes-context.html)*

Não devem ser utilizadas marcações para redirecionar a uma nova página, como o uso do atributo
*http-equiv* com conteúdo “*refresh*” do elemento META. Ao invés disso, deve-se
configurar o servidor para que o redirecionamento seja transparente para o usuário - ver ePWG -
Cartilha de Codificação em <http://epwg.governoeletronico.gov.br/cartilha-codificacao>



[Voltar ao sumário](#sumario)

#### Recomendação 2.5 – Fornecer alternativa para modificar limite de tempo

*[Ver
WCAG 2.0 Critério de Sucesso 2.2.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/time-limits-required-behaviors.html)*

Em uma página onde há limite de tempo para realizar uma tarefa deve haver a opção de desligar,
ajustar ou prolongar esse limite. Essa recomendação não se aplica a eventos em que o limite de tempo
é absolutamente necessário.

Deve-se lembrar que, em ambos os casos, o limite de tempo deve ser informado.

Exemplo

Na inserção de dados em um formulário para obtenção de um benefício ou consulta a processo, o
cidadão deve ter tanto tempo quanto for necessário para o preenchimento de seus dados. O site
deve possuir um mecanismo que permita ao cidadão aumentar o limite de tempo, disponibilizando
por exemplo um botão para aumentar o tempo em 5 minutos.



[Voltar ao sumário](#sumario)

#### Recomendação 2.6 – Não incluir situações com intermitência de tela

*[Ver
WCAG 2.0 Critério de Sucesso 2.3.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/seizure-does-not-violate.html)*

Não devem ser utilizados efeitos visuais piscantes, intermitentes ou cintilantes. Em pessoas com
epilepsia fotosensitiva, o cintilar ou piscar pode desencadear um ataque epilético. A exigência
dessa diretriz aplica-se também para propaganda de terceiros inserida na página.

Exemplo: A imagem abaixo representa um elemento piscante, onde as intermitências ocorrem a cada 0,2
segundos.

![Exemplo de intermitência de imagem](imagens/intermitencia.png)
Exemplo de intermitência de imagem



[Voltar ao sumário](#sumario)

#### Recomendação 2.7 – Assegurar o controle do usuário sobre as alterações temporais do conteúdo

*[Ver
WCAG 2.0 Critério de Sucesso 2.2.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/time-limits-pause.html)*

Conteúdos como *slideshows*, que “se movem”, rolagens, movimentações em geral ou animações não
devem ser disparadas automaticamente sem o controle do usuário, mesmo em propagandas na página. Ao
usuário deve ser repassado o controle sobre essas movimentações (quer seja por escolha de
preferência de visualização da página, quer por outro método qualquer acessível a usuário com
deficiência). Além disso, o usuário deve ser capaz de parar e reiniciar conteúdos que se movem, sem
exceção.

É desejável que o usuário tenha também o controle da velocidade desses conteúdos.

![Exemplo de slideshow, com mecanismos de parada e navegação entre os slides.](imagens/slideshow.jpg)
Exemplo de slideshow, com mecanismos de parada e navegação entre os slides.



[Voltar ao sumário](#sumario)

### 3.3 Conteúdo / Informação

#### Recomendação 3.1 – Identificar o idioma principal da página

*[Ver
WCAG 2.0 Critério de Sucesso 3.1.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/meaning-doc-lang-id.html)*

Deve-se identificar o principal idioma utilizado nos documentos. A identificação é feita por meio do
atributo lang do HTML e, para documentos XHTML, é utilizado o xml:lang. Ele deve ser declarado em
todas as páginas, pois além de auxiliar na acessibilidade do conteúdo, também permite melhor
indexação pelos motores de busca.

Exemplo

Em HTML 4.01
<html lang="pt-BR">
<head>
<title>documento escrito em português do Brasil</title>
...
Em XHTML 1.1
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="pt-BR">
<head>
<title>documento escrito em português do Brasil</title>
...
Em HTML5
<html lang="pt-br">    
<head>  
<title>documento escrito em português do Brasil</title>



[Voltar ao sumário](#sumario)

#### Recomendação 3.2 – Informar mudança de idioma no conteúdo

*[Ver
WCAG 2.0 Critério de Sucesso 3.1.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/meaning-other-lang-id.html)*

Se algum elemento de uma página possuir conteúdo em um idioma diferente do principal, este deverá
estar identificado pelo atributo lang. Essa recomendação não se aplica para nomes próprios ou termos
técnicos que sejam compreendidos no contexto.

Exemplo

XHTML
<p xml:lang="de">
Da dachte der Herr daran, ihn aus dem Futter zu schaffen,
aber der Esel merkte, daß kein guter Wind wehte, lief fort
und machte sich auf den Weg nach Bremen: dort, meinte er,
könnte er ja Stadtmusikant werden.
</p>
HTML
<p lang="de">
Da dachte der Herr daran, ihn aus dem Futter zu schaffen,
aber der Esel merkte, daß kein guter Wind wehte, lief fort
und machte sich auf den Weg nach Bremen: dort, meinte er,
könnte er ja Stadtmusikant werden.
</p>
<p>
O leitor de tela <span lang="en">JAWS</span> (acrônimo para <span lang="en">Job Access With Speech</span>) é um software desenvolvido pela empresa americana <span lang="en">FreedomScientific</span> e é, atualmente, um dos mais populares no mundo. Trata-se de um <span lang="en">software pago</span>, desenvolvido para o sistema operacional <span lang="en">Microsoft Windows</span>.
</p>



[Voltar ao sumário](#sumario)

#### Recomendação 3.3 – Oferecer um título descritivo e informativo à página

*[Ver
WCAG 2.0 Critério de Sucesso 2.4.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-title.html)*

O título da página deve ser descritivo e informativo, devendo representar o conteúdo principal da
página, já que essa informação será a primeira lida pelo leitor de tela, quando o usuário acessar a
página. O título é informado pelo elemento TITLE e deve preferencialmente seguir a estrutura
recomendada pelo ePWG, que é [assunto principal da página] – [nome do sítio ou sistema] sem palavras
extras, ou recursos estilísticos. Na página inicial do sistema ou portal, basta seguir a estrutura
[nome do sítio ou sistema].

**Exemplo 1**

A página inicial do Projeto de Acessibilidade Virtual apresenta o seguinte título:
<title>
Projeto Acessibilidade Virtual
</title>

**Exemplo 2**

A página secundária “Contato” do Projeto de Acessibilidade Virtual apresenta o
seguinte título:
<title>
Contato - Projeto Acessibilidade Virtual
</title>

**Exemplo 3**

A página interna “Publicações” do sítio do Ministério da Educação apresenta o
seguinte título:
<title>
Publicações – Ministério da Educação
</title>

Para mais detalhes a respeito do título descritivo, ver ePWG - Cartilha de Codificação do ePWG
(disponível em: <http://epwg.governoeletronico.gov.br/cartilha-codificacao>



[Voltar ao sumário](#sumario)

#### Recomendação 3.4 – Informar o usuário sobre sua localização na página

*[Ver
WCAG 2.0 Critério de Sucesso 2.4.8](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-location.html)*

Deverá ser fornecido um mecanismo que permita ao usuário orientar-se dentro de um conjunto de
páginas, permitindo que ele saiba onde está no momento. Assim, poderá ser utilizado o recurso de
“migalha de pão” (breadcrumbs), que são links navegáveis em forma de lista hierárquica os quais
permitem que o usuário saiba qual o caminho percorrido até chegar à página em que se encontra no
momento.

Exemplo

Um usuário navegando por um sítio de uma universidade encontra-se na seção de editais, que está
dentro do menu “Ensino”. Acima do conteúdo, é disponibilizada a seguinte Migalha de pão:

*Você está em:
[Página inicial](#r18_a) >
[Ensino](#r18_b) >
Editais*

**OBS:** Na migalha de pão, todas as páginas do caminho, com exceção da qual está o
usuário (posição atual), deverão estar implementadas como links e contidas dentro de uma lista.

[Voltar ao sumário](#sumario)

#### Recomendação 3.5 – Descrever links clara e sucintamente

*[Ver
WCAG 2.0 Critérios de Sucesso 2.4.4](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-refs.html) e [Ver WCAG 2.0 Critérios de Sucesso2.4.9](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-link.html)*

Deve-se identificar claramente o destino de cada link, informando, inclusive, se o link remete a
outro sítio. Além disso, é preciso que o texto do link faça sentido mesmo quando isolado do contexto
da página.

É preciso tomar cuidado para não utilizar a mesma descrição para dois ou mais links que apontem para
destinos diferentes. Da mesma forma, links que remetem ao mesmo destino devem ter a mesma descrição.

Exemplo Incorreto
<h2>Educação Superior</h2>
<p>Tomam posse os reitores das federais da Bahia e Triângulo</p>
<p> <a href="notici5125.html" title=”Leia mais notícias sobre Educação Superior”>Leia mais notícias sobre Educação Superior</a> </p>
Exemplo Correto
<h2>Educação Superior</h2>
<p>Tomam posse os reitores das federais da Bahia e Triângulo</p>
<p> <a href="notici5125.html">Leia mais notícias sobre Educação Superior</a> </p>

Repare no exemplo incorreto acima que não há necessidade de utilizar o atributo title em links,
já que esse atributo não é bem suportado por recursos de tecnologia assistiva, como leitores de
tela, não tem utilidade para quem navega apenas pelo teclado e não tem bom suporte em
dispositivos móveis, como celulares, entre outros problemas. Assim, se você quiser fornecer
informações adicionais para um link, faça-o no próprio texto do link ou no contexto, e jamais
repita o conteúdo do link no atributo title.

Exemplo Incorreto

[Clique aqui](#r19_c) para saber mais a respeito de acessibilidade.

Exemplo Correto

[Saiba mais a respeito de acessibilidade](#r19_i)

**OBS:** Não se deve fazer a utilização de links do tipo “clique aqui”, “leia mais”,
“mais”, “saiba mais”, “veja mais”, “acesse a lista”, pois estas expressões não fazem sentido
fora do contexto. Muitos usuários de leitores de tela navegam por links, tornando descrições
como “Clique aqui”, “Veja mais” insuficientes para o usuário saber o destino do link, ou
localizá-lo na página.

Em links de arquivos para download, é necessário informar a extensão e o tamanho do arquivo no
próprio texto do link, conforme exemplo a seguir.

Exemplo
<a href=”cartilha.odt”>Cartilha de Acessibilidade do W3C (.odt 150Kb)</a>



[Voltar ao sumário](#sumario)

#### Recomendação 3.6 – Fornecer alternativa em texto para as imagens do sítio

*[Ver
WCAG 2.0 Critério de Sucesso 1.1.1 (Técnica G95)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/text-equiv-all.html)*

Deve ser fornecida uma descrição para as imagens da página, utilizando-se, para tanto o atributo alt.

Exemplo 1

![Foto de uma bicicleta de carga verde com caixas laranjas encostada numa parede](imagens/figura10.jpg)
Exemplo de descrição de imagem.

No código:
<img src="foto-porto-alegre.jpg" alt="Foto de uma bicicleta de carga verde com caixas laranjas encostada numa parede" />

No caso de banners e outras imagens que reproduzam textos, o ideal é reproduzir o texto escrito.

Exemplo 2

![Exemplo de descrição de banner](imagens/figura11.jpg)
Exemplo de descrição de banner

No código:
<a href="http://www.dominiopublico.gov.br/">
<img src="guia.png" alt="Guia de Serviços – Consulte serviços públicos de forma fácil" />
</a>

Descrever qualquer imagem, em geral, é algo bastante subjetivo e a descrição deve ser adaptada ao
contexto em que a imagem se encontra. Para mais detalhes de como escrever um texto alternativo, veja
o tutorial O uso correto do texto alternativo na seção do eMAG no portal de Governo Eletrônico (<http://www.governoeletronico.gov.br/eixos-de-atuacao/governo/acessibilidade/material-de-apoio>).

Apesar de não haver um limite de caracteres para o atributo alt, ele é utilizado para descrições
sintéticas, em poucas palavras ou em uma frase curta. Para imagens mais complexas que exigem uma
descrição mais detalhada, como infográficos, por exemplo, deve-se fornecer, além do alt, a descrição
no próprio contexto ou um link para a descrição longa logo após a imagem. Deve ficar claro para o
usuário que esse link remete para a descrição longa da imagem, conforme o exemplo a seguir.

Exemplo 3

![Exemplo de descrição de infográfico - A descrição textual está disponível em outra página](imagens/figura12.jpg)
Exemplo de descrição de infográfico - A descrição textual está disponível em outra página

No código da página do infográfico:
<img src="grafico.jpg" alt="Infográfico sobre selos e certificações conscientes" />
<p><a href="selos-e-certificacoes.html">Conteúdo texto do Inforgráfico</a> - disponível</p>
Código em selos-e-certificacoes.html
<h1>Selos e certificações conscientes</h1>
<p>Conheças os selos e certificações que atestam a qualidade e responsabilidade das empresas na produção</p>
<dl>
<dt>Orgânico Brasil</dt>
<dd>Selo do Sistema Brasileiro de Avaliação de Conformidade Orgânica (SISOrg) identifica e controla a produção nacional de alimentos orgânicos, caracterizada por processo sustentávele em relação ao uso da água, solo, ar e recursos naturais, e sem uso de agrotóxicos ou adubos químicos. Para saber mais visite: <a href="http://www.agricultura.gov.br/desenvolvimentosustentavel/organicos">
Orgânico Brasil</a></dd>
<dt>Inmetro</dt>
<dd>O selo do Instituto Nacional de Metrologia, Qualidade e Tecnologia, certifica que o produto foi submetido a testes e medições que garantem a conformidade com os padrões das unidades de medida existentes. Para saber mais visite: <a href="http://www.inmetro.gov.br">Inmetro</a></dd>
<dt>Procel</dt>
<dd>Selo Procel de Economia de Energia indica os produtos com os melhores níveis de eficiência energética dentro de cada categoria, proporcionando economia na conta de luz. O selo também incentiva o desenvolvimento de produtos inovadores que contribuam para preservação do meio ambiente. Para saber mais visite: <a href="http://www.eletrobras.com/procel">Procel</a></dd>
<dt>Conselho de Manejo Florestal</dt>
<dd>O selo do <span lang=”en”>Forest Stewardship Council</span>, que nacionalmente é chamado de FSC Brasil (conselho de MAnejo Florestal), garante que a madeira utilizada na fabricação de um produto seja proveniente de procedimento ecologicamente adequado que não degrada o meio ambiente e contribui para o desenvolvimento econômico e social das comunidade florestais adequadas. Para saber mais visite: <a href="http://br.fsc.org/">FSC.org</a></dd>
<dt><span lang=”en”>Fairtrade</span></dt>
<dd>A certificação <span lang=”en”>Fairtrade</span>, que na tradução significa "comercio Justo", é um dos pilares do comércio sustentável, já que seus produtos e serviços devem estar de acordo com princípios como a garantia de pagamento de preços justos a pequenos produtores, a preservação da saúde das pessoas e do meio ambiente e a eliminação da intermediação comercial especulativa. Para saber mais visite: <a href="http://www.fairtrade.net/"><span lang=”en”>Fairtrade</span></a></dd>
<dt><abbr title=”Associação Brasileira de Normas Técnicas”>ABNT</abbr></dt>
<dd>A certificação Rotulagem Ambiental da Associação Brasileira de Normas Técnicas (ABNT) visa atestar quais produtos são menos prejudiciais ao meio ambiente, incentivando a redução de uso de energia, de matérias primas e da poluição durante os processos de produção e comercialização. Para saber mais visite: <a href="http://www.abntonline.com.br/rotulo/">ABNT</span></a></dd>
<dt>Lista suja do trabalho escravo </dt>
<dd>Para evitar consumir produtos de empresas que tenham em sua cadeia produtiva fornecedores flagrados pela prática do trabalho escravo, as empresas tẽm acesso a lista suja do trabalho escravo, divulgadas pelo governo federal, por meio do sistema de busca feito pela Organização Internacional do Trabalho, o Instituto Ethos e a ONG Repórter Brasil, o que torna mais rápida a decisão de suspender fornecedores irregulares. Para saber mais visite: <a href="http://www.reporterbrasil.org.br/pacto/signatarios">Pacto Nacional para a Erradicação do Trabalho Escravo</a></dd>
</dl>

Lembrando que em gráficos simples, as informações podem estar contidas na própria página ajudando o
entendimento, inclusive, de pessoas que tem dificuldade com visualizações de gráficos ou queiram
utilizar as informações para outros fins, como pesquisas.

![Dados simples podem ser representados tanto graficamente quanto em forma de tabelas](imagens/figura13.png)
Dados simples podem ser representados tanto graficamente quanto em forma de tabelas.

**Em HTML5**

Foram incorporados ao HTML5 os elementos FIGURE e FIGCAPTION, que são utilizados em conjunto com o
objetivo de agrupar uma imagem IMG com a sua legenda, a qual aparecerá visualmente.

O elemento FIGURE não é usado apenas para marcação de imagens, ele define um bloco de conteúdo
independente que normalmente contém linhas de códigos, imagens, gráficos, diagramas e vídeos que
fazem referência ao conteúdo principal do documento. O elemento FIGCAPTION é opcional e exibe uma
legenda para o elemento FIGURE. Esse novo elemento age como subtítulo opcional ou legenda para
qualquer conteúdo contido dentro do elemento FIGURE e não substitui o atributo alt nas descrições
das imagens. Pode-se ter várias imagens, vídeos, gráficos, dentro de um único elemento FIGURE. Caso
haja um elemento FIGCAPTION este deve ser o primeiro ou o último filho do elemento FIGURE e só um
FIGCAPTION irá representar a legenda.

Exemplo
<figure>  
<img src="paubrasil.jpg" alt="Foto de uma árvore pau-brasil" />
    <figcaption>  
       Figura 1: Imagem da árvore que deu origem ao nome do nosso país: Pau-brasil
    </figcaption>  
</figure>  

Que seria traduzido visualmente na página da seguinte forma:

![so dos elemento figure e figcaption](imagens/figura14.jpg)
Uso dos elemento figure e figcaption

**OBS:** Imagens que não transmitem conteúdo, ou seja, imagens decorativas, devem ser
inseridas por CSS. No exemplo a seguir, o separador pontilhado logo abaixo do título de nível 3
“Acessibilidade web” é uma imagem decorativa cuja função foi inserida através das folhas de estilo.
Note que em alguns casos a imagem pode ser substituída por um código CSS.

Exemplo

![Título em texto com imagem decorativa de separador pontilhado](imagens/figura15.png)
Título em texto com imagem decorativa de separador pontilhado

HTML
<h3>Acessibilidade web</h3>
CSS
h3 {
color: #64860B;
font-size: 1.4em;
font-weight: lighter;
padding: 5px 0 10px;
height: 30px;
border-bottom: 1px dotted #666;
}



[Voltar ao sumário](#sumario)

#### Recomendação 3.7 – Utilizar mapas de imagem de forma acessível

*[Ver
WCAG 2.0 Critério de Sucesso 1.1.1 (Técnica H24)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/text-equiv-all.html)*

Um mapa de imagens é uma imagem dividida em áreas selecionáveis definidas por elemento AREA . Cada
área é um link para outra página Web ou outra seção da página atual. É um recurso em desuso, mas
pode ser útil na acessibilidade de infográficos, por exemplo.

Esse recurso não deve ser utilizado para menus ou seleção de regiões para serviços.

Existem dois tipos de mapas de imagem: mapas do lado do cliente.

Para mapas de imagem do lado do cliente, devem ser fornecidas descrições através do atributo alt para
cada uma das zonas ativas, ou seja, para cada um dos links que receberá o foco.

Exemplo (mapa de imagem do lado do cliente)

![Imagem com alternativas [A] e [B]](imagens/exemplos/recomendacao_21_exemplo_cliente.png)




Mapa de imagem exemplo 1

Código:
<img src="mapaImg.jpg" alt="Imagem com alternativas [A] e [B]" usemap="#Map">
<map name="Map" id="Map">
<area shape="rect" coords="8,10,63,59" href="a.html" alt="Link para a seção [A]">
<area shape="rect" coords="77,9,126,61" href="b.html" alt="Link para a seção [B]">
</map>

Além dos mapas de imagem do lado do cliente, existem os do lado do servidor.

No entanto, é recomendada a utilização de mapas de imagem do lado do cliente, já que para mapas de
imagem do lado do servidor não é possível fornecer um alt para cada uma das zonas ativas, somente
para o mapa como um todo, não sendo possível, portanto, torná-lo acessível. No entanto, se for
realmente necessária sua utilização, devem ser fornecidos links redundantes relativos a cada região
ativa do mapa de imagem, conforme o exemplo a seguir, para que, desta forma, usuários com leitores
de tela possam ter acesso ao seu conteúdo.

Exemplo (mapa de imagem do lado do servidor)

![Bandeira do Brasil](imagens/exemplos/recomendacao_21_exemplo_servidor.png)
[Área Verde](#r21_a) - [Área Amarela](#r21_b) - [Área Azul](#r21_c)  
Mapa de imagem exemplo 2

Código:
<a href="novaPagina.jpg"><img src="bandeiraBrasil.jpg" usemap="#Map" alt="Bandeira do Brasil (Links a seguir)"/></a>
<p>
<a href="areaVerde.html">Área Verde</a> -
<a href="areaAmarela.html">Área Amarela</a> -
<a href="areaAzul.html">Área Azul</a>
</p>



[Voltar ao sumário](#sumario)

#### Recomendação 3.8 – Disponibilizar documentos em formatos acessíveis

*Sem critérios de sucesso correspondentes no WCAG 2.0*

Os documentos devem ser disponibilizados preferencialmente em HTML. Também podem ser utilizados
arquivos para download no formato ODF, tomando-se os cuidados para que sejam acessíveis. Se um
arquivo for disponibilizado em PDF, deverá ser fornecida uma alternativa em HTML ou ODF.

**OBS:** O ODF (Open Document Format) é um formato aberto de documento adotado pela
e-PING (Arquitetura de Interoperabilidade em Governo Eletrônico) que pode ser implementado em
qualquer sistema. O ODF engloba formatos como: ODT (Open Data Text) para documentos de texto, ODS
(Open Data Sheet) para planilhas eletrônicas, ODP (Open Data Presentation) para apresentações de
slides, entre outros.

Muitos softwares já utilizam esses formatos, como é o caso do OpenOffice, BrOffice, Google Docs,
Abiword e StarOffice. O Microsoft Office 2010 também inclui suporte para ODF. Para versões
anteriores do Microsoft Office, pode ser instalado um Add-in gratuito para suporte aos formatos ODF.



[Voltar ao sumário](#sumario)

#### Recomendação 3.9 – Em tabelas, utilizar títulos e resumos de forma apropriada

*[Ver
WCAG 2.0 Critério de Sucesso 1.3.1 (Técnicas H39 e H73)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-programmatic.html)*

O título da tabela deve ser definido pelo elemento CAPTION e deve ser o primeiro elemento utilizado
após a declaração do elemento TABLE. Em casos de tabelas extensas, deve ser fornecido um resumo de
seus dados através do atributo summary que deve ser declarado no elemento TABLE.

Exemplo
<table summary="Esta tabela exibe os copos de café consumidos por cada senador, o tipo de café (descafeinado ou normal), com açúcar ou sem açúcar.">
<caption>Copos de café por Senador</caption>
...

Para mais detalhes veja o tutorial *Tabelas Acessíveis* (<http://www.governoeletronico.gov.br/eixos-de-atuacao/governo/acessibilidade/material-de-apoio>),
na seção do eMAG no Portal do Programa de Governo Eletrônico.



[Voltar ao sumário](#sumario)

#### Recomendação 3.10 – Associar células de dados às células de cabeçalho

*[Ver
WCAG 2.0 Critério de Sucesso 1.3.1 (Técnicas H43 e H63)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-programmatic.html)*

Em tabelas de dados simples, o uso apropriado do elemento TH para os cabeçalhos e do elemento TD para
as células de dados é essencial para torná-las acessíveis. Para incrementar a acessibilidade,
deve-se utilizar os elementos THEAD, TBODY e TFOOT, para agrupar as linhas de cabeçalho, do corpo da
tabela e do final, respectivamente, com exceção de quando a tabela possuir apenas o corpo, sem ter
seções de cabeçalho e rodapé. O W3C sugere utilizar o TFOOT antes do TBODY dentro da definição TABLE
para que o agente de usuário possa renderizar o rodapé antes de receber todas (potencialmente
numerosas) linha de dados.

Exemplo 1
<table>
<caption>Demonstrativo do Patrimônio</caption>
<thead>
<tr>
<th>Tipos</th>
<th>Valores (R$)</th>
<th>Percentual</th>
</tr>
</thead>
<tfoot>
<tr>
<td>Total</td>
<td>110.740,22</td>
<td>100%</td>
</tr>
</tfoot>
<tbody>
<tr>
<td>Recursos Financeiro</td>
<td>56.879,63</td>
<td>51,36%</td>
</tr>
<tr>
<td>Bens Móveis</td>
<td>25.691,23</td>
<td>23,20%</td>
</tr>
<tr>
<td>Bens Imóveis</td>
<td>28.169,36</td>
<td>25,44%</td>
</tr>
</tbody>
</table>

Demonstrativo do Patrimônio

| Tipos | Valores (R$) | Percentual |
| --- | --- | --- |
|  |  |  |
| --- | --- | --- |
| Total | 110.740,22 | 100% |
| Recursos Financeiro | 56.879,63 | 51,36% |
| Bens Móveis | 25.691,23 | 23,20% |
| Bens Imóveis | 28.169,36 | 25,44% |

Imagem da tabela descrita no código do exemplo 1

Para tabelas mais complexas, é necessário utilizar marcações para associar as células de dados com as
células de cabeçalho. A maneira mais adequada de realizar esse procedimento é utilizar os atributos
*id/headers* ou *scope/col*. No primeiro, pode-se associar qualquer célula de conteúdo
a qualquer célula de cabeçalho, utilizando o mesmo valor para o atributo id e para o header. No
segundo caso, a associação é automática, sendo mais utilizado em tabelas de associação direta, nas
quais é dado o valor col para o atributo scope nos cabeçalhos. Nos exemplos a seguir, é possível
verificar a utilização do *id/headers* e do *scope/col*.

Exemplo 2
<table>
<caption>Resultado do Concurso</caption>
<tr>
<th id="vaga">Vaga</th>
<th id="candidato">Nome do candidato</th>
<th id="basico">Prova de Conhecimento Básico</th>
<th id="especifico">Prova de Conhecimento Específico</th>
</tr>
<tr>
<td id="adm" rowspan="2">Técnico Administrativo</td>
<td id="PaulodaSilva">Paulo da Silva</td>
<td headers="adm basico PaulodaSilva">8</td>
<td headers="adm especifico PaulodaSilva">16</td>
</tr>
<tr>
<td id="PedroPontes">Pedro Pontes</td>
<td headers="adm basico PedroPontes">7</td>
<td headers="adm especifico PedroPontes">15</td>
</tr>
<tr>
<td id="inf">Técnico em Informática</td>
<td id="JoaoPereira">João Pereira</td>
<td headers="inf basico JoaoPereira">9</td>
<td headers="inf especifico JoaoPereira">17</td>
</tr>
</table>

Resultado do Concurso

| Vaga | Nome do candidato | Prova de Conhecimento Básico | Prova de Conhecimento Específico |
| Técnico Administrativo | Paulo da Silva | 8 | 16 |
| Pedro Pontes | 7 | 15 |
| Técnico em Informática | João Pereira | 9 | 17 |

Imagem da tabela descrita no código do exemplo 2

Exemplo 3
<table summary="Tabela de vendas de maçã e banana efetuadas no ano de 2010">
<caption>Vendas 2010</caption>
<thead>
<tr>
<th scope="col">Mês</th>
<th scope="colgroup" colspan="2">Rio Grande do Sul</th>
<th scope="colgroup" colspan="2">Santa Catarina</th>
</tr>
</thead>
<tbody>
<tr>
<td>Janeiro</td>
<td scope="col">Maçã</td>
<td scope="col">Banana</td>
<td scope="col">Maçã</td>
<td scope="col">Banana</td>
</tr>
<tr>
<td>Feveiro</td>
<td>1000</td>
<td>1500</td>
<td>3000</td>
<td>1000</td>
</tr>
<tr>
<td>Março</td>
<td>2000</td>
<td>1500</td>
<td>3500</td>
<td>500</td>
</tr>
</tbody>
</table>

Vendas 2010

| Mês | Rio Grande do Sul | | Santa Catarina | |
| --- | --- | --- | --- | --- |
| Janeiro | Maçã | Banana | Maçã | Banana |
| Feveiro | 1000 | 1500 | 3000 | 1000 |
| Março | 2000 | 1500 | 3500 | 500 |

Imagem da tabela descrita no código do exemplo 3

Exemplo 4
<table summary="Tabela com resumo das despesas de transporte durante o mês de Agosto nas cidades de Porto Alegre e Florianópolis">
<caption>Relatório de despesa de viagem</caption>
<thead>
<tr>
<th>Data</th>
<th id="alimentacao" axis="despesas">Alimentação</th>
<th id="hotel" axis="despesas">Hotel</th>
<th id="transporte" axis="despesas">Transporte</th>
</tr>
</thead>
<tfoot>
<tr>
<th id="total">Total</th>
<td headers="total alimentacao">R$ 196,27</td>
<td headers="total hotel">R$ 442,00</td>
<td headers="total transporte">R$ 162,00</td>
</tr>
</tfoot>
<tbody>
<tr>
<th id="poa" axis="localização" colspan="4">Porto Alegre</th>
</tr>
<tr>
<td id="data1" axis="data">25 de agosto de 2010</td>
<td headers="poa data1 alimentacao">R$ 37,74</td>
<td headers="poa data1 hotel">R$ 112,00</td>
<td headers="poa data1 transporte">R$ 45,00</td>
</tr>
<tr>
<td id="data2" axis="data">26 de agosto de 2010</td>
<td headers="poa data2 alimentacao">R$ 27,28</td>
<td headers="poa data2 hotel">R$ 112,00</td>
<td headers="poa data2 transporte">R$ 45,00</td>
</tr>
<tr>
<th id="subPoa">Subtotal</th>
<td headers="poa subPoa alimentacao">R$ 65,02</td>
<td headers="poa subPoa hotel">R$ 224,00</td>
<td headers="poa subPoa transporte">R$ 90,00</td>
</tr>
</tbody>
<tbody>
<tr>
<th id="floripa" axis="localização" colspan="4">Florianópolis</th>
</tr>
<tr>
<td id="data3" axis="data">27 de agosto de 2010</td>
<td headers="floripa data3 alimentacao">R$ 96,25</td>
<td headers="floripa data3 hotel">R$ 109,00</td>
<td headers="floripa data3 transporte">R$ 36,00</td>
</tr>
<tr>
<td id="data4" axis="data">28 de agosto de 2010</td>
<td headers="floripa data4 alimentacao">R$ 35,00</td>
<td headers="floripa data4 hotel">R$ 109,00</td>
<td headers="floripa data4 transporte">R$ 36,00</td>
</tr>
<tr>
<th id="subFloripa">Subtotal</th>
<td headers="floripa subFloripa alimentacao">R$ 131,25</td>
<td headers="floripa subFloripa hotel">R$ 218,00</td>
<td headers="floripa subFloripa transporte">R$ 72,00</td>
</tr>
</tbody>
</table>

Relatório de despesa de viagem

| Data | Alimentação | Hotel | Transporte |
| --- | --- | --- | --- |
|  |  |  |  |
| --- | --- | --- | --- |
| Total | R$ 196,27 | R$ 442,00 | R$ 162,00 |
| Porto Alegre | | | |
| --- | --- | --- | --- |
| 25 de agosto de 2010 | R$ 37,74 | R$ 112,00 | R$ 45,00 |
| 26 de agosto de 2010 | R$ 27,28 | R$ 112,00 | R$ 45,00 |
| Subtotal | R$ 65,02 | R$ 224,00 | R$ 90,00 |
| Florianópolis | | | |
| --- | --- | --- | --- |
| 27 de agosto de 2010 | R$ 96,25 | R$ 109,00 | R$ 36,00 |
| 28 de agosto de 2010 | R$ 35,00 | R$ 109,00 | R$ 36,00 |
| Subtotal | R$ 131,25 | R$ 218,00 | R$ 72,00 |

Exemplo da tabela do exemplo 4 com o uso do atributo axis



[Voltar ao sumário](#sumario)

#### Recomendação 3.11 – Garantir a leitura e compreensão das informações

*[Ver
WCAG 2.0 Critério de Sucesso 3.1.5](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/meaning-supplements.html)*

O texto de um sítio deve ser de fácil leitura e compreensão, não exigindo do usuário um nível de
instrução mais avançado do que o ensino fundamental completo. Quando o texto exigir uma capacidade
de leitura mais avançada, deve ser disponibilizado informações suplementares que expliquem ou
ilustrem conteúdo principal. Outra alternativa é versão simplificada do conteúdo em texto.

Existem algumas técnicas que auxiliam na melhora da inteligibilidade de textos, como, por exemplo:

- Desenvolver apenas um tópico por parágrafo;
- Utilizar sentenças organizadas de modo simplificado para o propósito do conteúdo (sujeito,
  verbo e objeto, preferencialmente);
- Dividir sentenças longas em sentenças mais curtas;
- Evitar o uso de jargão, expressões regionais ou termos especializados que possam não ser
  claros para todos;
- Utilizar palavras comuns no lugar de outras pouco familiares;
- Utilizar listas de itens ao invés de uma longa série de palavras ou frases separadas por
  vírgulas;
- Fazer referências claras a pronomes e outras partes do documento;
- Utilizar, preferencialmente, a voz ativa.

Para mais informações sobre como escrever textos para web, acesse ePWG Cartilha de Redação Web (<http://epwg.governoeletronico.gov.br/cartilha-redacao>)
e o manual

[Voltar ao sumário](#sumario)



#### Recomendação 3.12 – Disponibilizar uma explicação para siglas, abreviaturas e palavras incomuns

*[Ver
WCAG 2.0 Critérios de Sucesso 3.1.3](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/meaning-idioms.html) e [Ver WCAG 2.0 Critérios de Sucesso3.1.4](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/meaning-located.html)*

Ao menos na primeira ocorrência de siglas, abreviaturas ou palavras incomuns (ambíguas, desconhecidas
ou utilizadas de forma muito específica), deve ser disponibilizada sua explicação ou forma completa.
Essa explicação pode estar expressa no próprio texto, pode estar presente em um glossário ou, então,
através da utilização do elemento abbr, conforme exemplos a seguir.

Exemplo 1 – Explicação no próprio texto
<p>A ONU (Organização das Nações Unidas) é um órgão internacional criado em 1945.</p>

Exemplo 2 – Utilização de glossário

Um site sobre desenvolvimento Web fornece um link de menu para o Glossário, que contém
explicações para termos como HTML, CSS, Tag, atributo, etc.

Exemplo 3 – Utilização do elementos abbr
<p>Bem-vindo à <abbr title="World Wide Web" lang="en">WWW</abbr>!</p>



[Voltar ao sumário](#sumario)

### 3.4 Apresentação / Design

#### Recomendação 4.1 - Oferecer contraste mínimo entre plano de fundo e primeiro plano

*[Ver
WCAG 2.0 Critério de Sucesso 1.4.3](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-contrast.html)*

As cores do plano de fundo e do primeiro plano deverão ser suficientemente contrastantes para que
possam ser visualizadas, também, por pessoas com baixa visão, com cromodeficiências ou que utilizam
monitores de vídeo monocromático.

Não deverão ser utilizadas imagens atrás do texto (background), pois acabam por dificultar a leitura
e desviar a atenção do usuário.

A relação de contraste pode ser encontrada dividindo-se o valor da luminosidade relativa da cor mais
clara de um dos planos pelo valor da luminosidade relativa da cor mais escura do outro plano. A
relação de contraste entre plano de fundo e primeiro plano de 3:1 é o nível mínimo de contraste
recomendado pela ISO-9241-3. No entanto, levando-se em consideração a perda de percepção do
contraste resultante da baixa acuidade visual, cromodeficiência ou perda de sensibilidade ao
contraste devido ao envelhecimento, é recomendada aqui uma maior relação de contraste, de, no
mínimo, 4,5:1. Existem ferramentas gratuitas disponíveis na Web que verificam a relação de contraste
entre as cores do plano de fundo e do primeiro plano, referenciadas no [capítulo 4](#s4)
deste documento e para uma [tabela de cores no anexo 1](#s7).

**Exemplos de relações de contraste:**

Contraste de 3:1 (abaixo do recomendado)

![Contraste de 3:1 ](imagens/contraste1.png)

Primeiro plano: #3c3cff (RGB 60, 60, 255)

Plano de fundo: #b2b2b2 (RGB 178, 178, 178)

Contraste de 4,5:1 (mínimo recomendado pelo eMAG)

![Contraste mminimo recomendado ](imagens/contraste2.png)

Primeiro plano: #0000a2 (RGB 0, 0, 162)

Plano de fundo: #939393 (RGB 147, 147, 147)

Contraste de 7:1 (mínimo recomendado para alto contraste)

![Contraste mminimo para alto contraste](imagens/contraste3.png)

Primeiro plano: #000065 (RGB 0, 0, 101)

Plano de fundo: #a3a3a3 (RGB 163, 163, 163)



[Voltar ao sumário](#sumario)

#### Recomendação 4.2 – Não utilizar apenas cor ou outras características sensoriais para diferenciar elementos

*[Ver
WCAG 2.0 Critérios de Sucesso 1.3.3](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-understanding.html) e [Ver WCAG 2.0 Critérios de Sucesso1.4.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-without-color.html)*

A cor ou outras características sensoriais, como forma, tamanho, localização visual, orientação ou
som não devem ser utilizadas como o único meio para transmitir informações, indicar uma ação, pedir
uma resposta ao usuário ou distinguir um elemento visual.

![A cor não deve ser o unico elemento de diferenciação. A esquerda sinais com a visão normal, à direita os mesmo sinais vistos por quem tem daltonismo. ](imagens/figura20.png)
A cor não deve ser o unico elemento de diferenciação. A esquerda sinais com a visão normal, à
direita os mesmo sinais vistos por quem tem daltonismo.

HTML - Exemplo incorreto
<p>Existem três procedimentos para executar a tarefa:</p>
<ul>
<li><a href="#">Procedimento A</a></li>
<li><a href="#" class="recomendado">Procedimento B</a></li>
<li><a href="#">Procedimento C</a></li>
</ul>
CSS
a.recomendado {
color: #FF0000;
}
HTML - Exemplo correto
<p>Existem três procedimentos para executar a tarefa:</p>
<ul>
<li><a href="#">Procedimento A</a></li>
<li><a href="#" class="recomendado">Procedimento B (Recomendado)</a></li>
<li><a href="#">Procedimento C</a></li>
</ul>
CSS
a.recomendado {
color: #FF0000;
}

![Exemplo correto de utilização de cores nos elementos](imagens/figura21.png)
Exemplo correto de utilização de cores nos elementos




[Voltar ao sumário](#sumario)

#### Recomendação 4.3 – Permitir redimensionamento sem perda de funcionalidade

*[Ver
WCAG 2.0 Critério de Sucesso 1.4.4](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-scale.html)*

A página deve continuar legível e funcional mesmo quando redimensionada para até 200%. Assim, é
preciso garantir que, quando a página for redimensionada, não ocorram sobreposições nem o
aparecimento de uma barra horizontal.

Exemplo

Exemplo de sítio no qual, à medida que ocorre o redimensionamento, o leiaute se ajusta para que
não ocorram “quebras”.

![Exemplo de página em seu tamanho padrão](imagens/figura22.jpg)
Exemplo de página em seu tamanho padrão

![Exemplo de página redimensionada em 200% sem perda de funcionalidade](imagens/figura23.jpg)
Exemplo de página redimensionada em 200% sem perda de funcionalidade

Além de permitir o redimensionamento sem perda de funcionalidade, o leiaute do sítio deve adequar-se
à resolução de tela do dispositivo pelo qual está sendo acessado, já que, atualmente, não existe
mais um padrão de resolução de tela para os computadores e há uma crescente utilização de
dispositivos móveis.
A melhor maneira de tratar as diferentes resoluções de tela é através do **design
responsivo**, que trata especificamente da forma que o site será renderizado dependendo
do tamanho em pixels da tela que o dispositivo possui e seu objetivo. O design responsivo trata a
resolução de tela considerando faixas de resolução, através de diferentes folhas de estilo para
tratamento das faixas de resolução de tela. Para tratar a folha de estilo, basta inserir no mesmo
documento comandos de Media Queries contendo a resolução máxima de apresentação e as alterações
desejadas logo depois.

![Exemplo de página em seu tamanho padrão](imagens/figura24.png)
Exemplo de leiaute responsivo, que se adapta conforme a resolução da tela



[Voltar ao sumário](#sumario)

#### Recomendação 4.4 – Possibilitar que o elemento com foco seja visualmente evidente

*[Ver
WCAG 2.0 Critério de Sucesso 2.4.7](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-focus-visible.html)*

A área que recebe o foco pelo teclado deve ser claramente marcada, devendo a área de seleção ser
passível de ser clicada.

Por padrão, links e elementos de formulário já apresentam a borda destacada ao receberem o foco do
teclado. Essa borda pode ser modificada via CSS para melhorar o destaque, mas não deverá ser
removida. Recomenda-se que a espessura mínima da borda seja de 2px.

Exemplo CSS
a:focus, a:hover {
border: 2px solid #F00;
}
HTML
<ul>
<li><a href="/acessibilidade/index.php">Página Inicial</a></li>
<li><a href="/acessibilidade/eventos.php">Eventos</a></li>
<li><a href="/acessibilidade/quemsomos.php">Quem Somos</a></li>
<li><a href="/acessibilidade/ead.php">Ensino a Distância (EaD)</a></li>
<li><a href="/acessibilidade/videoaulas.php">Vídeoaulas</a></li>
<li><a href="/acessibilidade/video.php">Ví¬deo em Libras</a></li>
<li><a href="/acessibilidade/oa.php">Objetos de Aprendizagem</a></li>
<li><a href="/acessibilidade/trabalhos.php">Trabalhos Realizados</a></li>
<li><a href="/acessibilidade/mapa.php">Mapa do Site</a></li>
</ul>

![Exemplo de foco visível em menu](imagens/foco.png)
Exemplo de foco visível em menu

A pseudo-classe **:focus** é utilizada para definir o estilo de qualquer elemento HTML
que receber o foco do teclado, como links e elementos de formulário. A pseudo-classe
**:hover** é utilizada para definir o estilo de um elemento quando passa-se o mouse
sobre ele.



[Voltar ao sumário](#sumario)

### 3.5 Multimídia

#### Recomendação 5.1 – Fornecer alternativa para vídeo

*[Ver
WCAG 2.0 Critérios de Sucesso 1.2.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-av-only-alt.html), [Ver WCAG 2.0 Critérios de Sucesso1.2.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-captions.html), [Ver WCAG 2.0 Critérios de Sucesso1.2.6](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-sign.html) e [Ver WCAG 2.0 Critérios de Sucesso1.2.8](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-text-doc.html)*

Deve haver uma alternativa sonora ou textual para vídeos que não incluem faixas de áudio. Para vídeos
que contêm áudio falado e no idioma natural da página, devem ser fornecidas legendas. Além de
essencial para pessoas com deficiência visual, a alternativa em texto também é importante para
usuários que não possuem equipamento de som, que desejam apenas realizar a leitura do material ou
não dispõem de tempo para ouvir um arquivo multimídia.

Exemplo 1

Um vídeo mostra como produzir uma tecnologia assistiva de baixo custo. Não há áudio, mas o vídeo
inclui uma série de números para representar cada etapa do processo. Nesse caso, junto ao vídeo,
deve ser disponibilizado um arquivo com a alternativa de texto que indica o conteúdo do vídeo e
a descrição de cada uma das etapas.

![Trecho de um vídeo com link para a explicação logo em seguida](imagens/exemplos/recomendacao_33a.jpg)
Vídeo contendo arquivo com alternativa em texto

Exemplo 2

Uma universidade oferece a opção de visualizar suas videoaulas com ou sem legendas.

![Trecho de um vídeo com legendas embutidas](imagens/exemplos/recomendacao_33b.jpg)
Vídeo com legenda

Além de alternativa em texto e legenda, é desejável que os vídeos com áudio apresentem alternativa na
Língua Brasileira de Sinais (Libras).

![Vídeo com alternativa em libras interprete humano](imagens/figura28.jpg)
Vídeo com alternativa em libras - interprete humano

![Vídeo com alternativa em libras interprete avatar 3D](imagens/figura29.jpg)
Vídeo com alternativa em libras – interprete avatar 3D

É importante salientar que o player de vídeo deve ser acessível. Deve ser possível acessar os
controles via teclado e os mesmos devem estar devidamente descritos, para serem interpretados pelos
leitores de tela.

**Elemento VIDEO em HTML5**

Vídeos disponibilizados no site devem possuir botões de controles, especialmente para os controles de
play, pause e stop. O HTML5 traz uma grande novidade para esta funcionalidade que é a elemento
VIDEO, um padrão para reprodução de vídeo onde se tornou muito mais fácil controlar as
funcionalidades do vídeo:

Exemplo HTML
<button onclick="playPause()">Play/Pause</button>    
<button onclick="grande()">Grande</button>  
<button onclick="pequeno()">Pequeno</button>  
<button onclick="normal()">Normal</button>  
<video id="video" width="320" height="240" controls>  
<source src="exemplo.mp4" type="video/mp4">  
  <source src="exemplo.ogg" type="video/ogg">  
 Seu navegador não suporta a elemento video.   
</video> 
Javascript
var meuVideo=document.getElementById("video");    
 function playPause()   
{    
    if (meuVideo.paused)    
      meuVideo.play();    
    else    
      meuVideo.pause();    
}    
function grande()   
{    
    meuVideo.width=500;    
}    
 function pequeno()   
{    
    meuVideo.width=300;    
}    
 function normal()   
{    
    meuVideo.width=420;    
}



[Voltar ao sumário](#sumario)

#### Recomendação 5.2 – Fornecer alternativa para áudio

*[Ver
WCAG 2.0 Critérios de Sucesso 1.2.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-av-only-alt.html), [Ver WCAG 2.0 Critérios de Sucesso1.2.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-captions.html) e [Ver WCAG 2.0 Critérios de Sucesso1.2.6](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-sign.html)*

Áudio gravado deve possuir uma transcrição descritiva. Além de essencial para pessoas com deficiência
auditiva, a alternativa em texto também é importante para usuários que não possuem equipamento de
som, que desejam apenas realizar a leitura do material ou não dispõem de tempo para ouvir um arquivo
multimídia. Neste caso, também é desejável a alternativa em Libras.

Exemplo

Em um podcast o entrevistador faz perguntas a um especialista de saúde. Como essas informações
são disponibilizadas ao usuário do sítio em um arquivo de áudio, deve ser fornecido um link para
um arquivo com alternativa em texto, logo após o conteúdo em áudio.

![Player de audio com descrição do podcast](imagens/figura30.png)
Player de audio com descrição do podcast.

Uma apresentação prévia do conteúdo dos dois tipos de arquivo e de sua duração também é desejável.



[Voltar ao sumário](#sumario)

#### Recomendação 5.3 – Oferecer audiodescrição para vídeo pré-gravado

*[Ver
WCAG 2.0 Critério de Sucesso 1.2.3](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-audio-desc.html), [Ver WCAG 2.0 Critérios de Sucesso1.2.5](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-audio-desc-only.html) e [Ver WCAG 2.0 Critérios de Sucesso1.2.7](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/media-equiv-extended-ad.html)*

Vídeos que transmitem conteúdo visual que não está disponível na faixa de áudio devem possuir uma
audiodescrição.

A audiodescrição consiste na descrição clara e objetiva de todas as informações apresentadas de forma
visual e que não fazem parte dos diálogos. Essas descrições são apresentadas nos espaços entre os
diálogos e nas pausas entre as informações sonoras.

Exemplo

Um vídeo de um malabarista se apresentando para um grupo de crianças inclui uma versão com
audiodescrição. O narrador da audiodescrição descreve o número e o tipo de instrumentos que o
malabarista utiliza, bem como as reações que as crianças têm durante a performance.

![Vídeo com audiodescrição](imagens/figura31.jpg)
Vídeo com audiodescrição.



[Voltar ao sumário](#sumario)

#### Recomendação 5.4 – Fornecer controle de áudio para som

*[Ver
WCAG 2.0 Critério de Sucesso 1.4.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-dis-audio.html)*

Deve ser fornecido um mecanismo para parar, pausar, silenciar ou ajustar o volume de qualquer som que
se reproduza na página.

**Elemento audio do HTML5**

Foi criado, no HTML5, o elemento AUDIO que é um padrão para reprodução de áudio e também deve receber
controles de play, pause e stop.

HTML5
<button onclick="playPause()">Play/Pause</button>    
<audio controls id="audio">  
<source src="horse.ogg" type="audio/ogg">  
<source src="horse.mp3" type="audio/mpeg">  
Seu navegador não suporta a elemento audio.   
</audio>  
Javascript
var meuAudio=document.getElementById("audio");    
function playPause()   
{    
    if (meuAudio.paused)    
      meuAudio.play();    
    else    
      meuAudio.pause();    
}



[Voltar ao sumário](#sumario)

#### Recomendação 5.5 – Fornecer controle de animação

*[Ver
WCAG 2.0 Critério de Sucesso 2.2.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/time-limits-pause.html)*

Para qualquer animação que inicie automaticamente na página devem ser fornecidos mecanismos para que
o usuário possa pausar, parar ou ocultar tal animação.

![Gif animado de pessoas num ponto de ônibus com controle de animação](imagens/ilustracao1.jpg)
Gif animado de pessoas num ponto de ônibus com controle de animação.



[Voltar ao sumário](#sumario)

### 3.6 Formulários

#### Recomendação 6.1 – Fornecer alternativa em texto para os botões de imagem de formulários

*[Ver
WCAG 2.0 Critério de Sucesso 1.1.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/text-equiv-all.html)*

Ao serem utilizados botões do tipo imagem (input type=”image”), que servem para o mesmo propósito do
botão do tipo submit, deve ser fornecida uma descrição textual para o botão através do atributo alt,
conforme o exemplo a seguir.

Exemplo 1

![Botão enviar](imagens/exemplos/recomendacao_38_enviar.jpg)
Imagem de botão Enviar

Código:
<input type="image" name="enviar" src="enviar.jpg" alt="enviar">

Já para outros tipos de botões (reset e button), é preciso substituir o botão pela imagem que se
deseja utilizar através do CSS. Nesse caso, para que o botão seja acessível, ele deve possuir um
value descritivo, conforme o exemplo a seguir.

Exemplo 2

![Botão limpar](imagens/exemplos/recomendacao_38_limpar.jpg)
Imagem de botão Limpar

HTML
<input type="reset" name="limpar" value="Limpar" class="btLimpar">
CSS
input.btLimpar{
background:transparent url(btLimpar.jpg) no-repeat left top;
width:100px;
height:47px;
text-indent:-20000px;
border:0;
}



[Voltar ao sumário](#sumario)

#### Recomendação 6.2 – Associar etiquetas aos seus campos

*[Ver
WCAG 2.0 Critério de Sucesso 1.3.1 (Técnica H44)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-programmatic.html)*

As etiquetas de texto (elemento LABEL) devem estar associadas aos seus campos (elementos INPUT,
SELECT e TEXTAREA, à exceção do elemento BUTTON) correspondentes no formulário, através dos
atributos for do label e id do input, os quais deverão ter o mesmo valor.

Exemplo
<label for="nome">Nome: </label>
<input type="text" name="nome" id="nome">
<label>Sexo:</label>
<input type="radio" id="fem" name="sexo">
<label for="fem">Feminino</label>
<input type="radio" id="mas" name="sexo">
<label for="mas">Masculino</label>
<label for="msg">Mensagem: </label>
<textarea name="msg" id="msg">Digite sua mensagem</textarea>
<input type="checkbox" id="receber" name="receber">
<label for="receber">Deseja receber nossa newsletter?</label>

[Ir ao exemplo navegável
Recomendação 6.2](recomendacao-039.php "Ir ao exemplo navegável Recomendação 6.2")



[Voltar ao sumário](#sumario)

#### Recomendação 6.3 – Estabelecer uma ordem lógica de navegação

*[Ver
WCAG 2.0 Critério de Sucesso 2.4.3](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-focus-order.html)*

Os elementos do formulário devem ser distribuídos corretamente através do código HTML, criando,
assim, uma sequência lógica de navegação. Assim, os formulários devem primeiro ser codificados
considerando a ordem lógica de navegação para depois serem organizados visualmente via CSS.

**OBS:** O atributo tabindex (ver recomendação 4) somente deverá ser utilizado
quando existir real necessidade.



[Voltar ao sumário](#sumario)

#### Recomendação 6.4 – Não provocar automaticamente alteração no contexto

*[Ver
WCAG 2.0 Critério de Sucesso 3.2.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/consistent-behavior-unpredictable-change.html)*

Quando um elemento de formulário receber o foco, não deve ser iniciada uma mudança automática na
página que confunda ou desoriente o usuário. Assim, as mudanças devem ocorrer através do acionamento
de um botão.

Exemplo correto
<select id="cidade" name="cidade">
<option value="POA">Porto Alegre</option>
<option value="BH">Belo Horizonte</option>
<option value="RJ">Rio de Janeiro</option>
<option value="SP">São Paulo</option>
</select>
<input type="submit" id="submit" value="Enviar">
Exemplo incorreto
<select name="cidade" id="cidade" onchange="location = this.options[this.selectedIndex].value;">
<option value="POA.html">Porto Alegre</option>
<option value="BH.html">Belo Horizonte</option>
<option value="RJ.html">Rio de Janeiro</option>
<option value="SP.html">São Paulo</option>
</select>

[Ir ao exemplo navegável
Recomendação 6.4](recomendacao-041.php "Ir ao exemplo navegável Recomendação 6.4")



[Voltar ao sumário](#sumario)

#### Recomendação 6.5 – Fornecer instruções para entrada de dados

*[Ver
WCAG 2.0 Critério de Sucesso 3.3.2](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/minimize-error-cues.html)*

Para conteúdo que exigir entrada de dados por parte do usuário, devem ser fornecidas quando
necessário, instruções de preenchimento juntamente com as etiquetas (elemento LABEL). A utilização
de caracteres pré-definidos em áreas de entrada de texto só deve ocorrer se:

- O texto for incluído após a entrada de dados pelo usuário (por exemplo, sugerir um novo nome
  de usuário caso o escolhido já exista);
- A semântica do documento justifique a inclusão de texto pré-definido (por exemplo, uma loja
  virtual que só vende para determinado país já vem com o campo país preenchido);
- Os caracteres tenham sido fornecidos previamente pelo usuário (por exemplo, refinamento de
  busca).

Recomenda-se que a entrada de dados seja facilitada, como a exclusão de caracteres especiais em
campos numéricos (Ex: número de documentos como CPF, datas, moeda), e a simplificação de campos.

O seguinte exemplo indica que a data precisa ser inserida no formato dia (dd) – mês (mm) – ano
(aaaa).

Exemplo 1
<label for="data">Data (dd-mm-aaaa)</label>
<input type="text" id="data" name="data">

Campos de preenchimento obrigatório devem ser claramente indicados. Uma solução para o caso de
campos obrigatórios em formulários é inserir um asterisco em forma de imagem ao lado de cada
campo obrigatório, fornecendo uma descrição no atributo alt para esta imagem, que poderia ser
“campo obrigatório” ou, simplesmente, “obrigatório”.

Exemplo 2
<label for="nome">Nome:
<img src="images/icon\_asterisk.gif" alt="obrigatório"/>
</label>
<input type=text name="nome" id="nome" />

Para quem enxerga, basta visualizar o asterisco para distinguir os campos obrigatórios. Com o
leitor de tela, a informação do alt é lida para o usuário. No caso do exemplo de código acima, o
leitor iria informar algo do tipo: “Campo de edição, nome, obrigatório”.

Exemplo 3

Outra solução é utilizar um elemento SPAN contendo a informação “obrigatório”, que será ocultada
por CSS (ver Recomendação 6 – tabela com mecanismos para ocultar elementos e seus efeitos na
acessibilidade) e, em seu lugar, inserimos a imagem de um asterisco.

HTML
<label for="nome">Nome:
<span>Obrigatório<span/>
</label>
<input type=text name="nome" id="nome" />
CSS
label span{
background-image: images/icon\_asterisk.gif;
text-indent: -20000px;
font-size: 0;
width: 0.1 em;
height: 0.2em;
}

O HTML5 traz um novo atributo, o required, que especifica que um campo é obrigatório. Essa
informação é lida pelo leitor de tela. Além disso, caso o usuário tente enviar o formulário sem
preencher o campo obrigatório, uma informação do tipo “por favor, preencha esse campo” aparecerá
na tela, além de ser interpretada pelo leitor de tela.

EM HTML 5
<label for="nome">Nome:</label>      
<input type=text name="nome" id="nome" required />  
<input type="submit" value="Enviar" />  

![Uso do atributo required](imagens/figura36.png)
Uso do atributo "required"

Além do atributo required, o HTML5 apresenta, também, o placeholder. Ele é utilizado com os
elementos INPUT e TEXTAREA para definir uma dica de preenchimento do campo. Quando o campo
recebe o foco, a dica desaparece, mas é lida pelo leitor de tela.

Exemplo
<input type="email" placeholder=”Digite seu e-mail”>  
<input type="submit" value="Inscrever-se">  

![Uso do atributo placeholder](imagens/figura37.png)
Uso do atributo placeholder

Outros atributos do HTML5 bastante importantes para acrescentar informações aos campos do
formulário são:

- autofocus: Utilizado para o foco do teclado ir diretamente ao campo que possua esse atributo
  quando a página com o formulário for carregada;
- maxlength: Determina um número máximo de caracteres que o campo pode ter;
- min e max: Determina o valor mínimo e máximo para o campo. Podem ser utilizados
  separadamente;
- pattern: Permite que sejam definidas expressões para validação do campo;
- novalidate: Para desativar a validação do formulário (utilizado com o elemento FORM);
- formnovalidate: Para desativar a validação dos dados de um formulário (utilizado com os
  elementos INPUT e BUTTON);
- draggable: Torna o campo arrastável (Drag and Drop);

Além de melhorar a semântica, os novos atributos e valores do HTML5 tornam o desenvolvimento mais
fácil e o resultado mais acessível.

Exemplo
<form action="#" method="post">  
  <label>Nome:   
     <input name="nome" required placeholder="Digite seu nome" autofocus >  
 </label>  
 <label>E-mail:   
     <input name="email" type="email" placeholder="Digite seu e-mail" required>  
 </label>  
 <label>Data:   
     <input type="date" name="data" min="2000-01-02">  
 </label>  
 <label for="CEP">CEP:   
     <input name="CEP" id="CEP" required placeholder="Digite seu CEP" pattern="\d{5}-?\d{3}" />  
 </label>  
 <label>Mensagem:   
        <textarea name="mensagem" required><textarea />
 </label>  
 <input type="submit" name="action" value="Salvar rascunho" formnovalidate>  
 <input type="submit" name="action" value="Enviar">  
</form>

**Renderização**

![Renderização de formulário acessível](imagens/figura38.png)
Renderização de formulário acessível



[Voltar ao sumário](#sumario)

#### Recomendação 6.6 – Identificar e descrever erros de entrada de dados e confirmar o envio das informações

*[Ver
WCAG 2.0 Critério de Sucesso 3.3.1](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/minimize-error-identified.html)*

Quando um erro de entrada de dados for automaticamente detectado, o item que apresenta erro deve ser
identificado e descrito ao usuário por texto.

Exemplo

O usuário envia o formulário e deixa de preencher campos obrigatórios ou preenche algum campo de
maneira incorreta. O foco retorna ao início do formulário contendo o aviso de erro e links
(âncoras) para os campos do formulário que apresentaram erro. Abaixo dos avisos, encontram-se os
campos de formulário que contiveram erro de preenchimento e, também, um link que permite ao
usuário expandir os demais campos do formulário.

![Informação de erro em formulário](imagens/figura39.png)
Informação de erro em formulário

Após a validação dos dados, antes de enviar o formulário, uma tela de confirmação deverá
aparecer, conforme no exemplo a seguir, permitindo que o usuário verifique e, se necessário,
edite as informações antes de enviá-las.

![Página de Confirmação](imagens/figura40.png)
Página de Confirmação

Em HTML5

No HTML5 existem novos valores para o atributo type do elemento INPUT e, de acordo com a
definição do input type, a validação do lado do cliente ocorre através do próprio HTML, já que
esses valores basicamente definem o tipo de dado esperado pelo campo. Por exemplo, no código
abaixo, temos um INPUT do tipo e-mail. Ao tentar enviar o formulário, se o tipo de texto
inserido não for um endereço de e-mail, o navegador irá retornar uma mensagem no próprio campo,
solicitando que o campo seja preenchido corretamente.

Exemplo
<input type="email">  
<input type="submit" value="Inscrever-se">    

![Uso de novos valores type no INPUT](imagens/figura41.png)
Uso de novos valores type no INPUT

O HTML5 acrescentou os seguintes valores para o atributo type:

- email: Indica a entrada de um endereço de e-mail;
- tel: Indica a entrada de um número de telefone;
- search: Indica um controle input do tipo busca;
- url: Indica a entrada de endereço URL;
- datatime: Indica a entrada de data e hora;
- datatime-local: Indica a entrada de data e hora local;
- date: Indica a entrada de apenas uma data;
- month: Indica a entrada de ano e mês apenas;
- week: Indica a entrada de ano e dia da semana;
- time: Indica a entrada de um horário com hora, minuto, segundos e fração de segundos;
- number: Indica uma entrada numérica;
- range: Indica a entrada de um número contido dentro de um intervalo;
- color: Indica a entrada do código de uma cor.



[Voltar ao sumário](#sumario)

#### Recomendação 6.7 – Agrupar campos de formulário

*[Ver
WCAG 2.0 Critério de Sucesso 1.3.1 (Técnicas H71 e H85)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/content-structure-separation-programmatic.html)*

É recomendado que os campos com informações relacionadas sejam agrupadas utilizando o elemento
FIELDSET, principalmente em formulários longos. O agrupamento deverá ser feito de maneira lógica,
associando o elemento LEGEND explicando claramente o propósito ou natureza dos agrupamentos.

Exemplo 1
<form method="post" action="...">
<fieldset>
<legend>Dados Pessoais</legend>
<label for="nome">O seu Nome: </label>
<input type="text" name="nome" id="nome">
...
</fieldset>
<fieldset>
<legend>Dados Profissionais</legend>
<label for="profissao">Sua profissão:</label>
<input type="text" id="profissao" name="profissao">
...
</fieldset>
<fieldset>
<legend>Informações de Contato</legend>
<label for="email">E-mail: </label>
<input type="text" id="email" name="email">
...
</fieldset>
</form>

No caso do elemento SELECT, pode ser utilizado o elemento OPTGROUP para agrupar os itens da lista de
seleção.

Exemplo 2
<label for="instituto">Qual a sua instituição?</label>
<select id="instituto" name="instituto">
<optgroup label="Rio Grande do Sul">
<option value="ifrs">IFRS</option>
<option value="ifsul">IFSUL</option>
<option value="iffarroupilha">IFFarroupilha</option>
</optgroup>
<optgroup label="Santa Catarina">
<option value="ifsc">IFSC</option>
<option value="ifc">IFC</option>
</optgroup>
<optgroup label="Paraná">
<option value="ifpr">IFPR</option>
</optgroup>
</select>

[Ir ao exemplo navegável
Recomendação 6.7](recomendacao-044.php "Ir ao exemplo navegável Recomendação 6.7")



[Voltar ao sumário](#sumario)

#### Recomendação 6.8 – Fornecer estratégias de segurança específicas ao invés de CAPTCHA

*[Ver
WCAG 2.0 Critério de Sucesso 1.1.1 (Técnicas G143 e G144)](http://www.acessibilidade.gov.pt/w3/TR/UNDERSTANDING-WCAG20/text-equiv-all.html)*

CAPTCHAs são utilizados para impedir que softwares automatizados, conhecidos como bots, executem
ações que degradem a qualidade do serviço de um sistema, provocando danos em áreas e e-serviços de
sítios em um curto espaço de tempo, podendo sobrecarregar servidores e deixar sítios indisponíveis
por um dado período.

![Exemplo de CAPTCHA com letras distorcidas](imagens/figura44.png)
Exemplo de CAPTCHA com letras distorcidas

Recomenda-se uma combinação de diferentes estratégias para serviços mais seguros e acessíveis para
substituir o uso de CAPTCHA, como por exemplo:

- Limites de conexão;
- Monitoramento;
- Consistência nas políticas de segurança;
- Uso de técnicas de desenvolvimento de serviços e formulários seguros.

Tal recomendação se deve ao fato de que o uso de CAPTCHA pode ocasionar problemas significativos
a sítios e formulários:

- Usabilidade: O ônus de detecção de problemas e invasões é delegado a pessoa, ao invés do
  sistema. Como CAPTCHAs são projetados para serem difíceis de ler e entender, tornam os
  serviços que os utilizam muito mais difíceis de usar.
- Acessibilidade: Os CAPTCHAS são inacessíveis por sua natureza, não são lidos, nem
  interpretados por leitores de tela. Isso efetivamente torna o serviço inutilizável por
  alguns grupos de pessoas. Mesmo CAPTCHAs que oferecem versões em áudio não resolvem
  completamente o problema, pois muitas pessoas podem possuir deficiência auditiva e visual.
- Segurança: Desenvolver um CAPTCHA internamente costuma gerar CAPTCHAS inseguros, com falhas
  já mapeadas por spammers. No entanto, ao utilizar CAPTCHAS de terceiros há outros problemas
  a serem considerados:
- 1. Privacidade: O serviço de CAPTCHA pode incluir cookies, coletar estatísticas e mapear o
  comportamento de navegação das pessoas que acessam o serviço. Isto introduz preocupações com
  a privacidade significativas.
- 2. Performance: O uso de um serviço CAPTCHA incorre no desempenho do sítio. Se o serviço
  ficar indisponível, o mesmo acontece com o acesso ao serviço da página que utiliza o
  CAPTCHA.

Caso o uso de CAPTCHA seja estritamente necessário, o mesmo deverá ser fornecido em forma de pergunta
simples de interpretação (CAPTCHA Humano), e este preferencialmente só deverá ser apresentado após
pelo menos 2 tentativas de envio do formulário, por exemplo. Tais perguntas poderão ser respondidas
apenas por um ser humano. No entanto, é preciso garantir que a pergunta não seja de difícil
resolução, permitindo que a mesma possa ser respondida por pessoas de variadas culturas e níveis de
instrução. Para tal, podem ser utilizadas perguntas de senso comum, como por exemplo, “qual é a cor
do céu?” ou “o fogo é quente ou frio?”. Também podem ser utilizados testes matemáticos. No entanto,
é preciso tomar cuidado para que esses testes não sejam facilmente “quebrados” por determinados
programas. Uma alternativa é solicitar que o usuário escreva o resultado do teste matemático por
extenso, como “escreva por extenso quanto é 2 + 3”, ou ainda “responda por extenso quanto é dois
mais três”.

Exemplo
<form action="action.php" method="post">
<fieldset>
<legend>CAPTCHA</legend>
<label for="pergunta">Escreva por extenso quanto é dois mais três.</label>
<input type="text" id="pergunta" name="pergunta">
<input type="submit" name="enviar" value="Enviar!">
</fieldset>
</form>

[Ir ao exemplo navegável
Recomendação 6.8](recomendacao-045.php "Ir ao exemplo navegável Recomendação 6.8")

Para mais detalhes sobre CAPTCHA, verificar o documento Orientações para o uso do CAPTCHA no Governo
Federal na seção do eMAG
http://www.governoeletronico.gov.br/eixos-de-atuacao/governo/acessibilidade/material-de-apoio.



[Voltar ao sumário](#sumario)
