-- Browser sessions must not execute scheduled message processing.
revoke execute on function public.forjados_process_due_automated_messages() from authenticated;
grant execute on function public.forjados_process_due_automated_messages() to service_role;

create or replace function public.forjados_automated_messages_cron_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean := false;
  v_active boolean := false;
  v_jobid integer := null;
begin
  if not public.forjados_can_manage_automation() then
    raise exception 'Sem permissão para visualizar a rotina de automações.' using errcode = '42501';
  end if;

  begin
    select exists(
      select 1 from cron.job where jobname = 'forjados-process-automated-messages'
    ) into v_exists;

    select jobid, active
    into v_jobid, v_active
    from cron.job
    where jobname = 'forjados-process-automated-messages'
    order by jobid desc
    limit 1;
  exception when others then
    v_exists := false;
    v_active := false;
    v_jobid := null;
  end;

  return jsonb_build_object(
    'mode', 'pg_cron',
    'job_name', 'forjados-process-automated-messages',
    'job_exists', v_exists,
    'active', coalesce(v_active, false),
    'job_id', v_jobid,
    'frequency', 'a cada 1 minuto',
    'checked_at', now()
  );
end;
$$;

revoke execute on function public.forjados_automated_messages_cron_status() from public, anon;
grant execute on function public.forjados_automated_messages_cron_status() to authenticated, service_role;

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
  if not public.forjados_can_manage_automation() then
    raise exception 'Sem permissão para visualizar o status de push.' using errcode = '42501';
  end if;

  select count(*) into v_subscriptions
  from public.web_push_subscriptions
  where is_active = true;

  select count(*) into v_queue
  from public.push_notification_queue
  where status in ('queued', 'processing');

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

revoke execute on function public.forjados_push_status() from public, anon;
grant execute on function public.forjados_push_status() to authenticated, service_role;

create or replace function public.forjados_list_retreat_birthdays_v1()
returns setof public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissão para visualizar aniversariantes.' using errcode = '42501';
  end if;

  select start_date::date, coalesce(end_date::date, start_date::date)
  into v_start, v_end
  from public.retreat_events
  where active = true
  order by start_date asc
  limit 1;

  if v_start is null then
    return;
  end if;

  return query
  select p.*
  from public.profiles p
  where p.birth_date is not null
    and coalesce(p.is_deleted, false) = false
    and p.inscription_status::text = 'approved'
    and make_date(
      extract(year from v_start)::int,
      extract(month from p.birth_date)::int,
      extract(day from p.birth_date)::int
    ) between v_start and v_end
  order by p.display_name;
end;
$$;

revoke execute on function public.forjados_list_retreat_birthdays_v1() from public, anon;
grant execute on function public.forjados_list_retreat_birthdays_v1() to authenticated, service_role;
