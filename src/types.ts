/**
 * Shared types for the ai-reviewer-qa runner.
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type Verdict = 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES' | 'SKIPPED';

export interface Finding {
  rule_id: string;
  severity: Severity;
  confidence: number;
  file: string;
  line: number;
  explanation: string;
  remediation: string;
  citation_url: string;
  source: 'jest' | 'openapi-diff' | 'bundle' | 'explain' | 'claude';
  rule_pack_version: string;
  analyzer_version?: string;
}

export interface PrFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

export interface PrContext {
  owner: string;
  repo: string;
  pull_number: number;
  head_sha: string;
  base_sha: string;
  base_ref: string;
  head_ref: string;
  labels: string[];
  files: PrFile[];
  diff_size_bytes: number;
}

export interface CoverageReport {
  files: Record<string, FileCoverage>;
  total: { lines: number; covered: number; pct: number };
}

export interface FileCoverage {
  lines: number;
  covered: number;
  pct: number;
  uncoveredLines: number[];
}

export interface ReviewerConfig {
  ignore_paths: string[];
  rule_overrides: Record<string, { severity?: Severity; disabled?: boolean }>;
  bundle_budget_kb: number;
  fail_on_coverage_drop: boolean;
  fail_on_breaking_api: boolean;
}

export interface AggregateResult {
  findings: Finding[];
  verdict: Verdict;
  summary: string;
  coverageDeltaPct: number;
  breakingApi: boolean;
  rulePackVersion: string;
  analyzerVersions: Record<string, string>;
}
