import { Finding, PrContext } from '../types';
import { changedLines } from './pr-diff';

export interface InlineCommentsOctokit {
  rest: {
    pulls: {
      createReviewComment: (params: {
        owner: string;
        repo: string;
        pull_number: number;
        commit_id: string;
        path: string;
        line: number;
        side: 'RIGHT' | 'LEFT';
        body: string;
      }) => Promise<{ data: { id: number } }>;
    };
  };
}

/**
 * Format a single finding as a Markdown inline comment body, including
 * rule_id, severity, citation, analyzer source, and rule-pack version.
 */
export function renderInlineBody(f: Finding): string {
  const badge = `\`${f.rule_id}\` · **${f.severity}** · confidence ${(f.confidence * 100).toFixed(0)}%`;
  return (
    `:robot: **ai-reviewer-qa** — ${badge}\n\n` +
    `${f.explanation}\n\n` +
    `**Fix:** ${f.remediation}\n\n` +
    `_source: \`${f.source}\` · rule-pack: \`${f.rule_pack_version}\`` +
    (f.analyzer_version ? ` · analyzer: \`${f.analyzer_version}\`` : '') +
    `_\n\n` +
    `[rule docs](${f.citation_url})`
  );
}

/**
 * Post one inline review comment per finding. Skips findings whose line is
 * not actually in the PR's new-file additions (GitHub rejects such comments).
 *
 * Returns the number of comments successfully posted.
 */
export async function postInline(
  octokit: InlineCommentsOctokit,
  ctx: PrContext,
  findings: Finding[],
): Promise<number> {
  // Build map: filename -> Set<newFileLine>
  const linesByFile: Record<string, Set<number>> = {};
  for (const f of ctx.files) {
    linesByFile[f.filename] = new Set(changedLines(f.patch));
  }
  let posted = 0;
  for (const f of findings) {
    const valid = linesByFile[f.file]?.has(f.line);
    if (!valid) continue;
    try {
      await octokit.rest.pulls.createReviewComment({
        owner: ctx.owner,
        repo: ctx.repo,
        pull_number: ctx.pull_number,
        commit_id: ctx.head_sha,
        path: f.file,
        line: f.line,
        side: 'RIGHT',
        body: renderInlineBody(f),
      });
      posted++;
    } catch (err) {
      process.stderr.write(
        `[ai-reviewer-qa] inline comment failed for ${f.file}:${f.line} (${f.rule_id}): ${String(err)}\n`,
      );
    }
  }
  return posted;
}
