create or replace function public.forjados_purge_expired_account_deletion_receipts_v1()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.account_deletion_receipts
  where retain_until <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.forjados_purge_expired_account_deletion_receipts_v1()
  from public, anon, authenticated;
grant execute on function public.forjados_purge_expired_account_deletion_receipts_v1()
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'forjados-purge-account-deletion-receipts';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'forjados-purge-account-deletion-receipts',
    '31 3 * * *',
    'select public.forjados_purge_expired_account_deletion_receipts_v1();'
  );
end;
$$;
