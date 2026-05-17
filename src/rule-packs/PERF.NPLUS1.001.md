# PERF.NPLUS1.001 — Prisma `include` inside loop iterator

- **Severity (default):** HIGH
- **Category:** Performance
- **Source:** static heuristic + Claude confirmation
- **Citation:** [Prisma — eager loading & N+1](https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries)

## Why

`prisma.<model>.findMany({ include: { rel: true } })` issued inside a `.map`, `.forEach`,
`for`, or `while` loop fans out into one round-trip per iteration. With N records that
becomes N+1 queries — fast in dev, catastrophic at production volumes.

## Bad

```ts
const orders = await prisma.order.findMany();
for (const o of orders) {
  const customer = await prisma.customer.findUnique({
    where: { id: o.customerId },
    include: { addresses: true },
  });
  // ...
}
```

## Good

```ts
const orders = await prisma.order.findMany({
  include: { customer: { include: { addresses: true } } },
});
```

Or batch:

```ts
const customers = await prisma.customer.findMany({
  where: { id: { in: orders.map((o) => o.customerId) } },
  include: { addresses: true },
});
```

## Suppress

```ts
// ai-review-ignore: PERF.NPLUS1.001 — N is bounded by request limit, ≤ 5 calls
```
