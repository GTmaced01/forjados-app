import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import { removePrivateDocument } from './privateStorage';
import type { CartItem, Shirt, ShirtImage, ShirtOrder, ShirtOrderItem } from '../types';

const TIMEOUT = 10000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRequest<T = any>(
  request: PromiseLike<T>,
  errorMessage: string
): Promise<T> {
  return withTimeout(Promise.resolve(request), TIMEOUT, errorMessage);
}

const shirtSelect = `
  *,
  images:shirt_images(*)
`;

type ShirtImagePayload = {
  image_url: string;
  position_x: number;
  position_y: number;
  display_order: number;
  is_primary: boolean;
};

function normalizePosition(value: number | null | undefined, fallback = 50) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeShirt(shirt: Shirt): Shirt {
  const rawImages = Array.isArray(shirt.images) ? shirt.images : [];
  const images = rawImages
    .filter((image) => Boolean(image.image_url))
    .map((image, index) => ({
      ...image,
      position_x: normalizePosition(image.position_x),
      position_y: normalizePosition(image.position_y),
      display_order: Number.isFinite(image.display_order) ? image.display_order : index,
      is_primary: Boolean(image.is_primary),
    }))
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return a.display_order - b.display_order;
    });

  if (images.length === 0 && shirt.image_url) {
    images.push({
      id: `${shirt.id}-legacy-image`,
      shirt_id: shirt.id,
      image_url: shirt.image_url,
      position_x: 50,
      position_y: 50,
      display_order: 0,
      is_primary: true,
      created_at: shirt.created_at,
      updated_at: shirt.updated_at,
    });
  }

  return {
    ...shirt,
    image_url: images[0]?.image_url || shirt.image_url || '',
    images,
  };
}

function normalizeShirts(shirts: Shirt[]) {
  return shirts.map(normalizeShirt);
}

function normalizeImagesPayload(images: ShirtImagePayload[]) {
  const cleanImages = images
    .filter((image) => image.image_url.trim())
    .map((image, index) => ({
      image_url: image.image_url.trim(),
      position_x: normalizePosition(image.position_x),
      position_y: normalizePosition(image.position_y),
      display_order: index,
      is_primary: Boolean(image.is_primary),
    }));

  if (cleanImages.length > 0 && !cleanImages.some((image) => image.is_primary)) {
    cleanImages[0].is_primary = true;
  }

  if (cleanImages.length > 0) {
    const primaryIndex = cleanImages.findIndex((image) => image.is_primary);
    cleanImages.forEach((image, index) => {
      image.is_primary = index === primaryIndex;
    });
  }

  return cleanImages;
}

async function replaceShirtImages(shirtId: string, images: ShirtImagePayload[]) {
  const cleanImages = normalizeImagesPayload(images);

  const { error: deleteError } = await safeRequest(
    supabase
      .from('shirt_images')
      .delete()
      .eq('shirt_id', shirtId),
    'Não foi possível atualizar as fotos da camisa.'
  );

  if (deleteError) throw deleteError;

  if (cleanImages.length === 0) return;

  const { error: insertError } = await safeRequest(
    supabase.from('shirt_images').insert(
      cleanImages.map((image) => ({
        shirt_id: shirtId,
        ...image,
      }))
    ),
    'Não foi possível salvar as fotos da camisa.'
  );

  if (insertError) throw insertError;
}

export function getShirtImages(shirt: Shirt): ShirtImage[] {
  return normalizeShirt(shirt).images || [];
}

export function getPrimaryShirtImage(shirt: Shirt): ShirtImage | null {
  return getShirtImages(shirt)[0] || null;
}

export async function listActiveShirts(): Promise<Shirt[]> {
  const { data, error } = await safeRequest(
    supabase
      .from('shirts')
      .select(shirtSelect)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    'Não foi possível carregar as camisas.'
  );

  if (error) throw error;

  return normalizeShirts((data || []) as Shirt[]);
}

export async function createShirtOrder(cart: CartItem[]): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  if (cart.length === 0) {
    throw new Error('Seu carrinho está vazio.');
  }

  const { data: orderId, error } = await supabase.rpc('forjados_create_shirt_order_v1', {
    p_items: cart.map((item) => ({
      shirt_id: item.shirt.id,
      size: item.size,
      quantity: item.quantity,
    })),
  });

  if (error) throw error;
  if (!orderId) throw new Error('Pedido criado sem identificador. Atualize a página antes de tentar novamente.');
  return orderId as string;
}

