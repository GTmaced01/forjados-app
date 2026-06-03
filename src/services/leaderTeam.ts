import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { UserProfile } from '../types';

const TIMEOUT = 10000;

export async function listLeaderTeamMembers(leader: UserProfile): Promise<UserProfile[]> {
  const leaderSectors = leader.sectors || [];

  if (leaderSectors.length === 0) {
    return [];
  }

  const { data, error } = await withTimeout(
    Promise.resolve(supabase
      .from('profiles')
      .select('*')
      .eq('inscription_status', 'approved')
      .not('email', 'is', null)
      .order('display_name', { ascending: true })),
    TIMEOUT,
    'Não foi possível carregar seus liderados.'
  );

  if (error) throw error;

  return ((data || []) as UserProfile[]).filter((member) => {
    if (member.id === leader.id) return false;
    const memberSectors = member.sectors || [];
    return memberSectors.some((sector) => leaderSectors.includes(sector));
  });
}
