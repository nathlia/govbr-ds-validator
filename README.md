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
| C3 | Anti-hallucination gate for heuristic findings | `verify_finding` + enforcement in `save_report` |
| C5 | Evidence gathering separated from judgment | `inspect_computed_styles` (collect-only) |
| D2 | Finding schema: evidence + rule + expected (+ severity, locator, taxonomy) | `src/schema/finding.ts`, resource `govbr://schema/finding` |
| D3 | Human + machine report formats | `save_report` → `.md` + `.json` |
| D4 | Auditable reasoning traces per finding | `trace` field, persisted in both formats |

## Tools

**Oracle knowledge** (read-only):
- `get_ds_rules (id?, ids?, component?, category?, force?, validationStrategy?, automatable?, automationConfidence?, severitySuggestion?, standard?, query?, include_evidence?)` — authoritative KB store; exact ids can be fetched in one batch
- `get_design_tokens (query?)` — semantic highlights + hex→token reverse index, or filtered token list
- `get_emag_rules (section?, id?)` — complete e-MAG 3.1 (45/45 recommendations) + KB validation template per rule
- `get_page_rules (category?)` — gov.br DS page-level guidelines
- `list_components ()` / `get_component_spec (component, include_examples?)` — canonical structure contracts; HTML examples are opt-in

**Evidence (C5 phase 1)**:
- `inspect_computed_styles (url, selector?, selectors?, properties?)` — batches selectors and returns only requested computed/focus properties plus structural evidence

**Deterministic checkers (no LLM)** — bounded pages, compact by default:
- `scan_page (url, selectors?, checks?, tokenChecks?, components?, actions?, compareToScanId?, detail?, cursor?, limit?, maxChars?)` — one-load aggregate fast path with bounded setup actions, state/finding diffs, exact cache and evidence ledger
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
state of another MCP server's browser. Supported actions are bounded click, fill, key press and wait.

**Gate + report**:
- `verify_finding (finding, live?)` — layered verification: rule exists in oracle → token claims consistent → optional live DOM re-inspection
- `save_report (url, finding_ids?, findings?, notes?)` — stored deterministic ids + agent-created Findings, validation and dual-format persistence

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
