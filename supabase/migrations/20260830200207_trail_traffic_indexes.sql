-- Indices de cobertura para as chaves estrangeiras do painel de trafego.

create index trail_map_connections_to_station_idx
  on public.trail_map_connections (edition_id, to_station_id);

create index trail_group_traffic_group_idx
  on public.trail_group_traffic (group_id);

create index trail_group_traffic_origin_idx
  on public.trail_group_traffic (origin_station_id)
  where origin_station_id is not null;

create index trail_group_traffic_history_traffic_idx
  on public.trail_group_traffic_history (traffic_id);

create index trail_group_traffic_history_station_idx
  on public.trail_group_traffic_history (station_id)
  where station_id is not null;

create index trail_group_traffic_history_origin_idx
  on public.trail_group_traffic_history (origin_station_id)
  where origin_station_id is not null;

create index trail_group_traffic_history_destination_idx
  on public.trail_group_traffic_history (destination_station_id)
  where destination_station_id is not null;
