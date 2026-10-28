# govbr-ds-validator — MCP server (TCC 2 artifact)

The validation **oracle** of the thesis *"Um Framework de Validação de Interfaces Baseado em
Agentes de IA e Protocolo MCP"* (UFSM). It exposes gov.br Design System (Padrão Digital de
Governo) and e-MAG 3.1 knowledge as queryable MCP tools/resources, runs the deterministic
("syntactic") half of the hybrid validation architecture itself, and ships the standardized
validation procedure as an MCP prompt.

Supersedes the TCC 1 proof of concept (archived in `../poc-tcc1`).

Since **2.16.0 (NAT-96)**, `get_ds_rules` adds derived `normativeContext` for literal
KB clauses: section title, the main clause, adjacent clauses with independent forces and
citations, and a coherent literal paragraph. Empty extracted conditions/exceptions are not
proof that the source is unconditional. Force filters select the main rule while retaining
context alternatives; query/context filtering and ranking are unchanged. The frozen KB files
and the historical `3.7.0` `get_ds_rules` projections remain unchanged. Snapshot coordinates refer to UTF-16
offsets in the LF-normalized frozen file, separately from upstream `source.charRange`.
Context pages keep the existing 12,000-character budget. A large unit is explicitly marked
`context-deferred`, with unknown applicability, honest deferred-clause counts and an exact-id
continuation; that follow-up returns the complete unit. Deferred context must be read before
making a normative judgment. This preserves page ordering and component interleaving.

`get_emag_rules` shares these literal clauses and keeps the extensive-table condition in
recommendation 3.9. Legacy IDs are historical pointers with exact (literal equality), partial
(different text in the existing map), or absent successors; this is not a semantic-equivalence
adjudication. `get_component_spec.implementationEvidence` separates static HTML and versioned,
hashed core source-code evidence from normative clauses and actual page observations. The
official core 3.7.0 pagination example is tested before initialization, after initialization,
and after a page click; its ARIA technique is not promoted to a universal requirement.

Since **2.16.1 (NAT-96 review)**, list responses no longer inline units: `get_ds_rules`
listings (brief/full) and `ids` brief carry only a `context-deferred` pointer per rule
(`adjacentClauses` count, `sourceParagraph`, `next` = exact-id call) plus one
`normativeContextNote` per response; `ids` with `detail: "full"` inline a unit only up to
2,500 characters, otherwise the same deferral. The single-rule `id` call still returns the
complete unit. `get_emag_rules` section listings likewise point to the exact-id call (the 3.9
contextual description is kept). Measured on `component: "input", limit: 5`: 34,706 → 4,627
characters; `query: "tabela"` (40 rules): 241,400 → 29,407. Units are memoized per KB object
and rule id (no rereading of the corpus per call); ranking, membership, forces and KB data are
unchanged.

Desde a **2.17.0 (NAT-97)**, `get_ds_rules{query}` e o modo `context` usam um único motor de
relevância (`src/data/retrieval.ts`, `meta.ranking.engine = "govbr-lexical/1.0.0"`): pontuação
lexical determinística (saturação BM25 por campo — texto da cláusula, referências WCAG/e-MAG,
condições/exceções, evidência esperada, nome documentado do componente, seção), cobertura dos
termos, identificador/número exato e pares de palavras adjacentes. Normaliza caixa, acentos,
marcadores markdown e alvos de link, preservando `aria-current`, `for`/`id`/`alt`/`tabindex`,
`e-MAG 3.9`, `1.3.1`; os termos se combinam (a frase inteira não é exigida). `component` é pista:
as regras dele ganham peso, as globais continuam elegíveis, as de outros componentes saem; o nome
passa pelo mesmo resolvedor do `context` (`Modal`, `br-modal`), e nome desconhecido é erro
`unknown-component` com `didYouMean`/`available`, não "0 regras". Ordem: pontuação → faixa de
força (só desempate) → ordem da base; linha de tabela de API/anatomia pesa 0,6 e, no `context`, fica
depois da prosa de mesma relevância. Piso declarado em `meta.ranking.floor` (cobertura ≥ 0,1;
pontuação ≥ 4 ou todos os termos; ≥ 0,6 da melhor; pergunta com 4+ termos conhecidos exige 2): abaixo
dele nada entra (`retrieval.stop: "relevance-floor"`), sem completar com ruído; pergunta sem base
volta vazia com `absenceNote`, `unmatchedTerms` e `next`. A pontuação não depende da ordem das palavras
(pares de termos contam por adjacência na regra, em qualquer ordem), e as frequências de documento vêm do
conjunto ordenado (normativas por padrão; a evidência canônica, quando é ela). `query` tem até 500
caracteres (`query-too-long`) e precisa de palavra de conteúdo (`no-content-terms`); `component` vazio ou
desconhecido é erro também sem `query`. No `context`, cada termo é uma observação independente: é
pontuado sozinho pelo mesmo motor (piso absoluto, sem o corte relativo, porque ali os componentes
observados já definem o escopo) e a relevância da regra é a soma dos termos que ela passa; um termo
nunca derruba outro. Relevância
não é aplicabilidade: nada é afirmado como conformidade. `include_evidence` com `query` segue o mesmo
motor e o `limit`. O vocabulário `data/retrieval/vocab-1.0.0.json` (28 grupos de sinônimos PT/EN e nomes
HTML/WAI-ARIA, cada um com proveniência) é desligável por `vocabulary:false` ou
`GOVBR_RETRIEVAL_VOCAB=off`. `match:"literal"` mantém a semântica da 2.16.1 byte a byte, também no `context`
(substring da frase, sensível a acento, `component` id exato; snapshot de bbc9d56 nos testes). O grupo
`estado-atual` (atual↔current) e os testes de regressão de paginação vêm do diagnóstico da tela A
(`origem: "diagnostico-tela-a"` no vocabulário): ganho atribuído a eles é orientação ajustada a uma tela
de desenvolvimento e deve ser reportado à parte. O formato da resposta é o mesmo da listagem, mais
`retrieval` e `relevance` por regra; o redesenho em cartões é a NAT-99. O `tools/list` do perfil
evaluation muda (novos parâmetros `match` e `vocabulary`). Benchmark de desenvolvimento
`benchmark-1.0.0` (qrels 1.0.2), respondíveis com unidade relevante no top 5: 0% (2.16.1) → 75,0%
(vocabulário ligado) / 67,9% (desligado); P@5 médio 40,3% / 37,7% — metas de 90% e 70% ainda não
atingidas. Autorrecuperação por título sem acento: 15,5% → 98,4%.

## Related repositories

| Repo | Role |
|---|---|
| `../govbr-corpus` | React app under test (`@govbr-ds/core`) — carries **no** answer key |
| `../govbr-eval` | Ground truth, axe-core baseline, P/R/F1 scoring, results dashboard |

## Requirement traceability (tcc2-requirements.md)

| Req | What | Where |
|-----|------|-------|
| A1 | Rules as queryable tools/resources, never prompt text | `get_ds_rules` over the KB (`data/knowledge/`; since 2.12.0 the literal version, 2,971 literal rules + 67 carried-over records — D-11, D-119) + all tools + `govbr://` resources |
| A2 | e-MAG 3.1 alongside WCAG checks | `get_emag_rules`, axe→e-MAG cross-refs |
| A3 | Canonical component examples/specs | `get_component_spec`, `data/component-specs.json` |
| A4 | Token registry + hex→token reverse index | `get_design_tokens`, `data/tokens.json` |
| A5 | Responses as structured feedback signals | Bounded summary/evidence/full pages, Finding detail store, per-field errors on `save_report` |
| A6 | Procedure as MCP prompt primitive | `validate_page` prompt (procedure only) |
| B1 | Deterministic token/structure checks | `check_token_compliance`, `check_component_structure` |
| B2 | axe-core deterministic pass (+ F2 baseline) | `run_axe_scan` |
| C3 | Anti-hallucination gate for heuristic findings | `verify_finding` (separate checks, predicates, server-held results) + enforcement in `save_report` |
| C5 | Evidence gathering separated from judgment | `inspect_computed_styles` (collect-only) |
| D2 | Finding schema: evidence + rule + expected (+ severity, locator, taxonomy) | `src/schema/finding.ts`, resource `govbr://schema/finding` |
| D3 | Human + machine report formats | `save_report` → `.md` + `.json` |
| D4 | Auditable reasoning traces per finding | `trace` field, persisted in both formats |

## Tools

**Oracle knowledge** (read-only):
- `get_ds_rules (id?, ids?, context?, component?, category?, force?, validationStrategy?, automatable?, automationConfidence?, severitySuggestion?, standard?, query?, include_evidence?, detail?, limit?, offset?)` — authoritative KB store; exact ids can be fetched in one batch; `context` returns candidate rules for observed components/regions/terms (2.9.0)
- `get_design_tokens (query?)` — semantic highlights + hex→token reverse index, or filtered token list
- `get_emag_rules (section?, id?)` — complete e-MAG 3.1 (45/45 recommendations) + KB validation template per rule
- `get_page_rules (category?)` — gov.br DS page-level guidelines; without a category, also the citable page constraints `ds-page-header`, `ds-page-footer`, `ds-page-skip-link` (2.7.0)
- `list_components ()` / `get_component_spec (component, include_examples?)` — canonical structure contracts; HTML examples are opt-in. Every constraint carries a **stable, citable id** — `get_component_spec("input")` returns `ds-structure-input-tag`, the same id the deterministic checker reports (D-29). Before this, an agent that described a structural violation correctly had no id to cite and borrowed a generic governance rule, which the scorer then charged as a false positive on top of a false negative.

