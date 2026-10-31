-- FORJADOS — Issue #46: materiais e equipamentos por setor.
-- Esta migração cria o catálogo, o histórico imutável, as movimentações
-- atômicas e um bucket privado para a imagem principal de cada item.

begin;

create table public.material_items (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete restrict,
  sector_unit_id uuid not null references public.event_service_units(id) on delete restrict,
  name text not null,
  item_type text not null,
  category text not null default '',
  quantity numeric(12, 2) not null default 0,
  unit text not null default 'unidade',
  minimum_quantity numeric(12, 2) not null default 0,
  location text not null default '',
  responsible_name text not null default '',
  status text not null default 'available',
  condition text not null default 'good',
  notes text not null default '',
  image_path text,
  is_archived boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_items_name_check check (char_length(trim(name)) between 2 and 160),
  constraint material_items_type_check check (item_type in ('equipment', 'consumable')),
  constraint material_items_category_check check (char_length(category) <= 120),
  constraint material_items_quantity_check check (quantity >= 0),
  constraint material_items_minimum_check check (minimum_quantity >= 0),
  constraint material_items_unit_check check (char_length(trim(unit)) between 1 and 40),
  constraint material_items_location_check check (char_length(location) <= 180),
  constraint material_items_responsible_check check (char_length(responsible_name) <= 160),
  constraint material_items_status_check check (status in ('available', 'loaned', 'maintenance', 'unavailable')),
  constraint material_items_condition_check check (condition in ('new', 'good', 'fair', 'poor', 'damaged')),
  constraint material_items_notes_check check (char_length(notes) <= 2000)
);

create index material_items_edition_sector_idx
  on public.material_items (edition_id, sector_unit_id, is_archived, name);
create index material_items_filters_idx
  on public.material_items (edition_id, item_type, status, condition)
  where is_archived is false;
create index material_items_low_stock_idx
  on public.material_items (edition_id, quantity, minimum_quantity)
  where is_archived is false;

create table public.material_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.material_items(id) on delete restrict,
  edition_id uuid not null references public.forjados_editions(id) on delete restrict,
  sector_unit_id uuid not null references public.event_service_units(id) on delete restrict,
  movement_type text not null,
  quantity numeric(12, 2) not null,
  quantity_delta numeric(12, 2) not null,
  previous_quantity numeric(12, 2) not null,
  resulting_quantity numeric(12, 2) not null,
  borrower text not null default '',
  due_date date,
  notes text not null default '',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  constraint material_movements_type_check check (movement_type in ('entry', 'exit', 'loan', 'return', 'adjustment')),
  constraint material_movements_quantity_check check (quantity > 0 and quantity_delta <> 0),
  constraint material_movements_balances_check check (previous_quantity >= 0 and resulting_quantity >= 0),
  constraint material_movements_borrower_check check (char_length(borrower) <= 180),
  constraint material_movements_notes_check check (char_length(notes) <= 2000)
);

create index material_movements_item_created_idx
  on public.material_movements (item_id, created_at desc);
create index material_movements_edition_sector_idx
  on public.material_movements (edition_id, sector_unit_id, created_at desc);
create index material_movements_created_by_idx
  on public.material_movements (created_by, created_at desc)
  where created_by is not null;

create table public.material_item_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.material_items(id) on delete restrict,
  edition_id uuid not null references public.forjados_editions(id) on delete restrict,
  sector_unit_id uuid not null references public.event_service_units(id) on delete restrict,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  constraint material_item_history_action_check check (action in ('created', 'updated', 'archived', 'restored'))
);

create index material_item_history_item_created_idx
  on public.material_item_history (item_id, created_at desc);

alter table public.material_items enable row level security;
alter table public.material_movements enable row level security;
alter table public.material_item_history enable row level security;

revoke all on table public.material_items from public, anon, authenticated;
revoke all on table public.material_movements from public, anon, authenticated;
revoke all on table public.material_item_history from public, anon, authenticated;

