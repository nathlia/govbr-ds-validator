/**
 * 3.0.0 (NAT-99) — contrato de resposta do oráculo `oraculo-resposta/1.0.0`
 * (planejamento/atual/contrato-resposta-oraculo-RASCUNHO-2026-10-28.md, §2–§4, §6, §7, §15).
 *
 * Um lugar só para: o identificador do contrato, as mensagens fixas (texto literal, uma vez por
 * resposta), o vocabulário de ações, a serialização compacta, o orçamento de caracteres, os erros
 * (`isError: true` + `errorCode` + próximo passo) e o cursor opaco.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

export const CONTRACT = "oraculo-resposta/1.0.0";

/** Teto da resposta inicial, medido sobre o texto devolvido (`content[0].text.length`), §7. */
export const RESPONSE_BUDGET = 8_000;

/** Mensagens fixas do §4 (texto literal). */
export const MESSAGES = {
  reading:
    "Candidatas a investigar, não veredito. Nenhum resultado afirma conformidade ou violação; a aplicabilidade é desconhecida até você medir as condições.",
  "listing-reading":
    "Listagem de catálogo, não busca: sem relevância. Ordem fixa: cláusulas de prosa que obrigam ou proíbem, depois as demais de prosa, depois linhas de tabela (propriedades da implementação); em cada faixa, a ordem da base. Títulos, não requisitos em contexto; leia a unidade por id antes de julgar.",
  "no-declared-condition":
    "A cláusula não declara condição nem exceção na base. Verifique se o fato observado é o que ela descreve.",
  "gap-no-clause":
    "A base não tem cláusula que sustente esta parte da consulta. Não cite id plausível: use uma referência WCAG/e-MAG que você justifique, ou rule: null.",
  "gap-unmatched":
    "Nenhuma unidade da base contém estes termos nem expansões registradas deles. Isto descreve a base, não a página.",
  "registry-only":
    "Identificadores do registro WCAG 2.2 (só número e nome, sem texto servido): existem, mas o oráculo não sustenta sua aplicação aqui.",
  /** §15.5: texto fixo de cada referência de registro em `gaps[].registryRefs`. */
  "registry-ref":
    "referência de registro, texto não servido pela base; não sustenta sozinha uma exigência específica",
  "relevance-floor":
    "Só voltaram as unidades com relação suficiente à consulta; a lista não é completada com resultados fracos.",
  "no-match-floor":
    "Nenhuma unidade alcançou o piso de relevância; resultados fracos não são devolvidos para preencher a lista.",
  ambiguous:
    "A consulta casa com unidades de vários componentes sem distinguir qual você observou. Escolha um componente ou descreva o estado (ambiguity.groups traz a chamada de cada grupo); os resultados seguem a ordem do ranking e misturam grupos.",
  continuation:
    "Há mais resultados. Peça a próxima página com cursor; os mesmos parâmetros, versão e ranking produzem a mesma ordem.",
  "listing-end": "Fim da listagem: todos os itens do filtro foram devolvidos.",
  "results-end":
    "Fim dos resultados: a posição pedida está além da última unidade desta consulta. Nada foi omitido; refaça sem offset/cursor para a primeira página.",
  "page-end": "Fim: todos os itens desta resposta foram devolvidos.",
  "stale-cursor": "Cursor de outra consulta, versão da base ou ranking. Refaça a consulta inicial sem cursor.",
  "text-deferred": "O texto desta unidade não coube na resposta. Nada foi resumido: o restante vem por id, cláusula a cláusula.",
  implementation: "Comportamento da implementação @govbr-ds/core, não obrigação normativa.",
  "scan-coverage":
    "Mediu apenas os checks em executed, neste estado e escopo. Não é inventário do que existe na tela; zero achados de um check não executado não é ausência de defeito.",
  "scan-no-repeat":
    "Não repita este scan no mesmo estado com os mesmos checks: o resultado é o mesmo (cache exato). Para o que faltou, use checksRun.completeOmitted.",
  "fact-not-contradicted": "O fato medido não foi desmentido; o oráculo não tem como decidir a violação aqui.",
  "fact-contradicted": "O predicado mediu o contrário do alegado neste estado: a afirmação está desmentida.",
  "fact-verified": "O predicado recalculou a violação em cada elemento do localizador, no estado do scan citado.",
  "norm-resolved":
    "Norma resolvida pelo servidor a partir do check (rule.checker); a citação é rule.id. O implements do payload não é necessário e, se divergir, é ignorado.",
  "offset-deprecated":
    "offset está obsoleto desde a 3.0.0 e deixa de ser aceito na 4.0.0: continue pelo cursor devolvido em page.cursor. Com cursor, offset é ignorado.",
  "gap-unmatched-context":
    "Nenhuma candidata deste contexto (componentes observados e regras globais) contém estes termos nem expansões registradas deles. Isto descreve a base, não a página.",
  /** 3.4.0 (A5): a 1ª página só traz permissão ou regra de outro componente. */
  "gap-only-permission":
    "Só há permissão ou regra de outro componente nesta resposta; nenhuma regra deste caso foi encontrada. Uma permissão (ou a regra de outro componente) não autoriza nem proíbe o caso observado.",
  /** 3.4.0 (A12): bloco related, da camada kb-relations. */
  "kb-relation":
    "Ligação curada (camada kb-relations, não texto da base): cada item cita as cláusulas da base que sustentam a ligação. É leitura sugerida: não diz que a regra se aplica; leia-a por id antes de citar.",
  /** 3.4.0 (A4): passos de next escolhidos por padrão da consulta. */
  routing:
    "Passos sugeridos por padrão fixo da consulta (cor em hex/rgb, atributo/papel/tag, posição): dizem qual chamada mede melhor; não afirmam norma nem aplicabilidade.",
  /** 3.4.0 (A7): termo casado só por aproximação. */
  approximate:
    "Termo sem correspondência na base, casado pela palavra indexada mais próxima (distância de edição); confira se é o que você quis dizer.",
  "table-row":
    "Linha de tabela da documentação (API ou anatomia): descreve a implementação do componente; leia a unidade por id antes de tratá-la como obrigação de comportamento.",
  /** 3.7.3 (D-167): unidade de especificação (emenda-2 da base). */
  specification:
    "Unidade de especificação (tabela de Especificações ou frase descritiva da página do componente, texto literal): diz o valor ou o comportamento que o DS especifica para a parte do componente; candidata a investigar, não obrigação nem proibição. Meça a parte e compare; para afirmar violação, cite a norma que obriga.",
} as const;

