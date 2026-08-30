-- Garante que trocar o setor principal desmarque automaticamente o anterior.

create or replace function private.forjados_clear_previous_primary_sector_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.event_service_units%rowtype;
begin
  if new.user_id is null or new.is_primary is not true then
    return new;
  end if;

  select * into v_unit
  from public.event_service_units
  where id = new.unit_id;

  if not found or v_unit.unit_type <> 'sector' then
    return new;
  end if;

  update public.event_service_assignments assignment
  set is_primary = false,
      updated_at = now()
  where assignment.edition_id = v_unit.edition_id
    and assignment.user_id = new.user_id
    and assignment.is_primary is true
    and assignment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end;
$$;

revoke all on function private.forjados_clear_previous_primary_sector_v1()
  from public, anon, authenticated;

create trigger trg_clear_event_service_primary_sector
before insert or update on public.event_service_assignments
for each row execute function private.forjados_clear_previous_primary_sector_v1();
