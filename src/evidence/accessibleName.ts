/**
 * Nome acessível (2.8.0). Até a 2.7.0 o verificador de estrutura decidia "sem nome acessível" pela
 * ausência de `aria-label`/`alt`, e acusava e-MAG 2.2 / WCAG 4.1.2 em botões que o Chromium expõe
 * com nome — por `title` (o caso dos `br-button` web components da tela B, que repassam o `title`
 * ao `<button>` interno) ou por `aria-labelledby` (NAT-33). A pergunta da regra é se o controle TEM
 * nome, não qual atributo o fornece.
 *
 * A fonte preferida é o nome que o próprio navegador calcula: a árvore de acessibilidade do
 * Chromium, lida via CDP só para os elementos em que um verificador decide sobre ela (interativo
 * apenas com ícone). É o mesmo nome que o leitor de tela recebe, inclusive dentro de shadow roots
 * — onde o `title` do host NÃO passa ao `<button>` interno, a menos que o componente o repasse.
 * Sem CDP (outro navegador), vale a aproximação por atributos, na ordem do cálculo de nome:
 * aria-labelledby (referências resolvidas; quebradas ou vazias não contam) > aria-label (aparado,
 * não vazio) > alt/conteúdo > title.
 */
import type { Page } from "playwright";
import type { ElementEvidence } from "./types.js";

export const INTERACTIVE_TAGS = ["button", "a", "input", "select", "textarea"] as const;

/** Elemento que o verificador de estrutura trata como controle (tag nativa ou role=button). */
export function isInteractiveEvidence(el: Pick<ElementEvidence, "tagName" | "attributes">): boolean {
  return (INTERACTIVE_TAGS as readonly string[]).includes(el.tagName.toLowerCase()) || el.attributes.role === "button";
}

/** Aproximação do cálculo de nome a partir dos atributos colhidos — sem navegador. */
export function approximateAccessibleName(el: ElementEvidence): string {
  const labelledby = el.content.labelledbyText?.trim();
  if (labelledby) return labelledby;
  const ariaLabel = el.attributes.ariaLabel?.trim();
  if (ariaLabel) return ariaLabel;
  const label = el.content.labelText?.trim();
  if (label) return label;
  const alt = el.attributes.alt?.trim();
  if (alt) return alt;
  const descendantAlt = el.content.descendantAlt?.trim();
  if (descendantAlt) return descendantAlt;
  const text = el.content.textContent.trim();
  if (text) return text;
  return el.attributes.title?.trim() ?? "";
}

/** O nome que vale para a decisão: o do Chromium quando colhido, senão a aproximação. */
export function resolvedAccessibleName(el: ElementEvidence): { name: string; source: "chromium" | "atributos" } {
  if (el.accessibleName) return { name: el.accessibleName.name.trim(), source: el.accessibleName.source };
  return { name: approximateAccessibleName(el), source: "atributos" };
}

/** Chave da lista temporária, no `window` da página, com os elementos cujo nome será lido. */
export const NAME_PROBE_KEY = "__govbrAccessibleNameProbe";

/**
 * Lê no Chromium o nome calculado de cada elemento guardado em `window[NAME_PROBE_KEY]`, na ordem.
 * Devolve `null` se o navegador não oferece CDP ou algo falhar — quem chama cai na aproximação.
 * Por elemento, `null` quando o Chromium o ignora na árvore de acessibilidade (display:none,
 * visibility:hidden, dentro de aria-hidden) ou não devolve o nó: aí o Chromium não calcula nome, e
 * "sem nome" seria artefato da leitura — vale a aproximação por atributos só para esse elemento.
 * Remove a lista da página ao terminar.
 */
export async function chromiumAccessibleNames(page: Page, count: number): Promise<(string | null)[] | null> {
  if (count === 0) {
    await removeProbe(page);
    return [];
  }
  let session: Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>> | null = null;
  const objectGroup = "govbr-accessible-name";
  try {
    session = await page.context().newCDPSession(page);
    const { result: list } = await session.send("Runtime.evaluate", {
      expression: `window[${JSON.stringify(NAME_PROBE_KEY)}]`,
      objectGroup,
    });
    if (!list.objectId) return null;
    const names: (string | null)[] = [];
    for (let i = 0; i < count; i += 1) {
      const { result: item } = await session.send("Runtime.callFunctionOn", {
        objectId: list.objectId,
        functionDeclaration: "function (i) { return this[i]; }",
        arguments: [{ value: i }],
        objectGroup,
      });
      if (!item.objectId) return null;
      const { node } = await session.send("DOM.describeNode", { objectId: item.objectId });
      const { nodes } = await session.send("Accessibility.getPartialAXTree", {
        backendNodeId: node.backendNodeId,
        fetchRelatives: false,
      });
      const ax = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
      if (!ax || ax.ignored) {
        names.push(null);
        continue;
      }
      const value = ax.name?.value;
      names.push(typeof value === "string" ? value : "");
    }
    return names;
  } catch {
    return null;
  } finally {
    if (session) {
      await session.send("Runtime.releaseObjectGroup", { objectGroup }).catch(() => undefined);
      await session.detach().catch(() => undefined);
    }
    await removeProbe(page);
  }
}

export async function removeProbe(page: Page): Promise<void> {
  await page
    .evaluate((key) => {
      delete (window as unknown as Record<string, unknown>)[key];
    }, NAME_PROBE_KEY)
    .catch(() => undefined);
}
