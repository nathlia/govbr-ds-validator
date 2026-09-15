/**
 * build-wcag.ts — regenerates data/wcag-2.2.json from W3C's published WCAG 2.2 data.
 *
 * The verification gate checks that a cited success criterion EXISTS, not that it looks like
 * X.Y.Z. The list is never typed by hand: it comes from the W3C source below, and the output keeps
 * the source URL, retrieval date and SHA-256 of the exact bytes read.
 *
 * W3C lists the criteria that WCAG 2.2 removed (4.1.1 Parsing) with a `versions` array that lacks
 * "2.2". They stay in the file, marked obsolete, so a citation of them is rejected with the reason
 * instead of being reported as nonexistent.
 *
 * Usage: npm run build:wcag
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://www.w3.org/WAI/WCAG22/wcag.json";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "wcag-2.2.json");

interface W3cCriterion { num: string; id: string; handle: string; level: string; versions: string[] }
interface W3cData { principles: { guidelines: { successcriteria: W3cCriterion[] }[] }[] }

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE} respondeu ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const data = JSON.parse(bytes.toString("utf8")) as W3cData;

const criteria = data.principles.flatMap((principle) =>
  principle.guidelines.flatMap((guideline) =>
    guideline.successcriteria.map((sc) => ({
      num: sc.num,
      id: sc.id,
      handle: sc.handle,
      level: sc.level === "A" || sc.level === "AA" || sc.level === "AAA" ? sc.level : null,
      versions: sc.versions,
    }))
  )
);
if (criteria.length === 0) throw new Error("Nenhum critério lido: o formato do arquivo da W3C mudou.");

const obsolete = criteria.filter((c) => !c.versions.includes("2.2")).map((c) => c.num);
const output = {
  meta: {
    standard: "WCAG 2.2",
    source: SOURCE,
    retrievedAt: new Date().toISOString().slice(0, 10),
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    totalListed: criteria.length,
    inWcag22: criteria.length - obsolete.length,
    obsoleteInWcag22: obsolete,
    note: "Gerado por scripts/build-wcag.ts. Critérios sem '2.2' em versions foram removidos na WCAG 2.2 e ficam marcados como obsoletos.",
  },
  criteria,
};
writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n");
console.log(`data/wcag-2.2.json: ${output.meta.inWcag22} critérios na WCAG 2.2, ${obsolete.length} obsoleto(s) (${obsolete.join(", ")})`);
