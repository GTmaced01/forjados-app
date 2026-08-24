import { supabase } from './supabase';
import type { RetreatEventSettings } from '../types';

interface EditionRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  registration_amount: number;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getActiveRetreatEvent(): Promise<RetreatEventSettings | null> {
  const { data, error } = await supabase
    .from('forjados_editions')
    .select('id,title,starts_at,ends_at,location,registration_amount,status,is_active,created_at,updated_at')
    .eq('is_active', true)
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const edition = data as EditionRow;
  return {
    id: edition.id,
    title: edition.title,
    start_date: edition.starts_at,
    end_date: edition.ends_at,
    location: edition.location,
    active: edition.is_active,
    registration_fee: Number(edition.registration_amount),
    registration_open: edition.status === 'open',
    created_at: edition.created_at,
    updated_at: edition.updated_at,
  };
}

export async function upsertActiveRetreatEvent(params: {
  title: string;
  start_date: string;
  end_date?: string;
  location?: string;
  registration_fee: number;
  registration_open: boolean;
}) {
  const { error } = await supabase.rpc('forjados_upsert_active_edition_v1', {
    p_title: params.title,
    p_starts_at: params.start_date,
    p_ends_at: params.end_date || null,
    p_location: params.location || '',
    p_registration_amount: params.registration_fee,
    p_registration_open: params.registration_open,
  });

  if (error) throw error;
}

export function getCountdownParts(dateString?: string | null, now = Date.now()) {
  if (!dateString) return null;
  const target = new Date(dateString).getTime();
  if (Number.isNaN(target)) return null;

  const diff = target - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, finished: true };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds, finished: false };
}
