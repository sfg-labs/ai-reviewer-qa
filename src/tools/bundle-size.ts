import { Finding } from '../types';
import { RULE_PACK_VERSION, ANALYZER_VERSIONS, citationUrl } from '../version';

export interface BundleStats {
  /** name → gzipped size in bytes */
  assets: Record<string, number>;
  totalBytes: number;
}

/**
 * Parse a webpack-bundle-analyzer (or webpack `stats.json`) compatible report.
 *
 * Accepts either:
 *   { assets: [{ name, size }, ...] }   (webpack stats.json)
 * or
 *   [{ label, gzipSize }, ...]          (webpack-bundle-analyzer raw report)
 */
export function parseBundleReport(report: unknown): BundleStats {
  if (Array.isArray(report)) {
    const assets: Record<string, number> = {};
    let total = 0;
    for (const a of report) {
      if (!a || typeof a !== 'object') continue;
      const o = a as Record<string, unknown>;
      const name = String(o['label'] ?? o['name'] ?? '');
      const size = Number(o['gzipSize'] ?? o['parsedSize'] ?? o['statSize'] ?? 0);
      if (!name) continue;
      assets[name] = (assets[name] ?? 0) + size;
      total += size;
    }
    return { assets, totalBytes: total };
  }
  if (report && typeof report === 'object' && Array.isArray((report as Record<string, unknown>)['assets'])) {
    const assets: Record<string, number> = {};
    let total = 0;
    for (const a of (report as Record<string, unknown>)['assets'] as unknown[]) {
      if (!a || typeof a !== 'object') continue;
      const o = a as Record<string, unknown>;
      const name = String(o['name'] ?? '');
      const size = Number(o['size'] ?? 0);
      if (!name) continue;
      assets[name] = (assets[name] ?? 0) + size;
      total += size;
    }
    return { assets, totalBytes: total };
  }
  return { assets: {}, totalBytes: 0 };
}

/**
 * Diff base and head bundle stats. Emit a PERF.BUNDLE.001 finding for every
 * asset whose size grew by more than `budgetKb` kilobytes.
 */
export function diffBundle(
  base: BundleStats,
  head: BundleStats,
  budgetKb: number,
  reportFile = 'webpack-stats.json',
): Finding[] {
  const out: Finding[] = [];
  const budgetBytes = budgetKb * 1024;
  for (const [name, headSize] of Object.entries(head.assets)) {
    const baseSize = base.assets[name] ?? 0;
    const delta = headSize - baseSize;
    if (delta > budgetBytes) {
      out.push({
        rule_id: 'PERF.BUNDLE.001',
        severity: delta > budgetBytes * 4 ? 'HIGH' : 'MEDIUM',
        confidence: 0.95,
        file: reportFile,
        line: 1,
        explanation:
          `Bundle asset \`${name}\` grew by ${(delta / 1024).toFixed(1)} KB ` +
          `(from ${(baseSize / 1024).toFixed(1)} KB → ${(headSize / 1024).toFixed(1)} KB), ` +
          `exceeding the ${budgetKb} KB budget.`,
        remediation:
          'Inspect the new dependency tree (e.g. via `webpack-bundle-analyzer`) and switch to a smaller library or dynamic-import the heavy code path.',
        citation_url: citationUrl('PERF.BUNDLE.001'),
        source: 'bundle',
        rule_pack_version: RULE_PACK_VERSION,
        analyzer_version: ANALYZER_VERSIONS['webpack-bundle-analyzer'],
      });
    }
  }
  return out;
}

/**
 * Heuristic: does this PR touch FE code? (used to decide whether to run bundle analysis at all)
 */
export function isFePr(filenames: string[]): boolean {
  return filenames.some(
    (f) =>
      /\.(tsx|jsx)$/.test(f) ||
      f.includes('/components/') ||
      f.includes('/pages/') ||
      f.endsWith('webpack.config.js') ||
      f.endsWith('next.config.js'),
  );
}
