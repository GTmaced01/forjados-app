import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { PointsRedemption, PointsStoreProduct } from '../types';

const TIMEOUT = 10000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRequest<T = any>(
  request: PromiseLike<T>,
  errorMessage: string
): Promise<T> {
  return withTimeout(Promise.resolve(request), TIMEOUT, errorMessage);
}

function throwFriendlyError(error: unknown, fallback: string): never {
  if (error instanceof Error && error.message) {
    throw new Error(error.message);
  }

  throw new Error(fallback);
}

export async function listActivePointsProducts(): Promise<PointsStoreProduct[]> {
  try {
    const { data, error } = await safeRequest(
      supabase
        .from('points_store_products')
        .select('*')
        .eq('is_active', true)
        .order('points_cost', { ascending: true }),
      'Não foi possível carregar os produtos da loja de pontos.'
    );

    if (error) throw error;

    return (data || []) as PointsStoreProduct[];
  } catch (error) {
    throwFriendlyError(error, 'Erro ao carregar produtos disponíveis.');
  }
}

export async function listAllPointsProducts(): Promise<PointsStoreProduct[]> {
  try {
    const { data, error } = await safeRequest(
      supabase
        .from('points_store_products')
        .select('*')
        .order('created_at', { ascending: false }),
      'Não foi possível carregar todos os produtos da loja de pontos.'
    );

    if (error) throw error;

    return (data || []) as PointsStoreProduct[];
  } catch (error) {
    throwFriendlyError(error, 'Erro ao carregar produtos da loja.');
  }
}

export async function createPointsProduct(params: {
  name: string;
  description: string;
  image_url: string;
  points_cost: number;
  stock: number;
  is_active: boolean;
}) {
  try {
    const { error } = await safeRequest(
      supabase.from('points_store_products').insert({
        name: params.name,
        description: params.description,
        image_url: params.image_url,
        points_cost: params.points_cost,
        stock: params.stock,
        is_active: params.is_active,
      }),
      'Não foi possível cadastrar o produto.'
    );

    if (error) throw error;
  } catch (error) {
    throwFriendlyError(error, 'Erro ao cadastrar produto.');
  }
}

export async function updatePointsProduct(params: {
  id: string;
  name: string;
  description: string;
  image_url: string;
  points_cost: number;
  stock: number;
  is_active: boolean;
}) {
  try {
    const { error } = await safeRequest(
      supabase
        .from('points_store_products')
        .update({
          name: params.name,
          description: params.description,
          image_url: params.image_url,
          points_cost: params.points_cost,
          stock: params.stock,
          is_active: params.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id),
      'Não foi possível atualizar o produto.'
    );

    if (error) throw error;
  } catch (error) {
    throwFriendlyError(error, 'Erro ao atualizar produto.');
  }
}

export async function redeemPointsProduct(productId: string) {
  try {
    const { error } = await safeRequest(
      supabase.rpc('redeem_points_product', {
        p_product_id: productId,
      }),
      'Não foi possível resgatar o produto. Tente novamente.'
    );

    if (error) throw error;
  } catch (error) {
    throwFriendlyError(error, 'Erro ao resgatar produto.');
  }
}

export async function listMyPointsRedemptions(): Promise<PointsRedemption[]> {
  try {
    const { data: userData, error: userError } = await withTimeout(
      supabase.auth.getUser(),
      TIMEOUT,
      'Não foi possível identificar o usuário autenticado.'
    );

    if (userError) throw userError;
    if (!userData.user) throw new Error('Usuário não autenticado.');

    const { data, error } = await safeRequest(
      supabase
        .from('points_redemptions')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false }),
      'Não foi possível carregar seus resgates.'
    );

    if (error) throw error;

    return (data || []) as PointsRedemption[];
  } catch (error) {
    throwFriendlyError(error, 'Erro ao carregar seus resgates.');
  }
}

export async function listAllPointsRedemptions(): Promise<PointsRedemption[]> {
  try {
    const { data, error } = await safeRequest(
      supabase
        .from('points_redemptions')
        .select('*')
        .order('created_at', { ascending: false }),
      'Não foi possível carregar todos os resgates.'
    );

    if (error) throw error;

    return (data || []) as PointsRedemption[];
  } catch (error) {
    throwFriendlyError(error, 'Erro ao carregar resgates.');
  }
}

export async function updatePointsRedemptionStatus(params: {
  redemptionId: string;
  status: PointsRedemption['status'];
}) {
  try {
    const payload: Record<string, unknown> = {
      status: params.status,
      updated_at: new Date().toISOString(),
    };

    if (params.status === 'delivered') {
      const { data, error } = await withTimeout(
        supabase.auth.getUser(),
        TIMEOUT,
        'Não foi possível identificar quem entregou o produto.'
      );

      if (error) throw error;

      payload.delivered_by = data.user?.id || null;
      payload.delivered_at = new Date().toISOString();
    }

    const { error } = await safeRequest(
      supabase
        .from('points_redemptions')
        .update(payload)
        .eq('id', params.redemptionId),
      'Não foi possível atualizar o status do resgate.'
    );

    if (error) throw error;
  } catch (error) {
    throwFriendlyError(error, 'Erro ao atualizar status do resgate.');
  }
}

export function formatRedemptionStatus(status: PointsRedemption['status']) {
  if (status === 'pending') return 'Pendente';
  if (status === 'delivered') return 'Entregue';
  if (status === 'cancelled') return 'Cancelado';

  return status;
}

export async function deletePointsProduct(productId: string) {
  const { error } = await supabase
    .from('points_store_products')
    .delete()
    .eq('id', productId);

  if (error) {
    throw new Error(error.message || 'Erro ao excluir produto. Se já houver resgates, prefira ocultar o produto.');
  }
}
