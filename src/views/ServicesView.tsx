import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Search, ShieldCheck, UserRoundCheck, UsersRound } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { getActiveRetreatEvent } from '../services/eventSettings';
import { listEventServicesSnapshot } from '../services/eventServices';
import { listPublishedServiceScaleAssignments } from '../services/serviceScale';
import type {
  EventServiceAssignment,
  EventServicesSnapshot,
  EventServiceUnit,
  EventServiceUnitType,
  PublishedServiceScaleAssignment,
  RetreatEventSettings,
  ServiceScaleType,
} from '../types';

const TYPE_LABELS: Record<EventServiceUnitType, string> = {
  character: 'Personagens',
  sector: 'Setores',
  location: 'Oficinas / locais',
  group: 'Grupos',
  scale: 'Escalas',
};

const TYPE_ORDER: EventServiceUnitType[] = ['character', 'sector', 'location', 'scale', 'group'];

const SCALE_TYPE_LABELS: Record<ServiceScaleType, string> = {
  accommodation: 'Alojamento',
  main_gate: 'Portão Principal',
};

interface PublishedScaleGroup {
  scheduleId: string;
  scheduleTitle: string;
  scaleType: ServiceScaleType;
  serviceUnitId: string;
  assignments: PublishedServiceScaleAssignment[];
}

function groupPublishedScales(rows: PublishedServiceScaleAssignment[]): PublishedScaleGroup[] {
  const groups = new Map<string, PublishedScaleGroup>();
  rows.forEach((row) => {
    const current = groups.get(row.schedule_id);
    if (current) current.assignments.push(row);
    else groups.set(row.schedule_id, {
      scheduleId: row.schedule_id,
      scheduleTitle: row.schedule_title,
      scaleType: row.scale_type,
      serviceUnitId: row.service_unit_id,
      assignments: [row],
    });
  });
  return Array.from(groups.values());
}

