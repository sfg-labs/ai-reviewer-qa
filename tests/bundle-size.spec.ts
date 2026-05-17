import { diffBundle, isFePr, parseBundleReport } from '../src/tools/bundle-size';
import { baseBundle, headBundleRegression } from './fixtures/sample-prs';

describe('parseBundleReport', () => {
  it('parses webpack stats.json shape', () => {
    const r = parseBundleReport(baseBundle);
    expect(r.assets['main.js']).toBe(100 * 1024);
    expect(r.totalBytes).toBe(300 * 1024);
  });

  it('parses webpack-bundle-analyzer array shape', () => {
    const r = parseBundleReport([
      { label: 'a.js', gzipSize: 1024 },
      { label: 'b.js', parsedSize: 2048 },
    ]);
    expect(r.assets['a.js']).toBe(1024);
    expect(r.assets['b.js']).toBe(2048);
  });

  it('returns empty on unknown shape', () => {
    expect(parseBundleReport('weird').totalBytes).toBe(0);
    expect(parseBundleReport(null).totalBytes).toBe(0);
    expect(parseBundleReport(123).totalBytes).toBe(0);
  });

  it('skips entries without a name and merges duplicate asset names', () => {
    const r = parseBundleReport([
      { gzipSize: 100 },              // no label/name → skipped
      { label: 'shared.js', gzipSize: 200 },
      { label: 'shared.js', gzipSize: 300 },
    ]);
    expect(r.assets['shared.js']).toBe(500);
    expect(r.totalBytes).toBe(500);
  });

  it('skips entries without a name in stats.json shape', () => {
    const r = parseBundleReport({ assets: [{ size: 100 }, { name: 'x.js', size: 50 }, null] });
    expect(r.assets['x.js']).toBe(50);
    expect(r.totalBytes).toBe(50);
  });

  it('defaults missing size fields to 0', () => {
    const r = parseBundleReport([{ label: 'no-size.js' }]);
    expect(r.assets['no-size.js']).toBe(0);
  });

  it('defaults missing size in stats.json shape to 0', () => {
    const r = parseBundleReport({ assets: [{ name: 'no-size.js' }] });
    expect(r.assets['no-size.js']).toBe(0);
  });
});

describe('diffBundle', () => {
  it('emits PERF.BUNDLE.001 when an asset grows beyond budget', () => {
    const base = parseBundleReport(baseBundle);
    const head = parseBundleReport(headBundleRegression);
    const findings = diffBundle(base, head, 50);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule_id).toBe('PERF.BUNDLE.001');
    expect(findings[0].severity).toBe('MEDIUM');
    expect(findings[0].explanation).toMatch(/vendor\.js/);
  });

  it('uses HIGH severity when growth exceeds 4x the budget', () => {
    const base = parseBundleReport({ assets: [{ name: 'x.js', size: 0 }] });
    const head = parseBundleReport({ assets: [{ name: 'x.js', size: 1024 * 1024 }] });
    const findings = diffBundle(base, head, 50);
    expect(findings[0].severity).toBe('HIGH');
  });

  it('uses MEDIUM severity for modest growth', () => {
    const base = parseBundleReport({ assets: [{ name: 'a.js', size: 10 * 1024 }] });
    const head = parseBundleReport({ assets: [{ name: 'a.js', size: 70 * 1024 }] });
    const findings = diffBundle(base, head, 50);
    expect(findings[0].severity).toBe('MEDIUM');
  });

  it('emits nothing when delta is within budget', () => {
    const base = parseBundleReport({ assets: [{ name: 'a.js', size: 100 }] });
    const head = parseBundleReport({ assets: [{ name: 'a.js', size: 200 }] });
    expect(diffBundle(base, head, 50)).toEqual([]);
  });

  it('treats brand-new assets as a +N delta from 0', () => {
    const base = parseBundleReport({ assets: [] });
    const head = parseBundleReport({ assets: [{ name: 'fresh.js', size: 100 * 1024 }] });
    expect(diffBundle(base, head, 50)).toHaveLength(1);
  });
});

describe('isFePr', () => {
  it('detects FE files by extension', () => {
    expect(isFePr(['src/x.tsx'])).toBe(true);
    expect(isFePr(['src/y.jsx'])).toBe(true);
  });
  it('detects FE files by path heuristics', () => {
    expect(isFePr(['app/components/Foo.ts'])).toBe(true);
    expect(isFePr(['app/pages/index.ts'])).toBe(true);
    expect(isFePr(['webpack.config.js'])).toBe(true);
    expect(isFePr(['next.config.js'])).toBe(true);
  });
  it('returns false for backend-only PRs', () => {
    expect(isFePr(['src/server.ts', 'src/db.ts'])).toBe(false);
  });
});
