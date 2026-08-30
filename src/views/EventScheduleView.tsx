import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Clock3,
  Edit3,
  MapPin,
  ListOrdered,
  Plus,
  RefreshCw,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { getActiveRetreatEvent } from '../services/eventSettings';
import {
  archiveEventScheduleItem,
  listEventScheduleItems,
  listSchedulePeople,
  saveEventScheduleItem,
  saveEventRoute,
} from '../services/eventSchedule';
import { listEventServicesSnapshot } from '../services/eventServices';
import { buildEventRoutePreview, DEFAULT_EVENT_ROUTE } from '../services/eventRoute';
import { useSectorOptions } from '../hooks/useSectorOptions';
import type {
  EventScheduleActivityType,
  EventScheduleItem,
  EventRouteRowInput,
  EventServiceUnit,
  RetreatEventSettings,
  SchedulePersonOption,
} from '../types';

const ACTIVITY_LABELS: Record<EventScheduleActivityType, string> = {
  activity: 'Atividade',
  worship: 'Culto / ministração',
  meal: 'Refeição',
  service: 'Serviço',
  transport: 'Deslocamento',
  break: 'Intervalo',
  other: 'Outro',
};

const emptyForm = {
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  location: '',
  activity_type: 'activity' as EventScheduleActivityType,
  teams: [] as string[],
  responsible_id: '',
  is_published: false,
};

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function addMinutesToLocalInput(value: string, minutes: number) {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return toLocalInput(date.toISOString());
}

function getDefaultRouteStart(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toLocalInput(date.toISOString());
}

