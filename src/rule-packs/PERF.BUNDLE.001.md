# PERF.BUNDLE.001 — Frontend bundle grew beyond budget

- **Severity (default):** MEDIUM (HIGH if delta > 4× budget)
- **Category:** Performance
- **Source:** webpack-bundle-analyzer / webpack stats diff
- **Citation:** [web.dev — Reduce JavaScript payloads](https://web.dev/articles/reduce-javascript-payloads-with-tree-shaking)

## Why

A bundle that grows by > 50 KB (gzipped) on a single PR is usually a sign someone
imported a heavy library at the top level. This directly hurts page-load and Core
Web Vitals on mobile.

## Bad

```ts
import * as lodash from 'lodash';  // pulls in entire library
```

## Good

```ts
import debounce from 'lodash/debounce';        // ~2 KB
// or, for app-level deferral:
const Heavy = dynamic(() => import('./Heavy'), { ssr: false });
```

## Configure budget

`.github/ai-review.yml`:

```yaml
qa:
  bundle_budget_kb: 50
```

## Suppress

Land the change, then add a follow-up issue to dynamic-import the offending module.
