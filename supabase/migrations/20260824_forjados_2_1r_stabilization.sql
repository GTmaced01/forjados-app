-- FORJADOS 2.1R — estabilização técnica, inscrições por edição e comprovantes privados.
-- Fonte oficial de edição: public.forjados_editions.
-- public.retreat_events permanece apenas como legado de compatibilidade nesta etapa.
-- Aplicar o banco antes de publicar o frontend desta versão.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.forjados_editions
  add column if not exists location text;

alter table public.payment_receipts
  add column if not exists file_path text;

alter table public.offers
  add column if not exists proof_path text;

alter table public.shirt_orders
  add column if not exists proof_path text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'forjados_editions_registration_amount_nonnegative'
      and conrelid = 'public.forjados_editions'::regclass
  ) then
    alter table public.forjados_editions
      add constraint forjados_editions_registration_amount_nonnegative
      check (registration_amount >= 0);
  end if;
end;
$$;

create index if not exists edition_enrollments_user_id_idx
  on public.edition_enrollments (user_id);

create index if not exists payment_receipts_user_edition_uploaded_idx
  on public.payment_receipts (user_id, edition_id, uploaded_at desc);

create index if not exists payment_receipts_edition_id_idx
  on public.payment_receipts (edition_id)
  where edition_id is not null;

create index if not exists payment_receipts_reviewed_by_idx
  on public.payment_receipts (reviewed_by)
  where reviewed_by is not null;

create index if not exists payment_receipts_file_path_idx
  on public.payment_receipts (file_path)
  where file_path is not null;

create index if not exists offers_user_created_idx
  on public.offers (user_id, created_at desc);

create index if not exists offers_proof_path_idx
  on public.offers (proof_path)
  where proof_path is not null;

create index if not exists shirt_orders_user_created_idx
  on public.shirt_orders (user_id, created_at desc);

create index if not exists shirt_orders_proof_path_idx
  on public.shirt_orders (proof_path)
  where proof_path is not null;

create index if not exists shirt_order_items_order_id_idx
  on public.shirt_order_items (order_id);

create index if not exists shirt_order_items_shirt_id_idx
  on public.shirt_order_items (shirt_id)
  where shirt_id is not null;

create index if not exists profiles_direct_leader_id_idx
  on public.profiles (direct_leader_id)
  where direct_leader_id is not null;

create index if not exists shirts_deleted_by_idx
  on public.shirts (deleted_by)
  where deleted_by is not null;

-- Migra apenas a configuração ativa para a entidade oficial. Não associa
-- comprovantes antigos a uma edição por inferência, preservando o histórico.
insert into public.forjados_editions (
  title,
  starts_at,
  ends_at,
  registration_amount,
  status,
  is_active,
  notes,
  location
)
select
  legacy.title,
  legacy.start_date,
  legacy.end_date,
  80,
  'open',
  true,
  'Configuração migrada de retreat_events pelo FORJADOS 2.1R.',
  legacy.location
from public.retreat_events legacy
where legacy.active = true
  and not exists (
    select 1
    from public.forjados_editions edition
    where edition.is_active = true
  )
order by legacy.start_date asc
limit 1;

-- Recupera o caminho dos cinco comprovantes legados antes de tornar o bucket privado.
with derived_paths as (
  select
    receipt.id,
    case
      when coalesce(receipt.file_url, '') like '%/storage/v1/object/public/payment-receipts/%'
        then split_part(receipt.file_url, '/storage/v1/object/public/payment-receipts/', 2)
      when coalesce(receipt.file_url, '') like '%/storage/v1/object/sign/payment-receipts/%'
        then split_part(
          split_part(receipt.file_url, '/storage/v1/object/sign/payment-receipts/', 2),
          '?',
          1
        )
      else null
    end as file_path
  from public.payment_receipts receipt
  where receipt.file_path is null
)
update public.payment_receipts receipt
set file_path = derived.file_path
from derived_paths derived
where receipt.id = derived.id
  and derived.file_path is not null
  and derived.file_path like (receipt.user_id::text || '/%')
  and exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'payment-receipts'
      and object.name = derived.file_path
  );

with derived_paths as (
  select
    offer.id,
    case
      when coalesce(offer.proof_url, '') like '%/storage/v1/object/public/payment-receipts/%'
        then split_part(offer.proof_url, '/storage/v1/object/public/payment-receipts/', 2)
      when coalesce(offer.proof_url, '') like '%/storage/v1/object/sign/payment-receipts/%'
        then split_part(
          split_part(offer.proof_url, '/storage/v1/object/sign/payment-receipts/', 2),
          '?',
          1
        )
      else null
    end as proof_path
  from public.offers offer
  where offer.proof_path is null
)
update public.offers offer
set proof_path = derived.proof_path
from derived_paths derived
where offer.id = derived.id
  and derived.proof_path is not null
  and derived.proof_path like (offer.user_id::text || '/ofertas/%')
  and exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'payment-receipts'
      and object.name = derived.proof_path
  );

