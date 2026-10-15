<!--
URL: https://www.gov.br/ds/components/avatar?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/avatar/avatar-access.md
Status da coleta: ok
-->

# Avatar

Componente utilizado para representar graficamente um usuário em ambientes virtuais. Pode apresentar-se como ilustração vetorial (**avatar icônico**), texto (**avatar letra**) e fotografia (**avatar fotográfico**).

# Acessibilidade no Avatar

## Navegação e Comportamento

- É recomendado acessar o *avatar* via navegação por teclado, através da tecla `Tab`;

- Quando o *avatar* for um elemento interativo, recomenda-se usar as teclas `Space` ou `Enter` para acioná-lo.

## Recomendações para Estilo e Design

- Verifique se o uso das cores em `cor de superfície` e `cor de leitura` no avatar do tipo letra correspondem às recomendadas no Fundamento Visual Cor, garantindo um contraste adequado para a leitura de usuários com deficiência visual ou daltonismo;

- Utilize **tooltip** para indicar o nome completo e/ou outras informações do perfil que sejam relevantes para o usuário;

- Use tamanhos de avatar adequados para torná-lo legível e distinguível em diferentes tamanhos de tela. É importante que o avatar seja grande o suficiente para ser facilmente identificado, mas não tão grande que obscureça outros elementos na tela.

- Em dispositivos mobile, certifique-se de projetar a interface com elementos interativos que possuam área mínima de toque de `44px`;

- Para o avatar tipo foto, permita que o usuário utilize as principais extensões de arquivo de imagem (jpg, gif, png) e limite o tamanho máximo da imagem (sugestão 1MB) para evitar que sobrecarregue o sistema.

## Recomendações para Código

- Forneça um texto alternativo descritivo que descreva a imagem do avatar adicionando o atributo `alt`. Isso é útil para usuários que usam tecnologias assistivas, como leitores de tela;

- Para o avatar do tipo icônico, recomenda-se usar o `aria-hidden = "true"` no ícone. Também é recomendado usar `aria-label = "nome do usuário"`, caso não seja possível usar essa informação em um *tooltip*;

- Mantenha **sempre** habilitado o estado foco na configuração do navegador, para os elementos focados exibirem os recursos visuais próprios do estado.

## Referências

- [Guia WCAG](https://guia-wcag.com/)
- [Mayflower Design System](https://mayflower.digital.mass.gov/core/index.html?path=/docs/elements-buttons--button-primary)
- [Carbon Design System](https://carbondesignsystem.com/components/button/accessibility)
