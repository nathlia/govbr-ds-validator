/**
 * NAT-107: pré-computa os vetores das regras da base ativa para um modelo local.
 *
 *   npm run embeddings:build                 → modelo padrão (data/models/models.json "default")
 *   npm run embeddings:build -- --all        → todos os candidatos
 *   npm run embeddings:build -- minilm-l12   → os indicados
 *
 * Exige os arquivos do modelo (npm run models:fetch). Sem rede (allowRemoteModels=false).
 * Saída: data/retrieval/embeddings/<modelo>/<versão-da-base>.f32 (Float32 LE, regra × dim, na ordem
 * da base) + .json (modelo, revisão, sha do ONNX, versão e hash do conteúdo da base, ids, sha do .f32).
 * Um texto por chamada, 1 thread: reconstruir dá o mesmo arquivo byte a byte na mesma plataforma.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { activeKnowledgeVersion, getKnowledgeBase } from "../src/data/knowledge.js";
import {
  EMBEDDINGS_FORMAT,
  PASSAGE_TEXT_VERSION,
  checkModelFiles,
  componentDisplayNames,
  embedText,
  embeddingsPaths,
  getModelsManifest,
  onnxFile,
  passageText,
  passagesSha256,
  type EmbeddingsManifest,
} from "../src/data/embeddings.js";

const args = process.argv.slice(2);
const manifest = getModelsManifest();
const keys = args.includes("--all") ? Object.keys(manifest.models) : args.filter((a) => !a.startsWith("--"));
const wanted = keys.length ? keys : [manifest.default];
const tfVersion = JSON.parse((await import("node:fs")).readFileSync(new URL("../node_modules/@huggingface/transformers/package.json", import.meta.url), "utf8")).version;

const kb = getKnowledgeBase();
const kbVersion = activeKnowledgeVersion();
const names = componentDisplayNames(kb);

for (const key of wanted) {
  const m = manifest.models[key];
  if (!m) throw new Error(`modelo desconhecido: ${key}`);
  const problem = await checkModelFiles(key, true);
  if (problem) throw new Error(problem);
  const t0 = Date.now();
  const buf = new Float32Array(kb.rules.length * m.dim);
  for (let i = 0; i < kb.rules.length; i++) {
    buf.set(await embedText(key, passageText(kb.rules[i], names), "passage"), i * m.dim);
    if (i % 500 === 0) process.stderr.write(`${key}: ${i}/${kb.rules.length}\n`);
  }
  const bytes = Buffer.from(buf.buffer);
  const paths = embeddingsPaths(key, kbVersion);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.bin, bytes);
  const out: EmbeddingsManifest = {
    format: EMBEDDINGS_FORMAT,
    model: key,
    modelId: m.id,
    revision: m.revision,
    onnxSha256: onnxFile(m).sha256,
    dtype: manifest.dtype,
    pooling: m.pooling,
    dim: m.dim,
    passageText: PASSAGE_TEXT_VERSION,
    kbVersion,
    passagesSha256: passagesSha256(kb),
    count: kb.rules.length,
    ids: kb.rules.map((r) => r.id),
    file: basename(paths.bin),
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    builtWith: `@huggingface/transformers@${tfVersion} cpu 1-thread`,
  };
  writeFileSync(paths.manifest, JSON.stringify(out, null, 1) + "\n");
  console.log(`${key}: ${kb.rules.length} regras × ${m.dim} em ${((Date.now() - t0) / 1000).toFixed(1)} s → ${paths.bin} (${bytes.byteLength} bytes, sha256 ${out.fileSha256.slice(0, 12)})`);
}
