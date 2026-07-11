# Docs — govbr-ds-validator

Home for the server's documentation: architecture decisions, tool contracts, requirement
traceability details (tcc2-requirements A/B/C/D items), and thesis excerpts about the artifact.

**The master decision log + implementation plan lives at
`../../thesis-workspace/tcc2-decisions-log.md`** — read it before making architectural changes.
Key decisions affecting this repo: D-10 (three-way separation: norms / evidence / defects, with
example-evidence never overriding required/prohibited rules), D-11 (the DS knowledge base at
`TCC/ds-rules/06` becomes the authoritative rule store — integration Phases 1–2), D-14
(the DS has **36** components, not 37).
