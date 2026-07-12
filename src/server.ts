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
import { checkComponentStructure } from "./checkers/structure.js";
import { runAxeScan } from "./checkers/axe.js";
import { inspectComputedStyles } from "./evidence/inspect.js";
import { verifyFinding } from "./verify/gate.js";
import { validateFindings, buildReport, persistReport, summarize } from "./report/report.js";
import { buildValidatePagePrompt } from "./prompts/validatePage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORTS_DIR = join(__dirname, "../../reports");

export interface ServerOptions {
  reportsDir?: string;
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
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

  server.registerTool(
    "get_ds_rules",
    {
      title: "Regras atômicas do gov.br DS (knowledge base)",
      description:
        "Loja de regras autoritativa do oráculo (A1/D-11): 186 regras atômicas extraídas da documentação oficial do gov.br DS 3.7.0 + e-MAG 3.1, com id determinístico, força normativa, estratégia de validação e proveniência. Achados devem citar o id da regra (source 'govbr-ds-kb') — o verify_finding confere por igualdade exata. Listagens retornam apenas regras NORMATIVAS; fragmentos canônicos do @govbr-ds/core (force=example) são EVIDÊNCIA de implementação, servidos no campo separado 'evidence' (include_evidence=true) e NUNCA sobrepõem regras required/prohibited — a implementação oficial contém defeitos conhecidos (veja govbr://knowledge/conflicts).",
      inputSchema: {
        id: z.string().optional().describe("Id exato de regra (govbr-3.7.0-…) — retorna o registro completo"),
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
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, include_evidence, ...filter }) => {
      const kb = getKnowledgeBase();
      if (id) {
        const rule = getRuleById(id);
        if (!rule) return json({ error: `Regra '${id}' não encontrada no knowledge base.` });
        return json({
          kind: NORMATIVE_FORCES.includes(rule.force as RuleForce) ? "normative" : "evidence",
          rule,
        });
      }
      const rules = filterRules(filter);
      const response: Record<string, unknown> = {
        meta: { dsVersion: kb.meta.dsVersion, totalNormative: kb.meta.normativeRules },
        count: rules.length,
        rules: rules.map(projectRule),
      };
      if (include_evidence) {
        const evidence = getEvidence(filter.component);
        response.evidence = {
          note: "Fragmentos canônicos do @govbr-ds/core — evidência de implementação, NÃO normas. Não sobrepõem regras required/prohibited.",
          count: evidence.length,
          items: evidence.map(projectRule),
        };
      }
      return json(response);
    }
  );

