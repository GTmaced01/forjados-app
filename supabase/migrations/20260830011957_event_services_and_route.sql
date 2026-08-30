-- FORJADOS 2.2
-- Serviços por edição, roteiro com durações calculadas e gestão integrada.

create table public.event_service_units (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  unit_type text not null,
  name text not null,
  description text not null default '',
  color text not null default '',
  min_people integer not null default 0,
  max_people integer,
  per_group boolean not null default false,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_service_units_type_check
    check (unit_type in ('character', 'sector', 'location', 'group', 'scale')),
  constraint event_service_units_name_check
    check (char_length(trim(name)) between 2 and 160),
  constraint event_service_units_description_check
    check (char_length(description) <= 2000),
  constraint event_service_units_color_check
    check (color = '' or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint event_service_units_people_check
    check (min_people >= 0 and (max_people is null or max_people >= min_people))
);

create unique index event_service_units_unique_name_idx
  on public.event_service_units (edition_id, unit_type, lower(name));
create index event_service_units_edition_type_order_idx
  on public.event_service_units (edition_id, unit_type, display_order, name);
create index event_service_units_created_by_idx
  on public.event_service_units (created_by)
  where created_by is not null;

create table public.event_service_positions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.event_service_units(id) on delete cascade,
  name text not null,
  description text not null default '',
  min_people integer not null default 0,
  max_people integer,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_service_positions_name_check
    check (char_length(trim(name)) between 2 and 160),
  constraint event_service_positions_description_check
    check (char_length(description) <= 1000),
  constraint event_service_positions_people_check
    check (min_people >= 0 and (max_people is null or max_people >= min_people))
);

create unique index event_service_positions_unique_name_idx
  on public.event_service_positions (unit_id, lower(name));
create index event_service_positions_unit_order_idx
  on public.event_service_positions (unit_id, display_order, name);

create table public.event_service_assignments (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  unit_id uuid not null references public.event_service_units(id) on delete cascade,
  position_id uuid references public.event_service_positions(id) on delete set null,
  linked_character_id uuid references public.event_service_units(id) on delete set null,
  group_id uuid references public.event_service_units(id) on delete set null,
  user_id uuid references public.profiles(id) on delete cascade,
  external_name text not null default '',
  person_name text not null default '',
  assignment_kind text not null default 'staff',
  role_title text not null default '',
  is_leader boolean not null default false,
  is_primary boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text not null default '',
  display_order integer not null default 0,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_service_assignments_identity_check check (
    (user_id is not null and external_name = '')
    or (user_id is null and char_length(trim(external_name)) between 2 and 160)
  ),
  constraint event_service_assignments_kind_check
    check (assignment_kind in ('staff', 'participant')),
  constraint event_service_assignments_role_check
    check (char_length(role_title) <= 160),
  constraint event_service_assignments_notes_check
    check (char_length(notes) <= 1000),
  constraint event_service_assignments_time_check
    check (ends_at is null or (starts_at is not null and ends_at > starts_at))
);

create index event_service_assignments_edition_idx
  on public.event_service_assignments (edition_id, display_order, person_name);
create index event_service_assignments_unit_idx
  on public.event_service_assignments (unit_id, display_order, person_name);
create index event_service_assignments_position_idx
  on public.event_service_assignments (position_id)
  where position_id is not null;
create index event_service_assignments_character_idx
  on public.event_service_assignments (linked_character_id)
  where linked_character_id is not null;
create index event_service_assignments_group_idx
  on public.event_service_assignments (group_id)
  where group_id is not null;
create index event_service_assignments_user_idx
  on public.event_service_assignments (user_id, edition_id)
  where user_id is not null;
create index event_service_assignments_created_by_idx
  on public.event_service_assignments (created_by)
  where created_by is not null;
