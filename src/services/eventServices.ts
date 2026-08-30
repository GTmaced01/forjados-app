import { supabase } from './supabase';
import type {
  EventServiceAssignment,
  EventServicePersonOption,
  EventServicePosition,
  EventServicesSnapshot,
  EventServiceSlot,
  EventServiceUnit,
  EventServiceUnitType,
} from '../types';

export async function listEventServicesSnapshot(editionId: string): Promise<EventServicesSnapshot> {
  const [unitsResult, positionsResult, assignmentsResult, slotsResult] = await Promise.all([
    supabase
      .from('event_service_units')
      .select('*')
      .eq('edition_id', editionId)
      .order('unit_type')
      .order('display_order')
      .order('name'),
    supabase
      .from('event_service_positions')
      .select('*, event_service_units!inner(edition_id)')
      .eq('event_service_units.edition_id', editionId)
      .order('display_order')
      .order('name'),
    supabase
      .from('event_service_assignments')
      .select('*')
      .eq('edition_id', editionId)
      .order('display_order')
      .order('person_name'),
    supabase
      .from('event_service_slots')
      .select('*')
      .eq('edition_id', editionId)
      .order('starts_at'),
  ]);

  const error = unitsResult.error || positionsResult.error || assignmentsResult.error || slotsResult.error;
  if (error) throw error;

  return {
    units: (unitsResult.data || []) as EventServiceUnit[],
    positions: ((positionsResult.data || []) as Array<EventServicePosition & { event_service_units?: unknown }>).map((row) => {
      const { event_service_units: _unit, ...position } = row;
      void _unit;
      return position;
    }),
    assignments: (assignmentsResult.data || []) as EventServiceAssignment[],
    slots: (slotsResult.data || []) as EventServiceSlot[],
  };
}

export async function listEventServicePeople(): Promise<EventServicePersonOption[]> {
  const { data, error } = await supabase.rpc('forjados_list_service_people_v1');
  if (error) throw error;
  return (data || []) as EventServicePersonOption[];
}

export async function saveEventServiceUnit(input: {
  edition_id: string;
  unit_type: EventServiceUnitType;
  name: string;
  description?: string;
  color?: string;
  min_people?: number;
  max_people?: number | null;
  per_group?: boolean;
  display_order?: number;
  is_active?: boolean;
}, unitId?: string) {
  const payload = {
    ...input,
    name: input.name.trim(),
    description: (input.description || '').trim(),
    color: input.color || '',
    min_people: Number(input.min_people || 0),
    max_people: input.max_people == null ? null : Number(input.max_people),
    per_group: input.per_group === true,
    display_order: Number(input.display_order || 0),
    is_active: input.is_active !== false,
  };
  const query = unitId
    ? supabase.from('event_service_units').update(payload).eq('id', unitId)
    : supabase.from('event_service_units').insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function saveEventServicePosition(input: {
  unit_id: string;
  name: string;
  description?: string;
  min_people?: number;
  max_people?: number | null;
  display_order?: number;
  is_active?: boolean;
}, positionId?: string) {
  const payload = {
    ...input,
    name: input.name.trim(),
    description: (input.description || '').trim(),
    min_people: Number(input.min_people || 0),
    max_people: input.max_people == null ? null : Number(input.max_people),
    display_order: Number(input.display_order || 0),
    is_active: input.is_active !== false,
  };
  const query = positionId
    ? supabase.from('event_service_positions').update(payload).eq('id', positionId)
    : supabase.from('event_service_positions').insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function saveEventServiceAssignment(input: {
  edition_id: string;
  unit_id: string;
  position_id?: string | null;
  linked_character_id?: string | null;
  group_id?: string | null;
  user_id?: string | null;
  external_name?: string;
  assignment_kind?: 'staff' | 'participant';
  role_title?: string;
  is_leader?: boolean;
  is_primary?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  notes?: string;
  display_order?: number;
}, assignmentId?: string) {
  const payload = {
    ...input,
    position_id: input.position_id || null,
    linked_character_id: input.linked_character_id || null,
    group_id: input.group_id || null,
    user_id: input.user_id || null,
    external_name: input.user_id ? '' : (input.external_name || '').trim(),
    assignment_kind: input.assignment_kind || 'staff',
    role_title: (input.role_title || '').trim(),
    is_leader: input.is_leader === true,
    is_primary: input.is_primary === true,
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    notes: (input.notes || '').trim(),
    display_order: Number(input.display_order || 0),
  };
  const query = assignmentId
    ? supabase.from('event_service_assignments').update(payload).eq('id', assignmentId)
    : supabase.from('event_service_assignments').insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function saveEventServiceSlot(input: {
  edition_id: string;
  unit_id: string;
  location_id?: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  notes?: string;
  display_order?: number;
}, slotId?: string) {
  const payload = {
    ...input,
    location_id: input.location_id || null,
    title: input.title.trim(),
    notes: (input.notes || '').trim(),
    display_order: Number(input.display_order || 0),
  };
  const query = slotId
    ? supabase.from('event_service_slots').update(payload).eq('id', slotId)
    : supabase.from('event_service_slots').insert(payload);
  const { error } = await query;
  if (error) throw error;
}

async function removeFrom(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export function removeEventServiceAssignment(id: string) {
  return removeFrom('event_service_assignments', id);
}

export function removeEventServicePosition(id: string) {
  return removeFrom('event_service_positions', id);
}

export function removeEventServiceSlot(id: string) {
  return removeFrom('event_service_slots', id);
}
