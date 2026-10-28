/**
 * Ações de estado aceitas pelas ferramentas que reabrem a página. Um único esquema para `scan_page`
 * e `verify_finding`: um estado reproduzido para varrer tem de ser reproduzível para verificar.
 *
 * 2.10.0 (NAT-82): a reprodução deixa de escolher em silêncio. Até a 2.9.0 cada passo agia sobre
 * `locator(...).first()`: um seletor com dois alvos agia no primeiro e o resultado parecia o estado
 * pedido. Agora um passo com alvo singular (click, fill, press com seletor) exige exatamente um
 * elemento; zero ou mais de um interrompem a receita com um motivo tipado, e quem chamou recebe o
 * passo, a cardinalidade e o motivo. Uma espera por seletor é condição de chegada, não alvo: basta
 * um elemento visível, e a cardinalidade é registrada.
 */
import { z } from "zod";
import type { Page } from "playwright";

/** Caminho da mesma origem: uma barra inicial (não duas), sem barra invertida nem espaço. */
const SAME_ORIGIN_PATH = /^\/(?![/\\])[^\\\s]*$/;

export const PageActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), selector: z.string() }),
  z.object({ action: z.literal("fill"), selector: z.string(), value: z.string().max(2_000) }),
  z.object({ action: z.literal("press"), key: z.string(), selector: z.string().optional() }),
  z.object({
    action: z.literal("wait"),
    selector: z.string().optional(),
    ms: z.number().int().min(0).max(5_000).optional(),
  }),
  // 3.4.0 (B7): navegação dentro da SPA já carregada (history.pushState + popstate), sem nova requisição.
  // Só caminho da mesma origem: começa com uma única barra, sem esquema, sem barra invertida nem espaço.
  z.object({
    action: z.literal("navigate"),
    path: z
      .string()
      .min(1)
      .max(2_000)
      .regex(SAME_ORIGIN_PATH, "path é um caminho da mesma origem (ex.: '/app/lista?x=1'), começando com uma única barra")
      .describe("Caminho da mesma origem entregue ao roteador da SPA (pushState + popstate): alcança rota profunda servida sem fallback"),
  }),
]);

/** 3.3.0 (N-08): soma das esperas fixas de uma receita; 20 × 5 s passava do prazo do cliente. */
export const RECIPE_WAIT_BUDGET_MS = 15_000;

export const PageActionsSchema = z
  .array(PageActionSchema)
  .max(20)
  .superRefine((actions, ctx) => {
    const total = actions.reduce((sum, a) => sum + (a.action === "wait" && !a.selector ? (a.ms ?? 0) : 0), 0);
    if (total > RECIPE_WAIT_BUDGET_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `a soma das esperas fixas (wait.ms) é ${total} ms, acima do orçamento de ${RECIPE_WAIT_BUDGET_MS} ms por receita; use wait com selector (espera pela condição) ou menos esperas`,
      });
    }
  });

export type PageAction = z.infer<typeof PageActionSchema>;

/**
 * Condições de chegada declaradas por quem pede o estado. Todas neutras — papéis e atributos ARIA,
 * caminho, foco — e nenhuma conhece uma tela em particular. Cada condição declarada é medida na
 * página depois da receita; uma condição não satisfeita significa que o estado pedido não foi
 * alcançado, e nada é varrido nem confirmado nele.
 */
export const ArrivalSchema = z
  .object({
    path: z.string().min(1).max(2_000).optional().describe("location.pathname esperado depois da receita (ex.: '/conta/dados')"),
    dialogOpen: z.boolean().optional().describe("true: há um diálogo aberto e visível (dialog[open], role=dialog/alertdialog, aria-modal); false: nenhum"),
    errorVisible: z.boolean().optional().describe("true: há mensagem role=alert visível ou campo aria-invalid=true visível; false: nenhum"),
    expanded: z.string().min(1).optional().describe("Seletor de exatamente um controle que deve estar com aria-expanded=true"),
    focused: z.string().min(1).optional().describe("Seletor de exatamente um elemento que deve ter o foco (atravessa shadow roots abertos)"),
    visible: z.string().min(1).optional().describe("Seletor com pelo menos um elemento visível"),
  })
  .strict();

export type Arrival = z.infer<typeof ArrivalSchema>;

/**
 * `page-changed`: a página sob a receita deixou de ser a mesma no meio do passo (contexto de execução
 * destruído por navegação, frame desanexado, página fechada). Não é erro de sintaxe do seletor.
 */
export type ReplayFailureReason = "not-found" | "ambiguous" | "invalid-selector" | "page-changed" | "action-failed";

