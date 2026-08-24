import { supabase } from './supabase';
import { clearSensitiveLocalData } from './localData';
import type { UserRole } from '../types';

export function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }

  if (message.includes('User already registered')) {
    return 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.';
  }

  if (message.includes('Password should be at least')) {
    return 'A senha deve ter pelo menos 8 caracteres.';
  }

  if (message.includes('Email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }

  return message || 'Erro inesperado. Tente novamente.';
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  return data.user;
}

export async function signUp(params: {
  email: string;
  password: string;
  displayName: string;
  requestedRole: UserRole;
}) {
  const { email, password, displayName, requestedRole } = params;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        full_name: displayName,
        requested_role: requestedRole,
        terms_accepted_at: new Date().toISOString(),
        terms_version: 'forjados-2.1r-2026-08-24',
      },
    },
  });

  if (error) throw error;

  return data.user;
}

export async function signOut() {
  let signOutError: unknown;

  try {
    const { error } = await supabase.auth.signOut({
      scope: 'local',
    });

    if (error) throw error;
  } catch (error) {
    signOutError = error;
  } finally {
    clearSensitiveLocalData();
  }

  if (signOutError) throw signOutError;
}

export async function resetPassword(email: string) {
  const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/?password-recovery=1`,
  });

  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
