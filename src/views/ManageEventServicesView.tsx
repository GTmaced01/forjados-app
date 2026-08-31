import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Download, Edit3, Plus, RefreshCw, Save, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { getActiveRetreatEvent } from '../services/eventSettings';
import {
  listEventServicePeople,
  listEventServicesSnapshot,
  removeEventServiceAssignment,
  removeEventServicePosition,
  removeEventServiceSlot,
  saveEventServiceAssignment,
  saveEventServicePosition,
  saveEventServiceSlot,
  saveEventServiceUnit,
} from '../services/eventServices';
import { printEventGroupPlan } from '../services/exporters';
import { GroupRoutePlanEditor } from './GroupRoutePlanEditor';
import type {
  EventServiceAssignment,
  EventServicePersonOption,
  EventServiceUnitType,
  EventServicesSnapshot,
  RetreatEventSettings,
} from '../types';

const PAGE_COPY: Record<EventServiceUnitType, { eyebrow: string; title: string; description: string; singular: string }> = {
  character: { eyebrow: 'Papéis da jornada', title: 'Personagens', description: 'Defina os personagens de cada grupo e quem exercerá cada papel.', singular: 'personagem' },
  sector: { eyebrow: 'Times de serviço', title: 'Setores', description: 'Organize os setores, integrantes, líderes e a equipe principal de cada pessoa.', singular: 'setor' },
  location: { eyebrow: 'Experiências do roteiro', title: 'Oficinas / Locais', description: 'Cadastre oficinas, funções próprias e as pessoas responsáveis por cada local.', singular: 'oficina / local' },
  group: { eyebrow: 'Equipes do retiro', title: 'Grupos', description: 'Monte cada grupo com equipe, personagens, participantes externos e horários.', singular: 'grupo' },
  scale: { eyebrow: 'Postos e turnos', title: 'Escalas operacionais', description: 'Organize postos adicionais e seus horários sem alterar a escala automática de alojamento.', singular: 'escala' },
};