update public.shirt_orders orders
set proof_path = (
  select payment.file_path
  from public.payment_receipts payment
  where payment.order_id = orders.id
    and payment.type = 'order'
    and payment.file_path is not null
  order by payment.uploaded_at desc
  limit 1
)
where orders.proof_path is null
  and exists (
    select 1
    from public.payment_receipts payment
    where payment.order_id = orders.id
      and payment.type = 'order'
      and payment.file_path is not null
  );

update storage.buckets
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/png', 'image/jpeg', 'application/pdf']::text[]
where id = 'payment-receipts';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.forjados_has_any_role_v1(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and coalesce(profile.is_deleted, false) = false
      and (
        coalesce(profile.is_admin, false)
        or profile.role::text = any(p_roles)
      )
  );
$$;

revoke all on function private.forjados_has_any_role_v1(text[])
  from public, anon, authenticated;
grant execute on function private.forjados_has_any_role_v1(text[])
  to authenticated;

create or replace function public.forjados_ensure_my_profile_v1()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_auth_user auth.users%rowtype;
  v_profile public.profiles%rowtype;
  v_display_name text;
  v_requested_role public.user_role;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if found then
    return v_profile;
  end if;

  select *
  into v_auth_user
  from auth.users
  where id = v_user_id;

  if not found then
    raise exception 'Usuário de autenticação não encontrado.';
  end if;

  v_display_name := coalesce(
    nullif(trim(v_auth_user.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(v_auth_user.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(v_auth_user.email, ''), '@', 1),
    'Novo usuário'
  );

  if v_auth_user.raw_user_meta_data->>'requested_role'
    in ('member', 'leader', 'director', 'treasury') then
    v_requested_role := (v_auth_user.raw_user_meta_data->>'requested_role')::public.user_role;
  else
    v_requested_role := 'member'::public.user_role;
  end if;

  insert into public.profiles (
    id,
    email,
    display_name,
    full_name,
    role,
    requested_role,
    inscription_status,
    is_admin,
    member_id,
    sectors,
    primary_team,
    has_vehicle,
    skills,
    points,
    terms_accepted
  ) values (
    v_user_id,
    coalesce(v_auth_user.email, ''),
    left(v_display_name, 160),
    left(v_display_name, 160),
    'member'::public.user_role,
    v_requested_role,
    'pending'::public.inscription_status,
    false,
    'EQP-' || upper(left(replace(v_user_id::text, '-', ''), 10)),
    array[]::text[],
    null,
    false,
    array[]::text[],
    0,
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'Não foi possível preparar o perfil.';
  end if;

  return v_profile;
end;
$$;

create or replace function public.forjados_update_my_profile_v1(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_requested_role public.user_role;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Dados de perfil inválidos.';
  end if;
  if p_payload ? 'display_name'
    and nullif(trim(p_payload->>'display_name'), '') is null then
    raise exception 'Nome é obrigatório.';
  end if;
  if p_payload ? 'sectors'
    and (
      jsonb_typeof(p_payload->'sectors') <> 'array'
      or jsonb_array_length(p_payload->'sectors') > 20
    ) then
    raise exception 'Setores inválidos.';
  end if;
  if p_payload ? 'skills'
    and (
      jsonb_typeof(p_payload->'skills') <> 'array'
      or jsonb_array_length(p_payload->'skills') > 50
    ) then
    raise exception 'Habilidades inválidas.';
  end if;
  if p_payload ? 'emergency_contact'
    and (
      jsonb_typeof(p_payload->'emergency_contact') <> 'object'
      or octet_length((p_payload->'emergency_contact')::text) > 4000
    ) then
    raise exception 'Contato de emergência inválido.';
  end if;
  if p_payload ? 'terms_accepted'
    and (
      jsonb_typeof(p_payload->'terms_accepted') <> 'object'
      or octet_length((p_payload->'terms_accepted')::text) > 4000
    ) then
    raise exception 'Termos inválidos.';
  end if;

  select requested_role
  into v_requested_role
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;

  if p_payload ? 'requested_role' then
    if p_payload->>'requested_role' not in ('member', 'leader', 'director', 'treasury') then
      raise exception 'Tipo de participação inválido.';
    end if;
    v_requested_role := (p_payload->>'requested_role')::public.user_role;
  end if;

  update public.profiles as profile
  set display_name = case
        when p_payload ? 'display_name'
          then left(trim(p_payload->>'display_name'), 160)
        else profile.display_name
      end,
      full_name = case
        when p_payload ? 'display_name'
          then left(trim(p_payload->>'display_name'), 160)
        else profile.full_name
      end,
      phone = case
        when p_payload ? 'phone' then left(coalesce(p_payload->>'phone', ''), 40)
        else profile.phone
      end,
      birth_date = case
        when p_payload ? 'birth_date' then nullif(p_payload->>'birth_date', '')::date
        else profile.birth_date
      end,
      city = case
        when p_payload ? 'city' then left(coalesce(p_payload->>'city', ''), 120)
        else profile.city
      end,
      neighborhood = case
        when p_payload ? 'neighborhood' then left(coalesce(p_payload->>'neighborhood', ''), 120)
        else profile.neighborhood
      end,
      member_since = case
        when p_payload ? 'member_since' then nullif(p_payload->>'member_since', '')::date
        else profile.member_since
      end,
      requested_role = v_requested_role,
      primary_team = case
        when p_payload ? 'primary_team'
          then nullif(left(coalesce(p_payload->>'primary_team', ''), 120), '')
        else profile.primary_team
      end,
      sectors = case
        when p_payload ? 'sectors' then array(
          select left(value, 120)
          from jsonb_array_elements_text(p_payload->'sectors') as value
        )
        else profile.sectors
      end,
      specific_function = case
        when p_payload ? 'specific_function'
          then left(coalesce(p_payload->>'specific_function', ''), 160)
        else profile.specific_function
      end,
      experience_level = case
        when p_payload ? 'experience_level'
          then left(coalesce(p_payload->>'experience_level', ''), 80)
        else profile.experience_level
      end,
      shirt_size = case
        when p_payload ? 'shirt_size'
          then left(coalesce(p_payload->>'shirt_size', ''), 20)
        else profile.shirt_size
      end,
      has_vehicle = case
        when p_payload ? 'has_vehicle'
          then coalesce((p_payload->>'has_vehicle')::boolean, false)
        else profile.has_vehicle
      end,
      skills = case
        when p_payload ? 'skills' then array(
          select left(value, 120)
          from jsonb_array_elements_text(p_payload->'skills') as value
        )
        else profile.skills
      end,
      food_restrictions = case
        when p_payload ? 'food_restrictions'
          then left(coalesce(p_payload->>'food_restrictions', ''), 2000)
        else profile.food_restrictions
      end,
      health_problems = case
        when p_payload ? 'health_problems'
          then left(coalesce(p_payload->>'health_problems', ''), 2000)
        else profile.health_problems
      end,
      continuous_medicine = case
        when p_payload ? 'continuous_medicine'
          then left(coalesce(p_payload->>'continuous_medicine', ''), 2000)
        else profile.continuous_medicine
      end,
      emergency_contact = case
        when p_payload ? 'emergency_contact'
          then coalesce(p_payload->'emergency_contact', '{}'::jsonb)
        else profile.emergency_contact
      end,
      terms_accepted = case
        when p_payload ? 'terms_accepted'
          then coalesce(p_payload->'terms_accepted', '{}'::jsonb)
        else profile.terms_accepted
      end,
      updated_at = now()
  where profile.id = v_user_id;
end;
$$;

create or replace function public.get_my_active_edition_enrollment()
returns table (
  edition_id uuid,
  edition_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  amount numeric,
  enrollment_id uuid,
  enrollment_status text,
  payment_status text,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.';
  end if;

  return query
  select
    edition.id,
    edition.title,
    edition.starts_at,
    edition.ends_at,
    edition.registration_amount,
    enrollment.id,
    coalesce(enrollment.enrollment_status, 'not_created')::text,
    coalesce(enrollment.payment_status, 'not_sent')::text,
    enrollment.paid_at
  from public.forjados_editions edition
  left join public.edition_enrollments enrollment
    on enrollment.edition_id = edition.id
   and enrollment.user_id = (select auth.uid())
  where edition.is_active = true
  order by edition.starts_at asc
  limit 1;
end;
$$;

create or replace function public.ensure_my_active_edition_enrollment()
returns table (
  edition_id uuid,
  edition_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  amount numeric,
  enrollment_id uuid,
  enrollment_status text,
  payment_status text,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_edition public.forjados_editions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
  into v_edition
  from public.forjados_editions
  where is_active = true
  order by starts_at asc
  limit 1;

  if v_edition.id is null then
    return;
  end if;

  if v_edition.status = 'open' then
    insert into public.edition_enrollments (edition_id, user_id, amount)
    values (v_edition.id, v_user_id, v_edition.registration_amount)
    on conflict (edition_id, user_id) do nothing;
  end if;

  return query
  select *
  from public.get_my_active_edition_enrollment();
end;
$$;

create or replace function public.forjados_submit_inscription_receipt_v1(
  p_file_path text,
  p_file_name text,
  p_file_type text,
  p_user_name text,
  p_user_email text,
  p_user_whatsapp text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_edition_id uuid;
  v_amount numeric(10,2);
  v_edition_status text;
  v_receipt_id uuid;
  v_user_name text;
  v_user_email text;
  v_user_whatsapp text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select edition.id, edition.registration_amount, edition.status
  into v_edition_id, v_amount, v_edition_status
  from public.forjados_editions edition
  where edition.is_active = true
  order by edition.starts_at asc
  limit 1;

  if v_edition_id is null then
    raise exception 'Não existe uma edição ativa.';
  end if;
  if v_edition_status <> 'open' then
    raise exception 'As inscrições desta edição estão fechadas.';
  end if;
  if p_file_path is null
    or p_file_path not like (
      v_user_id::text || '/inscricoes/' || v_edition_id::text || '/%'
    ) then
    raise exception 'Caminho de comprovante inválido.';
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'payment-receipts'
      and object.name = p_file_path
  ) then
    raise exception 'O arquivo enviado não foi encontrado.';
  end if;
  if exists (
    select 1
    from public.payment_receipts receipt
    where receipt.user_id = v_user_id
      and receipt.edition_id = v_edition_id
      and receipt.type = 'inscription'
      and receipt.status::text in ('pending', 'approved')
      and receipt.deleted_at is null
  ) then
    raise exception 'Já existe um comprovante válido ou em análise para esta edição.';
  end if;

  insert into public.edition_enrollments (edition_id, user_id, amount)
  values (v_edition_id, v_user_id, v_amount)
  on conflict (edition_id, user_id) do update
    set amount = case
          when edition_enrollments.payment_status in ('pending', 'rejected')
            then excluded.amount
          else edition_enrollments.amount
        end,
        updated_at = now();

  select
    coalesce(nullif(profile.display_name, ''), nullif(p_user_name, ''), 'Participante'),
    coalesce(nullif(profile.email, ''), nullif(p_user_email, ''), auth_user.email, ''),
    coalesce(nullif(profile.phone, ''), p_user_whatsapp, '')
  into v_user_name, v_user_email, v_user_whatsapp
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = v_user_id;

  insert into public.payment_receipts (
    user_id,
    user_name,
    user_email,
    user_whatsapp,
    amount,
    file_url,
    file_path,
    file_name,
    file_type,
    status,
    type,
    edition_id
  ) values (
    v_user_id,
    v_user_name,
    v_user_email,
    v_user_whatsapp,
    v_amount,
    '',
    p_file_path,
    left(coalesce(p_file_name, 'comprovante'), 255),
    left(coalesce(p_file_type, 'arquivo'), 120),
    'pending'::public.receipt_status,
    'inscription',
    v_edition_id
  )
  returning id into v_receipt_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'inscription_receipt_submitted',
    'payment_receipt',
    v_receipt_id::text,
    'Comprovante de inscrição enviado.',
    jsonb_build_object('edition_id', v_edition_id, 'amount', v_amount)
  );

  return v_receipt_id;
end;
$$;

create or replace function public.forjados_create_shirt_order_v1(p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item jsonb;
  v_shirt_id uuid;
  v_size text;
  v_quantity integer;
  v_name text;
  v_price numeric(10,2);
  v_stock jsonb;
  v_stock_quantity integer;
  v_active boolean;
  v_total numeric(12,2) := 0;
  v_order_id uuid;
  v_seen text[] := array[]::text[];
  v_key text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 50 then
    raise exception 'Carrinho inválido.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by value->>'shirt_id', value->>'size'
  loop
    begin
      v_shirt_id := (v_item->>'shirt_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Item de carrinho inválido.';
    end;

    v_size := upper(trim(coalesce(v_item->>'size', '')));
    if v_quantity < 1 or v_quantity > 20 or v_size = '' then
      raise exception 'Quantidade ou tamanho inválido.';
    end if;

    v_key := v_shirt_id::text || ':' || v_size;
    if v_key = any(v_seen) then
      raise exception 'O carrinho contém itens duplicados.';
    end if;
    v_seen := array_append(v_seen, v_key);

    select shirt.name, shirt.price, shirt.stock, shirt.is_active
    into v_name, v_price, v_stock, v_active
    from public.shirts shirt
    where shirt.id = v_shirt_id
      and shirt.deleted_at is null
    for update;

    if not found or not v_active then
      raise exception 'Uma das camisas não está disponível.';
    end if;
    if v_price < 0 then
      raise exception 'Uma das camisas possui preço inválido.';
    end if;

    begin
      v_stock_quantity := coalesce((v_stock->>v_size)::integer, 0);
    exception when others then
      raise exception 'Estoque inválido para % / %.', v_name, v_size;
    end;

    if v_stock_quantity < v_quantity then
      raise exception 'Estoque insuficiente para % / %.', v_name, v_size;
    end if;

    v_total := v_total + (v_price * v_quantity);
  end loop;

  insert into public.shirt_orders (user_id, total_price, status)
  values (v_user_id, v_total, 'waiting_payment'::public.order_status)
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by value->>'shirt_id', value->>'size'
  loop
    v_shirt_id := (v_item->>'shirt_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_size := upper(trim(v_item->>'size'));

    select shirt.name, shirt.price, shirt.stock
    into v_name, v_price, v_stock
    from public.shirts shirt
    where shirt.id = v_shirt_id;

    v_stock_quantity := coalesce((v_stock->>v_size)::integer, 0);

    insert into public.shirt_order_items (
      order_id, shirt_id, name, size, quantity, price
    ) values (
      v_order_id, v_shirt_id, v_name, v_size, v_quantity, v_price
    );

    update public.shirts
    set stock = jsonb_set(
          stock,
          array[v_size],
          to_jsonb(v_stock_quantity - v_quantity),
          true
        ),
        updated_at = now()
    where id = v_shirt_id;
  end loop;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'shirt_order_created',
    'shirt_order',
    v_order_id::text,
    'Pedido de camisas criado com estoque reservado.',
    jsonb_build_object('amount', v_total, 'items', jsonb_array_length(p_items))
  );

  return v_order_id;
end;
$$;

create or replace function public.forjados_submit_shirt_order_receipt_v1(
  p_order_id uuid,
  p_file_path text,
  p_file_name text,
  p_file_type text,
  p_user_name text,
  p_user_email text,
  p_user_whatsapp text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_amount numeric(12,2);
  v_receipt_id uuid;
  v_user_name text;
  v_user_email text;
  v_user_whatsapp text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_file_path is null
    or p_file_path not like (
      v_user_id::text || '/shirt-orders/' || p_order_id::text || '/%'
    ) then
    raise exception 'Caminho de comprovante inválido.';
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'payment-receipts'
      and object.name = p_file_path
  ) then
    raise exception 'O arquivo enviado não foi encontrado.';
  end if;

  select orders.total_price
  into v_amount
  from public.shirt_orders orders
  where orders.id = p_order_id
    and orders.user_id = v_user_id
    and orders.status::text in ('waiting_payment', 'payment_rejected')
    and orders.deleted_at is null
  for update;

  if not found then
    raise exception 'Pedido não encontrado ou indisponível para comprovante.';
  end if;
  if exists (
    select 1
    from public.payment_receipts receipt
    where receipt.order_id = p_order_id
      and receipt.type = 'order'
      and receipt.status::text in ('pending', 'approved')
      and receipt.deleted_at is null
  ) then
    raise exception 'Já existe um comprovante válido ou em análise para este pedido.';
  end if;

  select
    coalesce(nullif(profile.display_name, ''), nullif(p_user_name, ''), 'Participante'),
    coalesce(nullif(profile.email, ''), nullif(p_user_email, ''), auth_user.email, ''),
    coalesce(nullif(profile.phone, ''), p_user_whatsapp, '')
  into v_user_name, v_user_email, v_user_whatsapp
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = v_user_id;

  insert into public.payment_receipts (
    user_id,
    user_name,
    user_email,
    user_whatsapp,
    amount,
    file_url,
    file_path,
    file_name,
    file_type,
    status,
    type,
    order_id
  ) values (
    v_user_id,
    v_user_name,
    v_user_email,
    v_user_whatsapp,
    v_amount,
    '',
    p_file_path,
    left(coalesce(p_file_name, 'comprovante'), 255),
    left(coalesce(p_file_type, 'arquivo'), 120),
    'pending'::public.receipt_status,
    'order',
    p_order_id
  )
  returning id into v_receipt_id;

  update public.shirt_orders
  set status = 'receipt_sent'::public.order_status,
      proof_url = '',
      proof_path = p_file_path,
      updated_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'shirt_order_receipt_submitted',
    'payment_receipt',
    v_receipt_id::text,
    'Comprovante de pedido de camisas enviado.',
    jsonb_build_object('order_id', p_order_id, 'amount', v_amount)
  );

  return v_receipt_id;
end;
$$;

create or replace function public.forjados_create_offer_v1(
  p_amount numeric,
  p_method text,
  p_objective text,
  p_notes text,
  p_proof_path text,
  p_user_name text,
  p_user_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_offer_id uuid;
  v_user_name text;
  v_user_email text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Valor de oferta inválido.';
  end if;
  if p_method not in ('pix', 'card', 'cash', 'other') then
    raise exception 'Forma de oferta inválida.';
  end if;
  if nullif(trim(p_objective), '') is null then
    raise exception 'Informe o objetivo da oferta.';
  end if;
  if nullif(p_proof_path, '') is not null then
    if p_proof_path not like (v_user_id::text || '/ofertas/%') then
      raise exception 'Caminho de comprovante inválido.';
    end if;
    if not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'payment-receipts'
        and object.name = p_proof_path
    ) then
      raise exception 'O arquivo enviado não foi encontrado.';
    end if;
  end if;

  select
    coalesce(nullif(profile.display_name, ''), nullif(p_user_name, ''), 'Participante'),
    coalesce(nullif(profile.email, ''), nullif(p_user_email, ''), auth_user.email, '')
  into v_user_name, v_user_email
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = v_user_id;

  insert into public.offers (
    user_id,
    user_name,
    user_email,
    amount,
    method,
    objective,
    notes,
    proof_url,
    proof_path,
    status
  ) values (
    v_user_id,
    v_user_name,
    v_user_email,
    round(p_amount, 2),
    p_method,
    left(trim(p_objective), 160),
    left(coalesce(p_notes, ''), 2000),
    '',
    nullif(p_proof_path, ''),
    'pending'
  )
  returning id into v_offer_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'offer_created',
    'offer',
    v_offer_id::text,
    'Oferta registrada.',
    jsonb_build_object('amount', round(p_amount, 2), 'method', p_method)
  );

  return v_offer_id;
end;
$$;

create or replace function public.forjados_review_payment_receipt_v1(
  p_receipt_id uuid,
  p_status text,
  p_observations text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_receipt public.payment_receipts%rowtype;
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']) then
    raise exception 'Acesso negado.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Status inválido.';
  end if;

  select *
  into v_receipt
  from public.payment_receipts
  where id = p_receipt_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Comprovante não encontrado.';
  end if;
  if v_receipt.status::text = p_status then
    return;
  end if;
  if v_receipt.status::text <> 'pending' then
    raise exception 'Este comprovante já foi analisado.';
  end if;

  update public.payment_receipts
  set status = p_status::public.receipt_status,
      observations = left(coalesce(p_observations, ''), 2000),
      reviewed_by = v_actor_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_receipt_id;

  if v_receipt.type = 'inscription' and v_receipt.edition_id is not null then
    insert into public.edition_enrollments (
      edition_id,
      user_id,
      amount,
      enrollment_status,
      payment_status,
      paid_at,
      approved_by,
      approved_at
    ) values (
      v_receipt.edition_id,
      v_receipt.user_id,
      v_receipt.amount,
      case when p_status = 'approved' then 'approved' else 'pending' end,
      p_status,
      case when p_status = 'approved' then now() else null end,
      case when p_status = 'approved' then v_actor_id else null end,
      case when p_status = 'approved' then now() else null end
    )
    on conflict (edition_id, user_id) do update
      set amount = excluded.amount,
          enrollment_status = excluded.enrollment_status,
          payment_status = excluded.payment_status,
          paid_at = excluded.paid_at,
          approved_by = excluded.approved_by,
          approved_at = excluded.approved_at,
          updated_at = now();
  elsif v_receipt.type = 'order' and v_receipt.order_id is not null then
    update public.shirt_orders
    set status = case
          when p_status = 'approved' then 'payment_approved'::public.order_status
          else 'payment_rejected'::public.order_status
        end,
        updated_at = now()
    where id = v_receipt.order_id
      and status = 'receipt_sent'::public.order_status;
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'payment_receipt_reviewed',
    'payment_receipt',
    p_receipt_id::text,
    'Comprovante financeiro analisado.',
    jsonb_build_object(
      'status', p_status,
      'type', v_receipt.type,
      'edition_id', v_receipt.edition_id,
      'order_id', v_receipt.order_id
    )
  );
end;
$$;

create or replace function public.forjados_review_offer_v1(
  p_offer_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_current_status text;
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']) then
    raise exception 'Acesso negado.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Status inválido.';
  end if;

  select status
  into v_current_status
  from public.offers
  where id = p_offer_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Oferta não encontrada.';
  end if;
  if v_current_status = p_status then
    return;
  end if;
  if v_current_status <> 'pending' then
    raise exception 'Esta oferta já foi analisada.';
  end if;

  update public.offers
  set status = p_status,
      reviewed_by = v_actor_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_offer_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'offer_reviewed',
    'offer',
    p_offer_id::text,
    'Oferta analisada.',
    jsonb_build_object('status', p_status)
  );
end;
$$;

create or replace function public.forjados_review_shirt_order_v1(
  p_order_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.shirt_orders%rowtype;
  v_item record;
  v_stock jsonb;
  v_stock_quantity integer;
  v_size text;
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']) then
    raise exception 'Acesso negado.';
  end if;
  if p_status not in ('payment_approved', 'payment_rejected', 'delivered', 'cancelled') then
    raise exception 'Status inválido.';
  end if;

  select *
  into v_order
  from public.shirt_orders
  where id = p_order_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_order.status::text = p_status then
    return;
  end if;

  if p_status in ('payment_approved', 'payment_rejected')
    and v_order.status::text <> 'receipt_sent' then
    raise exception 'O pedido não está aguardando análise de comprovante.';
  elsif p_status = 'delivered'
    and v_order.status::text <> 'payment_approved' then
    raise exception 'Somente pedidos pagos podem ser entregues.';
  elsif p_status = 'cancelled'
    and v_order.status::text not in ('waiting_payment', 'receipt_sent', 'payment_rejected') then
    raise exception 'Este pedido não pode ser cancelado neste status.';
  end if;

  if p_status = 'cancelled' then
    for v_item in
      select item.shirt_id, item.size, item.quantity
      from public.shirt_order_items item
      where item.order_id = p_order_id
        and item.shirt_id is not null
      order by item.shirt_id, item.size
    loop
      v_size := upper(trim(v_item.size));

      select shirt.stock
      into v_stock
      from public.shirts shirt
      where shirt.id = v_item.shirt_id
      for update;

      if found then
        v_stock_quantity := coalesce((v_stock->>v_size)::integer, 0);
        update public.shirts
        set stock = jsonb_set(
              stock,
              array[v_size],
              to_jsonb(v_stock_quantity + v_item.quantity),
              true
            ),
            updated_at = now()
        where id = v_item.shirt_id;
      end if;
    end loop;
  end if;

  update public.shirt_orders
  set status = p_status::public.order_status,
      updated_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'shirt_order_reviewed',
    'shirt_order',
    p_order_id::text,
    'Status do pedido de camisas alterado.',
    jsonb_build_object('from', v_order.status::text, 'to', p_status)
  );
end;
$$;

create or replace function public.forjados_upsert_active_edition_v1(
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_registration_amount numeric,
  p_registration_open boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_edition_id uuid;
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director']) then
    raise exception 'Acesso negado.';
  end if;
  if nullif(trim(p_title), '') is null or p_starts_at is null then
    raise exception 'Nome e início são obrigatórios.';
  end if;
  if p_ends_at is not null and p_ends_at < p_starts_at then
    raise exception 'A data final não pode ser anterior ao início.';
  end if;
  if p_registration_amount is null or p_registration_amount < 0 then
    raise exception 'Valor de inscrição inválido.';
  end if;

  select id
  into v_edition_id
  from public.forjados_editions
  where is_active = true
  order by starts_at asc
  limit 1
  for update;

  if v_edition_id is null then
    insert into public.forjados_editions (
      title,
      starts_at,
      ends_at,
      registration_amount,
      status,
      is_active,
      location,
      created_by
    ) values (
      left(trim(p_title), 160),
      p_starts_at,
      p_ends_at,
      round(p_registration_amount, 2),
      case when coalesce(p_registration_open, false) then 'open' else 'closed' end,
      true,
      left(coalesce(p_location, ''), 255),
      v_actor_id
    )
    returning id into v_edition_id;
  else
    update public.forjados_editions
    set title = left(trim(p_title), 160),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        registration_amount = round(p_registration_amount, 2),
        status = case
          when coalesce(p_registration_open, false) then 'open'
          else 'closed'
        end,
        location = left(coalesce(p_location, ''), 255),
        updated_at = now()
    where id = v_edition_id;

    update public.edition_enrollments
    set amount = round(p_registration_amount, 2),
        updated_at = now()
    where edition_id = v_edition_id
      and payment_status in ('pending', 'rejected');
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'active_edition_updated',
    'forjados_edition',
    v_edition_id::text,
    'Configuração da edição ativa atualizada.',
    jsonb_build_object(
      'registration_amount', round(p_registration_amount, 2),
      'registration_open', coalesce(p_registration_open, false)
    )
  );

  return v_edition_id;
end;
$$;

create or replace function public.forjados_confirm_participation_from_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retreat_title text;
begin
  if new.status::text = 'approved'
    and new.type = 'inscription'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then

    if new.edition_id is not null then
      select edition.title
      into v_retreat_title
      from public.forjados_editions edition
      where edition.id = new.edition_id;
    end if;

    if v_retreat_title is null then
      select edition.title
      into v_retreat_title
      from public.forjados_editions edition
      where edition.is_active = true
      order by edition.starts_at asc
      limit 1;
    end if;

    if v_retreat_title is null then
      select legacy.title
      into v_retreat_title
      from public.retreat_events legacy
      where legacy.active = true
      order by legacy.start_date asc
      limit 1;
    end if;

    v_retreat_title := coalesce(v_retreat_title, 'FORJADOS');

    insert into public.retreat_participations (
      user_id,
      retreat_title,
      confirmed_by_payment_id,
      confirmed_by,
      confirmed_at
    ) values (
      new.user_id,
      v_retreat_title,
      new.id,
      new.reviewed_by,
      now()
    )
    on conflict (user_id, retreat_title) do update
      set confirmed_by_payment_id = excluded.confirmed_by_payment_id,
          confirmed_by = excluded.confirmed_by,
          confirmed_at = excluded.confirmed_at;

    update public.profiles profile
    set retreat_count = (
          select count(*)::integer
          from public.retreat_participations participation
          where participation.user_id = new.user_id
        ),
        updated_at = now()
    where profile.id = new.user_id;
  end if;

  return new;
end;
$$;

alter table public.payment_receipts enable row level security;
alter table public.profiles enable row level security;
alter table public.forjados_editions enable row level security;
alter table public.edition_enrollments enable row level security;
alter table public.offers enable row level security;
alter table public.shirt_orders enable row level security;
alter table public.shirt_order_items enable row level security;

drop policy if exists profiles_insert_own_only on public.profiles;
drop policy if exists profiles_update_own_only on public.profiles;
drop policy if exists profiles_select_own_only on public.profiles;
drop policy if exists forjados_2_1r_profiles_select_own on public.profiles;
create policy forjados_2_1r_profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists forjados_editions_admin_all on public.forjados_editions;
drop policy if exists forjados_editions_read_authenticated on public.forjados_editions;
drop policy if exists forjados_2_1r_editions_select on public.forjados_editions;
create policy forjados_2_1r_editions_select
  on public.forjados_editions
  for select
  to authenticated
  using (true);

drop policy if exists edition_enrollments_admin_all on public.edition_enrollments;
drop policy if exists edition_enrollments_read_own_or_admin on public.edition_enrollments;
drop policy if exists forjados_2_1r_enrollments_select on public.edition_enrollments;
create policy forjados_2_1r_enrollments_select
  on public.edition_enrollments
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
  );

drop policy if exists receipts_insert_own on public.payment_receipts;
drop policy if exists receipts_update_finance on public.payment_receipts;
drop policy if exists receipts_select on public.payment_receipts;
drop policy if exists forjados_2_1r_receipts_select on public.payment_receipts;
create policy forjados_2_1r_receipts_select
  on public.payment_receipts
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
  );

drop policy if exists "users can insert own offers" on public.offers;
drop policy if exists "admins can update offers" on public.offers;
drop policy if exists "users can read own offers" on public.offers;
drop policy if exists forjados_2_1r_offers_select on public.offers;
create policy forjados_2_1r_offers_select
  on public.offers
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
  );

drop policy if exists orders_insert_own on public.shirt_orders;
drop policy if exists orders_update on public.shirt_orders;
drop policy if exists orders_select on public.shirt_orders;
drop policy if exists forjados_2_1r_shirt_orders_select on public.shirt_orders;
create policy forjados_2_1r_shirt_orders_select
  on public.shirt_orders
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
  );

drop policy if exists order_items_insert_own on public.shirt_order_items;
drop policy if exists order_items_select on public.shirt_order_items;
drop policy if exists forjados_2_1r_shirt_order_items_select on public.shirt_order_items;
create policy forjados_2_1r_shirt_order_items_select
  on public.shirt_order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.shirt_orders orders
      where orders.id = shirt_order_items.order_id
        and (
          orders.user_id = (select auth.uid())
          or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
        )
    )
  );

