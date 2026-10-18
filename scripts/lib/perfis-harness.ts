/**
 * Harness comum do inventário sem conhecimento e da prova de invariância (2.14.0, NAT-61).
 *
 * Sobe as páginas de desenvolvimento e as telas congeladas, conecta um cliente MCP em memória a um
 * `createServer` carregado de qualquer build (a desta árvore ou a de outra versão, por caminho) e
 * roda uma sequência fixa de chamadas por página. Nenhum modelo; nada é gravado no servidor.
 *
 * Páginas:
 *   - controles de desenvolvimento: `govbr-corpus/public/controles/a/` (lista do manifesto da ala).
 *     A ala `b/` (reserva) NUNCA é servida: o servidor estático só responde sob `/controles/a/` e
 *     `/controles/recursos/`, e recusa qualquer outro caminho (D-126).
 *   - telas congeladas A e B: `govbr-telas/server.mjs` (o mesmo site congelado das coletas).
 */
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".json": "application/json",
};

export interface Pages {
  controls: string[];
  screens: { a: string; b: string };
  close(): Promise<void>;
}

/** Servidor estático só de `controles/a/` e `controles/recursos/`. Qualquer outro caminho: 404. */
function serveControls(controlsRoot: string): Promise<Server> {
  const allowed = [join(controlsRoot, "a") + sep, join(controlsRoot, "recursos") + sep];
  const server = createHttpServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (!path.startsWith("/controles/a/") && !path.startsWith("/controles/recursos/")) {
      res.writeHead(404).end();
      return;
    }
    const file = normalize(join(controlsRoot, path.slice("/controles/".length)));
    if (!allowed.some((prefix) => file.startsWith(prefix)) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

async function waitHttp(url: string, child: ChildProcess): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`govbr-telas saiu com código ${child.exitCode}`);
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((d) => setTimeout(d, 100));
  }
  throw new Error(`govbr-telas não respondeu em ${url}`);
}

export async function startPages(options: { corpus: string; telas: string; controls?: number }): Promise<Pages> {
  const controlsRoot = resolve(options.corpus, "public", "controles");
  const manifest = JSON.parse(readFileSync(join(controlsRoot, "a", "manifesto.json"), "utf8")) as { arquivos: Record<string, string> };
  const http = await serveControls(controlsRoot);
  const port = (http.address() as AddressInfo).port;
  const names = Object.keys(manifest.arquivos).filter((n) => n.endsWith(".html")).sort();
  const controls = names.slice(0, options.controls ?? names.length).map((n) => `http://127.0.0.1:${port}/controles/a/${n}`);

  const telasPort = 33000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [join(options.telas, "server.mjs"), "--port", String(telasPort)], { stdio: "ignore" });
  const base = `http://127.0.0.1:${telasPort}`;
  await waitHttp(`${base}/solicitacao.html`, child);
  return {
    controls,
    screens: { a: `${base}/solicitacao.html`, b: `${base}/pnip/portal-mpa/vistorias?mock-perfil=mpa` },
    async close() {
      child.kill();
      await new Promise((d) => http.close(() => d(undefined)));
    },
  };
}

export interface Build {
  root: string;
  createServer: (options: Record<string, unknown>) => { connect(t: unknown): Promise<void> };
  closeBrowser: () => Promise<void>;
}

/** Carrega o `createServer` compilado de uma árvore do validator (dist/). */
export async function loadBuild(root: string): Promise<Build> {
  const server = await import(pathToFileURL(join(root, "dist", "server.js")).href);
  const browser = await import(pathToFileURL(join(root, "dist", "evidence", "browser.js")).href);
  return { root, createServer: server.createServer, closeBrowser: browser.closeBrowser };
}

export interface CallRecord {
  page: string | null;
  label: string;
  kind: "tool" | "list" | "resource" | "prompt";
  name: string;
  args: unknown;
  text: string;
  isError: boolean;
  sha256: string;
}

export class Session {
  readonly records: CallRecord[] = [];
  private constructor(readonly client: Client, readonly profile: string) {}

  static async open(build: Build, profile: string, extra: Record<string, unknown> = {}): Promise<Session> {
    const server = build.createServer({ toolProfile: profile, reportsDir: join(build.root, "reports", "harness"), ...extra });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "nat61-harness", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return new Session(client, profile);
  }

  private push(page: string | null, label: string, kind: CallRecord["kind"], name: string, args: unknown, text: string, isError = false) {
    this.records.push({ page, label, kind, name, args, text, isError, sha256: sha256(text) });
    return text;
  }

