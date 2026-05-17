import { changedLines, estimateTokens, fetchPrContext } from '../src/github/pr-diff';
import { PrContext, PrFile } from '../src/types';

describe('changedLines', () => {
  it('returns added line numbers', () => {
    const patch = `@@ -1,2 +1,4 @@\n line1\n+added2\n+added3\n line4\n`;
    expect(changedLines(patch)).toEqual([2, 3]);
  });

  it('handles multiple hunks', () => {
    const patch =
      `@@ -1,1 +1,2 @@\n line1\n+addedA\n@@ -10,1 +12,2 @@\n line10\n+addedB\n`;
    expect(changedLines(patch)).toEqual([2, 13]);
  });

  it('returns [] for undefined', () => {
    expect(changedLines(undefined)).toEqual([]);
  });

  it('does not count deletions', () => {
    const patch = `@@ -1,3 +1,2 @@\n line1\n-removed\n line3\n`;
    expect(changedLines(patch)).toEqual([]);
  });

  it('skips +++ header lines', () => {
    const patch = `+++ b/file\n@@ -1,1 +1,2 @@\n line1\n+added\n`;
    expect(changedLines(patch)).toEqual([2]);
  });

  it('handles hunk header without comma range', () => {
    const patch = `@@ -1 +1 @@\n+only\n`;
    expect(changedLines(patch)).toEqual([1]);
  });
});

describe('estimateTokens', () => {
  it('approximates input tokens at 4 bytes/token', () => {
    const ctx: PrContext = {
      owner: 'o',
      repo: 'r',
      pull_number: 1,
      head_sha: 'h',
      base_sha: 'b',
      head_ref: 'feat',
      base_ref: 'main',
      labels: [],
      files: [],
      diff_size_bytes: 40000,
    };
    expect(estimateTokens(ctx)).toBe(10000);
  });
});

describe('fetchPrContext', () => {
  const fakePr = {
    data: {
      base: { sha: 'BASE', ref: 'main' },
      head: { sha: 'HEAD', ref: 'feat' },
      labels: [{ name: 'breaking-change' }, { name: 'ready' }],
    },
  };

  it('paginates through changed files until short page', async () => {
    const filesPages: PrFile[][] = [
      new Array(100).fill(0).map((_, i) => ({
        filename: `file${i}.ts`,
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: '+a',
      })),
      [
        {
          filename: 'tail.ts',
          status: 'added',
          additions: 1,
          deletions: 0,
          patch: '+b',
        },
      ],
    ];
    const calls: number[] = [];
    const oct = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue(fakePr),
          listFiles: jest.fn().mockImplementation(async ({ page }: { page: number }) => {
            calls.push(page);
            return { data: filesPages[page - 1] };
          }),
        },
      },
    };
    const ctx = await fetchPrContext(oct, { owner: 'o', repo: 'r', pull_number: 7 });
    expect(calls).toEqual([1, 2]);
    expect(ctx.files).toHaveLength(101);
    expect(ctx.labels).toEqual(['breaking-change', 'ready']);
    expect(ctx.base_sha).toBe('BASE');
    expect(ctx.diff_size_bytes).toBeGreaterThan(0);
  });

  it('handles a single short page', async () => {
    const oct = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue(fakePr),
          listFiles: jest.fn().mockResolvedValue({
            data: [
              {
                filename: 'a.ts',
                status: 'added',
                additions: 1,
                deletions: 0,
              },
            ],
          }),
        },
      },
    };
    const ctx = await fetchPrContext(oct, { owner: 'o', repo: 'r', pull_number: 1 });
    expect(ctx.files).toHaveLength(1);
    expect(ctx.diff_size_bytes).toBe(0);
  });
});
