import { useEffect, useState } from 'react';
import { applyWaitingServiceWorker, PWA_UPDATE_EVENT } from '../services/pwa';

export function PwaStatus() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [waitingRegistration, setWaitingRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }

    function handleOffline() {
      setIsOffline(true);
    }

    function handleUpdate(event: Event) {
      const customEvent = event as CustomEvent<ServiceWorkerRegistration>;
      setWaitingRegistration(customEvent.detail);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(PWA_UPDATE_EVENT, handleUpdate as EventListener);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(PWA_UPDATE_EVENT, handleUpdate as EventListener);
    };
  }, []);

  if (!isOffline && !waitingRegistration) return null;

  return (
    <div className={isOffline ? 'pwa-status-banner offline' : 'pwa-status-banner update'}>
      <span>
        {isOffline
          ? 'Você está offline. Algumas áreas podem mostrar apenas dados salvos.'
          : 'Nova versão disponível para o aplicativo.'}
      </span>

      {waitingRegistration && (
        <button
          type="button"
          onClick={() => applyWaitingServiceWorker(waitingRegistration)}
        >
          Atualizar
        </button>
      )}
    </div>
  );
}
