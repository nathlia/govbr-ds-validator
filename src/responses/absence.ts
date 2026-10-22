/**
 * 2.15.0 — nota fixa das respostas vazias ou silenciosas (diagnóstico da tela A, 2026-10-22, §2).
 *
 * Na tela A o agente leu silêncio do oráculo como conformidade: `get_ds_rules` sem resultado para
 * "aria-current", a especificação da paginação sem aria-current, um `verify_finding` sem predicado.
 * Toda resposta vazia ou silenciosa — e todo veredito `unverifiable` — leva esta frase, igual em
 * todos os perfis em que a ferramenta existe. Ela não diz nada sobre a página: só que a falta de
 * regra, atributo ou predicado nesta base não é contraprova de um fato medido.
 */
export const ABSENCE_NOTE =
  "Ausência nesta base ou nesta especificação não é evidência de conformidade; o fato medido continua valendo pela WCAG/e-MAG.";

/**
 * A mesma nota no perfil knowledge-free, sem nomear fonte que o perfil não serve (o inventário sem
 * conhecimento acusa "e-MAG" como vocabulário da base): só a WCAG, que o perfil confere.
 */
export const ABSENCE_NOTE_KNOWLEDGE_FREE =
  "Ausência nesta resposta não é evidência de conformidade; o fato medido continua valendo pela WCAG.";
