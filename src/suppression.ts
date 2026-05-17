import { Finding } from './types';

/**
 * Match a `// ai-review-ignore: <RULE_ID> — reason` comment.
 * Supports `//`, `#`, and `<!-- ... -->` comment markers.
 */
const SUPPRESSION_RE =
  /(?:\/\/|#|<!--)\s*ai-review-ignore:\s*([A-Z][A-Z0-9_.]+)\s*(?:[—\-:]\s*(.+?))?\s*(?:-->)?\s*$/m;

export interface Suppression {
  ruleId: string;
  reason: string;
  line: number;
}

/**
 * Extract suppression directives from a file body.
 */
export function parseSuppressions(body: string): Suppression[] {
  const out: Suppression[] = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SUPPRESSION_RE);
    if (m) {
      out.push({
        ruleId: m[1],
        reason: (m[2] ?? '').trim() || 'no reason given',
        line: i + 1,
      });
    }
  }
  return out;
}

/**
 * Remove findings that fall on (or one line before/after) an
 * `ai-review-ignore: <RULE_ID>` directive matching the finding's rule_id.
 */
export function applySuppressions(
  findings: Finding[],
  fileBodies: Record<string, string>,
): { kept: Finding[]; suppressed: Array<{ finding: Finding; reason: string }> } {
  const suppMap: Record<string, Suppression[]> = {};
  for (const [file, body] of Object.entries(fileBodies)) {
    suppMap[file] = parseSuppressions(body);
  }
  const kept: Finding[] = [];
  const suppressed: Array<{ finding: Finding; reason: string }> = [];
  for (const f of findings) {
    const supps = suppMap[f.file] ?? [];
    const hit = supps.find(
      (s) => s.ruleId === f.rule_id && Math.abs(s.line - f.line) <= 1,
    );
    if (hit) {
      suppressed.push({ finding: f, reason: hit.reason });
    } else {
      kept.push(f);
    }
  }
  return { kept, suppressed };
}
