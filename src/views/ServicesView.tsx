import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Search, ShieldCheck, UserRoundCheck, UsersRound } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { getActiveRetreatEvent } from '../services/eventSettings';
import { listEventServicesSnapshot } from '../services/eventServices';
import type {
  EventServiceAssignment,
  EventServicesSnapshot,
  EventServiceUnit,
  EventServiceUnitType,
  RetreatEventSettings,
} from '../types';

const TYPE_LABELS: Record<EventServiceUnitType, string> = {
  character: 'Personagens',
  sector: 'Setores',
  location: 'Oficinas / locais',
  group: 'Grupos',
  scale: 'Escalas',
};

const TYPE_ORDER: EventServiceUnitType[] = ['character', 'sector', 'location', 'scale', 'group'];

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
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const activeEdition = await getActiveRetreatEvent();
      setEdition(activeEdition);
      setSnapshot(activeEdition ? await listEventServicesSnapshot(activeEdition.id) : { units: [], positions: [], assignments: [], slots: [] });
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
  const filteredUnits = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return snapshot.units.filter((unit) => {
      if (!unit.is_active) return false;
      const assignments = snapshot.assignments.filter((assignment) => assignment.unit_id === unit.id || assignment.linked_character_id === unit.id);
      return !normalized || unit.name.toLocaleLowerCase('pt-BR').includes(normalized) || assignments.some((assignment) => assignment.person_name.toLocaleLowerCase('pt-BR').includes(normalized));
    });
  }, [query, snapshot.assignments, snapshot.units]);

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
            {myAssignments.length ? <div className="service-my-grid">{myAssignments.map(assignmentCard)}</div> : <div className="service-empty-inline">Você ainda não foi escalado nesta edição.</div>}
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
                      return (
                        <article className="service-unit-public-card" key={unit.id} style={unit.color ? { borderTopColor: unit.color } : undefined}>
                          <div><h4>{unit.name}</h4>{unit.description && <p>{unit.description}</p>}</div>
                          {assignments.length ? (
                            <ul>{assignments.map((assignment) => <li key={assignment.id}><strong>{assignment.person_name}</strong>{assignmentContext(assignment) && <span>{assignmentContext(assignment)}</span>}{assignment.is_leader && <b><ShieldCheck size={12} /> Líder</b>}</li>)}</ul>
                          ) : <small className="muted">Ainda sem pessoas escaladas.</small>}
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
