/* istanbul ignore file -- runner is the GH Action entry; covered via integration */
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

import { fetchPrContext, estimateTokens } from './github/pr-diff';
import { postInline } from './github/post-inline';
import { postSummary } from './github/post-summary';
import { aggregate } from './aggregator';
import { loadConfig } from './config';
import { applySuppressions } from './suppression';
import { runReasoner } from './claude/reasoner';
import { runStaticHeuristics } from './tools/static-heuristics';
import { parseIstanbulSummary, diffCoverage } from './tools/jest-coverage';
import { diffOpenApi, openApiFindings } from './tools/openapi-diff';
import { parseBundleReport, diffBundle, isFePr } from './tools/bundle-size';
import { findOpenApiSpec, loadOpenApi, detectNewRouteFiles } from './tools/openapi-loader';
import { SYSTEM_PROMPT } from './prompts/system';
import { RULE_PACK_VERSION } from './version';
import { Finding } from './types';

async function main(): Promise<void> {
  const anthropicKey = core.getInput('anthropic-api-key', { required: true });
  const githubToken = core.getInput('github-token', { required: true });
  const model = core.getInput('model') || 'claude-sonnet-4-6';
  const maxTokens = parseInt(core.getInput('max-tokens') || '50000', 10);
  const configPath = core.getInput('config-path') || '.github/ai-review.yml';
  const bundleBudgetKb = parseInt(core.getInput('bundle-budget-kb') || '50', 10);
  const failOnCoverage = (core.getInput('fail-on-coverage-drop') || 'true') === 'true';
  const failOnBreaking = (core.getInput('fail-on-breaking-api') || 'true') === 'true';

  const ctx = github.context;
  if (!ctx.payload.pull_request) {
    core.info('No pull_request context — skipping.');
    core.setOutput('verdict', 'SKIPPED');
    core.setOutput('findings-count', '0');
    return;
  }
  const octokit = github.getOctokit(githubToken);
  const pr = await fetchPrContext(octokit, {
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    pull_number: ctx.payload.pull_request.number,
  });
  const tokens = estimateTokens(pr);
  if (tokens > maxTokens) {
    core.warning(`PR too large (~${tokens} tokens > ${maxTokens}) — politely skipping QA review.`);
    core.setOutput('verdict', 'SKIPPED');
    core.setOutput('findings-count', '0');
    return;
  }

  const repoRoot = process.cwd();
  const config = loadConfig(repoRoot, configPath);
  config.bundle_budget_kb = bundleBudgetKb;
  config.fail_on_coverage_drop = failOnCoverage;
  config.fail_on_breaking_api = failOnBreaking;

  const findings: Finding[] = [];

  // Static heuristics
  findings.push(...runStaticHeuristics(pr.files));

  // Jest coverage delta (compare head report vs base report; users place them via separate steps)
  const baseCovPath = path.join(repoRoot, '.ai-review/base-coverage.json');
  const headCovPath = path.join(repoRoot, 'coverage/coverage-summary.json');
  let coverageDeltaPct = 0;
  if (fs.existsSync(baseCovPath) && fs.existsSync(headCovPath)) {
    const base = parseIstanbulSummary(JSON.parse(fs.readFileSync(baseCovPath, 'utf8')));
    const head = parseIstanbulSummary(JSON.parse(fs.readFileSync(headCovPath, 'utf8')));
    const diff = diffCoverage(base, head, pr.files);
    findings.push(...diff.findings);
    coverageDeltaPct = diff.deltaPct;
  }

  // OpenAPI diff
  const specRel = findOpenApiSpec(repoRoot);
  if (specRel) {
    const headDoc = loadOpenApi(path.join(repoRoot, specRel));
    const baseSpecPath = path.join(repoRoot, '.ai-review', 'base-openapi.yaml');
    const baseDoc = fs.existsSync(baseSpecPath) ? loadOpenApi(baseSpecPath) : {};
    const diff = diffOpenApi(baseDoc, headDoc);
    const newRoutes = detectNewRouteFiles(pr.files.filter((f) => f.status === 'added').map((f) => f.filename));
    findings.push(...openApiFindings(diff, pr.labels, specRel, newRoutes));
  }

  // Bundle-size diff (FE PRs only)
  if (isFePr(pr.files.map((f) => f.filename))) {
    const baseBundlePath = path.join(repoRoot, '.ai-review/base-bundle.json');
    const headBundlePath = path.join(repoRoot, 'webpack-stats.json');
    if (fs.existsSync(baseBundlePath) && fs.existsSync(headBundlePath)) {
      const base = parseBundleReport(JSON.parse(fs.readFileSync(baseBundlePath, 'utf8')));
      const head = parseBundleReport(JSON.parse(fs.readFileSync(headBundlePath, 'utf8')));
      findings.push(...diffBundle(base, head, config.bundle_budget_kb));
    }
  }

  // Claude reasoner for anything subtler
  try {
    const client = new Anthropic({ apiKey: anthropicKey });
    const claudeFindings = await runReasoner(pr.files, {
      client,
      model,
      systemPrompt: SYSTEM_PROMPT,
      maxTokens,
    });
    findings.push(...claudeFindings);
  } catch (err) {
    core.warning(`Claude reasoner failed: ${String(err)}`);
  }

  // Suppression directives
  const bodies: Record<string, string> = {};
  for (const f of pr.files) {
    const abs = path.join(repoRoot, f.filename);
    if (fs.existsSync(abs)) {
      try {
        bodies[f.filename] = fs.readFileSync(abs, 'utf8');
      } catch {
        // skip unreadable
      }
    }
  }
  const { kept } = applySuppressions(findings, bodies);

  const result = aggregate(kept, config, { coverageDeltaPct });

  await postInline(octokit, pr, result.findings);
  await postSummary(octokit, pr, result);

  core.setOutput('verdict', result.verdict);
  core.setOutput('findings-count', String(result.findings.length));
  core.setOutput('rule-pack-version', RULE_PACK_VERSION);
  core.setOutput('coverage-delta', result.coverageDeltaPct.toFixed(2));

  if (result.verdict === 'REQUEST_CHANGES') {
    core.setFailed(`ai-reviewer-qa requested changes (${result.findings.length} findings).`);
  }
}

main().catch((err) => {
  core.setFailed(`ai-reviewer-qa fatal: ${String(err)}`);
});
