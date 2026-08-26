begin;

create table if not exists public.honor_goals (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  goal_type text not null check (goal_type in ('custom', 'product')),
  title text not null check (char_length(trim(title)) between 3 and 80),
  target_points integer not null check (target_points between 1 and 1000000),
  product_id uuid null references public.points_store_products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.honor_goals is
  'Meta pessoal de pontos de honra. Cada usuário mantém uma meta ativa por vez.';

create index if not exists honor_goals_product_id_idx
  on public.honor_goals(product_id)
  where product_id is not null;

alter table public.honor_goals enable row level security;

drop policy if exists honor_goals_select_own on public.honor_goals;
create policy honor_goals_select_own
  on public.honor_goals
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.honor_goals from anon, authenticated;
grant select on table public.honor_goals to authenticated;

drop trigger if exists honor_goals_set_updated_at on public.honor_goals;
create trigger honor_goals_set_updated_at
  before update on public.honor_goals
  for each row execute function public.set_updated_at();

create or replace function public.forjados_set_my_honor_goal_v1(
  p_goal_type text,
  p_title text default null,
  p_target_points integer default null,
  p_product_id uuid default null
)
returns public.honor_goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_goal public.honor_goals;
  v_title text;
  v_target_points integer;
  v_product_id uuid;
  v_actor_name text;
  v_actor_email text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_goal_type not in ('custom', 'product') then
    raise exception 'Tipo de meta inválido.';
  end if;

  if p_goal_type = 'product' then
    if p_product_id is null then
      raise exception 'Escolha um item da Loja de Honra.';
    end if;

    select product.id, trim(product.name), product.points_cost
      into v_product_id, v_title, v_target_points
    from public.points_store_products product
    where product.id = p_product_id
      and product.is_active = true
      and product.stock > 0
      and product.deleted_at is null;

    if not found then
      raise exception 'Este item não está disponível para ser usado como meta.';
    end if;

    if v_target_points < 1 then
      raise exception 'Este item ainda não possui um valor de honra válido.';
    end if;
  else
    v_title := trim(coalesce(p_title, ''));
    v_target_points := p_target_points;
    v_product_id := null;

    if char_length(v_title) < 3 or char_length(v_title) > 80 then
      raise exception 'Dê um nome de 3 a 80 caracteres para sua meta.';
    end if;

    if v_target_points is null or v_target_points < 1 or v_target_points > 1000000 then
      raise exception 'A meta deve ter entre 1 e 1.000.000 de pontos.';
    end if;
  end if;

  insert into public.honor_goals (
    user_id,
    goal_type,
    title,
    target_points,
    product_id,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    p_goal_type,
    v_title,
    v_target_points,
    v_product_id,
    now(),
    now()
  )
  on conflict (user_id) do update
    set goal_type = excluded.goal_type,
        title = excluded.title,
        target_points = excluded.target_points,
        product_id = excluded.product_id,
        updated_at = now()
  returning * into v_goal;

  select profile.display_name, profile.email
    into v_actor_name, v_actor_email
  from public.profiles profile
  where profile.id = v_user_id;

  insert into public.audit_logs (
    actor_id,
    actor_name,
    actor_email,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  ) values (
    v_user_id,
    v_actor_name,
    v_actor_email,
    'honor_goal.saved',
    'honor_goal',
    v_user_id::text,
    'Meta pessoal de honra atualizada.',
    jsonb_build_object(
      'goal_type', v_goal.goal_type,
      'target_points', v_goal.target_points,
      'product_id', v_goal.product_id
    )
  );

  return v_goal;
end;
$$;

revoke all on function public.forjados_set_my_honor_goal_v1(text, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.forjados_set_my_honor_goal_v1(text, text, integer, uuid)
  to authenticated;

create or replace function public.forjados_clear_my_honor_goal_v1()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  delete from public.honor_goals goal
  where goal.user_id = v_user_id;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count > 0 then
    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      description
    ) values (
      v_user_id,
      'honor_goal.cleared',
      'honor_goal',
      v_user_id::text,
      'Meta pessoal de honra removida.'
    );
  end if;
end;
$$;

revoke all on function public.forjados_clear_my_honor_goal_v1()
  from public, anon, authenticated;
grant execute on function public.forjados_clear_my_honor_goal_v1()
  to authenticated;

create or replace function public.forjados_protect_profile_member_since_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_since is distinct from old.member_since
    and (select auth.uid()) is not null
    and not public.is_director_or_admin()
  then
    new.member_since := old.member_since;
  end if;

  return new;
end;
$$;

revoke all on function public.forjados_protect_profile_member_since_v1()
  from public, anon, authenticated;

drop trigger if exists forjados_protect_profile_member_since_v1 on public.profiles;
create trigger forjados_protect_profile_member_since_v1
  before update of member_since on public.profiles
  for each row execute function public.forjados_protect_profile_member_since_v1();

commit;
