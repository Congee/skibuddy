import { assert, describe, it } from '@effect/vitest';
import { CacheKind, Strategy, cacheName, currentCaches, route, staleCaches, versionKey } from '../src/pwa/policy';
import type { SwManifest } from '../src/pwa/policy';

const manifest: SwManifest = {
  version: 'v2',
  shell: ['index.html', 'assets/index-abc.js', 'assets/index-def.css', 'content.json', 'manifest.webmanifest', 'icons/icon-192.png'],
  content: 'content.json',
  model: { path: 'models/anatomy.glb', hash: 'm1' },
};
const scope = new URL('https://congee.github.io/skibuddy/');
const get = (href: string, mode = 'cors'): Parameters<typeof route>[0] => ({ url: new URL(href, scope), method: 'GET', mode });

describe('cache names', () => {
  it('names the shell by build version and the model by its own hash', () => {
    assert.deepStrictEqual(currentCaches('/skibuddy/', manifest), {
      [CacheKind.Shell]: 'skibuddy|/skibuddy/|shell|v2',
      [CacheKind.Model]: 'skibuddy|/skibuddy/|model|m1',
    });
  });

  it('keeps the model cache across builds that leave the glb alone', () => {
    const next = { ...manifest, version: 'v3' };
    assert.strictEqual(currentCaches('/', next)[CacheKind.Model], currentCaches('/', manifest)[CacheKind.Model]);
    assert.notStrictEqual(currentCaches('/', next)[CacheKind.Shell], currentCaches('/', manifest)[CacheKind.Shell]);
  });

  it('marks only our older caches for this scope as stale', () => {
    const keys = [
      cacheName('/skibuddy/', CacheKind.Shell, 'v1'),
      cacheName('/skibuddy/', CacheKind.Shell, 'v2'),
      cacheName('/skibuddy/', CacheKind.Model, 'm0'),
      cacheName('/skibuddy/', CacheKind.Model, 'm1'),
      cacheName('/', CacheKind.Shell, 'v1'),
      'another-app-v1',
    ];
    assert.deepStrictEqual(staleCaches(keys, '/skibuddy/', manifest), [
      'skibuddy|/skibuddy/|shell|v1',
      'skibuddy|/skibuddy/|model|m0',
    ]);
  });
});

describe('versionKey', () => {
  it('ignores entry order', () => {
    assert.strictEqual(
      versionKey([['a', '1'], ['b', '2']]),
      versionKey([['b', '2'], ['a', '1']]),
    );
  });

  it('changes when any digest or file changes', () => {
    const base = versionKey([['index.html', '1'], ['content.json', '2']]);
    assert.notStrictEqual(versionKey([['index.html', '1'], ['content.json', '3']]), base);
    assert.notStrictEqual(versionKey([['index.html', '1'], ['content.json', '2'], ['assets/x.js', 'x']]), base);
  });
});

describe('route', () => {
  it('serves the cached shell for navigations, with or without a query', () => {
    const shell = { strategy: Strategy.Shell, cache: CacheKind.Shell };
    assert.deepStrictEqual(route(get('./', 'navigate'), scope, manifest), shell);
    assert.deepStrictEqual(route(get('./?drill=stork', 'navigate'), scope, manifest), shell);
  });

  it('goes to the network first for content.json', () => {
    assert.deepStrictEqual(route(get('content.json'), scope, manifest), {
      strategy: Strategy.NetworkFirst,
      cache: CacheKind.Shell,
    });
  });

  it('serves the model cache-first from its own cache', () => {
    assert.deepStrictEqual(route(get('models/anatomy.glb'), scope, manifest), {
      strategy: Strategy.CacheFirst,
      cache: CacheKind.Model,
    });
  });

  it('serves hashed assets and shell files cache-first', () => {
    const hit = { strategy: Strategy.CacheFirst, cache: CacheKind.Shell };
    assert.deepStrictEqual(route(get('assets/index-abc.js'), scope, manifest), hit);
    assert.deepStrictEqual(route(get('assets/Viewer-new.js'), scope, manifest), hit);
    assert.deepStrictEqual(route(get('icons/icon-192.png'), scope, manifest), hit);
  });

  it('leaves everything else to the network', () => {
    const network = { strategy: Strategy.Network };
    assert.deepStrictEqual(route({ ...get('content.json'), method: 'POST' }, scope, manifest), network);
    assert.deepStrictEqual(route(get('https://example.com/skibuddy/assets/x.js'), scope, manifest), network);
    assert.deepStrictEqual(route(get('/other-app/assets/x.js', 'navigate'), scope, manifest), network);
    assert.deepStrictEqual(route(get('/skibuddy-old/content.json'), scope, manifest), network);
    assert.deepStrictEqual(route(get('models/README.md'), scope, manifest), network);
  });

  it('works under the root base too', () => {
    const root = new URL('http://localhost:5173/');
    assert.deepStrictEqual(route(get('http://localhost:5173/content.json'), root, manifest).strategy, Strategy.NetworkFirst);
  });
});