**Evidence (C5 phase 1)**:
- `inspect_computed_styles (url, selector?, selectors?, properties?)` — batches selectors and returns only requested computed/focus properties plus structural evidence

**Deterministic checkers (no LLM)** — bounded pages, compact by default:
- `scan_page (url, selectors?, checks?, tokenChecks?, components?, actions?, arrival?, compareToScanId?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?)` — one-load aggregate fast path (`tokens`, `structure`, `axe`, `page`) with bounded setup actions, measured state arrival (2.10.0), state/finding diffs, exact cache and evidence ledger
- `check_token_compliance (url, selector?, selectors?, checks?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?)` — batched colors/fonts/radii/spacing vs. token registry
- `check_component_structure (url, component?, selectors?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?)` — batched DOM vs. canonical spec
- `run_axe_scan (url, selector?, selectors?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?)` — batched axe-core with e-MAG cross-references
- `get_finding_details (ids? | scanId?, detail?, cursor?, limit?, maxChars?, view?, memberLimit?, familyId?)` — retrieves selected evidence or continues a stored scan without rerunning it; with `scanId` + `familyId` pages every member of a finding family (2.11.0)

All three scanners default to `detail="summary"`, return explicit `truncated`/`nextCursor`, and
respect an approximate 12,000-character budget. Use `detail="evidence"` for adjudication and
`get_finding_details(..., detail="full")` only when a complete Finding is required.
Scanner output also reports deterministic deduplication counts and the exact merge key.
`scan_page` is the preferred first pass: its LRU cache is process-local and keyed by the rendered
state SHA-256 plus normalized scope. A changed DOM, route, viewport, focus, control state, selector
or check set cannot reuse an earlier scan. The MCP process is fresh per battery run, so evidence
does not cross experimental executions.
Interactive states must be reproduced through `scan_page.actions`; the validator cannot inherit the
state of another MCP server's browser. Supported actions are bounded click, fill, key press and wait;
since 2.10.0 a targeted step needs exactly one element (see *Replayable states* below).

**Gate + report**:
- `verify_finding (finding, live?, actions?, stateFingerprint?, arrival?, scanId?)` — separate checks (rule exists · applicable · evidence consistent · violation verified); `confirmed` only when a predicate verified the violation on every asserted element in the reproduced state (see *Verification gate* below)
- `save_report (url, finding_ids?, findings?, notes?)` — stored deterministic ids + agent-created Findings; the server-held verdict of the identical payload always wins, and inconclusive or unverified explicit findings remain in a separate review channel

**Prompt**: `validate_page (url, scope?, max_iterations?)` — the standardized two-phase procedure with dual pathway and iteration cap.

