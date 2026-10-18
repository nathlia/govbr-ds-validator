/**
 * Estado de erro declarado pelo componente DS (2.14.2, NAT-61, sinal S5 — aprovado na revisão Codex
 * 8963921e com limites). Conhecimento do gov.br DS: carregado só sob a mesma política de acesso do
 * pacote — `guardKnowledge` na entrada, então o perfil `knowledge-free` não lê o mapeamento nem por
 * engano (a interpretação fica em `evaluation`).
 *
 * Fonte única, literal: a tabela "Estados" da aba desenvolvedor do Input no corpus congelado
 *   data/knowledge/versions/3.7.0-literal-2026-10-15/corpus/componentes/input__desenvolvedor.md
 *   (fonte oficial core, commit 20173bf2…, docs/components/input/input-dev.md),
 * linha `Erro | **danger** | Entrada de dados com erros`, ao lado de success/warning/info.
 *
 * Mapeamento FECHADO: só `br-input` → `danger`. Nada de generalizar para outro componente de campo,
 * para `.danger` em ancestral qualquer, `.feedback.danger` ou alertas. O arquivo é conferido pelo
 * sha256 do manifesto da versão e a tabela é lida do próprio texto; qualquer divergência devolve
 * `null` (o sinal fica indisponível, nunca inventado).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { guardKnowledge } from "./lock.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = join(__dirname, "../../data/knowledge");
export const DS_STATE_SOURCE_VERSION = "3.7.0-literal-2026-10-15";
export const DS_STATE_SOURCE_FILE = "corpus/componentes/input__desenvolvedor.md";

export interface DsErrorStateMapping {
  /** Classe da raiz do componente (o contêiner do campo). */
  componentClass: "br-input";
  /** Classe do estado "Erro" na tabela Estados. */
  errorClass: string;
  /** Texto da coluna Valores da linha Erro, literal. */
  errorMeaning: string;
  /** As outras classes de estado da mesma tabela (sucesso, alerta, aviso): presença junto do erro = estado conflitante. */
  otherStateClasses: string[];
  source: {
    knowledgeVersion: string;
    file: string;
    sha256: string;
    /** Commit da fonte oficial (core) declarado no cabeçalho do arquivo. */
    coreCommit: string | null;
    url: string | null;
    section: "Estados";
    row: string;
  };
}

let cached: DsErrorStateMapping | null | undefined;

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Lê o mapeamento do corpus literal. `null`: arquivo ausente, sha256 divergente ou tabela sem a linha Erro. */
export function getDsInputErrorState(): DsErrorStateMapping | null {
  guardKnowledge("getDsInputErrorState");
  if (cached !== undefined) return cached;
  cached = load();
  return cached;
}

function load(): DsErrorStateMapping | null {
  const dir = join(KNOWLEDGE_DIR, "versions", DS_STATE_SOURCE_VERSION);
  const path = join(dir, DS_STATE_SOURCE_FILE);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(path) || !existsSync(manifestPath)) return null;
  const bytes = readFileSync(path);
  const expected = (JSON.parse(readFileSync(manifestPath, "utf8")) as { files?: Record<string, string> }).files?.[DS_STATE_SOURCE_FILE];
  const actual = sha256(bytes);
  const text = bytes.toString("utf8");
  // checkout com fim de linha CRLF: o conteúdo é o mesmo; a identidade gravada é a do manifesto
  if (!expected || (actual !== expected && sha256(text.replace(/\r\n/g, "\n")) !== expected)) return null;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^##\s+Estados\s*$/.test(l));
  if (start < 0) return null;
  const rows: Array<{ estado: string; classe: string; valores: string; raw: string }> = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i += 1) {
    const cells = lines[i].trim();
    if (!cells.startsWith("|")) continue;
    const parts = cells.split("|").slice(1, -1).map((c) => c.trim());
    if (parts.length < 3 || /^-+$/.test(parts[0]) || parts[0] === "Estado") continue;
    const classe = /^\*\*([a-z-]+)\*\*$/.exec(parts[1])?.[1];
    if (!classe) continue;
    rows.push({ estado: parts[0], classe, valores: parts[2], raw: cells });
  }
  const erro = rows.filter((r) => r.estado === "Erro");
  if (erro.length !== 1 || erro[0].classe !== "danger" || erro[0].valores !== "Entrada de dados com erros") return null;
  const others = rows.filter((r) => ["Sucesso", "Alerta", "Aviso"].includes(r.estado)).map((r) => r.classe);
  const header = text.slice(0, 600);
  return {
    componentClass: "br-input",
    errorClass: erro[0].classe,
    errorMeaning: erro[0].valores,
    otherStateClasses: others,
    source: {
      knowledgeVersion: DS_STATE_SOURCE_VERSION,
      file: DS_STATE_SOURCE_FILE,
      sha256: expected,
      coreCommit: /Commit:\s*([0-9a-f]{40})/.exec(header)?.[1] ?? null,
      url: /URL:\s*(\S+)/.exec(header)?.[1] ?? null,
      section: "Estados",
      row: erro[0].raw.replace(/\s+/g, " "),
    },
  };
}

/** Testes apenas. */
export function resetDsStateCache(): void {
  cached = undefined;
}