create unique index event_service_assignments_user_unit_group_idx
  on public.event_service_assignments (
    unit_id,
    user_id,
    coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where user_id is not null;
create unique index event_service_assignments_primary_sector_idx
  on public.event_service_assignments (edition_id, user_id)
  where user_id is not null and is_primary is true;

create table public.event_service_slots (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  unit_id uuid not null references public.event_service_units(id) on delete cascade,
  location_id uuid references public.event_service_units(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text not null default '',
  display_order integer not null default 0,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_service_slots_title_check
    check (char_length(trim(title)) between 2 and 160),
  constraint event_service_slots_notes_check
    check (char_length(notes) <= 1000),
  constraint event_service_slots_time_check check (ends_at > starts_at)
);

create index event_service_slots_edition_start_idx
  on public.event_service_slots (edition_id, starts_at);
create index event_service_slots_unit_start_idx
  on public.event_service_slots (unit_id, starts_at);
create index event_service_slots_location_idx
  on public.event_service_slots (location_id)
  where location_id is not null;
create index event_service_slots_created_by_idx
  on public.event_service_slots (created_by)
  where created_by is not null;

alter table public.event_service_units enable row level security;
alter table public.event_service_positions enable row level security;
alter table public.event_service_assignments enable row level security;
alter table public.event_service_slots enable row level security;

revoke all on table public.event_service_units from public, anon, authenticated;
revoke all on table public.event_service_positions from public, anon, authenticated;
revoke all on table public.event_service_assignments from public, anon, authenticated;
revoke all on table public.event_service_slots from public, anon, authenticated;

grant select, insert, update, delete on table public.event_service_units to authenticated;
grant select, insert, update, delete on table public.event_service_positions to authenticated;
grant select, insert, update, delete on table public.event_service_assignments to authenticated;
grant select, insert, update, delete on table public.event_service_slots to authenticated;
grant all on table public.event_service_units to service_role;
grant all on table public.event_service_positions to service_role;
grant all on table public.event_service_assignments to service_role;
grant all on table public.event_service_slots to service_role;

create or replace function private.forjados_can_manage_event_service_unit_v1(p_unit_id uuid)
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
      join public.event_service_units unit on unit.id = assignment.unit_id
      where assignment.unit_id = p_unit_id
        and assignment.user_id = (select auth.uid())
        and assignment.is_leader is true
        and unit.unit_type = 'sector'
        and unit.is_active is true
    );
$$;

revoke all on function private.forjados_can_manage_event_service_unit_v1(uuid)
  from public, anon, authenticated;
grant execute on function private.forjados_can_manage_event_service_unit_v1(uuid)
  to authenticated;

create policy event_service_units_select_authenticated
on public.event_service_units for select to authenticated
using ((select auth.uid()) is not null);

create policy event_service_units_insert_managers
on public.event_service_units for insert to authenticated
with check ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy event_service_units_update_managers
on public.event_service_units for update to authenticated
using ((select private.forjados_can_manage_event_service_unit_v1(id)))
with check ((select private.forjados_can_manage_event_service_unit_v1(id)));

create policy event_service_units_delete_managers
on public.event_service_units for delete to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy event_service_positions_select_authenticated
on public.event_service_positions for select to authenticated
using ((select auth.uid()) is not null);

create policy event_service_positions_insert_managers
on public.event_service_positions for insert to authenticated
with check ((select private.forjados_can_manage_event_service_unit_v1(unit_id)));

create policy event_service_positions_update_managers
on public.event_service_positions for update to authenticated
using ((select private.forjados_can_manage_event_service_unit_v1(unit_id)))
with check ((select private.forjados_can_manage_event_service_unit_v1(unit_id)));

create policy event_service_positions_delete_managers
on public.event_service_positions for delete to authenticated
using ((select private.forjados_can_manage_event_service_unit_v1(unit_id)));

create policy event_service_assignments_select_authenticated
on public.event_service_assignments for select to authenticated
using ((select auth.uid()) is not null);

create policy event_service_assignments_insert_managers
on public.event_service_assignments for insert to authenticated
with check ((select private.forjados_can_manage_event_service_unit_v1(unit_id)));

create policy event_service_assignments_update_managers
on public.event_service_assignments for update to authenticated
using ((select private.forjados_can_manage_event_service_unit_v1(unit_id)))
with check ((select private.forjados_can_manage_event_service_unit_v1(unit_id)));

create policy event_service_assignments_delete_managers
on public.event_service_assignments for delete to authenticated
using ((select private.forjados_can_manage_event_service_unit_v1(unit_id)));

create policy event_service_slots_select_authenticated
on public.event_service_slots for select to authenticated
using ((select auth.uid()) is not null);

create policy event_service_slots_insert_managers
on public.event_service_slots for insert to authenticated
with check ((select private.forjados_can_manage_event_service_unit_v1(unit_id)));

create policy event_service_slots_update_managers
on public.event_service_slots for update to authenticated
using ((select private.forjados_can_manage_event_service_unit_v1(unit_id)))
with check ((select private.forjados_can_manage_event_service_unit_v1(unit_id)));

create policy event_service_slots_delete_managers
on public.event_service_slots for delete to authenticated
using ((select private.forjados_can_manage_event_service_unit_v1(unit_id)));

create or replace function private.forjados_prepare_event_service_assignment_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.event_service_units%rowtype;
  v_character public.event_service_units%rowtype;
  v_group public.event_service_units%rowtype;
  v_position_unit uuid;
  v_character_count integer;
begin
  select * into v_unit from public.event_service_units where id = new.unit_id;
  if not found then raise exception 'Função operacional não encontrada.'; end if;
  new.edition_id := v_unit.edition_id;

  if new.position_id is not null then
    select position.unit_id into v_position_unit
    from public.event_service_positions position
    where position.id = new.position_id;
    if v_position_unit is distinct from new.unit_id then
      raise exception 'A função escolhida não pertence a este setor/oficina.';
    end if;
  end if;

  if new.linked_character_id is not null then
    select * into v_character from public.event_service_units where id = new.linked_character_id;
    if not found or v_character.edition_id <> v_unit.edition_id or v_character.unit_type <> 'character' then
      raise exception 'Personagem inválido para esta edição.';
    end if;
    if v_unit.unit_type <> 'group' then
      raise exception 'Personagens vinculados devem ser escalados dentro de um grupo.';
    end if;
  end if;

  if new.group_id is not null then
    select * into v_group from public.event_service_units where id = new.group_id;
    if not found or v_group.edition_id <> v_unit.edition_id or v_group.unit_type <> 'group' then
      raise exception 'Grupo inválido para esta edição.';
    end if;
  end if;

  if v_unit.unit_type = 'character' then
    v_character := v_unit;
  end if;
  if v_character.id is not null and v_character.per_group is true then
    if new.group_id is null then
      raise exception 'Escolha o grupo para este personagem.';
    end if;
    if v_character.max_people is not null then
      select count(*) into v_character_count
      from public.event_service_assignments assignment
      where assignment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and assignment.group_id = new.group_id
        and (
          assignment.unit_id = v_character.id
          or assignment.linked_character_id = v_character.id
        );
      if v_character_count >= v_character.max_people then
        raise exception 'O limite de % pessoa(s) para % neste grupo já foi atingido.',
          v_character.max_people, v_character.name;
      end if;
    end if;
  end if;

  if new.user_id is not null then
    select coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email)
      into new.person_name
    from public.profiles profile
    where profile.id = new.user_id
      and coalesce(profile.is_deleted, false) is false;
    if new.person_name is null then raise exception 'Usuário não encontrado ou inativo.'; end if;
    new.external_name := '';
  else
    new.external_name := left(trim(new.external_name), 160);
    new.person_name := new.external_name;
  end if;

  new.role_title := left(trim(coalesce(new.role_title, '')), 160);
  new.notes := left(trim(coalesce(new.notes, '')), 1000);
  if v_unit.unit_type <> 'sector' then
    new.is_primary := false;
  end if;
  return new;
