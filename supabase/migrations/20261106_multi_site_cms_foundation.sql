-- Reusable multi-website CMS foundation.
-- Safe additive migration: does not drop or alter the existing portfolio_content table,
-- portfolio-media bucket, or existing portfolio RLS policies.
begin;

create extension if not exists pgcrypto;

create table if not exists public.cms_sites (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  primary_domain text,
  status text not null default 'active' check (status in ('active','suspended')),
  is_public boolean not null default true,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cms_site_members (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (site_id, user_id)
);

create table if not exists public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites(id) on delete cascade,
  slug text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  sort_order integer not null default 0,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  unique (id, site_id)
);

create table if not exists public.cms_sections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites(id) on delete cascade,
  page_id uuid not null,
  parent_section_id uuid,
  section_key text not null,
  title text not null,
  section_type text not null default 'content',
  layout_key text not null default 'default',
  field_schema jsonb not null default '{"type":"object","fields":[]}'::jsonb
    check (jsonb_typeof(field_schema) = 'object'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  status text not null default 'published' check (status in ('draft','published','hidden')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, page_id, section_key),
  unique (id, site_id),
  unique (id, page_id, site_id),
  foreign key (page_id, site_id) references public.cms_pages(id, site_id) on delete cascade,
  foreign key (parent_section_id, site_id) references public.cms_sections(id, site_id) on delete cascade
);

create table if not exists public.cms_content (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites(id) on delete cascade,
  page_id uuid not null,
  section_id uuid not null,
  title text not null,
  slug text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (page_id, site_id) references public.cms_pages(id, site_id) on delete cascade,
  foreign key (section_id, page_id, site_id)
    references public.cms_sections(id, page_id, site_id) on delete cascade
);

create index if not exists cms_pages_site_order_idx on public.cms_pages(site_id, sort_order);
create index if not exists cms_sections_page_order_idx on public.cms_sections(site_id, page_id, sort_order);
create index if not exists cms_content_section_status_order_idx
  on public.cms_content(site_id, section_id, status, sort_order);

create table if not exists public.cms_media (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites(id) on delete cascade,
  page_id uuid,
  section_id uuid,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image','video','document','audio')),
  title text not null,
  description text,
  alt_text text,
  mime_type text,
  file_size bigint,
  duration_seconds numeric,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (page_id, site_id) references public.cms_pages(id, site_id) on delete cascade,
  foreign key (section_id, page_id, site_id)
    references public.cms_sections(id, page_id, site_id) on delete cascade
);

create index if not exists cms_media_section_status_order_idx
  on public.cms_media(site_id, section_id, status, sort_order);

create or replace function public.cms_is_site_member(
  p_site_id uuid,
  p_roles text[] default array['owner','admin','editor','viewer']::text[]
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cms_site_members m
    where m.site_id = p_site_id
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
  );
$$;

create or replace function public.cms_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger cms_sites_touch_updated_at before update on public.cms_sites
for each row execute function public.cms_touch_updated_at();

create trigger cms_pages_touch_updated_at before update on public.cms_pages
for each row execute function public.cms_touch_updated_at();

create trigger cms_sections_touch_updated_at before update on public.cms_sections
for each row execute function public.cms_touch_updated_at();

create trigger cms_content_touch_updated_at before update on public.cms_content
for each row execute function public.cms_touch_updated_at();

create trigger cms_media_touch_updated_at before update on public.cms_media
for each row execute function public.cms_touch_updated_at();

alter table public.cms_sites enable row level security;
alter table public.cms_site_members enable row level security;
alter table public.cms_pages enable row level security;
alter table public.cms_sections enable row level security;
alter table public.cms_content enable row level security;
alter table public.cms_media enable row level security;

grant select, insert, update on public.cms_sites to authenticated;
grant select, insert, update, delete on public.cms_site_members to authenticated;
grant select, insert, update, delete on public.cms_pages to authenticated;
grant select, insert, update, delete on public.cms_sections to authenticated;
grant select, insert, update, delete on public.cms_content to authenticated;
grant select, insert, update, delete on public.cms_media to authenticated;
grant select on public.cms_sites, public.cms_pages, public.cms_sections, public.cms_content, public.cms_media to anon;

create policy cms_sites_read_active_or_member on public.cms_sites
for select to anon, authenticated
using ((status = 'active' and is_public = true) or public.cms_is_site_member(id));

create policy cms_sites_update_admin on public.cms_sites
for update to authenticated
using (public.cms_is_site_member(id, array['owner','admin']))
with check (public.cms_is_site_member(id, array['owner','admin']));

create policy cms_members_read_site on public.cms_site_members
for select to authenticated
using (user_id = auth.uid() or public.cms_is_site_member(site_id));

create policy cms_members_manage_admin on public.cms_site_members
for all to authenticated
using (public.cms_is_site_member(site_id, array['owner','admin']))
with check (public.cms_is_site_member(site_id, array['owner','admin']));

create policy cms_pages_read_published_or_member on public.cms_pages
for select to anon, authenticated
using (
  (status = 'published' and exists (
    select 1 from public.cms_sites s where s.id = site_id and s.status = 'active' and s.is_public = true
  )) or public.cms_is_site_member(site_id)
);

create policy cms_pages_manage_editors on public.cms_pages
for all to authenticated
using (public.cms_is_site_member(site_id, array['owner','admin','editor']))
with check (public.cms_is_site_member(site_id, array['owner','admin','editor']));

