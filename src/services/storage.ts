import { supabase } from './supabase';
import { withTimeout } from './safeAsync';

const TIMEOUT = 15000;

export const STORAGE_BUCKETS = {
  shirts: 'shirts',
  pointsStore: 'points-store-products',
  publicPanel: 'public-panel',
} as const;

function sanitizeFileName(name: string) {
  const extension = name.includes('.') ? name.split('.').pop() : 'png';
  const base = name
    .replace(/\.[^/.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `${base || 'arquivo'}-${Date.now()}.${extension}`;
}

export async function uploadPublicImage(params: {
  bucket: string;
  folder: string;
  file: File;
}) {
  if (!params.file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }

  if (params.file.size > 5 * 1024 * 1024) {
    throw new Error('A imagem precisa ter até 5MB.');
  }

  const { data: userData, error: userError } = await withTimeout(
    supabase.auth.getUser(),
    TIMEOUT,
    'Não foi possível identificar o usuário para enviar a imagem.'
  );

  if (userError) throw userError;

  const userId = userData.user?.id || 'public';
  const filePath = `${params.folder}/${userId}/${sanitizeFileName(params.file.name)}`;

  const { error: uploadError } = await withTimeout(
    supabase.storage.from(params.bucket).upload(filePath, params.file, {
      cacheControl: '3600',
      upsert: false,
    }),
    TIMEOUT,
    'Não foi possível enviar a imagem. Tente novamente.'
  );

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(params.bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
