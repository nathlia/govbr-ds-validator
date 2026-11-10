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
  /** Texto/nome curto do controle (para leitura). */
  label: string;
}

export interface DisclosureFacts {
  collapsed: DisclosureGroup[];
  /** Seletores (mesma construção) dos controles abertos neste estado. */
  opened: string[];
}

export async function inspectDisclosures(page: Page): Promise<DisclosureFacts> {
  return page.evaluate(() => {
    const shown = (el: Element | null): boolean => {
      if (!el) return false;
      const s = getComputedStyle(el);
      return el.getClientRects().length > 0 && s.visibility !== "hidden" && s.visibility !== "collapse";
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
      Boolean(t && (t.tagName === "DIALOG" || ["dialog", "alertdialog"].includes(t.getAttribute("role") ?? "") || t.classList.contains("br-modal") || t.querySelector(":scope > [role=dialog], :scope > .br-modal")));
    const disabled = (el: Element) => (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
    // casca = fora do conteúdo principal (cabeçalho, menus, rodapé); sem main na página, pelas regiões de casca.
    const hasMain = Boolean(document.querySelector("main, [role=main]"));
    const SHELL = "header, [role=banner], .br-header, footer, [role=contentinfo], .br-footer";
    const inShell = (el: Element) => (hasMain ? !el.closest("main, [role=main]") : Boolean(el.closest(SHELL)));
    const candidates = Array.from(document.querySelectorAll(
      "[aria-expanded], [aria-haspopup], [aria-controls], [data-target], [data-bs-target], [data-panel], [role=tab], details > summary, a[href^='#']",
    ));
    const collapsed: Array<{ el: Element; signal: string; target: Element | null }> = [];
    const opened: Element[] = [];
    for (const el of candidates) {
      const target = targetOf(el);
      const expanded = el.getAttribute("aria-expanded");
      const popup = el.getAttribute("aria-haspopup");
      const tab = el.getAttribute("role") === "tab";
      const summary = el.tagName === "SUMMARY";
      let signal: string | null = null;
      let open = false;
      if (expanded === "false") signal = "aria-expanded=false";
      else if (expanded === "true") open = true;
      else if (tab) {
        if (el.getAttribute("aria-selected") === "false" || (target && !shown(target))) signal = "aba não selecionada";
        else open = true;
      } else if (summary) {
        if (!(el.parentElement as HTMLDetailsElement).open) signal = "details fechado";
        else open = true;
      } else if (popup && popup !== "false") signal = `aria-haspopup=${popup}`;
      else if (target && target !== document.body) {
        // ligação por atributo: só conta quando o alvo não aparece neste estado (âncora para conteúdo visível não é gatilho)
        if (!shown(target)) signal = `${el.hasAttribute("aria-controls") ? "aria-controls" : el.hasAttribute("href") ? "href" : "data-target"}→oculto`;
        else if (!el.hasAttribute("href")) open = true;
      }
      if (open) {
        if (target ? shown(target) : true) opened.push(el);
        continue;
      }
      if (!signal || !shown(el) || disabled(el)) continue;
      if (target && shown(target) && signal !== "aria-expanded=false" && !signal.startsWith("aria-haspopup")) continue;
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
    const groups = new Map<string, { pattern: string; els: Element[]; signal: string; target: Element | null }>();
    for (const c of kept) {
      const cls = Array.from(c.el.classList).filter((x) => !/^(active|open|is-|show|selected|focus|hover)/.test(x)).sort().join(".");
      const tcls = c.target ? `${c.target.tagName.toLowerCase()}.${Array.from(c.target.classList).sort().join(".")}` : "-";
      const pattern = `${c.el.tagName.toLowerCase()}|${c.el.getAttribute("role") ?? ""}|${cls}|${c.signal.replace(/→.*/, "")}|${tcls}`;
      const g = groups.get(pattern) ?? { pattern, els: [], signal: c.signal, target: c.target };
      g.els.push(c.el);
      groups.set(pattern, g);
    }
    const out = [];
    for (const g of groups.values()) {
      const selectors = g.els.map(selectorOf).filter((s): s is string => Boolean(s));
      if (!selectors.length) continue;
      const first = g.els[selectors.length ? g.els.findIndex((e) => selectorOf(e) === selectors[0]) : 0];
      const target = g.target && g.target.id && !generated(g.target.id) ? `#${esc(g.target.id)}` : null;
      // a chegada prova o CONTEÚDO aberto (não depende de o controle atualizar o próprio ARIA, que pode ser o defeito):
      // diálogo → dialogOpen; alvo com id → visible; só então aria-expanded → expanded.
      const arrival = isDialog(g.target)
        ? { dialogOpen: true as const }
        : target
          ? { visible: target }
          : first.hasAttribute("aria-expanded")
            ? { expanded: selectors[0] }
            : null;
      const label = ((first.getAttribute("aria-label") ?? (first as HTMLElement).innerText ?? first.textContent ?? "").replace(/\s+/g, " ").trim()).slice(0, 40);
      out.push({ pattern: g.pattern, selectors, signal: g.signal.replace(/→oculto$/, target ? `→${target} oculto` : "→oculto"), target, arrival, region: inShell(first) ? "shell" as const : "main" as const, label });
    }
    // casca primeiro, depois o conteúdo; dentro de cada um, a ordem do DOM
    out.sort((a, b) => (a.region === b.region ? 0 : a.region === "shell" ? -1 : 1));
    return { collapsed: out, opened: opened.map(selectorOf).filter((s): s is string => Boolean(s)) };
  });
}
