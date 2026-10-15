<!--
URL: https://www.gov.br/ds/components/carousel?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/carousel/carousel-access.md
Status da coleta: ok
-->

# *Carousel* (Carrossel)

*Carousel* é um componente que permite que vários conteúdos ocupem um único espaço na tela e que o usuário navegue por eles de forma sequencial e controlada.

# Acessibilidade no Carousel

## Navegação e Comportamento

- Ofereça ao usuário navegação via teclado, com o uso das teclas `Tab` e `Shift + Tab`, assim como acionamento dos controles interativos por meio das teclas `Space` ou `Enter`;

- Garanta que o conteúdo do *carousel* se adequará em qualquer resolução de tela. Escolha conteúdos que possam ser ajustados;

- É sempre uma boa ideia colocar qualquer informação importante que apareça em um *carousel* também em outro local na arquitetura da informação do site, para que aqueles que não interajam com o *carousel* tenham a chance de visualizá-la;

- É bastante comum a aplicação de *carousels* no início da tela com imagens de grande impacto. Porém, tenha em mente que o uso do *carousel* é polêmico e gera grande discussão na web. Nilsen/Norman Group, os gurus da usabilidade, confirma em testes de uso que pessoas têm “cegueira” para conteúdos rotativos. A conversão é mínima e os *carousels* são frequentemente ignorados pelos usuários.

## Recomendações para Estilo e Design

- Para exibição de imagens com textos é importante estar atento ao contraste e à legibilidade. Verifique questões como cor, tamanho do corpo do texto e contraste com a cor ou imagem de fundo;

- Quando houver texto sobre uma imagem, considere utilizar uma superfície **overlay** entre a imagem de fundo e o texto para reforçar o contraste. Consulte o documento [Fundamentos Visuais > Superfície](https://www.gov.br/ds/fundamentos-visuais/superficie) para mais detalhes;

- Crie variações da mesma imagem adaptadas para cada resolução de tela. Desta forma, há maior controle da informação apresentada quando o site for visualizado em diferentes resoluções;

- Certifique-se que os botões de navegação e os botões de reprodução estejam claramente visíveis e funcionais;

- Em dispositivos *mobile* certifique-se de projetar a interface com elementos interativos que possuam área mínima de toque de `44px`;

- Sempre que possível, indique a quantidade de páginas do carousel e em que página o usuário se encontra;

- Tenha cuidado com a velocidade de transição entre as páginas. Para mais detalhes, cosulte [Fundamentos Visuais > Movimento](https://www.gov.br/ds/fundamentos-visuais/movimento);

- Não utilize reprodução automática em dispositivos móveis porque torna a página mais lenta e, além disso, porque as páginas são curtas e os usuários geralmente rolam a tela rapidamente para baixo;

- Não utilize a reprodução automática se você não tem certeza sobre qual é a duração de tempo correta. Se o *carousel* se mover muito rapidamente os usuários podem não conseguir ler as informações de forma adequada.

## Recomendações para Código

- Certifique-se de que as imagens e vídeos do *carousel* estejam acessíveis, fornecendo textos alternativos com o atributo `alt` para as imagens e legendas para os vídeos.

- Recomenda-se usar a tag `<picture>` e `<source>` para um melhor controle do uso de imagens para diferentes resoluções de tela. Veja mais informações em [MDN Web Docs - Tag Picture](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/picture).

## Referências

- [Guia WCAG](https://guia-wcag.com/)
- [NN/Group](https://www.nngroup.com/articles/mobile-carousels/)
- [MDN Web Docs - Tag Picture](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/picture)
