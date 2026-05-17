import { postSummary, renderSummaryBody } from '../src/github/post-summary';
import { AggregateResult, Finding, PrContext } from '../src/types';

const ctx: PrContext = {
  owner: 'o',
  repo: 'r',
  pull_number: 11,
  head_sha: 'HEADSHA',
  base_sha: 'b',
  head_ref: 'feat',
  base_ref: 'main',
  labels: [],
  files: [],
  diff_size_bytes: 0,
};

const f = (over: Partial<Finding> = {}): Finding => ({
  rule_id: 'COV.DROP.001',
  severity: 'HIGH',
  confidence: 0.99,
  file: 'src/x.ts',
  line: 1,
  explanation: '',
  remediation: '',
  citation_url: '',
  source: 'jest',
  rule_pack_version: '1.0.0',
  ...over,
});

const baseResult: AggregateResult = {
  findings: [f(), f({ rule_id: 'PERF.NPLUS1.001', severity: 'HIGH' })],
  verdict: 'REQUEST_CHANGES',
  summary: 'demo',
  coverageDeltaPct: -3.2,
  breakingApi: false,
  rulePackVersion: '1.0.0',
  analyzerVersions: { jest: '29.x' },
};

describe('renderSummaryBody', () => {
  it('includes verdict, counts, coverage delta, repro info', () => {
    const body = renderSummaryBody(baseResult, ctx);
    expect(body).toContain('verdict: **REQUEST_CHANGES**');
    expect(body).toContain('CRITICAL: 0 · HIGH: 2');
    expect(body).toContain('-3.20 pp');
    expect(body).toContain('rule-pack: `1.0.0`');
    expect(body).toContain('jest: `29.x`');
    expect(body).toContain('HEADSHA');
    expect(body).toContain('ai-review-ignore:');
  });

  it('prefixes positive delta with +', () => {
    const body = renderSummaryBody({ ...baseResult, coverageDeltaPct: 1.5 }, ctx);
    expect(body).toContain('+1.50 pp');
  });

  it('reports breaking API when set', () => {
    const body = renderSummaryBody({ ...baseResult, breakingApi: true }, ctx);
    expect(body).toContain('Breaking API change:** yes');
  });

  it('handles unknown severity values gracefully', () => {
    const weird = { ...baseResult, findings: [f({ severity: 'WAT' as never })] };
    const body = renderSummaryBody(weird, ctx);
    expect(body).toContain('CRITICAL: 0 · HIGH: 0');
  });
});

describe('postSummary', () => {
  it('posts a REQUEST_CHANGES review', async () => {
    const create = jest.fn().mockResolvedValue({ data: { id: 555 } });
    const oct = { rest: { pulls: { createReview: create } } };
    const out = await postSummary(oct, ctx, baseResult);
    expect(out.posted).toBe(true);
    expect(out.reviewId).toBe(555);
    expect(create.mock.calls[0][0].event).toBe('REQUEST_CHANGES');
    expect(create.mock.calls[0][0].body).toContain('REQUEST_CHANGES');
  });

  it('maps COMMENT verdict to COMMENT event', async () => {
    const create = jest.fn().mockResolvedValue({ data: { id: 1 } });
    const oct = { rest: { pulls: { createReview: create } } };
    await postSummary(oct, ctx, { ...baseResult, verdict: 'COMMENT' });
    expect(create.mock.calls[0][0].event).toBe('COMMENT');
  });

  it('maps APPROVE verdict to APPROVE event', async () => {
    const create = jest.fn().mockResolvedValue({ data: { id: 1 } });
    const oct = { rest: { pulls: { createReview: create } } };
    await postSummary(oct, ctx, { ...baseResult, verdict: 'APPROVE' });
    expect(create.mock.calls[0][0].event).toBe('APPROVE');
  });

  it('skips entirely when verdict is SKIPPED', async () => {
    const create = jest.fn();
    const oct = { rest: { pulls: { createReview: create } } };
    const out = await postSummary(oct, ctx, { ...baseResult, verdict: 'SKIPPED' });
    expect(out.posted).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
