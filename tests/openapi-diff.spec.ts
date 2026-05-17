import { diffOpenApi, openApiFindings } from '../src/tools/openapi-diff';
import { baseOpenApi, headOpenApi } from './fixtures/sample-prs';

describe('diffOpenApi', () => {
  it('detects removed paths, new required params, removed responses, and new endpoints', () => {
    const result = diffOpenApi(baseOpenApi, headOpenApi);
    const descs = result.breakingChanges.map((b) => `${b.method} ${b.path}: ${b.description}`);
    expect(descs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/get \/v1\/legacy: Endpoint removed/),
        expect.stringMatching(/get \/v1\/orders: New required parameter `tenantId`/),
        expect.stringMatching(/post \/v1\/orders: Parameter `idempotencyKey` became required/),
      ]),
    );
    expect(result.newEndpoints).toEqual([{ path: '/v1/checkout', method: 'post' }]);
    expect(result.removedEndpoints).toEqual([{ path: '/v1/legacy', method: 'get' }]);
  });

  it('returns empty diff when specs are identical', () => {
    const r = diffOpenApi(baseOpenApi, baseOpenApi);
    expect(r.breakingChanges).toEqual([]);
    expect(r.newEndpoints).toEqual([]);
  });

  it('treats missing paths gracefully', () => {
    expect(diffOpenApi({}, {}).breakingChanges).toEqual([]);
    expect(diffOpenApi({}, { paths: { '/x': { get: {} } } }).newEndpoints[0].path).toBe('/x');
  });

  it('flags removed response codes', () => {
    const base = { paths: { '/a': { get: { responses: { '200': {}, '404': {} } } } } };
    const head = { paths: { '/a': { get: { responses: { '200': {} } } } } };
    const r = diffOpenApi(base, head);
    expect(r.breakingChanges[0].description).toMatch(/`404` removed/);
  });

  it('treats path with operations === undefined as having no ops', () => {
    const r = diffOpenApi(
      { paths: { '/a': {} } },
      { paths: { '/a': {} } },
    );
    expect(r.breakingChanges).toEqual([]);
  });

  it('skips non-object operations', () => {
    const base = { paths: { '/a': { get: 'not-an-object' } as Record<string, unknown> } };
    const head = { paths: { '/a': { get: 'not-an-object' } as Record<string, unknown> } };
    expect(diffOpenApi(base, head).breakingChanges).toEqual([]);
  });

  it('ignores non-object base parameter entries when matching by name', () => {
    const base = {
      paths: {
        '/a': {
          get: {
            parameters: ['not-an-object'],
            responses: {},
          },
        },
      },
    };
    const head = {
      paths: {
        '/a': {
          get: {
            parameters: [{ name: 'q', required: true }],
            responses: {},
          },
        },
      },
    };
    const r = diffOpenApi(base, head);
    expect(r.breakingChanges[0].description).toMatch(/New required parameter/);
  });
});

describe('openApiFindings', () => {
  it('emits API.BREAK.001 findings', () => {
    const r = diffOpenApi(baseOpenApi, headOpenApi);
    const findings = openApiFindings(r, [], 'openapi.yaml');
    const broken = findings.filter((f) => f.rule_id === 'API.BREAK.001');
    expect(broken.length).toBeGreaterThan(0);
    expect(broken[0].severity).toBe('HIGH');
    expect(broken[0].file).toBe('openapi.yaml');
  });

  it('suppresses API.BREAK.001 when PR has `breaking-change` label', () => {
    const r = diffOpenApi(baseOpenApi, headOpenApi);
    const findings = openApiFindings(r, ['Breaking-Change'], 'openapi.yaml');
    expect(findings.find((f) => f.rule_id === 'API.BREAK.001')).toBeUndefined();
  });

  it('emits API.UNDOC.001 when new route file present but no new endpoint in spec', () => {
    const r = { breakingChanges: [], newEndpoints: [], removedEndpoints: [] };
    const findings = openApiFindings(r, [], 'openapi.yaml', ['src/routes/billing.ts']);
    const undoc = findings.find((f) => f.rule_id === 'API.UNDOC.001');
    expect(undoc).toBeDefined();
    expect(undoc!.file).toBe('src/routes/billing.ts');
  });

  it('does not emit API.UNDOC.001 when the spec lists a new endpoint', () => {
    const r = {
      breakingChanges: [],
      newEndpoints: [{ path: '/v1/billing', method: 'post' }],
      removedEndpoints: [],
    };
    const findings = openApiFindings(r, [], 'openapi.yaml', ['src/routes/billing.ts']);
    expect(findings.find((f) => f.rule_id === 'API.UNDOC.001')).toBeUndefined();
  });
});
