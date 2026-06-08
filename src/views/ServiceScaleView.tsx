import { useEffect, useMemo, useState } from 'react';
import type {
  GeneratedScaleSlot,
  ServiceScaleAssignment,
  ServiceScaleConfig,
  ServiceScaleGender,
  ServiceScalePerson,
  ServiceScaleSchedule,
} from '../types';
import {
  buildGeneratedScale,
  createServicePerson,
  deleteServicePerson,
  deleteServiceSchedule,
  downloadTextFile,
  exportScaleCsv,
  formatDateTime,
  formatSupabaseError,
  listAssignmentsBySchedule,
  listServicePeople,
  listServiceSchedules,
  saveGeneratedScale,
  summarizeGeneratedScale,
  toDatetimeLocalValue,
  updateServicePerson,
} from '../services/serviceScale';
import { withTimeout } from '../services/safeAsync';

const now = new Date();
const defaultStart = new Date(now);
defaultStart.setHours(18, 0, 0, 0);
const defaultEnd = new Date(defaultStart);
defaultEnd.setDate(defaultEnd.getDate() + 2);

const initialConfig: ServiceScaleConfig = {
  title: 'Escala de Serviço do Alojamento',
  startAt: toDatetimeLocalValue(defaultStart),
  endAt: toDatetimeLocalValue(defaultEnd),
  shiftMinutes: 90,
  menPerShift: 2,
  womenPerShift: 2,
  minRestMinutes: 180,
  avoidConsecutive: true,
};

const initialPersonForm = {
  name: '',
  gender: 'male' as ServiceScaleGender,
  phone: '',
  sector: '',
  is_active: true,
  does_trail: false,
  notes: '',
};

