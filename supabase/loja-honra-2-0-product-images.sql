-- FORJADOS ADMIN 2.0
-- Loja de Honra 2.0: múltiplas fotos por produto, enquadramento por imagem e visualização ampliada.
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

-- Tabela de galeria dos produtos da Loja de Honra.
-- A coluna legada points_store_products.image_url continua existindo para compatibilidade,
-- mas o front-end 2.0 passa a usar esta tabela para múltiplas fotos.
create table if not exists public.points_store_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.points_store_products(id) on delete cascade,
  image_url text not null,
  position_x integer not null default 50 check (position_x between 0 and 100),
  position_y integer not null default 50 check (position_y between 0 and 100),
  display_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_points_store_product_images_product_id
  on public.points_store_product_images(product_id);

create index if not exists idx_points_store_product_images_order
  on public.points_store_product_images(product_id, display_order, created_at);

-- Garante somente uma foto principal por produto sem impedir produtos sem foto.
create unique index if not exists uq_points_store_product_images_primary
  on public.points_store_product_images(product_id)
  where is_primary = true;

-- Trigger de updated_at.
drop trigger if exists trg_points_store_product_images_updated_at on public.points_store_product_images;
create trigger trg_points_store_product_images_updated_at
before update on public.points_store_product_images
for each row execute function public.set_updated_at();

-- Backfill: produtos antigos com image_url ganham uma foto na galeria.
insert into public.points_store_product_images (
  product_id,
  image_url,
  position_x,
  position_y,
  display_order,
  is_primary
)
select
  p.id,
  p.image_url,
  50,
  50,
  0,
  true
from public.points_store_products p
where p.image_url is not null
  and btrim(p.image_url) <> ''
  and not exists (
    select 1
    from public.points_store_product_images i
    where i.product_id = p.id
  );

alter table public.points_store_product_images enable row level security;

-- Recria políticas de forma idempotente.
drop policy if exists "Loja 2.0 - ver fotos de produtos ativos" on public.points_store_product_images;
drop policy if exists "Loja 2.0 - admins gerenciam fotos" on public.points_store_product_images;

create policy "Loja 2.0 - ver fotos de produtos ativos"
on public.points_store_product_images
for select
to authenticated
using (
  public.forjados_is_admin_or_director()
  or exists (
    select 1
    from public.points_store_products p
    where p.id = points_store_product_images.product_id
      and p.is_active = true
  )
);

create policy "Loja 2.0 - admins gerenciam fotos"
on public.points_store_product_images
for all
to authenticated
using (public.forjados_is_admin_or_director())
with check (public.forjados_is_admin_or_director());

-- Bucket público usado pelo app para fotos da loja.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'points-store-products',
  'points-store-products',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Políticas do Storage para o bucket da loja.
drop policy if exists "Loja de Honra - fotos publicas" on storage.objects;
drop policy if exists "Loja de Honra - admins enviam fotos" on storage.objects;
drop policy if exists "Loja de Honra - admins atualizam fotos" on storage.objects;
drop policy if exists "Loja de Honra - admins removem fotos" on storage.objects;

create policy "Loja de Honra - fotos publicas"
on storage.objects
for select
to public
using (bucket_id = 'points-store-products');

create policy "Loja de Honra - admins enviam fotos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'points-store-products'
  and public.forjados_is_admin_or_director()
);

create policy "Loja de Honra - admins atualizam fotos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'points-store-products'
  and public.forjados_is_admin_or_director()
)
with check (
  bucket_id = 'points-store-products'
  and public.forjados_is_admin_or_director()
);

create policy "Loja de Honra - admins removem fotos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'points-store-products'
  and public.forjados_is_admin_or_director()
);

commit;
