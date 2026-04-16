# Skill: validate-tokens

Design token compliance check only. Ignores accessibility, focuses on whether computed CSS values match gov.br DS tokens.

## When to use
When a developer says "the styles look off" or after a CSS refactor — quick check that no token values were accidentally overridden.

## Trigger
"check tokens at [URL]" or "/validate-tokens [URL]"

## Steps

1. `get_design_tokens` — load the token reference

2. `inspect_computed_styles` with the URL — get computed CSS for all interactive elements

3. **Compare each element's computed styles against the token reference:**

   | Property | Valid values |
   |----------|-------------|
   | `backgroundColor` on `.primary` | `rgb(19, 81, 180)` only |
   | `backgroundColor` on `.secondary` | `rgb(255, 255, 255)` |
   | `backgroundColor` on `.danger` | `rgb(229, 34, 7)` |
   | `fontFamily` | Must contain "Rawline" or "Raleway" |
   | `fontSize` on `.br-button` | `~16.8px` (14px × 1.2 scale) |
   | `borderRadius` | `0px`, `4px`, `8px`, `16px`, `500px+` (pill), or `50%` (circle) |
   | `color` on primary | `rgb(255, 255, 255)` |

4. Flag any computed value that doesn't match a valid token — include:
   - What was found
   - What token it should be
   - Whether it came from an inline style or a CSS class override (check `inlineStyle` field)

5. Short summary: N elements checked, N token violations, N inline style overrides.

## Notes
- Token violations without inline styles = CSS class override somewhere in the stylesheet (harder to find, more important to flag)
- Token violations WITH inline styles = dev bypassed the token system directly (easier fix)
- Don't report accessibility issues — use validate-form or validate-page for those
