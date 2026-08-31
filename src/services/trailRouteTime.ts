import type { TrailRouteExecutionStep, TrailRoutePlanStep } from '../types';

export interface PlannedTrailStep extends TrailRoutePlanStep {
  plannedArrivalAt: Date;
  plannedDepartureAt: Date;
}

export interface LiveTrailStep extends TrailRouteExecutionStep {
  displayArrivalAt: Date;
  displayDepartureAt: Date;
  elapsedSeconds: number;
  remainingSeconds: number;
  overtimeSeconds: number;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

export function calculatePlannedTrailTimeline(
  startsAt: string | Date,
  steps: TrailRoutePlanStep[]
): PlannedTrailStep[] {
  let cursor = new Date(startsAt);
  return [...steps]
    .sort((first, second) => first.ideal_order - second.ideal_order)
    .map((step) => {
      const plannedArrivalAt = new Date(cursor);
      const plannedDepartureAt = addMinutes(plannedArrivalAt, step.stay_minutes);
      cursor = addMinutes(plannedDepartureAt, step.travel_minutes);
      return { ...step, plannedArrivalAt, plannedDepartureAt };
    });
}

export function calculateLiveTrailTimeline(
  steps: TrailRouteExecutionStep[],
  now: Date
): LiveTrailStep[] {
  const ordered = [...steps].sort((first, second) => first.live_order - second.live_order);
  const currentIndex = ordered.findIndex((step) => step.step_status === 'current');
  let futureCursor: Date | null = null;

  return ordered.map((step, index) => {
    const persistedArrival = new Date(step.checked_in_at || step.eta_at);
    let displayArrivalAt = persistedArrival;
    let displayDepartureAt = addMinutes(displayArrivalAt, step.stay_minutes);

    if (step.step_status === 'completed') {
      displayDepartureAt = new Date(step.checked_out_at || displayDepartureAt);
    } else if (step.step_status === 'current') {
      const expectedDeparture = addMinutes(displayArrivalAt, step.stay_minutes);
      displayDepartureAt = expectedDeparture;
      const operationalDeparture = now > expectedDeparture ? now : expectedDeparture;
      futureCursor = addMinutes(operationalDeparture, step.travel_minutes);
    } else if (step.step_status === 'pending' && currentIndex >= 0 && index > currentIndex && futureCursor) {
      displayArrivalAt = new Date(futureCursor);
      displayDepartureAt = addMinutes(displayArrivalAt, step.stay_minutes);
      futureCursor = addMinutes(displayDepartureAt, step.travel_minutes);
    } else {
      displayArrivalAt = new Date(step.eta_at);
      displayDepartureAt = addMinutes(displayArrivalAt, step.stay_minutes);
    }

    const elapsedSeconds = step.checked_in_at
      ? Math.max(0, Math.floor((now.getTime() - new Date(step.checked_in_at).getTime()) / 1000))
      : 0;
    const plannedSeconds = step.stay_minutes * 60;
    return {
      ...step,
      displayArrivalAt,
      displayDepartureAt,
      elapsedSeconds,
      remainingSeconds: Math.max(0, plannedSeconds - elapsedSeconds),
      overtimeSeconds: Math.max(0, elapsedSeconds - plannedSeconds),
    };
  });
}

export function calculateTrailFinishEta(steps: LiveTrailStep[]) {
  const unfinished = steps.filter((step) => step.step_status !== 'skipped');
  return unfinished.length ? unfinished[unfinished.length - 1].displayDepartureAt : null;
}

export function calculateScheduleVarianceMinutes(actual: string | Date, planned: string | Date) {
  return Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 60_000);
}

export function formatRouteClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function moveTrailStep<T extends { id: string }>(items: T[], movedId: string, targetId: string) {
  const fromIndex = items.findIndex((item) => item.id === movedId);
  const toIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
