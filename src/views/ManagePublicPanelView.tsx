import { useEffect, useMemo, useState } from 'react';
import { Edit, ImagePlus, Plus, RefreshCw, Search } from 'lucide-react';
import { STORAGE_BUCKETS, uploadPublicImage } from '../services/storage';
import {
  createPublicPanelItem,
  formatPanelCategory,
  listAllPublicPanelItems,
  updatePublicPanelItem,
} from '../services/publicPanel';
import { AdminHistoryDeleteButton } from '../components/AdminHistoryDeleteButton';
import { useAuth } from '../components/AuthProvider';
import { getErrorMessage } from '../services/safeAsync';
import type { PublicPanelCategory, PublicPanelItem } from '../types';

type PanelForm = {
  id?: string;
  title: string;
  content: string;
  category: PublicPanelCategory;
  image_url: string;
  is_active: boolean;
  is_pinned: boolean;
};

const emptyForm: PanelForm = {
  title: '',
  content: '',
  category: 'notice',
  image_url: '',
  is_active: true,
  is_pinned: false,
};

export function ManagePublicPanelView() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<PublicPanelItem[]>([]);
  const [form, setForm] = useState<PanelForm>(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const data = await listAllPublicPanelItems();
      setItems(data);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao carregar painel.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => `${item.title} ${item.content} ${item.category}`.toLowerCase().includes(q));
  }, [items, search]);

  function resetForm() {
    setForm(emptyForm);
    setSelectedFile(null);
    setEditingId(null);
  }

  function startEdit(item: PublicPanelItem) {
    setForm({
      id: item.id,
      title: item.title,
      content: item.content,
      category: item.category,
      image_url: item.image_url || '',
      is_active: item.is_active,
      is_pinned: item.is_pinned,
    });
    setSelectedFile(null);
    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!form.title.trim()) throw new Error('Informe o título.');
      if (!form.content.trim()) throw new Error('Informe o conteúdo.');

      let imageUrl = form.image_url;
      if (selectedFile) {
        imageUrl = await uploadPublicImage({ bucket: STORAGE_BUCKETS.publicPanel, folder: 'avisos', file: selectedFile });
      }

      if (editingId) {
        await updatePublicPanelItem({ ...form, id: editingId, image_url: imageUrl });
        setSuccess('Aviso atualizado com sucesso.');
      } else {
        await createPublicPanelItem({ ...form, image_url: imageUrl });
        setSuccess('Aviso publicado com sucesso.');
      }
      resetForm();
      await loadData();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao salvar aviso.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="manage-public-panel-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Comunicação</p>
          <h2>Gerenciar Mural da Forja</h2>
          <p className="muted">Publique direções, avisos, escalas e comunicados para conduzir a equipe.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData}><RefreshCw size={16} />Atualizar</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <div className="manage-points-store-grid">
        <div className="manage-points-store-column">
          <section className="panel wide">
            <div className="form-title-row"><h3>{editingId ? 'Editar direção' : 'Nova direção'}</h3>{editingId && <button className="secondary-button" type="button" onClick={resetForm}>Nova direção</button>}</div>
            <form className="manage-product-form" onSubmit={handleSubmit}>
              <div className="grid two">
                <div><label>Título</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><label>Categoria</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PublicPanelCategory })}><option value="notice">Aviso</option><option value="scale">Escala</option><option value="info">Informação</option><option value="urgent">Urgente</option></select></div>
              </div>
              <div><label>Conteúdo</label><textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
              <div>
                <label>Imagem opcional</label>
                <div className="file-upload-box">
                  <input type="file" accept="image/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                  <ImagePlus size={18} />
                  <span>{selectedFile ? selectedFile.name : form.image_url ? 'Imagem atual mantida' : 'Selecionar imagem'}</span>
                </div>
              </div>
              <div className="grid two">
                <label className="active-checkbox"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Publicado</label>
                <label className="active-checkbox"><input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} />Fixar no topo</label>
              </div>
              <button className="primary-button" disabled={saving}><Plus size={16} />{saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Publicar aviso'}</button>
            </form>
          </section>
        </div>

        <div className="manage-points-store-column">
          <section className="panel wide">
            <div className="section-header"><h3>Direções cadastradas</h3><div className="search-box small-search"><Search size={18}/><input placeholder="Buscar direção..." value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
            {loading ? <p className="muted">Carregando direções...</p> : filteredItems.length === 0 ? <p className="muted">Nenhuma direção encontrada.</p> : (
              <div className="manage-products-list">
                {filteredItems.map((item) => (
                  <div className="manage-product-card" key={item.id}>
                    <div className="manage-product-image">{item.image_url ? <img src={item.image_url} alt={item.title} loading="lazy" decoding="async" /> : formatPanelCategory(item.category)}</div>
                    <div className="manage-product-info"><h4>{item.title}</h4><p className="muted">{item.content}</p><p className={item.is_active ? 'active-text' : 'inactive-text'}>{item.is_active ? 'Publicado' : 'Oculto'} {item.is_pinned ? '· Fixado' : ''}</p></div>
                    <div className="manage-redemption-actions"><button className="secondary-button" type="button" onClick={() => startEdit(item)}><Edit size={16}/>Editar</button>{isAdmin && <AdminHistoryDeleteButton entityType="public_panel_items" entityId={item.id} itemLabel={`a publicação “${item.title}”`} onDeleted={async () => { await loadData(); setSuccess('Publicação retirada do mural e registrada na auditoria.'); }} />}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
