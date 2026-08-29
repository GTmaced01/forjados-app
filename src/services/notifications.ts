import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { AppNotification, NotificationReceipt } from '../types';
import { isOfflineError, readOfflineData, saveOfflineData } from './offlineCache';

const TIMEOUT = 10000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRequest<T = any>(request: PromiseLike<T>, errorMessage: string): Promise<T> {
  return withTimeout(Promise.resolve(request), TIMEOUT, errorMessage);
}

function friendly(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message) return error;
  return new Error(fallback, { cause: error });
}

export async function listMyNotifications(): Promise<AppNotification[]> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    const { data, error } = await safeRequest(
      supabase
        .from('app_notifications')
        .select('*')
        .is('cleared_at', null)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(80),
      'Não foi possível carregar suas notificações.'
    );

    if (error) throw error;
    const notifications = (data || []) as AppNotification[];
    if (userId) saveOfflineData('notifications', notifications, userId);
    return notifications;
  } catch (error) {
    const { data: userData } = await supabase.auth.getSession();
    const cached = readOfflineData<AppNotification[]>('notifications', userData.session?.user.id);
    if (cached && isOfflineError(error)) return cached;
    throw friendly(error, 'Erro ao carregar notificações.');
  }
}

export async function markNotificationAsRead(notificationId: string) {
  try {
    const { error } = await safeRequest(
      supabase.rpc('forjados_mark_my_notification_v1', {
        p_notification_id: notificationId,
        p_is_read: true,
      }),
      'Não foi possível marcar a notificação como lida.'
    );

    if (error) throw error;
  } catch (error) {
    throw friendly(error, 'Erro ao atualizar notificação.');
  }
}

export async function markAllNotificationsAsRead() {
  try {
    const { error } = await safeRequest(
      supabase.rpc('forjados_mark_all_my_notifications_read_v1'),
      'Não foi possível marcar notificações como lidas.'
    );

    if (error) throw error;
  } catch (error) {
    throw friendly(error, 'Erro ao limpar notificações.');
  }
}

export async function countUnreadNotifications(): Promise<number> {
  try {
    const { data: userData, error: userError } = await withTimeout(
      supabase.auth.getUser(),
      TIMEOUT,
      'Não foi possível identificar o usuário.'
    );

    if (userError || !userData.user) return 0;

    const { count, error } = await safeRequest(
      supabase
        .from('app_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userData.user.id)
        .is('cleared_at', null)
        .eq('is_read', false),
      'Não foi possível contar notificações.'
    );

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.warn('Contador de notificações indisponível:', error);
    return 0;
  }
}

export async function toggleNotificationPin(notificationId: string, isPinned: boolean) {
  const { error } = await safeRequest(
    supabase.rpc('forjados_toggle_my_notification_pin_v1', {
      p_notification_id: notificationId,
      p_is_pinned: isPinned,
    }),
    'Não foi possível alterar a fixação do aviso.'
  );
  if (error) throw error;
}

export async function clearMyNotificationHistory(): Promise<number> {
  const { data, error } = await safeRequest(
    supabase.rpc('forjados_clear_my_notification_history_v1'),
    'Não foi possível limpar o histórico.'
  );
  if (error) throw error;
  return Number(data || 0);
}

export async function clearNotificationReceiptHistory(): Promise<number> {
  const { data, error } = await safeRequest(
    supabase.rpc('forjados_clear_notification_receipts_v1'),
    'Não foi possível limpar as confirmações.'
  );
  if (error) throw error;
  return Number(data || 0);
}

export async function sendMyPushTest() {
  try {
    const { data, error } = await safeRequest(
      supabase.rpc('forjados_send_test_push_notification'),
      'Não foi possível agendar a notificação de teste.'
    );

    if (error) throw error;
    return data as string;
  } catch (error) {
    throw friendly(error, 'Erro ao testar notificação push.');
  }
}

export async function listNotificationReceipts(limit = 250): Promise<NotificationReceipt[]> {
  try {
    const { data, error } = await safeRequest(
      supabase.rpc('forjados_list_notification_receipts_v1', {
        p_limit: Math.min(500, Math.max(1, limit)),
      }),
      'Não foi possível carregar as confirmações de leitura.'
    );

    if (error) throw error;
    return (data || []) as NotificationReceipt[];
  } catch (error) {
    throw friendly(error, 'Erro ao carregar confirmações de leitura.');
  }
}
