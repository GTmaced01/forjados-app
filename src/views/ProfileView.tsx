import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Car,
  HeartPulse,
  RotateCcw,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import {
  PRIMARY_TEAMS,
  ROLE_LABELS,
  SECTORS,
  SHIRT_SIZES,
  STATUS_LABELS,
} from '../constants';
import { useAuth } from '../components/AuthProvider';
import { updateMyBasicProfile } from '../services/profiles';
import type { UserProfile } from '../types';

type ProfileFormState = {
  display_name: string;
  phone: string;
  birth_date: string;
  city: string;
  neighborhood: string;
  member_since: string;
  primary_team: string;
  sectors: string[];
  specific_function: string;
  shirt_size: string;
  has_vehicle: boolean;
  food_restrictions: string;
  health_problems: string;
  continuous_medicine: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
};

function buildForm(profile?: UserProfile | null): ProfileFormState {
  return {
    display_name: profile?.display_name || '',
    phone: profile?.phone || '',
    birth_date: profile?.birth_date || '',
    city: profile?.city || '',
    neighborhood: profile?.neighborhood || '',
    member_since: profile?.member_since || '',
    primary_team: profile?.primary_team || profile?.sectors?.[0] || '',
    sectors: profile?.sectors || [],
    specific_function: profile?.specific_function || '',
    shirt_size: profile?.shirt_size || 'M',
    has_vehicle: profile?.has_vehicle || false,
    food_restrictions: profile?.food_restrictions || '',
    health_problems: profile?.health_problems || '',
    continuous_medicine: profile?.continuous_medicine || '',
    emergency_contact_name: profile?.emergency_contact?.name || '',
    emergency_contact_phone: profile?.emergency_contact?.phone || '',
    emergency_contact_relationship: profile?.emergency_contact?.relationship || '',
  };
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function ProfileView() {
  const { profile, reloadProfile, isAdmin, isDirector } = useAuth();
  const initialForm = useMemo(() => buildForm(profile), [profile]);

  const [form, setForm] = useState<ProfileFormState>(initialForm);
  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(initialForm));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setForm(initialForm);
    setInitialSnapshot(JSON.stringify(initialForm));
  }, [initialForm]);

  const isDirty = JSON.stringify(form) !== initialSnapshot;

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
    }

    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [isDirty]);

  if (!profile) return null;

  const canEditMemberSince = isAdmin || isDirector;
  const completenessChecks = [
    form.display_name,
    form.phone,
    form.birth_date,
    form.city,
    form.neighborhood,
    form.primary_team,
    form.sectors.length > 0 ? 'ok' : '',
    form.emergency_contact_name,
    form.emergency_contact_phone,
  ];
  const completedFields = completenessChecks.filter(Boolean).length;
  const completeness = Math.round((completedFields / completenessChecks.length) * 100);

  function updateField<Key extends keyof ProfileFormState>(key: Key, value: ProfileFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSuccess('');
  }

  function handlePrimaryTeamChange(primaryTeam: string) {
    setForm((current) => ({
      ...current,
      primary_team: primaryTeam,
      sectors:
        primaryTeam && !current.sectors.includes(primaryTeam)
          ? [primaryTeam, ...current.sectors]
          : current.sectors,
    }));
    setSuccess('');
  }

  function toggleSector(sector: string) {
    setForm((current) => {
      if (current.primary_team === sector && current.sectors.includes(sector)) return current;
      return {
        ...current,
        sectors: current.sectors.includes(sector)
          ? current.sectors.filter((item) => item !== sector)
          : [...current.sectors, sector],
      };
    });
    setSuccess('');
  }

  function resetForm() {
    setForm(JSON.parse(initialSnapshot) as ProfileFormState);
    setError('');
    setSuccess('Alterações descartadas.');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (form.display_name.trim().length < 3) throw new Error('Informe seu nome completo.');
      if (onlyDigits(form.phone).length < 10) throw new Error('Informe um WhatsApp válido com DDD.');
      if (!form.primary_team) throw new Error('Selecione sua equipe principal.');
      if (form.sectors.length === 0) throw new Error('Selecione pelo menos um setor.');

      await updateMyBasicProfile({
        display_name: form.display_name.trim(),
        phone: form.phone.trim(),
        birth_date: form.birth_date || null,
        city: form.city.trim(),
        neighborhood: form.neighborhood.trim(),
        ...(canEditMemberSince ? { member_since: form.member_since || null } : {}),
        primary_team: form.primary_team,
        sectors: form.sectors,
        specific_function: form.specific_function.trim(),
        shirt_size: form.shirt_size,
        has_vehicle: form.has_vehicle,
        food_restrictions: form.food_restrictions.trim(),
        health_problems: form.health_problems.trim(),
        continuous_medicine: form.continuous_medicine.trim(),
        emergency_contact: {
          name: form.emergency_contact_name.trim(),
          phone: form.emergency_contact_phone.trim(),
          relationship: form.emergency_contact_relationship.trim(),
        },
      });

      await reloadProfile();
      setSuccess('Sua identidade foi atualizada com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar perfil.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-page">
      <div className="admin-header profile-header">
        <div>
          <p className="eyebrow">Identidade do Forjado</p>
          <h2>Minha Identidade</h2>
          <p className="muted">Mantenha suas informações atualizadas para que a equipe possa cuidar bem de você.</p>
        </div>
        <span className={`status-badge ${profile.inscription_status}`}>
          <BadgeCheck size={15} />
          {STATUS_LABELS[profile.inscription_status]}
        </span>
      </div>

      <section className="profile-overview" aria-label="Resumo da identidade">
        <div className="profile-overview-main">
          <div className="profile-avatar" aria-hidden="true">
            {profile.display_name?.charAt(0)?.toUpperCase() || 'F'}
          </div>
          <div>
            <p className="eyebrow">Seu cadastro</p>
            <h3>{profile.display_name}</h3>
            <p className="muted">{ROLE_LABELS[profile.role]}{profile.member_id ? ` · ${profile.member_id}` : ''}</p>
          </div>
        </div>
        <div className="profile-completeness">
          <div>
            <strong>{completeness}% completo</strong>
            <span>{completedFields} de {completenessChecks.length} informações essenciais</span>
          </div>
          <div className="profile-progress" aria-label={`Cadastro ${completeness}% completo`}>
            <i style={{ width: `${completeness}%` }} />
          </div>
        </div>
        <div className="profile-privacy-note">
          <ShieldCheck size={20} />
          <span>Dados de saúde e emergência são restritos a pessoas autorizadas.</span>
        </div>
      </section>

      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}

      <form className="panel wide profile-form profile-form-v2" onSubmit={handleSubmit}>
        <section className="profile-section-card">
          <div className="profile-section-title">
            <UserRound size={22} />
            <div><h3>Dados pessoais</h3><p className="muted">Informações usadas para contato e identificação.</p></div>
          </div>
          <div className="grid two">
            <div>
              <label htmlFor="profile-name">Nome completo</label>
              <input id="profile-name" required autoComplete="name" maxLength={160} value={form.display_name} onChange={(event) => updateField('display_name', event.target.value)} />
            </div>
            <div>
              <label htmlFor="profile-phone">WhatsApp</label>
              <input id="profile-phone" type="tel" inputMode="tel" required autoComplete="tel" maxLength={40} placeholder="(21) 99999-9999" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
              <p className="field-hint">Inclua o DDD.</p>
            </div>
            <div>
              <label htmlFor="profile-birth-date">Data de nascimento</label>
              <input id="profile-birth-date" type="date" required autoComplete="bday" value={form.birth_date} onChange={(event) => updateField('birth_date', event.target.value)} />
            </div>
            <div>
              <label htmlFor="profile-member-since">Membro desde</label>
              <input id="profile-member-since" type="date" disabled={!canEditMemberSince} value={form.member_since} onChange={(event) => updateField('member_since', event.target.value)} />
              {!canEditMemberSince && <p className="field-hint">Apenas admin ou diretoria podem alterar esta data.</p>}
            </div>
            <div>
              <label htmlFor="profile-city">Cidade</label>
              <input id="profile-city" required autoComplete="address-level2" maxLength={120} value={form.city} onChange={(event) => updateField('city', event.target.value)} />
            </div>
            <div>
              <label htmlFor="profile-neighborhood">Bairro</label>
              <input id="profile-neighborhood" required autoComplete="address-level3" maxLength={120} value={form.neighborhood} onChange={(event) => updateField('neighborhood', event.target.value)} />
            </div>
          </div>
        </section>

        <section className="profile-section-card">
          <div className="profile-section-title">
            <UsersRound size={22} />
            <div><h3>Equipe e serviço</h3><p className="muted">Onde você serve e como a liderança organiza sua atuação.</p></div>
          </div>
          <div className="grid two">
            <div>
              <label htmlFor="profile-primary-team">Equipe principal</label>
              <select id="profile-primary-team" required value={form.primary_team} onChange={(event) => handlePrimaryTeamChange(event.target.value)}>
                <option value="">Selecione sua equipe</option>
                {PRIMARY_TEAMS.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
              <p className="field-hint">Sua equipe principal sempre permanece marcada abaixo.</p>
            </div>
            <div>
              <label htmlFor="profile-function">Função específica</label>
              <input id="profile-function" maxLength={160} placeholder="Ex.: líder de turno, motorista, recepção" value={form.specific_function} onChange={(event) => updateField('specific_function', event.target.value)} />
            </div>
          </div>
          <fieldset className="profile-sectors-fieldset">
            <legend>Outras equipes/setores</legend>
            <div className="chips">
              {SECTORS.map((sector) => (
                <button key={sector} type="button" className={form.sectors.includes(sector) ? 'chip active' : 'chip'} aria-pressed={form.sectors.includes(sector)} onClick={() => toggleSector(sector)}>{sector}</button>
              ))}
            </div>
          </fieldset>
          <div className="grid two">
            <div>
              <label htmlFor="profile-shirt-size">Tamanho da camisa</label>
              <select id="profile-shirt-size" value={form.shirt_size} onChange={(event) => updateField('shirt_size', event.target.value)}>
                {SHIRT_SIZES.map((size) => <option key={size}>{size}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="profile-vehicle">Disponibilidade de veículo</label>
              <select id="profile-vehicle" value={form.has_vehicle ? 'sim' : 'nao'} onChange={(event) => updateField('has_vehicle', event.target.value === 'sim')}>
                <option value="nao">Não possuo / não disponível</option>
                <option value="sim">Possuo veículo e posso ajudar</option>
              </select>
              <p className="field-hint"><Car size={13} /> Essa informação ajuda na organização de caronas.</p>
            </div>
          </div>
        </section>

        <section className="profile-section-card profile-sensitive-section">
          <div className="profile-section-title">
            <HeartPulse size={22} />
            <div><h3>Saúde, cuidado e emergência</h3><p className="muted">Informe somente o necessário para um cuidado seguro no retiro.</p></div>
          </div>
          <div className="grid three">
            <div>
              <label htmlFor="profile-food">Restrição alimentar</label>
              <textarea id="profile-food" maxLength={2000} placeholder="Se não houver, deixe em branco." value={form.food_restrictions} onChange={(event) => updateField('food_restrictions', event.target.value)} />
            </div>
            <div>
              <label htmlFor="profile-health">Informação relevante de saúde</label>
              <textarea id="profile-health" maxLength={2000} placeholder="Alergias, condições ou cuidados importantes." value={form.health_problems} onChange={(event) => updateField('health_problems', event.target.value)} />
            </div>
            <div>
              <label htmlFor="profile-medicine">Medicação contínua</label>
              <textarea id="profile-medicine" maxLength={2000} placeholder="Nome e orientação essencial." value={form.continuous_medicine} onChange={(event) => updateField('continuous_medicine', event.target.value)} />
            </div>
          </div>
          <h4>Contato de emergência</h4>
          <div className="grid three">
            <div>
              <label htmlFor="profile-emergency-name">Nome</label>
              <input id="profile-emergency-name" autoComplete="name" maxLength={160} value={form.emergency_contact_name} onChange={(event) => updateField('emergency_contact_name', event.target.value)} />
            </div>
            <div>
              <label htmlFor="profile-emergency-phone">Telefone</label>
              <input id="profile-emergency-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} value={form.emergency_contact_phone} onChange={(event) => updateField('emergency_contact_phone', event.target.value)} />
            </div>
            <div>
              <label htmlFor="profile-emergency-relationship">Parentesco / vínculo</label>
              <input id="profile-emergency-relationship" maxLength={120} value={form.emergency_contact_relationship} onChange={(event) => updateField('emergency_contact_relationship', event.target.value)} />
            </div>
          </div>
        </section>

        <div className="profile-save-bar">
          <p className={isDirty ? 'profile-dirty-state active' : 'profile-dirty-state'}>
            {isDirty ? 'Você tem alterações que ainda não foram salvas.' : 'Sua identidade está salva.'}
          </p>
          <div>
            {isDirty && <button className="secondary-button" type="button" onClick={resetForm} disabled={saving}><RotateCcw size={16} />Descartar</button>}
            <button className="primary-button save-profile-button" disabled={saving || !isDirty}><Save size={16} />{saving ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
