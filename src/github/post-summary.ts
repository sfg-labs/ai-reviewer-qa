import { AggregateResult, PrContext, Verdict } from '../types';

export interface SummaryOctokit {
  rest: {
    pulls: {
      createReview: (params: {
        owner: string;
        repo: string;
        pull_number: number;
        commit_id: string;
        body: string;
        event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      }) => Promise<{ data: { id: number } }>;
    };
  };
}

const VERDICT_TO_EVENT: Record<Verdict, 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' | null> = {
  APPROVE: 'APPROVE',
  COMMENT: 'COMMENT',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
  SKIPPED: null,
};

/**
 * Build the Markdown body of the summary review.
 */
export function renderSummaryBody(result: AggregateResult, ctx: PrContext): string {
  const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of result.findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  const lines: string[] = [];
  lines.push(`## :robot: ai-reviewer-qa — verdict: **${result.verdict}**`);
  lines.push('');
  lines.push(result.summary);
  lines.push('');
  lines.push(`**Coverage delta on changed files:** ${result.coverageDeltaPct >= 0 ? '+' : ''}${result.coverageDeltaPct.toFixed(2)} pp`);
  lines.push(`**Breaking API change:** ${result.breakingApi ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('### Findings');
  lines.push(
    `- CRITICAL: ${counts.CRITICAL} · HIGH: ${counts.HIGH} · MEDIUM: ${counts.MEDIUM} · LOW: ${counts.LOW}`,
  );
  lines.push('');
  lines.push('### Reproducibility');
  lines.push(`- rule-pack: \`${result.rulePackVersion}\``);
  for (const [name, ver] of Object.entries(result.analyzerVersions)) {
    lines.push(`- ${name}: \`${ver}\``);
  }
  lines.push(`- head commit: \`${ctx.head_sha}\``);
  lines.push('');
  lines.push(
    `_Suppress a rule by adding \`// ai-review-ignore: <RULE_ID> — reason\` on (or next to) the flagged line._`,
  );
  return lines.join('\n');
}

/**
 * Post the summary review with the chosen verdict. SKIPPED → no review posted.
 */
export async function postSummary(
  octokit: SummaryOctokit,
  ctx: PrContext,
  result: AggregateResult,
): Promise<{ posted: boolean; reviewId?: number }> {
  const event = VERDICT_TO_EVENT[result.verdict];
  if (!event) {
    return { posted: false };
  }
  const body = renderSummaryBody(result, ctx);
  const resp = await octokit.rest.pulls.createReview({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pull_number,
    commit_id: ctx.head_sha,
    body,
    event,
  });
  return { posted: true, reviewId: resp.data.id };
}
