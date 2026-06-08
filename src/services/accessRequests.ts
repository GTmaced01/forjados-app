import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { UserProfile } from '../types';

const TIMEOUT = 10000;
const RPC_LIST_PENDING = 'forjados_admin_list_pending_access_requests_v5';
const RPC_APPROVE = 'forjados_admin_approve_profile_v5';
const RPC_REJECT = 'forjados_admin_reject_profile_v5';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRequest<T = any>(request: PromiseLike<T>, errorMessage: string): Promise<T> {
  return withTimeout(Promise.resolve(request), TIMEOUT, errorMessage);
}

function getSupabaseErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object') {
    const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [maybe.message, maybe.details, maybe.hint, maybe.code]
      .filter(Boolean)
      .map(String);

    if (parts.length > 0) return parts.join(' | ');
  }

  return fallback;
}

function throwFriendlyError(error: unknown, fallback: string): never {
  throw new Error(getSupabaseErrorMessage(error, fallback), { cause: error });
}

export async function listPendingAccessRequests(): Promise<UserProfile[]> {
  try {
    const { data, error } = await safeRequest(
      supabase.rpc(RPC_LIST_PENDING),
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
    const request =
      params.status === 'approved'
        ? supabase.rpc(RPC_APPROVE, {
            p_user_id: params.userId,
            p_role: null,
          })
        : supabase.rpc(RPC_REJECT, {
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
