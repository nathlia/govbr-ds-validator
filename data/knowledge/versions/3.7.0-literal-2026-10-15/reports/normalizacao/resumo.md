# Resumo — normalização do corpus literal (passo 1 do plano D-119)

- Arquivos processados: **126** (2 páginas ausentes na fonte: accordion e scrim, aba acessibilidade).
- Regras: **2971** · ids antigos reaproveitados: 52
- Frases com gatilho sem destino: **0**

## Por força

| força | regras |
|---|---:|
| required | 1082 |
| prohibited | 154 |
| recommended | 1112 |
| discouraged | 112 |
| permitted | 496 |
| unclear | 15 |

## Por camada × força

| camada | required | prohibited | recommended | discouraged | permitted | unclear | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| componente×acessibilidade | 66 | 12 | 253 | 11 | 30 | 1 | 373 |
| componente×desenvolvedor | 158 | 1 | 37 | 0 | 18 | 0 | 214 |
| componente×designer | 537 | 64 | 363 | 54 | 346 | 6 | 1370 |
| e-MAG | 107 | 24 | 72 | 1 | 21 | 0 | 225 |
| fundamentos | 95 | 25 | 76 | 5 | 44 | 4 | 249 |
| guias | 15 | 3 | 22 | 0 | 1 | 0 | 41 |
| outras páginas do DS (introdução, acessibilidade) | 7 | 1 | 7 | 0 | 0 | 0 | 15 |
| padrões | 97 | 24 | 282 | 41 | 36 | 4 | 484 |

## Por componente (designer / acessibilidade / desenvolvedor)

| componente | designer | acessibilidade | desenvolvedor | total |
|---|---:|---:|---:|---:|
| accordion | 7 | 0 | 4 | 11 |
| avatar | 13 | 13 | 2 | 28 |
| breadcrumb | 33 | 15 | 6 | 54 |
| button | 40 | 12 | 6 | 58 |
| card | 38 | 7 | 3 | 48 |
| carousel | 68 | 16 | 13 | 97 |
| checkbox | 60 | 8 | 6 | 74 |
| cookiebar | 67 | 10 | 32 | 109 |
| datetimepicker | 20 | 12 | 4 | 36 |
| divider | 16 | 5 | 1 | 22 |
| footer | 31 | 8 | 12 | 51 |
| header | 51 | 10 | 6 | 67 |
| input | 48 | 14 | 2 | 64 |
| item | 21 | 8 | 2 | 31 |
| list | 54 | 8 | 8 | 70 |
| loading | 29 | 12 | 2 | 43 |
| magicbutton | 25 | 12 | 2 | 39 |
| menu | 73 | 11 | 17 | 101 |
| message | 36 | 9 | 3 | 48 |
| modal | 65 | 16 | 2 | 83 |
| notification | 30 | 8 | 2 | 40 |
| pagination | 30 | 11 | 7 | 48 |
| radio | 61 | 8 | 2 | 71 |
| scrim | 15 | 0 | 8 | 23 |
| select | 28 | 13 | 16 | 57 |
| signin | 38 | 11 | 4 | 53 |
| skiplink | 24 | 16 | 3 | 43 |
| step | 65 | 15 | 3 | 83 |
| switch | 31 | 10 | 3 | 44 |
| tab | 30 | 18 | 6 | 54 |
| table | 46 | 16 | 3 | 65 |
| tag | 53 | 7 | 2 | 62 |
| textarea | 26 | 13 | 2 | 41 |
| tooltip | 50 | 6 | 8 | 64 |
| upload | 19 | 7 | 4 | 30 |
| wizard | 29 | 8 | 8 | 45 |

## Regras antigas (mapa-ids.json)

- sem correspondente literal: 123
- mesmo id (texto idêntico): 52
- texto antigo presente no corpus; regra(s) nova(s) com recorte diferente: 9
- texto antigo presente no corpus, mas não virou regra nova: 2

## Método (o que é mecânico e o que é julgamento)

- `tools/segmentar.py` parte cada .md em blocos (título, parágrafo, item de lista, linha de tabela, código) e sentenças, com offsets; marca candidatas pela tabela de força do plano e por sinônimos explícitos (anotados em `notes` da regra quando a força veio de sinônimo).
- O extrator (agente) leu todas as candidatas de cada arquivo e registrou em `decisoes/<arquivo>.txt` as exclusões (com motivo), as atomizações (um trecho literal por regra) e as trocas de força (`unclear` sempre com nota). Candidata sem linha de decisão = aceita com a força da tabela.
- `tools/montar.py` confere por substring que todo `originalText` é literal do arquivo (e o `charRange`), que toda frase com gatilho tem destino, e falha caso contrário.
- `normalizedRule` é o próprio trecho sem marcação Markdown (não é paráfrase); `title` é o começo dele. `validationStrategy`/`automatable` vêm de heurística por palavras-chave (`automationConfidence: low`) e não foram revisados um a um.
- Ids: id antigo quando uma das 186 regras antigas tem `originalText` idêntico; senão `govbr-3.7.0-<categoria>-<componente|global>-<12 hex de sha256(Caminho-fonte + originalText)>` (para o e-MAG, que não tem Caminho-fonte, usa a URL).
- Cegueira: nada de govbr-eval/telas/resultados/corpus nem do src do validator foi aberto.

## Revisão pós-auditoria (passo 2 do plano)

A auditoria independente está em `auditoria/`; as correções aplicadas, uma a uma, em `correcoes-auditoria.md`. Políticas de método que passaram a valer para a base inteira:

- **Introdução de lista** ("Utilize X quando:", "… nos seguintes componentes:"): uma regra por item; `originalText` = o item; o enunciado vai literal em `conditions`; a força vem do enunciado. Quando os itens são alternativas de uma só obrigação, o trecho é estendido do enunciado ao fim da lista.
- **Fragmento**: quando a regra é parte de uma frase partida e perdeu sujeito ou condição, a oração que falta vai literal em `conditions`; exceção da mesma passagem vai literal em `exceptions`.
- **Forças compostas**: "deve-se evitar / deve ser evitado" → discouraged; "deve … preferencialmente" → recommended; "só / apenas / somente … pode" → prohibited do complemento (a nota diz o que fica proibido); "é fundamental / é essencial" → required. O que não cabe nelas continua `unclear`, com a força proposta pela auditoria na nota.
- **Força pelo título da seção** ("Propriedades obrigatórias"): conferida linha a linha; modificadores opcionais ou com valor padrão ficam permitted; alternativas (primary/secondary) viram uma regra disjuntiva.
