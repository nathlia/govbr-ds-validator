<!--
URL: https://www.gov.br/ds/components/footer?tab=acessibilidade
Aba: acessibilidade
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/footer/footer-access.md
Status da coleta: ok
-->

# *Footer* (Rodapé)

Geralmente localizado na parte inferior das páginas, o *footer* (rodapé) pode ser organizado de formas distintas. Normalmente essa organização é definida através da combinação de elementos que reforçam a identidade visual com o conteúdo a ser informado, respeitando os objetivos de negócio e as necessidades do usuário.

# Acessibilidade no Footer

## Navegação e Comportamento

- O *footer* deve ter uma estrutura clara e organizada, com informações relevantes e úteis para o usuário;

- É recomendado que os *links* possam ser acessados via navegação por teclado através da tecla `Tab` e possam ser acionados por meio da tecla `Space` ou `Enter`;

## Recomendações para Estilo e Design

- Verifique o uso das cores em `cor de superfície` e `cor de leitura` no *footer* se correspondem às recomendadas na diretriz de design, garantindo um contraste de cores adequado para uma boa acessibilidade;

- Em dispositivos *mobile* certifique-se de projetar a interface com elementos interativos que possuam área mínima de toque de `44px`;

## Recomendações para Código

- É recomendado usar a *tag* semântica `<footer>` para o componente;

- Mantenha **sempre** habilitado o estado foco na configuração do navegador, para os elementos focados exibirem os recursos visuais próprios do estado;

- Todos os *links* no *footer* devem ser claramente identificados como tal, com texto descritivo que indique o destino do link;

- Use os atributos ARIA para descrever elementos interativos e permitir que usuários com deficiência visual possam interagir com o *footer*.

## Referências

- [W3C World Wide Web Consortium](https://www.w3.org/)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/)
