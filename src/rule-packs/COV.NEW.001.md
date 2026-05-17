# COV.NEW.001 — New file added without tests

- **Severity (default):** MEDIUM
- **Category:** Coverage
- **Source:** Istanbul summary (head report shows 0% coverage on new file)
- **Citation:** [Internal — operating principle: ≥95% BE coverage / ≥80% FE coverage](https://github.com/sfg-labs)

## Why

Brand-new modules without test files almost always rot. Catch them at PR time, when
context is fresh.

## Fix

Add a sibling `<name>.spec.ts` (BE) or `<name>.test.tsx` (FE) that exercises the
exported surface. Prefer fixtures from `nma-india-shared/synthetic-pii` for any test
that needs PII-shaped data.

## Suppress

For pure config/declaration files (e.g. `src/types/*.d.ts`), add to your
`.github/ai-review.yml`:

```yaml
qa:
  ignore_paths:
    - 'src/types/**'
    - '**/*.d.ts'
```
