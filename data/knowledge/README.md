# DS Knowledge Base (`data/knowledge/`)

The finalized knowledge base of the **gov.br Design System 3.7.0** and **e-MAG 3.1**, promoted
into this repo per decision **D-11** (`thesis-workspace/tcc2-decisions-log.md`). It is the
oracle's authoritative rule store: `versions/3.7.0/normalized/rules.jsonl` holds **186 atomic
rules** (107 required · 5 prohibited · 153 automatable), each validated against
`schemas/rule.schema.json` (JSON Schema draft 2020-12), with deterministic ids, PT-BR
`originalText` + `normalizedRule`, `force`, `validationStrategy`, `automatable`,
`automationConfidence`, `severitySuggestion`, and full provenance
(`source.url`, `retrievedAt`, `contentHash`).

## Lineage

This tree is **batch 06** (`tcc-validator-core` profile) of six cumulative crawl checkpoints of
the official https://www.gov.br/ds site plus the `@govbr-ds/core` 3.7.0 npm tarball. Batches
01–06 remain archived untouched at `TCC/ds-rules/` — batch **06 is canonical**; earlier batches
are raw history only.

Everything under `batches/`, `versions/3.7.0/raw/`, and the batch reports is an **immutable
provenance record**: do not edit these files, even to fix statements now known to be wrong
(e.g. early crawl reports mention a "37-component" queue — the correct count is **36**, see
Known corrections below). Corrections live in the reports and in consuming code, never in
the archive.

## Layout

```
knowledge/
├── manifest.json                  ← batch metadata + counts (dsVersion 3.7.0, 186 rules …)
├── schemas/rule.schema.json       ← every rule in rules.jsonl validates against this (186/186)
├── batches/                       ← per-batch reports (provenance, immutable)
├── crawl-report.md, scope.json, unresolved-items.md
└── versions/3.7.0/
    ├── normalized/                ← THE consumable KB
    │   ├── rules.jsonl            ← 186 atomic rules, append-only, deterministic ids
    │   ├── rules.json             ← same content, single JSON array
    │   ├── accessibility/         ← e-MAG 3.1 complete (45/45 + WCAG mappings + templates)
    │   ├── components/ tokens/ page-rules/ templates/ examples/
    ├── official-package/          ← structures + tokens extracted from @govbr-ds/core 3.7.0
    ├── reports/                   ← conflicts, coverage, integrity, official-package-audit …
    ├── raw/pages/                 ← page excerpts (provenance, immutable)
    └── archive/                   ← non-validator-context material
```

## The three-way epistemic separation (D-10)

The KB deliberately keeps apart three kinds of knowledge that are usually blended, and every
consumer of this tree must preserve the distinction:

1. **Normative guidance** — rules with `force: "required"` / `"prohibited"`, extracted from the
   official documentation. These are the compliance oracle.
2. **Canonical implementation evidence** — fragments extracted from `@govbr-ds/core`
   (`force: "example"`). Evidence of how the reference implementation does it.
3. **Observed contradictions and defects** — `versions/3.7.0/reports/conflicts.json` and
   `reports/official-package-audit.json`: 6 accessibility anomalies in the official package's
   own canonical examples (4 missing `alt`, 2 broken `aria-labelledby`), 63 files still served
   from the legacy CDN, the `arial-modal` documentation typo, and the 36-vs-37 component-count
   error.

**Precedence rule (enforced in code, not prose): `example` evidence can never override
`required`/`prohibited` rules.** The official implementation is *evidence*, not *the oracle* —
it demonstrably contains defects (see the audit report), so a defective canonical example must
never be promoted into a compliance rule.

## Known corrections

| Fact | Wrong value | Correct value | Evidence |
|---|---|---|---|
| DS component count | 37 (early crawl queue / old validator docs) | **36** | `@govbr-ds/core` 3.7.0 tarball, sha256 `2b8f13b0a1427f101f9f7aa81751b1bafe829e17305b1727fc2a0e3326781247`; `reports/conflicts.json` |
| `arial-modal` in official docs | as published | likely `aria-modal` (typo, unverified) | preserved verbatim in the KB; noted in `reports/conflicts.json` |
| Official templates CDN | legacy CDN referenced by docs | npm/local is current guidance | `reports/conflicts.json` (cite as-is) |

## Updating the KB (new DS version)

1. Re-crawl the official site + fetch the new `@govbr-ds/core` tarball (record its sha256).
2. Produce a new `versions/<dsVersion>/` tree beside `3.7.0/` — never overwrite an existing
   version tree.
3. Merge rules by deterministic rule id (`rules.jsonl` is append-only; a changed rule gets a new
   id, the old one is superseded, not deleted).
4. Re-run schema validation (all rules must pass `schemas/rule.schema.json`) and regenerate the
   reports (conflicts, coverage, integrity, package audit).
5. Update `manifest.json` and the version guard in the server (`build:data` warns when the
   installed `@govbr-ds/core` version ≠ KB `dsVersion`).