  async surface(): Promise<void> {
    const info = this.client.getServerVersion();
    this.push(null, "serverInfo", "list", "serverInfo", null, JSON.stringify(info));
    this.push(null, "tools/list", "list", "tools/list", null, JSON.stringify((await this.client.listTools()).tools));
    for (const [label, call] of [
      ["resources/list", () => this.client.listResources()],
      ["resources/templates/list", () => this.client.listResourceTemplates()],
      ["prompts/list", () => this.client.listPrompts()],
    ] as const) {
      try {
        this.push(null, label, "list", label, null, JSON.stringify(await call()));
      } catch (error) {
        this.push(null, label, "list", label, null, `error: ${(error as Error).message}`, true);
      }
    }
  }

  async tool(page: string | null, label: string, name: string, args: Record<string, unknown>): Promise<any> {
    try {
      const res = (await this.client.callTool({ name, arguments: args })) as { content?: Array<{ text?: string }>; isError?: boolean };
      const text = (res.content ?? []).map((c) => c.text ?? "").join("");
      this.push(page, label, "tool", name, args, text, Boolean(res.isError));
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    } catch (error) {
      this.push(page, label, "tool", name, args, `error: ${(error as Error).message}`, true);
      return null;
    }
  }

  async resource(uri: string): Promise<void> {
    try {
      const res = await this.client.readResource({ uri });
      this.push(null, `resource ${uri}`, "resource", uri, null, JSON.stringify(res));
    } catch (error) {
      this.push(null, `resource ${uri}`, "resource", uri, null, `error: ${(error as Error).message}`, true);
    }
  }

