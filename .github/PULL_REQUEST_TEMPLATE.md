## What changed
<!-- 1-3 lines on the intent of this PR -->

## Why
<!-- Why is this change needed? Link issue if any. -->

## How
<!-- Brief technical notes on the approach. -->

## Tests
- [ ] `npm test` passes locally
- [ ] Coverage ≥ 95% (jest threshold)
- [ ] `npm run build` regenerates `dist/index.js` and the result is committed

## Rule-pack changes
- [ ] Bumped `RULE_PACK_VERSION` in `src/version.ts` if rule semantics changed
- [ ] Added/updated `src/rule-packs/<RULE_ID>.md`
- [ ] Updated `docs/RULES.md`

## AI review
The 3 AI reviewers (security, quality, qa) will comment automatically.

## Checklist
- [ ] No `--no-verify` / `--force` bypassing CI
- [ ] `dist/index.js` is in sync with `src/` (CI verifies)
