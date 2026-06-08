import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { InscriptionStatus, UserProfile, UserRole } from '../types';

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

  const isInitialAdmin = user.email === 'forjados.ofc@gmail.com';

  const displayName =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'Novo usuário';

  const fullProfile = {
    id: user.id,
    email: user.email || '',
    display_name: displayName,
    full_name: user.user_metadata?.full_name || displayName,
    role: isInitialAdmin ? 'admin' : 'member',
    requested_role: isInitialAdmin
      ? 'admin'
      : user.user_metadata?.requested_role || 'member',
    inscription_status: isInitialAdmin ? 'approved' : 'pending',
    is_admin: isInitialAdmin,
    member_id: isInitialAdmin
      ? 'ADM-0001'
      : `EQP-${user.id.replaceAll('-', '').slice(0, 6).toUpperCase()}`,
    sectors: isInitialAdmin ? ['Liderança'] : [],
    primary_team: isInitialAdmin ? 'Liderança' : user.user_metadata?.primary_team || null,
    has_vehicle: false,
    skills: [],
    points: 0,
    terms_accepted: {},
  };

  const { data: createdProfile, error: insertError } = await supabase
    .from('profiles')
    .insert(fullProfile as Record<string, unknown>)
    .select('*')
    .single();

  if (!insertError && createdProfile) {
    return createdProfile as UserProfile;
  }

  console.warn('Criação completa do perfil falhou. Tentando perfil mínimo:', insertError);

  const minimalProfile = {
    id: user.id,
    email: user.email || '',
    display_name: displayName,
    role: isInitialAdmin ? 'admin' : 'member',
    requested_role: isInitialAdmin ? 'admin' : user.user_metadata?.requested_role || 'member',
    inscription_status: isInitialAdmin ? 'approved' : 'pending',
    is_admin: isInitialAdmin,
    primary_team: isInitialAdmin ? 'Liderança' : user.user_metadata?.primary_team || null,
  };

  const { data: minimalCreatedProfile, error: minimalInsertError } = await supabase
    .from('profiles')
    .insert(minimalProfile as Record<string, unknown>)
    .select('*')
    .single();

  if (minimalInsertError) {
    console.error('Erro ao criar perfil mínimo:', minimalInsertError);

    throw new Error(
      minimalInsertError.message ||
        'Não foi possível criar seu perfil. Verifique a tabela profiles e as políticas RLS.'
    );
  }

  return minimalCreatedProfile as UserProfile;
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

  const { error } = await supabase
    .from('profiles')
    .update({
      ...params,
      full_name: params.display_name,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', userData.user.id);

  if (error) throw error;
}

export async function listProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase.rpc('forjados_admin_list_profiles_v4');

  if (error) throw error;

  return (data || []) as UserProfile[];
}

export async function updateProfileStatus(params: {
  userId: string;
  role?: UserRole;
  inscription_status?: InscriptionStatus;
  sectors?: string[];
  primary_team?: string | null;
}) {
  const payload: Record<string, unknown> = {};

  if (params.role) payload.role = params.role;
  if (params.inscription_status) payload.inscription_status = params.inscription_status;
  if (params.sectors) payload.sectors = params.sectors;
  if (params.primary_team !== undefined) payload.primary_team = params.primary_team;

  const { error } = await supabase
    .from('profiles')
    .update(payload as Record<string, unknown>)
    .eq('id', params.userId);

  if (error) throw error;
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
  const { error } = await supabase.rpc('forjados_admin_update_profile_v4', {
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

  if (error) throw error;
}

export async function approveProfile(userId: string, role?: UserRole) {
  const { error } = await supabase.rpc('forjados_admin_approve_profile_v4', {
    p_user_id: userId,
    p_role: role || null,
  });

  if (error) throw error;
}

export async function rejectProfile(userId: string) {
  const { error } = await supabase.rpc('forjados_admin_reject_profile_v4', {
    p_user_id: userId,
  });

  if (error) throw error;
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

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: params.display_name,
      full_name: params.display_name,
      phone: params.phone,
      birth_date: params.birth_date,
      city: params.city,
      neighborhood: params.neighborhood,
      member_since: params.member_since || null,
      primary_team: params.primary_team,
      sectors: params.sectors,
      specific_function: params.specific_function,
      shirt_size: params.shirt_size,
      has_vehicle: params.has_vehicle,
      food_restrictions: params.food_restrictions,
      health_problems: params.health_problems,
      continuous_medicine: params.continuous_medicine,
      emergency_contact: params.emergency_contact,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', userData.user.id);

  if (error) throw error;
}