function normalizeDatetimeLocal(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function genderLabel(gender: ServiceScaleGender) {
  return gender === 'male' ? 'Masculino' : 'Feminino';
}

export function ServiceScaleView() {
  const [people, setPeople] = useState<ServiceScalePerson[]>([]);
  const [schedules, setSchedules] = useState<ServiceScaleSchedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [selectedAssignments, setSelectedAssignments] = useState<ServiceScaleAssignment[]>([]);
  const [personForm, setPersonForm] = useState(initialPersonForm);
  const [config, setConfig] = useState<ServiceScaleConfig>(initialConfig);
  const [generatedSlots, setGeneratedSlots] = useState<GeneratedScaleSlot[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPerson, setSavingPerson] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const stats = useMemo(() => {
    const men = people.filter((person) => person.gender === 'male');
    const women = people.filter((person) => person.gender === 'female');
    const active = people.filter((person) => person.is_active && !person.does_trail);
    const trail = people.filter((person) => person.does_trail);

    return {
      total: people.length,
      men: men.length,
      women: women.length,
      active: active.length,
      trail: trail.length,
      activeMen: active.filter((person) => person.gender === 'male').length,
      activeWomen: active.filter((person) => person.gender === 'female').length,
    };
  }, [people]);

  const summary = useMemo(() => summarizeGeneratedScale(generatedSlots), [generatedSlots]);

  async function loadAll() {
    try {
      setLoading(true);
      setError('');
      const [peopleData, scheduleData] = await withTimeout(
        Promise.all([
          listServicePeople(),
          listServiceSchedules(),
        ]),
        10000,
        'Não foi possível carregar o módulo de escala. Tente novamente.'
      );
      setPeople(peopleData);
      setSchedules(scheduleData);
      if (scheduleData.length > 0 && !selectedScheduleId) {
        setSelectedScheduleId(scheduleData[0].id);
      }
    } catch (err) {
      setError(
        `Não consegui carregar o módulo de escala. Verifique se você executou o arquivo supabase/service-scale.sql no Supabase. Detalhe: ${formatSupabaseError(err)}`
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    async function loadAssignments() {
      if (!selectedScheduleId) {
        setSelectedAssignments([]);
        return;
      }

      try {
        const assignments = await withTimeout(
          listAssignmentsBySchedule(selectedScheduleId),
          10000,
          'Não foi possível carregar a escala salva. Tente novamente.'
        );
        setSelectedAssignments(assignments);
      } catch (err) {
        setError(`Erro ao carregar escala salva: ${formatSupabaseError(err)}`);
      }
    }

    loadAssignments();
  }, [selectedScheduleId]);

  async function handleCreatePerson(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!personForm.name.trim()) {
      setError('Informe o nome da pessoa.');
      return;
    }

    try {
      setSavingPerson(true);
      const created = await createServicePerson(personForm);
      setPeople((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setPersonForm(initialPersonForm);
      setSuccess('Pessoa cadastrada com sucesso.');
    } catch (err) {
      setError(`Não foi possível cadastrar a pessoa. Detalhe: ${formatSupabaseError(err)}`);
    } finally {
      setSavingPerson(false);
    }
  }

  async function handleTogglePerson(person: ServiceScalePerson, field: 'is_active' | 'does_trail') {
    setError('');
    setSuccess('');

    const nextValue = !person[field];
    const payload: Partial<ServiceScalePerson> = { [field]: nextValue };

    if (field === 'does_trail' && nextValue) {
      payload.is_active = false;
    }

    if (field === 'is_active' && nextValue) {
      payload.does_trail = false;
    }

    try {
      const updated = await updateServicePerson(person.id, payload);
      setPeople((current) => current.map((item) => (item.id === person.id ? updated : item)));
    } catch (err) {
      setError(`Não foi possível atualizar a pessoa. Detalhe: ${formatSupabaseError(err)}`);
    }
  }

  async function handleDeletePerson(person: ServiceScalePerson) {
    const confirmed = window.confirm(`Remover ${person.name} da lista de pessoas?`);
    if (!confirmed) return;

    try {
      await deleteServicePerson(person.id);
      setPeople((current) => current.filter((item) => item.id !== person.id));
      setSuccess('Pessoa removida.');
    } catch (err) {
      setError(`Não foi possível remover. Detalhe: ${formatSupabaseError(err)}`);
    }
  }

  function handleGenerateScale() {
    setError('');
    setSuccess('');

    const normalizedConfig = {
      ...config,
      startAt: normalizeDatetimeLocal(config.startAt),
      endAt: normalizeDatetimeLocal(config.endAt),
    };

    const result = buildGeneratedScale(people, normalizedConfig);
    setGeneratedSlots(result.slots);
    setWarnings(result.warnings);

    if (result.slots.length === 0) {
      setError(result.warnings[0] || 'Não foi possível gerar a escala.');
      return;
    }

    setSuccess(`Escala gerada com ${result.slots.length} turno(s). Revise e salve/publica quando estiver tudo certo.`);
  }

  async function handleSaveScale() {
    setError('');
    setSuccess('');

    if (generatedSlots.length === 0) {
      setError('Gere uma escala antes de salvar.');
      return;
    }

    try {
      setSavingSchedule(true);
      const normalizedConfig = {
        ...config,
        startAt: normalizeDatetimeLocal(config.startAt),
        endAt: normalizeDatetimeLocal(config.endAt),
      };
      const schedule = await saveGeneratedScale({ config: normalizedConfig, slots: generatedSlots, status: 'published' });
      setSchedules((current) => [schedule, ...current]);
      setSelectedScheduleId(schedule.id);
      setSuccess('Escala salva/publicada com sucesso.');
    } catch (err) {
      setError(`Não foi possível salvar a escala. Detalhe: ${formatSupabaseError(err)}`);
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    const confirmed = window.confirm('Remover essa escala salva?');
    if (!confirmed) return;

    try {
      await deleteServiceSchedule(scheduleId);
      const nextSchedules = schedules.filter((schedule) => schedule.id !== scheduleId);
      setSchedules(nextSchedules);
      setSelectedScheduleId(nextSchedules[0]?.id || '');
      setSelectedAssignments([]);
      setSuccess('Escala removida.');
    } catch (err) {
      setError(`Não foi possível remover a escala. Detalhe: ${formatSupabaseError(err)}`);
    }
  }

  function handleExportGenerated() {
    if (generatedSlots.length === 0) return;
    downloadTextFile('escala-servico-alojamento.csv', exportScaleCsv(generatedSlots));
  }

  const selectedSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId);
  const groupedAssignments = selectedAssignments.reduce<Record<number, ServiceScaleAssignment[]>>((acc, assignment) => {
    acc[assignment.slot_number] = acc[assignment.slot_number] || [];
    acc[assignment.slot_number].push(assignment);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="service-scale-page">
        <div className="panel center">
          <div className="loader"></div>
          <p className="muted">Carregando módulo de escala...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="service-scale-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Serviço com propósito</p>
          <h2>Escala de Serviço</h2>
          <p className="muted">
            Cadastre pessoas, marque quem fará trilha e gere automaticamente os turnos do alojamento.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={loadAll}>Atualizar</button>
      </header>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <section className="admin-stats">
        <div className="card"><span className="muted">Pessoas</span><strong>{stats.total}</strong></div>
        <div className="card"><span className="muted">Ativos na escala</span><strong>{stats.active}</strong></div>
        <div className="card"><span className="muted">Homens/Mulheres ativos</span><strong>{stats.activeMen}/{stats.activeWomen}</strong></div>
        <div className="card"><span className="muted">Trilha</span><strong>{stats.trail}</strong></div>
      </section>

      <section className="grid two service-scale-main-grid">
        <div className="card">
          <h3>Cadastrar servo na escala</h3>
          <p className="muted">Quem estiver marcado como trilha não entra na escala automaticamente.</p>

          <form className="form" onSubmit={handleCreatePerson}>
            <div>
              <label>Nome</label>
              <input
                value={personForm.name}
                onChange={(event) => setPersonForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ex.: João Silva"
              />
            </div>

            <div className="grid two">
              <div>
                <label>Alojamento</label>
                <select
                  value={personForm.gender}
                  onChange={(event) => setPersonForm((current) => ({ ...current, gender: event.target.value as ServiceScaleGender }))}
                >
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </select>
              </div>

              <div>
                <label>Telefone</label>
                <input
                  value={personForm.phone}
                  onChange={(event) => setPersonForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div>
              <label>Setor/Função</label>
              <input
                value={personForm.sector}
                onChange={(event) => setPersonForm((current) => ({ ...current, sector: event.target.value }))}
                placeholder="Ex.: Apoio, cozinha, liderança..."
              />
            </div>

            <div className="service-check-row">
              <label>
                <input
                  type="checkbox"
                  checked={personForm.is_active}
                  onChange={(event) => setPersonForm((current) => ({
                    ...current,
                    is_active: event.target.checked,
                    does_trail: event.target.checked ? false : current.does_trail,
                  }))}
                />
                Ativo na escala
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={personForm.does_trail}
                  onChange={(event) => setPersonForm((current) => ({
                    ...current,
                    does_trail: event.target.checked,
                    is_active: event.target.checked ? false : current.is_active,
                  }))}
                />
                Fez/fará trilha
              </label>
            </div>

            <button type="submit" className="primary-button" disabled={savingPerson}>
              {savingPerson ? 'Cadastrando...' : 'Cadastrar servo na escala'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Configuração do serviço</h3>
          <p className="muted">Exemplo: dia 1 às 18:00 até dia 3 às 18:00, com serviço de 90 minutos.</p>

          <div className="form">
            <div>
              <label>Nome da escala</label>
              <input
                value={config.title}
                onChange={(event) => setConfig((current) => ({ ...current, title: event.target.value }))}
              />
            </div>

            <div className="grid two">
              <div>
                <label>Início</label>
                <input
                  type="datetime-local"
                  value={config.startAt}
                  onChange={(event) => setConfig((current) => ({ ...current, startAt: event.target.value }))}
                />
              </div>
              <div>
                <label>Fim</label>
                <input
                  type="datetime-local"
                  value={config.endAt}
                  onChange={(event) => setConfig((current) => ({ ...current, endAt: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid three">
              <div>
                <label>Minutos por serviço</label>
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={config.shiftMinutes}
                  onChange={(event) => setConfig((current) => ({ ...current, shiftMinutes: Number(event.target.value) || 90 }))}
                />
              </div>
              <div>
                <label>Homens por turno</label>
                <input
                  type="number"
                  min="0"
                  value={config.menPerShift}
                  onChange={(event) => setConfig((current) => ({ ...current, menPerShift: Number(event.target.value) || 0 }))}
                />
              </div>
              <div>
                <label>Mulheres por turno</label>
                <input
                  type="number"
                  min="0"
                  value={config.womenPerShift}
                  onChange={(event) => setConfig((current) => ({ ...current, womenPerShift: Number(event.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="grid two">
              <div>
                <label>Descanso mínimo em minutos</label>
                <input
                  type="number"
                  min="0"
                  step="30"
                  value={config.minRestMinutes}
                  onChange={(event) => setConfig((current) => ({ ...current, minRestMinutes: Number(event.target.value) || 0 }))}
                />
              </div>
              <div className="service-toggle-card">
                <label>
                  <input
                    type="checkbox"
                    checked={config.avoidConsecutive}
                    onChange={(event) => setConfig((current) => ({ ...current, avoidConsecutive: event.target.checked }))}
                  />
                  Evitar serviço colado
                </label>
              </div>
            </div>

            <div className="service-action-row">
              <button type="button" className="primary-button" onClick={handleGenerateScale}>Gerar escala</button>
              <button type="button" className="secondary-button" onClick={handleSaveScale} disabled={savingSchedule || generatedSlots.length === 0}>
                {savingSchedule ? 'Salvando...' : 'Salvar/Publicar'}
              </button>
              <button type="button" className="secondary-button" onClick={handleExportGenerated} disabled={generatedSlots.length === 0}>
                Exportar CSV
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-title-row">
          <div>
            <h3>Servos cadastrados</h3>
            <p className="muted">Use os botões para tirar alguém da escala ou marcar como trilha.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Alojamento</th>
                <th>Setor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 && (
                <tr><td colSpan={5}>Nenhuma pessoa cadastrada ainda.</td></tr>
              )}
              {people.map((person) => (
                <tr key={person.id}>
                  <td>
                    <strong>{person.name}</strong>
                    {person.phone && <small>{person.phone}</small>}
                  </td>
                  <td>{genderLabel(person.gender)}</td>
                  <td>{person.sector || '-'}</td>
                  <td>
                    <div className="status-stack">
                      <span className={person.is_active && !person.does_trail ? 'pill success' : 'pill muted-pill'}>
                        {person.is_active && !person.does_trail ? 'Ativo' : 'Fora da escala'}
                      </span>
                      {person.does_trail && <span className="pill warning">Trilha</span>}
                    </div>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="secondary-button" onClick={() => handleTogglePerson(person, 'is_active')}>
                        {person.is_active && !person.does_trail ? 'Desativar' : 'Ativar'}
                      </button>
                      <button type="button" className="secondary-button" onClick={() => handleTogglePerson(person, 'does_trail')}>
                        {person.does_trail ? 'Remover trilha' : 'Trilha'}
                      </button>
                      <button type="button" className="reject-button" onClick={() => handleDeletePerson(person)}>
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {warnings.length > 0 && (
        <section className="card warning-card">
          <h3>Avisos da geração</h3>
          <ul>
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      )}

      {generatedSlots.length > 0 && (
        <section className="card print-area">
          <div className="section-title-row">
            <div>
              <h3>Prévia da escala de serviço</h3>
              <p className="muted">Revise antes de salvar/publicar.</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => window.print()}>Imprimir</button>
          </div>

          <ScaleTable slots={generatedSlots} />

          <div className="service-summary-grid">
            {Object.entries(summary).map(([name, total]) => (
              <div className="summary-chip" key={name}>
                <span>{name}</span>
                <strong>{total} serviço(s)</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="section-title-row">
          <div>
            <h3>Escalas publicadas</h3>
            <p className="muted">Aqui ficam as escalas já publicadas no Supabase.</p>
          </div>
          {selectedSchedule && (
            <button type="button" className="reject-button" onClick={() => handleDeleteSchedule(selectedSchedule.id)}>
              Remover escala selecionada
            </button>
          )}
        </div>

        {schedules.length === 0 ? (
          <p className="muted">Nenhuma escala salva ainda.</p>
        ) : (
          <div className="form">
            <div>
              <label>Selecionar escala</label>
              <select value={selectedScheduleId} onChange={(event) => setSelectedScheduleId(event.target.value)}>
                {schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.title} — {formatDateTime(schedule.start_at)}
                  </option>
                ))}
              </select>
            </div>

            {selectedSchedule && (
              <SavedAssignmentsTable schedule={selectedSchedule} groupedAssignments={groupedAssignments} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ScaleTable({ slots }: { slots: GeneratedScaleSlot[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table service-scale-table">
        <thead>
          <tr>
            <th>Turno</th>
            <th>Início</th>
            <th>Fim</th>
            <th>Alojamento Masculino</th>
            <th>Alojamento Feminino</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot.slotNumber}>
              <td><strong>#{slot.slotNumber}</strong></td>
              <td>{formatDateTime(slot.startAt)}</td>
              <td>{formatDateTime(slot.endAt)}</td>
              <td>{slot.men.map((person) => person.name).join(' / ') || '-'}</td>
              <td>{slot.women.map((person) => person.name).join(' / ') || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SavedAssignmentsTable({
  schedule,
  groupedAssignments,
}: {
  schedule: ServiceScaleSchedule;
  groupedAssignments: Record<number, ServiceScaleAssignment[]>;
}) {
  const slots = Object.entries(groupedAssignments).map(([slotNumber, assignments]) => {
    const sorted = assignments.sort((a, b) => a.person_name.localeCompare(b.person_name));
    return {
      slotNumber: Number(slotNumber),
      startAt: sorted[0]?.slot_start,
      endAt: sorted[0]?.slot_end,
      men: sorted.filter((assignment) => assignment.accommodation === 'male').map((assignment) => assignment.person_name),
      women: sorted.filter((assignment) => assignment.accommodation === 'female').map((assignment) => assignment.person_name),
    };
  }).sort((a, b) => a.slotNumber - b.slotNumber);

  return (
    <div>
      <p className="muted">
        {schedule.title} · {formatDateTime(schedule.start_at)} até {formatDateTime(schedule.end_at)}
      </p>
      <div className="table-wrap">
        <table className="data-table service-scale-table">
          <thead>
            <tr>
              <th>Turno</th>
              <th>Início</th>
              <th>Fim</th>
              <th>Alojamento Masculino</th>
              <th>Alojamento Feminino</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.slotNumber}>
                <td><strong>#{slot.slotNumber}</strong></td>
                <td>{slot.startAt ? formatDateTime(slot.startAt) : '-'}</td>
                <td>{slot.endAt ? formatDateTime(slot.endAt) : '-'}</td>
                <td>{slot.men.join(' / ') || '-'}</td>
                <td>{slot.women.join(' / ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
