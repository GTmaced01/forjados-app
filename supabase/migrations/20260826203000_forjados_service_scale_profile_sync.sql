-- FORJADOS — vincula usuários aprovados à escala para permitir notificações.

begin;

create or replace function public.forjados_sync_service_scale_profiles_v1()
returns table(inserted_count integer, updated_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  if v_actor_id is null or not (select public.can_manage_service_scale()) then
    raise exception 'Acesso negado para sincronizar a escala.' using errcode = '42501';
  end if;

  with approved_profiles as (
    select
      profile.id,
      coalesce(nullif(trim(profile.full_name), ''), nullif(trim(profile.display_name), ''), 'Membro') as person_name,
      nullif(trim(profile.phone), '') as phone,
      coalesce(profile.email, '') as email,
      profile.role::text as role,
      coalesce(profile.sectors, '{}'::text[]) as sectors,
      nullif(trim(profile.primary_team), '') as primary_team
    from public.profiles profile
    where profile.inscription_status::text = 'approved'
      and coalesce(profile.is_deleted, false) = false
  ), updated as (
    update public.service_scale_people person
    set name = approved.person_name,
        display_name = approved.person_name,
        phone = coalesce(approved.phone, person.phone),
        email = approved.email,
        role = approved.role,
        sectors = approved.sectors,
        sector = coalesce(nullif(person.sector, ''), approved.primary_team, approved.sectors[1]),
        updated_at = now()
    from approved_profiles approved
    where person.user_id = approved.id
      and (
        person.name is distinct from approved.person_name
        or person.display_name is distinct from approved.person_name
        or person.phone is distinct from coalesce(approved.phone, person.phone)
        or person.email is distinct from approved.email
        or person.role is distinct from approved.role
        or person.sectors is distinct from approved.sectors
        or person.sector is distinct from coalesce(nullif(person.sector, ''), approved.primary_team, approved.sectors[1])
      )
    returning person.id
  )
  select count(*)::integer into v_updated from updated;

  with approved_profiles as (
    select
      profile.id,
      coalesce(nullif(trim(profile.full_name), ''), nullif(trim(profile.display_name), ''), 'Membro') as person_name,
      nullif(trim(profile.phone), '') as phone,
      coalesce(profile.email, '') as email,
      profile.role::text as role,
      coalesce(profile.sectors, '{}'::text[]) as sectors,
      nullif(trim(profile.primary_team), '') as primary_team
    from public.profiles profile
    where profile.inscription_status::text = 'approved'
      and coalesce(profile.is_deleted, false) = false
  ), inserted as (
    insert into public.service_scale_people (
      user_id, name, display_name, gender, phone, sector,
      is_active, does_trail, notes, email, role, sectors
    )
    select
      approved.id, approved.person_name, approved.person_name, null,
      approved.phone, coalesce(approved.primary_team, approved.sectors[1]),
      true, false,
      'Sincronizado automaticamente do perfil aprovado. Defina o alojamento antes de gerar a escala.',
      approved.email, approved.role, approved.sectors
    from approved_profiles approved
    where not exists (
      select 1 from public.service_scale_people person where person.user_id = approved.id
    )
    on conflict (user_id) do nothing
    returning id
  )
  select count(*)::integer into v_inserted from inserted;

  if v_inserted > 0 then
    insert into public.audit_logs (
      actor_id, action, entity_type, description, metadata
    ) values (
      v_actor_id,
      'service_scale_profiles_synced',
      'service_scale_people',
      'Usuários aprovados foram vinculados ao módulo de escala.',
      jsonb_build_object('inserted_count', v_inserted, 'updated_count', v_updated)
    );
  end if;

  return query select v_inserted, v_updated;
end;
$$;

revoke all on function public.forjados_sync_service_scale_profiles_v1()
  from public, anon, authenticated;
grant execute on function public.forjados_sync_service_scale_profiles_v1()
  to authenticated;

notify pgrst, 'reload schema';

commit;
