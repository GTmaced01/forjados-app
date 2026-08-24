import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle, Edit, ImagePlus, Plus, Search, Star, Trash2, X, XCircle } from 'lucide-react';
import { SHIRT_SIZES } from '../constants';
import {
  createShirt,
  deleteShirt,
  formatOrderStatus,
  getPrimaryShirtImage,
  listAllShirtOrders,
  listAllShirts,
  updateShirt,
  updateShirtOrderStatus,
} from '../services/shirts';
import { withTimeout } from '../services/safeAsync';
import { STORAGE_BUCKETS, uploadPublicImage } from '../services/storage';
import { getPrivateDocumentUrl } from '../services/privateStorage';
import type { Shirt, ShirtOrder, ShirtOrderItem, ShirtOrderStatus } from '../types';

type EditingShirt = {
  id?: string;
  name: string;
  description: string;
  price: string;
  image_url: string;
  stock: Record<string, string>;
  is_active: boolean;
};

type ShirtImageDraft = {
  localId: string;
  url: string;
  file?: File;
  previewUrl?: string;
  position_x: number;
  position_y: number;
  is_primary: boolean;
};

const emptyForm: EditingShirt = {
  name: '',
  description: '',
  price: '',
  image_url: '',
  stock: {
    PP: '0',
    P: '0',
    M: '0',
    G: '0',
    GG: '0',
    XG: '0',
    XGG: '0',
  },
  is_active: true,
};

function createLocalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizePosition(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function shirtImageStyle(image?: { position_x?: number; position_y?: number }) {
  return {
    objectPosition: `${normalizePosition(image?.position_x ?? 50)}% ${normalizePosition(image?.position_y ?? 50)}%`,
  };
}

export function ManageShirtsView() {
  const [shirts, setShirts] = useState<Shirt[]>([]);
  const [orders, setOrders] = useState<Array<ShirtOrder & { items?: ShirtOrderItem[] }>>([]);

  const [form, setForm] = useState<EditingShirt>(emptyForm);
  const [shirtImages, setShirtImages] = useState<ShirtImageDraft[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingShirt, setSavingShirt] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

  const [searchShirt, setSearchShirt] = useState('');
  const [searchOrder, setSearchOrder] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | ShirtOrderStatus>('all');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shirtImagesRef = useRef<ShirtImageDraft[]>([]);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [shirtsData, ordersData] = await withTimeout(
        Promise.all([
          listAllShirts(),
          listAllShirtOrders(),
        ]),
        10000,
        'Não foi possível carregar o gerenciamento de camisas. Tente novamente.'
      );

      setShirts(shirtsData);
      setOrders(ordersData);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    shirtImagesRef.current = shirtImages;
  }, [shirtImages]);

  useEffect(() => {
    return () => {
      shirtImagesRef.current.forEach((image) => {
        if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
      });
    };
  }, []);

  const filteredShirts = useMemo(() => {
    return shirts.filter((shirt) => {
      const text = `${shirt.name} ${shirt.description || ''}`.toLowerCase();
      return text.includes(searchShirt.toLowerCase());
    });
  }, [shirts, searchShirt]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderText = `${order.id} ${order.status} ${
        order.items?.map((item) => `${item.name} ${item.size}`).join(' ') || ''
      }`.toLowerCase();

      const matchesSearch = orderText.includes(searchOrder.toLowerCase());
      const matchesStatus =
        orderStatusFilter === 'all' || order.status === orderStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchOrder, orderStatusFilter]);

  function clearDraftImages(images = shirtImages) {
    images.forEach((image) => {
      if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
    });
  }

  function resetForm() {
    clearDraftImages();
    setForm(emptyForm);
    setShirtImages([]);
    setImageUrlInput('');
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function startEdit(shirt: Shirt) {
    clearDraftImages();
    const stockAsString: Record<string, string> = {};

    SHIRT_SIZES.forEach((size) => {
      stockAsString[size] = String(shirt.stock?.[size] ?? 0);
    });

    const images = shirt.images && shirt.images.length > 0
      ? shirt.images
      : shirt.image_url
      ? [{ image_url: shirt.image_url, position_x: 50, position_y: 50, is_primary: true }]
      : [];

    setForm({
      id: shirt.id,
      name: shirt.name,
      description: shirt.description || '',
      price: String(shirt.price),
      image_url: shirt.image_url || '',
      stock: stockAsString,
      is_active: shirt.is_active,
    });

    setShirtImages(images.map((image, index) => ({
      localId: 'id' in image ? image.id : createLocalId(),
      url: image.image_url,
      position_x: normalizePosition(image.position_x ?? 50),
      position_y: normalizePosition(image.position_y ?? 50),
      is_primary: Boolean(image.is_primary) || index === 0,
    })));
    setImageUrlInput('');
    setEditingId(shirt.id);
    if (fileInputRef.current) fileInputRef.current.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function appendFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const newImages = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({
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

    setShirtImages((current) => {
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

    setShirtImages((current) => ([
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
    setShirtImages((current) => {
      const removed = current.find((image) => image.localId === localId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);

      const next = current.filter((image) => image.localId !== localId);
      if (next.length > 0 && !next.some((image) => image.is_primary)) {
        next[0] = { ...next[0], is_primary: true };
      }
      return next;
    });
  }

  function setPrimaryImage(localId: string) {
    setShirtImages((current) => current.map((image) => ({
      ...image,
      is_primary: image.localId === localId,
    })));
  }

  function updateImagePosition(localId: string, axis: 'x' | 'y', value: number) {
    setShirtImages((current) => current.map((image) => {
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

    for (const [index, image] of shirtImages.entries()) {
      let imageUrl = image.url;

      if (image.file) {
        imageUrl = await uploadPublicImage({
          bucket: STORAGE_BUCKETS.shirts,
          folder: 'camisas',
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

  async function handleSubmitShirt(e: FormEvent) {
    e.preventDefault();

    setSavingShirt(true);
    setError('');
    setSuccess('');

    try {
      if (!form.name.trim()) {
        throw new Error('Informe o nome da camisa.');
      }

      const price = Number(form.price.replace(',', '.'));

      if (!price || price <= 0) {
        throw new Error('Informe um preço válido.');
      }

      const stock: Record<string, number> = {};

      SHIRT_SIZES.forEach((size) => {
        stock[size] = Number(form.stock[size] || 0);
      });

      const images = await resolveImagesForSave();
      const legacyImageUrl = images[0]?.image_url || '';

      if (editingId) {
        await updateShirt({
          id: editingId,
          name: form.name.trim(),
          description: form.description.trim(),
          price,
          image_url: legacyImageUrl,
          stock,
          is_active: form.is_active,
          images,
        });

        setSuccess('Camisa atualizada com fotos e enquadramento.');
      } else {
        await createShirt({
          name: form.name.trim(),
          description: form.description.trim(),
          price,
          image_url: legacyImageUrl,
          stock,
          is_active: form.is_active,
          images,
        });

        setSuccess('Camisa cadastrada com múltiplas fotos.');
      }

      resetForm();
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar camisa.');
    } finally {
      setSavingShirt(false);
    }
  }

  async function handleDeleteShirt(shirt: Shirt) {
    if (!window.confirm(`Excluir definitivamente "${shirt.name}"? Se já houver pedidos, prefira ocultar a camisa.`)) return;

    setError('');
    setSuccess('');

    try {
      await deleteShirt(shirt.id);
      setSuccess('Camisa excluída com sucesso.');
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir camisa.');
    }
  }

  async function handleUpdateOrderStatus(orderId: string, status: ShirtOrderStatus) {
    setSavingOrderId(orderId);
    setError('');
    setSuccess('');

    try {
      await updateShirtOrderStatus({
        orderId,
        status,
      });

      setSuccess('Status do pedido atualizado.');
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar pedido.');
    } finally {
      setSavingOrderId(null);
    }
  }

  async function handleOpenOrderProof(order: ShirtOrder) {
    const proofWindow = window.open('about:blank', '_blank');
    if (proofWindow) proofWindow.opener = null;

    try {
      const url = await getPrivateDocumentUrl(order.proof_path, order.proof_url);
      if (proofWindow) proofWindow.location.replace(url);
      else window.location.assign(url);
    } catch (err) {
      proofWindow?.close();
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o comprovante.');
    }
  }

  const waitingPaymentCount = orders.filter((order) => order.status === 'waiting_payment').length;
  const receiptSentCount = orders.filter((order) => order.status === 'receipt_sent').length;
  const approvedCount = orders.filter((order) => order.status === 'payment_approved').length;
  const deliveredCount = orders.filter((order) => order.status === 'delivered').length;

  return (
    <div className="manage-shirts-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Loja de Camisas 2.0</p>
          <h2>Gerenciar Loja de Camisas</h2>
          <p className="muted">
            Cadastre camisas com várias fotos, ajuste o enquadramento, edite estoque e acompanhe pedidos.
          </p>
        </div>

        <button className="secondary-button" type="button" onClick={loadData}>
          Atualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <div className="manage-shirts-desktop-grid">
        <div className="manage-shirts-column">
          <section className="panel wide manage-shirt-form-panel">
            <div className="form-title-row">
              <div>
                <h3>{editingId ? 'Editar camisa' : 'Cadastrar camisa'}</h3>
                <p className="muted">
                  Selecione uma ou várias fotos e ajuste a posição de cada imagem antes de salvar.
                </p>
              </div>

              {editingId && (
                <button type="button" className="secondary-button" onClick={resetForm}>
                  Novo cadastro
                </button>
              )}
            </div>

            <form className="manage-shirt-form" onSubmit={handleSubmitShirt}>
              <div className="grid two">
                <div>
                  <label>Nome da camisa</label>
                  <input
                    value={form.name}
                    placeholder="Ex: Fardas de um Forjado"
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div>
                  <label>Preço</label>
                  <input
                    value={form.price}
                    placeholder="Ex: 80"
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label>Descrição</label>
                <textarea
                  value={form.description}
                  placeholder="Descrição da camisa..."
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="product-photo-uploader">
                <label>Fotos da camisa</label>
                <div className="file-upload-box product-photo-upload-box">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => appendFiles(e.target.files)}
                  />
                  <ImagePlus size={18} />
                  <span>Selecionar uma ou várias fotos</span>
                </div>
                <div className="product-url-row">
                  <input
                    value={imageUrlInput}
                    placeholder="Ou cole uma URL de imagem"
                    onChange={(e) => setImageUrlInput(e.target.value)}
                  />
                  <button className="secondary-button" type="button" onClick={addImageByUrl}>Adicionar URL</button>
                </div>
              </div>

              {shirtImages.length > 0 && (
                <div className="product-photo-editor-grid">
                  {shirtImages.map((image, index) => {
                    const src = image.previewUrl || image.url;
                    return (
                      <div className="product-photo-editor-card" key={image.localId}>
                        <div className="product-photo-preview">
                          {src ? <img src={src} alt={`Prévia ${index + 1}`} style={shirtImageStyle(image)} /> : <ImagePlus size={32} />}
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

              <div>
                <label>Estoque por tamanho</label>
                <div className="stock-grid">
                  {SHIRT_SIZES.map((size) => (
                    <div key={size}>
                      <span>{size}</span>
                      <input
                        type="number"
                        min="0"
                        value={form.stock[size] || '0'}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            stock: {
                              ...form.stock,
                              [size]: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <label className="active-checkbox">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Camisa ativa na loja
              </label>

              <button className="primary-button" disabled={savingShirt}>
                <Plus size={16} />
                {savingShirt
                  ? 'Salvando...'
                  : editingId
                  ? 'Salvar alterações'
                  : 'Cadastrar camisa'}
              </button>
            </form>
          </section>

          <section className="panel wide">
            <div className="section-header">
              <div>
                <h3>Camisas cadastradas</h3>
                <p className="muted">Edite modelos, preço, fotos, enquadramento e estoque das camisas.</p>
              </div>

              <div className="search-box small-search">
                <Search size={18} />
                <input
                  placeholder="Buscar camisa..."
                  value={searchShirt}
                  onChange={(e) => setSearchShirt(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <p className="muted">Carregando camisas...</p>
            ) : filteredShirts.length === 0 ? (
              <p className="muted">Nenhuma camisa encontrada.</p>
            ) : (
              <div className="manage-shirt-list">
                {filteredShirts.map((shirt) => {
                  const primaryImage = getPrimaryShirtImage(shirt);
                  const imageCount = shirt.images?.length || 0;
                  return (
                    <div className="manage-shirt-card" key={shirt.id}>
                      <div className="manage-shirt-image">
                        {primaryImage ? (
                          <img src={primaryImage.image_url} alt={shirt.name} loading="lazy" decoding="async" style={shirtImageStyle(primaryImage)} />
                        ) : (
                          <span>FORJADOS</span>
                        )}
                        {imageCount > 1 && <span className="photo-count-badge">{imageCount} fotos</span>}
                      </div>

                      <div>
                        <h4>{shirt.name}</h4>
                        <p className="muted">{shirt.description || 'Sem descrição.'}</p>
                        <strong>
                          R$ {Number(shirt.price).toFixed(2).replace('.', ',')}
                        </strong>

                        <div className="mini-stock">
                          {SHIRT_SIZES.map((size) => (
                            <span key={size}>
                              {size}: {shirt.stock?.[size] ?? 0}
                            </span>
                          ))}
                        </div>

                        <p className={shirt.is_active ? 'active-text' : 'inactive-text'}>
                          {shirt.is_active ? 'Ativa na loja' : 'Oculta na loja'}
                        </p>
                      </div>

                      <div className="manage-redemption-actions">
                        <button
                          type="button"
                          className="secondary-button edit-shirt-button"
                          onClick={() => startEdit(shirt)}
                        >
                          <Edit size={16} />
                          Editar
                        </button>

                        <button
                          type="button"
                          className="reject-button edit-shirt-button"
                          onClick={() => handleDeleteShirt(shirt)}
                        >
                          <Trash2 size={16} />
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="manage-shirts-column">
          <section className="admin-stats">
            <div className="card">
              <h3>Aguardando pagamento</h3>
              <strong>{waitingPaymentCount}</strong>
            </div>

            <div className="card">
              <h3>Comprovante enviado</h3>
              <strong>{receiptSentCount}</strong>
            </div>

            <div className="card">
              <h3>Pagos</h3>
              <strong>{approvedCount}</strong>
            </div>

            <div className="card">
              <h3>Entregues</h3>
              <strong>{deliveredCount}</strong>
            </div>
          </section>

          <section className="panel wide">
            <div className="section-header">
              <div>
                <h3>Pedidos de camisas</h3>
                <p className="muted">
                  Acompanhe pagamentos e entregas das camisas do movimento.
                </p>
              </div>

              <div className="admin-filters manage-order-filters">
                <div className="search-box">
                  <Search size={18} />
                  <input
                    placeholder="Buscar pedido..."
                    value={searchOrder}
                    onChange={(e) => setSearchOrder(e.target.value)}
                  />
                </div>

                <select
                  value={orderStatusFilter}
                  onChange={(e) =>
                    setOrderStatusFilter(e.target.value as 'all' | ShirtOrderStatus)
                  }
                >
                  <option value="all">Todos</option>
                  <option value="waiting_payment">Aguardando pagamento</option>
                  <option value="receipt_sent">Comprovante enviado</option>
                  <option value="payment_approved">Pagamento aprovado</option>
                  <option value="payment_rejected">Pagamento recusado</option>
                  <option value="delivered">Entregue</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <p className="muted">Nenhum pedido encontrado.</p>
            ) : (
              <div className="manage-orders-list">
                {filteredOrders.map((order) => {
                  const isSaving = savingOrderId === order.id;

                  return (
                    <div className="manage-order-card" key={order.id}>
                      <div>
                        <h4>Pedido #{order.id.slice(0, 8).toUpperCase()}</h4>
                        <p className="muted">
                          {new Date(order.created_at).toLocaleString('pt-BR')}
                        </p>
                        <p className="muted">
                          Total: R$ {Number(order.total_price).toFixed(2).replace('.', ',')}
                        </p>
                        <strong>{formatOrderStatus(order.status)}</strong>
                      </div>

                      <div className="order-items">
                        {order.items?.map((item) => (
                          <span key={item.id}>
                            {item.quantity}x {item.name} / {item.size}
                          </span>
                        ))}
                      </div>

                      {(order.proof_path || order.proof_url) && (
                        <button
                          type="button"
                          onClick={() => void handleOpenOrderProof(order)}
                          className="secondary-button order-proof-link"
                        >
                          Abrir comprovante
                        </button>
                      )}

                      <div className="manage-order-actions">
                        {order.status !== 'payment_approved' && order.status !== 'delivered' && (
                          <button
                            type="button"
                            className="approve-button"
                            disabled={isSaving}
                            onClick={() =>
                              handleUpdateOrderStatus(order.id, 'payment_approved')
                            }
                          >
                            <CheckCircle size={16} />
                            Aprovar pagamento
                          </button>
                        )}

                        {order.status !== 'payment_rejected' && order.status !== 'delivered' && (
                          <button
                            type="button"
                            className="reject-button"
                            disabled={isSaving}
                            onClick={() =>
                              handleUpdateOrderStatus(order.id, 'payment_rejected')
                            }
                          >
                            <XCircle size={16} />
                            Recusar
                          </button>
                        )}

                        {order.status === 'payment_approved' && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isSaving}
                            onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                          >
                            Marcar entregue
                          </button>
                        )}

                        {order.status === 'delivered' && (
                          <span className="payment-approved-label">
                            <CheckCircle size={16} />
                            Pedido entregue
                          </span>
                        )}

                        {order.status !== 'delivered' && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isSaving}
                            onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
