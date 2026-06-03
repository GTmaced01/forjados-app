import { useEffect, useState } from 'react';
import { Award, MinusCircle, PlusCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { formatPointSource, listMyPointTransactions } from '../services/points';
import { getErrorMessage, withTimeout } from '../services/safeAsync';
import type { PointTransaction } from '../types';

export function PointsView() {
  const { profile, reloadProfile } = useAuth();
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const data = await withTimeout(
        listMyPointTransactions(),
        10000,
        'Não foi possível carregar seu histórico de pontos.'
      );
      setTransactions(data);
      await reloadProfile();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao carregar pontos.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (!profile) return null;

  const totalReceived = transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const totalUsed = Math.abs(transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0));

  return (
    <div className="points-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Honra e recompensa</p>
          <h2>Pontos</h2>
          <p className="muted">Acompanhe seu saldo e histórico de pontuações.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="points-summary">
        <div className="points-balance-card">
          <div>
            <p className="eyebrow">Seu saldo</p>
            <h3>{profile.points} pts</h3>
            <p className="muted">Use seus pontos na loja de recompensas.</p>
          </div>
          <Award size={54} />
        </div>
        <div className="card"><h3>Total recebido</h3><strong>{totalReceived} pts</strong></div>
        <div className="card"><h3>Total usado/removido</h3><strong>{totalUsed} pts</strong></div>
      </section>

      <section className="panel wide">
        <h3>Meu histórico</h3>
        {loading ? (
          <p className="muted">Carregando histórico...</p>
        ) : transactions.length === 0 ? (
          <p className="muted">Você ainda não possui movimentações de pontos.</p>
        ) : (
          <div className="points-history">
            {transactions.map((item) => (
              <div className="point-transaction-card" key={item.id}>
                <div className={item.amount >= 0 ? 'point-icon positive' : 'point-icon negative'}>
                  {item.amount >= 0 ? <PlusCircle size={20} /> : <MinusCircle size={20} />}
                </div>
                <div>
                  <h4>{item.reason}</h4>
                  <p className="muted">{formatPointSource(item.source_type)} · {new Date(item.created_at).toLocaleString('pt-BR')}</p>
                  {item.granted_by_name && <p className="muted">Lançado por: {item.granted_by_name}</p>}
                </div>
                <strong className={item.amount >= 0 ? 'points-positive' : 'points-negative'}>{item.amount > 0 ? '+' : ''}{item.amount} pts</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
