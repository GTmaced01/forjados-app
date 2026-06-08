import { supabase } from './supabase';
import type { PaymentReceipt } from '../types';

const INSCRIPTION_AMOUNT = 80;

export async function listMyPaymentReceipts(): Promise<PaymentReceipt[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('payment_receipts')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('type', 'inscription')
    .order('uploaded_at', { ascending: false });

  if (error) throw error;

  return (data || []) as PaymentReceipt[];
}

export async function uploadInscriptionReceipt(params: {
  file: File;
  userName: string;
  userEmail: string;
  userWhatsapp?: string;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const user = userData.user;

  const safeFileName = params.file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.-]/g, '-')
    .toLowerCase();

  const filePath = `${user.id}/${Date.now()}-${safeFileName}`;

  const { error: uploadError } = await supabase.storage
    .from('payment-receipts')
    .upload(filePath, params.file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage
    .from('payment-receipts')
    .getPublicUrl(filePath);

  const { error: insertError } = await supabase.from('payment_receipts').insert({
    user_id: user.id,
    user_name: params.userName,
    user_email: params.userEmail,
    user_whatsapp: params.userWhatsapp || '',
    amount: INSCRIPTION_AMOUNT,
    file_url: publicData.publicUrl,
    file_name: params.file.name,
    file_type: params.file.type || 'arquivo',
    status: 'pending',
    type: 'inscription',
  });

  if (insertError) throw insertError;
}

export function formatReceiptStatus(status: PaymentReceipt['status']) {
  if (status === 'approved') return 'Aprovado';
  if (status === 'rejected') return 'Recusado';
  return 'Pendente';
}

export async function listAllPaymentReceipts(): Promise<PaymentReceipt[]> {
  const { data, error } = await supabase
    .from('payment_receipts')
    .select('*')
    .order('uploaded_at', { ascending: false });

  if (error) throw error;

  return (data || []) as PaymentReceipt[];
}

export async function updatePaymentReceiptStatus(params: {
  receiptId: string;
  status: 'approved' | 'rejected';
  observations?: string;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { error } = await supabase
    .from('payment_receipts')
    .update({
      status: params.status,
      observations: params.observations || '',
      reviewed_by: userData.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.receiptId);

  if (error) throw error;
}