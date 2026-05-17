import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { OpenApiDocLike } from './openapi-diff';

const CANDIDATES = [
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'docs/openapi.yaml',
  'docs/openapi.yml',
  'docs/openapi.json',
  'spec/openapi.yaml',
];

/**
 * Locate an OpenAPI document in the repo root. Returns the relative path or undefined.
 */
export function findOpenApiSpec(repoRoot: string): string | undefined {
  for (const c of CANDIDATES) {
    if (fs.existsSync(path.join(repoRoot, c))) return c;
  }
  return undefined;
}

/**
 * Load + parse an OpenAPI doc (YAML or JSON). Returns an empty object on failure.
 */
export function loadOpenApi(absPath: string): OpenApiDocLike {
  if (!fs.existsSync(absPath)) return {};
  const raw = fs.readFileSync(absPath, 'utf8');
  try {
    if (absPath.endsWith('.json')) {
      return JSON.parse(raw) as OpenApiDocLike;
    }
    return (yaml.load(raw) ?? {}) as OpenApiDocLike;
  } catch (err) {
    process.stderr.write(`[ai-reviewer-qa] openapi parse error: ${String(err)}\n`);
    return {};
  }
}

/**
 * Heuristic — files matching common route-handler patterns.
 */
export function detectNewRouteFiles(filenames: string[]): string[] {
  return filenames.filter(
    (f) =>
      /\/routes\//.test(f) ||
      /\/controllers\//.test(f) ||
      /\.controller\.(ts|js)$/.test(f) ||
      /\/api\/.*\.(ts|js)$/.test(f),
  );
}
