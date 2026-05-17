# Install — ai-reviewer-qa

Two steps to wire this reviewer into any `sfg-labs` repo. Runs purely on
deterministic static analyzers — no API keys required, $0 runtime cost.

## 1. Add the workflow

`.github/workflows/ai-review.yml`:

```yaml
name: ai-review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  qa:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      # OPTIONAL — feed jest coverage to the reviewer.
      # 1) Generate the BASE coverage from the PR's target branch.
      # 2) Stash it at .ai-review/base-coverage.json.
      # 3) Run jest on the HEAD ref to produce coverage/coverage-summary.json.
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm install --no-audit --no-fund
      - name: Base coverage
        run: |
          mkdir -p .ai-review
          git fetch origin "${{ github.base_ref }}":base
          git worktree add /tmp/base base
          (cd /tmp/base && npm install --no-audit --no-fund && npx jest --coverage --silent || true)
          cp /tmp/base/coverage/coverage-summary.json .ai-review/base-coverage.json
      - name: Head coverage
        run: npx jest --coverage --silent || true

      # OPTIONAL — bundle stats for FE PRs
      - run: npm run build --if-present
      # webpack-bundle-analyzer writes to ./webpack-stats.json by convention

      # OPTIONAL — base OpenAPI for diffing
      - run: |
          if [ -f /tmp/base/openapi.yaml ]; then
            cp /tmp/base/openapi.yaml .ai-review/base-openapi.yaml
          fi

      - uses: sfg-labs/ai-reviewer-qa@main
        with:
          github-token:      ${{ secrets.GITHUB_TOKEN }}
          max-tokens:        50000
          bundle-budget-kb:  50
```

## 2. (Optional) Customize per-repo

Add `.github/ai-review.yml`:

```yaml
qa:
  bundle_budget_kb: 100
  fail_on_coverage_drop: true
  fail_on_breaking_api: true
  ignore_paths:
    - 'examples/**'
    - 'scripts/**'
  rule_overrides:
    PERF.MEMO.001:
      disabled: true
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | yes | — | `${{ secrets.GITHUB_TOKEN }}` |
| `config-path` | no | `.github/ai-review.yml` | Per-repo config path |
| `max-tokens` | no | `50000` | Token budget — over → SKIPPED |
| `bundle-budget-kb` | no | `50` | Bundle-asset growth allowed |
| `database-url` | no | _empty_ | Optional Postgres URL for `EXPLAIN` |
| `coverage-base-ref` | no | PR base | Override base ref for coverage diff |
| `fail-on-coverage-drop` | no | `true` | `COV.DROP.001` → REQUEST_CHANGES |
| `fail-on-breaking-api` | no | `true` | `API.BREAK.001` → REQUEST_CHANGES |

## Outputs

| Output | Description |
|---|---|
| `verdict` | `APPROVE` / `COMMENT` / `REQUEST_CHANGES` / `SKIPPED` |
| `findings-count` | Total findings posted |
| `rule-pack-version` | Rule pack version used |
| `coverage-delta` | Avg line-coverage delta (pp) on changed files |

## Token budget

If the PR diff exceeds the configured budget (default 50K input tokens), the
action posts a SKIPPED outcome and no GitHub comments are created. This keeps
analyzer runtime predictable on huge PRs.

## Troubleshooting

- **No findings posted, but I expected some.** Confirm the workflow has
  `permissions: pull-requests: write`. Also: every finding must fall on a
  line that exists in the PR's new-file diff — otherwise GitHub rejects the
  inline comment.
- **Coverage diff not running.** The reviewer needs both
  `.ai-review/base-coverage.json` and `coverage/coverage-summary.json` on
  disk. See the workflow snippet above.
- **OpenAPI diff not running.** Place the base spec at
  `.ai-review/base-openapi.yaml`; the head spec is auto-discovered
  (`openapi.yaml`, `openapi.json`, `docs/openapi.*`, `spec/openapi.yaml`).
