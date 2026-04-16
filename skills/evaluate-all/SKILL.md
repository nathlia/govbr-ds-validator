# Skill: evaluate-all

Formal evaluation run — systematically tests every case in the test suite and produces a machine-readable JSON verdict for scoring against ground-truth.

## When to use
When you need to record the agent's actual detection results for thesis scoring. Run this after any change to the test app or DS rules.

## Trigger
"evaluate all" or "/evaluate-all"

## Output contract

Every case gets a verdict object:
```json
{
  "TC-B-01": { "detected": false, "violations_found": [], "notes": "..." },
  "TC-B-02": { "detected": true,  "violations_found": ["violation description"], "notes": "..." }
}
```
- `detected: true`  → at least one violation found in this section
- `detected: false` → no violations found (correct implementation or false negative)
- `violations_found` → list of violation descriptions (empty for clean cases)
- `notes` → brief reasoning (what you observed and why you decided)

## Steps

### 1. Load all references in parallel
- `get_design_tokens` — token reference (colors, typography, radii)
- `get_emag_rules` — full e-MAG v3.1 (focus on sections 1 and 6)
- `get_component_examples` with `component: "button"` — canonical DS button HTML

### 2. Inspect buttons page
- `browser_navigate` to `http://localhost:3000`
- `browser_snapshot` — full accessibility tree (element names, roles, ARIA attributes, label associations)
- `inspect_computed_styles` — computed CSS for all interactive elements (background-color, font-family, border-radius, etc.)

### 3. Inspect forms page
- `browser_click` on the "Formulário" tab in the nav
- `browser_snapshot` — accessibility tree for forms
- `inspect_computed_styles` with `selector: "input, select, textarea, button, label"` — form element styles

### 4. Evaluate each case

Work through each `data-testid` section. For each case apply the relevant checks:

#### Structural checks (from snapshot)
| What to check | Violation signal |
|---------------|-----------------|
| Element type | `<div class="br-button">` instead of `<button>` |
| Accessible name on icon buttons | No `aria-label`, no visible text, icon has `aria-hidden` |
| aria-label vs visible text | `aria-label` ≠ `textContent` on the same button |
| label[for] ↔ input[id] | `for` attribute value not found as any input's `id` |
| Input accessible name | `textbox` with no name in snapshot = broken label |

#### Token checks (from computed styles + token reference)
| What to check | Data source | Violation signal |
|---------------|-------------|-----------------|
| background-color | `computed.backgroundColor` | Value not in `hexLookup` and not `rgb(...)` of a valid token |
| font-family | `computed.fontFamily` | Does not start with "Rawline" or include "Raleway" as first real font |
| border-radius | `computed.borderRadius` | Value not in {0px, 4px, 8px, 16px, 500px+, 50%} |
| focus outline | `focusedComputed.outline` + `focusedComputed.boxShadow` | Both are "none" or "0px" while the element has `br-button` class — focus indicator suppressed |

#### e-MAG checks (from snapshot + e-MAG rules)
| What to check | Violation signal |
|---------------|-----------------|
| Placeholder-only label | Input accessible name comes from placeholder, not a `<label>` |
| Required field programmatic | Label text has `*` but input has no `aria-required` and no `required` |
| Format hint for complex fields | CPF/date/phone input with no hint element before it in DOM |
| Error message linkage | `aria-invalid=true` + visible error `<p>` in DOM but no `aria-describedby` |
| Visible label for selects | `<select>` has `aria-label` but no `<label>` element visible in snapshot |

#### DS pattern checks (from snapshot, compositional)
| What to check | Violation signal |
|---------------|-----------------|
| Button order | In any form/section, primary button appears BEFORE secondary button |

### 5. Build and save the verdict

After evaluating all cases, construct the final JSON:

```json
{
  "timestamp": "<current ISO timestamp>",
  "model": "claude-sonnet-4-6",
  "appUrl": "http://localhost:3000",
  "verdicts": {
    "TC-B-01": { "detected": false, "violations_found": [], "notes": "..." },
    ...
  }
}
```

Write this JSON to **both** of these files:
- `results/agent-results.json`
- `app/public/agent-results.json`

### 6. Print a summary

After saving, print a one-line summary per case:
```
TC-B-01  ✓ clean     (reference)
TC-B-02  ✗ detected  Button has no accessible name
TC-B-03  ✗ detected  <div> used instead of <button>
...
```

## Notes for thesis validity

- **Do not read `ground-truth.json` before evaluating** — verdicts must come from what you actually observe in the app, not from prior knowledge of expected results.
- The token check for background-color: convert the computed `rgb(r, g, b)` to hex and look it up in the token reference's `hexLookup`. A value not in `hexLookup` is a violation only if it is applied to an element that is supposed to follow DS tokens (i.e., has a `br-button` class).
- For font-family: DS requires `Rawline` as the primary font. The computed value will include fallbacks — flag only if `Rawline` is completely absent from the computed font stack AND the element uses `br-button` classes.
- For the aria-label vs visible text check: normalize both strings (trim, lowercase) before comparing.
