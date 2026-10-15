<!--
URL: https://www.gov.br/ds/guias/boas-praticas-de-html
Aba: não se aplica
Data de acesso: 2026-10-15
Fonte oficial congelada: site-content
Commit: 953ea2f3bc1c7c849915317e523cd2fc499e3db1
Caminho-fonte: guias/boas-praticas-de-html/boas-praticas-de-html.md
Status da coleta: ok
-->

Esse documento propõe um padrão de codificação para a linguagem **HTML5**.

## A Linguagem HTML5

A linguagem HTML é definida pelo [World Wide Web Consortium - W3C][1] e sua especificação técnica e diretrizes estão publicadas na seção de Web Design e Applications.

Atualmente o documento que especifica a linguagem HTML é o [W3C Recomendations - HTML5.2][2].

Observe que a versão da linguagem HTML nessa especificação é 5.2. Porém iremos referenciá-la apenas por **HTML5**.

## Padrão de Codificação HTML

A seguir é apresentado o padrão de codificação HTML utilizado no Design System de governo. Sua intenção é estabelecer um código HTML com qualidade, facilitando a colaboração e a infraestrutura de suporte.

### Documento HTML

1. Especificar o **DOCTYPE** para a linguagem **HTML5**

   ```html
   <!doctype html>
   ```

1. Definir a \*\*Língua"" no elemento `html`

   ```html
   <html lang="pt-BR"></html>
   ```

1. Incluir as tags `head` e `body`

   ```html
   <head>
     ...
   </head>

   <body>
     ...
   </body>
   ```

1. Definir a **codificação de caracteres** para **UTF-8**

   ```html
   <meta charset="UTF-8" />
   ```

1. Incluir a **viewport** com layout igual à largura do dispositivo e escala 1:1

   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
   ```

1. Incluir **modo de compatibilidade** para o Internet Explorer.

   ```html
   <meta http-equiv="X-UA-Compatible" content="ie=edge" />
   ```

   > Essa *meta tag*, que é exclusiva para Internet Explorer, define o modo de documento [X-UA-Compatible][3] que permite determinar em qual versão do Internet Explorer a página será renderizada.
   >
   > `content="id=edge"` diz ao Internet Explorer para usar o modo mais alto disponível para aquela versão do Internet Explorer.

1. Incluir a tag `title`

   ```html
   <title>Título do Documento</title>
   ```

1. Esqueleto do documento HTML

   ```html
   <!doctype html>
   <html lang="pt-BR">
     <head>
       <meta charset="UTF-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
       <meta http-equiv="X-UA-Compatible" content="ie=edge" />
       <title>Título do Documento</title>
     </head>

     <body></body>
   </html>
   ```

### Comentários

1. Se o comentário ocupar apenas **uma linha**, incluí-lo **na mesma linha das tags de abertura e fechamento de comentários** e inserir **espaço** antes e depois do comentário

   ```html
   <!-- Comentário de uma linha -->
   ```

1. Se o comentário ocupar **múltiplas linhas**, incluí-lo **entre as tags de abertura e fechamento de comentário** em suas **próprias linhas** e **SEM identação**

   ```html
   <!--
   Isso é um comentário
   que ocupa múltiplas linhas
   -->
   ```

### Formatação

1. Indentar o código usando **2 espaços** ou tabs que ocupem 2 espaços.

   ```html
   <div>
     <ul>
       <li>Item 1</li>
       <li>Item 2</li>
       ...
     </ul>
   </div>
   ```

1. **NÃO indentar** as tags `head` e `body` em relação à tag `html`

   ```html
   <html>
     <head>
       <title></title>
     </head>

     <body>
       <h1></h1>
     </body>
   </html>
   ```

1. Escrever as tags e os atributos em **minúsculo**

   ```html
   <div id="input-box" class="extra-large">
     <label for="email" class="form-label">Email</label>
     <input type="email" id="email" name="email" class="input-text" />
   </div>
   ```

1. Fechar tags que possuem **tags de fechamento correspondente**

   ```html
   <label for="email" class="form-label">Email</label>
   ```

1. NÃO fechar tags de **fecho automático**

   ```html
   <input type="email" id="email" name="email" class="input-text" />
   ```

1. Escrever os valores dos atributos entre **aspas duplas**

   ```html
   <label for="full-name">Nome</label>
   <input type="text" id="full-name" name="full-name" class="form-input" placeholder="Nome Completo" />
   ```

1. NÃO incluir valor nos **atributos boleanos**

   ```html
   <label for="comment">Comentário</label> <input type="text" id="comment" name="comment" disabled />
   ```

1. Omitir **atributos de tipo e linguagem** nas tags `script`

   ```html
   <script src="/script.js">
   ```

1. Omitir **atributos de tipo** na tag `link`

   ```html
   <link rel="stylesheet" href="/style.css" />
   ```

1. Escrever **estilos e scripts** em seus próprios arquivos

   ```html
   <link rel="stylesheet" href="/style.css">
   <script src="/script.js">
   ```

## Referências

- [World Wide Web Consortium - W3C][1]
- [W3C Recomendations - HTML5.2][2]
- [X-UA-Compatible][3]

[1]: https://www.w3.org/
[2]: https://www.w3.org/TR/2017/REC-html52-20171214/
[3]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/http-equiv#x-ua-compatible