export type MessageCode = keyof typeof MESSAGES;

/** `fact-not-evaluated` (§4) tem uma parte variável: sobre o que é o veredito. */
export function factNotEvaluated(about: "citação" | "aplicabilidade" | "reprodução do estado" | "evidência"): string {
  return `Este veredito é sobre a ${about}, não sobre o fato medido: o fato não foi avaliado nem desmentido.`;
}

/** about:"none" (predicado existe, mas não rodou): não há veredito sobre nada, só um passo pendente. */
export const PREDICATE_NOT_RUN =
  "O predicado deste achado existe, mas não rodou (sem live): nenhum veredito sobre a citação nem sobre o fato; o fato não foi avaliado nem desmentido.";

/** Vocabulário de ações (§3) com rótulo fixo. */
export const ACTION_LABELS = {
  "correct-citation": "corrigir citação",
  "request-detail": "pedir detalhe",
  "reproduce-state": "reproduzir estado",
  "measure-condition": "medir condição",
  "keep-uncertain": "manter observação incerta",
  // 3.3.0 (N-06, N-07, S-01): passos que corrigem a entrada em vez de remedir.
  "fix-evidence-data": "corrigir dados da evidência",
  "fix-locator": "corrigir localizador",
  "fix-input": "corrigir entrada",
  retry: "repetir",
} as const;
export type ActionCode = keyof typeof ACTION_LABELS;

export interface NextStep {
  action: ActionCode;
  label: string;
  what: string;
  tool: string | null;
  arguments?: Record<string, unknown>;
  [extra: string]: unknown;
}

/** Item de `next`/`actions`: `tool:null` = passo fora do oráculo; `arguments` nunca leva marcador. */
export function step(
  action: ActionCode,
  what: string,
  tool: string | null = null,
  args?: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): NextStep {
  return { action, label: ACTION_LABELS[action], what, tool, ...(args ? { arguments: args } : {}), ...extra };
}

/** Serialização compacta (§7.1, §15.1). */
export function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export const textSize = (data: unknown) => JSON.stringify(data).length;

