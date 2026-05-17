import {
  detectSeqScan,
  explainQueries,
  extractQueriesFromPatch,
} from '../src/tools/pg-explain';
import { indexScanExplain, seqScanExplain } from './fixtures/sample-prs';
import { PrFile } from '../src/types';

describe('extractQueriesFromPatch', () => {
  it('pulls SELECT ... FROM ... statements from added lines', () => {
    const patch = `@@ -1,1 +1,2 @@\n const x = 1;\n+const q = await db.query('SELECT id FROM users WHERE email = $1');\n`;
    expect(extractQueriesFromPatch(patch)[0]).toMatch(/SELECT id FROM users WHERE email/);
  });

  it('returns [] for undefined or no-SQL patches', () => {
    expect(extractQueriesFromPatch(undefined)).toEqual([]);
    expect(extractQueriesFromPatch(`@@ -1,1 +1,1 @@\n line1\n`)).toEqual([]);
  });

  it('ignores deletions and context lines', () => {
    const patch = `@@ -1,2 +1,2 @@\n-const q = 'SELECT * FROM old WHERE id = 1';\n const same = 'SELECT * FROM same WHERE id = 1';\n`;
    expect(extractQueriesFromPatch(patch)).toEqual([]);
  });

  it('ignores the +++ header line', () => {
    const patch = `+++ b/foo.ts\n@@ -1,1 +1,1 @@\n const q = 1;\n`;
    expect(extractQueriesFromPatch(patch)).toEqual([]);
  });
});

describe('detectSeqScan', () => {
  it('finds Seq Scan in nested Plan node', () => {
    expect(detectSeqScan(seqScanExplain)).toBe('orders');
  });

  it('returns undefined when there is no Seq Scan', () => {
    expect(detectSeqScan(indexScanExplain)).toBeUndefined();
  });

  it('finds Seq Scan in a child plan', () => {
    expect(
      detectSeqScan([
        {
          Plan: {
            'Node Type': 'Aggregate',
            Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'invoices' }],
          },
        },
      ]),
    ).toBe('invoices');
  });

  it('returns undefined when Plan has no relation name', () => {
    expect(detectSeqScan([{ Plan: { 'Node Type': 'Seq Scan' } }])).toBeUndefined();
  });

  it('parses text-format QUERY PLAN output', () => {
    expect(
      detectSeqScan([{ 'QUERY PLAN': '  ->  Seq Scan on payments  (cost=...)' }]),
    ).toBe('payments');
  });

  it('skips text-format rows that mention something other than Seq Scan', () => {
    expect(detectSeqScan([{ 'QUERY PLAN': 'Index Scan on payments' }])).toBeUndefined();
  });

  it('ignores non-object child plans', () => {
    expect(
      detectSeqScan([
        {
          Plan: {
            'Node Type': 'Aggregate',
            Plans: [null as unknown as object, 'string', { 'Node Type': 'Seq Scan', 'Relation Name': 't' }],
          },
        },
      ]),
    ).toBe('t');
  });
});

describe('explainQueries', () => {
  const files: PrFile[] = [
    {
      filename: 'src/jobs.ts',
      status: 'added',
      additions: 1,
      deletions: 0,
      patch: `@@ -0,0 +1,1 @@\n+await db.query('SELECT * FROM payments WHERE customer_id = $1');\n`,
    },
  ];

  it('emits PERF.INDEX.001 on seq scan', async () => {
    const run = jest.fn().mockResolvedValue(seqScanExplain);
    const findings = await explainQueries(files, run);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule_id).toBe('PERF.INDEX.001');
    expect(findings[0].file).toBe('src/jobs.ts');
  });

  it('emits no finding when EXPLAIN shows index scan', async () => {
    const run = jest.fn().mockResolvedValue(indexScanExplain);
    expect(await explainQueries(files, run)).toEqual([]);
  });

  it('swallows runner errors without crashing the pipeline', async () => {
    const run = jest.fn().mockRejectedValue(new Error('bound param'));
    const errSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(await explainQueries(files, run)).toEqual([]);
    errSpy.mockRestore();
  });

  it('skips files with no SQL queries', async () => {
    const run = jest.fn();
    const findings = await explainQueries(
      [{ filename: 'src/util.ts', status: 'modified', additions: 1, deletions: 0, patch: `@@ -0,0 +1,1 @@\n+const x=1\n` }],
      run,
    );
    expect(findings).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('skips removed files', async () => {
    const run = jest.fn();
    const findings = await explainQueries(
      [{ filename: 'src/gone.ts', status: 'removed', additions: 0, deletions: 1, patch: files[0].patch }],
      run,
    );
    expect(findings).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