  server.registerTool(
    "get_design_tokens",
    {
      title: "Design tokens do gov.br DS",
      description:
        "Registro de tokens do gov.br Design System (Padrão Digital de Governo) extraído do @govbr-ds/core instalado. Sem query: destaques semânticos + índice reverso hex→token. Com query: filtra tokens por fragmento de nome (ex.: 'blue', 'spacing', 'font-size').",
      inputSchema: {
        query: z.string().optional().describe("Fragmento de nome para filtrar (omitir para destaques semânticos + índice hex)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const registry = getTokenRegistry();
      if (!query) {
        return json({ meta: registry.meta, semantic: registry.semantic, hexLookup: registry.hexLookup });
      }
      const q = query.toLowerCase();
      const matches = Object.fromEntries(Object.entries(registry.all).filter(([k]) => k.toLowerCase().includes(q)));
      return json({ query, count: Object.keys(matches).length, tokens: matches });
    }
  );

  server.registerTool(
    "get_emag_rules",
    {
      title: "Regras e-MAG 3.1",
      description:
        "e-MAG 3.1 (Modelo de Acessibilidade em Governo Eletrônico) completo — padrão brasileiro obrigatório para portais gov.br, não coberto por ferramentas genéricas. Filtre por seção (1 Marcação, 2 Comportamento, 3 Conteúdo, 4 Apresentação, 5 Multimídia, 6 Formulário) ou por id de regra (ex.: '6.2').",
      inputSchema: {
        section: z.number().min(1).max(6).optional().describe("Seção 1–6"),
        id: z.string().optional().describe("Id de regra específica, ex.: '4.1'"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ section, id }) => {
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
      return json(emag);
    }
  );

  server.registerTool(
    "get_page_rules",
    {
      title: "Diretrizes de página do gov.br DS",
      description:
        "Diretrizes estruturais do gov.br DS extraídas da documentação oficial — anatomia de página, padrões de formulário e navegação, grid, boas práticas HTML/WAI-ARIA. Sem categoria: lista as categorias disponíveis.",
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
    async ({ category }) => {
      const pageRules = getPageRules();
      if (!category) {
        return json({
          meta: pageRules.meta,
          available: Object.entries(pageRules.categories).map(([key, { label, url }]) => ({ key, label, url })),
        });
      }
      return json(pageRules.categories[category] ?? { error: `Categoria '${category}' não encontrada.` });
    }
  );

  server.registerTool(
    "list_components",
    {
      title: "Componentes do gov.br DS",
      description: "Lista os componentes disponíveis no @govbr-ds/core instalado, com classe raiz e tags canônicas.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
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
    }
  );

  server.registerTool(
    "get_component_spec",
    {
      title: "Especificação canônica de componente",
      description:
        "Especificação estrutural canônica de um componente do gov.br DS, extraída dos exemplos oficiais do @govbr-ds/core: tags de elemento válidas, classes de variação documentadas, atributos ARIA usados, tokens consumidos pelo CSS do componente e fragmentos de exemplo oficiais.",
      inputSchema: {
        component: z.string().describe("Nome do componente, ex.: 'button', 'input', 'select'"),
        include_examples: z.boolean().optional().describe("Incluir fragmentos HTML canônicos (padrão: true, até 5)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ component, include_examples }) => {
      const specs = getComponentSpecs();
      const spec = specs.components[component];
      if (!spec) {
        return json({
          error: `Componente '${component}' não encontrado.`,
          available: Object.keys(specs.components),
        });
      }
      const includeExamples = include_examples ?? true;
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
        examples: includeExamples
          ? spec.examples.slice(0, 5)
          : spec.examples.map((e) => ({ name: e.name, html: "(omitido — use include_examples=true)" })),
        availableExamples: spec.examples.map((e) => e.name),
      });
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Evidence tool (C5 phase 1)
  // ══════════════════════════════════════════════════════════════════════════

  server.registerTool(
    "inspect_computed_styles",
    {
      title: "Inspecionar estilos computados",
      description:
        "Abre a página em navegador headless e retorna, por elemento: estilos computados (cores, tipografia, raios, espaçamentos), estilos no estado :focus, atributos ARIA e localizador CSS estável. É a evidência que o @playwright/mcp não expõe (ele dá a árvore de acessibilidade; isto dá o CSS computado). Fase de coleta — não julga nada.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS para restringir (padrão: elementos interativos + [class*='br-'])"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, selector }) => json(await inspectComputedStyles(url, selector))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Deterministic checkers (B1/B2) — findings come out in the D2 schema
  // ══════════════════════════════════════════════════════════════════════════

  server.registerTool(
    "check_token_compliance",
    {
      title: "Verificação determinística de tokens",
      description:
        "Camada sintática (sem LLM): compara os estilos computados da página com o registro de tokens do DS via índice reverso hex→token. Retorna achados no esquema Finding com sugestão de token mais próximo por distância RGB. Cores, família/escala tipográfica, raios de borda e escala de espaçamento.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Seletor CSS para restringir a verificação"),
        checks: z
          .array(z.enum(["color", "font", "radius", "spacing"]))
          .optional()
          .describe("Subconjunto de verificações (padrão: todas)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, selector, checks }) => {
      const evidence = await inspectComputedStyles(url, selector);
      const findings = checkTokenCompliance({ url }, evidence.elements, getTokenRegistry(), checks ?? ALL_TOKEN_CHECKS);
      return json({ url, elementsInspected: evidence.count, summary: summarize(findings), findings });
    }
  );

  server.registerTool(
    "check_component_structure",
    {
      title: "Verificação determinística de estrutura",
      description:
        "Camada sintática (sem LLM): compara elementos br-* da página com a especificação canônica extraída dos exemplos oficiais — tag do elemento raiz, classes de variação documentadas, nome acessível em elementos apenas-ícone. Retorna achados no esquema Finding.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        component: z
          .string()
          .optional()
          .describe("Componente específico (ex.: 'button'). Omitir para validar todos os br-* presentes."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, component }) => {
      const specs = getComponentSpecs().components;
      const targets = component ? [component] : Object.keys(specs);
      const selector = component ? `.br-${component}` : "[class*='br-']";
      const evidence = await inspectComputedStyles(url, selector);

      const findings = targets.flatMap((name) => {
        const spec = specs[name];
        if (!spec) return [];
        return checkComponentStructure({ url }, evidence.elements, spec);
      });

      const componentsFound = [
        ...new Set(
          evidence.elements.flatMap((el) => el.classes.filter((c) => /^br-[a-z]+$/.test(c)).map((c) => c.slice(3)))
        ),
      ];

      return json({ url, componentsFound, elementsInspected: evidence.count, summary: summarize(findings), findings });
    }
  );

  server.registerTool(
    "run_axe_scan",
    {
      title: "Varredura axe-core",
      description:
        "Camada determinística de acessibilidade: executa axe-core na página e devolve as violações já no esquema Finding, com referência cruzada para o e-MAG 3.1 quando o mapeamento WCAG coincide. Também é a linha de base (baseline) da avaliação.",
      inputSchema: {
        url: z.string().describe("URL da página"),
        selector: z.string().optional().describe("Restringir a um subtree (seletor CSS)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, selector }) => {
      const result = await runAxeScan(url, selector);
      return json({
        url,
        engine: result.engine,
        passes: result.passeCount,
        incomplete: result.incompleteCount,
        summary: summarize(result.findings),
        findings: result.findings,
      });
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Verification gate (C3) and report (D2–D4)
  // ══════════════════════════════════════════════════════════════════════════

  server.registerTool(
    "verify_finding",
    {
      title: "Portão de verificação anti-alucinação",
      description:
        "OBRIGATÓRIO para achados heurísticos (iniciativa do agente) antes de entrarem no relatório. Verifica: (1) a regra citada existe no oráculo; (2) alegações verificáveis batem com o registro de tokens; (3) opcionalmente re-inspeciona o elemento na página (live=true). Retorna verdict confirmed/rejected/unverifiable — inclua o objeto retornado no campo 'verification' do achado.",
      inputSchema: {
        finding: FindingSchema.describe("O achado candidato, no esquema Finding"),
        live: z.boolean().optional().describe("Re-inspecionar o elemento na página (padrão: false)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ finding, live }) => {
      const verification = await verifyFinding({ finding, live: live ?? false });
      return json({ findingId: finding.id, verification });
    }
  );

  server.registerTool(
    "save_report",
    {
      title: "Consolidar e persistir relatório",
      description:
        "Valida os achados contra o esquema Finding (erros por campo são devolvidos para correção — nada é descartado em silêncio), recusa achados heurísticos sem verificação confirmada, e persiste o relatório em JSON (máquina/CI) e Markdown (revisão humana), com trilhas de raciocínio por achado.",
      inputSchema: {
        url: z.string().describe("URL da página validada"),
        findings: z.array(z.record(z.unknown())).describe("Achados no esquema Finding (veja govbr://schema/finding)"),
        notes: z.string().optional().describe("Notas gerais da validação (contexto, limitações desta rodada)"),
      },
    },
    async ({ url, findings, notes }) => {
      const { accepted, rejected } = validateFindings(findings);
      const report = buildReport(url, accepted, notes);
      const persisted = persistReport(report, reportsDir);
      return json({
        summary: report.summary,
        accepted: accepted.length,
        rejected,
        jsonPath: persisted.jsonPath,
        markdownPath: persisted.markdownPath,
      });
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Resources (A1) — the same knowledge, addressable by URI
  // ══════════════════════════════════════════════════════════════════════════

  server.registerResource(
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

  server.registerResource(
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

  server.registerResource(
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

  server.registerResource(
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

  server.registerResource(
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

  server.registerPrompt(
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
