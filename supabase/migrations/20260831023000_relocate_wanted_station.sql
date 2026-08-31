-- O Procurado fica fisicamente entre o Portão Principal e o Contêiner.
update public.trail_map_stations wanted
set x_percent = round(((main_gate.x_percent + container.x_percent) / 2.0)::numeric, 2),
    y_percent = round(((main_gate.y_percent + container.y_percent) / 2.0)::numeric, 2),
    display_order = 165,
    updated_at = now()
from public.trail_map_stations main_gate,
     public.trail_map_stations container
where wanted.edition_id = main_gate.edition_id
  and wanted.edition_id = container.edition_id
  and wanted.station_key = 'wanted'
  and main_gate.station_key = 'main_gate'
  and container.station_key = 'container';

delete from public.trail_map_connections connection
using public.trail_map_stations source,
      public.trail_map_stations target
where connection.from_station_id = source.id
  and connection.to_station_id = target.id
  and (
    source.station_key = 'wanted'
    or target.station_key = 'wanted'
    or (source.station_key = 'main_gate' and target.station_key = 'container')
    or (source.station_key = 'container' and target.station_key = 'main_gate')
  );

insert into public.trail_map_connections (
  edition_id,
  from_station_id,
  to_station_id,
  connection_kind,
  is_bidirectional,
  display_order
)
select
  main_gate.edition_id,
  main_gate.id,
  wanted.id,
  'connector',
  true,
  165
from public.trail_map_stations main_gate
join public.trail_map_stations wanted
  on wanted.edition_id = main_gate.edition_id
 and wanted.station_key = 'wanted'
where main_gate.station_key = 'main_gate'
on conflict (edition_id, from_station_id, to_station_id) do update
set connection_kind = excluded.connection_kind,
    is_bidirectional = excluded.is_bidirectional,
    display_order = excluded.display_order;

insert into public.trail_map_connections (
  edition_id,
  from_station_id,
  to_station_id,
  connection_kind,
  is_bidirectional,
  display_order
)
select
  wanted.edition_id,
  wanted.id,
  container.id,
  'connector',
  true,
  170
from public.trail_map_stations wanted
join public.trail_map_stations container
  on container.edition_id = wanted.edition_id
 and container.station_key = 'container'
where wanted.station_key = 'wanted'
on conflict (edition_id, from_station_id, to_station_id) do update
set connection_kind = excluded.connection_kind,
    is_bidirectional = excluded.is_bidirectional,
    display_order = excluded.display_order;
