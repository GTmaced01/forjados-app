import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { UserProfile } from '../types';

const TIMEOUT = 10000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRequest<T = any>(request: PromiseLike<T>, errorMessage: string): Promise<T> {
  return withTimeout(Promise.resolve(request), TIMEOUT, errorMessage);
}

function throwFriendlyError(error: unknown, fallback: string): never {
  if (error instanceof Error && error.message) {
    throw error;
  }

  throw new Error(fallback, { cause: error });
}

export async function listPendingAccessRequests(): Promise<UserProfile[]> {
  try {
    const { data, error } = await safeRequest(
      supabase.rpc('forjados_admin_list_pending_access_requests_v4'),
      'Não foi possível carregar as solicitações de acesso.'
    );

    if (error) throw error;

    return (data || []) as UserProfile[];
  } catch (error) {
    throwFriendlyError(error, 'Erro ao carregar solicitações de acesso.');
  }
}

export async function updateAccessRequestStatus(params: {
  userId: string;
  status: 'approved' | 'rejected';
}) {
  try {
    const request = params.status === 'approved'
      ? supabase.rpc('forjados_admin_approve_profile_v4', {
          p_user_id: params.userId,
          p_role: null,
        })
      : supabase.rpc('forjados_admin_reject_profile_v4', {
          p_user_id: params.userId,
        });

    const { error } = await safeRequest(
      request,
      'Não foi possível atualizar a solicitação de acesso.'
    );

    if (error) throw error;
  } catch (error) {
    throwFriendlyError(error, 'Erro ao atualizar solicitação de acesso.');
  }
}
