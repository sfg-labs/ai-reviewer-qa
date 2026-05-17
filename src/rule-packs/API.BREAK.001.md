# API.BREAK.001 — Breaking OpenAPI change without `breaking-change` label

- **Severity (default):** HIGH
- **Category:** API contract
- **Source:** OpenAPI diff (head vs base spec)
- **Citation:** [OpenAPI Specification 3.1](https://spec.openapis.org/oas/v3.1.0)

## What counts as breaking

- Removing a path or method
- Renaming a required parameter
- Adding a new **required** request parameter
- Removing a documented response code

## How to land it anyway

Two-step:

1. Apply the `breaking-change` label on the PR.
2. Document the migration in the PR description (or link a `MIGRATIONS.md` entry).

The reviewer will downgrade the finding to a comment when the label is present.

## Verdict impact

`API.BREAK.001` triggers **REQUEST_CHANGES** when `fail_on_breaking_api: true`
(the default) AND the `breaking-change` label is absent.

## Suppress (single endpoint)

```yaml
qa:
  rule_overrides:
    API.BREAK.001:
      severity: MEDIUM
```
