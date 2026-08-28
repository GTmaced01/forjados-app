import { supabase } from './supabase';
import type { EventScheduleItem, EventScheduleItemInput } from '../types';

export async function listEventScheduleItems(): Promise<EventScheduleItem[]> {
  const { data, error } = await supabase
    .from('event_schedule_items')
    .select('*')
    .is('deleted_at', null)
    .order('starts_at', { ascending: true });

  if (error) throw error;
  return (data || []) as EventScheduleItem[];
}

export async function saveEventScheduleItem(
  input: EventScheduleItemInput,
  itemId?: string
): Promise<string> {
  const payload = {
    edition_id: input.edition_id,
    title: input.title.trim(),
    description: (input.description || '').trim(),
    starts_at: input.starts_at,
    ends_at: input.ends_at || null,
    location: (input.location || '').trim(),
    activity_type: input.activity_type,
    team_names: input.team_names,
    responsible: (input.responsible || '').trim(),
    is_published: input.is_published,
  };

  if (itemId) {
    const { error } = await supabase
      .from('event_schedule_items')
      .update(payload)
      .eq('id', itemId);
    if (error) throw error;
    return itemId;
  }

  const { data, error } = await supabase
    .from('event_schedule_items')
    .insert(payload)
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('Atividade salva sem identificador.');
  return data.id as string;
}

export async function archiveEventScheduleItem(itemId: string) {
  const { error } = await supabase
    .from('event_schedule_items')
    .update({ deleted_at: new Date().toISOString(), is_published: false })
    .eq('id', itemId);

  if (error) throw error;
}
