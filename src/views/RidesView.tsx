import { useEffect, useMemo, useState } from 'react';
import { Car, MapPin, Plus, RefreshCw, UserPlus, XCircle } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import {
  cancelRide,
  confirmRideCompletion,
  createRide,
  formatRideStatus,
  joinRide,
  leaveRide,
  listRides,
} from '../services/rides';
import { withTimeout } from '../services/safeAsync';
import type { Ride } from '../types';

type RideFilter = 'all' | 'available' | 'mine';

export function RidesView() {
  const { profile, isAdmin, isDirector } = useAuth();

  const [rides, setRides] = useState<Ride[]>([]);
  const [filter, setFilter] = useState<RideFilter>('all');

  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmedCounts, setConfirmedCounts] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    departureLocation: '',
    departureTime: '',
    totalSeats: '1',
    vehicleType: '',
    notes: '',
  });

  async function loadRides() {
    setLoading(true);
    setError('');

    try {
      const data = await withTimeout(
        listRides(),
        10000,
        'Não foi possível carregar as caronas. Tente novamente.'
      );

      setRides(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar caronas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRides();
  }, []);

  const filteredRides = useMemo(() => {
    return rides.filter((ride) => {
      if (!profile) return false;

      if (filter === 'available') {
        return ride.status === 'available' || ride.status === 'full';
      }

      if (filter === 'mine') {
        const isDriver = ride.driver_id === profile.id;
        const isPassenger = ride.passengers?.some(
          (passenger) => passenger.passenger_id === profile.id
        );

        return isDriver || isPassenger;
      }

      return true;
    });
  }, [rides, filter, profile]);

  async function handleCreateRide(e: React.FormEvent) {
    e.preventDefault();

    if (!profile) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const totalSeats = Number(form.totalSeats);

      if (!form.departureLocation.trim()) {
        throw new Error('Informe o local de saída.');
      }

      if (!totalSeats || totalSeats <= 0) {
        throw new Error('Informe uma quantidade válida de vagas.');
      }

      await createRide({
        driverName: profile.display_name,
        driverPhotoUrl: '',
        departureLocation: form.departureLocation,
        departureTime: form.departureTime,
        totalSeats,
        vehicleType: form.vehicleType,
        notes: form.notes,
      });

      setForm({
        departureLocation: '',
        departureTime: '',
        totalSeats: '1',
        vehicleType: '',
        notes: '',
      });

      setShowForm(false);
      setSuccess('Carona criada com sucesso.');
      await loadRides();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao criar carona.');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmRide(ride: Ride, completed: boolean) {
    setSaving(true);
    setError('');
    setSuccess('');
  
    try {
      const rawCount = confirmedCounts[ride.id];
  
      const passengerCount =
        rawCount !== undefined && rawCount !== ''
          ? Number(rawCount)
          : ride.passengers?.length || 0;
  
      if (completed && passengerCount < 0) {
        throw new Error('Informe uma quantidade válida de passageiros.');
      }
  
      await confirmRideCompletion({
        rideId: ride.id,
        completed,
        confirmedPassengerCount: completed ? passengerCount : 0,
      });
  
      setSuccess(
        completed
          ? `Carona concluída. ${passengerCount * 50} pontos lançados.`
          : 'Carona marcada como não concluída.'
      );
  
      await loadRides();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao confirmar carona.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleJoinRide(ride: Ride) {
    if (!profile) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await joinRide({
        ride,
        passengerName: profile.display_name,
      });

      setSuccess('Você entrou na carona.');
      await loadRides();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao entrar na carona.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLeaveRide(ride: Ride) {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await leaveRide(ride);
      setSuccess('Você saiu da carona.');
      await loadRides();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao sair da carona.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelRide(ride: Ride) {
    const confirmed = window.confirm('Tem certeza que deseja cancelar essa carona?');

    if (!confirmed) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await cancelRide(ride.id);
      setSuccess('Carona cancelada.');
      await loadRides();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao cancelar carona.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return null;

  return (
    <div className="rides-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Sistema de caronas</p>
          <h2>Caronas</h2>
          <p className="muted">
            Crie caronas, participe de caronas disponíveis e acompanhe passageiros.
          </p>
        </div>

        <div className="rides-header-actions">
          <button className="secondary-button" type="button" onClick={loadRides}>
            <RefreshCw size={16} />
            Atualizar
          </button>

          <button
            className="primary-button"
            type="button"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus size={16} />
            Nova carona
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      {showForm && (
        <section className="panel wide ride-form-panel">
          <h3>Criar nova carona</h3>

          <form className="ride-form" onSubmit={handleCreateRide}>
            <div className="grid two">
              <div>
                <label>Local de saída</label>
                <input
                  value={form.departureLocation}
                  placeholder="Ex: Praça central, igreja, estação..."
                  onChange={(e) =>
                    setForm({ ...form, departureLocation: e.target.value })
                  }
                />
              </div>

              <div>
                <label>Horário de saída</label>
                <input
                  type="datetime-local"
                  value={form.departureTime}
                  onChange={(e) =>
                    setForm({ ...form, departureTime: e.target.value })
                  }
                />
              </div>

              <div>
                <label>Quantidade de vagas</label>
                <input
                  type="number"
                  min="1"
                  value={form.totalSeats}
                  onChange={(e) =>
                    setForm({ ...form, totalSeats: e.target.value })
                  }
                />
              </div>

              <div>
                <label>Veículo</label>
                <input
                  value={form.vehicleType}
                  placeholder="Ex: Gol prata, Spin, van..."
                  onChange={(e) =>
                    setForm({ ...form, vehicleType: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <label>Observações</label>
              <textarea
                value={form.notes}
                placeholder="Ex: passar na Av. Brasil, levar pouca bagagem..."
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <button className="primary-button" disabled={saving}>
              {saving ? 'Salvando...' : 'Criar carona'}
            </button>
          </form>
        </section>
      )}

      <section className="rides-filters">
        <button
          type="button"
          className={filter === 'all' ? 'chip active' : 'chip'}
          onClick={() => setFilter('all')}
        >
          Todas
        </button>

        <button
          type="button"
          className={filter === 'available' ? 'chip active' : 'chip'}
          onClick={() => setFilter('available')}
        >
          Disponíveis
        </button>

        <button
          type="button"
          className={filter === 'mine' ? 'chip active' : 'chip'}
          onClick={() => setFilter('mine')}
        >
          Minhas caronas
        </button>
      </section>

      {loading ? (
        <div className="panel center">
          <div className="loader"></div>
          <p className="muted">Carregando caronas...</p>
        </div>
      ) : filteredRides.length === 0 ? (
        <div className="panel center">
          <p className="muted">Nenhuma carona encontrada.</p>
        </div>
      ) : (
        <section className="rides-list">
          {filteredRides.map((ride) => {
            const isDriver = ride.driver_id === profile.id;
            const isPassenger = ride.passengers?.some(
              (passenger) => passenger.passenger_id === profile.id
            );
            const canJoin =
              !isDriver &&
              !isPassenger &&
              ride.status === 'available' &&
              ride.available_seats > 0;

            const canLeave = !isDriver && isPassenger && ride.status !== 'cancelled';
            const canCancel = isDriver && ride.status !== 'cancelled';
            const canConfirmRide =
  (isAdmin || isDirector) &&
  ride.status !== 'cancelled' &&
  ride.status !== 'completed' &&
  ride.status !== 'not_completed';

const suggestedPassengerCount = String(ride.passengers?.length || 0);

            return (
              <div className="ride-card" key={ride.id}>
                <div className="ride-top">
                  <div className="ride-driver">
                    <div className="avatar">
                      {ride.driver_name?.charAt(0)?.toUpperCase() || 'F'}
                    </div>

                    <div>
                      <h3>{ride.driver_name}</h3>
                      <p className="muted">Motorista</p>
                    </div>
                  </div>

                  <span className={`ride-status ${ride.status}`}>
                    {formatRideStatus(ride.status)}
                  </span>
                </div>

                <div className="ride-info-grid">
                  <div>
                    <label>Saída</label>
                    <p>
                      <MapPin size={14} />
                      {ride.departure_location}
                    </p>
                  </div>

                  <div>
                    <label>Horário</label>
                    <p>
                      {ride.departure_time
                        ? new Date(ride.departure_time).toLocaleString('pt-BR')
                        : 'Não informado'}
                    </p>
                  </div>

                  <div>
                    <label>Vagas</label>
                    <p>
                      {ride.available_seats} de {ride.total_seats} disponíveis
                    </p>
                  </div>

                  <div>
                    <label>Veículo</label>
                    <p>
                      <Car size={14} />
                      {ride.vehicle_type || 'Não informado'}
                    </p>
                  </div>
                </div>

                {ride.notes && (
                  <div className="ride-notes">
                    <label>Observações</label>
                    <p>{ride.notes}</p>
                  </div>
                )}

                <div className="ride-passengers">
                  <label>Passageiros</label>

                  {ride.passengers && ride.passengers.length > 0 ? (
                    <div className="passenger-list">
                      {ride.passengers.map((passenger) => (
                        <span key={passenger.id}>
                          {passenger.passenger_name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">Nenhum passageiro ainda.</p>
                  )}
                </div>

                <div className="ride-actions">
                  {canJoin && (
                    <button
                      type="button"
                      className="approve-button"
                      disabled={saving}
                      onClick={() => handleJoinRide(ride)}
                    >
                      <UserPlus size={16} />
                      Entrar na carona
                    </button>
                  )}

                  {canLeave && (
                    <button
                      type="button"
                      className="reject-button"
                      disabled={saving}
                      onClick={() => handleLeaveRide(ride)}
                    >
                      <XCircle size={16} />
                      Sair da carona
                    </button>
                  )}

                  {canCancel && (
                    <button
                      type="button"
                      className="reject-button"
                      disabled={saving}
                      onClick={() => handleCancelRide(ride)}
                    >
                      <XCircle size={16} />
                      Cancelar carona
                    </button>
                  )}

                  {isDriver && (
                    <span className="ride-owner-label">Você é o motorista</span>
                  )}

                  {isPassenger && (
                    <span className="ride-passenger-label">Você está nessa carona</span>
                  )}

{canConfirmRide && (
  <div className="ride-confirm-box">
    <div>
      <label>Passageiros confirmados</label>
      <input
        type="number"
        min="0"
        max={ride.total_seats}
        value={confirmedCounts[ride.id] ?? suggestedPassengerCount}
        onChange={(e) =>
          setConfirmedCounts((prev) => ({
            ...prev,
            [ride.id]: e.target.value,
          }))
        }
      />
      <p className="muted">
        Pontuação: {(Number(confirmedCounts[ride.id] ?? suggestedPassengerCount) || 0) * 50} pts
      </p>
    </div>

    <button
      type="button"
      className="approve-button"
      disabled={saving}
      onClick={() => handleConfirmRide(ride, true)}
    >
      Confirmar concluída
    </button>

    <button
      type="button"
      className="reject-button"
      disabled={saving}
      onClick={() => handleConfirmRide(ride, false)}
    >
      Não concluída
    </button>
  </div>
)}

{ride.status === 'completed' && (
  <span className="payment-approved-label">
    Carona concluída · {ride.confirmed_passenger_count || 0} passageiro(s) · Pontos lançados
  </span>
)}

{ride.status === 'not_completed' && (
  <span className="payment-rejected-label">
    Carona marcada como não concluída
  </span>
)}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}