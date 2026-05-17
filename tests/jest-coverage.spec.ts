import { diffCoverage, parseIstanbulSummary } from '../src/tools/jest-coverage';
import { PrFile } from '../src/types';
import { baseCoverageReport, headCoverageReport } from './fixtures/sample-prs';

describe('parseIstanbulSummary', () => {
  it('extracts total + per-file pct', () => {
    const r = parseIstanbulSummary(baseCoverageReport);
    expect(r.total.pct).toBe(90);
    expect(r.files['/repo/src/orders.ts'].pct).toBe(94);
  });

  it('returns empty on null', () => {
    expect(parseIstanbulSummary(null)).toEqual({ files: {}, total: { lines: 0, covered: 0, pct: 0 } });
  });

  it('returns empty on non-object', () => {
    expect(parseIstanbulSummary(42).total.pct).toBe(0);
  });

  it('skips entries without a lines node', () => {
    const r = parseIstanbulSummary({
      'src/x.ts': { branches: { pct: 50 } }, // no `lines`
      'src/y.ts': null,
    });
    expect(Object.keys(r.files)).toEqual([]);
  });

  it('defaults numeric fields to zero', () => {
    const r = parseIstanbulSummary({
      total: { lines: {} },
      'src/x.ts': { lines: {} },
    });
    expect(r.total.pct).toBe(0);
    expect(r.files['src/x.ts'].pct).toBe(0);
  });
});

describe('diffCoverage', () => {
  const changed: PrFile[] = [
    { filename: 'src/orders.ts', status: 'modified', additions: 1, deletions: 0 },
    { filename: 'src/jobs/backfill.ts', status: 'modified', additions: 1, deletions: 0 },
    { filename: 'src/components/ProductRow.tsx', status: 'added', additions: 5, deletions: 0 },
  ];

  it('flags COV.DROP.001 for files whose coverage dropped', () => {
    const base = parseIstanbulSummary(baseCoverageReport);
    const head = parseIstanbulSummary(headCoverageReport);
    const { findings, deltaPct } = diffCoverage(base, head, changed);
    const drop = findings.find((f) => f.rule_id === 'COV.DROP.001');
    expect(drop).toBeDefined();
    expect(drop!.file).toBe('src/orders.ts');
    expect(drop!.severity).toBe('HIGH'); // > 5pp drop
    expect(deltaPct).toBeLessThan(0);
  });

  it('flags COV.NEW.001 for newly-added files with zero coverage', () => {
    const base = parseIstanbulSummary(baseCoverageReport);
    const head = parseIstanbulSummary(headCoverageReport);
    const { findings } = diffCoverage(base, head, changed);
    const newRule = findings.find((f) => f.rule_id === 'COV.NEW.001');
    expect(newRule).toBeDefined();
    expect(newRule!.file).toBe('src/components/ProductRow.tsx');
  });

  it('flags COV.NEW.001 when the new file is missing entirely from head report', () => {
    const base = { files: {}, total: { lines: 0, covered: 0, pct: 0 } };
    const head = { files: {}, total: { lines: 0, covered: 0, pct: 0 } };
    const { findings } = diffCoverage(base, head, [
      { filename: 'src/brand-new.ts', status: 'added', additions: 1, deletions: 0 },
    ]);
    expect(findings.find((f) => f.rule_id === 'COV.NEW.001')).toBeDefined();
  });

  it('skips removed files', () => {
    const base = parseIstanbulSummary(baseCoverageReport);
    const head = parseIstanbulSummary(headCoverageReport);
    const { findings } = diffCoverage(base, head, [
      { filename: 'src/orders.ts', status: 'removed', additions: 0, deletions: 10 },
    ]);
    expect(findings).toEqual([]);
  });

  it('emits no findings when coverage held', () => {
    const same = parseIstanbulSummary(baseCoverageReport);
    const { findings, deltaPct } = diffCoverage(same, same, [
      { filename: 'src/orders.ts', status: 'modified', additions: 1, deletions: 0 },
    ]);
    expect(findings).toEqual([]);
    expect(deltaPct).toBe(0);
  });

  it('uses MEDIUM severity for sub-5pp drops', () => {
    const base = parseIstanbulSummary({
      total: { lines: { total: 10, covered: 9, pct: 90 } },
      '/repo/src/x.ts': { lines: { total: 10, covered: 9, pct: 90 } },
    });
    const head = parseIstanbulSummary({
      total: { lines: { total: 10, covered: 8, pct: 88 } },
      '/repo/src/x.ts': { lines: { total: 10, covered: 8, pct: 88 } },
    });
    const { findings } = diffCoverage(base, head, [
      { filename: 'src/x.ts', status: 'modified', additions: 1, deletions: 0 },
    ]);
    expect(findings[0].severity).toBe('MEDIUM');
  });

  it('falls back to previous_filename for renamed files', () => {
    const base = parseIstanbulSummary({
      '/repo/src/old.ts': { lines: { total: 10, covered: 9, pct: 90 } },
    });
    const head = parseIstanbulSummary({
      '/repo/src/new.ts': { lines: { total: 10, covered: 5, pct: 50 } },
    });
    const { findings } = diffCoverage(base, head, [
      {
        filename: 'src/new.ts',
        previous_filename: 'src/old.ts',
        status: 'renamed',
        additions: 0,
        deletions: 0,
      },
    ]);
    expect(findings[0].file).toBe('src/new.ts');
  });

  it('skips modified files that have no base coverage entry', () => {
    const base = parseIstanbulSummary({}); // empty
    const head = parseIstanbulSummary({
      '/repo/src/x.ts': { lines: { total: 10, covered: 5, pct: 50 } },
    });
    const { findings } = diffCoverage(base, head, [
      { filename: 'src/x.ts', status: 'modified', additions: 1, deletions: 0 },
    ]);
    expect(findings).toEqual([]);
  });

  it('matches by exact key when present', () => {
    const base = parseIstanbulSummary({
      'src/x.ts': { lines: { total: 10, covered: 9, pct: 90 } },
    });
    const head = parseIstanbulSummary({
      'src/x.ts': { lines: { total: 10, covered: 5, pct: 50 } },
    });
    const { findings } = diffCoverage(base, head, [
      { filename: 'src/x.ts', status: 'modified', additions: 1, deletions: 0 },
    ]);
    expect(findings[0].file).toBe('src/x.ts');
  });

  it('does not flag a new file that already has coverage > 0', () => {
    const base = parseIstanbulSummary(baseCoverageReport);
    const head = parseIstanbulSummary({
      ...headCoverageReport,
      '/repo/src/components/ProductRow.tsx': { lines: { total: 5, covered: 5, pct: 100 } },
    });
    const { findings } = diffCoverage(base, head, [
      { filename: 'src/components/ProductRow.tsx', status: 'added', additions: 5, deletions: 0 },
    ]);
    expect(findings.find((f) => f.rule_id === 'COV.NEW.001')).toBeUndefined();
  });
});
