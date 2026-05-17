import { RULE_PACK_VERSION, ANALYZER_VERSIONS, citationUrl, CITATION_BASE_URL } from '../src/version';

describe('version', () => {
  it('exports a semver-shaped rule-pack version', () => {
    expect(RULE_PACK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('lists the core analyzers', () => {
    expect(Object.keys(ANALYZER_VERSIONS)).toEqual(
      expect.arrayContaining(['jest', 'openapi-diff', 'webpack-bundle-analyzer', 'pg-explain']),
    );
  });

  it('builds a citation URL anchored to the rule pack folder', () => {
    expect(citationUrl('PERF.NPLUS1.001')).toBe(
      `${CITATION_BASE_URL}/PERF.NPLUS1.001.md`,
    );
  });
});
