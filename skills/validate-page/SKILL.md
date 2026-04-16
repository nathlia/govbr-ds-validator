# Skill: validate-page

Full gov.br DS validation of any page — accessibility + token compliance.

## When to use
When you want a complete report on a page: both e-MAG accessibility violations and design token violations.

## Trigger
"validate [URL]" or "/validate-page [URL]"

## Steps

1. **Get the reference data** (call both in parallel):
   - `get_design_tokens` — token reference (colors, typography, spacing, radii)
   - `get_emag_rules` — e-MAG accessibility rules

2. **Inspect the page** (call both in parallel):
   - `browser_navigate` to the URL, then `browser_snapshot` — accessibility tree (structure, ARIA, roles, label associations)
   - `inspect_computed_styles` with the URL — computed CSS values for all interactive elements

3. **Reason about violations** — cross-reference observations against the two references:
   - Accessibility tree → e-MAG structural/behavioral rules
   - Computed styles → DS token compliance
   - Composition patterns → DS UX patterns (destructive actions, form structure, button order)

4. **Report** using this structure per violation:
   ```
   ❌ [violation title]
   Rule: [e-MAG X.X or DS token name]
   Observed: [what you actually found]
   Expected: [what the spec requires]
   Fix: [concrete code change]
   Severity: error | warning
   Detectable by linter: yes | no
   ```

5. Finish with a summary table: element | violation | severity | linter-detectable

## Notes
- If the page uses client-side navigation (SPA), navigate to the specific page state before inspecting
- Prioritize errors over warnings in the report
- The "Detectable by linter" column is important for the thesis argument — always fill it
