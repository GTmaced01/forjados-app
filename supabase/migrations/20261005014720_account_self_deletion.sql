create table if not exists public.account_deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  retain_until timestamptz not null default (now() + interval '5 years'),
  retained_summary jsonb not null default '{}'::jsonb,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.account_deletion_receipts is
  'Comprovantes técnicos sem identificadores diretos, mantidos temporariamente para demonstrar o atendimento de pedidos de exclusão.';

alter table public.account_deletion_receipts enable row level security;

revoke all on table public.account_deletion_receipts from public, anon, authenticated;
grant select, insert, update, delete on table public.account_deletion_receipts to service_role;

create index if not exists account_deletion_receipts_retain_until_idx
  on public.account_deletion_receipts (retain_until);

create or replace function public.forjados_prepare_account_deletion_v1(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_storage_objects jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if p_user_id is null then
    raise exception 'Usuário inválido.';
  end if;

  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Operação restrita ao serviço de exclusão.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Conta não encontrada.';
  end if;

  select jsonb_build_object(
    'enrollments', (
      select count(*) from public.edition_enrollments where user_id = p_user_id
    ),
    'approved_payments', (
      select count(*) from public.payment_receipts
      where user_id = p_user_id and status::text = 'approved'
    ),
    'approved_payment_total', (
      select coalesce(sum(amount), 0) from public.payment_receipts
      where user_id = p_user_id and status::text = 'approved'
    ),
    'shirt_orders', (
      select count(*) from public.shirt_orders where user_id = p_user_id
    ),
    'shirt_order_total', (
      select coalesce(sum(total_price), 0) from public.shirt_orders where user_id = p_user_id
    ),
    'approved_offers', (
      select count(*) from public.offers
      where user_id = p_user_id and status = 'approved'
    ),
    'approved_offer_total', (
      select coalesce(sum(amount), 0) from public.offers
      where user_id = p_user_id and status = 'approved'
    ),
    'terms_version', (
      select coalesce(terms_accepted ->> 'version', terms_accepted ->> 'terms_version', '')
      from public.profiles where id = p_user_id
    ),
    'terms_accepted_at', (
      select coalesce(terms_accepted ->> 'accepted_at', terms_accepted ->> 'terms_accepted_at', '')
      from public.profiles where id = p_user_id
    )
  ) into v_summary;

  select coalesce(
    jsonb_agg(jsonb_build_object('bucket', owned.bucket_id, 'path', owned.name)),
    '[]'::jsonb
  )
  into v_storage_objects
  from (
    select distinct object_row.bucket_id, object_row.name
    from storage.objects object_row
    where object_row.owner = p_user_id
       or object_row.owner_id = p_user_id::text
       or object_row.name like p_user_id::text || '/%'
  ) owned;

  insert into public.account_deletion_receipts (retained_summary)
  values (v_summary)
  returning id into v_receipt_id;

  return jsonb_build_object(
    'receipt_id', v_receipt_id,
    'storage_objects', v_storage_objects
  );
end;
$$;

revoke all on function public.forjados_prepare_account_deletion_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.forjados_prepare_account_deletion_v1(uuid)
  to service_role;

create or replace function public.forjados_scrub_account_references_v1(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_record record;
begin
  if p_user_id is null then
    raise exception 'Usuário inválido.';
  end if;

  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Operação restrita ao serviço de exclusão.';
  end if;

  delete from public.app_notifications where user_id = p_user_id;

  update public.audit_logs
  set actor_id = null,
      actor_name = case when actor_id = p_user_id then 'Conta excluída' else actor_name end,
      actor_email = case when actor_id = p_user_id then null else actor_email end,
      entity_id = case when entity_id = p_user_id::text then null else entity_id end,
      description = case
        when actor_id = p_user_id or entity_id = p_user_id::text
          then 'Registro operacional preservado sem identificação pessoal.'
        else description
      end,
      metadata = case
        when actor_id = p_user_id
          or entity_id = p_user_id::text
          or metadata::text like '%' || p_user_id::text || '%'
          then jsonb_build_object('personal_data_removed', true)
        else metadata
      end
  where actor_id = p_user_id
     or entity_id = p_user_id::text
     or metadata::text like '%' || p_user_id::text || '%';

  update public.chats
  set participants = array_remove(participants, p_user_id),
      participant_roles = participant_roles - p_user_id::text,
      updated_at = now()
  where p_user_id = any(participants);

  delete from public.chats where cardinality(participants) = 0;

  for v_record in
    select column_row.table_name, column_row.column_name
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.data_type = 'uuid'
      and column_row.is_nullable = 'YES'
      and column_row.column_name in (
        'created_by', 'updated_by', 'reviewed_by', 'confirmed_by',
        'performed_by', 'deleted_by', 'granted_by', 'delivered_by'
      )
  loop
    execute format(
      'update public.%I set %I = null where %I = $1',
      v_record.table_name,
      v_record.column_name,
      v_record.column_name
    ) using p_user_id;
  end loop;
end;
$$;

revoke all on function public.forjados_scrub_account_references_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.forjados_scrub_account_references_v1(uuid)
  to service_role;

create or replace function public.forjados_finish_account_deletion_v1(
  p_receipt_id uuid,
  p_success boolean,
  p_failure_code text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Operação restrita ao serviço de exclusão.';
  end if;

  update public.account_deletion_receipts
  set status = case when p_success then 'completed' else 'failed' end,
      completed_at = case when p_success then now() else null end,
      failure_code = case when p_success then null else left(coalesce(p_failure_code, 'unknown'), 120) end,
      updated_at = now()
  where id = p_receipt_id;
end;
$$;

revoke all on function public.forjados_finish_account_deletion_v1(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.forjados_finish_account_deletion_v1(uuid, boolean, text)
  to service_role;
