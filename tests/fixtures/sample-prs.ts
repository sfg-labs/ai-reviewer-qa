import { PrFile } from '../../src/types';

export const NPLUS1_PATCH = `@@ -1,5 +1,10 @@
 export async function loadOrders(prisma) {
   const orders = await prisma.order.findMany();
+  for (const o of orders) {
+    const c = await prisma.customer.findUnique({
+      where: { id: o.customerId },
+      include: { addresses: true },
+    });
+  }
   return orders;
 }
`;

export const QUERY_IN_LOOP_PATCH = `@@ -1,4 +1,8 @@
 export async function backfill(ids, db) {
+  for (const id of ids) {
+    await db.query('SELECT * FROM users WHERE id = $1', [id]);
+  }
   return true;
 }
`;

export const SKIPPED_TEST_PATCH = `@@ -10,3 +10,6 @@
   it('charges tax', () => {});
+  it.skip('charges B2B tax', () => {
+    // pending
+  });
 });
`;

export const NEW_ROUTE_NO_LIMIT = `@@ -1,3 +1,6 @@
 import express from 'express';
 const app = express();
+app.post('/v1/checkout', async (req, res) => {
+  res.json({ ok: true });
+});
`;

export const REACT_COMPONENT_PATCH = `@@ -0,0 +1,5 @@
+export default function ProductRow({ product, onSelect }) {
+  const formatted = expensiveFormat(product);
+  return <div onClick={onSelect}>{formatted}</div>;
+}
`;

export const samplePrFiles: PrFile[] = [
  {
    filename: 'src/orders.ts',
    status: 'modified',
    additions: 5,
    deletions: 0,
    patch: NPLUS1_PATCH,
  },
  {
    filename: 'src/jobs/backfill.ts',
    status: 'modified',
    additions: 3,
    deletions: 0,
    patch: QUERY_IN_LOOP_PATCH,
  },
  {
    filename: 'tests/billing.spec.ts',
    status: 'modified',
    additions: 3,
    deletions: 0,
    patch: SKIPPED_TEST_PATCH,
  },
  {
    filename: 'src/routes/checkout.ts',
    status: 'added',
    additions: 4,
    deletions: 0,
    patch: NEW_ROUTE_NO_LIMIT,
  },
  {
    filename: 'src/components/ProductRow.tsx',
    status: 'added',
    additions: 5,
    deletions: 0,
    patch: REACT_COMPONENT_PATCH,
  },
];

export const baseCoverageReport = {
  total: { lines: { total: 100, covered: 90, pct: 90 } },
  '/repo/src/orders.ts': { lines: { total: 50, covered: 47, pct: 94 } },
  '/repo/src/jobs/backfill.ts': { lines: { total: 30, covered: 27, pct: 90 } },
};

export const headCoverageReport = {
  total: { lines: { total: 110, covered: 85, pct: 77.27 } },
  '/repo/src/orders.ts': { lines: { total: 55, covered: 40, pct: 72.7 } },
  '/repo/src/jobs/backfill.ts': { lines: { total: 33, covered: 29, pct: 87.88 } },
  '/repo/src/components/ProductRow.tsx': { lines: { total: 5, covered: 0, pct: 0 } },
};

export const baseOpenApi = {
  openapi: '3.0.0',
  paths: {
    '/v1/orders': {
      get: {
        parameters: [],
        responses: { '200': { description: 'ok' } },
      },
      post: {
        parameters: [{ name: 'idempotencyKey', required: false }],
        responses: { '201': { description: 'created' } },
      },
    },
    '/v1/legacy': {
      get: { responses: { '200': { description: 'ok' } } },
    },
  },
};

export const headOpenApi = {
  openapi: '3.0.0',
  paths: {
    '/v1/orders': {
      get: {
        parameters: [{ name: 'tenantId', required: true }],
        responses: { '200': { description: 'ok' } },
      },
      post: {
        parameters: [{ name: 'idempotencyKey', required: true }],
        responses: { '201': { description: 'created' } },
      },
    },
    // /v1/legacy removed entirely
    '/v1/checkout': {
      post: { responses: { '201': { description: 'created' } } },
    },
  },
};

export const baseBundle = {
  assets: [
    { name: 'main.js', size: 100 * 1024 },
    { name: 'vendor.js', size: 200 * 1024 },
  ],
};

export const headBundleRegression = {
  assets: [
    { name: 'main.js', size: 100 * 1024 },
    { name: 'vendor.js', size: 400 * 1024 }, // +200KB
  ],
};

export const seqScanExplain = [
  {
    Plan: {
      'Node Type': 'Seq Scan',
      'Relation Name': 'orders',
    },
  },
];

export const indexScanExplain = [
  {
    Plan: {
      'Node Type': 'Index Scan',
      'Relation Name': 'orders',
    },
  },
];
