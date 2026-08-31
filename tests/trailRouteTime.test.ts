import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateLiveTrailTimeline,
  calculatePlannedTrailTimeline,
  calculateScheduleVarianceMinutes,
  formatRouteClock,
  moveTrailStep,
} from '../src/services/trailRouteTime.ts';
import type { TrailRouteExecutionStep, TrailRoutePlanStep } from '../src/types.ts';

function planStep(id: string, order: number, stay: number): TrailRoutePlanStep {
  return {
    id,
    plan_id: 'plan',
    edition_id: 'edition',
    group_id: 'group',
    station_id: id,
    label: id,
    ideal_order: order,
    stay_minutes: stay,
    travel_minutes: 0,
    is_break: false,
    created_at: '',
    updated_at: '',
  };
}

function executionStep(
  id: string,
  order: number,
  status: TrailRouteExecutionStep['step_status'],
  eta: string,
  stay = 5,
  travel = 0
): TrailRouteExecutionStep {
  return {
    id,
    execution_id: 'execution',
    edition_id: 'edition',
    group_id: 'group',
    plan_step_id: id,
    station_id: id,
    label: id,
    original_order: order,
    live_order: order,
    stay_minutes: stay,
    travel_minutes: travel,
    planned_arrival_at: eta,
    eta_at: eta,
    checked_in_at: status === 'current' ? eta : null,
    checked_out_at: null,
    step_status: status,
    is_break: false,
    created_at: '',
    updated_at: '',
  };
}

test('a rota inicial do Vermelho termina às 17h locais', () => {
  const durations = [5, 10, 30, 30, 30, 30, 40, 40, 30, 10, 20, 25, 30, 15, 35, 30, 30, 20, 20];
  const timeline = calculatePlannedTrailTimeline(
    '2027-03-20T12:00:00.000Z',
    durations.map((duration, index) => planStep(`step-${index}`, index + 1, duration))
  );
  assert.equal(timeline.at(-1)?.plannedDepartureAt.toISOString(), '2027-03-20T20:00:00.000Z');
});

test('um check-in 15 minutos atrasado empurra os próximos ETAs', () => {
  const current = executionStep('campo', 1, 'current', '2027-03-20T12:15:00.000Z', 5);
  current.planned_arrival_at = '2027-03-20T12:00:00.000Z';
  const next = executionStep('procurado', 2, 'pending', '2027-03-20T12:20:00.000Z', 10);
  const timeline = calculateLiveTrailTimeline([current, next], new Date('2027-03-20T12:16:00.000Z'));

  assert.equal(timeline[1].displayArrivalAt.toISOString(), '2027-03-20T12:20:00.000Z');
  assert.equal(calculateScheduleVarianceMinutes(current.checked_in_at!, current.planned_arrival_at), 15);
});

test('o ETA continua avançando enquanto a base atual está estourada', () => {
  const current = executionStep('campo', 1, 'current', '2027-03-20T12:00:00.000Z', 5, 2);
  const next = executionStep('selva', 2, 'pending', '2027-03-20T12:07:00.000Z', 30);
  const timeline = calculateLiveTrailTimeline([current, next], new Date('2027-03-20T12:20:00.000Z'));

  assert.equal(timeline[0].overtimeSeconds, 15 * 60);
  assert.equal(timeline[1].displayArrivalAt.toISOString(), '2027-03-20T12:22:00.000Z');
});

test('reordena a execução sem alterar a lista original', () => {
  const original = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const moved = moveTrailStep(original, 'c', 'b');
  assert.deepEqual(moved.map((item) => item.id), ['a', 'c', 'b']);
  assert.deepEqual(original.map((item) => item.id), ['a', 'b', 'c']);
});

test('formata cronômetros curtos e longos', () => {
  assert.equal(formatRouteClock(65), '01:05');
  assert.equal(formatRouteClock(3661), '01:01:01');
});
