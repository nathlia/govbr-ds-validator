/**
 * NAT-107 (3.2.0, D-147): embeddings locais para a busca híbrida.
 *
 * O que é: um modelo de embeddings multilíngue pequeno (ONNX, transformers.js) lido SÓ do disco
 * (`data/models/<id>/`, revisão e sha256 fixados em `data/models/models.json`), com rede desligada
 * (`env.allowRemoteModels = false`). Os vetores das regras são pré-computados no build
 * (`npm run embeddings:build` → `data/retrieval/embeddings/<modelo>/<versão-da-base>.f32` + `.json`);
 * na execução só a pergunta é embutida.
 *
 * O que não é: nenhum texto é gerado; o vetor só ORDENA regras existentes da base. Nada aqui é
 * aplicabilidade nem conformidade.
 *
 * Estado: `denseState()` diz `ready` (modelo + vetores conferidos) ou `unavailable` com o motivo
 * (arquivo ausente, sha divergente, base de outra versão, falha do runtime ONNX). Indisponível → a
 * busca cai para a léxica e a resposta diz `kb.ranking.dense: "unavailable"` — nunca em silêncio.
 *
 * Determinismo: inferência em CPU com 1 thread, um texto por chamada (sem padding de lote); o cosseno
 * é arredondado a 6 casas antes de ordenar, para que diferenças de último bit entre plataformas do
 * runtime ONNX não troquem a ordem de empates práticos.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { activeKnowledgeVersion, getKnowledgeBase, type KnowledgeBase, type KnowledgeRule } from "./knowledge.js";
import { guardKnowledge } from "./lock.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, "../../data");
export const MODELS_DIR = join(DATA_DIR, "models");
export const EMBEDDINGS_DIR = join(DATA_DIR, "retrieval/embeddings");

/** Formato do arquivo de vetores e do texto de cada regra: mudar qualquer um exige reconstruir. */
export const EMBEDDINGS_FORMAT = "govbr-embeddings/1.0.0";
export const PASSAGE_TEXT_VERSION = "passage-text/1.0.0";

export interface ModelEntry {
  id: string;
  revision: string;
  baseModel: string;
  license: string;
  pooling: "mean" | "cls";
  prefix: { query: string; passage: string };
  dim: number;
  /** Cosseno mínimo para uma regra entrar só pela busca vetorial (fixado antes de medir). */
  threshold: number;
  thresholdSource: string;
  /** 3.3.0 (N-08): cosseno mínimo para uma cláusula só-vetorial SEM termo de conteúdo em comum com a pergunta (p99 dos negativos). Ausente: essa entrada não existe. */
  strictThreshold?: number;
  strictThresholdSource?: string;
  files: Array<{ path: string; size: number; sha256: string }>;
}
export interface ModelsManifest {
  version: string;
  default: string;
  dtype: "q8";
  models: Record<string, ModelEntry>;
}

let modelsManifest: ModelsManifest | undefined;
export function getModelsManifest(): ModelsManifest {
  modelsManifest ??= JSON.parse(readFileSync(join(MODELS_DIR, "models.json"), "utf8")) as ModelsManifest;
  return modelsManifest;
}

/** Modelo ativo: `GOVBR_RETRIEVAL_EMBEDDING_MODEL` (chave de models.json, troca de medição) ou o padrão. */
export function activeModelKey(): string {
  return (process.env.GOVBR_RETRIEVAL_EMBEDDING_MODEL ?? "").trim() || getModelsManifest().default;
}

/** Rótulo curto do modelo nas respostas: chave@revisão(7). */
export function modelLabel(key: string = activeModelKey()): string {
  const m = getModelsManifest().models[key];
  return m ? `${key}@${m.revision.slice(0, 7)}` : key;
}

export function onnxFile(m: ModelEntry) {
  return m.files.find((f) => f.path.endsWith(".onnx"))!;
}

