import { useEffect, useMemo, useState } from 'react';
import { Award, Car, MapPin, RefreshCw, Save, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { confirmRideCompletion, getRideSettings, listRides, updateRideSettings } from '../services/rides';
import type { Ride, RideSettings } from '../types';

const defaults: RideSettings = {
  singleton: true,
  points_mode: 'per_passenger',
  points_per_passenger: 50,
  fixed_points: 100,
  event_address: '',
  event_map_url: '',
  updated_at: '',
};

export function ManageRidesView() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<RideSettings>(defaults);
  const [rides, setRides] = useState<Ride[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [rideSettings, rideList] = await Promise.all([getRideSettings(), listRides()]);
      setSettings(rideSettings);
      setRides(rideList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a gestão de caronas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const pendingRides = useMemo(
    () => rides.filter((ride) => !['cancelled', 'completed', 'not_completed'].includes(ride.status)),
    [rides]
  );

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateRideSettings({
        points_mode: settings.points_mode,
        points_per_passenger: Number(settings.points_per_passenger),
        fixed_points: Number(settings.fixed_points),
        event_address: settings.event_address,
        event_map_url: settings.event_map_url,
      });
      setSettings(updated);
      setSuccess('Configuração de caronas atualizada. Novas caronas usarão esta regra.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  }

  function getAward(ride: Ride, count: number) {
    if (ride.points_rule_snapshot?.mode === 'fixed') return Number(ride.points_rule_snapshot.fixed_points || 0);
    return count * Number(ride.points_rule_snapshot?.points_per_passenger ?? settings.points_per_passenger);
  }

  async function validateRide(ride: Ride, completed: boolean) {
    const count = completed ? Number(counts[ride.id] ?? ride.passengers?.length ?? 0) : 0;
    if (completed && (!Number.isInteger(count) || count < 0 || count > ride.total_seats)) {
      setError('Informe uma quantidade válida de passageiros.');
      return;
    }
    const message = completed
      ? `Confirmar a carona de ${ride.driver_name} e creditar ${getAward(ride, count)} pontos?`
      : `Marcar a carona de ${ride.driver_name} como não concluída?`;
    if (!window.confirm(message)) return;
    setActingId(ride.id);
    setError('');
    try {
      await confirmRideCompletion({ rideId: ride.id, completed, confirmedPassengerCount: count });
      setSuccess(completed ? 'Carona validada e pontos creditados.' : 'Carona marcada como não concluída.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar carona.');
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="manage-rides-page">
      <div className="admin-header">
        <div><p className="eyebrow">Logística e reconhecimento</p><h2>Gerenciar Caronas</h2><p className="muted">Defina o destino oficial, a regra de honra e valide caronas realizadas.</p></div>
        <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}

      <section className="panel wide ride-settings-panel">
        <div className="section-title-row"><div><h3>Configuração oficial</h3><p className="muted">A regra fica registrada em cada nova carona para evitar mudanças retroativas.</p></div><ShieldCheck size={24} /></div>
        <form className="grid two" onSubmit={saveSettings}>
          <div><label htmlFor="ride-points-mode">Forma de pontuação</label><select id="ride-points-mode" disabled={!isAdmin} value={settings.points_mode} onChange={(e) => setSettings({ ...settings, points_mode: e.target.value as RideSettings['points_mode'] })}><option value="per_passenger">Por passageiro transportado</option><option value="fixed">Valor fixo por carona</option></select></div>
          {settings.points_mode === 'per_passenger' ? (
            <div><label htmlFor="ride-points-person">Pontos por passageiro</label><input id="ride-points-person" type="number" min="0" max="100000" disabled={!isAdmin} value={settings.points_per_passenger} onChange={(e) => setSettings({ ...settings, points_per_passenger: Number(e.target.value) })} /></div>
          ) : (
            <div><label htmlFor="ride-points-fixed">Pontos por carona</label><input id="ride-points-fixed" type="number" min="0" max="100000" disabled={!isAdmin} value={settings.fixed_points} onChange={(e) => setSettings({ ...settings, fixed_points: Number(e.target.value) })} /></div>
          )}
          <div className="schedule-wide-field"><label htmlFor="ride-event-address">Endereço oficial do retiro</label><input id="ride-event-address" maxLength={500} disabled={!isAdmin} value={settings.event_address} onChange={(e) => setSettings({ ...settings, event_address: e.target.value })} placeholder="Endereço completo do destino" /></div>
          <div className="schedule-wide-field"><label htmlFor="ride-event-map">Link do mapa</label><input id="ride-event-map" type="url" maxLength={1000} disabled={!isAdmin} value={settings.event_map_url} onChange={(e) => setSettings({ ...settings, event_map_url: e.target.value })} placeholder="https://maps.google.com/..." /></div>
          {isAdmin && <button className="primary-button" disabled={saving}><Save size={16} /> {saving ? 'Salvando...' : 'Salvar configuração'}</button>}
        </form>
      </section>

      <section className="panel wide">
        <div className="section-title-row"><div><h3>Aguardando validação</h3><p className="muted">Confira a realização e a quantidade efetiva de passageiros antes de creditar honra.</p></div><span className="notification-receipts-count"><Car size={16} />{pendingRides.length} carona(s)</span></div>
        {loading ? <p className="muted">Carregando...</p> : pendingRides.length === 0 ? <p className="muted">Nenhuma carona pendente de validação.</p> : (
          <div className="manage-rides-list">
            {pendingRides.map((ride) => {
              const count = Number(counts[ride.id] ?? ride.passengers?.length ?? 0);
              return <article className="manage-ride-card" key={ride.id}>
                <div><strong>{ride.driver_name}</strong><span><MapPin size={14} /> {ride.departure_location}</span><span><Users size={14} /> {ride.passengers?.length || 0} passageiro(s) registrado(s)</span></div>
                <div><label htmlFor={`ride-count-${ride.id}`}>Passageiros transportados</label><input id={`ride-count-${ride.id}`} type="number" min="0" max={ride.total_seats} value={counts[ride.id] ?? String(ride.passengers?.length || 0)} onChange={(e) => setCounts({ ...counts, [ride.id]: e.target.value })} /><small><Award size={13} /> {getAward(ride, count)} pontos após aprovação</small></div>
                <div className="form-actions"><button type="button" className="approve-button" disabled={actingId === ride.id} onClick={() => void validateRide(ride, true)}>Confirmar concluída</button><button type="button" className="reject-button" disabled={actingId === ride.id} onClick={() => void validateRide(ride, false)}>Não concluída</button></div>
              </article>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
