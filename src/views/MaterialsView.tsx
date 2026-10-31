import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeftRight,
  Boxes,
  Edit3,
  History,
  ImagePlus,
  PackageCheck,
  PackageMinus,
  Plus,
  RefreshCw,
  Save,
  Undo2,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import {
  getMaterialIndicators,
  listMaterialEditions,
  listMaterialHistory,
  listMaterialItems,
  listMaterialMovements,
  listMaterialSectors,
  registerMaterialMovement,
  removeMaterialImage,
  saveMaterialItem,
  setMaterialArchived,
  uploadMaterialImage,
  validateMaterialImageMetadata,
} from '../services/materials';
import type {
  MaterialCondition,
  MaterialEditionOption,
  MaterialItem,
  MaterialItemHistory,
  MaterialItemType,
  MaterialMovement,
  MaterialMovementType,
  MaterialSectorOption,
  MaterialStatus,
} from '../types';

const STATUS_LABELS: Record<MaterialStatus, string> = {
  available: 'Disponível',
  loaned: 'Emprestado',
  maintenance: 'Em manutenção',
  unavailable: 'Indisponível',
};

const CONDITION_LABELS: Record<MaterialCondition, string> = {
  new: 'Novo',
  good: 'Bom',
  fair: 'Regular',
  poor: 'Ruim',
  damaged: 'Danificado',
};

const MOVEMENT_LABELS: Record<MaterialMovementType, string> = {
  entry: 'Entrada',
  exit: 'Consumo / saída',
  loan: 'Empréstimo',
  return: 'Devolução',
  adjustment: 'Ajuste de saldo',
};

type MaterialDraft = {
  name: string;
  item_type: MaterialItemType;
  category: string;
  quantity: number;
  unit: string;
  minimum_quantity: number;
  location: string;
  responsible_name: string;
  status: MaterialStatus;
  condition: MaterialCondition;
  notes: string;
  sector_unit_id: string;
};

const EMPTY_DRAFT: MaterialDraft = {
  name: '',
  item_type: 'equipment',
  category: '',
  quantity: 0,
  unit: 'unidade',
  minimum_quantity: 0,
  location: '',
  responsible_name: '',
  status: 'available',
  condition: 'good',
  notes: '',
  sector_unit_id: '',
};

