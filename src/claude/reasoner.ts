import { Finding, PrFile, Severity } from '../types';
import { RULE_PACK_VERSION, citationUrl } from '../version';

const VALID_RULES = new Set([
  'PERF.NPLUS1.001',
  'PERF.QUERY.001',
  'PERF.INDEX.001',
  'PERF.BUNDLE.001',
  'PERF.MEMO.001',
  'COV.DROP.001',
  'COV.NEW.001',
  'API.BREAK.001',
  'API.UNDOC.001',
  'FLAKY.001',
  'LOAD.001',
]);

const VALID_SEVERITY = new Set<Severity>(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

/**
 * Minimal interface compatible with `@anthropic-ai/sdk` so the runner can
 * inject a mock from tests.
 */
export interface AnthropicLike {
  messages: {
    create: (params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: 'user'; content: string }>;
    }) => Promise<{
      content: Array<{ type: 'text'; text: string } | { type: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>;
  };
}

export interface ReasonerOptions {
  client: AnthropicLike;
  model: string;
  systemPrompt: string;
  maxTokens: number;
}

/**
 * Ask Claude to produce QA findings for the supplied diff slice.
 * Returns a sanitized + validated Finding[]. Invalid entries are dropped silently.
 */
export async function runReasoner(
  files: PrFile[],
  opts: ReasonerOptions,
): Promise<Finding[]> {
  if (files.length === 0) return [];
  const userPrompt = buildPrompt(files);
  const resp = await opts.client.messages.create({
    model: opts.model,
    max_tokens: Math.min(opts.maxTokens, 4096),
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const text = resp.content
    .map((c) => ('text' in c ? c.text : ''))
    .join('')
    .trim();
  const parsed = safeParseJson(text);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeFinding).filter((f): f is Finding => f !== null);
}

export function buildPrompt(files: PrFile[]): string {
  const lines: string[] = [];
  lines.push('Review the following PR diff and emit a JSON array of QA findings.');
  lines.push('');
  lines.push('Valid rule_id values:');
  for (const r of VALID_RULES) lines.push(`- ${r}`);
  lines.push('');
  lines.push('Diff:');
  for (const f of files) {
    if (!f.patch) continue;
    lines.push(`\n# File: ${f.filename} (status=${f.status})\n`);
    lines.push('```diff');
    lines.push(f.patch);
    lines.push('```');
  }
  return lines.join('\n');
}

export function safeParseJson(text: string): unknown {
  // Tolerate ```json fences if a model slips them in
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Extract the first JSON array substring as a last-resort fallback
    const m = stripped.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export function normalizeFinding(raw: unknown): Finding | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rule_id = String(r['rule_id'] ?? '').trim();
  if (!VALID_RULES.has(rule_id)) return null;
  const severity = String(r['severity'] ?? '').toUpperCase() as Severity;
  if (!VALID_SEVERITY.has(severity)) return null;
  const confidence = Number(r['confidence']);
  if (!isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  const file = String(r['file'] ?? '').trim();
  const line = Number(r['line']);
  const explanation = String(r['explanation'] ?? '').trim();
  const remediation = String(r['remediation'] ?? '').trim();
  if (!file || !explanation || !remediation) return null;
  return {
    rule_id,
    severity,
    confidence,
    file,
    line: Number.isFinite(line) && line > 0 ? Math.floor(line) : 1,
    explanation,
    remediation,
    citation_url: typeof r['citation_url'] === 'string' && r['citation_url']
      ? (r['citation_url'] as string)
      : citationUrl(rule_id),
    source: 'claude',
    rule_pack_version: RULE_PACK_VERSION,
  };
}