export async function listMyShirtOrders(): Promise<
  Array<ShirtOrder & { items?: ShirtOrderItem[] }>
> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('shirt_orders')
    .select('*, items:shirt_order_items(*)')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as Array<ShirtOrder & { items?: ShirtOrderItem[] }>;
}

export function formatOrderStatus(status: ShirtOrder['status']) {
  if (status === 'cart') return 'Carrinho';
  if (status === 'waiting_payment') return 'Aguardando pagamento';
  if (status === 'receipt_sent') return 'Comprovante enviado';
  if (status === 'payment_approved') return 'Pagamento aprovado';
  if (status === 'payment_rejected') return 'Pagamento recusado';
  if (status === 'delivered') return 'Entregue';
  if (status === 'cancelled') return 'Cancelado';

  return status;
}

export async function uploadShirtOrderReceipt(params: {
  orderId: string;
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

  const filePath = `${user.id}/shirt-orders/${params.orderId}/${Date.now()}-${safeFileName}`;

  const { error: uploadError } = await supabase.storage
    .from('payment-receipts')
    .upload(filePath, params.file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { error: receiptError } = await supabase.rpc('forjados_submit_shirt_order_receipt_v1', {
    p_order_id: params.orderId,
    p_file_path: filePath,
    p_file_name: params.file.name,
    p_file_type: params.file.type || 'arquivo',
    p_user_name: params.userName,
    p_user_email: params.userEmail,
    p_user_whatsapp: params.userWhatsapp || '',
  });

  if (receiptError) {
    await removePrivateDocument(filePath);
    throw receiptError;
  }
}

export async function listAllShirts(): Promise<Shirt[]> {
  const { data, error } = await safeRequest(
    supabase
      .from('shirts')
      .select(shirtSelect)
      .order('created_at', { ascending: false }),
    'Não foi possível carregar todas as camisas.'
  );

  if (error) throw error;

  return normalizeShirts((data || []) as Shirt[]);
}

export async function createShirt(params: {
  name: string;
  description: string;
  price: number;
  image_url: string;
  stock: Record<string, number>;
  is_active: boolean;
  images?: ShirtImagePayload[];
}) {
  const cleanImages = normalizeImagesPayload(params.images || []);
  const legacyImageUrl = cleanImages[0]?.image_url || params.image_url || '';

  const { data, error } = await safeRequest(
    supabase
      .from('shirts')
      .insert({
        name: params.name,
        description: params.description,
        price: params.price,
        image_url: legacyImageUrl,
        stock: params.stock,
        is_active: params.is_active,
      })
      .select('id')
      .single(),
    'Não foi possível cadastrar a camisa.'
  );

  if (error) throw error;
  const shirtId = data?.id;
  if (!shirtId) throw new Error('Camisa cadastrada, mas não foi possível identificar o ID para salvar as fotos.');

  await replaceShirtImages(shirtId, cleanImages);
  return shirtId;
}

export async function updateShirt(params: {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  stock: Record<string, number>;
  is_active: boolean;
  images?: ShirtImagePayload[];
}) {
  const cleanImages = normalizeImagesPayload(params.images || []);
  const legacyImageUrl = cleanImages[0]?.image_url || params.image_url || '';

  const { error } = await safeRequest(
    supabase
      .from('shirts')
      .update({
        name: params.name,
        description: params.description,
        price: params.price,
        image_url: legacyImageUrl,
        stock: params.stock,
        is_active: params.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id),
    'Não foi possível atualizar a camisa.'
  );

  if (error) throw error;
  await replaceShirtImages(params.id, cleanImages);
}

export async function listAllShirtOrders(): Promise<
  Array<ShirtOrder & { items?: ShirtOrderItem[] }>
> {
  const { data, error } = await supabase
    .from('shirt_orders')
    .select('*, items:shirt_order_items(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as Array<ShirtOrder & { items?: ShirtOrderItem[] }>;
}

export async function updateShirtOrderStatus(params: {
  orderId: string;
  status: ShirtOrder['status'];
}) {
  const { error } = await supabase.rpc('forjados_review_shirt_order_v1', {
    p_order_id: params.orderId,
    p_status: params.status,
  });

  if (error) throw error;
}

export async function deleteShirt(shirtId: string) {
  const { error } = await supabase.from('shirts').delete().eq('id', shirtId);

  if (error) {
    throw new Error(error.message || 'Erro ao excluir camisa. Se já houver pedidos, prefira ocultar a camisa.');
  }
}
