-- Security hardening applied to the production FORJADOS-app project on 2026-08-21.
-- Runtime secrets are generated inside PostgreSQL and are never committed.

create table if not exists public.internal_runtime_secrets (
  secret_name text primary key,
  secret_value text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

alter table public.internal_runtime_secrets enable row level security;
revoke all on table public.internal_runtime_secrets from public, anon, authenticated;
grant select on table public.internal_runtime_secrets to service_role;

insert into public.internal_runtime_secrets (secret_name, secret_value)
select
  'push_cron',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (
  select 1
  from public.internal_runtime_secrets
  where secret_name = 'push_cron'
);

-- SECURITY DEFINER routines must not inherit PostgreSQL's default PUBLIC EXECUTE.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
  end loop;
end
$$;

-- Internal helpers / trigger functions must not be callable directly by app users.
revoke execute on function public.create_notification(uuid,text,text,text) from authenticated;
revoke execute on function public.ensure_service_scale_person(uuid) from authenticated;
revoke execute on function public.forjados_assign_member_id() from authenticated;
revoke execute on function public.forjados_confirm_participation_from_payment() from authenticated;
revoke execute on function public.forjados_queue_push_from_notification() from authenticated;
revoke execute on function public.get_actor_email(uuid) from authenticated;
revoke execute on function public.get_actor_name(uuid) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.handle_payment_receipt_review_notify() from authenticated;
revoke execute on function public.handle_point_transaction_notify() from authenticated;
revoke execute on function public.handle_profile_approved_for_scale() from authenticated;
revoke execute on function public.handle_profile_status_notify() from authenticated;
revoke execute on function public.handle_public_panel_notify() from authenticated;

-- Pin search_path for generic trigger helpers.
alter function public.set_service_scale_updated_at() set search_path = public;
alter function public.set_updated_at() set search_path = public;

-- Atomic queue claiming prevents duplicate push delivery from overlapping workers.
alter table public.push_notification_queue
  drop constraint if exists push_notification_queue_status_check;

alter table public.push_notification_queue
  add constraint push_notification_queue_status_check
  check (
    status = any (
      array[
        'queued'::text,
        'processing'::text,
        'sent'::text,
        'failed'::text,
        'skipped'::text
      ]
    )
  );

create or replace function public.forjados_claim_push_queue(p_limit integer default 60)
returns table (
  id uuid,
  user_id uuid,
  payload jsonb,
  attempts integer
)
language sql
security definer
set search_path = public
as $$
  with picked as (
    select q.id
    from public.push_notification_queue q
    where q.attempts < 5
      and (
        q.status = 'queued'
        or (q.status = 'processing' and q.updated_at < now() - interval '5 minutes')
      )
    order by q.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 60), 100))
  )
  update public.push_notification_queue q
  set status = 'processing',
      updated_at = now()
  from picked
  where q.id = picked.id
  returning q.id, q.user_id, q.payload, q.attempts;
$$;

revoke all on function public.forjados_claim_push_queue(integer) from public, anon, authenticated;
grant execute on function public.forjados_claim_push_queue(integer) to service_role;

-- Maintenance endpoint is fixed and callable only by authorized app administrators.
create or replace function public.forjados_configure_push_cron(
  p_function_url text,
  p_frequency text default '* * * * *'::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id bigint;
  v_function_url constant text := 'https://szmujymzcifxnlladktn.supabase.co/functions/v1/send-push-notifications';
begin
  if not public.forjados_can_manage_automation() then
    raise exception 'Sem permissão para configurar a rotina de push.' using errcode = '42501';
  end if;

  if coalesce(p_function_url, '') <> v_function_url then
    raise exception 'Endpoint de push inválido.' using errcode = '22023';
  end if;

  if coalesce(p_frequency, '') <> '* * * * *' then
    raise exception 'A frequência de push é fixa em um minuto.' using errcode = '22023';
  end if;

  begin
    perform cron.unschedule('forjados-send-push-notifications');
  exception when others then
    null;
  end;

  select cron.schedule(
    'forjados-send-push-notifications',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://szmujymzcifxnlladktn.supabase.co/functions/v1/send-push-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-forjados-cron-secret', (
            select secret_value
            from public.internal_runtime_secrets
            where secret_name = 'push_cron'
          )
        ),
        body := '{"source":"pg_cron"}'::jsonb,
        timeout_milliseconds := 25000
      );
    $job$
  ) into v_job_id;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job_id,
    'function_url', v_function_url,
    'frequency', '* * * * *'
  );
end;
$$;

revoke all on function public.forjados_configure_push_cron(text,text) from public, anon;
grant execute on function public.forjados_configure_push_cron(text,text) to authenticated, service_role;

-- Install the authenticated cron invocation.
do $$
begin
  begin
    perform cron.unschedule('forjados-send-push-notifications');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'forjados-send-push-notifications',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://szmujymzcifxnlladktn.supabase.co/functions/v1/send-push-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-forjados-cron-secret', (
            select secret_value
            from public.internal_runtime_secrets
            where secret_name = 'push_cron'
          )
        ),
        body := '{"source":"pg_cron"}'::jsonb,
        timeout_milliseconds := 25000
      );
    $job$
  );
end
$$;
