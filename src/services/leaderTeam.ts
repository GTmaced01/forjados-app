import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { UserProfile } from '../types';

const TIMEOUT = 10000;

export async function listLeaderTeamMembers(): Promise<UserProfile[]> {
  const { data, error } = await withTimeout(
    Promise.resolve(supabase.rpc('list_my_team_members')),
    TIMEOUT,
    'Não foi possível carregar seus liderados.'
  );

  if (error) {
    throw new Error(error.message || 'Erro ao carregar liderados.');
  }

  return (data || []) as UserProfile[];
}
