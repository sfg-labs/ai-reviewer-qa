# Rule catalog — ai-reviewer-qa v1.0.0

Eleven rules ship in v1. Each rule's authoritative doc lives at
`src/rule-packs/<RULE_ID>.md`; this page is the index.

| Rule ID | Severity (default) | Source | Verdict impact |
|---|---|---|---|
| [PERF.NPLUS1.001](../src/rule-packs/PERF.NPLUS1.001.md) | HIGH | static + Claude | COMMENT |
| [PERF.QUERY.001](../src/rule-packs/PERF.QUERY.001.md) | HIGH | static + Claude | COMMENT |
| [PERF.INDEX.001](../src/rule-packs/PERF.INDEX.001.md) | MEDIUM | `EXPLAIN` (DATABASE_URL) | COMMENT |
| [PERF.BUNDLE.001](../src/rule-packs/PERF.BUNDLE.001.md) | MEDIUM (HIGH if 4× budget) | webpack stats diff | COMMENT |
| [PERF.MEMO.001](../src/rule-packs/PERF.MEMO.001.md) | LOW | static + Claude | COMMENT |
| [COV.DROP.001](../src/rule-packs/COV.DROP.001.md) | MEDIUM (HIGH if ≥5pp drop) | Istanbul summary diff | **REQUEST_CHANGES** |
| [COV.NEW.001](../src/rule-packs/COV.NEW.001.md) | MEDIUM | Istanbul summary | COMMENT |
| [API.BREAK.001](../src/rule-packs/API.BREAK.001.md) | HIGH | OpenAPI diff | **REQUEST_CHANGES** (unless `breaking-change` label) |
| [API.UNDOC.001](../src/rule-packs/API.UNDOC.001.md) | MEDIUM | OpenAPI diff | COMMENT |
| [FLAKY.001](../src/rule-packs/FLAKY.001.md) | MEDIUM | static | COMMENT |
| [LOAD.001](../src/rule-packs/LOAD.001.md) | MEDIUM | static | COMMENT |

## Suppression

Add a comment on (or ±1 line of) the flagged line:

```ts
// ai-review-ignore: <RULE_ID> — reason
```

Supported markers: `//`, `#`, `<!-- ... -->`.

## Per-repo overrides

In your repo's `.github/ai-review.yml`:

```yaml
qa:
  bundle_budget_kb: 100
  fail_on_coverage_drop: true
  fail_on_breaking_api: true
  ignore_paths:
    - 'examples/**'
  rule_overrides:
    PERF.MEMO.001:
      disabled: true
    LOAD.001:
      severity: HIGH
```

## Reproducibility

Every comment includes:

- `rule_pack_version` (semver, bumped on rule changes)
- `analyzer_version` for the static analyzer that produced the finding
- The head commit SHA on the summary

Re-running on the same commit with the same `rule_pack_version` is deterministic.
