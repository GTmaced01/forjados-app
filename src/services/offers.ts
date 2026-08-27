import { supabase } from './supabase';
import { removePrivateDocument } from './privateStorage';
import type { Offer, OfferMethod, OfferStatus } from '../types';

export function formatOfferMethod(method: OfferMethod) {
  if (method === 'pix') return 'PIX';
  if (method === 'card') return 'Cartão';
  if (method === 'cash') return 'Dinheiro';
  return 'Outro';
}

export function formatOfferStatus(status: OfferStatus) {
  if (status === 'approved') return 'Aprovada';
  if (status === 'rejected') return 'Recusada';
  return 'Pendente';
}

export async function createOffer(params: {
  amount: number;
  method: OfferMethod;
  objective: string;
  notes?: string;
  file?: File | null;
  userName: string;
  userEmail?: string;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  let proofPath = '';

  if (params.file) {
    const safeFileName = params.file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9.-]/g, '-')
      .toLowerCase();

    const filePath = `${userData.user.id}/ofertas/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('payment-receipts')
      .upload(filePath, params.file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    proofPath = filePath;
  }

  const { error } = await supabase.rpc('forjados_create_offer_v1', {
    p_amount: params.amount,
    p_method: params.method,
    p_objective: params.objective,
    p_notes: params.notes || '',
    p_proof_path: proofPath || null,
    p_user_name: params.userName,
    p_user_email: params.userEmail || userData.user.email || '',
  });

  if (error) {
    if (proofPath) await removePrivateDocument(proofPath);
    throw error;
  }
}

export async function listMyOffers(): Promise<Offer[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('user_id', userData.user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Offer[];
}

export async function listAllOffers(): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Offer[];
}

export async function updateOfferStatus(params: { offerId: string; status: OfferStatus }) {
  const { error } = await supabase.rpc('forjados_review_offer_v1', {
    p_offer_id: params.offerId,
    p_status: params.status,
  });

  if (error) throw error;
}