grant select, insert, update on table public.material_items to authenticated;
grant select on table public.material_movements to authenticated;
grant select on table public.material_item_history to authenticated;
grant all on table public.material_items to service_role;
grant all on table public.material_movements to service_role;
grant all on table public.material_item_history to service_role;

create or replace function private.forjados_can_manage_material_sector_v1(
  p_edition_id uuid,
  p_sector_unit_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.forjados_has_any_role_v1(array['admin', 'director']))
    or exists (
      select 1
      from public.event_service_assignments assignment
      join public.event_service_units unit
        on unit.id = assignment.unit_id
       and unit.edition_id = assignment.edition_id
      join public.forjados_editions edition on edition.id = assignment.edition_id
      where assignment.user_id = (select auth.uid())
        and assignment.is_leader is true
        and assignment.edition_id = p_edition_id
        and assignment.unit_id = p_sector_unit_id
        and unit.unit_type = 'sector'
        and unit.is_active is true
        and edition.is_active is true
    );
$$;

revoke all on function private.forjados_can_manage_material_sector_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.forjados_can_manage_material_sector_v1(uuid, uuid)
  to authenticated;

create policy material_items_select_managers
on public.material_items for select to authenticated
using ((select private.forjados_can_manage_material_sector_v1(edition_id, sector_unit_id)));

create policy material_items_insert_managers
on public.material_items for insert to authenticated
with check (
  (select private.forjados_can_manage_material_sector_v1(edition_id, sector_unit_id))
  and is_archived is false
);

create policy material_items_update_managers
on public.material_items for update to authenticated
using ((select private.forjados_can_manage_material_sector_v1(edition_id, sector_unit_id)))
with check ((select private.forjados_can_manage_material_sector_v1(edition_id, sector_unit_id)));

create policy material_movements_select_managers
on public.material_movements for select to authenticated
using ((select private.forjados_can_manage_material_sector_v1(edition_id, sector_unit_id)));

create policy material_item_history_select_managers
on public.material_item_history for select to authenticated
using ((select private.forjados_can_manage_material_sector_v1(edition_id, sector_unit_id)));

create or replace function private.forjados_prepare_material_item_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.event_service_units%rowtype;
  v_quantity_change_allowed boolean := coalesce(current_setting('forjados.material_movement', true), '') = '1';
begin
  select * into v_unit
  from public.event_service_units
  where id = new.sector_unit_id;

  if not found or v_unit.unit_type <> 'sector' or v_unit.edition_id <> new.edition_id then
    raise exception 'Escolha um setor válido da edição selecionada.';
  end if;

  if tg_op = 'UPDATE' then
    if new.quantity is distinct from old.quantity and not v_quantity_change_allowed then
      raise exception 'Altere a quantidade por meio de uma movimentação.';
    end if;

    if new.is_archived is distinct from old.is_archived
       and not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
      raise exception 'Somente Admin ou Diretoria podem arquivar ou restaurar materiais.';
    end if;

    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  new.name := left(trim(new.name), 160);
  new.category := left(trim(coalesce(new.category, '')), 120);
  new.unit := left(trim(new.unit), 40);
  new.location := left(trim(coalesce(new.location, '')), 180);
  new.responsible_name := left(trim(coalesce(new.responsible_name, '')), 160);
  new.notes := left(trim(coalesce(new.notes, '')), 2000);
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.forjados_prepare_material_item_v1()
  from public, anon, authenticated;

create trigger trg_prepare_material_item
before insert or update on public.material_items
for each row execute function private.forjados_prepare_material_item_v1();

