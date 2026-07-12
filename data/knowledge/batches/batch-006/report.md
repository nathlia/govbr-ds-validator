# Batch 006 Report

Generated: 2026-07-11T07:06:33+00:00

## Scope decision

This batch finalizes the **TCC-focused validator corpus** rather than a preservation-grade
mirror of the entire gov.br Design System website.

The following areas were explicitly removed from the completion criteria:

- migration and release history;
- exhaustive transcription of every component tab;
- browser-version support policy;
- full network broken-link and full-site completeness audits.

A lightweight integrity check remains because malformed JSON or duplicate IDs would break
the MCP server.

## Added

- 18 new atomic rules.
- WAI-ARIA role/state/property guidance.
- Semantic HTML, DOM order and form-label guidance.
- Sass documentation conventions.
- Component initialization, dependency and lifecycle guidance.
- Targeted Item component rules covering anatomy, composition, spacing, interaction and states.
- An explicit machine-readable scope profile.
- Archived browser-support data outside the active validator corpus.

## Final corpus status

- 186 cumulative atomic records.
- 45/45 eMAG recommendations.
- 1,253 official token declarations.
- 36 official components with package structure metadata.
- 172 official component example metadata records.
- Package accessibility/conflict evidence retained.
- Integrity checks: **passed**.

## Completion statement

The batches are complete for the `tcc-validator-core` profile.

This is not a complete archival copy of every sentence on the website. It is the finalized,
traceable knowledge base needed for the thesis prototype and MCP validation workflow.
