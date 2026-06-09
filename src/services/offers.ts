import { supabase } from './supabase';
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

  let proofUrl = '';

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

    const { data } = supabase.storage.from('payment-receipts').getPublicUrl(filePath);
    proofUrl = data.publicUrl;
  }

  const { error } = await supabase.from('offers').insert({
    user_id: userData.user.id,
    user_name: params.userName,
    user_email: params.userEmail || userData.user.email || '',
    amount: params.amount,
    method: params.method,
    objective: params.objective,
    notes: params.notes || '',
    proof_url: proofUrl,
    status: 'pending',
  });

  if (error) throw error;
}

export async function listMyOffers(): Promise<Offer[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Offer[];
}

export async function listAllOffers(): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Offer[];
}

export async function updateOfferStatus(params: { offerId: string; status: OfferStatus }) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { error } = await supabase
    .from('offers')
    .update({
      status: params.status,
      reviewed_by: userData.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.offerId);

  if (error) throw error;
}
