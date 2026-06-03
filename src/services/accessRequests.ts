import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { UserProfile } from '../types';
import { ensureProfileInServiceScale } from './serviceScale';

const TIMEOUT = 10000;

async function safeRequest<T>(request: PromiseLike<T>, errorMessage: string): Promise<T> {
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
      supabase
        .from('profiles')
        .select('*')
        .eq('inscription_status', 'pending')
        .order('created_at', { ascending: false }),
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
    const { data: profile, error: profileError } = await safeRequest(
      supabase.from('profiles').select('*').eq('id', params.userId).maybeSingle(),
      'Não foi possível carregar o perfil da solicitação.'
    );

    if (profileError) throw profileError;

    const { error } = await safeRequest(
      supabase
        .from('profiles')
        .update({
          inscription_status: params.status,
          role: params.status === 'approved' ? (profile?.requested_role || profile?.role || 'member') : (profile?.role || 'member'),
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.userId),
      'Não foi possível atualizar a solicitação de acesso.'
    );

    if (error) throw error;

    if (params.status === 'approved' && profile) {
      try {
        await ensureProfileInServiceScale({
          displayName: profile.display_name,
          phone: profile.phone,
          sectors: profile.sectors || [],
          role: profile.requested_role || profile.role,
        });
      } catch (scaleError) {
        console.warn('Perfil aprovado, mas não foi possível inserir na escala automaticamente:', scaleError);
      }
    }
  } catch (error) {
    throwFriendlyError(error, 'Erro ao atualizar solicitação de acesso.');
  }
}