/** Códigos de erro (§6) e os acrescentados pela 3.0.0 para os erros que já existiam. */
export type ErrorCode =
  | "invalid-combination"
  | "empty-context"
  | "unknown-component"
  | "unknown-id"
  | "unknown-section"
  | "unknown-category"
  | "unknown-example"
  | "stale-cursor"
  | "unknown-scan"
  | "unknown-family"
  | "scan-page-mismatch"
  // 3.6.3: verify_finding com evidência de rotas/estados diferentes (um achado por rota/estado).
  | "mixed-states"
  | "not-a-page-scan"
  | "query-too-long"
  | "no-content-terms"
  | "too-many-ids"
  | "missing-finding-ids"
  | "invalid-argument"
  | "unknown-parameter"
  // 3.3.0 (S-01, S-08, N-07, N-08, S-07): navegador, prazo e relatório no formato do contrato.
  | "invalid-url"
  | "unsupported-scheme"
  | "origin-not-allowed"
  | "navigation-timeout"
  | "network-error"
  | "tool-timeout"
  | "aborted"
  | "page-error"
  | "internal-error"
  | "report-page-mismatch";

export interface ContractError {
  error: string;
  errorCode: ErrorCode;
  field?: string;
  next: NextStep[];
  [extra: string]: unknown;
}

/** 3.3.0 (NAT-109, N-01): teto de um valor da entrada ecoado numa resposta. */
export const ECHO_MAX = 120;

/** Valor ecoado com teto: acima de `max`, o começo + "…(truncado, N caracteres)". */
export function clip(value: string, max = ECHO_MAX): string {
  return value.length <= max ? value : `${value.slice(0, max)}…(truncado, ${value.length} caracteres)`;
}

/** Cópia com cada string ≤ `max` e cada lista ≤ `items` (o resto contado). Só para respostas de erro. */
export function clipDeep(value: unknown, max: number, items: number): unknown {
  if (typeof value === "string") return clip(value, max);
  if (Array.isArray(value)) {
    const head = value.slice(0, items).map((v) => clipDeep(v, max, items));
    return value.length > items ? [...head, `…(+${value.length - items} itens omitidos)`] : head;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[clip(k, max)] = clipDeep(v, max, items);
    return out;
  }
  return value;
}

/**
 * Erro de aplicação: `isError: true` (B-08: antes, ~70 erros saíam como sucesso), `kind:"error"`,
 * `error` continua string (compatível com a 2.16.1) e sempre ≥ 1 próximo passo exato.
 */
export function fail(error: ContractError) {
  const { error: message, errorCode, field, next, ...extra } = error;
  let payload: Record<string, unknown> = { contract: CONTRACT, kind: "error", error: message, errorCode, ...(field ? { field } : {}), ...extra, next };
  // 3.3.0 (N-01): o eco da entrada também cabe no orçamento. Rede de segurança depois dos clip() de cada
  // mensagem: strings ≤ 2.000 e listas ≤ 20; se ainda passar do teto, strings ≤ ECHO_MAX e listas ≤ 10.
  payload = clipDeep(payload, 2_000, 20) as Record<string, unknown>;
  if (textSize(payload) > RESPONSE_BUDGET) payload = clipDeep(payload, ECHO_MAX, 10) as Record<string, unknown>;
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

// ── Cursor opaco ────────────────────────────────────────────────────────────────────────────

/**
 * `c1.<posição>.<hash>`: o hash cobre ferramenta, modo, parâmetros que definem a ordem (sem
 * cursor/offset/limit), versão da base e do ranking. Outro hash = `stale-cursor`.
 */
export function cursorKey(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10);
}

export function encodeCursor(position: number, key: string): string {
  return `c1.${position}.${key}`;
}

/** Posição do cursor, ou null se ele é de outra consulta/versão (ou malformado). */
export function decodeCursor(cursor: string, key: string): number | null {
  const match = /^c1\.(\d{1,7})\.([0-9a-f]{10})$/.exec(cursor);
  if (!match || match[2] !== key) return null;
  return Number(match[1]);
}

export function staleCursorError(tool: string, initialArgs: Record<string, unknown>) {
  return fail({
    error: MESSAGES["stale-cursor"],
    errorCode: "stale-cursor",
    field: "cursor",
    next: [step("request-detail", "refazer a consulta inicial, sem cursor", tool, initialArgs)],
  });
}

// ── Entrada estrita (B-01) ──────────────────────────────────────────────────────────────────

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

