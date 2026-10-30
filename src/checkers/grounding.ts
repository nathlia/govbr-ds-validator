/**
 * D-27 — onde cada verificador determinístico declara a norma que implementa.
 *
 * A regra: **um verificador que não consegue nomear uma regra do oráculo não produz achado.**
 * Produz sinal de revisão, que é outra coisa e não entra na pontuação.
 *
 * Por que isto existe. O portão anti-alucinação (`verify_finding`) foi construído para impedir que
 * o AGENTE cite regra inexistente. Ele não alcançava o oráculo: para as fontes dos próprios
 * verificadores conferia formato, não existência — `govbr-ds-token` aceitava qualquer id que
 * começasse com `ds-token-`. E foi assim que uma verificação de "classes não canônicas" passou
 * anos como achado sem que nenhuma regra do gov.br DS a sustentasse: a base de conhecimento fala de
 * **anatomia** do componente (tag, estrutura), não de classes extras — o DS distribui utilitárias e
 * aplicação de verdade acrescenta as suas. Numa tela realista aquela verificação virava a maior
 * fonte isolada de falso positivo, e pior: batia com mais força justamente nos elementos que o D-24
 * tornou conformes, derrubando o piso de precisão do braço COM oráculo.
 *
 * Declarar aqui serve a três coisas ao mesmo tempo: o portão passa a poder verificar existência de
 * verdade; o scorer ganha a ponte de vocabulário sem que o gabarito precise conhecer as entranhas
 * do oráculo (o mapa de alias é GERADO daqui); e quem revisa consegue conferir a afirmação, porque
 * `basis` diz por que aquele id e não outro.
 */

/** As verificações determinísticas, uma por tipo de julgamento (não por componente). */
export type CheckKind =
  | "token-color"
  | "token-font-family"
  | "token-font-size"
  | "token-radius"
  | "token-spacing"
  | "structure-tag"
  | "structure-accessible-name"
  | "structure-unknown-classes"
  | "page-header"
  | "page-footer"
  | "page-skip-link";

export interface CheckGrounding {
  /**
   * Ids normativos que esta verificação implementa — regra da KB (`govbr-<versão>-…`) ou do
   * e-MAG (`emag-<n.n>`). **Vazio significa que não há norma**, e então a verificação não pode
   * produzir achado.
   */
  implements: string[];
  /** Por que estes ids. É a frase que um revisor confere contra a fonte. */
  basis: string;
  /**
   * 3.4.4 (C7): norma da base que trata do mesmo assunto, mas que a verificação mecânica não decide
   * (ex.: escala tipográfica). Não vira achado (`implements` continua vazio); é dita na observação e no
   * verify_finding, para o agente citá-la com a medição em vez de ouvir "não há norma".
   */
  relatedRule?: { id: string; force: "required" | "recommended" | "permitted" | "informative"; text: string };
}

/** A regra geral de tokens, usada quando não há regra mais específica para a propriedade. */
const TOKENS_EM_GERAL = "govbr-3.7.0-development-global-137c50bea6ca";