create or replace function private.forjados_audit_material_item_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_actor_name text;
begin
  v_action := case
    when tg_op = 'INSERT' then 'created'
    when old.is_archived is false and new.is_archived is true then 'archived'
    when old.is_archived is true and new.is_archived is false then 'restored'
    else 'updated'
  end;

  select coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email, 'Usuário')
    into v_actor_name
  from public.profiles profile
  where profile.id = (select auth.uid());

  insert into public.material_item_history (
    item_id, edition_id, sector_unit_id, action, before_data, after_data, created_by, created_by_name
  ) values (
    new.id,
    new.edition_id,
    new.sector_unit_id,
    v_action,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    (select auth.uid()), coalesce(v_actor_name, 'Sistema')
  );

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    (select auth.uid()),
    'material.' || v_action,
    'material_items',
    new.id::text,
    format('Material %s: %s.', v_action, new.name),
    jsonb_build_object('before', case when tg_op = 'INSERT' then null else to_jsonb(old) end, 'after', to_jsonb(new))
  );

  return new;
end;
$$;

revoke all on function private.forjados_audit_material_item_v1()
  from public, anon, authenticated;

create trigger trg_audit_material_item
after insert or update on public.material_items
for each row execute function private.forjados_audit_material_item_v1();

create or replace function private.forjados_register_material_movement_v1(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_borrower text default '',
  p_due_date date default null,
  p_notes text default ''
)
returns public.material_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.material_items%rowtype;
  v_delta numeric(12, 2);
  v_result numeric(12, 2);
  v_movement public.material_movements%rowtype;
  v_actor_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_item
  from public.material_items
  where id = p_item_id
  for update;

  if not found then raise exception 'Material não encontrado.'; end if;
  if v_item.is_archived then raise exception 'Materiais arquivados não podem ser movimentados.'; end if;
  if not private.forjados_can_manage_material_sector_v1(v_item.edition_id, v_item.sector_unit_id) then
    raise exception 'Você não pode movimentar materiais deste setor.';
  end if;
  if p_movement_type not in ('entry', 'exit', 'loan', 'return', 'adjustment') then
    raise exception 'Tipo de movimentação inválido.';
  end if;

  if p_movement_type = 'adjustment' then
    if p_quantity is null or p_quantity < 0 then
      raise exception 'Informe o novo saldo, igual ou maior que zero.';
    end if;
    v_result := round(p_quantity, 2);
    v_delta := v_result - v_item.quantity;
  else
    if p_quantity is null or p_quantity <= 0 then
      raise exception 'A quantidade deve ser maior que zero.';
    end if;
    v_delta := case
      when p_movement_type in ('entry', 'return') then round(p_quantity, 2)
      else -round(p_quantity, 2)
    end;
    v_result := v_item.quantity + v_delta;
  end if;

  if v_delta = 0 then raise exception 'A movimentação não altera o saldo atual.'; end if;
  if v_result < 0 then raise exception 'A movimentação deixaria o estoque negativo.'; end if;
  if p_movement_type = 'loan' and char_length(trim(coalesce(p_borrower, ''))) < 2 then
    raise exception 'Informe quem receberá o empréstimo.';
  end if;

  select coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email, 'Usuário')
    into v_actor_name
  from public.profiles profile
  where profile.id = (select auth.uid());

  insert into public.material_movements (
    item_id, edition_id, sector_unit_id, movement_type, quantity, quantity_delta,
    previous_quantity, resulting_quantity, borrower, due_date, notes, created_by, created_by_name
  ) values (
    v_item.id, v_item.edition_id, v_item.sector_unit_id, p_movement_type,
    abs(v_delta), v_delta, v_item.quantity, v_result,
    left(trim(coalesce(p_borrower, '')), 180), p_due_date,
    left(trim(coalesce(p_notes, '')), 2000), (select auth.uid()), coalesce(v_actor_name, 'Sistema')
  ) returning * into v_movement;

  perform set_config('forjados.material_movement', '1', true);
  update public.material_items
  set quantity = v_result,
      status = case
        when p_movement_type = 'loan' then 'loaned'
        when p_movement_type = 'return' and status = 'loaned' then 'available'
        else status
      end,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = v_item.id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    (select auth.uid()),
    'material.movement.' || p_movement_type,
    'material_movements',
    v_movement.id::text,
    format('Movimentação de material: %s.', p_movement_type),
    to_jsonb(v_movement)
  );

  return v_movement;
