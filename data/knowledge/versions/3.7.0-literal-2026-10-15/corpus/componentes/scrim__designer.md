<!--
URL: https://www.gov.br/ds/components/scrim?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/scrim/scrim.md
Status da coleta: ok
-->

# Scrim

Scrims são tratamentos temporários que podem ser aplicados às superfícies dos elementos de uma interface com o objetivo de tornar o conteúdo menos proeminente.

## Uso

![Exemplo de Scrim](imagens/scrim_zoom.png)

Scrims ajudam a redirecionar a atenção do usuário para outras partes ou elementos da tela, retirando possibilidade de foco, ou inibindo a interação com a superfície que o recebe.

Multiplas áreas ou qualquer elemento (parcialmente ou não), pode receber scrim.
Podem existir vários scrims ativos na mesma tela e de diferentes tipos.

Usado fundamentalmente para oferecer:

- **Foco:** Quando existe mudança de foco entre um elemento e outro;
- **Legibilidade:** Quando um texto precisa ser aplicado sobre uma superfície e o contraste entre fundo/texto não é suficiente para gerar um contraste acessível;
- **Inibição:** Simular elementos para o estado de desativado;

---

## Anatomia

Um Scrim é uma sobreposição, ou seja, uma forma semi-transparente sobre uma área.

Pode ser aplicado sobre um elemento inteiro, de forma pacial ou sobre toda a tela visível de um dispositivo.

![Anatomia](imagens/scrim.png)

Em alguns casos, pode ser necessário a utilização de um **scrim vazado**, cuja característica é possuir uma área de fresta para dar destaque.

A cor e o valor da opacidade variam de acordo com o tipo de scrim utilizado.

---

## Tipo

Existem 3 tipos de scrim: **Foco**, **Legibilidade** e **Inibição**.
A escolha deve ser feita baseada na necessidade de uso.

---

### Foco

Usado para alterar o foco hierárquico de um elemento sobre outro ou sobre vários elementos ao mesmo tempo, onde um determinado conteúdo precisa de uma grande relevância sobre os demais.

Usado principalmente quando um novo elemento surge na tela e necessita de uma atenção especial do usuário. As demais áreas que não requerem atenção do usuário ficam escuras, enquanto o elemento em questão ganha total atenção.

![Scrim de Foco](imagens/foco.png)

O **scrim vazado** pode ser utilizado com esta finalidade, onde o elemento de atenção deve ser concentrado na área de fresta do scrim.

![Scrim Inverso de Foco ](imagens/inverso_foco.png)

O scrim recebe as seguintes especificações:

- **Cor:** #000000
- **Opacidade:** 40%

---

### Legibilidade

Usados como um tipo de sobreposição (overlay), buscando melhorar o constraste e leitura do texto sobre qualquer superfície, podendo ser uma imagem ou não. Pode ser usado parcial ou totalmente sobre um elemento/componente.

![Scrim Legibilidade Parcial](imagens/legibilidade_parcial.png)

![Scrim Legibilidade TOtal](imagens/legibilidade_total.png)

O scrim recebe as seguintes especificações:

- **Cor:** #000000
- **Opacidade:** 64%

---

### Inibição

Por possuir um comportamento que impede a interação de elemento soprepostos, o scrim pode ser usado para simular o estado desativado de elementos dentro de uma área.

A principal característica neste modo, é que o elemento que recebe o scrim ficará visualmente desativado, simulando transparência em relação ao fundo.

![Scrim Inibição](imagens/inibicao_01.png)

> Utilize o scrim de inibição sobre opções que ainda não podem ser obtidas pelo o usuário.

Esse tipo de scrim deve ser utilizado com cautela, pois os elementos que estarão abaixo da scrim não estarão realmente em estado desativado. Esse recurso deve ser utilizado em situações onde uma grande área deve ser temporariamente desativada.

Em pequenas áres ou componentes, sempre que possível, prefira configurar o elemento para o estado desativado,ao invés da utilização deste recurso.

![Scrim Inibição](imagens/inibicao_02.png)

> **Cuidado**: não crie obstáculos para o usuário realizar uma busca ou utilizar a área de acessibilidade. Deve existir uma boa justificativa para impedir acesso a essas áreas de suporte.

O scrim recebe as seguintes especificações:

- **Cor:** cor de fundo predominante do elemento que recebe o scrim
- **Opacidade:** 64%