export const CHECK_GROUNDING: Record<CheckKind, CheckGrounding> = {
  "token-color": {
    implements: ["govbr-3.7.0-foundation-global-21b1a2733f7b", TOKENS_EM_GERAL],
    basis:
      "'Interfaces governamentais devem usar as cores predefinidas do Design System' (required) — " +
      "uma cor fora do registro de tokens é exatamente o que essa regra proíbe.",
  },
  "token-font-family": {
    implements: ["govbr-3.7.0-development-global-406774b1cb87", TOKENS_EM_GERAL],
    basis: "'Utilize Rawline como fonte oficial do Governo Federal' (required).",
  },
  "token-font-size": {
    implements: [],
    relatedRule: {
      id: "govbr-3.7.0-foundation-global-21fb08664799",
      force: "required",
      text: "Dessa forma, nenhuma fonte deve estar fora da escala definida no DS: Minor Third.",
    },
    basis:
      "HÁ NORMA na base: govbr-3.7.0-foundation-global-21fb08664799 (required) — 'nenhuma fonte deve " +
      "estar fora da escala definida no DS: Minor Third'. O que o check NÃO faz é afirmá-la por máquina: " +
      "a escala é modular e não redonda, e o veredito binário dependeria de onde se corta a tolerância, " +
      "não da norma (3.4.4, C7: até a 3.4.3 este texto dizia que não havia norma). A distância ao passo " +
      "mais próximo vai em data.nearestStepPx; com ela, cite a unidade e justifique o desvio. Histórico " +
      "(D-32): a alternativa era esticar a regra geral de consumo de token até cobrir uma diferença sub-pixel: a escala " +
      "do DS é modular e não redonda (14 · 16,8 · 20,16 · 24,192 px), de modo que a página que " +
      "escreve 20px está a 0,16px do passo e a que escreve 16px está a 0,8px — e o veredito passava " +
      "a depender de onde se corta a tolerância, não da norma. Julgar se um desvio desses é defeito " +
      "é trabalho da camada semântica, com a página na frente; o determinístico mostra o desvio e " +
      "não o afirma. Vira observação (D-32).",
  },
  "token-radius": {
    implements: [TOKENS_EM_GERAL],
    basis:
      "A base de conhecimento não tem regra específica sobre raio de borda; o que sustenta a " +
      "verificação é a obrigação de consumir os tokens oficiais corretamente (required).",
  },
  "token-spacing": {
    implements: [TOKENS_EM_GERAL],
    basis:
      "A regra de fundação sobre espaçamento fala da Grid (40 px entre colunas), não da escala de " +
      "espaçamento dos componentes; o que sustenta a verificação é o consumo correto de tokens.",
  },
  "structure-tag": {
    implements: ["govbr-3.7.0-component-global-e30aab6e9a68"],
    basis:
      "'A anatomia implementada do componente deve corresponder à diretriz oficial de Design' " +
      "(required) — a tag raiz é anatomia.",
  },
  "structure-accessible-name": {
    // 3.5.0 (revisão Fable P5): até a 3.4.4 era e-MAG 2.2 ("objetos programáveis"), que trata de scripts, não
    // de nome de controle — 10 vereditos cegos de "erro-normativo" na tela B. A base liga o nome/papel/valor
    // (WCAG 4.1.1/4.1.2) à Recomendação 1.1 do e-MAG pelo registro 7e6420514860; esse id é LEGADO na base literal
    // (substituído pelo título f12b1bae5784, força recommended), por isso a norma nomeada é a recomendação e-MAG
    // inteira (emag-1.1), citada com wcag 4.1.2 — o critério que o achado mede.
    implements: ["emag-1.1"],
    basis:
      "e-MAG 1.1 'Respeitar os Padrões Web', que a base liga à WCAG 4.1.2 (Name, Role, Value; registro " +
      "7e6420514860, hoje legado): controle interativo sem nome acessível não expõe o nome. Citada com wcag 4.1.2.",
  },
  "page-header": {
    implements: ["govbr-3.7.0-template-global-19f93475dc5e"],
    basis:
      "'Use o Template Base como ponto de partida para páginas' (required), lido junto com o texto " +
      "integral da página oficial do Template Base (data/ds-page-rules.json, page_structure): " +
      "'1. Área de Cabeçalho (Obrigatório) — Esta é uma área essencial e obrigatória no template " +
      "base. Nesta região deve-se utilizar apenas o componente header'. O D-29 vetava inferir áreas " +
      "do excerto truncado; a fonte agora é o texto integral, e o trecho é conferido em teste.",
  },
  "page-footer": {
    implements: ["govbr-3.7.0-template-global-19f93475dc5e"],
    basis:
      "Mesma regra e mesma fonte integral do Template Base: '5. Área de Rodapé (Obrigatório) — Esta " +
      "é uma área essencial do template base onde é utilizado o componente Footer'. O Padrão Mínimo " +
      "lista Cabeçalho e Rodapé entre os pontos de aderência mínima.",
  },
  "page-skip-link": {
    // 2.12.0: até a 2.11.0 o id era o do TÍTULO da recomendação (…7d2b85f81c52, heading-only, que na
    // base literal tem força recommended e virou id legado). Agora é a frase obrigatória do corpo dela.
    implements: ["govbr-3.7.0-accessibility-global-538e57855252", "emag-1.5"],
    basis:
      "e-MAG 1.5, frase literal (required): 'É importante ressaltar que o primeiro link da página deve ser " +
      "o de ir para o conteúdo'. A verificação lê exatamente isso: o primeiro <a href> do documento " +
      "é uma âncora interna cujo alvo existe. A regra do DS sobre Skip Link no Template Base é " +
      "apenas recomendada e não é citada como norma.",
  },
  "structure-unknown-classes": {
    implements: [],
    basis:
      "NÃO HÁ NORMA. A KB fala de anatomia (tag e estrutura), não de classes extras; o próprio DS " +
      "distribui utilitárias e aplicações acrescentam as suas. Continua sendo informação útil para " +
      "quem revisa — por isso vira observação —, mas afirmar violação aqui é o oráculo inventando " +
      "regra, que é precisamente o que ele existe para impedir.",
  },
};

