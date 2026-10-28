import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runWithCallContext } from "./evidence/browser.js";
import { thrownToContractError } from "./responses/errors.js";

export interface ToolTelemetryEvent {
  runId: string;
  tool: string;
  startedAt: string;
  durationMs: number;
  status: "ok" | "error";
  requestBytes: number;
  responseBytes: number;
  inputRecords?: number;
  outputRecords?: number;
  detail?: string;
  truncated?: boolean;
  cacheHit?: boolean;
  cacheMissReason?: string;
  stateFingerprint?: string;
  error?: string;
  /**
   * 2.14.0 (NAT-61): tentativas de carregar conhecimento sob a trava do perfil knowledge-free,
   * acumuladas no processo. Só existe nesse perfil; maior que zero = isolamento falho.
   */
  knowledgeLockAttempts?: number;
}

export interface ToolTelemetryOptions {
  runId?: string;
  file?: string;
  onEvent?: (event: ToolTelemetryEvent) => void;
  /** 2.14.0: contador da trava de conhecimento, anexado a cada evento (perfil knowledge-free). */
  knowledgeLockAttempts?: () => number;
}

type ToolResult = {
  content?: Array<{ type?: string; text?: string }>;
};

function byteLength(value: unknown): number {
  if (value === undefined) return 0;
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function textPayload(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as ToolResult).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n");
}

function recordCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  for (const key of ["findings", "families", "members", "rules", "components", "items", "elements"]) {
    if (Array.isArray(obj[key])) return obj[key].length;
  }
  for (const key of ["count", "elementsInspected", "total"]) {
    if (typeof obj[key] === "number") return obj[key] as number;
  }
  return undefined;
}

function inputRecordCount(args: unknown): number | undefined {
  if (!args || typeof args !== "object") return undefined;
  const obj = args as Record<string, unknown>;
  for (const key of ["ids", "selectors", "rules", "findings", "checks"]) {
    if (Array.isArray(obj[key])) return obj[key].length;
  }
  return undefined;
}

function compactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 300);
}

export class ToolTelemetry {
  private readonly runId: string;
  private readonly file?: string;
  private readonly onEvent?: (event: ToolTelemetryEvent) => void;
  private readonly lockAttempts?: () => number;

  constructor(options: ToolTelemetryOptions = {}) {
    this.runId = options.runId ?? process.env.GOVBR_VALIDATOR_RUN_ID ?? "unscoped";
    this.file = options.file ?? process.env.GOVBR_VALIDATOR_TELEMETRY_FILE;
    this.onEvent = options.onEvent;
    this.lockAttempts = options.knowledgeLockAttempts;
    if (this.file) mkdirSync(dirname(this.file), { recursive: true });
  }

  async measure<TArgs, TResult>(
    tool: string,
    args: TArgs,
    invoke: () => Promise<TResult>
  ): Promise<TResult> {
    const startedAt = new Date();
    const base = {
      runId: this.runId,
      tool,
      startedAt: startedAt.toISOString(),
      requestBytes: byteLength(args),
      inputRecords: inputRecordCount(args),
      detail:
        args && typeof args === "object" && typeof (args as Record<string, unknown>).detail === "string"
          ? String((args as Record<string, unknown>).detail)
          : undefined,
    };

    try {
      const result = await invoke();
      const text = textPayload(result);
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        parsed = undefined;
      }
      this.emit({
        ...base,
        durationMs: Date.now() - startedAt.getTime(),
        status: "ok",
        responseBytes: byteLength(text),
        outputRecords: recordCount(parsed),
        truncated:
          parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).truncated === "boolean"
            ? Boolean((parsed as Record<string, unknown>).truncated)
            : undefined,
        cacheHit:
          parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).cacheHit === "boolean"
            ? Boolean((parsed as Record<string, unknown>).cacheHit)
            : undefined,
        cacheMissReason:
          parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).cacheMissReason === "string"
            ? String((parsed as Record<string, unknown>).cacheMissReason)
            : undefined,
        stateFingerprint:
          parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).stateFingerprint === "string"
            ? String((parsed as Record<string, unknown>).stateFingerprint)
            : undefined,
      });
      return result;
    } catch (error) {
      this.emit({
        ...base,
        durationMs: Date.now() - startedAt.getTime(),
        status: "error",
        responseBytes: 0,
        error: compactError(error),
      });
      throw error;
    }
  }

  private emit(event: ToolTelemetryEvent): void {
    if (this.lockAttempts) event = { ...event, knowledgeLockAttempts: this.lockAttempts() };
    this.onEvent?.(event);
    if (this.file) appendFileSync(this.file, `${JSON.stringify(event)}\n`, "utf8");
  }
}

/**
 * 3.3.0 (S-01, N-07): a chamada roda no contexto do pedido MCP (AbortSignal do cliente + prazo, lidos
 * por withPage), e uma exceção que escapa vira erro do contrato (errorCode, mensagem limpa, next) em vez
 * do texto cru do SDK. A telemetria continua registrando o erro.
 */
export function instrumentTool<TArgs, TResult>(
  telemetry: ToolTelemetry,
  name: string,
  handler: (args: TArgs) => Promise<TResult>
): (args: TArgs, extra?: { signal?: AbortSignal }) => Promise<TResult> {
  return (args, extra) =>
    runWithCallContext(name, extra?.signal, () => telemetry.measure(name, args, () => handler(args))).catch(
      (error) => thrownToContractError(error, name) as unknown as TResult,
    );
}
