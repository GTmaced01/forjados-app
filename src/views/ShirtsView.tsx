import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { SHIRT_SIZES } from '../constants';
import { useAuth } from '../components/AuthProvider';
import {
  createShirtOrder,
  formatOrderStatus,
  listActiveShirts,
  listMyShirtOrders,
  uploadShirtOrderReceipt,
} from '../services/shirts';
import { withTimeout } from '../services/safeAsync';
import type { CartItem, Shirt, ShirtOrder, ShirtOrderItem } from '../types';

export function ShirtsView() {
  const [shirts, setShirts] = useState<Shirt[]>([]);
  const [orders, setOrders] = useState<Array<ShirtOrder & { items?: ShirtOrderItem[] }>>([]);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const savedCart = localStorage.getItem('forjados-shirt-cart');
      return savedCart ? (JSON.parse(savedCart) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const { profile } = useAuth();

  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedOrderFiles, setSelectedOrderFiles] = useState<Record<string, File | null>>({});
const [uploadingOrderId, setUploadingOrderId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [shirtsData, ordersData] = await withTimeout(
        Promise.all([
          listActiveShirts(),
          listMyShirtOrders(),
        ]),
        10000,
        'Não foi possível carregar as camisas. Tente novamente.'
      );

      setShirts(shirtsData);
      setOrders(ordersData);

      const initialSizes: Record<string, string> = {};

      shirtsData.forEach((shirt) => {
        initialSizes[shirt.id] = 'M';
      });

      setSelectedSizes(initialSizes);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar camisas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('forjados-shirt-cart', JSON.stringify(cart));
    } catch {
      // Ignora erro de armazenamento local.
    }
  }, [cart]);

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => {
      return total + Number(item.shirt.price) * item.quantity;
    }, 0);
  }, [cart]);

  function addToCart(shirt: Shirt) {
    const size = selectedSizes[shirt.id] || 'M';

    setCart((prev) => {
      const existing = prev.find(
        (item) => item.shirt.id === shirt.id && item.size === size
      );

      if (existing) {
        return prev.map((item) =>
          item.shirt.id === shirt.id && item.size === size
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...prev, { shirt, size, quantity: 1 }];
    });
  }

  function decreaseCartItem(shirtId: string, size: string) {
    setCart((prev) => {
      return prev
        .map((item) =>
          item.shirt.id === shirtId && item.size === size
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0);
    });
  }

  function increaseCartItem(shirtId: string, size: string) {
    setCart((prev) =>
      prev.map((item) =>
        item.shirt.id === shirtId && item.size === size
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  }

  function removeCartItem(shirtId: string, size: string) {
    setCart((prev) =>
      prev.filter((item) => !(item.shirt.id === shirtId && item.size === size))
    );
  }

  async function handleCreateOrder() {
    setCreatingOrder(true);
    setError('');
    setSuccess('');
  
    try {
      await createShirtOrder(cart);
      setCart([]);
      localStorage.removeItem('forjados-shirt-cart');
      setSuccess('Pedido criado com sucesso. Agora envie o comprovante do pagamento.');
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao criar pedido.');
    } finally {
      setCreatingOrder(false);
    }
  }
  
  async function handleUploadOrderReceipt(order: ShirtOrder) {
    if (!profile) return;
  
    const selectedFile = selectedOrderFiles[order.id];
  
    setError('');
    setSuccess('');
  
    try {
      if (!selectedFile) {
        throw new Error('Selecione um comprovante antes de enviar.');
      }
  
      const allowedTypes = [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'application/pdf',
      ];
  
      if (!allowedTypes.includes(selectedFile.type)) {
        throw new Error('Envie apenas PNG, JPG, JPEG ou PDF.');
      }
  
      const maxSizeInMb = 8;
      const maxSizeInBytes = maxSizeInMb * 1024 * 1024;
  
      if (selectedFile.size > maxSizeInBytes) {
        throw new Error(`O arquivo deve ter no máximo ${maxSizeInMb}MB.`);
      }
  
      setUploadingOrderId(order.id);
  
      await uploadShirtOrderReceipt({
        orderId: order.id,
        file: selectedFile,
        userName: profile.display_name,
        userEmail: profile.email,
        userWhatsapp: profile.phone || '',
        amount: Number(order.total_price),
      });
  
      setSelectedOrderFiles((prev) => ({
        ...prev,
        [order.id]: null,
      }));
  
      setSuccess('Comprovante do pedido enviado com sucesso.');
      await loadData();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao enviar comprovante do pedido.'
      );
    } finally {
      setUploadingOrderId(null);
    }
  }

  return (
    <div className="shirts-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Fardas de um Forjado</p>
          <h2>Loja de Camisas</h2>
          <p className="muted">
            Escolha sua camisa, adicione ao carrinho e finalize seu pedido.
          </p>
        </div>

        <button className="secondary-button" onClick={loadData}>
          Atualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <section className="shirts-layout">
        <div className="shirts-list">
          <h3>Fardas disponíveis</h3>
          {loading ? (
            <div className="panel center">
              <div className="loader"></div>
              <p className="muted">Carregando fardas...</p>
            </div>
          ) : shirts.length === 0 ? (
            <div className="panel center">
              <p className="muted">
                Nenhuma camisa cadastrada ainda.
              </p>
            </div>
          ) : (
            <div className="shirt-grid">
              {shirts.map((shirt) => (
                <div className="shirt-card" key={shirt.id}>
                  <div className="shirt-image">
                    {shirt.image_url ? (
                      <img src={shirt.image_url} alt={shirt.name} loading="lazy" decoding="async" />
                    ) : (
                      <span>FORJADOS</span>
                    )}
                  </div>

                  <div className="shirt-info">
                    <h4>{shirt.name}</h4>
                    <p className="muted">{shirt.description || 'Sem descrição.'}</p>

                    <strong>
                      R$ {Number(shirt.price).toFixed(2).replace('.', ',')}
                    </strong>

                    <label>Tamanho</label>
                    <select
                      value={selectedSizes[shirt.id] || 'M'}
                      onChange={(e) =>
                        setSelectedSizes((prev) => ({
                          ...prev,
                          [shirt.id]: e.target.value,
                        }))
                      }
                    >
                      {SHIRT_SIZES.map((size) => (
                        <option key={size}>{size}</option>
                      ))}
                    </select>

                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => addToCart(shirt)}
                    >
                      <ShoppingCart size={16} />
                      Adicionar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="cart-panel">
          <h3>Carrinho</h3>

          {cart.length === 0 ? (
            <p className="muted">Seu carrinho está vazio. Escolha uma camisa para carregar essa identidade.</p>
          ) : (
            <div className="cart-list">
              {cart.map((item) => (
                <div className="cart-item" key={`${item.shirt.id}-${item.size}`}>
                  <div>
                    <strong>{item.shirt.name}</strong>
                    <p className="muted">
                      Tamanho {item.size} · R${' '}
                      {Number(item.shirt.price).toFixed(2).replace('.', ',')}
                    </p>
                  </div>

                  <div className="cart-actions">
                    <button
                      type="button"
                      onClick={() => decreaseCartItem(item.shirt.id, item.size)}
                    >
                      <Minus size={14} />
                    </button>

                    <span>{item.quantity}</span>

                    <button
                      type="button"
                      onClick={() => increaseCartItem(item.shirt.id, item.size)}
                    >
                      <Plus size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => removeCartItem(item.shirt.id, item.size)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              <div className="cart-total">
                <span>Total</span>
                <strong>
                  R$ {cartTotal.toFixed(2).replace('.', ',')}
                </strong>
              </div>

              <button
                className="primary-button"
                disabled={creatingOrder}
                onClick={handleCreateOrder}
              >
                {creatingOrder ? 'Criando pedido...' : 'Finalizar pedido'}
              </button>
            </div>
          )}
        </aside>
      </section>

      <section className="panel wide">
        <h3>Meus pedidos de camisa</h3>

        {orders.length === 0 ? (
          <p className="muted">Você ainda não fez nenhum pedido.</p>
        ) : (
          <div className="orders-list">
  {orders.map((order) => {
    const canUploadReceipt =
      order.status === 'waiting_payment' ||
      order.status === 'payment_rejected';

    const isUploading = uploadingOrderId === order.id;

    return (
      <div className="order-card order-card-detailed" key={order.id}>
        <div>
          <h4>Pedido #{order.id.slice(0, 8).toUpperCase()}</h4>
          <p className="muted">
            {new Date(order.created_at).toLocaleString('pt-BR')}
          </p>
        </div>

        <div>
          <strong>
            R$ {Number(order.total_price).toFixed(2).replace('.', ',')}
          </strong>
          <p className="muted">{formatOrderStatus(order.status)}</p>
        </div>

        <div className="order-items">
          {order.items?.map((item) => (
            <span key={item.id}>
              {item.quantity}x {item.name} / {item.size}
            </span>
          ))}
        </div>

        {canUploadReceipt ? (
          <div className="order-receipt-box">
            <label>Comprovante do pedido</label>

            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,application/pdf"
              onChange={(e) =>
                setSelectedOrderFiles((prev) => ({
                  ...prev,
                  [order.id]: e.target.files?.[0] || null,
                }))
              }
            />

            {selectedOrderFiles[order.id] && (
              <p className="muted">
                Arquivo selecionado:{' '}
                <strong>{selectedOrderFiles[order.id]?.name}</strong>
              </p>
            )}

            <button
              type="button"
              className="primary-button order-receipt-button"
              disabled={isUploading}
              onClick={() => handleUploadOrderReceipt(order)}
            >
              {isUploading ? 'Enviando...' : 'Enviar comprovante'}
            </button>
          </div>
        ) : order.proof_url ? (
          <div className="order-receipt-box">
            <p className="muted">Comprovante enviado.</p>
            <a
              href={order.proof_url}
              target="_blank"
              rel="noreferrer"
              className="secondary-button order-proof-link"
            >
              Abrir comprovante
            </a>
          </div>
        ) : null}
      </div>
    );
  })}
</div>
        )}
      </section>
    </div>
  );
}