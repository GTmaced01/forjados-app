-- Cover foreign keys used by the Materials module so authorization joins,
-- history queries and referential checks do not require avoidable scans.

create index if not exists material_items_sector_unit_id_idx
  on public.material_items (sector_unit_id);

create index if not exists material_items_created_by_idx
  on public.material_items (created_by);

create index if not exists material_items_updated_by_idx
  on public.material_items (updated_by);

create index if not exists material_movements_sector_unit_id_idx
  on public.material_movements (sector_unit_id);

create index if not exists material_item_history_edition_id_idx
  on public.material_item_history (edition_id);

create index if not exists material_item_history_sector_unit_id_idx
  on public.material_item_history (sector_unit_id);

create index if not exists material_item_history_created_by_idx
  on public.material_item_history (created_by);
