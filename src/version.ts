/**
 * Rule-pack + analyzer version pins. Bump rule_pack_version on any rule change.
 */
export const RULE_PACK_VERSION = '1.0.0';

export const ANALYZER_VERSIONS: Record<string, string> = {
  'jest': '29.x',
  'openapi-diff': '0.x',
  'webpack-bundle-analyzer': '4.x',
  'pg-explain': 'native',
  'claude-sdk': '0.45+',
};

export const CITATION_BASE_URL =
  'https://github.com/sfg-labs/ai-reviewer-qa/blob/main/src/rule-packs';

export function citationUrl(ruleId: string): string {
  return `${CITATION_BASE_URL}/${ruleId}.md`;
}