create policy cms_sections_read_published_or_member on public.cms_sections
for select to anon, authenticated
using (
  (status = 'published' and exists (
    select 1 from public.cms_pages p join public.cms_sites s on s.id = p.site_id
    where p.id = page_id and p.site_id = cms_sections.site_id
      and p.status = 'published' and s.status = 'active' and s.is_public = true
  )) or public.cms_is_site_member(site_id)
);

create policy cms_sections_manage_editors on public.cms_sections
for all to authenticated
using (public.cms_is_site_member(site_id, array['owner','admin','editor']))
with check (public.cms_is_site_member(site_id, array['owner','admin','editor']));

create policy cms_content_read_published_or_member on public.cms_content
for select to anon, authenticated
using (
  (status = 'published' and exists (
    select 1 from public.cms_pages p
    join public.cms_sections s on s.id = section_id and s.site_id = cms_content.site_id
    join public.cms_sites w on w.id = cms_content.site_id
    where p.id = page_id and p.site_id = cms_content.site_id
      and p.status = 'published' and s.status = 'published'
      and w.status = 'active' and w.is_public = true
  )) or public.cms_is_site_member(site_id)
);

create policy cms_content_manage_editors on public.cms_content
for all to authenticated
using (public.cms_is_site_member(site_id, array['owner','admin','editor']))
with check (public.cms_is_site_member(site_id, array['owner','admin','editor']));

create policy cms_media_read_published_or_member on public.cms_media
for select to anon, authenticated
using (
  (status = 'published' and exists (
    select 1 from public.cms_sites s where s.id = site_id and s.status = 'active' and s.is_public = true
  )) or public.cms_is_site_member(site_id)
);

create policy cms_media_manage_editors on public.cms_media
for all to authenticated
using (public.cms_is_site_member(site_id, array['owner','admin','editor']))
with check (public.cms_is_site_member(site_id, array['owner','admin','editor']));

-- The first site is registered without migrating or deleting legacy portfolio data.
insert into public.cms_sites (slug, name, status, is_public)
values ('portfolio', 'Revanth Portfolio', 'active', true)
on conflict (slug) do nothing;

create or replace function public.cms_bootstrap_portfolio_site()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site_id uuid;
begin
  if coalesce(public.is_portfolio_admin(), false) is not true then
    raise exception 'Not authorized to bootstrap the portfolio CMS site';
  end if;

  select id into v_site_id from public.cms_sites where slug = 'portfolio';
  if v_site_id is null then
    raise exception 'Portfolio CMS site is not initialized';
  end if;

  if exists (select 1 from public.cms_site_members where site_id = v_site_id and user_id = auth.uid()) then
    return v_site_id;
  end if;

  if not exists (select 1 from public.cms_site_members where site_id = v_site_id) then
    insert into public.cms_site_members (site_id, user_id, role)
    values (v_site_id, auth.uid(), 'owner')
    on conflict (site_id, user_id) do nothing;
    return v_site_id;
  end if;

  raise exception 'The initial portfolio site owner has already been assigned';
end;
$$;

create or replace function public.cms_create_site(
  p_slug text,
  p_name text,
  p_primary_domain text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_slug !~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$' then
    raise exception 'Site slug must use lowercase letters, numbers, and hyphens';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Site name is required';
  end if;

  insert into public.cms_sites (slug, name, primary_domain, created_by)
  values (p_slug, trim(p_name), nullif(trim(coalesce(p_primary_domain, '')), ''), auth.uid())
  returning id into v_site_id;

  insert into public.cms_site_members (site_id, user_id, role)
  values (v_site_id, auth.uid(), 'owner');

  return v_site_id;
end;
$$;

grant execute on function public.cms_is_site_member(uuid, text[]) to anon, authenticated;
grant execute on function public.cms_bootstrap_portfolio_site() to authenticated;
grant execute on function public.cms_create_site(text, text, text) to authenticated;

-- New bucket is private. Existing portfolio-media bucket and its policies are untouched.
insert into storage.buckets (id, name, public)
values ('cms-media', 'cms-media', false)
on conflict (id) do nothing;

create policy cms_media_objects_read_published on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'cms-media'
  and exists (
    select 1 from public.cms_media m
    where m.storage_path = storage.objects.name
      and m.status = 'published'
  )
);

create policy cms_media_objects_insert_member on storage.objects
for insert to authenticated
with check (
  bucket_id = 'cms-media'
  and exists (
    select 1 from public.cms_site_members m
    where m.site_id::text = split_part(storage.objects.name, '/', 1)
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','editor')
  )
);

create policy cms_media_objects_update_member on storage.objects
for update to authenticated
using (
  bucket_id = 'cms-media'
  and exists (
    select 1 from public.cms_site_members m
    where m.site_id::text = split_part(storage.objects.name, '/', 1)
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','editor')
  )
)
with check (
  bucket_id = 'cms-media'
  and exists (
    select 1 from public.cms_site_members m
    where m.site_id::text = split_part(storage.objects.name, '/', 1)
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','editor')
  )
);

create policy cms_media_objects_delete_member on storage.objects
for delete to authenticated
using (
  bucket_id = 'cms-media'
  and exists (
    select 1 from public.cms_site_members m
    where m.site_id::text = split_part(storage.objects.name, '/', 1)
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','editor')
  )
);

commit;