/** Ids normativos de uma verificação. Vazio = não pode virar achado (D-27). */
export function groundingFor(kind: CheckKind): string[] {
  return CHECK_GROUNDING[kind].implements;
}

/** True quando a verificação tem norma e portanto pode produzir achado. */
export function podeVirarAchado(kind: CheckKind): boolean {
  return CHECK_GROUNDING[kind].implements.length > 0;
}

/**
 * 2.13.0 (NAT-85) — fundamentação das verificações contextuais (P1 associações, P2 anatomia, P3
 * foco em transições). Ficam FORA de `CHECK_GROUNDING` de propósito: estes achados citam o id
 * normativo diretamente (como `structure-accessible-name` cita `emag-1.1`), então não há ponte de
 * vocabulário a gerar, e o gerador de aliases do eval (que recusa tipo não mapeado) não muda.
 * As listas de regras aceitas por condição estão em `verify/contextual.ts`; o teste de
 * fundamentação confere que cada id existe e é obrigatório ou proibido na base servida.
 */
export type ContextCheckKind =
  | "context-error-identification"
  | "context-status-message"
  | "context-anatomy"
  | "context-breadcrumb-current-not-link"
  | "context-focus-restore"
  | "context-focus-initial"
  | "context-focus-contained"
  | "context-focus-on-close";

export const CONTEXT_GROUNDING: Record<ContextCheckKind, CheckGrounding> = {
  "context-error-identification": {
    implements: ["govbr-3.7.0-accessibility-global-271582e4fbe8", "emag-6.6"],
    basis:
      "e-MAG 6.6 / WCAG 3.3.1 (obrigatórias): 'Quando um erro de entrada de dados for automaticamente detectado, o item " +
      "que apresenta erro deve ser identificado e descrito ao usuário por texto.' A relação é a que o Chromium expõe " +
      "(invalid, descrição, nome), nunca a presença de aria-describedby — a regra do DS sobre aria-describedby é recomendada.",
  },
  "context-status-message": {
    implements: [],
    basis:
      "WCAG 4.1.3 (AA): mensagens de status determináveis por papel ou propriedade sem receber foco. Não há regra " +
      "obrigatória equivalente no DS ou no e-MAG (a do Message é recomendada); o achado cita a WCAG diretamente.",
  },
  "context-anatomy": {
    implements: [
      "govbr-3.7.0-component-message-d0c7ed3f91af",
      "govbr-3.7.0-component-header-e58979706103",
      "govbr-3.7.0-component-breadcrumb-478cffdbb111",
      "govbr-3.7.0-component-breadcrumb-660169599b49",
      "govbr-3.7.0-component-modal-672bf38f39fb",
      "govbr-3.7.0-component-modal-39edd5c2d5cc",
    ],
    basis:
      "Linhas 'Obrigatório' das tabelas de Anatomia (aba Designer) e 'O título é o único elemento obrigatório no Header' " +
      "(com o substituto permitido). Partes 'Opcional' não têm verificação.",
  },
  "context-breadcrumb-current-not-link": {
    implements: ["govbr-3.7.0-accessibility-breadcrumb-53db61fa81f9"],
    basis: "'A página atual ou último elemento do breadcrumb, não deve ser considerado um link' (proibida).",
  },
  "context-focus-restore": {
    implements: ["govbr-3.7.0-accessibility-modal-f36c91d7073c"],
    basis:
      "'Ao fechar a janela modal, o foco deve retornar ao último elemento focado na tela' (obrigatória). Restauração da " +
      "Message é recomendada e a do Menu não tem texto: sem verificação.",
  },
  "context-focus-initial": {
    implements: ["govbr-3.7.0-accessibility-modal-e0ce4b474163", "govbr-3.7.0-accessibility-modal-6f984d79466a"],
    basis:
      "Foco inicial da modal: informativa → botão fechar; com ação do usuário → botão de ação primária (obrigatórias). " +
      "A exceção destrutiva ('assume') não está na base: foco num secundário fica sem decisão.",
  },
  "context-focus-contained": {
    implements: ["govbr-3.7.0-accessibility-modal-744f67e17bec"],
    basis: "'Após aberta, o fluxo de navegação deve percorrer apenas os elementos da janela modal' (obrigatória).",
  },
  "context-focus-on-close": {
    implements: ["govbr-3.7.0-accessibility-message-ad83724b777f", "govbr-3.7.0-accessibility-menu-a3be6788bdea"],
    basis:
      "Message: 'No momento da exibição da mensagem, o foco do navegador deve estar sobre o botão fechar, quando houver'; " +
      "Menu: 'Após abertura do menu, o foco deve cair imediatamente sobre o botão fechar, se houver' (obrigatórias).",
  },
};