// ── Texto das regras (o mesmo que o motor léxico indexa: cláusula + cabeçalho) ───────────────────

/** Nome documentado do componente: id + título da página oficial (sem o prefixo do portal). */
const namesCache = new WeakMap<KnowledgeBase, Map<string, string>>();
export function componentDisplayNames(kb: KnowledgeBase): Map<string, string> {
  let names = namesCache.get(kb);
  if (names) return names;
  const sets = new Map<string, Set<string>>();
  for (const rule of kb.rules) {
    if (!rule.component) continue;
    const set = sets.get(rule.component) ?? new Set<string>();
    const title = rule.source.pageTitle;
    if (typeof title === "string") set.add(title.replace(/^Padrão Digital de Governo - (Componentes - )?/, "").trim());
    sets.set(rule.component, set);
  }
  names = new Map([...sets].map(([c, s]) => [c, [...s].filter(Boolean)[0] ?? c]));
  namesCache.set(kb, names);
  return names;
}

const dropLinkTargets = (s: string) => s.replace(/\]\([^)\s]*\)/g, "]").replace(/\s+/g, " ").trim();

/**
 * Texto embutido de uma regra (PASSAGE_TEXT_VERSION): nome do componente, sectionPath, título e
 * a cláusula (originalText, senão normalizedRule), sem alvos de links markdown; partes repetidas uma vez.
 */
export function passageText(rule: KnowledgeRule, names: Map<string, string>): string {
  const section = typeof rule.source.sectionPath === "string" ? rule.source.sectionPath : String(rule.source.section ?? "");
  const clause = rule.originalText || rule.normalizedRule || rule.title || "";
  const parts = [rule.component ? names.get(rule.component) ?? rule.component : "", section, rule.title ?? "", clause]
    .map((p) => dropLinkTargets(p))
    .filter(Boolean);
  // Uma parte contida em outra (título repetido na cláusula) sai; iguais ficam uma vez.
  return parts.filter((p, i) => !parts.some((q, j) => j !== i && (q === p ? j < i : q.includes(p)))).join(" — ");
}

/** Texto da pergunta: a pergunta, mais o nome do componente quando há pista. */
export function queryText(query: string, componentName: string | null): string {
  const q = query.trim();
  return componentName ? `${q} — componente: ${componentName}` : q;
}

/** Hash do conteúdo embutido (ids + textos, em ordem): prova que os vetores são desta base. */
export function passagesSha256(kb: KnowledgeBase): string {
  const names = componentDisplayNames(kb);
  const h = createHash("sha256");
  for (const r of kb.rules) h.update(`${r.id}\u0000${passageText(r, names)}\u0001`);
  return h.digest("hex");
}

// ── Embedder (transformers.js, só local) ─────────────────────────────────────────────────────

type Extractor = (text: string, options: { pooling: "mean" | "cls"; normalize: boolean }) => Promise<{ data: Float32Array | number[] }>;
const extractors = new Map<string, Promise<Extractor>>();

