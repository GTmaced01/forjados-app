-- Permite preparar uma nova execução sem alterar o planejamento ideal do grupo.
create or replace function public.forjados_reset_trail_routes_v1(
  p_group_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_target_count integer;
begin
  select count(*) into v_target_count
  from public.trail_route_plans plan
  where p_group_id is null or plan.group_id = p_group_id;

  if v_target_count = 0 then
    raise exception 'Nenhuma rota autorizada foi encontrada para reiniciar.' using errcode = '22023';
  end if;

  -- Serializa reset/início por grupo para impedir duas operações simultâneas.
  for v_group_id in
    select plan.group_id
    from public.trail_route_plans plan
    where p_group_id is null or plan.group_id = p_group_id
    order by plan.group_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_group_id::text, 0));
  end loop;

  delete from public.trail_route_executions execution
  using public.trail_route_plans plan
  where execution.edition_id = plan.edition_id
    and execution.group_id = plan.group_id
    and (p_group_id is null or plan.group_id = p_group_id);

  insert into public.trail_group_traffic (
    edition_id,
    group_id,
    station_id,
    origin_station_id,
    destination_station_id,
    marker_x,
    marker_y,
    movement_status,
    traffic_signal,
    delay_minutes,
    notes
  )
  select
    target.edition_id,
    target.group_id,
    field.id,
    null,
    null,
    least(96, field.x_percent + ((target.marker_order - 1) * 2.2)),
    least(96, field.y_percent + ((target.marker_order - 1) * 1.4)),
    'not_started',
    'clear',
    0,
    'Operação reiniciada. Grupo aguardando no Campo.'
  from (
    select ranked.edition_id, ranked.group_id, ranked.marker_order
    from (
      select
        plan.edition_id,
        plan.group_id,
        row_number() over (
          partition by plan.edition_id
          order by unit.display_order, unit.name, unit.id
        ) as marker_order
      from public.trail_route_plans plan
      join public.event_service_units unit on unit.id = plan.group_id
    ) ranked
    where p_group_id is null or ranked.group_id = p_group_id
  ) target
  join public.trail_map_stations field
    on field.edition_id = target.edition_id
   and field.station_key = 'field'
   and field.is_active is true
  on conflict (edition_id, group_id) do update
  set station_id = excluded.station_id,
      origin_station_id = null,
      destination_station_id = null,
      marker_x = excluded.marker_x,
      marker_y = excluded.marker_y,
      movement_status = excluded.movement_status,
      traffic_signal = excluded.traffic_signal,
      delay_minutes = excluded.delay_minutes,
      notes = excluded.notes;

  return v_target_count;
end;
$$;

revoke all on function public.forjados_reset_trail_routes_v1(uuid)
  from public, anon;
grant execute on function public.forjados_reset_trail_routes_v1(uuid)
  to authenticated;

comment on function public.forjados_reset_trail_routes_v1(uuid) is
  'Remove a execução atual de um ou todos os grupos e os devolve ao Campo, preservando as rotas ideais.';
