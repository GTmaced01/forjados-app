-- Índices de cobertura para as chaves estrangeiras de grupo usadas pela timeline.
create index if not exists trail_route_plan_steps_group_idx
  on public.trail_route_plan_steps (group_id);

create index if not exists trail_route_execution_steps_group_idx
  on public.trail_route_execution_steps (group_id);
