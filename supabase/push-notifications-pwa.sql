-- =========================================================
-- FORJADOS - PUSH NOTIFICATION REAL PARA PWA
-- Rode este SQL depois de subir o código.
-- Depois configure as secrets e faça deploy da Edge Function.
-- =========================================================

create extension if not exists pgcrypto;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  subscription jsonb not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_push_subscriptions_user_idx
  on public.web_push_subscriptions(user_id);

create index if not exists web_push_subscriptions_active_idx
  on public.web_push_subscriptions(is_active);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "users can view own push subscriptions" on public.web_push_subscriptions;
create policy "users can view own push subscriptions"
on public.web_push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can create own push subscriptions" on public.web_push_subscriptions;
create policy "users can create own push subscriptions"
on public.web_push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own push subscriptions" on public.web_push_subscriptions;
create policy "users can update own push subscriptions"
on public.web_push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());


create table if not exists public.push_notification_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.app_notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_notification_queue_status_idx
  on public.push_notification_queue(status, created_at);

create index if not exists push_notification_queue_user_idx
  on public.push_notification_queue(user_id);

alter table public.push_notification_queue enable row level security;

drop policy if exists "admins can view push queue" on public.push_notification_queue;
create policy "admins can view push queue"
on public.push_notification_queue
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) = true or p.role::text in ('admin', 'director'))
  )
);


create or replace function public.forjados_queue_push_from_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_notification_queue (
    notification_id,
    user_id,
    payload,
    status
  )
  values (
    new.id,
    new.user_id,
    jsonb_build_object(
      'notification_id', new.id,
      'title', coalesce(new.title, 'FORJADOS'),
      'message', coalesce(new.message, ''),
      'type', coalesce(new.type, 'notification'),
      'url', '/?tab=notifications',
      'icon', '/icons/icon-192.png',
      'badge', '/icons/icon-192.png'
    ),
    'queued'
  );

  return new;
end;
$$;

drop trigger if exists trg_forjados_queue_push_from_notification on public.app_notifications;

create trigger trg_forjados_queue_push_from_notification
after insert on public.app_notifications
for each row
execute function public.forjados_queue_push_from_notification();


create or replace function public.forjados_push_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriptions integer;
  v_queue integer;
  v_sent integer;
  v_failed integer;
begin
  select count(*) into v_subscriptions
  from public.web_push_subscriptions
  where is_active = true;

  select count(*) into v_queue
  from public.push_notification_queue
  where status = 'queued';

  select count(*) into v_sent
  from public.push_notification_queue
  where status = 'sent';

  select count(*) into v_failed
  from public.push_notification_queue
  where status = 'failed';

  return jsonb_build_object(
    'active_subscriptions', v_subscriptions,
    'queued', v_queue,
    'sent', v_sent,
    'failed', v_failed,
    'checked_at', now()
  );
end;
$$;

grant execute on function public.forjados_push_status() to authenticated;


create or replace function public.forjados_configure_push_cron(
  p_function_url text,
  p_frequency text default '* * * * *'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id bigint;
begin
  begin
    perform cron.unschedule('forjados-send-push-notifications');
  exception when others then
    null;
  end;

  select cron.schedule(
    'forjados-send-push-notifications',
    p_frequency,
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{"source":"pg_cron"}'::jsonb,
        timeout_milliseconds := 25000
      );
      $job$,
      p_function_url
    )
  ) into v_job_id;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job_id,
    'function_url', p_function_url,
    'frequency', p_frequency
  );
end;
$$;

grant execute on function public.forjados_configure_push_cron(text, text) to authenticated;