drop policy if exists receipts_insert_own on storage.objects;
drop policy if exists receipts_select_authorized on storage.objects;
drop policy if exists forjados_2_1r_private_receipt_upload on storage.objects;
drop policy if exists forjados_2_1r_private_receipt_read on storage.objects;
drop policy if exists forjados_2_1r_private_receipt_delete_unlinked on storage.objects;

create policy forjados_2_1r_private_receipt_upload
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy forjados_2_1r_private_receipt_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
    )
  );

create policy forjados_2_1r_private_receipt_delete_unlinked
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1
      from public.payment_receipts receipt
      where receipt.file_path = name
    )
    and not exists (
      select 1
      from public.offers offer
      where offer.proof_path = name
    )
    and not exists (
      select 1
      from public.shirt_orders orders
      where orders.proof_path = name
    )
  );

revoke all on table public.profiles from anon;
revoke all on table public.forjados_editions from anon;
revoke all on table public.edition_enrollments from anon;
revoke all on table public.payment_receipts from anon;
revoke all on table public.offers from anon;
revoke all on table public.shirt_orders from anon;
revoke all on table public.shirt_order_items from anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.profiles from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.forjados_editions from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.edition_enrollments from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.payment_receipts from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.offers from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.shirt_orders from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.shirt_order_items from authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.forjados_editions to authenticated;
grant select on table public.edition_enrollments to authenticated;
grant select on table public.payment_receipts to authenticated;
grant select on table public.offers to authenticated;
grant select on table public.shirt_orders to authenticated;
grant select on table public.shirt_order_items to authenticated;

