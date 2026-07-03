import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle,
  Edit,
  Gift,
  ImagePlus,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { STORAGE_BUCKETS, uploadPublicImage } from '../services/storage';
import {
  createPointsProduct,
  deletePointsProduct,
  formatRedemptionStatus,
  getPrimaryProductImage,
  listAllPointsProducts,
  listAllPointsRedemptions,
  updatePointsProduct,
  updatePointsRedemptionStatus,
} from '../services/pointsStore';
import { getErrorMessage, withTimeout } from '../services/safeAsync';
import type { PointsRedemption, PointsStoreProduct } from '../types';

type ProductForm = {
  name: string;
  description: string;
  points_cost: string;
  stock: string;
  is_active: boolean;
};

type ProductImageDraft = {
  localId: string;
  url: string;
  file?: File;
  previewUrl?: string;
  position_x: number;
  position_y: number;
  is_primary: boolean;
};

const emptyForm: ProductForm = {
  name: '',
  description: '',
  points_cost: '50',
  stock: '0',
  is_active: true,
};

function createLocalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizePosition(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function productImageStyle(image?: { position_x?: number; position_y?: number }) {
  return {
    objectPosition: `${normalizePosition(image?.position_x ?? 50)}% ${normalizePosition(image?.position_y ?? 50)}%`,
  };
}

export function ManagePointsStoreView() {
  const [products, setProducts] = useState<PointsStoreProduct[]>([]);
  const [redemptions, setRedemptions] = useState<PointsRedemption[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [productImages, setProductImages] = useState<ProductImageDraft[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingRedemptionId, setSavingRedemptionId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [redemptionSearch, setRedemptionSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PointsRedemption['status']>('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const productImagesRef = useRef<ProductImageDraft[]>([]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [productsData, redemptionsData] = await withTimeout(
        Promise.all([listAllPointsProducts(), listAllPointsRedemptions()]),
        10000,
        'Não foi possível carregar a gestão da loja de honra.'
      );
      setProducts(productsData);
      setRedemptions(redemptionsData);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao carregar a loja de honra.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    productImagesRef.current = productImages;
  }, [productImages]);

  useEffect(() => {
    return () => {
      productImagesRef.current.forEach((image) => {
        if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
      });
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    return products.filter((product) => `${product.name} ${product.description || ''}`.toLowerCase().includes(q));
  }, [products, productSearch]);

  const filteredRedemptions = useMemo(() => {
    const q = redemptionSearch.toLowerCase();
    return redemptions.filter((redemption) => {
      const text = `${redemption.user_name} ${redemption.user_email || ''} ${redemption.product_name} ${redemption.status}`.toLowerCase();
      return text.includes(q) && (statusFilter === 'all' || redemption.status === statusFilter);
    });
  }, [redemptions, redemptionSearch, statusFilter]);

  const activeProductsCount = products.filter((product) => product.is_active).length;
  const inactiveProductsCount = products.filter((product) => !product.is_active).length;
  const pendingRedemptionsCount = redemptions.filter((item) => item.status === 'pending').length;
  const deliveredRedemptionsCount = redemptions.filter((item) => item.status === 'delivered').length;

  function clearDraftImages(images = productImages) {
    images.forEach((image) => {
      if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
    });
  }

  function resetForm() {
    clearDraftImages();
    setForm(emptyForm);
    setProductImages([]);
    setImageUrlInput('');
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function startEdit(product: PointsStoreProduct) {
    clearDraftImages();
    const images = product.images && product.images.length > 0
      ? product.images
      : product.image_url
      ? [{ image_url: product.image_url, position_x: 50, position_y: 50, is_primary: true }]
      : [];

    setForm({
      name: product.name,
      description: product.description || '',
      points_cost: String(product.points_cost),
      stock: String(product.stock),
      is_active: product.is_active,
    });
    setProductImages(images.map((image, index) => ({
      localId: 'id' in image ? image.id : createLocalId(),
      url: image.image_url,
      position_x: normalizePosition(image.position_x ?? 50),
      position_y: normalizePosition(image.position_y ?? 50),
      is_primary: Boolean(image.is_primary) || index === 0,
    })));
    setImageUrlInput('');
    setEditingId(product.id);
    if (fileInputRef.current) fileInputRef.current.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function appendFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const newImages = Array.from(files).filter((file) => file.type.startsWith('image/')).map((file) => ({
      localId: createLocalId(),
      url: '',
      file,
      previewUrl: URL.createObjectURL(file),
      position_x: 50,
      position_y: 50,
      is_primary: false,
    }));

    if (newImages.length === 0) {
      setError('Selecione apenas arquivos de imagem válidos.');
      return;
    }

    setProductImages((current) => {
      const next = [...current, ...newImages];
      if (!next.some((image) => image.is_primary) && next.length > 0) {
        next[0] = { ...next[0], is_primary: true };
      }
      return next;
    });
  }

  function addImageByUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;

    setProductImages((current) => ([
      ...current,
      {
        localId: createLocalId(),
        url,
        position_x: 50,
        position_y: 50,
        is_primary: current.length === 0,
      },
    ]));
    setImageUrlInput('');
  }

  function removeImage(localId: string) {
    setProductImages((current) => {
      const removed = current.find((image) => image.localId === localId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);

      const next = current.filter((image) => image.localId !== localId);
      if (next.length > 0 && !next.some((image) => image.is_primary)) next[0].is_primary = true;
      return next;
    });
  }

  function setPrimaryImage(localId: string) {
    setProductImages((current) => current.map((image) => ({
      ...image,
      is_primary: image.localId === localId,
    })));
  }

  function updateImagePosition(localId: string, axis: 'x' | 'y', value: number) {
    setProductImages((current) => current.map((image) => {
      if (image.localId !== localId) return image;
      return {
        ...image,
        position_x: axis === 'x' ? normalizePosition(value) : image.position_x,
        position_y: axis === 'y' ? normalizePosition(value) : image.position_y,
      };
    }));
  }

  async function resolveImagesForSave() {
    const uploadedImages = [];

    for (const [index, image] of productImages.entries()) {
      let imageUrl = image.url;

      if (image.file) {
        imageUrl = await uploadPublicImage({
          bucket: STORAGE_BUCKETS.pointsStore,
          folder: 'produtos',
          file: image.file,
        });
      }

      if (imageUrl.trim()) {
        uploadedImages.push({
          image_url: imageUrl.trim(),
          position_x: image.position_x,
          position_y: image.position_y,
          display_order: index,
          is_primary: image.is_primary,
        });
      }
    }

    if (uploadedImages.length > 0 && !uploadedImages.some((image) => image.is_primary)) {
      uploadedImages[0].is_primary = true;
    }

    return uploadedImages;
  }

  async function handleSubmitProduct(e: FormEvent) {
    e.preventDefault();
    setSavingProduct(true);
    setError('');
    setSuccess('');

    try {
      if (!form.name.trim()) throw new Error('Informe o nome do produto.');
      const pointsCost = Number(form.points_cost);
      const stock = Number(form.stock);
      if (!pointsCost || pointsCost <= 0) throw new Error('Informe um custo em honra válido.');
      if (Number.isNaN(stock) || stock < 0) throw new Error('Informe um estoque válido.');

      const images = await resolveImagesForSave();
      const legacyImageUrl = images[0]?.image_url || '';

      if (editingId) {
        await updatePointsProduct({
          id: editingId,
          name: form.name.trim(),
          description: form.description.trim(),
          image_url: legacyImageUrl,
          points_cost: pointsCost,
          stock,
          is_active: form.is_active,
          images,
        });
        setSuccess('Produto atualizado com fotos e enquadramento.');
      } else {
        await createPointsProduct({
          name: form.name.trim(),
          description: form.description.trim(),
          image_url: legacyImageUrl,
          points_cost: pointsCost,
          stock,
          is_active: form.is_active,
          images,
        });
        setSuccess('Produto cadastrado com múltiplas fotos.');
      }
      resetForm();
      await loadData();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao salvar produto.'));
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleDeleteProduct(product: PointsStoreProduct) {
    if (!window.confirm(`Excluir definitivamente "${product.name}"? Se já houver resgates, prefira ocultar.`)) return;
    setError('');
    setSuccess('');
    try {
      await deletePointsProduct(product.id);
      setSuccess('Produto excluído com sucesso.');
      await loadData();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao excluir produto.'));
    }
  }

  async function handleUpdateRedemptionStatus(redemptionId: string, status: PointsRedemption['status']) {
    setSavingRedemptionId(redemptionId);
    setError('');
    setSuccess('');
    try {
      await updatePointsRedemptionStatus({ redemptionId, status });
      setSuccess('Status do resgate atualizado com sucesso.');
      await loadData();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao atualizar resgate.'));
    } finally {
      setSavingRedemptionId(null);
    }
  }

  return (
    <div className="manage-points-store-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Loja de Honra 2.0</p>
          <h2>Gerenciar Loja de Honra</h2>
          <p className="muted">Cadastre recompensas com várias fotos, ajuste o enquadramento e acompanhe os resgates.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData}><RefreshCw size={16} />Atualizar</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <div className="manage-points-store-grid">
        <div className="manage-points-store-column">
          <section className="panel wide manage-product-form-panel">
            <div className="form-title-row">
              <div>
                <h3>{editingId ? 'Editar recompensa' : 'Cadastrar recompensa de honra'}</h3>
                <p className="muted">Envie várias fotos e ajuste a posição de cada imagem antes de salvar.</p>
              </div>
              {editingId && <button type="button" className="secondary-button" onClick={resetForm}>Novo cadastro</button>}
            </div>

            <form className="manage-product-form" onSubmit={handleSubmitProduct}>
              <div className="grid two">
                <div>
                  <label>Nome do produto</label>
                  <input value={form.name} placeholder="Ex: Camisa FORJADOS" onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label>Custo em honra</label>
                  <input type="number" min="1" value={form.points_cost} placeholder="Ex: 50" onChange={(e) => setForm({ ...form, points_cost: e.target.value })} />
                </div>
              </div>

              <div>
                <label>Descrição</label>
                <textarea value={form.description} placeholder="Descrição da recompensa..." onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className="product-photo-uploader">
                <label>Fotos do produto</label>
                <div className="file-upload-box product-photo-upload-box">
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => appendFiles(e.target.files)} />
                  <ImagePlus size={18} />
                  <span>Selecionar uma ou várias fotos</span>
                </div>
                <div className="product-url-row">
                  <input value={imageUrlInput} placeholder="Ou cole uma URL de imagem" onChange={(e) => setImageUrlInput(e.target.value)} />
                  <button className="secondary-button" type="button" onClick={addImageByUrl}>Adicionar URL</button>
                </div>
              </div>

              {productImages.length > 0 && (
                <div className="product-photo-editor-grid">
                  {productImages.map((image, index) => {
                    const src = image.previewUrl || image.url;
                    return (
                      <div className="product-photo-editor-card" key={image.localId}>
                        <div className="product-photo-preview">
                          {src ? <img src={src} alt={`Prévia ${index + 1}`} style={productImageStyle(image)} /> : <Gift size={32} />}
                          {image.is_primary && <span className="primary-photo-badge"><Star size={12} /> Principal</span>}
                        </div>

                        <div className="photo-editor-actions">
                          <button type="button" className="secondary-button" onClick={() => setPrimaryImage(image.localId)} disabled={image.is_primary}>
                            <Star size={14} />Principal
                          </button>
                          <button type="button" className="reject-button" onClick={() => removeImage(image.localId)}>
                            <X size={14} />Remover
                          </button>
                        </div>

                        <div className="photo-position-controls">
                          <label>
                            Horizontal: {image.position_x}%
                            <input type="range" min="0" max="100" value={image.position_x} onChange={(e) => updateImagePosition(image.localId, 'x', Number(e.target.value))} />
                          </label>
                          <label>
                            Vertical: {image.position_y}%
                            <input type="range" min="0" max="100" value={image.position_y} onChange={(e) => updateImagePosition(image.localId, 'y', Number(e.target.value))} />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid two">
                <div>
                  <label>Estoque</label>
                  <input type="number" min="0" value={form.stock} placeholder="Ex: 10" onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                </div>
                <label className="active-checkbox manage-product-active">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Produto ativo na loja
                </label>
              </div>

              <button className="primary-button" disabled={savingProduct}><Plus size={16} />{savingProduct ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar recompensa de honra'}</button>
            </form>
          </section>

          <section className="panel wide">
            <div className="section-header">
              <div><h3>Recompensas cadastradas</h3><p className="muted">Edite fotos, enquadramento, estoque e disponibilidade.</p></div>
              <div className="search-box small-search"><Search size={18} /><input placeholder="Buscar recompensa..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} /></div>
            </div>
            {loading ? <p className="muted">Carregando recompensas...</p> : filteredProducts.length === 0 ? <p className="muted">Nenhuma recompensa encontrada.</p> : (
              <div className="manage-products-list">{filteredProducts.map((product) => {
                const primaryImage = getPrimaryProductImage(product);
                const imageCount = product.images?.length || 0;
                return (
                  <div className="manage-product-card" key={product.id}>
                    <div className="manage-product-image">
                      {primaryImage ? <img src={primaryImage.image_url} alt={product.name} loading="lazy" decoding="async" style={productImageStyle(primaryImage)} /> : <Gift size={38} />}
                      {imageCount > 1 && <span className="photo-count-badge">{imageCount} fotos</span>}
                    </div>
                    <div className="manage-product-info"><h4>{product.name}</h4><p className="muted">{product.description || 'Sem descrição.'}</p><div className="manage-product-meta"><strong>{product.points_cost} pts</strong><span>Estoque: {product.stock}</span></div><p className={product.is_active ? 'active-text' : 'inactive-text'}>{product.is_active ? 'Ativo na loja' : 'Oculto na loja'}</p></div>
                    <div className="manage-redemption-actions"><button className="secondary-button edit-product-button" type="button" onClick={() => startEdit(product)}><Edit size={16} />Editar</button><button className="reject-button" type="button" onClick={() => handleDeleteProduct(product)}><Trash2 size={16} />Excluir</button></div>
                  </div>
                );
              })}</div>
            )}
          </section>
        </div>

        <div className="manage-points-store-column">
          <section className="admin-stats"><div className="card"><h3>Recompensas ativas</h3><strong>{activeProductsCount}</strong></div><div className="card"><h3>Recompensas ocultas</h3><strong>{inactiveProductsCount}</strong></div><div className="card"><h3>Resgates pendentes</h3><strong>{pendingRedemptionsCount}</strong></div><div className="card"><h3>Entregues</h3><strong>{deliveredRedemptionsCount}</strong></div></section>
          <section className="panel wide"><div className="section-header"><div><h3>Resgates de honra dos membros</h3><p className="muted">Marque entregas e cancele solicitações quando necessário.</p></div><div className="admin-filters manage-redemption-filters"><div className="search-box"><Search size={18} /><input placeholder="Buscar resgate..." value={redemptionSearch} onChange={(e) => setRedemptionSearch(e.target.value)} /></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | PointsRedemption['status'])}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="delivered">Entregues</option><option value="cancelled">Cancelados</option></select></div></div>
            {loading ? <p className="muted">Carregando resgates...</p> : filteredRedemptions.length === 0 ? <p className="muted">Nenhum resgate encontrado.</p> : (
              <div className="manage-redemptions-list">{filteredRedemptions.map((redemption) => {
                const isSaving = savingRedemptionId === redemption.id;
                return <div className="manage-redemption-card" key={redemption.id}><div><h4>{redemption.product_name}</h4><p className="muted">Membro: {redemption.user_name}</p><p className="muted">{redemption.user_email || 'E-mail não informado'}</p><p className="muted">{new Date(redemption.created_at).toLocaleString('pt-BR')}</p></div><div className="manage-redemption-info"><strong>{redemption.points_cost} pts</strong><span className={`redemption-status ${redemption.status}`}>{formatRedemptionStatus(redemption.status)}</span></div><div className="manage-redemption-actions">{redemption.status !== 'delivered' && <button className="approve-button" type="button" disabled={isSaving} onClick={() => handleUpdateRedemptionStatus(redemption.id, 'delivered')}><CheckCircle size={16} />Marcar entregue</button>}{redemption.status !== 'cancelled' && redemption.status !== 'delivered' && <button className="reject-button" type="button" disabled={isSaving} onClick={() => handleUpdateRedemptionStatus(redemption.id, 'cancelled')}><XCircle size={16} />Cancelar</button>}{redemption.status === 'delivered' && <span className="payment-approved-label"><CheckCircle size={16} />Entregue</span>}</div></div>;
              })}</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
