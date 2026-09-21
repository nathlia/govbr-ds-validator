/**
 * B1 — deterministic token compliance checker ("syntactic half" of the
 * hybrid architecture). Exact-value comparison of computed styles against the
 * token registry's reverse index; no LLM involvement (oyelayo2026: LLM F1
 * 0.48 on layout/value matching — deterministic code wins there).
 *
 * Pure function over ElementEvidence fixtures → unit-testable without a
 * browser.
 */
import type { Finding, Observation } from "../schema/finding.js";
import { nextFindingId } from "../schema/finding.js";
import type { TokenRegistry } from "../data/load.js";
import type { ElementEvidence } from "../evidence/types.js";
import { normalizeColor, nearestToken, parsePx } from "./color.js";
import { CHECK_GROUNDING, groundingFor, podeVirarAchado } from "./grounding.js";
import { EXPECTED_CONDITIONS } from "../schema/structuredClaims.js";

export type TokenCheck = "color" | "font" | "radius" | "spacing";

export const ALL_TOKEN_CHECKS: TokenCheck[] = ["color", "font", "radius", "spacing"];

const COLOR_PROPS: { prop: keyof ElementEvidence["computed"]; label: string }[] = [
  { prop: "backgroundColor", label: "background-color" },
  { prop: "color", label: "color" },
  { prop: "borderColor", label: "border-color" },
];

/** DS font families (Rawline for text, Raleway as fallback/headings). */
const DS_FONT = /rawline|raleway/i;

/**
 * A escala tipográfica do registro, em px. Extraída aqui para que a observação do D-32 e qualquer
 * verificação futura leiam a MESMA escala — duas cópias divergiriam, que é o defeito estrutural
 * que este repositório já encontrou nove vezes.
 */
function fontScalePx(registry: TokenRegistry): number[] {
  return Object.entries(registry.all)
    .filter(([name]) => name.startsWith("--font-size-scale"))
    .map(([, v]) => parsePx(v))
    .filter((v): v is number => v !== null);
}

/**
 * Fora da escala, com tolerância de arredondamento para pixel inteiro.
 *
 * A escala do DS é modular e não redonda (14 · 16,8 · 20,16 · 24,192 px). Quem transcreve 20,16
 * para o CSS escreve 20px, e essa é a folga que a tolerância cobre — não mais que isso.
 */
function foraDaEscala(value: string, scale: number[]): boolean {
  const px = parsePx(value);
  if (px === null) return false; // non-px (%, em) — not comparable here
  return !scale.some((s) => Math.abs(s - px) < 0.5);
}

function tokenListLabel(tokens: string[]): string {
  return tokens.slice(0, 3).join(", ") + (tokens.length > 3 ? ", …" : "");
}

/**
 * `undefined` significa fixture/consumidor legado sem prova de autoria: conserva o comportamento
 * anterior. Uma lista vazia significa que a coleta nova provou que a página não declarou a
 * propriedade diretamente — nesse caso o checker não atribui o valor ao autor. Declarações que
 * coincidem com a folha oficial do DS já chegam separadas em `dsShipped` e não contam como autoria
 * (D-51, `evidence/cssProvenance.ts`).
 */
function authored(el: ElementEvidence, prop: keyof ElementEvidence["computed"]): string[] | undefined {
  if (!el.authored) return undefined;
  return el.authored[prop] ?? [];
}

function stripImportant(value: string): string {
  return value.replace(/\s*!important\s*$/i, "").trim();
}

/** Follow var(--x) chains in the raw token map (e.g. --radius: var(--surface-rounder-pill)). */
function resolveVar(value: string, all: Record<string, string>, depth = 0): string {
  if (depth > 5) return value;
  const m = value.trim().match(/^var\((--[\w-]+)\)$/);
  if (!m) return value;
  const next = all[m[1]];
  return next ? resolveVar(next, all, depth + 1) : value;
}

