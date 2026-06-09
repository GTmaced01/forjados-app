import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Download, FileText, Search, Shield, Trash2, UserX } from 'lucide-react';
import { PRIMARY_TEAMS, ROLE_LABELS, SECTORS, STATUS_LABELS } from '../constants';
import {
  adminDeleteProfile,
  adminUpdateProfile,
  adminUpdateRetreatCount,
  approveProfile,
  listProfiles,
  rejectProfile,
} from '../services/profiles';
import { exportTeamWorkbook, printProfileFicha } from '../services/exporters';
import type { InscriptionStatus, UserProfile, UserRole } from '../types';

export function AdminPanelView() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InscriptionStatus>('all');
  const [error, setError] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);

  async function loadProfiles() {
    setLoading(true);
    setError('');

    try {
      const data = await listProfiles();
      setProfiles(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar membros.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfiles();
  }, []);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      const text = `${profile.display_name} ${profile.email} ${profile.phone || ''} ${profile.primary_team || ''} ${(profile.sectors || []).join(' ')}`
        .toLowerCase();

      const matchesSearch = text.includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || profile.inscription_status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [profiles, search, statusFilter]);

  async function handleApprove(profile: UserProfile) {
    setSavingId(profile.id);
    setError('');

    try {
      await approveProfile(profile.id, profile.requested_role || 'member');
      await loadProfiles();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao aprovar usuário.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleReject(profile: UserProfile) {
    const confirmed = window.confirm(
      `Tem certeza que deseja recusar a inscrição de ${profile.display_name}?`
    );

    if (!confirmed) return;

    setSavingId(profile.id);
    setError('');

    try {
      await rejectProfile(profile.id);
      await loadProfiles();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao recusar usuário.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleRoleChange(profile: UserProfile, role: UserRole) {
    setSavingId(profile.id);
    setError('');

    try {
      await adminUpdateProfile({
        userId: profile.id,
        role,
      });

      await loadProfiles();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao alterar cargo.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleStatusChange(profile: UserProfile, status: InscriptionStatus) {
    setSavingId(profile.id);
    setError('');

    try {
      await adminUpdateProfile({
        userId: profile.id,
        inscription_status: status,
      });

      await loadProfiles();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao alterar status.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleSectorToggle(profile: UserProfile, sector: string) {
    setSavingId(profile.id);
    setError('');

    const currentSectors = profile.sectors || [];

    const newSectors = currentSectors.includes(sector)
      ? currentSectors.filter((item) => item !== sector)
      : [...currentSectors, sector];

    try {
      await adminUpdateProfile({
        userId: profile.id,
        sectors: newSectors,
      });

      await loadProfiles();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao alterar setores.');
    } finally {
      setSavingId(null);
    }
  }

  async function handlePrimaryTeamChange(profile: UserProfile, primaryTeam: string) {
    setSavingId(profile.id);
    setError('');

    const currentSectors = profile.sectors || [];
    const newSectors = primaryTeam && !currentSectors.includes(primaryTeam)
      ? [primaryTeam, ...currentSectors]
      : currentSectors;

    try {
      await adminUpdateProfile({
        userId: profile.id,
        primary_team: primaryTeam || null,
        sectors: newSectors,
      });

      await loadProfiles();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao alterar equipe principal.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleRetreatCountChange(profile: UserProfile, value: string) {
    const count = Math.max(0, Number(value || 0));
    setSavingId(profile.id);
    setError('');

    try {
      await adminUpdateRetreatCount({ userId: profile.id, count });
      await loadProfiles();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar retiros.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteProfile(profile: UserProfile) {
    if (profile.is_admin || profile.role === 'admin') {
      setError('Por segurança, administradores não podem ser excluídos por aqui.');
      return;
    }

    const confirmed = window.confirm(`Excluir definitivamente o usuário ${profile.display_name}? Essa ação não deve ser usada sem conferência.`);
    if (!confirmed) return;

    const typed = window.prompt('Digite EXCLUIR para confirmar.');
    if (typed !== 'EXCLUIR') return;

    setSavingId(profile.id);
    setError('');

    try {
      await adminDeleteProfile(profile.id);
      await loadProfiles();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    } finally {
      setSavingId(null);
    }
  }

  const pendingCount = profiles.filter((p) => p.inscription_status === 'pending').length;
  const approvedCount = profiles.filter((p) => p.inscription_status === 'approved').length;
  const rejectedCount = profiles.filter((p) => p.inscription_status === 'rejected').length;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Direção e cuidado</p>
          <h2>Painel de Direção</h2>
          <p className="muted">
            Gerencie membros, cargos, setores e status das inscrições.
          </p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={() => exportTeamWorkbook(filteredProfiles)}>
            <Download size={16} />
            Exportar equipe
          </button>
          <button className="secondary-button" onClick={loadProfiles}>
            Atualizar
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="admin-stats">
        <div className="card">
          <h3>Pendentes</h3>
          <strong>{pendingCount}</strong>
        </div>

        <div className="card">
          <h3>Aprovados</h3>
          <strong>{approvedCount}</strong>
        </div>

        <div className="card">
          <h3>Recusados</h3>
          <strong>{rejectedCount}</strong>
        </div>

        <div className="card">
          <h3>Total</h3>
          <strong>{profiles.length}</strong>
        </div>
      </section>

      <section className="admin-filters">
        <div className="search-box">
          <Search size={18} />
          <input
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | InscriptionStatus)}
        >
          <option value="all">Todos os status</option>
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovados</option>
          <option value="rejected">Recusados</option>
        </select>
      </section>

      {loading ? (
        <div className="panel center">
          <div className="loader"></div>
          <p className="muted">Carregando membros...</p>
        </div>
      ) : (
        <div className="members-list">
          {filteredProfiles.map((profile) => {
            const isSaving = savingId === profile.id;

            return (
              <div className="member-card" key={profile.id}>
                <div className="member-main">
                  <div className="avatar">
                    {profile.display_name?.charAt(0)?.toUpperCase() || 'F'}
                  </div>

                  <div>
                    <h3>{profile.display_name || 'Sem nome'}</h3>
                    <p className="muted">{profile.email}</p>
                    <p className="muted">
                      {profile.phone || 'Sem telefone'} · {profile.city || 'Sem cidade'} /{' '}
                      {profile.neighborhood || 'Sem bairro'}
                    </p>

                    <div className="badges">
                      <span className={`status-badge ${profile.inscription_status}`}>
                        {STATUS_LABELS[profile.inscription_status]}
                      </span>

                      <span className="role-badge">
                        {ROLE_LABELS[profile.role]}
                      </span>

                      {profile.primary_team && (
                        <span className="role-badge">Equipe: {profile.primary_team}</span>
                      )}

                      {profile.member_id && <span className="role-badge">{profile.member_id}</span>}
                    </div>
                  </div>
                </div>

                <div className="member-controls">
                  <div>
                    <label>Cargo</label>
                    <select
                      value={profile.role}
                      disabled={isSaving}
                      onChange={(e) => handleRoleChange(profile, e.target.value as UserRole)}
                    >
                      <option value="member">Equipe</option>
                      <option value="leader">Líder</option>
                      <option value="director">Diretoria</option>
                      <option value="treasury">Tesouraria</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>

                  <div>
                    <label>Status</label>
                    <select
                      value={profile.inscription_status}
                      disabled={isSaving}
                      onChange={(e) =>
                        handleStatusChange(profile, e.target.value as InscriptionStatus)
                      }
                    >
                      <option value="pending">Pendente</option>
                      <option value="approved">Aprovado</option>
                      <option value="rejected">Recusado</option>
                    </select>
                  </div>

                  <div>
                    <label>Retiros participados</label>
                    <input
                      type="number"
                      min="0"
                      value={profile.retreat_count_manual ?? profile.retreat_count ?? 0}
                      disabled={isSaving}
                      onChange={(e) => handleRetreatCountChange(profile, e.target.value)}
                    />
                  </div>

                  <div>
                    <label>Equipe principal</label>
                    <select
                      value={profile.primary_team || ''}
                      disabled={isSaving}
                      onChange={(e) => handlePrimaryTeamChange(profile, e.target.value)}
                    >
                      <option value="">Sem equipe principal</option>
                      {PRIMARY_TEAMS.map((team) => (
                        <option key={team} value={team}>{team}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="member-sectors">
                  <label>Equipes/setores extras</label>

                  <div className="chips">
                    {SECTORS.map((sector) => (
                      <button
                        key={sector}
                        type="button"
                        disabled={isSaving}
                        className={
                          profile.sectors?.includes(sector) ? 'chip active' : 'chip'
                        }
                        onClick={() => handleSectorToggle(profile, sector)}
                      >
                        {sector}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="member-actions">
                  <button
                    className="approve-button"
                    disabled={isSaving}
                    onClick={() => handleApprove(profile)}
                  >
                    <CheckCircle size={16} />
                    Aprovar
                  </button>

                  <button
                    className="reject-button"
                    disabled={isSaving}
                    onClick={() => handleReject(profile)}
                  >
                    <UserX size={16} />
                    Recusar
                  </button>

                  <button
                    className="secondary-button"
                    disabled={isSaving}
                    onClick={() => setSelectedProfile(profile)}
                  >
                    <FileText size={16} />
                    Ficha completa
                  </button>

                  <button
                    className="secondary-button"
                    disabled={isSaving}
                    onClick={() => printProfileFicha(profile)}
                  >
                    <Download size={16} />
                    Exportar ficha
                  </button>

                  {!profile.is_admin && profile.role !== 'admin' && (
                    <button
                      className="reject-button"
                      disabled={isSaving}
                      onClick={() => handleDeleteProfile(profile)}
                    >
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  )}

                  {profile.is_admin && (
                    <span className="admin-mark">
                      <Shield size={16} />
                      Admin
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredProfiles.length === 0 && (
            <div className="panel center">
              <p className="muted">Nenhum membro encontrado.</p>
            </div>
          )}
        </div>
      )}

      {selectedProfile && (
        <div className="profile-modal-backdrop" onClick={() => setSelectedProfile(null)}>
          <div className="profile-modal panel wide" onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Ficha completa</p>
                <h3>{selectedProfile.display_name}</h3>
                <p className="muted">{selectedProfile.member_id || 'Sem ID'} · {selectedProfile.email}</p>
              </div>
              <button className="secondary-button" onClick={() => setSelectedProfile(null)}>Fechar</button>
            </div>
            {selectedProfile.photo_url && <img className="profile-modal-photo" src={selectedProfile.photo_url} alt={selectedProfile.display_name} />}
            <div className="treasury-info-grid">
              <div><label>Telefone</label><p>{selectedProfile.phone || 'Não informado'}</p></div>
              <div><label>Nascimento</label><p>{selectedProfile.birth_date || 'Não informado'}</p></div>
              <div><label>Cidade/Bairro</label><p>{selectedProfile.city || '-'} / {selectedProfile.neighborhood || '-'}</p></div>
              <div><label>Cargo</label><p>{ROLE_LABELS[selectedProfile.role]}</p></div>
              <div><label>Status</label><p>{STATUS_LABELS[selectedProfile.inscription_status]}</p></div>
              <div><label>Equipe principal</label><p>{selectedProfile.primary_team || 'Não informado'}</p></div>
              <div><label>Setores</label><p>{selectedProfile.sectors?.join(', ') || 'Não informado'}</p></div>
              <div><label>Camisa</label><p>{selectedProfile.shirt_size || 'Não informado'}</p></div>
              <div><label>Retiros</label><p>{selectedProfile.retreat_count_manual ?? selectedProfile.retreat_count ?? 0}</p></div>
              <div><label>Restrição alimentar</label><p>{selectedProfile.food_restrictions || 'Não informado'}</p></div>
              <div><label>Saúde</label><p>{selectedProfile.health_problems || 'Não informado'}</p></div>
              <div><label>Medicação</label><p>{selectedProfile.continuous_medicine || 'Não informado'}</p></div>
              <div><label>Emergência</label><p>{selectedProfile.emergency_contact?.name || '-'} · {selectedProfile.emergency_contact?.phone || '-'}</p></div>
              <div><label>Criado em</label><p>{new Date(selectedProfile.created_at).toLocaleString('pt-BR')}</p></div>
            </div>
            <button className="primary-button" onClick={() => printProfileFicha(selectedProfile)}>Exportar/Imprimir ficha</button>
          </div>
        </div>
      )}
    </div>
  );
}