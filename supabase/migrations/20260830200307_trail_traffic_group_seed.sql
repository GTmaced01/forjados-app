-- Garante que grupos adicionados ou reativados depois da criacao da edicao
-- tambem recebam um marcador no painel de trafego.

create or replace function private.forjados_seed_trail_traffic_on_group_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_type = 'group' and new.is_active is true then
    perform private.forjados_seed_trail_traffic_v1(new.edition_id);
  end if;
  return new;
end;
$$;

revoke all on function private.forjados_seed_trail_traffic_on_group_v1()
  from public, anon, authenticated;

create trigger trg_seed_trail_traffic_on_group
after insert or update of edition_id, unit_type, is_active
on public.event_service_units
for each row execute function private.forjados_seed_trail_traffic_on_group_v1();