/** Nome aceito mais próximo de um campo desconhecido (grafia, caixa, snake/camel, prefixo). */
export function nearestField(unknown: string, accepted: string[]): string | null {
  const u = squash(unknown);
  if (!u) return null;
  let best: { name: string; d: number } | null = null;
  for (const name of accepted) {
    const n = squash(name);
    const d = n === u ? 0 : n.startsWith(u) || u.startsWith(n) ? 1 : distance(u, n);
    if (!best || d < best.d) best = { name, d };
  }
  return best && best.d <= Math.max(2, Math.floor(u.length / 3)) ? best.name : null;
}

/** 3.3.0 (N-01): quantas chaves desconhecidas uma mensagem lista (o resto é contado). */
export const UNKNOWN_KEYS_LISTED = 5;

export function unknownFieldsMessage(tool: string, keys: string[], accepted: string[]): string {
  const parts = keys.slice(0, UNKNOWN_KEYS_LISTED).map((key) => {
    const near = nearestField(key, accepted);
    return near ? `'${clip(key, 60)}' (você quis dizer '${near}'?)` : `'${clip(key, 60)}'`;
  });
  const more = keys.length > UNKNOWN_KEYS_LISTED ? ` e mais ${keys.length - UNKNOWN_KEYS_LISTED}` : "";
  return `campo desconhecido em ${tool}: ${parts.join(", ")}${more}. Nada foi executado; corrija o nome e repita. Campos aceitos: ${accepted.join(", ")}.`;
}

/**
 * Esquema de entrada estrito: campo desconhecido é erro com o nome mais próximo, não descarte
 * silencioso (B-01: `componente` ampliava a busca para todos os componentes sem aviso). O JSON Schema
 * publicado no tools/list já dizia `additionalProperties:false`; agora o servidor cumpre.
 */
export function strictInput<T extends z.ZodRawShape>(tool: string, shape: T) {
  const accepted = Object.keys(shape);
  const deep = Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, deepStrict(v as z.ZodTypeAny, `${tool}.${k}`)])) as T;
  return z
    .object(deep, {
      errorMap: (issue, ctx) =>
        issue.code === "unrecognized_keys" && issue.path.length === 0
          ? { message: unknownFieldsMessage(tool, issue.keys, accepted) }
          : { message: ctx.defaultError },
    })
    .strict();
}

/**
 * 3.1.0: entrada recusada no formato de erro do contrato (antes: texto -32602 do SDK, sem errorCode nem
 * próximo passo). Campo desconhecido → `unknown-parameter` com o nome mais próximo e a chamada corrigida
 * em `next`; valor inválido → `invalid-argument` com o campo. Nada é executado.
 */
export function inputFailure(tool: string, args: unknown, error: z.ZodError, accepted: string[]) {
  const issue = error.issues.find((i) => i.code === "unrecognized_keys") ?? error.issues[0];
  const given = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  if (issue?.code === "unrecognized_keys") {
    const top = issue.path.length === 0;
    const field = clip([...issue.path.map(String), issue.keys[0]].join("."), 60);
    // 3.3.0 (N-11): Map, não objeto — "constructor"/"toString" não podem achar membros do protótipo.
    const near = new Map<string, string>();
    if (top) for (const k of issue.keys.slice(0, UNKNOWN_KEYS_LISTED)) {
      const n = nearestField(k, accepted);
      if (n) near.set(k, n);
    }
    const fixable = top && issue.keys.length <= UNKNOWN_KEYS_LISTED && issue.keys.every((k) => near.has(k) && !Object.hasOwn(given, near.get(k)!));
    const corrected = fixable
      ? Object.fromEntries(Object.entries(given).map(([k, v]) => [near.get(k) ?? k, v]))
      : null;
    const didYouMean = Object.fromEntries([...near].map(([k, n]) => [clip(k, 60), n]));
    return fail({
      error: issue.message,
      errorCode: "unknown-parameter",
      field,
      ...(Object.keys(didYouMean).length ? { didYouMean } : {}),
      ...(top ? { accepted } : {}),
      next: [
        corrected
          ? step("request-detail", "repetir com o nome corrigido", tool, corrected)
          : step("request-detail", `repetir sem o campo desconhecido '${field}' (inputSchema no tools/list)`, tool),
      ],
    });
  }
  const field = issue ? issue.path.map(String).join(".") : "";
  return fail({
    error: `entrada inválida em ${tool}${field ? ` (${field})` : ""}: ${issue?.message ?? "argumentos não conferem com o inputSchema"}. Nada foi executado; corrija e repita.`,
    errorCode: "invalid-argument",
    ...(field ? { field } : {}),
    next: [step("request-detail", `corrigir ${field || "os argumentos"} conforme o inputSchema do tools/list e repetir`, tool)],
  });
}

