import { supabase } from './supabase';
import type { RetreatEventSettings } from '../types';

export async function getActiveRetreatEvent(): Promise<RetreatEventSettings | null> {
  const { data, error } = await supabase
    .from('retreat_events')
    .select('*')
    .eq('active', true)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as RetreatEventSettings | null;
}

export async function upsertActiveRetreatEvent(params: {
  title: string;
  start_date: string;
  end_date?: string;
  location?: string;
}) {
  const { error: deactivateError } = await supabase
    .from('retreat_events')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('active', true);

  if (deactivateError) throw deactivateError;

  const { error } = await supabase.from('retreat_events').insert({
    title: params.title,
    start_date: params.start_date,
    end_date: params.end_date || null,
    location: params.location || '',
    active: true,
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
