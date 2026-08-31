-- Painel de Controle de Trafego de Trilhas.
-- Mantem o mapa, a posicao manual dos grupos e o historico por edicao.

create table public.trail_map_stations (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  service_unit_id uuid references public.event_service_units(id) on delete set null,
  station_key text not null,
  label text not null,
  short_label text not null default '',
  station_kind text not null default 'station',
  x_percent numeric(5,2) not null,
  y_percent numeric(5,2) not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trail_map_stations_key_check
    check (station_key ~ '^[a-z0-9_]{2,60}$'),
  constraint trail_map_stations_label_check
    check (char_length(trim(label)) between 2 and 120),
  constraint trail_map_stations_short_label_check
    check (char_length(short_label) <= 40),
  constraint trail_map_stations_kind_check
    check (station_kind in ('station', 'gate', 'qg', 'field', 'reveal', 'hold')),
  constraint trail_map_stations_position_check
    check (x_percent between 0 and 100 and y_percent between 0 and 100),
  unique (edition_id, station_key),
  unique (edition_id, id)
);

create index trail_map_stations_edition_order_idx
  on public.trail_map_stations (edition_id, display_order, label)
  where is_active is true;
create index trail_map_stations_service_unit_idx
  on public.trail_map_stations (service_unit_id)
  where service_unit_id is not null;

create table public.trail_map_connections (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  from_station_id uuid not null,
  to_station_id uuid not null,
  connection_kind text not null default 'trail',
  is_bidirectional boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint trail_map_connections_kind_check
    check (connection_kind in ('trail', 'connector', 'hold')),
  constraint trail_map_connections_distinct_check
    check (from_station_id <> to_station_id),
  constraint trail_map_connections_from_fk
    foreign key (edition_id, from_station_id)
    references public.trail_map_stations(edition_id, id) on delete cascade,
  constraint trail_map_connections_to_fk
    foreign key (edition_id, to_station_id)
    references public.trail_map_stations(edition_id, id) on delete cascade,
  unique (edition_id, from_station_id, to_station_id)
);

create index trail_map_connections_edition_order_idx
  on public.trail_map_connections (edition_id, display_order);

create table public.trail_group_traffic (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  group_id uuid not null references public.event_service_units(id) on delete cascade,
  station_id uuid references public.trail_map_stations(id) on delete set null,
  origin_station_id uuid references public.trail_map_stations(id) on delete set null,
  destination_station_id uuid references public.trail_map_stations(id) on delete set null,
  marker_x numeric(5,2) not null default 8,
  marker_y numeric(5,2) not null default 42,
  movement_status text not null default 'not_started',
  traffic_signal text not null default 'clear',
  delay_minutes integer not null default 0,
  notes text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_name text not null default 'Sistema',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trail_group_traffic_position_check
    check (marker_x between 0 and 100 and marker_y between 0 and 100),
  constraint trail_group_traffic_status_check
    check (movement_status in ('not_started', 'at_station', 'moving', 'holding', 'delayed', 'finished')),
  constraint trail_group_traffic_signal_check
    check (traffic_signal in ('clear', 'hold', 'attention')),
  constraint trail_group_traffic_delay_check
    check (delay_minutes between 0 and 720),
  constraint trail_group_traffic_notes_check
    check (char_length(notes) <= 1000),
  unique (edition_id, group_id)
);

create index trail_group_traffic_edition_updated_idx
  on public.trail_group_traffic (edition_id, updated_at desc);
create index trail_group_traffic_station_idx
  on public.trail_group_traffic (station_id)
  where station_id is not null;
create index trail_group_traffic_destination_idx
  on public.trail_group_traffic (destination_station_id)
  where destination_station_id is not null;
create index trail_group_traffic_updated_by_idx
  on public.trail_group_traffic (updated_by)
  where updated_by is not null;

create table public.trail_group_traffic_history (
  id bigint generated always as identity primary key,
  traffic_id uuid not null references public.trail_group_traffic(id) on delete cascade,
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  group_id uuid not null references public.event_service_units(id) on delete cascade,
  station_id uuid references public.trail_map_stations(id) on delete set null,
  origin_station_id uuid references public.trail_map_stations(id) on delete set null,
  destination_station_id uuid references public.trail_map_stations(id) on delete set null,
  marker_x numeric(5,2) not null,
  marker_y numeric(5,2) not null,
  movement_status text not null,
  traffic_signal text not null,
  delay_minutes integer not null default 0,
  notes text not null default '',
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_name text not null default 'Sistema',
  changed_at timestamptz not null default now()
);

