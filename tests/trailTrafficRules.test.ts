import assert from 'node:assert/strict';
import test from 'node:test';
import { detectTrailConflicts, nearestTrailStation } from '../src/services/trailTrafficRules.ts';
import type { EventServiceUnit, TrailGroupTraffic, TrailMapStation } from '../src/types.ts';

const groups = [
  { id: 'red', name: 'Vermelho' },
  { id: 'gold', name: 'Ouro' },
] as EventServiceUnit[];

const stations = [
  { id: 'field', label: 'Campo', short_label: 'Campo', x_percent: 50, y_percent: 30 },
  { id: 'forest', label: 'Selva', short_label: 'Selva', x_percent: 20, y_percent: 10 },
] as TrailMapStation[];

function traffic(input: Partial<TrailGroupTraffic> & Pick<TrailGroupTraffic, 'group_id'>) {
  return {
    id: input.group_id,
    edition_id: 'edition',
    station_id: null,
    origin_station_id: null,
    destination_station_id: null,
    marker_x: 0,
    marker_y: 0,
    movement_status: 'at_station',
    traffic_signal: 'clear',
    delay_minutes: 0,
    notes: '',
    updated_by_name: 'Teste',
    created_at: '',
    updated_at: '',
    ...input,
  } as TrailGroupTraffic;
}

test('detecta dois grupos na mesma estação', () => {
  const conflicts = detectTrailConflicts(groups, [
    traffic({ group_id: 'red', station_id: 'field', marker_x: 50, marker_y: 30 }),
    traffic({ group_id: 'gold', station_id: 'field', marker_x: 50, marker_y: 30 }),
  ], stations);

  assert.equal(conflicts[0]?.kind, 'station');
  assert.match(conflicts[0]?.description || '', /Vermelho e Ouro/);
});

test('detecta grupos no mesmo trecho mesmo em sentidos opostos', () => {
  const conflicts = detectTrailConflicts(groups, [
    traffic({ group_id: 'red', movement_status: 'moving', origin_station_id: 'field', destination_station_id: 'forest' }),
    traffic({ group_id: 'gold', movement_status: 'moving', origin_station_id: 'forest', destination_station_id: 'field' }),
  ], stations);

  assert.ok(conflicts.some((conflict) => conflict.kind === 'segment'));
});

test('avisa quando um grupo está seguindo para uma estação ocupada', () => {
  const conflicts = detectTrailConflicts(groups, [
    traffic({ group_id: 'red', movement_status: 'moving', origin_station_id: 'forest', destination_station_id: 'field', marker_x: 35, marker_y: 20 }),
    traffic({ group_id: 'gold', movement_status: 'at_station', station_id: 'field', marker_x: 50, marker_y: 30 }),
  ], stations);

  assert.ok(conflicts.some((conflict) => conflict.kind === 'arrival'));
});

test('ignora grupos que ainda não começaram', () => {
  const conflicts = detectTrailConflicts(groups, [
    traffic({ group_id: 'red', movement_status: 'not_started', station_id: 'field', marker_x: 50, marker_y: 30 }),
    traffic({ group_id: 'gold', movement_status: 'not_started', station_id: 'field', marker_x: 50, marker_y: 30 }),
  ], stations);

  assert.equal(conflicts.length, 0);
});

test('encaixa o marcador na estação mais próxima dentro do limite', () => {
  assert.equal(nearestTrailStation(stations, 52, 31)?.id, 'field');
  assert.equal(nearestTrailStation(stations, 90, 90), null);
});
