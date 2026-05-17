import { applySuppressions, parseSuppressions } from '../src/suppression';
import { Finding } from '../src/types';

const baseFinding = (over: Partial<Finding> = {}): Finding => ({
  rule_id: 'PERF.NPLUS1.001',
  severity: 'HIGH',
  confidence: 0.9,
  file: 'src/a.ts',
  line: 4,
  explanation: 'x',
  remediation: 'y',
  citation_url: 'http://x',
  source: 'claude',
  rule_pack_version: '1.0.0',
  ...over,
});

describe('parseSuppressions', () => {
  it('parses // comments with em-dash separator', () => {
    const supps = parseSuppressions('foo\n// ai-review-ignore: PERF.NPLUS1.001 — bounded N=3\nbar');
    expect(supps).toEqual([
      { ruleId: 'PERF.NPLUS1.001', reason: 'bounded N=3', line: 2 },
    ]);
  });

  it('parses # comments and falls back when reason missing', () => {
    const supps = parseSuppressions('# ai-review-ignore: LOAD.001');
    expect(supps[0].reason).toBe('no reason given');
  });

  it('parses HTML comments', () => {
    const supps = parseSuppressions('<!-- ai-review-ignore: API.UNDOC.001 — preview -->');
    expect(supps).toHaveLength(1);
    expect(supps[0].ruleId).toBe('API.UNDOC.001');
  });

  it('returns empty when no markers present', () => {
    expect(parseSuppressions('plain code\nno markers')).toEqual([]);
  });
});

describe('applySuppressions', () => {
  it('suppresses a finding on the exact suppression line', () => {
    const findings = [baseFinding({ line: 5 })];
    const bodies = {
      'src/a.ts':
        'line1\nline2\nline3\nline4\n// ai-review-ignore: PERF.NPLUS1.001 — known\nline6\n',
    };
    const { kept, suppressed } = applySuppressions(findings, bodies);
    expect(kept).toHaveLength(0);
    expect(suppressed[0].reason).toBe('known');
  });

  it('suppresses one line above/below as well (±1 tolerance)', () => {
    const findings = [baseFinding({ line: 3 })];
    const bodies = {
      'src/a.ts': '1\n2\n3\n// ai-review-ignore: PERF.NPLUS1.001 — adj\n',
    };
    const { kept } = applySuppressions(findings, bodies);
    expect(kept).toHaveLength(0);
  });

  it('does not suppress unrelated rules', () => {
    const findings = [baseFinding({ rule_id: 'COV.DROP.001', line: 5 })];
    const bodies = {
      'src/a.ts':
        'line1\nline2\nline3\nline4\n// ai-review-ignore: PERF.NPLUS1.001 — wrong rule\n',
    };
    const { kept } = applySuppressions(findings, bodies);
    expect(kept).toHaveLength(1);
  });

  it('handles files with no body in the bodies map', () => {
    const findings = [baseFinding()];
    const { kept } = applySuppressions(findings, {});
    expect(kept).toHaveLength(1);
  });
});