export interface ReplayStep {
  index: number;
  action: PageAction["action"];
  selector?: string;
  key?: string;
  /** Valor do fill, preservado: sem ele a receita não é reaplicável. */
  value?: string;
  /** 3.4.0: caminho do navigate. */
  path?: string;
  ms?: number;
  /** Elementos que o seletor resolveu no momento do passo (null quando o passo não tem seletor). */
  matched: number | null;
}

export interface ReplayFailure {
  index: number;
  action: PageAction["action"];
  selector?: string;
  reason: ReplayFailureReason;
  matched: number | null;
  detail: string;
}

export type ReplayResult =
  | { status: "applied"; steps: ReplayStep[] }
  | { status: "failed"; steps: ReplayStep[]; failure: ReplayFailure };

/** Tempo para o alvo aparecer depois do passo anterior (renderização assíncrona), antes de contar. */
const ATTACH_TIMEOUT_MS = 5_000;
/** 3.4.0 (B7): espera pela rede ociosa antes do navigate (a SPA terminar a carga e o redirecionamento inicial). */
const NAVIGATE_IDLE_MS = 5_000;
/** Tempo para a ação em si (o elemento ficar visível, habilitado, estável). */
const ACTION_TIMEOUT_MS = 10_000;

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0];
}

function fullMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isSelectorSyntaxError(error: unknown): boolean {
  return /(?:not a valid selector|Unexpected token|Unknown engine|selector.*(?:invalid|malformed)|while parsing (?:css )?selector)/i.test(fullMessage(error));
}

/** O documento sob a receita mudou ou sumiu (navegação, frame desanexado, página/contexto fechado). */
export function isPageChangedError(error: unknown): boolean {
  return /(?:Execution context was destroyed|Cannot find context with specified id|frame (?:was|got) detached|Target (?:page, context or browser )?(?:has been |was )?closed|most likely because of a navigation)/i.test(
    fullMessage(error)
  );
}

/** Classifica uma falha ao contar alvos: sintaxe do seletor, página que mudou, ou outra falha. */
export function countFailureReason(error: unknown): "invalid-selector" | "page-changed" | "action-failed" {
  if (isSelectorSyntaxError(error)) return "invalid-selector";
  if (isPageChangedError(error)) return "page-changed";
  return "action-failed";
}

/** Violação do modo estrito do Playwright: o alvo único deixou de ser único entre contar e agir. */
function strictModeCount(error: unknown): number | null {
  const match = /strict mode violation[\s\S]*?resolved to (\d+) elements/i.exec(fullMessage(error));
  return match ? Number(match[1]) : null;
}

function stepOf(index: number, action: PageAction, matched: number | null): ReplayStep {
  return {
    index,
    action: action.action,
    ...("selector" in action && action.selector ? { selector: action.selector } : {}),
    ...(action.action === "press" ? { key: action.key } : {}),
    ...(action.action === "fill" ? { value: action.value } : {}),
    ...(action.action === "wait" && action.ms !== undefined ? { ms: action.ms } : {}),
    ...(action.action === "navigate" ? { path: action.path } : {}),
    matched,
  };
}

/**
 * Cardinalidade de um seletor, depois de esperar (curto) que algum elemento apareça. A espera não
 * escolhe nada: só dá à renderização assíncrona do passo anterior a chance de terminar.
 */
async function countTargets(page: Page, selector: string): Promise<{ count: number } | { error: unknown }> {
  try {
    await page.waitForSelector(selector, { state: "attached", timeout: ATTACH_TIMEOUT_MS });
  } catch (error) {
    if (isSelectorSyntaxError(error)) return { error };
    // timeout: conta mesmo assim — zero é a resposta
  }
  try {
    return { count: await page.locator(selector).count() };
  } catch (error) {
    return { error };
  }
}

/**
 * Reproduz a receita passo a passo. Nunca lança por erro da receita: devolve o primeiro passo que
 * falhou, com motivo. Erro de receita é limitação de quem a escreveu, não ausência de defeito nem
 * falha técnica do servidor.
 */
/**
 * 2.13.0 (NAT-85): observador opcional da reprodução. É chamado antes da primeira ação (`afterStep`
 * = -1) e depois de cada ação aplicada, com a ação seguinte (ou `undefined`). Só os predicados de
 * transição o pedem; sem ele, a reprodução é idêntica à da 2.12.0. Um erro do observador nunca
 * interrompe a receita: quem observa registra a falha na própria observação.
 */
export type ReplayObserver = (page: Page, afterStep: number, next: PageAction | undefined) => Promise<void>;

