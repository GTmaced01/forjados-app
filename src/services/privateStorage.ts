import { supabase } from './supabase';

const PRIVATE_DOCUMENT_BUCKET = 'payment-receipts';
const SIGNED_URL_TTL_SECONDS = 300;

export async function getPrivateDocumentUrl(filePath?: string | null, legacyUrl?: string | null) {
  if (filePath) {
    const { data, error } = await supabase.storage
      .from(PRIVATE_DOCUMENT_BUCKET)
      .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Não foi possível gerar o acesso seguro ao comprovante.');
    return data.signedUrl as string;
  }

  if (legacyUrl) return legacyUrl;
  throw new Error('Comprovante não encontrado.');
}

export async function removePrivateDocument(filePath: string) {
  const { error } = await supabase.storage
    .from(PRIVATE_DOCUMENT_BUCKET)
    .remove([filePath]);

  if (error) console.warn('Não foi possível remover o upload órfão:', error);
}
