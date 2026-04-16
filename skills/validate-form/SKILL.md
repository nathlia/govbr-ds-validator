# Skill: validate-form

e-MAG Section 6 form compliance check. Focused on label associations, required fields, error handling, and DS form patterns.

## When to use
When you want to audit a form specifically — faster than validate-page, deeper than a linter.

## Trigger
"validate the form at [URL]" or "/validate-form [URL]"

## Steps

1. `get_emag_rules` — load the e-MAG reference (focus on section 6_forms)

2. Navigate and snapshot:
   - `browser_navigate` to URL
   - `browser_snapshot` — the accessibility tree reveals label associations directly:
     - `textbox "Label text"` → properly associated label ✅
     - `textbox` (no name) → broken or missing label ❌
     - `textbox "Placeholder text"` where the name comes from placeholder → e-MAG 6.2 violation ❌

3. `inspect_computed_styles` with `selector: "input, select, textarea, button, label"` — check DS token compliance on form elements

4. **Reason about these specific form rules:**

   | Rule | What to look for |
   |------|-----------------|
   | e-MAG 6.2 | Every input has an accessible name from a `<label>`, NOT from placeholder |
   | e-MAG 6.2 | `label[for]` matches `input[id]` exactly — mismatch = no association |
   | e-MAG 6.3 | Required fields have `aria-required="true"` AND visual indicator |
   | e-MAG 6.5 | Complex inputs (CPF, date, phone) have format instructions BEFORE the field |
   | e-MAG 6.6 | Error messages exist in DOM AND are linked via `aria-describedby` |
   | DS pattern | Destructive actions use `danger` variant + paired cancel button |
   | DS pattern | Submit button is always primary; cancel is always secondary and comes first |
   | DS pattern | Button order: [secondary] [primary] — never reversed |

5. Report each form section (`data-testid`) separately with its violations.

## Key insight for the thesis
The accessibility tree is the ground truth for form validation — it shows what a screen reader actually sees, which is often different from what the HTML looks like. A `textbox` with no accessible name in the tree means the label is broken, regardless of what the HTML has nearby.