function formatServiceTime(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function ServicesView() {
  const { profile } = useAuth();
  const [edition, setEdition] = useState<RetreatEventSettings | null>(null);
  const [snapshot, setSnapshot] = useState<EventServicesSnapshot>({ units: [], positions: [], assignments: [], slots: [] });
  const [publishedScaleAssignments, setPublishedScaleAssignments] = useState<PublishedServiceScaleAssignment[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const activeEdition = await getActiveRetreatEvent();
      setEdition(activeEdition);
      if (!activeEdition) {
        setSnapshot({ units: [], positions: [], assignments: [], slots: [] });
        setPublishedScaleAssignments([]);
      } else {
        const [snapshotData, publishedScales] = await Promise.all([
          listEventServicesSnapshot(activeEdition.id),
          listPublishedServiceScaleAssignments(activeEdition.id),
        ]);
        setSnapshot(snapshotData);
        setPublishedScaleAssignments(publishedScales);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os serviços.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const unitById = useMemo(() => new Map(snapshot.units.map((unit) => [unit.id, unit])), [snapshot.units]);
  const positionById = useMemo(() => new Map(snapshot.positions.map((position) => [position.id, position])), [snapshot.positions]);
  const myAssignments = useMemo(
    () => snapshot.assignments.filter((assignment) => assignment.user_id === profile?.id),
    [profile?.id, snapshot.assignments]
  );
  const myPublishedScales = useMemo(
    () => groupPublishedScales(publishedScaleAssignments.filter((assignment) => assignment.user_id === profile?.id)),
    [profile?.id, publishedScaleAssignments]
  );
  const filteredUnits = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return snapshot.units.filter((unit) => {
      if (!unit.is_active) return false;
      const assignments = snapshot.assignments.filter((assignment) => assignment.unit_id === unit.id || assignment.linked_character_id === unit.id);
      const scaleAssignments = publishedScaleAssignments.filter((assignment) => assignment.service_unit_id === unit.id);
      return !normalized
        || unit.name.toLocaleLowerCase('pt-BR').includes(normalized)
        || assignments.some((assignment) => assignment.person_name.toLocaleLowerCase('pt-BR').includes(normalized))
        || scaleAssignments.some((assignment) => (
          assignment.person_name.toLocaleLowerCase('pt-BR').includes(normalized)
          || assignment.schedule_title.toLocaleLowerCase('pt-BR').includes(normalized)
        ));
    });
  }, [publishedScaleAssignments, query, snapshot.assignments, snapshot.units]);

  function assignmentContext(assignment: EventServiceAssignment) {
    const details = [
      assignment.position_id ? positionById.get(assignment.position_id)?.name : '',
      assignment.linked_character_id ? unitById.get(assignment.linked_character_id)?.name : '',
      assignment.group_id ? `Grupo ${unitById.get(assignment.group_id)?.name || ''}` : '',
      assignment.role_title,
    ].filter(Boolean);
    return details.join(' · ');
  }

  function assignmentCard(assignment: EventServiceAssignment) {
    const unit = unitById.get(assignment.unit_id);
    return (
      <article className="service-my-card" key={assignment.id}>
        <span>{unit ? TYPE_LABELS[unit.unit_type] : 'Serviço'}</span>
        <h4>{unit?.name || 'Função removida'}</h4>
        {assignmentContext(assignment) && <p>{assignmentContext(assignment)}</p>}
        {(assignment.starts_at || assignment.ends_at) && (
          <small><CalendarClock size={14} /> {formatServiceTime(assignment.starts_at)}{assignment.ends_at ? ` até ${formatServiceTime(assignment.ends_at)}` : ''}</small>
        )}
        {assignment.notes && <small>{assignment.notes}</small>}
      </article>
    );
  }

  function publishedScaleCard(scale: PublishedScaleGroup) {
    const assignments = [...scale.assignments].sort((a, b) => a.slot_start.localeCompare(b.slot_start));
    return (
      <article className="service-my-card" key={`published-${scale.scheduleId}`}>
        <span>Escalas</span>
        <h4>{SCALE_TYPE_LABELS[scale.scaleType]}</h4>
        <p>{scale.scheduleTitle}</p>
        <div className="service-personal-shifts">
          {assignments.map((assignment) => (
            <small key={assignment.assignment_id}>
              <CalendarClock size={14} /> {formatServiceTime(assignment.slot_start)} até {formatServiceTime(assignment.slot_end)}
            </small>
          ))}
        </div>
      </article>
    );
  }

  return (
    <div className="event-services-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Servir com clareza</p>
          <h2>Serviços</h2>
          <p className="muted">{edition ? `${edition.title} · sua escala e toda a organização do evento` : 'As funções aparecerão quando houver uma edição ativa.'}</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}
      {loading ? (
        <section className="panel wide center"><div className="loader" /><p className="muted">Carregando serviços...</p></section>
      ) : !edition ? (
        <section className="panel wide service-empty"><CalendarClock size={32} /><h3>Nenhuma edição ativa</h3></section>
      ) : (
        <>
          <section className="panel wide service-my-panel">
            <div className="section-header">
              <div><p className="eyebrow">Resumo pessoal</p><h3>Minha escala</h3><p className="muted">Você pode estar em mais de uma oficina, setor, personagem, grupo ou escala.</p></div>
              <UserRoundCheck size={24} />
            </div>
            {myAssignments.length || myPublishedScales.length ? (
              <div className="service-my-grid">
                {myAssignments.map(assignmentCard)}
                {myPublishedScales.map(publishedScaleCard)}
              </div>
            ) : <div className="service-empty-inline">Você ainda não foi escalado nesta edição.</div>}
          </section>

          <section className="panel wide">
            <div className="section-header">
              <div><p className="eyebrow">Mapa operacional</p><h3>Quem está em cada função</h3><p className="muted">A visualização é compartilhada com toda a equipe para facilitar a organização.</p></div>
              <UsersRound size={24} />
            </div>
            <label className="service-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar função ou pessoa" aria-label="Buscar função ou pessoa" /></label>
            {TYPE_ORDER.map((type) => {
              const units = filteredUnits.filter((unit) => unit.unit_type === type);
              if (!units.length) return null;
              return (
                <div className="service-public-section" key={type}>
                  <h3>{TYPE_LABELS[type]}</h3>
                  <div className="service-public-grid">
                    {units.map((unit: EventServiceUnit) => {
                      const assignments = snapshot.assignments.filter((assignment) => assignment.unit_id === unit.id || assignment.linked_character_id === unit.id);
                      const slots = snapshot.slots.filter((slot) => slot.unit_id === unit.id);
                      const publishedScales = groupPublishedScales(
                        publishedScaleAssignments.filter((assignment) => assignment.service_unit_id === unit.id)
                      );
                      return (
                        <article className="service-unit-public-card" key={unit.id} style={unit.color ? { borderTopColor: unit.color } : undefined}>
                          <div><h4>{unit.name}</h4>{unit.description && <p>{unit.description}</p>}</div>
                          {assignments.length ? (
                            <ul>{assignments.map((assignment) => <li key={assignment.id}><strong>{assignment.person_name}</strong>{assignmentContext(assignment) && <span>{assignmentContext(assignment)}</span>}{assignment.is_leader && <b><ShieldCheck size={12} /> Líder</b>}</li>)}</ul>
                          ) : publishedScales.length === 0 ? <small className="muted">Ainda sem pessoas escaladas.</small> : null}
                          {publishedScales.length > 0 && (
                            <div className="service-published-scales">
                              {publishedScales.map((scale) => {
                                const slotGroups = new Map<string, PublishedServiceScaleAssignment[]>();
                                scale.assignments.forEach((assignment) => {
                                  const key = `${assignment.slot_number}-${assignment.slot_start}`;
                                  slotGroups.set(key, [...(slotGroups.get(key) || []), assignment]);
                                });
                                return (
                                  <div key={scale.scheduleId}>
                                    <strong>{scale.scheduleTitle}</strong>
                                    {Array.from(slotGroups.values()).map((slotAssignments) => (
                                      <p key={slotAssignments[0].assignment_id}>
                                        <CalendarClock size={13} />
                                        <span>{formatServiceTime(slotAssignments[0].slot_start)}–{formatServiceTime(slotAssignments[0].slot_end)}</span>
                                        <b>{slotAssignments.map((assignment) => assignment.person_name).join(' · ')}</b>
                                      </p>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {slots.length > 0 && <div className="service-slot-summary">{slots.map((slot) => <span key={slot.id}><CalendarClock size={13} /> {formatServiceTime(slot.starts_at)} · {slot.title}</span>)}</div>}
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
