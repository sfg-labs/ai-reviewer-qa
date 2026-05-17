import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig, _internal } from '../src/config';

describe('config.loadConfig', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rev-cfg-'));
    fs.mkdirSync(path.join(tmp, '.github'), { recursive: true });
  });

  it('returns defaults when no config file exists', () => {
    const c = loadConfig(tmp);
    expect(c.bundle_budget_kb).toBe(50);
    expect(c.fail_on_coverage_drop).toBe(true);
    expect(c.fail_on_breaking_api).toBe(true);
    expect(c.ignore_paths).toContain('node_modules/**');
  });

  it('merges user-supplied qa overrides', () => {
    fs.writeFileSync(
      path.join(tmp, '.github', 'ai-review.yml'),
      `qa:\n  bundle_budget_kb: 200\n  fail_on_coverage_drop: false\n  ignore_paths: ['src/legacy/**']\n  rule_overrides:\n    PERF.MEMO.001:\n      disabled: true\n`,
    );
    const c = loadConfig(tmp);
    expect(c.bundle_budget_kb).toBe(200);
    expect(c.fail_on_coverage_drop).toBe(false);
    expect(c.fail_on_breaking_api).toBe(true); // unchanged
    expect(c.ignore_paths).toEqual(['src/legacy/**']);
    expect(c.rule_overrides['PERF.MEMO.001'].disabled).toBe(true);
  });

  it('falls back to defaults on malformed YAML', () => {
    fs.writeFileSync(path.join(tmp, '.github', 'ai-review.yml'), ':\nnot: valid: yaml: ::');
    const errSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const c = loadConfig(tmp);
    expect(c.bundle_budget_kb).toBe(50);
    errSpy.mockRestore();
  });

  it('falls back to defaults when YAML root is not an object', () => {
    fs.writeFileSync(path.join(tmp, '.github', 'ai-review.yml'), '- 1\n- 2\n');
    const c = loadConfig(tmp);
    expect(c.bundle_budget_kb).toBe(50);
  });

  it('falls back to defaults when YAML is empty', () => {
    fs.writeFileSync(path.join(tmp, '.github', 'ai-review.yml'), '');
    const c = loadConfig(tmp);
    expect(c.bundle_budget_kb).toBe(50);
  });

  it('honors a custom configPath', () => {
    fs.writeFileSync(
      path.join(tmp, 'custom.yml'),
      `qa:\n  bundle_budget_kb: 999\n`,
    );
    const c = loadConfig(tmp, 'custom.yml');
    expect(c.bundle_budget_kb).toBe(999);
  });

  it('ignores non-object overrides for rule_overrides', () => {
    const merged = _internal.mergeConfig(_internal.DEFAULT_CONFIG, { rule_overrides: 'nope' });
    expect(merged.rule_overrides).toEqual({});
  });
});
