import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Gift, RefreshCw, ShoppingBag, Target, X } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { saveProductHonorGoal } from '../services/honorGoals';
import {
  formatRedemptionStatus,
  getPrimaryProductImage,
  getProductImages,
  listActivePointsProducts,
  listMyPointsRedemptions,
  redeemPointsProduct,
} from '../services/pointsStore';
import { withTimeout } from '../services/safeAsync';
import type { PointsRedemption, PointsStoreProduct, PointsStoreProductImage } from '../types';

function normalizePosition(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function imageStyle(image?: Pick<PointsStoreProductImage, 'position_x' | 'position_y'> | null) {
  return {
    objectPosition: `${normalizePosition(image?.position_x)}% ${normalizePosition(image?.position_y)}%`,
  };
}

export function PointsStoreView() {
  const { profile, reloadProfile } = useAuth();

  const [products, setProducts] = useState<PointsStoreProduct[]>([]);
  const [redemptions, setRedemptions] = useState<PointsRedemption[]>([]);
  const [selectedImageByProduct, setSelectedImageByProduct] = useState<Record<string, number>>({});
  const [lightbox, setLightbox] = useState<{ product: PointsStoreProduct; index: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [settingGoalId, setSettingGoalId] = useState<string | null>(null);

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
        'Não foi possível carregar a loja de honra. Tente novamente.'
      );

      setProducts(productsData);
      setRedemptions(redemptionsData);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar loja de honra.');
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

  const lightboxImages = lightbox ? getProductImages(lightbox.product) : [];
  const lightboxImage = lightboxImages[lightbox?.index || 0];

  function selectProductImage(productId: string, index: number) {
    setSelectedImageByProduct((current) => ({ ...current, [productId]: index }));
  }

  function openLightbox(product: PointsStoreProduct, index: number) {
    if (getProductImages(product).length === 0) return;
    setLightbox({ product, index });
  }

  function navigateLightbox(direction: 'prev' | 'next') {
    if (!lightbox || lightboxImages.length === 0) return;
    const delta = direction === 'next' ? 1 : -1;
    const nextIndex = (lightbox.index + delta + lightboxImages.length) % lightboxImages.length;
    setLightbox({ ...lightbox, index: nextIndex });
  }

  async function handleRedeem(product: PointsStoreProduct) {
    const confirmed = window.confirm(
      `Deseja resgatar "${product.name}" por ${product.points_cost} pontos de honra?`
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

  async function handleSetGoal(product: PointsStoreProduct) {
    setSettingGoalId(product.id);
    setError('');
    setSuccess('');

    try {
      await saveProductHonorGoal(product.id);
      setSuccess(`“${product.name}” agora é sua meta de honra. Acompanhe o progresso em Honra.`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao definir meta de honra.');
    } finally {
      setSettingGoalId(null);
    }
  }

  if (!profile) return null;

  return (
    <div className="points-store-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Recompensas de honra</p>
          <h2>Loja de Honra</h2>
          <p className="muted">
            Use seus pontos de honra para resgatar recompensas cadastradas pela equipe.
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
          <p className="eyebrow">Honra disponível</p>
          <h3>{profile.points} pts</h3>
          <p className="muted">
            Escolha uma recompensa, veja as fotos ampliadas e acompanhe seus resgates.
          </p>
        </div>

        <Gift size={52} />
      </section>

      <section className="panel wide">
        <h3>Recompensas disponíveis</h3>

        {loading ? (
          <p className="muted">Carregando recompensas...</p>
        ) : availableProducts.length === 0 ? (
          <p className="muted">Nenhuma recompensa disponível no momento.</p>
        ) : (
          <div className="points-products-grid">
            {availableProducts.map((product) => {
              const canRedeem = profile.points >= product.points_cost;
              const isRedeeming = redeemingId === product.id;
              const productImages = getProductImages(product);
              const selectedIndex = selectedImageByProduct[product.id] || 0;
              const selectedImage = productImages[selectedIndex] || getPrimaryProductImage(product);

              return (
                <div className="points-product-card" key={product.id}>
                  <button
                    className="points-product-image image-open-button"
                    type="button"
                    onClick={() => openLightbox(product, selectedIndex)}
                    aria-label={`Ampliar foto de ${product.name}`}
                  >
                    {selectedImage ? (
                      <img src={selectedImage.image_url} alt={product.name} loading="lazy" decoding="async" style={imageStyle(selectedImage)} />
                    ) : (
                      <Gift size={42} />
                    )}
                    {selectedImage && <span className="open-photo-badge"><Eye size={14} /> Ver foto</span>}
                  </button>

                  {productImages.length > 1 && (
                    <div className="product-gallery-thumbs" aria-label={`Fotos de ${product.name}`}>
                      {productImages.map((image, index) => (
                        <button
                          className={`gallery-thumb ${index === selectedIndex ? 'selected' : ''}`}
                          type="button"
                          key={image.id}
                          onClick={() => selectProductImage(product.id, index)}
                          aria-label={`Ver foto ${index + 1} de ${product.name}`}
                        >
                          <img src={image.image_url} alt="" loading="lazy" decoding="async" style={imageStyle(image)} />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="points-product-info">
                    <h4>{product.name}</h4>
                    <p className="muted">{product.description || 'Sem descrição.'}</p>

                    <div className="points-product-meta">
                      <strong>{product.points_cost} pts</strong>
                      <span>Estoque: {product.stock}</span>
                    </div>

                    <div className="points-product-actions">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={!canRedeem || isRedeeming || settingGoalId === product.id}
                        onClick={() => handleRedeem(product)}
                      >
                        <ShoppingBag size={16} />
                        {isRedeeming ? 'Resgatando...' : canRedeem ? 'Resgatar' : 'Honra insuficiente'}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={settingGoalId === product.id || isRedeeming}
                        onClick={() => handleSetGoal(product)}
                      >
                        <Target size={16} />
                        {settingGoalId === product.id ? 'Definindo...' : 'Quero este item'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel wide">
        <h3>Meus resgates de honra</h3>

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

      {lightbox && lightboxImage && (
        <div className="product-lightbox" role="dialog" aria-modal="true" aria-label={`Foto ampliada de ${lightbox.product.name}`} onClick={() => setLightbox(null)}>
          <div className="product-lightbox-content" onClick={(event) => event.stopPropagation()}>
            <button className="lightbox-close-button" type="button" onClick={() => setLightbox(null)} aria-label="Fechar visualização">
              <X size={22} />
            </button>

            {lightboxImages.length > 1 && (
              <button className="lightbox-nav prev" type="button" onClick={() => navigateLightbox('prev')} aria-label="Foto anterior">
                <ChevronLeft size={28} />
              </button>
            )}

            <img src={lightboxImage.image_url} alt={lightbox.product.name} style={imageStyle(lightboxImage)} />

            {lightboxImages.length > 1 && (
              <button className="lightbox-nav next" type="button" onClick={() => navigateLightbox('next')} aria-label="Próxima foto">
                <ChevronRight size={28} />
              </button>
            )}

            <div className="product-lightbox-caption">
              <strong>{lightbox.product.name}</strong>
              <span>{lightbox.index + 1} de {lightboxImages.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
