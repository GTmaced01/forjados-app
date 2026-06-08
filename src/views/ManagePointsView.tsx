import { useEffect, useMemo, useState } from 'react';
import { MinusCircle, PlusCircle, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import {
  formatPointSource,
  grantPointsManual,
  listAllPointTransactions,
  listPointEligibleProfiles,
  listPointsRanking,
} from '../services/points';
import { getErrorMessage, withTimeout } from '../services/safeAsync';
import type { PointTransaction, UserProfile } from '../types';

export function ManagePointsView() {
  const { reloadProfile, isAdmin, isDirector, isLeader } = useAuth();
  const canViewRanking = isAdmin || isDirector;

  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [rankingProfiles, setRankingProfiles] = useState<UserProfile[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [rankingSearch, setRankingSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [amount, setAmount] = useState('50');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [transactionsData, profilesData, rankingData] = await withTimeout(
        Promise.all([
          listAllPointTransactions(),
          listPointEligibleProfiles(),
          canViewRanking ? listPointsRanking() : Promise.resolve([]),
        ]),
        10000,
        'Não foi possível carregar a gestão de honra.'
      );

      setTransactions(transactionsData);
      setProfiles(profilesData);
      setRankingProfiles(rankingData);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao carregar honra.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canViewRanking]);

  const filteredProfiles = useMemo(() => {
    const q = search.toLowerCase();
    return profiles.filter((item) => `${item.display_name} ${item.email} ${item.member_id || ''}`.toLowerCase().includes(q));
  }, [profiles, search]);

  const selectedProfile = profiles.find((item) => item.id === selectedUserId);

  const filteredRanking = useMemo(() => {
    const q = rankingSearch.toLowerCase();
    return rankingProfiles.filter((item) => `${item.display_name} ${item.email} ${item.member_id || ''} ${(item.sectors || []).join(' ')}`.toLowerCase().includes(q));
  }, [rankingProfiles, rankingSearch]);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (!isAdmin && !isDirector && !isLeader) {
        throw new Error('Você não tem permissão para lançar honra.');
      }
      if (!selectedUserId) throw new Error('Selecione um membro.');
      const numericAmount = Number(amount);
      if (!numericAmount || numericAmount === 0) throw new Error('Informe uma pontuação válida.');
      if (!reason.trim() || reason.trim().length < 3) throw new Error('Informe o motivo da pontuação.');

      await grantPointsManual({ userId: selectedUserId, amount: numericAmount, reason: reason.trim() });
      setSuccess('Honra registrada com sucesso.');
      setAmount('50');
      setReason('');
      await Promise.all([loadData(), reloadProfile()]);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao lançar honra.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="manage-points-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Gerenciamento</p>
          <h2>Lançar Honra</h2>
          <p className="muted">Registre honra por serviço, presença, entrega e atitudes alinhadas ao propósito.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <div className="points-desktop-grid">
        <div className="points-column">
          <section className="panel wide grant-points-panel">
            <h3>Registrar honra</h3>
            <form className="grant-points-form" onSubmit={handleGrant}>
              <div>
                <label>Buscar membro</label>
                <div className="search-box">
                  <Search size={18} />
                  <input placeholder="Buscar por nome, e-mail ou ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>

              <div>
                <label>Membro</label>
                <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                  <option value="">Selecione um membro</option>
                  {filteredProfiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name} — {item.member_id || 'sem ID'} — {item.points} pts
                    </option>
                  ))}
                </select>
              </div>

              {selectedProfile && (
                <div className="selected-member-box">
                  <strong>{selectedProfile.display_name}</strong>
                  <p className="muted">{selectedProfile.email} · Saldo atual: {selectedProfile.points} pts</p>
                </div>
              )}

              <div className="grid two">
                <div>
                  <label>Quantidade</label>
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ex: 50 ou -20" />
                  <p className="field-hint">Use negativo para remover honra, ex: -20.</p>
                </div>
                <div>
                  <label>Motivo</label>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: Apoio na logística" />
                </div>
              </div>

              <button className="primary-button" disabled={saving}>{saving ? 'Registrando...' : 'Lançar honra'}</button>
            </form>
          </section>

          {canViewRanking && (
            <section className="panel wide points-ranking-panel">
              <div className="section-header">
                <div>
                  <h3>Ranking de honra</h3>
                  <p className="muted">Acompanhe a honra acumulada pelos membros.</p>
                </div>
                <div className="search-box small-search">
                  <Search size={18} />
                  <input placeholder="Buscar membro..." value={rankingSearch} onChange={(e) => setRankingSearch(e.target.value)} />
                </div>
              </div>
              <div className="points-ranking-list">
                {filteredRanking.map((member, index) => (
                  <div className="points-ranking-card" key={member.id}>
                    <div className="ranking-position">#{index + 1}</div>
                    <div className="avatar">{member.display_name?.charAt(0)?.toUpperCase() || 'F'}</div>
                    <div className="ranking-member-info">
                      <h4>{member.display_name}</h4>
                      <p className="muted">{member.email}</p>
                      <p className="muted">Setores: {member.sectors?.join(', ') || 'Não informado'}</p>
                    </div>
                    <div className="ranking-points"><strong>{member.points || 0}</strong><span>pts</span></div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="points-column">
          <section className="panel wide">
            <h3>Memorial geral de honra</h3>
            {loading ? (
              <p className="muted">Carregando histórico...</p>
            ) : transactions.length === 0 ? (
              <p className="muted">Nenhum registro encontrado.</p>
            ) : (
              <div className="points-history">
                {transactions.slice(0, 80).map((item) => (
                  <div className="point-transaction-card" key={item.id}>
                    <div className={item.amount >= 0 ? 'point-icon positive' : 'point-icon negative'}>
                      {item.amount >= 0 ? <PlusCircle size={20} /> : <MinusCircle size={20} />}
                    </div>
                    <div>
                      <h4>{item.reason}</h4>
                      <p className="muted">Membro: {item.member_id || item.user_id} · {formatPointSource(item.source_type)}</p>
                      {item.granted_by_name && <p className="muted">Lançado por: {item.granted_by_name}</p>}
                    </div>
                    <strong className={item.amount >= 0 ? 'points-positive' : 'points-negative'}>{item.amount > 0 ? '+' : ''}{item.amount} pts</strong>
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