revoke all on function public.forjados_ensure_my_profile_v1()
  from public, anon, authenticated;
revoke all on function public.forjados_update_my_profile_v1(jsonb)
  from public, anon, authenticated;
revoke all on function public.get_my_active_edition_enrollment()
  from public, anon, authenticated;
revoke all on function public.ensure_my_active_edition_enrollment()
  from public, anon, authenticated;
revoke all on function public.forjados_submit_inscription_receipt_v1(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.forjados_create_shirt_order_v1(jsonb)
  from public, anon, authenticated;
revoke all on function public.forjados_submit_shirt_order_receipt_v1(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.forjados_create_offer_v1(numeric, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.forjados_review_payment_receipt_v1(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.forjados_review_offer_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.forjados_review_shirt_order_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.forjados_upsert_active_edition_v1(text, timestamptz, timestamptz, text, numeric, boolean)
  from public, anon, authenticated;
revoke all on function public.forjados_confirm_participation_from_payment()
  from public, anon, authenticated;

grant execute on function public.forjados_ensure_my_profile_v1()
  to authenticated;
grant execute on function public.forjados_update_my_profile_v1(jsonb)
  to authenticated;
grant execute on function public.get_my_active_edition_enrollment()
  to authenticated;
grant execute on function public.ensure_my_active_edition_enrollment()
  to authenticated;
grant execute on function public.forjados_submit_inscription_receipt_v1(text, text, text, text, text, text)
  to authenticated;
grant execute on function public.forjados_create_shirt_order_v1(jsonb)
  to authenticated;
grant execute on function public.forjados_submit_shirt_order_receipt_v1(uuid, text, text, text, text, text, text)
  to authenticated;
grant execute on function public.forjados_create_offer_v1(numeric, text, text, text, text, text, text)
  to authenticated;
grant execute on function public.forjados_review_payment_receipt_v1(uuid, text, text)
  to authenticated;
grant execute on function public.forjados_review_offer_v1(uuid, text)
  to authenticated;
grant execute on function public.forjados_review_shirt_order_v1(uuid, text)
  to authenticated;
grant execute on function public.forjados_upsert_active_edition_v1(text, timestamptz, timestamptz, text, numeric, boolean)
  to authenticated;

notify pgrst, 'reload schema';

commit;
