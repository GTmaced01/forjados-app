import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { PointTransaction, UserProfile } from '../types';

const TIMEOUT = 10000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRequest<T = any>(request: PromiseLike<T>, errorMessage: string): Promise<T> {
  return withTimeout(Promise.resolve(request), TIMEOUT, errorMessage);
}

function getFriendlyError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message) return error;
  return new Error(fallback, { cause: error });
}

export async function listMyPointTransactions(): Promise<PointTransaction[]> {
  try {
    const { data: userData, error: userError } = await withTimeout(
      supabase.auth.getUser(),
      TIMEOUT,
      'Não foi possível identificar o usuário autenticado.'
    );

    if (userError) throw userError;
    if (!userData.user) throw new Error('Usuário não autenticado.');

    const { data, error } = await safeRequest(
      supabase
        .from('point_transactions')
        .select('*')
        .eq('user_id', userData.user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      'Não foi possível carregar seu histórico de pontos.'
    );

    if (error) throw error;

    return (data || []) as PointTransaction[];
  } catch (error) {
    throw getFriendlyError(error, 'Erro ao carregar histórico de pontos.');
  }
}

export async function listAllPointTransactions(): Promise<PointTransaction[]> {
  try {
    const { data, error } = await safeRequest(
      supabase.rpc('points_list_transactions'),
      'Não foi possível carregar o histórico geral de pontos.'
    );

    if (!error) return ((data || []) as PointTransaction[]).filter((item) => !('deleted_at' in item) || !item.deleted_at);

    throw error;
  } catch (rpcError) {
    console.warn('RPC points_list_transactions indisponível, tentando consulta direta:', rpcError);

    try {
      const { data, error } = await safeRequest(
        supabase
          .from('point_transactions')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        'Não foi possível carregar o histórico geral de pontos.'
      );

      if (error) throw error;
      return (data || []) as PointTransaction[];
    } catch (error) {
      throw getFriendlyError(error, 'Erro ao carregar histórico geral de pontos.');
    }
  }
}

export async function listPointEligibleProfiles(): Promise<UserProfile[]> {
  try {
    const { data, error } = await safeRequest(
      supabase.rpc('points_list_eligible_profiles'),
      'Não foi possível carregar a lista de membros.'
    );

    if (!error) return (data || []) as UserProfile[];

    throw error;
  } catch (rpcError) {
    console.warn('RPC points_list_eligible_profiles indisponível, tentando consulta direta:', rpcError);

    try {
      const { data, error } = await safeRequest(
        supabase
          .from('profiles')
          .select('*')
          .not('email', 'is', null)
          .order('display_name', { ascending: true }),
        'Não foi possível carregar a lista de membros.'
      );

      if (error) throw error;
      return (data || []) as UserProfile[];
    } catch (error) {
      throw getFriendlyError(error, 'Erro ao carregar membros para pontuação.');
    }
  }
}

export async function grantPointsManual(params: {
  userId: string;
  amount: number;
  reason: string;
}) {
  const { error } = await withTimeout(
    Promise.resolve(
      supabase.rpc('grant_points_manual', {
        p_user_id: params.userId,
        p_amount: params.amount,
        p_reason: params.reason,
      })
    ),
    TIMEOUT,
    'Tempo limite ao lançar pontos.'
  );

  if (error) {
    throw new Error(error.message || 'Erro ao lançar pontos.');
  }
}

export function formatPointSource(sourceType?: string) {
  if (sourceType === 'ride') return 'Carona';
  if (sourceType === 'manual') return 'Manual';
  if (sourceType === 'redemption') return 'Resgate';

  return sourceType || 'Sistema';
}

export async function listPointsRanking(): Promise<UserProfile[]> {
  try {
    const { data, error } = await safeRequest(
      supabase.rpc('points_list_ranking'),
      'Não foi possível carregar o ranking de pontos.'
    );

    if (!error) return (data || []) as UserProfile[];

    throw error;
  } catch (rpcError) {
    console.warn('RPC points_list_ranking indisponível, tentando consulta direta:', rpcError);

    try {
      const { data, error } = await safeRequest(
        supabase
          .from('profiles')
          .select('*')
          .not('email', 'is', null)
          .order('points', { ascending: false })
          .order('display_name', { ascending: true }),
        'Não foi possível carregar o ranking de pontos.'
      );

      if (error) throw error;
      return (data || []) as UserProfile[];
    } catch (error) {
      throw getFriendlyError(error, 'Erro ao carregar ranking de pontos.');
    }
  }
}
