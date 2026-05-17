import { Finding, PrFile } from '../types';
import { RULE_PACK_VERSION, citationUrl } from '../version';

/**
 * Cheap pre-Claude regex pass over the diff. Each rule is intentionally
 * conservative; ambiguity goes to the Claude reasoner.
 *
 * Rules covered here:
 *  - PERF.NPLUS1.001 — Prisma `include:` paired with loop iteration markers
 *  - PERF.QUERY.001  — Query inside a for/while/.map/.forEach
 *  - PERF.MEMO.001   — `React.useMemo`/`useCallback` removed from a heavy component
 *  - FLAKY.001       — `it.skip` / `test.skip` / `xit(` / `xdescribe(`
 *  - LOAD.001        — new express/fastify route without a rate-limit middleware
 */
export function runStaticHeuristics(files: PrFile[]): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    if (!f.patch || f.status === 'removed') continue;
    const lines = f.patch.split(/\r?\n/);
    let newLine = 0;
    let inLoop = false;
    let loopDepth = 0;
    const isTs = /\.(ts|tsx|js|jsx|mjs)$/.test(f.filename);
    const isReact = /\.(tsx|jsx)$/.test(f.filename);

    for (const raw of lines) {
      if (raw.startsWith('@@')) {
        const m = raw.match(/\+(\d+)/);
        if (m) newLine = parseInt(m[1], 10);
        inLoop = false;
        loopDepth = 0;
        continue;
      }
      const isAdd = raw.startsWith('+') && !raw.startsWith('+++');
      const body = raw.startsWith('+') || raw.startsWith('-') || raw.startsWith(' ')
        ? raw.slice(1)
        : raw;

      if (isAdd) {
        // PERF.NPLUS1.001 — Prisma include inside a loop (either same line, or `include` while inLoop)
        const sameLine =
          /\binclude\s*:\s*\{/.test(body) && /\b(map|forEach|for\s*\()/.test(body);
        if (sameLine || (inLoop && /\binclude\s*:\s*\{/.test(body))) {
          out.push(mk('PERF.NPLUS1.001', 'HIGH', 0.85, f.filename, newLine,
            `Prisma \`include\` used inside a loop iterator on \`${f.filename}\`. Each iteration may fan out to N+1 round-trips.`,
            'Use `select` with explicit joins, or batch via `findMany({ where: { id: { in: ids } } })`.',
          ));
        }
        // PERF.MEMO.001 — large React component without memoization
        if (isReact && /export\s+(default\s+)?function\s+[A-Z]/.test(body)
          && !lines.some((l) => /React\.memo|useMemo|useCallback/.test(l))) {
          // Only fire once per file
          if (!out.find((x) => x.rule_id === 'PERF.MEMO.001' && x.file === f.filename)) {
            out.push(mk('PERF.MEMO.001', 'LOW', 0.55, f.filename, newLine,
              `Component in \`${f.filename}\` is exported without any \`React.memo\`/\`useMemo\` boundary. Re-renders may be expensive.`,
              'Wrap with `React.memo` or hoist expensive computations behind `useMemo`.',
            ));
          }
        }
        // FLAKY.001 — skipped test
        if (isTs && /\b(it|test|describe)\.skip\b|xit\s*\(|xdescribe\s*\(/.test(body)
          && !/\/\/.*reason:/i.test(body)) {
          out.push(mk('FLAKY.001', 'MEDIUM', 0.95, f.filename, newLine,
            `Test is skipped in \`${f.filename}\` without a reason comment.`,
            'Either fix the test, or add a comment `// reason: <why>` next to the `.skip`.',
          ));
        }
        // LOAD.001 — new route without rate limit
        if (isTs && /app\.(get|post|put|patch|delete)\s*\(/.test(body)) {
          const hasRateLimit = lines.some((l) =>
            /rateLimit|express-rate-limit|fastify-rate-limit|@nestjs\/throttler/.test(l),
          );
          if (!hasRateLimit) {
            out.push(mk('LOAD.001', 'MEDIUM', 0.7, f.filename, newLine,
              `New route handler in \`${f.filename}\` registered without a visible rate-limit middleware.`,
              'Apply a per-route or global rate-limit (`express-rate-limit`, `@nestjs/throttler`, etc.).',
            ));
          }
        }
        // PERF.QUERY.001 — DB query inside a loop
        if (inLoop && /(prisma|knex|db|pool|client)\.(query|findMany|findFirst|findUnique|raw)\s*\(/.test(body)) {
          out.push(mk('PERF.QUERY.001', 'HIGH', 0.9, f.filename, newLine,
            `Database query issued inside a loop in \`${f.filename}\`. Each iteration costs a round-trip.`,
            'Hoist the query out of the loop, or batch with `WHERE id IN (...)`.',
          ));
        }
      }

      // Track loop state across all lines that are present in the new file
      if (isAdd || raw.startsWith(' ')) {
        if (/\b(for|while)\s*\(|\.(map|forEach|reduce)\s*\(/.test(body)) {
          inLoop = true;
          loopDepth++;
        }
        if (/^\s*\}/.test(body) && loopDepth > 0) {
          loopDepth--;
          if (loopDepth === 0) inLoop = false;
        }
      }
      if (isAdd || raw.startsWith(' ')) newLine++;
    }
  }
  return dedupe(out);
}

function mk(
  rule_id: string,
  severity: Finding['severity'],
  confidence: number,
  file: string,
  line: number,
  explanation: string,
  remediation: string,
): Finding {
  return {
    rule_id,
    severity,
    confidence,
    file,
    line: line || 1,
    explanation,
    remediation,
    citation_url: citationUrl(rule_id),
    source: 'jest',
    rule_pack_version: RULE_PACK_VERSION,
  };
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const k = `${f.rule_id}|${f.file}|${f.line}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(f);
    }
  }
  return out;
}
