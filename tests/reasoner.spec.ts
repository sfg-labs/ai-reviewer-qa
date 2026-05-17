import {
  buildPrompt,
  normalizeFinding,
  runReasoner,
  safeParseJson,
} from '../src/claude/reasoner';
import { PrFile } from '../src/types';

const fakeFinding = {
  rule_id: 'PERF.NPLUS1.001',
  severity: 'HIGH',
  confidence: 0.91,
  file: 'src/x.ts',
  line: 7,
  explanation: 'Loops over orders calling findUnique each time.',
  remediation: 'Use include or batch-fetch.',
};

const files: PrFile[] = [
  {
    filename: 'src/x.ts',
    status: 'modified',
    additions: 1,
    deletions: 0,
    patch: '+await prisma.user.findUnique(...)\n',
  },
];

const mkClient = (text: string) => ({
  messages: {
    create: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  },
});

describe('safeParseJson', () => {
  it('parses a plain JSON array', () => {
    expect(safeParseJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('strips ```json fences', () => {
    expect(safeParseJson('```json\n[1]\n```')).toEqual([1]);
  });

  it('extracts an embedded array as a fallback', () => {
    expect(safeParseJson('here you go: [{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('returns null on completely invalid input', () => {
    expect(safeParseJson('not json at all')).toBeNull();
  });

  it('returns null when fallback array is unparseable', () => {
    expect(safeParseJson('garbage [not, json,]')).toBeNull();
  });
});

describe('normalizeFinding', () => {
  it('accepts a valid finding', () => {
    const f = normalizeFinding(fakeFinding)!;
    expect(f.rule_id).toBe('PERF.NPLUS1.001');
    expect(f.source).toBe('claude');
    expect(f.citation_url).toContain('PERF.NPLUS1.001.md');
  });

  it('rejects unknown rule_id', () => {
    expect(normalizeFinding({ ...fakeFinding, rule_id: 'NOPE.999' })).toBeNull();
  });

  it('rejects invalid severity', () => {
    expect(normalizeFinding({ ...fakeFinding, severity: 'urgent' })).toBeNull();
  });

  it('rejects out-of-range confidence', () => {
    expect(normalizeFinding({ ...fakeFinding, confidence: 2 })).toBeNull();
    expect(normalizeFinding({ ...fakeFinding, confidence: -1 })).toBeNull();
    expect(normalizeFinding({ ...fakeFinding, confidence: 'NaN' })).toBeNull();
  });

  it('rejects missing required strings', () => {
    expect(normalizeFinding({ ...fakeFinding, file: '' })).toBeNull();
    expect(normalizeFinding({ ...fakeFinding, explanation: '' })).toBeNull();
    expect(normalizeFinding({ ...fakeFinding, remediation: '' })).toBeNull();
  });

  it('clamps non-numeric line to 1', () => {
    expect(normalizeFinding({ ...fakeFinding, line: 'x' })!.line).toBe(1);
    expect(normalizeFinding({ ...fakeFinding, line: -5 })!.line).toBe(1);
  });

  it('uses provided citation_url verbatim when string', () => {
    const f = normalizeFinding({ ...fakeFinding, citation_url: 'https://x.test/rule' })!;
    expect(f.citation_url).toBe('https://x.test/rule');
  });

  it('returns null for non-object inputs', () => {
    expect(normalizeFinding(null)).toBeNull();
    expect(normalizeFinding(42)).toBeNull();
    expect(normalizeFinding('str')).toBeNull();
  });

  it('treats missing rule_id / severity / fields as null (defaults branch)', () => {
    expect(normalizeFinding({})).toBeNull();
    expect(
      normalizeFinding({ rule_id: 'PERF.NPLUS1.001' }),
    ).toBeNull();
    expect(
      normalizeFinding({ rule_id: 'PERF.NPLUS1.001', severity: 'HIGH', confidence: 0.5 }),
    ).toBeNull();
    expect(
      normalizeFinding({
        rule_id: 'PERF.NPLUS1.001',
        severity: 'HIGH',
        confidence: 0.5,
        file: 'a.ts',
      }),
    ).toBeNull();
    expect(
      normalizeFinding({
        rule_id: 'PERF.NPLUS1.001',
        severity: 'HIGH',
        confidence: 0.5,
        file: 'a.ts',
        explanation: 'x',
      }),
    ).toBeNull();
  });

  it('falls back to citationUrl when citation_url is empty or non-string', () => {
    const f1 = normalizeFinding({ ...fakeFinding, citation_url: '' })!;
    expect(f1.citation_url).toContain('PERF.NPLUS1.001.md');
    const f2 = normalizeFinding({ ...fakeFinding, citation_url: 42 })!;
    expect(f2.citation_url).toContain('PERF.NPLUS1.001.md');
  });

  it('defaults line to 1 when omitted', () => {
    const { line: _omit, ...withoutLine } = fakeFinding;
    expect(normalizeFinding(withoutLine)!.line).toBe(1);
  });
});

describe('buildPrompt', () => {
  it('lists valid rule ids and embeds each patch', () => {
    const p = buildPrompt(files);
    expect(p).toContain('PERF.NPLUS1.001');
    expect(p).toContain('# File: src/x.ts');
    expect(p).toContain('```diff');
  });

  it('skips files with no patch', () => {
    const p = buildPrompt([
      { filename: 'a.ts', status: 'modified', additions: 1, deletions: 0 },
    ]);
    expect(p).not.toContain('# File: a.ts');
  });
});

describe('runReasoner', () => {
  it('returns sanitized findings when Claude returns valid JSON', async () => {
    const client = mkClient(JSON.stringify([fakeFinding]));
    const out = await runReasoner(files, {
      client,
      model: 'claude-sonnet-4-6',
      systemPrompt: 'SYS',
      maxTokens: 1000,
    });
    expect(out).toHaveLength(1);
    expect(out[0].rule_id).toBe('PERF.NPLUS1.001');
    expect(client.messages.create.mock.calls[0][0].model).toBe('claude-sonnet-4-6');
  });

  it('clamps max_tokens to 4096', async () => {
    const client = mkClient('[]');
    await runReasoner(files, {
      client,
      model: 'claude-sonnet-4-6',
      systemPrompt: 'SYS',
      maxTokens: 999999,
    });
    expect(client.messages.create.mock.calls[0][0].max_tokens).toBe(4096);
  });

  it('returns [] when reply is not a JSON array', async () => {
    const client = mkClient('not even close');
    const out = await runReasoner(files, {
      client,
      model: 'm',
      systemPrompt: 's',
      maxTokens: 100,
    });
    expect(out).toEqual([]);
  });

  it('returns [] when input is empty', async () => {
    const client = mkClient('[]');
    const out = await runReasoner([], {
      client,
      model: 'm',
      systemPrompt: 's',
      maxTokens: 100,
    });
    expect(out).toEqual([]);
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('handles non-text content blocks', async () => {
    const client = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'tool_use' }, { type: 'text', text: '[]' }],
        }),
      },
    };
    const out = await runReasoner(files, {
      client,
      model: 'm',
      systemPrompt: 's',
      maxTokens: 100,
    });
    expect(out).toEqual([]);
  });
});
