import { isNativeApp } from './platform';

type ServiceWorkerWithSync = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>;
  };
};

const SW_UPDATE_EVENT = 'forjados-sw-update';

export function dispatchPwaUpdate(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: registration }));
}

export function registerServiceWorker() {
  if (isNativeApp()) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');

      registration.update().catch(() => undefined);

      if (registration.waiting) {
        dispatchPwaUpdate(registration);
      }

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (
            installingWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            dispatchPwaUpdate(registration);
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    } catch (error) {
      console.warn('Service Worker não registrado:', error);
    }
  });
}

export async function applyWaitingServiceWorker(registration: ServiceWorkerRegistration) {
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export async function registerBackgroundSync(tag: string) {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerWithSync;
    if (!registration.sync) return false;
    await registration.sync.register(tag);
    return true;
  } catch (error) {
    console.warn('Background Sync indisponível:', error);
    return false;
  }
}

export function isRunningAsInstalledApp() {
  return (
    isNativeApp() ||
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export const PWA_UPDATE_EVENT = SW_UPDATE_EVENT;
