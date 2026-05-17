import { aggregate } from '../src/aggregator';
import { Finding, ReviewerConfig } from '../src/types';

const config: ReviewerConfig = {
  ignore_paths: [],
  rule_overrides: {},
  bundle_budget_kb: 50,
  fail_on_coverage_drop: true,
  fail_on_breaking_api: true,
};

const f = (over: Partial<Finding>): Finding => ({
  rule_id: 'PERF.MEMO.001',
  severity: 'LOW',
  confidence: 0.5,
  file: 'src/a.ts',
  line: 1,
  explanation: '',
  remediation: '',
  citation_url: '',
  source: 'claude',
  rule_pack_version: '1.0.0',
  ...over,
});

describe('aggregate', () => {
  it('APPROVE when there are no findings', () => {
    const r = aggregate([], config, { coverageDeltaPct: 0 });
    expect(r.verdict).toBe('COMMENT');
    expect(r.findings).toEqual([]);
    expect(r.summary).toMatch(/No QA regressions/);
  });

  it('REQUEST_CHANGES on coverage drop', () => {
    const r = aggregate(
      [f({ rule_id: 'COV.DROP.001', severity: 'HIGH' })],
      config,
      { coverageDeltaPct: -3 },
    );
    expect(r.verdict).toBe('REQUEST_CHANGES');
    expect(r.summary).toMatch(/coverage regressed/);
  });

  it('REQUEST_CHANGES on breaking API', () => {
    const r = aggregate(
      [f({ rule_id: 'API.BREAK.001', severity: 'HIGH' })],
      config,
      { coverageDeltaPct: 0 },
    );
    expect(r.verdict).toBe('REQUEST_CHANGES');
    expect(r.breakingApi).toBe(true);
  });

  it('REQUEST_CHANGES skipped when fail_on_coverage_drop is false', () => {
    const r = aggregate(
      [f({ rule_id: 'COV.DROP.001' })],
      { ...config, fail_on_coverage_drop: false },
      { coverageDeltaPct: -3 },
    );
    expect(r.verdict).toBe('COMMENT');
  });

  it('REQUEST_CHANGES skipped when fail_on_breaking_api is false', () => {
    const r = aggregate(
      [f({ rule_id: 'API.BREAK.001' })],
      { ...config, fail_on_breaking_api: false },
      { coverageDeltaPct: 0 },
    );
    expect(r.verdict).toBe('COMMENT');
  });

  it('COMMENT for non-blocking findings only', () => {
    const r = aggregate(
      [f({ rule_id: 'PERF.MEMO.001' }), f({ rule_id: 'FLAKY.001', severity: 'MEDIUM' })],
      config,
      { coverageDeltaPct: 0 },
    );
    expect(r.verdict).toBe('COMMENT');
    expect(r.summary).toMatch(/perf\/coverage observations/);
  });

  it('dedupes (rule_id, file, line) keeping highest severity then confidence', () => {
    const r = aggregate(
      [
        f({ rule_id: 'PERF.NPLUS1.001', severity: 'LOW', confidence: 0.5 }),
        f({ rule_id: 'PERF.NPLUS1.001', severity: 'HIGH', confidence: 0.9 }),
        f({ rule_id: 'PERF.NPLUS1.001', severity: 'HIGH', confidence: 0.7 }),
      ],
      config,
      { coverageDeltaPct: 0 },
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].severity).toBe('HIGH');
    expect(r.findings[0].confidence).toBe(0.9);
  });

  it('honors rule_overrides.disabled', () => {
    const cfg = { ...config, rule_overrides: { 'PERF.NPLUS1.001': { disabled: true } } };
    const r = aggregate([f({ rule_id: 'PERF.NPLUS1.001', severity: 'HIGH' })], cfg, {
      coverageDeltaPct: 0,
    });
    expect(r.findings).toEqual([]);
    expect(r.verdict).toBe('COMMENT');
  });

  it('honors rule_overrides.severity bump', () => {
    const cfg = { ...config, rule_overrides: { 'FLAKY.001': { severity: 'CRITICAL' as const } } };
    const r = aggregate([f({ rule_id: 'FLAKY.001', severity: 'LOW' })], cfg, {
      coverageDeltaPct: 0,
    });
    expect(r.findings[0].severity).toBe('CRITICAL');
  });

  it('sorts by severity then descending confidence', () => {
    const r = aggregate(
      [
        f({ rule_id: 'FLAKY.001', severity: 'MEDIUM', confidence: 0.3 }),
        f({ rule_id: 'PERF.NPLUS1.001', severity: 'HIGH', confidence: 0.7, line: 2 }),
        f({ rule_id: 'PERF.QUERY.001', severity: 'HIGH', confidence: 0.9, line: 3 }),
      ],
      config,
      { coverageDeltaPct: 0 },
    );
    expect(r.findings.map((x) => x.rule_id)).toEqual([
      'PERF.QUERY.001', // HIGH, conf 0.9
      'PERF.NPLUS1.001', // HIGH, conf 0.7
      'FLAKY.001',       // MEDIUM
    ]);
  });

  it('keeps coverage delta in the result', () => {
    const r = aggregate([], config, { coverageDeltaPct: -1.23 });
    expect(r.coverageDeltaPct).toBeCloseTo(-1.23);
  });
});