export async function applyActions(page: Page, actions: PageAction[], observe?: ReplayObserver): Promise<ReplayResult> {
  const steps: ReplayStep[] = [];
  const observed = async (afterStep: number) => {
    if (!observe) return;
    try {
      await observe(page, afterStep, actions[afterStep + 1]);
    } catch {
      // o observador guarda a própria falha; a receita segue
    }
  };
  await observed(-1);
  for (const [index, action] of actions.entries()) {
    const fail = (reason: ReplayFailureReason, matched: number | null, detail: string): ReplayResult => ({
      status: "failed",
      steps,
      failure: {
        index,
        action: action.action,
        ...("selector" in action && action.selector ? { selector: action.selector } : {}),
        reason,
        matched,
        detail,
      },
    });

    if (action.action === "wait" && !action.selector) {
      await page.waitForTimeout(Math.min(action.ms ?? 0, 5_000));
      steps.push(stepOf(index, action, null));
      await observed(index);
      continue;
    }
    if (action.action === "navigate") {
      // O roteador da SPA precisa ter terminado a carga inicial (inclusive o redirecionamento de
      // entrada): senão o próprio app sobrescreve a rota pedida logo depois do pushState.
      await page.waitForLoadState("networkidle", { timeout: NAVIGATE_IDLE_MS }).catch(() => undefined);
      try {
        await page.evaluate((path) => {
          history.pushState(history.state, "", path);
          window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
        }, action.path);
      } catch (error) {
        if (isPageChangedError(error)) return fail("page-changed", null, `navigate '${action.path}': a página mudou durante o passo: ${message(error)}`);
        return fail("action-failed", null, `navigate '${action.path}' falhou: ${message(error)}`);
      }
      steps.push(stepOf(index, action, null));
      await observed(index);
      continue;
    }
    if (action.action === "press" && !action.selector) {
      try {
        await page.keyboard.press(action.key);
      } catch (error) {
        return fail("action-failed", null, `press '${action.key}' falhou: ${message(error)}`);
      }
      steps.push(stepOf(index, action, null));
      await observed(index);
      continue;
    }

    const selector = action.selector as string;
    if (action.action === "wait") {
      try {
        await page.locator(selector).filter({ visible: true }).nth(0).waitFor({ state: "visible", timeout: ACTION_TIMEOUT_MS });
      } catch (error) {
        if (isSelectorSyntaxError(error)) return fail("invalid-selector", null, `Seletor inválido '${selector}': ${message(error)}`);
        if (isPageChangedError(error)) return fail("page-changed", null, `A página mudou durante a espera por '${selector}': ${message(error)}`);
        const matched = await page.locator(selector).count().catch(() => 0);
        return fail(
          "not-found",
          matched,
          matched === 0
            ? `Nenhum elemento para '${selector}' apareceu em ${ACTION_TIMEOUT_MS} ms.`
            : `'${selector}' resolveu ${matched} elemento(s), nenhum visível em ${ACTION_TIMEOUT_MS} ms.`
        );
      }
      steps.push(stepOf(index, action, await page.locator(selector).count()));
      await observed(index);
      continue;
    }

    const counted = await countTargets(page, selector);
    if ("error" in counted) {
      const reason = countFailureReason(counted.error);
      const what =
        reason === "invalid-selector"
          ? `Seletor inválido '${selector}'`
          : reason === "page-changed"
            ? `A página mudou (navegação ou contexto destruído) ao contar '${selector}' no passo ${index}`
            : `Falha ao contar '${selector}' no passo ${index}`;
      return fail(reason, null, `${what}: ${message(counted.error)}`);
    }
    if (counted.count === 0) return fail("not-found", 0, `Nenhum elemento para '${selector}' no passo ${index}.`);
    if (counted.count > 1) {
      return fail(
        "ambiguous",
        counted.count,
        `'${selector}' resolveu ${counted.count} elementos; um passo de ${action.action} exige exatamente um. Torne o seletor único.`
      );
    }

    // Exatamente um: o localizador estrito do Playwright age nele e recusa se a contagem mudar.
    const target = page.locator(selector);
    try {
      if (action.action === "click") await target.click({ timeout: ACTION_TIMEOUT_MS });
      else if (action.action === "fill") await target.fill(action.value, { timeout: ACTION_TIMEOUT_MS });
      else await target.press(action.key, { timeout: ACTION_TIMEOUT_MS });
    } catch (error) {
      const now = strictModeCount(error);
      if (now !== null) {
        return fail(
          "ambiguous",
          now,
          `'${selector}' resolvia 1 elemento ao contar e ${now} ao agir; um passo de ${action.action} exige exatamente um. Torne o seletor único.`
        );
      }
      if (isPageChangedError(error)) return fail("page-changed", 1, `${action.action} em '${selector}': a página mudou durante o passo: ${message(error)}`);
      return fail("action-failed", 1, `${action.action} em '${selector}' falhou: ${message(error)}`);
    }
    steps.push(stepOf(index, action, 1));
    await observed(index);
  }
  return { status: "applied", steps };
}
