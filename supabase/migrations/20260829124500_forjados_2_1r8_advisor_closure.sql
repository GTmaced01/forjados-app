-- Complemento idempotente para instalações que receberam o R8 antes da revisão dos advisors.
revoke all on function public.forjados_prepare_ride_points_v1() from public, anon, authenticated;

create index if not exists retreat_participations_attendance_updated_by_idx
  on public.retreat_participations (attendance_updated_by)
  where attendance_updated_by is not null;
