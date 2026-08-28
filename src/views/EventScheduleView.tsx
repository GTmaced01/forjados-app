import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  Edit3,
  MapPin,
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
  saveEventScheduleItem,
} from '../services/eventSchedule';
import type {
  EventScheduleActivityType,
  EventScheduleItem,
  RetreatEventSettings,
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
  teams: '',
  responsible: '',
  is_published: false,
};

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
  const { isAdmin, isDirector } = useAuth();
  const canManage = isAdmin || isDirector;
  const [edition, setEdition] = useState<RetreatEventSettings | null>(null);
  const [items, setItems] = useState<EventScheduleItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [activeEdition, schedule] = await Promise.all([
        getActiveRetreatEvent(),
        listEventScheduleItems(),
      ]);
      setEdition(activeEdition);
      setItems(schedule);
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
    () => items.filter((item) => item.is_published || canManage),
    [canManage, items]
  );

  const groupedItems = useMemo(() => {
    return visibleItems.reduce<Record<string, EventScheduleItem[]>>((groups, item) => {
      const key = new Date(item.starts_at).toLocaleDateString('en-CA');
      groups[key] = [...(groups[key] || []), item];
      return groups;
    }, {});
  }, [visibleItems]);

  function startNewItem() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      starts_at: toLocalInput(edition?.start_date),
      ends_at: toLocalInput(edition?.start_date),
    });
    setShowForm(true);
    setError('');
    setSuccess('');
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
      teams: item.team_names.join(', '),
      responsible: item.responsible || '',
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
        team_names: form.teams
          .split(',')
          .map((team) => team.trim())
          .filter(Boolean),
        responsible: form.responsible,
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
            <button type="button" className="primary-button" onClick={startNewItem} disabled={!edition}>
              <Plus size={16} /> Nova atividade
            </button>
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
            <div><label htmlFor="schedule-start">Início</label><input id="schedule-start" type="datetime-local" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
            <div><label htmlFor="schedule-end">Término</label><input id="schedule-end" type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
            <div><label htmlFor="schedule-location">Local</label><input id="schedule-location" maxLength={180} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div><label htmlFor="schedule-responsible">Responsável</label><input id="schedule-responsible" maxLength={180} value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} /></div>
            <div className="schedule-wide-field"><label htmlFor="schedule-teams">Equipes escaladas</label><input id="schedule-teams" placeholder="Ex.: Louvor, Mídia, Recepção" value={form.teams} onChange={(e) => setForm({ ...form, teams: e.target.value })} /><p className="field-hint">Separe as equipes por vírgula.</p></div>
            <div className="schedule-wide-field"><label htmlFor="schedule-description">Orientações</label><textarea id="schedule-description" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <label className="auth-terms-consent schedule-publish-toggle"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} /><span>Publicar para todos os usuários</span></label>
            <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Adicionar atividade'}</button>
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
                      <div className="schedule-item-heading"><span>{ACTIVITY_LABELS[item.activity_type]}</span>{!item.is_published && <b>Rascunho</b>}</div>
                      <h4>{item.title}</h4>
                      {item.description && <p>{item.description}</p>}
                      <div className="schedule-meta">
                        {item.location && <span><MapPin size={14} />{item.location}</span>}
                        {item.team_names.length > 0 && <span><UsersRound size={14} />{item.team_names.join(' · ')}</span>}
                        {item.responsible && <span><strong>Responsável:</strong> {item.responsible}</span>}
                      </div>
                    </div>
                    {canManage && <div className="schedule-actions"><button type="button" className="secondary-button" onClick={() => startEditing(item)}><Edit3 size={15} />Editar</button><button type="button" className="secondary-button danger-button" onClick={() => void handleArchive(item)}><Trash2 size={15} />Remover</button></div>}
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
