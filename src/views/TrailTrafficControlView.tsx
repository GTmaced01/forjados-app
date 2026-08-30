import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertTriangle,
  CircleDot,
  Clock3,
  Flag,
  History,
  MapPinned,
  Move,
  Navigation,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  Route,
  Save,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getActiveRetreatEvent } from '../services/eventSettings';
import {
  listTrailTrafficSnapshot,
  saveTrailGroupTraffic,
  subscribeToTrailTraffic,
  type SaveTrailTrafficInput,
} from '../services/trailTraffic';
import { detectTrailConflicts, nearestTrailStation } from '../services/trailTrafficRules';
import type {
  EventServiceSlot,
  EventServiceUnit,
  RetreatEventSettings,
  TrailGroupTraffic,
  TrailMapConnection,
  TrailMapStation,
  TrailMovementStatus,
  TrailTrafficSignal,
  TrailTrafficSnapshot,
} from '../types';

const EMPTY_SNAPSHOT: TrailTrafficSnapshot = {
  stations: [],
  connections: [],
  traffic: [],
  history: [],
  groups: [],
  slots: [],
};

const STATUS_LABELS: Record<TrailMovementStatus, string> = {
  not_started: 'Não iniciou',
  at_station: 'Na estação',
  moving: 'Em trajeto',
  holding: 'Aguardando',
  delayed: 'Atrasado',
  finished: 'Finalizado',
};

const SIGNAL_LABELS: Record<TrailTrafficSignal, string> = {
  clear: 'Via liberada',
  hold: 'Segurar grupo',
  attention: 'Atenção',
};

interface TrafficDraft {
  stationId: string;
  destinationStationId: string;
  movementStatus: TrailMovementStatus;
  trafficSignal: TrailTrafficSignal;
  delayMinutes: number;
  notes: string;
}