/**
 * Revisão da 3.0.0 (B-01 aninhado): objetos aninhados também recusam campo desconhecido, com o nome
 * mais próximo (`verify_finding{finding:{…, bogus:1}}` era aceito em silêncio). Registros (`z.record`)
 * continuam abertos de propósito (ex.: evidence.data). O JSON Schema publicado não muda.
 */
export function deepStrict(schema: z.ZodTypeAny, label: string): z.ZodTypeAny {
  const def = schema._def as Record<string, any>;
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as z.ZodRawShape;
    const accepted = Object.keys(shape);
    const walked = Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, deepStrict(v as z.ZodTypeAny, `${label}.${k}`)]));
    return new z.ZodObject({
      ...(def as z.ZodObjectDef),
      shape: () => walked,
      unknownKeys: "strict",
      errorMap: (issue, ctx) =>
        issue.code === "unrecognized_keys" ? { message: unknownFieldsMessage(label, issue.keys, accepted) } : { message: ctx.defaultError },
    });
  }
  if (schema instanceof z.ZodOptional) return new z.ZodOptional({ ...(def as z.ZodOptionalDef), innerType: deepStrict(def.innerType, label) });
  if (schema instanceof z.ZodNullable) return new z.ZodNullable({ ...(def as z.ZodNullableDef), innerType: deepStrict(def.innerType, label) });
  if (schema instanceof z.ZodDefault) return new z.ZodDefault({ ...(def as z.ZodDefaultDef), innerType: deepStrict(def.innerType, label) });
  if (schema instanceof z.ZodArray) return new z.ZodArray({ ...(def as z.ZodArrayDef), type: deepStrict(def.type, `${label}[]`) });
  if (schema instanceof z.ZodEffects) return new z.ZodEffects({ ...(def as z.ZodEffectsDef), schema: deepStrict(def.schema, label) });
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const options = (schema.options as z.ZodTypeAny[]).map((o) => deepStrict(o, label));
    const rebuilt = z.discriminatedUnion(def.discriminator, options as unknown as [z.ZodDiscriminatedUnionOption<string>, ...z.ZodDiscriminatedUnionOption<string>[]]);
    return def.description ? rebuilt.describe(def.description) : rebuilt;
  }
  return schema;
}

/**
 * Página genérica dentro do orçamento (3.0.0, revisão): itens em ordem a partir de `start`, o primeiro
 * sempre entra, os demais enquanto a resposta inteira (montada por `compose`) couber em `budget`.
 */
export function budgetPage<T>(
  items: T[],
  start: number,
  compose: (page: T[], nextPosition: number | null) => Record<string, unknown>,
  budget = RESPONSE_BUDGET,
): Record<string, unknown> {
  const page: T[] = [];
  let index = Math.min(start, items.length);
  while (index < items.length) {
    const trial = compose([...page, items[index]], index + 1 < items.length ? index + 1 : null);
    if (page.length > 0 && textSize(trial) > budget) break;
    page.push(items[index]);
    index += 1;
  }
  return compose(page, index < items.length ? index : null);
}

const INVALID_INPUT = Symbol("invalid-input");

/**
 * 3.1.0: the SDK keeps validating against the published (strict) schema — tools/list is unchanged —
 * but a rejected input comes back as the contract error (`inputFailure`) instead of the SDK's plain
 * -32602 text. Hooks the McpServer's input validation and handler dispatch (SDK 1.29.x, pinned by
 * the lockfile; test/integration/input-contract.test.ts fails if an SDK upgrade changes them).
 */
/**
 * 3.6.3: quem quer saber de toda recusa de entrada (a telemetria): ferramenta, argumentos, a resposta de erro devolvida
 * e o código. Chamado uma vez por chamada recusada, nunca para uma chamada que chega ao handler.
 */
export type InputRejectionListener = (tool: string, args: unknown, result: unknown, errorCode: string) => void;

