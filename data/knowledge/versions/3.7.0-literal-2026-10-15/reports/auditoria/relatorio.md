# Auditoria independente da extração (passo 2 do plano D-119), 2026-10-15

Auditor: agente novo, que não fez a extração. Arquivos lidos: o plano, `PROVENIENCIA.md`, `rules.jsonl`,
`cobertura.json/md`, `resumo.md`, `decisoes/`, e os `.md` literais do corpus. Não foram abertos `govbr-eval`,
`govbr-telas`, `govbr-resultados`, `govbr-corpus`, o validator, nem outro arquivo de `thesis-workspace`. Nenhum
arquivo do extrator foi alterado.

## Como a amostra foi tirada

- `amostrar.py`, com a semente `auditoria-base-ds-2026-10-15`, grava `amostra.json`. Rodar de novo dá a mesma amostra.
- Estratos sem as `unclear`: ceil(10%) de cada estrato, com mínimo de 5. Isso dá **292 regras**. Depois entram
  **todas as 64 `unclear`** e **40 das 823 frases excluídas** em `cobertura.json`.
- Cada item foi lido contra o `.md` de origem, na própria passagem e na seção em volta (`ver.py` e `ver_exc.py`
  mostram o contexto e as regras vizinhas). O julgamento está em `vereditos-fonte.txt`, uma linha por defeito.
  `gerar.py` monta `vereditos.jsonl` e as taxas.

| estrato | população (sem unclear) | n | com defeito | literal | atomização | força | escopo | altas |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| componente×designer | 1330 | 133 | 10 | 1 | 7 | 2 | 0 | 3 |
| componente×acessibilidade | 370 | 37 | 2 | 2 | 0 | 0 | 0 | 0 |
| componente×desenvolvedor | 204 | 21 | 3 | 0 | 1 | 2 | 0 | 2 |
| padrões | 462 | 47 | 5 | 3 | 2 | 0 | 0 | 1 |
| fundamentos | 217 | 22 | 0 | 0 | 0 | 0 | 0 | 0 |
| e-MAG | 218 | 22 | 2 | 1 | 1 | 0 | 0 | 0 |
| guias | 41 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| outras (introdução, acessibilidade) | 15 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| **total** | **2857** | **292** | **22 (7,5%)** | **7 (2,4%)** | **11 (3,8%)** | **4 (1,4%)** | **0** | **6** |

Os 22 itens com defeito somam 22 defeitos: 6 altos, 4 médios e 12 baixos. Nenhuma regra está em componente, aba ou
seção errados. Todo `originalText` sorteado existe no arquivo e bate com o `charRange`.

## As 64 `unclear`

Todas as notas do extrator dizem o motivo certo: o texto realmente mistura duas modalidades. Em todas, porém, dá
para propor uma força com uma regra simples. Duas também juntam obrigações (veja as altas abaixo). As propostas são
estas:

| proposta | n | padrão do texto |
|---|---:|---|
| prohibited | 19 | permissão restrita: "só pode existir um elemento com foco/hover/… por vez", "podem conter no máximo três dígitos", "os únicos tipos que podem…", "seu uso é exclusivo" |
| recommended | 12 | "deve … preferencialmente", "geralmente deve", "é uma boa prática e sempre que possível deve" |
| discouraged | 12 | "deve-se evitar" / "deve ser evitado" (é o "evite" da tabela, numa forma composta) |
| required | 9 | "é fundamental que" / "é essencial" |
| permitted | 4 | modificadores opcionais (`small`, `circle`, `highlighted`, `all`) listados sob "Propriedades obrigatórias" no select |
| informative | 4 | "é muito importante" sem conduta |
| required disjuntivo | 2+1 | primary/secondary no sign-in; o modal "deve ser centralizado ou pode ser exibido próximo" |
| outras | 2 | exceção de regra vizinha (sangria no item); um caso required + prohibited, depois de partido (cookiebar) |

