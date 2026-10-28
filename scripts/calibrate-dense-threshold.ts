/**
 * NAT-107 (revisão 2): calibra o limiar de entrada só-vetorial usando SÓ a base de conhecimento
 * (nenhuma pergunta nem julgamento do benchmark).
 *
 *   npx tsx scripts/calibrate-dense-threshold.ts [modelo]
 *
 * Positivos: o título de cada regra normativa (ou as 12 primeiras palavras da cláusula, se o título for
 * vazio ou igual à cláusula), embutido como pergunta ("query: "), contra o vetor guardado da própria regra.
 * Negativos: o mesmo título contra o vetor guardado de uma regra sorteada de OUTRO componente (global é
 * um grupo), semente fixa (mulberry32, 107), duas voltas sobre as regras (≥ 5.000 pares).
 * Limiar = percentil 95 dos negativos, arredondado a 3 casas. 3.3.0 (NAT-109, N-08): limiar estrito =
 * percentil 99 dos MESMOS negativos — vale para uma cláusula só-vetorial que não divide nenhum termo de
 * conteúdo com a pergunta. Imprime JSON.
 */
import { activeKnowledgeVersion, getKnowledgeBase } from "../src/data/knowledge.js";
import { activeModelKey, cosine, denseState, embedText } from "../src/data/embeddings.js";

const key = process.argv[2] ?? activeModelKey();
process.env.GOVBR_RETRIEVAL_EMBEDDING_MODEL = key;
const state = await denseState(key);
if (state.status !== "ready") throw new Error(`vetores indisponíveis: ${state.reason}`);
const vectors = state.index.vectors;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rules = getKnowledgeBase().rules.filter((r) => r.force !== "example" && vectors.has(r.id));
const clauseOf = (r: (typeof rules)[number]) => r.originalText || r.normalizedRule || "";
const probeOf = (r: (typeof rules)[number]) => {
  const t = (r.title ?? "").trim();
  return t && t !== clauseOf(r).trim() ? t : clauseOf(r).split(/\s+/).slice(0, 12).join(" ");
};
const group = (r: (typeof rules)[number]) => r.component ?? "(global)";
const rand = mulberry32(107);
const pos: number[] = [];
const neg: number[] = [];
const probes = new Map<string, Float32Array>();
for (const r of rules) probes.set(r.id, await embedText(key, probeOf(r), "query"));
for (const r of rules) pos.push(cosine(probes.get(r.id)!, vectors.get(r.id)!));
for (let round = 0; round < 2; round++) {
  for (const r of rules) {
    let other = rules[Math.floor(rand() * rules.length)];
    while (group(other) === group(r)) other = rules[Math.floor(rand() * rules.length)];
    neg.push(cosine(probes.get(r.id)!, vectors.get(other.id)!));
  }
}
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const threshold = Math.round(pct(neg, 95) * 1000) / 1000;
const strictThreshold = Math.round(pct(neg, 99) * 1000) / 1000;
const dist = (xs: number[]) => Object.fromEntries([5, 25, 50, 75, 95, 99].map((p) => [`p${p}`, pct(xs, p)]));
console.log(
  JSON.stringify(
    {
      model: key,
      kbVersion: activeKnowledgeVersion(),
      pairs: { positive: pos.length, negative: neg.length },
      negative: dist(neg),
      positive: dist(pos),
      threshold,
      strictThreshold,
      positivesAtOrAboveStrict: +(pos.filter((x) => x >= strictThreshold).length / pos.length).toFixed(4),
      positivesAtOrAbove: +(pos.filter((x) => x >= threshold).length / pos.length).toFixed(4),
    },
    null,
    1,
  ),
);
