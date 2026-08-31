import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CircleDot,
  Clock3,
  Flag,
  GripVertical,
  MapPinned,
  Move,
  Navigation,
  Play,
  RefreshCw,
  RotateCcw,
  Route,
  Square,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getActiveRetreatEvent } from '../services/eventSettings';
import {
  checkInTrailStep,
  finishTrailRoute,
  listTrailTrafficSnapshot,
  reorderTrailExecution,
  resetTrailRoutes,
  saveTrailGroupTraffic,
  startTrailRoute,
  subscribeToTrailTraffic,
  type SaveTrailTrafficInput,
} from '../services/trailTraffic';
import {
  calculateLiveTrailTimeline,
  calculatePlannedTrailTimeline,
  calculateTrailFinishEta,
  formatRouteClock,
  moveTrailStep,
} from '../services/trailRouteTime';
import { detectTrailConflicts, nearestTrailStation } from '../services/trailTrafficRules';
import type {
  EventServiceUnit,
  RetreatEventSettings,
  TrailGroupTraffic,
  TrailMapConnection,
  TrailMapStation,
  TrailRouteExecution,
  TrailRouteExecutionStep,
  TrailTrafficSnapshot,
} from '../types';

const EMPTY_SNAPSHOT: TrailTrafficSnapshot = {
  stations: [],
  connections: [],
  traffic: [],
  groups: [],
  routePlans: [],
  routePlanSteps: [],
  executions: [],
  executionSteps: [],
};

const RUN_LABELS = {
  waiting: 'Aguardando início',
  active: 'Em trilha',
  finished: 'Finalizado',
};

