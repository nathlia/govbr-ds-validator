# govbr-ds-validator

PoC for the thesis "Um Framework de Validação de Interfaces Baseado em Agentes de IA e Protocolo MCP".

## What this is

A proof-of-concept validation framework that combines:
- **`@playwright/mcp`** — browser automation + accessibility tree inspection
- **`govbr-ds` MCP server** — gov.br DS token reference + e-MAG rules + computed CSS inspection

The agent (Claude) orchestrates both to validate gov.br Design System compliance in ways that static linters and visual regression tools cannot.

## MCP servers required

Both must be running (registered in Claude Code user config):
- `playwright` — official Playwright MCP (`@playwright/mcp`)
- `govbr-ds-validator` — local DS knowledge server (`mcp-server/index.js`)

## Skills

| Trigger | Skill | Use when |
|---------|-------|----------|
| "validate [URL]" | `skills/validate-page/SKILL.md` | Full report — a11y + tokens |
| "validate the form at [URL]" | `skills/validate-form/SKILL.md` | Form e-MAG compliance only |
| "check tokens at [URL]" | `skills/validate-tokens/SKILL.md` | Token compliance only, no a11y |
| "evaluate all" | `skills/evaluate-all/SKILL.md` | Formal evaluation — all cases, saves agent-results.json |

When any of these triggers is used, read the corresponding SKILL.md and follow its steps exactly.

## Evaluation workflow

1. Start dev server: `cd app && npm run dev`
2. Run `/evaluate-all` — agent evaluates all cases, writes `results/agent-results.json`
3. In the app, click **▶ Executar axe-core** to record axe real results
4. Score: `cd scripts && npm run score` (or `npm run score:verbose` for per-case breakdown)

## App

- Dev server: `cd app && npm run dev` → http://localhost:3000
- Pages: `/` (Botões) and Formulário tab
- Node: use v25 (`nvm use 25`) — MCP SDK requires Node 18+

## MCP server

- Location: `mcp-server/index.js`
- Start: automatically managed by Claude Code
- Tools: `get_design_tokens`, `get_emag_rules`, `inspect_computed_styles`
