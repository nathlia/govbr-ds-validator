/**
 * govbr-ds-validator MCP server — the validation oracle (TCC 2 artifact).
 *
 * Design (traceable to tcc2-requirements.md):
 *   A1  rules as queryable tools/resources, never static prompt text
 *   A2  e-MAG 3.1 alongside WCAG-derived checks
 *   A3  canonical component specs from @govbr-ds/core examples
 *   A4  token registry with hex→token reverse index
 *   A5  responses shaped as structured feedback signals
 *   A6  validation procedure as an MCP prompt primitive
 *   B1  deterministic token/structure checkers (no LLM)
 *   B2  axe-core embedded as deterministic accessibility pass
 *   C3  verify_finding anti-hallucination gate
 *   C5  evidence tools separated from judgment
 *   D2–D4  finding schema, dual-format report, persisted traces
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FindingSchema } from "./schema/finding.js";
import {
  getTokenRegistry,
  getEmag,
  getPageRules,
  getComponentSpecs,
  findEmagRule,
} from "./data/load.js";
import {
  getKnowledgeBase,
  filterRules,
  getEvidence,
  getRuleById,
  getKnowledgeConflicts,
  getComponentDefects,
  getEmagValidationTemplate,
  warnOnVersionMismatch,
  NORMATIVE_FORCES,
  type KnowledgeRule,
  type RuleForce,
} from "./data/knowledge.js";
import { checkTokenCompliance, ALL_TOKEN_CHECKS } from "./checkers/tokenCompliance.js";
import { checkComponentStructure, collectStructureObservations } from "./checkers/structure.js";
import { runAxeScan } from "./checkers/axe.js";
import {
  inspectComputedStyles,
  STYLE_PROPERTIES,
  type StyleProperty,
} from "./evidence/inspect.js";
import { verifyFinding } from "./verify/gate.js";
import { validateFindings, buildReport, persistReport, summarize } from "./report/report.js";
import { buildValidatePagePrompt } from "./prompts/validatePage.js";
import { ToolTelemetry, instrumentTool, type ToolTelemetryOptions } from "./telemetry.js";
import {
  FindingDetailSchema,
  FindingPageInputShape,
  FindingStore,
  buildFindingPage,
  deduplicateFindings,
  diffFindings,
} from "./responses/findings.js";
import { PageScanCache, scanPage } from "./scan/pageScan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORTS_DIR = join(__dirname, "../../reports");

export interface ServerOptions {
  reportsDir?: string;
  telemetry?: ToolTelemetryOptions;
  /** Full authoring surface, or the smaller surface used by controlled evaluations. */
  toolProfile?: "full" | "evaluation" | "normative" | "deterministic" | "evidence";
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const StylePropertySchema = z.enum(STYLE_PROPERTIES);

function selectorBatch(selector?: string, selectors?: string[]): string | string[] | undefined {
  const batch = [...(selector ? [selector] : []), ...(selectors ?? [])];
  return batch.length > 0 ? batch : undefined;
}

function tokenProperties(checks: typeof ALL_TOKEN_CHECKS): StyleProperty[] {
  const properties = new Set<StyleProperty>();
  if (checks.includes("color")) {
    properties.add("backgroundColor");
    properties.add("color");
    properties.add("borderColor");
  }
  if (checks.includes("font")) {
    properties.add("fontFamily");
    properties.add("fontSize");
  }
  if (checks.includes("radius")) {
    properties.add("borderRadius");
    properties.add("fontSize");
  }
  if (checks.includes("spacing")) {
    properties.add("padding");
    properties.add("margin");
  }
  return [...properties];
}

/**
 * Projeção mínima para varredura (D-26).
 *
 * Medido: as 152 regras normativas na projeção completa custam ~35 mil tokens; nesta, ~14 mil; e
 * uma página de 40, ~3,4 mil. O agente que está decidindo QUAIS regras importam precisa do id
 * (para citar), do texto normalizado (para julgar), da força e de como se verifica. O resto —
 * proveniência, referências cruzadas, evidência esperada — é o que ele consulta depois de já ter
 * escolhido a regra, e aí vem por `id` ou por `detail: "full"`.
 */
function briefRule(r: KnowledgeRule) {
  return {
    id: r.id,
    title: r.title,
    normalizedRule: r.normalizedRule,
    force: r.force,
    component: r.component ?? null,
    validationStrategy: r.validationStrategy,
  };
}

