import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { HonorGoal } from '../types';

const TIMEOUT = 10000;

function friendlyError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String((error as { message?: unknown }).message || fallback));
  }
  return new Error(fallback);
}

export async function getMyHonorGoal(): Promise<HonorGoal | null> {
  try {
    const { data, error } = await withTimeout(
      Promise.resolve(
        supabase
          .from('honor_goals')
          .select('*')
          .maybeSingle(),
      ),
      TIMEOUT,
      'Não foi possível carregar sua meta de honra.',
    );

    if (error) throw error;
    return (data || null) as HonorGoal | null;
  } catch (error) {
    throw friendlyError(error, 'Erro ao carregar sua meta de honra.');
  }
}

export async function saveCustomHonorGoal(params: { title: string; targetPoints: number }) {
  try {
    const { data, error } = await withTimeout(
      Promise.resolve(
        supabase.rpc('forjados_set_my_honor_goal_v1', {
          p_goal_type: 'custom',
          p_title: params.title,
          p_target_points: params.targetPoints,
          p_product_id: null,
        }),
      ),
      TIMEOUT,
      'Não foi possível salvar sua meta de honra.',
    );

    if (error) throw error;
    return data as HonorGoal;
  } catch (error) {
    throw friendlyError(error, 'Erro ao salvar sua meta de honra.');
  }
}

export async function saveProductHonorGoal(productId: string) {
  try {
    const { data, error } = await withTimeout(
      Promise.resolve(
        supabase.rpc('forjados_set_my_honor_goal_v1', {
          p_goal_type: 'product',
          p_title: null,
          p_target_points: null,
          p_product_id: productId,
        }),
      ),
      TIMEOUT,
      'Não foi possível definir o produto como meta.',
    );

    if (error) throw error;
    return data as HonorGoal;
  } catch (error) {
    throw friendlyError(error, 'Erro ao definir o produto como meta.');
  }
}

export async function clearMyHonorGoal() {
  try {
    const { error } = await withTimeout(
      Promise.resolve(supabase.rpc('forjados_clear_my_honor_goal_v1')),
      TIMEOUT,
      'Não foi possível remover sua meta de honra.',
    );

    if (error) throw error;
  } catch (error) {
    throw friendlyError(error, 'Erro ao remover sua meta de honra.');
  }
}
