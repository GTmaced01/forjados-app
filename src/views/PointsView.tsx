import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Gift,
  MinusCircle,
  Pencil,
  PlusCircle,
  RefreshCw,
  Save,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import {
  clearMyHonorGoal,
  getMyHonorGoal,
  saveCustomHonorGoal,
  saveProductHonorGoal,
} from '../services/honorGoals';
import { formatPointSource, listMyPointTransactions } from '../services/points';
import { listActivePointsProducts } from '../services/pointsStore';
import { getErrorMessage, withTimeout } from '../services/safeAsync';
import type { HonorGoal, HonorGoalType, PointTransaction, PointsStoreProduct } from '../types';

type PointsViewProps = {
  onOpenStore?: () => void;
};

export function PointsView({ onOpenStore }: PointsViewProps) {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [products, setProducts] = useState<PointsStoreProduct[]>([]);
  const [goal, setGoal] = useState<HonorGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGoal, setSavingGoal] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalType, setGoalType] = useState<HonorGoalType>('product');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [customTitle, setCustomTitle] = useState('Minha meta de honra');
  const [customTarget, setCustomTarget] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [transactionData, goalData, productData] = await withTimeout(
        Promise.all([
          listMyPointTransactions(),
          getMyHonorGoal(),
          listActivePointsProducts(),
        ]),
        10000,
        'Não foi possível carregar sua área de honra.',
      );
      setTransactions(transactionData);
      setGoal(goalData);
      setProducts(productData.filter((product) => product.stock > 0));
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao carregar honra.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const totals = useMemo(() => ({
    received: transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0),
    used: Math.abs(transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0)),
  }), [transactions]);

  if (!profile) return null;

  const targetPoints = goal?.target_points || 0;
  const progress = targetPoints > 0
    ? Math.min(100, Math.max(0, Math.round((profile.points / targetPoints) * 100)))
    : 0;
  const remainingPoints = Math.max(0, targetPoints - profile.points);
  const selectedProduct = products.find((product) => product.id === selectedProductId);

  function openGoalEditor() {
    if (goal?.goal_type === 'custom') {
      setGoalType('custom');
      setCustomTitle(goal.title);
      setCustomTarget(String(goal.target_points));
    } else {
      setGoalType('product');
      setSelectedProductId(goal?.product_id || products[0]?.id || '');
    }
    setShowGoalForm(true);
    setError('');
    setSuccess('');
  }

  async function handleSaveGoal(event: React.FormEvent) {
    event.preventDefault();
    setSavingGoal(true);
    setError('');
    setSuccess('');

    try {
      let savedGoal: HonorGoal;
      if (goalType === 'product') {
        if (!selectedProductId) throw new Error('Escolha um item da Loja de Honra.');
        savedGoal = await saveProductHonorGoal(selectedProductId);
      } else {
        const points = Number(customTarget);
        if (customTitle.trim().length < 3) throw new Error('Dê um nome para sua meta.');
        if (!Number.isInteger(points) || points < 1 || points > 1_000_000) {
          throw new Error('Informe uma meta entre 1 e 1.000.000 de pontos.');
        }
        savedGoal = await saveCustomHonorGoal({ title: customTitle.trim(), targetPoints: points });
      }

      setGoal(savedGoal);
      setShowGoalForm(false);
      setSuccess('Meta de honra salva. Continue avançando!');
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível salvar sua meta.'));
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleClearGoal() {
    if (!window.confirm('Remover sua meta de honra atual?')) return;
    setSavingGoal(true);
    setError('');
    setSuccess('');
    try {
      await clearMyHonorGoal();
      setGoal(null);
      setShowGoalForm(false);
      setSuccess('Meta removida. Você pode criar uma nova quando quiser.');
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível remover sua meta.'));
    } finally {
      setSavingGoal(false);
    }
  }

  return (
    <div className="points-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Honra e serviço</p>
          <h2>Honra</h2>
          <p className="muted">Acompanhe seus pontos, escolha uma meta e celebre cada avanço.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}

      <section className="points-summary">
        <div className="points-balance-card">
          <div><p className="eyebrow">Pontos de honra</p><h3>{profile.points} pts</h3><p className="muted">Seu saldo disponível agora.</p></div>
          <Award size={54} />
        </div>
        <div className="card"><h3>Honra recebida</h3><strong>{totals.received} pts</strong></div>
        <div className="card"><h3>Honra usada</h3><strong>{totals.used} pts</strong></div>
      </section>

      <section className="panel wide honor-goal-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Próximo alvo</p>
            <h3>Minha meta de honra</h3>
            <p className="muted">Transforme seu saldo em um objetivo visível e alcançável.</p>
          </div>
          {!showGoalForm && (
            <button className={goal ? 'secondary-button' : 'primary-button'} type="button" onClick={openGoalEditor}>
              {goal ? <Pencil size={16} /> : <Target size={16} />}
              {goal ? 'Editar meta' : 'Criar meta'}
            </button>
          )}
        </div>

        {goal && !showGoalForm && (
          <div className={progress >= 100 ? 'honor-goal-card completed' : 'honor-goal-card'}>
            <div className="honor-goal-icon">{goal.goal_type === 'product' ? <Gift size={28} /> : <Target size={28} />}</div>
            <div className="honor-goal-main">
              <div className="honor-goal-heading">
                <div>
                  <span>{goal.goal_type === 'product' ? 'Item desejado' : 'Meta personalizada'}</span>
                  <h4>{goal.title}</h4>
                </div>
                <strong>{progress}%</strong>
              </div>
              <div className="honor-goal-progress" aria-label={`${progress}% da meta alcançada`}>
                <i style={{ width: `${progress}%` }} />
              </div>
              <div className="honor-goal-numbers">
                <span><b>{profile.points}</b> pontos atuais</span>
                <span><b>{targetPoints}</b> pontos da meta</span>
                <span>{remainingPoints > 0 ? `Faltam ${remainingPoints} pts` : 'Meta alcançada!'}</span>
              </div>
              {progress >= 100 && (
                <div className="honor-goal-complete">
                  <CheckCircle2 size={19} />
                  <span>Você alcançou esta meta.</span>
                  {goal.goal_type === 'product' && onOpenStore && <button type="button" onClick={onOpenStore}>Ir para Loja de Honra</button>}
                </div>
              )}
            </div>
          </div>
        )}

        {!goal && !showGoalForm && (
          <div className="honor-goal-empty">
            <Target size={30} />
            <div><strong>Escolha onde você quer chegar</strong><p className="muted">Defina uma quantidade de pontos ou selecione um item da loja.</p></div>
          </div>
        )}

        {showGoalForm && (
          <form className="honor-goal-form" onSubmit={handleSaveGoal}>
            <div className="honor-goal-type-switch" role="group" aria-label="Tipo de meta">
              <button type="button" className={goalType === 'product' ? 'active' : ''} aria-pressed={goalType === 'product'} onClick={() => setGoalType('product')}><Gift size={17} />Item da loja</button>
              <button type="button" className={goalType === 'custom' ? 'active' : ''} aria-pressed={goalType === 'custom'} onClick={() => setGoalType('custom')}><Target size={17} />Quantidade de pontos</button>
            </div>

            {goalType === 'product' ? (
              <div>
                <label htmlFor="honor-goal-product">Item desejado</label>
                <select id="honor-goal-product" required value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
                  <option value="">Selecione uma recompensa</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.points_cost} pts</option>)}
                </select>
                {selectedProduct && <p className="honor-goal-preview"><Gift size={16} /> Meta de {selectedProduct.points_cost} pontos para conquistar {selectedProduct.name}.</p>}
                {products.length === 0 && <p className="muted">Não há itens disponíveis na loja neste momento. Use uma meta personalizada.</p>}
              </div>
            ) : (
              <div className="grid two">
                <div>
                  <label htmlFor="honor-goal-title">Nome da meta</label>
                  <input id="honor-goal-title" required maxLength={80} value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="Ex.: Quero alcançar 500 pontos" />
                </div>
                <div>
                  <label htmlFor="honor-goal-points">Quantidade desejada</label>
                  <input id="honor-goal-points" type="number" min="1" max="1000000" required value={customTarget} onChange={(event) => setCustomTarget(event.target.value)} placeholder="500" />
                </div>
              </div>
            )}

            <div className="honor-goal-form-actions">
              <button className="primary-button" disabled={savingGoal || (goalType === 'product' && products.length === 0)}><Save size={16} />{savingGoal ? 'Salvando...' : 'Salvar meta'}</button>
              <button className="secondary-button" type="button" onClick={() => setShowGoalForm(false)} disabled={savingGoal}><X size={16} />Cancelar</button>
              {goal && <button className="reject-button" type="button" onClick={handleClearGoal} disabled={savingGoal}><Trash2 size={16} />Remover meta</button>}
            </div>
          </form>
        )}
      </section>

      <section className="panel wide">
        <div className="section-header"><div><h3>Memorial de honra</h3><p className="muted">Histórico das movimentações do seu saldo.</p></div></div>
        {loading ? (
          <p className="muted">Carregando histórico...</p>
        ) : transactions.length === 0 ? (
          <p className="muted">Você ainda não possui registros de honra.</p>
        ) : (
          <div className="points-history">
            {transactions.map((item) => (
              <div className="point-transaction-card" key={item.id}>
                <div className={item.amount >= 0 ? 'point-icon positive' : 'point-icon negative'}>{item.amount >= 0 ? <PlusCircle size={20} /> : <MinusCircle size={20} />}</div>
                <div><h4>{item.reason}</h4><p className="muted">{formatPointSource(item.source_type)} · {new Date(item.created_at).toLocaleString('pt-BR')}</p>{item.granted_by_name && <p className="muted">Registrado por: {item.granted_by_name}</p>}</div>
                <strong className={item.amount >= 0 ? 'points-positive' : 'points-negative'}>{item.amount > 0 ? '+' : ''}{item.amount} pts</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