function findRouteLocationId(title: string, locations: EventServiceUnit[]) {
  const normalizedTitle = title.toLocaleLowerCase('pt-BR');
  const exact = locations.find((location) => location.name.toLocaleLowerCase('pt-BR') === normalizedTitle);
  if (exact) return exact.id;
  return locations
    .filter((location) => {
      const primaryName = location.name.split(' / ')[0].toLocaleLowerCase('pt-BR');
      return primaryName.includes(normalizedTitle) || normalizedTitle.includes(primaryName);
    })
    .sort((a, b) => b.name.length - a.name.length)[0]?.id || null;
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function EventScheduleView() {
  const sectorOptions = useSectorOptions();
  const { isAdmin, isDirector } = useAuth();
  const canManage = isAdmin || isDirector;
  const [edition, setEdition] = useState<RetreatEventSettings | null>(null);
  const [items, setItems] = useState<EventScheduleItem[]>([]);
  const [people, setPeople] = useState<SchedulePersonOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showRouteEditor, setShowRouteEditor] = useState(false);
  const [routeStart, setRouteStart] = useState('');
  const [routeRows, setRouteRows] = useState<EventRouteRowInput[]>(DEFAULT_EVENT_ROUTE);
  const [routePublished, setRoutePublished] = useState(false);
  const [locations, setLocations] = useState<EventServiceUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const activeEdition = await getActiveRetreatEvent();
      const [schedule, peopleOptions, services] = await Promise.all([
        listEventScheduleItems(),
        canManage ? listSchedulePeople() : Promise.resolve([]),
        activeEdition ? listEventServicesSnapshot(activeEdition.id) : Promise.resolve(null),
      ]);
      setEdition(activeEdition);
      setItems(schedule);
      setPeople(peopleOptions);
      setLocations(services?.units.filter((unit) => unit.unit_type === 'location' && unit.is_active) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o cronograma.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleItems = useMemo(
    () => items.filter((item) => item.edition_id === edition?.id && (item.is_published || canManage)),
    [canManage, edition?.id, items]
  );

  const routePreview = useMemo(() => {
    try {
      return buildEventRoutePreview(routeStart, routeRows);
    } catch {
      return [];
    }
  }, [routeRows, routeStart]);

  const groupedItems = useMemo(() => {
    return visibleItems.reduce<Record<string, EventScheduleItem[]>>((groups, item) => {
      const key = new Date(item.starts_at).toLocaleDateString('en-CA');
      groups[key] = [...(groups[key] || []), item];
      return groups;
    }, {});
  }, [visibleItems]);

  function startNewItem() {
    const startsAt = toLocalInput(edition?.start_date);
    setEditingId(null);
    setForm({
      ...emptyForm,
      starts_at: startsAt,
      ends_at: addMinutesToLocalInput(startsAt, 60),
    });
    setShowForm(true);
    setShowRouteEditor(false);
    setError('');
    setSuccess('');
  }

  function startRouteEditor() {
    const existingRoute = items
      .filter((item) => item.edition_id === edition?.id && item.schedule_kind === 'route' && !item.deleted_at)
      .sort((a, b) => (a.route_order || 0) - (b.route_order || 0));
    setRouteStart(existingRoute[0] ? toLocalInput(existingRoute[0].starts_at) : getDefaultRouteStart(edition?.start_date));
    setRoutePublished(existingRoute[0]?.is_published || false);
    setRouteRows(existingRoute.length ? existingRoute.map((item) => ({
      title: item.title,
      duration_minutes: item.duration_minutes || Math.max(1, Math.round((new Date(item.ends_at || item.starts_at).getTime() - new Date(item.starts_at).getTime()) / 60_000)),
      location_id: item.service_unit_id || null,
      activity_type: item.activity_type,
      description: item.description || '',
    })) : DEFAULT_EVENT_ROUTE.map((row) => ({
      ...row,
      location_id: findRouteLocationId(row.title, locations),
    })));
    setShowForm(false);
    setShowRouteEditor(true);
    setError('');
    setSuccess('');
  }

  function updateRouteRow(index: number, changes: Partial<EventRouteRowInput>) {
    setRouteRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));
  }

  function moveRouteRow(index: number, direction: -1 | 1) {
    setRouteRows((rows) => {
      const target = index + direction;
      if (target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSaveRoute(event: React.FormEvent) {
    event.preventDefault();
    if (!edition) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      buildEventRoutePreview(routeStart, routeRows);
      await saveEventRoute({
        editionId: edition.id,
        startAt: new Date(routeStart).toISOString(),
        rows: routeRows,
        isPublished: routePublished,
      });
      setShowRouteEditor(false);
      setSuccess(`Roteiro salvo com ${routeRows.length} etapas e horários recalculados.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o roteiro.');
    } finally {
      setSaving(false);
    }
  }

  function handleStartChange(startsAt: string) {
    const currentEndIsValid = form.ends_at && new Date(form.ends_at) > new Date(startsAt);
    setForm({
      ...form,
      starts_at: startsAt,
      ends_at: currentEndIsValid ? form.ends_at : addMinutesToLocalInput(startsAt, 60),
    });
  }

  function startEditing(item: EventScheduleItem) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description || '',
      starts_at: toLocalInput(item.starts_at),
      ends_at: toLocalInput(item.ends_at),
      location: item.location || '',
      activity_type: item.activity_type,
      teams: item.team_names,
      responsible_id: item.responsible_id || '',
      is_published: item.is_published,
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!edition) throw new Error('Configure uma edição ativa antes de montar o cronograma.');
      if (form.title.trim().length < 3) throw new Error('Informe o nome da atividade.');
      if (!form.starts_at) throw new Error('Informe o início da atividade.');
      if (form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
        throw new Error('O término deve ser posterior ao início.');
      }

      await saveEventScheduleItem({
        edition_id: edition.id,
        title: form.title,
        description: form.description,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        location: form.location,
        activity_type: form.activity_type,
        team_names: form.teams,
        responsible_id: form.responsible_id || null,
        responsible: people.find((person) => person.user_id === form.responsible_id)?.display_name || '',
        is_published: form.is_published,
      }, editingId || undefined);

      setSuccess(editingId ? 'Atividade atualizada.' : 'Atividade adicionada ao cronograma.');
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a atividade.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(item: EventScheduleItem) {
    if (!window.confirm(`Remover “${item.title}” do cronograma?`)) return;
    setError('');
    try {
      await archiveEventScheduleItem(item.id);
      setSuccess('Atividade removida do cronograma.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover a atividade.');
    }
  }

  return (
    <div className="event-schedule-page">
      <div className="admin-header schedule-header">
        <div>
          <p className="eyebrow">Programação do encontro</p>
          <h2>Cronograma</h2>
          <p className="muted">
            {edition
              ? `${edition.title} · ${new Date(edition.start_date).toLocaleDateString('pt-BR')}`
              : 'A programação será exibida quando a próxima edição for configurada.'}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} /> Atualizar
          </button>
          {canManage && (
            <><button type="button" className="secondary-button" onClick={startRouteEditor} disabled={!edition}><ListOrdered size={16} /> Montar roteiro</button><button type="button" className="primary-button" onClick={startNewItem} disabled={!edition}><Plus size={16} /> Nova atividade</button></>
          )}
        </div>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}

      {showForm && canManage && (
        <section className="panel wide schedule-editor">
          <div className="section-title-row">
            <div>
              <h3>{editingId ? 'Editar atividade' : 'Nova atividade'}</h3>
              <p className="muted">Itens em rascunho ficam visíveis somente para Admin e Diretoria.</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
          <form className="grid two" onSubmit={handleSubmit}>
            <div><label htmlFor="schedule-title">Atividade</label><input id="schedule-title" required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><label htmlFor="schedule-type">Tipo</label><select id="schedule-type" value={form.activity_type} onChange={(e) => setForm({ ...form, activity_type: e.target.value as EventScheduleActivityType })}>{Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
            <div><label htmlFor="schedule-start">Início</label><input id="schedule-start" type="datetime-local" required value={form.starts_at} onChange={(e) => handleStartChange(e.target.value)} /></div>
            <div><label htmlFor="schedule-end">Término</label><input id="schedule-end" type="datetime-local" min={form.starts_at || undefined} value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
            <div><label htmlFor="schedule-location">Local</label><input id="schedule-location" maxLength={180} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div>
              <label htmlFor="schedule-responsible">Responsável</label>
              <select id="schedule-responsible" value={form.responsible_id} onChange={(e) => setForm({ ...form, responsible_id: e.target.value })}>
                <option value="">Sem responsável definido</option>
                {people.map((person) => <option value={person.user_id} key={person.user_id}>{person.display_name}{person.primary_team ? ` · ${person.primary_team}` : ''}</option>)}
              </select>
            </div>
            <fieldset className="schedule-wide-field schedule-team-selector">
              <legend>Equipes escaladas</legend>
              <div className="chips">
                {sectorOptions.map((team) => (
                  <button
                    type="button"
                    className={form.teams.includes(team) ? 'chip active' : 'chip'}
                    aria-pressed={form.teams.includes(team)}
                    key={team}
                    onClick={() => setForm({ ...form, teams: form.teams.includes(team) ? form.teams.filter((item) => item !== team) : [...form.teams, team] })}
                  >{team}</button>
                ))}
              </div>
            </fieldset>
            <div className="schedule-wide-field"><label htmlFor="schedule-description">Orientações</label><textarea id="schedule-description" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <label className="auth-terms-consent schedule-publish-toggle"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} /><span>Publicar para todos os usuários</span></label>
            <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Adicionar atividade'}</button>
          </form>
        </section>
      )}

      {showRouteEditor && canManage && (
        <section className="panel wide route-editor">
          <div className="section-title-row"><div><p className="eyebrow">Roteiro completo</p><h3>Oficinas e horários calculados</h3><p className="muted">Altere a ordem ou a duração; todos os horários seguintes são recalculados automaticamente.</p></div><button type="button" className="secondary-button" onClick={() => setShowRouteEditor(false)}>Cancelar</button></div>
          <form onSubmit={handleSaveRoute}>
            <div className="route-settings"><label>Início do roteiro<input required type="datetime-local" value={routeStart} onChange={(event) => setRouteStart(event.target.value)} /></label><label className="check-line"><input type="checkbox" checked={routePublished} onChange={(event) => setRoutePublished(event.target.checked)} /> Publicar para toda a equipe</label></div>
            <div className="route-table-wrap"><table className="route-table"><thead><tr><th>#</th><th>Etapa</th><th>Local vinculado</th><th>Duração</th><th>Início</th><th>Fim</th><th>Ações</th></tr></thead><tbody>{routeRows.map((row, index) => <tr key={index}><td>{index + 1}</td><td><input required minLength={3} maxLength={160} value={row.title} onChange={(event) => updateRouteRow(index, { title: event.target.value })} /></td><td><select value={row.location_id || ''} onChange={(event) => updateRouteRow(index, { location_id: event.target.value || null })}><option value="">Sem vínculo</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></td><td><label className="route-duration"><input required type="number" min="1" max="1440" value={row.duration_minutes} onChange={(event) => updateRouteRow(index, { duration_minutes: Number(event.target.value) })} /><span>min</span></label></td><td>{routePreview[index] ? formatTime(routePreview[index].starts_at) : '—'}</td><td>{routePreview[index] ? formatTime(routePreview[index].ends_at) : '—'}</td><td><div className="table-actions"><button type="button" className="icon-button" aria-label="Mover para cima" disabled={index === 0} onClick={() => moveRouteRow(index, -1)}><ArrowUp size={14} /></button><button type="button" className="icon-button" aria-label="Mover para baixo" disabled={index === routeRows.length - 1} onClick={() => moveRouteRow(index, 1)}><ArrowDown size={14} /></button><button type="button" className="icon-button danger-button" aria-label="Remover etapa" disabled={routeRows.length === 1} onClick={() => setRouteRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>
            <div className="route-actions"><button type="button" className="secondary-button" onClick={() => setRouteRows((rows) => [...rows, { title: 'Nova etapa', duration_minutes: 30 }])}><Plus size={15} /> Adicionar etapa</button><button className="primary-button" disabled={saving || !routePreview.length}>{saving ? 'Salvando roteiro...' : 'Salvar e recalcular roteiro'}</button></div>
          </form>
        </section>
      )}

      {loading ? (
        <section className="panel wide center"><div className="loader" /><p className="muted">Carregando cronograma...</p></section>
      ) : visibleItems.length === 0 ? (
        <section className="panel wide schedule-empty">
          <CalendarDays size={34} />
          <div><h3>Cronograma em preparação</h3><p className="muted">A programação completa aparecerá aqui assim que for publicada.</p></div>
        </section>
      ) : (
        <div className="schedule-days">
          {Object.entries(groupedItems).map(([day, dayItems]) => (
            <section className="schedule-day" key={day}>
              <h3>{formatDay(dayItems[0].starts_at)}</h3>
              <div className="schedule-timeline">
                {dayItems.map((item) => (
                  <article className={`schedule-item ${item.is_published ? '' : 'draft'}`} key={item.id}>
                    <div className="schedule-time"><Clock3 size={16} /><strong>{formatTime(item.starts_at)}</strong>{item.ends_at && <span>até {formatTime(item.ends_at)}</span>}</div>
                    <div className="schedule-item-main">
                      <div className="schedule-item-heading"><span>{item.schedule_kind === 'route' ? `Roteiro${item.duration_minutes ? ` · ${item.duration_minutes} min` : ''}` : ACTIVITY_LABELS[item.activity_type]}</span>{!item.is_published && <b>Rascunho</b>}</div>
                      <h4>{item.title}</h4>
                      {item.description && <p>{item.description}</p>}
                      <div className="schedule-meta">
                        {item.location && <span><MapPin size={14} />{item.location}</span>}
                        {item.team_names.length > 0 && <span><UsersRound size={14} />{item.team_names.join(' · ')}</span>}
                        {item.responsible && <span><strong>Responsável:</strong> {item.responsible}</span>}
                      </div>
                    </div>
                    {canManage && <div className="schedule-actions">{item.schedule_kind !== 'route' && <button type="button" className="secondary-button" onClick={() => startEditing(item)}><Edit3 size={15} />Editar</button>}<button type="button" className="secondary-button danger-button" onClick={() => void handleArchive(item)}><Trash2 size={15} />Remover</button></div>}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
