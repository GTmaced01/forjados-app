import { supabase } from './supabase';
import type { Ride } from '../types';

export async function listRides(): Promise<Ride[]> {
  const { data, error } = await supabase
    .from('rides')
    .select('*, passengers:ride_passengers(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as Ride[];
}

export async function createRide(params: {
  driverName: string;
  driverPhotoUrl?: string;
  departureLocation: string;
  departureTime: string;
  totalSeats: number;
  vehicleType: string;
  notes: string;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { error } = await supabase.from('rides').insert({
    driver_id: userData.user.id,
    driver_name: params.driverName,
    driver_photo_url: params.driverPhotoUrl || '',
    departure_location: params.departureLocation,
    departure_time: params.departureTime,
    total_seats: params.totalSeats,
    available_seats: params.totalSeats,
    vehicle_type: params.vehicleType,
    status: 'available',
    notes: params.notes,
    completed_points_awarded: false,
  });

  if (error) throw error;
}

export async function joinRide(params: {
  ride: Ride;
  passengerName: string;
}) {
  const { error } = await supabase.rpc('join_ride_atomic', {
    p_ride_id: params.ride.id,
    p_passenger_name: params.passengerName,
  });

  if (error) {
    throw new Error(error.message || 'Erro ao entrar na carona.');
  }
}

export async function leaveRide(ride: Ride) {
  const { error } = await supabase.rpc('leave_ride_atomic', {
    p_ride_id: ride.id,
  });

  if (error) {
    throw new Error(error.message || 'Erro ao sair da carona.');
  }
}

export async function cancelRide(rideId: string) {
  const { error } = await supabase
    .from('rides')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', rideId);

  if (error) throw error;
}

export function formatRideStatus(status: Ride['status']) {
  if (status === 'available') return 'Disponível';
  if (status === 'full') return 'Lotada';
  if (status === 'cancelled') return 'Cancelada';
  if (status === 'confirmed') return 'Confirmada';
  if (status === 'completed') return 'Concluída';
  if (status === 'not_completed') return 'Não concluída';

  return status;
}

export async function confirmRideCompletion(params: {
  rideId: string;
  completed: boolean;
  confirmedPassengerCount: number;
}) {
  const { error } = await supabase.rpc('confirm_ride_completion', {
    p_ride_id: params.rideId,
    p_completed: params.completed,
    p_confirmed_passenger_count: params.confirmedPassengerCount,
  });

  if (error) {
    throw new Error(error.message || 'Erro ao confirmar carona.');
  }
}