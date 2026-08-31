-- Timeline operacional das trilhas.
-- Separa o planejamento ideal da execucao ao vivo e mantem check-ins/ETAs atomicos.

create table public.trail_route_plans (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  group_id uuid not null references public.event_service_units(id) on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, group_id)
);

create index trail_route_plans_group_idx on public.trail_route_plans (group_id);

create table public.trail_route_plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.trail_route_plans(id) on delete cascade,
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  group_id uuid not null references public.event_service_units(id) on delete cascade,
  station_id uuid references public.trail_map_stations(id) on delete set null,
  label text not null,
  ideal_order integer not null,
  stay_minutes integer not null default 5,
  travel_minutes integer not null default 0,
  is_break boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trail_route_plan_steps_label_check check (char_length(trim(label)) between 2 and 120),
  constraint trail_route_plan_steps_stay_check check (stay_minutes between 1 and 360),
  constraint trail_route_plan_steps_travel_check check (travel_minutes between 0 and 180),
  unique (plan_id, ideal_order) deferrable initially deferred
);

create index trail_route_plan_steps_edition_group_order_idx
  on public.trail_route_plan_steps (edition_id, group_id, ideal_order);
create index trail_route_plan_steps_station_idx
  on public.trail_route_plan_steps (station_id) where station_id is not null;

create table public.trail_route_executions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  group_id uuid not null references public.event_service_units(id) on delete cascade,
  plan_id uuid references public.trail_route_plans(id) on delete set null,
  run_status text not null default 'active',
  started_at timestamptz not null,
  finished_at timestamptz,
  schedule_variance_minutes integer not null default 0,
  estimated_finish_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_name text not null default 'Sistema',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trail_route_executions_status_check check (run_status in ('active', 'finished')),
  constraint trail_route_executions_variance_check check (schedule_variance_minutes between -720 and 720),
  constraint trail_route_executions_finish_check check (
    (run_status = 'active' and finished_at is null)
    or (run_status = 'finished' and finished_at is not null)
  ),
  unique (edition_id, group_id)
);

create index trail_route_executions_group_idx on public.trail_route_executions (group_id);
create index trail_route_executions_edition_status_idx
  on public.trail_route_executions (edition_id, run_status, updated_at desc);
create index trail_route_executions_plan_idx
  on public.trail_route_executions (plan_id) where plan_id is not null;
create index trail_route_executions_updated_by_idx
  on public.trail_route_executions (updated_by) where updated_by is not null;

create table public.trail_route_execution_steps (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.trail_route_executions(id) on delete cascade,
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  group_id uuid not null references public.event_service_units(id) on delete cascade,
  plan_step_id uuid references public.trail_route_plan_steps(id) on delete set null,
  station_id uuid references public.trail_map_stations(id) on delete set null,
  label text not null,
  original_order integer not null,
  live_order integer not null,
  stay_minutes integer not null,
  travel_minutes integer not null default 0,
  planned_arrival_at timestamptz not null,
  eta_at timestamptz not null,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  step_status text not null default 'pending',
  is_break boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trail_route_execution_steps_status_check
    check (step_status in ('pending', 'current', 'completed', 'skipped')),
  constraint trail_route_execution_steps_stay_check check (stay_minutes between 1 and 360),
  constraint trail_route_execution_steps_travel_check check (travel_minutes between 0 and 180),
  constraint trail_route_execution_steps_times_check
    check (checked_out_at is null or checked_in_at is null or checked_out_at >= checked_in_at),
  unique (execution_id, live_order) deferrable initially deferred
);

create index trail_route_execution_steps_edition_group_order_idx
  on public.trail_route_execution_steps (edition_id, group_id, live_order);
create index trail_route_execution_steps_execution_status_order_idx
  on public.trail_route_execution_steps (execution_id, step_status, live_order);
create index trail_route_execution_steps_plan_step_idx
  on public.trail_route_execution_steps (plan_step_id) where plan_step_id is not null;
create index trail_route_execution_steps_station_idx
  on public.trail_route_execution_steps (station_id) where station_id is not null;

