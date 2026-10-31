/**
 * 2.12.0 (D-119, passo 3): a versão literal da base — regras extraídas do texto publicado em
 * gov.br/ds (corpus de 15/10/2026), servida por padrão, com a 3.7.0 intacta ao lado.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  activeKnowledgeVersion,
  availableKnowledgeVersions,
  filterRules,
  getEvidence,
  getKnowledgeBase,
  getRuleById,
  useKnowledgeVersion,
} from "../../src/data/knowledge.js";
import { normalizeContext, resetApplicabilityCache, resolveComponentName, retrieveContextCandidates } from "../../src/data/applicability.js";
import { CHECK_GROUNDING } from "../../src/checkers/grounding.js";
import { kbMembership } from "../../src/verify/registries.js";

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;
const KNOWLEDGE = join(import.meta.dirname, "../../data/knowledge");
const LITERAL = "3.7.0-literal-2026-10-15";
const readJsonl = (file: string) =>
  readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, any>);

afterEach(() => {
  useKnowledgeVersion(undefined);
  resetApplicabilityCache();
});

describe("served version", () => {
  it("is the literal version by default, chosen explicitly by manifest.json (not by folder order)", () => {
    expect(availableKnowledgeVersions()).toEqual(["3.7.0", LITERAL]);
    expect(activeKnowledgeVersion()).toBe(LITERAL);
    const top = JSON.parse(readFileSync(join(KNOWLEDGE, "manifest.json"), "utf8"));
    expect(top.activeVersion).toBe(LITERAL);
  });

  it("every record on disk is schema-valid (rule.schema.json) and ids are unique", () => {
    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(readFileSync(join(KNOWLEDGE, "schemas/rule.schema.json"), "utf8")));
    const records = [
      ...readJsonl(join(KNOWLEDGE, `versions/${LITERAL}/normalized/rules.jsonl`)),
      ...readJsonl(join(KNOWLEDGE, `versions/${LITERAL}/normalized/carried-over.jsonl`)),
    ];
    expect(records).toHaveLength(3038);
    expect(records.filter((r) => !validate(r)).map((r) => r.id)).toEqual([]);
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
    expect(getKnowledgeBase().meta.schemaErrors).toEqual([]);
  });

  it("counts by force: literal rules + carried-over records", () => {
    const literal = readJsonl(join(KNOWLEDGE, `versions/${LITERAL}/normalized/rules.jsonl`));
    const byForce = (rules: Array<{ force: string }>) =>
      rules.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.force]: (acc[r.force] ?? 0) + 1 }), {});
    expect(byForce(literal)).toEqual({
      required: 1082,
      prohibited: 154,
      recommended: 1112,
      discouraged: 112,
      permitted: 496,
      unclear: 15,
    });
    expect(byForce(getKnowledgeBase().rules)).toEqual({
      required: 1102,
      prohibited: 155,
      recommended: 1117,
      discouraged: 113,
      permitted: 498,
      informative: 4,
      unclear: 15,
      example: 34,
    });
    expect(getEvidence()).toHaveLength(34);
  });

  it("every literal rule's originalText is a literal substring of its corpus file", () => {
    const literal = readJsonl(join(KNOWLEDGE, `versions/${LITERAL}/normalized/rules.jsonl`));
    const cache = new Map<string, string>();
    const missing = literal.filter((r) => {
      const file = r.source.corpusFile as string;
      if (!cache.has(file)) cache.set(file, readFileSync(join(KNOWLEDGE, `versions/${LITERAL}/corpus`, file), "utf8"));
      return !cache.get(file)!.includes(r.originalText);
    });
    expect(missing.map((r) => r.id)).toEqual([]);
  });

  it("the honest manifest records what was not collected", () => {
    const m = JSON.parse(readFileSync(join(KNOWLEDGE, `versions/${LITERAL}/manifest.json`), "utf8"));
    expect(m.complete).toBe(false);
    expect(m.corpus.markdownFiles).toBe(126);
    expect(m.corpus.ok).toBe(124);
    expect(m.corpus.absentAtSource.map((a: { file: string }) => a.file).sort()).toEqual([
      "componentes/accordion__acessibilidade.md",
      "componentes/scrim__acessibilidade.md",
    ]);
    expect(m.sources.core.relationToRelease).toMatch(/v3\.7\.0 \+ 11 commits/);
    expect(m.sources.design.relationToRelease).toMatch(/v3\.6\.1 \+ 10 commits/);
  });
});

describe("get_ds_rules on the literal version", () => {
  it("Input brings the 'feedback visual imediato' and 'ajuda contextual' recommendations", () => {
    const input = filterRules({ component: "input" });
    expect(input).toHaveLength(64);
    const feedback = input.filter((r) => r.normalizedRule.includes("feedback visual imediato"));
    const ajuda = input.filter((r) => r.normalizedRule.includes("ajuda contextual"));
    expect(feedback.map((r) => [r.force, r.source.tab])).toEqual([["recommended", "acessibilidade"]]);
    expect(ajuda.map((r) => [r.force, r.source.tab])).toEqual([["recommended", "acessibilidade"]]);
    expect(filterRules({ component: "input", query: "feedback visual imediato" })).toHaveLength(1);
  });

  it("e-MAG rules answer to the standard filter as before ('eMAG')", () => {
    const emag = filterRules({ standard: "eMAG" });
    expect(emag).toHaveLength(225);
    expect(emag.every((r) => typeof r.notes === "string" || r.notes === undefined)).toBe(true);
  });

  it("normative context retrieves the observed component's own literal rules", () => {
    const candidates = retrieveContextCandidates(filterRules({}), normalizeContext({ components: ["input"] }));
    // 3.5.0: 64 do próprio Input + 3 globais que a kb-relations-1.2.0 liga a ele (R-05..R-07: placeholder × rótulo, e-MAG 6.2).
    expect(candidates).toHaveLength(67);
    const own = candidates.filter((c) => c.rule.component === "input");
    expect(own).toHaveLength(64);
    expect(candidates.filter((c) => c.rule.component !== "input").map((c) => c.rule.id).sort()).toEqual(
      ["govbr-3.7.0-accessibility-global-25887e6e360f", "govbr-3.7.0-pattern-global-62888bfde020", "govbr-3.7.0-pattern-global-aabbc9b63402"],
    );
    expect(candidates.every((c) => c.rule.force !== "example")).toBe(true);
    expect(candidates.some((c) => c.rule.normalizedRule.includes("ajuda contextual"))).toBe(true);
  });

  it("the page's own component name resolves; 3.3.0 (B-11): so does the page's own Portuguese name in parentheses", () => {
    expect(resolveComponentName("Magic Button")).toBe("magicbutton");
    expect(resolveComponentName("Menu de Navegação")).toBe("menu");
    // "Button (Botão)", "Pagination (Paginação)": the official page's name, exact — not a translation.
    expect(resolveComponentName("botão")).toBe("button");
    expect(resolveComponentName("Paginação")).toBe("pagination");
    expect(resolveComponentName("paginacao")).toBe("pagination");
    expect(resolveComponentName("botãozinho")).toBeUndefined();
  });
});

describe("previous-version ids stay resolvable", () => {
  it("every id the deterministic checkers implement resolves to a listed (non-legacy) rule", () => {
    const ids = new Set(Object.values(CHECK_GROUNDING).flatMap((g) => g.implements).filter((id) => id.startsWith("govbr-")));
    // 3.5.0 (revisão Fable P5): o nome acessível passa a citar emag-1.1 (id e-MAG, fora desta contagem).
    // 3.6.0: a tag raiz semântica trocada cita o e-MAG 1.2 (…7c91abad32ce), ao lado da anatomia.
    expect(ids.size).toBe(7);
    for (const id of ids) {
      const rule = getRuleById(id);
      expect(rule, id).toBeDefined();
      expect(rule!.legacy, id).toBeUndefined();
      expect(kbMembership(id).status).toBe("member");
    }
  });

  it("all 186 ids of version 3.7.0 resolve; superseded/dropped ones are flagged and never listed", () => {
    const old = readJsonl(join(KNOWLEDGE, "versions/3.7.0/normalized/rules.jsonl"));
    expect(old).toHaveLength(186);
    const listed = new Set(getKnowledgeBase().rules.map((r) => r.id));
    const classes: Record<string, number> = {};
    for (const r of old) {
      const rule = getRuleById(r.id);
      expect(rule, r.id).toBeDefined();
      const k = rule!.legacy?.class ?? "listed";
      classes[k] = (classes[k] ?? 0) + 1;
      expect(listed.has(r.id)).toBe(!rule!.legacy);
      for (const n of rule!.legacy?.supersededBy ?? []) expect(listed.has(n), n).toBe(true);
    }
    // 9 mesmo id (texto E força iguais) + 67 herdados (b) listados; 63 substituídos (a: 20 por recorte
    // ou traço, 43 por força alterada) e 47 descartados (c) só por id.
    expect(classes).toEqual({ listed: 76, superseded: 63, dropped: 47 });
    expect(kbMembership("govbr-3.7.0-accessibility-global-e6fd5e1247de").detail).toMatch(/legado/);
  });

  it("an id is reused only when originalText AND force are identical; otherwise the new rule says what it supersedes", () => {
    const old = new Map(readJsonl(join(KNOWLEDGE, "versions/3.7.0/normalized/rules.jsonl")).map((r) => [r.id, r]));
    const literal = readJsonl(join(KNOWLEDGE, `versions/${LITERAL}/normalized/rules.jsonl`));
    const reused = literal.filter((r) => old.has(r.id));
    expect(reused).toHaveLength(9);
    for (const r of reused) {
      expect(r.originalText).toBe(old.get(r.id)!.originalText);
      expect(r.force).toBe(old.get(r.id)!.force);
    }
    const superseding = literal.filter((r) => Array.isArray(r.supersedes));
    expect(superseding).toHaveLength(43);
    for (const r of superseding) {
      const prev = old.get(r.supersedes[0])!;
      expect(prev.originalText).toBe(r.originalText);
      expect(prev.force).not.toBe(r.force);
      expect(getRuleById(prev.id)!.legacy).toMatchObject({ class: "superseded", supersededBy: [r.id] });
    }
    // O título da e-MAG 1.5 é recommended na base literal; o skip link cita a frase required.
    expect(getRuleById("govbr-3.7.0-accessibility-global-7d2b85f81c52")!.legacy!.fromVersion).toBe("3.7.0 (base parcial de 2026-07)");
    expect(getRuleById("govbr-3.7.0-accessibility-global-538e57855252")!.force).toBe("required");
  });

  it("version 3.7.0 can still be served unchanged (GOVBR_KB_VERSION / useKnowledgeVersion)", () => {
    useKnowledgeVersion("3.7.0");
    const kb = getKnowledgeBase();
    expect(kb.meta.knowledgeVersion).toBe("3.7.0");
    expect(kb.meta.totalRules).toBe(186);
    expect(kb.meta.normativeRules).toBe(152);
    expect(kb.meta.legacyIds).toBe(0);
    expect(filterRules({ force: "required" })).toHaveLength(107);
  });

  it("an unknown version fails loudly instead of falling back", () => {
    useKnowledgeVersion("9.9.9");
    expect(() => getKnowledgeBase()).toThrow(/não existe/);
  });
});
