import { useEffect, useRef, useState } from 'react';
import { BellRing, ShieldCheck, Smartphone, X } from 'lucide-react';
import {
  getPushSubscriptionStatus,
  subscribeToPushNotifications,
  type PushSubscriptionStatus,
} from '../services/pushNotifications';
import { getErrorMessage } from '../services/safeAsync';
import { isNativeApp } from '../services/platform';

const DISMISSED_KEY_PREFIX = 'forjados-push-prompt-dismissed:';

function isIosBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandaloneApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

type PromptMode = 'permission' | 'ios-install';

function wasDismissed(userId: string) {
  try {
    return sessionStorage.getItem(`${DISMISSED_KEY_PREFIX}${userId}`) === 'true';
  } catch {
    return false;
  }
}

function rememberDismissal(userId: string) {
  try {
    sessionStorage.setItem(`${DISMISSED_KEY_PREFIX}${userId}`, 'true');
  } catch {
    // The prompt can still close when private storage is unavailable.
  }
}

export function PushPermissionPrompt({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PromptMode>('permission');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const enableButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    if (isNativeApp() || wasDismissed(userId)) {
      return () => {
        active = false;
      };
    }

    const timer = window.setTimeout(async () => {
      try {
        if (isIosBrowser() && !isStandaloneApp()) {
          setMode('ios-install');
          setOpen(true);
          return;
        }

        const status: PushSubscriptionStatus = await getPushSubscriptionStatus();
        if (!active || status.isSubscribed || status.permission === 'denied') return;

        if (status.supported && status.publicKeyStatus === 'valid') {
          setMode('permission');
          setOpen(true);
          return;
        }

      } catch (statusError) {
        console.warn('Convite de notificações indisponível:', statusError);
      }
    }, 450);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;

    enableButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function dismiss() {
    rememberDismissal(userId);
    setOpen(false);
    setError('');
  }

  async function enablePush() {
    setLoading(true);
    setError('');

    try {
      await subscribeToPushNotifications();
      setOpen(false);
    } catch (enableError) {
      setError(
        getErrorMessage(
          enableError,
          'Não foi possível ativar as notificações neste aparelho.'
        )
      );
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="push-permission-backdrop" role="presentation">
      <section
        className="push-permission-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-permission-title"
        aria-describedby="push-permission-description"
      >
        <button
          type="button"
          className="push-permission-close"
          aria-label="Agora não"
          onClick={dismiss}
        >
          <X size={20} />
        </button>

        <div className="push-permission-icon" aria-hidden="true">
          {mode === 'permission' ? <BellRing size={32} /> : <Smartphone size={32} />}
        </div>

        <p className="eyebrow">Não perca nenhum chamado</p>
        <h2 id="push-permission-title">
          {mode === 'permission'
            ? 'Ative as notificações do FORJADOS'
            : 'Instale o FORJADOS no iPhone'}
        </h2>
        <p id="push-permission-description" className="muted">
          {mode === 'permission'
            ? 'Receba avisos de aprovação, escalas, honra, lojas e comunicados mesmo quando o aplicativo estiver fechado.'
            : 'No iPhone, as notificações ficam disponíveis após instalar o app: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra o ícone instalado e entre novamente.'}
        </p>

        {mode === 'permission' && (
          <div className="push-permission-trust">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>Você pode desativar quando quiser em Notificações.</span>
          </div>
        )}

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="push-permission-actions">
          {mode === 'permission' ? (
            <button
              ref={enableButtonRef}
              type="button"
              className="primary-button"
              onClick={enablePush}
              disabled={loading}
            >
              <BellRing size={18} />
              {loading ? 'Ativando...' : 'Ativar notificações'}
            </button>
          ) : (
            <button
              ref={enableButtonRef}
              type="button"
              className="primary-button"
              onClick={dismiss}
            >
              Entendi
            </button>
          )}

          {mode === 'permission' && (
            <button type="button" className="secondary-button" onClick={dismiss}>
              Agora não
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
