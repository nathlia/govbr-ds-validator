/**
 * 3.7.11 (2ª revisão MED 3): chave de identidade de um localizador entre estados. O localizador mostrado é único no
 * estado em que foi medido (auditoria V-1): quando a forma de sempre (até 5 passos, ou ancorada no pai com id) nomeava
 * mais de um elemento, ele sobe além dos 5 passos (ou ganha `body >` / `:host >`). Essa extensão depende do resto do
 * DOM — um bloco idêntico inserido noutro lugar faz o MESMO elemento ganhar passos. A chave devolve, por segmento, a
 * forma de sempre (os 5 passos de baixo; a âncora quando há ≤5), para comparar o mesmo elemento entre estados
 * (stateDiff, revisita) sem desfazer a separação dentro de um estado.
 */
const STEP = " > ";
const isAnchor = (part: string) => part.startsWith("#") || part.startsWith("[data-testid=");

export function locatorKey(locator: string): string {
  return locator
    .split(" >>> ")
    .map((segment) => {
      const parts = segment.split(STEP);
      while (parts.length > 1 && (parts[0] === "body" || parts[0] === ":host")) parts.shift();
      const tags = isAnchor(parts[0]) ? parts.slice(1) : parts;
      return tags.length > 5 ? tags.slice(-5).join(STEP) : parts.join(STEP);
    })
    .join(" >>> ");
}