  async prompt(name: string, args: Record<string, string>): Promise<void> {
    try {
      this.push(null, `prompt ${name}`, "prompt", name, args, JSON.stringify(await this.client.getPrompt({ name, arguments: args })));
    } catch (error) {
      this.push(null, `prompt ${name}`, "prompt", name, args, `error: ${(error as Error).message}`, true);
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function findKey(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (key in (value as Record<string, unknown>)) return (value as Record<string, unknown>)[key];
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Sequência fixa de `scan_page` + `get_finding_details` numa página (plano §5.2). */
export async function scanSequence(s: Session, url: string): Promise<{ scanId: string | null; locator: string }> {
  const first = await s.tool(url, "scan padrão", "scan_page", { url });
  const scanId: string | null = first?.scanId ?? null;
  const flat = await s.tool(url, "scan findings/full", "scan_page", { url, view: "findings", detail: "full" });
  if (scanId) await s.tool(url, "scan compareToScanId", "scan_page", { url, compareToScanId: scanId });
  await s.tool(url, "scan receita+chegada", "scan_page", {
    url,
    actions: [{ action: "press", key: "Tab" }, { action: "wait", ms: 150 }],
    arrival: { dialogOpen: false },
  });
  await s.tool(url, "erro alvo ambíguo", "scan_page", { url, actions: [{ action: "click", selector: "*" }] });
  await s.tool(url, "erro scanId desconhecido", "scan_page", { url, compareToScanId: "S-page-999" });

  const ids: string[] = Array.isArray(flat?.findings) ? flat.findings.slice(0, 3).map((f: { id: string }) => f.id) : [];
  if (ids.length) {
    await s.tool(url, "detalhes por ids", "get_finding_details", { ids });
    await s.tool(url, "detalhes por ids full", "get_finding_details", { ids: ids.slice(0, 1), detail: "full" });
  }
  if (scanId) {
    await s.tool(url, "detalhes por scanId", "get_finding_details", { scanId });
    await s.tool(url, "detalhes por scanId findings/evidence", "get_finding_details", { scanId, view: "findings", detail: "evidence" });
    const familyId = findKey(first, "familyId");
    if (typeof familyId === "string") {
      const members = await s.tool(url, "membros da família", "get_finding_details", { scanId, familyId, limit: 1 });
      const cursor = findKey(members, "nextCursor");
      if (typeof cursor === "number") {
        await s.tool(url, "membros da família cursor", "get_finding_details", { scanId, familyId, limit: 1, cursor });
      }
    }
  }
  await s.tool(url, "erro detalhes scanId desconhecido", "get_finding_details", { scanId: "S-page-999" });
  const locator: string = (Array.isArray(flat?.findings) && flat.findings[0]?.element?.locator) || "body";
  return { scanId, locator };
}

const CONDITIONS = [
  ["wcag", "3.3.1", "input-error-item-identified", { errorMessage: "#nao-existe-msg" }],
  ["wcag", "3.3.1", "input-error-described-in-text", {}],
  ["wcag", "4.1.3", "status-message-programmatically-determined", {}],
  ["govbr-ds-kb", "govbr-3.7.0-component-message-d0c7ed3f91af", "required-anatomy-part-present", { component: "message", part: "mensagem" }],
  ["govbr-ds-kb", "govbr-3.7.0-accessibility-breadcrumb-53db61fa81f9", "current-page-crumb-not-link", {}],
  ["govbr-ds-kb", "govbr-3.7.0-accessibility-modal-f36c91d7073c", "focus-returns-to-invoker-on-close", {}],
  ["govbr-ds-kb", "govbr-3.7.0-accessibility-modal-e0ce4b474163", "initial-focus-on-required-control", {}],
  ["govbr-ds-kb", "govbr-3.7.0-accessibility-modal-744f67e17bec", "tab-stays-within-modal", {}],
  ["govbr-ds-kb", "govbr-3.7.0-accessibility-message-ad83724b777f", "focus-on-close-button-when-shown", {}],
] as const;

function claim(url: string, locator: string, n: number, source: string, id: string, data?: Record<string, unknown>, wcag?: string) {
  return {
    id: `H-${String(n).padStart(3, "0")}`,
    rule: { id, source, description: "alegação sintética do inventário", ...(wcag ? { wcag } : {}) },
    element: { locator, page: url },
    evidence: { observed: "observado (sintético)", expected: "esperado (sintético)", ...(data ? { data } : {}) },
    severity: "moderate",
    nature: "semantic",
    mode: "display",
    pathway: "heuristic",
  };
}

/**
 * Bateria sintética fixa de `verify_finding` (plano §5.2): cada fonte de regra (DS com id real e
 * inventado, e-MAG, WCAG válido/inválido/obsoleto, axe-core, token/estrutura/página), as 9 condições
 * contextuais, live falso e verdadeiro, com scanId e com receita.
 */
export async function verifyBattery(s: Session, url: string, scanId: string | null, locator: string): Promise<void> {
  let n = 0;
  const v = (label: string, finding: unknown, extra: Record<string, unknown> = {}) =>
    s.tool(url, `verify ${label}`, "verify_finding", { finding, ...extra });
  const sources: Array<[string, string, string, Record<string, unknown>?, string?]> = [
    ["kb real", "govbr-ds-kb", "govbr-3.7.0-accessibility-global-271582e4fbe8"],
    ["kb inventado", "govbr-ds-kb", "govbr-3.7.0-inventado-000000000000"],
    ["emag", "emag", "6.6"],
    ["emag com wcag inválido", "emag", "6.6", undefined, "9.9.9"],
    ["wcag válido", "wcag", "1.4.3"],
    ["wcag inválido", "wcag", "9.9.9"],
    ["wcag obsoleto", "wcag", "4.1.1"],
    ["axe-core", "axe-core", "color-contrast"],
    ["token", "govbr-ds-token", "ds-token-color", { property: "color", observedHex: "#123456", expectedCondition: "registered-govbr-ds-color-token" }],
    ["estrutura", "govbr-ds-structure", "ds-structure-button-tag", { component: "button", observedTag: "div", expectedCondition: "canonical-component-tag" }],
    ["página", "govbr-ds-page", "ds-page-footer", { region: "footer", observedCount: 0, expectedCondition: "template-base-region-present" }],
  ];
  for (const [label, source, id, data, wcag] of sources) await v(label, claim(url, locator, ++n, source, id, data, wcag));
  for (const [source, id, condition, fields] of CONDITIONS) {
    await v(`condição ${condition}`, claim(url, locator, ++n, source, id, { expectedCondition: condition, ...fields }));
  }
  // live: com scanId (receita gravada) e com receita explícita.
  const live: Array<[string, string, string, Record<string, unknown>?]> = [
    ["wcag 3.3.1 P1", "wcag", "3.3.1", { expectedCondition: "input-error-described-in-text" }],
    ["wcag 4.1.3 P1", "wcag", "4.1.3", { expectedCondition: "status-message-programmatically-determined" }],
    ["kb real", "govbr-ds-kb", "govbr-3.7.0-accessibility-global-271582e4fbe8"],
    ["axe-core", "axe-core", "color-contrast"],
    ["página", "govbr-ds-page", "ds-page-footer", { region: "footer", observedCount: 0, expectedCondition: "template-base-region-present" }],
  ];
  for (const [label, source, id, data] of live) {
    if (scanId) await v(`live scanId ${label}`, claim(url, locator, ++n, source, id, data), { live: true, scanId });
    await v(`live receita ${label}`, claim(url, locator, ++n, source, id, data), {
      live: true,
      actions: [{ action: "press", key: "Tab" }],
    });
  }
  await v("erro scanId desconhecido", claim(url, locator, ++n, "wcag", "1.4.3"), { scanId: "S-page-999" });
}

export function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
