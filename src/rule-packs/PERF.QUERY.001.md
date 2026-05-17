# PERF.QUERY.001 — Database query inside a loop

- **Severity (default):** HIGH
- **Category:** Performance
- **Source:** static heuristic + Claude reasoning
- **Citation:** [Patterns of Enterprise Application Architecture — Repository / Batch Query](https://martinfowler.com/eaaCatalog/repository.html)

## Why

Any DB-touching call (`prisma.*.findMany`, `knex.raw`, `pool.query`, `db.query`) issued
inside a `for`, `while`, `.map`, `.forEach`, or `.reduce` is almost always wasteful.
Latency adds up linearly with iteration count and can exhaust the connection pool.

## Bad

```ts
const userIds = req.body.userIds;
const results = [];
for (const id of userIds) {
  results.push(await db.query('SELECT * FROM users WHERE id = $1', [id]));
}
```

## Good

```ts
const results = await db.query(
  'SELECT * FROM users WHERE id = ANY($1::int[])',
  [userIds],
);
```

## Suppress

```ts
// ai-review-ignore: PERF.QUERY.001 — sequential needed for FIFO billing semantics
```
