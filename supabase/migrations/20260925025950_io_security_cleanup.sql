-- FORJADOS maintenance applied remotely as migration 20260925025950:
-- reduce recurring Disk I/O, keep cron history bounded,
-- close overly broad read policies, and remove advisor findings that are safe
-- to correct without changing the app's intended authorization model.

-- Stop the two one-minute jobs before clearing their disposable run history.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'forjados-process-automated-messages',
      'forjados-send-push-notifications',
      'forjados-automation-tick',
      'forjados-cron-history-retention'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

-- These tables contain disposable infrastructure history, not application data.
-- TRUNCATE releases the existing 200+ MB of bloat immediately and avoids a
-- large DELETE/VACUUM cycle on the constrained instance.
truncate table cron.job_run_details;
truncate table net._http_response;

-- Process scheduled messages first, then invoke the Edge Function only if the
-- push queue has work. This removes the empty HTTP request made every minute.
create or replace function private.forjados_run_automation_tick_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_result jsonb;
  v_has_push_work boolean := false;
  v_request_id bigint := null;
begin
  select public.forjados_process_due_automated_messages()
  into v_message_result;

  select exists (
    select 1
    from public.push_notification_queue queue_item
    where queue_item.attempts < 5
      and (
        queue_item.status = 'queued'
        or (
          queue_item.status = 'processing'
          and queue_item.updated_at < now() - interval '5 minutes'
        )
      )
  ) into v_has_push_work;

  if v_has_push_work then
    select net.http_post(
      url := 'https://szmujymzcifxnlladktn.supabase.co/functions/v1/send-push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-forjados-cron-secret', (
          select secret.secret_value
          from public.internal_runtime_secrets secret
          where secret.secret_name = 'push_cron'
          limit 1
        )
      ),
      body := jsonb_build_object('source', 'pg_cron'),
      timeout_milliseconds := 25000
    ) into v_request_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'messages', coalesce(v_message_result, '{}'::jsonb),
    'push_requested', v_request_id is not null,
    'request_id', v_request_id,
    'processed_at', now()
  );
end;
$$;

revoke all on function private.forjados_run_automation_tick_v1()
from public, anon, authenticated;
grant execute on function private.forjados_run_automation_tick_v1()
to service_role;

select cron.schedule(
  'forjados-automation-tick',
  '* * * * *',
  'select private.forjados_run_automation_tick_v1();'
);

-- pg_cron does not prune job_run_details automatically. Keep seven days,
-- enough for diagnosis without allowing the table to grow indefinitely.
select cron.schedule(
  'forjados-cron-history-retention',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days';$$
);

-- Cover the only foreign key reported by the performance advisor.
create index if not exists service_scale_schedules_service_unit_id_idx
  on public.service_scale_schedules (service_unit_id);

-- Remove broad legacy policies. Their narrower replacements already preserve
-- the intended manager access while preventing soft-deleted/unpublished rows
-- from being exposed to every authenticated user.
drop policy if exists "admins can manage automated messages"
  on public.automated_messages;

drop policy if exists points_store_products_write_admin_director
  on public.points_store_products;
drop policy if exists points_store_products_select
  on public.points_store_products;

drop policy if exists public_panel_write_admin_director
  on public.public_panel_items;
drop policy if exists public_panel_select_authenticated
  on public.public_panel_items;
alter policy public_panel_select_active
  on public.public_panel_items
  using (
    (is_active = true and deleted_at is null)
    or current_user_can_manage()
  );

drop policy if exists shirts_admin_director_write
  on public.shirts;
drop policy if exists shirts_select_all
  on public.shirts;

-- Replace ALL policies with action-specific manager policies so SELECT remains
-- governed by the existing active/public visibility rules.
drop policy if exists "Loja 2.0 - admins gerenciam fotos"
  on public.points_store_product_images;
create policy points_store_product_images_insert_manager
  on public.points_store_product_images for insert to authenticated
  with check (forjados_is_admin_or_director());
create policy points_store_product_images_update_manager
  on public.points_store_product_images for update to authenticated
  using (forjados_is_admin_or_director())
  with check (forjados_is_admin_or_director());
create policy points_store_product_images_delete_manager
  on public.points_store_product_images for delete to authenticated
  using (forjados_is_admin_or_director());

drop policy if exists "Loja de Camisas 2.0 - admins gerenciam fotos"
  on public.shirt_images;
create policy shirt_images_insert_manager
  on public.shirt_images for insert to authenticated
  with check (forjados_is_admin_or_director());
create policy shirt_images_update_manager
  on public.shirt_images for update to authenticated
  using (forjados_is_admin_or_director())
  with check (forjados_is_admin_or_director());
create policy shirt_images_delete_manager
  on public.shirt_images for delete to authenticated
  using (forjados_is_admin_or_director());

drop policy if exists "admins can manage events"
  on public.retreat_events;
create policy retreat_events_insert_manager
  on public.retreat_events for insert to authenticated
  with check (forjados_is_admin_v5());
create policy retreat_events_update_manager
  on public.retreat_events for update to authenticated
  using (forjados_is_admin_v5())
  with check (forjados_is_admin_v5());
create policy retreat_events_delete_manager
  on public.retreat_events for delete to authenticated
  using (forjados_is_admin_v5());

drop policy if exists service_assignments_manage_admin_director
  on public.service_assignments;
create policy service_assignments_insert_manager
  on public.service_assignments for insert to authenticated
  with check (can_manage_service_scale());
create policy service_assignments_update_manager
  on public.service_assignments for update to authenticated
  using (can_manage_service_scale())
  with check (can_manage_service_scale());
create policy service_assignments_delete_manager
  on public.service_assignments for delete to authenticated
  using (can_manage_service_scale());

drop policy if exists service_people_manage_admin_director
  on public.service_people;
create policy service_people_insert_manager
  on public.service_people for insert to authenticated
  with check (can_manage_service_scale());
create policy service_people_update_manager
  on public.service_people for update to authenticated
  using (can_manage_service_scale())
  with check (can_manage_service_scale());
create policy service_people_delete_manager
  on public.service_people for delete to authenticated
  using (can_manage_service_scale());

drop policy if exists service_schedules_manage_admin_director
  on public.service_schedules;
create policy service_schedules_insert_manager
  on public.service_schedules for insert to authenticated
  with check (can_manage_service_scale());
create policy service_schedules_update_manager
  on public.service_schedules for update to authenticated
  using (can_manage_service_scale())
  with check (can_manage_service_scale());
create policy service_schedules_delete_manager
  on public.service_schedules for delete to authenticated
  using (can_manage_service_scale());

-- The legacy products table is still retained for compatibility, but its ALL
-- policy need not run for every SELECT.
drop policy if exists products_write_admin_director
  on public.products;
create policy products_insert_manager
  on public.products for insert to authenticated
  with check (is_admin() or is_director_or_admin());
create policy products_update_manager
  on public.products for update to authenticated
  using (is_admin() or is_director_or_admin())
  with check (is_admin() or is_director_or_admin());
create policy products_delete_manager
  on public.products for delete to authenticated
  using (is_admin() or is_director_or_admin());
