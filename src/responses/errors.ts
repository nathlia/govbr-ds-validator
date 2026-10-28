/**
 * 3.3.0 (N-07, N-10, S-18): toda exceção que escapa de uma ferramenta vira erro do contrato
 * (`isError`, `kind:"error"`, `errorCode`, mensagem sem ANSI/pilha, `next`). Antes, o texto cru do
 * Playwright (`page.goto: net::ERR_… Call log: [2m…`) chegava ao agente.
 */
import { BrowserToolError, sanitizeErrorMessage } from "../evidence/browser.js";
import { fail, step, type NextStep } from "./contract.js";

function nextFor(error: BrowserToolError, tool: string): NextStep[] {
  switch (error.errorCode) {
    case "invalid-url":
    case "unsupported-scheme":
      return [step("fix-input", "use uma URL http(s) absoluta da página a validar (ex.: http://127.0.0.1:3000/pagina) e repita", tool)];
    case "origin-not-allowed":
      return [step("fix-input", "use uma URL de uma das origens permitidas nesta execução", tool)];
    case "navigation-timeout":
    case "network-error":
      return [step("retry", "confira se a página responde (servidor no ar, porta e caminho certos) e repita", tool)];
    case "tool-timeout":
      return [
        step("retry", "a página não terminou dentro do prazo: reduza o escopo (selectors, checks) ou a receita (actions) e repita", tool),
        step("keep-uncertain", "se a página nunca assenta, registre a limitação: nada foi medido nesta chamada"),
      ];
    case "aborted":
      return [step("retry", "a chamada foi cancelada pelo cliente; repita se ainda precisar do resultado", tool)];
  }
}

export function thrownToContractError(error: unknown, tool: string) {
  if (error instanceof BrowserToolError) {
    const { errorCode, extra } = error;
    return fail({ error: error.message, errorCode, field: errorCode === "invalid-url" || errorCode === "unsupported-scheme" || errorCode === "origin-not-allowed" ? "url" : undefined, ...extra, next: nextFor(error, tool) });
  }
  const raw = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  const message = sanitizeErrorMessage(raw) || "erro sem mensagem";
  // Erros do Playwright na avaliação (seletor inválido, alvo fechado) dizem respeito à entrada ou à página.
  const selectorProblem = /(?:selector|seletor)|Unexpected token|is not a valid selector|Unknown engine/i.test(raw);
  if (selectorProblem) {
    return fail({
      error: `Seletor recusado pelo navegador: ${message}`,
      errorCode: "invalid-argument",
      field: "selectors",
      next: [step("fix-locator", "use um seletor CSS válido (sem XPath nem text=) e repita", tool)],
    });
  }
  if (/Target (?:page, context or browser )?(?:has been )?closed|Protocol error|crash/i.test(raw) || name === "TimeoutError") {
    return fail({
      error: `A página falhou durante a medição: ${message}`,
      errorCode: "page-error",
      next: [step("retry", "repita a chamada; se a página falhar de novo, registre a limitação", tool)],
    });
  }
  return fail({
    error: `Erro interno em ${tool}: ${message}`,
    errorCode: "internal-error",
    next: [step("retry", "repita a chamada; se o erro persistir, registre a limitação", tool)],
  });
}
