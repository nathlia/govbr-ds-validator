/**
 * 3.7.8 (N5; leitura dev-375-b §3(d), mecanismo dev-375-b): estados recolhidos que o scan não mediu.
 *
 * Em quatro campanhas da tela B o braço com o oráculo perdeu as specs que moram num menu do cabeçalho porque nunca
 * escaneou a página com o menu aberto — e nenhuma resposta do oráculo mencionava o controle. Aqui, só a partir da
 * MARCAÇÃO da página (nenhum texto da base, nenhuma tela): os controles visíveis e habilitados que declaram mostrar um
 * conteúdo recolhido neste estado —
 *   - `aria-expanded="false"`;
 *   - `aria-haspopup` (≠ false) sem `aria-expanded="true"`;
 *   - `aria-controls` / `data-target` / `data-bs-target` / `data-panel` / `href="#id"` para um elemento sem caixa;
 *   - aba (`role=tab`) com `aria-selected="false"`;
 *   - `<summary>` de `<details>` fechado.
 * Cada um com um seletor ÚNICO (conferido no DOM) e a condição de chegada que prova o estado aberto: `expanded` (o
 * próprio controle), `visible` (o conteúdo controlado) ou `dialogOpen` (conteúdo que é diálogo). Instâncias do mesmo
 * padrão (a mesma tag, papel, classes, sinal e alvo) viram um grupo. Também devolve os controles que ESTÃO abertos neste
 * estado (para fechar a pendência de quem já escaneou o estado).
 */
import type { Page } from "playwright";

export interface DisclosureGroup {
  /** Padrão do grupo (tag, papel, classes, sinal, alvo) — a chave da pendência. */
  pattern: string;
  /** Seletores únicos de cada instância, na ordem: casca (cabeçalho/navegação/rodapé) primeiro, depois o conteúdo. */
  selectors: string[];
  /** O sinal que a marcação dá (`aria-expanded=false`, `aria-haspopup=menu`, `aria-controls→#x oculto`…). */
  signal: string;
  /** O conteúdo controlado da 1ª instância, quando a marcação o nomeia (`#id`). */
  target: string | null;
  arrival: { expanded: string } | { visible: string } | { dialogOpen: true } | null;
  region: "shell" | "main";
  /** Lista de opções (select/combobox): vem depois dos demais estados. */
  low: boolean;
  /** Texto/nome curto do controle (para leitura). */
  label: string;
}

export interface DisclosureFacts {
  collapsed: DisclosureGroup[];
  /** Seletores (mesma construção) dos controles abertos neste estado. */
  opened: string[];
}

/**
 * `ds`: usa as classes do próprio DS como pista (diálogo `.br-modal`, casca `.br-header`/`.br-footer`). No perfil
 * knowledge-free (`ds: false`) só a marcação genérica (papéis, ARIA, tags) — nenhum conhecimento do DS.
 */
