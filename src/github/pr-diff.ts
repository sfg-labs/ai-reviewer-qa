import { PrContext, PrFile } from '../types';

// Minimal interface — we only need what we use, to allow easy mocking.
export interface OctokitLike {
  rest: {
    pulls: {
      get: (params: {
        owner: string;
        repo: string;
        pull_number: number;
      }) => Promise<{
        data: {
          base: { sha: string; ref: string };
          head: { sha: string; ref: string };
          labels: Array<{ name: string }>;
        };
      }>;
      listFiles: (params: {
        owner: string;
        repo: string;
        pull_number: number;
        per_page: number;
        page: number;
      }) => Promise<{ data: PrFile[] }>;
    };
  };
}

export interface FetchPrOptions {
  owner: string;
  repo: string;
  pull_number: number;
}

/**
 * Fetch full PR context (head/base SHAs, labels) + all changed files (paginated).
 */
export async function fetchPrContext(
  octokit: OctokitLike,
  opts: FetchPrOptions,
): Promise<PrContext> {
  const pr = await octokit.rest.pulls.get(opts);
  const files: PrFile[] = [];
  let page = 1;
  // GitHub returns max 30 per page by default; we use 100, the cap.
  // Cap pages at 30 (3000 files) — anything larger we don't review.
  for (; page <= 30; page++) {
    const { data } = await octokit.rest.pulls.listFiles({
      ...opts,
      per_page: 100,
      page,
    });
    files.push(...data);
    if (data.length < 100) {
      break;
    }
  }
  const diff_size_bytes = files.reduce(
    (acc, f) => acc + (f.patch ? f.patch.length : 0),
    0,
  );
  return {
    owner: opts.owner,
    repo: opts.repo,
    pull_number: opts.pull_number,
    head_sha: pr.data.head.sha,
    head_ref: pr.data.head.ref,
    base_sha: pr.data.base.sha,
    base_ref: pr.data.base.ref,
    labels: pr.data.labels.map((l) => l.name),
    files,
    diff_size_bytes,
  };
}

/**
 * Given a unified diff patch, return the set of new-file line numbers
 * (i.e. lines that exist in the new version of the file).
 */
export function changedLines(patch: string | undefined): number[] {
  if (!patch) return [];
  const out: number[] = [];
  const lines = patch.split(/\r?\n/);
  let newLine = 0;
  for (const ln of lines) {
    if (ln.startsWith('@@')) {
      const m = ln.match(/\+(\d+)(?:,(\d+))?/);
      if (m) newLine = parseInt(m[1], 10);
      continue;
    }
    if (ln.startsWith('+') && !ln.startsWith('+++')) {
      out.push(newLine);
      newLine++;
    } else if (ln.startsWith('-')) {
      // deletion — no new-file line consumed
    } else if (ln.startsWith(' ')) {
      newLine++;
    }
  }
  return out;
}

/**
 * Coarse PR-size estimate in tokens (~4 bytes/token).
 */
export function estimateTokens(ctx: PrContext): number {
  return Math.ceil(ctx.diff_size_bytes / 4);
}
