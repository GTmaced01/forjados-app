-- FORJADOS 2.1R7
-- Cronograma por edição, alertas gerenciais e confirmação de leitura.

create table public.event_schedule_items (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.forjados_editions(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '',
  activity_type text not null default 'activity',
  team_names text[] not null default '{}'::text[],
  responsible text not null default '',
  is_published boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint event_schedule_items_title_check
    check (char_length(trim(title)) between 3 and 160),
  constraint event_schedule_items_description_check
    check (char_length(description) <= 2000),
  constraint event_schedule_items_location_check
    check (char_length(location) <= 180),
  constraint event_schedule_items_responsible_check
    check (char_length(responsible) <= 180),
  constraint event_schedule_items_time_check
    check (ends_at is null or ends_at > starts_at),
  constraint event_schedule_items_activity_type_check
    check (activity_type in ('activity', 'worship', 'meal', 'service', 'transport', 'break', 'other'))
);

alter table public.event_schedule_items enable row level security;

revoke all on table public.event_schedule_items from public, anon;
grant select, insert, update on table public.event_schedule_items to authenticated;
grant select, insert, update, delete on table public.event_schedule_items to service_role;

create index event_schedule_items_edition_start_idx
  on public.event_schedule_items (edition_id, starts_at)
  where deleted_at is null;

create index event_schedule_items_published_start_idx
  on public.event_schedule_items (starts_at)
  where is_published = true and deleted_at is null;

create policy event_schedule_items_select
on public.event_schedule_items
for select
to authenticated
using (
  deleted_at is null
  and (
    is_published = true
    or (select private.forjados_has_any_role_v1(array['admin', 'director']))
  )
);

create policy event_schedule_items_insert_manager
on public.event_schedule_items
for insert
to authenticated
with check (
  (select private.forjados_has_any_role_v1(array['admin', 'director']))
  and created_by = (select auth.uid())
  and deleted_at is null
);

create policy event_schedule_items_update_manager
on public.event_schedule_items
for update
to authenticated
using ((select private.forjados_has_any_role_v1(array['admin', 'director'])))
with check ((select private.forjados_has_any_role_v1(array['admin', 'director'])));

create trigger set_event_schedule_items_updated_at
before update on public.event_schedule_items
for each row execute function public.set_updated_at();

alter table public.app_notifications
  add column read_at timestamptz;

create or replace function private.forjados_set_notification_read_at_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_read = true and old.is_read = false then
    new.read_at := now();
  elsif new.is_read = false then
    new.read_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.forjados_set_notification_read_at_v1() from public, anon, authenticated;

create trigger trg_forjados_notification_read_at
before update of is_read on public.app_notifications
for each row execute function private.forjados_set_notification_read_at_v1();

create index app_notifications_read_receipts_idx
  on public.app_notifications (created_at desc, user_id)
  where is_read = true;

create or replace function public.forjados_list_notification_receipts_v1(
  p_limit integer default 250
)
returns table (
  id uuid,
  title text,
  message text,
  type text,
  is_read boolean,
  read_at timestamptz,
  created_at timestamptz,
  recipient_id uuid,
  recipient_name text,
  recipient_email text,
  recipient_role text
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
    raise exception 'Apenas Admin e Diretoria podem consultar confirmações de leitura.'
      using errcode = '42501';
  end if;

  return query
  select
    notification.id,
    notification.title,
    notification.message,
    notification.type,
    notification.is_read,
    notification.read_at,
    notification.created_at,
    notification.user_id,
    coalesce(nullif(profile.display_name, ''), profile.email, 'Usuário'),
    coalesce(profile.email, ''),
    coalesce(profile.role::text, 'member')
  from public.app_notifications notification
  left join public.profiles profile on profile.id = notification.user_id
  where notification.user_id is not null
  order by notification.created_at desc
  limit least(greatest(coalesce(p_limit, 250), 1), 500);
end;
$$;

revoke all on function public.forjados_list_notification_receipts_v1(integer) from public, anon;
grant execute on function public.forjados_list_notification_receipts_v1(integer) to authenticated;

create or replace function private.forjados_notify_management_on_action_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text := 'Um participante';
  v_title text;
  v_message text;
  v_type text;
begin
  if tg_table_name = 'shirt_orders' then
    select coalesce(nullif(profile.display_name, ''), profile.email, v_actor_name)
      into v_actor_name
    from public.profiles profile
    where profile.id = new.user_id;
    v_title := 'Novo pedido na Loja de Camisas';
    v_message := format('%s criou um pedido no valor de R$ %s.', v_actor_name, new.total_price);
    v_type := 'shirt_order_created';
  elsif tg_table_name = 'points_redemptions' then
    v_actor_name := coalesce(nullif(new.user_name, ''), v_actor_name);
    v_title := 'Novo resgate na Loja de Honra';
    v_message := format('%s resgatou “%s” por %s pontos.', v_actor_name, new.product_name, new.points_cost);
    v_type := 'points_redemption_created';
  elsif tg_table_name = 'offers' then
    v_actor_name := coalesce(nullif(new.user_name, ''), v_actor_name);
    v_title := 'Nova oferta registrada';
    v_message := format('%s registrou uma oferta de R$ %s para %s.', v_actor_name, new.amount, new.objective);
    v_type := 'offer_created';
  elsif tg_table_name = 'payment_receipts' then
    v_actor_name := coalesce(nullif(new.user_name, ''), v_actor_name);
    v_title := case when new.type = 'shirt_order'
      then 'Novo comprovante de pedido'
      else 'Novo comprovante de inscrição'
    end;
    v_message := format('%s enviou um comprovante para análise.', v_actor_name);
    v_type := 'payment_receipt_created';
  else
    return new;
  end if;

  insert into public.app_notifications (user_id, title, message, type)
  select profile.id, v_title, v_message, v_type
  from public.profiles profile
  where coalesce(profile.is_deleted, false) = false
    and profile.inscription_status::text = 'approved'
    and (coalesce(profile.is_admin, false) or profile.role::text in ('admin', 'director'));

  return new;
end;
$$;

revoke all on function private.forjados_notify_management_on_action_v1() from public, anon, authenticated;

create trigger trg_forjados_notify_shirt_order_created
after insert on public.shirt_orders
for each row execute function private.forjados_notify_management_on_action_v1();

create trigger trg_forjados_notify_points_redemption_created
after insert on public.points_redemptions
for each row execute function private.forjados_notify_management_on_action_v1();

create trigger trg_forjados_notify_offer_created
after insert on public.offers
for each row execute function private.forjados_notify_management_on_action_v1();

create trigger trg_forjados_notify_payment_receipt_created
after insert on public.payment_receipts
for each row execute function private.forjados_notify_management_on_action_v1();

create or replace function private.forjados_handle_schedule_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  v_action := case
    when tg_op = 'INSERT' then 'schedule_item_created'
    when new.deleted_at is not null and old.deleted_at is null then 'schedule_item_archived'
    when new.is_published = true and old.is_published = false then 'schedule_item_published'
    else 'schedule_item_updated'
  end;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    (select auth.uid()),
    v_action,
    'event_schedule_item',
    new.id::text,
    format('Cronograma: %s.', new.title),
    jsonb_build_object(
      'edition_id', new.edition_id,
      'starts_at', new.starts_at,
      'is_published', new.is_published
    )
  );

  if new.is_published = true
     and new.deleted_at is null
     and (tg_op = 'INSERT' or old.is_published = false) then
    insert into public.app_notifications (user_id, title, message, type)
    select
      profile.id,
      'Cronograma atualizado',
      format('“%s” foi adicionada à programação. Consulte o Cronograma.', new.title),
      'schedule_published'
    from public.profiles profile
    where coalesce(profile.is_deleted, false) = false
      and profile.inscription_status::text = 'approved';
  end if;

  return new;
end;
$$;

revoke all on function private.forjados_handle_schedule_change_v1() from public, anon, authenticated;

create trigger trg_forjados_schedule_change
after insert or update on public.event_schedule_items
for each row execute function private.forjados_handle_schedule_change_v1();

comment on table public.event_schedule_items is
  'Programação oficial de cada edição do FORJADOS, com publicação controlada por Admin/Diretoria.';

comment on column public.app_notifications.read_at is
  'Horário em que o destinatário confirmou a leitura da notificação.';
