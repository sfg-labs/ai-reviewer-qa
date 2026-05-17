# FLAKY.001 — Test marked `.skip` without an explanation

- **Severity (default):** MEDIUM
- **Category:** QA hygiene
- **Source:** static heuristic
- **Citation:** [Google Testing Blog — Flaky Tests at Google](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)

## Why

Skipped tests rot silently. A reviewer should be able to glance at a `.skip` and know
why it's there.

## Bad

```ts
it.skip('charges the right tax for B2B invoices', () => { /* ... */ });
```

## Good

```ts
// reason: tax-engine refactor in PR #482 — re-enable after sfg-labs/service-finance#482 merges
it.skip('charges the right tax for B2B invoices', () => { /* ... */ });
```

## Suppress

Inline reason comment is the canonical suppression — no separate suppression token needed.

## Verdict impact

Non-blocking — emits a `COMMENT`. Tracked in trending data so persistent skips surface.
