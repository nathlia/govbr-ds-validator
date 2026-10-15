<!--
URL: https://www.gov.br/ds/components/avatar?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/avatar/avatar.md
Status da coleta: ok
-->

# Avatar

Componente utilizado para representar graficamente um usuário em ambientes virtuais. Pode apresentar-se como ilustração vetorial (**avatar icônico**), texto (**avatar letra**) e fotografia (**avatar fotográfico**).

## Uso

![Exemplos de avatares.](imagens/avatar-diretriz.png)
*Exemplo de avatares.*

Use avatar quando houver necessidade de representar visualmente um usuário no ambiente virtual, como acontece quando o usuário realiza *login*.
Pode ser utilizado também em qualquer situação em que seja necessário representar graficamente o usuário como em *chats* ou mensagens específicas.

---

## Anatomia

| ID  | Nome                     |                    Referência                    | Uso         |
| --- | ------------------------ | :----------------------------------------------: | ----------- |
| 1   | Superfície circular      | [Superfície](/ds/fundamentos-visuais/superficie) | Obrigatório |
| 2   | Representação do usuário |                       ---                        | Obrigatório |

![Anatomia do avatar.](imagens/avatar-anatomia.png)
*Anatomia do avatar.*

---

## Detalhamento dos Itens

### 1. Superfície circular (Obrigatório)

A representação do usuário deve estar contida em uma superfície circular. A dimensão da superfície pode variar em uma escala de três dimensões que será melhor detalhado adiante.

![Exemplos de dimensões do avatar.](imagens/superficie.png)
*Variações da dimensão da superfície do avatar.*

A superfície, nos casos dos avatares icônico e letra, podem assumir quaisquer cores da paleta cromática do Design System sendo sugerida a utilização das cores de apoio. Tenha em mente a garantia do contraste entre ícone/letra e superfície.

### 2. Representação do usuário (Obrigatório)

A representação do usuário é como o usuário deseja ser reconhecido digitalmente. Há três maneiras de fazer isso:

- Por um ícone do sistema;
- Por uma foto escolhida pelo usuário;
- Por um texto com a inicial do usuário.

---

## Tipos

### 1. Avatar Icônico

Este tipo de avatar pode ser usado quando o usuário não fez *upload* de imagem ou é logado pela primeira vez.

![Exemplo de avatar icônico.](imagens/avatar-iconico.png)
*Exemplo de avatar icônico.*

A qualquer momento o usuário poderá alterar este avatar por qualquer um dos demais tipos.

### 2. Avatar Fotográfico

O avatar fotográfico exibe uma foto escolhida pelo usuário para representá-lo digitalmente.

![Exemplos de avatar fotográfico.](imagens/avatar-fotografico.png)
*Exemplos de avatares fotográficos.*

A qualquer momento o usuário poderá alterar este avatar por qualquer um dos demais tipos.

### 3. Avatar Letra

O avatar letra mostra a inicial do usuário para representá-lo digitalmente.

![Exemplos de avatar letra.](imagens/avatar-letra.png)
*Exemplos de avatares letra.*

A qualquer momento o usuário poderá alterar este avatar por qualquer um dos demais tipos.

---

## Comportamentos

### 1. Densidades

Existem três densidades de avatar:

- **Densidade alta**: facilmente incorporado em uma lista de contatos e cenários repetitivos semelhantes;

- **Densidade média**: apropriado para menus personalizados e visualizações;

- **Densidade baixa**: adequado para páginas de perfil.

![Exemplos de densidades do avatar.](imagens/avatar-scale.png)
*Exemplos de densidades do avatar.*

**Atenção:** Apesar das sugestões de uso citados acima, o designer ou desenvolvedor deve contar com bom senso ao optar pela dimensão que melhor se adapta ao *layout* planejado.

### 2. Acionador *Dropdown*

Em algumas situações o *Avatar* pode ser utilizado como acionador *Dropdown*, geralmente quando há a necessidade de exibir algum detalhamento ou informação adicional a respeito do usuário representado neste. O usuário pode interagir sobre o *Avatar* com um `clique` ou `mouseover`, exibindo um elemento *Dropdown*. Observe o exemplo abaixo.

![Avatar como Acionador Dropdown](imagens/avatar-trigger-01.png)
*Avatar como Acionador Dropdown*

**Importante!** Nesta situação, é opcional o uso de um identificador, reforçando a ideia que este elemento é um acionador *Dropdown*. Este identificador é posicionado à direita e centralizado verticalmente no *Avatar*. Consulte mais detalhes em *Padrões > Dropdown*.

![Avatar com Identificador - Opcional](imagens/avatar-trigger-02.png)
*Avatar com Identificador - Opcional*

---

## Melhores Práticas

- Dê a liberdade para o usuário escolher o avatar que melhor o representa e facilite o fluxo para a troca de imagem.

- Quando não houver a foto pessoal o usuário poderá optar entre uma imagem neutra de um ícone de usuário ou a sua inicial.

- Uma boa ideia é associar o avatar ao uso de *tooltip* para mostrar o nome completo e/ou outras informações do perfil que sejam relevantes.

---

## Especificações

### Dimensão

| Name              | Property     | Token/Value |
| ----------------- | ------------ | ----------- |
| Superfície small  | width/height | `40px`      |
| Superfície medium | width/height | `100px`     |
| Superfície Large  | width/height | `160px`     |

## Tipografia

| Name           | Property    |        Token/Value        |
| -------------- | ----------- | :-----------------------: |
| Letra          | family      |   `–-font-family-base`    |
| Letra          | font-weight |   `--font-weight-bold`    |
| Letra (small)  | size        | `--font-size-scale-up-03` |
| Letra (medium) | size        | `--font-size-scale-up-07` |
| Letra (large)  | size        | `--font-size-scale-up-11` |

## Iconografia

| Name                             |               Ícone               |       Size       | Class (Font Awesome) |
| -------------------------------- | :-------------------------------: | :--------------: | :------------------: |
| Ícone (small)                    |    <i class="fas fa-user"></i>    | `--icon-size-2x` |      `fa-user`       |
| Ícone (medium)                   |    <i class="fas fa-user"></i>    | `--icon-size-5x` |      `fa-user`       |
| Ícone (large)                    |    <i class="fas fa-user"></i>    | `--icon-size-8x` |      `fa-user`       |
| Identificador Dropdown (Fechado) | <i class="fas fa-caret-down"></i> | `--icon-size-2x` |   `fa-caret-down`    |
| Identificador Dropdown (Aberto)  |  <i class="fas fa-caret-up"></i>  | `--icon-size-2x` |    `fa-caret-up`     |
