import { CoverageReport, FileCoverage, Finding, PrFile } from '../types';
import { RULE_PACK_VERSION, ANALYZER_VERSIONS, citationUrl } from '../version';

/**
 * Parse an Istanbul JSON summary (`coverage/coverage-summary.json`) into a CoverageReport.
 * Accepts the canonical Istanbul shape:
 * {
 *   "total":   { "lines": { "total": N, "covered": N, "pct": N }, ... },
 *   "<file>":  { "lines": {...} }
 * }
 */
export function parseIstanbulSummary(json: unknown): CoverageReport {
  if (!json || typeof json !== 'object') {
    return { files: {}, total: { lines: 0, covered: 0, pct: 0 } };
  }
  const summary = json as Record<string, unknown>;
  const files: Record<string, FileCoverage> = {};
  let total: FileCoverage = { lines: 0, covered: 0, pct: 0, uncoveredLines: [] };
  for (const [k, v] of Object.entries(summary)) {
    if (!v || typeof v !== 'object') continue;
    const node = v as Record<string, unknown>;
    const linesNode = node['lines'] as
      | { total?: number; covered?: number; pct?: number }
      | undefined;
    if (!linesNode) continue;
    const fc: FileCoverage = {
      lines: linesNode.total ?? 0,
      covered: linesNode.covered ?? 0,
      pct: linesNode.pct ?? 0,
      uncoveredLines: [],
    };
    if (k === 'total') {
      total = fc;
    } else {
      files[k] = fc;
    }
  }
  return {
    files,
    total: { lines: total.lines, covered: total.covered, pct: total.pct },
  };
}

/**
 * Compare head vs base coverage report; flag every changed file where line
 * coverage dropped by ≥ `thresholdPp` percentage points (default 0.01 = any drop).
 *
 * Also flags brand-new files with zero coverage (COV.NEW.001).
 */
export function diffCoverage(
  base: CoverageReport,
  head: CoverageReport,
  changedFiles: PrFile[],
  thresholdPp = 0.01,
): { findings: Finding[]; deltaPct: number } {
  const findings: Finding[] = [];
  let dropSum = 0;
  let dropCount = 0;
  for (const cf of changedFiles) {
    if (cf.status === 'removed') continue;
    const headCov = bestMatch(head.files, cf.filename);
    if (cf.status === 'added') {
      if (!headCov || headCov.pct === 0) {
        findings.push({
          rule_id: 'COV.NEW.001',
          severity: 'MEDIUM',
          confidence: 0.95,
          file: cf.filename,
          line: 1,
          explanation: `New file \`${cf.filename}\` is added without any covering tests.`,
          remediation: 'Add unit tests that exercise at least the public exports of this module.',
          citation_url: citationUrl('COV.NEW.001'),
          source: 'jest',
          rule_pack_version: RULE_PACK_VERSION,
          analyzer_version: ANALYZER_VERSIONS['jest'],
        });
      }
      continue;
    }
    const baseCov = bestMatch(base.files, cf.previous_filename ?? cf.filename);
    if (!baseCov || !headCov) continue;
    const drop = baseCov.pct - headCov.pct;
    if (drop >= thresholdPp) {
      dropSum += drop;
      dropCount++;
      findings.push({
        rule_id: 'COV.DROP.001',
        severity: drop >= 5 ? 'HIGH' : 'MEDIUM',
        confidence: 0.99,
        file: cf.filename,
        line: 1,
        explanation:
          `Line coverage for \`${cf.filename}\` dropped from ` +
          `${baseCov.pct.toFixed(2)}% → ${headCov.pct.toFixed(2)}% (-${drop.toFixed(2)} pp).`,
        remediation:
          'Add or update tests so that coverage on this file is at least as high as on the base branch.',
        citation_url: citationUrl('COV.DROP.001'),
        source: 'jest',
        rule_pack_version: RULE_PACK_VERSION,
        analyzer_version: ANALYZER_VERSIONS['jest'],
      });
    }
  }
  const deltaPct = dropCount === 0 ? 0 : -(dropSum / dropCount);
  return { findings, deltaPct };
}

function bestMatch(
  files: Record<string, FileCoverage>,
  needle: string,
): FileCoverage | undefined {
  if (files[needle]) return files[needle];
  // Istanbul keys are usually absolute paths — try suffix match
  for (const [k, v] of Object.entries(files)) {
    if (k.endsWith(needle) || k.endsWith('/' + needle)) return v;
  }
  return undefined;
}
