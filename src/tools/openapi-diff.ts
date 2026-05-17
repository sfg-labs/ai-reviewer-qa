import { Finding } from '../types';
import { RULE_PACK_VERSION, ANALYZER_VERSIONS, citationUrl } from '../version';

export interface OpenApiDocLike {
  paths?: Record<string, Record<string, unknown>>;
}

export interface OpenApiDiffResult {
  breakingChanges: Array<{ path: string; method: string; description: string }>;
  newEndpoints: Array<{ path: string; method: string }>;
  removedEndpoints: Array<{ path: string; method: string }>;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/**
 * Lightweight schema diff between two OpenAPI docs. Detects:
 * - removed paths or methods → breaking
 * - new required parameters on existing endpoints → breaking
 * - removed required response codes → breaking
 * - new endpoints (informational only)
 */
export function diffOpenApi(
  base: OpenApiDocLike,
  head: OpenApiDocLike,
): OpenApiDiffResult {
  const breakingChanges: OpenApiDiffResult['breakingChanges'] = [];
  const newEndpoints: OpenApiDiffResult['newEndpoints'] = [];
  const removedEndpoints: OpenApiDiffResult['removedEndpoints'] = [];

  const basePaths = base.paths ?? {};
  const headPaths = head.paths ?? {};
  const allPaths = new Set([...Object.keys(basePaths), ...Object.keys(headPaths)]);

  for (const p of allPaths) {
    const baseOps = basePaths[p] ?? {};
    const headOps = headPaths[p] ?? {};
    for (const m of METHODS) {
      const baseOp = baseOps[m];
      const headOp = headOps[m];
      if (baseOp && !headOp) {
        breakingChanges.push({ path: p, method: m, description: 'Endpoint removed' });
        removedEndpoints.push({ path: p, method: m });
        continue;
      }
      if (!baseOp && headOp) {
        newEndpoints.push({ path: p, method: m });
        continue;
      }
      if (!baseOp || !headOp) continue;
      const breakings = compareOperation(baseOp, headOp);
      for (const desc of breakings) {
        breakingChanges.push({ path: p, method: m, description: desc });
      }
    }
  }
  return { breakingChanges, newEndpoints, removedEndpoints };
}

function compareOperation(base: unknown, head: unknown): string[] {
  const out: string[] = [];
  if (!isObj(base) || !isObj(head)) return out;
  const baseParams = (base['parameters'] as unknown[]) ?? [];
  const headParams = (head['parameters'] as unknown[]) ?? [];
  // New required param that wasn't on base = breaking for existing callers
  for (const hp of headParams) {
    if (!isObj(hp) || hp['required'] !== true) continue;
    const hpName = hp['name'];
    const matched = baseParams.find((bp) => isObj(bp) && bp['name'] === hpName);
    if (!matched) {
      out.push(`New required parameter \`${String(hpName)}\``);
    } else if (isObj(matched) && matched['required'] !== true) {
      out.push(`Parameter \`${String(hpName)}\` became required`);
    }
  }
  // Removed response codes = breaking
  const baseResp = (base['responses'] as Record<string, unknown>) ?? {};
  const headResp = (head['responses'] as Record<string, unknown>) ?? {};
  for (const code of Object.keys(baseResp)) {
    if (!(code in headResp)) {
      out.push(`Response \`${code}\` removed`);
    }
  }
  return out;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Map the openapi-diff result to Findings (API.BREAK.001 + API.UNDOC.001).
 * `prLabels` is used to suppress API.BREAK.001 if the PR carries `breaking-change`.
 */
export function openApiFindings(
  result: OpenApiDiffResult,
  prLabels: string[],
  openApiPath: string,
  newRouteFiles: string[] = [],
): Finding[] {
  const out: Finding[] = [];
  const hasBreakingLabel = prLabels.some((l) => l.toLowerCase() === 'breaking-change');
  for (const bc of result.breakingChanges) {
    if (hasBreakingLabel) continue;
    out.push({
      rule_id: 'API.BREAK.001',
      severity: 'HIGH',
      confidence: 0.95,
      file: openApiPath,
      line: 1,
      explanation: `Breaking API change at \`${bc.method.toUpperCase()} ${bc.path}\`: ${bc.description}.`,
      remediation:
        'Either revert the breaking change or add the `breaking-change` label and document the migration path.',
      citation_url: citationUrl('API.BREAK.001'),
      source: 'openapi-diff',
      rule_pack_version: RULE_PACK_VERSION,
      analyzer_version: ANALYZER_VERSIONS['openapi-diff'],
    });
  }
  // API.UNDOC.001 — a new route handler file with no matching path in head spec
  for (const f of newRouteFiles) {
    const inSpec = result.newEndpoints.length > 0;
    if (!inSpec) {
      out.push({
        rule_id: 'API.UNDOC.001',
        severity: 'MEDIUM',
        confidence: 0.85,
        file: f,
        line: 1,
        explanation: `New route handler in \`${f}\` is not documented in the OpenAPI spec.`,
        remediation:
          'Add the corresponding `paths:` entry in your OpenAPI document so consumers can discover the endpoint.',
        citation_url: citationUrl('API.UNDOC.001'),
        source: 'openapi-diff',
        rule_pack_version: RULE_PACK_VERSION,
        analyzer_version: ANALYZER_VERSIONS['openapi-diff'],
      });
    }
  }
  return out;
}