Quatro políticas mecânicas resolvem cerca de 40 das 64 (as outras ~24 têm proposta individual em `vereditos.jsonl`):
1. "deve-se evitar" → discouraged;
2. "deve … preferencialmente" → recommended;
3. "só/apenas/somente … pode" → prohibited do complemento;
4. "é fundamental/essencial" → required.

Na população inteira essas formas aparecem 11, 6, 16 e 9 vezes. Todas estão `unclear`, exceto uma "essencial"
marcada recommended e uma permissão restrita marcada prohibited. As políticas só precisam de uma decisão de método,
registrada no D-xx.

## As 40 frases excluídas

Das 40, 39 foram bem excluídas. São exemplos de interface ("Recomendado/Não recomendado"), títulos de seção cuja
obrigatoriedade já vem da linha da tabela de anatomia (conferido para card, radio e textarea), justificativas,
definições e uma legenda repetida. Há um defeito médio, o **E28** (`padroes/design/emptystates.md` k=117): "Por
exemplo, *Empty States* de uma tabela deve substituir toda sua estrutura, Cabeçalho, Rodapé, Linhas e Colunas". É
requisito verificável próprio, com imagens de forma errada e certa, e foi descartado como exemplo. Também é
discutível o **E23** (button): "o rótulo e o ícone permanecem sempre centralizados…" é especificação fixa do
componente escrita no modo descritivo. Fica como `informative`, pela regra "força pelo texto".

## Os mapeamentos extras do extrator

- **"precisa / é necessário" → deve** (54 regras): correto. Nos casos lidos, o sentido é de obrigação.
- **"nunca / jamais" → não deve** (14): correto.
- **"não pode" → não deve** e **imperativo negativo → "não utilize"** (26): fiéis à letra do plano. Alguns caem
  em conselho de estilo ("Não zombe de seus usuários", "Não sobrecarregue o header"), mas a tabela do plano manda
  assim.
- **Imperativo → "utilize" → recommended** (438): correto e coerente. O que destoa é o infinitivo em contexto de
  obrigação. Veja o padrão 3.
- **Força pelo título da seção ("Propriedades obrigatórias") → required** (92 linhas de tabela): este mapeamento
  não está no plano e precisa de cuidado. Ele acerta nas linhas de container (`br-button`, `br-input`…). Erra nos
  modificadores com valor padrão (carousel `data-type`, menu `menu-scrim` "Aplica o efeito de scrim"). O próprio
  extrator marcou como `unclear` os quatro modificadores do select e as duas ênfases alternativas do sign-in, mas
  não fez o mesmo nos outros componentes.
- **"é importante / é muito importante que + conduta" → recommended**, **"boa ideia" → recommended**: corretos.

## Padrões sistemáticos

