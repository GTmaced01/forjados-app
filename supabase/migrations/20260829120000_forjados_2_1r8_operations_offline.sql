-- FORJADOS 2.1R8 — notificações, cronograma, caronas e presença.
-- Execute somente este arquivo (não há cópia equivalente fora de migrations).

alter table public.app_notifications
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists cleared_at timestamptz,
  add column if not exists receipt_archived_at timestamptz;

create index if not exists app_notifications_visible_user_idx
  on public.app_notifications (user_id, is_pinned desc, created_at desc)
  where cleared_at is null;

create index if not exists app_notifications_receipts_visible_idx
  on public.app_notifications (created_at desc)
  where receipt_archived_at is null and user_id is not null;

create or replace function public.forjados_mark_my_notification_v1(
  p_notification_id uuid,
  p_is_read boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  update public.app_notifications notification
  set
    is_read = coalesce(p_is_read, true),
    read_at = case when coalesce(p_is_read, true) then coalesce(notification.read_at, now()) else null end
  where notification.id = p_notification_id
    and notification.user_id = (select auth.uid())
    and notification.cleared_at is null;

  if not found then
    raise exception 'Notificação não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.forjados_mark_all_my_notifications_read_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  update public.app_notifications notification
  set is_read = true, read_at = coalesce(notification.read_at, now())
  where notification.user_id = (select auth.uid())
    and notification.cleared_at is null
    and notification.is_read is false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.forjados_toggle_my_notification_pin_v1(
  p_notification_id uuid,
  p_is_pinned boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  update public.app_notifications notification
  set
    is_pinned = coalesce(p_is_pinned, false),
    pinned_at = case when coalesce(p_is_pinned, false) then now() else null end
  where notification.id = p_notification_id
    and notification.user_id = (select auth.uid())
    and notification.cleared_at is null;

  if not found then
    raise exception 'Notificação não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.forjados_clear_my_notification_history_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  update public.app_notifications notification
  set cleared_at = now()
  where notification.user_id = (select auth.uid())
    and notification.cleared_at is null
    and notification.is_read is true
    and notification.is_pinned is false;
  get diagnostics v_count = row_count;

  insert into public.audit_logs (
    actor_id, action, entity_type, description, metadata
  ) values (
    (select auth.uid()), 'notifications.history_cleared', 'app_notification',
    'Histórico pessoal de notificações arquivado.', jsonb_build_object('records', v_count)
  );
  return v_count;
end;
$$;

create or replace function public.forjados_clear_notification_receipts_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem arquivar confirmações.' using errcode = '42501';
  end if;

  update public.app_notifications notification
  set receipt_archived_at = now()
  where notification.receipt_archived_at is null
    and notification.user_id is not null
    and notification.is_read is true
    and notification.is_pinned is false;
  get diagnostics v_count = row_count;

  insert into public.audit_logs (
    actor_id, action, entity_type, description, metadata
  ) values (
    (select auth.uid()), 'notifications.receipts_archived', 'app_notification',
    'Histórico de confirmações de leitura arquivado.', jsonb_build_object('records', v_count)
  );
  return v_count;
end;
$$;

drop function if exists public.forjados_list_notification_receipts_v1(integer);
create function public.forjados_list_notification_receipts_v1(p_limit integer default 250)
returns table(
  id uuid, title text, message text, type text, is_read boolean,
  read_at timestamptz, created_at timestamptz, recipient_id uuid,
  recipient_name text, recipient_email text, recipient_role text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem consultar confirmações de leitura.' using errcode = '42501';
  end if;

  return query
  select notification.id, notification.title, notification.message,
    notification.type, notification.is_read, notification.read_at,
    notification.created_at, notification.user_id,
    coalesce(nullif(profile.display_name, ''), profile.email, 'Usuário'),
    coalesce(profile.email, ''), coalesce(profile.role::text, 'member')
  from public.app_notifications notification
  left join public.profiles profile on profile.id = notification.user_id
  where notification.user_id is not null
    and notification.receipt_archived_at is null
  order by notification.created_at desc
  limit least(greatest(coalesce(p_limit, 250), 1), 500);
end;
$$;

revoke all on function public.forjados_mark_my_notification_v1(uuid, boolean) from public, anon;
revoke all on function public.forjados_mark_all_my_notifications_read_v1() from public, anon;
revoke all on function public.forjados_toggle_my_notification_pin_v1(uuid, boolean) from public, anon;
revoke all on function public.forjados_clear_my_notification_history_v1() from public, anon;
revoke all on function public.forjados_clear_notification_receipts_v1() from public, anon;
revoke all on function public.forjados_list_notification_receipts_v1(integer) from public, anon;
grant execute on function public.forjados_mark_my_notification_v1(uuid, boolean) to authenticated;
grant execute on function public.forjados_mark_all_my_notifications_read_v1() to authenticated;
grant execute on function public.forjados_toggle_my_notification_pin_v1(uuid, boolean) to authenticated;
grant execute on function public.forjados_clear_my_notification_history_v1() to authenticated;
grant execute on function public.forjados_clear_notification_receipts_v1() to authenticated;
grant execute on function public.forjados_list_notification_receipts_v1(integer) to authenticated;

alter table public.event_schedule_items
  add column if not exists responsible_id uuid references public.profiles(id) on delete set null;

create index if not exists event_schedule_items_responsible_id_idx
  on public.event_schedule_items (responsible_id)
  where responsible_id is not null and deleted_at is null;

create or replace function public.forjados_list_schedule_people_v1()
returns table(user_id uuid, display_name text, email text, role text, primary_team text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem montar o cronograma.' using errcode = '42501';
  end if;
  return query
  select profile.id,
    coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email),
    profile.email, profile.role::text, coalesce(profile.primary_team, '')
  from public.profiles profile
  where profile.inscription_status::text = 'approved'
    and profile.is_deleted is false
  order by coalesce(nullif(profile.display_name, ''), profile.email);
end;
$$;

revoke all on function public.forjados_list_schedule_people_v1() from public, anon;
grant execute on function public.forjados_list_schedule_people_v1() to authenticated;

create table if not exists public.ride_settings (
  singleton boolean primary key default true check (singleton),
  points_mode text not null default 'per_passenger' check (points_mode in ('per_passenger', 'fixed')),
  points_per_passenger integer not null default 50 check (points_per_passenger between 0 and 100000),
  fixed_points integer not null default 100 check (fixed_points between 0 and 100000),
  event_address text not null default '' check (char_length(event_address) <= 500),
  event_map_url text not null default '' check (char_length(event_map_url) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.ride_settings (singleton) values (true)
on conflict (singleton) do nothing;

alter table public.ride_settings enable row level security;
revoke all on table public.ride_settings from public, anon, authenticated;
grant select on table public.ride_settings to authenticated;
grant all on table public.ride_settings to service_role;

drop policy if exists ride_settings_select_authenticated on public.ride_settings;
create policy ride_settings_select_authenticated on public.ride_settings
for select to authenticated using ((select auth.uid()) is not null);

alter table public.rides
  add column if not exists estimated_points integer not null default 0,
  add column if not exists awarded_points integer not null default 0,
  add column if not exists points_rule_snapshot jsonb not null default '{}'::jsonb;

create or replace function public.forjados_prepare_ride_points_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.ride_settings%rowtype;
begin
  select * into v_settings from public.ride_settings where singleton is true;
  if v_settings.points_mode = 'fixed' then
    new.estimated_points := v_settings.fixed_points;
  else
    new.estimated_points := greatest(new.total_seats, 0) * v_settings.points_per_passenger;
  end if;
  new.points_rule_snapshot := jsonb_build_object(
    'mode', v_settings.points_mode,
    'points_per_passenger', v_settings.points_per_passenger,
    'fixed_points', v_settings.fixed_points
  );
  return new;
end;
$$;

revoke all on function public.forjados_prepare_ride_points_v1() from public, anon, authenticated;

drop trigger if exists rides_prepare_points on public.rides;
create trigger rides_prepare_points
before insert or update of total_seats on public.rides
for each row execute function public.forjados_prepare_ride_points_v1();

update public.rides ride
set
  estimated_points = case
    when settings.points_mode = 'fixed' then settings.fixed_points
    else greatest(ride.total_seats, 0) * settings.points_per_passenger
  end,
  points_rule_snapshot = jsonb_build_object(
    'mode', settings.points_mode,
    'points_per_passenger', settings.points_per_passenger,
    'fixed_points', settings.fixed_points
  )
from public.ride_settings settings
where settings.singleton is true
  and ride.completed_points_awarded is false;

create or replace function public.forjados_update_ride_settings_v1(
  p_points_mode text,
  p_points_per_passenger integer,
  p_fixed_points integer,
  p_event_address text,
  p_event_map_url text default ''
)
returns public.ride_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.ride_settings;
begin
  if not (select private.forjados_has_any_role_v1(array['admin'])) then
    raise exception 'Apenas Administradores podem alterar a configuração de caronas.' using errcode = '42501';
  end if;
  if p_points_mode not in ('per_passenger', 'fixed') then
    raise exception 'Regra de pontuação inválida.';
  end if;
  if coalesce(p_points_per_passenger, -1) not between 0 and 100000
    or coalesce(p_fixed_points, -1) not between 0 and 100000 then
    raise exception 'Pontuação inválida.';
  end if;

  update public.ride_settings
  set points_mode = p_points_mode,
      points_per_passenger = p_points_per_passenger,
      fixed_points = p_fixed_points,
      event_address = left(trim(coalesce(p_event_address, '')), 500),
      event_map_url = left(trim(coalesce(p_event_map_url, '')), 1000),
      updated_by = (select auth.uid()), updated_at = now()
  where singleton is true
  returning * into v_result;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata)
  values ((select auth.uid()), 'ride.settings_updated', 'ride_settings', 'singleton',
    'Configuração de caronas atualizada.', to_jsonb(v_result));
  return v_result;
end;
$$;

revoke all on function public.forjados_update_ride_settings_v1(text, integer, integer, text, text) from public, anon;
grant execute on function public.forjados_update_ride_settings_v1(text, integer, integer, text, text) to authenticated;

create or replace function public.confirm_ride_completion(
  p_ride_id uuid,
  p_completed boolean,
  p_confirmed_passenger_count integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ride public.rides%rowtype;
  v_confirmer public.profiles%rowtype;
  v_driver public.profiles%rowtype;
  v_points integer;
  v_count integer;
  v_mode text;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin ou Diretoria podem confirmar caronas.' using errcode = '42501';
  end if;

  select * into v_confirmer from public.profiles where id = (select auth.uid());
  select * into v_ride from public.rides where id = p_ride_id and deleted_at is null for update;
  if not found then raise exception 'Carona não encontrada.'; end if;
  if v_ride.completed_points_awarded is true then raise exception 'Essa carona já teve os pontos lançados.'; end if;

  select count(*) into v_count from public.ride_passengers
  where ride_id = p_ride_id and status = 'confirmed';
  if p_confirmed_passenger_count is not null then v_count := p_confirmed_passenger_count; end if;
  if v_count < 0 or v_count > v_ride.total_seats then raise exception 'Quantidade de passageiros inválida.'; end if;

  if p_completed is false then
    update public.rides set status = 'not_completed', confirmed_passenger_count = 0,
      completed_points_awarded = false, awarded_points = 0,
      confirmed_by = (select auth.uid()), confirmed_at = now(), updated_at = now()
    where id = p_ride_id;
    return;
  end if;

  v_mode := coalesce(v_ride.points_rule_snapshot->>'mode', 'per_passenger');
  if v_mode = 'fixed' then
    v_points := greatest(coalesce((v_ride.points_rule_snapshot->>'fixed_points')::integer, 0), 0);
  else
    v_points := v_count * greatest(coalesce((v_ride.points_rule_snapshot->>'points_per_passenger')::integer, 0), 0);
  end if;

  update public.rides set status = 'completed', confirmed_passenger_count = v_count,
    completed_points_awarded = true, awarded_points = v_points,
    confirmed_by = (select auth.uid()), confirmed_at = now(), updated_at = now()
  where id = p_ride_id;

  if v_points > 0 then
    select * into v_driver from public.profiles where id = v_ride.driver_id for update;
    update public.profiles set points = points + v_points, updated_at = now() where id = v_ride.driver_id;
    insert into public.point_transactions (
      user_id, member_id, amount, reason, granted_by, granted_by_name, source_type, source_id
    ) values (
      v_ride.driver_id, coalesce(v_driver.member_id, ''), v_points,
      case when v_mode = 'fixed'
        then 'Carona concluída — pontuação fixa validada'
        else 'Carona concluída — ' || v_count || ' passageiro(s) confirmado(s)' end,
      (select auth.uid()), coalesce(v_confirmer.display_name, v_confirmer.email), 'ride', p_ride_id
    );
    insert into public.app_notifications (user_id, title, message, type)
    values (v_ride.driver_id, 'Pontos de carona aprovados',
      v_points || ' ponto(s) foram creditados após a validação da carona.', 'ride');
  end if;
end;
$$;

revoke all on function public.confirm_ride_completion(uuid, boolean, integer) from public, anon;
grant execute on function public.confirm_ride_completion(uuid, boolean, integer) to authenticated;

alter table public.retreat_participations
  add column if not exists attendance_status text not null default 'confirmed',
  add column if not exists attendance_updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists attendance_updated_at timestamptz,
  add column if not exists attendance_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.retreat_participations'::regclass
      and conname = 'retreat_participations_attendance_status_check'
  ) then
    alter table public.retreat_participations
      add constraint retreat_participations_attendance_status_check
      check (attendance_status in ('confirmed', 'present', 'absent', 'excused'));
  end if;
end $$;

create index if not exists retreat_participations_attendance_idx
  on public.retreat_participations (edition_id, attendance_status);

create index if not exists retreat_participations_attendance_updated_by_idx
  on public.retreat_participations (attendance_updated_by)
  where attendance_updated_by is not null;

create or replace function public.forjados_list_attendance_v1(p_edition_id uuid default null)
returns table(
  participation_id uuid, user_id uuid, user_name text, user_email text,
  edition_id uuid, retreat_title text, attendance_status text,
  attendance_notes text, attendance_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edition_id uuid := p_edition_id;
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem consultar presença.' using errcode = '42501';
  end if;
  if v_edition_id is null then
    select event.id into v_edition_id
    from public.retreat_events event
    where event.active is true order by event.start_date desc limit 1;
  end if;
  return query
  select participation.id, profile.id,
    coalesce(nullif(profile.display_name, ''), profile.email), profile.email,
    participation.edition_id, participation.retreat_title,
    participation.attendance_status, coalesce(participation.attendance_notes, ''),
    participation.attendance_updated_at
  from public.retreat_participations participation
  join public.profiles profile on profile.id = participation.user_id
  where (v_edition_id is null or participation.edition_id = v_edition_id)
    and profile.is_deleted is false
  order by coalesce(nullif(profile.display_name, ''), profile.email);
end;
$$;

create or replace function public.forjados_update_attendance_v1(
  p_participation_id uuid,
  p_attendance_status text,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.forjados_has_any_role_v1(array['admin'])) then
    raise exception 'Apenas Administradores podem alterar a presença.' using errcode = '42501';
  end if;
  if p_attendance_status not in ('confirmed', 'present', 'absent', 'excused') then
    raise exception 'Status de presença inválido.';
  end if;
  update public.retreat_participations
  set attendance_status = p_attendance_status,
      attendance_notes = nullif(left(trim(coalesce(p_notes, '')), 1000), ''),
      attendance_updated_by = (select auth.uid()), attendance_updated_at = now()
  where id = p_participation_id;
  if not found then raise exception 'Participação não encontrada.'; end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata)
  values ((select auth.uid()), 'attendance.updated', 'retreat_participation', p_participation_id::text,
    'Status de presença alterado manualmente.', jsonb_build_object('status', p_attendance_status, 'notes', p_notes));
end;
$$;

revoke all on function public.forjados_list_attendance_v1(uuid) from public, anon;
revoke all on function public.forjados_update_attendance_v1(uuid, text, text) from public, anon;
grant execute on function public.forjados_list_attendance_v1(uuid) to authenticated;
grant execute on function public.forjados_update_attendance_v1(uuid, text, text) to authenticated;

comment on column public.app_notifications.cleared_at is 'Soft archive da caixa pessoal; preserva auditoria e push.';
comment on column public.app_notifications.receipt_archived_at is 'Soft archive da visão gerencial de confirmações.';
comment on table public.ride_settings is 'Configuração singleton da pontuação e do destino oficial das caronas.';
comment on column public.retreat_participations.attendance_status is 'Presença física, separada da confirmação financeira.';
