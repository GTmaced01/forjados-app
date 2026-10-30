import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type {
  MaterialEditionOption,
  MaterialItem,
  MaterialItemHistory,
  MaterialMovement,
  MaterialMovementType,
  MaterialSectorOption,
} from '../types';
import {
  validateMaterialImageMetadata,
} from './materialRules';

export { getMaterialIndicators, validateMaterialImageMetadata } from './materialRules';

const TIMEOUT = 15000;
const MATERIAL_IMAGES_BUCKET = 'material-images';
const IMAGE_URL_TTL_SECONDS = 900;

type MaterialItemInput = Omit<
  MaterialItem,
  'id' | 'image_url' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRequest<T = any>(request: PromiseLike<T>, message: string): Promise<T> {
  return withTimeout(Promise.resolve(request), TIMEOUT, message);
}

function normalizeItem(item: MaterialItem): MaterialItem {
  return {
    ...item,
    quantity: Number(item.quantity || 0),
    minimum_quantity: Number(item.minimum_quantity || 0),
  };
}

async function attachSignedImageUrls(items: MaterialItem[]) {
  return Promise.all(items.map(async (item) => {
    if (!item.image_path) return item;
    const { data, error } = await supabase.storage
      .from(MATERIAL_IMAGES_BUCKET)
      .createSignedUrl(item.image_path, IMAGE_URL_TTL_SECONDS);
    if (error) {
      console.warn('Imagem de material indisponível:', error.message);
      return item;
    }
    return { ...item, image_url: data.signedUrl };
  }));
}

export async function listMaterialEditions(): Promise<MaterialEditionOption[]> {
  const { data, error } = await safeRequest(
    supabase.rpc('forjados_list_material_editions_v1'),
    'Não foi possível carregar as edições dos materiais.',
  );
  if (error) throw error;
  return (data || []) as MaterialEditionOption[];
}

export async function listMaterialSectors(editionId: string): Promise<MaterialSectorOption[]> {
  const { data, error } = await safeRequest(
    supabase.rpc('forjados_list_material_sectors_v1', { p_edition_id: editionId }),
    'Não foi possível carregar os setores permitidos.',
  );
  if (error) throw error;
  return (data || []) as MaterialSectorOption[];
}

export async function listMaterialItems(editionId: string, includeArchived = false): Promise<MaterialItem[]> {
  let query = supabase
    .from('material_items')
    .select('*')
    .eq('edition_id', editionId)
    .order('name');
  if (!includeArchived) query = query.eq('is_archived', false);

  const { data, error } = await safeRequest(query, 'Não foi possível carregar os materiais.');
  if (error) throw error;
  return attachSignedImageUrls(((data || []) as MaterialItem[]).map(normalizeItem));
}

export async function saveMaterialItem(input: MaterialItemInput, itemId?: string): Promise<MaterialItem> {
  const payload = {
    edition_id: input.edition_id,
    sector_unit_id: input.sector_unit_id,
    name: input.name.trim(),
    item_type: input.item_type,
    category: input.category.trim(),
    quantity: input.quantity,
    unit: input.unit.trim(),
    minimum_quantity: input.minimum_quantity,
    location: input.location.trim(),
    responsible_name: input.responsible_name.trim(),
    status: input.status,
    condition: input.condition,
    notes: input.notes.trim(),
    image_path: input.image_path || null,
    is_archived: input.is_archived,
  };

  const request = itemId
    ? supabase.from('material_items').update(payload).eq('id', itemId).select('*').single()
    : supabase.from('material_items').insert(payload).select('*').single();
  const { data, error } = await safeRequest(request, 'Não foi possível salvar o material.');
  if (error) throw error;
  return normalizeItem(data as MaterialItem);
}

export async function setMaterialArchived(itemId: string, archived: boolean) {
  const { error } = await safeRequest(
    supabase.from('material_items').update({ is_archived: archived }).eq('id', itemId),
    'Não foi possível atualizar o arquivamento.',
  );
  if (error) throw error;
}

export async function registerMaterialMovement(params: {
  itemId: string;
  movementType: MaterialMovementType;
  quantity: number;
  borrower?: string;
  dueDate?: string;
  notes?: string;
}) {
  const { data, error } = await safeRequest(
    supabase.rpc('forjados_register_material_movement_v1', {
      p_item_id: params.itemId,
      p_movement_type: params.movementType,
      p_quantity: params.quantity,
      p_borrower: params.borrower || '',
      p_due_date: params.dueDate || null,
      p_notes: params.notes || '',
    }),
    'Não foi possível registrar a movimentação.',
  );
  if (error) throw error;
  return data as MaterialMovement;
}

export async function listMaterialMovements(itemId: string): Promise<MaterialMovement[]> {
  const { data, error } = await safeRequest(
    supabase.from('material_movements').select('*').eq('item_id', itemId).order('created_at', { ascending: false }),
    'Não foi possível carregar as movimentações.',
  );
  if (error) throw error;
  return ((data || []) as MaterialMovement[]).map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    quantity_delta: Number(row.quantity_delta),
    previous_quantity: Number(row.previous_quantity),
    resulting_quantity: Number(row.resulting_quantity),
  }));
}

export async function listMaterialHistory(itemId: string): Promise<MaterialItemHistory[]> {
  const { data, error } = await safeRequest(
    supabase.from('material_item_history').select('*').eq('item_id', itemId).order('created_at', { ascending: false }),
    'Não foi possível carregar o histórico do material.',
  );
  if (error) throw error;
  return (data || []) as MaterialItemHistory[];
}

export async function uploadMaterialImage(item: MaterialItem, file: File) {
  validateMaterialImageMetadata(file);
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${item.edition_id}/${item.sector_unit_id}/${item.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(MATERIAL_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function removeMaterialImage(path?: string | null) {
  if (!path) return;
  const { error } = await supabase.storage.from(MATERIAL_IMAGES_BUCKET).remove([path]);
  if (error) console.warn('Não foi possível remover a imagem anterior:', error.message);
}
