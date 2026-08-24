import { supabase } from './supabase';
import { removePrivateDocument } from './privateStorage';
import type { PaymentReceipt } from '../types';

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
  editionId: string;
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

  const filePath = `${user.id}/inscricoes/${params.editionId}/${Date.now()}-${safeFileName}`;

  const { error: uploadError } = await supabase.storage
    .from('payment-receipts')
    .upload(filePath, params.file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.rpc('forjados_submit_inscription_receipt_v1', {
    p_file_path: filePath,
    p_file_name: params.file.name,
    p_file_type: params.file.type || 'arquivo',
    p_user_name: params.userName,
    p_user_email: params.userEmail,
    p_user_whatsapp: params.userWhatsapp || '',
  });

  if (insertError) {
    await removePrivateDocument(filePath);
    throw insertError;
  }
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
  const { error } = await supabase.rpc('forjados_review_payment_receipt_v1', {
    p_receipt_id: params.receiptId,
    p_status: params.status,
    p_observations: params.observations || '',
  });

  if (error) throw error;
}
