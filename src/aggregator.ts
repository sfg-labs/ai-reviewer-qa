import { AggregateResult, Finding, ReviewerConfig, Verdict } from './types';
import { ANALYZER_VERSIONS, RULE_PACK_VERSION } from './version';

const SEVERITY_ORDER: Record<Finding['severity'], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Dedupe by (rule_id, file, line), apply per-rule config overrides, then
 * compute the QA verdict:
 *  - REQUEST_CHANGES if `fail_on_coverage_drop` AND any COV.DROP.001 finding
 *  - REQUEST_CHANGES if `fail_on_breaking_api` AND any API.BREAK.001 finding
 *  - APPROVE if no findings
 *  - COMMENT otherwise
 */
export function aggregate(
  findings: Finding[],
  config: ReviewerConfig,
  opts: { coverageDeltaPct: number },
): AggregateResult {
  // Apply rule overrides (severity bump, disable)
  const applied: Finding[] = [];
  for (const f of findings) {
    const override = config.rule_overrides[f.rule_id];
    if (override?.disabled) continue;
    if (override?.severity) {
      applied.push({ ...f, severity: override.severity });
    } else {
      applied.push(f);
    }
  }
  // Dedupe by (rule_id, file, line) keeping the highest severity / confidence
  const map = new Map<string, Finding>();
  for (const f of applied) {
    const key = `${f.rule_id}|${f.file}|${f.line}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, f);
      continue;
    }
    const wins =
      SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[prev.severity] ||
      (f.severity === prev.severity && f.confidence > prev.confidence);
    if (wins) map.set(key, f);
  }
  const deduped = Array.from(map.values()).sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return b.confidence - a.confidence;
  });

  const hasCoverageDrop = deduped.some((f) => f.rule_id === 'COV.DROP.001');
  const hasBreakingApi = deduped.some((f) => f.rule_id === 'API.BREAK.001');

  let verdict: Verdict;
  if ((config.fail_on_coverage_drop && hasCoverageDrop) ||
      (config.fail_on_breaking_api && hasBreakingApi)) {
    verdict = 'REQUEST_CHANGES';
  } else if (deduped.length === 0) {
    verdict = 'COMMENT';
  } else {
    verdict = 'COMMENT';
  }

  const summary = buildSummary(deduped, hasCoverageDrop, hasBreakingApi);
  return {
    findings: deduped,
    verdict,
    summary,
    coverageDeltaPct: opts.coverageDeltaPct,
    breakingApi: hasBreakingApi,
    rulePackVersion: RULE_PACK_VERSION,
    analyzerVersions: ANALYZER_VERSIONS,
  };
}

function buildSummary(findings: Finding[], coverageDrop: boolean, breaking: boolean): string {
  if (findings.length === 0) {
    return 'No QA regressions detected. Coverage holds, OpenAPI contract intact, no obvious perf smells.';
  }
  const reasons: string[] = [];
  if (coverageDrop) reasons.push('test coverage regressed on changed files');
  if (breaking) reasons.push('OpenAPI contract has a breaking change without `breaking-change` label');
  if (reasons.length === 0) reasons.push('non-blocking perf/coverage observations');
  return `Reviewed ${findings.length} finding${findings.length === 1 ? '' : 's'} — ${reasons.join('; ')}.`;
}
