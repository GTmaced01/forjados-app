import { useEffect, useMemo, useState } from 'react';
import { Gift, RefreshCw, ShoppingBag } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import {
  formatRedemptionStatus,
  listActivePointsProducts,
  listMyPointsRedemptions,
  redeemPointsProduct,
} from '../services/pointsStore';
import { withTimeout } from '../services/safeAsync';
import type { PointsRedemption, PointsStoreProduct } from '../types';

export function PointsStoreView() {
  const { profile, reloadProfile } = useAuth();

  const [products, setProducts] = useState<PointsStoreProduct[]>([]);
  const [redemptions, setRedemptions] = useState<PointsRedemption[]>([]);

  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [productsData, redemptionsData] = await withTimeout(
        Promise.all([
          listActivePointsProducts(),
          listMyPointsRedemptions(),
        ]),
        10000,
        'Não foi possível carregar a loja de pontos. Tente novamente.'
      );

      setProducts(productsData);
      setRedemptions(redemptionsData);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar loja de pontos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const availableProducts = useMemo(() => {
    return products.filter((product) => product.stock > 0);
  }, [products]);

  async function handleRedeem(product: PointsStoreProduct) {
    const confirmed = window.confirm(
      `Deseja resgatar "${product.name}" por ${product.points_cost} pontos?`
    );

    if (!confirmed) return;

    setRedeemingId(product.id);
    setError('');
    setSuccess('');

    try {
      await redeemPointsProduct(product.id);
      setSuccess('Produto resgatado com sucesso. Aguarde a entrega pela equipe.');
      await Promise.all([loadData(), reloadProfile()]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao resgatar produto.');
    } finally {
      setRedeemingId(null);
    }
  }

  if (!profile) return null;

  return (
    <div className="points-store-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Loja de recompensas</p>
          <h2>Loja de Pontos</h2>
          <p className="muted">
            Troque seus pontos por recompensas cadastradas pela equipe.
          </p>
        </div>

        <button className="secondary-button" type="button" onClick={loadData}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <section className="points-store-balance">
        <div>
          <p className="eyebrow">Seu saldo disponível</p>
          <h3>{profile.points} pts</h3>
          <p className="muted">
            Escolha uma recompensa e acompanhe seus resgates.
          </p>
        </div>

        <Gift size={52} />
      </section>

      <section className="panel wide">
        <h3>Produtos disponíveis</h3>

        {loading ? (
          <p className="muted">Carregando produtos...</p>
        ) : availableProducts.length === 0 ? (
          <p className="muted">Nenhum produto disponível no momento.</p>
        ) : (
          <div className="points-products-grid">
            {availableProducts.map((product) => {
              const canRedeem = profile.points >= product.points_cost;
              const isRedeeming = redeemingId === product.id;

              return (
                <div className="points-product-card" key={product.id}>
                  <div className="points-product-image">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} />
                    ) : (
                      <Gift size={42} />
                    )}
                  </div>

                  <div className="points-product-info">
                    <h4>{product.name}</h4>
                    <p className="muted">{product.description || 'Sem descrição.'}</p>

                    <div className="points-product-meta">
                      <strong>{product.points_cost} pts</strong>
                      <span>Estoque: {product.stock}</span>
                    </div>

                    <button
                      className="primary-button"
                      type="button"
                      disabled={!canRedeem || isRedeeming}
                      onClick={() => handleRedeem(product)}
                    >
                      <ShoppingBag size={16} />
                      {isRedeeming
                        ? 'Resgatando...'
                        : canRedeem
                        ? 'Resgatar'
                        : 'Pontos insuficientes'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel wide">
        <h3>Meus resgates</h3>

        {redemptions.length === 0 ? (
          <p className="muted">Você ainda não fez nenhum resgate.</p>
        ) : (
          <div className="redemptions-list">
            {redemptions.map((redemption) => (
              <div className="redemption-card" key={redemption.id}>
                <div>
                  <h4>{redemption.product_name}</h4>
                  <p className="muted">
                    {new Date(redemption.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>

                <strong>{redemption.points_cost} pts</strong>

                <span className={`redemption-status ${redemption.status}`}>
                  {formatRedemptionStatus(redemption.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}