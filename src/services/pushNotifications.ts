import { supabase } from './supabase';

export type PushPermissionState =
  | 'unsupported'
  | 'missing-public-key'
  | 'default'
  | 'granted'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed';

export type PushSubscriptionStatus = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  hasPublicKey: boolean;
  isSubscribed: boolean;
  state: PushPermissionState;
};

const WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function isPushSupported() {
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
      isSubscribed: false,
      state: 'unsupported',
    };
  }

  if (!WEB_PUSH_PUBLIC_KEY) {
    return {
      supported: true,
      permission: Notification.permission,
      hasPublicKey: false,
      isSubscribed: false,
      state: 'missing-public-key',
    };
  }

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  const permission = Notification.permission;

  return {
    supported: true,
    permission,
    hasPublicKey: true,
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
    throw new Error('Chave pública VAPID não configurada. Confira VITE_WEB_PUSH_PUBLIC_KEY.');
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
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    });
  }

  const subscriptionJson = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = subscriptionJson.keys?.p256dh;
  const auth = subscriptionJson.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Assinatura push inválida. Tente ativar novamente.');
  }

  const { error } = await supabase
    .from('web_push_subscriptions')
    .upsert(
      {
        user_id: userData.user.id,
        endpoint,
        p256dh,
        auth,
        subscription: subscriptionJson,
        user_agent: navigator.userAgent,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

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
  if (!status.hasPublicKey) return 'Chave VAPID não configurada.';
  if (status.state === 'subscribed') return 'Notificações push ativas.';
  if (status.permission === 'denied') return 'Permissão bloqueada no navegador.';
  if (status.permission === 'granted') return 'Permissão concedida, mas assinatura não ativa.';
  return 'Toque em ativar para receber notificações fora do app.';
}
