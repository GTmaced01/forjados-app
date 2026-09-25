import { supabase } from './supabase';
import {
  normalizeVapidPublicKey,
  vapidPublicKeyToUint8Array,
} from './vapid';

type PushPermissionState =
  | 'unsupported'
  | 'missing-public-key'
  | 'invalid-public-key'
  | 'default'
  | 'granted'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed';

export type PushSubscriptionStatus = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  hasPublicKey: boolean;
  publicKeyStatus: 'valid' | 'missing' | 'invalid';
  isSubscribed: boolean;
  state: PushPermissionState;
};

const RAW_WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
const WEB_PUSH_PUBLIC_KEY = normalizeVapidPublicKey(RAW_WEB_PUSH_PUBLIC_KEY);

function getPublicKeyStatus(): PushSubscriptionStatus['publicKeyStatus'] {
  if (!RAW_WEB_PUSH_PUBLIC_KEY?.trim()) return 'missing';
  return WEB_PUSH_PUBLIC_KEY ? 'valid' : 'invalid';
}

function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

async function getRegistration() {
  if (!isPushSupported()) {
    throw new Error('Este navegador não suporta notificações push.');
  }

  const registration = await navigator.serviceWorker.ready;
  if (!registration.pushManager) {
    throw new Error('Push Manager não está disponível neste navegador.');
  }

  return registration;
}

export async function getPushSubscriptionStatus(): Promise<PushSubscriptionStatus> {
  if (!isPushSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      hasPublicKey: Boolean(WEB_PUSH_PUBLIC_KEY),
      publicKeyStatus: getPublicKeyStatus(),
      isSubscribed: false,
      state: 'unsupported',
    };
  }

  const publicKeyStatus = getPublicKeyStatus();

  if (!WEB_PUSH_PUBLIC_KEY) {
    return {
      supported: true,
      permission: Notification.permission,
      hasPublicKey: false,
      publicKeyStatus,
      isSubscribed: false,
      state: publicKeyStatus === 'missing' ? 'missing-public-key' : 'invalid-public-key',
    };
  }

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  const permission = Notification.permission;

  return {
    supported: true,
    permission,
    hasPublicKey: true,
    publicKeyStatus: 'valid',
    isSubscribed: Boolean(subscription),
    state: subscription
      ? 'subscribed'
      : permission === 'granted'
        ? 'unsubscribed'
        : permission,
  };
}

export async function subscribeToPushNotifications() {
  if (!WEB_PUSH_PUBLIC_KEY) {
    throw new Error(
      getPublicKeyStatus() === 'missing'
        ? 'Chave pública de notificações não configurada.'
        : 'A chave pública de notificações está em formato inválido.'
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const registration = await getRegistration();

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permissão de notificação não foi concedida.');
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKeyToUint8Array(WEB_PUSH_PUBLIC_KEY),
    });
  }

  const subscriptionJson = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = subscriptionJson.keys?.p256dh;
  const auth = subscriptionJson.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Assinatura push inválida. Tente ativar novamente.');
  }

  const { error } = await supabase.rpc('forjados_register_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent,
  });

  if (error) throw error;

  return subscription;
}

export async function unsubscribeFromPushNotifications() {
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return;

  const { data: userData } = await supabase.auth.getUser();

  await subscription.unsubscribe();

  const query = supabase
    .from('web_push_subscriptions')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('endpoint', subscription.endpoint);

  if (userData.user) {
    query.eq('user_id', userData.user.id);
  }

  const { error } = await query;
  if (error) throw error;
}

export function formatPushStatus(status: PushSubscriptionStatus) {
  if (!status.supported) return 'Este navegador não suporta push.';
  if (status.publicKeyStatus === 'missing') return 'Chave de notificações não configurada.';
  if (status.publicKeyStatus === 'invalid') return 'Configuração de notificações inválida.';
  if (status.state === 'subscribed') return 'Notificações push ativas.';
  if (status.permission === 'denied') return 'Permissão bloqueada no navegador.';
  if (status.permission === 'granted') return 'Permissão concedida, mas assinatura não ativa.';
  return 'Toque em ativar para receber notificações fora do app.';
}
