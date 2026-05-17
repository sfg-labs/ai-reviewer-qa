# ai-reviewer-qa — CLAUDE.md

> Operating notes for Claude Code working in this repository.

## Purpose

GitHub Action that reviews PRs for **QA** concerns — performance regressions,
N+1 queries, missing indexes, bundle-size bloat, test-coverage drops, and
OpenAPI contract breaks — and posts inline + summary review comments.
Sibling actions handle security (`ai-reviewer-security`) and code quality
(`ai-reviewer-quality`).

## Folder layout

```
action.yml                       GitHub Action manifest (node20, dist/index.js entry)
src/
  runner.ts                      entry — wires action inputs to the pipeline
  types.ts                       Finding / PrFile / PrContext / ReviewerConfig
  config.ts                      loads .github/ai-review.yml (per-repo overrides)
  version.ts                     RULE_PACK_VERSION + ANALYZER_VERSIONS constants
  suppression.ts                 `// ai-review-ignore: <RULE_ID>` parsing
  aggregator.ts                  dedupe + override + verdict policy
  github/
    pr-diff.ts                   octokit wrapper, changedLines() helper
    post-inline.ts               inline review comment poster + body renderer
    post-summary.ts              summary review poster + body renderer
  tools/
    static-heuristics.ts         pure regex pass (N+1, query-in-loop, skip, etc.)
    jest-coverage.ts             Istanbul summary diff (COV.DROP/COV.NEW)
    openapi-diff.ts              schema diff (API.BREAK/API.UNDOC)
    openapi-loader.ts            file discovery + YAML/JSON parse
    bundle-size.ts               webpack stats / bundle-analyzer diff
    pg-explain.ts                EXPLAIN parser (PERF.INDEX.001)
  claude/
    reasoner.ts                  @anthropic-ai/sdk wrapper + JSON parser + validator
  prompts/
    system.md                    system prompt for the Claude reasoner
  rule-packs/
    <RULE_ID>.md                 one Markdown file per rule (11 v1 rules)
tests/
  *.spec.ts                      unit tests; mocked octokit + mocked Anthropic
  fixtures/sample-prs.ts         captured diffs + coverage/openapi/bundle samples
dist/
  index.js                       bundled runner (committed — GH Actions need it)
docs/
  RULES.md                       full rule catalog
  INSTALL.md                     3-step install for any sfg-labs repo
```

## Hard rules

1. **Verdict policy.**
   - REQUEST_CHANGES if `fail_on_coverage_drop: true` AND any COV.DROP.001 finding
   - REQUEST_CHANGES if `fail_on_breaking_api: true` AND any API.BREAK.001 finding (label `breaking-change` overrides)
   - APPROVE if zero findings
   - COMMENT otherwise
2. **Findings scoped to changed lines** in inline comments. The summary review always renders.
3. **Cite every finding.** `rule_id` + `citation_url` pointing to `src/rule-packs/<RULE_ID>.md`.
4. **Reproducibility.** `rule_pack_version` + `analyzer_versions` pinned in `src/version.ts` and stamped on each finding.
5. **Suppression.** `// ai-review-ignore: <RULE_ID> — reason` on or +/- 1 line of the finding suppresses it (`//`, `#`, `<!-- -->` markers).
6. **Token budget.** Default 50K input; over budget the action posts a SKIPPED verdict.
7. **Bundled `dist/`.** Always re-run `npm run build` after edits to `src/` and commit `dist/index.js`. CI verifies sync.
8. **macOS bash 3.2 compatible** scripts only (no `mapfile`, no `[[ -v ... ]]`).
9. **Default model: `claude-sonnet-4-6`.**

## Adding a new rule

1. Add `src/rule-packs/<RULE_ID>.md` (severity, why, bad, good, suppress).
2. If Claude-only: add the id to `VALID_RULES` in `src/claude/reasoner.ts` and to `src/prompts/system.md`.
3. If analyzer-driven: emit it from the relevant `src/tools/*.ts` file.
4. Add at least one fixture in `tests/fixtures/sample-prs.ts` and a spec.
5. Bump `RULE_PACK_VERSION` in `src/version.ts` if behaviour changed.
6. Update `docs/RULES.md`.
7. `npm test && npm run build` then commit.

## Don'ts

- Don't import `package.json` from runtime code (breaks the ncc bundle).
- Don't add network calls beyond GitHub API + Anthropic API.
- Don't run real analyzers in this repo's own CI (would be recursive). Mock them in tests.
- Don't hardcode the Anthropic API key — only consume via the `anthropic-api-key` input.
