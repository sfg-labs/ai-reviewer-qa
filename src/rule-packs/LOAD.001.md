# LOAD.001 — New endpoint without rate-limit middleware

- **Severity (default):** MEDIUM
- **Category:** Load / abuse protection
- **Source:** static heuristic
- **Citation:** [OWASP API Security Top 10 — API4:2023 Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)

## Why

Any public endpoint without a per-IP or per-token rate-limit is one botnet away from
billing or DB-pool exhaustion.

## Bad

```ts
app.post('/v1/checkout', checkoutHandler);
```

## Good

```ts
import rateLimit from 'express-rate-limit';

const checkoutLimiter = rateLimit({ windowMs: 60_000, max: 20 });
app.post('/v1/checkout', checkoutLimiter, checkoutHandler);
```

NestJS:

```ts
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Post('checkout')
async checkout() { /* ... */ }
```

## Suppress

```ts
// ai-review-ignore: LOAD.001 — admin-only, gated by IAP behind VPC
app.get('/admin/internal-status', handler);
```
