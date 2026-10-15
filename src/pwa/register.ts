// Registers the service worker after first paint and reports when a new build is waiting.

type Listener = () => void;

const listeners = new Set<Listener>();
let updateReady = false;

const markReady = (): void => {
  if (updateReady) return;
  updateReady = true;
  for (const listener of listeners) listener();
};

/** Calls `listener` once a new build is installed and will take over on the next launch. Returns an unsubscribe. */
export const onUpdateReady = (listener: Listener): (() => void) => {
  if (updateReady) {
    listener();
    return () => undefined;
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const watch = (registration: ServiceWorkerRegistration): void => {
  // A worker waiting behind an active controller is an update; on first install there is no controller.
  if (registration.waiting !== null && navigator.serviceWorker.controller !== null) markReady();
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) markReady();
    });
  });
};

const register = (): void => {
  const base = import.meta.env.BASE_URL;
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then(watch)
    .catch((error: unknown) => console.warn('skibuddy: service worker not registered', error));
};

const whenIdle = (): void => {
  if ('requestIdleCallback' in window) requestIdleCallback(register, { timeout: 5000 });
  else setTimeout(register, 0);
};

/** Production only; waits for load and then idle time so it never competes with the first paint. */
export const registerServiceWorker = (): void => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
};
