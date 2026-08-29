import { useState } from 'react';
import {
  FORJADOS_MAIN_MESSAGE,
  PRIMARY_TEAMS,
  SECTORS,
  SHIRT_SIZES,
  SKILLS,
} from '../constants';
import { updateMyRegistration } from '../services/profiles';
import { useAuth } from '../components/AuthProvider';
import type { UserRole } from '../types';
import { LegalDocumentsView, type LegalDocumentsTab } from './LegalDocumentsView';

export function RegistrationView() {
  const { reloadProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [legalTab, setLegalTab] = useState<LegalDocumentsTab | null>(null);
  const [form, setForm] = useState({
    display_name: '',
    birth_date: '',
    phone: '',
    city: '',
    neighborhood: '',
    requested_role: 'member' as UserRole,
    primary_team: '',
    sectors: [] as string[],
    specific_function: '',
    experience_level: 'beginner',
    shirt_size: 'M',
    has_vehicle: false,
    skills: [] as string[],
    food_restrictions: '',
    health_problems: '',
    continuous_medicine: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    privacyPolicy: false,
    responsibilityTerm: false,
    retreatRules: false,
    spiritualCommitment: false,
  });

  function handlePrimaryTeamChange(primaryTeam: string) {
    setForm((prev) => ({
      ...prev,
      primary_team: primaryTeam,
      sectors:
        primaryTeam && !prev.sectors.includes(primaryTeam)
          ? [primaryTeam, ...prev.sectors]
          : prev.sectors,
    }));
  }

  function toggleSector(sector: string) {
    setForm((prev) => ({
      ...prev,
      sectors: prev.sectors.includes(sector)
        ? prev.sectors.filter((item) => item !== sector)
        : [...prev.sectors, sector],
    }));
  }

  function toggleSkill(skill: string) {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter((item) => item !== skill)
        : [...prev.skills, skill],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!form.primary_team) throw new Error('Selecione sua equipe principal.');
      if (form.sectors.length === 0) throw new Error('Selecione pelo menos um setor.');

      await updateMyRegistration({
        display_name: form.display_name,
        birth_date: form.birth_date || null,
        phone: form.phone,
        city: form.city,
        neighborhood: form.neighborhood,
        requested_role: form.requested_role,
        primary_team: form.primary_team,
        sectors: form.sectors,
        specific_function: form.specific_function,
        experience_level: form.experience_level,
        shirt_size: form.shirt_size,
        has_vehicle: form.has_vehicle,
        skills: form.skills,
        food_restrictions: form.food_restrictions,
        health_problems: form.health_problems,
        continuous_medicine: form.continuous_medicine,
        emergency_contact: {
          name: form.emergency_contact_name,
          phone: form.emergency_contact_phone,
          relationship: form.emergency_contact_relationship,
        },
        terms_accepted: {
          imageUse: true,
          commitment: form.spiritualCommitment,
          rules: form.retreatRules,
          truthfulInfo: true,
          termsOfParticipation: form.responsibilityTerm,
          privacyPolicy: form.privacyPolicy,
          responsibilityTerm: form.responsibilityTerm,
        },
      });

      await reloadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar ficha.');
    } finally {
      setLoading(false);
    }
  }

  if (legalTab) {
    return <LegalDocumentsView initialTab={legalTab} onBack={() => setLegalTab(null)} />;
  }

  return (
    <div className="page-center">
      <form className="panel wide" onSubmit={handleSubmit}>
        <h1>Solicitar acesso</h1>
        <p className="muted">
          Preencha sua ficha para análise da diretoria. O FORJADOS existe para conduzir pessoas a
          cura, identidade, perdão e propósito.
        </p>
        <div className="alert success registration-highlight">{FORJADOS_MAIN_MESSAGE}</div>
        {error && <div className="alert error">{error}</div>}

        <div className="grid two">
          <div><label>Nome completo</label><input required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
          <div><label>Data de nascimento</label><input required type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
          <div><label>WhatsApp</label><input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label>Cidade</label><input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><label>Bairro</label><input required value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></div>
          <div>
            <label>Tipo de participação</label>
            <select value={form.requested_role} onChange={(e) => setForm({ ...form, requested_role: e.target.value as UserRole })}>
              <option value="member">Equipe</option>
              <option value="leader">Líder</option>
              <option value="director">Diretoria</option>
              <option value="treasury">Tesouraria</option>
            </select>
          </div>
          <div>
            <label>Equipe principal</label>
            <select required value={form.primary_team} onChange={(e) => handlePrimaryTeamChange(e.target.value)}>
              <option value="">Selecione sua equipe</option>
              {PRIMARY_TEAMS.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
            <p className="field-hint">Essa equipe será usada para vincular líderes e liderados.</p>
          </div>
        </div>

        <label>Outras equipes/setores que você também ajuda</label>
        <div className="chips">
          {SECTORS.map((sector) => (
            <button key={sector} type="button" className={form.sectors.includes(sector) ? 'chip active' : 'chip'} onClick={() => toggleSector(sector)}>{sector}</button>
          ))}
        </div>

        <div className="grid two">
          <div><label>Função específica</label><input value={form.specific_function} onChange={(e) => setForm({ ...form, specific_function: e.target.value })} placeholder="Ex.: backing vocal, câmera, recepção, intercessor" /></div>
          <div><label>Tamanho da camisa</label><select value={form.shirt_size} onChange={(e) => setForm({ ...form, shirt_size: e.target.value })}>{SHIRT_SIZES.map((size) => <option key={size}>{size}</option>)}</select></div>
        </div>

        <label>Habilidades</label>
        <div className="chips">
          {SKILLS.map((skill) => (
            <button key={skill} type="button" className={form.skills.includes(skill) ? 'chip active' : 'chip'} onClick={() => toggleSkill(skill)}>{skill}</button>
          ))}
        </div>

        <div className="grid two">
          <div><label>Restrição alimentar</label><input value={form.food_restrictions} onChange={(e) => setForm({ ...form, food_restrictions: e.target.value })} /></div>
          <div><label>Problema de saúde</label><input value={form.health_problems} onChange={(e) => setForm({ ...form, health_problems: e.target.value })} /></div>
          <div><label>Medicação contínua</label><input value={form.continuous_medicine} onChange={(e) => setForm({ ...form, continuous_medicine: e.target.value })} /></div>
          <div><label>Possui veículo?</label><select value={form.has_vehicle ? 'sim' : 'nao'} onChange={(e) => setForm({ ...form, has_vehicle: e.target.value === 'sim' })}><option value="nao">Não</option><option value="sim">Sim</option></select></div>
        </div>

        <h3>Contato de emergência</h3>
        <div className="grid three">
          <div><label>Nome</label><input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></div>
          <div><label>Telefone</label><input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></div>
          <div><label>Parentesco</label><input value={form.emergency_contact_relationship} onChange={(e) => setForm({ ...form, emergency_contact_relationship: e.target.value })} /></div>
        </div>

        <div className="terms">
          <label><input type="checkbox" required checked={form.retreatRules} onChange={(e) => setForm({ ...form, retreatRules: e.target.checked })} /><span>Li e aceito as <button type="button" className="inline-legal-link" onClick={() => setLegalTab('rules')}>Regras do Retiro</button>, preservando o ambiente de cuidado, sigilo, respeito e restauração.</span></label>
          <label><input type="checkbox" required checked={form.privacyPolicy} onChange={(e) => setForm({ ...form, privacyPolicy: e.target.checked })} /><span>Li e aceito a <button type="button" className="inline-legal-link" onClick={() => setLegalTab('privacy')}>Política de Privacidade</button> do FORJADOS.</span></label>
          <label><input type="checkbox" required checked={form.responsibilityTerm} onChange={(e) => setForm({ ...form, responsibilityTerm: e.target.checked })} /><span>Li e aceito o <button type="button" className="inline-legal-link" onClick={() => setLegalTab('terms')}>Termo de Responsabilidade</button> e declaro que os dados informados são verdadeiros.</span></label>
          <label><input type="checkbox" required checked={form.spiritualCommitment} onChange={(e) => setForm({ ...form, spiritualCommitment: e.target.checked })} />Reconheço o propósito do FORJADOS e me comprometo a cooperar com um ambiente de perdão, honra, cura e amor.</label>
        </div>

        <button className="primary-button" disabled={loading}>{loading ? 'Salvando...' : 'Enviar ficha'}</button>
      </form>
    </div>
  );
}
