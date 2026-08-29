import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { InscriptionStatus, UserProfile, UserRole } from '../types';

function getSupabaseErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;

  if (error instanceof Error && error.message) return error.message;

  if (typeof error === 'object') {
    const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [maybe.message, maybe.details, maybe.hint, maybe.code]
      .filter(Boolean)
      .map(String);

    if (parts.length > 0) return parts.join(' | ');
  }

  return fallback;
}

function throwRpcError(error: unknown, fallback: string): never {
  throw new Error(getSupabaseErrorMessage(error, fallback), { cause: error });
}


export async function getMyProfile(currentUser?: User | null): Promise<UserProfile | null> {
  let user = currentUser ?? null;

  if (!user) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Erro ao recuperar sessão:', sessionError);
      throw new Error(sessionError.message || 'Erro ao recuperar sessão.');
    }

    user = sessionData.session?.user ?? null;
  }

  if (!user) {
    return null;
  }

  const { data: existingProfile, error: selectError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (selectError) {
    console.error('Erro ao buscar profile:', selectError);
    throw new Error(
      selectError.message ||
        'Erro ao buscar perfil. Verifique as permissões da tabela profiles.'
    );
  }

  if (existingProfile) {
    return existingProfile as UserProfile;
  }

  const { data: createdProfile, error: createError } = await supabase.rpc(
    'forjados_ensure_my_profile_v1'
  );

  if (createError) throwRpcError(createError, 'Não foi possível preparar seu perfil.');
  return (createdProfile || null) as UserProfile | null;
}

export async function updateMyRegistration(params: {
  display_name: string;
  birth_date: string | null;
  phone: string;
  city: string;
  neighborhood: string;
  requested_role: UserRole;
  primary_team: string;
  sectors: string[];
  specific_function: string;
  experience_level: string;
  shirt_size: string;
  has_vehicle: boolean;
  skills: string[];
  food_restrictions: string;
  health_problems: string;
  continuous_medicine: string;
  emergency_contact: {
    name: string;
    phone: string;
    relationship: string;
  };
  terms_accepted: {
    imageUse: boolean;
    commitment: boolean;
    rules: boolean;
    termsOfParticipation: boolean;
    truthfulInfo: boolean;
    privacyPolicy?: boolean;
    responsibilityTerm?: boolean;
  };
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { error } = await supabase.rpc('forjados_update_my_profile_v1', {
    p_payload: params,
  });

  if (error) throw error;
}

export async function listProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase.rpc('forjados_admin_list_profiles_v5');

  if (error) throwRpcError(error, 'Erro ao carregar membros.');

  return (data || []) as UserProfile[];
}

export async function adminUpdateProfile(params: {
  userId: string;
  role?: UserRole;
  requested_role?: UserRole;
  inscription_status?: InscriptionStatus;
  sectors?: string[];
  primary_team?: string | null;
  display_name?: string;
  phone?: string;
  city?: string;
  neighborhood?: string;
  internal_notes?: string;
}) {
  const { error } = await supabase.rpc('forjados_admin_update_profile_v5', {
    p_user_id: params.userId,
    p_role: params.role ?? null,
    p_requested_role: params.requested_role ?? null,
    p_inscription_status: params.inscription_status ?? null,
    p_sectors: params.sectors ?? null,
    p_primary_team: params.primary_team ?? null,
    p_display_name: params.display_name ?? null,
    p_phone: params.phone ?? null,
    p_city: params.city ?? null,
    p_neighborhood: params.neighborhood ?? null,
    p_internal_notes: params.internal_notes ?? null,
  });

  if (error) throwRpcError(error, 'Erro ao atualizar usuário.');
}

export async function approveProfile(userId: string, role?: UserRole) {
  const { error } = await supabase.rpc('forjados_admin_approve_profile_v5', {
    p_user_id: userId,
    p_role: role || null,
  });

  if (error) throwRpcError(error, 'Erro ao aprovar usuário.');
}

export async function rejectProfile(userId: string) {
  const { error } = await supabase.rpc('forjados_admin_reject_profile_v5', {
    p_user_id: userId,
  });

  if (error) throwRpcError(error, 'Erro ao recusar usuário.');
}


export async function adminDeleteProfile(userId: string) {
  const { error } = await supabase.rpc('forjados_admin_delete_profile_v6', {
    p_user_id: userId,
  });

  if (error) throwRpcError(error, 'Erro ao excluir usuário.');
}

export async function adminUpdateRetreatCount(params: { userId: string; count: number }) {
  const { error } = await supabase.rpc('forjados_admin_update_retreat_count_v6', {
    p_user_id: params.userId,
    p_retreat_count: params.count,
  });

  if (error) throwRpcError(error, 'Erro ao atualizar quantidade de retiros.');
}

export async function adminUpdateMemberSince(params: {
  userId: string;
  memberSince: string | null;
}) {
  const { error } = await supabase.rpc('forjados_admin_update_member_since_v1', {
    p_user_id: params.userId,
    p_member_since: params.memberSince,
  });

  if (error) throwRpcError(error, 'Erro ao atualizar a data de membro.');
}

export async function updateMyBasicProfile(params: {
  display_name: string;
  phone: string;
  birth_date: string | null;
  city: string;
  neighborhood: string;
  member_since?: string | null;
  primary_team: string;
  sectors: string[];
  specific_function: string;
  shirt_size: string;
  has_vehicle: boolean;
  food_restrictions: string;
  health_problems: string;
  continuous_medicine: string;
  emergency_contact: {
    name: string;
    phone: string;
    relationship: string;
  };
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { error } = await supabase.rpc('forjados_update_my_profile_v1', {
    p_payload: params,
  });

  if (error) throw error;
}
