import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Coffee, GripVertical, Plus, Route, Save, Trash2 } from 'lucide-react';
import {
  listTrailRoutePlanDefinition,
  removeTrailRoutePlanStep,
  reorderTrailRoutePlan,
  saveTrailRoutePlanStart,
  saveTrailRoutePlanStep,
} from '../services/trailTraffic';
import { calculatePlannedTrailTimeline, moveTrailStep } from '../services/trailRouteTime';
import type { TrailMapStation, TrailRoutePlan, TrailRoutePlanStep } from '../types';

interface StepDraft {
  stationId: string;
  label: string;
  stayMinutes: number;
  travelMinutes: number;
  isBreak: boolean;
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatClock(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(value);
}

function buildDraft(step: TrailRoutePlanStep): StepDraft {
  return {
    stationId: step.station_id || '',
    label: step.label,
    stayMinutes: step.stay_minutes,
    travelMinutes: step.travel_minutes,
    isBreak: step.is_break,
  };
}

const EMPTY_STEP: StepDraft = {
  stationId: '',
  label: '',
  stayMinutes: 10,
  travelMinutes: 0,
  isBreak: false,
};

export function GroupRoutePlanEditor({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [plan, setPlan] = useState<TrailRoutePlan | null>(null);
  const [steps, setSteps] = useState<TrailRoutePlanStep[]>([]);
  const [stations, setStations] = useState<TrailMapStation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, StepDraft>>({});
  const [startsAt, setStartsAt] = useState('');
  const [newStep, setNewStep] = useState<StepDraft>(EMPTY_STEP);
  const [draggedId, setDraggedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listTrailRoutePlanDefinition(groupId);
      setPlan(data.plan);
      setSteps(data.steps);
      setStations(data.stations);
      setStartsAt(toLocalInput(data.plan.starts_at));
      setDrafts(Object.fromEntries(data.steps.map((step) => [step.id, buildDraft(step)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a rota ideal.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = useMemo(
    () => plan ? calculatePlannedTrailTimeline(plan.starts_at, steps) : [],
    [plan, steps]
  );

  function updateDraft(stepId: string, patch: Partial<StepDraft>) {
    setDrafts((current) => ({ ...current, [stepId]: { ...current[stepId], ...patch } }));
  }

  async function saveStart() {
    if (!plan || !startsAt) return;
    setSaving(true);
    setError('');
    try {
      await saveTrailRoutePlanStart(plan.id, new Date(startsAt).toISOString());
      setSuccess('Horário inicial da rota atualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o início da rota.');
    } finally {
      setSaving(false);
    }
  }

  async function saveStep(step: TrailRoutePlanStep) {
    const draft = drafts[step.id];
    if (!draft || !draft.label.trim()) return;
    setSaving(true);
    setError('');
    try {
      await saveTrailRoutePlanStep({
        plan_id: step.plan_id,
        edition_id: step.edition_id,
        group_id: step.group_id,
        station_id: draft.stationId || null,
        label: draft.label,
        ideal_order: step.ideal_order,
        stay_minutes: draft.stayMinutes,
        travel_minutes: draft.travelMinutes,
        is_break: draft.isBreak,
      }, step.id);
      setSuccess(`${draft.label} atualizado.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar esta etapa.');
    } finally {
      setSaving(false);
    }
  }

  async function applyOrder(next: TrailRoutePlanStep[]) {
    if (!plan || next.map((step) => step.id).join() === steps.map((step) => step.id).join()) return;
    setSaving(true);
    setSteps(next);
    try {
      await reorderTrailRoutePlan(plan.id, next.map((step) => step.id));
      setSuccess('Ordem ideal atualizada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reordenar a rota.');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function addStep(event: React.FormEvent) {
    event.preventDefault();
    if (!plan || !newStep.label.trim()) return;
    setSaving(true);
    setError('');
    try {
      await saveTrailRoutePlanStep({
        plan_id: plan.id,
        edition_id: plan.edition_id,
        group_id: plan.group_id,
        station_id: newStep.stationId || null,
        label: newStep.label,
        ideal_order: steps.length + 1,
        stay_minutes: newStep.stayMinutes,
        travel_minutes: newStep.travelMinutes,
        is_break: newStep.isBreak,
      });
      setNewStep(EMPTY_STEP);
      setSuccess('Nova etapa adicionada ao planejamento.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar a etapa.');
    } finally {
      setSaving(false);
    }
  }

  async function removeStep(step: TrailRoutePlanStep) {
    if (!window.confirm(`Remover “${step.label}” da rota ideal de ${groupName}?`)) return;
    setSaving(true);
    try {
      await removeTrailRoutePlanStep(step.id);
      const remaining = steps.filter((item) => item.id !== step.id);
      if (plan && remaining.length) await reorderTrailRoutePlan(plan.id, remaining.map((item) => item.id));
      setSuccess('Etapa removida. A execução já iniciada, se houver, foi preservada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover a etapa.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="panel wide center"><div className="loader" /><p className="muted">Carregando rota ideal...</p></section>;
  if (!plan) return <section className="panel wide"><h3>Rota ideal indisponível</h3><p className="muted">Atualize a página para gerar o planejamento deste grupo.</p></section>;

  return (
    <section className="panel wide group-route-editor">
      <div className="section-header">
        <div>
          <p className="eyebrow">Planejamento preservado</p>
          <h3>Rota ideal e tempos</h3>
          <p className="muted">Esta ordem alimenta o Mapa Operacional. Mudanças feitas ao vivo nunca alteram esta tabela.</p>
        </div>
        <Route size={24} />
      </div>

      {error && <div className="form-message error" role="alert">{error}</div>}
      {success && <div className="form-message success" role="status">{success}</div>}

      <div className="route-plan-start">
        <label><CalendarClock size={16} /> Início ideal da trilha
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </label>
        <button type="button" className="secondary-button" onClick={() => void saveStart()} disabled={saving || !startsAt}>
          <Save size={15} /> Salvar início
        </button>
        <span>Fim ideal: <strong>{timeline.length ? formatClock(timeline[timeline.length - 1].plannedDepartureAt) : '—'}</strong></span>
      </div>

      <div className="route-plan-sheet-wrap">
        <table className="route-plan-sheet">
          <thead><tr><th>Ordem</th><th>Etapa</th><th>Local no mapa</th><th>ETA</th><th>Permanência</th><th>Deslocamento</th><th>Tipo</th><th>Ações</th></tr></thead>
          <tbody>
            {timeline.map((step, index) => {
              const draft = drafts[step.id] || buildDraft(step);
              return (
                <tr
                  key={step.id}
                  draggable={!saving}
                  onDragStart={() => setDraggedId(step.id)}
                  onDragEnd={() => setDraggedId('')}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedId) void applyOrder(moveTrailStep(steps, draggedId, step.id));
                    setDraggedId('');
                  }}
                  className={draggedId === step.id ? 'dragging' : ''}
                >
                  <td><span className="route-drag-handle" title="Arraste para reordenar"><GripVertical size={16} /> {index + 1}</span></td>
                  <td><input aria-label={`Nome da etapa ${index + 1}`} value={draft.label} onChange={(event) => updateDraft(step.id, { label: event.target.value })} /></td>
                  <td><select aria-label={`Local da etapa ${index + 1}`} value={draft.stationId} onChange={(event) => updateDraft(step.id, { stationId: event.target.value })}><option value="">Sem marcador</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.label}</option>)}</select></td>
                  <td><strong>{formatClock(step.plannedArrivalAt)}</strong><small>saída {formatClock(step.plannedDepartureAt)}</small></td>
                  <td><label className="route-number-field"><input aria-label={`Permanência da etapa ${index + 1}`} type="number" min="1" max="360" value={draft.stayMinutes} onChange={(event) => updateDraft(step.id, { stayMinutes: Number(event.target.value) })} /> min</label></td>
                  <td><label className="route-number-field"><input aria-label={`Deslocamento da etapa ${index + 1}`} type="number" min="0" max="180" value={draft.travelMinutes} onChange={(event) => updateDraft(step.id, { travelMinutes: Number(event.target.value) })} /> min</label></td>
                  <td><label className="route-break-toggle"><input type="checkbox" checked={draft.isBreak} onChange={(event) => updateDraft(step.id, { isBreak: event.target.checked })} /><Coffee size={14} /> Pausa</label></td>
                  <td><div className="route-row-actions"><button type="button" className="icon-button" aria-label="Mover etapa para cima" disabled={saving || index === 0} onClick={() => void applyOrder(moveTrailStep(steps, step.id, steps[index - 1]?.id))}><ArrowUp size={15} /></button><button type="button" className="icon-button" aria-label="Mover etapa para baixo" disabled={saving || index === steps.length - 1} onClick={() => void applyOrder(moveTrailStep(steps, step.id, steps[index + 1]?.id))}><ArrowDown size={15} /></button><button type="button" className="icon-button" aria-label={`Salvar ${draft.label}`} disabled={saving} onClick={() => void saveStep(step)}><Save size={15} /></button><button type="button" className="icon-button danger-button" aria-label={`Remover ${draft.label}`} disabled={saving} onClick={() => void removeStep(step)}><Trash2 size={15} /></button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form className="route-plan-add" onSubmit={addStep}>
        <h4>Adicionar etapa</h4>
        <input required placeholder="Nome da etapa" value={newStep.label} onChange={(event) => setNewStep({ ...newStep, label: event.target.value })} />
        <select value={newStep.stationId} onChange={(event) => {
          const station = stations.find((item) => item.id === event.target.value);
          setNewStep({ ...newStep, stationId: event.target.value, label: newStep.label || station?.label || '' });
        }}><option value="">Sem marcador no mapa</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.label}</option>)}</select>
        <label>Permanência<input type="number" min="1" max="360" value={newStep.stayMinutes} onChange={(event) => setNewStep({ ...newStep, stayMinutes: Number(event.target.value) })} /> min</label>
        <label>Deslocamento<input type="number" min="0" max="180" value={newStep.travelMinutes} onChange={(event) => setNewStep({ ...newStep, travelMinutes: Number(event.target.value) })} /> min</label>
        <label className="check-line"><input type="checkbox" checked={newStep.isBreak} onChange={(event) => setNewStep({ ...newStep, isBreak: event.target.checked })} /> Pausa / refeição</label>
        <button className="primary-button" disabled={saving}><Plus size={15} /> Adicionar ao final</button>
      </form>
    </section>
  );
}
