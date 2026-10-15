// Pure service-worker policy: cache names, versioning and request routing.

/** Written into sw.js at build; paths are relative to the worker's scope. */
export type SwManifest = {
  readonly version: string;
  /** index.html, hashed assets, content.json, the web manifest and icons. */
  readonly shell: readonly string[];
  readonly content: string;
  readonly model: { readonly path: string; readonly hash: string };
};

export const Strategy = {
  /** Navigation: the cached index.html, the network only if it is missing. */
  Shell: 'shell',
  CacheFirst: 'cache-first',
  /** Not handled by the worker. */
  Network: 'network',
} as const;
export type Strategy = (typeof Strategy)[keyof typeof Strategy];

export const CacheKind = { Shell: 'shell', Model: 'model' } as const;
export type CacheKind = (typeof CacheKind)[keyof typeof CacheKind];

export type Route =
  | { readonly strategy: typeof Strategy.Network }
  | { readonly strategy: Exclude<Strategy, typeof Strategy.Network>; readonly cache: CacheKind };

const PREFIX = 'skibuddy';
export const HASHED_DIR = 'assets/';

const cachePrefix = (scopePath: string): string => `${PREFIX}|${scopePath}|`;

export const cacheName = (scopePath: string, kind: CacheKind, hash: string): string =>
  `${cachePrefix(scopePath)}${kind}|${hash}`;

/** The model cache is keyed by the glb's own hash, so a new build keeps it unless the model changed. */
export const currentCaches = (scopePath: string, manifest: SwManifest): Record<CacheKind, string> => ({
  [CacheKind.Shell]: cacheName(scopePath, CacheKind.Shell, manifest.version),
  [CacheKind.Model]: cacheName(scopePath, CacheKind.Model, manifest.model.hash),
});

/** Our caches for this scope that the current build no longer uses; other apps' caches are left alone. */
export const staleCaches = (keys: readonly string[], scopePath: string, manifest: SwManifest): string[] => {
  const keep = new Set(Object.values(currentCaches(scopePath, manifest)));
  return keys.filter((key) => key.startsWith(cachePrefix(scopePath)) && !keep.has(key));
};

/** Canonical form of a build's files and their digests; its hash is the build version. */
export const versionKey = (entries: ReadonlyArray<readonly [path: string, digest: string]>): string =>
  entries
    .map(([path, digest]) => `${path}\t${digest}`)
    .toSorted()
    .join('\n');

export type RouteRequest = {
  readonly url: URL;
  readonly method: string;
  readonly mode: string;
};

export const route = (request: RouteRequest, scope: URL, manifest: SwManifest): Route => {
  const { url } = request;
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) {
    return { strategy: Strategy.Network };
  }
  if (request.mode === 'navigate') return { strategy: Strategy.Shell, cache: CacheKind.Shell };
  const path = url.pathname.slice(scope.pathname.length);
  // Same build as the cached app, so the decoder always matches the content.
  if (path === manifest.content) return { strategy: Strategy.CacheFirst, cache: CacheKind.Shell };
  if (path === manifest.model.path) return { strategy: Strategy.CacheFirst, cache: CacheKind.Model };
  if (path.startsWith(HASHED_DIR) || manifest.shell.includes(path)) {
    return { strategy: Strategy.CacheFirst, cache: CacheKind.Shell };
  }
  return { strategy: Strategy.Network };
};
