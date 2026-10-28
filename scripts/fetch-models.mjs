#!/usr/bin/env node
/**
 * NAT-107: baixa os arquivos dos modelos de embeddings da revisão fixada em data/models/models.json
 * e confere o sha256 de cada um. Único passo do pacote que usa rede; o servidor nunca baixa nada
 * (env.allowRemoteModels = false).
 *
 *   npm run models:fetch              → só o modelo padrão (models.json "default")
 *   npm run models:fetch -- --all     → todos os candidatos
 *   npm run models:fetch -- e5-small  → os indicados
 *   npm run models:fetch -- --check   → só confere o que está no disco (sem rede); exit 1 se faltar/divergir
 *
 * Arquivo já presente com o sha256 certo não é baixado de novo. Sha divergente → apagado e erro.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(root, "data/models");
const manifest = JSON.parse(readFileSync(join(modelsDir, "models.json"), "utf8"));

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const keys = args.includes("--all") ? Object.keys(manifest.models) : args.filter((a) => !a.startsWith("--"));
const wanted = keys.length ? keys : [manifest.default];

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

let failed = false;
for (const key of wanted) {
  const m = manifest.models[key];
  if (!m) {
    console.error(`modelo desconhecido: ${key} (conhecidos: ${Object.keys(manifest.models).join(", ")})`);
    process.exit(2);
  }
  for (const f of m.files) {
    const target = join(modelsDir, m.id, f.path);
    if (existsSync(target) && (await sha256File(target)) === f.sha256) {
      console.log(`ok      ${m.id}/${f.path}`);
      continue;
    }
    if (checkOnly) {
      console.error(`falta   ${m.id}/${f.path}`);
      failed = true;
      continue;
    }
    const url = `https://huggingface.co/${m.id}/resolve/${m.revision}/${f.path}`;
    mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.part`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok || !res.body) {
      console.error(`erro    ${url}: HTTP ${res.status}`);
      failed = true;
      continue;
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    const got = await sha256File(tmp);
    if (got !== f.sha256) {
      rmSync(tmp, { force: true });
      console.error(`sha256  ${m.id}/${f.path}: esperado ${f.sha256}, veio ${got}`);
      failed = true;
      continue;
    }
    renameSync(tmp, target);
    console.log(`baixado ${m.id}/${f.path} (${f.size} bytes)`);
  }
}
// Licença do modelo (vai no pacote, não é baixada): confere o sha256 declarado.
for (const key of wanted) {
  const lf = manifest.models[key]?.licenseFile;
  if (!lf) continue;
  const file = join(modelsDir, lf.path);
  if (!existsSync(file) || (await sha256File(file)) !== lf.sha256) {
    console.error(`licença ausente ou divergente: data/models/${lf.path}`);
    failed = true;
  } else console.log(`ok      licença ${lf.path}`);
}
process.exit(failed ? 1 : 0);
