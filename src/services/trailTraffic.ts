import { supabase } from './supabase';
import type {
  EventServiceSlot,
  EventServiceUnit,
  TrailGroupTraffic,
  TrailGroupTrafficHistory,
  TrailMapConnection,
  TrailMapStation,
  TrailMovementStatus,
  TrailTrafficSignal,
  TrailTrafficSnapshot,
} from '../types';

function normalizeStation(row: TrailMapStation): TrailMapStation {
  return {
    ...row,
    x_percent: Number(row.x_percent),
    y_percent: Number(row.y_percent),
    display_order: Number(row.display_order),
  };
}

function normalizeTraffic(row: TrailGroupTraffic): TrailGroupTraffic {
  return {
    ...row,
    marker_x: Number(row.marker_x),
    marker_y: Number(row.marker_y),
    delay_minutes: Number(row.delay_minutes),
  };
}

function normalizeHistory(row: TrailGroupTrafficHistory): TrailGroupTrafficHistory {
  return {
    ...row,
    id: Number(row.id),
    marker_x: Number(row.marker_x),
    marker_y: Number(row.marker_y),
    delay_minutes: Number(row.delay_minutes),
  };
}

export async function listTrailTrafficSnapshot(editionId: string): Promise<TrailTrafficSnapshot> {
  const [stationsResult, connectionsResult, trafficResult, historyResult, groupsResult, slotsResult] = await Promise.all([
    supabase
      .from('trail_map_stations')
      .select('*')
      .eq('edition_id', editionId)
      .eq('is_active', true)
      .order('display_order')
      .order('label'),
    supabase
      .from('trail_map_connections')
      .select('*')
      .eq('edition_id', editionId)
      .order('display_order'),
    supabase
      .from('trail_group_traffic')
      .select('*')
      .eq('edition_id', editionId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('trail_group_traffic_history')
      .select('*')
      .eq('edition_id', editionId)
      .order('changed_at', { ascending: false })
      .limit(80),
    supabase
      .from('event_service_units')
      .select('*')
      .eq('edition_id', editionId)
      .eq('unit_type', 'group')
      .eq('is_active', true)
      .order('display_order')
      .order('name'),
    supabase
      .from('event_service_slots')
      .select('*')
      .eq('edition_id', editionId)
      .order('starts_at'),
  ]);

  const error = stationsResult.error
    || connectionsResult.error
    || trafficResult.error
    || historyResult.error
    || groupsResult.error
    || slotsResult.error;
  if (error) throw error;

  return {
    stations: ((stationsResult.data || []) as TrailMapStation[]).map(normalizeStation),
    connections: (connectionsResult.data || []) as TrailMapConnection[],
    traffic: ((trafficResult.data || []) as TrailGroupTraffic[]).map(normalizeTraffic),
    history: ((historyResult.data || []) as TrailGroupTrafficHistory[]).map(normalizeHistory),
    groups: (groupsResult.data || []) as EventServiceUnit[],
    slots: (slotsResult.data || []) as EventServiceSlot[],
  };
}

export interface SaveTrailTrafficInput {
  edition_id: string;
  group_id: string;
  station_id?: string | null;
  origin_station_id?: string | null;
  destination_station_id?: string | null;
  marker_x: number;
  marker_y: number;
  movement_status: TrailMovementStatus;
  traffic_signal: TrailTrafficSignal;
  delay_minutes: number;
  notes: string;
}

export async function saveTrailGroupTraffic(
  input: SaveTrailTrafficInput,
  trafficId?: string
): Promise<TrailGroupTraffic> {
  const payload = {
    ...input,
    station_id: input.station_id || null,
    origin_station_id: input.origin_station_id || null,
    destination_station_id: input.destination_station_id || null,
    marker_x: Math.min(100, Math.max(0, Number(input.marker_x))),
    marker_y: Math.min(100, Math.max(0, Number(input.marker_y))),
    delay_minutes: Math.min(720, Math.max(0, Math.round(Number(input.delay_minutes || 0)))),
    notes: input.notes.trim().slice(0, 1000),
  };
  const query = trafficId
    ? supabase.from('trail_group_traffic').update(payload).eq('id', trafficId)
    : supabase.from('trail_group_traffic').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return normalizeTraffic(data as TrailGroupTraffic);
}

export function subscribeToTrailTraffic(
  editionId: string,
  onChange: () => void,
  onStatus?: (connected: boolean) => void
) {
  const channel = supabase
    .channel(`trail-traffic-${editionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'trail_group_traffic',
        filter: `edition_id=eq.${editionId}`,
      },
      onChange
    )
    .subscribe((status: string) => {
      onStatus?.(status === 'SUBSCRIBED');
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
