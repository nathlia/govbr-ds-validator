# Docs — govbr-ds-validator

Home for the server's documentation: architecture decisions, tool contracts, requirement
traceability details (tcc2-requirements A/B/C/D items), and thesis excerpts about the artifact.

**The master decision log + implementation plan lives at
`../../thesis-workspace/tcc2-decisions-log.md`** — read it before making architectural changes.
Key decisions affecting this repo: D-10 (three-way separation: norms / evidence / defects, with
example-evidence never overriding required/prohibited rules), D-11 (the DS knowledge base —
promoted into this repo at `data/knowledge/` in Phase 1; raw batches 01–06 archived at
`TCC/ds-rules/` — becomes the authoritative rule store, integration Phase 2), D-14
(the DS has **36** components, not 37 — verified against the `@govbr-ds/core` 3.7.0 tarball,
sha256 `2b8f13b0a1427f101f9f7aa81751b1bafe829e17305b1727fc2a0e3326781247`; see
`data/knowledge/versions/3.7.0/reports/conflicts.json`).
