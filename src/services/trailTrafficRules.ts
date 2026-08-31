import type {
  EventServiceUnit,
  TrailGroupTraffic,
  TrailMapStation,
} from '../types';

export interface TrailConflict {
  id: string;
  kind: 'station' | 'segment' | 'arrival' | 'proximity';
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  groupIds: string[];
  stationId?: string;
}

const INACTIVE_STATUSES = new Set<TrailGroupTraffic['movement_status']>([
  'not_started',
  'finished',
]);

function pairKey(first?: string | null, second?: string | null) {
  if (!first || !second || first === second) return '';
  return [first, second].sort().join(':');
}

function groupNames(groupIds: string[], groupsById: Map<string, EventServiceUnit>) {
  return groupIds.map((id) => groupsById.get(id)?.name || 'Grupo').join(' e ');
}

export function detectTrailConflicts(
  groups: EventServiceUnit[],
  traffic: TrailGroupTraffic[],
  stations: TrailMapStation[]
): TrailConflict[] {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const activeTraffic = traffic.filter((item) => !INACTIVE_STATUSES.has(item.movement_status));
  const conflicts: TrailConflict[] = [];

  const byStation = new Map<string, TrailGroupTraffic[]>();
  activeTraffic.forEach((item) => {
    if (!item.station_id || item.movement_status === 'moving') return;
    byStation.set(item.station_id, [...(byStation.get(item.station_id) || []), item]);
  });
  byStation.forEach((items, stationId) => {
    if (items.length < 2) return;
    const station = stationsById.get(stationId);
    if (station && ['field', 'qg', 'gate', 'hold'].includes(station.station_kind)) return;
    const groupIds = items.map((item) => item.group_id);
    const stationName = station?.label || 'uma estação';
    conflicts.push({
      id: `station-${stationId}`,
      kind: 'station',
      severity: 'critical',
      title: `Conflito em ${stationName}`,
      description: `${groupNames(groupIds, groupsById)} estão na mesma estação.`,
      groupIds,
      stationId,
    });
  });

  const bySegment = new Map<string, TrailGroupTraffic[]>();
  activeTraffic.forEach((item) => {
    if (item.movement_status !== 'moving') return;
    const key = pairKey(item.origin_station_id, item.destination_station_id);
    if (key) bySegment.set(key, [...(bySegment.get(key) || []), item]);
  });
  bySegment.forEach((items, key) => {
    if (items.length < 2) return;
    const [firstId, secondId] = key.split(':');
    const first = stationsById.get(firstId)?.short_label || stationsById.get(firstId)?.label || 'origem';
    const second = stationsById.get(secondId)?.short_label || stationsById.get(secondId)?.label || 'destino';
    const groupIds = items.map((item) => item.group_id);
    conflicts.push({
      id: `segment-${key}`,
      kind: 'segment',
      severity: 'critical',
      title: 'Grupos no mesmo trajeto',
      description: `${groupNames(groupIds, groupsById)} estão entre ${first} e ${second}.`,
      groupIds,
    });
  });

  for (const first of activeTraffic) {
    if (first.movement_status !== 'moving' || !first.destination_station_id) continue;
    for (const second of activeTraffic) {
      if (second.group_id === first.group_id) continue;
      const secondTarget = second.movement_status === 'moving'
        ? second.destination_station_id
        : second.station_id;
      if (secondTarget !== first.destination_station_id) continue;
      if (conflicts.some((conflict) => (
        conflict.groupIds.includes(first.group_id)
        && conflict.groupIds.includes(second.group_id)
      ))) continue;
      const groupIds = [first.group_id, second.group_id];
      const destination = stationsById.get(first.destination_station_id)?.label || 'a próxima estação';
      conflicts.push({
        id: `arrival-${[...groupIds].sort().join(':')}`,
        kind: 'arrival',
        severity: 'warning',
        title: `Chegada concorrente em ${destination}`,
        description: `${groupNames(groupIds, groupsById)} podem se encontrar no destino.`,
        groupIds,
        stationId: first.destination_station_id,
      });
    }
  }

  for (let firstIndex = 0; firstIndex < activeTraffic.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < activeTraffic.length; secondIndex += 1) {
      const first = activeTraffic[firstIndex];
      const second = activeTraffic[secondIndex];
      if (first.station_id && first.station_id === second.station_id) continue;
      if (conflicts.some((conflict) => (
        conflict.groupIds.includes(first.group_id)
        && conflict.groupIds.includes(second.group_id)
      ))) continue;
      const distance = Math.hypot(first.marker_x - second.marker_x, first.marker_y - second.marker_y);
      if (distance >= 6.5) continue;
      const groupIds = [first.group_id, second.group_id];
      conflicts.push({
        id: `proximity-${[...groupIds].sort().join(':')}`,
        kind: 'proximity',
        severity: 'warning',
        title: 'Grupos muito próximos',
        description: `${groupNames(groupIds, groupsById)} estão em áreas vizinhas do mapa.`,
        groupIds,
      });
    }
  }

  return conflicts;
}

export function nearestTrailStation(
  stations: TrailMapStation[],
  xPercent: number,
  yPercent: number,
  threshold = 7
) {
  let nearest: TrailMapStation | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const station of stations) {
    const distance = Math.hypot(station.x_percent - xPercent, station.y_percent - yPercent);
    if (distance < nearestDistance) {
      nearest = station;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= threshold ? nearest : null;
}