function formatTime(value?: string | Date | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return 'Sem registro';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function varianceLabel(minutes: number) {
  if (minutes === 0) return 'No horário';
  if (minutes > 0) return `+${minutes} min`;
  return `${minutes} min`;
}

function stationName(stationsById: Map<string, TrailMapStation>, id?: string | null) {
  return id ? stationsById.get(id)?.label || 'Posição livre' : 'Posição livre';
}

function fallbackTraffic(
  editionId: string,
  group: EventServiceUnit,
  groupIndex: number,
  field?: TrailMapStation
): TrailGroupTraffic {
  return {
    id: '',
    edition_id: editionId,
    group_id: group.id,
    station_id: field?.id || null,
    origin_station_id: null,
    destination_station_id: null,
    marker_x: Math.min(95, (field?.x_percent || 48) + groupIndex * 2.2),
    marker_y: Math.min(95, (field?.y_percent || 36) + groupIndex * 2.2),
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
            title={`Confirmar chegada em ${station.label}`}
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
              title={`${group.name} · arraste para reposicionar`}
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

function getRunStatus(execution?: TrailRouteExecution) {
  if (!execution) return 'waiting' as const;
  return execution.run_status;
}

export function TrailTrafficControlView() {
  const [edition, setEdition] = useState<RetreatEventSettings | null>(null);
  const [snapshot, setSnapshot] = useState<TrailTrafficSnapshot>(EMPTY_SNAPSHOT);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [draggedStepId, setDraggedStepId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const refreshTimerRef = useRef<number | null>(null);

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

  const queueRefresh = useCallback((editionId: string) => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      void refreshSnapshot(editionId, true);
      refreshTimerRef.current = null;
    }, 180);
  }, [refreshSnapshot]);

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
    const interval = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
  }, []);

  useEffect(() => {
    if (!edition?.id) return undefined;
    return subscribeToTrailTraffic(
      edition.id,
      () => queueRefresh(edition.id),
      setRealtimeConnected
    );
  }, [edition?.id, queueRefresh]);

  const field = useMemo(
    () => snapshot.stations.find((station) => station.station_key === 'field' || station.station_kind === 'field'),
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
  const plansByGroup = useMemo(
    () => new Map(snapshot.routePlans.map((plan) => [plan.group_id, plan])),
    [snapshot.routePlans]
  );
  const executionsByGroup = useMemo(
    () => new Map(snapshot.executions.map((execution) => [execution.group_id, execution])),
    [snapshot.executions]
  );
  const trafficByGroup = useMemo(() => {
    const rows = new Map(snapshot.traffic.map((item) => [item.group_id, item]));
    snapshot.groups.forEach((group, index) => {
      if (!rows.has(group.id) && edition) rows.set(group.id, fallbackTraffic(edition.id, group, index, field));
    });
    return rows;
  }, [edition, field, snapshot.groups, snapshot.traffic]);

  useEffect(() => {
    if (!selectedGroupId && snapshot.groups[0]) setSelectedGroupId(snapshot.groups[0].id);
  }, [selectedGroupId, snapshot.groups]);

  const selectedGroup = groupsById.get(selectedGroupId);
  const selectedPlan = plansByGroup.get(selectedGroupId);
  const selectedExecution = executionsByGroup.get(selectedGroupId);
  const selectedPlanTimeline = useMemo(() => selectedPlan
    ? calculatePlannedTrailTimeline(
      selectedPlan.starts_at,
      snapshot.routePlanSteps.filter((step) => step.plan_id === selectedPlan.id)
    )
    : [], [selectedPlan, snapshot.routePlanSteps]);
  const selectedLiveTimeline = useMemo(() => selectedExecution
    ? calculateLiveTrailTimeline(
      snapshot.executionSteps.filter((step) => step.execution_id === selectedExecution.id),
      clock
    )
    : [], [clock, selectedExecution, snapshot.executionSteps]);
  const pendingSelectedSteps = selectedLiveTimeline.filter((step) => step.step_status === 'pending');
  const selectedFinishEta = calculateTrailFinishEta(selectedLiveTimeline);

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
    setSuccess('');
  }

  async function performAction(action: () => Promise<unknown>, successMessage: string) {
    if (!edition) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await action();
      await refreshSnapshot(edition.id, true);
      setSuccess(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStart(groupId: string) {
    const groupName = groupsById.get(groupId)?.name || 'Grupo';
    await performAction(() => startTrailRoute(groupId), `${groupName} iniciou no Campo. Cronômetro e ETAs ativados.`);
  }

  async function handleStartAll() {
    const waitingGroups = snapshot.groups.filter((group) => !executionsByGroup.has(group.id));
    if (!waitingGroups.length) {
      setSuccess('Todos os grupos já foram iniciados ou encerrados.');
      return;
    }
    await performAction(
      () => Promise.all(waitingGroups.map((group) => startTrailRoute(group.id))),
      `${waitingGroups.length} grupo(s) iniciado(s) no Campo.`
    );
  }

  async function handleFinish(groupId: string) {
    const groupName = groupsById.get(groupId)?.name || 'Grupo';
    if (!window.confirm(`Encerrar a trilha do grupo ${groupName}? As bases ainda pendentes serão marcadas como puladas.`)) return;
    await performAction(() => finishTrailRoute(groupId), `Trilha do grupo ${groupName} encerrada.`);
  }

  async function handleReset(groupId?: string) {
    const groupName = groupId ? groupsById.get(groupId)?.name || 'Grupo' : '';
    const confirmed = window.confirm(groupId
      ? `Preparar uma nova trilha para o grupo ${groupName}? A execução e os check-ins atuais serão apagados, mas a rota ideal será preservada.`
      : 'Reiniciar a operação de todos os grupos? As execuções e os check-ins atuais serão apagados, mas todas as rotas ideais serão preservadas.');
    if (!confirmed) return;
    await performAction(
      () => resetTrailRoutes(groupId),
      groupId
        ? `${groupName} voltou ao Campo e está pronto para iniciar uma nova trilha.`
        : 'Operação reiniciada. Todos os grupos voltaram ao Campo e aguardam um novo início.'
    );
  }

  async function handleCheckIn(step: TrailRouteExecutionStep) {
    const groupName = groupsById.get(step.group_id)?.name || 'Grupo';
    setSelectedGroupId(step.group_id);
    await performAction(
      () => checkInTrailStep(step.id),
      `${groupName} chegou em ${step.label}. Próximos ETAs recalculados.`
    );
  }

  async function handleReorder(movedId: string, targetId: string) {
    if (!selectedExecution || selectedExecution.run_status !== 'active') return;
    const reordered = moveTrailStep(pendingSelectedSteps, movedId, targetId);
    if (reordered === pendingSelectedSteps) return;
    await performAction(
      () => reorderTrailExecution(selectedExecution.id, reordered.map((step) => step.id)),
      'Rota operacional reordenada. O planejamento ideal foi preservado.'
    );
  }

  async function handleMoveStep(stepId: string, direction: -1 | 1) {
    const index = pendingSelectedSteps.findIndex((step) => step.id === stepId);
    const target = pendingSelectedSteps[index + direction];
    if (target) await handleReorder(stepId, target.id);
  }

  function handleStationClick(station: TrailMapStation) {
    if (!selectedExecution || selectedExecution.run_status !== 'active') {
      setError('Inicie a trilha do grupo selecionado antes de confirmar uma chegada.');
      return;
    }
    const current = selectedLiveTimeline.find((step) => step.step_status === 'current');
    if (current?.station_id === station.id) {
      setSuccess(`${selectedGroup?.name || 'Grupo'} já está em ${station.label}.`);
      return;
    }
    const nextAtStation = pendingSelectedSteps.find((step) => step.station_id === station.id);
    if (!nextAtStation) {
      setError(`${station.label} não está entre as etapas pendentes deste grupo. Arraste o marcador para reposicionar sem avançar a timeline.`);
      return;
    }
    void handleCheckIn(nextAtStation);
  }

  async function persistFreePosition(
    groupId: string,
    xPercent: number,
    yPercent: number,
    station: TrailMapStation | null
  ) {
    if (!edition) return;
    const current = trafficByGroup.get(groupId);
    if (!current) return;
    const input: SaveTrailTrafficInput = {
      edition_id: edition.id,
      group_id: groupId,
      station_id: station?.id || null,
      origin_station_id: current.station_id || current.origin_station_id || null,
      destination_station_id: null,
      marker_x: xPercent,
      marker_y: yPercent,
      movement_status: station ? 'at_station' : 'moving',
      traffic_signal: 'clear',
      delay_minutes: current.delay_minutes,
      notes: station ? `Reposicionamento livre: ${station.label}` : 'Reposicionamento livre no trajeto.',
    };
    await performAction(
      () => saveTrailGroupTraffic(input, current.id || undefined),
      station
        ? `${groupsById.get(groupId)?.name || 'Grupo'} reposicionado em ${station.label}, sem alterar a timeline.`
        : `${groupsById.get(groupId)?.name || 'Grupo'} reposicionado livremente no mapa.`
    );
  }

  function handleDrop(groupId: string, xPercent: number, yPercent: number, station: TrailMapStation | null) {
    setSelectedGroupId(groupId);
    const execution = executionsByGroup.get(groupId);
    if (station && execution?.run_status === 'active') {
      const pending = snapshot.executionSteps
        .filter((step) => step.execution_id === execution.id && step.step_status === 'pending')
        .sort((first, second) => first.live_order - second.live_order)
        .find((step) => step.station_id === station.id);
      if (pending) {
        void handleCheckIn(pending);
        return;
      }
    }
    void persistFreePosition(groupId, xPercent, yPercent, station);
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
          <p className="muted">Confirme a chegada em uma base com um clique. O mapa, o cronômetro e todos os próximos ETAs são atualizados automaticamente.</p>
        </div>
        <div className="trail-header-actions">
          <span className={`trail-live-pill ${realtimeConnected ? 'connected' : ''}`}>
            {realtimeConnected ? <Wifi size={15} /> : <WifiOff size={15} />}
            {realtimeConnected ? 'Tempo real ativo' : 'Conectando'}
          </span>
          <button type="button" className="primary-button" onClick={() => void handleStartAll()} disabled={saving}>
            <Play size={15} /> Iniciar grupos
          </button>
          {snapshot.executions.length > 0 && (
            <button type="button" className="secondary-button danger-button" onClick={() => void handleReset()} disabled={saving}>
              <RotateCcw size={15} /> Reiniciar operação
            </button>
          )}
          <button type="button" className="secondary-button" onClick={() => void refreshSnapshot(edition.id)} disabled={saving}>
            <RefreshCw size={15} /> Atualizar
          </button>
        </div>
      </header>

      {error && <div className="form-message error" role="alert">{error}</div>}
      {success && <div className="form-message success" role="status">{success}</div>}

      <section className="trail-group-overview" aria-label="Situação dos grupos">
        {snapshot.groups.map((group) => {
          const execution = executionsByGroup.get(group.id);
          const runStatus = getRunStatus(execution);
          const liveSteps = execution
            ? calculateLiveTrailTimeline(snapshot.executionSteps.filter((step) => step.execution_id === execution.id), clock)
            : [];
          const current = liveSteps.find((step) => step.step_status === 'current');
          const plan = plansByGroup.get(group.id);
          const traffic = trafficByGroup.get(group.id);
          const finishEta = execution?.run_status === 'finished' ? execution.finished_at : calculateTrailFinishEta(liveSteps);
          const style = { '--group-color': group.color || '#d4a017' } as CSSProperties;
          return (
            <button
              type="button"
              key={group.id}
              className={`trail-group-card ${selectedGroupId === group.id ? 'selected' : ''}`}
              style={style}
              onClick={() => selectGroup(group.id)}
            >
              <span className="trail-group-card-top"><b>{group.name}</b><i>{RUN_LABELS[runStatus]}</i></span>
              <strong><MapPinned size={15} /> {current?.label || stationName(stationsById, traffic?.station_id)}</strong>
              <small>{current ? `${formatRouteClock(current.elapsedSeconds)} na base · previsto ${current.stay_minutes} min` : plan ? `Início ideal ${formatTime(plan.starts_at)}` : 'Rota ideal não cadastrada'}</small>
              <span className="trail-group-card-meta">
                <em>Fim {formatTime(finishEta)}</em>
                {execution && <b className={execution.schedule_variance_minutes <= 0 ? 'on-time' : ''}>{varianceLabel(execution.schedule_variance_minutes)}</b>}
              </span>
            </button>
          );
        })}
      </section>

      <div className="trail-main-grid">
        <section className="trail-map-panel">
          <div className="trail-section-heading">
            <div><p className="eyebrow">Visão do sítio</p><h3>Mapa operacional</h3></div>
            <span><Move size={15} /> Clique na base ou arraste o escudo</span>
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
            onStationClick={handleStationClick}
            onDrop={handleDrop}
          />
        </section>

        <aside className="trail-command-panel trail-timeline-panel">
          <div className="trail-section-heading">
            <div><p className="eyebrow">Rota viva</p><h3>Timeline do percurso</h3></div>
            <Route size={22} />
          </div>

          <label className="trail-group-select">Grupo
            <select value={selectedGroupId} onChange={(event) => selectGroup(event.target.value)}>
              {snapshot.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>

          <div className="trail-timeline-summary">
            <span><Clock3 size={14} /> Início {formatTime(selectedExecution?.started_at || selectedPlan?.starts_at)}</span>
            <span><Flag size={14} /> ETA final {formatTime(selectedExecution?.run_status === 'finished' ? selectedExecution.finished_at : selectedFinishEta || selectedPlanTimeline.at(-1)?.plannedDepartureAt)}</span>
            {selectedExecution && <strong className={selectedExecution.schedule_variance_minutes > 0 ? 'late' : ''}>{varianceLabel(selectedExecution.schedule_variance_minutes)}</strong>}
          </div>

          {!selectedExecution && (
            <button type="button" className="primary-button trail-start-button" disabled={saving || !selectedPlanTimeline.length} onClick={() => void handleStart(selectedGroupId)}>
              <Play size={16} /> Iniciar trilha de {selectedGroup?.name || 'grupo'}
            </button>
          )}
          {selectedExecution?.run_status === 'active' && (
            <button type="button" className="secondary-button danger-button trail-finish-button" disabled={saving} onClick={() => void handleFinish(selectedGroupId)}>
              <Square size={15} /> Encerrar este grupo
            </button>
          )}
          {selectedExecution?.run_status === 'finished' && (
            <button type="button" className="secondary-button trail-reset-button" disabled={saving} onClick={() => void handleReset(selectedGroupId)}>
              <RotateCcw size={15} /> Preparar nova trilha de {selectedGroup?.name || 'grupo'}
            </button>
          )}

          <div className="trail-timeline-list">
            {!selectedExecution && selectedPlanTimeline.map((step, index) => (
              <div key={step.id} className="trail-timeline-step planned">
                <span className="trail-step-index">{index + 1}</span>
                <div className="trail-step-copy"><strong>{step.label}</strong><small>{step.stay_minutes} min na base{step.travel_minutes ? ` · ${step.travel_minutes} min deslocamento` : ''}</small></div>
                <time>{formatTime(step.plannedArrivalAt)}</time>
              </div>
            ))}

            {selectedExecution && selectedLiveTimeline.map((step, index) => {
              const pendingIndex = pendingSelectedSteps.findIndex((pending) => pending.id === step.id);
              const isPending = step.step_status === 'pending';
              return (
                <div
                  key={step.id}
                  className={`trail-timeline-step ${step.step_status} ${step.is_break ? 'break' : ''}`}
                  draggable={isPending && !saving}
                  onDragStart={() => setDraggedStepId(step.id)}
                  onDragEnd={() => setDraggedStepId('')}
                  onDragOver={(event) => { if (isPending) event.preventDefault(); }}
                  onDrop={() => {
                    if (isPending && draggedStepId) void handleReorder(draggedStepId, step.id);
                    setDraggedStepId('');
                  }}
                >
                  <span className="trail-step-index">{step.step_status === 'completed' ? <Check size={13} /> : index + 1}</span>
                  <button
                    type="button"
                    className="trail-step-copy"
                    disabled={!isPending || saving}
                    onClick={() => void handleCheckIn(step)}
                    title={isPending ? `Confirmar chegada em ${step.label}` : undefined}
                  >
                    <strong>{step.label}</strong>
                    <small>
                      {step.step_status === 'current'
                        ? `${formatRouteClock(step.elapsedSeconds)} de ${step.stay_minutes} min`
                        : step.step_status === 'completed'
                          ? `Chegada ${formatTime(step.checked_in_at)} · saída ${formatTime(step.checked_out_at)}`
                          : step.step_status === 'skipped'
                            ? 'Etapa não realizada'
                            : `${step.stay_minutes} min · clique para check-in`}
                    </small>
                  </button>
                  <div className="trail-step-time">
                    <time>{formatTime(step.displayArrivalAt)}</time>
                    {isPending && <small>ideal {formatTime(step.planned_arrival_at)}</small>}
                  </div>
                  {isPending && (
                    <div className="trail-step-order-actions">
                      <GripVertical size={14} aria-hidden="true" />
                      <button type="button" className="icon-button" aria-label={`Mover ${step.label} para cima`} disabled={saving || pendingIndex === 0} onClick={() => void handleMoveStep(step.id, -1)}><ArrowUp size={13} /></button>
                      <button type="button" className="icon-button" aria-label={`Mover ${step.label} para baixo`} disabled={saving || pendingIndex === pendingSelectedSteps.length - 1} onClick={() => void handleMoveStep(step.id, 1)}><ArrowDown size={13} /></button>
                    </div>
                  )}
                </div>
              );
            })}

            {!selectedPlanTimeline.length && !selectedLiveTimeline.length && <p className="muted">Cadastre a rota ideal deste grupo na aba Grupos.</p>}
          </div>
          <p className="trail-timeline-help">A ordem alterada aqui vale somente para a operação atual. O roteiro ideal da aba Grupos permanece intacto.</p>
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
            <div className="trail-all-clear"><Flag size={24} /><div><strong>Percurso sem conflitos detectados</strong><span>As posições são comparadas automaticamente a cada atualização.</span></div></div>
          )}
        </section>

        <section className="trail-history-panel trail-timers-panel">
          <div className="trail-section-heading">
            <div><p className="eyebrow">Registro operacional</p><h3>Cronômetros das bases</h3></div>
            <Timer size={22} />
          </div>
          <div className="trail-base-timers">
            {snapshot.groups.map((group) => {
              const execution = executionsByGroup.get(group.id);
              const liveSteps = execution
                ? calculateLiveTrailTimeline(snapshot.executionSteps.filter((step) => step.execution_id === execution.id), clock)
                : [];
              const current = liveSteps.find((step) => step.step_status === 'current');
              const finishEta = execution?.run_status === 'finished' ? execution.finished_at : calculateTrailFinishEta(liveSteps);
              const progress = current ? Math.min(100, (current.elapsedSeconds / Math.max(1, current.stay_minutes * 60)) * 100) : 0;
              const isOvertime = Boolean(current?.overtimeSeconds);
              const style = { '--group-color': group.color || '#d4a017', '--timer-progress': `${progress}%` } as CSSProperties;
              return (
                <button type="button" key={group.id} className={`trail-timer-card ${isOvertime ? 'overtime' : ''}`} style={style} onClick={() => selectGroup(group.id)}>
                  <span className="trail-timer-title"><b>{group.name}</b><em>{RUN_LABELS[getRunStatus(execution)]}</em></span>
                  {current ? <>
                    <strong>{current.label}</strong>
                    <time>{formatRouteClock(current.elapsedSeconds)}</time>
                    <span className="trail-timer-progress"><i /></span>
                    <small>{isOvertime ? `${formatRouteClock(current.overtimeSeconds)} além do previsto` : `${formatRouteClock(current.remainingSeconds)} restantes`} · base {current.stay_minutes} min</small>
                  </> : execution?.run_status === 'finished' ? <>
                    <strong>Trilha encerrada</strong>
                    <time>{formatTime(execution.finished_at)}</time>
                    <small>Conclusão registrada em {formatDateTime(execution.finished_at)}</small>
                  </> : <>
                    <strong>Aguardando no Campo</strong>
                    <time>00:00</time>
                    <small>O cronômetro começa ao iniciar a trilha.</small>
                  </>}
                  <span className="trail-timer-eta"><Clock3 size={12} /> ETA final {formatTime(finishEta)}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
