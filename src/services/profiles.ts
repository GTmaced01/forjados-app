import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { InscriptionStatus, UserProfile, UserRole } from '../types';
import { ensureProfileInServiceScale } from './serviceScale';

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
    has_vehicle: false,
    skills: [],
    points: 0,
    terms_accepted: {},
  };

  const { data: createdProfile, error: insertError } = await supabase
    .from('profiles')
    .insert(fullProfile)
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
  };

  const { data: minimalCreatedProfile, error: minimalInsertError } = await supabase
    .from('profiles')
    .insert(minimalProfile)
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
    })
    .eq('id', userData.user.id);

  if (error) throw error;
}

export async function listProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data as UserProfile[];
}

export async function updateProfileStatus(params: {
  userId: string;
  role?: UserRole;
  inscription_status?: InscriptionStatus;
  sectors?: string[];
}) {
  const payload: Record<string, unknown> = {};

  if (params.role) payload.role = params.role;
  if (params.inscription_status) payload.inscription_status = params.inscription_status;
  if (params.sectors) payload.sectors = params.sectors;

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', params.userId);

  if (error) throw error;
}

export async function adminUpdateProfile(params: {
  userId: string;
  role?: UserRole;
  requested_role?: UserRole;
  inscription_status?: InscriptionStatus;
  sectors?: string[];
  display_name?: string;
  phone?: string;
  city?: string;
  neighborhood?: string;
  internal_notes?: string;
}) {
  const payload: Record<string, unknown> = {};

  if (params.role) payload.role = params.role;
  if (params.requested_role) payload.requested_role = params.requested_role;
  if (params.inscription_status) payload.inscription_status = params.inscription_status;
  if (params.sectors) payload.sectors = params.sectors;
  if (params.display_name !== undefined) payload.display_name = params.display_name;
  if (params.phone !== undefined) payload.phone = params.phone;
  if (params.city !== undefined) payload.city = params.city;
  if (params.neighborhood !== undefined) payload.neighborhood = params.neighborhood;
  if (params.internal_notes !== undefined) payload.internal_notes = params.internal_notes;

  payload.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', params.userId);

  if (error) throw error;
}

export async function approveProfile(userId: string, role?: UserRole) {
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) throw profileError;

  const payload: Record<string, unknown> = {
    inscription_status: 'approved',
    role: role || profileData?.requested_role || profileData?.role || 'member',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId);

  if (error) throw error;

  if (profileData) {
    try {
      await ensureProfileInServiceScale({
        displayName: profileData.display_name,
        phone: profileData.phone,
        sectors: profileData.sectors || [],
        role: String(payload.role || 'member'),
      });
    } catch (scaleError) {
      console.warn('Usuário aprovado, mas não foi possível inserir na escala automaticamente:', scaleError);
    }
  }
}

export async function rejectProfile(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({
      inscription_status: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

export async function updateMyBasicProfile(params: {
  display_name: string;
  phone: string;
  birth_date: string | null;
  city: string;
  neighborhood: string;
  member_since?: string | null;
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
      sectors: params.sectors,
      specific_function: params.specific_function,
      shirt_size: params.shirt_size,
      has_vehicle: params.has_vehicle,
      food_restrictions: params.food_restrictions,
      health_problems: params.health_problems,
      continuous_medicine: params.continuous_medicine,
      emergency_contact: params.emergency_contact,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userData.user.id);

  if (error) throw error;
}