export function checkTokenCompliance(
  page: { url: string },
  elements: ElementEvidence[],
  registry: TokenRegistry,
  checks: TokenCheck[] = ALL_TOKEN_CHECKS
): Finding[] {
  const findings: Finding[] = [];
  const { hexLookup, all } = registry;

  // Allowed discrete values derived from the registry itself.
  // Compared numerically with tolerance — browsers round computed px values.
  // Radius tokens: px values compare directly; em values (pill: --button-radius
  // 100em, --surface-rounder-pill 999em) reach the computed style multiplied by
  // the element's font-size, so they must be converted per element.
  const radiusPxScale = new Set<number>([0]);
  const radiusEmFactors = new Set<number>();
  for (const [name, raw] of Object.entries(all)) {
    if (!/rounder|radius/.test(name)) continue;
    const v = resolveVar(raw, all).trim();
    if (v === "0") {
      radiusPxScale.add(0);
      continue;
    }
    const px = parsePx(v);
    if (px !== null) {
      radiusPxScale.add(px);
      continue;
    }
    const em = v.match(/^([\d.]+)em$/);
    if (em) radiusEmFactors.add(parseFloat(em[1]));
  }
  const radiusScaleLabel = `${[...radiusPxScale].sort((a, b) => a - b).map((v) => `${v}px`).join(", ")}, 50% (circle) ou pill (${[...radiusEmFactors].sort((a, b) => a - b).map((f) => `${f}em`).join("/")} × font-size)`;
  const spacingBase = parsePx(registry.semantic["spacing-base"]?.value ?? "8px") ?? 8;

  for (const el of elements) {
    const base = {
      element: {
        locator: el.locator,
        snippet: el.outerHTML.slice(0, 300),
        page: page.url,
      },
    };

    if (checks.includes("color")) {
      for (const { prop, label } of COLOR_PROPS) {
        const raw = el.computed[prop];
        if (!raw) continue;
        const declarations = authored(el, prop);
        if (declarations?.length === 0) continue;
        const hex = normalizeColor(raw);
        if (!hex) continue; // transparent / unparseable — nothing to compare
        if (hexLookup[hex]) continue; // exact token value — compliant
        const nearest = nearestToken(hex, hexLookup);
        findings.push({
          id: nextFindingId(),
          rule: {
            id: "ds-token-color",
              implements: groundingFor("token-color"),
            source: "govbr-ds-token",
            description:
              "Cores devem usar valores do registro de tokens do gov.br DS (Padrão Digital de Governo); valores arbitrários quebram a identidade visual e o theming.",
          },
          ...base,
          evidence: {
            observed: `${label}: ${raw} (${hex}) não corresponde a nenhum token do DS`,
            expected: nearest
              ? `Valor de token do DS; mais próximo: ${nearest.token} (${nearest.hex}, distância RGB ${nearest.distance})`
              : "Valor presente no registro de tokens do DS",
            data: {
              property: label,
              observedHex: hex,
              expectedCondition: EXPECTED_CONDITIONS.tokenColor,
              nearestToken: nearest?.token ?? null,
              nearestHex: nearest?.hex ?? null,
              rgbDistance: nearest?.distance ?? null,
              authoredDeclarations: declarations ?? null,
            },
          },
          severity: "moderate",
          nature: "syntactic",
          mode: "display",
          pathway: "deterministic",
        });
      }
    }

    if (checks.includes("font")) {
      const family = el.computed.fontFamily;
      const familyDeclarations = authored(el, "fontFamily");
      if (family && familyDeclarations?.length !== 0 && !DS_FONT.test(family)) {
        findings.push({
          id: nextFindingId(),
          rule: {
            id: "ds-token-font-family",
              implements: groundingFor("token-font-family"),
            source: "govbr-ds-token",
            description: "A tipografia do gov.br DS usa Rawline (com Raleway como alternativa).",
          },
          ...base,
          evidence: {
            observed: `font-family: ${family}`,
            expected: `Família contendo Rawline/Raleway (token ${registry.semantic["font-family"]?.token}: ${registry.semantic["font-family"]?.value})`,
            data: {
              property: "font-family",
              observed: family,
              expectedCondition: EXPECTED_CONDITIONS.tokenFontFamily,
              authoredDeclarations: familyDeclarations ?? null,
            },
          },
          severity: "moderate",
          nature: "syntactic",
          mode: "display",
          pathway: "deterministic",
        });
      }

      // font-size saiu daqui no D-32: sem norma que sustente a afirmação, o desvio é observação.
      // Veja `collectTokenObservations` abaixo.
    }

    if (checks.includes("radius")) {
      const radius = el.computed.borderRadius;
      const radiusDeclarations = authored(el, "borderRadius");
      // Only single-value radii are comparable against the discrete scale;
      // 50% is the circle variant.
      if (radius && radiusDeclarations?.length !== 0 && !radius.includes(" ") && radius !== "50%") {
        const px = parsePx(radius);
        if (px !== null && px > 0) {
          const fontPx = el.computed.fontSize ? parsePx(el.computed.fontSize) : null;
          const onPxScale = [...radiusPxScale].some((r) => Math.abs(r - px) < 0.5);
          const isPill =
            fontPx !== null && [...radiusEmFactors].some((f) => Math.abs(f * fontPx - px) < 1);
          if (!onPxScale && !isPill) {
            findings.push({
              id: nextFindingId(),
              rule: {
                id: "ds-token-radius",
              implements: groundingFor("token-radius"),
                source: "govbr-ds-token",
                description: "Cantos arredondados devem usar os tokens de superfície (--surface-rounder-sm/md/lg) ou o pill (--button-radius/--surface-rounder-pill).",
              },
              ...base,
              evidence: {
                observed: `border-radius: ${radius} fora da escala do DS`,
                expected: `Um de: ${radiusScaleLabel}`,
                data: {
                  property: "border-radius",
                  observed: radius,
                  expectedCondition: EXPECTED_CONDITIONS.tokenRadius,
                  allowedPxScale: [...radiusPxScale].sort((a, b) => a - b),
                  pillEmFactors: [...radiusEmFactors].sort((a, b) => a - b),
                  authoredDeclarations: radiusDeclarations ?? null,
                },
              },
              severity: "minor",
              nature: "syntactic",
              mode: "display",
              pathway: "deterministic",
            });
          }
        }
      }
    }

    if (checks.includes("spacing")) {
      for (const prop of ["padding", "margin"] as const) {
        const value = el.computed[prop];
        if (!value) continue;
        const declarations = authored(el, prop);
        if (declarations?.length === 0) continue;
        const rawParts = declarations
          ?.flatMap((declaration) => stripImportant(declaration).split(/\s+/))
          .filter((part) => part && part.toLowerCase() !== "auto");
        // Declarações numéricas são julgadas como escritas. var()/calc() precisam do valor
        // computado para comparação; fixtures legadas sem `authored` também usam o computado.
        const authoredHasResolvableExpression = rawParts?.some((p) => /^(?:var|calc|min|max|clamp)\(/i.test(p));
        const parts = rawParts && !authoredHasResolvableExpression ? rawParts : value.split(/\s+/);
        // Uma declaração que perdeu a cascata não é o que a página mostra: o `margin: -1px` de uma
        // regra sobrescrita por `margin: 0` saía como "fora da escala" com o valor computado em 0px
        // (D-51). Em px o valor declarado que vence é o valor computado, então a parte só conta se
        // aparecer nele.
        const computedPx = value.split(/\s+/).map((p) => parsePx(p)).filter((px): px is number => px !== null);
        const offScale = parts.filter((p) => {
          const px = parsePx(p);
          return px !== null && px !== 0 && Math.abs(px % (spacingBase / 2)) > 0.01 &&
            computedPx.some((c) => Math.abs(c - px) < 0.01);
        });
        if (offScale.length > 0) {
          findings.push({
            id: nextFindingId(),
            rule: {
              id: "ds-token-spacing",
              implements: groundingFor("token-spacing"),
              source: "govbr-ds-token",
              description: `Espaçamentos devem seguir a escala do DS (múltiplos de ${spacingBase / 2}px, base ${spacingBase}px).`,
            },
            ...base,
            evidence: {
              observed: `${prop}: ${value} (fora da escala: ${offScale.join(", ")})`,
              expected: `Múltiplos de ${spacingBase / 2}px`,
              data: {
                property: prop,
                observed: value,
                expectedCondition: EXPECTED_CONDITIONS.tokenSpacing,
                offScale,
                spacingBase,
                authoredDeclarations: declarations ?? null,
              },
            },
            severity: "minor",
            nature: "syntactic",
            mode: "display",
            pathway: "deterministic",
          });
        }
      }
    }
  }

  // D-27 dizia que verificação sem norma não produz achado, e nada verificava: `podeVirarAchado`
  // não tinha um único chamador. A regra era mantida à mão — foi assim que a escala tipográfica
  // passou meses afirmando violação sustentada só pela regra geral de tokens (D-32). Agora a saída
  // é conferida: um achado cuja verificação não nomeia norma é defeito do oráculo, não da página.
  for (const f of findings) {
    if (!f.rule.implements || f.rule.implements.length === 0) {
      throw new Error(
        `achado \`${f.rule.id}\` sem norma declarada — verificação sem grounding não produz achado (D-27)`,
      );
    }
  }

  return findings;
}

/**
 * Sinais de revisão de token (D-32) — o desvio que o oráculo mostra sem afirmar violação.
 *
 * Espelha `collectStructureObservations`: mesma razão, outra família de verificação. A escala
 * tipográfica do gov.br é modular e não redonda, e a única regra da KB sobre tamanho de fonte é
 * informativa; afirmar violação binária sobre uma diferença sub-pixel fazia o veredito depender de
 * onde se corta a tolerância em vez da norma. O desvio continua sendo informação útil — por isso
 * sai —, e quem julga se ele é defeito é a camada semântica, com a página na frente.
 */
export function collectTokenObservations(
  page: { url: string },
  elements: ElementEvidence[],
  registry: TokenRegistry
): Observation[] {
  // Se alguém devolver norma a `token-font-size`, o desvio volta a ser achado e este coletor passa
  // a duplicá-lo em silêncio. Falha aqui, alto, em vez de contar duas vezes.
  if (podeVirarAchado("token-font-size")) {
    throw new Error(
      "`token-font-size` voltou a declarar norma: mova a verificação de volta para checkTokenCompliance " +
        "em vez de emiti-la como observação (D-32)",
    );
  }

  const observations: Observation[] = [];
  const scale = fontScalePx(registry);
  const rotulo = tokenListLabel(scale.map((v) => `${v}px`));

  for (const el of elements) {
    const size = el.computed.fontSize;
    const declarations = authored(el, "fontSize");
    // Sem declaração autoral, o valor é herdado ou padrão do navegador — não é escolha da página.
    if (!size || declarations?.length === 0 || !foraDaEscala(size, scale)) continue;

    observations.push({
      kind: "token-font-size-off-scale",
      element: { locator: el.locator, snippet: el.outerHTML.slice(0, 300), page: page.url },
      note: `font-size: ${size} não coincide com a escala tipográfica do DS (${rotulo}).`,
      whyNotAFinding: CHECK_GROUNDING["token-font-size"].basis,
      data: {
        property: "font-size",
        observed: size,
        allowedScale: scale.map((v) => `${v}px`),
        authoredDeclarations: declarations ?? null,
      },
    });
  }

  return observations;
}