**Resources**: `govbr://schema/finding`, `govbr://tokens`, `govbr://emag/{1–6}`, `govbr://components/{name}`, `govbr://knowledge/conflicts` (the 6 accessibility anomalies in the official package's own examples + legacy-CDN and documentation defects — why example evidence is not the oracle).

## Development

```bash
npm install
npx playwright install chromium   # once
npm run build:data                # regenerate data/ after upgrading @govbr-ds/core
npm test                          # unit + in-memory MCP integration + live browser e2e
npm run build                     # tsc → dist/
```

Register with Claude Code (already done via `F:/Dev Nath/TCC/.mcp.json`):

```bash
claude mcp add govbr-ds-validator -- node <abs-path>/dist/index.js
```

Reports land in `reports/` by default; the thesis setup points `GOVBR_VALIDATOR_REPORTS_DIR` at
`../govbr-eval/reports` so all evaluation artifacts live in the harness.

### The gate grounds the oracle's own checks; silence is not conformance (2.15.0)

From the screen-A diagnosis (2026-10-22, no model run): the agent rewrote `scan_page` findings
without `rule.implements` — a field the `summary`/`evidence` projections did not show — and
`verify_finding` rejected measured facts (A-06, P-01, P-02) by a schema slip. Same predicates,
no new findings:

- **D-27 decided server-side.** For `govbr-ds-token`, `govbr-ds-structure` and `govbr-ds-page` the
  normative ids come from the check id (`CHECK_GROUNDING`, published structure/page constraints),
  never from the payload; a differing payload `implements` is ignored and said so in `detail`. A
  published check that names no rule (`ds-token-font-size`, D-32) is `unverifiable` with a `next`
  hint (never `rejected`, never `confirmed`). `rejected` stays for contradictory data, a nonexistent
  rule id, or a live counter-fact. `implements` is now in every finding projection (and in the family row).
- **Fixed absence note.** `get_ds_rules` with 0 results / missing ids / unknown id, `get_emag_rules`
  with unknown id or section, `get_component_spec` (always — the spec comes from static examples),
  and every `verify_finding` `unverifiable` carry `absenceNote`: "Ausência nesta base ou nesta
  especificação não é evidência de conformidade; o fato medido continua valendo pela WCAG/e-MAG."
  `contradicted` still only comes from a live predicate measurement.
- **`scan_page.checksOmitted`** (profiles with `checks`): which checks, token subchecks or
  components did not run in this state, one line each on what was left unmeasured. Absent when
  nothing was omitted; the knowledge-free `scan_page` has no `checks` and is unchanged.

### P1: the claimed message must belong to the claimed field (2.14.3, all profiles)

Codex review of NAT-61 (comment 4d66c40e, repro `testing/nat61-message-binding-review.mts`): field
*Telefone* enters an error state (S3, and S5 in `evaluation`); its own message says "Telefone invalido.";
another field's message says "Numero recusado." in the same action. With subject `#target`,
`errorMessage=#right` was rejected (the message names the field — correct), but `errorMessage=#wrong`
came out **`confirmed` in both profiles**: `input-error-item-identified` read the selector's (aggregated)
text and the subject's signals without proving they were the same pair.

2.14.3 keeps three questions apart: **(a)** the page detected an error on this field (S1–S5, unchanged);
**(b)** *this* message belongs to *this* field; **(c)** the item is identified/described to the user
(the AX and textual counter-proofs, unchanged). (b) holds through one of:

| Binding | What is read (`src/evidence/context.ts`, `SubjectSnapshot.binding`) |
|---|---|
| explicit reference | the field's own `aria-errormessage` / `aria-describedby` resolved **in the field's tree** to the exact message element (or a wrapper/part of it with the same text and no form field). An IDREF to a generic ancestor — one holding a field, or text beyond the message (e.g. a summary with several fields' messages) — does not bind and is listed in the detail. The link supports attribution only: the computed description/name still contradicts (an `aria-describedby` to the message puts it in the description → `contradicted`), and the link is never automatic proof of a violation |
| strict structural containment | the message is inside a composed ancestor of the field whose subtree holds **no other form field** (the same wrapper criterion as S3/S5), walking up only until the first ancestor with another field and never into `form`/`main`/dialogs; that wrapper must already have been the field's wrapper before the trigger (same registry number, one field). Neutral facts (tag, id, text, registry numbers — no class names), so it works in both profiles; the DS reading of the wrapper (S5) stays `evaluation`-only |

"A new message in the same wrapper through the transition" is the structural binding **plus** the
temporal evidence already required (the message appeared through the last action), not a separate
permission. Simultaneity of two fields validated together is not association. **`undetermined`**: a
global/external message with no explicit relation, a selector matching more than one element
(`found > 1`: the aggregated text is not one field's message), an IDREF to a generic container, a message
in a multi-field wrapper, a wrapper created by the action itself, an element claimed as "message" that
contains a form field. ARIA is **not** the only way to attribute — the structural cases are the ones the
gate measures (DS feedback appended inside the field's `.br-input`). A confirmed verdict's detail records
the pair (attribute → target, or message ↔ wrapper ↔ field registry numbers).

Condition registries: `contextual-1.3.0` (evaluation), `contextual-1.2.0` (knowledge-free).

**Tests.** `test/integration/p1-vinculo-mensagem.test.ts` (live browser, both profiles): Codex's pair
(`#right` naming the field → `rejected`, `#wrong` → `unverifiable`); the same with a generic right
message → `confirmed` via the single-field wrapper, wrong one `unverifiable`; a selector matching two
messages; an IDREF to a summary holding two fields' messages; an external message linked by
`aria-errormessage` (`confirmed`), by `aria-describedby` (`rejected` by the description) and unlinked
(`unverifiable`); single-field vs multi-field wrapper under the same S2 signal.
`test/unit/contextual.test.ts`: every binding rule on synthetic facts (stable/unstable wrapper, wrapper
with two fields before the trigger, message holding a field, no binding facts, `found > 1`, binding is
not proof: naming message and exposed `invalid` still contradict, binding without detection stays
`undetermined`). `contextual-gate.test.ts`: the open-shadow-root case whose message sits outside the
custom element with an IDREF that cannot cross the boundary is now `unverifiable` (global message, no
relation); the same message inside a wrapper holding only the host confirms. All earlier regressions
(S1–S5, success-green, the S5 negatives) unchanged.

**Gate impact (NAT-86 development division, 1280×900, matrix d35b33f5…, run `2026-10-18T-nat61-2143`).**
`evaluation`: **GO**, row totals identical to 2.14.2 (D1 per row TP 23, TN 98, preserved 15, out of
scope 25, not exercised 10; blocking 0, acceptance failures 0). The only change is at claim level, in
F1-08-D subject 2 (`#telefone`): the claims citing the *other* fields' messages (`#cartao-erro`,
`#email-erro`, for WCAG 3.3.1 and e-MAG 6.6) went `confirmed` → `unverifiable` ("não pertence
comprovadamente a este campo"); the claim with its own `#telefone-erro` (appended inside the field's
`.br-input`) still confirms through the structural binding, so the row stays TP. `knowledge-free`
(capacity 1.1.0): **GO**, no verdict changed (TP 1, TN 41, TN-por-desenho 79, preserved 15, out of scope
25, not exercised 10; blocking 0, lock attempts 0, acceptance failures 0) — in this profile those rows
already rested on S5 alone and stay `unverifiable` by design.

### S5: error state declared by the DS component (2.14.2, evaluation profile only)

Approved by Codex on NAT-61 (comment 8963921e) with binding limits. 2.14.1 left the gov.br DS error
pattern — the error is a state class on the component wrapper plus a feedback text, with no
`aria-invalid`, no `aria-errormessage` and no native validation — as `undetermined`. 2.14.2 adds one
more way to establish the **precondition "the page detected an error on this field"**, and nothing
else:

| Signal | What is read |
|---|---|
| S5 — *estado de erro declarado pelo componente DS* | the nearest `.br-input` ancestor of the field, holding exactly one form field, gained `danger` through the last action (absent in the observation right before the trigger, present in the final state), same wrapper (registry number) before and after, no `success`/`warning`/`info` alongside |

- **Source (DS knowledge, recorded in the evidence).** The *Estados* table of the Input developer tab
  in the frozen literal corpus, `data/knowledge/versions/3.7.0-literal-2026-10-15/corpus/componentes/input__desenvolvedor.md`
  (official source `core` at `20173bf2…`, `docs/components/input/input-dev.md`, sha256 `cfabfcba8464…`
  checked against the version manifest): `Erro | danger | Entrada de dados com erros`, next to
  `success`, `warning` and `info`. The mapping is **read from that file** by `src/data/dsComponentStates.ts`
  (`getDsInputErrorState`) — if the hash or the table row does not match, the signal is unavailable, never
  assumed. A confirmed verdict's detail names the component, the class, the wrapper, the transition and
  the source (file, section, row, KB version, sha256, core commit).
- **Closed mapping.** Only `br-input` → `danger`. No generalisation to other field components, to
  `.danger` on any ancestor, to `.feedback.danger`, to `danger` on the field itself, or to alerts. A
  `.br-input` with several fields, nested `.br-input`s, a different wrapper before/after, `danger`
  already present before the trigger, or `danger` together with another state class → no signal (the
  outcome stays `undetermined` unless S1–S4 hold).
- **What it proves.** Only that an error was detected. It does **not** prove identification or
  description, and alone it does not prove a 3.3.1 violation: WCAG 3.3.1 does not require programmatic
  information, so the absence of `aria-invalid`/an AX association is not by itself a failure. The
  textual-identification and description counter-proofs run exactly as before (a message that names the
  field → `contradicted`; a field description or new text the oracle cannot rule out → `undetermined`).
- **Profiles.** The mapping is DS knowledge: `getDsInputErrorState` calls `guardKnowledge`, so it is
  under the same lock as the package, and the `knowledge-free` profile never calls it
  (`verify/contextual.ts` skips S5 there). The trace keeps a *neutral* capture in both profiles
  (`SubjectSnapshot.containers`: ancestors up to the first one holding another field, with their classes
  and field counts — no DS names). In `knowledge-free`, a row whose detection rests only on S5 stays
  `undetermined` → `unverifiable`; S1–S4 still confirm there.
- Condition registry `contextual-1.2.0` (evaluation); the `knowledge-free` registry is unchanged
  (`contextual-1.1.0`).

**Tests.** `test/integration/p1-estado-ds.test.ts` (live browser, both profiles): DS positive (WCAG
3.3.1 and e-MAG 6.6, source in the detail), knowledge-free stays `unverifiable` with zero lock attempts,
the naming-message counter-proof still rejects, negatives `success`/`warning`/`info`, `danger` outside
the component (form, field, `.feedback.danger`), `danger` on another field's wrapper, a wrapper with two
fields, pre-existing `danger`, `danger`+`success`; the Codex green-success control on a DS wrapper in both
profiles and both windows. `test/unit/contextual.test.ts`: the mapping read from the corpus, every
binding/transition rule, counter-proofs, no mapping → no signal, the loader throws under the lock.
`test/integration/knowledge-free.test.ts`: `getDsInputErrorState` is in the lock list. All 2.14.1
regressions (`/sucesso-verde`, `/erro-so-aparencia`, S1–S4) unchanged.

**Gate impact (NAT-86 development division, 1280×900, matrix d35b33f5…, run `2026-10-18T-nat61-2142`).**
`evaluation`: **GO** — the four P1 3.3.1 positives (F1-01-D, F1-03-D, F1-08-D subject 2 `#telefone`,
F1-11-D) confirm again, all through S5 alone (their pages set only `.br-input.danger`); D1 per row TP 23,
TN 98, preserved 15, out of scope 25, not exercised 10; blocking 0, acceptance failures 0.
`knowledge-free`: with the matrix-derived expectation (capacity 1.0.0) the same four WCAG rows are FN
(NO-GO by 4 acceptance failures, 0 blocking), because only S5 supports their detection. govbr-eval
versions the profile's capacity separately (`portao-nat86/capacidade-knowledge-free.json`, 1.1.0): those
four rows are *não-confirmável por desenho* in this profile (a `confirmed` there would still be a
blocking FP). The matrix was not edited and the defect is not turned into conformance. With capacity
1.1.0 the `knowledge-free` gate is **GO**: TP 1 (F1-12-D, 4.1.3), TN 41, TN-por-desenho 79 (the four
rows included, all `unverifiable`), preserved 15, out of scope 25, not exercised 10; blocking 0, lock
attempts 0, acceptance failures 0.

### P1 needs programmatic evidence that the page detected an error (2.14.1, all profiles)

Codex review of NAT-61 (comment 898d2cde) reproduced a false positive that the 2.14.0 focus fix left
open: a page that accepts **any** value, paints the field green and says "Inscrição concluída com
sucesso." came out `confirmed` for WCAG 3.3.1 (`input-error-item-identified`) in both profiles, also at
1280×900. "A message appeared + the field changed appearance (under the same focus state)" is an
inference, not evidence of error detection: colour changes for success, valid input, loading, disabled.

2.14.1 separates **(a) evidence that the page detected an error on this field** from **(b) evidence
about the message's association/description**. `input-error-item-identified` and
`input-error-described-in-text` decide (b) only after (a) holds through one of a closed set of
programmatic signals, each **established by the last action** (absent in the observation right before
the trigger, present in the final state; the field must exist before the trigger):

| Signal | What is read (`src/evidence/context.ts`) |
|---|---|
| S1 | `aria-invalid` (any value other than absent/""/"false") newly set on the field itself |
| S2 | native constraint validation actually **run**: the field received an `invalid` event during the trigger (`checkValidity`/`reportValidity`/submit) and has `validity.valid === false` in the final state |
| S3 | `aria-invalid` newly set on a composed ancestor whose subtree holds no other form field (the field's own wrapper; a fieldset/group with other fields does not count) |
| S4 | *item-identified only*: the field's `aria-errormessage` resolves (same tree) to the message the last action made appear, or to its ancestor/descendant (2.14.3: only the exact message, or a wrapper/part with the same text and no form field — never a generic container) |

Never evidence of detection: field appearance (colours, classes), the wording of the message
("sucesso", "erro"…), focus, the message's role. Without a signal the outcome is `undetermined` →
`unverifiable`, never `confirmed`. Side effects that follow from the rules already in place: S1 also
exposes `invalid` to assistive technology, so for item-identified it **contradicts** the claim (as
before); S2 with the browser's interactive validation active (no `novalidate`) stays `undetermined` (the
bubble, outside the DOM, points at the field); the `invalid` event is heard by a capture listener on the
document, so a field inside a shadow root never yields S2 (the event is not composed).

**Scope reduction (declared).** Every P1 3.3.1 confirmation that rested only on the appearance change is
now `unverifiable` — in particular the gov.br DS pattern where the error state is a class on the wrapper
(`.danger`-style colour) and a feedback text, with no `aria-invalid`, no `aria-errormessage` and no native
validation. WCAG 4.1.3 (`status-message-programmatically-determined`) is unchanged: it never used the
appearance inference and a success message is also a status message. Which declared positives of the
NAT-86 development gate still confirm and which became `undetermined` is recorded in the gate run below
(*Gate impact*). Condition registry: `contextual-1.1.0`. Regressions: the Codex repro
(`/sucesso-verde`) and a real error shown only by appearance (`/erro-so-aparencia`) in
`test/integration/p1-foco-e-janela.test.ts` (both profiles, both windows); S2/S3/S4 positives, appearance
changed before the trigger, `aria-invalid` already set before the trigger, `aria-invalid` on a group with
another field, native validation run on a valid field in `test/integration/contextual-gate.test.ts`;
pure decisions in `test/unit/contextual.test.ts`. Fixtures that confirmed through appearance alone were
given an explicit S3 (`aria-invalid` on the field's wrapper) so they keep exercising the (b) half; the
earlier F1-10-N focus regression (`/sucesso`) still never confirms, now for the stricter reason.

**Gate impact (NAT-86 development division, 1280×900, matrix d35b33f5…, run `2026-10-18T-nat61-2141`).**
None of the four declared P1 3.3.1 positives of D-127 carries any of S1–S4, so **all four become
`undetermined`** (TP → FN): F1-01-D, F1-03-D, F1-08-D (subject 2, `#telefone`) and F1-11-D
(`input-error-described-in-text`) — 8 rows in `evaluation` (WCAG 3.3.1 + e-MAG 6.6), 4 in
`knowledge-free` (WCAG 3.3.1). No P1 3.3.1 positive still confirms; F1-12-D (WCAG 4.1.3) still does.
No other row changed, no false positive appeared (blocking = 0 in both profiles); the gate is therefore
**NO-GO by acceptance failures** (8 and 4). The matrix was not edited: whether those positives are
re-declared, re-built with a programmatic signal or kept as known FNs is the author's decision.

### Leak detector: per-tool fields, exact echo only (2.14.1, auxiliary)

Codex review (comment db6d022d): `classify` forgave a term found **anywhere** in the call arguments,
and the page-field allowlist keyed on generic last names (`detail`, `name`, `description`…). Now
(`scripts/lib/vazamento.ts`, `TOOL_FIELDS`): page and axe fields are declared **per tool by full leaf
path** (locators, snippets, URLs, trace texts and accessible name of the replay; axe rule/help/tags/
failure summary); server prose (`detail`, `observed`) is never a page field. An echo is forgiven only
when the term **is the whole value** of a declared argument (e.g. `finding.rule.id`) in the leaf
declared to echo it (e.g. `verify_finding` `$.verification.detail`), or the tool's own name in a protocol
error text. Any other dictionary term in that same leaf — enrichment — still counts, and every forgiven
hit is still reported with tool, path and argument path. Canaries and unit tests cover enrichment in the
echo field, echo outside the declared field, a term carried inside another argument, and page terms in
generic fields. This remains an **auxiliary** detector, not a universal proof: it only sees dictionary
terms (paraphrases pass); the guarantee is the load lock. The eval copy
(`govbr-eval/scripts/vazamento/nucleo.ts`) is byte-identical (drift guard).

### Two fixes from the NAT-86 no-model gate (2.14.0, all profiles)

- **P1: field appearance is compared under the same focus state.** Up to 2.13.0,
  `input-error-item-identified` and `input-error-described-in-text` compared the field right before the
  trigger (focused, after `fill`) with the final state (unfocused by the click on the submit button): the
  loss of the focus ring counted as "error detected", and a page that accepts the value and shows a success
  message came out `confirmed` (development control F1-10-N, a blocking false positive in the gate). The
  reference is now the most recent observation before the trigger, in the same document, where the field
  had the same focus state as in the final state; with none, the predicate answers `undetermined`. The
  message alone is never the error signal: the field's own appearance (or `invalid`) must change *(superseded
  in 2.14.1: appearance is no longer a signal at all; see above)*. This is a
  deliberate change of `evaluation` relative to 2.13.0 (P1 verdicts only); the regression is
  `test/integration/p1-foco-e-janela.test.ts` (synthetic, same mechanism).
- **Oracle window from the harness.** `GOVBR_VALIDATOR_VIEWPORT=WIDTHxHEIGHT` (read by the process, not in
  any MCP schema — the agent still cannot choose a window) replaces the frozen 1280×720 for `scan_page` and
  `verify_finding`; the state proof records `viewportSource: "harness"`. Unset: 1280×720 `frozen-desktop`,
  as before. Malformed: error, never a silent default. The baseline CLI's own `viewport` still wins.

### Knowledge-free profile: the third arm (2.14.0, NAT-61)

`GOVBR_VALIDATOR_TOOL_PROFILE=knowledge-free` serves the arm *ferramentas* (D-132, plan
`plano-nat61-braco-ferramentas-2026-10-18.md`). Same image, same server name, same tool names as
`evaluation`; only the profile changes. The comparison *ferramentas → com* estimates the incremental
contribution of the **DS + e-MAG package served and applied by the oracle** (rule lookups, normative
context, checks that apply the base). It does **not** isolate "normative knowledge" in general: WCAG
2.2 (public registry) and axe-core's own output stay in both arms, and the model keeps what it learned
in training.

| Tool | In `knowledge-free` |
|---|---|
| `get_ds_rules`, `get_design_tokens`, `get_emag_rules`, `get_page_rules`, `get_component_spec` | not registered |
| `scan_page` | axe-core only, in the reproduced state (load, recipe, arrival, fingerprint, `scanId`, diff, cache unchanged). No `checks`/`tokenChecks`/`components` in the schema, no e-MAG annotation (`rule.description` suffix, `evidence.data.emagId`), no `coverage.componentsRequested`/`componentsFound`/`evidenceSelectors`, no `observations`, no `normativeContext` |
| `get_finding_details` | unchanged (inherits the stripped batch) |
| `verify_finding` | state replay as in `evaluation`; WCAG rules checked against the WCAG 2.2 registry; `axe-core` as before; `govbr-ds-*` and `emag` sources → `ruleExists: unknown`, fixed note "Fonte não conferida neste perfil." (never `confirmed`, never rejected for the missing registry); only the three P1 conditions cited with source `wcag` select a predicate (3.3.1 ×2, 4.1.3), with labels that do not cite the e-MAG; no token-registry claim check; `registries` = `wcag` + `contextual`; `Finding` schema with neutral descriptions (the `RuleSource` enum values stay, decision 8) |
| resources, prompt `validate_page` | not registered |

**Proof that nothing leaks, three locks:**

1. **By construction** (`src/data/lock.ts`). Every knowledge loader of `data/load.ts` and
   `data/knowledge.ts` (`getKnowledgeBase`, `getRuleById`, `filterRules`, `getEvidence`, `getTokenRegistry`,
   `getComponentSpecs`, `getEmag`, `findEmagRule`, `getPageRules`, `getDsStylesheet`, `getKnowledgeConflicts`,
   `getComponentDefects`, `getEmagValidationTemplate`) calls `guardKnowledge()`; under the lock it counts and
   throws. `createServer` locks the whole process by default (`knowledgeLock: "call"` scopes it to each
   tool call, for tests and the inventory). Every telemetry event of the profile carries
   `knowledgeLockAttempts`; `> 0` = isolation failed. The WCAG registry and the axe bundle stay readable.
2. **By observation** (`npm run inventario:sem-conhecimento`). Real responses of `knowledge-free` and
   `evaluation` on the development controls (`govbr-corpus/public/controles/a/`, never `b/`) and the frozen
   screens A and B (`govbr-telas`), scanned with a dictionary generated from `data/` (KB ids, titles and
   6-word shingles of every version, legacy ids, token names, compound spec classes, published check ids,
   e-MAG titles/paraphrases, conflicts and package audit, page-rule prose, retired tool names, fixed terms).
   No global subtraction: a hit is forgiven only as an **echo** of the caller's own arguments (2.14.1: the
   whole value of a declared argument in the leaf declared for it), in a **page field** (2.14.1: declared
   per tool by full path) when the term is in that page's served/rendered bytes, in an **axe field** when the term
   is in the axe bundle, or as a **named exception** (`RuleSource` enum values; fingerprint normalization
   labels). Everything else is "sem explicação". Acceptance: 0 in `knowledge-free`, > 0 in `evaluation`
   (positive control), canaries firing, lock = 0, and axe parity per page (the `knowledge-free` axe findings
   equal the `evaluation` ones minus the e-MAG fields). The detector is auxiliary; lock 1 is the guarantee.
3. **Per run.** `tools/list` of the profile has a pinned sha256 (`test/integration/knowledge-free.test.ts`);
   the runner checks the exposed inventory and hash (eval side, after NAT-86).

**Invariance.** Apart from the two gate fixes above (P1 under equal focus; the window only when the harness sets it), `evaluation` (and `full`, `normative`, `deterministic`, `evidence`) are unchanged — measured on the knowledge-free commit, before the fixes:
`npm run invariancia:perfis -- --base <2.13.0 tree, built>` compares full payloads of both builds (all
calls of the inventory plus lookups, resources, prompt, the `full` checkers and the CLI on screens A/B),
normalizing only what varied between two runs of the same 2.13.0 build (A/A): timings, ids the page draws
on each load (Angular app id, DS `list-N`) and state hashes derived from them. The `evaluation`
`tools/list` sha256 is pinned to the 2.13.0 value in the test above.

### Contextual verification: associations, anatomy, focus transitions (2.13.0, NAT-85)

Until 2.12.0 the gate had predicates only for token values, the component root tag and the page
regions; every relation between elements, every required part and every focus transition stayed
`unverifiable`. 2.13.0 adds **nine closed conditions** in three families (`src/verify/contextual.ts`),
cut from the normative control catalogue P0 (`catalogo-controles-1.0.0`) and grounded in the literal
KB (D-124). A condition selects its predicate only when the cited rule is in its list **and**
`evidence.data.expectedCondition` is exactly the condition; a generic norm (WCAG 1.3.1, 2.4.3, 2.1.2),
a recommended or permitted rule, or a condition cited with another rule selects nothing.

| Family | `expectedCondition` | Rules | Decides on |
|---|---|---|---|
| P1 | `input-error-item-identified` (+ `errorMessage`) | WCAG 3.3.1 · e-MAG 6.6 · `…global-271582e4fbe8` | error text appeared with the last action and (2.14.1) a programmatic error signal S2–S5 was established by it (until 2.14.0: "the field changed appearance"); (2.14.3) the message is bound to **this** field — the field's own IDREF to the exact message, or a stable wrapper holding only this field; Chromium exposes no `invalid`, the message is not in the computed description/name, and it does not name the field |
| P1 | `input-error-described-in-text` | same | (2.14.1) error signal S1–S3 established by the last action (until 2.14.0: appearance or `invalid`) and no new text appeared |
| P1 | `status-message-programmatically-determined` | WCAG 4.1.3 | container gained text without focus and without alert/status/log/aria-live (self, ancestors, descendants); focus moved into it = exception |
| P2 | `required-anatomy-part-present` (+ `component`, `part`) | Message *Mensagem*, Header *Título* (logo/text substitute allowed), Breadcrumb *Título da página atual*, Modal *Botões* / *Conteúdo* | parts read through the `@govbr-ds/core` classes, open shadow roots included; hidden root, closed shadow root, optional part → no decision |
| P2 | `current-page-crumb-not-link` | `…breadcrumb-53db61fa81f9` (prohibited) | last breadcrumb item contains `a[href]` |
| P3 | `focus-returns-to-invoker-on-close` | `…modal-f36c91d7073c` | focus after closing ≠ invoker; no invoker → not applicable (rejected); invoker removed or new document → no decision |
| P3 | `initial-focus-on-required-control` | `…modal-e0ce4b474163`, `…modal-6f984d79466a` | focus outside the dialog violates every reading; on the rule's target → rejected; a field in an action dialog → verified (Q3 a); another control (possible destructive exception, not in the KB) → no decision |
| P3 | `tab-stays-within-modal` | `…modal-744f67e17bec` | a Tab with the dialog open moves focus outside it; Tab from the last focusable that wraps → rejected |
| P3 | `focus-on-close-button-when-shown` | `…message-ad83724b777f`, `…menu-a3be6788bdea` | focus on the close button when the component is shown; no close button → not applicable (rejected) |

- **New predicate outcome `undetermined`** → `checks.violation: "undetermined"` → `unverifiable`: the
  predicate ran in the reproduced state, but the data do not decide. A contextual target that does not
  exist in the state is `undetermined` too (unknown target is a limitation, not counter-evidence); the
  older predicates keep their behaviour.
- **Transition trace.** Predicates that need it get an observation before the first action and after
  each one (deep focus across open shadow roots, subject shown / focus inside / close, primary, field and
  tabbable controls, colours, visible text), with a short settle (two frames + finite animations, cap
  1 s). The *trigger* is the last action; the invoker of an action with a selector is its target.
  Without a contextual predicate the replay is the 2.12.0 one (no observer, no extra waits).
- **Only stable focus decides.** Every focus-trace observation waits until the deep active element has not
  changed for 400 ms (cap 2 s) and records `focusStable`; a P3 decision (and the 4.1.3 moved-focus exception)
  on an unstable reading is `undetermined`, so a late `setTimeout(() => x.focus())` cannot produce `verified`.
  The trigger is the last action that acts on the page (trailing `wait`s are skipped). Accessibility facts are
  paired with trace subjects by element number, never by position. Implicit live regions (`<output>`,
  timer/marquee) count for 4.1.3; a field failing native browser validation leaves "no text" undecided (the
  browser bubble is not in the DOM). A last breadcrumb link to this same page leaves "current-page title
  missing" undecided (a bare `href="#"` is a placeholder, not a link to the page); the current-page `h1` comes
  from `main`.
- **Evidence exported** with the verdict in `binding.context` (trace per step, accessibility facts,
  anatomy facts); `registries.contextual` names the condition registry version.
- **`scan_page`**: P2 runs inside the `structure` check and emits a finding (cited KB id, anchor = the
  component root, `data.component/part`) only where the gate predicate would answer `verified`.
- **Out, on purpose:** `aria-describedby` on every field (DS rule is recommended), WCAG 1.4.1 (depends
  on visual cues the oracle does not measure), restoring focus for Message (recommended) and Menu (no
  text), the destructive-modal exception (corpus text not in the KB), Pagination (type not declared in
  the DOM). Grounding: `CONTEXT_GROUNDING` in `src/checkers/grounding.ts`, kept outside
  `CHECK_GROUNDING` because these findings cite normative ids directly (no alias to generate).

### Knowledge versions: the literal base is served, 3.7.0 stays readable (2.12.0)

Until 2.11.0 the oracle served `data/knowledge/versions/3.7.0/` — 186 rules (152 normative + 34
canonical examples) whose gov.br DS texts were mostly search-index excerpts, with a manifest that
said `complete: true` after verifying 8 component pages. 2.12.0 serves
**`versions/3.7.0-literal-2026-10-15/`** (D-119), built by `scripts/build-kb-literal.mjs` from the
literal corpus in `../ds-rules/govbr-ds-3.7.0-corpus/` (126 Markdown files of the text published at
gov.br/ds and the e-MAG page, accessed 2026-10-15):

| file | what it is |
|---|---|
| `normalized/rules.jsonl` | **2,971** literal rules from the normalization output (audited, corrections applied), with one change: an old 3.7.0 id is kept only when `originalText` **and** `force` are identical (9 rules); the 43 with the same text but a different force get a new id and `supersedes: [oldId]`. Every `originalText` is a substring of `corpus/<source.corpusFile>` — checked in tests. Force from the text: 1,082 required · 154 prohibited · 1,112 recommended · 112 discouraged · 496 permitted · 15 unclear |
| `normalized/carried-over.jsonl` | **67** unchanged 3.7.0 records whose source is official but outside the literal corpus: 34 canonical examples from the `@govbr-ds/core` package, 33 rules from pages the corpus did not collect (templates, "como começar", some guides/patterns, the DS wiki) |
| `normalized/legacy-ids.json` | **110** 3.7.0 ids no longer listed: 63 superseded (20 by a differently cut literal rule or a dash-only text difference, 43 same text with a changed force), 47 with no verifiable source |
| `corpus/` | the literal `.md` corpus + `MANIFEST.json` (sha256 `f211b83f…`), `COLETA.json`, `PROVENIENCIA.md` |
| `reports/` | `regras-antigas.md` (what happened to each of the 186), normalization summary/coverage/id maps, the independent audit and its corrections; `conflicts.json`/`official-package-audit.json` inherited from 3.7.0 |
| `manifest.json` | the honest account: `complete: false`; component tabs 106/108 (accordion and scrim have no accessibility tab at the source); sources are core = tag v3.7.0 + 11 doc commits, design = tag v3.6.1 + 10 link-fix commits — cite as "text published at gov.br/ds (DS 3.7.0)", not "the 3.7.0 tag" |

- **Which version is served** is explicit: `activeVersion` in `data/knowledge/manifest.json`
  (`GOVBR_KB_VERSION=3.7.0` serves the old one again, e.g. to reproduce a past campaign). The
  old lexicographic pick is gone — adding a folder no longer changes the oracle.
- **No id is lost.** All 186 ids of 3.7.0 resolve through `get_ds_rules` (`id`/`ids`) and the
  `verify_finding` gate: 9 kept the same id (same text and force), 67 are carried over, and the 110
  in `legacy-ids.json` come back with a `legacy` field (`superseded` + replacements, or `dropped`;
  `fromVersion: "3.7.0 (base parcial de 2026-07)"`) but never appear in listings, facets, counts or
  the normative context. In the gate a `dropped` id exists but leaves applicability `unknown`
  ("regra sem texto na fonte oficial coletada"); a `superseded` id is judged through its successor.
- **Scanners.** The six KB ids the deterministic checkers implement (`CHECK_GROUNDING`) are listed
  rules. One changed: the skip-link check cited the e-MAG 1.5 *heading* (`…7d2b85f81c52`, which is
  `recommended` in the literal base and is now a legacy id); it now cites the literal required
  sentence `…538e57855252` ("o primeiro link da página deve ser o de ir para o conteúdo"). The
  checks themselves are unchanged: the CLI on screens A and B gives 6 and 58 findings, identical to
  2.11.0 except that cited id/excerpt (after normalizing `_ngcontent` ids).
- **API shape unchanged.** The loaded copy is canonicalized (`notes` list → string, `standard`
  `"e-MAG"` → `"eMAG"`); the files stay as produced. Component name variants also accept the
  literal page title before its parenthesis ("Magic Button", "Menu de Navegação"), never the
  Portuguese gloss.
- **What the agent sees changes**: `get_ds_rules` for a component now returns its three tabs
  (e.g. input 2 → 64 rules, footer 0 → 51, datetimepicker 0 → 36), and the 2.9.0 normative context
  grows accordingly. So the context **order** changed: candidates are grouped by observed component
  plus one global group, ordered inside each group by force (required/prohibited → recommended/
  discouraged → the rest), and the groups alternate (global first, components A→Z). Page 1 of a
  form {button, datetimepicker, input, upload} now holds required rules of all four (until 2.11.0
  pages 1–4 were all button); page 1 also lists `groups` (count per group + the call that pages
  one group alone), and `scan_page`'s `normativeContext` carries `byComponent`. `meta` of
  `get_ds_rules` names `knowledgeVersion`. The literal rules carry no `relatedComponents`/`expectedEvidence`, so context
  retrieval is by the observed component and by terms in title/rule text; `validationStrategy` and
  `automatable` are keyword heuristics (`automationConfidence: "low"`).
- The 2.9.0 context contract tests and the 2.8.0 byte-identity snapshot run pinned to 3.7.0 (their
  cases use that version's data; the snapshot ignores only the added `meta.knowledgeVersion`); the
  literal version has its own tests. Pinned to 3.7.0, the skip-link grounding id does not exist —
  the gate reports it as missing there.

### Finding families: grouped presentation, every member recoverable (2.11.0)

On real screens dozens of identical instances (calendar days, one icon-only button per table row,
fifty `.br-button`s) flooded the responses (NAT-84). The scanners and `get_finding_details(scanId)`
now answer with **families by default** (`view="families"`); the flat page stays available with
`view="findings"`, and its first page carries a small `familyIndex` (`totalFamilies`, `largestFamily`,
counted in `responseCharsEstimate`). Grouping is **presentation only**: the stored batch, `summary`,
`deduplication`, `total` and the JSON printed by `node dist/cli/scan-page.js` (which calls `scanPage`
directly) are unchanged, and nothing depends on the tool profile. Families are grouped by the full
key; a 12-hex `familyId` collision between two keys throws instead of mixing families.

- **Family key** — `rule.source + rule.id + rule.implements + rule.wcag + nature + mode + pathway +
  severity + element.page + the batch's stateFingerprint + evidence.data.property + evidenceSignature`,
  where `evidenceSignature = sha256(canonical{observed, expected, data})`. Locator, snippet, id and
  trace are not in the key; different states, norms, causes or values never share a family.
  `familyId = FAM-` + 12 hex of the key, stable for the same batch.
- **Summary per family** — `count`, one `example`, `value`, `gate` (tally of individual verdicts),
  up to `memberLimit` ids (default 25) with `membersNotReturned`, `nextMemberCursor` and a ready
  `nextMemberCall` — the rest comes from `get_finding_details`, never from rerunning the scanner.
- **Members** — `get_finding_details(scanId, familyId, cursor?, limit?, detail?)` returns each
  member's `id`, `locator`, `value`, `evidenceSignature`, `identity` and its own `status`;
  `nextCursor` walks all ids. `detail="evidence"|"full"` adds the evidence or the complete Finding.
- **No inherited verdict** — `status` keeps three separate fields: `acceptedByAgent` (always `null`
  here: the validator never sees the agent's final decision; the evaluation ledger in govbr-eval
  fills it), `ruleApplicable` (the gate's applicability check, `not-checked` without a stored
  verification) and `confirmedByGate` (`true` only with a stored `confirmed`; plus `gateVerdict`).
  A family has no verdict of its own.
- **Changed evidence** — an identity (rule + page + locator + property) that reappears with other
  evidence becomes another signature/family and is listed in `identityVersions`;
  `stateDiff.findings.evidenceChanged` reports the same between two scans (`unchanged` keeps its old meaning).
- **Known limit** — a token finding does not carry the stylesheet/selector that declared the value,
  so two CSS rules with the same off-scale value share a family; adding the cause to the key would
  require writing it into `evidence.data`, which would change the baseline CLI JSON.
- **Partial results** — a family or member page that stops early says so: `truncated: true` (read by
  telemetry), `complete: false` and
  `partial: { reasons: ["limit" | "char-budget" | "member-limit" | "time-limit"], familiesNotReturned?,
  membersNotReturned, nextCursor? }`. The flat findings page also gains `partial: { reasons, notReturned }`.
- **No unsupported certainty** — the compact finding projection no longer emits `confidence: 1`.
  A deterministic checker reproduces the same result for the same DOM and state; that is not a
  probability that the finding is correct. `pathway` already names the origin.

### Replayable states: one target, measured arrival, versioned identity (2.10.0)

Two browsers share no state: the agent's and this server's meet only through a recipe replayed from
a clean load, and repeating actions does not prove the intended scene was reached (NAT-82). Up to
2.9.0 every step acted on `locator(...).first()`, so a selector with two targets silently acted on
the first and the result looked like the requested state.

- **One target per step.** `click`, `fill` and `press` with a selector count the matches (after up to
  5 s for asynchronous rendering) and act only when there is exactly one. Otherwise the recipe stops
  with `state.replay = { status: "failed", steps, failure: { index, action, selector, reason, matched,
  detail } }`, `reason` ∈ `not-found` · `ambiguous` · `invalid-selector` · `page-changed` ·
  `action-failed`. `invalid-selector` is only a real selector syntax error; a count that fails because
  the document went away (execution context destroyed by navigation, frame detached, page closed) is
  `page-changed`; anything else is `action-failed`. If the single target stops being single between
  counting and acting (Playwright strict mode), the step is `ambiguous` with the new count. A `wait`
  with a selector is a condition, not a target: one visible match is enough and the count is recorded.
  Nothing picks an index; there is no `nth` option (see the compatibility note below).
- **Settle before the fingerprint.** An action can trigger deferred changes — a dialog whose `.show`
  class arrives by `setTimeout`, a CSS transition. After the last step, scanner and gate run the
  **same** wait (`settlePage`, `SETTLE_POLICY` in `src/scan/state.ts`): network idle (at most 2 s),
  then DOM samples (document `outerHTML` + every open shadow root) every 100 ms until 4 consecutive
  samples are identical **and** no finite animation/transition is running (`document.getAnimations()`;
  infinite ones such as spinners are ignored), capped at 3 s. The outcome is `state.settle =
  { settled }`, outside the hash. Changes deferred by more than the 300 ms quiet window are not waited
  for; a recipe that needs them declares a `wait` with a selector. Arrival is measured after the settle.
- **Arrival is measured, not assumed.** `arrival: { path?, dialogOpen?, errorVisible?, expanded?,
  focused?, visible? }` (strict; all neutral — pathname, open `dialog`/`role=dialog|alertdialog`/
  `aria-modal`, visible `role=alert` or `aria-invalid=true`, `aria-expanded=true` on exactly one
  control, focus on exactly one element across open shadow roots, at least one visible match). Every
  scan returns `state: { policy, normalizations, recipe: { url, viewport, viewportSource, actions
  (fill values kept), arrival? }, replay, settle, observed: { url, path, viewport (measured, with dpr),
  dialogs, expanded, errors, focus, unobservableRoots }, arrival: { status, conditions[] }, reached }`,
  stored with the `scanId` (also returned by `get_finding_details({ scanId }).ledger.state`).
- **Unreached is a limitation, not a result.** A failed step or an unmet condition returns
  `{ status: "state-not-reached", scanId: null, stateFingerprint: null, limitation: { kind:
  "action-error" | "arrival-not-met", detail }, state }` — no findings, no coverage, not a tool error.
  Zero findings there would read as "no defect" in a state nobody saw. The baseline CLI prints the
  same JSON and exits with code 3.
- **`verify_finding` against a recorded state.** `scanId` replays the scan's own recipe (and refuses
  `actions`/`arrival`/`stateFingerprint` alongside it). The finding's `element.page` must be the scan's
  page, compared by origin + path + query — a trailing slash and the `#fragment` do not count; another
  page is caller misuse and gets the same typed refusal (`{ error }`, no verdict) as the other scanId
  misuses. URL, measured viewport and fingerprint must all match the scan; if they do not, the state
  was **not reproduced**, which is a limitation, not evidence against the finding: `unverifiable`
  with `verifiedBy: "state-fingerprint"`, `binding.state.mismatches` ⊆ `url` · `viewport` ·
  `fingerprint`, `binding.state.limitation.kind = "state-not-reproduced"` and `binding.state.settled`.
  The same holds for a `stateFingerprint` sent without `scanId`. A recipe or arrival failure also
  leaves the claim `unverifiable` (`verifiedBy: "state-replay"`, `violation: "not-checked"`,
  `binding.state.limitation`). None of these is ever `rejected` as if there were no defect.
- **State identity `state-identity-1`.** SHA-256 of policy, URL, viewport, document `outerHTML`, the
  `innerHTML` of every open shadow root (with its host path), form/ARIA state controls in every open
  tree (value, checked, open, aria-expanded, aria-selected, aria-checked, aria-pressed), the deep focus path and the
  closed-root hosts. Scanner, cache and gate compare it **exactly**. The only normalizations are two
  consistent renamings (by first appearance, so distinct values stay distinct and references stay
  linked) of values a framework draws on every load: `ds-core-random-list-id` (`list-<0..9999>`
  with no leading zero, drawn by `@govbr-ds/core` 3.x `br-select` for its autocomplete list — only an
  id on an element that carries the DS context, `class` containing `br-list` and `role="listbox"`,
  and references to that id, in id/reference attribute values and `#list-N` locators; a `list-N` the
  page author wrote elsewhere is left as is) and `angular-emulated-app-id` (the per-bootstrap app id in
  `_ngcontent-<app>-c<N>`/`_nghost-…`; the component index is kept). They were measured, not
  assumed: on both frozen screens identical loads gave different 2.9.0 fingerprints because of exactly
  these two sources, so the cache never hit there and a `stateFingerprint` sent to `verify_finding`
  was always rejected. Fingerprints are not comparable with 2.9.0's.
- **Shadow roots.** Open roots are part of identity and observation; locators cross them with ` >>> `
  as in `inspect_computed_styles`. Closed roots are detected through CDP and listed in
  `unobservableRoots`; focus inside one is reported as the host with `interior: "unknown"`, never as
  focus on the host. The CDP read is retried (3 attempts); if it still fails, `observed.unobservableRoots`
  is `null` (unknown) while the hashed identity carries `[]`, so a one-off read failure on a page
  without closed roots does not change the fingerprint silently.
- **Window.** MCP tools run in the frozen desktop window, now explicit (`1280×720`, Playwright's
  default until now — an upgrade cannot change it silently). The viewport remains CLI-only;
  `arrival` cannot carry one.

**Compatibility.** No existing test or fixture relied on `.first()` (all their action selectors are
unique). On the frozen screens the harness probes (`.acao-enviar`, `#AGENDAR`, ids, `text=` with a
unique label) replay as before; class/tag-level selectors (`.br-button`, `button`, `.tab-item`,
`[aria-expanded]`) are ambiguous there and now fail with `ambiguous` instead of acting on the first.
No recorded baseline request carried actions.

Frozen campaigns ran on 2.7.0 and are not changed by this release.

### Normative context for what was observed (2.9.0)

In the Sonnet campaign 7 of the 10 runs with the oracle never queried the knowledge base directly:
the knowledge was there, but going from "this page has a `br-tag` and a `br-modal`" to "these are
the rules to investigate" was left entirely to the agent (NAT-83). 2.9.0 makes that link a
retrieval the oracle does itself, on the existing endpoints — no new tool, so the evaluation
profile's tool list is unchanged.

- **`get_ds_rules({ context: { components?, regions?, terms? } })`.** Returns **candidates**, each
  with `ruleId`, `force` and `obligation` (`mandatory` / `advisory` / `permissive` / `informative` —
  a recommendation stays a recommendation), `reasons` (`component-observed`, `region-observed`,
  `related-component-observed` via the KB's `relatedComponents`, or `term` with the fields it matched),
  `applicability`, `expectedEvidence` and `neededState` (derived from the rule's `validationStrategy`).
  `detail:"summary"` is the default; `brief`/`full` reuse the existing projections and add rule text,
  conditions, exceptions, `source` (url, standard) and `version`.
- **What is selected.** Rules of the observed components; global rules only through a documented
  relation (`relatedComponents`) or a caller term found in `conditions`, `exceptions`,
  `expectedEvidence`, title or normalized rule (word-start match, case/accent-insensitive). Rules of
  components not observed are never returned, and `force:"example"` records never are — examples are
  evidence, not norms. The KB publishes no other component → global-rule link, so none is invented.
- **What is not decided.** `applicability.status` is `in-scope` (own component observed, no declared
  condition or exception) or `unknown`; never `applicable`/`verified`. Conditions and exceptions are listed in
  `applicability.unevaluated`, missing relations and global-by-relation/term in `unknowns`. Pertinence
  is not verification: a finding citing a candidate without a predicate stays in review at the gate.
- **Labels kept.** Documentation conflicts (`conflicts.json`) attach to a rule only when the conflict
  names it by exact title; a conflict that only shares a candidate's source page is listed in
  `sourcePageNotes` with no rule association (a page carries several rules); components whose official examples carry known defects come back in `exampleWarnings`;
  truncated-source caveats travel with the rule. Terms also point to the `get_page_rules` categories
  whose text contains them; the page constraints (`ds-page-*`) are listed once, on the first page.
- **Determinism and budget.** Names resolve through documented variants only (id, `br-<id>`, the
  official page name: `"Cookie Bar"` → `cookiebar`); anything else is returned in
  `context.unresolved`. Order depends only on the normalized context and the KB order, so the same
  context returns byte-identical text to any client, arm or model. Pages respect `limit` (default 20)
  and a ~12,000-character budget for the whole response; `more.nextOffset` continues without loss or
  repetition. Typical sizes (pretty JSON, ÷3.5 ≈ tokens): context with button+input+modal, summary
  7.2k chars (9 candidates); 15 components, first page 11.4k.
- **Elsewhere.** `get_component_spec` gains `rules: { retrieval:"automatic", ids, next }` (+~0.5–0.6k
  chars); its `component` stays the exact id. `scan_page`, in profiles that carry norms
  (`full`/`evaluation`), adds `normativeContext: { retrieval:"automatic", components, candidates,
  byReason, next }` built from `coverage.componentsFound`, on the first page only (no `cursor` or
  `cursor: 0`); `deterministic`/`evidence` profiles get nothing new. `retrieval:"automatic"` vs `"direct"` separates pushed from requested knowledge in the
  analysis; no number of calls is a success criterion.
- **Fixes.** `get_ds_rules({ limit, offset })` with no other filter returned the facet index although
  the note promised pagination — `limit`/`offset` were stripped from the filter before the
  "no filter" test. Explicit `limit` or `offset` now lists; a call with nothing still returns the
  facets. Every other legacy call shape (`id`, `ids`, `component`, `category`, `query`, …) returns
  byte-identical text to 2.8.0 — checked against a 2.8.0 snapshot in
  `test/fixtures/legacy-get-ds-rules-2.8.0.json`. Accent-insensitive matching, the extra fields and
  name variants exist only inside `context`.

Frozen campaigns ran on 2.7.0 (`validator_sha` `b0713083f1823691c516825220b529e420b91cb3`) and are not
changed by this release.

### Accessible name is what the browser computes, not `aria-label` (2.8.0)

Up to 2.7.0 the structure checker reported `emag-2.2` / WCAG 4.1.2 for every interactive icon-only
element without `aria-label` or `alt`. That is a different question from the rule's: an external
review (NAT-33) showed Chromium exposing `button "Visualizar registro"` for a button named by
`title` or by `aria-labelledby` while the checker still fired. On screen B (Vistorias) the
`br-button` web components pass the host's `title` to the inner `<button>` with `aria-label=""`,
which produced about 30 false alarms per baseline run.

- **Evidence.** For interactive icon-only elements only, `inspect_computed_styles`/`scan_page` now
  read the accessible name Chromium computes (accessibility tree via CDP, `Accessibility.getPartialAXTree`)
  and attach it as `accessibleName: { name, source: "chromium" }`. This is the name a screen reader
  receives, inside open shadow roots too: a `title` on a web component's host does **not** name the
  inner `<button>` unless the component passes it on, and the checker follows the browser on that.
  Without CDP, and per element when Chromium ignores the node (display:none, visibility:hidden,
  inside `aria-hidden`) and so computes no name, the name is approximated in accname order —
  `aria-labelledby` (ids resolved in the element's own tree; broken or empty references do not
  count) > `aria-label` (trimmed, non-empty) > `<label>` > `alt`, descendant `<img alt>`, text
  content > `title` — with `source: "atributos"`. The evidence also carries `title`,
  `ariaLabelledby`, `content.labelledbyText`, `content.descendantAlt` and `content.labelText`.
- **Finding.** `emag-2.2` fires only when that name is empty. The old `expected` text mixed the WCAG
  claim with a DS convention ("official circular-button examples always carry aria-label"); the
  convention is not the 4.1.2 rule and is no longer emitted, neither as a finding nor as an
  observation (D-27: no finding without a rule that forbids it). `evidence.data` now carries
  `accessibleName: ""` and `accessibleNameSource`.
- **Out of scope.** The DS CSS findings inside shadow roots also listed in NAT-33 wait for a scope
  policy; nothing in the scorer or the evaluation changed.

Frozen campaigns ran on 2.7.0 (`validator_sha` `b0713083f1823691c516825220b529e420b91cb3`) and are not
changed by this release; a run on 2.8.0 does not compare with 2.7.0 on `emag-2.2`.

### Page-level constraints: Template Base and skip to content (2.7.0)

Until 2.6.0 the page-level guidelines existed only as prose behind `get_page_rules`. An agent could
read them, but a finding based on them had no id the gate recognised, so it could never leave
`unverifiable`; and in the six oracle-arm runs of the 2026-09-18 batteries no agent fetched the
Template Base or the Padrão Mínimo at all. 2.7.0 turns the mandatory anatomy of the Template Base
into citable constraints, the way D-29 turned a component's root tag into `ds-structure-<c>-tag`:

| Constraint | Checks | Norm (`implements`) |
|---|---|---|
| `ds-page-header` | at least one `.br-header` (core) or `<br-header>` (web component) in the document, open shadow roots included | `govbr-3.7.0-template-global-19f93475dc5e` |
| `ds-page-footer` | at least one `.br-footer` or `<br-footer>`, likewise | `govbr-3.7.0-template-global-19f93475dc5e` |
| `ds-page-skip-link` | the first `<a href>` in composed order (shadow roots included) is an in-page anchor whose target exists | `govbr-3.7.0-accessibility-global-538e57855252`, `emag-1.5` |

The source for the two regions is the full text of the official Template Base page held in
`data/ds-page-rules.json` (`page_structure`), which names each area and marks it "(Obrigatório)"
or "(Opcional)"; the constraint carries the excerpt, and a test fails if the excerpt disappears from
the data. D-29 had refused to infer a mandatory footer from the truncated search excerpt "Template
Base como ponto de partida"; the refusal was about the truncated source. `get_page_rules()` publishes
the constraints; `scan_page` runs them under the new `page` check (on by default); `verify_finding`
recognises the ids (`page-constraint-index`) and recomputes them on the document with the
`page-region` and `page-skip-link` predicates. Structured claims: `region` + `observedCount` +
`expectedCondition: "template-base-region-present"` for the regions, `region: "skip-link"` +
`firstLinkHref` + `expectedCondition: "first-link-skips-to-content"` for the skip link; the locator
is `html`. Page prose without an id (breadcrumb first in the content area, menu placement) stays
anchored to a category and `unverifiable`, as before.

Limits: a page with no link at all is not charged for the skip link; the Localização and Navegação
areas are optional and not checked; `title` and `lang` remain axe's (`document-title`,
`html-has-lang`); closed shadow roots are invisible, as everywhere else in the validator. The check applies to every page it
scans, including component test pages that were built without a header or footer — on those the
finding is true to the rule and outside the frozen reference, which is a scope statement of the
reference, not of the checker. Runs under 2.7.0 do not compare with 2.6.0 or earlier.

### What the DS itself ships is not the page's defect (2.6.0)

Measured on a held-out screen built only from official markup (decision log D-51), the unguided
validator had 22% precision: 7 of 11 claims were false, and all 7 came from three causes fixed here.

- **Token checkers charged the page for the DS's own stylesheet.** `core.css` arrives bundled in the
  same file as the page's CSS, so the stylesheet's origin cannot tell the two apart — the content
  can. `npm run build:data` now writes `data/ds-stylesheet.json`: every declaration of the official
  stylesheet for the inspected properties, read through the CSSOM of the same browser that measures
  pages. A declaration whose selector, property and value all match it lands in the element's
  `dsShipped` evidence instead of `authored`, and the checkers only judge `authored`
  (`src/evidence/cssProvenance.ts`). A page value on an official selector, a page rule riding on an
  official selector, and inline style all stay the page's.
- **`ds-token-spacing` judged declarations that lost the cascade.** An authored off-scale px part now
  counts only if it appears in the computed value.
- **`ds-structure-button-tag` refused `<a class="br-button">`**, which the breadcrumb, footer and
  menu examples publish. Component tags are now read from the examples of every component, with
  `tagSources` recording where each comes from. A tag borrowed from another component is accepted
  only in the same use: `<a>` when the link navigates. An anchor doing a button's job
  (`href="#"`, `javascript:`, no href) is still flagged. Element evidence gains `attributes.href`.

The index is tied to the installed `@govbr-ds/core` version (3.7.0): a page on another DS version
is filtered only where its declarations coincide.

### Baseline viewport (2.5.2)

The deterministic baseline CLI (`dist/cli/scan-page.js`) accepts an optional `viewport` in its
request, so the unguided whole-page baseline observes the window the reference declares instead of
Playwright's default 1280×720. The MCP `scan_page` schema does not expose it: the agent-facing
surface is unchanged, but the compiled artifact differs, so batteries record its hash.

### Verification gate (2.5.1)

Compared with 2.5.0, confirmation requires a supported structured assertion, including the expected
condition, and agreement with every live element. Explicit findings no longer bypass server
verdicts. These fixes can change tool answers and report totals: retain the validator version and
compiled-artifact identity when comparing runs; do not relabel historical results as 2.5.1.

`verify_finding` used to answer `confirmed` when the cited rule existed or, with `live`, when the
locator found an element — so rule existence and element presence confirmed arbitrary semantic
claims, and the WCAG branch accepted any `X.Y.Z` (`wcag-9.9.9` passed). Each check is now separate:

| Check | Pass condition |
|---|---|
| `ruleExists` | the id is a member of a versioned registry: KB (`data/knowledge`), e-MAG 3.1 (`data/emag.json`), WCAG 2.2 (`data/wcag-2.2.json`, generated by `npm run build:wcag` from `https://www.w3.org/WAI/WCAG22/wcag.json` with retrieval date and source SHA-256; 86 criteria, 4.1.1 marked obsolete), published checker ids |
| `applicability` | the rule can support a finding — not implementation evidence (D-10), not a check without a norm (D-27/D-32) |
| `evidenceConsistent` | machine-readable claims agree with the token registry; with `live`, the locator resolves in the reproduced state (`actions`, optional `stateFingerprint`, or `scanId`) and the claimed property plus observed value/tag match every element; a claimed state that is not reproduced leaves it `unknown` (limitation, 2.10.0) |
| `violation` | `verified` / `contradicted` by an implemented predicate on **every** asserted element; otherwise `no-predicate`, `not-checked` (`live=false`) or `error` |

| Verdict | Condition |
|---|---|
| `confirmed` | `ruleExists: pass` and `violation: verified` |
| `rejected` | any check `fail`, or `violation: contradicted` |
| `unverifiable` | everything else — a real rule, uncontradicted evidence, a violation this oracle cannot decide |

Predicates exist only where the oracle has a deterministic decision to reuse. Their minimum
structured claims are: `ds-token-color` (`property` + `observedHex` + `expectedCondition:
"registered-govbr-ds-color-token"`), `ds-token-font-family` (`property: "font-family"` + `observed` +
`expectedCondition: "rawline-or-raleway"`), `ds-token-radius` (`property: "border-radius"` +
`observed` + `expectedCondition: "govbr-ds-radius-scale"`), `ds-token-spacing` (`property:
"padding"|"margin"` + `observed` + `expectedCondition: "govbr-ds-spacing-scale"`), and
`ds-structure-<component>-tag` (`component` + `observedTag` + `expectedCondition:
"canonical-component-tag"`), and since 2.7.0 `ds-page-header`/`ds-page-footer` (`region` +
`observedCount` + `expectedCondition: "template-base-region-present"`) and `ds-page-skip-link`
(`region: "skip-link"` + `firstLinkHref` + `expectedCondition: "first-link-skips-to-content"`),
decided on the document rather than on the located element. The deterministic scanners emit these exact fields. Missing structured data leaves the
claim `unverifiable`; an unsupported field or a value/tag that contradicts any live element is
`rejected`. Only after this binding do predicates re-run the same checker on each element. Limits:
no predicate for relations between elements, focus, order, text,
accessible names or dynamic behavior; a state exists only if `actions` reproduce it on a fresh page;
authorship rules apply (an inherited or browser-default value is not the page's). A broad WCAG, e-MAG
or KB citation selects no predicate and stays `unverifiable`. `evidence.observed` and
`evidence.expected` are human-readable explanations; confirmation concerns the structured assertion
and never attempts to infer semantics from this prose.

The server records every result by the SHA-256 of the verified payload (everything except
`verification`). `save_report` ignores the `verification` a caller submits for both agent pathways:
the stored result for the identical payload decides — `confirmed` as findings, `unverifiable` as
labeled `reviewItems` outside the total, and `rejected` refused. An explicit finding with no stored
verification also stays in `reviewItems`, without a fabricated verdict; a heuristic finding never
verified (including a payload changed after verification) is refused. Deterministic findings enter
only by `finding_ids`.

`verify_finding`'s `confirmed` is the oracle's own check. An evaluation harness must not count it
as independent ground truth.

### Egress policy (2.4.0)

The browser-backed tools open whatever URL the client passes. In a measured run that client is the
agent under evaluation, so two variables confine the server's own Chromium:

| Variable | Effect |
|---|---|
| `GOVBR_VALIDATOR_ALLOWED_ORIGINS` | comma-separated origins a tool may open; any other URL fails before loading |
| `GOVBR_VALIDATOR_PROXY_SERVER` | every browser request — subresources, redirects, fetch, frames, workers, loopback included — goes through this proxy |

Unset, behavior is unchanged. The origin check gives a readable error; the proxy is the boundary.
`test/integration/egress-policy.test.ts` pins both, with a no-policy control that does reach the
decoy server.

### Capability profiles (D-28)

`GOVBR_VALIDATOR_TOOL_PROFILE` separates the causal contribution of the server. The profile is
part of the run configuration and must not be pooled across measurements:

| Profile | Exposed capability |
|---|---|
| `normative` | DS/e-MAG rules, tokens, page rules and component specifications |
| `deterministic` | `scan_page` plus retrieval of scanner findings |
| `evidence` | raw authored/computed-style inspection, without rules or scanner verdicts |
| `evaluation` | compatibility profile combining the three pathways plus the verification gate |
| `full` | authoring/development surface, including individual checkers and report persistence |
| `knowledge-free` | 2.14.0: the measurement tools of `evaluation` without the DS + e-MAG package the oracle serves and applies — `scan_page` (axe-core only), `get_finding_details`, `verify_finding` (state replay, WCAG 2.2 registry, P1 predicates). WCAG and axe-core remain; see *Knowledge-free profile* below |

The deterministic profile exposes no normative resources, and the normative profile exposes no
scanner. This makes norms-only, scanner-only and evidence-only arms mechanically distinct instead
of treating “the oracle” as one indivisible package.

## Architecture notes

- The **agent is integrated, not implemented** (N+M): any MCP client LLM drives the tools; this
  package contains no LLM calls.
- One shared headless Chromium per server process (the PoC relaunched per call).
- All data assets are generated from the *installed* `@govbr-ds/core` (v3.7.0) — upgrade the
  package, re-run `build:data`, and the oracle follows the DS version.
- The **knowledge base** (`data/knowledge/` — see its README) is versioned separately: the server
  warns at startup when the installed `@govbr-ds/core` diverges from the KB `dsVersion`. The DS
  has **36** components (tarball-verified — see `docs/README.md` and the KB conflicts report).
- Three-way epistemic separation (D-10): normative rules ≠ implementation evidence ≠ observed
  defects. Enforced in code: `get_ds_rules` listings never mix `force=example` records into
  normative results, and `verify_finding` rejects findings that cite evidence as the violated rule.
- A deterministic checker that cannot name the norm it implements **produces no finding** (D-27).
  Each checker declares its rule via `implements`, and reports that id; the gate checks the id
  *exists* in the oracle, not merely that it is well-formed. Non-canonical class variants
  (`ds-structure-*-variant`) left the Findings channel entirely — a class the DS does not publish
  is an observation, not a violation.
- Rules derived from a **truncated source** carry an explicit inference caveat (D-29): the Template
  Base being a starting point does not imply a mandatory footer or any other region the source
  never declares. The caveat travels with the rule so an agent cannot quietly infer subcomponents.
- `relatedSelectors[]` lets a rule name the other participants of a **relational** requirement (a
  form, its field, and the dynamic message that announces the error), so scoring stops being
  sensitive to which of the three nodes an agent chose to narrate the same failure from.
