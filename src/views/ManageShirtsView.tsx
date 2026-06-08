import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Edit, ImagePlus, Plus, Search, Trash2, XCircle } from 'lucide-react';
import { SHIRT_SIZES } from '../constants';
import {
  createShirt,
  deleteShirt,
  formatOrderStatus,
  listAllShirtOrders,
  listAllShirts,
  updateShirt,
  updateShirtOrderStatus,
} from '../services/shirts';
import { withTimeout } from '../services/safeAsync';
import { STORAGE_BUCKETS, uploadPublicImage } from '../services/storage';
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

export function ManageShirtsView() {
  const [shirts, setShirts] = useState<Shirt[]>([]);
  const [orders, setOrders] = useState<Array<ShirtOrder & { items?: ShirtOrderItem[] }>>([]);

  const [form, setForm] = useState<EditingShirt>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingShirt, setSavingShirt] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

  const [searchShirt, setSearchShirt] = useState('');
  const [searchOrder, setSearchOrder] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | ShirtOrderStatus>('all');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setSelectedFile(null);
  }

  function startEdit(shirt: Shirt) {
    const stockAsString: Record<string, string> = {};

    SHIRT_SIZES.forEach((size) => {
      stockAsString[size] = String(shirt.stock?.[size] ?? 0);
    });

    setForm({
      id: shirt.id,
      name: shirt.name,
      description: shirt.description || '',
      price: String(shirt.price),
      image_url: shirt.image_url || '',
      stock: stockAsString,
      is_active: shirt.is_active,
    });

    setEditingId(shirt.id);
    setSelectedFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmitShirt(e: React.FormEvent) {
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

      let imageUrl = form.image_url;

      if (selectedFile) {
        imageUrl = await uploadPublicImage({
          bucket: STORAGE_BUCKETS.shirts,
          folder: 'camisas',
          file: selectedFile,
        });
      }

      if (editingId) {
        await updateShirt({
          id: editingId,
          name: form.name,
          description: form.description,
          price,
          image_url: imageUrl,
          stock,
          is_active: form.is_active,
        });

        setSuccess('Camisa atualizada com sucesso.');
      } else {
        await createShirt({
          name: form.name,
          description: form.description,
          price,
          image_url: imageUrl,
          stock,
          is_active: form.is_active,
        });

        setSuccess('Camisa cadastrada com sucesso.');
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

  const waitingPaymentCount = orders.filter((order) => order.status === 'waiting_payment').length;
  const receiptSentCount = orders.filter((order) => order.status === 'receipt_sent').length;
  const approvedCount = orders.filter((order) => order.status === 'payment_approved').length;
  const deliveredCount = orders.filter((order) => order.status === 'delivered').length;

  return (
    <div className="manage-shirts-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Fardas de um Forjado</p>
          <h2>Gerenciar Fardas</h2>
          <p className="muted">
            Cadastre camisas, edite estoque e acompanhe pedidos.
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
                <h3>{editingId ? 'Editar farda' : 'Cadastrar farda'}</h3>
                <p className="muted">
                  Use URL de imagem por enquanto. Depois adicionaremos upload direto.
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

              <div>
                <label>Imagem da camisa</label>
                <div className="file-upload-box">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  <ImagePlus size={18} />
                  <span>
                    {selectedFile
                      ? selectedFile.name
                      : form.image_url
                      ? 'Imagem atual mantida'
                      : 'Selecionar imagem'}
                  </span>
                </div>
              </div>

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
                  : 'Cadastrar farda'}
              </button>
            </form>
          </section>

          <section className="panel wide">
            <div className="section-header">
              <div>
                <h3>Fardas cadastradas</h3>
                <p className="muted">Edite modelos, preço, imagem e estoque das camisas.</p>
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
              <p className="muted">Carregando fardas...</p>
            ) : filteredShirts.length === 0 ? (
              <p className="muted">Nenhuma farda encontrada.</p>
            ) : (
              <div className="manage-shirt-list">
                {filteredShirts.map((shirt) => (
                  <div className="manage-shirt-card" key={shirt.id}>
                    <div className="manage-shirt-image">
                      {shirt.image_url ? (
                        <img src={shirt.image_url} alt={shirt.name} loading="lazy" decoding="async" />
                      ) : (
                        <span>FORJADOS</span>
                      )}
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
                ))}
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
                <h3>Pedidos de fardas</h3>
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

                      {order.proof_url && (
                        <a
                          href={order.proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="secondary-button order-proof-link"
                        >
                          Abrir comprovante
                        </a>
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