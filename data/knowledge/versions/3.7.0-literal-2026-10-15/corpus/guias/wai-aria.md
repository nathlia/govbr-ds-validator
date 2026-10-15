<!--
URL: https://www.gov.br/ds/guias/wai-aria
Aba: não se aplica
Data de acesso: 2026-10-15
Fonte oficial congelada: site-content
Commit: 953ea2f3bc1c7c849915317e523cd2fc499e3db1
Caminho-fonte: guias/wai-aria/wai-aria.md
Status da coleta: ok
-->

Esse documento apresenta uma breve introdução ao [Accessible Rich Internet Application - ARIA][1], desenvolvido pela [Web Accessibility Initiative - WAI][2].

## O que é WAI-ARIA

O WAI-ARIA é uma especificação técnica que provê um framework para melhorar a acessibilidade e interoperabilidade dos conteúdos web e aplicações.

A incorporação do WAI-ARIA é uma maneira de um autor fornecer semânticas apropriadas para widgets customizados para tornar esses widgets acessíveis, utilizáveis e interoperáveis com tecnologias assistivas.

A especificação identifica os tipos de widgets e estruturas que são comumente reconhecidos pelos produtos de acessibilidade, fornecendo uma ontologia dos **roles** (papéis/função) correspondentes que podem ser anexadas ao conteúdo.

Isso permite que elementos com um determinado role sejam entendidos como um determinado widget ou tipo estrutural, independentemente de qualquer semântica herdada da linguagem do host de implementação.

Os roles são uma propriedade comum das APIs das plataformas de acessibilidade que as tecnologias assistivas usam para fornecer ao usuário uma apresentação e interação eficazes.

## Como usar o WAI-ARIA

Aplicações web complexas se tornam inacessíveis quando as tecnologias assistivas não conseguem determinar as semânticas por trás das partes de um documento ou quando o usuário não consegue efetivamente navegar por todas a suas partes de forma útil.

O WAI-ARIA divide a semântica entre **roles** (o tipo que define o elemento da interface de usuário) e **states** e **properties** relacionado aos roles.

Os autores precisam associar elementos no documento a um **role** WAI-ARIA e aos **states** e **properties** apropriados (**aria- \* attributes**) durante o ciclo de vida dos elementos, a menos que os elementos já tenham a semântica WAI-ARIA implícita apropriada para os **states** e **properties**.

Nessas instâncias, os **states** e **properties** equivalentes da linguagem do host têm precedência para evitar um conflito, enquanto o atributo **role** terá precedência sobre o **roles** função implícitos do elemento da linguagem do host.

### WAI-ARIA Roles

O WAI-ARIA role é definido em um elemento usando o atributo `role`

```html
<li role="menuitem">Abrir arquivo...</li>
```

A especificação WAI-ARIA define uma taxonomia ([WAI-ARIA role taxonomy][3]) e os comportamentos esperados pelos roles. Ela fornece as seguintes informações:

- Uma informação descritiva sobre o role
- Informações de hierarquia entre os roles
- O contexto do role
- Referências e conceitos relacionados em outras especificações
- Uso da Web Ontology Language para fornecer uma hierarquia

  de tipos permitindo herança semântica (semelhante a uma hierarquia de classes)

- States e properties suportados para cada role

> Anexar uma role fornece informações às tecnologias assistivas sobre como lidar com cada elemento.

### WAI-ARIA States e Properties

O WAI-ARIA fornece uma coleção de **states** e **properties** de acessibilidade que são usados para suportar APIs das plataformas de acessibilidade em vários sistemas operacionais.

As tecnologias assistivas podem acessar essas informações por meio de um DOM do agente do usuário ou por meio de um mapeamento para a API da plataforma de acessibilidade.

Quando combinado com **roles**, o agente do usuário pode fornecer às tecnologias assistidas informações da interface do usuário a qualquer momento. Alterações nos **states** ou **properties** resultarão em uma notificação às tecnologias de assistência, o que poderia alertar o usuário de que uma alteração ocorreu.

O exemplo abaixo usa um list item que foi usado para criar um menu com checkbox, e os eventos JavaScript irão capturar os eventos de mouse e teclado para alternar o valor de `aria-checked` . O role é usado para que o comportamento desse widget seja conhecido pelo agente de usuário.

```html
<li role="menuitemcheckbox" aria-checked="true">Ordenado pela última modificação</li>
```

Os **states** e **properties** podem ser consultados na seção [WAI-ARIA States and Properties][4]

Esses **states** e **properties** são usados juntamente com os **roles** e a taxonomia dos roles implica uma relação hierárquica entre eles, o que leva a um conjunto de estados e/ou propriedades herdados entre os roles e alguns de uso específico de cada role.

> Consulte a [Especificação WAI-ARIA][1] para tomar conhecimento de todas a roles disponíveis, bem como a relação hierárquica entre elas.
>
> A relação hierárquica entre as roles define quais **states** e **properties** cada **role** possui e quais são herdados por outras **roles**.
>
> O [Diagrama de Classes dos Relacionamentos Entre as Roles][5] contido na [Especificação WAI-ARIA][1] mostra graficamente essa hierarquia.

## Referências

- [Accessible Rich Internet Application - ARIA][1]
- [Web Accessibility Initiative - WAI][2]
- [WAI-ARIA role taxonomy][3]
- [WAI-ARIA States and Properties][4]
- [Diagrama de Classes dos Relacionamentos Entre as Roles][5]

[1]: https://www.w3.org/TR/wai-aria/
[2]: https://www.w3.org/WAI/
[3]: https://www.w3.org/TR/wai-aria/#role_definitions
[4]: https://www.w3.org/TR/wai-aria/#states_and_properties
[5]: https://www.w3.org/TR/wai-aria/img/rdf_model.svg
