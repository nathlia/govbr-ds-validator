# govbr-ds-validator — MCP server (TCC 2 artifact)

The validation **oracle** of the thesis *"Um Framework de Validação de Interfaces Baseado em
Agentes de IA e Protocolo MCP"* (UFSM). It exposes gov.br Design System (Padrão Digital de
Governo) and e-MAG 3.1 knowledge as queryable MCP tools/resources, runs the deterministic
("syntactic") half of the hybrid validation architecture itself, and ships the standardized
validation procedure as an MCP prompt.

Supersedes the TCC 1 proof of concept (archived in `../poc-tcc1`).

## Related repositories

| Repo | Role |
|---|---|
| `../govbr-corpus` | React app under test (`@govbr-ds/core`) — carries **no** answer key |
| `../govbr-eval` | Ground truth, axe-core baseline, P/R/F1 scoring, results dashboard |

## Requirement traceability (tcc2-requirements.md)

| Req | What | Where |
|-----|------|-------|
| A1 | Rules as queryable tools/resources, never prompt text | `get_ds_rules` over the KB (`data/knowledge/`, 186 rules — D-11) + all tools + `govbr://` resources |
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
- `scan_page (url, selectors?, checks?, tokenChecks?, components?, actions?, arrival?, compareToScanId?, detail?, cursor?, limit?, maxChars?)` — one-load aggregate fast path (`tokens`, `structure`, `axe`, `page`) with bounded setup actions, measured state arrival (2.10.0), state/finding diffs, exact cache and evidence ledger
- `check_token_compliance (url, selector?, selectors?, checks?, detail?, cursor?, limit?, maxChars?)` — batched colors/fonts/radii/spacing vs. token registry
- `check_component_structure (url, component?, selectors?, detail?, cursor?, limit?, maxChars?)` — batched DOM vs. canonical spec
- `run_axe_scan (url, selector?, selectors?, detail?, cursor?, limit?, maxChars?)` — batched axe-core with e-MAG cross-references
- `get_finding_details (ids? | scanId?, detail?, cursor?, limit?, maxChars?)` — retrieves selected evidence or continues a stored scan without rerunning it

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
| `ds-page-skip-link` | the first `<a href>` in composed order (shadow roots included) is an in-page anchor whose target exists | `govbr-3.7.0-accessibility-global-7d2b85f81c52`, `emag-1.5` |

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
