import { useEffect, useState } from 'react';
import {
  applyWaitingServiceWorker,
  isRunningAsInstalledApp,
  PWA_UPDATE_EVENT,
} from '../services/pwa';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALL_DISMISSED_KEY = 'forjados-install-dismissed:v1';

function readInstallDismissed() {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveInstallDismissed() {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
  } catch {
    // O navegador pode bloquear armazenamento local no modo privado.
  }
}

export function PwaStatus() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [waitingRegistration, setWaitingRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(readInstallDismissed);

  const showInstallButton =
    Boolean(installPrompt) && !installDismissed && !isRunningAsInstalledApp();

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

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
      saveInstallDismissed();
      setInstallDismissed(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(PWA_UPDATE_EVENT, handleUpdate as EventListener);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(PWA_UPDATE_EVENT, handleUpdate as EventListener);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
      saveInstallDismissed();
      setInstallDismissed(true);
    }
  }

  function dismissInstall() {
    saveInstallDismissed();
    setInstallDismissed(true);
  }

  if (!isOffline && !waitingRegistration && !showInstallButton) return null;

  if (showInstallButton && !isOffline && !waitingRegistration) {
    return (
      <div className="pwa-status-banner install">
        <span>Instale o FORJADOS no celular para abrir como aplicativo.</span>
        <div className="pwa-status-actions">
          <button type="button" onClick={handleInstall}>Instalar</button>
          <button type="button" className="ghost" onClick={dismissInstall}>Agora não</button>
        </div>
      </div>
    );
  }

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
