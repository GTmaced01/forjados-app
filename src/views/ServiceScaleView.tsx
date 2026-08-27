import { useEffect, useMemo, useState } from 'react';
import type {
  GeneratedScaleSlot,
  ServiceScaleAssignment,
  ServiceScaleConfig,
  ServiceScaleGender,
  ServiceScalePerson,
  ServiceScaleSchedule,
  ServiceScaleSlotRequirement,
} from '../types';
import {
  buildGeneratedScale,
  buildScaleSlotRequirements,
  createServicePerson,
  deleteServicePerson,
  downloadTextFile,
  exportScaleCsv,
  formatDateTime,
  formatSupabaseError,
  listAssignmentsBySchedule,
  listServicePeople,
  listServiceSchedules,
  saveGeneratedScale,
  syncApprovedProfilesToServiceScale,
  type ScaleGenerationMetrics,
  summarizeGeneratedScale,
  toDatetimeLocalValue,
  updateServicePerson,
} from '../services/serviceScale';
import { withTimeout } from '../services/safeAsync';
import { AdminHistoryDeleteButton } from '../components/AdminHistoryDeleteButton';
import { useAuth } from '../components/AuthProvider';

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

type PersonForm = typeof initialPersonForm;

function normalizeDatetimeLocal(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function genderLabel(gender: ServiceScaleGender | null) {
  if (gender === 'male') return 'Masculino';
  if (gender === 'female') return 'Feminino';
  return 'Definir alojamento';
}

export function ServiceScaleView() {
  const { isAdmin } = useAuth();
  const [people, setPeople] = useState<ServiceScalePerson[]>([]);
  const [schedules, setSchedules] = useState<ServiceScaleSchedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [selectedAssignments, setSelectedAssignments] = useState<ServiceScaleAssignment[]>([]);
  const [personForm, setPersonForm] = useState<PersonForm>(initialPersonForm);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [config, setConfig] = useState<ServiceScaleConfig>(initialConfig);
  const [slotRequirements, setSlotRequirements] = useState<ServiceScaleSlotRequirement[]>([]);
  const [generatedSlots, setGeneratedSlots] = useState<GeneratedScaleSlot[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [generationValid, setGenerationValid] = useState(false);
  const [generationMetrics, setGenerationMetrics] = useState<ScaleGenerationMetrics | null>(null);
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
      linked: people.filter((person) => person.user_id).length,
    };
  }, [people]);

  const summary = useMemo(() => summarizeGeneratedScale(generatedSlots), [generatedSlots]);

  async function loadAll() {
    try {
      setLoading(true);
      setError('');
      const syncResult = await withTimeout(
        syncApprovedProfilesToServiceScale(),
        10000,
        'Não foi possível sincronizar os usuários aprovados.'
      );
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
      if (syncResult.inserted > 0) {
        setSuccess(`${syncResult.inserted} usuário(s) aprovado(s) foram vinculados à escala. Defina o alojamento antes de gerar.`);
      }
      if (scheduleData.length > 0 && !selectedScheduleId) {
        setSelectedScheduleId(scheduleData[0].id);
      }
    } catch (err) {
      setError(`Não consegui carregar o módulo de escala. Detalhe: ${formatSupabaseError(err)}`);
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

  function invalidateGeneratedScale() {
    setGeneratedSlots([]);
    setGenerationValid(false);
    setGenerationMetrics(null);
  }

  function updateConfig<K extends keyof ServiceScaleConfig>(key: K, value: ServiceScaleConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
    if (key === 'startAt' || key === 'endAt' || key === 'shiftMinutes') {
      setSlotRequirements([]);
    }
    invalidateGeneratedScale();
  }

  function handlePrepareSlots() {
    setError('');
    setSuccess('');
    const normalizedConfig = {
      ...config,
      startAt: normalizeDatetimeLocal(config.startAt),
      endAt: normalizeDatetimeLocal(config.endAt),
    };
    const slots = buildScaleSlotRequirements(normalizedConfig);
    if (slots.length === 0 || slots.length > 1000) {
      setError(slots.length > 1000
        ? 'O período gera mais de 1.000 horários. Reduza o período ou aumente a duração.'
        : 'Revise o início, o fim e a duração antes de montar os horários.');
      return;
    }
    setSlotRequirements(slots);
    invalidateGeneratedScale();
    setSuccess(`${slots.length} faixa(s) preparada(s). Ajuste a quantidade necessária em cada horário.`);
  }

  function updateSlotRequirement(
    slotNumber: number,
    patch: Partial<Pick<ServiceScaleSlotRequirement, 'enabled' | 'menRequired' | 'womenRequired'>>
  ) {
    setSlotRequirements((current) => current.map((slot) => (
      slot.slotNumber === slotNumber ? { ...slot, ...patch } : slot
    )));
    invalidateGeneratedScale();
  }

  function beginEditPerson(person: ServiceScalePerson) {
    setEditingPersonId(person.id);
    setPersonForm({
      name: person.name,
      gender: person.gender || 'male',
      phone: person.phone || '',
      sector: person.sector || '',
      is_active: person.is_active && !person.does_trail,
      does_trail: person.does_trail,
      notes: person.notes || '',
    });
    setError('');
    setSuccess('');
  }

  function cancelEditPerson() {
    setEditingPersonId(null);
    setPersonForm(initialPersonForm);
  }

  async function handleSubmitPerson(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const name = personForm.name.trim();
    const sector = personForm.sector.trim();
    if (name.length < 3) {
      setError('Informe o nome completo da pessoa.');
      return;
    }
    if (!sector) {
      setError('Informe o setor ou função para facilitar a organização da escala.');
      return;
    }
    if (people.some((person) => person.id !== editingPersonId && person.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError('Essa pessoa já está cadastrada na lista de escala.');
      return;
    }

    try {
      setSavingPerson(true);
      if (editingPersonId) {
        const updated = await updateServicePerson(editingPersonId, {
          ...personForm,
          name,
          sector,
          gender: personForm.gender,
        });
        setPeople((current) => current.map((item) => (item.id === editingPersonId ? updated : item)).sort((a, b) => a.name.localeCompare(b.name)));
        setSuccess('Dados do servo atualizados.');
      } else {
        const created = await createServicePerson({ ...personForm, name, sector });
        setPeople((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
        setSuccess('Servo cadastrado com sucesso.');
      }
      cancelEditPerson();
      invalidateGeneratedScale();
    } catch (err) {
      const detail = formatSupabaseError(err);
      setError(detail.includes('display_name')
        ? 'O cadastro antigo do módulo está incompleto. Atualize o aplicativo e tente novamente.'
        : `Não foi possível salvar o servo. Detalhe: ${detail}`);
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
      invalidateGeneratedScale();
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
      invalidateGeneratedScale();
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

    const result = buildGeneratedScale(people, normalizedConfig, slotRequirements);
    setGeneratedSlots(result.slots);
    setWarnings(result.warnings);
    setGenerationValid(result.isValid);
    setGenerationMetrics(result.metrics);

    if (!result.isValid || result.slots.length === 0) {
      setError(result.warnings.join(' ') || 'Não foi possível gerar uma escala completa.');
      return;
    }

    setSuccess(`Prévia válida com ${result.slots.length} turno(s). Revise antes de publicar.`);
  }

  async function handleSaveScale() {
    setError('');
    setSuccess('');

    const normalizedConfig = {
      ...config,
      startAt: normalizeDatetimeLocal(config.startAt),
      endAt: normalizeDatetimeLocal(config.endAt),
    };
    const validation = buildGeneratedScale(people, normalizedConfig, slotRequirements);
    if (!validation.isValid || validation.slots.length === 0) {
      setWarnings(validation.warnings);
      setGenerationValid(false);
      setGenerationMetrics(validation.metrics);
      setError(validation.warnings.join(' ') || 'Gere uma escala completa antes de salvar.');
      return;
    }

    try {
      setSavingSchedule(true);
      const schedule = await saveGeneratedScale({ config: normalizedConfig, slots: validation.slots, status: 'published' });
      setSchedules((current) => [schedule, ...current]);
      setSelectedScheduleId(schedule.id);
      const linkedUsers = new Set(
        validation.slots.flatMap((slot) => [...slot.men, ...slot.women])
          .map((person) => person.user_id)
          .filter(Boolean)
      ).size;
      setSuccess(
        linkedUsers > 0
          ? `Escala publicada. ${linkedUsers} pessoa(s) com conta vinculada receberam a escala por notificação.`
          : 'Escala publicada. As pessoas cadastradas manualmente não têm conta vinculada para receber notificação.'
      );
    } catch (err) {
      setError(`Não foi possível salvar a escala. Detalhe: ${formatSupabaseError(err)}`);
    } finally {
      setSavingSchedule(false);
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

      <section className="admin-stats service-scale-stats">
        <div className="card"><span className="muted">Pessoas</span><strong>{stats.total}</strong></div>
        <div className="card"><span className="muted">Ativos na escala</span><strong>{stats.active}</strong></div>
        <div className="card"><span className="muted">Homens/Mulheres ativos</span><strong>{stats.activeMen}/{stats.activeWomen}</strong></div>
        <div className="card"><span className="muted">Trilha</span><strong>{stats.trail}</strong></div>
        <div className="card"><span className="muted">Com notificação</span><strong>{stats.linked}</strong></div>
      </section>

      <section className="grid two service-scale-main-grid">
        <div className="card">
          <h3>{editingPersonId ? 'Editar servo da escala' : 'Cadastrar servo na escala'}</h3>
          <p className="muted">O alojamento e o setor são obrigatórios para que a geração seja segura.</p>

          <form className="form" onSubmit={handleSubmitPerson}>
            <div>
              <label>Nome</label>
              <input
                required
                minLength={3}
                maxLength={160}
                value={personForm.name}
                onChange={(event) => setPersonForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ex.: João Silva"
              />
            </div>

            <div className="grid two">
              <div>
                <label>Alojamento</label>
                <select
                  required
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
                  maxLength={40}
                  onChange={(event) => setPersonForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div>
              <label>Setor/Função</label>
              <input
                required
                maxLength={160}
                value={personForm.sector}
                onChange={(event) => setPersonForm((current) => ({ ...current, sector: event.target.value }))}
                placeholder="Ex.: Apoio, cozinha, liderança..."
              />
            </div>

            <div>
              <label>Observações</label>
              <textarea
                value={personForm.notes}
                maxLength={2000}
                onChange={(event) => setPersonForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Restrições de horário, cuidados ou outras observações"
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

            <div className="service-action-row">
              <button type="submit" className="primary-button" disabled={savingPerson}>
                {savingPerson ? 'Salvando...' : editingPersonId ? 'Salvar alterações' : 'Cadastrar servo na escala'}
              </button>
              {editingPersonId && <button type="button" className="secondary-button" onClick={cancelEditPerson}>Cancelar edição</button>}
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Configuração do serviço</h3>
          <p className="muted">Defina o período, monte os horários e informe quantas pessoas serão necessárias em cada faixa.</p>

          <div className="form">
            <div>
              <label>Nome da escala</label>
              <input
                required
                maxLength={160}
                value={config.title}
              onChange={(event) => updateConfig('title', event.target.value)}
              />
            </div>

            <div className="grid two">
              <div>
                <label>Início</label>
                <input
                  type="datetime-local"
                  required
                  value={config.startAt}
                  onChange={(event) => updateConfig('startAt', event.target.value)}
                />
              </div>
              <div>
                <label>Fim</label>
                <input
                  type="datetime-local"
                  required
                  value={config.endAt}
                  onChange={(event) => updateConfig('endAt', event.target.value)}
                />
              </div>
            </div>

            <div className="grid three">
              <div>
                <label>Minutos por serviço</label>
                <input
                  type="number"
                  min="15"
                  max="720"
                  step="15"
                  required
                  value={config.shiftMinutes}
                  onChange={(event) => updateConfig('shiftMinutes', Number(event.target.value))}
                />
              </div>
              <div>
                <label>Padrão masculino</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  required
                  value={config.menPerShift}
                  onChange={(event) => updateConfig('menPerShift', Number(event.target.value))}
                />
              </div>
              <div>
                <label>Padrão feminino</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  required
                  value={config.womenPerShift}
                  onChange={(event) => updateConfig('womenPerShift', Number(event.target.value))}
                />
              </div>
            </div>

            <div className="grid two">
              <div>
                <label>Descanso mínimo em minutos</label>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  step="30"
                  required
                  value={config.minRestMinutes}
                  onChange={(event) => updateConfig('minRestMinutes', Number(event.target.value))}
                />
              </div>
              <div className="service-toggle-card">
                <label>
                  <input
                    type="checkbox"
                    checked={config.avoidConsecutive}
                    onChange={(event) => updateConfig('avoidConsecutive', event.target.checked)}
                  />
                  Evitar serviço colado
                </label>
              </div>
            </div>

            <div className="service-action-row">
              <button type="button" className="secondary-button" onClick={handlePrepareSlots}>1. Montar horários</button>
              <button type="button" className="primary-button" onClick={handleGenerateScale} disabled={slotRequirements.length === 0}>2. Gerar escala</button>
              <button type="button" className="secondary-button" onClick={handleSaveScale} disabled={savingSchedule || !generationValid || generatedSlots.length === 0}>
                {savingSchedule ? 'Salvando...' : '3. Salvar/Publicar'}
              </button>
              <button type="button" className="secondary-button" onClick={handleExportGenerated} disabled={generatedSlots.length === 0}>
                Exportar CSV
              </button>
            </div>
          </div>
        </div>
      </section>

      {slotRequirements.length > 0 && (
        <section className="card service-slot-planner">
          <div className="section-title-row">
            <div>
              <h3>Necessidade por horário</h3>
              <p className="muted">Desative horários sem pessoas no alojamento. Nos demais, use inclusive apenas 1 pessoa quando for suficiente.</p>
            </div>
            <span className="pill success">
              {slotRequirements.filter((slot) => slot.enabled && slot.menRequired + slot.womenRequired > 0).length} horário(s) ativo(s)
            </span>
          </div>
          <div className="table-wrap">
            <table className="data-table service-slot-planner-table">
              <thead>
                <tr>
                  <th>Data e horário</th>
                  <th>Há pessoas no alojamento?</th>
                  <th>Masculino</th>
                  <th>Feminino</th>
                </tr>
              </thead>
              <tbody>
                {slotRequirements.map((slot) => (
                  <tr key={`${slot.slotNumber}-${slot.startAt}`} className={slot.enabled ? '' : 'service-slot-disabled'}>
                    <td data-label="Data e horário">
                      <strong>{formatDateTime(slot.startAt)}</strong>
                      <small>até {formatDateTime(slot.endAt)}</small>
                    </td>
                    <td data-label="Há pessoas?">
                      <label className="service-slot-toggle">
                        <input
                          type="checkbox"
                          checked={slot.enabled}
                          onChange={(event) => updateSlotRequirement(slot.slotNumber, { enabled: event.target.checked })}
                        />
                        <span>{slot.enabled ? 'Sim, escalar' : 'Não escalar'}</span>
                      </label>
                    </td>
                    <td data-label="Masculino">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        aria-label={`Quantidade masculina em ${formatDateTime(slot.startAt)}`}
                        disabled={!slot.enabled}
                        value={slot.menRequired}
                        onChange={(event) => updateSlotRequirement(slot.slotNumber, { menRequired: Number(event.target.value) })}
                      />
                    </td>
                    <td data-label="Feminino">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        aria-label={`Quantidade feminina em ${formatDateTime(slot.startAt)}`}
                        disabled={!slot.enabled}
                        value={slot.womenRequired}
                        onChange={(event) => updateSlotRequirement(slot.slotNumber, { womenRequired: Number(event.target.value) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="section-title-row">
          <div>
            <h3>Servos cadastrados</h3>
            <p className="muted">Usuários vinculados recebem a escala no aplicativo. Cadastros manuais continuam válidos, mas não recebem notificação.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table service-people-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Alojamento</th>
                <th>Setor</th>
                <th>Status</th>
                <th>Notificação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 && (
                <tr><td colSpan={6}>Nenhuma pessoa cadastrada ainda.</td></tr>
              )}
              {people.map((person) => (
                <tr key={person.id}>
                  <td data-label="Nome">
                    <strong>{person.name}</strong>
                    {person.phone && <small>{person.phone}</small>}
                  </td>
                  <td data-label="Alojamento">{genderLabel(person.gender)}</td>
                  <td data-label="Setor">{person.sector || '-'}</td>
                  <td data-label="Status">
                    <div className="status-stack">
                      <span className={person.is_active && !person.does_trail ? 'pill success' : 'pill muted-pill'}>
                        {person.is_active && !person.does_trail ? 'Ativo' : 'Fora da escala'}
                      </span>
                      {person.does_trail && <span className="pill warning">Trilha</span>}
                    </div>
                  </td>
                  <td data-label="Notificação">
                    <span className={person.user_id ? 'pill success' : 'pill muted-pill'}>
                      {person.user_id ? 'Conta vinculada' : 'Cadastro manual'}
                    </span>
                  </td>
                  <td data-label="Ações">
                    <div className="table-actions">
                      <button type="button" className="secondary-button" onClick={() => beginEditPerson(person)}>
                        Editar
                      </button>
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
          <h3>Checklist da geração</h3>
          {generationMetrics && (
            <div className="service-preflight-grid">
              <div><span>Turnos previstos</span><strong>{generationMetrics.totalSlots}</strong></div>
              <div><span>Alocações esperadas</span><strong>{generationMetrics.expectedAssignments}</strong></div>
              <div><span>Homens ativos</span><strong>{generationMetrics.activeMen}</strong></div>
              <div><span>Mulheres ativas</span><strong>{generationMetrics.activeWomen}</strong></div>
            </div>
          )}
          <p className={generationValid ? 'pill success' : 'pill warning'}>
            {generationValid ? 'Prévia pronta para publicação' : 'Ajustes necessários antes de publicar'}
          </p>
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
          {selectedSchedule && isAdmin && (
            <AdminHistoryDeleteButton
              entityType="service_scale_schedules"
              entityId={selectedSchedule.id}
              itemLabel={`a escala “${selectedSchedule.title}”`}
              buttonLabel="Excluir escala selecionada"
              onDeleted={() => {
                const nextSchedules = schedules.filter((schedule) => schedule.id !== selectedSchedule.id);
                setSchedules(nextSchedules);
                setSelectedScheduleId(nextSchedules[0]?.id || '');
                setSelectedAssignments([]);
                setSuccess('Escala retirada do histórico e preservada na auditoria.');
              }}
            />
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
              <td data-label="Turno"><strong>#{slot.slotNumber}</strong></td>
              <td data-label="Início">{formatDateTime(slot.startAt)}</td>
              <td data-label="Fim">{formatDateTime(slot.endAt)}</td>
              <td data-label="Alojamento masculino"><strong>{slot.menRequired}:</strong> {slot.men.map((person) => person.name).join(' / ') || '-'}</td>
              <td data-label="Alojamento feminino"><strong>{slot.womenRequired}:</strong> {slot.women.map((person) => person.name).join(' / ') || '-'}</td>
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
                <td data-label="Turno"><strong>#{slot.slotNumber}</strong></td>
                <td data-label="Início">{slot.startAt ? formatDateTime(slot.startAt) : '-'}</td>
                <td data-label="Fim">{slot.endAt ? formatDateTime(slot.endAt) : '-'}</td>
                <td data-label="Alojamento masculino">{slot.men.join(' / ') || '-'}</td>
                <td data-label="Alojamento feminino">{slot.women.join(' / ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