function formatQuantity(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

const HISTORY_FIELDS: Array<[string, string]> = [
  ['name', 'Nome'],
  ['sector_unit_id', 'Setor'],
  ['category', 'Categoria'],
  ['quantity', 'Quantidade'],
  ['unit', 'Unidade'],
  ['minimum_quantity', 'Estoque mínimo'],
  ['location', 'Local'],
  ['responsible_name', 'Responsável'],
  ['status', 'Status'],
  ['condition', 'Condição'],
  ['is_archived', 'Arquivamento'],
];

function formatHistoryValue(value: unknown) {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function historyChanges(row: MaterialItemHistory) {
  if (!row.before_data || !row.after_data) return [];
  return HISTORY_FIELDS.flatMap(([field, label]) => {
    const before = row.before_data?.[field];
    const after = row.after_data?.[field];
    return before === after ? [] : [`${label}: ${formatHistoryValue(before)} → ${formatHistoryValue(after)}`];
  });
}

export function MaterialsView() {
  const { isAdmin, isDirector } = useAuth();
  const canArchive = isAdmin || isDirector;
  const [editions, setEditions] = useState<MaterialEditionOption[]>([]);
  const [editionId, setEditionId] = useState('');
  const [sectors, setSectors] = useState<MaterialSectorOption[]>([]);
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<MaterialItem | null>(null);
  const [draft, setDraft] = useState<MaterialDraft>(EMPTY_DRAFT);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [movementItem, setMovementItem] = useState<MaterialItem | null>(null);
  const [movement, setMovement] = useState({ type: 'entry' as MaterialMovementType, quantity: 1, borrower: '', dueDate: '', notes: '' });
  const [historyItem, setHistoryItem] = useState<MaterialItem | null>(null);
  const [movements, setMovements] = useState<MaterialMovement[]>([]);
  const [history, setHistory] = useState<MaterialItemHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadCatalog(preferredEdition?: string) {
    setLoading(true);
    setError('');
    try {
      const editionOptions = await listMaterialEditions();
      setEditions(editionOptions);
      const selectedEdition = preferredEdition || editionId || editionOptions.find((edition) => edition.is_active)?.id || editionOptions[0]?.id || '';
      setEditionId(selectedEdition);
      if (!selectedEdition) {
        setSectors([]);
        setItems([]);
        return;
      }
      const [sectorOptions, materialItems] = await Promise.all([
        listMaterialSectors(selectedEdition),
        listMaterialItems(selectedEdition, canArchive && includeArchived),
      ]);
      setSectors(sectorOptions);
      setItems(materialItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os materiais.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, [includeArchived]);

  async function changeEdition(nextEditionId: string) {
    setEditionId(nextEditionId);
    setSectorFilter('');
    setLoading(true);
    setError('');
    try {
      const [sectorOptions, materialItems] = await Promise.all([
        listMaterialSectors(nextEditionId),
        listMaterialItems(nextEditionId, canArchive && includeArchived),
      ]);
      setSectors(sectorOptions);
      setItems(materialItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível trocar a edição.');
    } finally {
      setLoading(false);
    }
  }

  const sectorNames = useMemo(() => new Map(sectors.map((sector) => [sector.id, sector.name])), [sectors]);
  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(), [items]);
  const indicators = useMemo(() => getMaterialIndicators(items), [items]);
  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return items.filter((item) => {
      const haystack = `${item.name} ${item.category} ${item.location} ${item.responsible_name}`.toLocaleLowerCase('pt-BR');
      return (!term || haystack.includes(term))
        && (!sectorFilter || item.sector_unit_id === sectorFilter)
        && (!categoryFilter || item.category === categoryFilter)
        && (!typeFilter || item.item_type === typeFilter)
        && (!statusFilter || item.status === statusFilter)
        && (!conditionFilter || item.condition === conditionFilter);
    });
  }, [items, search, sectorFilter, categoryFilter, typeFilter, statusFilter, conditionFilter]);

  function openCreate() {
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT, sector_unit_id: sectors[0]?.id || '' });
    setImageFile(null);
    setShowEditor(true);
    setMovementItem(null);
    setHistoryItem(null);
  }

  function openEdit(item: MaterialItem) {
    setEditing(item);
    setDraft({
      name: item.name,
      item_type: item.item_type,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      minimum_quantity: item.minimum_quantity,
      location: item.location,
      responsible_name: item.responsible_name,
      status: item.status,
      condition: item.condition,
      notes: item.notes,
      sector_unit_id: item.sector_unit_id,
    });
    setImageFile(null);
    setShowEditor(true);
    setMovementItem(null);
    setHistoryItem(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!editionId || !draft.sector_unit_id) return;
    setSaving(true);
    setError('');
    setSuccess('');
    let uploadedPath = '';
    try {
      if (draft.name.trim().length < 2) throw new Error('Informe o nome do material.');
      if (imageFile) validateMaterialImageMetadata(imageFile);
      let saved = await saveMaterialItem({
        ...draft,
        edition_id: editionId,
        image_path: editing?.image_path || null,
        is_archived: editing?.is_archived || false,
      }, editing?.id);

      if (imageFile) {
        uploadedPath = await uploadMaterialImage(saved, imageFile);
        const oldPath = saved.image_path;
        saved = await saveMaterialItem({ ...saved, image_path: uploadedPath }, saved.id);
        if (oldPath && oldPath !== uploadedPath) await removeMaterialImage(oldPath);
      }

      setSuccess(editing ? 'Material atualizado.' : 'Material cadastrado.');
      setShowEditor(false);
      setEditing(null);
      setImageFile(null);
      await loadCatalog(editionId);
    } catch (err) {
      if (uploadedPath) await removeMaterialImage(uploadedPath);
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o material.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMovement(event: React.FormEvent) {
    event.preventDefault();
    if (!movementItem) return;
    setSaving(true);
    setError('');
    try {
      await registerMaterialMovement({
        itemId: movementItem.id,
        movementType: movement.type,
        quantity: movement.quantity,
        borrower: movement.borrower,
        dueDate: movement.dueDate,
        notes: movement.notes,
      });
      setSuccess(`${MOVEMENT_LABELS[movement.type]} registrada para ${movementItem.name}.`);
      setMovementItem(null);
      setMovement({ type: 'entry', quantity: 1, borrower: '', dueDate: '', notes: '' });
      await loadCatalog(editionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a movimentação.');
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(item: MaterialItem) {
    setHistoryItem(item);
    setMovementItem(null);
    setShowEditor(false);
    setHistoryLoading(true);
    setError('');
    try {
      const [movementRows, historyRows] = await Promise.all([
        listMaterialMovements(item.id),
        listMaterialHistory(item.id),
      ]);
      setMovements(movementRows);
      setHistory(historyRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o histórico.');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function toggleArchive(item: MaterialItem) {
    if (!canArchive) return;
    const action = item.is_archived ? 'restaurar' : 'arquivar';
    if (!window.confirm(`Deseja ${action} “${item.name}”? O histórico será preservado.`)) return;
    try {
      await setMaterialArchived(item.id, !item.is_archived);
      setSuccess(item.is_archived ? 'Material restaurado.' : 'Material arquivado.');
      await loadCatalog(editionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o material.');
    }
  }

  return (
    <div className="materials-page">
      <div className="admin-header materials-header">
        <div>
          <p className="eyebrow">Patrimônio e consumo</p>
          <h2>Materiais</h2>
          <p className="muted">Equipamentos, estoque e empréstimos organizados por setor.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={() => void loadCatalog(editionId)} disabled={loading}><RefreshCw size={16} /> Atualizar</button>
          <button type="button" className="primary-button" onClick={openCreate} disabled={!editionId || sectors.length === 0}><Plus size={16} /> Novo item</button>
        </div>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}

      <section className="material-toolbar panel wide">
        <label>Edição<select value={editionId} onChange={(event) => void changeEdition(event.target.value)}>{editions.map((edition) => <option key={edition.id} value={edition.id}>{edition.title}{edition.is_active ? ' · ativa' : ''}</option>)}</select></label>
        <label className="material-search">Buscar<input type="search" placeholder="Nome, categoria, local..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {canArchive && <label className="check-line material-archive-filter"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Exibir arquivados</label>}
      </section>

      <section className="material-indicators" aria-label="Indicadores de materiais">
        <div><Boxes /><span><strong>{indicators.total}</strong>Total</span></div>
        <div><PackageMinus /><span><strong>{indicators.lowStock}</strong>Estoque baixo</span></div>
        <div><ArrowLeftRight /><span><strong>{indicators.loaned}</strong>Emprestados</span></div>
        <div><PackageCheck /><span><strong>{indicators.unavailable}</strong>Indisponíveis</span></div>
        <div><Wrench /><span><strong>{indicators.maintenance}</strong>Manutenção</span></div>
      </section>

      {showEditor && (
        <section className="panel wide material-editor">
          <div className="section-header"><div><p className="eyebrow">Cadastro</p><h3>{editing ? `Editar ${editing.name}` : 'Novo material'}</h3></div><button type="button" className="icon-button" aria-label="Fechar cadastro" onClick={() => setShowEditor(false)}>×</button></div>
          <form onSubmit={handleSave}>
            <label>Nome<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Setor<select required value={draft.sector_unit_id} onChange={(event) => setDraft({ ...draft, sector_unit_id: event.target.value })}><option value="">Selecione</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
            <label>Tipo<select value={draft.item_type} onChange={(event) => setDraft({ ...draft, item_type: event.target.value as MaterialItemType })}><option value="equipment">Equipamento</option><option value="consumable">Consumível</option></select></label>
            <label>Categoria<input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Ex.: Ferramentas" /></label>
            <label>Quantidade<input type="number" min="0" step="0.01" disabled={Boolean(editing)} value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} />{editing && <small>Use uma movimentação para alterar o saldo.</small>}</label>
            <label>Unidade<input required value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="unidade, caixa, kg..." /></label>
            <label>Estoque mínimo<input type="number" min="0" step="0.01" value={draft.minimum_quantity} onChange={(event) => setDraft({ ...draft, minimum_quantity: Number(event.target.value) })} /></label>
            <label>Localização<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
            <label>Responsável<input value={draft.responsible_name} onChange={(event) => setDraft({ ...draft, responsible_name: event.target.value })} /></label>
            <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as MaterialStatus })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Condição<select value={draft.condition} onChange={(event) => setDraft({ ...draft, condition: event.target.value as MaterialCondition })}>{Object.entries(CONDITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="material-image-field"><ImagePlus size={16} /> Imagem principal<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} /><small>JPEG, PNG ou WebP · máximo 5 MB</small></label>
            <label className="material-notes-field">Observações<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
            <div className="header-actions material-form-actions"><button type="button" className="secondary-button" onClick={() => setShowEditor(false)}>Cancelar</button><button className="primary-button" disabled={saving}><Save size={16} /> {saving ? 'Salvando...' : 'Salvar material'}</button></div>
          </form>
        </section>
      )}

      {movementItem && (
        <section className="panel wide material-movement-panel">
          <div className="section-header"><div><p className="eyebrow">Movimentação atômica</p><h3>{movementItem.name}</h3><p className="muted">Saldo atual: {formatQuantity(movementItem.quantity)} {movementItem.unit}</p></div><button type="button" className="icon-button" aria-label="Fechar movimentação" onClick={() => setMovementItem(null)}>×</button></div>
          <form onSubmit={handleMovement}>
            <label>Tipo<select value={movement.type} onChange={(event) => setMovement({ ...movement, type: event.target.value as MaterialMovementType })}>{Object.entries(MOVEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>{movement.type === 'adjustment' ? 'Novo saldo' : 'Quantidade'}<input required type="number" min={movement.type === 'adjustment' ? '0' : '0.01'} step="0.01" value={movement.quantity} onChange={(event) => setMovement({ ...movement, quantity: Number(event.target.value) })} /></label>
            {movement.type === 'loan' && <><label>Emprestado para<input required value={movement.borrower} onChange={(event) => setMovement({ ...movement, borrower: event.target.value })} /></label><label>Previsão de devolução<input type="date" value={movement.dueDate} onChange={(event) => setMovement({ ...movement, dueDate: event.target.value })} /></label></>}
            <label className="material-notes-field">Observações<textarea value={movement.notes} onChange={(event) => setMovement({ ...movement, notes: event.target.value })} /></label>
            <div className="header-actions material-form-actions"><button type="button" className="secondary-button" onClick={() => setMovementItem(null)}>Cancelar</button><button className="primary-button" disabled={saving}><ArrowLeftRight size={16} /> Registrar</button></div>
          </form>
        </section>
      )}

      {historyItem && (
        <section className="panel wide material-history-panel">
          <div className="section-header"><div><p className="eyebrow">Rastreabilidade</p><h3>Histórico de {historyItem.name}</h3></div><button type="button" className="icon-button" aria-label="Fechar histórico" onClick={() => setHistoryItem(null)}>×</button></div>
          {historyLoading ? <div className="loader" /> : <div className="material-history-columns">
            <div><h4>Movimentações</h4>{movements.length ? movements.map((row) => <article key={row.id}><strong>{MOVEMENT_LABELS[row.movement_type]}</strong><span>{row.quantity_delta > 0 ? '+' : ''}{formatQuantity(row.quantity_delta)} · saldo {formatQuantity(row.resulting_quantity)}</span><small>{formatDate(row.created_at)} · {row.created_by_name || 'Sistema'}{row.borrower ? ` · ${row.borrower}` : ''}{row.due_date ? ` · devolução ${new Date(`${row.due_date}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}</small>{row.notes && <p>{row.notes}</p>}</article>) : <p className="muted">Nenhuma movimentação registrada.</p>}</div>
            <div><h4>Alterações do cadastro</h4>{history.length ? history.map((row) => { const changes = historyChanges(row); return <article key={row.id}><strong>{row.action === 'created' ? 'Criado' : row.action === 'archived' ? 'Arquivado' : row.action === 'restored' ? 'Restaurado' : 'Atualizado'}</strong><small>{formatDate(row.created_at)} · {row.created_by_name || 'Sistema'}</small>{changes.slice(0, 5).map((change) => <p key={change}>{change}</p>)}{changes.length > 5 && <small>+ {changes.length - 5} alteração(ões)</small>}</article>; }) : <p className="muted">Nenhuma alteração registrada.</p>}</div>
          </div>}
        </section>
      )}

      <section className="panel wide material-catalog-panel">
        <div className="material-filters">
          <label>Setor<select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)}><option value="">Todos</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
          <label>Categoria<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todas</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label>Tipo<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Todos</option><option value="equipment">Equipamento</option><option value="consumable">Consumível</option></select></label>
          <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Condição<select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)}><option value="">Todas</option>{Object.entries(CONDITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>

        {loading ? <div className="center"><div className="loader" /></div> : sectors.length === 0 ? <div className="service-empty"><h3>Nenhum setor disponível.</h3><p>Admin e Diretoria precisam configurar a edição e seus setores. Líderes só acessam setores nos quais estão marcados como líderes.</p></div> : filteredItems.length === 0 ? <div className="service-empty">Nenhum material encontrado com estes filtros.</div> : <div className="material-grid">
          {filteredItems.map((item) => {
            const lowStock = item.quantity <= item.minimum_quantity;
            return <article className={`material-card ${item.is_archived ? 'archived' : ''}`} key={item.id}>
              <div className="material-card-image">{item.image_url ? <img src={item.image_url} alt="" /> : <Boxes aria-hidden="true" />}{item.is_archived && <span>Arquivado</span>}</div>
              <div className="material-card-body">
                <div className="material-card-title"><div><small>{sectorNames.get(item.sector_unit_id) || 'Setor'}</small><h3>{item.name}</h3></div><span className={`material-status ${item.status}`}>{STATUS_LABELS[item.status]}</span></div>
                <p>{item.category || (item.item_type === 'equipment' ? 'Equipamento' : 'Consumível')} · {CONDITION_LABELS[item.condition]}</p>
                <div className={`material-stock ${lowStock ? 'low' : ''}`}><strong>{formatQuantity(item.quantity)}</strong><span>{item.unit}<small>Mínimo: {formatQuantity(item.minimum_quantity)}</small></span></div>
                <dl><div><dt>Local</dt><dd>{item.location || 'Não informado'}</dd></div><div><dt>Responsável</dt><dd>{item.responsible_name || 'Não informado'}</dd></div></dl>
                <div className="material-card-actions">
                  {!item.is_archived && <><button type="button" className="secondary-button" onClick={() => { setMovementItem(item); setShowEditor(false); setHistoryItem(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><ArrowLeftRight size={15} /> Movimentar</button><button type="button" className="icon-button" aria-label={`Editar ${item.name}`} onClick={() => openEdit(item)}><Edit3 size={16} /></button></>}
                  <button type="button" className="icon-button" aria-label={`Histórico de ${item.name}`} onClick={() => void openHistory(item)}><History size={16} /></button>
                  {canArchive && <button type="button" className="icon-button" aria-label={`${item.is_archived ? 'Restaurar' : 'Arquivar'} ${item.name}`} onClick={() => void toggleArchive(item)}>{item.is_archived ? <Undo2 size={16} /> : <Archive size={16} />}</button>}
                </div>
              </div>
            </article>;
          })}
        </div>}
      </section>
    </div>
  );
}
