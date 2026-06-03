import { supabase } from './supabase';
import type { CartItem, Shirt, ShirtOrder, ShirtOrderItem } from '../types';

export async function listActiveShirts(): Promise<Shirt[]> {
  const { data, error } = await supabase
    .from('shirts')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as Shirt[];
}

export async function createShirtOrder(cart: CartItem[]): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  if (cart.length === 0) {
    throw new Error('Seu carrinho está vazio.');
  }

  const totalPrice = cart.reduce((total, item) => {
    return total + Number(item.shirt.price) * item.quantity;
  }, 0);

  const { data: order, error: orderError } = await supabase
    .from('shirt_orders')
    .insert({
      user_id: userData.user.id,
      total_price: totalPrice,
      status: 'waiting_payment',
    })
    .select('*')
    .single();

  if (orderError) throw orderError;

  const itemsPayload = cart.map((item) => ({
    order_id: order.id,
    shirt_id: item.shirt.id,
    name: item.shirt.name,
    size: item.size,
    quantity: item.quantity,
    price: item.shirt.price,
  }));

  const { error: itemsError } = await supabase
    .from('shirt_order_items')
    .insert(itemsPayload);

  if (itemsError) throw itemsError;

  return order.id;
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
  amount: number;
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

  const { data: publicData } = supabase.storage
    .from('payment-receipts')
    .getPublicUrl(filePath);

  const fileUrl = publicData.publicUrl;

  const { error: receiptError } = await supabase.from('payment_receipts').insert({
    user_id: user.id,
    user_name: params.userName,
    user_email: params.userEmail,
    user_whatsapp: params.userWhatsapp || '',
    amount: params.amount,
    file_url: fileUrl,
    file_name: params.file.name,
    file_type: params.file.type || 'arquivo',
    status: 'pending',
    type: 'order',
    order_id: params.orderId,
  });

  if (receiptError) throw receiptError;

  const { error: orderError } = await supabase
    .from('shirt_orders')
    .update({
      status: 'receipt_sent',
      proof_url: fileUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.orderId);

  if (orderError) throw orderError;
}

export async function listAllShirts(): Promise<Shirt[]> {
  const { data, error } = await supabase
    .from('shirts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as Shirt[];
}

export async function createShirt(params: {
  name: string;
  description: string;
  price: number;
  image_url: string;
  stock: Record<string, number>;
  is_active: boolean;
}) {
  const { error } = await supabase.from('shirts').insert({
    name: params.name,
    description: params.description,
    price: params.price,
    image_url: params.image_url,
    stock: params.stock,
    is_active: params.is_active,
  });

  if (error) throw error;
}

export async function updateShirt(params: {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  stock: Record<string, number>;
  is_active: boolean;
}) {
  const { error } = await supabase
    .from('shirts')
    .update({
      name: params.name,
      description: params.description,
      price: params.price,
      image_url: params.image_url,
      stock: params.stock,
      is_active: params.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (error) throw error;
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
  const { error } = await supabase
    .from('shirt_orders')
    .update({
      status: params.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.orderId);

  if (error) throw error;
}
export async function deleteShirt(shirtId: string) {
  const { error } = await supabase.from('shirts').delete().eq('id', shirtId);

  if (error) {
    throw new Error(error.message || 'Erro ao excluir camisa. Se já houver pedidos, prefira ocultar a camisa.');
  }
}