function formatTime(value?: string | null) {
  if (!value) return 'Sem registro';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatSlotTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function stationName(stationsById: Map<string, TrailMapStation>, id?: string | null) {
  return id ? stationsById.get(id)?.label || 'Posição livre no mapa' : 'Posição livre no mapa';
}

function trafficPositionLabel(
  stationsById: Map<string, TrailMapStation>,
  traffic: Pick<TrailGroupTraffic, 'station_id' | 'origin_station_id' | 'destination_station_id' | 'movement_status'>
) {
  if (traffic.movement_status === 'moving' && traffic.destination_station_id) {
    return `${stationName(stationsById, traffic.origin_station_id)} → ${stationName(stationsById, traffic.destination_station_id)}`;
  }
  return stationName(stationsById, traffic.station_id);
}

function getGroupPlan(groupId: string, slots: EventServiceSlot[], now: Date) {
  const groupSlots = slots.filter((slot) => slot.unit_id === groupId);
  return groupSlots.find((slot) => new Date(slot.starts_at) <= now && new Date(slot.ends_at) >= now)
    || groupSlots.find((slot) => new Date(slot.starts_at) > now)
    || null;
}

function buildDraft(traffic: TrailGroupTraffic): TrafficDraft {
  return {
    stationId: traffic.station_id || traffic.origin_station_id || '',
    destinationStationId: traffic.destination_station_id || '',
    movementStatus: traffic.movement_status,
    trafficSignal: traffic.traffic_signal,
    delayMinutes: traffic.delay_minutes,
    notes: traffic.notes,
  };
}

function fallbackTraffic(
  editionId: string,
  group: EventServiceUnit,
  groupIndex: number,
  gate?: TrailMapStation
): TrailGroupTraffic {
  return {
    id: '',
    edition_id: editionId,
    group_id: group.id,
    station_id: gate?.id || null,
    origin_station_id: null,
    destination_station_id: null,
    marker_x: Math.min(95, (gate?.x_percent || 6) + groupIndex * 2.2),
    marker_y: Math.min(95, (gate?.y_percent || 40) + groupIndex * 2.2),
    movement_status: 'not_started',
    traffic_signal: 'clear',
    delay_minutes: 0,
    notes: '',
    updated_by: null,
    updated_by_name: 'Sistema',
    created_at: '',
    updated_at: '',
  };
}

function TrailMapCanvas({
  stations,
  connections,
  groups,
  trafficByGroup,
  selectedGroupId,
  conflictGroupIds,
  conflictStationIds,
  disabled,
  onSelectGroup,
  onStationClick,
  onDrop,
}: {
  stations: TrailMapStation[];
  connections: TrailMapConnection[];
  groups: EventServiceUnit[];
  trafficByGroup: Map<string, TrailGroupTraffic>;
  selectedGroupId: string;
  conflictGroupIds: Set<string>;
  conflictStationIds: Set<string>;
  disabled: boolean;
  onSelectGroup: (groupId: string) => void;
  onStationClick: (station: TrailMapStation) => void;
  onDrop: (groupId: string, xPercent: number, yPercent: number, station: TrailMapStation | null) => void;
}) {
  const stationsById = useMemo(() => new Map(stations.map((station) => [station.id, station])), [stations]);
  const [drag, setDrag] = useState<{
    groupId: string;
    pointerId: number;
    rect: DOMRect;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, groupId: string) {
    if (disabled) return;
    const canvas = event.currentTarget.closest('.trail-map-canvas');
    if (!(canvas instanceof HTMLElement)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const traffic = trafficByGroup.get(groupId);
    setDrag({
      groupId,
      pointerId: event.pointerId,
      rect: canvas.getBoundingClientRect(),
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      x: traffic?.marker_x || 0,
      y: traffic?.marker_y || 0,
    });
    onSelectGroup(groupId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = Math.min(98, Math.max(2, ((event.clientX - drag.rect.left) / drag.rect.width) * 100));
    const y = Math.min(96, Math.max(4, ((event.clientY - drag.rect.top) / drag.rect.height) * 100));
    setDrag((current) => current ? {
      ...current,
      x,
      y,
      moved: current.moved || Math.hypot(
        event.clientX - current.startClientX,
        event.clientY - current.startClientY
      ) > 4,
    } : null);
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      const snappedStation = nearestTrailStation(stations, drag.x, drag.y);
      onDrop(
        drag.groupId,
        snappedStation?.x_percent ?? drag.x,
        snappedStation?.y_percent ?? drag.y,
        snappedStation
      );
    }
    setDrag(null);
  }

  return (
    <div className="trail-map-scroll">
      <div className="trail-map-canvas" aria-label="Mapa interativo do percurso das trilhas">
        <div className="trail-map-terrain trail-map-terrain-one" />
        <div className="trail-map-terrain trail-map-terrain-two" />
        <div className="trail-map-field"><span>CAMPO CENTRAL</span></div>
        <svg className="trail-map-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="trail-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" />
            </marker>
          </defs>
          {connections.map((connection) => {
            const from = stationsById.get(connection.from_station_id);
            const to = stationsById.get(connection.to_station_id);
            if (!from || !to) return null;
            const className = `trail-route-line ${connection.connection_kind}`;
            return (
              <g key={connection.id}>
                <line className={`${className} glow`} x1={from.x_percent} y1={from.y_percent} x2={to.x_percent} y2={to.y_percent} />
                <line className={className} x1={from.x_percent} y1={from.y_percent} x2={to.x_percent} y2={to.y_percent} markerStart="url(#trail-arrow)" markerEnd="url(#trail-arrow)" />
              </g>
            );
          })}
        </svg>

        <div className="trail-map-compass" aria-hidden="true"><Navigation size={16} /><span>N</span></div>
        <div className="trail-map-legend" aria-hidden="true"><span /> Percurso físico <i /> Conexão operacional</div>

        {stations.map((station) => (
          <button
            type="button"
            key={station.id}
            className={`trail-station ${station.station_kind} ${conflictStationIds.has(station.id) ? 'conflict' : ''}`}
            style={{ left: `${station.x_percent}%`, top: `${station.y_percent}%` }}
            onClick={() => onStationClick(station)}
            title={`Selecionar ${station.label}`}
          >
            <span>{station.short_label || station.label}</span>
          </button>
        ))}

        {groups.map((group) => {
          const traffic = trafficByGroup.get(group.id);
          if (!traffic) return null;
          const markerX = drag?.groupId === group.id ? drag.x : traffic.marker_x;
          const markerY = drag?.groupId === group.id ? drag.y : traffic.marker_y;
          const markerStyle = {
            left: `${markerX}%`,
            top: `${markerY}%`,
            '--group-color': group.color || '#d4a017',
          } as CSSProperties;
          return (
            <button
              type="button"
              key={group.id}
              className={`trail-group-marker ${selectedGroupId === group.id ? 'selected' : ''} ${conflictGroupIds.has(group.id) ? 'conflict' : ''}`}
              style={markerStyle}
              onClick={() => onSelectGroup(group.id)}
              onPointerDown={(event) => startDrag(event, group.id)}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={() => setDrag(null)}
              aria-label={`Mover grupo ${group.name}`}
              title={`${group.name} · arraste para atualizar`}
            >
              <span>{group.name.slice(0, 1)}</span>
              <small>{group.name}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TrailTrafficControlView() {
  const [edition, setEdition] = useState<RetreatEventSettings | null>(null);
  const [snapshot, setSnapshot] = useState<TrailTrafficSnapshot>(EMPTY_SNAPSHOT);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [draft, setDraft] = useState<TrafficDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clock, setClock] = useState(() => new Date());

  const refreshSnapshot = useCallback(async (editionId: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await listTrailTrafficSnapshot(editionId);
      setSnapshot(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o tráfego das trilhas.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const activeEdition = await getActiveRetreatEvent();
      setEdition(activeEdition);
      if (activeEdition) await refreshSnapshot(activeEdition.id, true);
      else setSnapshot(EMPTY_SNAPSHOT);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o painel de tráfego.');
    } finally {
      setLoading(false);
    }
  }, [refreshSnapshot]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!edition?.id) return undefined;
    return subscribeToTrailTraffic(
      edition.id,
      () => void refreshSnapshot(edition.id, true),
      setRealtimeConnected
    );
  }, [edition?.id, refreshSnapshot]);

  const gate = useMemo(
    () => snapshot.stations.find((station) => station.station_key === 'main_gate'),
    [snapshot.stations]
  );
  const stationsById = useMemo(
    () => new Map(snapshot.stations.map((station) => [station.id, station])),
    [snapshot.stations]
  );
  const groupsById = useMemo(
    () => new Map(snapshot.groups.map((group) => [group.id, group])),
    [snapshot.groups]
  );
  const trafficByGroup = useMemo(() => {
    const rows = new Map(snapshot.traffic.map((item) => [item.group_id, item]));
    snapshot.groups.forEach((group, index) => {
      if (!rows.has(group.id) && edition) rows.set(group.id, fallbackTraffic(edition.id, group, index, gate));
    });
    return rows;
  }, [edition, gate, snapshot.groups, snapshot.traffic]);

  useEffect(() => {
    if (!selectedGroupId && snapshot.groups[0]) setSelectedGroupId(snapshot.groups[0].id);
  }, [selectedGroupId, snapshot.groups]);

  const selectedTraffic = selectedGroupId ? trafficByGroup.get(selectedGroupId) : undefined;
  useEffect(() => {
    if (selectedTraffic) setDraft(buildDraft(selectedTraffic));
  }, [selectedGroupId, selectedTraffic?.updated_at]);

  const conflicts = useMemo(
    () => detectTrailConflicts(snapshot.groups, Array.from(trafficByGroup.values()), snapshot.stations),
    [snapshot.groups, snapshot.stations, trafficByGroup]
  );
  const conflictGroupIds = useMemo(
    () => new Set(conflicts.flatMap((conflict) => conflict.groupIds)),
    [conflicts]
  );
  const conflictStationIds = useMemo(
    () => new Set(conflicts.flatMap((conflict) => conflict.stationId ? [conflict.stationId] : [])),
    [conflicts]
  );

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    const traffic = trafficByGroup.get(groupId);
    if (traffic) setDraft(buildDraft(traffic));
    setSuccess('');
  }

  function selectStation(station: TrailMapStation) {
    if (!selectedGroupId) return;
    setDraft((current) => current ? {
      ...current,
      stationId: station.id,
      destinationStationId: '',
      movementStatus: 'at_station',
    } : current);
  }

  async function persistTraffic(input: SaveTrailTrafficInput, trafficId?: string, message?: string) {
    setSaving(true);
    setError('');
    try {
      const saved = await saveTrailGroupTraffic(input, trafficId);
      setSnapshot((current) => ({
        ...current,
        traffic: [...current.traffic.filter((item) => item.group_id !== saved.group_id), saved],
      }));
      if (message) setSuccess(message);
      if (edition) await refreshSnapshot(edition.id, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a posição do grupo.');
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!edition || !selectedTraffic || !draft) return;
    const currentStation = stationsById.get(draft.stationId);
    const destination = stationsById.get(draft.destinationStationId);
    const isMoving = draft.movementStatus === 'moving';
    let markerX = selectedTraffic.marker_x;
    let markerY = selectedTraffic.marker_y;
    if (isMoving && currentStation && destination) {
      markerX = (currentStation.x_percent + destination.x_percent) / 2;
      markerY = (currentStation.y_percent + destination.y_percent) / 2;
    } else if (currentStation) {
      markerX = currentStation.x_percent;
      markerY = currentStation.y_percent;
    }
    await persistTraffic({
      edition_id: edition.id,
      group_id: selectedTraffic.group_id,
      station_id: isMoving ? null : draft.stationId || null,
      origin_station_id: isMoving
        ? draft.stationId || selectedTraffic.station_id || selectedTraffic.origin_station_id || null
        : selectedTraffic.station_id || selectedTraffic.origin_station_id || null,
      destination_station_id: isMoving ? draft.destinationStationId || null : null,
      marker_x: markerX,
      marker_y: markerY,
      movement_status: draft.movementStatus,
      traffic_signal: draft.trafficSignal,
      delay_minutes: draft.delayMinutes,
      notes: draft.notes,
    }, selectedTraffic.id || undefined, 'Posição atualizada e compartilhada em tempo real.');
  }

  async function quickSignal(signal: TrailTrafficSignal) {
    if (!edition || !selectedTraffic) return;
    const movementStatus = signal === 'hold'
      ? 'holding'
      : signal === 'attention'
        ? 'delayed'
        : selectedTraffic.movement_status === 'holding' || selectedTraffic.movement_status === 'delayed'
          ? 'at_station'
          : selectedTraffic.movement_status;
    await persistTraffic({
      edition_id: edition.id,
      group_id: selectedTraffic.group_id,
      station_id: selectedTraffic.station_id || null,
      origin_station_id: selectedTraffic.origin_station_id || null,
      destination_station_id: selectedTraffic.destination_station_id || null,
      marker_x: selectedTraffic.marker_x,
      marker_y: selectedTraffic.marker_y,
      movement_status: movementStatus,
      traffic_signal: signal,
      delay_minutes: selectedTraffic.delay_minutes,
      notes: draft?.notes || selectedTraffic.notes,
    }, selectedTraffic.id || undefined, `${SIGNAL_LABELS[signal]} para ${groupsById.get(selectedTraffic.group_id)?.name || 'o grupo'}.`);
  }

  async function dropGroup(groupId: string, xPercent: number, yPercent: number, station: TrailMapStation | null) {
    if (!edition) return;
    const current = trafficByGroup.get(groupId);
    if (!current) return;
    await persistTraffic({
      edition_id: edition.id,
      group_id: groupId,
      station_id: station?.id || null,
      origin_station_id: current.station_id || current.origin_station_id || null,
      destination_station_id: station ? null : current.destination_station_id || null,
      marker_x: xPercent,
      marker_y: yPercent,
      movement_status: station ? 'at_station' : 'moving',
      traffic_signal: current.traffic_signal,
      delay_minutes: current.delay_minutes,
      notes: current.notes,
    }, current.id || undefined, station
      ? `${groupsById.get(groupId)?.name || 'Grupo'} chegou em ${station.label}.`
      : `${groupsById.get(groupId)?.name || 'Grupo'} reposicionado no trajeto.`);
  }

  if (loading) {
    return <div className="panel wide center" role="status"><div className="loader" /><p className="muted">Abrindo central de comando...</p></div>;
  }

  if (!edition) {
    return <section className="panel wide"><h2>Tráfego de Trilhas</h2><p className="muted">Defina uma edição ativa para utilizar o mapa operacional.</p></section>;
  }

  return (
    <div className="trail-control-page">
      <header className="trail-control-header">
        <div>
          <p className="eyebrow">Central de comando · {edition.title}</p>
          <h2>Painel de Tráfego de Trilhas</h2>
          <p className="muted">Arraste os grupos pelo mapa ou use os controles para atualizar a operação recebida pelo rádio.</p>
        </div>
        <div className="trail-header-actions">
          <span className={`trail-live-pill ${realtimeConnected ? 'connected' : ''}`}>
            {realtimeConnected ? <Wifi size={15} /> : <WifiOff size={15} />}
            {realtimeConnected ? 'Tempo real ativo' : 'Conectando'}
          </span>
          <button type="button" className="secondary-button" onClick={() => void refreshSnapshot(edition.id)} disabled={saving}>
            <RefreshCw size={15} /> Atualizar
          </button>
        </div>
      </header>

      {error && <div className="form-message error" role="alert">{error}</div>}
      {success && <div className="form-message success" role="status">{success}</div>}

      <section className="trail-group-overview" aria-label="Situação dos grupos">
        {snapshot.groups.map((group) => {
          const traffic = trafficByGroup.get(group.id);
          if (!traffic) return null;
          const plan = getGroupPlan(group.id, snapshot.slots, clock);
          const style = { '--group-color': group.color || '#d4a017' } as CSSProperties;
          return (
            <button
              type="button"
              key={group.id}
              className={`trail-group-card ${selectedGroupId === group.id ? 'selected' : ''} signal-${traffic.traffic_signal}`}
              style={style}
              onClick={() => selectGroup(group.id)}
            >
              <span className="trail-group-card-top"><b>{group.name}</b><i>{STATUS_LABELS[traffic.movement_status]}</i></span>
              <strong><MapPinned size={15} /> {trafficPositionLabel(stationsById, traffic)}</strong>
              <small>{plan ? `${formatSlotTime(plan.starts_at)} · ${plan.title}` : 'Sem horário de grupo cadastrado'}</small>
              <span className="trail-group-card-meta">
                <em>{SIGNAL_LABELS[traffic.traffic_signal]}</em>
                {traffic.delay_minutes > 0 && <b>+{traffic.delay_minutes} min</b>}
              </span>
            </button>
          );
        })}
      </section>

      <div className="trail-main-grid">
        <section className="trail-map-panel">
          <div className="trail-section-heading">
            <div><p className="eyebrow">Visão do sítio</p><h3>Mapa operacional</h3></div>
            <span><Move size={15} /> Arraste os escudos</span>
          </div>
          <TrailMapCanvas
            stations={snapshot.stations}
            connections={snapshot.connections}
            groups={snapshot.groups}
            trafficByGroup={trafficByGroup}
            selectedGroupId={selectedGroupId}
            conflictGroupIds={conflictGroupIds}
            conflictStationIds={conflictStationIds}
            disabled={saving}
            onSelectGroup={selectGroup}
            onStationClick={selectStation}
            onDrop={(groupId, x, y, station) => void dropGroup(groupId, x, y, station)}
          />
        </section>

        <aside className="trail-command-panel">
          <div className="trail-section-heading">
            <div><p className="eyebrow">Operação por rádio</p><h3>Comando rápido</h3></div>
            <Radio size={22} />
          </div>

          {draft && selectedTraffic && (
            <div className="trail-command-form">
              <label>Grupo
                <select value={selectedGroupId} onChange={(event) => selectGroup(event.target.value)}>
                  {snapshot.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>

              <div className="trail-radio-actions">
                <button type="button" className="clear" disabled={saving} onClick={() => void quickSignal('clear')}><PlayCircle size={16} /> Liberar</button>
                <button type="button" className="hold" disabled={saving} onClick={() => void quickSignal('hold')}><PauseCircle size={16} /> Segurar</button>
                <button type="button" className="attention" disabled={saving} onClick={() => void quickSignal('attention')}><ShieldAlert size={16} /> Atenção</button>
              </div>

              <label>Posição / última base
                <select value={draft.stationId} onChange={(event) => setDraft({ ...draft, stationId: event.target.value })}>
                  <option value="">Posição livre no mapa</option>
                  {snapshot.stations.map((station) => <option key={station.id} value={station.id}>{station.label}</option>)}
                </select>
              </label>

              <label>Situação
                <select value={draft.movementStatus} onChange={(event) => setDraft({ ...draft, movementStatus: event.target.value as TrailMovementStatus })}>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              {draft.movementStatus === 'moving' && (
                <label>Destino do trajeto
                  <select value={draft.destinationStationId} onChange={(event) => setDraft({ ...draft, destinationStationId: event.target.value })}>
                    <option value="">Destino ainda não informado</option>
                    {snapshot.stations.filter((station) => station.id !== draft.stationId).map((station) => <option key={station.id} value={station.id}>{station.label}</option>)}
                  </select>
                </label>
              )}

              <div className="trail-form-row">
                <label>Sinal
                  <select value={draft.trafficSignal} onChange={(event) => setDraft({ ...draft, trafficSignal: event.target.value as TrailTrafficSignal })}>
                    {Object.entries(SIGNAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>Atraso (min)
                  <input type="number" min="0" max="720" value={draft.delayMinutes} onChange={(event) => setDraft({ ...draft, delayMinutes: Number(event.target.value) })} />
                </label>
              </div>

              <label>Observação para o QG
                <textarea rows={3} maxLength={1000} placeholder="Ex.: invisível informou fila na ponte" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
              </label>

              <button type="button" className="primary-button trail-save-button" onClick={() => void saveDraft()} disabled={saving}>
                <Save size={16} /> {saving ? 'Transmitindo...' : 'Atualizar posição'}
              </button>
              <small className="muted">Última informação: {formatTime(selectedTraffic.updated_at)} · {selectedTraffic.updated_by_name}</small>
            </div>
          )}
        </aside>
      </div>

      <div className="trail-bottom-grid">
        <section className="trail-alert-panel">
          <div className="trail-section-heading">
            <div><p className="eyebrow">Prevenção de gargalos</p><h3>Alertas de conflito</h3></div>
            <AlertTriangle size={22} />
          </div>
          {conflicts.length ? (
            <div className="trail-alert-list">
              {conflicts.map((conflict) => (
                <button type="button" key={conflict.id} className={conflict.severity} onClick={() => selectGroup(conflict.groupIds[0])}>
                  {conflict.kind === 'segment' ? <Route size={18} /> : conflict.kind === 'station' ? <CircleDot size={18} /> : <Navigation size={18} />}
                  <span><strong>{conflict.title}</strong><small>{conflict.description}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="trail-all-clear"><Flag size={24} /><div><strong>Percurso sem conflitos detectados</strong><span>Continue atualizando as posições conforme os relatos do rádio.</span></div></div>
          )}
        </section>

        <section className="trail-history-panel">
          <div className="trail-section-heading">
            <div><p className="eyebrow">Registro operacional</p><h3>Últimas movimentações</h3></div>
            <History size={22} />
          </div>
          <div className="trail-history-list">
            {snapshot.history.slice(0, 16).map((entry) => (
              <div key={entry.id}>
                <span className="trail-history-dot" style={{ background: groupsById.get(entry.group_id)?.color || '#d4a017' }} />
                <div>
                  <strong>{groupsById.get(entry.group_id)?.name || 'Grupo'} · {STATUS_LABELS[entry.movement_status]}</strong>
                  <small>{trafficPositionLabel(stationsById, entry)}</small>
                  <em><Clock3 size={12} /> {formatTime(entry.changed_at)} · {entry.changed_by_name}</em>
                </div>
              </div>
            ))}
            {!snapshot.history.length && <p className="muted">As primeiras atualizações aparecerão aqui.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
