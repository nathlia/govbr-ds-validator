# govbr-ds-validator

MCP oracle server (TypeScript) — the TCC 2 artifact. Exposes gov.br DS + e-MAG 3.1 knowledge as
MCP tools/resources, runs the deterministic checkers, and ships the `validate_page` procedure as
an MCP prompt. See README.md for the tool list and requirement traceability.

## Development

- Node 18+ required (`nvm use 25` — system default is 16 and will not run the MCP SDK).
- `npm test` — vitest: unit + in-memory MCP integration + live-browser e2e (self-contained fixtures)
- `npm run build` — tsc → `dist/` (**the MCP registration runs `dist/`, rebuild after src changes**)
- `npm run build:data` — regenerate `data/` after upgrading `@govbr-ds/core`

## Rules

- No LLM calls in this package — the agent is an external MCP client (N+M integration).
- Never copy `govbr-eval/ground-truth.json` content (case → violation mapping) into this repo,
  its fixtures, or its docs beyond what a generic checker legitimately encodes.
- Reports: default `reports/`; the thesis setup overrides with `GOVBR_VALIDATOR_REPORTS_DIR`
  → `../govbr-eval/reports` (set in `F:/Dev Nath/TCC/.mcp.json`).

## Related repositories

- `../govbr-corpus` — app under test (dev server :3000)
- `../govbr-eval` — gabarito, baselines, scoring, dashboard (:4000)
- `../poc-tcc1` — frozen TCC 1 PoC (do not modify)
