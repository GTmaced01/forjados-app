import { supabase } from './supabase';
import type { PointTransaction, UserProfile } from '../types';

export async function listMyPointTransactions(): Promise<PointTransaction[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as PointTransaction[];
}

export async function listAllPointTransactions(): Promise<PointTransaction[]> {
  const { data, error } = await supabase
    .from('point_transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as PointTransaction[];
}

export async function listPointEligibleProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .not('email', 'is', null)
    .order('display_name', { ascending: true });

  if (error) throw error;

  return (data || []) as UserProfile[];
}

export async function grantPointsManual(params: {
  userId: string;
  amount: number;
  reason: string;
}) {
  const { error } = await supabase.rpc('grant_points_manual', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_reason: params.reason,
  });

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
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .not('email', 'is', null)
    .order('points', { ascending: false })
    .order('display_name', { ascending: true });

  if (error) throw error;

  return (data || []) as UserProfile[];
}