end;
$$;

revoke all on function private.forjados_prepare_event_service_assignment_v1()
  from public, anon, authenticated;

create trigger trg_prepare_event_service_assignment
before insert or update on public.event_service_assignments
for each row execute function private.forjados_prepare_event_service_assignment_v1();

create or replace function private.forjados_prepare_event_service_slot_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.event_service_units%rowtype;
  v_location public.event_service_units%rowtype;
begin
  select * into v_unit from public.event_service_units where id = new.unit_id;
  if not found then raise exception 'Grupo, oficina ou escala não encontrada.'; end if;
  new.edition_id := v_unit.edition_id;
  if new.location_id is not null then
    select * into v_location from public.event_service_units where id = new.location_id;
    if not found or v_location.edition_id <> v_unit.edition_id or v_location.unit_type <> 'location' then
      raise exception 'Local inválido para esta edição.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.forjados_prepare_event_service_slot_v1()
  from public, anon, authenticated;

create trigger trg_prepare_event_service_slot
before insert or update on public.event_service_slots
for each row execute function private.forjados_prepare_event_service_slot_v1();

create or replace function private.forjados_refresh_profile_sectors_v1(
  p_user_id uuid,
  p_edition_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sectors text[];
  v_primary text;
begin
  if p_user_id is null then return; end if;
  if not exists (
    select 1 from public.forjados_editions edition
    where edition.id = p_edition_id and edition.is_active is true
  ) then return; end if;

  select coalesce(array_agg(unit.name order by assignment.is_primary desc, unit.display_order, unit.name), '{}'::text[]),
         (array_agg(unit.name order by assignment.is_primary desc, unit.display_order, unit.name))[1]
    into v_sectors, v_primary
  from public.event_service_assignments assignment
  join public.event_service_units unit on unit.id = assignment.unit_id
  where assignment.edition_id = p_edition_id
    and assignment.user_id = p_user_id
    and unit.unit_type = 'sector'
    and unit.is_active is true;

  update public.profiles profile
  set sectors = coalesce(v_sectors, '{}'::text[]),
      primary_team = v_primary,
      updated_at = now()
  where profile.id = p_user_id;
end;
$$;

revoke all on function private.forjados_refresh_profile_sectors_v1(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.forjados_sync_profile_sectors_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.forjados_refresh_profile_sectors_v1(old.user_id, old.edition_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.forjados_refresh_profile_sectors_v1(new.user_id, new.edition_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.forjados_sync_profile_sectors_v1()
  from public, anon, authenticated;

create trigger trg_sync_profile_sectors
after insert or update or delete on public.event_service_assignments
for each row execute function private.forjados_sync_profile_sectors_v1();

create or replace function private.forjados_audit_event_service_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id text := coalesce(v_row ->> 'id', '');
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata)
  values (
    (select auth.uid()),
    'event_service.' || lower(tg_op),
    tg_table_name,
    v_id,
    format('Operação do evento: %s em %s.', lower(tg_op), tg_table_name),
    jsonb_build_object('record', v_row)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.forjados_audit_event_service_change_v1()
  from public, anon, authenticated;

create trigger trg_audit_event_service_units
after insert or update or delete on public.event_service_units
for each row execute function private.forjados_audit_event_service_change_v1();
create trigger trg_audit_event_service_positions
after insert or update or delete on public.event_service_positions
for each row execute function private.forjados_audit_event_service_change_v1();
create trigger trg_audit_event_service_assignments
after insert or update or delete on public.event_service_assignments
for each row execute function private.forjados_audit_event_service_change_v1();
create trigger trg_audit_event_service_slots
after insert or update or delete on public.event_service_slots
for each row execute function private.forjados_audit_event_service_change_v1();

create trigger set_event_service_units_updated_at
before update on public.event_service_units
for each row execute function public.set_updated_at();
create trigger set_event_service_positions_updated_at
before update on public.event_service_positions
for each row execute function public.set_updated_at();
create trigger set_event_service_assignments_updated_at
before update on public.event_service_assignments
for each row execute function public.set_updated_at();
create trigger set_event_service_slots_updated_at
before update on public.event_service_slots
for each row execute function public.set_updated_at();

create or replace function private.forjados_seed_event_services_v1(p_edition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_service_units (
    edition_id, unit_type, name, description, min_people, max_people, per_group, display_order
  ) values
    (p_edition_id, 'character', 'Guias', 'Guias que acompanham cada grupo.', 2, 2, true, 10),
    (p_edition_id, 'character', 'Inimigo', 'Personagem do inimigo em cada grupo.', 1, 1, true, 20),
    (p_edition_id, 'character', 'Infiltrado', 'Um ou dois infiltrados por grupo.', 1, 2, true, 30),
    (p_edition_id, 'character', 'Espírito Santo', 'Representação do Espírito Santo em cada grupo.', 1, 1, true, 40),
    (p_edition_id, 'character', 'Invisível', 'Dois invisíveis por grupo.', 2, 2, true, 50),
    (p_edition_id, 'character', 'Procurados', 'Procurado responsável por cada grupo.', 1, 1, true, 60),
    (p_edition_id, 'character', 'Enfermeiro', 'Referência de cuidado e saúde do grupo.', 1, 1, true, 70),
    (p_edition_id, 'character', 'Mídia', 'Responsável de mídia do grupo.', 1, 1, true, 80)
  on conflict do nothing;

  insert into public.event_service_units (edition_id, unit_type, name, display_order)
  select p_edition_id, 'sector', seed.name, seed.ord
  from (values
    ('Liderança', 10), ('Confecção', 20), ('Logística', 30), ('Segurança', 40),
    ('Limpeza', 50), ('Cozinha', 60), ('Intercessão', 70), ('Crianças', 80),
    ('Rancho', 90), ('Mídia', 100), ('Tesouraria', 110), ('Louvor', 120),
    ('Saúde', 130), ('Recepção', 140), ('Transporte', 150),
    ('Comunicação', 160), ('Apoio', 170), ('Outro', 999)
  ) seed(name, ord)
  on conflict do nothing;

  insert into public.event_service_units (edition_id, unit_type, name, display_order)
  select p_edition_id, 'location', seed.name, seed.ord
  from (values
    ('Recepção / Arrebatamento', 10), ('Contêiner', 20), ('Sepultamento', 30),
    ('Selva', 40), ('Depressão', 50), ('Testemunho', 60), ('Família', 70),
    ('Falsa Baiana', 80), ('Tenda Missões / Mendigo', 90), ('Internauta', 100),
    ('Igreja Morna', 110), ('Família Restaurada', 120), ('Cracolândia', 130),
    ('Igreja Adormecida', 140), ('Campo', 150), ('Ponte', 160), ('Lama', 170)
  ) seed(name, ord)
  on conflict do nothing;

  insert into public.event_service_units (edition_id, unit_type, name, color, display_order)
  values
    (p_edition_id, 'group', 'Vermelho', '#B91C1C', 10),
    (p_edition_id, 'group', 'Bronze', '#A16207', 20),
    (p_edition_id, 'group', 'Prata', '#64748B', 30),
    (p_edition_id, 'group', 'Ouro', '#D4A017', 40)
  on conflict do nothing;

  insert into public.event_service_units (edition_id, unit_type, name, display_order)
  values
    (p_edition_id, 'scale', 'Escala Alojamento', 10),
    (p_edition_id, 'scale', 'Escala Portão Principal', 20)
  on conflict do nothing;

  insert into public.event_service_assignments (
    edition_id, unit_id, user_id, assignment_kind, is_leader, is_primary, role_title
  )
  select p_edition_id,
         unit.id,
         profile.id,
         'staff',
         profile.role::text in ('leader', 'director', 'admin') or coalesce(profile.is_admin, false),
         unit.name = profile.primary_team,
         case when profile.role::text = 'leader' then 'Líder do setor' else '' end
  from public.profiles profile
  join public.event_service_units unit
    on unit.edition_id = p_edition_id
   and unit.unit_type = 'sector'
   and (unit.name = profile.primary_team or unit.name = any(coalesce(profile.sectors, '{}'::text[])))
  where profile.inscription_status::text = 'approved'
    and coalesce(profile.is_deleted, false) is false
  on conflict do nothing;
end;
$$;

revoke all on function private.forjados_seed_event_services_v1(uuid)
  from public, anon, authenticated;

create or replace function private.forjados_seed_event_services_on_edition_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.forjados_seed_event_services_v1(new.id);
  return new;
end;
$$;

revoke all on function private.forjados_seed_event_services_on_edition_v1()
  from public, anon, authenticated;

create trigger trg_seed_event_services_on_edition
after insert on public.forjados_editions
for each row execute function private.forjados_seed_event_services_on_edition_v1();

do $$
declare
  v_edition record;
begin
  for v_edition in select id from public.forjados_editions loop
    perform private.forjados_seed_event_services_v1(v_edition.id);
  end loop;
end;
$$;

create or replace function public.forjados_list_service_people_v1()
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  primary_team text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;
  if not (
    (select private.forjados_has_any_role_v1(array['admin', 'director', 'leader']))
    or exists (
      select 1 from public.event_service_assignments assignment
      where assignment.user_id = (select auth.uid()) and assignment.is_leader is true
    )
  ) then
    raise exception 'Acesso permitido somente a gestores e líderes de setor.' using errcode = '42501';
  end if;

  return query
  select profile.id,
         coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email),
         profile.email,
         profile.role::text,
         coalesce(profile.primary_team, '')
  from public.profiles profile
  where profile.inscription_status::text = 'approved'
    and coalesce(profile.is_deleted, false) is false
  order by coalesce(nullif(profile.display_name, ''), profile.email);
end;
$$;

revoke all on function public.forjados_list_service_people_v1()
  from public, anon, authenticated;
grant execute on function public.forjados_list_service_people_v1()
  to authenticated;

alter table public.event_schedule_items
  add column if not exists schedule_kind text not null default 'activity',
  add column if not exists duration_minutes integer,
  add column if not exists route_order integer,
  add column if not exists service_unit_id uuid references public.event_service_units(id) on delete set null;

alter table public.event_schedule_items
  add constraint event_schedule_items_schedule_kind_check
    check (schedule_kind in ('activity', 'route')),
  add constraint event_schedule_items_duration_check
    check (duration_minutes is null or duration_minutes between 1 and 1440),
  add constraint event_schedule_items_route_order_check
    check (route_order is null or route_order > 0);

create index event_schedule_items_service_unit_idx
  on public.event_schedule_items (service_unit_id)
  where service_unit_id is not null and deleted_at is null;
create index event_schedule_items_route_idx
  on public.event_schedule_items (edition_id, schedule_kind, route_order)
  where deleted_at is null;

create or replace function public.forjados_save_event_route_v1(
  p_edition_id uuid,
  p_start_at timestamptz,
  p_rows jsonb,
  p_is_published boolean default false,
  p_replace boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_cursor timestamptz := p_start_at;
  v_row jsonb;
  v_title text;
  v_duration integer;
  v_location_id uuid;
  v_location_name text;
  v_activity_type text;
  v_order integer := 0;
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem montar o roteiro.' using errcode = '42501';
  end if;
  if p_edition_id is null or p_start_at is null then
    raise exception 'Edição e horário inicial são obrigatórios.';
  end if;
  if not exists (select 1 from public.forjados_editions where id = p_edition_id) then
    raise exception 'Edição não encontrada.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0
     or jsonb_array_length(p_rows) > 100 then
    raise exception 'O roteiro precisa ter entre 1 e 100 etapas.';
  end if;

  if p_replace then
    update public.event_schedule_items
    set deleted_at = now(), is_published = false, updated_at = now()
    where edition_id = p_edition_id
      and schedule_kind = 'route'
      and deleted_at is null;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_order := v_order + 1;
    v_title := left(trim(coalesce(v_row ->> 'title', '')), 160);
    v_duration := coalesce((v_row ->> 'duration_minutes')::integer, 0);
    v_location_id := nullif(v_row ->> 'location_id', '')::uuid;
    v_activity_type := coalesce(nullif(v_row ->> 'activity_type', ''), 'activity');
    if char_length(v_title) < 3 then raise exception 'A etapa % precisa de um nome.', v_order; end if;
    if v_duration < 1 or v_duration > 1440 then raise exception 'Duração inválida na etapa %.', v_order; end if;
    if v_activity_type not in ('activity', 'worship', 'meal', 'service', 'transport', 'break', 'other') then
      v_activity_type := 'activity';
    end if;

    v_location_name := '';
    if v_location_id is not null then
      select unit.name into v_location_name
      from public.event_service_units unit
      where unit.id = v_location_id
        and unit.edition_id = p_edition_id
        and unit.unit_type = 'location';
      if v_location_name is null then raise exception 'Local inválido na etapa %.', v_order; end if;
    end if;

    insert into public.event_schedule_items (
      edition_id, title, description, starts_at, ends_at, location, activity_type,
      team_names, responsible, responsible_id, is_published, created_by,
      schedule_kind, duration_minutes, route_order, service_unit_id
    ) values (
      p_edition_id, v_title, left(trim(coalesce(v_row ->> 'description', '')), 2000),
      v_cursor, v_cursor + make_interval(mins => v_duration), coalesce(v_location_name, ''),
      v_activity_type, '{}'::text[], '', null, coalesce(p_is_published, false), v_actor_id,
      'route', v_duration, v_order, v_location_id
    );
    v_cursor := v_cursor + make_interval(mins => v_duration);
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata)
  values (
    v_actor_id, 'event_route.saved', 'forjados_edition', p_edition_id::text,
    format('Roteiro do evento salvo com %s etapas.', v_order),
    jsonb_build_object('rows', v_order, 'starts_at', p_start_at, 'ends_at', v_cursor, 'published', p_is_published)
  );
  return v_order;
end;
$$;

revoke all on function public.forjados_save_event_route_v1(uuid, timestamptz, jsonb, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.forjados_save_event_route_v1(uuid, timestamptz, jsonb, boolean, boolean)
  to authenticated;

comment on table public.event_service_units is
  'Personagens, setores, oficinas/locais, grupos e escalas configurados por edição.';
comment on table public.event_service_assignments is
  'Alocações múltiplas de usuários do app ou participantes externos nas operações da edição.';
comment on table public.event_service_slots is
  'Horários de grupos, oficinas, setores e escalas operacionais.';
