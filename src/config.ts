import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ReviewerConfig } from './types';

const DEFAULT_CONFIG: ReviewerConfig = {
  ignore_paths: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '**/*.snap'],
  rule_overrides: {},
  bundle_budget_kb: 50,
  fail_on_coverage_drop: true,
  fail_on_breaking_api: true,
};

/**
 * Read `.github/ai-review.yml` from the target repo, if present.
 * Merges over the defaults.
 *
 * @param repoRoot absolute path to the checked-out repo
 * @param configPath relative path to the config file (default `.github/ai-review.yml`)
 */
export function loadConfig(
  repoRoot: string,
  configPath = '.github/ai-review.yml',
): ReviewerConfig {
  const abs = path.join(repoRoot, configPath);
  if (!fs.existsSync(abs)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    const parsed = yaml.load(raw) as Record<string, unknown> | undefined;
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_CONFIG };
    }
    const qa = (parsed['qa'] as Record<string, unknown>) ?? {};
    return mergeConfig(DEFAULT_CONFIG, qa);
  } catch (err) {
    // Malformed YAML — fall back to defaults but log
    process.stderr.write(`[ai-reviewer-qa] config parse error: ${String(err)}\n`);
    return { ...DEFAULT_CONFIG };
  }
}

function mergeConfig(base: ReviewerConfig, overlay: Record<string, unknown>): ReviewerConfig {
  const out: ReviewerConfig = {
    ignore_paths: Array.isArray(overlay['ignore_paths'])
      ? (overlay['ignore_paths'] as string[])
      : base.ignore_paths,
    rule_overrides:
      typeof overlay['rule_overrides'] === 'object' && overlay['rule_overrides']
        ? (overlay['rule_overrides'] as ReviewerConfig['rule_overrides'])
        : base.rule_overrides,
    bundle_budget_kb:
      typeof overlay['bundle_budget_kb'] === 'number'
        ? (overlay['bundle_budget_kb'] as number)
        : base.bundle_budget_kb,
    fail_on_coverage_drop:
      typeof overlay['fail_on_coverage_drop'] === 'boolean'
        ? (overlay['fail_on_coverage_drop'] as boolean)
        : base.fail_on_coverage_drop,
    fail_on_breaking_api:
      typeof overlay['fail_on_breaking_api'] === 'boolean'
        ? (overlay['fail_on_breaking_api'] as boolean)
        : base.fail_on_breaking_api,
  };
  return out;
}

export const _internal = { DEFAULT_CONFIG, mergeConfig };
