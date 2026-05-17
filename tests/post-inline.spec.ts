import { postInline, renderInlineBody } from '../src/github/post-inline';
import { Finding, PrContext } from '../src/types';

const findingFactory = (over: Partial<Finding> = {}): Finding => ({
  rule_id: 'PERF.NPLUS1.001',
  severity: 'HIGH',
  confidence: 0.92,
  file: 'src/a.ts',
  line: 4,
  explanation: 'N+1 detected.',
  remediation: 'Use include or batch.',
  citation_url: 'http://example/PERF.NPLUS1.001.md',
  source: 'claude',
  rule_pack_version: '1.0.0',
  analyzer_version: 'jest 29.x',
  ...over,
});

const ctx: PrContext = {
  owner: 'o',
  repo: 'r',
  pull_number: 9,
  head_sha: 'sha1',
  base_sha: 'b',
  head_ref: 'feat',
  base_ref: 'main',
  labels: [],
  files: [
    {
      filename: 'src/a.ts',
      status: 'modified',
      additions: 2,
      deletions: 0,
      patch: `@@ -1,2 +1,5 @@\n line1\n line2\n+added3\n+added4\n+added5\n`,
    },
  ],
  diff_size_bytes: 10,
};

describe('renderInlineBody', () => {
  it('includes rule_id, severity, citation, analyzer version', () => {
    const body = renderInlineBody(findingFactory());
    expect(body).toContain('PERF.NPLUS1.001');
    expect(body).toContain('HIGH');
    expect(body).toContain('92%');
    expect(body).toContain('rule-pack: `1.0.0`');
    expect(body).toContain('analyzer: `jest 29.x`');
    expect(body).toContain('http://example/PERF.NPLUS1.001.md');
  });

  it('omits analyzer line when not provided', () => {
    const body = renderInlineBody(findingFactory({ analyzer_version: undefined }));
    expect(body).not.toContain('analyzer:');
  });
});

describe('postInline', () => {
  it('posts comments only for lines present in the new-file diff', async () => {
    const create = jest.fn().mockResolvedValue({ data: { id: 1 } });
    const oct = { rest: { pulls: { createReviewComment: create } } };
    const findings = [
      findingFactory({ line: 4 }),  // hit
      findingFactory({ line: 99 }), // miss
    ];
    const posted = await postInline(oct, ctx, findings);
    expect(posted).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      owner: 'o',
      repo: 'r',
      pull_number: 9,
      commit_id: 'sha1',
      path: 'src/a.ts',
      line: 4,
      side: 'RIGHT',
    });
  });

  it('continues when one inline comment throws', async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValue({ data: { id: 2 } });
    const oct = { rest: { pulls: { createReviewComment: create } } };
    const errSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const posted = await postInline(oct, ctx, [
      findingFactory({ line: 3 }),
      findingFactory({ line: 4 }),
    ]);
    expect(posted).toBe(1);
    expect(create).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });

  it('returns 0 when no findings land on changed lines', async () => {
    const create = jest.fn();
    const oct = { rest: { pulls: { createReviewComment: create } } };
    const posted = await postInline(oct, ctx, [findingFactory({ line: 999 })]);
    expect(posted).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });
});
