import type { MaterialItem } from '../types';

export const MATERIAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MATERIAL_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function validateMaterialImageMetadata(file: { size: number; type: string }) {
  if (!MATERIAL_IMAGE_TYPES.includes(file.type as (typeof MATERIAL_IMAGE_TYPES)[number])) {
    throw new Error('Use uma imagem JPEG, PNG ou WebP.');
  }
  if (file.size > MATERIAL_IMAGE_MAX_BYTES) {
    throw new Error('A imagem deve ter no máximo 5 MB.');
  }
}

export function getMaterialIndicators(items: MaterialItem[]) {
  const active = items.filter((item) => !item.is_archived);
  return {
    total: active.length,
    lowStock: active.filter((item) => item.quantity <= item.minimum_quantity).length,
    loaned: active.filter((item) => item.status === 'loaned').length,
    unavailable: active.filter((item) => item.status === 'unavailable').length,
    maintenance: active.filter((item) => item.status === 'maintenance').length,
  };
}
