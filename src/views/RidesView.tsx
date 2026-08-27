import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Car, MapPin, Plus, RefreshCw, Route, UserPlus, Users, XCircle } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { AdminHistoryDeleteButton } from '../components/AdminHistoryDeleteButton';
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

function getSafeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function getDepartureTimestamp(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function hasRideDeparted(value?: string | null) {
  return getDepartureTimestamp(value) <= Date.now();
}

export function RidesView() {
  const { profile, isAdmin, isDirector } = useAuth();

  const [rides, setRides] = useState<Ride[]>([]);
  const [filter, setFilter] = useState<RideFilter>('all');

  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionRideId, setActionRideId] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmedCounts, setConfirmedCounts] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    departureLocation: '',
    departureMapUrl: '',
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
        return ride.status === 'available' && ride.available_seats > 0 && !hasRideDeparted(ride.departure_time);
      }

      if (filter === 'mine') {
        const isDriver = ride.driver_id === profile.id;
        const isPassenger = ride.passengers?.some(
          (passenger) => passenger.passenger_id === profile.id
        );

        return isDriver || isPassenger;
      }

      return true;
    }).sort((first, second) => {
      const firstActive = ['available', 'full', 'confirmed'].includes(first.status) && !hasRideDeparted(first.departure_time) ? 0 : 1;
      const secondActive = ['available', 'full', 'confirmed'].includes(second.status) && !hasRideDeparted(second.departure_time) ? 0 : 1;
      if (firstActive !== secondActive) return firstActive - secondActive;
      return getDepartureTimestamp(first.departure_time) - getDepartureTimestamp(second.departure_time);
    });
  }, [rides, filter, profile]);

  const rideMetrics = useMemo(() => {
    if (!profile) return { open: 0, seats: 0, mine: 0 };
    return rides.reduce((totals, ride) => {
      const active = ['available', 'full', 'confirmed'].includes(ride.status) && !hasRideDeparted(ride.departure_time);
      const mine = ride.driver_id === profile.id || ride.passengers?.some((passenger) => passenger.passenger_id === profile.id);
      return {
        open: totals.open + (active ? 1 : 0),
        seats: totals.seats + (active ? Math.max(0, ride.available_seats) : 0),
        mine: totals.mine + (mine ? 1 : 0),
      };
    }, { open: 0, seats: 0, mine: 0 });
  }, [rides, profile]);

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

      if (totalSeats > 20) {
        throw new Error('Para mais de 20 vagas, fale com a diretoria para cadastrar o transporte.');
      }

      if (!form.departureTime) {
        throw new Error('Informe a data e o horário de saída.');
      }

      if (new Date(form.departureTime).getTime() <= Date.now()) {
        throw new Error('O horário da carona precisa estar no futuro.');
      }

      if (form.departureMapUrl.trim() && !getSafeExternalUrl(form.departureMapUrl.trim())) {
        throw new Error('Use um link válido do Google Maps, Waze ou outro mapa com HTTPS.');
      }

      await createRide({
        driverName: profile.display_name,
        driverPhotoUrl: '',
        departureLocation: form.departureLocation,
        departureMapUrl: form.departureMapUrl,
        departureTime: form.departureTime,
        totalSeats,
        vehicleType: form.vehicleType,
        notes: form.notes,
      });

      setForm({
        departureLocation: '',
        departureMapUrl: '',
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
    setActionRideId(ride.id);
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
          ? `Carona concluída. ${passengerCount * 50} pontos de honra lançados.`
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
      setActionRideId(null);
    }
  }

  async function handleJoinRide(ride: Ride) {
    if (!profile) return;

    setActionRideId(ride.id);
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
      setActionRideId(null);
    }
  }

  async function handleLeaveRide(ride: Ride) {
    setActionRideId(ride.id);
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
      setActionRideId(null);
    }
  }

  async function handleCancelRide(ride: Ride) {
    const confirmed = window.confirm('Tem certeza que deseja cancelar essa carona?');

    if (!confirmed) return;

    setActionRideId(ride.id);
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
      setActionRideId(null);
    }
  }

  if (!profile) return null;

  return (
    <div className="rides-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Caminho compartilhado</p>
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

      <section className="rides-overview" aria-label="Resumo das caronas">
        <div className="card"><Route size={20} /><span>Caronas em aberto</span><strong>{rideMetrics.open}</strong></div>
        <div className="card"><Users size={20} /><span>Vagas disponíveis</span><strong>{rideMetrics.seats}</strong></div>
        <div className="card"><Car size={20} /><span>Minhas caronas</span><strong>{rideMetrics.mine}</strong></div>
      </section>

      {showForm && (
        <section className="panel wide ride-form-panel">
          <h3>Oferecer carona</h3>

          <form className="ride-form" onSubmit={handleCreateRide}>
            <div className="grid two">
              <div>
                <label>Local de saída</label>
                <input
                  required
                  maxLength={180}
                  value={form.departureLocation}
                  placeholder="Ex: Praça central, igreja, estação..."
                  onChange={(e) =>
                    setForm({ ...form, departureLocation: e.target.value })
                  }
                />
              </div>

              <div>
                <label>Link do local de saída</label>
                <input
                  type="url"
                  inputMode="url"
                  maxLength={500}
                  value={form.departureMapUrl}
                  placeholder="Cole aqui o link do Google Maps ou Waze"
                  onChange={(e) =>
                    setForm({ ...form, departureMapUrl: e.target.value })
                  }
                />
              </div>

              <div>
                <label>Horário de saída</label>
                <input
                  type="datetime-local"
                  required
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
                  max="20"
                  required
                  value={form.totalSeats}
                  onChange={(e) =>
                    setForm({ ...form, totalSeats: e.target.value })
                  }
                />
              </div>

              <div>
                <label>Veículo</label>
                <input
                  maxLength={120}
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
                maxLength={1000}
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
          Com vaga
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
          <p className="muted">Nenhuma carona encontrada. Seja o primeiro a abrir caminho para alguém.</p>
        </div>
      ) : (
        <section className="rides-list">
          {filteredRides.map((ride) => {
            const isDriver = ride.driver_id === profile.id;
            const isPassenger = ride.passengers?.some(
              (passenger) => passenger.passenger_id === profile.id
            );
            const rideHasDeparted = hasRideDeparted(ride.departure_time);
            const isExpiredActiveRide = rideHasDeparted && ['available', 'full', 'confirmed'].includes(ride.status);
            const canJoin =
              !isDriver &&
              !isPassenger &&
              ride.status === 'available' &&
              ride.available_seats > 0 &&
              !rideHasDeparted;

            const canLeave = !isDriver && isPassenger && ['available', 'full'].includes(ride.status) && !rideHasDeparted;
            const canCancel = isDriver && ['available', 'full', 'confirmed'].includes(ride.status) && !rideHasDeparted;
            const canConfirmRide =
              (isAdmin || isDirector) &&
              ride.status !== 'cancelled' &&
              ride.status !== 'completed' &&
              ride.status !== 'not_completed';
            const suggestedPassengerCount = String(ride.passengers?.length || 0);
            const occupiedSeats = Math.max(0, Math.min(ride.total_seats, ride.total_seats - ride.available_seats));
            const occupancyPercent = ride.total_seats > 0 ? Math.round((occupiedSeats / ride.total_seats) * 100) : 0;
            const mapUrl = getSafeExternalUrl(ride.departure_map_url);
            const isActing = actionRideId === ride.id;

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

                  <span className={`ride-status ${isExpiredActiveRide ? 'expired' : ride.status}`}>
                    {isExpiredActiveRide ? 'Horário encerrado' : formatRideStatus(ride.status)}
                  </span>
                </div>

                <div className="ride-info-grid">
                  <div>
                    <label>Saída</label>
                    <p>
                      <MapPin size={14} />
                      {mapUrl ? (
                        <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                          {ride.departure_location}
                        </a>
                      ) : (
                        ride.departure_location
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Horário</label>
                    <p>
                      <CalendarClock size={14} />
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

                <div className="ride-occupancy">
                  <div>
                    <span>{occupiedSeats} vaga(s) ocupada(s)</span>
                    <strong>{ride.available_seats} disponível(is)</strong>
                  </div>
                  <div className="ride-occupancy-track" aria-label={`${occupancyPercent}% das vagas ocupadas`}>
                    <i style={{ width: `${occupancyPercent}%` }} />
                  </div>
                </div>

                {ride.notes && (
                  <div className="ride-notes">
                    <label>Observações</label>
                    <p>{ride.notes}</p>
                  </div>
                )}

                <div className="ride-passengers">
                  <label>Passageiros ({ride.passengers?.length || 0})</label>

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
                  {isExpiredActiveRide && (
                    <p className="ride-expired-notice">
                      Esta carona não aceita mais entradas. A diretoria pode registrar se ela foi concluída.
                    </p>
                  )}

                  {canJoin && (
                    <button
                      type="button"
                      className="approve-button"
                      disabled={Boolean(actionRideId)}
                      onClick={() => handleJoinRide(ride)}
                    >
                      <UserPlus size={16} />
                      {isActing ? 'Entrando...' : 'Entrar na carona'}
                    </button>
                  )}

                  {canLeave && (
                    <button
                      type="button"
                      className="reject-button"
                      disabled={Boolean(actionRideId)}
                      onClick={() => handleLeaveRide(ride)}
                    >
                      <XCircle size={16} />
                      {isActing ? 'Saindo...' : 'Sair da carona'}
                    </button>
                  )}

                  {canCancel && (
                    <button
                      type="button"
                      className="reject-button"
                      disabled={Boolean(actionRideId)}
                      onClick={() => handleCancelRide(ride)}
                    >
                      <XCircle size={16} />
                      {isActing ? 'Cancelando...' : 'Cancelar carona'}
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
                          onChange={(event) => setConfirmedCounts((current) => ({ ...current, [ride.id]: event.target.value }))}
                        />
                        <p className="muted">Pontuação: {(Number(confirmedCounts[ride.id] ?? suggestedPassengerCount) || 0) * 50} pts</p>
                      </div>
                      <button type="button" className="approve-button" disabled={Boolean(actionRideId)} onClick={() => handleConfirmRide(ride, true)}>
                        {isActing ? 'Confirmando...' : 'Confirmar concluída'}
                      </button>
                      <button type="button" className="reject-button" disabled={Boolean(actionRideId)} onClick={() => handleConfirmRide(ride, false)}>Não concluída</button>
                    </div>
                  )}

                  {ride.status === 'completed' && (
                    <span className="payment-approved-label">
                      Carona concluída · {ride.confirmed_passenger_count || 0} passageiro(s) · Honra lançada
                    </span>
                  )}

                  {ride.status === 'not_completed' && (
                    <span className="payment-rejected-label">
                      Carona marcada como não concluída
                    </span>
                  )}

                  {isAdmin && (
                    <AdminHistoryDeleteButton
                      entityType="rides"
                      entityId={ride.id}
                      itemLabel={`a carona de ${ride.driver_name}`}
                      onDeleted={() => {
                        setRides((current) => current.filter((item) => item.id !== ride.id));
                        setSuccess('Carona retirada do histórico e honra relacionada recalculada.');
                      }}
                    />
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