export async function inspectDisclosures(page: Page, options: { ds?: boolean } = {}): Promise<DisclosureFacts> {
  return page.evaluate((ds: boolean) => {
    // "aparece" = a mesma noção do Playwright (a chegada `visible` usa o Playwright): caixa com largura E altura e sem
    // visibility hidden. Revisão 3.7.8 (HIGH 2): getClientRects aceitava a caixa 1280×0 do menu aberto do DS, e o
    // Playwright não — o detector e a chegada discordavam.
    const shown = (el: Element | null): boolean => {
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.visibility !== "collapse";
    };
    /** O conteúdo aparece: o próprio alvo ou algum descendente (o painel fixo dentro de um contêiner de altura 0). */
    const shownDeep = (el: Element | null): boolean => {
      if (!el) return false;
      if (shown(el)) return true;
      const all = el.querySelectorAll("*");
      for (let i = 0; i < all.length && i < 400; i++) if (shown(all[i])) return true;
      return false;
    };
    const esc = (s: string) => CSS.escape(s);
    const unique = (selector: string, el: Element): boolean => {
      try {
        const all = document.querySelectorAll(selector);
        return all.length === 1 && all[0] === el;
      } catch {
        return false;
      }
    };
    // valor gerado a cada carga (o id aleatório que um script dá à lista): a receita reabre a página e não o acharia.
    const generated = (v: string) => /\d{3,}|[0-9a-f]{8,}/i.test(v);
    /** Seletor único e estável: #id; atributo de ligação; senão caminho a partir do ancestral com id único (ou body). */
    const selectorOf = (el: Element): string | null => {
      if (el.id && !generated(el.id) && unique(`#${esc(el.id)}`, el)) return `#${esc(el.id)}`;
      for (const a of ["aria-controls", "data-target", "data-bs-target", "data-panel", "href", "name", "data-toggle"]) {
        const v = el.getAttribute(a);
        if (!v || generated(v)) continue;
        const sel = `${el.tagName.toLowerCase()}[${a}="${v.replace(/"/g, '\\"')}"]`;
        if (unique(sel, el)) return sel;
      }
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node !== el && node.id && !generated(node.id) && unique(`#${esc(node.id)}`, node)) {
          parts.unshift(`#${esc(node.id)}`);
          break;
        }
        const parent: Element | null = node.parentElement;
        if (!parent) return null;
        const same = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
        parts.unshift(same.length > 1 ? `${node.tagName.toLowerCase()}:nth-of-type(${same.indexOf(node) + 1})` : node.tagName.toLowerCase());
        node = parent;
      }
      if (!parts.length) return null;
      const sel = parts.join(" > ");
      return unique(sel, el) ? sel : null;
    };
    const targetOf = (el: Element): Element | null => {
      const ids: string[] = [];
      const controls = el.getAttribute("aria-controls");
      if (controls) ids.push(...controls.split(/\s+/).filter(Boolean));
      for (const a of ["data-target", "data-bs-target", "data-panel"]) {
        const v = el.getAttribute(a);
        if (v) ids.push(v.replace(/^#/, ""));
      }
      const href = el.getAttribute("href");
      if (href && /^#[A-Za-z][\w:.-]*$/.test(href)) ids.push(href.slice(1));
      for (const id of ids) {
        try {
          const t = document.getElementById(id);
          if (t) return t;
        } catch {
          /* id inválido */
        }
      }
      if (el.tagName === "SUMMARY" && el.parentElement?.tagName === "DETAILS") return el.parentElement;
      return null;
    };
    const isDialog = (t: Element | null) =>
      Boolean(t && (t.tagName === "DIALOG" || ["dialog", "alertdialog"].includes(t.getAttribute("role") ?? "") || (ds && t.classList.contains("br-modal")) || t.querySelector(ds ? ":scope > [role=dialog], :scope > .br-modal" : ":scope > [role=dialog]")));
    const disabled = (el: Element) => (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
    // casca = fora do conteúdo principal (cabeçalho, menus, rodapé); sem main na página, pelas regiões de casca.
    const hasMain = Boolean(document.querySelector("main, [role=main]"));
    const SHELL = ds ? "header, [role=banner], .br-header, footer, [role=contentinfo], .br-footer" : "header, [role=banner], footer, [role=contentinfo]";
    const inShell = (el: Element) => (hasMain ? !el.closest("main, [role=main]") : Boolean(el.closest(SHELL)));
    // 3.7.9 (D4): os diálogos modais abertos deste estado — a mesma leitura da chegada dialogOpen (dialog[open], role
    // dialog/alertdialog, aria-modal), visíveis; e, com a pista do DS, o .br-modal visível.
    const modals = Array.from(document.querySelectorAll(
      ds ? "dialog[open], [role='dialog'], [role='alertdialog'], [aria-modal='true'], .br-modal" : "dialog[open], [role='dialog'], [role='alertdialog'], [aria-modal='true']",
    )).filter((m) => shown(m) && (m.tagName !== "DIALOG" || (m as HTMLDialogElement).open));
    /** O clique alcança o controle: fora de [inert] e, com o centro na janela, o elemento no ponto é ele, um descendente ou um ancestral. */
    const reachable = (el: Element): boolean => {
      if (el.closest("[inert]")) return false;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true; // fora da janela: o clique rola até ele; sem como medir aqui
      const hit = document.elementFromPoint(x, y);
      return !hit || hit === el || el.contains(hit) || hit.contains(el);
    };
    const candidates = Array.from(document.querySelectorAll(
      "[aria-expanded], [aria-haspopup], [aria-controls], [data-target], [data-bs-target], [data-panel], [role=tab], details > summary, a[href^='#']",
    ));
    const collapsed: Array<{ el: Element; signal: string; target: Element | null }> = [];
    const opened: Element[] = [];
    const openedTargets = new Map<Element, Element | null>();
    for (const el of candidates) {
      const target = targetOf(el);
      const expanded = el.getAttribute("aria-expanded");
      const popup = el.getAttribute("aria-haspopup");
      const tab = el.getAttribute("role") === "tab";
      const summary = el.tagName === "SUMMARY";
      // aberto = o CONTEÚDO aparece neste estado (com alvo); sem alvo, o que o controle declara. Revisão (MED 5a): o
      // controle clicado duas vezes (fechado de novo) não está aberto.
      const isOpen = summary
        ? (el.parentElement as HTMLDetailsElement).open
        : target
          ? shownDeep(target)
          : expanded === "true" || (tab && el.getAttribute("aria-selected") === "true");
      if (isOpen) {
        if (expanded !== null || tab || summary || target) { opened.push(el); openedTargets.set(el, target); }
        continue;
      }
      let signal: string | null = null;
      if (expanded === "false") signal = "aria-expanded=false";
      else if (tab) signal = "aba não selecionada";
      else if (summary) signal = "details fechado";
      else if (popup && popup !== "false" && expanded !== "true") signal = `aria-haspopup=${popup}`;
      else if (target && target !== document.body) signal = `${el.hasAttribute("aria-controls") ? "aria-controls" : el.hasAttribute("href") ? "href" : "data-target"}→oculto`;
      if (!signal || !shown(el) || disabled(el)) continue;
      // 3.7.9 (D4): com diálogo modal aberto, só os controles DENTRO dele são estados deste estado (os de trás pertencem
      // ao estado sem o diálogo); e controle que o clique não alcança (inert, ou coberto no centro por outro elemento)
      // não ganha receita — ela voltaria state-not-reached.
      if (modals.length && !modals.some((m) => m.contains(el))) continue;
      if (!reachable(el)) continue;
      collapsed.push({ el, signal, target });
    }
    // o mesmo conteúdo controlado por dois elementos (o campo combobox e o botão da lista) é um estado só: fica o botão.
    const pref = (el: Element) => (["BUTTON", "SUMMARY", "A"].includes(el.tagName) || el.getAttribute("role") === "button" || el.getAttribute("role") === "tab" ? 0 : 1);
    const byTarget = new Map<Element, (typeof collapsed)[number]>();
    for (const c of collapsed) {
      if (!c.target) continue;
      const seen = byTarget.get(c.target);
      if (!seen || pref(c.el) < pref(seen.el)) byTarget.set(c.target, c);
    }
    const kept = collapsed.filter((c) => !c.target || byTarget.get(c.target) === c);
    // Revisão (MED 5b): só é UM padrão repetido o que se repete de verdade — 3 instâncias ou mais com o mesmo controle
    // (tag, papel, classes, sinal) E alvo de estrutura equivalente (tag, classes e filhos). Menos que isso, cada controle é
    // um estado próprio (dois menus diferentes nunca dividem uma pendência).
    // a família do controle — sem o sinal e sem classes de estado: a mesma aberta ou fechada (o padrão sobrevive à abertura
    // de uma instância e a pendência do padrão continua a mesma).
    const STATE_CLASS = /^(active|open|is-|show|selected|focus|hover|expanded|collapsed)/;
    const clsOf = (e: Element) => Array.from(e.classList).filter((x) => !STATE_CLASS.test(x)).sort().join(".");
    const familyOf = (el: Element, t: Element | null) => `${el.tagName.toLowerCase()}|${el.getAttribute("role") ?? ""}|${clsOf(el)}|${t
      ? `${t.tagName.toLowerCase()}.${clsOf(t)}>${Array.from(t.children).slice(0, 8).map((c) => `${c.tagName.toLowerCase()}.${clsOf(c)}`).join(",")}`
      : "-"}`;
    const openPerFamily = new Map<string, number>();
    for (const el of opened) { const k = familyOf(el, openedTargets.get(el) ?? null); openPerFamily.set(k, (openPerFamily.get(k) ?? 0) + 1); }
    const byKey = new Map<string, Array<(typeof kept)[number]>>();
    for (const c of kept) { const k = familyOf(c.el, c.target); byKey.set(k, [...(byKey.get(k) ?? []), c]); }
    const groups: Array<{ pattern: string; els: Element[]; signal: string; target: Element | null }> = [];
    for (const [key, list] of byKey) {
      // repetido = 3 ou mais instâncias da família na página (abertas contam): o padrão é um só, com chave estável
      if (list.length + (openPerFamily.get(key) ?? 0) >= 3) groups.push({ pattern: key, els: list.map((c) => c.el), signal: list[0].signal, target: list[0].target });
      else for (const c of list) groups.push({ pattern: `${key}|${selectorOf(c.el) ?? ""}`, els: [c.el], signal: c.signal, target: c.target });
    }
    // lista de opções (select/combobox): estado de menor prioridade, depois da casca e dos menus/abas/acordeões do conteúdo.
    const lowPriority = (el: Element, t: Element | null) =>
      el.getAttribute("role") === "combobox" || t?.getAttribute("role") === "listbox" || (ds && Boolean(el.closest(".br-select")));
    const out = [];
    for (const g of groups) {
      const selectors = g.els.map(selectorOf).filter((s): s is string => Boolean(s));
      if (!selectors.length) continue;
      const first = g.els[g.els.findIndex((e) => selectorOf(e) === selectors[0])];
      const target = g.target && g.target.id && !generated(g.target.id) ? `#${esc(g.target.id)}` : null;
      // a chegada prova o CONTEÚDO aberto (não depende de o controle atualizar o próprio ARIA, que pode ser o defeito):
      // diálogo → dialogOpen; alvo com id → visible no alvo OU num descendente (o painel fixo dentro de um contêiner de
      // altura 0: revisão HIGH 2); só então aria-expanded → expanded.
      const arrival = isDialog(g.target)
        ? { dialogOpen: true as const }
        : target
          ? { visible: `${target}, ${target} *` }
          : first.hasAttribute("aria-expanded")
            ? { expanded: selectors[0] }
            : null;
      const label = ((first.getAttribute("aria-label") ?? (first as HTMLElement).innerText ?? first.textContent ?? "").replace(/\s+/g, " ").trim()).slice(0, 40);
      out.push({ pattern: g.pattern, selectors, signal: g.signal.replace(/→oculto$/, target ? `→${target} oculto` : "→oculto"), target, arrival, region: inShell(first) ? "shell" as const : "main" as const, label, low: lowPriority(first, g.target) });
    }
    // casca primeiro, depois o conteúdo; listas de opções por último; dentro de cada faixa, a ordem do DOM
    const rank = (x: { region: string; low: boolean }) => (x.region === "shell" ? 0 : x.low ? 2 : 1);
    out.sort((a, b) => rank(a) - rank(b));
    return { collapsed: out, opened: opened.map(selectorOf).filter((s): s is string => Boolean(s)) };
  }, options.ds !== false);
}
