// Service worker entry; built to <base>sw.js by scripts/pwa/plugin.ts, which fills in MANIFEST.
import { CONTENT_TIMEOUT_MS, CacheKind, HASHED_DIR, Strategy, currentCaches, route, staleCaches } from './policy';
import type { SwManifest } from './policy';

// The project's lib is DOM, not WebWorker; these are the few worker types used here.
type ExtendableEvent = Event & { waitUntil: (work: Promise<unknown>) => void };
type FetchEvent = ExtendableEvent & { request: Request; respondWith: (response: Promise<Response>) => void };
type WorkerScope = {
  registration: { scope: string };
  clients: { claim: () => Promise<void> };
  addEventListener: ((type: 'install' | 'activate', listener: (event: ExtendableEvent) => void) => void) &
    ((type: 'fetch', listener: (event: FetchEvent) => void) => void);
};

declare const SKIBUDDY_SW_MANIFEST: SwManifest;
const MANIFEST = SKIBUDDY_SW_MANIFEST;

const worker = self as unknown as WorkerScope;
const scope = new URL(worker.registration.scope);
const cacheNames = currentCaches(scope.pathname, MANIFEST);
const at = (path: string): string => new URL(path, scope).href;

const fetchOk = async (url: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
};

/** Hashed files never change, so one already cached by an older build is copied instead of downloaded. */
const precacheShell = async (): Promise<void> => {
  const cache = await caches.open(cacheNames[CacheKind.Shell]);
  await Promise.all(
    MANIFEST.shell.map(async (path) => {
      const url = at(path);
      const held = path.startsWith(HASHED_DIR) ? await caches.match(url) : undefined;
      await cache.put(url, held ?? (await fetchOk(url, { cache: 'no-cache' })));
    }),
  );
};

const precacheModel = async (): Promise<void> => {
  const cache = await caches.open(cacheNames[CacheKind.Model]);
  const url = at(MANIFEST.model.path);
  if ((await cache.match(url)) === undefined) await cache.put(url, await fetchOk(url, { cache: 'no-cache' }));
};

// No skipWaiting: a new build waits until every skibuddy tab is closed, then takes over on the next launch.
worker.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([precacheShell(), precacheModel()]));
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const stale = staleCaches(await caches.keys(), scope.pathname, MANIFEST);
      await Promise.all(stale.map((key) => caches.delete(key)));
      // Only the first install has pages to claim; an update activates with none open.
      await worker.clients.claim();
    })(),
  );
});

const cacheFirst = async (request: Request, cacheName: string): Promise<Response> => {
  const cache = await caches.open(cacheName);
  const held = await cache.match(request);
  if (held !== undefined) return held;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
};

const networkFirst = async (request: Request, cacheName: string): Promise<Response> => {
  const cache = await caches.open(cacheName);
  const network = fetch(request, { cache: 'no-cache' }).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  // A late failure after the cache has answered is expected, not an error.
  network.catch(() => undefined);
  let timer: number | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = self.setTimeout(resolve, CONTENT_TIMEOUT_MS);
  });
  try {
    const first = await Promise.race([network, timeout]);
    if (first?.ok === true) return first;
  } catch {
    // Offline or refused: fall through to the cache.
  } finally {
    self.clearTimeout(timer);
  }
  const held = await cache.match(request);
  // Nothing cached: keep waiting on the slow network rather than fail.
  return held ?? network;
};

const shell = async (request: Request, cacheName: string): Promise<Response> => {
  const held = await (await caches.open(cacheName)).match(at('index.html'));
  return held ?? fetch(request);
};

worker.addEventListener('fetch', (event) => {
  const { request } = event;
  const decision = route({ url: new URL(request.url), method: request.method, mode: request.mode }, scope, MANIFEST);
  if (decision.strategy === Strategy.Network) return;
  const cacheName = cacheNames[decision.cache];
  switch (decision.strategy) {
    case Strategy.Shell:
      event.respondWith(shell(request, cacheName));
      return;
    case Strategy.NetworkFirst:
      event.respondWith(networkFirst(request, cacheName));
      return;
    case Strategy.CacheFirst:
      event.respondWith(cacheFirst(request, cacheName));
      return;
  }
});
