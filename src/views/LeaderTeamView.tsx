import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Users } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { listLeaderTeamMembers } from '../services/leaderTeam';
import { getErrorMessage } from '../services/safeAsync';
import type { UserProfile } from '../types';

export function LeaderTeamView() {
  const { profile } = useAuth();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  async function loadData() {
    if (!profile) return;
    setLoading(true);
    setError('');
    try {
      const data = await listLeaderTeamMembers();
      setMembers(data);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Não foi possível carregar seus liderados.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [profile?.id, profile?.sectors?.join('|')]);

  const filteredMembers = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((member) => `${member.display_name} ${member.email} ${member.phone || ''} ${member.primary_team || ''} ${(member.sectors || []).join(' ')}`.toLowerCase().includes(q));
  }, [members, search]);

  return (
    <div className="leader-team-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Cuidado pastoral</p>
          <h2>Meus Liderados</h2>
          <p className="muted">Acompanhe os membros da sua equipe com cuidado, honra e responsabilidade.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData}><RefreshCw size={16} />Atualizar</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="panel wide">
        <div className="section-header">
          <div>
            <h3>Equipe sob cuidado</h3>
            <p className="muted">Equipe principal: {profile?.primary_team || 'Não definida'} · Setores: {profile?.sectors?.join(', ') || 'Nenhum setor definido'}</p>
          </div>
          <div className="search-box small-search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar liderado..." /></div>
        </div>

        {loading ? (
          <p className="muted">Carregando liderados...</p>
        ) : filteredMembers.length === 0 ? (
          <div className="empty-access-requests"><h4>Nenhum liderado encontrado</h4><p className="muted">Confira se os membros já foram aprovados e se estão vinculados à sua equipe principal.</p></div>
        ) : (
          <div className="leader-team-list">
            {filteredMembers.map((member) => (
              <div className="leader-team-card" key={member.id}>
                <div className="avatar">{member.display_name?.charAt(0)?.toUpperCase() || 'F'}</div>
                <div>
                  <h4>{member.display_name}</h4>
                  <p className="muted">{member.email}</p>
                  <p className="muted">WhatsApp: {member.phone || 'Não informado'}</p>
                  <p className="muted">Equipe principal: {member.primary_team || 'Não informada'} · Setores: {member.sectors?.join(', ') || 'Não informado'}</p>
                </div>
                <div className="leader-team-points"><Users size={18} /><strong>{member.points || 0} pts</strong></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