alter table public.trail_route_plans enable row level security;
alter table public.trail_route_plan_steps enable row level security;
alter table public.trail_route_executions enable row level security;
alter table public.trail_route_execution_steps enable row level security;

revoke all on table public.trail_route_plans from public, anon, authenticated;
revoke all on table public.trail_route_plan_steps from public, anon, authenticated;
revoke all on table public.trail_route_executions from public, anon, authenticated;
revoke all on table public.trail_route_execution_steps from public, anon, authenticated;

grant select, insert, update, delete on table public.trail_route_plans to authenticated;
grant select, insert, update, delete on table public.trail_route_plan_steps to authenticated;
grant select, insert, update, delete on table public.trail_route_executions to authenticated;
grant select, insert, update, delete on table public.trail_route_execution_steps to authenticated;
grant all on table public.trail_route_plans to service_role;
grant all on table public.trail_route_plan_steps to service_role;
grant all on table public.trail_route_executions to service_role;
grant all on table public.trail_route_execution_steps to service_role;

create policy trail_route_plans_manage_admin_director
on public.trail_route_plans for all to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])))
with check ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy trail_route_plan_steps_manage_admin_director
on public.trail_route_plan_steps for all to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])))
with check ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy trail_route_executions_manage_admin_director
on public.trail_route_executions for all to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])))
with check ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create policy trail_route_execution_steps_manage_admin_director
on public.trail_route_execution_steps for all to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])))
with check ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create or replace function private.forjados_validate_trail_route_plan_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.event_service_units unit
    where unit.id = new.group_id
      and unit.edition_id = new.edition_id
      and unit.unit_type = 'group'
      and unit.is_active is true
  ) then
    raise exception 'Grupo invalido para o planejamento desta edicao.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.forjados_validate_trail_route_plan_v1()
  from public, anon, authenticated;

create or replace function private.forjados_validate_trail_route_plan_step_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.trail_route_plans%rowtype;
begin
  select * into v_plan from public.trail_route_plans where id = new.plan_id;
  if not found or v_plan.edition_id <> new.edition_id or v_plan.group_id <> new.group_id then
    raise exception 'Etapa nao pertence ao planejamento informado.' using errcode = '22023';
  end if;
  if new.station_id is not null and not exists (
    select 1 from public.trail_map_stations station
    where station.id = new.station_id
      and station.edition_id = new.edition_id
      and station.is_active is true
  ) then
    raise exception 'Estacao invalida para esta edicao.' using errcode = '22023';
  end if;
  new.label := trim(new.label);
  return new;
end;
$$;

revoke all on function private.forjados_validate_trail_route_plan_step_v1()
  from public, anon, authenticated;

create trigger validate_trail_route_plan
before insert or update on public.trail_route_plans
for each row execute function private.forjados_validate_trail_route_plan_v1();

create trigger validate_trail_route_plan_step
before insert or update on public.trail_route_plan_steps
for each row execute function private.forjados_validate_trail_route_plan_step_v1();

create trigger set_trail_route_plans_updated_at
before update on public.trail_route_plans
for each row execute function public.set_updated_at();

create trigger set_trail_route_plan_steps_updated_at
before update on public.trail_route_plan_steps
for each row execute function public.set_updated_at();

create trigger set_trail_route_executions_updated_at
before update on public.trail_route_executions
for each row execute function public.set_updated_at();

create trigger set_trail_route_execution_steps_updated_at
before update on public.trail_route_execution_steps
for each row execute function public.set_updated_at();

create or replace function private.forjados_stamp_trail_route_execution_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  new.updated_by := v_actor_id;
  select coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email, 'Operador')
    into new.updated_by_name
  from public.profiles profile
  where profile.id = v_actor_id;
  new.updated_by_name := coalesce(new.updated_by_name, 'Sistema');
  return new;
end;
$$;

revoke all on function private.forjados_stamp_trail_route_execution_v1()
  from public, anon, authenticated;

create trigger stamp_trail_route_execution
before insert or update on public.trail_route_executions
for each row execute function private.forjados_stamp_trail_route_execution_v1();

