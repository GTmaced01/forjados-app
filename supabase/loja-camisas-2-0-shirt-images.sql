-- FORJADOS ADMIN 2.0
-- Loja de Camisas 2.0: múltiplas fotos por camisa, enquadramento por imagem e visualização ampliada.
-- Rode este arquivo no SQL Editor do Supabase antes de publicar o novo front-end.

begin;

-- Helper central para permissões administrativas.
-- Mantém a regra alinhada com o app: admin total e diretor com gestão da loja.
create or replace function public.forjados_is_admin_or_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        coalesce(p.is_admin, false) = true
        or p.role in ('admin', 'director')
      )
  );
$$;

-- Atualizador padrão de updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tabela de galeria das camisas.
-- A coluna legada shirts.image_url continua existindo para compatibilidade,
-- mas o front-end 2.0 passa a usar esta tabela para múltiplas fotos.
create table if not exists public.shirt_images (
  id uuid primary key default gen_random_uuid(),
  shirt_id uuid not null references public.shirts(id) on delete cascade,
  image_url text not null,
  position_x integer not null default 50 check (position_x between 0 and 100),
  position_y integer not null default 50 check (position_y between 0 and 100),
  display_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shirt_images_shirt_id
  on public.shirt_images(shirt_id);

create index if not exists idx_shirt_images_order
  on public.shirt_images(shirt_id, display_order, created_at);

-- Garante somente uma foto principal por camisa sem impedir camisas sem foto.
create unique index if not exists uq_shirt_images_primary
  on public.shirt_images(shirt_id)
  where is_primary = true;

-- Trigger de updated_at.
drop trigger if exists trg_shirt_images_updated_at on public.shirt_images;
create trigger trg_shirt_images_updated_at
before update on public.shirt_images
for each row execute function public.set_updated_at();

-- Backfill: camisas antigas com image_url ganham uma foto na galeria.
insert into public.shirt_images (
  shirt_id,
  image_url,
  position_x,
  position_y,
  display_order,
  is_primary
)
select
  s.id,
  s.image_url,
  50,
  50,
  0,
  true
from public.shirts s
where s.image_url is not null
  and btrim(s.image_url) <> ''
  and not exists (
    select 1
    from public.shirt_images i
    where i.shirt_id = s.id
  );

alter table public.shirt_images enable row level security;

-- Recria políticas de forma idempotente.
drop policy if exists "Loja de Camisas 2.0 - ver fotos de camisas ativas" on public.shirt_images;
drop policy if exists "Loja de Camisas 2.0 - admins gerenciam fotos" on public.shirt_images;

create policy "Loja de Camisas 2.0 - ver fotos de camisas ativas"
on public.shirt_images
for select
to authenticated
using (
  public.forjados_is_admin_or_director()
  or exists (
    select 1
    from public.shirts s
    where s.id = shirt_images.shirt_id
      and s.is_active = true
  )
);

create policy "Loja de Camisas 2.0 - admins gerenciam fotos"
on public.shirt_images
for all
to authenticated
using (public.forjados_is_admin_or_director())
with check (public.forjados_is_admin_or_director());

-- Bucket público usado pelo app para fotos das camisas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shirts',
  'shirts',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Políticas do Storage para o bucket das camisas.
drop policy if exists "Loja de Camisas - fotos publicas" on storage.objects;
drop policy if exists "Loja de Camisas - admins enviam fotos" on storage.objects;
drop policy if exists "Loja de Camisas - admins atualizam fotos" on storage.objects;
drop policy if exists "Loja de Camisas - admins removem fotos" on storage.objects;

create policy "Loja de Camisas - fotos publicas"
on storage.objects
for select
to public
using (bucket_id = 'shirts');

create policy "Loja de Camisas - admins enviam fotos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'shirts'
  and public.forjados_is_admin_or_director()
);

create policy "Loja de Camisas - admins atualizam fotos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'shirts'
  and public.forjados_is_admin_or_director()
)
with check (
  bucket_id = 'shirts'
  and public.forjados_is_admin_or_director()
);

create policy "Loja de Camisas - admins removem fotos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'shirts'
  and public.forjados_is_admin_or_director()
);

commit;
