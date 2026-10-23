/** Implementation evidence is never a normative requirement or an observation of the user's page. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { guardKnowledge } from "./lock.js";
import { getComponentSpecs } from "./load.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export function componentProvenance(component: string) {
  guardKnowledge("componentProvenance");
  const specs = getComponentSpecs();
  const staticExample = { kind: "implementation-evidence", state: "static-html-before-initialization",
    package: specs.meta.source, version: specs.meta.version, generatedAt: specs.meta.generatedAt,
    file: "data/component-specs.json", sha256: hash(readFileSync(join(ROOT, "data/component-specs.json"))),
    observedRuntime: false,
    note: "Recorte HTML estático: ausência de atributo aqui não demonstra ausência após inicialização/interação, nem conformidade na página avaliada." };
  if (component !== "pagination") return { staticExample };
  const file = "node_modules/@govbr-ds/core/dist/components/pagination/pagination.js";
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "node_modules/@govbr-ds/core/package.json"), "utf8")) as { version: string };
    const bytes = readFileSync(join(ROOT, file));
    if (pkg.version !== "3.7.0") return { staticExample, runtimeSource: { kind: "unavailable", observedRuntime: false,
      reason: "O comportamento foi verificado apenas no core 3.7.0; a versão instalada diverge." } };
    return { staticExample, runtimeSource: { kind: "implementation-source-code", package: "@govbr-ds/core", version: pkg.version,
      file, sha256: hash(bytes), state: "initialization-and-page-selection", observedRuntime: false,
      mechanisms: ["_setActive", "_selectPage"],
      note: "No core 3.7.0, _setActive/_selectPage atualizam aria-current=page. Isto descreve a implementação; inspecione a página depois da inicialização e da troca de página. Não é obrigação universal de usar esta técnica ARIA." } };
  } catch {
    return { staticExample, runtimeSource: { kind: "unavailable", observedRuntime: false } };
  }
}