create or replace function public.forjados_reorder_trail_route_plan_v1(
  p_plan_id uuid,
  p_step_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected integer;
begin
  select count(*) into v_expected
  from public.trail_route_plan_steps
  where plan_id = p_plan_id;

  if coalesce(array_length(p_step_ids, 1), 0) <> v_expected
     or (select count(distinct item) from unnest(p_step_ids) item) <> v_expected
     or exists (
       select 1 from unnest(p_step_ids) item
       where not exists (
         select 1 from public.trail_route_plan_steps step
         where step.id = item and step.plan_id = p_plan_id
       )
     ) then
    raise exception 'A nova ordem deve conter todas as etapas exatamente uma vez.' using errcode = '22023';
  end if;

  update public.trail_route_plan_steps step
  set ideal_order = ordered.position::integer
  from unnest(p_step_ids) with ordinality ordered(id, position)
  where step.id = ordered.id and step.plan_id = p_plan_id;
end;
$$;

revoke all on function public.forjados_reorder_trail_route_plan_v1(uuid, uuid[])
  from public, anon;
grant execute on function public.forjados_reorder_trail_route_plan_v1(uuid, uuid[])
  to authenticated;

create or replace function public.forjados_start_trail_route_v1(
  p_group_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.trail_route_plans%rowtype;
  v_execution public.trail_route_executions%rowtype;
  v_first public.trail_route_execution_steps%rowtype;
  v_last public.trail_route_execution_steps%rowtype;
  v_station public.trail_map_stations%rowtype;
  v_variance integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  select * into v_plan
  from public.trail_route_plans
  where group_id = p_group_id;
  if not found then
    raise exception 'Cadastre a rota ideal deste grupo antes de iniciar.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.trail_route_plan_steps where plan_id = v_plan.id) then
    raise exception 'A rota ideal deste grupo ainda nao possui etapas.' using errcode = '22023';
  end if;

  select * into v_execution
  from public.trail_route_executions
  where edition_id = v_plan.edition_id and group_id = p_group_id
  for update;

  if found then
    if v_execution.run_status = 'active' then return v_execution.id; end if;
    raise exception 'A trilha deste grupo ja foi encerrada.' using errcode = '22023';
  end if;

  insert into public.trail_route_executions (
    edition_id, group_id, plan_id, run_status, started_at
  ) values (
    v_plan.edition_id, p_group_id, v_plan.id, 'active', p_now
  ) returning * into v_execution;

  insert into public.trail_route_execution_steps (
    execution_id, edition_id, group_id, plan_step_id, station_id, label,
    original_order, live_order, stay_minutes, travel_minutes,
    planned_arrival_at, eta_at, step_status, is_break
  )
  select
    v_execution.id,
    v_plan.edition_id,
    p_group_id,
    step.id,
    step.station_id,
    step.label,
    row_number() over (order by step.ideal_order)::integer,
    row_number() over (order by step.ideal_order)::integer,
    step.stay_minutes,
    step.travel_minutes,
    v_plan.starts_at + make_interval(mins => coalesce(
      sum(step.stay_minutes + step.travel_minutes) over (
        order by step.ideal_order rows between unbounded preceding and 1 preceding
      ), 0
    )::integer),
    p_now + make_interval(mins => coalesce(
      sum(step.stay_minutes + step.travel_minutes) over (
        order by step.ideal_order rows between unbounded preceding and 1 preceding
      ), 0
    )::integer),
    case when row_number() over (order by step.ideal_order) = 1 then 'current' else 'pending' end,
    step.is_break
  from public.trail_route_plan_steps step
  where step.plan_id = v_plan.id
  order by step.ideal_order;

  select * into v_first
  from public.trail_route_execution_steps
  where execution_id = v_execution.id
  order by live_order
  limit 1;

  update public.trail_route_execution_steps
  set checked_in_at = p_now, eta_at = p_now
  where id = v_first.id;

  select * into v_last
  from public.trail_route_execution_steps
  where execution_id = v_execution.id
  order by live_order desc
  limit 1;

  v_variance := round(extract(epoch from (p_now - v_first.planned_arrival_at)) / 60.0)::integer;
  v_variance := greatest(-720, least(720, v_variance));

  update public.trail_route_executions
  set schedule_variance_minutes = v_variance,
      estimated_finish_at = v_last.eta_at + make_interval(mins => v_last.stay_minutes)
  where id = v_execution.id;

  select * into v_station from public.trail_map_stations where id = v_first.station_id;
  insert into public.trail_group_traffic (
    edition_id, group_id, station_id, origin_station_id, destination_station_id,
    marker_x, marker_y, movement_status, traffic_signal, delay_minutes, notes
  ) values (
    v_plan.edition_id, p_group_id, v_first.station_id, null, null,
    coalesce(v_station.x_percent, 50), coalesce(v_station.y_percent, 50),
    'at_station', case when v_variance > 10 then 'attention' else 'clear' end,
    greatest(0, v_variance), 'Trilha iniciada automaticamente.'
  )
  on conflict (edition_id, group_id) do update
    set station_id = excluded.station_id,
        origin_station_id = null,
        destination_station_id = null,
        marker_x = excluded.marker_x,
        marker_y = excluded.marker_y,
        movement_status = excluded.movement_status,
        traffic_signal = excluded.traffic_signal,
        delay_minutes = excluded.delay_minutes,
        notes = excluded.notes;

  return v_execution.id;
end;
$$;

revoke all on function public.forjados_start_trail_route_v1(uuid, timestamptz)
  from public, anon;
grant execute on function public.forjados_start_trail_route_v1(uuid, timestamptz)
  to authenticated;

create or replace function public.forjados_check_in_trail_step_v1(
  p_execution_step_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_step public.trail_route_execution_steps%rowtype;
  v_current public.trail_route_execution_steps%rowtype;
  v_execution public.trail_route_executions%rowtype;
  v_last public.trail_route_execution_steps%rowtype;
  v_station public.trail_map_stations%rowtype;
  v_variance integer;
begin
  select * into v_step
  from public.trail_route_execution_steps
  where id = p_execution_step_id
  for update;
  if not found then raise exception 'Etapa operacional nao encontrada.' using errcode = '22023'; end if;

  select * into v_execution
  from public.trail_route_executions
  where id = v_step.execution_id
  for update;
  if not found or v_execution.run_status <> 'active' then
    raise exception 'A trilha deste grupo nao esta ativa.' using errcode = '22023';
  end if;
  if v_step.step_status = 'current' then return v_step.id; end if;
  if v_step.step_status <> 'pending' then
    raise exception 'Esta etapa ja foi encerrada.' using errcode = '22023';
  end if;

  select * into v_current
  from public.trail_route_execution_steps
  where execution_id = v_execution.id and step_status = 'current'
  order by live_order
  limit 1
  for update;

  if found and v_step.live_order <> v_current.live_order + 1 then
    update public.trail_route_execution_steps
    set live_order = live_order + 1
    where execution_id = v_execution.id
      and step_status = 'pending'
      and live_order > v_current.live_order
      and live_order < v_step.live_order;
    update public.trail_route_execution_steps
    set live_order = v_current.live_order + 1
    where id = v_step.id;
  end if;

  if found then
    update public.trail_route_execution_steps
    set step_status = 'completed', checked_out_at = p_now
    where id = v_current.id;
  end if;

  update public.trail_route_execution_steps
  set step_status = 'current', checked_in_at = p_now, checked_out_at = null, eta_at = p_now
  where id = v_step.id
  returning * into v_step;

  with ordered as (
    select future.id,
      p_now + make_interval(mins => (
        v_step.stay_minutes + v_step.travel_minutes + coalesce(
          sum(future.stay_minutes + future.travel_minutes) over (
            order by future.live_order rows between unbounded preceding and 1 preceding
          ), 0
        )
      )::integer) as next_eta
    from public.trail_route_execution_steps future
    where future.execution_id = v_execution.id
      and future.step_status = 'pending'
      and future.live_order > v_step.live_order
  )
  update public.trail_route_execution_steps future
  set eta_at = ordered.next_eta
  from ordered
  where future.id = ordered.id;

  v_variance := round(extract(epoch from (p_now - v_step.planned_arrival_at)) / 60.0)::integer;
  v_variance := greatest(-720, least(720, v_variance));

  select * into v_last
  from public.trail_route_execution_steps
  where execution_id = v_execution.id and step_status in ('current', 'pending')
  order by live_order desc
  limit 1;

  update public.trail_route_executions
  set schedule_variance_minutes = v_variance,
      estimated_finish_at = v_last.eta_at + make_interval(mins => v_last.stay_minutes)
  where id = v_execution.id;

  select * into v_station from public.trail_map_stations where id = v_step.station_id;
  update public.trail_group_traffic
  set station_id = v_step.station_id,
      origin_station_id = null,
      destination_station_id = null,
      marker_x = coalesce(v_station.x_percent, marker_x),
      marker_y = coalesce(v_station.y_percent, marker_y),
      movement_status = 'at_station',
      traffic_signal = case when v_variance > 10 then 'attention' else 'clear' end,
      delay_minutes = greatest(0, v_variance),
      notes = 'Check-in automatico: ' || v_step.label
  where edition_id = v_execution.edition_id and group_id = v_execution.group_id;

  return v_step.id;
end;
$$;

revoke all on function public.forjados_check_in_trail_step_v1(uuid, timestamptz)
  from public, anon;
grant execute on function public.forjados_check_in_trail_step_v1(uuid, timestamptz)
  to authenticated;

create or replace function public.forjados_reorder_trail_execution_v1(
  p_execution_id uuid,
  p_step_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected integer;
  v_base integer;
  v_current public.trail_route_execution_steps%rowtype;
  v_last public.trail_route_execution_steps%rowtype;
  v_anchor timestamptz;
begin
  perform 1 from public.trail_route_executions
  where id = p_execution_id and run_status = 'active'
  for update;
  if not found then raise exception 'Execucao ativa nao encontrada.' using errcode = '22023'; end if;

  select count(*) into v_expected
  from public.trail_route_execution_steps
  where execution_id = p_execution_id and step_status = 'pending';

  if coalesce(array_length(p_step_ids, 1), 0) <> v_expected
     or (select count(distinct item) from unnest(p_step_ids) item) <> v_expected
     or exists (
       select 1 from unnest(p_step_ids) item
       where not exists (
         select 1 from public.trail_route_execution_steps step
         where step.id = item and step.execution_id = p_execution_id and step.step_status = 'pending'
       )
     ) then
    raise exception 'A nova ordem deve conter todas as etapas pendentes exatamente uma vez.' using errcode = '22023';
  end if;

  select coalesce(max(live_order), 0) into v_base
  from public.trail_route_execution_steps
  where execution_id = p_execution_id and step_status <> 'pending';

  update public.trail_route_execution_steps step
  set live_order = v_base + ordered.position::integer
  from unnest(p_step_ids) with ordinality ordered(id, position)
  where step.id = ordered.id and step.execution_id = p_execution_id;

  select * into v_current
  from public.trail_route_execution_steps
  where execution_id = p_execution_id and step_status = 'current'
  limit 1;

  if found then
    v_anchor := greatest(
      clock_timestamp(),
      v_current.checked_in_at + make_interval(mins => v_current.stay_minutes)
    ) + make_interval(mins => v_current.travel_minutes);

    with ordered as (
      select pending.id,
        v_anchor + make_interval(mins => coalesce(
          sum(pending.stay_minutes + pending.travel_minutes) over (
            order by pending.live_order rows between unbounded preceding and 1 preceding
          ), 0
        )::integer) as next_eta
      from public.trail_route_execution_steps pending
      where pending.execution_id = p_execution_id and pending.step_status = 'pending'
    )
    update public.trail_route_execution_steps pending
    set eta_at = ordered.next_eta
    from ordered where pending.id = ordered.id;
  end if;

  select * into v_last
  from public.trail_route_execution_steps
  where execution_id = p_execution_id and step_status in ('current', 'pending')
  order by live_order desc limit 1;

  update public.trail_route_executions
  set estimated_finish_at = v_last.eta_at + make_interval(mins => v_last.stay_minutes)
  where id = p_execution_id;
end;
$$;

revoke all on function public.forjados_reorder_trail_execution_v1(uuid, uuid[])
  from public, anon;
grant execute on function public.forjados_reorder_trail_execution_v1(uuid, uuid[])
  to authenticated;

create or replace function public.forjados_finish_trail_route_v1(
  p_group_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_execution public.trail_route_executions%rowtype;
begin
  select * into v_execution
  from public.trail_route_executions
  where group_id = p_group_id
  for update;
  if not found or v_execution.run_status <> 'active' then
    raise exception 'A trilha deste grupo nao esta ativa.' using errcode = '22023';
  end if;

  update public.trail_route_execution_steps
  set step_status = 'completed', checked_out_at = p_now
  where execution_id = v_execution.id and step_status = 'current';

  update public.trail_route_execution_steps
  set step_status = 'skipped'
  where execution_id = v_execution.id and step_status = 'pending';

  update public.trail_route_executions
  set run_status = 'finished', finished_at = p_now, estimated_finish_at = p_now
  where id = v_execution.id;

  update public.trail_group_traffic
  set movement_status = 'finished', traffic_signal = 'clear', notes = 'Trilha encerrada.'
  where edition_id = v_execution.edition_id and group_id = p_group_id;

  return v_execution.id;
end;
$$;

revoke all on function public.forjados_finish_trail_route_v1(uuid, timestamptz)
  from public, anon;
grant execute on function public.forjados_finish_trail_route_v1(uuid, timestamptz)
  to authenticated;

-- Adiciona o Procurado ao mapa como etapa operacional clicavel.
create or replace function private.forjados_seed_trail_route_plans_v1(p_edition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
begin
  insert into public.trail_map_stations (
    edition_id, station_key, label, short_label, station_kind,
    x_percent, y_percent, display_order, is_active
  ) values (
    p_edition_id, 'wanted', 'Procurado', 'Procurado', 'station',
    59.00, 50.00, 185, true
  )
  on conflict (edition_id, station_key) do update
    set label = excluded.label, short_label = excluded.short_label, is_active = true;

  insert into public.trail_map_connections (
    edition_id, from_station_id, to_station_id, connection_kind, is_bidirectional, display_order
  )
  select p_edition_id, source.id, target.id, edge.kind, true, edge.display_order
  from (values
    ('field', 'wanted', 'connector', 240),
    ('wanted', 'burial', 'connector', 250),
    ('wanted', 'false_baiana', 'connector', 260)
  ) edge(from_key, to_key, kind, display_order)
  join public.trail_map_stations source
    on source.edition_id = p_edition_id and source.station_key = edge.from_key
  join public.trail_map_stations target
    on target.edition_id = p_edition_id and target.station_key = edge.to_key
  on conflict (edition_id, from_station_id, to_station_id) do nothing;

  select (
    ((coalesce(edition.starts_at, now()) at time zone 'America/Sao_Paulo')::date + 1 + time '09:00')
    at time zone 'America/Sao_Paulo'
  ) into v_start
  from public.forjados_editions edition
  where edition.id = p_edition_id;

  insert into public.trail_route_plans (edition_id, group_id, starts_at)
  select p_edition_id, group_unit.id, v_start
  from public.event_service_units group_unit
  where group_unit.edition_id = p_edition_id
    and group_unit.unit_type = 'group'
    and group_unit.is_active is true
  on conflict (edition_id, group_id) do nothing;

  insert into public.trail_route_plan_steps (
    plan_id, edition_id, group_id, station_id, label,
    ideal_order, stay_minutes, travel_minutes, is_break
  )
  select
    plan.id, p_edition_id, group_unit.id, station.id, seed.label,
    seed.step_order, seed.stay_minutes, 0, seed.is_break
  from (values
    ('vermelho', 1, 'field', 'Campo', 5, false),
    ('vermelho', 2, 'wanted', 'Procurado', 10, false),
    ('vermelho', 3, 'burial', 'Sepultamento', 30, false),
    ('vermelho', 4, 'forest', 'Selva', 30, false),
    ('vermelho', 5, 'depression', 'Depressão', 30, false),
    ('vermelho', 6, 'testimony', 'Testemunho', 30, false),
    ('vermelho', 7, 'destroyed_family', 'Família Destruída', 40, false),
    ('vermelho', 8, 'false_baiana', 'Almoço · Falsa Baiana', 40, true),
    ('vermelho', 9, 'false_baiana', 'Falsa Baiana', 30, false),
    ('vermelho', 10, 'beggar', 'Mendigo', 10, false),
    ('vermelho', 11, 'internet_user', 'Internauta', 20, false),
    ('vermelho', 12, 'lukewarm_church', 'Igreja Morna', 25, false),
    ('vermelho', 13, 'restored_family', 'Família Restaurada', 30, false),
    ('vermelho', 14, 'bridge', 'Ponte', 15, false),
    ('vermelho', 15, 'drug_scene', 'Cracolândia', 35, false),
    ('vermelho', 16, 'container', 'Contêiner', 30, false),
    ('vermelho', 17, 'sleeping_church', 'Igreja Adormecida', 30, false),
    ('vermelho', 18, 'mud', 'Lama', 20, false),
    ('vermelho', 19, 'enemy_reveal', 'Revelação do Inimigo', 20, false),

    ('bronze', 1, 'field', 'Campo', 10, false),
    ('bronze', 2, 'container', 'Contêiner', 15, false),
    ('bronze', 3, 'false_baiana', 'Falsa Baiana', 35, false),
    ('bronze', 4, 'destroyed_family', 'Família Destruída', 40, false),
    ('bronze', 5, 'beggar', 'Mendigo', 10, false),
    ('bronze', 6, 'internet_user', 'Internauta', 20, false),
    ('bronze', 7, 'wanted', 'Procurado', 30, false),
    ('bronze', 8, 'burial', 'Sepultamento', 30, false),
    ('bronze', 9, 'burial', 'Almoço · Sepultamento', 40, true),
    ('bronze', 10, 'forest', 'Selva', 30, false),
    ('bronze', 11, 'depression', 'Depressão', 30, false),
    ('bronze', 12, 'testimony', 'Testemunho', 40, false),
    ('bronze', 13, 'lukewarm_church', 'Igreja Morna', 30, false),
    ('bronze', 14, 'restored_family', 'Família Restaurada', 35, false),
    ('bronze', 15, 'bridge', 'Ponte', 25, false),
    ('bronze', 16, 'drug_scene', 'Cracolândia', 35, false),
    ('bronze', 17, 'sleeping_church', 'Igreja Adormecida', 25, false),
    ('bronze', 18, 'mud', 'Lama', 20, false),
    ('bronze', 19, 'enemy_reveal', 'Revelação do Inimigo', 20, false),

    ('prata', 1, 'field', 'Campo', 5, false),
    ('prata', 2, 'false_baiana', 'Falsa Baiana', 25, false),
    ('prata', 3, 'container', 'Contêiner', 10, false),
    ('prata', 4, 'wanted', 'Procurado', 10, false),
    ('prata', 5, 'burial', 'Sepultamento', 25, false),
    ('prata', 6, 'forest', 'Selva', 30, false),
    ('prata', 7, 'depression', 'Depressão', 30, false),
    ('prata', 8, 'testimony', 'Testemunho', 30, false),
    ('prata', 9, 'testimony', 'Almoço · Testemunho', 40, true),
    ('prata', 10, 'destroyed_family', 'Família Destruída', 40, false),
    ('prata', 11, 'sleeping_church', 'Igreja Adormecida', 20, false),
    ('prata', 12, 'beggar', 'Mendigo', 15, false),
    ('prata', 13, 'internet_user', 'Internauta', 20, false),
    ('prata', 14, 'lukewarm_church', 'Igreja Morna', 30, false),
    ('prata', 15, 'restored_family', 'Família Restaurada', 30, false),
    ('prata', 16, 'bridge', 'Ponte', 20, false),
    ('prata', 17, 'drug_scene', 'Cracolândia', 40, false),
    ('prata', 18, 'mud', 'Lama', 20, false),
    ('prata', 19, 'enemy_reveal', 'Revelação do Inimigo', 20, false),

    ('ouro', 1, 'field', 'Campo', 5, false),
    ('ouro', 2, 'destroyed_family', 'Família Destruída', 30, false),
    ('ouro', 3, 'beggar', 'Mendigo', 10, false),
    ('ouro', 4, 'internet_user', 'Internauta', 20, false),
    ('ouro', 5, 'false_baiana', 'Falsa Baiana', 35, false),
    ('ouro', 6, 'wanted', 'Procurado', 10, false),
    ('ouro', 7, 'burial', 'Sepultamento', 30, false),
    ('ouro', 8, 'forest', 'Selva', 30, false),
    ('ouro', 9, 'forest', 'Almoço · Selva', 40, true),
    ('ouro', 10, 'depression', 'Depressão', 40, false),
    ('ouro', 11, 'testimony', 'Testemunho', 30, false),
    ('ouro', 12, 'sleeping_church', 'Igreja Adormecida', 20, false),
    ('ouro', 13, 'container', 'Contêiner', 15, false),
    ('ouro', 14, 'drug_scene', 'Cracolândia', 45, false),
    ('ouro', 15, 'lukewarm_church', 'Igreja Morna', 35, false),
    ('ouro', 16, 'restored_family', 'Família Restaurada', 40, false),
    ('ouro', 17, 'bridge', 'Ponte', 25, false),
    ('ouro', 18, 'mud', 'Lama', 20, false),
    ('ouro', 19, 'enemy_reveal', 'Revelação do Inimigo', 20, false)
  ) seed(group_name, step_order, station_key, label, stay_minutes, is_break)
  join public.event_service_units group_unit
    on group_unit.edition_id = p_edition_id
   and group_unit.unit_type = 'group'
   and lower(group_unit.name) = seed.group_name
  join public.trail_route_plans plan
    on plan.edition_id = p_edition_id and plan.group_id = group_unit.id
  left join public.trail_map_stations station
    on station.edition_id = p_edition_id and station.station_key = seed.station_key
  where not exists (
    select 1 from public.trail_route_plan_steps existing
    where existing.plan_id = plan.id
  );
end;
$$;

revoke all on function private.forjados_seed_trail_route_plans_v1(uuid)
  from public, anon, authenticated;

create or replace function private.forjados_seed_trail_route_plan_on_group_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_type = 'group' and new.is_active is true then
    perform private.forjados_seed_trail_route_plans_v1(new.edition_id);
  end if;
  return new;
end;
$$;

revoke all on function private.forjados_seed_trail_route_plan_on_group_v1()
  from public, anon, authenticated;

create trigger trg_seed_trail_route_plan_on_group
after insert or update of edition_id, unit_type, is_active
on public.event_service_units
for each row execute function private.forjados_seed_trail_route_plan_on_group_v1();

do $$
declare
  v_edition record;
begin
  for v_edition in select id from public.forjados_editions loop
    perform private.forjados_seed_trail_route_plans_v1(v_edition.id);
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'trail_route_executions'
    ) then
      alter publication supabase_realtime add table public.trail_route_executions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'trail_route_execution_steps'
    ) then
      alter publication supabase_realtime add table public.trail_route_execution_steps;
    end if;
  end if;
end;
$$;

comment on table public.trail_route_plans is
  'Planejamento ideal e preservado da rota de cada grupo.';
comment on table public.trail_route_plan_steps is
  'Etapas ideais com permanencia e deslocamento, editadas na aba Grupos.';
comment on table public.trail_route_executions is
  'Execucao viva e independente da rota durante o evento.';
comment on table public.trail_route_execution_steps is
  'Copia reordenavel da rota com check-ins reais e ETAs recalculados.';
