# COV.DROP.001 — Line coverage dropped on changed file

- **Severity (default):** MEDIUM (HIGH if drop ≥ 5 pp)
- **Category:** Coverage
- **Source:** Istanbul `coverage-summary.json` diff (head vs base)
- **Citation:** [Istanbul — Coverage Reporters](https://istanbul.js.org/docs/advanced/alternative-reporters/)

## Why

If a file you touched in this PR has lower line coverage than on `main`, you either
added uncovered code or deleted tests. Both are reviewable signals.

## How to check locally

```bash
git fetch origin main
git checkout origin/main -- coverage/
mv coverage/coverage-summary.json .ai-review/base-coverage.json
git checkout -
npm test -- --coverage
diff <(jq '.total.lines.pct' .ai-review/base-coverage.json) \
     <(jq '.total.lines.pct' coverage/coverage-summary.json)
```

## Fix

Add tests for the new/modified branches. If the drop is intentional (e.g. you deleted
an entire module that had tests), explain it in the PR description and the reviewer
will downgrade severity in the next pass.

## Verdict impact

`COV.DROP.001` triggers **REQUEST_CHANGES** when `fail_on_coverage_drop: true`
(the default).
