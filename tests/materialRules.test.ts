import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATERIAL_IMAGE_MAX_BYTES,
  getMaterialIndicators,
  validateMaterialImageMetadata,
} from '../src/services/materialRules.ts';
import type { MaterialItem } from '../src/types.ts';

function item(overrides: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id: crypto.randomUUID(),
    edition_id: crypto.randomUUID(),
    sector_unit_id: crypto.randomUUID(),
    name: 'Item de teste',
    item_type: 'equipment',
    category: '',
    quantity: 5,
    unit: 'unidade',
    minimum_quantity: 2,
    location: '',
    responsible_name: '',
    status: 'available',
    condition: 'good',
    notes: '',
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

test('calcula indicadores ignorando itens arquivados', () => {
  const indicators = getMaterialIndicators([
    item(),
    item({ quantity: 1, minimum_quantity: 2 }),
    item({ status: 'loaned' }),
    item({ status: 'maintenance' }),
    item({ status: 'unavailable' }),
    item({ is_archived: true, status: 'loaned', quantity: 0 }),
  ]);

  assert.deepEqual(indicators, {
    total: 5,
    lowStock: 1,
    loaned: 1,
    unavailable: 1,
    maintenance: 1,
  });
});

test('aceita JPEG, PNG e WebP até 5 MB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.doesNotThrow(() => validateMaterialImageMetadata({ type, size: MATERIAL_IMAGE_MAX_BYTES }));
  }
});

test('rejeita formato não permitido e arquivo acima de 5 MB', () => {
  assert.throws(() => validateMaterialImageMetadata({ type: 'image/gif', size: 100 }), /JPEG, PNG ou WebP/);
  assert.throws(() => validateMaterialImageMetadata({ type: 'image/png', size: MATERIAL_IMAGE_MAX_BYTES + 1 }), /5 MB/);
});