export async function sha256File(file: string): Promise<string> {
  const { createReadStream } = await import("node:fs");
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

/** Confere presença, tamanho e (com `full`) sha256 de cada arquivo do modelo. Devolve o problema ou null. */
export async function checkModelFiles(key: string, full = true): Promise<string | null> {
  const m = getModelsManifest().models[key];
  if (!m) return `modelo '${key}' não existe em data/models/models.json`;
  for (const f of m.files) {
    const file = join(MODELS_DIR, m.id, f.path);
    if (!existsSync(file)) return `arquivo do modelo ausente: ${m.id}/${f.path} (rode npm run models:fetch)`;
    if (statSync(file).size !== f.size) return `tamanho divergente: ${m.id}/${f.path}`;
    if (full && (await sha256File(file)) !== f.sha256) return `sha256 divergente: ${m.id}/${f.path}`;
  }
  return null;
}

/** Carrega o pipeline feature-extraction do modelo, só do disco. Lança se o runtime falhar. */
export function loadExtractor(key: string): Promise<Extractor> {
  let p = extractors.get(key);
  if (!p) {
    p = (async () => {
      const m = getModelsManifest().models[key];
      if (!m) throw new Error(`modelo '${key}' não existe em data/models/models.json`);
      const tf = await import("@huggingface/transformers");
      tf.env.allowRemoteModels = false;
      tf.env.allowLocalModels = true;
      tf.env.localModelPath = MODELS_DIR + "/";
      tf.env.useFSCache = false;
      const pipe = await tf.pipeline("feature-extraction", m.id, {
        dtype: getModelsManifest().dtype,
        device: "cpu",
        local_files_only: true,
        // Sem arena nem padrão de memória da CPU: entradas de tamanhos variados não fazem a arena crescer
        // (medido: o servidor ficava em ~2 GB depois de 15 mil chamadas). O vetor não muda.
        session_options: { intraOpNumThreads: 1, interOpNumThreads: 1, enableCpuMemArena: false, enableMemPattern: false },
      });
      return pipe as unknown as Extractor;
    })();
    p.catch(() => extractors.delete(key));
    extractors.set(key, p);
  }
  return p;
}

/** Vetor L2-normalizado de um texto ("query" ou "passage", com o prefixo do modelo). */
export async function embedText(key: string, text: string, kind: "query" | "passage"): Promise<Float32Array> {
  const m = getModelsManifest().models[key];
  const extractor = await loadExtractor(key);
  const out = await extractor(m.prefix[kind] + text, { pooling: m.pooling, normalize: true });
  const v = Float32Array.from(out.data as ArrayLike<number>);
  if (v.length !== m.dim) throw new Error(`dimensão ${v.length} ≠ ${m.dim} (${key})`);
  return v;
}

// ── Vetores das regras (pré-computados) ─────────────────────────────────────────────────────────

export interface EmbeddingsManifest {
  format: string;
  model: string;
  modelId: string;
  revision: string;
  onnxSha256: string;
  dtype: string;
  pooling: string;
  dim: number;
  passageText: string;
  kbVersion: string;
  passagesSha256: string;
  count: number;
  ids: string[];
  file: string;
  fileSha256: string;
  builtWith: string;
}

export function embeddingsPaths(key: string, kbVersion: string) {
  const dir = join(EMBEDDINGS_DIR, key);
  return { dir, bin: join(dir, `${kbVersion}.f32`), manifest: join(dir, `${kbVersion}.json`) };
}

export interface DenseIndex {
  key: string;
  label: string;
  model: ModelEntry;
  /** Vetor de cada regra por id (views sobre um único buffer). */
  vectors: Map<string, Float32Array>;
}

export type DenseState =
  | { status: "ready"; index: DenseIndex }
  /** `transient`: falha do runtime ao carregar (não arquivo ausente/divergente) — uma nova tentativa é feita. */
  | { status: "unavailable"; reason: string; model: string; transient?: boolean };

/** Verifica e carrega os vetores + o modelo. Nunca lança: devolve `unavailable` com o motivo. */
async function loadDense(key: string): Promise<DenseState> {
  const label = modelLabel(key);
  try {
    guardKnowledge("denseEmbeddings");
    const m = getModelsManifest().models[key];
    if (!m) return { status: "unavailable", reason: `modelo '${key}' não existe em models.json`, model: key };
    const kbVersion = activeKnowledgeVersion();
    const paths = embeddingsPaths(key, kbVersion);
    if (!existsSync(paths.manifest) || !existsSync(paths.bin)) {
      return { status: "unavailable", reason: `vetores ausentes para ${key} / base ${kbVersion} (rode npm run embeddings:build)`, model: label };
    }
    const em = JSON.parse(readFileSync(paths.manifest, "utf8")) as EmbeddingsManifest;
    const kb = getKnowledgeBase();
    if (em.format !== EMBEDDINGS_FORMAT || em.passageText !== PASSAGE_TEXT_VERSION) return { status: "unavailable", reason: "formato dos vetores diferente desta versão", model: label };
    if (em.kbVersion !== kbVersion) return { status: "unavailable", reason: `vetores da base ${em.kbVersion}, servida ${kbVersion}`, model: label };
    if (em.revision !== m.revision || em.onnxSha256 !== onnxFile(m).sha256) return { status: "unavailable", reason: "vetores de outra revisão do modelo", model: label };
    if (em.passagesSha256 !== passagesSha256(kb)) return { status: "unavailable", reason: "vetores de outro conteúdo da base (reconstrua)", model: label };
    const buf = readFileSync(paths.bin);
    if (createHash("sha256").update(buf).digest("hex") !== em.fileSha256) return { status: "unavailable", reason: "sha256 do arquivo de vetores divergente", model: label };
    if (buf.byteLength !== em.count * em.dim * 4 || em.ids.length !== em.count) return { status: "unavailable", reason: "arquivo de vetores com tamanho inesperado", model: label };
    const problem = await checkModelFiles(key, true);
    if (problem) return { status: "unavailable", reason: problem, model: label };
    await loadExtractor(key);
    const all = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const vectors = new Map<string, Float32Array>();
    em.ids.forEach((id, i) => vectors.set(id, all.subarray(i * em.dim, (i + 1) * em.dim)));
    return { status: "ready", index: { key, label, model: m, vectors } };
  } catch (err) {
    if ((err as Error).name === "KnowledgeLockedError") return { status: "unavailable", reason: (err as Error).message, model: label };
    return { status: "unavailable", reason: `falha ao carregar: ${(err as Error).message.split("\n")[0].slice(0, 200)}`, model: label, transient: true };
  }
}

const states = new Map<string, { state: Promise<DenseState>; attempt: number }>();
const retries = new Map<string, number>();
let loadCalls = 0;
let loaderOverride: ((key: string) => Promise<DenseState>) | undefined;
/** Testes apenas: quantas cargas de modelo + vetores este processo tentou. */
export function denseLoadCalls(): number {
  return loadCalls;
}
/** Testes apenas: troca o carregador (simular falha transitória). `undefined` restaura. */
export function setDenseLoaderForTests(fn: ((key: string) => Promise<DenseState>) | undefined): void {
  loaderOverride = fn;
}
/** Tentativas de carga por modelo + base depois de uma falha transitória (a 1ª + uma nova). */
export const DENSE_LOAD_ATTEMPTS = 2;

/**
 * Estado da busca vetorial do modelo ativo (carregado uma vez por processo e por base). Falha transitória
 * do runtime → a próxima chamada tenta de novo, uma vez (limitado); o motivo diz se haverá nova tentativa.
 */
export function denseState(key: string = activeModelKey()): Promise<DenseState> {
  const k = `${key}\u0000${activeKnowledgeVersion()}`;
  const cached = states.get(k);
  if (cached) return cached.state;
  const attempt = (retries.get(k) ?? 0) + 1;
  retries.set(k, attempt);
  loadCalls += 1;
  const state = (loaderOverride ?? loadDense)(key).then((s): DenseState => {
    if (s.status === "unavailable" && s.transient) {
      const again = attempt < DENSE_LOAD_ATTEMPTS;
      if (again) states.delete(k);
      extractors.delete(key);
      return { ...s, reason: `${s.reason} (tentativa ${attempt}/${DENSE_LOAD_ATTEMPTS}${again ? "; nova tentativa na próxima chamada" : "; sem nova tentativa"})` };
    }
    return s;
  });
  states.set(k, { state, attempt });
  return state;
}

/** Testes apenas. */
export function resetDenseCache(): void {
  states.clear();
  retries.clear();
  extractors.clear();
  modelsManifest = undefined;
}

/** Cosseno (vetores normalizados → produto interno), arredondado a 6 casas. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return Math.round(s * 1e6) / 1e6;
}
