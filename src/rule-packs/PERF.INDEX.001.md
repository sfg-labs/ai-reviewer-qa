# PERF.INDEX.001 — Missing index on a WHERE/JOIN column

- **Severity (default):** MEDIUM
- **Category:** Performance
- **Source:** Postgres `EXPLAIN` (requires `DATABASE_URL` input)
- **Citation:** [Postgres docs — Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)

## Why

When `EXPLAIN (FORMAT JSON)` on a query introduced by the PR shows a `Seq Scan` on a
non-trivial relation, an index is almost certainly missing. Sequential scans on large
tables are the single most common cause of latency regressions.

## Bad

```sql
SELECT * FROM orders WHERE customer_email = $1;
-- EXPLAIN: Seq Scan on orders  (cost=0.00..18421.00 rows=10 width=128)
```

## Good

```sql
CREATE INDEX CONCURRENTLY orders_customer_email_idx ON orders (customer_email);
```

…and re-run EXPLAIN to confirm `Index Scan using orders_customer_email_idx`.

## Suppress

```ts
// ai-review-ignore: PERF.INDEX.001 — table is bounded to ≤500 rows by design
```