create index trail_group_traffic_history_edition_changed_idx
  on public.trail_group_traffic_history (edition_id, changed_at desc);
create index trail_group_traffic_history_group_changed_idx
  on public.trail_group_traffic_history (group_id, changed_at desc);
create index trail_group_traffic_history_changed_by_idx
  on public.trail_group_traffic_history (changed_by)
  where changed_by is not null;

alter table public.trail_map_stations enable row level security;
alter table public.trail_map_connections enable row level security;
alter table public.trail_group_traffic enable row level security;
alter table public.trail_group_traffic_history enable row level security;

revoke all on table public.trail_map_stations from public, anon, authenticated;
revoke all on table public.trail_map_connections from public, anon, authenticated;
revoke all on table public.trail_group_traffic from public, anon, authenticated;
revoke all on table public.trail_group_traffic_history from public, anon, authenticated;

grant select on table public.trail_map_stations to authenticated;
grant select on table public.trail_map_connections to authenticated;
grant select, insert, update on table public.trail_group_traffic to authenticated;
grant select on table public.trail_group_traffic_history to authenticated;
grant all on table public.trail_map_stations to service_role;
grant all on table public.trail_map_connections to service_role;
grant all on table public.trail_group_traffic to service_role;
grant all on table public.trail_group_traffic_history to service_role;

create policy trail_map_stations_select_managers
on public.trail_map_stations for select to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy trail_map_connections_select_managers
on public.trail_map_connections for select to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy trail_group_traffic_select_managers
on public.trail_group_traffic for select to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy trail_group_traffic_insert_managers
on public.trail_group_traffic for insert to authenticated
with check ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy trail_group_traffic_update_managers
on public.trail_group_traffic for update to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])))
with check ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy trail_group_traffic_history_select_managers
on public.trail_group_traffic_history for select to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create or replace function private.forjados_prepare_trail_group_traffic_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text := 'Sistema';
  v_station_id uuid;
begin
  if not exists (
    select 1
    from public.event_service_units unit
    where unit.id = new.group_id
      and unit.edition_id = new.edition_id
      and unit.unit_type = 'group'
      and unit.is_active is true
  ) then
    raise exception 'Grupo invalido para esta edicao.' using errcode = '22023';
  end if;

  foreach v_station_id in array array[
    new.station_id,
    new.origin_station_id,
    new.destination_station_id
  ] loop
    if v_station_id is not null and not exists (
      select 1
      from public.trail_map_stations station
      where station.id = v_station_id
        and station.edition_id = new.edition_id
        and station.is_active is true
    ) then
      raise exception 'Estacao invalida para esta edicao.' using errcode = '22023';
    end if;
  end loop;

  if v_actor_id is not null then
    select coalesce(
      nullif(profile.display_name, ''),
      nullif(profile.full_name, ''),
      profile.email,
      'Operador'
    )
    into v_actor_name
    from public.profiles profile
    where profile.id = v_actor_id;
  end if;

  new.updated_by := v_actor_id;
  new.updated_by_name := coalesce(v_actor_name, 'Operador');
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.forjados_prepare_trail_group_traffic_v1()
  from public, anon, authenticated;

create or replace function private.forjados_record_trail_group_traffic_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trail_group_traffic_history (
    traffic_id, edition_id, group_id, station_id, origin_station_id,
    destination_station_id, marker_x, marker_y, movement_status,
    traffic_signal, delay_minutes, notes, changed_by, changed_by_name, changed_at
  ) values (
    new.id, new.edition_id, new.group_id, new.station_id, new.origin_station_id,
    new.destination_station_id, new.marker_x, new.marker_y, new.movement_status,
    new.traffic_signal, new.delay_minutes, new.notes, new.updated_by,
    new.updated_by_name, new.updated_at
  );
  return null;
end;
$$;

revoke all on function private.forjados_record_trail_group_traffic_v1()
  from public, anon, authenticated;

