# ai-reviewer-qa

AI-driven PR reviewer for **QA concerns**:
- N+1 queries, query-in-loop, missing-index detection
- Bundle-size regressions on FE PRs
- Test-coverage drops on changed files
- OpenAPI contract breaks
- Skipped tests, missing rate limits, React memoization

Consumed as a reusable GitHub Action by every repo in [`sfg-labs`](https://github.com/sfg-labs).

## Quick start

In your repo's `.github/workflows/ai-review.yml`:

```yaml
jobs:
  qa:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: sfg-labs/ai-reviewer-qa@main
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token:      ${{ secrets.GITHUB_TOKEN }}
```

See [`docs/INSTALL.md`](./docs/INSTALL.md) for the full setup, including how
to feed it `coverage/coverage-summary.json` and `webpack-stats.json`.

## Verdict policy

- **REQUEST_CHANGES** if coverage drops on changed files (toggle via `fail-on-coverage-drop`)
- **REQUEST_CHANGES** if OpenAPI diff is breaking and the PR isn't labelled `breaking-change`
- **APPROVE** if zero findings
- **COMMENT** otherwise

## Rule pack v1

11 rules — see [`docs/RULES.md`](./docs/RULES.md).

| Category | Rule IDs |
|---|---|
| Performance | `PERF.NPLUS1.001`, `PERF.QUERY.001`, `PERF.INDEX.001`, `PERF.BUNDLE.001`, `PERF.MEMO.001` |
| Coverage | `COV.DROP.001`, `COV.NEW.001` |
| API contract | `API.BREAK.001`, `API.UNDOC.001` |
| Hygiene | `FLAKY.001`, `LOAD.001` |

## Local dev

```bash
npm install
npm test               # jest --coverage, >=95% threshold
npm run build          # ncc -> dist/index.js (committed)
```

## Polyrepo home

- Org: [`sfg-labs`](https://github.com/sfg-labs)
- Built by: Faith & Gamble IT x Suwalka Motors JV