end;
$$;

revoke all on function private.forjados_register_material_movement_v1(uuid, text, numeric, text, date, text)
  from public, anon, authenticated;
grant execute on function private.forjados_register_material_movement_v1(uuid, text, numeric, text, date, text)
  to authenticated;

create or replace function public.forjados_register_material_movement_v1(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_borrower text default '',
  p_due_date date default null,
  p_notes text default ''
)
returns public.material_movements
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.forjados_register_material_movement_v1(
    p_item_id, p_movement_type, p_quantity, p_borrower, p_due_date, p_notes
  );
$$;

revoke all on function public.forjados_register_material_movement_v1(uuid, text, numeric, text, date, text)
  from public, anon, authenticated;
grant execute on function public.forjados_register_material_movement_v1(uuid, text, numeric, text, date, text)
  to authenticated;
grant execute on function public.forjados_register_material_movement_v1(uuid, text, numeric, text, date, text)
  to service_role;

create or replace function public.forjados_list_material_sectors_v1(p_edition_id uuid)
returns table (id uuid, edition_id uuid, name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select unit.id, unit.edition_id, unit.name
  from public.event_service_units unit
  where unit.edition_id = p_edition_id
    and unit.unit_type = 'sector'
    and unit.is_active is true
    and private.forjados_can_manage_material_sector_v1(unit.edition_id, unit.id)
  order by unit.display_order, unit.name;
$$;

revoke all on function public.forjados_list_material_sectors_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.forjados_list_material_sectors_v1(uuid)
  to authenticated, service_role;

create or replace function public.forjados_list_material_editions_v1()
returns table (id uuid, title text, starts_at timestamptz, is_active boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct edition.id, edition.title, edition.starts_at, edition.is_active
  from public.forjados_editions edition
  where (select private.forjados_has_any_role_v1(array['admin', 'director']))
     or edition.is_active is true
  order by edition.starts_at desc;
$$;

revoke all on function public.forjados_list_material_editions_v1()
  from public, anon, authenticated;
grant execute on function public.forjados_list_material_editions_v1()
  to authenticated, service_role;

create or replace function private.forjados_can_access_material_image_v1(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_edition_id uuid;
  v_sector_id uuid;
  v_item_id uuid;
begin
  if coalesce(array_length(v_parts, 1), 0) <> 4 then return false; end if;
  v_edition_id := v_parts[1]::uuid;
  v_sector_id := v_parts[2]::uuid;
  v_item_id := v_parts[3]::uuid;

  return private.forjados_can_manage_material_sector_v1(v_edition_id, v_sector_id)
    and exists (
      select 1 from public.material_items item
      where item.id = v_item_id
        and item.edition_id = v_edition_id
        and item.sector_unit_id = v_sector_id
    );
exception when invalid_text_representation then
  return false;
end;
$$;

revoke all on function private.forjados_can_access_material_image_v1(text)
  from public, anon, authenticated;
grant execute on function private.forjados_can_access_material_image_v1(text)
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-images',
  'material-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy material_images_select_managers
on storage.objects for select to authenticated
using (
  bucket_id = 'material-images'
  and (select private.forjados_can_access_material_image_v1(name))
);

create policy material_images_insert_managers
on storage.objects for insert to authenticated
with check (
  bucket_id = 'material-images'
  and (select private.forjados_can_access_material_image_v1(name))
);

create policy material_images_update_managers
on storage.objects for update to authenticated
using (
  bucket_id = 'material-images'
  and (select private.forjados_can_access_material_image_v1(name))
)
with check (
  bucket_id = 'material-images'
  and (select private.forjados_can_access_material_image_v1(name))
);

create policy material_images_delete_managers
on storage.objects for delete to authenticated
using (
  bucket_id = 'material-images'
  and (select private.forjados_can_access_material_image_v1(name))
);

commit;
