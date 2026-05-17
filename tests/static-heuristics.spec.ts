import { runStaticHeuristics } from '../src/tools/static-heuristics';
import { samplePrFiles } from './fixtures/sample-prs';

describe('runStaticHeuristics', () => {
  it('emits PERF.NPLUS1.001, PERF.QUERY.001, FLAKY.001, LOAD.001, PERF.MEMO.001', () => {
    const findings = runStaticHeuristics(samplePrFiles);
    const ids = new Set(findings.map((f) => f.rule_id));
    expect(ids).toEqual(
      new Set([
        'PERF.NPLUS1.001',
        'PERF.QUERY.001',
        'FLAKY.001',
        'LOAD.001',
        'PERF.MEMO.001',
      ]),
    );
  });

  it('does not double-fire PERF.MEMO.001 on the same file', () => {
    const patch = `@@ -0,0 +1,8 @@\n+export default function A() { return <div/>; }\n+export function B() { return <div/>; }\n`;
    const findings = runStaticHeuristics([
      { filename: 'src/x.tsx', status: 'added', additions: 8, deletions: 0, patch },
    ]);
    const memo = findings.filter((f) => f.rule_id === 'PERF.MEMO.001');
    expect(memo).toHaveLength(1);
  });

  it('skips removed files', () => {
    const findings = runStaticHeuristics([
      { filename: 'src/x.ts', status: 'removed', additions: 0, deletions: 5, patch: '+ stuff' },
    ]);
    expect(findings).toEqual([]);
  });

  it('returns [] for files without patches', () => {
    const findings = runStaticHeuristics([
      { filename: 'src/x.ts', status: 'modified', additions: 0, deletions: 0 },
    ]);
    expect(findings).toEqual([]);
  });

  it('does not fire FLAKY.001 when reason comment present on the same line', () => {
    const patch = `@@ -0,0 +1,1 @@\n+  it.skip('flaky', () => {}); // reason: pending refactor\n`;
    const findings = runStaticHeuristics([
      { filename: 'tests/x.spec.ts', status: 'modified', additions: 1, deletions: 0, patch },
    ]);
    expect(findings.find((f) => f.rule_id === 'FLAKY.001')).toBeUndefined();
  });

  it('does not fire LOAD.001 when rateLimit is mentioned in the same diff', () => {
    const patch = `@@ -0,0 +1,3 @@\n+import rateLimit from 'express-rate-limit';\n+const limiter = rateLimit({ max: 10 });\n+app.post('/v1/echo', limiter, h);\n`;
    const findings = runStaticHeuristics([
      { filename: 'src/routes.ts', status: 'added', additions: 3, deletions: 0, patch },
    ]);
    expect(findings.find((f) => f.rule_id === 'LOAD.001')).toBeUndefined();
  });

  it('fires PERF.MEMO.001 even when the React file already uses memo (gated by missing memo across whole patch)', () => {
    const patch = `@@ -0,0 +1,2 @@\n+import React from 'react';\n+export default function A() { return <div/>; }\n`;
    const findings = runStaticHeuristics([
      { filename: 'src/A.tsx', status: 'added', additions: 2, deletions: 0, patch },
    ]);
    expect(findings.find((f) => f.rule_id === 'PERF.MEMO.001')).toBeDefined();
  });

  it('does not fire PERF.MEMO.001 when React.memo is present', () => {
    const patch = `@@ -0,0 +1,2 @@\n+import React from 'react';\n+export default React.memo(function A() { return <div/>; });\n`;
    const findings = runStaticHeuristics([
      { filename: 'src/A.tsx', status: 'added', additions: 2, deletions: 0, patch },
    ]);
    expect(findings.find((f) => f.rule_id === 'PERF.MEMO.001')).toBeUndefined();
  });

  it('flags PERF.NPLUS1.001 when include: appears inside an active loop block', () => {
    const patch = `@@ -0,0 +1,5 @@\n+for (const o of orders) {\n+  await prisma.customer.findUnique({\n+    include: { addr: true },\n+  });\n+}\n`;
    const findings = runStaticHeuristics([
      { filename: 'src/o.ts', status: 'modified', additions: 5, deletions: 0, patch },
    ]);
    expect(findings.find((f) => f.rule_id === 'PERF.NPLUS1.001')).toBeDefined();
  });

  it('resets loop state at hunk boundaries', () => {
    // First hunk opens a for-loop with no DB call; second hunk has a DB call but at top level.
    const patch =
      `@@ -1,1 +1,2 @@\n line1\n+for (const x of arr) { console.log(x); }\n@@ -10,1 +12,2 @@\n line10\n+await prisma.user.findMany();\n`;
    const findings = runStaticHeuristics([
      { filename: 'src/loop.ts', status: 'modified', additions: 2, deletions: 0, patch },
    ]);
    expect(findings.find((f) => f.rule_id === 'PERF.QUERY.001')).toBeUndefined();
  });
});