const errorCodeOf = (result: unknown): string => {
  try {
    const text = (result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "";
    return String((JSON.parse(text) as { errorCode?: unknown }).errorCode ?? "invalid-input");
  } catch {
    return "invalid-input";
  }
};

export function installContractInputValidation(server: object, onRejected?: InputRejectionListener): void {
  type Tool = { inputSchema?: unknown };
  const sdk = server as {
    validateToolInput?: (tool: Tool, args: unknown, name: string) => Promise<unknown>;
    executeToolHandler?: (tool: Tool, args: unknown, extra: unknown) => Promise<unknown>;
  };
  if (typeof sdk.validateToolInput !== "function" || typeof sdk.executeToolHandler !== "function") {
    throw new Error("installContractInputValidation: McpServer internals changed; update the input-contract hook");
  }
  const execute = sdk.executeToolHandler.bind(server);
  sdk.validateToolInput = async (tool, args, name) => {
    const raw = tool.inputSchema;
    if (!raw) return undefined;
    const schema = raw instanceof z.ZodType ? raw : z.object(raw as z.ZodRawShape);
    const parsed = await schema.safeParseAsync(args ?? {});
    if (parsed.success) return parsed.data;
    const accepted = schema instanceof z.ZodObject ? Object.keys(schema.shape as object) : [];
    return { [INVALID_INPUT]: { name, args, result: inputFailure(name, args, parsed.error, accepted) } };
  };
  sdk.executeToolHandler = async (tool, args, extra) => {
    if (!(args && typeof args === "object" && INVALID_INPUT in args)) return execute(tool, args, extra);
    const rejected = (args as Record<symbol, { name: string; args: unknown; result: unknown }>)[INVALID_INPUT];
    onRejected?.(rejected.name, rejected.args, rejected.result, errorCodeOf(rejected.result));
    return rejected.result;
  };
  installPrototypeKeyGuard(server, onRejected);
}

/**
 * 3.3.0 (N-11): um argumento com a chave própria "constructor" não passa nem do esquema de protocolo do
 * SDK (z.record recusa o objeto: -32603, fora do contrato). O guarda responde antes, no handler de
 * tools/call, com o mesmo `unknown-parameter` das outras chaves desconhecidas. Depende dos internos do
 * SDK 1.29.x (fixado), como o gancho acima; sem eles, não instala (o resto do contrato continua).
 */
function installPrototypeKeyGuard(server: object, onRejected?: InputRejectionListener): void {
  type Handler = (request: unknown, extra: unknown) => unknown;
  const inner = (server as { server?: { _requestHandlers?: Map<string, Handler> } }).server;
  const handlers = inner?._requestHandlers;
  if (!(handlers instanceof Map)) return;
  const registered = () => (server as { _registeredTools?: Record<string, { inputSchema?: unknown }> })._registeredTools ?? {};
  const guard = (handler: Handler): Handler => (request, extra) => {
    const params = (request as { params?: { name?: unknown; arguments?: unknown } } | undefined)?.params;
    const args = params?.arguments;
    if (args && typeof args === "object" && !Array.isArray(args) && Object.hasOwn(args, "constructor")) {
      const name = typeof params?.name === "string" ? params.name : "?";
      const tools = registered();
      const schema = Object.hasOwn(tools, name) ? tools[name].inputSchema : undefined;
      const accepted = schema instanceof z.ZodObject ? Object.keys(schema.shape as object) : [];
      const result = fail({
        error: unknownFieldsMessage(name, ["constructor"], accepted),
        errorCode: "unknown-parameter",
        field: "constructor",
        accepted,
        next: [step("request-detail", "repetir sem o campo desconhecido 'constructor' (inputSchema no tools/list)", name)],
      });
      onRejected?.(name, args, result, "unknown-parameter");
      return Promise.resolve(result);
    }
    // 3.6.3 (revisão LOW 3): argumentos que não são objeto (null, lista, texto) — o esquema de protocolo do SDK os recusa
    // adiante (-32602, sem resultado de ferramenta); a telemetria registra a recusa uma vez. Pela ponte do runner não
    // chegam (o tool_use do agente é sempre objeto), mas um cliente MCP qualquer pode mandá-los.
    if (args !== undefined && (args === null || typeof args !== "object" || Array.isArray(args))) {
      onRejected?.(typeof params?.name === "string" ? params.name : "?", args, undefined, "invalid-arguments");
      return handler(request, extra);
    }
    // 3.6.3: ferramenta que não existe neste perfil — o SDK recusa adiante (sem handler); a telemetria registra a recusa.
    if (typeof params?.name === "string" && !Object.hasOwn(registered(), params.name)) onRejected?.(params.name, args, undefined, "unknown-tool");
    return handler(request, extra);
  };
  const current = handlers.get("tools/call");
  if (current) handlers.set("tools/call", guard(current));
  const set = handlers.set.bind(handlers);
  handlers.set = (key: string, value: Handler) => set(key, key === "tools/call" ? guard(value) : value);
}
