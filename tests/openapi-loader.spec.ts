import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectNewRouteFiles, findOpenApiSpec, loadOpenApi } from '../src/tools/openapi-loader';

describe('findOpenApiSpec', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rev-openapi-'));
  });

  it('finds openapi.yaml at root', () => {
    fs.writeFileSync(path.join(tmp, 'openapi.yaml'), 'openapi: 3.0.0\n');
    expect(findOpenApiSpec(tmp)).toBe('openapi.yaml');
  });

  it('finds openapi.json under docs/', () => {
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'openapi.json'), '{}');
    expect(findOpenApiSpec(tmp)).toBe('docs/openapi.json');
  });

  it('returns undefined when no spec exists', () => {
    expect(findOpenApiSpec(tmp)).toBeUndefined();
  });
});

describe('loadOpenApi', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rev-load-'));
  });

  it('loads YAML', () => {
    const p = path.join(tmp, 'openapi.yaml');
    fs.writeFileSync(p, 'paths:\n  /a:\n    get: {}\n');
    const doc = loadOpenApi(p);
    expect(doc.paths!['/a']).toEqual({ get: {} });
  });

  it('loads JSON', () => {
    const p = path.join(tmp, 'openapi.json');
    fs.writeFileSync(p, '{"paths":{"/a":{"get":{}}}}');
    expect(loadOpenApi(p).paths!['/a']).toEqual({ get: {} });
  });

  it('returns {} when file does not exist', () => {
    expect(loadOpenApi(path.join(tmp, 'nope.yaml'))).toEqual({});
  });

  it('returns {} on malformed YAML', () => {
    const p = path.join(tmp, 'openapi.yaml');
    fs.writeFileSync(p, ':\n::\n');
    const errSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(loadOpenApi(p)).toEqual({});
    errSpy.mockRestore();
  });

  it('returns {} when YAML loads to null', () => {
    const p = path.join(tmp, 'openapi.yaml');
    fs.writeFileSync(p, '');
    expect(loadOpenApi(p)).toEqual({});
  });
});

describe('detectNewRouteFiles', () => {
  it('matches /routes/, /controllers/, .controller.ts, /api/*.ts', () => {
    const result = detectNewRouteFiles([
      'src/routes/orders.ts',
      'src/controllers/users.ts',
      'src/users.controller.ts',
      'src/api/v1.ts',
      'src/util.ts',
    ]);
    expect(result).toEqual([
      'src/routes/orders.ts',
      'src/controllers/users.ts',
      'src/users.controller.ts',
      'src/api/v1.ts',
    ]);
  });

  it('returns [] when nothing matches', () => {
    expect(detectNewRouteFiles(['src/lib/x.ts'])).toEqual([]);
  });
});