/** Contagens por dimensão — o índice barato que substitui a listagem sem filtro (~320 tokens). */
function ruleFacets(rules: KnowledgeRule[]) {
  const count = (pick: (r: KnowledgeRule) => string) => {
    const out: Record<string, number> = {};
    for (const r of rules) {
      const k = pick(r);
      out[k] = (out[k] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
  };
  return {
    force: count(r => r.force),
    category: count(r => r.category),
    validationStrategy: count(r => r.validationStrategy),
    component: count(r => r.component ?? "(global)"),
  };
}

/** Compact projection of a KB rule for get_ds_rules list responses. */
function projectRule(r: KnowledgeRule) {
  return {
    id: r.id,
    title: r.title,
    normalizedRule: r.normalizedRule,
    force: r.force,
    category: r.category,
    subcategory: r.subcategory ?? null,
    component: r.component,
    validationStrategy: r.validationStrategy,
    automatable: r.automatable,
    automationConfidence: r.automationConfidence ?? null,
    severitySuggestion: r.severitySuggestion ?? null,
    expectedEvidence: r.expectedEvidence,
    rationale: r.rationale,
    conditions: r.conditions,
    exceptions: r.exceptions,
    wcagReferences: r.wcagReferences,
    emagReferences: r.emagReferences,
    standard: r.standard ?? null,
    sourceUrl: r.source.url,
  };
}

export function createServer(options: ServerOptions = {}): McpServer {
  const reportsDir = options.reportsDir ?? process.env.GOVBR_VALIDATOR_REPORTS_DIR ?? DEFAULT_REPORTS_DIR;
  const requestedProfile = options.toolProfile ?? process.env.GOVBR_VALIDATOR_TOOL_PROFILE ?? "full";
  const toolProfile = (["full", "evaluation", "normative", "deterministic", "evidence"] as const)
    .includes(requestedProfile as never)
    ? requestedProfile as NonNullable<ServerOptions["toolProfile"]>
    : "full";
  const hasNorms = toolProfile === "full" || toolProfile === "evaluation" || toolProfile === "normative";
  const hasDeterministic = toolProfile === "full" || toolProfile === "evaluation" || toolProfile === "deterministic";
  const hasEvidence = toolProfile === "full" || toolProfile === "evidence";
  const hasCombinedGate = toolProfile === "full" || toolProfile === "evaluation";
  const telemetry = new ToolTelemetry(options.telemetry);
  const findingStore = new FindingStore();
  const pageScanCache = new PageScanCache();

  const server = new McpServer({
    name: "govbr-ds-validator",
    version: "2.0.0",
  });

  // Phase 2.5 guard: the KB and the installed @govbr-ds/core must describe
  // the same DS release (logs to stderr — stdout is the MCP transport).
  warnOnVersionMismatch();

  // ══════════════════════════════════════════════════════════════════════════
  // Oracle knowledge tools (A1–A4)
  // ══════════════════════════════════════════════════════════════════════════

  if (hasNorms) server.registerTool(
    "get_ds_rules",
    {
      title: "Regras atômicas do gov.br DS (knowledge base)",
      description:
        "Busca regras normativas do gov.br DS e e-MAG por filtro ou id. Use a projeção breve para triagem e detalhe completo somente para regras candidatas.",
      inputSchema: {
        id: z.string().optional().describe("Id exato de regra (govbr-3.7.0-…) — retorna o registro completo"),
        ids: z
          .array(z.string())
          .min(1)
          .max(20)
          .optional()
          .describe("Até 20 ids exatos em lote; usa detail brief por padrão"),
        component: z.string().optional().describe("Componente, ex.: 'button', 'card'"),
        category: z
          .enum(["accessibility", "component", "development", "foundation", "page", "pattern", "template"])
          .optional(),
        force: z
          .enum(["required", "prohibited", "recommended", "discouraged", "permitted", "informative", "unclear"])
          .optional()
          .describe("Força normativa ('example' não é aceito aqui — use include_evidence)"),
        validationStrategy: z
          .enum([
            "dom",
            "semantic",
            "computed-style",
            "keyboard-interaction",
            "source-code",
            "manual",
            "visual",
            "accessibility-tree",
            "responsive-viewport",
          ])
          .optional()
          .describe("Mecanismo de verificação exigido pela regra"),
        automatable: z.boolean().optional(),
        automationConfidence: z.enum(["high", "medium", "low"]).optional(),
        severitySuggestion: z
          .enum(["critical", "serious", "moderate", "minor", "informational"])
          .optional(),
        standard: z.enum(["gov.br Design System", "eMAG"]).optional(),
        query: z.string().optional().describe("Busca textual em título/regra/texto original"),
        include_evidence: z
          .boolean()
          .optional()
          .describe("Anexar fragmentos canônicos (force=example) no campo separado 'evidence'"),
        detail: z
          .enum(["brief", "full"])
          .optional()
          .describe("Detalhe da listagem: 'brief' (padrão) traz id/título/regra/força/estratégia; 'full' traz o registro projetado inteiro"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Máximo de regras por página (padrão 40)"),
        offset: z.number().int().min(0).optional().describe("Deslocamento da paginação (padrão 0)"),
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_ds_rules", async ({ id, ids, include_evidence, detail, limit, offset, ...filter }) => {
      const kb = getKnowledgeBase();
      if (id && ids) return json({ error: "Informe id ou ids, não ambos." });
      if (id) {
        const rule = getRuleById(id);
        if (!rule) return json({ error: `Regra '${id}' não encontrada no knowledge base.` });
        return json({
          kind: NORMATIVE_FORCES.includes(rule.force as RuleForce) ? "normative" : "evidence",
          rule,
        });
      }
      if (ids) {
        const found = ids.map((ruleId) => getRuleById(ruleId)).filter((rule): rule is KnowledgeRule => Boolean(rule));
        const foundIds = new Set(found.map((rule) => rule.id));
        const project = detail === "full" ? projectRule : briefRule;
        return json({
          requested: ids.length,
          count: found.length,
          detail: detail ?? "brief",
          missing: ids.filter((ruleId) => !foundIds.has(ruleId)),
          rules: found.map((rule) => ({
            kind: NORMATIVE_FORCES.includes(rule.force as RuleForce) ? "normative" : "evidence",
            ...project(rule),
          })),
        });
      }

      const semFiltro = Object.values(filter).every(v => v === undefined);
      const rules = filterRules(filter);

      // Sem nenhum filtro, devolver a KB inteira custava ~35 mil tokens por chamada. Devolve-se o
      // índice de facetas (~320) e as dimensões pelas quais estreitar. Mesmo desenho que
      // get_page_rules e get_design_tokens já usavam — o get_ds_rules é que destoava (D-26).
      if (semFiltro) {
        return json({
          meta: { dsVersion: kb.meta.dsVersion, totalNormative: kb.meta.normativeRules },
          note:
            "Índice, não listagem: chamar sem filtro devolveria a base normativa inteira. Estreite por " +
            "component, category, force, validationStrategy ou query — ou peça uma regra por id. " +
            "Para paginar a base inteira mesmo assim, passe limit/offset explicitamente.",
          total: rules.length,
          facets: ruleFacets(rules),
        });
      }

      const take = limit ?? 40;
      const skip = offset ?? 0;
      const page = rules.slice(skip, skip + take);
      const project = detail === "full" ? projectRule : briefRule;

      const response: Record<string, unknown> = {
        meta: { dsVersion: kb.meta.dsVersion, totalNormative: kb.meta.normativeRules },
        total: rules.length,
        offset: skip,
        count: page.length,
        detail: detail ?? "brief",
        rules: page.map(project),
      };
      if (skip + page.length < rules.length) {
        response.more = {
          remaining: rules.length - (skip + page.length),
          nextOffset: skip + page.length,
          note: "Peça a próxima página com o mesmo filtro e offset=nextOffset.",
        };
      }
      if (detail !== "full") {
        response.detailNote =
          "Projeção mínima. Para evidência esperada, condições, exceções, referências cruzadas e " +
          "proveniência, peça a regra por id ou repita com detail='full'.";
      }
      if (include_evidence) {
        const evidence = getEvidence(filter.component);
        response.evidence = {
          note: "Fragmentos canônicos do @govbr-ds/core — evidência de implementação, NÃO normas. Não sobrepõem regras required/prohibited.",
          count: evidence.length,
          items: evidence.map(project),
        };
      }
      return json(response);
    })
  );

  if (hasNorms) server.registerTool(
    "get_design_tokens",
    {
      title: "Design tokens do gov.br DS",
      description:
        "Consulta tokens do gov.br DS por nome. Sem filtro, retorna apenas destaques semânticos e o índice reverso de cores.",
      inputSchema: {
        query: z.string().optional().describe("Fragmento de nome para filtrar (omitir para destaques semânticos + índice hex)"),
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_design_tokens", async ({ query }) => {
      const registry = getTokenRegistry();
      if (!query) {
        return json({ meta: registry.meta, semantic: registry.semantic, hexLookup: registry.hexLookup });
      }
      const q = query.toLowerCase();
      const matches = Object.fromEntries(Object.entries(registry.all).filter(([k]) => k.toLowerCase().includes(q)));
      return json({ query, count: Object.keys(matches).length, tokens: matches });
    })
  );

  if (hasNorms) server.registerTool(
    "get_emag_rules",
    {
      title: "Regras e-MAG 3.1",
      description:
        "Consulta recomendações do e-MAG por seção ou id. Sem filtro, retorna somente o índice de seções.",
      inputSchema: {
        section: z.number().min(1).max(6).optional().describe("Seção 1–6"),
        id: z.string().optional().describe("Id de regra específica, ex.: '4.1'"),
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_emag_rules", async ({ section, id }) => {
      const emag = getEmag();
      if (id) {
        const rule = findEmagRule(id);
        if (!rule) return json({ error: `Regra '${id}' não encontrada. Use section para listar ids válidos.` });
        // KB enrichment (Phase 2.6): how to verify this recommendation.
        const template = getEmagValidationTemplate(id);
        return json(template ? { ...rule, validationTemplate: template } : rule);
      }
      if (section) {
        return json({ meta: emag.meta, section: emag.sections[String(section)] ?? `Seção ${section} não encontrada` });
      }
      return json({
        meta: emag.meta,
        sections: Object.entries(emag.sections).map(([id, value]) => ({
          id,
          title: value.title,
          ruleCount: value.rules.length,
        })),
        note: "Índice compacto. Use section para listar regras ou id para buscar uma recomendação específica.",
      });
    })
  );

  if (hasNorms) server.registerTool(
    "get_page_rules",
    {
      title: "Diretrizes de página do gov.br DS",
      description:
        "Consulta diretrizes de página por categoria. Sem categoria, retorna somente o índice disponível.",
      inputSchema: {
        category: z
          .enum([
            "page_structure",
            "form_patterns",
            "navigation_patterns",
            "help_communication",
            "empty_states",
            "states",
            "grid",
            "writing_principles",
            "microcopy",
            "html_best_practices",
            "html_accessibility",
            "wai_aria",
            "minimum_standard",
          ])
          .optional(),
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_page_rules", async ({ category }) => {
      const pageRules = getPageRules();
      if (!category) {
        return json({
          meta: pageRules.meta,
          available: Object.entries(pageRules.categories).map(([key, { label, url }]) => ({ key, label, url })),
        });
      }
      return json(pageRules.categories[category] ?? { error: `Categoria '${category}' não encontrada.` });
    })
  );

  if (toolProfile === "full") server.registerTool(
    "list_components",
    {
      title: "Componentes do gov.br DS",
      description: "Lista os componentes disponíveis no @govbr-ds/core instalado, com classe raiz e tags canônicas.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "list_components", async () => {
      const { meta, components } = getComponentSpecs();
      return json({
        meta,
        components: Object.values(components).map(({ name, rootClass, tags, variantClasses }) => ({
          name,
          rootClass,
          tags,
          variantClasses,
        })),
      });
    })
  );

  if (hasNorms) server.registerTool(
    "get_component_spec",
    {
      title: "Especificação canônica de componente",
      description:
        "Consulta estrutura, variantes, atributos e tokens de um componente. Exemplos HTML são opcionais e podem conter alertas conhecidos.",
      inputSchema: {
        component: z.string().describe("Nome do componente, ex.: 'button', 'input', 'select'"),
        include_examples: z.boolean().optional().describe("Incluir fragmentos HTML canônicos (padrão: false, até 5)"),
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(telemetry, "get_component_spec", async ({ component, include_examples }) => {
      const specs = getComponentSpecs();
      const spec = specs.components[component];
      if (!spec) {
        return json({
          error: `Componente '${component}' não encontrado.`,
          available: Object.keys(specs.components),
        });
      }
      const includeExamples = include_examples ?? false;
      // Defect awareness (D-10/Phase 2.4): the canonical examples of some
      // components are themselves non-conformant — warn at spec-serving time.
      const defects = getComponentDefects(component);
      return json({
        ...spec,
        warnings: defects.map((d) => ({
          type: d.type,
          severity: d.severity,
          file: d.file,
          element: d.element,
          evidence: d.evidence,
          note: "Defeito de acessibilidade no exemplo canônico oficial — não trate este fragmento como norma (veja govbr://knowledge/conflicts).",
        })),
        examples: includeExamples ? spec.examples.slice(0, 5) : [],
        availableExamples: spec.examples.map((e) => e.name),
      });
    })
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Evidence tool (C5 phase 1)
  // ══════════════════════════════════════════════════════════════════════════

  if (hasEvidence) server.registerTool(
    "inspect_computed_styles",
    {
      title: "Inspecionar estilos computados",
      description:
        "Coleta estilos computados, foco e evidência estrutural sem julgar. Agrupe alvos em selectors e peça somente as properties necessárias; omiti-las mantém a resposta completa legada.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS único (compatibilidade)"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Seletores CSS avaliados no mesmo carregamento"),
        properties: z
          .array(StylePropertySchema)
          .max(STYLE_PROPERTIES.length)
          .optional()
          .describe("Somente propriedades necessárias; omitir mantém o contrato completo legado"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(telemetry, "inspect_computed_styles", async ({ url, selector, selectors, properties }) =>
      json(await inspectComputedStyles(url, selectorBatch(selector, selectors), properties))
    )
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Deterministic checkers (B1/B2) — findings come out in the D2 schema
  // ══════════════════════════════════════════════════════════════════════════

  if (hasDeterministic) server.registerTool(
    "scan_page",
    {
      title: "Varredura determinística agregada",
      description:
        "Carrega a página uma vez e executa tokens, estrutura e/ou axe no mesmo estado. Retorna fingerprint, cobertura, cache exato e findings compactos registrados no ledger da sessão.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Escopos CSS combinados na mesma carga"),
        checks: z
          .array(z.enum(["tokens", "structure", "axe"]))
          .min(1)
          .max(3)
          .optional()
          .describe("Checks agregados (padrão: todos)"),
        tokenChecks: z
          .array(z.enum(["color", "font", "radius", "spacing"]))
          .min(1)
          .max(4)
          .optional()
          .describe("Subchecks de tokens quando tokens estiver habilitado"),
        components: z.array(z.string()).min(1).max(36).optional().describe("Componentes estruturais a validar"),
        actions: z
          .array(
            z.discriminatedUnion("action", [
              z.object({ action: z.literal("click"), selector: z.string() }),
              z.object({ action: z.literal("fill"), selector: z.string(), value: z.string().max(2_000) }),
              z.object({ action: z.literal("press"), key: z.string(), selector: z.string().optional() }),
              z.object({
                action: z.literal("wait"),
                selector: z.string().optional(),
                ms: z.number().int().min(0).max(5_000).optional(),
              }),
            ])
          )
          .max(20)
          .optional()
          .describe("Ações reproduzidas nesta mesma página antes do fingerprint e da varredura"),
        compareToScanId: z
          .string()
          .optional()
          .describe("Scan anterior da sessão; devolve diff de fingerprint e findings após a nova varredura"),
        ...FindingPageInputShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "scan_page",
      async ({ url, selectors, checks, tokenChecks, components, actions, compareToScanId, detail, cursor, limit, maxChars }) => {
        const previousFindings = compareToScanId ? findingStore.getBatch(compareToScanId) : undefined;
        const previousLedger = compareToScanId ? findingStore.getBatchMetadata(compareToScanId) : undefined;
        if (compareToScanId && !previousFindings) {
          return json({ error: `compareToScanId '${compareToScanId}' não existe nesta sessão MCP.` });
        }
        const result = await scanPage(
          { url, selectors, checks, tokenChecks, components, actions },
          pageScanCache
        );
        const scanId = findingStore.putBatch("page", result.findings, {
          stateFingerprint: result.stateFingerprint,
          cacheHit: result.cacheHit,
          ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
          coverage: result.coverage,
        });
        const stateDiff = compareToScanId && previousFindings
          ? {
              previousScanId: compareToScanId,
              previousFingerprint: previousLedger?.stateFingerprint ?? null,
              currentFingerprint: result.stateFingerprint,
              stateChanged: previousLedger?.stateFingerprint !== result.stateFingerprint,
              findings: diffFindings(previousFindings, result.findings),
              elementsInspectedDelta:
                typeof (previousLedger?.coverage as { elementsInspected?: unknown } | undefined)?.elementsInspected === "number"
                  ? result.coverage.elementsInspected -
                    Number((previousLedger?.coverage as { elementsInspected: number }).elementsInspected)
                  : null,
            }
          : undefined;
        return json({
          url,
          scanId,
          stateFingerprint: result.stateFingerprint,
          cacheHit: result.cacheHit,
          ...(result.cacheMissReason ? { cacheMissReason: result.cacheMissReason } : {}),
          coverage: result.coverage,
          // Fora da pontuação, de propósito (D-27): o que o oráculo observa mas não afirma.
          observations: result.observations,
          summary: summarize(result.findings),
          deduplication: result.deduplication,
          ...(stateDiff ? { stateDiff } : {}),
          ...buildFindingPage(result.findings, { detail, cursor, limit, maxChars }),
        });
      }
    )
  );

  if (toolProfile === "full") server.registerTool(
    "check_token_compliance",
    {
      title: "Verificação determinística de tokens",
      description:
        "Compara cores, tipografia, raios e espaçamento computados com o registro de tokens. Retorna referências compactas por padrão; use get_finding_details para evidência ou objetos Finding completos.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS único (compatibilidade)"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Seletores CSS verificados no mesmo carregamento"),
        checks: z
          .array(z.enum(["color", "font", "radius", "spacing"]))
          .optional()
          .describe("Subconjunto de verificações (padrão: todas)"),
        ...FindingPageInputShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "check_token_compliance",
      async ({ url, selector, selectors, checks, detail, cursor, limit, maxChars }) => {
        const activeChecks = checks ?? ALL_TOKEN_CHECKS;
        const evidence = await inspectComputedStyles(
          url,
          selectorBatch(selector, selectors),
          tokenProperties(activeChecks)
        );
        const rawFindings = checkTokenCompliance({ url }, evidence.elements, getTokenRegistry(), activeChecks);
        const deduplication = deduplicateFindings(rawFindings);
        const findings = deduplication.findings;
        const scanId = findingStore.putBatch("tokens", findings);
        return json({
          url,
          scanId,
          elementsInspected: evidence.count,
          summary: summarize(findings),
          deduplication: {
            input: deduplication.inputCount,
            output: deduplication.outputCount,
            merged: deduplication.merged,
            key: deduplication.key,
          },
          ...buildFindingPage(findings, { detail, cursor, limit, maxChars }),
        });
      }
    )
  );

  if (toolProfile === "full") server.registerTool(
    "check_component_structure",
    {
      title: "Verificação determinística de estrutura",
      description:
        "Compara elementos br-* com tags, variantes e requisitos de nome acessível da especificação canônica. Retorna referências compactas por padrão; detalhe completo é recuperado por id.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        component: z
          .string()
          .optional()
          .describe("Componente específico (ex.: 'button'). Omitir para validar todos os br-* presentes."),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Seletores CSS verificados no mesmo carregamento"),
        ...FindingPageInputShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "check_component_structure",
      async ({ url, component, selectors, detail, cursor, limit, maxChars }) => {
        const specs = getComponentSpecs().components;
        const targets = component ? [component] : Object.keys(specs);
        const selector = selectors ?? (component ? `.br-${component}` : "[class*='br-']");
        const evidence = await inspectComputedStyles(url, selector, []);

        const rawFindings = targets.flatMap((name) => {
          const spec = specs[name];
          if (!spec) return [];
          return checkComponentStructure({ url }, evidence.elements, spec);
        });
        // Canal separado, fora da pontuação (D-27): o que se observa mas não se pode afirmar.
        const observations = targets.flatMap((name) => {
          const spec = specs[name];
          if (!spec) return [];
          return collectStructureObservations({ url }, evidence.elements, spec);
        });

        const deduplication = deduplicateFindings(rawFindings);
        const findings = deduplication.findings;
        const componentsFound = [
          ...new Set(
            evidence.elements.flatMap((el) => el.classes.filter((c) => /^br-[a-z]+$/.test(c)).map((c) => c.slice(3)))
          ),
        ];

        const scanId = findingStore.putBatch("structure", findings);
        return json({
          url,
          scanId,
          componentsFound,
          elementsInspected: evidence.count,
          observations,
          summary: summarize(findings),
          deduplication: {
            input: deduplication.inputCount,
            output: deduplication.outputCount,
            merged: deduplication.merged,
            key: deduplication.key,
          },
          ...buildFindingPage(findings, { detail, cursor, limit, maxChars }),
        });
      }
    )
  );

  if (toolProfile === "full") server.registerTool(
    "run_axe_scan",
    {
      title: "Varredura axe-core",
      description:
        "Executa axe-core e cruza regras compatíveis com o e-MAG 3.1. Retorna referências compactas por padrão e preserva Findings completos para recuperação por id.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS único (compatibilidade)"),
        selectors: z.array(z.string()).min(1).max(50).optional().describe("Subtrees avaliadas na mesma varredura"),
        ...FindingPageInputShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(
      telemetry,
      "run_axe_scan",
      async ({ url, selector, selectors, detail, cursor, limit, maxChars }) => {
        const result = await runAxeScan(url, selectorBatch(selector, selectors)?.toString());
        const deduplication = deduplicateFindings(result.findings);
        const findings = deduplication.findings;
        const scanId = findingStore.putBatch("axe", findings);
        return json({
          url,
          scanId,
          engine: result.engine,
          passes: result.passeCount,
          incomplete: result.incompleteCount,
          summary: summarize(findings),
          deduplication: {
            input: deduplication.inputCount,
            output: deduplication.outputCount,
            merged: deduplication.merged,
            key: deduplication.key,
          },
          ...buildFindingPage(findings, { detail, cursor, limit, maxChars }),
        });
      }
    )
  );

  if (hasDeterministic) server.registerTool(
    "get_finding_details",
    {
      title: "Detalhes de findings já produzidos",
      description:
        "Recupera candidatos por ids ou continua uma página pelo scanId, sem executar novamente o scanner. Use full somente quando o objeto Finding completo for indispensável.",
      inputSchema: {
        ids: z.array(z.string()).min(1).max(50).optional().describe("Finding ids retornados nesta sessão MCP"),
        scanId: z.string().optional().describe("Id do lote retornado por um scanner; use com cursor para continuar sem repetir a varredura"),
        detail: FindingDetailSchema.optional().describe("summary, evidence (padrão para ids) ou full"),
        cursor: FindingPageInputShape.cursor,
        limit: FindingPageInputShape.limit,
        maxChars: FindingPageInputShape.maxChars,
      },
      annotations: { readOnlyHint: true },
    },
    instrumentTool(
      telemetry,
      "get_finding_details",
      async ({ ids, scanId, detail, cursor, limit, maxChars }) => {
        if ((!ids && !scanId) || (ids && scanId)) {
          return json({ error: "Informe exatamente um de ids ou scanId." });
        }
        const batch = scanId ? findingStore.getBatch(scanId) : undefined;
        const ledger = scanId ? findingStore.getBatchMetadata(scanId) : undefined;
        if (scanId && !batch) return json({ error: `scanId '${scanId}' não existe nesta sessão MCP.` });
        const { found, missing } = ids ? findingStore.get(ids) : { found: batch ?? [], missing: [] };
        return json({
          requested: ids?.length ?? found.length,
          ...(scanId ? { scanId } : {}),
          ...(ledger ? { ledger } : {}),
          missing,
          ...buildFindingPage(found, { detail: detail ?? (scanId ? "summary" : "evidence"), cursor, limit, maxChars }),
        });
      }
    )
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Verification gate (C3) and report (D2–D4)
  // ══════════════════════════════════════════════════════════════════════════

  if (hasCombinedGate) server.registerTool(
    "verify_finding",
    {
      title: "Portão de verificação anti-alucinação",
      description:
        "Confere se a regra e a evidência de um Finding heurístico são sustentáveis. Use live somente quando precisar reabrir a página.",
      inputSchema: {
        finding: FindingSchema.describe("O achado candidato, no esquema Finding"),
        live: z.boolean().optional().describe("Re-inspecionar o elemento na página (padrão: false)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    instrumentTool(telemetry, "verify_finding", async ({ finding, live }) => {
      const verification = await verifyFinding({ finding, live: live ?? false });
      return json({ findingId: finding.id, verification });
    })
  );

  if (toolProfile === "full") server.registerTool(
    "save_report",
    {
      title: "Consolidar e persistir relatório",
      description:
        "Persiste o relatório validado. Reuse finding_ids dos scanners sem reenviar objetos completos; envie findings somente para achados criados pelo agente.",
      inputSchema: {
        url: z.string().describe("URL da página validada"),
        finding_ids: z
          .array(z.string())
          .max(500)
          .optional()
          .describe("Ids determinísticos guardados nesta sessão; evita recuperar e reenviar Findings completos"),
        findings: z
          .array(z.record(z.unknown()))
          .optional()
          .describe("Achados criados pelo agente no esquema Finding (explícitos/heurísticos)"),
        notes: z.string().optional().describe("Notas gerais da validação (contexto, limitações desta rodada)"),
      },
    },
    instrumentTool(telemetry, "save_report", async ({ url, finding_ids, findings, notes }) => {
      const stored = findingStore.get(finding_ids ?? []);
      if (stored.missing.length) {
        return json({
          error: "Alguns finding_ids não existem nesta sessão MCP; o relatório não foi salvo.",
          missingFindingIds: stored.missing,
        });
      }
      const { accepted, rejected } = validateFindings([...stored.found, ...(findings ?? [])]);
      const report = buildReport(url, accepted, notes);
      const persisted = persistReport(report, reportsDir);
      return json({
        summary: report.summary,
        accepted: accepted.length,
        rejected,
        jsonPath: persisted.jsonPath,
        markdownPath: persisted.markdownPath,
      });
    })
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Resources (A1) — the same knowledge, addressable by URI
  // ══════════════════════════════════════════════════════════════════════════

  if (hasNorms) server.registerResource(
    "knowledge-conflicts",
    "govbr://knowledge/conflicts",
    {
      title: "Contradições e defeitos observados (D-10)",
      description:
        "Conflitos do knowledge base: 6 anomalias de acessibilidade nos exemplos canônicos do próprio @govbr-ds/core (4 img sem alt, 2 aria-labelledby quebrados), arquivos no CDN legado e erros factuais da documentação. A implementação oficial é evidência, não oráculo.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(getKnowledgeConflicts(), null, 2) }],
    })
  );

  if (hasDeterministic || hasCombinedGate) server.registerResource(
    "finding-schema",
    "govbr://schema/finding",
    {
      title: "Esquema Finding (D2)",
      description: "JSON Schema do formato de achado aceito por save_report e verify_finding",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(zodToJsonSchema(FindingSchema, "Finding"), null, 2) }],
    })
  );

  if (hasNorms) server.registerResource(
    "tokens",
    "govbr://tokens",
    {
      title: "Registro de tokens",
      description: "Tokens semânticos + índice reverso hex→token do @govbr-ds/core",
      mimeType: "application/json",
    },
    async (uri) => {
      const { meta, semantic, hexLookup } = getTokenRegistry();
      return { contents: [{ uri: uri.href, text: JSON.stringify({ meta, semantic, hexLookup }, null, 2) }] };
    }
  );

  if (hasNorms) server.registerResource(
    "emag-section",
    new ResourceTemplate("govbr://emag/{section}", {
      list: async () => ({
        resources: Object.entries(getEmag().sections).map(([n, s]) => ({
          uri: `govbr://emag/${n}`,
          name: `e-MAG seção ${n} — ${s.title}`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "e-MAG 3.1 por seção",
      description: "Recomendações do e-MAG 3.1 por seção (1–6)",
      mimeType: "application/json",
    },
    async (uri, { section }) => {
      const data = getEmag().sections[String(section)];
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(data ?? { error: `Seção ${section} não encontrada` }, null, 2) }],
      };
    }
  );

  if (hasNorms) server.registerResource(
    "component-spec",
    new ResourceTemplate("govbr://components/{name}", {
      list: async () => ({
        resources: Object.keys(getComponentSpecs().components).map((name) => ({
          uri: `govbr://components/${name}`,
          name: `Especificação: ${name}`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Especificações de componentes",
      description: "Especificação canônica por componente do gov.br DS",
      mimeType: "application/json",
    },
    async (uri, { name }) => {
      const spec = getComponentSpecs().components[String(name)];
      const payload = spec
        ? { ...spec, warnings: getComponentDefects(String(name)) }
        : { error: `Componente ${name} não encontrado` };
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Prompt (A6) — the standardized validation procedure
  // ══════════════════════════════════════════════════════════════════════════

  if (hasCombinedGate) server.registerPrompt(
    "validate_page",
    {
      title: "Procedimento padronizado de validação",
      description:
        "Procedimento completo de validação de uma página contra o gov.br DS + e-MAG 3.1: coleta determinística, julgamento semântico com via dupla (explícita/heurística com portão de verificação), limite de iterações e relatório no esquema Finding. Somente procedimento — o conhecimento de domínio vem das ferramentas.",
      argsSchema: {
        url: z.string().describe("URL da página a validar"),
        scope: z.string().optional().describe("Componentes a focar, separados por vírgula (ex.: 'button,input')"),
        max_iterations: z.string().optional().describe("Máximo de iterações adicionais (padrão: 2)"),
      },
    },
    ({ url, scope, max_iterations }) => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: buildValidatePagePrompt({ url, scope, max_iterations }) },
        },
      ],
    })
  );

  return server;
}