create trigger prepare_trail_group_traffic
before insert or update on public.trail_group_traffic
for each row execute function private.forjados_prepare_trail_group_traffic_v1();

create trigger record_trail_group_traffic
after insert or update on public.trail_group_traffic
for each row execute function private.forjados_record_trail_group_traffic_v1();

create trigger set_trail_map_stations_updated_at
before update on public.trail_map_stations
for each row execute function public.set_updated_at();

create or replace function private.forjados_seed_trail_traffic_v1(p_edition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate_id uuid;
begin
  insert into public.trail_map_stations (
    edition_id, service_unit_id, station_key, label, short_label,
    station_kind, x_percent, y_percent, display_order
  )
  select
    p_edition_id,
    unit.id,
    seed.station_key,
    seed.label,
    seed.short_label,
    seed.station_kind,
    seed.x_percent,
    seed.y_percent,
    seed.display_order
  from (values
    ('main_gate', 'Portão Principal', 'Portão', 'gate', 5.50::numeric, 40.00::numeric, 10, null::text),
    ('burial', 'Sepultamento', 'Sepultamento', 'station', 9.00, 15.00, 20, 'Sepultamento'),
    ('forest', 'Selva', 'Selva', 'station', 26.00, 8.00, 30, 'Selva'),
    ('depression', 'Depressão', 'Depressão', 'station', 40.00, 14.00, 40, 'Depressão'),
    ('testimony', 'Testemunho', 'Testemunho', 'station', 54.00, 8.00, 50, 'Testemunho'),
    ('destroyed_family', 'Família Destruída', 'Família', 'station', 72.00, 18.00, 60, 'Família'),
    ('false_baiana', 'Falsa Baiana', 'Falsa Baiana', 'station', 78.00, 33.00, 70, 'Falsa Baiana'),
    ('beggar', 'Tenda Missões / Mendigo', 'Mendigo', 'station', 91.00, 46.00, 80, 'Tenda Missões / Mendigo'),
    ('internet_user', 'Internauta', 'Internauta', 'station', 89.00, 73.00, 90, 'Internauta'),
    ('lukewarm_church', 'Igreja Morna', 'Igreja Morna', 'station', 72.00, 88.00, 100, 'Igreja Morna'),
    ('reception', 'Recepção / Arrebatamento', 'Arrebatamento', 'station', 51.00, 89.00, 110, 'Recepção / Arrebatamento'),
    ('restored_family', 'Família Restaurada', 'Família Restaurada', 'station', 31.00, 85.00, 120, 'Família Restaurada'),
    ('bridge', 'Ponte', 'Ponte', 'station', 16.00, 71.00, 130, 'Ponte'),
    ('drug_scene', 'Cracolândia', 'Cracolândia', 'station', 32.00, 61.00, 140, 'Cracolândia'),
    ('mud', 'Lama', 'Lama', 'station', 50.00, 67.00, 150, 'Lama'),
    ('sleeping_church', 'Igreja Adormecida', 'Igreja Adormecida', 'station', 70.00, 64.00, 160, 'Igreja Adormecida'),
    ('container', 'Contêiner', 'Contêiner', 'station', 33.00, 38.00, 170, 'Contêiner'),
    ('field', 'Campo', 'Campo', 'field', 53.00, 34.00, 180, 'Campo'),
    ('enemy_reveal', 'Revelação do Inimigo', 'Revelação', 'reveal', 65.00, 40.00, 190, null),
    ('temple_qg', 'Templo / QG', 'QG', 'qg', 25.00, 49.00, 200, null),
    ('command_hold', 'Area de Espera', 'Espera', 'hold', 49.00, 51.00, 210, null)
  ) seed(
    station_key, label, short_label, station_kind,
    x_percent, y_percent, display_order, service_unit_name
  )
  left join public.event_service_units unit
    on unit.edition_id = p_edition_id
   and unit.unit_type = 'location'
   and lower(unit.name) = lower(seed.service_unit_name)
  on conflict (edition_id, station_key) do update
    set service_unit_id = coalesce(excluded.service_unit_id, trail_map_stations.service_unit_id),
        label = excluded.label,
        short_label = excluded.short_label,
        station_kind = excluded.station_kind,
        display_order = excluded.display_order,
        is_active = true;

  insert into public.trail_map_connections (
    edition_id, from_station_id, to_station_id, connection_kind,
    is_bidirectional, display_order
  )
  select p_edition_id, source.id, target.id, edge.connection_kind, true, edge.display_order
  from (values
    ('main_gate', 'burial', 'trail', 10),
    ('burial', 'forest', 'trail', 20),
    ('forest', 'depression', 'trail', 30),
    ('depression', 'testimony', 'trail', 40),
    ('testimony', 'destroyed_family', 'trail', 50),
    ('destroyed_family', 'false_baiana', 'trail', 60),
    ('false_baiana', 'beggar', 'trail', 70),
    ('beggar', 'internet_user', 'trail', 80),
    ('internet_user', 'lukewarm_church', 'trail', 90),
    ('lukewarm_church', 'reception', 'trail', 100),
    ('reception', 'restored_family', 'trail', 110),
    ('restored_family', 'bridge', 'trail', 120),
    ('bridge', 'drug_scene', 'trail', 130),
    ('drug_scene', 'mud', 'trail', 140),
    ('mud', 'sleeping_church', 'trail', 150),
    ('sleeping_church', 'beggar', 'trail', 160),
    ('main_gate', 'container', 'connector', 170),
    ('container', 'field', 'connector', 180),
    ('field', 'enemy_reveal', 'connector', 190),
    ('enemy_reveal', 'false_baiana', 'connector', 200),
    ('temple_qg', 'container', 'connector', 210),
    ('temple_qg', 'command_hold', 'hold', 220),
    ('command_hold', 'field', 'hold', 230)
  ) edge(from_key, to_key, connection_kind, display_order)
  join public.trail_map_stations source
    on source.edition_id = p_edition_id and source.station_key = edge.from_key
  join public.trail_map_stations target
    on target.edition_id = p_edition_id and target.station_key = edge.to_key
  on conflict (edition_id, from_station_id, to_station_id) do nothing;

  select station.id into v_gate_id
  from public.trail_map_stations station
  where station.edition_id = p_edition_id and station.station_key = 'main_gate';

  insert into public.trail_group_traffic (
    edition_id, group_id, station_id, marker_x, marker_y,
    movement_status, traffic_signal, notes
  )
  select
    p_edition_id,
    group_unit.id,
    v_gate_id,
    5.50 + ((row_number() over (order by group_unit.display_order, group_unit.name) - 1) * 2.20),
    40.00 + ((row_number() over (order by group_unit.display_order, group_unit.name) - 1) * 2.20),
    'not_started',
    'clear',
    ''
  from public.event_service_units group_unit
  where group_unit.edition_id = p_edition_id
    and group_unit.unit_type = 'group'
    and group_unit.is_active is true
  on conflict (edition_id, group_id) do nothing;
end;
$$;

revoke all on function private.forjados_seed_trail_traffic_v1(uuid)
  from public, anon, authenticated;

create or replace function private.forjados_seed_trail_traffic_on_edition_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.forjados_seed_trail_traffic_v1(new.id);
  return new;
end;
$$;

revoke all on function private.forjados_seed_trail_traffic_on_edition_v1()
  from public, anon, authenticated;

create trigger trg_seed_trail_traffic_on_edition
after insert on public.forjados_editions
for each row execute function private.forjados_seed_trail_traffic_on_edition_v1();

do $$
declare
  v_edition record;
begin
  for v_edition in select id from public.forjados_editions loop
    perform private.forjados_seed_trail_traffic_v1(v_edition.id);
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'trail_group_traffic'
     ) then
    alter publication supabase_realtime add table public.trail_group_traffic;
  end if;
end;
$$;

comment on table public.trail_map_stations is
  'Estacoes visuais do mapa de trilhas, posicionadas por porcentagem em cada edicao.';
comment on table public.trail_map_connections is
  'Ligacoes visuais e segmentos usados para detectar conflitos de trajeto.';
comment on table public.trail_group_traffic is
  'Ultima posicao manual e ordem operacional de cada grupo no painel de trafego.';
comment on table public.trail_group_traffic_history is
  'Historico imutavel das atualizacoes manuais de posicao dos grupos.';
