import { Finding, PrFile } from '../types';
import { RULE_PACK_VERSION, ANALYZER_VERSIONS, citationUrl } from '../version';

export interface ExplainRow {
  'QUERY PLAN'?: string;
  Plan?: { 'Node Type': string; 'Relation Name'?: string; Plans?: unknown[] };
}

/** Pluggable runner — tests inject a mock; runtime calls `psql`. */
export type ExplainRunner = (query: string) => Promise<ExplainRow[]>;

/**
 * Extract SQL strings from new-file diff lines. Looks for:
 *   `SELECT ... FROM`
 *   `prisma.<model>.findMany({ where: { ... } })`
 *   `db.query('SELECT ...')`
 */
export function extractQueriesFromPatch(patch: string | undefined): string[] {
  if (!patch) return [];
  const queries: string[] = [];
  const lines = patch.split(/\r?\n/);
  for (const ln of lines) {
    if (!ln.startsWith('+') || ln.startsWith('+++')) continue;
    const body = ln.slice(1);
    const rawSql = body.match(/(SELECT\s+[\s\S]+?\s+FROM\s+[A-Za-z0-9_."]+(?:\s+WHERE\s+[^;'"`]+)?)/i);
    if (rawSql) queries.push(rawSql[1].trim());
  }
  return queries;
}

/**
 * Run EXPLAIN (FORMAT JSON) on each query. Detect Seq Scan on a non-trivial
 * relation → PERF.INDEX.001 finding.
 *
 * Connection-less by design: the caller passes a runner that owns the pool.
 */
export async function explainQueries(
  files: PrFile[],
  run: ExplainRunner,
): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const f of files) {
    if (f.status === 'removed') continue;
    const queries = extractQueriesFromPatch(f.patch);
    for (const q of queries) {
      try {
        const rows = await run(`EXPLAIN (FORMAT JSON) ${q}`);
        const seqScan = detectSeqScan(rows);
        if (seqScan) {
          out.push({
            rule_id: 'PERF.INDEX.001',
            severity: 'MEDIUM',
            confidence: 0.8,
            file: f.filename,
            line: 1,
            explanation:
              `Postgres EXPLAIN reports a Seq Scan on \`${seqScan}\` for a query introduced in this PR.`,
            remediation:
              `Add an index on the WHERE/JOIN columns of \`${seqScan}\` (or restructure the query to use an existing one).`,
            citation_url: citationUrl('PERF.INDEX.001'),
            source: 'explain',
            rule_pack_version: RULE_PACK_VERSION,
            analyzer_version: ANALYZER_VERSIONS['pg-explain'],
          });
        }
      } catch (err) {
        // Ignore failures — typical when query references runtime-bound params
        process.stderr.write(`[ai-reviewer-qa] EXPLAIN failed: ${String(err)}\n`);
      }
    }
  }
  return out;
}

export function detectSeqScan(rows: ExplainRow[]): string | undefined {
  for (const r of rows) {
    if (r.Plan) {
      const hit = walk(r.Plan);
      if (hit) return hit;
    }
    if (r['QUERY PLAN'] && r['QUERY PLAN'].includes('Seq Scan on ')) {
      const m = r['QUERY PLAN'].match(/Seq Scan on ([A-Za-z0-9_]+)/);
      if (m) return m[1];
    }
  }
  return undefined;
}

function walk(plan: { 'Node Type': string; 'Relation Name'?: string; Plans?: unknown[] }): string | undefined {
  if (plan['Node Type'] === 'Seq Scan' && plan['Relation Name']) {
    return plan['Relation Name'];
  }
  for (const child of plan.Plans ?? []) {
    if (child && typeof child === 'object') {
      const found = walk(child as Parameters<typeof walk>[0]);
      if (found) return found;
    }
  }
  return undefined;
}
