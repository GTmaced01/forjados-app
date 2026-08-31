import { supabase } from './supabase';
import type {
  EventServiceUnit,
  TrailGroupTraffic,
  TrailMapConnection,
  TrailMapStation,
  TrailMovementStatus,
  TrailRouteExecution,
  TrailRouteExecutionStep,
  TrailRoutePlan,
  TrailRoutePlanStep,
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

function normalizePlanStep(row: TrailRoutePlanStep): TrailRoutePlanStep {
  return {
    ...row,
    ideal_order: Number(row.ideal_order),
    stay_minutes: Number(row.stay_minutes),
    travel_minutes: Number(row.travel_minutes),
  };
}

function normalizeExecution(row: TrailRouteExecution): TrailRouteExecution {
  return { ...row, schedule_variance_minutes: Number(row.schedule_variance_minutes) };
}

function normalizeExecutionStep(row: TrailRouteExecutionStep): TrailRouteExecutionStep {
  return {
    ...row,
    original_order: Number(row.original_order),
    live_order: Number(row.live_order),
    stay_minutes: Number(row.stay_minutes),
    travel_minutes: Number(row.travel_minutes),
  };
}

export async function listTrailTrafficSnapshot(editionId: string): Promise<TrailTrafficSnapshot> {
  const [
    stationsResult,
    connectionsResult,
    trafficResult,
    groupsResult,
    plansResult,
    planStepsResult,
    executionsResult,
    executionStepsResult,
  ] = await Promise.all([
    supabase.from('trail_map_stations').select('*').eq('edition_id', editionId).eq('is_active', true).order('display_order').order('label'),
    supabase.from('trail_map_connections').select('*').eq('edition_id', editionId).order('display_order'),
    supabase.from('trail_group_traffic').select('*').eq('edition_id', editionId).order('updated_at', { ascending: false }),
    supabase.from('event_service_units').select('*').eq('edition_id', editionId).eq('unit_type', 'group').eq('is_active', true).order('display_order').order('name'),
    supabase.from('trail_route_plans').select('*').eq('edition_id', editionId),
    supabase.from('trail_route_plan_steps').select('*').eq('edition_id', editionId).order('ideal_order'),
    supabase.from('trail_route_executions').select('*').eq('edition_id', editionId),
    supabase.from('trail_route_execution_steps').select('*').eq('edition_id', editionId).order('live_order'),
  ]);

  const error = stationsResult.error
    || connectionsResult.error
    || trafficResult.error
    || groupsResult.error
    || plansResult.error
    || planStepsResult.error
    || executionsResult.error
    || executionStepsResult.error;
  if (error) throw error;

  return {
    stations: ((stationsResult.data || []) as TrailMapStation[]).map(normalizeStation),
    connections: (connectionsResult.data || []) as TrailMapConnection[],
    traffic: ((trafficResult.data || []) as TrailGroupTraffic[]).map(normalizeTraffic),
    groups: (groupsResult.data || []) as EventServiceUnit[],
    routePlans: (plansResult.data || []) as TrailRoutePlan[],
    routePlanSteps: ((planStepsResult.data || []) as TrailRoutePlanStep[]).map(normalizePlanStep),
    executions: ((executionsResult.data || []) as TrailRouteExecution[]).map(normalizeExecution),
    executionSteps: ((executionStepsResult.data || []) as TrailRouteExecutionStep[]).map(normalizeExecutionStep),
  };
}

export async function listTrailRoutePlanDefinition(groupId: string) {
  const { data: planData, error: planError } = await supabase
    .from('trail_route_plans')
    .select('*')
    .eq('group_id', groupId)
    .single();
  if (planError) throw planError;
  const plan = planData as TrailRoutePlan;
  const [stepsResult, stationsResult] = await Promise.all([
    supabase.from('trail_route_plan_steps').select('*').eq('plan_id', plan.id).order('ideal_order'),
    supabase.from('trail_map_stations').select('*').eq('edition_id', plan.edition_id).eq('is_active', true).order('display_order'),
  ]);
  const error = stepsResult.error || stationsResult.error;
  if (error) throw error;
  return {
    plan,
    steps: ((stepsResult.data || []) as TrailRoutePlanStep[]).map(normalizePlanStep),
    stations: ((stationsResult.data || []) as TrailMapStation[]).map(normalizeStation),
  };
}

export async function saveTrailRoutePlanStart(planId: string, startsAt: string) {
  const { error } = await supabase.from('trail_route_plans').update({ starts_at: startsAt }).eq('id', planId);
  if (error) throw error;
}

export interface SaveTrailRoutePlanStepInput {
  plan_id: string;
  edition_id: string;
  group_id: string;
  station_id?: string | null;
  label: string;
  ideal_order: number;
  stay_minutes: number;
  travel_minutes: number;
  is_break: boolean;
}

export async function saveTrailRoutePlanStep(input: SaveTrailRoutePlanStepInput, stepId?: string) {
  const payload = {
    ...input,
    station_id: input.station_id || null,
    label: input.label.trim().slice(0, 120),
    ideal_order: Math.max(1, Math.round(input.ideal_order)),
    stay_minutes: Math.min(360, Math.max(1, Math.round(input.stay_minutes))),
    travel_minutes: Math.min(180, Math.max(0, Math.round(input.travel_minutes))),
  };
  const query = stepId
    ? supabase.from('trail_route_plan_steps').update(payload).eq('id', stepId)
    : supabase.from('trail_route_plan_steps').insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function removeTrailRoutePlanStep(stepId: string) {
  const { error } = await supabase.from('trail_route_plan_steps').delete().eq('id', stepId);
  if (error) throw error;
}

export async function reorderTrailRoutePlan(planId: string, stepIds: string[]) {
  const { error } = await supabase.rpc('forjados_reorder_trail_route_plan_v1', {
    p_plan_id: planId,
    p_step_ids: stepIds,
  });
  if (error) throw error;
}

export async function startTrailRoute(groupId: string) {
  const { data, error } = await supabase.rpc('forjados_start_trail_route_v1', { p_group_id: groupId });
  if (error) throw error;
  return data as string;
}

export async function checkInTrailStep(stepId: string) {
  const { data, error } = await supabase.rpc('forjados_check_in_trail_step_v1', { p_execution_step_id: stepId });
  if (error) throw error;
  return data as string;
}

export async function reorderTrailExecution(executionId: string, stepIds: string[]) {
  const { error } = await supabase.rpc('forjados_reorder_trail_execution_v1', {
    p_execution_id: executionId,
    p_step_ids: stepIds,
  });
  if (error) throw error;
}

export async function finishTrailRoute(groupId: string) {
  const { data, error } = await supabase.rpc('forjados_finish_trail_route_v1', { p_group_id: groupId });
  if (error) throw error;
  return data as string;
}

export async function resetTrailRoutes(editionId: string, groupId?: string) {
  const { data, error } = await supabase.rpc('forjados_reset_trail_routes_v1', {
    p_edition_id: editionId,
    p_group_id: groupId || null,
  });
  if (error) throw error;
  return Number(data || 0);
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

export async function saveTrailGroupTraffic(input: SaveTrailTrafficInput, trafficId?: string) {
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
  const filter = `edition_id=eq.${editionId}`;
  const channel = supabase
    .channel(`trail-traffic-${editionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trail_group_traffic', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trail_route_executions', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trail_route_execution_steps', filter }, onChange)
    .subscribe((status: string) => onStatus?.(status === 'SUBSCRIBED'));

  return () => {
    void supabase.removeChannel(channel);
  };
}
