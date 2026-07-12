# gov.br Design System Knowledge Base — Batch 001

**Stable version:** 3.7.0  
**Generated:** 2026-07-11T06:32:04+00:00  
**Completion status:** Partial, explicitly checkpointed

## Extracted

- Stable-version metadata and root documentation references.
- A durable crawl queue for 37 components and their Developer, Designer and Accessibility tab targets.
- 15 atomic normalized rules from official gov.br Design System pages.
- Initial component records for Button, List, Modal and Table.
- Initial iconography and development-distribution rules.
- Initial token reverse index.
- JSON Schema for atomic rule validation.

## Sources

Only official gov.br Design System pages were used for normalized rules.  
The local `govbr-ds-validator` specification was used only to seed the component crawl queue.

## Not yet complete

Full raw HTML, dynamic tab capture, canonical code examples, most design tokens, page patterns,
e-MAG, templates, release history and migration documentation remain queued.

## Integration guidance

The MCP server can already load `versions/3.7.0/normalized/rules.jsonl` as an append-only
rule resource. Rule IDs are deterministic, and future batches should merge by ID while appending
additional source locations and evidence.


---

# Batch 002 Update

**Generated:** 2026-07-11T06:37:25+00:00

Added 31 new atomic rules, bringing the cumulative corpus to 46 rules.
This pass expanded keyboard, composition, copy, color, typography and grid coverage.
Full-page browser capture remains incomplete and is explicitly represented as such in each source record.


---

# Batch 003 Update

**Generated:** 2026-07-11T06:44:34+00:00

Batch 003 added 40 atomic rules. It introduces a separately versioned eMAG 3.1
layer with 30 numbered recommendations, WCAG mappings and validator templates.
The cumulative corpus now contains 86 rules across 26
partially covered components. The overall crawl remains incomplete.


---

# Batch 004 Update

**Generated:** 2026-07-11T06:52:44+00:00

The eMAG 3.1 normalized index is now complete at 45/45 recommendations.
The official `@govbr-ds/core` 3.7.0 package confirms 36
components, provides 172 canonical example files, and contains
1253 token declarations. Structural signatures and reverse token indexes
are now available for MCP consumption. The overall site crawl remains incomplete.


---

# Batch 005 Update

**Generated:** 2026-07-11T06:59:57+00:00

Batch 005 added 28 rules across development guides, patterns, templates and
official quality-review criteria. A static audit of the official package found
6 accessibility anomalies and 63 HTML files referencing
the legacy CDN. The cumulative corpus now contains 168 atomic records.
The overall crawl remains incomplete.


---

# Batch 006 Finalization

**Generated:** 2026-07-11T07:06:33+00:00

The project is now complete under the `tcc-validator-core` profile.

Batch 006 added 18 rules for WAI-ARIA, semantic HTML, Sass conventions,
component lifecycle and the Item component. Browser support was archived as non-validator
context. Migration history, exhaustive tab transcription and preservation-grade audits were
removed from the completion criteria by scope decision.

The final corpus contains 186 atomic rules and passed the retained integrity checks.
It is intentionally a validator knowledge base rather than a full website mirror.