1. **Introdução de lista sem os itens.** O trecho termina em ":" e os itens da lista não viraram regra nem entraram
   no `originalText`. Na amostra são os casos 61 ("Utilize botões quando for necessário realizar ações contendo as
   seguintes características:") e 277 ("Este modelo é recomendado para:"). A varredura da base inteira achou
   **23 introduções seguidas de lista sem nenhuma regra dentro**. Os "Utilize X quando:" de input, pagination,
   steps, tabs, textarea e tooltip perderam justamente as condições de uso. Há também cinco com força required ou
   prohibited, cujo conteúdo sumiu: "O estado Selecionado não pode ser aplicado nos seguintes componentes:",
   "Para usar o componente Cookiebar é necessário os seguintes artefatos:", "seu uso deve estar associado com um
   tipo de scrim:", "Os textos de ligado e desligado devem ficar em atributos data-\*:" e "A utilização de
   caracteres pré-definidos … só deve oc…:".
2. **Fragmento de oração sem sujeito, ou separado da exceção.** Ao partir uma frase em várias regras, o pedaço
   começa em "que…", "mas…", "desta forma…" ou "e este…" e perde o sujeito, a condição ou a exceção. Exemplos: 136
   (pagination, "que por padrão deverá ser acionada quando existir uma lista acima de 4 itens", com a exceção
   "esse valor poderá ser personalizado" virando outra regra), 199 (e-MAG 4.4, "mas não deverá ser removida.",
   sem dizer que é a borda de foco), 160, 168, 137 e 12. Na base, **173 regras começam em minúscula**. Muitas
   estão certas ("porém as margens internas devem ser respeitadas"), mas esse é o lugar onde procurar.
3. **Força incoerente para infinitivo em seção obrigatória.** No 48, footer, a seção "Configurações obrigatórias"
   tem "Buscar os elementos com a classe br-footer e inicializar o construtor" como recommended (pelo infinitivo),
   enquanto as linhas de tabela da mesma seção são required (pelo título).
4. **Obrigações juntas** (37, 186, 297, 305). Duas delas são de baixo impacto (mesma força e mesmo sujeito). As
   outras duas misturam forças ou condutas distintas.
5. **"pode" descritivo como permitted** (64 "Um card pode ficar sozinho", 179 "A mensagem pode ter até quatro
   objetivos"). É baixo: são capacidades do componente, não permissões de projeto.

## Defeitos ALTOS (critério do pedido: força errada em required/prohibited, obrigações juntas, condição omitida que muda o sentido, componente errado)

| n | id | tipo | correção |
|---|---|---|---|
| 48 | govbr-3.7.0-development-footer-14f4122847cf | força rebaixada (recommended numa seção "Configurações obrigatórias") | required, coerente com as linhas da mesma seção |
| 61 | govbr-3.7.0-component-button-a968663df02d | introdução de lista sem itens ("…as seguintes características:") | estender o trecho até o fim da lista |
| 277 | govbr-3.7.0-pattern-global-ab496170eab8 | introdução de lista sem itens ("Este modelo é recomendado para:") | idem |
| 136 | govbr-3.7.0-component-pagination-a1f8c3810cfd | fragmento sem sujeito; a exceção "poderá ser personalizado" foi separada (o limite de 4 é padrão ajustável) | unir à frase anterior e à exceção |
| 297 | govbr-3.7.0-accessibility-table-e532d3d3b288 | unclear que junta três requisitos (cabeçalhos, rótulos de célula, teclado) | partir em três; recommended ("É importante que") |
| 305 | govbr-3.7.0-component-cookiebar-546e1628883d | unclear que junta "só aparece no 1º acesso" e "só fecha se aceitar" | partir; required + prohibited |
| 37 | govbr-3.7.0-development-accordion-08b7edf4291a | duas obrigações juntas (title / icon), mesma força | partir (impacto baixo) |
| 186 | govbr-3.7.0-component-tooltip-d0e9a9707161 | três qualidades do texto do tooltip numa regra, mesma força | partir se cada uma for verificada à parte (impacto baixo) |

Fora da amostra, a varredura do padrão 1 achou cinco introduções required/prohibited sem conteúdo. Pelo mesmo
critério, elas são altas.

## Recomendação

Corrigir de forma sistemática antes da integração no validator. A taxa de defeito é baixa (7,5%, quase toda baixa
ou média), mas três problemas são de método e se repetem:

1. **Introduções de lista:** tratar o bloco "frase com ':' + lista" como uma unidade, com o `originalText` cobrindo a
   lista quando os itens não são regras com condição própria. A varredura de `auditoria` já lista os 23 casos.
2. **Fragmentos:** quando a regra começa em "que / mas / porém / e / desta forma", conferir se o sujeito e a exceção
   continuam no trecho. Se não continuam, estender o trecho ou não partir a frase.
3. **`unclear`:** aplicar as quatro políticas (deve-se evitar → discouraged; deve + preferencialmente →
   recommended; só/apenas pode → prohibited; fundamental/essencial → required), registrá-las no D-xx e deixar
   `unclear` só o resto, já com a proposta individual desta auditoria (~24).

Também convém revisar à mão as 92 linhas com força tirada do título da seção, marcando como permitted os
modificadores opcionais. Depois disso, os altos da tabela acima ficam resolvidos sem correções pontuais.
