import { useState } from 'react';
import { Save } from 'lucide-react';
import { SECTORS, SHIRT_SIZES } from '../constants';
import { useAuth } from '../components/AuthProvider';
import { updateMyBasicProfile } from '../services/profiles';

export function ProfileView() {
  const { profile, reloadProfile, isAdmin, isDirector } = useAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    display_name: profile?.display_name || '',
    phone: profile?.phone || '',
    birth_date: profile?.birth_date || '',
    city: profile?.city || '',
    neighborhood: profile?.neighborhood || '',
    member_since: profile?.member_since || '',
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
  });

  if (!profile) return null;

  function toggleSector(sector: string) {
    setForm((prev) => ({
      ...prev,
      sectors: prev.sectors.includes(sector)
        ? prev.sectors.filter((item) => item !== sector)
        : [...prev.sectors, sector],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (form.sectors.length === 0) {
        throw new Error('Selecione pelo menos um setor.');
      }

      await updateMyBasicProfile({
        display_name: form.display_name,
        phone: form.phone,
        birth_date: form.birth_date || null,
        city: form.city,
        neighborhood: form.neighborhood,
        member_since: form.member_since || null,
        sectors: form.sectors,
        specific_function: form.specific_function,
        shirt_size: form.shirt_size,
        has_vehicle: form.has_vehicle,
        food_restrictions: form.food_restrictions,
        health_problems: form.health_problems,
        continuous_medicine: form.continuous_medicine,
        emergency_contact: {
          name: form.emergency_contact_name,
          phone: form.emergency_contact_phone,
          relationship: form.emergency_contact_relationship,
        },
      });

      await reloadProfile();
      setSuccess('Perfil atualizado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar perfil.');
    } finally {
      setSaving(false);
    }
  }

  const canEditMemberSince = isAdmin || isDirector;

  return (
    <div className="profile-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Identidade do Forjado</p>
          <h2>Meu Perfil</h2>
          <p className="muted">
            Consulte e atualize suas informações pessoais e de equipe.
          </p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <form className="panel wide profile-form" onSubmit={handleSubmit}>
        <section>
          <h3>Dados pessoais</h3>

          <div className="grid two">
            <div>
              <label>Nome completo</label>
              <input
                required
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>

            <div>
              <label>WhatsApp</label>
              <input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div>
              <label>Data de nascimento</label>
              <input
                type="date"
                required
                value={form.birth_date || ''}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
              />
            </div>

            <div>
              <label>Membro desde</label>
              <input
                type="date"
                disabled={!canEditMemberSince}
                value={form.member_since || ''}
                onChange={(e) => setForm({ ...form, member_since: e.target.value })}
              />
              {!canEditMemberSince && (
                <p className="field-hint">
                  Apenas admin ou diretoria podem alterar essa data.
                </p>
              )}
            </div>

            <div>
              <label>Cidade</label>
              <input
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>

            <div>
              <label>Bairro</label>
              <input
                required
                value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section>
          <h3>Equipe e função</h3>

          <label>Setores</label>
          <div className="chips">
            {SECTORS.map((sector) => (
              <button
                key={sector}
                type="button"
                className={form.sectors.includes(sector) ? 'chip active' : 'chip'}
                onClick={() => toggleSector(sector)}
              >
                {sector}
              </button>
            ))}
          </div>

          <div className="grid two">
            <div>
              <label>Função específica</label>
              <input
                value={form.specific_function}
                onChange={(e) =>
                  setForm({ ...form, specific_function: e.target.value })
                }
              />
            </div>

            <div>
              <label>Tamanho da camisa</label>
              <select
                value={form.shirt_size}
                onChange={(e) => setForm({ ...form, shirt_size: e.target.value })}
              >
                {SHIRT_SIZES.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Possui veículo?</label>
              <select
                value={form.has_vehicle ? 'sim' : 'nao'}
                onChange={(e) =>
                  setForm({ ...form, has_vehicle: e.target.value === 'sim' })
                }
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h3>Saúde e emergência</h3>

          <div className="grid two">
            <div>
              <label>Restrição alimentar</label>
              <input
                value={form.food_restrictions}
                onChange={(e) =>
                  setForm({ ...form, food_restrictions: e.target.value })
                }
              />
            </div>

            <div>
              <label>Problemas de saúde</label>
              <input
                value={form.health_problems}
                onChange={(e) =>
                  setForm({ ...form, health_problems: e.target.value })
                }
              />
            </div>

            <div>
              <label>Medicação contínua</label>
              <input
                value={form.continuous_medicine}
                onChange={(e) =>
                  setForm({ ...form, continuous_medicine: e.target.value })
                }
              />
            </div>
          </div>

          <h4>Contato de emergência</h4>

          <div className="grid three">
            <div>
              <label>Nome</label>
              <input
                value={form.emergency_contact_name}
                onChange={(e) =>
                  setForm({ ...form, emergency_contact_name: e.target.value })
                }
              />
            </div>

            <div>
              <label>Telefone</label>
              <input
                value={form.emergency_contact_phone}
                onChange={(e) =>
                  setForm({ ...form, emergency_contact_phone: e.target.value })
                }
              />
            </div>

            <div>
              <label>Parentesco</label>
              <input
                value={form.emergency_contact_relationship}
                onChange={(e) =>
                  setForm({
                    ...form,
                    emergency_contact_relationship: e.target.value,
                  })
                }
              />
            </div>
          </div>
        </section>

        <button className="primary-button save-profile-button" disabled={saving}>
          <Save size={16} />
          {saving ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </form>
    </div>
  );
}