const EMPTY_SNAPSHOT: EventServicesSnapshot = { units: [], positions: [], assignments: [], slots: [] };
const emptyAssignment = {
  personSource: 'user' as 'user' | 'external',
  user_id: '',
  external_name: '',
  assignment_kind: 'staff' as 'staff' | 'participant',
  position_id: '',
  linked_character_id: '',
  group_id: '',
  role_title: '',
  is_leader: false,
  is_primary: false,
  starts_at: '',
  ends_at: '',
  notes: '',
};

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function ManageEventServicesView({ unitType }: { unitType: EventServiceUnitType }) {
  const { profile, isAdmin, isDirector } = useAuth();
  const fullManager = isAdmin || isDirector;
  const copy = PAGE_COPY[unitType];
  const [edition, setEdition] = useState<RetreatEventSettings | null>(null);
  const [snapshot, setSnapshot] = useState<EventServicesSnapshot>(EMPTY_SNAPSHOT);
  const [people, setPeople] = useState<EventServicePersonOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [assignment, setAssignment] = useState(emptyAssignment);
  const [editingAssignmentId, setEditingAssignmentId] = useState('');
  const [positionName, setPositionName] = useState('');
  const [slotForm, setSlotForm] = useState({ title: '', location_id: '', starts_at: '', ends_at: '', notes: '' });
  const [newUnit, setNewUnit] = useState({ name: '', description: '', color: '', min_people: 0, max_people: '', per_group: false });
  const [showNewUnit, setShowNewUnit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load(preferredId?: string) {
    setLoading(true);
    setError('');
    try {
      const activeEdition = await getActiveRetreatEvent();
      setEdition(activeEdition);
      if (!activeEdition) {
        setSnapshot(EMPTY_SNAPSHOT);
        return;
      }
      const [data, personOptions] = await Promise.all([
        listEventServicesSnapshot(activeEdition.id),
        listEventServicePeople(),
      ]);
      setSnapshot(data);
      setPeople(personOptions);
      const available = data.units.filter((unit) => unit.unit_type === unitType && unit.is_active);
      setSelectedId((current) => preferredId || (available.some((unit) => unit.id === current) ? current : available[0]?.id || ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Não foi possível carregar ${copy.title.toLocaleLowerCase('pt-BR')}.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [unitType]);

  const units = useMemo(() => snapshot.units.filter((unit) => unit.unit_type === unitType && unit.is_active), [snapshot.units, unitType]);
  const selected = snapshot.units.find((unit) => unit.id === selectedId) || null;
  const selectedAssignments = useMemo(
    () => snapshot.assignments.filter((item) => item.unit_id === selectedId),
    [selectedId, snapshot.assignments]
  );
  const selectedPositions = snapshot.positions.filter((position) => position.unit_id === selectedId && position.is_active);
  const selectedSlots = snapshot.slots.filter((slot) => slot.unit_id === selectedId);
  const groups = snapshot.units.filter((unit) => unit.unit_type === 'group' && unit.is_active);
  const characters = snapshot.units.filter((unit) => unit.unit_type === 'character' && unit.is_active);
  const locations = snapshot.units.filter((unit) => unit.unit_type === 'location' && unit.is_active);
  const unitById = new Map(snapshot.units.map((unit) => [unit.id, unit]));
  const positionById = new Map(snapshot.positions.map((position) => [position.id, position]));
  const canManageSelected = Boolean(selected && (fullManager || (unitType === 'sector' && selectedAssignments.some((item) => item.user_id === profile?.id && item.is_leader))));

  function resetAssignment() {
    setAssignment({ ...emptyAssignment, assignment_kind: unitType === 'group' ? 'participant' : 'staff' });
    setEditingAssignmentId('');
  }

  function editAssignment(item: EventServiceAssignment) {
    setEditingAssignmentId(item.id);
    setAssignment({
      personSource: item.user_id ? 'user' : 'external',
      user_id: item.user_id || '',
      external_name: item.external_name || '',
      assignment_kind: item.assignment_kind,
      position_id: item.position_id || '',
      linked_character_id: item.linked_character_id || '',
      group_id: item.group_id || '',
      role_title: item.role_title || '',
      is_leader: item.is_leader,
      is_primary: item.is_primary,
      starts_at: toLocalInput(item.starts_at),
      ends_at: toLocalInput(item.ends_at),
      notes: item.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleAssignmentSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!edition || !selected) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (assignment.personSource === 'user' && !assignment.user_id) throw new Error('Escolha um usuário do aplicativo.');
      if (assignment.personSource === 'external' && assignment.external_name.trim().length < 2) throw new Error('Informe o nome do participante externo.');
      if (assignment.ends_at && (!assignment.starts_at || new Date(assignment.ends_at) <= new Date(assignment.starts_at))) throw new Error('O término deve ser posterior ao início.');
      await saveEventServiceAssignment({
        edition_id: edition.id,
        unit_id: selected.id,
        user_id: assignment.personSource === 'user' ? assignment.user_id : null,
        external_name: assignment.personSource === 'external' ? assignment.external_name : '',
        assignment_kind: assignment.assignment_kind,
        position_id: assignment.position_id || null,
        linked_character_id: assignment.linked_character_id || null,
        group_id: unitType === 'group' ? selected.id : assignment.group_id || null,
        role_title: assignment.role_title,
        is_leader: unitType === 'sector' && assignment.is_leader,
        is_primary: unitType === 'sector' && assignment.is_primary,
        starts_at: assignment.starts_at ? new Date(assignment.starts_at).toISOString() : null,
        ends_at: assignment.ends_at ? new Date(assignment.ends_at).toISOString() : null,
        notes: assignment.notes,
      }, editingAssignmentId || undefined);
      setSuccess(editingAssignmentId ? 'Escala atualizada.' : 'Pessoa adicionada à escala.');
      resetAssignment();
      await load(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a pessoa na escala.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveAssignment(item: EventServiceAssignment) {
    if (!window.confirm(`Remover ${item.person_name} desta função?`)) return;
    try {
      await removeEventServiceAssignment(item.id);
      setSuccess('Pessoa removida da função.');
      await load(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover a pessoa.');
    }
  }

  async function handleAddPosition(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || positionName.trim().length < 2) return;
    setSaving(true);
    try {
      await saveEventServicePosition({ unit_id: selected.id, name: positionName });
      setPositionName('');
      setSuccess('Função específica adicionada.');
      await load(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar a função.');
    } finally { setSaving(false); }
  }

  async function handleAddSlot(event: React.FormEvent) {
    event.preventDefault();
    if (!edition || !selected) return;
    setSaving(true);
    try {
      if (!slotForm.title.trim() || !slotForm.starts_at || !slotForm.ends_at) throw new Error('Preencha nome, início e término do horário.');
      await saveEventServiceSlot({
        edition_id: edition.id,
        unit_id: selected.id,
        location_id: slotForm.location_id || null,
        title: slotForm.title,
        starts_at: new Date(slotForm.starts_at).toISOString(),
        ends_at: new Date(slotForm.ends_at).toISOString(),
        notes: slotForm.notes,
      });
      setSlotForm({ title: '', location_id: '', starts_at: '', ends_at: '', notes: '' });
      setSuccess('Horário adicionado.');
      await load(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar o horário.');
    } finally { setSaving(false); }
  }

  async function handleCreateUnit(event: React.FormEvent) {
    event.preventDefault();
    if (!edition) return;
    setSaving(true);
    try {
      if (newUnit.name.trim().length < 2) throw new Error(`Informe o nome do novo ${copy.singular}.`);
      await saveEventServiceUnit({
        edition_id: edition.id,
        unit_type: unitType,
        name: newUnit.name,
        description: newUnit.description,
        color: unitType === 'group' ? newUnit.color : '',
        min_people: newUnit.min_people,
        max_people: newUnit.max_people === '' ? null : Number(newUnit.max_people),
        per_group: unitType === 'character' && newUnit.per_group,
      });
      setNewUnit({ name: '', description: '', color: '', min_people: 0, max_people: '', per_group: false });
      setShowNewUnit(false);
      setSuccess(`${copy.title.replace(/s$/, '')} adicionado com sucesso.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Não foi possível criar o ${copy.singular}.`);
    } finally { setSaving(false); }
  }

  async function handleToggleUnit() {
    if (!selected || !window.confirm(`Arquivar “${selected.name}”? As escalas vinculadas serão preservadas no histórico.`)) return;
    try {
      await saveEventServiceUnit({ ...selected, is_active: false }, selected.id);
      setSuccess(`${selected.name} arquivado.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível arquivar.'); }
  }

  return (
    <div className="manage-services-page">
      <div className="admin-header">
        <div><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2><p className="muted">{copy.description}</p></div>
        <div className="header-actions"><button type="button" className="secondary-button" onClick={() => void load(selectedId)} disabled={loading}><RefreshCw size={16} /> Atualizar</button>{fullManager && <button type="button" className="primary-button" onClick={() => setShowNewUnit((value) => !value)}><Plus size={16} /> Novo</button>}</div>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}

      {showNewUnit && fullManager && <section className="panel wide"><h3>Novo {copy.singular}</h3><form className="service-unit-form" onSubmit={handleCreateUnit}><input required placeholder="Nome" value={newUnit.name} onChange={(event) => setNewUnit({ ...newUnit, name: event.target.value })} /><input placeholder="Descrição" value={newUnit.description} onChange={(event) => setNewUnit({ ...newUnit, description: event.target.value })} />{unitType === 'group' && <label>Cor <input type="color" value={newUnit.color || '#9A6B2F'} onChange={(event) => setNewUnit({ ...newUnit, color: event.target.value })} /></label>}{unitType === 'character' && <><label>Mínimo <input type="number" min="0" value={newUnit.min_people} onChange={(event) => setNewUnit({ ...newUnit, min_people: Number(event.target.value) })} /></label><label>Máximo <input type="number" min="0" value={newUnit.max_people} onChange={(event) => setNewUnit({ ...newUnit, max_people: event.target.value })} /></label><label className="check-line"><input type="checkbox" checked={newUnit.per_group} onChange={(event) => setNewUnit({ ...newUnit, per_group: event.target.checked })} /> Limite por grupo</label></>}<button className="primary-button" disabled={saving}><Save size={15} /> Salvar</button></form></section>}

      {loading ? <section className="panel wide center"><div className="loader" /></section> : !edition ? <section className="panel wide"><h3>Configure uma edição ativa primeiro.</h3></section> : (
        <div className="manage-services-layout">
          <aside className="service-unit-list"><h3>{copy.title}</h3>{units.map((unit) => <button type="button" key={unit.id} className={selectedId === unit.id ? 'active' : ''} onClick={() => { setSelectedId(unit.id); resetAssignment(); }}><span style={unit.color ? { background: unit.color } : undefined} /> <strong>{unit.name}</strong><small>{snapshot.assignments.filter((item) => item.unit_id === unit.id).length} pessoa(s)</small></button>)}</aside>

          {selected ? <div className="service-manager-main">
            <section className="panel wide service-selected-header"><div><p className="eyebrow">{copy.singular}</p><h3>{selected.name}</h3><p className="muted">{selected.description || 'Sem descrição.'}</p></div><div className="header-actions">{unitType === 'group' && <button type="button" className="secondary-button" onClick={() => printEventGroupPlan({ editionTitle: edition.title, group: selected, units: snapshot.units, positions: snapshot.positions, assignments: snapshot.assignments, slots: snapshot.slots })}><Download size={16} /> Exportar PDF</button>}{fullManager && <button type="button" className="secondary-button danger-button" onClick={() => void handleToggleUnit()}><Trash2 size={15} /> Arquivar</button>}</div></section>

            {canManageSelected ? <>
              <section className="panel wide service-sheet-panel">
                <div className="section-header"><div><p className="eyebrow">Edição rápida</p><h3>Pessoas escaladas</h3></div><UsersRound size={22} /></div>
                <div className="service-sheet-wrap"><table className="service-sheet"><thead><tr><th>Nome</th><th>Vínculo</th><th>Função / personagem</th><th>Grupo</th><th>Horário</th><th>Ações</th></tr></thead><tbody>{selectedAssignments.map((item) => <tr key={item.id}><td><strong>{item.person_name}</strong>{item.is_leader && <small>Líder</small>}{item.is_primary && <small>Equipe principal</small>}</td><td>{item.assignment_kind === 'participant' ? 'Participante externo' : item.user_id ? 'Usuário do app' : 'Equipe externa'}</td><td>{item.position_id ? positionById.get(item.position_id)?.name : item.linked_character_id ? unitById.get(item.linked_character_id)?.name : item.role_title || '—'}</td><td>{item.group_id ? unitById.get(item.group_id)?.name : '—'}</td><td>{item.starts_at ? `${formatTime(item.starts_at)} – ${formatTime(item.ends_at)}` : '—'}</td><td><div className="table-actions"><button type="button" className="icon-button" aria-label={`Editar ${item.person_name}`} onClick={() => editAssignment(item)}><Edit3 size={15} /></button><button type="button" className="icon-button danger-button" aria-label={`Remover ${item.person_name}`} onClick={() => void handleRemoveAssignment(item)}><Trash2 size={15} /></button></div></td></tr>)}{!selectedAssignments.length && <tr><td colSpan={6} className="muted">Nenhuma pessoa escalada.</td></tr>}</tbody></table></div>

                <form className="service-assignment-form" onSubmit={handleAssignmentSubmit}>
                  <h4>{editingAssignmentId ? 'Editar pessoa' : 'Adicionar pessoa'}</h4>
                  <label>Origem<select value={assignment.personSource} onChange={(event) => setAssignment({ ...assignment, personSource: event.target.value as 'user' | 'external', user_id: '', external_name: '', assignment_kind: event.target.value === 'external' && unitType === 'group' ? 'participant' : 'staff' })}><option value="user">Usuário do aplicativo</option><option value="external">Pessoa externa</option></select></label>
                  {assignment.personSource === 'user' ? <label>Pessoa<select required value={assignment.user_id} onChange={(event) => setAssignment({ ...assignment, user_id: event.target.value })}><option value="">Selecione</option>{people.map((person) => <option key={person.user_id} value={person.user_id}>{person.display_name} · {person.primary_team || person.role}</option>)}</select></label> : <label>Nome completo<input required value={assignment.external_name} onChange={(event) => setAssignment({ ...assignment, external_name: event.target.value })} /></label>}
                  {assignment.personSource === 'external' && <label>Tipo<select value={assignment.assignment_kind} onChange={(event) => setAssignment({ ...assignment, assignment_kind: event.target.value as 'staff' | 'participant' })}><option value="participant">Participante</option><option value="staff">Equipe externa</option></select></label>}
                  {selectedPositions.length > 0 && <label>Função específica<select value={assignment.position_id} onChange={(event) => setAssignment({ ...assignment, position_id: event.target.value })}><option value="">Sem função específica</option>{selectedPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select></label>}
                  {unitType === 'group' && <label>Personagem<select value={assignment.linked_character_id} onChange={(event) => setAssignment({ ...assignment, linked_character_id: event.target.value })}><option value="">Participante / sem personagem</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>}
                  {unitType === 'character' && <label>Grupo<select required={selected.per_group} value={assignment.group_id} onChange={(event) => setAssignment({ ...assignment, group_id: event.target.value })}><option value="">Sem grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
                  <label>Observação / função livre<input value={assignment.role_title} maxLength={160} onChange={(event) => setAssignment({ ...assignment, role_title: event.target.value })} /></label>
                  {unitType === 'sector' && <div className="service-checks"><label><input type="checkbox" checked={assignment.is_leader} onChange={(event) => setAssignment({ ...assignment, is_leader: event.target.checked })} /> Líder do setor</label><label><input type="checkbox" checked={assignment.is_primary} onChange={(event) => setAssignment({ ...assignment, is_primary: event.target.checked })} /> Equipe principal</label></div>}
                  <label>Início opcional<input type="datetime-local" value={assignment.starts_at} onChange={(event) => setAssignment({ ...assignment, starts_at: event.target.value })} /></label><label>Término opcional<input type="datetime-local" value={assignment.ends_at} onChange={(event) => setAssignment({ ...assignment, ends_at: event.target.value })} /></label>
                  <label className="service-notes-field">Notas<textarea value={assignment.notes} maxLength={1000} onChange={(event) => setAssignment({ ...assignment, notes: event.target.value })} /></label>
                  <div className="header-actions"><button className="primary-button" disabled={saving}><UserPlus size={16} /> {saving ? 'Salvando...' : editingAssignmentId ? 'Salvar edição' : 'Adicionar'}</button>{editingAssignmentId && <button type="button" className="secondary-button" onClick={resetAssignment}>Cancelar edição</button>}</div>
                </form>
              </section>

              {(unitType === 'location' || unitType === 'sector' || unitType === 'scale') && <section className="panel wide"><div className="section-header"><div><p className="eyebrow">Funções próprias</p><h3>Cargos desta área</h3></div></div><div className="chips">{selectedPositions.map((position) => <span className="chip active" key={position.id}>{position.name}<button type="button" aria-label={`Remover ${position.name}`} onClick={async () => { await removeEventServicePosition(position.id); await load(selected.id); }}>×</button></span>)}</div><form className="inline-add-form" onSubmit={handleAddPosition}><input placeholder="Ex.: Coordenador, Ator, Apoio" value={positionName} onChange={(event) => setPositionName(event.target.value)} /><button className="secondary-button" disabled={saving}><Plus size={15} /> Adicionar função</button></form></section>}

              {unitType === 'group' && <GroupRoutePlanEditor groupId={selected.id} groupName={selected.name} />}

              {(unitType === 'location' || unitType === 'scale') && <section className="panel wide"><div className="section-header"><div><p className="eyebrow">Horários</p><h3>Agenda desta área</h3></div><CalendarPlus size={22} /></div>{selectedSlots.length > 0 && <div className="service-slot-list">{selectedSlots.map((slot) => <div key={slot.id}><strong>{slot.title}</strong><span>{formatTime(slot.starts_at)} até {formatTime(slot.ends_at)}{slot.location_id ? ` · ${unitById.get(slot.location_id)?.name || ''}` : ''}</span><button type="button" className="icon-button danger-button" aria-label={`Remover ${slot.title}`} onClick={async () => { await removeEventServiceSlot(slot.id); await load(selected.id); }}><Trash2 size={15} /></button></div>)}</div>}<form className="service-slot-form" onSubmit={handleAddSlot}><input required placeholder="Atividade / turno" value={slotForm.title} onChange={(event) => setSlotForm({ ...slotForm, title: event.target.value })} /><input required type="datetime-local" value={slotForm.starts_at} onChange={(event) => setSlotForm({ ...slotForm, starts_at: event.target.value })} /><input required type="datetime-local" value={slotForm.ends_at} onChange={(event) => setSlotForm({ ...slotForm, ends_at: event.target.value })} /><select value={slotForm.location_id} onChange={(event) => setSlotForm({ ...slotForm, location_id: event.target.value })}><option value="">Sem local vinculado</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><input placeholder="Observações" value={slotForm.notes} onChange={(event) => setSlotForm({ ...slotForm, notes: event.target.value })} /><button className="secondary-button" disabled={saving}><Plus size={15} /> Adicionar horário</button></form></section>}
            </> : <section className="panel wide"><h3>Visualização do setor</h3><p className="muted">Somente Admin, Diretoria e líderes deste setor podem alterar esta equipe.</p></section>}
          </div> : <section className="panel wide"><h3>Nenhum item cadastrado.</h3></section>}
        </div>
      )}
    </div>
  );
}
