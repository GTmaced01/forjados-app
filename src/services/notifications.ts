import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { AppNotification } from '../types';

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
    const { data, error } = await safeRequest(
      supabase
        .from('app_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(80),
      'Não foi possível carregar suas notificações.'
    );

    if (error) throw error;
    return (data || []) as AppNotification[];
  } catch (error) {
    throw friendly(error, 'Erro ao carregar notificações.');
  }
}

export async function markNotificationAsRead(notificationId: string) {
  try {
    const { error } = await safeRequest(
      supabase
        .from('app_notifications')
        .update({ is_read: true })
        .eq('id', notificationId),
      'Não foi possível marcar a notificação como lida.'
    );

    if (error) throw error;
  } catch (error) {
    throw friendly(error, 'Erro ao atualizar notificação.');
  }
}

export async function markAllNotificationsAsRead() {
  try {
    const { data: userData, error: userError } = await withTimeout(
      supabase.auth.getUser(),
      TIMEOUT,
      'Não foi possível identificar o usuário.'
    );

    if (userError) throw userError;
    if (!userData.user) throw new Error('Usuário não autenticado.');

    const { error } = await safeRequest(
      supabase
        .from('app_notifications')
        .update({ is_read: true })
        .eq('user_id', userData.user.id)
        .eq('is_read', false),
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
